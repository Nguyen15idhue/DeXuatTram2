# Hướng dẫn chạy mã nguồn trên local

> Cập nhật: **10/2026**. Tài liệu chuẩn để chạy dự án **TMT-EGREEN (DeXuatTram2)** trên máy dev (Windows/máy cá nhân).
> Tài liệu deploy VPS xem `docs/6/Huong_dan_deploy_va_cap_nhat_VPS.md`.

---

## 0. TL;DR

```bash
# 1) Cài Docker Desktop (đã bật WSL2 backend nếu dùng Windows) + Node.js 20 + Git (kèm Git Bash)
# 2) Clone
git clone https://github.com/Nguyen15idhue/DeXuatTram2.git
cd DeXuatTram2

# 3) Dựng DB lần đầu (chỉ 1 lần, chạy trong Git Bash)
docker compose up -d mysql
docker compose exec -T mysql sh -c 'mysql -uroot -p"password" --default-character-set=utf8mb4 station_management' < docker/station_lite_dump.sql
for f in database/*.sql; do
  name="$(basename "$f")"; num="${name%%-*}"
  case "$num" in ''|*[!0-9]*) continue ;; esac
  [ "$num" -le 44 ] && bash scripts/migrate.sh mark "$name" >/dev/null
done
bash scripts/migrate.sh run

# 4) Chạy cả stack
docker compose up -d --build
# web ở http://localhost:5173 — login admin@station.com / 123456
```

---

## 1. Yêu cầu

| Thành phần | Bản yêu cầu | Ghi chú |
|---|---|---|
| Docker Desktop | bản mới (kèm Compose plugin) | Cách chạy khuyến nghị; Windows cần bật WSL2 backend |
| Node.js | **20.x** | Chỉ cần khi chạy native không qua Docker (mục 3) |
| Git + Git Bash | bản mới | `scripts/*.sh` chạy bằng **Git Bash**, không chạy bằng PowerShell/CMD |
| RAM | ≥ 8 GB (máy dev) | Vite + MySQL + backend cùng lúc |

Cổng local sử dụng: `5173` (frontend) · `3000` (backend) · `3306` (MySQL). Kiểm tra không bị chiếm trước khi chạy (mục 7).

---

## 2. Cách 1 — Docker Compose (khuyến nghị)

Mọi service chạy đúng như môi trường dev chuẩn: hot reload qua volumes, không cần `npm install` trên máy host.

### 2.1 Clone

```bash
git clone https://github.com/Nguyen15idhue/DeXuatTram2.git
cd DeXuatTram2
```

> Giữ đúng tên thư mục `DeXuatTram2` (tên volume Docker `dexuattram2_*` ăn theo tên này, xem tài liệu VPS mục 3.1).

### 2.2 Dựng database lần đầu (chỉ 1 lần)

`docker-compose.yml` dev **không** tự nạp seed — volume MySQL trống thì DB rỗng. Làm 1 lần theo đúng pipeline `deploy.sh`:

```bash
# 1) Khởi động MySQL, chờ healthy (~30-60s)
docker compose up -d mysql
docker inspect -f '{{.State.Health.Status}}' station-mysql   # kỳ vọng healthy

# 2) Nạp base dump (schema tới mốc migration 44 + data cấu hình + 4 user seed)
docker compose exec -T mysql sh -c 'mysql -uroot -p"password" --default-character-set=utf8mb4 station_management' < docker/station_lite_dump.sql

# 3) Đánh dấu các migration đã có trong dump (số <= 44), rồi áp phần còn thiếu (> 44)
for f in database/*.sql; do
  name="$(basename "$f")"; num="${name%%-*}"
  case "$num" in ''|*[!0-9]*) continue ;; esac
  [ "$num" -le 44 ] && bash scripts/migrate.sh mark "$name" >/dev/null
done
bash scripts/migrate.sh run
```

> ⚠️ Chạy các lệnh trên trong **Git Bash** (Windows). `scripts/migrate.sh` đọc mật khẩu từ container nên không cần file `.env`.
> Tuyệt đối **không** `mark-all` khi DB mới nạp dump — sẽ đánh dấu cả migration chưa chạy (lỗi y như tài liệu VPS mục 7.1).

### 2.3 Chạy cả stack

```bash
docker compose up -d --build
docker compose ps   # 3 service station-frontend/backend/mysql đều Up
```

| Truy cập | Địa chỉ |
|---|---|
| Web app | http://localhost:5173 |
| API backend | http://localhost:3000/api/test (kỳ vọng `200`) |
| Swagger UI | http://localhost:3000/api-docs |

Tài khoản seed: `admin@station.com / 123456` (SUPER_ADMIN) → **đổi mật khẩu ngay cả trên local** nếu máy dùng chung mạng.

### 2.4 Kiểm tra sau khi chạy

```bash
docker exec station-backend date          # phải hiện +07 (TZ Asia/Ho_Chi_Minh)
docker compose exec -T mysql sh -c 'mysql -N -uroot -p"password" station_management' <<'SQL'
SELECT COUNT(*) AS tracked FROM schema_migrations;   -- kỳ vọng = số file trong database/
SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema='station_management';
SQL
```

Sau đó mở web: login → `/map` → `/admin/proposals` → không lỗi console.

### 2.5 Cập nhật code mới

```bash
git pull
docker compose up -d --build              # rebuild service đổi code (giữ DB)
bash scripts/migrate.sh run               # nếu có migration mới trong database/
```

> Source mount volumes nên **sửa file là hot reload ngay** (backend `node --watch`, frontend Vite HMR) — chỉ rebuild khi đổi `package*.json`/Dockerfile.

---

## 3. Cách 2 — Chạy native không qua Docker (frontend/backend trên máy host)

