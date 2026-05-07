import 'server-only';
import pLimit from 'p-limit';
import { z } from 'zod';
import { CHUNK_CONCURRENCY } from './constants';
import { CLAUDE_MODEL, claude, describeClaudeError, extractJson } from './claude';
import { buildChunkUserPrompt, buildSystemPrompt } from './eval-prompts';
import {
  CRITERION_IDS,
  TEXTBOOK_CRITERIA,
  type CriterionId,
  getCriterion,
} from './rubrics/textbook';
import type {
  ChapterEvaluation,
  ChunkDoc,
  CriterionEvaluation,
  Evaluation,
  TextbookDoc,
} from './types';

// Per-chunk Claude response. We validate the shape with zod so a malformed
// reply throws something the route can convert to a clear 422 instead of
// trickling NaN scores into Firestore.
const ChunkEvalSchema = z.object({
  summary: z.string().min(1).max(2000),
  scores: z
    .array(
      z.object({
        criterionId: z.string(),
        score: z.number(),
        note: z.string().max(2000).default(''),
      }),
    )
    .min(1),
  evidence: z.array(z.string().max(500)).max(10).default([]),
  suggestions: z.array(z.string().max(500)).max(10).default([]),
});

export interface ChunkEvalRaw {
  summary: string;
  scores: { criterionId: CriterionId; score: number; note: string }[];
  evidence: string[];
  suggestions: string[];
}

export interface ChunkEvalUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface ChunkEvalResult {
  chunk: ChunkDoc;
  eval: ChunkEvalRaw;
  usage: ChunkEvalUsage;
}

/**
 * Evaluate a single chunk via Claude. The system prompt is large and identical
 * across chunks; once we upgrade the SDK to a version that types
 * `cache_control` we can mark it ephemeral and amortise the input cost.
 */
