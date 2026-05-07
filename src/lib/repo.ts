import 'server-only';
import { adminBucket, adminDb } from './firebase-admin';
import { COL } from './constants';
import type { TextbookDoc, Evaluation, ChunkDoc } from './types';

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

// ---- evaluations (used in feature c/d, exported now so types compile) ----

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
