# KẾ HOẠCH REFACTOR — TÁCH CONTROLLERS/SERVICES

**Ngày tạo:** 2026-08-30
**Trạng thái:** Chưa thực hiện
**Ước tính:** ~1.5 giờ

---

## MỤC ĐÍCH

Tách business logic khỏi route files thành controllers và services để:
- Route files chỉ chứa routing + middleware (~30 dòng/file)
- Controllers xử lý request/response (~100-150 dòng/file)
- Services chứa business logic thuần túy (~200-300 dòng/file)
- Dễ test, dễ maintain khi dự án scale

---

## CẤU TRÚC MỤC TIÊU

```
backend/src/
├── app.js                    (giữ nguyên)
├── config/
│   └── swagger.js            (giữ nguyên)
├── middlewares/
│   ├── auth.js               (giữ nguyên)
│   └── validators.js         (giữ nguyên)
├── routes/                   (rút gọn — chỉ routing)
│   ├── test.js
│   ├── auth.js
│   ├── stations.js
│   ├── proposals.js
│   ├── myProposals.js
│   ├── adminUsers.js
│   ├── adminProposals.js
│   ├── excel.js
│   ├── mapUtils.js
│   └── dashboard.js
├── controllers/              (MỚI — request/response)
│   ├── authController.js
│   ├── stationController.js
│   ├── proposalController.js
│   ├── myProposalController.js
│   ├── adminUserController.js
│   ├── adminProposalController.js
│   ├── excelController.js
│   ├── mapController.js
│   └── dashboardController.js
├── services/                 (MỚI — business logic)
│   ├── authService.js
│   ├── stationService.js
│   ├── proposalService.js
│   ├── myProposalService.js
│   ├── adminUserService.js
│   ├── adminProposalService.js
│   ├── excelService.js
│   ├── mapService.js
│   └── dashboardService.js
└── utils/
    └── db.js                 (giữ nguyên)
```

---

## PHÂN TÁCH CHO TỪNG FILE

### 1. auth.js → authController + authService

**Route hiện tại (~250 dòng):**
```
POST /register          — validate → hash password → insert → respond
POST /login             — validate → find user → compare password → generate token
GET  /me                — requireAuth → return user from req.user
PUT  /profile           — requireAuth → validate → update user
```

**Sau refactor:**
```
routes/auth.js (~40 dòng):
  POST /register    → authController.register
  POST /login       → authController.login
  GET  /me          → requireAuth, authController.getMe
  PUT  /profile     → requireAuth, authController.updateProfile

controllers/authController.js (~120 dòng):
  register(req, res)
  login(req, res)
  getMe(req, res)
  updateProfile(req, res)

services/authService.js (~100 dòng):
  createUser(email, password, fullName, phone)
  loginUser(email, password)
  getUserById(id)
  updateUserProfile(id, fullName, phone)
```

---

### 2. stations.js → stationController + stationService

**Route hiện tại (~200 dòng):**
```
GET    /              — public, query filters + pagination
GET    /:id           — public, find by id
POST   /              — admin only, validate + create
PUT    /:id           — admin only, validate + update
DELETE /:id           — admin only, delete
```

**Sau refactor:**
```
routes/stations.js (~30 dòng):
  GET    /           → stationController.getAll
  GET    /:id        → stationController.getById
  POST   /           → requireAuth, requireAdmin, stationController.create
  PUT    /:id        → requireAuth, requireAdmin, stationController.update
  DELETE /:id        → requireAuth, requireAdmin, stationController.delete

controllers/stationController.js (~130 dòng):
  getAll(req, res)
  getById(req, res)
  create(req, res)
  update(req, res)
  delete(req, res)

services/stationService.js (~100 dòng):
  getAllStations(filters, page, limit)
  getStationById(id)
  createStation(data)
  updateStation(id, data)
  deleteStation(id)
```

---

### 3. proposals.js → proposalController + proposalService

**Route hiện tại (~180 dòng):**
```
GET    /              — public, query filters + pagination
GET    /:id           — public, find by id
POST   /              — any user, validate + create
```

