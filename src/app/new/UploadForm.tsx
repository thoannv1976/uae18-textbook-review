'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
} from '@/lib/constants';

type Phase = 'idle' | 'uploading' | 'parsing' | 'done' | 'error';

const ACCEPT = ALLOWED_EXTENSIONS.join(',');
const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

export default function UploadForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setProgress(null);

    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setErr('Vui lòng chọn file giáo trình.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setErr(`File vượt quá ${MAX_MB} MB.`);
      return;
    }

    setPhase('uploading');
    setProgress('Đang upload...');
    let textbookId: string;
    try {
      const r = await fetch('/api/textbooks', {
        method: 'POST',
        body: data,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Upload thất bại.');
      textbookId = j.id;
    } catch (e) {
      setPhase('error');
      setErr(e instanceof Error ? e.message : 'Upload thất bại.');
      return;
    }

    setPhase('parsing');
    setProgress('Đang phân tích nội dung và tách chương...');
    try {
      const r = await fetch(`/api/textbooks/${textbookId}/parse`, {
        method: 'POST',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Parse thất bại.');
    } catch (e) {
      // The textbook record exists; the user can re-trigger parse from
      // the detail page if needed. Surface the error and route them there.
      setPhase('error');
      setErr(
        (e instanceof Error ? e.message : 'Parse thất bại.') +
          ' Có thể thử Parse lại trong trang chi tiết.',
      );
      router.push(`/textbook/${textbookId}`);
      return;
    }

    setPhase('done');
    router.push(`/textbook/${textbookId}`);
    router.refresh();
  }

  const busy = phase === 'uploading' || phase === 'parsing';

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Giáo trình mới</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload bản DOCX/PDF/TXT/MD. Hệ thống sẽ tự tách chương và tính token
          để chuẩn bị cho bước đánh giá.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="file">
          File giáo trình ({ALLOWED_EXTENSIONS.join(', ')}, tối đa {MAX_MB} MB) *
        </label>
        <input
          ref={fileRef}
          id="file"
          name="file"
          type="file"
          accept={ACCEPT}
          required
          disabled={busy}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md
                     file:border file:border-slate-300 file:bg-white file:text-slate-700
                     file:hover:bg-slate-50 file:cursor-pointer cursor-pointer"
        />
        {fileName && (
          <p className="text-xs text-slate-500 mt-1">Đã chọn: {fileName}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">Tiêu đề *</label>
          <input id="title" name="title" required className="input" disabled={busy} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="authors">Tác giả</label>
          <input id="authors" name="authors" className="input" disabled={busy} />
        </div>
        <div>
          <label className="label" htmlFor="subject">Môn học</label>
          <input id="subject" name="subject" className="input" disabled={busy} />
        </div>
        <div>
          <label className="label" htmlFor="audience">Đối tượng</label>
          <input
            id="audience"
            name="audience"
            placeholder="Vd: SV năm 2 ngành CNTT"
            className="input"
            disabled={busy}
          />
        </div>
        <div>
          <label className="label" htmlFor="credits">Số tín chỉ</label>
          <input
            id="credits"
            name="credits"
            type="number"
            min="0"
            step="1"
            className="input"
            disabled={busy}
          />
        </div>
        <div>
          <label className="label" htmlFor="publishedYear">Năm xuất bản</label>
          <input
            id="publishedYear"
            name="publishedYear"
            type="number"
            min="1900"
            max="2100"
            className="input"
            disabled={busy}
          />
        </div>
        <div>
          <label className="label" htmlFor="publisher">Nhà xuất bản</label>
          <input id="publisher" name="publisher" className="input" disabled={busy} />
        </div>
        <div>
          <label className="label" htmlFor="isbn">ISBN</label>
          <input id="isbn" name="isbn" className="input" disabled={busy} />
        </div>
      </div>

      {progress && (
        <div className="text-sm text-slate-600 flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
          {progress}
        </div>
      )}

      {err && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
          {err}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {phase === 'uploading'
            ? 'Đang upload...'
            : phase === 'parsing'
              ? 'Đang tách chương...'
              : 'Tải lên & phân tích'}
        </button>
        <Link href="/" className="btn-secondary">
          Huỷ
        </Link>
      </div>
    </form>
  );
}
