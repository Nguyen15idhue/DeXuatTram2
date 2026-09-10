# Kế hoạch Deploy lên VPS

> **Chốt 05/09/2026**: storage uploads dùng **Cách A — named volume** (`uploads_data`). MySQL giữ container + named volume `mysql_data` + cron `mysqldump`. Chi tiết vòng đời/backup ở mục 10.
>
> **Cập nhật 10/09/2026**: bổ sung gap analysis giữa doc và mã nguồn thực tế (mục 1), phần chuẩn bị VPS (mục 2), các file cần tạo/sửa (mục 4), checklist sau deploy (mục 8).
>
> **Chốt 10/09/2026 — Phương án deploy nhanh (đang dùng)**: dùng `deploy.sh` + `docker-compose.simple.yml` (**KHÔNG nginx**), import baseline `database/baseline/station_management_baseline.sql` (cấu trúc **TẤT CẢ 16 bảng** + dữ liệu **11 bảng cấu hình**; bảng nghiệp vụ để trống). Chạy 1 lệnh trên VPS → `http://{ip}:8081`. Chi tiết ở **mục 0**.

---

## 0. Phương án deploy nhanh (khuyến nghị)

Mục tiêu: clone về VPS → chạy **1 lệnh** → có web dùng được ngay (chấp nhận HTTP, bổ sung domain/HTTPS sau).

### 0.1 Thành phần

| File | Vai trò |
|---|---|
| `deploy.sh` | Tự sinh `.env` (secret random, JWT ≥32 ký tự), build & up, chờ MySQL, tạo user app, import baseline, in link |
| `docker-compose.simple.yml` | 3 service, **không nginx** (frontend Vite `:5173`), chỉ publish cổng web; backend/mysql ẩn |
| `docker/mysql-init/01-app-user.sh` | Tạo user MySQL `station_app` (không root) khi khởi tạo MySQL lần đầu |
| `database/baseline/station_management_baseline.sql` | Baseline: **structure 16 bảng** + **data 11 bảng cấu hình** (users, field_definitions, forms, form_fields, views, view_fields, data_lists, data_list_rows, map_configs, api_configs, api_field_mappings); đã bỏ token 1Office |

### 0.2 Chạy

```bash
git clone <repo-url> && cd DeXuatTram2
chmod +x deploy.sh
./deploy.sh                  # mặc định WEB_PORT=8081
# ./deploy.sh --port=8088    # đổi cổng web
# ./deploy.sh --skip-schema  # không import DB
# ./deploy.sh --use-scripts  # bỏ baseline, chạy database/01 -> 44
```
Kết quả: mở `http://{ip}:8081`, đăng nhập `admin@station.com / 123456` (đổi ngay sau).

### 0.3 Cổng (tránh trùng VPS)

- Chỉ publish **WEB_PORT** (mặc định **8081**). VPS đang dùng 8080/8085/8086/8087/8090/8091/3000/3001/3004/3101/3306/3307/9090/12101/10445/10630/1509/22/80/443 → **8081 trống**.
- Backend `:3000` và MySQL `:3306` **không publish** ra host (chỉ trong mạng Docker nội bộ) nên **không đụng Grafana `:3000`** hay MySQL `:3306` sẵn có.

### 0.4 `--use-scripts` (khi không dùng baseline)

Cần 2 fix đã áp dụng: `database/03-update-passwords.sql` (hash bcrypt hợp lệ — bản cũ hash sai làm login hỏng) và `database/36-1office-api-configs.sql` (bỏ `CREATE INDEX IF NOT EXISTS` không được MySQL 8 hỗ trợ). Lưu ý: chạy script thuần vẫn **lỗi FK ở `19,22,23,26,28,29,31,33,41`** (form/view được tạo qua UI, không có trong script) → **baseline là cách đầy đủ hơn**.

### 0.5 Sau này có domain / HTTPS

- VPS đã có host nginx (80/443) → cấu hình trỏ về `127.0.0.1:8081`.
- Cập nhật `CORS_ORIGINS/BASE_URL/FRONTEND_URL` trong `.env` rồi `docker compose -f docker-compose.simple.yml up -d`.
- (Tùy chọn) chuyển sang `docker-compose.prod.yml` (nginx trong container + TLS) nếu muốn tách host nginx.

### 0.6 Lưu ý CPU VPS (quan trọng)

Image `mysql:8.0` (từ bản ≥ 8.0.34) yêu cầu CPU **x86-64-v2**; VPS CPU cũ sẽ báo `Fatal glibc error: CPU does not support x86-64-v2` và MySQL không chạy. Vì vậy compose ghim **`mysql:8.0.33`** (bản cuối hỗ trợ CPU x86-64 v1). **Không** đổi về `mysql:8.0`/`mysql:latest` trên VPS cũ.

