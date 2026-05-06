// App-wide constants. Tweak via env where possible.

export const APP_NAME = 'AI Đánh giá Giáo trình Đại học';
export const APP_TAGLINE = 'Chấm – Phân tích chương – Gợi ý chỉnh sửa – Lưu trữ';

// Firestore collection names. Centralised so route handlers and rules stay in sync.
export const COL = {
  textbooks: 'textbooks',
  chunks: 'chunks',
  evaluations: 'evaluations',
  revisions: 'revisions',
  usageLogs: 'usage_logs',
} as const;

// Session cookie used for auth. Value is a Firebase session cookie minted by
// firebase-admin/auth.createSessionCookie().
export const SESSION_COOKIE = '__session';
// 14 days, the max session cookie lifetime allowed by Firebase Admin.
export const SESSION_COOKIE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

// Rate limiting (giáo trình tốn token nhiều — siết kỹ hơn DGDCHP2).
// Both can be overridden via env to make ops easier.
export const RATE_LIMIT_PER_HOUR = Number(
  process.env.RATE_LIMIT_PER_HOUR ?? 3,
);
export const RATE_LIMIT_PER_DAY = Number(
  process.env.RATE_LIMIT_PER_DAY ?? 10,
);

// Upload constraints.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
export const ALLOWED_EXTENSIONS = ['.docx', '.pdf', '.txt', '.md'] as const;

// Chunking heuristics — used by lib/chunker.ts (feature b).
export const TARGET_CHUNK_TOKENS = 10_000;
export const MAX_CHUNK_TOKENS = 14_000;
export const CHUNK_CONCURRENCY = 3;