Chỉ dùng khi cần debug sâu hoặc Docker Desktop quá nặng. MySQL **vẫn nên chạy bằng Docker** (`docker compose up -d mysql` + dựng DB theo mục 2.2).

### 3.1 Backend (`:3000`)

```powershell
cd backend
npm install
$env:DB_HOST="127.0.0.1"; $env:DB_PORT="3306"
$env:DB_USER="root"; $env:DB_PASSWORD="password"; $env:DB_NAME="station_management"
$env:PORT="3000"; $env:TZ="Asia/Ho_Chi_Minh"
$env:JWT_SECRET="dev-local-secret-doi-di"
npm run dev   # node --watch src/app.js
```

`backend/src/utils/db.js` mặc định đúng các giá trị trên nên chỉ cần `DB_PASSWORD` khớp MySQL local. Backend đọc `backend/.env` nếu có (file này gitignore, không commit).

### 3.2 Frontend (`:5173`)

```powershell
cd frontend
npm install
npm run dev
```

> ⚠️ `vite.config.js` proxy `/api` và `/tiles` sang `http://backend:3000` — hostname `backend` **chỉ phân giải được trong mạng Docker**. Chạy FE native trên máy host thì mở 1 terminal riêng đặt:
>
> ```powershell
> $env:VITE_API_URL="http://localhost:3000/api"; npm run dev
> ```
>
> (CORS mặc định của backend đã cho phép `http://localhost:5173`, xem `backend/src/app.js:66-68`.)
> Khi chạy full Docker (cách 1) thì **không cần** biến này — giữ `VITE_API_URL=/api` (relative).

---

## 4. File `.env` và file không commit

- `.env` ở root **không bắt buộc khi chạy dev bằng Docker** (`docker-compose.yml` dev hardcode sẵn env cho backend). Chỉ cần khi chạy native hoặc muốn bật tính năng phụ.
- Muốn bật chatbot/AI local: tạo `.env` từ `.env.example`, điền `GEMINI_API_KEY` (+ `OPENROUTER_API_KEY` dự phòng). Không có key thì nút chat tự ẩn, app vẫn chạy.
- `frontend/public/pmtiles/vietnam.pmtiles` (~300MB) bị gitignore — thiếu thì bản đồ self-host PMTiles không chạy, provider online mặc định vẫn bình thường.
- `test_files/` gitignore — file Excel local không bao giờ lọt lên git.

---

## 5. Kiểm thử sau khi đổi code

```powershell
cd frontend; npm run build          # FE build không lỗi
```

```bash
# E2E (root repo, cần cả 3 service đang chạy)
npm run test:e2e                    # e2e/FE-01-smoke.spec.js, baseURL http://localhost:5173
npm run test:e2e:headed             # xem trình duyệt chạy
```

Test Playwright lẻ trong `frontend/test-*.cjs`: chạy `node test-1office.cjs` từ `frontend/`.

---

## 6. Vận hành local hằng ngày

```bash
docker compose ps
docker compose logs -f backend      # xem log backend
docker compose logs -f frontend
docker compose restart backend      # restart 1 service
docker compose up -d                # chạy lại sau khi tắt máy (giữ DB)
docker compose down                 # dừng, giữ dữ liệu
```

> ⛔ **Không** `docker compose down -v` (xóa volume `mysql_data` → **mất DB local**). Muốn reset DB từ đầu: `down -v` rồi làm lại mục 2.2.

Backup nhanh DB local trước khi thử nghiệm rủi ro:

```bash
docker exec station-mysql sh -c 'mysqldump -uroot -p"password" --set-gtid-purged=OFF station_management | gzip' > backups\db-local-$(date +%F).sql.gz
```

---

## 7. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `port is already allocated` (5173/3000/3306) | Tìm tiến trình chiếm cổng và tắt, hoặc dừng stack cũ: `docker compose down` |
| FE báo `Failed to fetch` / proxy `ENOTFOUND backend` | Xảy ra khi chạy FE native — xem mục 3.2 (đặt `VITE_API_URL` tuyệt đối) |
| MySQL `unhealthy` / backend `Exited` | `docker logs --tail 40 station-mysql`; DB trống thì làm lại mục 2.2; thiếu bảng thì `bash scripts/migrate.sh run` |
| `npm install` lỗi trên Windows | Xóa `node_modules` + `package-lock.json` của service đó rồi cài lại; dùng Node 20 (không dùng Node 22+ nếu gặp lỗi native module) |
| `vite build` báo hết RAM | Tắt bớt service, tăng RAM cho Docker Desktop (Settings → Resources) |
| Chữ tiếng Việt lỗi trong PowerShell | Đặt UTF-8 trước lệnh (PowerShell 5.1 mặc định Windows-1252): `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8`; **không** dùng `Get-Content/Set-Content` để sửa file source |
| `scripts/migrate.sh` không chạy trong PowerShell | Chạy bằng **Git Bash** |
| Muốn chạy prod build local để so với VPS | Không dùng `docker-compose.yml`; VPS dùng `docker-compose.simple.yml` + `Dockerfile.prod` (nginx) — xem tài liệu VPS |

---

## 8. Phụ lục — Kiến trúc local

```
Browser http://localhost:5173
  ▼  (Vite dev server + proxy /api, /tiles)
container station-frontend (npm run dev :5173, hot reload ./frontend/src)
  ▼
container station-backend (npm run dev :3000, hot reload ./backend/src)
  ▼
container station-mysql (:3306, volume mysql_data, root/password)
```

Khác với VPS (`docker-compose.simple.yml`: frontend nginx static `:80`, backend prod, không mount source) — local dùng `docker-compose.yml` dev, sửa code là thấy ngay không cần rebuild.