Ngoài ra, một số VPS khiến `mysqld --initialize` **treo** (native AIO/O_DIRECT không tương thích) → đã thêm `docker/mysql-conf/01-tuning.cnf`:
```
[mysqld]
innodb_use_native_aio=0
innodb_flush_method=fsync
```
mount vào `/etc/my.cnf.d` trong cả `docker-compose.simple.yml` và `docker-compose.prod.yml`.

---


## 1. Hiện trạng: doc và mã nguồn (GAP ANALYSIS)

Các file doc cũ nhắc tới nhưng **chưa tồn tại trong repo**:

| Hạng mục | Trạng thái thực tế | Việc cần làm |
|---|---|---|
| `docker-compose.prod.yml` | ❌ Không tồn tại | Tạo mới (mục 3) |
| `frontend/Dockerfile.prod` | ❌ Không tồn tại | Tạo mới (mục 4.1) |
| `frontend/nginx.conf` | ❌ Không tồn tại | Tạo mới (mục 4.2) |
| `.dockerignore` (gốc + service) | ❌ Không tồn tại | Tạo mới (mục 4.3) |
| `frontend/.env.production` | ❌ Không tồn tại | Tạo mới (mục 4.4) |
| Prod compose frontend có `ports:` | ❌ Doc không có → container không truy cập được | Thêm `80:80` / `127.0.0.1:8080:80` |
| nginx proxy `/uploads/` | ❌ Backend **không** serve static `/uploads` | Bỏ, hoặc sửa link Excel (mục 4.5) |
| Khởi tạo DB `01 → 26` | ❌ Thực tế `01 → 43` (thiếu file số 34) | Chạy hết theo thứ tự (mục 7) |
| `.env.example` | ❌ Thiếu ~8 biến code đang dùng | Bổ sung (mục 4.6) |
| `frontend/.env` = `/api` | ❌ Bị `.gitignore` → VPS clone không có | Dùng `.env.production` |
| Branch `ui-redesign` | ✅ Đúng | OK |

### Phát hiện bảo mật nghiêm trọng

1. **Token 1Office thật bị commit** trong `database/37-seed-1office-api-config.sql` (đã xoá khỏi script, thay bằng `CHANGE_ME_1OFFICE_TOKEN`) → **phải rotate token cũ và cập nhật token mới vào DB** trước khi deploy.
2. Seed tạo tài khoản `admin@station.com` / `123456` (`database/02-seed-data.sql`, `database/03-update-passwords.sql`) → **đổi ngay sau deploy**.
3. Không có `.dockerignore` → `COPY . .` kéo cả host `node_modules` (Windows binaries), `.git`, `storage/uploads` vào image.

---

## 2. Chuẩn bị VPS

### 2.1 Cấu hình đề xuất
- **OS**: Ubuntu 22.04 / 24.04 LTS
- **RAM/CPU**: tối thiểu 2 vCPU / 2 GB. Nếu chỉ 1 GB → **bắt buộc thêm swap** (Vite build dễ OOM).
- **Disk**: 40 GB SSD
- Mở outbound 443 (backend gọi 1Office / Turnstile / tile proxy)

### 2.2 Swap (nếu RAM ≤ 2GB)
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2.3 Cài Docker + Compose plugin
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker compose version
```

### 2.4 Firewall (ufw)
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable        # KHÔNG mở 3000 / 3306 / 5173
```

### 2.5 Domain + DNS
- Trỏ A record `domain.com` → IP VPS.
- **Bắt buộc HTTPS**: Turnstile và Geolocation trình duyệt yêu cầu secure context.

### 2.6 TLS (lưu ý: doc cũ ghi `certbot --nginx` là SAI)
nginx chạy **trong container**, không phải trên host. Chọn 1 trong các cách:
- **(Khuyến nghị)** Caddy trên host làm reverse proxy (auto TLS), forward `:80/:443` → `127.0.0.1:8080` (frontend container).
- Host nginx + certbot, forward xuống frontend container.
- Certbot container + volume cert dùng chung (phức tạp hơn).

### 2.7 Múi giờ
Set `TZ=Asia/Ho_Chi_Minh` cho backend/mysql/compose để `NOW()` và log đúng giờ.

---

## 3. Docker Compose Production (`docker-compose.prod.yml`)

Khác bản dev: frontend build static + nginx serve, backend chạy `npm start`, MySQL dùng named volume, có `restart`.

