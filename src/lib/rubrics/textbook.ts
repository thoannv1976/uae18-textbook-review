// 8 tiêu chí đánh giá giáo trình đại học. Mỗi tiêu chí cho điểm 0..10; điểm
// tổng quát của giáo trình là trung bình có trọng số (sum(weights) === 1).
//
// Số liệu trọng số bám theo yêu cầu nghiệp vụ — đừng tự tinh chỉnh trong code,
// nếu cần đổi hãy bàn với người phụ trách rubric trước.

export type CriterionId =
  | 'structure'
  | 'objectives'
  | 'content'
  | 'pedagogy'
  | 'visuals'
  | 'references'
  | 'language'
  | 'compliance';

export interface Criterion {
  id: CriterionId;
  name: string;
  weight: number; // 0..1
  description: string;
  checkpoints: string[]; // dùng để build prompt + hiển thị tooltip
}

export const TEXTBOOK_CRITERIA: Criterion[] = [
  {
    id: 'structure',
    name: 'Cấu trúc và bố cục',
    weight: 0.10,
    description: 'Mục lục, phân chương, đánh số trang/hình/bảng và các thành phần đầu cuối.',
    checkpoints: [
      'Mục lục đầy đủ, logic',
      'Phân chương hợp lý, độ dài cân đối',
      'Đánh số trang, hình, bảng nhất quán',
      'Có lời nói đầu, mục lục, danh mục viết tắt, tài liệu tham khảo, phụ lục',
    ],
  },
  {
    id: 'objectives',
    name: 'Mục tiêu và chuẩn đầu ra',
    weight: 0.10,
    description: 'Mục tiêu giáo trình rõ ràng, đo lường được và liên kết với CLO/PLO của học phần.',
    checkpoints: [
      'Mục tiêu giáo trình rõ ràng, đo lường được',
      'Liên kết với chuẩn đầu ra học phần (CLO/PLO)',
      'Phù hợp đối tượng sinh viên (năm thứ mấy, ngành nào)',
    ],
  },
  {
    id: 'content',
    name: 'Nội dung học thuật',
    weight: 0.20,
    description: 'Tính đầy đủ, chính xác, cập nhật, độ sâu phù hợp và cân bằng lý thuyết – thực hành.',
    checkpoints: [
      'Đầy đủ, chính xác, cập nhật (5 năm gần đây)',
      'Độ sâu phù hợp trình độ sinh viên',
      'Cân bằng lý thuyết và thực hành/ví dụ',
      'Không có lỗi sai về kiến thức',
    ],
  },
  {
    id: 'pedagogy',
    name: 'Phương pháp sư phạm',
    weight: 0.15,
    description: 'Ví dụ minh hoạ, bài tập, key takeaways, active/problem-based learning.',
    checkpoints: [
      'Có ví dụ minh hoạ, case study',
      'Có bài tập, câu hỏi ôn tập cuối chương',
      'Hỗ trợ tự học (key takeaways, summary)',
      'Áp dụng nguyên lý active learning, problem-based learning',
    ],
  },
  {
    id: 'visuals',
    name: 'Hình ảnh, biểu đồ, bảng biểu',
    weight: 0.10,
    description: 'Chất lượng và sự đa dạng của trực quan, vị trí và trích nguồn.',
    checkpoints: [
      'Chất lượng cao, rõ nét, có chú thích',
      'Đặt đúng vị trí so với nội dung',
      'Trích nguồn nếu copy từ source khác',
      'Đa dạng (không chỉ text dày đặc)',
    ],
  },
  {
    id: 'references',
    name: 'Tài liệu tham khảo',
    weight: 0.10,
    description: 'Đa dạng, cập nhật, đúng format citation và tỷ lệ tài liệu tiếng Anh hợp lý.',
    checkpoints: [
      'Đa dạng nguồn (sách, paper, online)',
      'Cập nhật (ưu tiên 5 năm gần)',
      'Citation đúng format (APA/IEEE/Vancouver)',
      'Tỷ lệ tài liệu tiếng Anh hợp lý cho ngành',
    ],
  },
  {
    id: 'language',
    name: 'Ngôn ngữ và trình bày',
    weight: 0.15,
    description: 'Văn phong sư phạm, thuật ngữ chuẩn, trình bày chuyên nghiệp.',
    checkpoints: [
      'Văn phong sư phạm, dễ hiểu',
      'Thuật ngữ chuyên ngành chuẩn, có giải thích lần đầu xuất hiện',
      'Lỗi chính tả, ngữ pháp tối thiểu',
      'Hình thức trình bày chuyên nghiệp (font, spacing, heading)',
    ],
  },
  {
    id: 'compliance',
    name: 'Đáp ứng quy định Bộ GD-ĐT',
    weight: 0.10,
    description: 'Phù hợp TT 35/2021/TT-BGDĐT; thông tin xuất bản đầy đủ; không đạo văn.',
    checkpoints: [
      'Đủ số tín chỉ tương đương theo TT số 35/2021/TT-BGDĐT',
      'Có thông tin tác giả, đơn vị xuất bản, năm',
      'ISBN nếu xuất bản chính thức',
      'Tránh đạo văn (cảnh báo nếu phát hiện đoạn copy nhiều)',
    ],
  },
];

// Sanity check the weight sum at module load. Throws on import if rubric
// drifts away from a unit-sum.
const _weightSum = TEXTBOOK_CRITERIA.reduce((s, c) => s + c.weight, 0);
if (Math.abs(_weightSum - 1) > 1e-6) {
  throw new Error(
    `TEXTBOOK_CRITERIA weights must sum to 1; got ${_weightSum.toFixed(4)}`,
  );
}

export function getCriterion(id: CriterionId): Criterion {
  const c = TEXTBOOK_CRITERIA.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown criterion: ${id}`);
  return c;
}

export const CRITERION_IDS: CriterionId[] = TEXTBOOK_CRITERIA.map((c) => c.id);
