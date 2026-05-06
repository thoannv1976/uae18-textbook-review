import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Placeholder — the real upload + parse + chunk flow lands in feature (b).
// Kept here so the "+ Giáo trình mới" link in the header doesn't 404 while we
// finish wiring auth.
export default async function NewTextbookPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/new');

  return (
    <div className="max-w-2xl mx-auto pt-4">
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold">Giáo trình mới</h1>
        <p className="text-sm text-slate-600">
          Trang upload + chunking đang được xây ở feature (b). Tạm thời, sau
          khi anh test feature (a) (đăng nhập + danh sách) xong, em sẽ build
          tiếp upload DOCX/PDF, parse và tách chunk theo chương.
        </p>
        <Link href="/" className="btn-secondary">
          ← Quay lại danh sách
        </Link>
      </div>
    </div>
  );
}
