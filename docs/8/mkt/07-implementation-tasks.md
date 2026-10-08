# 07. Implementation Tasks (bản đồ Sprint — WORKER đọc trước)

> **Người viết:** ORCH (`gpt-5.6-luna`, duy nhất được sửa) · **Seal:** C0 · **Trạng thái:** `DRAFT`
> **Đây là entry point của WORKER (W-A/W-B).** Không cần đọc 142K dòng code: đọc `AGENTS.md` + file này + contract liên quan (`00..06`) + runbook `08` + file code trong ownership của bạn.
> Chi tiết từng bước (requirement, checklist test, lưu ý): **`docs/8/69..._cacbuocthuchien.md`** — file này chỉ bản đồ lane/dependency.
> Cách nhận task card + trả work report: **`docs/8/mkt/08-session-orchestrator.md`**.

## 0. Quy tắc chạy (tóm tắt từ 69 §A.2)

1. Chia theo module, không theo %: **W-A = `backend/` + `database/`** · **W-B = `frontend/`**.
2. Contract chưa `SEALED` → không code domain đó.
3. Ownership chốt trước khi chạy song song — sửa file ngoài phạm vi = dừng, báo ORCH (69 §A.4).
4. Checkpoint `C*n` block merge tới khi PASS; ORCH/REV review, worker chỉ fix theo Issue.
5. Điền work report vào `docs/8/70` phần của bước (files + test results) trong session làm việc đó.

## 1. Sprint map (lane ORCH / W-A / W-B)

| Sprint | ORCH (`gpt-5.6-luna`) | W-A (backend/DB) | W-B (frontend) | Contract cần | CP |
|---|---|---|---|---|---|
| **S1** | 0.4 contracts 00–08 (+0.1 HUMAN) | 0.2, 0.3 | đọc AGENTS.md + 03/04 | — | **C0** |
| **S2** | 1.1 schema lõi + rà lifecycle (read-only) | 1.2–1.5, 2.1–2.3 | 7.1 scaffold (tùy chọn) | 02, 04 | **C1** |
| **S3** | spec 05, chuẩn bị 06 | 3.1(BE), 3.2, 3.3, 4.1–4.3 | 3.1(FE), 3.4, 7.1 | 02, 03, 04 | **C2** |
| **S4** | seal 05, spec 5.x | 6.1, 6.2 | 7.1–7.4 (mock contract 03) | 03, 04 | **C3** |
| **S5** | **5.2, 5.3** (tự code) + review 5.1 | 5.1 (code theo spec), 5.4, fix C1–C3 | 8.1 (mock event) | 05 | **C4** |
| **S6** | **9.1** reportService | 9.2, 10.1(BE), integration 7.4 | 8.2, 9.3, 10.1(FE) | 06 | **C5** |
| **S7** | review 10.2, **11.1**, final | 10.2(BE)+fix, hỗ trợ 11.2 | 10.2(FE)+fix | — | **C6** |

## 2. Step → lane → contract → dependency (38 bước)

