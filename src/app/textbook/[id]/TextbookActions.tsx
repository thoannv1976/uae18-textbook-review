'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function TextbookActions({
  id,
  status,
  hasChunks,
}: {
  id: string;
  status: string;
  hasChunks: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'parse' | 'delete'>(null);
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
        className="btn-secondary opacity-60 cursor-not-allowed"
        disabled
        title="Sẽ mở trong feature (c)"
      >
        Đánh giá AI {hasChunks ? '' : '(cần tách chương trước)'}
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
      {err && (
        <div className="basis-full text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
          {err}
        </div>
      )}
    </div>
  );
}
