import 'server-only';
import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
  App,
} from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

let _app: App | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

function buildApp(): App {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApps()[0];
    return _app;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    const credentials = JSON.parse(saJson);
    _app = initializeApp({
      credential: cert(credentials),
      projectId,
      storageBucket: bucket,
    });
    return _app;
  }

  // GOOGLE_APPLICATION_CREDENTIALS or workload-identity (App Hosting / Cloud Run).
  _app = initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket: bucket,
  });
  return _app;
}

export function adminDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(buildApp());
  // Tolerate `undefined` fields in payloads; Firestore would otherwise reject.
  _db.settings({ ignoreUndefinedProperties: true });
  return _db;
}

export function adminAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(buildApp());
  return _auth;
}

export function adminBucket() {
  return getStorage(buildApp()).bucket();
}

export { FieldValue };
