// Shared types. The server-side route handlers and the React components both
// import from here so the schema stays in one place.

import type { CriterionId } from './rubrics/textbook';

export interface AuthUser {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

export interface TextbookDoc {
  id?: string;
  ownerId: string;
  title: string;
  authors?: string;
  subject?: string; // môn học
  audience?: string; // đối tượng (năm thứ mấy, ngành nào)
  credits?: number;
  isbn?: string;
  publisher?: string;
  publishedYear?: number;
  fileRef?: string; // gs://... path in Cloud Storage
  originalFileName?: string;
  totalPages?: number;
  chapterCount?: number;
  status?: 'uploaded' | 'parsed' | 'evaluating' | 'evaluated' | 'failed';
  latestEvaluationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// One parsed chapter / sub-chapter section. Stored separately so we never have
// to re-send full textbook text for aggregate calls.
export interface ChunkDoc {
  id?: string;
  textbookId: string;
  ownerId: string;
  chapterIndex: number;
  chapterTitle: string;
  startPage?: number;
  endPage?: number;
  text: string;
  // Filled in by the per-chunk Claude pass.
  summary?: string;
  partialEval?: ChunkPartialEval;
  evidence?: string[];
  suggestions?: string[];
  evaluatedAt?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChunkPartialEval {
  // Score 0-10 per criterion as observed inside this chapter.
  scores: { criterionId: CriterionId; score: number; note: string }[];
}

export interface CriterionEvaluation {
  criterionId: CriterionId;
  criterionText: string;
  weight: number; // 0..1, sum of weights = 1
  score: number; // 0..10
  comment: string;
  evidence: string[]; // short quotes / citations
  suggestions: string[];
}

export interface ChapterEvaluation {
  chapterIndex: number;
  chapterTitle: string;
  score: number; // 0..10 weighted average for this chapter
  comment: string;
}

export interface Evaluation {
  id?: string;
  textbookId: string;
  ownerId: string;
  overallScore: number; // 0..10 weighted across criteria
  criteria: CriterionEvaluation[];
  chapterScores: ChapterEvaluation[];
  topSuggestions: string[];
  model: string;
  totalTokensIn?: number;
  totalTokensOut?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RevisionDoc {
  id?: string;
  textbookId: string;
  ownerId: string;
  evaluationId: string;
  // Per-section before/after snippets the user can accept or reject.
  sections: {
    chapterIndex: number;
    chapterTitle: string;
    issue: string; // what the AI thinks is wrong
    before: string;
    after: string;
    accepted?: boolean;
  }[];
  changeLog: string[];
  userInstructions?: string;
  model: string;
  createdAt?: string;
}

export interface UsageLogDoc {
  id?: string;
  ownerId: string;
  route: string;
  textbookId?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd?: number;
  latencyMs: number;
  status: 'ok' | 'error';
  errorCode?: string;
  createdAt?: string;
}
