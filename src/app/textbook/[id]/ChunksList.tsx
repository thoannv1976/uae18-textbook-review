'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ChunkDoc } from '@/lib/types';
import { TEXTBOOK_CRITERIA } from '@/lib/rubrics/textbook';

function chunkScore(chunk: ChunkDoc): number | null {
  const scores = chunk.partialEval?.scores;
  if (!scores || scores.length === 0) return null;
  let total = 0;
  for (const s of scores) {
    const c = TEXTBOOK_CRITERIA.find((c) => c.id === s.criterionId);
    if (c) total += s.score * c.weight;
  }
  return Math.round(total * 10) / 10;
}

function scoreColor(score: number): string {
  if (score >= 8) return 'bg-emerald-100 text-emerald-700';
  if (score >= 6.5) return 'bg-blue-100 text-blue-700';
  if (score >= 5) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

export default function ChunksList({
  textbookId,
  chunks,
}: {
  textbookId: string;
  chunks: ChunkDoc[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function evalChunk(chunkId: string) {
    if (busyId) return;
    setBusyId(chunkId);
    setErrors((e) => ({ ...e, [chunkId]: '' }));
    try {
      const r = await fetch(
        `/api/textbooks/${textbookId}/chunks/${chunkId}/evaluate`,
        { method: 'POST' },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Đánh giá thất bại.');
      router.refresh();
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [chunkId]: e instanceof Error ? e.message : 'Đánh giá thất bại.',
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <h2 className="font-semibold mb-3">Danh sách chương ({chunks.length})</h2>
      <div className="divide-y divide-slate-100">
        {chunks.map((c) => {
          const score = chunkScore(c);
          const evaluated = score != null;
          const busy = busyId === c.id;
          const err = c.id ? errors[c.id] : undefined;
          return (
            <div
              key={c.id}
              className="py-3 flex items-start justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900">
                  {c.chapterIndex}. {c.chapterTitle}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {c.startPage != null && (
                    <>
                      Trang {c.startPage}
                      {c.endPage != null && c.endPage !== c.startPage
                        ? `–${c.endPage}`
                        : ''}
                      {' • '}
                    </>
                  )}
                  {(c.text ?? '').length.toLocaleString('vi-VN')} ký tự
                  {c.tokensIn != null && (
                    <> • ~{c.tokensIn.toLocaleString('vi-VN')} token</>
                  )}
                </div>
                {c.summary && (
                  <div className="text-xs text-slate-600 mt-1 line-clamp-2">
                    {c.summary}
                  </div>
                )}
                {err && (
                  <div className="text-xs text-red-600 mt-1">{err}</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {score != null && (
                  <span className={`score-pill ${scoreColor(score)}`}>
                    {score.toFixed(1)}
                  </span>
                )}
                <button
                  type="button"
                  className="btn-secondary text-xs px-2 py-1"
                  onClick={() => c.id && evalChunk(c.id)}
                  disabled={busyId !== null || !c.id}
                >
                  {busy
                    ? 'Đang chấm...'
                    : evaluated
                      ? 'Đánh giá lại'
                      : 'Đánh giá'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
