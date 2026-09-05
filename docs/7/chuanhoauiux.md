Kế hoạch nhanh: khoảng 1–3 ngày
🎯 Mục tiêu

Không đụng:

Backend
API
Database
Business logic
Routing
State management nếu đang chạy ổn
Logic form hiện tại

Chỉ tập trung:

🎨 Theme
🧩 Component UI
📐 Layout
📱 Responsive
🔄 Component dùng chung
Phase 0 — Backup trước

15–30 phút

Tạo branch:

git checkout -b ui-redesign

Nếu có vấn đề:

git checkout main

Quay lại được ngay.

Phase 1 — Cài Tailwind + shadcn

⏱️ 30–60 phút

Nếu project hiện tại đã có Tailwind thì càng nhanh.

Cài/init shadcn:

npx shadcn@latest init

Sau đó chỉ cài những component thực sự cần:

npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add select
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add table
npx shadcn@latest add badge
npx shadcn@latest add tooltip
npx shadcn@latest add separator
npx shadcn@latest add skeleton

Không cần cài 50 component.

Phase 2 — Làm Theme trước

⏱️ 1–2 giờ

Đây là bước đáng tiền nhất.

Hiện tại bạn đang bị:

gradient xanh tím + màu AI + nhiều màu linh tinh.

Thay vì sửa từng page, đặt một bộ màu chung.

Ví dụ phong cách:

Background      #f8fafc
Card             #ffffff
Primary          xanh đậm
Text             xám đậm
Muted            xám
Border           xám nhạt
Success          xanh
Warning          vàng
Danger           đỏ

Và quy định:

❌ Không gradient
❌ Không neon
❌ Không glassmorphism
❌ Không emoji làm icon
❌ Không màu tự phát

Sau đó các component dùng semantic token:

<Button>

thay vì:

<button className="bg-gradient-to-r from-blue-500 to-purple-500 ...">
Kết quả

Chỉ cần thay theme một lần, cả hệ thống thay đổi theo.

Phase 3 — Chuẩn hóa 8 component quan trọng nhất

⏱️ 2–4 giờ

Không cần refactor toàn bộ.

Chỉ làm:

components/
├── ui/
│   ├── button.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── dialog.tsx
│   ├── table.tsx
│   ├── badge.tsx
│   └── ...
│
└── common/
    ├── PageHeader.tsx
    ├── DataTable.tsx
    ├── FilterBar.tsx
    ├── ImportExcelDialog.tsx
    └── ConfirmDialog.tsx
Ưu tiên:

1. Button

Toàn hệ thống chỉ còn:

Primary
Secondary
Outline
Destructive
Ghost

2. Dialog

Tất cả popup dùng một style.

3. Input / Select

Tất cả form dùng cùng style.

4. Badge

Ví dụ:

Active      → Badge
Inactive    → Badge
Pending     → Badge
Error       → Badge

5. PageHeader

Tất cả page:

┌──────────────────────────────────────────┐
│ Stations                                 │
│ Quản lý danh sách trạm                   │
│                                          │
│                         [+ Thêm] [Import]│
└──────────────────────────────────────────┘

6. DataTable

Tất cả bảng có cùng:

header
row height
border
hover
pagination
loading
empty state

7. FilterBar

Tất cả:

[Search] [Status] [Location] [Filter]

cùng một style.

8. ImportExcelDialog

Cái này mình ưu tiên đặc biệt cho bạn.

Tất cả Excel Import → một component duy nhất.

Phase 4 — Responsive

⏱️ 3–6 giờ

Đừng cố sửa responsive 10.000 dòng cùng lúc.

Chọn 3 page quan trọng nhất.

Ví dụ:

Dashboard
Stations
Station Detail

Làm mẫu thật tốt.

Desktop
Sidebar | Content
Tablet
Sidebar nhỏ | Content
Mobile
☰ Header
────────────
Content

Sau khi tìm được pattern → AI áp dụng pattern đó cho các page còn lại.

Phase 5 — Refactor các page nhưng chỉ thay UI

⏱️ 4–8 giờ

Đây là chỗ tiết kiệm thời gian.

Không yêu cầu AI:

"Rewrite page."

