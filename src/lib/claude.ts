import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

// Keep below the App Hosting timeout (540s in apphosting.yaml) so the SDK
// gives up cleanly with a real error before the platform kills the socket.
// Per-request budget of 240s leaves room for chunked retries inside one HTTP
// turn.
const REQUEST_TIMEOUT_MS = 240_000;
const MAX_RETRIES = 1;

export function claude(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');
  _client = new Anthropic({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });
  return _client;
}

export const CLAUDE_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

/**
 * Translate raw Anthropic SDK errors into a Vietnamese, user-facing message.
 * Mirrors the DGDCHP2 helper because the failure modes haven't changed.
 */
export function describeClaudeError(e: unknown): string {
  const err = e as { name?: string; status?: number; message?: string };
  const name = err?.name || '';
  const status = err?.status;
  const msg = err?.message || '';

  if (name === 'APIConnectionTimeoutError' || /timeout/i.test(msg)) {
    return 'Anthropic API quá thời gian phản hồi. Vui lòng thử lại sau ít phút.';
  }
  if (name === 'APIConnectionError' || /connection error/i.test(msg)) {
    return 'Không kết nối được tới Anthropic API. Kiểm tra mạng/secret ANTHROPIC_API_KEY rồi thử lại.';
  }
  if (status === 401 || name === 'AuthenticationError') {
    return 'ANTHROPIC_API_KEY không hợp lệ hoặc đã hết hạn.';
  }
  if (status === 404 || name === 'NotFoundError') {
    return `Mô hình "${CLAUDE_MODEL}" không tồn tại hoặc tài khoản chưa được cấp quyền.`;
  }
  if (status === 429 || name === 'RateLimitError') {
    return 'Anthropic API đang giới hạn tốc độ. Vui lòng thử lại sau ít phút.';
  }
  if (status && status >= 500) {
    return 'Anthropic API đang gặp sự cố. Vui lòng thử lại sau ít phút.';
  }
  if (status === 400 || name === 'BadRequestError') {
    return `Yêu cầu Anthropic API không hợp lệ: ${extractApiErrorMessage(msg)}`;
  }
  return msg || 'Lỗi không xác định khi gọi Anthropic API.';
}

function extractApiErrorMessage(msg: string): string {
  const braceAt = msg.indexOf('{');
  if (braceAt < 0) return msg;
  try {
    const parsed = JSON.parse(msg.slice(braceAt));
    return parsed?.error?.message || msg;
  } catch {
    return msg;
  }
}

/**
 * Extract the first balanced JSON object/array from a string. Tolerant to
 * surrounding prose and ```json fences.
 */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.search(/[\[{]/);
  if (start < 0) throw new Error('No JSON found in model output');

  let depth = 0;
  let inStr = false;
  let esc = false;
  const openCh = candidate[start];
  const closeCh = openCh === '{' ? '}' : ']';
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) {
        const raw = candidate.slice(start, i + 1);
        return JSON.parse(raw) as T;
      }
    }
  }
  throw new Error('Unbalanced JSON in model output');
}
