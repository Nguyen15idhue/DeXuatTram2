# AGENTS.md

## 1. Project Overview

```
Project: Station Management System
Purpose: Quản lý trạm sạc, hiển thị trên bản đồ, đề xuất vị trí trạm
Stack: React + Vite | Node.js + Express | MySQL | Leaflet | Docker Compose
```

## 2. Architecture

```
Browser → Frontend → REST API → Backend → MySQL
```

```
/frontend    React + Vite
/backend     Node.js + Express
/database    MySQL scripts
/docker      Docker configs
```

## 3. Business Entities

### User
- Roles: `USER`, `ADMIN`
- Status: `ACTIVE`, `LOCKED`

### Station (trạm đã được tạo)
- Status: `ACTIVE`, `DEPLOYING`, `PROPOSAL`

### Station Proposal (đề xuất trạm mới)
- Status: `PENDING`, `REVIEWING`, `APPROVED`, `REJECTED`

**QUAN TRỌNG:**
- `Station` và `Station Proposal` là hai entity ĐỘC LẬP
- `Station` là trạm đã có thật
- `Station Proposal` là đề xuất chưa được duyệt
- KHÔNG được merge hai entity này
- KHÔNG tự thêm status `PROPOSAL` vào Station

## 4. Business Rules

### Permission Rules
1. User chỉ được xem/sửa/xóa proposal của chính mình
2. Admin được quản lý tất cả proposals và stations
3. User KHÔNG được truy cập admin API (`/admin/*`)

### Data Rules
4. Proposal phải lưu `user_id` của người tạo
5. Latitude/Longitude lấy từ vị trí click trên map (không nhập thủ công)

### Map Marker Rules
6. Station `ACTIVE` → marker xanh
7. Station `DEPLOYING` → marker vàng
8. Proposal → marker màu trạng thái đề xuất

### Ownership Rules
9. Khi update/delete proposal, phải check `user_id` khớp với user đang login
10. Admin có thể bypass ownership check

## 5. Coding Conventions

```
Frontend components:     PascalCase.jsx
Variables/functions:     camelCase
Constants:               UPPER_SNAKE_CASE
Database tables:         snake_case, plural
Database columns:        snake_case
API routes:              /api/[resource]
```

### General Rules
- JavaScript (không dùng TypeScript)
- Async/await cho异步操作
- Try-catch cho error handling
- Không thêm comments trừ khi được yêu cầu

## 6. Folder Responsibilities

### Frontend
```
frontend/src/
├── components/     reusable UI components
├── pages/          page-level components
├── services/       API calls
├── hooks/          custom hooks
├── layouts/        layout components
├── utils/          helper functions
├── App.jsx         root component
└── main.jsx        entry point
```

### Backend
```
backend/src/
├── routes/         API route definitions
├── controllers/    request handlers
├── services/       business logic
├── middlewares/     auth, validation
├── models/         database models
├── utils/          helper functions
└── app.js          entry point
```

## 7. API Conventions

- All routes start with `/api`
- Authentication: JWT (Bearer token)
- Admin endpoints require `ADMIN` role
- Response format: `{ success, data, message, pagination? }`
- Validation happens on backend, not frontend

## 8. Database Rules

- Never store plaintext passwords (use bcrypt)
- All tables use primary key `id`
- Required columns: `created_at`, `updated_at`
- Use foreign keys where appropriate
- **KHÔNG được DROP TABLE rồi CREATE TABLE lại**
- **Không modify schema mà không có migration plan**

## 9. Docker Development

```
- Development uses Docker Compose
- Source code mounted as volumes (hot reload enabled)
- DO NOT remove source-code volumes
- MySQL data uses persistent Docker volume
- DO NOT use docker compose down -v unless requested
```

## 10. Testing

After changing code:
1. Check frontend build (`npm run build`)
2. Check backend starts without errors
3. Check Docker containers running
4. Manually verify the feature works
5. Check existing features still work

When automated tests do not exist, perform manual verification.

## 11. Definition of Done

Task is complete when:
- [ ] Feature works end-to-end
- [ ] Frontend has no runtime errors
- [ ] Backend API returns expected results
- [ ] Authorization is enforced
- [ ] Existing features are not broken
- [ ] Docker hot reload still works
- [ ] No console errors