```yaml
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    container_name: station-frontend
    ports:
      - "127.0.0.1:8080:80"   # để Caddy/host-nginx TLS phía trước
    restart: unless-stopped
    depends_on:
      - backend
    networks:
      - station-network

  backend:
    build: ./backend
    container_name: station-backend
    command: ["npm", "start"]
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - TZ=Asia/Ho_Chi_Minh
    volumes:
      - uploads_data:/app/storage/uploads
    depends_on:
      mysql:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - station-network

  mysql:
    image: mysql:8.0.33
    container_name: station-mysql
    env_file:
      - .env
    environment:
      - TZ=Asia/Ho_Chi_Minh
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - station-network

volumes:
  mysql_data:
  uploads_data:

networks:
  station-network:
    driver: bridge
```

> Nếu muốn để nginx container tự nhận `80/443` (không dùng host proxy) → đổi frontend thành `ports: ["80:80"]`, nhưng khi đó TLS phải xử lý trong container (khó với certbot).

---

## 4. Các file cần tạo / sửa

### 4.1 `frontend/Dockerfile.prod`
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

### 4.2 `frontend/nginx.conf`
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 10m;

    # React SPA
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API → backend
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Tile proxy (fallback bản đồ) → backend
    location /tiles/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
> **Bỏ `location /uploads/`** vì backend không serve static `/uploads` (chỉ có `/api/files/:id/image` và `/api/files/:id/download`).

### 4.3 `.dockerignore` (đặt ở gốc, và nên có ở `frontend/`, `backend/`)
```
node_modules
.git
.env
storage/uploads
dist
test-results
playwright-report
*.log
```

### 4.4 `frontend/.env.production` (không bị gitignore)
```
VITE_API_URL=/api
VITE_TURNSTILE_SITE_KEY=<site_key_nếu_bật_captcha>
```

### 4.5 Sửa code bắt buộc

1. **`backend/src/app.js`** — thêm `app.set('trust proxy', 1);` trước middleware.
   Nếu không, sau nginx mọi request có IP = IP container nginx → **rate limit và ownership file guest theo IP sai**, express-rate-limit cũng cảnh báo.
2. **Map tile self-hosted dùng `http://`** trong `backend/src/services/mapConfigService.js` (dòng 7-8) và `frontend/src/utils/tileProviders.js` (dòng 80, 82, 96) → trên HTTPS bị **mixed-content block**. Đổi thành `https://{domain}` (hoặc `//{domain}`).
3. **`backend/src/services/excelService.js:328`** sinh link `${baseUrl}/uploads/${key}` không tồn tại → đổi sang `/api/files/{id}/download`. Set `BASE_URL=https://domain` trong `.env`.
4. **Swagger public** `/api-docs`: production nên chặn theo IP ở nginx hoặc tắt hẳn (thêm biến `ENABLE_SWAGGER`).
5. **`backend/Dockerfile`** đang `CMD npm run dev`; prod override bằng `command: npm start` là đủ, nhưng nên đổi multi-stage / `npm ci --omit=dev` và `ENV NODE_ENV=production` để image gọn.

> **Lưu ý CAPTCHA** (`backend/src/services/proposalService.js:84`): chỉ khi `CAPTCHA_ENABLED === 'false'` mới bỏ qua captcha. Nếu để trống mà không có `TURNSTILE_SECRET_KEY` → **guest proposal luôn thất bại**.

### 4.6 `.env` mở rộng (đặt trên VPS, KHÔNG commit)
```env
NODE_ENV=production
PORT=3000
TZ=Asia/Ho_Chi_Minh

DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<mạnh>
DB_NAME=station_management

MYSQL_ROOT_PASSWORD=<mạnh>
MYSQL_DATABASE=station_management

JWT_SECRET=<random 64 hex>
JWT_EXPIRES_IN=12h

CORS_ORIGINS=https://domain.com
BASE_URL=https://domain.com
FRONTEND_URL=https://domain.com

CAPTCHA_ENABLED=false          # false → không cần Turnstile
TURNSTILE_SECRET_KEY=          # nếu bật captcha, phải khớp VITE_TURNSTILE_SITE_KEY
ORPHAN_FILE_TTL_HOURS=24
```
Secrets dev cũ trong compose (`password`, `station-mgmt-dev-secret-2024-xK9mPz`) **không dùng lại**.

### 4.7 `.env.example` cập nhật (commit để tham chiếu)
Bổ sung các biến: `NODE_ENV`, `JWT_EXPIRES_IN`, `CORS_ORIGINS`, `CAPTCHA_ENABLED`, `TURNSTILE_SECRET_KEY`, `ORPHAN_FILE_TTL_HOURS`, `BASE_URL`, `FRONTEND_URL`, `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, và ghi chú `frontend/.env.production`.

---

## 5. Backend có cần đổi không?

**Không đổi logic nghiệp vụ.** Chỉ cần:
- Chạy `npm start` (không `--watch`).
- `uploads` mount **named volume `uploads_data`** (mục 3), không bind source, không để file trong image.
- `mathjs` đã có trong `package.json`.
- Thêm `app.set('trust proxy', 1)` và các fix ở mục 4.5.

---

## 6. Nginx / TLS / Bảo mật

- Frontend SPA: `try_files $uri $uri/ /index.html`.
- `client_max_body_size 10m` để upload không bị 413 (khớp limit backend).
- Chặn/tắt `/api-docs` trên production.
- Không expose `3000` (backend) và `3306` (MySQL) ra ngoài.
- Cân nhắc tạo MySQL user riêng chỉ có quyền trên `station_management` thay vì dùng `root`.

---

## 7. Các bước deploy lên VPS

```bash
# 1. Clone repo
git clone <repo-url> && cd DeXuatTram2

