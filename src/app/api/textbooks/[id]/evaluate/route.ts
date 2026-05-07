import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  enforceRateLimit,
  getTextbook,
  listChunks,
  logUsage,
  saveEvaluation,
  updateChunk,
  updateTextbook,
} from '@/lib/repo';
import {
  aggregateEvaluation,
  chunkToResult,
  evaluateAllChunks,
} from '@/lib/evaluator';
import { CLAUDE_MODEL } from '@/lib/claude';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 540;

const ROUTE_NAME = 'evaluate';

export async function POST(
  _req: NextRequest,
  ctx: { params: { id: string } },
) {
  const id = ctx.params.id;

  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Bạn cần đăng nhập.' }, { status: 401 });
  }

  try {
    await enforceRateLimit(user.uid, ROUTE_NAME);
  } catch (e) {
    if (e instanceof Error && (e as Error & { code?: string }).code === 'RATE_LIMITED') {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    throw e;
  }

  const textbook = await getTextbook(id, user.uid);
  if (!textbook) {
    return NextResponse.json(
      { error: 'Không tìm thấy giáo trình.' },
      { status: 404 },
    );
  }
  if (textbook.status === 'uploaded') {
    return NextResponse.json(
      { error: 'Vui lòng tách chương trước khi đánh giá.' },
      { status: 400 },
    );
  }

  const chunks = await listChunks(id);
  if (chunks.length === 0) {
    return NextResponse.json(
      { error: 'Giáo trình chưa có chương nào để đánh giá.' },
      { status: 400 },
    );
  }

  await updateTextbook(id, user.uid, { status: 'evaluating' });

  const startedAt = Date.now();
  // Promise.allSettled inside evaluateAllChunks means we keep partial successes
  // even if some chunks 429'd. We persist what we got, then aggregate.
  const { results, failures } = await evaluateAllChunks(textbook, chunks);

  // Save freshly-evaluated chunks.
  await Promise.all(
    results.map((r) =>
      r.chunk.id
        ? updateChunk(r.chunk.id, {
            summary: r.eval.summary,
            partialEval: { scores: r.eval.scores },
            evidence: r.eval.evidence,
            suggestions: r.eval.suggestions,
            tokensIn:
              r.usage.inputTokens +
              r.usage.cacheReadTokens +
              r.usage.cacheCreationTokens,
            tokensOut: r.usage.outputTokens,
            model: CLAUDE_MODEL,
            evaluatedAt: new Date().toISOString(),
          })
        : Promise.resolve(),
    ),
  );

  // Compose aggregate input: prefer freshly-evaluated chunks, fall back to
  // any prior partialEval persisted on the chunks we couldn't re-eval (e.g.
  // a chunk that 429'd this run but had a successful eval last time).
  const freshIds = new Set(results.map((r) => r.chunk.id));
  const reused = chunks
    .filter((c) => c.id && !freshIds.has(c.id))
    .map((c) => chunkToResult(c))
    .filter((r): r is NonNullable<typeof r> => r != null);
  const allResults = [...results, ...reused];

  if (allResults.length === 0) {
    // Total failure — no chunk has a usable eval. Surface the first error.
    await updateTextbook(id, user.uid, { status: 'failed' }).catch(() => {});
    const msg = failures[0]?.message ?? 'Đánh giá thất bại.';
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
    return NextResponse.json(
      {
        error: msg,
        failures: failures.map((f) => ({
          chunkId: f.chunk.id,
          chapterTitle: f.chunk.chapterTitle,
          message: f.message,
        })),
      },
      { status: 502 },
    );
  }

  const evaluation = aggregateEvaluation(id, user.uid, allResults);
  const evalId = await saveEvaluation(id, user.uid, evaluation);

  await logUsage({
    ownerId: user.uid,
    route: ROUTE_NAME,
    textbookId: id,
    tokensIn: evaluation.totalTokensIn ?? 0,
    tokensOut: evaluation.totalTokensOut ?? 0,
    latencyMs: Date.now() - startedAt,
    status: failures.length > 0 ? 'error' : 'ok',
    errorCode: failures.length > 0 ? `partial: ${failures.length} chương fail` : undefined,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    evaluationId: evalId,
    overallScore: evaluation.overallScore,
    chaptersEvaluated: results.length,
    chaptersReused: reused.length,
    chaptersFailed: failures.length,
    failures: failures.map((f) => ({
      chunkId: f.chunk.id,
      chapterTitle: f.chunk.chapterTitle,
      message: f.message,
    })),
    tokensIn: evaluation.totalTokensIn,
    tokensOut: evaluation.totalTokensOut,
    latencyMs: Date.now() - startedAt,
  });
}
