import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { deleteTextbook, getTextbook } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  ctx: { params: { id: string } },
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Bạn cần đăng nhập.' }, { status: 401 });
  }

  const existing = await getTextbook(ctx.params.id, user.uid);
  if (!existing) {
    return NextResponse.json(
      { error: 'Không tìm thấy giáo trình.' },
      { status: 404 },
    );
  }

  try {
    await deleteTextbook(ctx.params.id, user.uid);
  } catch (e) {
    console.error('delete textbook failed', e);
    return NextResponse.json(
      { error: 'Không xoá được giáo trình.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