# 2. Checkout branch deploy
git checkout ui-redesign

# 3. Tạo file cấu hình
#    - .env (theo mục 4.6, điền secrets mạnh)
#    - frontend/.env.production (theo mục 4.4)

# 4. Build và chạy
docker compose -f docker-compose.prod.yml up -d --build

# 5. Chờ MySQL healthy rồi khởi tạo DB (chỉ chạy 1 lần, đúng thứ tự số)
for f in database/*.sql; do
  echo ">> $f"
  docker exec -i station-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
    --default-character-set=utf8mb4 station_management < "$f"
done

# 6. Kiểm tra
docker compose -f docker-compose.prod.yml ps
curl -fsS http://localhost:8080/health
curl -fsS -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@station.com","password":"123456"}'

# 7. Bảo mật sau khi chạy được
#    - Đổi mật khẩu toàn bộ tài khoản seed
#    - Rotate token 1Office (đã lộ trong git)

# 8. TLS: setup Caddy / host-nginx (mục 2.6) và trỏ domain

# 9. Logs
docker compose -f docker-compose.prod.yml logs -f
```

### Luồng cập nhật sau này
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```
Named volume `mysql_data` + `uploads_data` giữ nguyên dữ liệu. **Cấm `down -v`.**

---

## 8. Checklist sau deploy (Definition of Done)

- [ ] `https://domain.com` load, F5 route con không 404 (`try_files`)
- [ ] Login OK, API qua nginx trả đúng
- [ ] Upload file OK (≤10MB, không 413) và xem/tải lại được
- [ ] Bản đồ load tile (kể cả fallback `/tiles/`)
- [ ] Guest proposal tạo được (đã set `CAPTCHA_ENABLED`); IP/ownership đúng nhờ `trust proxy`
- [ ] Rate limit hoạt động (429 khi spam login)
- [ ] Phân quyền CTV / SALES / ADMIN đúng
- [ ] Swagger bị chặn / tắt
- [ ] MySQL và Node không lộ port ra ngoài
- [ ] Cron backup chạy, có file trong `/root/backups`
- [ ] Docker `restart: unless-stopped`; reboot VPS service tự lên

---

## 9. Rủi ro cần xử lý trước khi deploy

1. **Token 1Office đã lộ trong git** → bắt buộc rotate.
2. **Seed password `123456`** → đổi toàn bộ tài khoản seed.
3. **`DB_USER=root`** cho app → nên tạo user MySQL riêng.
4. **Thiếu `restart: unless-stopped`** → VPS reboot là service chết.
5. **Chưa set `trust proxy`** → bảo mật/phân quyền IP sai sau nginx.
6. **`frontend/.env` bị gitignore** → build production trỏ `localhost` nếu không tạo `.env.production`.

---

## 10. Storage Cách A — vòng đời, backup, restore (đã chốt)

- Volume `uploads_data:/app/storage/uploads` sống độc lập với image/code: build lại, `git pull`, recreate container đều **không mất file**. Chỉ mất khi chủ động `docker volume rm` / `down -v` (**cấm trên production**).
- Không nhìn file trực tiếp trên host; cần xem thì `docker exec station-backend ls storage/uploads/...`.
- **Backup uploads (cron hàng ngày, giữ 7 bản)**:
```bash
docker run --rm -v uploads_data:/data -v /root/backups:/backup busybox \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```
- **Restore**:
```bash
docker run --rm -v uploads_data:/data -v /root/backups:/backup busybox \
  tar xzf /backup/uploads-2026-09-05.tar.gz -C /data
```
- **Backup MySQL (cron hàng ngày)**:
```bash
docker exec station-mysql mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" station_management \
  | gzip > /root/backups/db-$(date +%F).sql.gz
```
- **Khởi tạo DB mới**: ưu tiên import baseline `database/baseline/station_management_baseline.sql` (cách đầy đủ). Nếu muốn chạy tay theo quy ước SQL thủ công thì `database/01` → `44` lần lượt, nhưng sẽ lỗi FK ở một số script seed (xem mục 0.4).
