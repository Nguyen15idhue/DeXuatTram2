# 08. Session Orchestrator Runbook — cách chạy 1 parent + 2 child

> **Người viết:** ORCH · **Trạng thái:** `DRAFT` (cùng seal C0)
> Mục tiêu: biến kiến trúc `ORCH → W-A ∥ W-B → REV → issue loop` (69 §A.7–A.10) thành thao tác hằng ngày.
> Model: **ORCH/REV = `gpt-5.6-luna`** · **W-A/W-B = `mimo-v2.6-flash-free`** (hoặc model yếu khác) — slot, không hard-code.

---

## 1. Khởi động

### Phương án 1 — OpenCode subagent (khuyên dùng)

```text
Session cha (mở 1 lần, giữ context suốt dự án)
  model: gpt-5.6-luna
  role: ORCH + REV
  context: AGENTS.md · 68 · 69 · 70 · docs/8/mkt/00-08

Child A — spawn qua task/subagent, model mimo-v2.6-flash-free, phạm vi backend/
Child B — spawn qua task/subagent, model mimo-v2.6-flash-free, phạm vi frontend/
```

### Phương án 2 — 2 tab/session riêng (nếu không dùng subagent)

- Mở 2 tab OpenCode cùng repo; tab nào cũng chỉ được sửa file trong ownership.
- ORCH giao việc bằng **task card** (mẫu §2) — dán vào đầu session worker.
- Worker trả **work report** (mẫu §3) — ORCH paste vào file 70.

**Mọi đường truyền đi qua ORCH.** Worker không đọc file của worker kia, không sửa contract, không tự qua checkpoint.

---

## 2. Task card mẫu (ORCH → Worker)

```markdown
# TASK CARD — bước {số bước} (sprint S{n})

## Bạn là: {W-A | W-B}
- Phạm vi file ĐƯỢC sửa: {liệt kê theo 69 §A.4}
- File CẤM sửa (thuộc worker khác/ORCH): {liệt kê}
- Contract BẮT BUỘC đọc trước: docs/8/mkt/{0x}-*.md (trạng thái SEALED/DRAFT)

## Yêu cầu
{chép nguyên "Chi tiết yêu cầu" của bước trong docs/8/69}

## Checklist test (tự chạy trước khi báo cáo)
{chép nguyên "Checklist test" của bước trong docs/8/69}

## Quy tắc
- Không sửa contract · không sửa file ngoài phạm vi · không commit.
- Chạy đúng lệnh theo AGENTS.md (PowerShell UTF-8, docker exec nếu cần).
- Trả work report theo mẫu docs/8/mkt/08 §3 — đủ 4 mục, không trả lời chung chung.
```

---

## 3. Work report mẫu (Worker → ORCH)

```markdown
# WORK REPORT — bước {số}

- Files đã sửa/tạo: {đường dẫn + 1 dòng mô tả}   ← ORCH ghi y vào 70
- Test: {từng dòng checklist} → PASS / FAIL / BLOCKED (kèm log ngắn)
- Build: backend start OK? frontend build OK? (nếu liên quan)
- Issues phát hiện: {bug nằm ngoài phạm vi, cần ORCH quyết} hoặc "không"
- Câu hỏi / xin mở rộng phạm vi: {...} hoặc "không"
```

---

## 4. Checklist review của ORCH/REV (mẫu §A.10 — chạy trước mỗi checkpoint)

- [ ] `git diff` từng file: logic đúng contract? duplicate? error handling? security (scope/IDOR/PII)?
- [ ] Integration: route FE ↔ API khớp `03-api-contract`? permission khớp `04`? migration khớp `02`?
- [ ] Regression: feature cũ trong scope bước còn chạy? `npm run build` + backend start?
- [ ] Ownership: không có file nào lọt ra ngoài ownership của worker báo cáo?
- [ ] File 70 đã được worker điền đúng phần của bước (files + test results)?

**FAIL → tạo Issue** (bảng 69 §A.10 + bản sao 70): ghi `# / CP hoặc bước / mô tả / P0-P1-P2 / worker nhận / OPEN`.

**Issue loop:** worker sở hữu fix → work report "FIX" → REV re-review → `PASS` (đổi trạng thái) hoặc vòng lại. P0/P1 → block sprint. P2 → ghi backlog, không block.

---

## 5. Nguyên tắc của ORCH (không ôm code)

| Làm | Không làm |
|---|---|
| Đọc yêu cầu, chia module, chốt ownership | Tự code mọi thứ (chỉ code 1.1, 5.2, 5.3, 9.1) |
| Viết/duy trì contract, seal khi đủ | Viết code worker rồi tự review lòng vòng không checklist |
| Giao task card đủ ngữ cảnh | Giao "làm help page giúp" thiếu contract/checklist |
| Theo dõi 2 worker, resolve tranh chấp file | Cho 2 worker sửa cùng 1 file |
| Review diff theo checklist, tạo issue | Bỏ qua regression/build |
| Integrate + cập nhật 70 + mở checkpoint | Đẩy sang sprint mới khi checkpoint chưa PASS |

**Stop conditions (gọi HUMAN):** 30 câu ở `00-business-decisions.md` chưa chốt mà worker hỏi lại · C0/C4/C6 fail · muốn đổi model slot giữa chừng · muốn đổi contract đã SEALED.

---

## 6. Trạng thái dự án (cập nhật khi chạy)

| Sprint | Đang chạy | Task card đã giao | Report chờ review | Checkpoint |
|---|---|---|---|---|
| S1 | ⬜ chưa bắt đầu | | | C0 ⬜ |
| S2 | ⬜ | | | C1 ⬜ |
| S3 | ⬜ | | | C2 ⬜ |
| S4 | ⬜ | | | C3 ⬜ |
| S5 | ⬜ | | | C4 ⬜ |
| S6 | ⬜ | | | C5 ⬜ |
| S7 | ⬜ | | | C6 ⬜ |
