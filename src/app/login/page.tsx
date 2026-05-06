'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithPopup } from 'firebase/auth';
import { clientAuth, googleProvider } from '@/lib/firebase';

// Wrap the body in Suspense so Next 14 doesn't deopt the whole route to
// dynamic just because we read `?next=...` via useSearchParams.
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginCard busy />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [configMissing, setConfigMissing] = useState(false);

  useEffect(() => {
    // Surface a friendlier error than Firebase's "auth/invalid-api-key" if the
    // user hasn't filled in .env.local yet. Cheap heuristic — if NEXT_PUBLIC_*
    // vars never made it into the bundle the auth domain will be empty.
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
      setConfigMissing(true);
    }
  }, []);

  async function signIn() {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const cred = await signInWithPopup(clientAuth(), googleProvider());
      const idToken = await cred.user.getIdToken(true);
      const r = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Không tạo được phiên đăng nhập.');
      }
      router.replace(next);
      router.refresh();
    } catch (e: unknown) {
      // Firebase errors come through with a `code`; messages are a bit terse so
      // we map the most common ones to Vietnamese text.
      const code = (e as { code?: string }).code;
      const msg = (e as Error).message;
      if (code === 'auth/popup-closed-by-user') {
        setErr('Bạn đã đóng cửa sổ đăng nhập.');
      } else if (code === 'auth/popup-blocked') {
        setErr('Trình duyệt chặn pop-up. Hãy cho phép pop-up và thử lại.');
      } else if (code === 'auth/unauthorized-domain') {
        setErr(
          'Tên miền hiện tại chưa được thêm vào Firebase Authentication → Settings → Authorized domains.',
        );
      } else {
        setErr(msg || 'Đăng nhập thất bại.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <LoginCard
      busy={busy}
      configMissing={configMissing}
      err={err}
      onSignIn={signIn}
    />
  );
}

function LoginCard({
  busy,
  configMissing,
  err,
  onSignIn,
}: {
  busy: boolean;
  configMissing?: boolean;
  err?: string | null;
  onSignIn?: () => void;
}) {
  return (
    <div className="max-w-md mx-auto pt-8">
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold">Đăng nhập</h1>
        <p className="text-sm text-slate-600">
          Sử dụng tài khoản Google của bạn để truy cập danh sách giáo trình
          và bắt đầu đánh giá bằng AI.
        </p>

        {configMissing && (
          <div className="text-sm border border-amber-200 bg-amber-50 text-amber-800 rounded-md p-3">
            Chưa thấy <code>NEXT_PUBLIC_FIREBASE_API_KEY</code>. Tạo file{' '}
            <code>.env.local</code> dựa trên <code>.env.example</code> rồi
            khởi động lại <code>npm run dev</code>.
          </div>
        )}

        <button
          className="btn-primary w-full justify-center"
          onClick={onSignIn}
          disabled={busy || !onSignIn}
        >
          {busy ? 'Đang đăng nhập...' : 'Đăng nhập với Google'}
        </button>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <p className="text-xs text-slate-500">
          Bằng việc đăng nhập, bạn đồng ý cho hệ thống lưu trữ giáo trình bạn
          tải lên trên Firebase và gửi nội dung đến mô hình Claude của
          Anthropic để phân tích.
        </p>
      </div>
    </div>
  );
}
