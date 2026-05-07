import 'server-only';
import { TEXTBOOK_CRITERIA } from './rubrics/textbook';
import type { TextbookDoc, ChunkDoc } from './types';

/**
 * System prompt is large, criteria-heavy, and identical for every chunk in a
 * textbook. Sending it as a cacheable block lets us pay the input-token cost
 * once and reuse it for the rest of the chapters in the same evaluation run.
 */
export function buildSystemPrompt(): string {
  const criteriaBlock = TEXTBOOK_CRITERIA.map((c, i) => {
    const cps = c.checkpoints.map((cp) => `   - ${cp}`).join('\n');
    return `${i + 1}. ${c.id} (${c.name}) — trọng số ${(c.weight * 100).toFixed(0)}%
   Mô tả: ${c.description}
   Checkpoint:
${cps}`;
  }).join('\n\n');

  return `Bạn là chuyên gia tư vấn giáo dục đại học, có nhiệm vụ đánh giá chất lượng giáo trình theo 8 tiêu chí của Bộ GD-ĐT Việt Nam (theo TT 35/2021/TT-BGDĐT).

8 TIÊU CHÍ ĐÁNH GIÁ:

${criteriaBlock}

QUY TẮC CHẤM:
- Mỗi tiêu chí cho điểm 0–10 (số nguyên hoặc 1 chữ số thập phân).
- Phải đủ 8 tiêu chí trong mảng "scores", đúng "criterionId" như trên.
- Với chương riêng lẻ, một số tiêu chí (vd: structure cấp toàn sách, references) chỉ thấy 1 phần. Khi đó cho điểm trung bình (5–7) và note rõ "không đánh giá được đầy đủ ở chương này".
- "note" 1–2 câu tiếng Việt giải thích lý do điểm đó.
- "evidence" là 1–3 trích đoạn ngắn (≤30 từ) từ chương minh chứng đánh giá.
- "suggestions" là 1–3 gợi ý chỉnh sửa cụ thể, có thể hành động được.
- "summary" là 1–2 câu tóm tắt nội dung chương.

OUTPUT:
- CHỈ trả về JSON, không có prose hay markdown fence.
- Format chính xác:
{
  "summary": "...",
  "scores": [
    {"criterionId": "structure", "score": 7, "note": "..."},
    {"criterionId": "objectives", "score": 8, "note": "..."},
    {"criterionId": "content", "score": 7, "note": "..."},
    {"criterionId": "pedagogy", "score": 6, "note": "..."},
    {"criterionId": "visuals", "score": 5, "note": "..."},
    {"criterionId": "references", "score": 6, "note": "..."},
    {"criterionId": "language", "score": 8, "note": "..."},
    {"criterionId": "compliance", "score": 7, "note": "..."}
  ],
  "evidence": ["...", "..."],
  "suggestions": ["...", "..."]
}`;
}

export function buildChunkUserPrompt(
  textbook: TextbookDoc,
  chunk: ChunkDoc,
): string {
  const meta = [
    `Sách: ${textbook.title}`,
    textbook.authors && `Tác giả: ${textbook.authors}`,
    textbook.subject && `Môn học: ${textbook.subject}`,
    textbook.audience && `Đối tượng: ${textbook.audience}`,
    textbook.publishedYear && `Năm xuất bản: ${textbook.publishedYear}`,
  ]
    .filter(Boolean)
    .join('\n');

  const pages =
    chunk.startPage != null
      ? chunk.endPage && chunk.endPage !== chunk.startPage
        ? ` (Trang ${chunk.startPage}–${chunk.endPage})`
        : ` (Trang ${chunk.startPage})`
      : '';

  return `${meta}

CHƯƠNG ĐANG ĐÁNH GIÁ: ${chunk.chapterTitle}${pages}

NỘI DUNG CHƯƠNG:
---
${chunk.text}
---

Hãy chấm điểm chương này theo 8 tiêu chí. Trả về JSON đúng format đã hướng dẫn (KHÔNG kèm prose hay markdown fence).`;
}
