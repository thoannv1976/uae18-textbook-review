import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { adminBucket } from '@/lib/firebase-admin';
import { getTextbook, replaceChunks, updateTextbook } from '@/lib/repo';
import { getExtension, parseFile } from '@/lib/parser';
import { chunkDocument } from '@/lib/chunker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Parse the previously-uploaded file:
 * 1. Download the original from Cloud Storage.
 * 2. Extract plain text via the appropriate parser (DOCX / PDF / TXT).
 * 3. Split into chapter-aligned chunks bounded by MAX_CHUNK_TOKENS.
 * 4. Replace the textbook's chunks collection in one batch.
 * 5. Update textbook.status to 'parsed' and store chapterCount/totalPages.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: { id: string } },
) {
  const id = ctx.params.id;
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Bạn cần đăng nhập.' }, { status: 401 });
  }

  const textbook = await getTextbook(id, user.uid);
  if (!textbook) {
    return NextResponse.json(
      { error: 'Không tìm thấy giáo trình.' },
      { status: 404 },
    );
  }
  if (!textbook.fileRef) {
    return NextResponse.json(
      { error: 'Giáo trình chưa có file. Vui lòng upload lại.' },
      { status: 400 },
    );
  }

  const ext = getExtension(textbook.originalFileName ?? '');
  if (!ext) {
    return NextResponse.json(
      { error: 'Định dạng file không hỗ trợ.' },
      { status: 400 },
    );
  }

  // Mark as evaluating early so the UI can show a spinner; we use 'uploaded'
  // again on failure so the user can retry without confusion.
  await updateTextbook(id, user.uid, { status: 'uploaded' });

  // Download the file from Storage. fileRef is `gs://bucket/path`.
  const gsMatch = textbook.fileRef.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!gsMatch) {
    return NextResponse.json(
      { error: 'fileRef không hợp lệ.' },
      { status: 500 },
    );
  }
  const objectPath = gsMatch[2];

  let buffer: Buffer;
  try {
    const [data] = await adminBucket().file(objectPath).download();
    buffer = data;
  } catch (e) {
    console.error('storage download failed', e);
    return NextResponse.json(
      { error: 'Không tải được file từ Storage.' },
      { status: 500 },
    );
  }

  let parsed;
  try {
    parsed = await parseFile(buffer, ext);
  } catch (e) {
    await updateTextbook(id, user.uid, { status: 'failed' }).catch(() => {});
    const msg = e instanceof Error ? e.message : 'Parse lỗi';
    console.error('parse failed', e);
    return NextResponse.json(
      { error: `Không đọc được nội dung file: ${msg}` },
      { status: 422 },
    );
  }

  if (!parsed.text || parsed.text.length < 50) {
    await updateTextbook(id, user.uid, { status: 'failed' }).catch(() => {});
    return NextResponse.json(
      { error: 'File rỗng hoặc không trích được text.' },
      { status: 422 },
    );
  }

  const rawChunks = chunkDocument(parsed.text);
  if (rawChunks.length === 0) {
    await updateTextbook(id, user.uid, { status: 'failed' }).catch(() => {});
    return NextResponse.json(
      { error: 'Không tách được chunk nào từ tài liệu.' },
      { status: 422 },
    );
  }

  await replaceChunks(
    id,
    user.uid,
    rawChunks.map((c) => ({
      chapterIndex: c.chapterIndex,
      chapterTitle: c.chapterTitle,
      text: c.text,
      tokensIn: c.estimatedTokens,
      startPage: c.startPage,
      endPage: c.endPage,
    })),
  );

  // For DOCX/TXT the parser can't count pages, but if the TOC told us each
  // chapter's start page we can take the largest endPage as a reasonable
  // total. PDF gets the authoritative page count from the parser.
  const maxTocPage = rawChunks.reduce((max, c) => {
    const p = c.endPage ?? c.startPage ?? 0;
    return p > max ? p : max;
  }, 0);
  const totalPages = parsed.pageCount ?? (maxTocPage > 0 ? maxTocPage : undefined);

  await updateTextbook(id, user.uid, {
    status: 'parsed',
    chapterCount: rawChunks.length,
    totalPages,
  });

  return NextResponse.json({
    ok: true,
    chapterCount: rawChunks.length,
    totalPages,
    totalTokens: rawChunks.reduce((sum, c) => sum + c.estimatedTokens, 0),
    sampleTitles: rawChunks.slice(0, 5).map((c) => c.chapterTitle),
  });
}
