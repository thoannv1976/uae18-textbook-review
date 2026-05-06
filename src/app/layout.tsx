import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';
import { getCurrentUser } from '@/lib/auth';
import SignOutButton from '@/components/SignOutButton';
import UserBadge from '@/components/UserBadge';

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'AI chấm điểm, phân tích từng chương và gợi ý chỉnh sửa giáo trình đại học.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="vi">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="bg-white border-b border-slate-200">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
              <Link href={user ? '/' : '/login'} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-600 text-white grid place-items-center font-bold">
                  G
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{APP_NAME}</div>
                  <div className="text-xs text-slate-500">{APP_TAGLINE}</div>
                </div>
              </Link>
              <nav className="flex items-center gap-3 text-sm">
                {user ? (
                  <>
                    <Link className="btn-ghost" href="/">
                      Danh sách
                    </Link>
                    <Link className="btn-primary" href="/new">
                      + Giáo trình mới
                    </Link>
                    <UserBadge user={user} />
                    <SignOutButton />
                  </>
                ) : (
                  <Link className="btn-primary" href="/login">
                    Đăng nhập
                  </Link>
                )}
              </nav>
            </div>
          </header>
          <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
            {children}
          </main>
          <footer className="max-w-6xl mx-auto px-6 py-8 text-xs text-slate-400">
            Powered by Claude • Firebase • Google Cloud Run
          </footer>
        </div>
      </body>
    </html>
  );
}