| Bước | Lane | Contract | Blocked by | Output chính |
|---|---|---|---|---|
| 0.1 | HUMAN | — | — | 00-business-decisions |
| 0.2 | W-A | — | — | report worktree/migration |
| 0.3 | W-A | — | — | DB backup |
| 0.4 | ORCH | — | 0.1 | 01–08 |
| 1.1 | ORCH | 02 | 0.1, C0 | database/134 |
| 1.2 | W-A | 02 | 1.1 | indexes |
| 1.3 | ORCH spec → W-A | 02 | 1.1 | lead_assignments |
| 1.4 | ORCH spec → W-A | 02 | 1.1 | journey_activity_logs + alter proposals |
| 1.5 | W-A | 00, 02 | 0.1 | seed datalist/options |
| 2.1 | W-A | 04 | 0.1, C0 | role MKT |
| 2.2 | W-A | 04 | 2.1 | middleware |
| 2.3 | W-A | 04 | 2.2 | scope query |
| 3.1 | W-A ∥ W-B | 02 | 1.1 | allowlist leads (BE ∥ FE) |
| 3.2 | W-A | 02 | 1.5 | seed fields 3 section |
| 3.3 | W-A | 03 | 3.2 | seed form/view |
| 3.4 | W-B | — | 3.2 | DynamicForm NOW() |
| 4.1 | W-A | 03, 04 | 2.3 | leadService CRUD |
| 4.2 | W-A | 04 | 4.1, 1.3, 1.5 | assignment/routing |
| 4.3 | W-A | 03 | 1.4, 4.1 | journeyActivity + timeline API |
| 5.1 | ORCH spec → W-A | 03, 05 | 4.1, 4.3 | create-proposal orchestration |
| 5.2 | **ORCH** | 05 | 4.3 | proposalLifecycle hook |
| 5.3 | **ORCH** | 05, 00-câu13 | 5.2 | station hook + ON |
| 5.4 | W-A | 02 | 1.4, 5.1 | external refs |
| 6.1 | W-A (phần FE nhỏ → W-B) | 03 | 3.1, 4.1 | template/export |
| 6.2 | W-A | 03, 00-câu22 | 6.1 | import pipeline |
| 7.1 | W-B | 04 | 2.1 | route/auth/sidebar FE |
| 7.2 | W-B | 03 | 7.1, 4.1 | AdminLeadsPage |
| 7.3 | W-B | 02, 03 | 3.3, 4.1, 3.4 | popup adapter |
| 7.4 | W-B | 03 | 7.3 + **C4** (integration) | prefill flow |
| 8.1 | W-B | 03, 05 | 4.3 | ProcessTimeline |
| 8.2 | W-B | 05 | 8.1, 5.x | LeadJourneyPopup |
| 9.1 | **ORCH** | 06 | 5.2, 5.3 | reportService |
| 9.2 | W-A | 06 | 9.1 | report config API |
| 9.3 | W-B | 06 | 9.1, 7.1 | AdminReportsPage + recharts |
| 10.1 | W-A ∥ W-B | 03 | 4.3, 5.x | audit log (BE route ∥ FE tab) |
| 10.2 | W-A ∥ W-B | — | tất cả | regression report |
| 11.1 | ORCH | — | 10.2 | perf/security |
| 11.2 | HUMAN | — | C6 | deploy |

## 3. Song song thực sự (khi nào 2 worker cùng chạy)

```text
ORCH (gpt-5.6-luna)                W-A (mimo)                    W-B (mimo)
────────────────────                ────────────                  ────────────
S1: contracts 00-08        ◄──►    0.2, 0.3             ◄──►     đọc contract
S2: 1.1 + rà lifecycle     ◄──►    1.2-1.5, 2.1-2.3     ◄──►     7.1 scaffold
S3: spec 05 + 06           ◄──►    3.1BE, 3.2, 3.3, 4.x ◄──►     3.1FE, 3.4, 7.1
S4: seal 05, spec 5.x      ◄──►    6.1, 6.2             ◄──►     7.1-7.4 (mock)
S5: 5.2, 5.3 (code)        ◄──►    5.1, 5.4, fix        ◄──►     8.1
S6: 9.1                    ◄──►    9.2, 10.1BE, 7.4int  ◄──►     8.2, 9.3, 10.1FE
S7: 11.1 + review          ◄──►    10.2BE + fix          ◄──►     10.2FE + fix
```

- W-A ∥ W-B **chỉ chạy song song khi ownership khác nhau** (69 §A.4) và contract liên quan đã SEALED.
- Không có cặp nào cùng sửa 1 file — phát hiện tranh chấp → dừng, ghi Deviation vào `docs/8/70`, báo ORCH quyết.

## 4. Work report + Definition of Done (mỗi bước)

**Work report** (mẫu đầy đủ ở `08-session-orchestrator.md` §3): files đã sửa · test results từng dòng checklist · build OK? · issues/câu hỏi.

- [ ] Checklist của bước trong 69 đủ PASS (đã ghi vào 70)
- [ ] `npm run build` frontend OK (W-B, nếu sửa FE)
- [ ] Backend khởi động không lỗi (W-A, nếu sửa BE)
- [ ] Không console error khi test feature
- [ ] Feature cũ liên quan không regression
- [ ] ORCH/REV đã review + checkpoint (nếu có) ký PASS
