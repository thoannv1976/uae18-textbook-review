import 'server-only';
import { ALLOWED_EXTENSIONS } from './constants';

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export interface ParsedDocument {
  text: string;
  pageCount?: number;
}

export function getExtension(filename: string): AllowedExtension | null {
  const lower = filename.toLowerCase();
  for (const ext of ALLOWED_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext;
  }
  return null;
}

export async function parseFile(
  buffer: Buffer,
  ext: AllowedExtension,
): Promise<ParsedDocument> {
  switch (ext) {
    case '.docx':
      return parseDocx(buffer);
    case '.pdf':
      return parsePdf(buffer);
    case '.txt':
    case '.md':
      return parseText(buffer);
  }
}

async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return { text: normalizeText(result.value) };
}

async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  // pdf-parse's index.js runs a debug harness when require.main === module,
  // which trips on Next's bundler. Importing the lib subpath avoids it.
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  const result = await mod.default(buffer);
  return {
    text: normalizeText(result.text),
    pageCount: result.numpages,
  };
}

async function parseText(buffer: Buffer): Promise<ParsedDocument> {
  return { text: normalizeText(buffer.toString('utf8')) };
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    // Collapse runs of >2 blank lines into exactly 2 (preserve paragraph breaks).
    .replace(/\n{3,}/g, '\n\n')
    // Trim trailing spaces on each line.
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