async function callClaudeForChunk(
  textbook: TextbookDoc,
  chunk: ChunkDoc,
  systemPrompt: string,
): Promise<ChunkEvalResult> {
  const userPrompt = buildChunkUserPrompt(textbook, chunk);

  const resp = await claude().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlocks = resp.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text);
  const raw = textBlocks.join('\n').trim();

  let parsed: ChunkEvalRaw;
  try {
    const json = extractJson<unknown>(raw);
    const validated = ChunkEvalSchema.parse(json);
    parsed = {
      summary: validated.summary,
      scores: validated.scores
        .filter((s): s is typeof s & { criterionId: CriterionId } =>
          (CRITERION_IDS as string[]).includes(s.criterionId),
        )
        .map((s) => ({
          criterionId: s.criterionId,
          score: clamp(s.score, 0, 10),
          note: s.note,
        })),
      evidence: validated.evidence,
      suggestions: validated.suggestions,
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Claude trả về JSON không hợp lệ cho chương "${chunk.chapterTitle}": ${detail}`,
    );
  }

  // Some criteria might be missing from Claude's output (it shouldn't, but the
  // prompt is permissive). Backfill any missing criterion with score 5/10 +
  // an explicit note so aggregation doesn't silently drop weight.
  const seen = new Set(parsed.scores.map((s) => s.criterionId));
  for (const id of CRITERION_IDS) {
    if (!seen.has(id)) {
      parsed.scores.push({
        criterionId: id,
        score: 5,
        note: 'Không nhận được điểm cho tiêu chí này từ Claude — đã đặt điểm trung bình.',
      });
    }
  }

  // SDK 0.32 doesn't type cache_*_input_tokens; older field names still come
  // through on the wire so we pull them off as untyped extras.
  const u = resp.usage as unknown as {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  return {
    chunk,
    eval: parsed,
    usage: {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    },
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // Exponential backoff: 2s, 4s, 8s. The SDK already retries with its own
      // backoff (MAX_RETRIES=4) per call, so this outer loop only fires when
      // every SDK retry was exhausted (typically a sustained 429).
      await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

export interface ChunkEvalFailure {
  chunk: ChunkDoc;
  message: string;
}

export interface BulkEvalOutcome {
  results: ChunkEvalResult[];
  failures: ChunkEvalFailure[];
}

/**
 * Evaluate every chunk in parallel (capped at CHUNK_CONCURRENCY). One failed
 * chunk no longer poisons the rest — successes are still returned and the
 * caller can persist them, then retry only the failed ones via the per-chunk
 * endpoint.
 */
export async function evaluateAllChunks(
  textbook: TextbookDoc,
  chunks: ChunkDoc[],
): Promise<BulkEvalOutcome> {
  if (chunks.length === 0) return { results: [], failures: [] };
  const systemPrompt = buildSystemPrompt();
  const limit = pLimit(CHUNK_CONCURRENCY);

  const settled = await Promise.allSettled(
    chunks.map((c) =>
      limit(() => withRetry(() => callClaudeForChunk(textbook, c, systemPrompt))),
    ),
  );

  const results: ChunkEvalResult[] = [];
  const failures: ChunkEvalFailure[] = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === 'fulfilled') {
      results.push(s.value);
    } else {
      failures.push({
        chunk: chunks[i],
        message: describeClaudeError(s.reason),
      });
    }
  }
  return { results, failures };
}

/**
 * Evaluate exactly one chunk. Used by the per-chapter "Đánh giá lại" button so
 * a user who hits a transient 429 can retry just the failed chapter.
 */
export async function evaluateSingleChunk(
  textbook: TextbookDoc,
  chunk: ChunkDoc,
): Promise<ChunkEvalResult> {
  const systemPrompt = buildSystemPrompt();
  return withRetry(() => callClaudeForChunk(textbook, chunk, systemPrompt));
}

/**
 * Reconstruct a ChunkEvalResult from a chunk that already has partialEval
 * persisted (per-chapter button + reload, or post-aggregate refresh). Returns
 * null when the chunk hasn't been evaluated yet so the caller can decide
 * whether to skip it or re-eval.
 */
export function chunkToResult(chunk: ChunkDoc): ChunkEvalResult | null {
  if (!chunk.partialEval || !chunk.summary) return null;
  return {
    chunk,
    eval: {
      summary: chunk.summary,
      scores: chunk.partialEval.scores,
      evidence: chunk.evidence ?? [],
      suggestions: chunk.suggestions ?? [],
    },
    usage: {
      inputTokens: chunk.tokensIn ?? 0,
      outputTokens: chunk.tokensOut ?? 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
  };
}

export function aggregateEvaluation(
  textbookId: string,
  ownerId: string,
  results: ChunkEvalResult[],
): Omit<Evaluation, 'id' | 'createdAt' | 'updatedAt'> {
  // Collect scores per criterion (across all chunks).
  const perCriterion = new Map<CriterionId, { scores: number[]; notes: string[] }>();
  for (const id of CRITERION_IDS) {
    perCriterion.set(id, { scores: [], notes: [] });
  }
  for (const r of results) {
    for (const s of r.eval.scores) {
      const bucket = perCriterion.get(s.criterionId);
      if (!bucket) continue;
      bucket.scores.push(s.score);
      if (s.note) bucket.notes.push(s.note);
    }
  }

  const criteria: CriterionEvaluation[] = TEXTBOOK_CRITERIA.map((c) => {
    const bucket = perCriterion.get(c.id);
    const arr = bucket?.scores ?? [];
    const avg = arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
    return {
      criterionId: c.id,
      criterionText: c.name,
      weight: c.weight,
      score: Math.round(avg * 10) / 10,
      comment: (bucket?.notes ?? []).slice(0, 5).join(' '),
      // Trim to a manageable size — UI shows ≤5 each.
      evidence: results.flatMap((r) => r.eval.evidence).slice(0, 5),
      suggestions: results
        .flatMap((r) => r.eval.suggestions)
        .filter((s) => s.trim().length > 0)
        .slice(0, 5),
    };
  });

  const overallScore =
    Math.round(
      criteria.reduce((sum, c) => sum + c.score * c.weight, 0) * 10,
    ) / 10;

  const chapterScores: ChapterEvaluation[] = results.map((r) => {
    const weighted = r.eval.scores.reduce((acc, s) => {
      const w = getCriterion(s.criterionId).weight;
      return acc + s.score * w;
    }, 0);
    return {
      chapterIndex: r.chunk.chapterIndex,
      chapterTitle: r.chunk.chapterTitle,
      score: Math.round(weighted * 10) / 10,
      comment: r.eval.summary,
    };
  });

  // Top suggestions: dedupe by lowercased text, keep first 8.
  const seen = new Set<string>();
  const topSuggestions: string[] = [];
  for (const r of results) {
    for (const s of r.eval.suggestions) {
      const key = s.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        topSuggestions.push(s.trim());
        if (topSuggestions.length >= 8) break;
      }
    }
    if (topSuggestions.length >= 8) break;
  }

  const totalTokensIn = results.reduce(
    (s, r) => s + r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheCreationTokens,
    0,
  );
  const totalTokensOut = results.reduce((s, r) => s + r.usage.outputTokens, 0);

  return {
    textbookId,
    ownerId,
    overallScore,
    criteria,
    chapterScores,
    topSuggestions,
    model: CLAUDE_MODEL,
    totalTokensIn,
    totalTokensOut,
  };
}
