import 'server-only';
import {
  TARGET_CHUNK_TOKENS,
  MAX_CHUNK_TOKENS,
} from './constants';

export interface RawChunk {
  chapterIndex: number;
  chapterTitle: string;
  text: string;
  estimatedTokens: number;
}

// Heuristic: 1 token ≈ 4 characters for Vietnamese/English mixed text. Good
// enough to keep us inside Claude's window without pulling in a tokenizer.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Matches typical chapter headings in Vietnamese textbooks. Anchored at line
// start; case-insensitive. Examples:
//   "Chương 1: Giới thiệu"
//   "CHƯƠNG II - Nền tảng"
//   "Bài 3. Mạng máy tính"
//   "Chapter 4 — Pedagogy"
//   "Phần I"
const HEADING_RE =
  /^\s*(?:chương|chapter|bài|phần|part)\s+(?:[0-9]+|[ivxlcdm]+)\b[^\n]*$/im;

interface DetectedSection {
  title: string;
  text: string;
}

/**
 * Split full document text into chapter-sized sections. If chapter headings
 * are detected, sections align with them; otherwise the whole document is one
 * section that the size pass below will subdivide.
 */
function detectSections(fullText: string): DetectedSection[] {
  const lines = fullText.split('\n');
  const sections: DetectedSection[] = [];
  let current: DetectedSection | null = null;

  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      if (current) sections.push(current);
      current = { title: line.trim(), text: '' };
    } else if (current) {
      current.text += (current.text ? '\n' : '') + line;
    } else {
      // Pre-heading content goes into an implicit "front matter" section.
      if (line.trim()) {
        if (!sections.length || sections[0].title !== 'Phần đầu') {
          sections.unshift({ title: 'Phần đầu', text: line });
        } else {
          sections[0].text += '\n' + line;
        }
      }
    }
  }
  if (current) sections.push(current);

  // Drop empty sections (a heading immediately followed by another heading).
  return sections.filter((s) => s.text.trim().length > 0);
}

/**
 * Re-split an oversized section by paragraph so no chunk exceeds
 * MAX_CHUNK_TOKENS. We aim for TARGET_CHUNK_TOKENS per chunk.
 */
function splitOversized(section: DetectedSection): DetectedSection[] {
  if (estimateTokens(section.text) <= MAX_CHUNK_TOKENS) {
    return [section];
  }

  const paragraphs = section.text.split(/\n{2,}/);
  const out: DetectedSection[] = [];
  let buffer = '';
  let part = 1;

  const flush = () => {
    if (buffer.trim()) {
      out.push({
        title: out.length === 0 && part === 1
          ? section.title
          : `${section.title} (phần ${part})`,
        text: buffer.trim(),
      });
      part++;
      buffer = '';
    }
  };

  for (const p of paragraphs) {
    const candidate = buffer ? buffer + '\n\n' + p : p;
    if (estimateTokens(candidate) > TARGET_CHUNK_TOKENS && buffer) {
      flush();
      buffer = p;
    } else {
      buffer = candidate;
    }
    // Hard cap: a single paragraph blowing past MAX_CHUNK_TOKENS gets
    // sliced by character count as a last resort.
    if (estimateTokens(buffer) > MAX_CHUNK_TOKENS) {
      const chars = MAX_CHUNK_TOKENS * 4;
      out.push({
        title: out.length === 0 && part === 1
          ? section.title
          : `${section.title} (phần ${part})`,
        text: buffer.slice(0, chars),
      });
      buffer = buffer.slice(chars);
      part++;
    }
  }
  flush();
  return out;
}

export function chunkDocument(fullText: string): RawChunk[] {
  const text = fullText.trim();
  if (!text) return [];

  let sections = detectSections(text);
  if (sections.length === 0) {
    sections = [{ title: 'Toàn bộ tài liệu', text }];
  }

  const sized = sections.flatMap(splitOversized);

  // chapterIndex is the position in the final ordered list; chapterTitle
  // preserves the original heading text (e.g. "Chương 3: ...") so the user
  // can still see the document's own numbering.
  return sized.map((s, i) => ({
    chapterIndex: i + 1,
    chapterTitle: s.title,
    text: s.text,
    estimatedTokens: estimateTokens(s.text),
  }));
}
