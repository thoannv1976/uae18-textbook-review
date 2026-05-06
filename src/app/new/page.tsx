import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import UploadForm from './UploadForm';

export const dynamic = 'force-dynamic';

export default async function NewTextbookPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/new');

  return (
    <div className="max-w-2xl mx-auto pt-4">
      <UploadForm />
    </div>
  );
}
