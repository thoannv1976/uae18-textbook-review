import 'server-only';
import { adminDb } from './firebase-admin';
import { COL } from './constants';
import type { TextbookDoc, Evaluation } from './types';

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