**Sau refactor:**
```
routes/proposals.js (~20 dòng):
  GET    /           → proposalController.getAll
  GET    /:id        → proposalController.getById
  POST   /           → requireAuth, proposalController.create

controllers/proposalController.js (~100 dòng):
  getAll(req, res)
  getById(req, res)
  create(req, res)

services/proposalService.js (~80 dòng):
  getAllProposals(filters, page, limit)
  getProposalById(id)
  createProposal(data, userId)
```

---

### 4. myProposals.js → myProposalController + myProposalService

**Route hiện tại (~150 dòng):**
```
GET    /              — requireAuth, list user's proposals
PUT    /:id           — requireAuth, ownership check, validate, update
DELETE /:id           — requireAuth, ownership check, delete
```

**Sau refactor:**
```
routes/myProposals.js (~20 dòng):
  GET    /           → requireAuth, myProposalController.getAll
  PUT    /:id        → requireAuth, myProposalController.update
  DELETE /:id        → requireAuth, myProposalController.delete

controllers/myProposalController.js (~100 dòng):
  getAll(req, res)
  update(req, res)
  delete(req, res)

services/myProposalService.js (~80 dòng):
  getUserProposals(userId, page, limit)
  updateUserProposal(id, userId, data)
  deleteUserProposal(id, userId)
```

---

### 5. adminUsers.js → adminUserController + adminUserService

**Route hiện tại (~200 dòng):**
```
GET    /              — admin, list all users (pagination)
POST   /              — admin, validate + create
PUT    /:id           — admin, validate + update
DELETE /:id           — admin, self-delete protection
PATCH  /:id/lock      — admin, toggle lock
PATCH  /:id/role      — admin, change role
```

**Sau refactor:**
```
routes/adminUsers.js (~30 dòng):
  GET    /           → requireAuth, requireAdmin, adminUserController.getAll
  POST   /           → requireAuth, requireAdmin, adminUserController.create
  PUT    /:id        → requireAuth, requireAdmin, adminUserController.update
  DELETE /:id        → requireAuth, requireAdmin, adminUserController.delete
  PATCH  /:id/lock   → requireAuth, requireAdmin, adminUserController.toggleLock
  PATCH  /:id/role   → requireAuth, requireAdmin, adminUserController.changeRole

controllers/adminUserController.js (~150 dòng):
  getAll(req, res)
  create(req, res)
  update(req, res)
  delete(req, res)
  toggleLock(req, res)
  changeRole(req, res)

services/adminUserService.js (~120 dòng):
  getAllUsers(filters, page, limit)
  createUser(data)
  updateUser(id, data)
  deleteUser(id, currentUserId)
  toggleUserLock(id)
  changeUserRole(id, role)
```

---

### 6. adminProposals.js → adminProposalController + adminProposalService

**Route hiện tại (~120 dòng):**
```
GET    /              — admin, list all proposals (pagination)
DELETE /:id           — admin, delete proposal
PUT    /:id/status    — admin, update status
```

**Sau refactor:**
```
routes/adminProposals.js (~20 dòng):
  GET    /           → requireAuth, requireAdmin, adminProposalController.getAll
  DELETE /:id        → requireAuth, requireAdmin, adminProposalController.delete
  PUT    /:id/status → requireAuth, requireAdmin, adminProposalController.updateStatus

controllers/adminProposalController.js (~90 dòng):
  getAll(req, res)
  delete(req, res)
  updateStatus(req, res)

services/adminProposalService.js (~70 dòng):
  getAllProposals(filters, page, limit)
  deleteProposal(id)
  updateProposalStatus(id, status)
```

---

### 7. excel.js → excelController + excelService

**Route hiện tại (~300 dòng — LỚN NHẤT):**
```
GET  /export/stations       — admin, query DB → convert to Excel → download
GET  /export/proposals      — admin, query DB → convert to Excel → download
GET  /template              — admin, generate template Excel
POST /import/preview        — admin, parse Excel → validate → return preview
POST /import/confirm        — admin, take preview data → insert DB
```

