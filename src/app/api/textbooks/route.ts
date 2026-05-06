import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { adminBucket } from '@/lib/firebase-admin';
import { createTextbook } from '@/lib/repo';
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
} from '@/lib/constants';
import { getExtension } from '@/lib/parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MetadataSchema = z.object({
  title: z.string().trim().min(1, 'Tiêu đề bắt buộc').max(300),
  authors: z.string().trim().max(300).optional().or(z.literal('')),
  subject: z.string().trim().max(200).optional().or(z.literal('')),
  audience: z.string().trim().max(200).optional().or(z.literal('')),
  credits: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === '' || v == null) return undefined;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : undefined;
    }),
  isbn: z.string().trim().max(40).optional().or(z.literal('')),
  publisher: z.string().trim().max(200).optional().or(z.literal('')),
  publishedYear: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === '' || v == null) return undefined;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) && n >= 1900 && n <= 2100 ? n : undefined;
    }),
});

/**
 * Multipart upload of a textbook file + metadata.
 * 1. Validate user, file extension, size.
 * 2. Stream the file into Cloud Storage at textbooks/{ownerId}/{textbookId}/{filename}.
 * 3. Create the Firestore textbook doc with status='uploaded'.
 * 4. Return { id } so the client can call /parse next.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Bạn cần đăng nhập.' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'Yêu cầu không phải multipart/form-data hợp lệ.' },
      { status: 400 },
    );
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: 'Thiếu file giáo trình.' },
      { status: 400 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File vượt quá ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
      },
      { status: 413 },
    );
  }

  const ext = getExtension(file.name);
  if (!ext) {
    return NextResponse.json(
      {
        error: `Định dạng không hỗ trợ. Cho phép: ${ALLOWED_EXTENSIONS.join(', ')}.`,
      },
      { status: 400 },
    );
  }

  const metaRaw = {
    title: form.get('title')?.toString() ?? '',
    authors: form.get('authors')?.toString() ?? '',
    subject: form.get('subject')?.toString() ?? '',
    audience: form.get('audience')?.toString() ?? '',
    credits: form.get('credits')?.toString() ?? '',
    isbn: form.get('isbn')?.toString() ?? '',
    publisher: form.get('publisher')?.toString() ?? '',
    publishedYear: form.get('publishedYear')?.toString() ?? '',
  };
  const meta = MetadataSchema.safeParse(metaRaw);
  if (!meta.success) {
    return NextResponse.json(
      { error: meta.error.issues[0]?.message ?? 'Metadata không hợp lệ.' },
      { status: 400 },
    );
  }

  // Create the Firestore doc first so we have a stable ID for the storage path.
  const created = await createTextbook({
    ownerId: user.uid,
    title: meta.data.title,
    authors: meta.data.authors || undefined,
    subject: meta.data.subject || undefined,
    audience: meta.data.audience || undefined,
    credits: meta.data.credits,
    isbn: meta.data.isbn || undefined,
    publisher: meta.data.publisher || undefined,
    publishedYear: meta.data.publishedYear,
    originalFileName: file.name,
    status: 'uploaded',
  });

  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const objectPath = `textbooks/${user.uid}/${created.id}/${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const bucket = adminBucket();
    await bucket.file(objectPath).save(buffer, {
      contentType: file.type || 'application/octet-stream',
      resumable: false,
      metadata: {
        metadata: {
          ownerId: user.uid,
          textbookId: created.id ?? '',
        },
      },
    });
    // Patch the textbook with its storage location.
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb()
      .collection('textbooks')
      .doc(created.id!)
      .set(
        { fileRef: `gs://${bucket.name}/${objectPath}` },
        { merge: true },
      );
  } catch (e) {
    // Roll back the Firestore doc if storage upload fails.
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb().collection('textbooks').doc(created.id!).delete().catch(() => {});
    console.error('storage upload failed', e);
    return NextResponse.json(
      { error: 'Không upload được file lên Storage.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: created.id });
}
