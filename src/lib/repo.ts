import 'server-only';
import { adminBucket, adminDb } from './firebase-admin';
import { COL, RATE_LIMIT_PER_DAY, RATE_LIMIT_PER_HOUR } from './constants';
import type {
  TextbookDoc,
  Evaluation,
  ChunkDoc,
  UsageLogDoc,
} from './types';

function nowIso() {
  return new Date().toISOString();
}

// ---- textbooks ----

export async function listTextbooksForOwner(
  ownerId: string,
): Promise<TextbookDoc[]> {
  const db = adminDb();
  const snap = await db
    .collection(COL.textbooks)
    .where('ownerId', '==', ownerId)
    .orderBy('updatedAt', 'desc')
    .limit(200)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TextbookDoc) }));
}

export async function getTextbook(
  id: string,
  ownerId: string,
): Promise<TextbookDoc | null> {
  const db = adminDb();
  const snap = await db.collection(COL.textbooks).doc(id).get();
  if (!snap.exists) return null;
  const data = { id: snap.id, ...(snap.data() as TextbookDoc) };
  if (data.ownerId !== ownerId) return null; // hide existence on wrong owner
  return data;
}

export async function createTextbook(
  data: Omit<TextbookDoc, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<TextbookDoc> {
  const db = adminDb();
  const doc: Omit<TextbookDoc, 'id'> = {
    ...data,
    status: data.status ?? 'uploaded',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const ref = await db.collection(COL.textbooks).add(doc);
  return { id: ref.id, ...doc };
}

export async function updateTextbook(
  id: string,
  ownerId: string,
  patch: Partial<TextbookDoc>,
): Promise<void> {
  const existing = await getTextbook(id, ownerId);
  if (!existing) throw new Error('not found');
  const db = adminDb();
  await db
    .collection(COL.textbooks)
    .doc(id)
    .set({ ...patch, updatedAt: nowIso() }, { merge: true });
}

export async function deleteTextbook(
  id: string,
  ownerId: string,
): Promise<void> {
  const existing = await getTextbook(id, ownerId);
  if (!existing) return;
  const db = adminDb();
  await db.collection(COL.textbooks).doc(id).delete();
  // Cascade: chunks + evaluations + revisions.
  for (const c of [COL.chunks, COL.evaluations, COL.revisions]) {
    const snap = await db.collection(c).where('textbookId', '==', id).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  // Cascade: original uploaded file in Storage. The folder layout is
  // textbooks/{ownerId}/{textbookId}/... so we drop the whole prefix.
  try {
    await adminBucket().deleteFiles({
      prefix: `textbooks/${ownerId}/${id}/`,
    });
  } catch (e) {
    // Don't fail deletion of the Firestore record if Storage cleanup chokes.
    console.error('storage cleanup failed for textbook', id, e);
  }
}

// ---- chunks ----

// Caller must have already verified textbook ownership (e.g. via getTextbook).
// Filtering only by textbookId here keeps us inside the existing
// (textbookId, chapterIndex) composite index.
export async function listChunks(textbookId: string): Promise<ChunkDoc[]> {
  const db = adminDb();
  const snap = await db
    .collection(COL.chunks)
    .where('textbookId', '==', textbookId)
    .orderBy('chapterIndex', 'asc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ChunkDoc) }));
}

/**
 * Replace all chunks for a textbook in one batch. Old chunks (from a previous
 * parse run) are deleted first so re-parsing produces a clean set.
 */
export async function replaceChunks(
  textbookId: string,
  ownerId: string,
  chunks: Omit<ChunkDoc, 'id' | 'textbookId' | 'ownerId' | 'createdAt' | 'updatedAt'>[],
): Promise<void> {
  const db = adminDb();
  const existing = await db
    .collection(COL.chunks)
    .where('textbookId', '==', textbookId)
    .get();

  const ts = nowIso();
  // Firestore caps writes per batch at 500. With our chunk sizes a textbook
  // shouldn't get near that, but guard anyway.
  const BATCH_LIMIT = 450;
  const ops: { ref: FirebaseFirestore.DocumentReference; data?: Partial<ChunkDoc>; type: 'set' | 'delete' }[] = [];

  for (const d of existing.docs) {
    ops.push({ ref: d.ref, type: 'delete' });
  }
  for (const c of chunks) {
    const ref = db.collection(COL.chunks).doc();
    ops.push({
      ref,
      type: 'set',
      data: { ...c, textbookId, ownerId, createdAt: ts, updatedAt: ts },
    });
  }

  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const slice = ops.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const op of slice) {
      if (op.type === 'delete') batch.delete(op.ref);
      else batch.set(op.ref, op.data!);
    }
    await batch.commit();
  }
}

export async function updateChunk(
  chunkId: string,
  patch: Partial<ChunkDoc>,
): Promise<void> {
  const db = adminDb();
  await db
    .collection(COL.chunks)
    .doc(chunkId)
    .set({ ...patch, updatedAt: nowIso() }, { merge: true });
}

/**
 * Fetch a single chunk and assert it belongs to the given textbook + owner.
 * Returns null when missing or owned by another user — callers should turn
 * that into a 404 to avoid leaking the existence of other people's chunks.
 */
export async function getChunk(
  chunkId: string,
  textbookId: string,
  ownerId: string,
): Promise<ChunkDoc | null> {
  const db = adminDb();
  const snap = await db.collection(COL.chunks).doc(chunkId).get();
  if (!snap.exists) return null;
  const data = { id: snap.id, ...(snap.data() as ChunkDoc) };
  if (data.textbookId !== textbookId || data.ownerId !== ownerId) return null;
  return data;
}

// ---- evaluations ----

export async function saveEvaluation(
  textbookId: string,
  ownerId: string,
  evaluation: Omit<Evaluation, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const db = adminDb();
  const doc = {
    ...evaluation,
    textbookId,
    ownerId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const ref = await db.collection(COL.evaluations).add(doc);
  await db
    .collection(COL.textbooks)
    .doc(textbookId)
    .set(
      { latestEvaluationId: ref.id, status: 'evaluated', updatedAt: nowIso() },
      { merge: true },
    );
  return ref.id;
}

export async function getEvaluation(
  id: string,
  ownerId: string,
): Promise<Evaluation | null> {
  const db = adminDb();
  const snap = await db.collection(COL.evaluations).doc(id).get();
  if (!snap.exists) return null;
  const data = { id: snap.id, ...(snap.data() as Evaluation) };
  if (data.ownerId !== ownerId) return null;
  return data;
}

// ---- usage logs / rate limit ----

export async function logUsage(
  log: Omit<UsageLogDoc, 'id' | 'createdAt'>,
): Promise<void> {
  const db = adminDb();
  await db.collection(COL.usageLogs).add({ ...log, createdAt: nowIso() });
}

/**
 * Throws an Error with code='RATE_LIMITED' if the current owner has exceeded
 * either the hourly or daily quota for high-cost routes (parse / evaluate).
 * Counts only successful invocations of the matching route.
 */
export async function enforceRateLimit(
  ownerId: string,
  route: string,
): Promise<void> {
  const db = adminDb();
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // We have a (ownerId, createdAt) composite index already; filter route +
  // status in memory rather than adding a 4-field index just for quotas.
  const snap = await db
    .collection(COL.usageLogs)
    .where('ownerId', '==', ownerId)
    .where('createdAt', '>=', dayAgo)
    .orderBy('createdAt', 'desc')
    .get();

  let hourlyCount = 0;
  let dailyCount = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as UsageLogDoc;
    if (data.route !== route || data.status !== 'ok') continue;
    dailyCount++;
    if ((data.createdAt ?? '') >= hourAgo) hourlyCount++;
  }

  if (hourlyCount >= RATE_LIMIT_PER_HOUR) {
    const e = new Error(
      `Đã chạm giới hạn ${RATE_LIMIT_PER_HOUR} lượt/giờ cho thao tác này. Hãy thử lại sau.`,
    );
    (e as Error & { code: string }).code = 'RATE_LIMITED';
    throw e;
  }
  if (dailyCount >= RATE_LIMIT_PER_DAY) {
    const e = new Error(
      `Đã chạm giới hạn ${RATE_LIMIT_PER_DAY} lượt/ngày cho thao tác này. Vui lòng quay lại ngày mai.`,
    );
    (e as Error & { code: string }).code = 'RATE_LIMITED';
    throw e;
  }
}