Mà:

"Giữ nguyên toàn bộ business logic, API calls, state, event handlers. Chỉ thay presentation layer bằng các component trong design system."

Ví dụ:

❌ Không đụng

useEffect
useState
API
fetch
axios
validation
submit
delete
pagination logic

Chỉ thay:

<div>
<button>
<input>
<table>
modal
card

bằng:

<Card>
<Button>
<Input>
<DataTable>
<Dialog>
Phase 6 — Dọn "AI smell"

⏱️ 2–4 giờ

Đây là bước làm giao diện nhìn bớt AI nhất.

Tìm toàn bộ:

gradient
from-blue
to-purple
bg-indigo
shadow-xl
rounded-3xl
glass
backdrop-blur
sparkles
✨
🤖

và xem xét loại bỏ.

Đặc biệt:

❌
bg-gradient-to-r from-blue-500 to-purple-600
❌
rounded-3xl shadow-2xl
❌
💫 AI-powered
✅
bg-primary
border
rounded-md
shadow-sm

Giao diện quản trị chuyên nghiệp thường không cần cố gắng chứng minh rằng nó "hiện đại" 😄.

Tổng thời gian

Nếu codebase tương đối sạch:

Phase	Thời gian
Backup	0.5h
Tailwind + shadcn	0.5–1h
Theme	1–2h
8 component chính	2–4h
Responsive mẫu	3–6h
Refactor page	4–8h
Dọn AI style	2–4h
Tổng	13–25 giờ

Tức khoảng:

🚀 2–3 ngày làm khá tập trung

hoặc

🐢 4–5 ngày làm thoải mái.
Nhưng mình sẽ cắt tiếp nếu muốn "siêu nhanh"

Nếu bạn nói:

"Tôi chỉ có 1 ngày."

Thì làm đúng 5 thứ:

1. shadcn
       ↓
2. Theme
       ↓
3. Button / Input / Dialog / Table
       ↓
4. ImportExcelDialog dùng chung
       ↓
5. Responsive layout

Khoảng 6–10 giờ.

Không refactor toàn bộ 10k dòng.

⭐ Thứ tự ưu tiên mình khuyên

Nếu chấm theo hiệu quả / thời gian:

Việc	Hiệu quả
🎨 Theme	⭐⭐⭐⭐⭐
📥 Chuẩn hóa Excel Import	⭐⭐⭐⭐⭐
🔘 Button	⭐⭐⭐⭐⭐
🪟 Dialog	⭐⭐⭐⭐⭐
📋 Table	⭐⭐⭐⭐⭐
📱 Responsive	⭐⭐⭐⭐⭐
📐 Page layout	⭐⭐⭐⭐
🧹 Dọn gradient/AI style	⭐⭐⭐⭐
Refactor toàn bộ component	⭐⭐
Rewrite frontend	❌
Và đặc biệt: đừng bắt AI sửa 10k dòng trong một prompt

Với OpenCode, mình sẽ chia thành các task rất nhỏ:

TASK 1
Audit frontend
→ Không sửa code

TASK 2
Install shadcn + Tailwind
→ Không sửa business logic

TASK 3
Create design system
→ Không sửa page

TASK 4
Create common components
→ Không sửa API

TASK 5
Refactor Page A
→ chỉ UI

TASK 6
Refactor Page B
→ chỉ UI

TASK 7
Responsive

TASK 8
Visual audit

Như vậy rủi ro AI phá code thấp hơn rất nhiều.

Một nguyên tắc mình đặc biệt khuyên bạn đặt vào AGENTS.md
UI REFACTOR RULES

- Do not modify backend.
- Do not modify API contracts.
- Do not modify business logic.
- Do not modify database logic.
- Do not modify existing state management.
- Do not change routes.
- Reuse existing components whenever possible.
- Do not create duplicate UI components.
- Use shadcn/ui components.
- Use Tailwind CSS.
- Use Lucide icons.
- No gradients.
- No glassmorphism.
- No AI-style visual effects.
- All Excel imports must use ImportExcelDialog.
- All tables must use DataTable.
- All pages must use PageHeader.
- All UI must be responsive.
- Keep changes minimal.