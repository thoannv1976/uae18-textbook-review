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
import { aggregateEvaluation, evaluateAllChunks } from '@/lib/evaluator';
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

  // Quota check happens BEFORE we touch Claude so a rate-limited user sees a
  // clean 429 instead of being charged for partial work.
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
  let results;
  try {
    results = await evaluateAllChunks(textbook, chunks);
  } catch (e) {
    await updateTextbook(id, user.uid, { status: 'failed' }).catch(() => {});
    const msg = e instanceof Error ? e.message : 'Đánh giá thất bại.';
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
    console.error('evaluate failed', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Persist per-chunk eval to the chunks themselves so feature (e) can show
  // chapter-level breakdowns later without re-running Claude.
  await Promise.all(
    results.map((r) =>
      r.chunk.id
        ? updateChunk(r.chunk.id, {
            summary: r.eval.summary,
            partialEval: { scores: r.eval.scores },
            evidence: r.eval.evidence,
            tokensIn: r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheCreationTokens,
            tokensOut: r.usage.outputTokens,
            model: CLAUDE_MODEL,
          })
        : Promise.resolve(),
    ),
  );

  const evaluation = aggregateEvaluation(id, user.uid, results);
  const evalId = await saveEvaluation(id, user.uid, evaluation);

  await logUsage({
    ownerId: user.uid,
    route: ROUTE_NAME,
    textbookId: id,
    tokensIn: evaluation.totalTokensIn ?? 0,
    tokensOut: evaluation.totalTokensOut ?? 0,
    latencyMs: Date.now() - startedAt,
    status: 'ok',
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    evaluationId: evalId,
    overallScore: evaluation.overallScore,
    chapterCount: results.length,
    tokensIn: evaluation.totalTokensIn,
    tokensOut: evaluation.totalTokensOut,
    latencyMs: Date.now() - startedAt,
  });
}
