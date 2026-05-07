'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function TextbookActions({
  id,
  status,
  hasChunks,
  hasEvaluation,
  evaluatedChapters,
  totalChapters,
}: {
  id: string;
  status: string;
  hasChunks: boolean;
  hasEvaluation: boolean;
  evaluatedChapters: number;
  totalChapters: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'parse' | 'evaluate' | 'aggregate' | 'delete'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onParse() {
    if (busy) return;
    setBusy('parse');
    setErr(null);
    setInfo(null);
    try {
      const r = await fetch(`/api/textbooks/${id}/parse`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Parse thất bại.');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Parse thất bại.');
    } finally {
      setBusy(null);
    }
  }

  async function onEvaluate() {
    if (busy) return;
    if (
      hasEvaluation &&
      !confirm('Đã có kết quả đánh giá trước đó. Chạy lại sẽ ghi đè kết quả cũ. Tiếp tục?')
    ) {
      return;
    }
    setBusy('evaluate');
    setErr(null);
    setInfo(null);
    try {
      const r = await fetch(`/api/textbooks/${id}/evaluate`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const detail =
          Array.isArray(j.failures) && j.failures.length > 0
            ? `\n\nChương fail:\n${j.failures
                .map((f: { chapterTitle: string; message: string }) => `• ${f.chapterTitle}: ${f.message}`)
                .join('\n')}`
            : '';
        throw new Error((j.error || 'Đánh giá thất bại.') + detail);
      }
      if (j.chaptersFailed > 0) {
        const titles = (j.failures || [])
          .map((f: { chapterTitle: string }) => f.chapterTitle)
          .join(', ');
        setInfo(
          `Đánh giá xong ${j.chaptersEvaluated}/${totalChapters} chương. ` +
            `${j.chaptersFailed} chương fail: ${titles}. Bấm "Đánh giá" tại từng chương đó để retry.`,
        );
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Đánh giá thất bại.');
    } finally {
      setBusy(null);
    }
  }

  async function onAggregate() {
    if (busy) return;
    setBusy('aggregate');
    setErr(null);
    setInfo(null);
    try {
      const r = await fetch(`/api/textbooks/${id}/aggregate`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Tổng hợp thất bại.');
      if (j.chaptersSkipped > 0) {
        setInfo(
          `Tổng hợp xong từ ${j.chaptersIncluded} chương. ` +
            `${j.chaptersSkipped} chương chưa được đánh giá nên không tính vào.`,
        );
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Tổng hợp thất bại.');
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (busy) return;
    if (!confirm('Xoá vĩnh viễn giáo trình này (kèm các chương đã tách)?')) return;
    setBusy('delete');
    setErr(null);
    setInfo(null);
    try {
      const r = await fetch(`/api/textbooks/${id}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Xoá thất bại.');
      router.replace('/');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Xoá thất bại.');
      setBusy(null);
    }
  }

  const parseLabel =
    status === 'uploaded' ? 'Phân tích & tách chương' : 'Tách chương lại';
  const evalLabel = hasEvaluation ? 'Đánh giá lại tất cả' : 'Đánh giá AI tất cả';
  const evalDisabled = !hasChunks;
  const showAggregate = evaluatedChapters > 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn-primary"
        onClick={onParse}
        disabled={busy !== null}
      >
        {busy === 'parse' ? 'Đang xử lý...' : parseLabel}
      </button>
      <button
        type="button"
        className={evalDisabled ? 'btn-secondary opacity-60 cursor-not-allowed' : 'btn-primary'}
        onClick={evalDisabled ? undefined : onEvaluate}
        disabled={busy !== null || evalDisabled}
        title={evalDisabled ? 'Cần tách chương trước khi đánh giá' : undefined}
      >
        {busy === 'evaluate' ? 'Đang đánh giá... (vài phút)' : evalLabel}
      </button>
      {showAggregate && (
        <button
          type="button"
          className="btn-secondary"
          onClick={onAggregate}
          disabled={busy !== null}
          title="Tính lại điểm tổng từ các chương đã được đánh giá (không gọi Claude)"
        >
          {busy === 'aggregate'
            ? 'Đang tổng hợp...'
            : `Tổng hợp đánh giá (${evaluatedChapters}/${totalChapters})`}
        </button>
      )}
      <div className="flex-1" />
      <button
        type="button"
        className="btn-danger"
        onClick={onDelete}
        disabled={busy !== null}
      >
        {busy === 'delete' ? 'Đang xoá...' : 'Xoá giáo trình'}
      </button>
      {busy === 'evaluate' && (
        <div className="basis-full text-sm text-slate-600 flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
          Đang gửi từng chương tới Claude (concurrency 3). Phụ thuộc số
          chương, có thể mất 1–5 phút. Vui lòng giữ tab mở.
        </div>
      )}
      {info && (
        <div className="basis-full text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3 whitespace-pre-line">
          {info}
        </div>
      )}
      {err && (
        <div className="basis-full text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 whitespace-pre-line">
          {err}
        </div>
      )}
    </div>
  );
}
