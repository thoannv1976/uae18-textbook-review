import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  getTextbook,
  listChunks,
  saveEvaluation,
} from '@/lib/repo';
import { aggregateEvaluation, chunkToResult } from '@/lib/evaluator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Build a textbook-level Evaluation document from whatever chunk-level evals
 * are already persisted. Doesn't call Claude, so it's free + instant. Useful
 * after the user has filled in chapter scores via the per-chunk button and
 * just wants the overall score updated.
 */
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

  const textbook = await getTextbook(id, user.uid);
  if (!textbook) {
    return NextResponse.json(
      { error: 'Không tìm thấy giáo trình.' },
      { status: 404 },
    );
  }

  const chunks = await listChunks(id);
  const results = chunks
    .map((c) => chunkToResult(c))
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (results.length === 0) {
    return NextResponse.json(
      {
        error:
          'Chưa có chương nào được đánh giá. Hãy bấm "Đánh giá AI" hoặc "Đánh giá" ở từng chương trước.',
      },
      { status: 400 },
    );
  }

  const evaluation = aggregateEvaluation(id, user.uid, results);
  const evalId = await saveEvaluation(id, user.uid, evaluation);

  return NextResponse.json({
    ok: true,
    evaluationId: evalId,
    overallScore: evaluation.overallScore,
    chaptersIncluded: results.length,
    chaptersSkipped: chunks.length - results.length,
  });
}
