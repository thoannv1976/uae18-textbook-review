import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  getChunk,
  getTextbook,
  logUsage,
  updateChunk,
} from '@/lib/repo';
import { evaluateSingleChunk } from '@/lib/evaluator';
import { CLAUDE_MODEL, describeClaudeError } from '@/lib/claude';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ROUTE_NAME = 'evaluate-chunk';

/**
 * Evaluate exactly one chunk. Used by the per-chapter UI button so the user
 * can target the specific chapter that failed during a bulk run (e.g. an
 * Anthropic 429) without re-doing the chapters that already succeeded.
 *
 * Saves results to the chunk doc (partialEval, summary, evidence, suggestions)
 * but does NOT touch the textbook-level Evaluation aggregate — call
 * /aggregate when the user is ready to refresh the overall score.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: { id: string; chunkId: string } },
) {
  const { id, chunkId } = ctx.params;

  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Bạn cần đăng nhập.' }, { status: 401 });
  }

  const textbook = await getTextbook(id, user.uid);
  if (!textbook) {
    return NextResponse.json(
      { error: 'Không tìm thấy giáo trình.' },
      { status: 404 },
    );
  }

  const chunk = await getChunk(chunkId, id, user.uid);
  if (!chunk) {
    return NextResponse.json(
      { error: 'Không tìm thấy chương.' },
      { status: 404 },
    );
  }

  const startedAt = Date.now();
  try {
    const result = await evaluateSingleChunk(textbook, chunk);
    await updateChunk(chunkId, {
      summary: result.eval.summary,
      partialEval: { scores: result.eval.scores },
      evidence: result.eval.evidence,
      suggestions: result.eval.suggestions,
      tokensIn:
        result.usage.inputTokens +
        result.usage.cacheReadTokens +
        result.usage.cacheCreationTokens,
      tokensOut: result.usage.outputTokens,
      model: CLAUDE_MODEL,
      evaluatedAt: new Date().toISOString(),
    });

    await logUsage({
      ownerId: user.uid,
      route: ROUTE_NAME,
      textbookId: id,
      tokensIn:
        result.usage.inputTokens +
        result.usage.cacheReadTokens +
        result.usage.cacheCreationTokens,
      tokensOut: result.usage.outputTokens,
      latencyMs: Date.now() - startedAt,
      status: 'ok',
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      chunkId,
      summary: result.eval.summary,
      scores: result.eval.scores,
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      latencyMs: Date.now() - startedAt,
    });
  } catch (e) {
    const msg = describeClaudeError(e);
    await logUsage({
      ownerId: user.uid,
      route: ROUTE_NAME,
      textbookId: id,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorCode: msg.slice(0, 200),
    }).catch(() => {});
    console.error('per-chunk evaluate failed', chunkId, e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
