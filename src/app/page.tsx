import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listTextbooksForOwner } from '@/lib/repo';

export const dynamic = 'force-dynamic';

function fmt(d?: string) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('vi-VN');
  } catch {
    return d;
  }
}

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let items: Awaited<ReturnType<typeof listTextbooksForOwner>> = [];
  let err: string | null = null;
  try {
    items = await listTextbooksForOwner(user.uid);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Giáo trình đại học</h1>
          <p className="text-sm text-slate-500">
            Quản lý, đánh giá và chỉnh sửa giáo trình bằng AI.
          </p>
        </div>
        <Link href="/new" className="btn-primary">
          + Giáo trình mới
        </Link>
      </div>

      {err && (
        <div className="card border-red-200 bg-red-50 text-red-700 text-sm">
          Không kết nối được Firebase: {err}. Kiểm tra biến môi trường (xem README).
        </div>
      )}

      {!err && items.length === 0 && (
        <div className="card text-center text-slate-500">
          Chưa có giáo trình nào. Bấm <strong>Giáo trình mới</strong> để bắt đầu.
        </div>
      )}

      <div className="grid gap-3">
        {items.map((t) => (
          <Link
            key={t.id}
            href={`/textbook/${t.id}`}
            className="card hover:border-brand-500 transition flex items-start justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 truncate">
                {t.title}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {t.authors && <>Tác giả: {t.authors} • </>}
                {t.subject && <>Môn: {t.subject} • </>}
                {t.credits != null && <>{t.credits} TC • </>}
                {t.chapterCount != null && <>{t.chapterCount} chương • </>}
                Cập nhật {fmt(t.updatedAt)}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {t.status === 'evaluated' && (
                <span className="badge bg-emerald-100 text-emerald-700">
                  Đã đánh giá
                </span>
              )}
              {t.status === 'evaluating' && (
                <span className="badge bg-amber-100 text-amber-700">
                  Đang đánh giá
                </span>
              )}
              {t.status === 'failed' && (
                <span className="badge bg-red-100 text-red-700">Lỗi</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
