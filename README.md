# UAE18 Textbook Review

Ứng dụng web đánh giá giáo trình đại học bằng AI (Claude). Tách giáo trình dài
thành các chunk theo chương, đánh giá từng chương, rồi tổng hợp thành báo
cáo điểm 8 tiêu chí kèm gợi ý chỉnh sửa.

> Trạng thái hiện tại: **scaffold + feature (a) — Auth + layout + danh sách**.
> Các feature kế tiếp (upload, chunking, evaluate, export...) sẽ build sau
> khi anh test xong feature (a) trên localhost.

## Stack

- Next.js 14 App Router (TypeScript strict, Server Components ưu tiên)
- Firebase: Auth (Google) + Firestore + Storage + App Hosting
- Anthropic Claude (`claude-sonnet-4-6` mặc định)
- Tailwind CSS + utility classes (`btn-primary`, `card`, `score-pill`...)
- `mammoth` (DOCX), `pdf-parse` (PDF), `docx` + `pdfkit` (export)
- `zod` cho input validation, `p-limit` cho concurrency chunking

## Cấu hình lần đầu

### 1. Firebase Console (project `dggt-9fe0c`)

1. Thêm Web app → ghi lại `apiKey`, `messagingSenderId`, `appId`.
2. Authentication → Sign-in method → bật **Google**, set support email.
3. Authentication → Settings → Authorized domains → thêm `localhost` (mặc định
   đã có) và domain App Hosting sau này.
4. Firestore → tạo database (Native mode, region `asia-southeast1`).
5. Storage → tạo bucket mặc định `dggt-9fe0c.appspot.com` (region
   `asia-southeast1`).
6. (Tuỳ chọn) App Check → đăng ký reCAPTCHA v3 site key cho domain `localhost`
   và domain production, ghi vào `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`.

### 2. Service account cho admin SDK

Tạo service account JSON từ IAM → Service Accounts → Keys → Add key.
Hai cách dùng cho local dev:
- Dán nguyên JSON một dòng vào `FIREBASE_SERVICE_ACCOUNT_JSON` trong
  `.env.local` (cẩn thận escape `"`).
- Hoặc set `GOOGLE_APPLICATION_CREDENTIALS` trỏ đến file JSON trên đĩa.

### 3. Anthropic API key

Tạo key tại [console.anthropic.com](https://console.anthropic.com), gán vào
`ANTHROPIC_API_KEY`.

### 4. `.env.local`

Copy `.env.example` → `.env.local` rồi điền:

```bash
cp .env.example .env.local
# Mở .env.local và điền các giá trị Firebase + Anthropic
```

### 5. Firestore rules + indexes (production)

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project dggt-9fe0c
```

## Chạy dev

```bash
npm install
npm run dev
# Mở http://localhost:3000
```

Luồng test feature (a):
1. `/` redirect sang `/login` nếu chưa có cookie phiên.
2. `/login` → Đăng nhập với Google → pop-up Google → chọn account.
3. Quay về `/` → header hiển thị tên + ảnh avatar + nút Đăng xuất.
4. Danh sách giáo trình rỗng. Header có link `+ Giáo trình mới` → trang
   placeholder cho feature (b).
5. Bấm Đăng xuất → cookie bị xoá → redirect `/login`.

## Triển khai App Hosting

```bash
firebase apphosting:secrets:set ANTHROPIC_API_KEY
firebase apphosting:secrets:set FIREBASE_SERVICE_ACCOUNT_JSON
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_API_KEY
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_APP_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY

firebase apphosting:secrets:grantaccess ANTHROPIC_API_KEY --backend textbook-review
firebase apphosting:secrets:grantaccess FIREBASE_SERVICE_ACCOUNT_JSON --backend textbook-review
# ... các secret còn lại tương tự
```

## Cấu trúc thư mục

```
src/
├── app/
│   ├── layout.tsx          # header auth-aware, footer
│   ├── page.tsx            # danh sách textbook của owner hiện tại
│   ├── login/page.tsx      # Google sign-in
│   ├── new/page.tsx        # placeholder cho feature (b)
│   └── api/auth/session/   # POST mint, DELETE clear session cookie
├── components/             # SignOutButton, UserBadge (mở rộng dần)
└── lib/
    ├── auth.ts             # getCurrentUser / requireUser (server)
    ├── claude.ts           # SDK wrapper + describeClaudeError + extractJson
    ├── constants.ts        # tên collection, rate-limit, chunking budgets
    ├── firebase.ts         # client SDK + App Check
    ├── firebase-admin.ts   # admin SDK (Firestore, Auth, Storage)
    ├── repo.ts             # CRUD textbook (ownerId-scoped)
    ├── rubrics/textbook.ts # 8 tiêu chí + trọng số
    └── types.ts            # shared types
```

## Bảo mật

- Mọi đường ghi Firestore/Storage đi qua `firebase-admin` trên server. Client
  SDK chỉ dùng cho Auth.
- `firestore.rules` mặc định deny; có rule defense-in-depth theo `ownerId`.
- API key Anthropic chỉ tồn tại server-side qua Secret Manager — không bao giờ
  bundle vào client.
- Rate limit 3/giờ, 10/ngày kiểm qua `usage_logs` (sẽ gắn ở feature c/d).
- `usage_logs` chỉ lưu metadata (ownerId, route, tokens, latency) — KHÔNG lưu
  nội dung giáo trình.

## Roadmap

- [x] Scaffold + feature (a): Auth + layout + danh sách
- [ ] Feature (b): Upload + parse + chunking
- [ ] Feature (c): Evaluate per-chunk
- [ ] Feature (d): Aggregate evaluation + streaming progress
- [ ] Feature (e): Dashboard 3 tab (Tổng quan / Phân tích từng chương / Chi tiết tiêu chí)
- [ ] Feature (f): Tab Chỉnh sửa AI + revision
- [ ] Feature (g): Export DOCX/PDF
- [ ] Feature (h): CI workflow đầy đủ