**Sau refactor:**
```
routes/excel.js (~25 dòng):
  GET  /export/stations     → requireAuth, requireAdmin, excelController.exportStations
  GET  /export/proposals    → requireAuth, requireAdmin, excelController.exportProposals
  GET  /template            → requireAuth, requireAdmin, excelController.getTemplate
  POST /import/preview      → requireAuth, requireAdmin, excelController.importPreview
  POST /import/confirm      → requireAuth, requireAdmin, excelController.importConfirm

controllers/excelController.js (~150 dòng):
  exportStations(req, res)
  exportProposals(req, res)
  getTemplate(req, res)
  importPreview(req, res)
  importConfirm(req, res)

services/excelService.js (~200 dòng):
  generateStationsExcel(stations)
  generateProposalsExcel(proposals)
  generateTemplate()
  parseExcelFile(fileBuffer)
  validateExcelData(data, type)
  importStations(data)
  importProposals(data)
```

---

### 8. mapUtils.js → mapController + mapService

**Route hiện tại (~80 dòng):**
```
POST /resolve-map-url — resolve Google Maps URL to coordinates
```

**Sau refactor:**
```
routes/mapUtils.js (~10 dòng):
  POST /resolve-map-url → mapController.resolveMapUrl

controllers/mapController.js (~40 dòng):
  resolveMapUrl(req, res)

services/mapService.js (~40 dòng):
  resolveGoogleMapsUrl(url)
```

---

### 9. dashboard.js → dashboardController + dashboardService

**Route hiện tại (~100 dòng):**
```
GET / — admin, count stations/proposals/users → return stats
```

**Sau refactor:**
```
routes/dashboard.js (~10 dòng):
  GET / → requireAuth, requireAdmin, dashboardController.getStats

controllers/dashboardController.js (~40 dòng):
  getStats(req, res)

services/dashboardService.js (~60 dòng):
  getDashboardStats()
```

---

## THỨ TỰ THỰC HIỆN

| # | File | Route hiện tại | Ước tính | Trạng thái |
|---|------|----------------|-----------|------------|
| 1 | auth.js | 250 dòng | 15 phút | ⬜ |
| 2 | stations.js | 200 dòng | 10 phút | ⬜ |
| 3 | proposals.js | 180 dòng | 10 phút | ⬜ |
| 4 | myProposals.js | 150 dòng | 10 phút | ⬜ |
| 5 | adminUsers.js | 200 dòng | 15 phút | ⬜ |
| 6 | adminProposals.js | 120 dòng | 10 phút | ⬜ |
| 7 | excel.js | 300 dòng | 20 phút | ⬜ |
| 8 | mapUtils.js | 80 dòng | 5 phút | ⬜ |
| 9 | dashboard.js | 100 dòng | 5 phút | ⬜ |

---

## QUY TẮC REFACTOR

1. **KHÔNG thay đổi logic** — chỉ move code, không sửa functionality
2. **KHÔNG thay đổi API contract** — endpoints, request, response giữ nguyên
3. **Test ngay sau mỗi file** — gọi API test trước khi qua file tiếp
4. **Giữ nguyên Swagger JSDoc** — copy sang route file mới
5. **Giữ nguyên error messages** — không sửa nội dung lỗi
6. **Giữ nguyên middleware chain** — requireAuth, requireAdmin, validators

---

## CHECKLIST HOÀN THÀNH

- [ ] Tạo folder `controllers/` và `services/`
- [ ] Refactor auth.js
- [ ] Refactor stations.js
- [ ] Refactor proposals.js
- [ ] Refactor myProposals.js
- [ ] Refactor adminUsers.js
- [ ] Refactor adminProposals.js
- [ ] Refactor excel.js
- [ ] Refactor mapUtils.js
- [ ] Refactor dashboard.js
- [ ] Test tất cả endpoints
- [ ] Check Swagger UI load đúng
- [ ] Rebuild Docker
- [ ] Update AGENTS.md
