'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function TextbookActions({
  id,
  status,
  hasChunks,
  hasEvaluation,
}: {
  id: string;
  status: string;
  hasChunks: boolean;
  hasEvaluation: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'parse' | 'evaluate' | 'delete'>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onParse() {
    if (busy) return;
    setBusy('parse');
    setErr(null);
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
    try {
      const r = await fetch(`/api/textbooks/${id}/evaluate`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Đánh giá thất bại.');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Đánh giá thất bại.');
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (busy) return;
    if (!confirm('Xoá vĩnh viễn giáo trình này (kèm các chương đã tách)?')) return;
    setBusy('delete');
    setErr(null);
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
  const evalLabel = hasEvaluation ? 'Đánh giá lại' : 'Đánh giá AI';
  const evalDisabled = !hasChunks;

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
      {err && (
        <div className="basis-full text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
          {err}
        </div>
      )}
    </div>
  );
}
