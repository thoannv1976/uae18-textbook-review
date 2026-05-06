'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientAuth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

/**
 * Two-step sign-out: clear the server session cookie first, then drop the
 * client-side Firebase auth state. Doing it in this order avoids a race
 * where the SDK resets state and the user reloads to a still-valid cookie.
 */
export default function SignOutButton({ className = 'btn-secondary' }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
      await signOut(clientAuth());
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <button className={className} onClick={onClick} disabled={busy}>
      {busy ? 'Đang đăng xuất...' : 'Đăng xuất'}
    </button>
  );
}
