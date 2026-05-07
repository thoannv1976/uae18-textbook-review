import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTextbook, listChunks } from '@/lib/repo';
import TextbookActions from './TextbookActions';

export const dynamic = 'force-dynamic';

function fmtDate(d?: string) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('vi-VN');
  } catch {
    return d;
  }
}

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  uploaded: { text: 'Đã upload', cls: 'bg-slate-100 text-slate-700' },
  parsed: { text: 'Đã tách chương', cls: 'bg-blue-100 text-blue-700' },
  evaluating: { text: 'Đang đánh giá', cls: 'bg-amber-100 text-amber-700' },
  evaluated: { text: 'Đã đánh giá', cls: 'bg-emerald-100 text-emerald-700' },
  failed: { text: 'Lỗi', cls: 'bg-red-100 text-red-700' },
};

export default async function TextbookDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/textbook/${params.id}`);

  const textbook = await getTextbook(params.id, user.uid);
  if (!textbook) notFound();

  let chunks: Awaited<ReturnType<typeof listChunks>> = [];
  let chunksErr: string | null = null;
  if (textbook.status !== 'uploaded') {
    try {
      chunks = await listChunks(params.id);
    } catch (e) {
      chunksErr = e instanceof Error ? e.message : String(e);
    }
  }
  const totalTokens = chunks.reduce((s, c) => s + (c.tokensIn ?? 0), 0);
  const status = STATUS_LABELS[textbook.status ?? 'uploaded'] ?? STATUS_LABELS.uploaded;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-700">
            ← Danh sách
          </Link>
          <h1 className="text-2xl font-semibold mt-1 break-words">
            {textbook.title}
          </h1>
          <div className="text-sm text-slate-500 mt-1 space-x-2">
            {textbook.authors && <span>Tác giả: {textbook.authors}</span>}
            {textbook.subject && <span>• Môn: {textbook.subject}</span>}
            {textbook.publishedYear && <span>• {textbook.publishedYear}</span>}
          </div>
        </div>
        <span className={`badge ${status.cls}`}>{status.text}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Số chương" value={textbook.chapterCount ?? chunks.length ?? '—'} />
        <Stat label="Số trang" value={textbook.totalPages ?? '—'} />
        <Stat label="Tổng token (ước tính)" value={totalTokens ? totalTokens.toLocaleString('vi-VN') : '—'} />
        <Stat label="Cập nhật" value={fmtDate(textbook.updatedAt) || '—'} />
      </div>

      <TextbookActions
        id={params.id}
        status={textbook.status ?? 'uploaded'}
        hasChunks={chunks.length > 0}
      />

      {textbook.status === 'uploaded' && (
        <div className="card border-amber-200 bg-amber-50 text-amber-800 text-sm">
          File đã upload nhưng chưa được tách chương. Bấm <strong>Phân tích & tách chương</strong> phía trên.
        </div>
      )}

      {chunksErr && (
        <div className="card border-red-200 bg-red-50 text-red-700 text-sm">
          Không tải được danh sách chương: {chunksErr}
        </div>
      )}

      {chunks.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">Danh sách chương ({chunks.length})</h2>
          <div className="divide-y divide-slate-100">
            {chunks.map((c) => (
              <div key={c.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {c.chapterIndex}. {c.chapterTitle}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {(c.text ?? '').length.toLocaleString('vi-VN')} ký tự
                    {c.tokensIn != null && (
                      <> • ~{c.tokensIn.toLocaleString('vi-VN')} token</>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="card">
        <summary className="cursor-pointer font-medium text-sm">
          Thông tin chi tiết
        </summary>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm mt-3">
          <Row label="ID" value={params.id} mono />
          <Row label="File gốc" value={textbook.originalFileName} />
          <Row label="Audience" value={textbook.audience} />
          <Row label="Credits" value={textbook.credits} />
          <Row label="Publisher" value={textbook.publisher} />
          <Row label="ISBN" value={textbook.isbn} />
          <Row label="Tạo lúc" value={fmtDate(textbook.createdAt)} />
        </dl>
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-slate-500 col-span-1">{label}</dt>
      <dd className={`col-span-2 ${mono ? 'font-mono text-xs break-all' : ''}`}>
        {value || <span className="text-slate-400">—</span>}
      </dd>
    </>
  );
}
