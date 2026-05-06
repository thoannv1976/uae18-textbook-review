import type { AuthUser } from '@/lib/types';

export default function UserBadge({ user }: { user: AuthUser }) {
  const label = user.name || user.email || user.uid;
  return (
    <div className="flex items-center gap-2 text-sm">
      {user.picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.picture}
          alt=""
          className="w-7 h-7 rounded-full border border-slate-200"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold">
          {(label[0] || '?').toUpperCase()}
        </div>
      )}
      <span className="text-slate-700 hidden sm:inline" title={user.email ?? ''}>
        {label}
      </span>
    </div>
  );
}
