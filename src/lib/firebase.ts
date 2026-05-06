// Client-side Firebase singletons. Only used in `'use client'` components and
// MUST NOT pull in firebase-admin (different package, server-only).

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  Auth,
  setPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let _appCheckReady = false;

export function clientApp(): FirebaseApp {
  if (_app) return _app;
  _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  // Lazy App Check initialisation. We don't await it because the SDK's API is
  // fire-and-forget and we never want a missing site key to block sign-in.
  if (!_appCheckReady && typeof window !== 'undefined') {
    _appCheckReady = true;
    void initAppCheck(_app);
  }
  return _app;
}

async function initAppCheck(app: FirebaseApp) {
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  if (!siteKey) return;
  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import(
      'firebase/app-check'
    );
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // App Check is best-effort on the client; never crash sign-in if it fails.
    console.warn('App Check init failed', e);
  }
}

export function clientAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(clientApp());
  // We persist auth via the server-issued session cookie, not the JS SDK,
  // so there's no need for the SDK to keep the user signed-in after the tab
  // closes. inMemoryPersistence keeps the front-end and the cookie aligned.
  void setPersistence(_auth, inMemoryPersistence);
  return _auth;
}

export function googleProvider(): GoogleAuthProvider {
  const p = new GoogleAuthProvider();
  // Ask Google to always show the account chooser; nicer UX than a sticky
  // session that quietly signs the wrong person back in.
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}

export function clientDb(): Firestore {
  if (!_db) _db = getFirestore(clientApp());
  return _db;
}

export function clientStorage(): FirebaseStorage {
  if (!_storage) _storage = getStorage(clientApp());
  return _storage;
}
