# Chuẩn bị Deploy lên VPS

> **Chốt 05/09/2026**: storage uploads dùng **Cách A — named volume** (`uploads_data`). MySQL giữ container + named volume `mysql_data` + cron `mysqldump`. Chi tiết vòng đời/backup ở mục 9.

## 1. Tổng quan thay đổi khi deploy

Khi đẩy lên VPS, **code backend/frontend không đổi**, chỉ thay đổi cách build và serve:

| | Dev (hiện tại) | Production |
|---|---|---|
| Frontend serve | Vite dev server (port 5173) | nginx (port 80/443) |
| Proxy | Vite proxy | nginx reverse proxy |
| Hot reload | Có | Không (rebuild) |
| SSL/TLS | Không cần | Certbot (Let's Encrypt) |

## 2. Docker Compose Production

Hiện tại dùng Vite dev server (hot reload). Production cần build frontend thành static files rồi serve bằng nginx.

**docker-compose.yml hiện tại (dev):**
```yaml
frontend:
  build: ./frontend
  ports: ["5173:5173"]
  volumes:
    - ./frontend/src:/app/src  # hot reload
```

**docker-compose.prod.yml production:**
```yaml
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
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
    volumes:
      - uploads_data:/app/storage/uploads
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - station-network

  mysql:
    image: mysql:8.0
    container_name: station-mysql
    env_file:
      - .env
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - station-network

volumes:
  mysql_data:
  uploads_data:

networks:
  station-network:
    driver: bridge
```

**Quy ước file `.env` trên VPS (không commit, xem mục 7):**
`PORT, DB_HOST=mysql, DB_PORT, DB_USER, DB_PASSWORD(mạnh), DB_NAME, JWT_SECRET(random), TURNSTILE_SECRET_KEY, CAPTCHA_ENABLED=true, ORPHAN_FILE_TTL_HOURS=24, CORS_ORIGINS, MYSQL_ROOT_PASSWORD(mạnh), MYSQL_DATABASE`.
Secrets dev trong compose cũ (`password`, `station-mgmt-dev-secret-2024-xK9mPz`) **không dùng lại**.

## 3. Frontend Dockerfile.prod

```dockerfile
# Build stage
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

## 4. Nginx config (nginx.conf)

Tạo file `frontend/nginx.conf`:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Frontend routes (React SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API → backend:3000
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Proxy uploads → backend:3000
    location /uploads/ {
        proxy_pass http://backend:3000;
    }
}
```

**Giải thích:**
- `try_files $uri $uri/ /index.html`: React SPA - mọi route đều trả về index.html, React Router xử lý client-side
- `proxy_pass http://backend:3000`: Forward request đến backend container (dùng tên service trong Docker network)
- `location /uploads/`: Forward file uploads đến backend static serve

## 5. Backend có cần đổi không?

**Không cần đổi code.** Chỉ cần đảm bảo:
- Chạy `npm start` (không `--watch`).
- `uploads` mount bằng **named volume `uploads_data`** (mục 2), không bind source, không để file trong image.
- `mathjs` đã trong `package.json` (đã làm).

## 6. .env.production

File `frontend/.env.production`:
```
VITE_API_URL=/api
```

Hiện tại đã đúng (`/api` là relative URL, hoạt động cả dev và production).

**Lưu ý:** `VITE_API_URL` phải là `/api` (relative), KHÔNG được là `http://localhost:3000/api` (absolute) vì sẽ không hoạt động trên domain thật.

## 7. Flow deploy lên VPS

```bash
# 1. Clone repo
git clone <repo-url> && cd DeXuatTram2

# 2. Checkout branch deploy
git checkout ui-redesign

# 3. Build và chạy
docker compose -f docker-compose.prod.yml up -d --build

# 4. Kiểm tra
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f

# 5. SSL (tùy chọn, cần domain)
certbot --nginx -d yourdomain.com
```

## 8. Lưu ý khi deploy

- **Database**: MySQL container + named volume `mysql_data` + **cron `mysqldump` hàng ngày** (mục 9). Không expose port 3306 ra ngoài.
- **Storage**: named volume `uploads_data` (Cách A, mục 9) — redeploy không mất file.
- **Environment variables**: Không hardcode trong docker-compose.prod.yml, dùng file `.env` trên VPS (mục 2).
- **SSL**: Luôn dùng HTTPS trên production (Let's Encrypt miễn phí). Turnstile và geolocation trình duyệt đòi secure context.
- **Swagger** (`/api-docs`): cân nhắc tắt hoặc chặn IP trên production.

## 9. Storage Cách A — vòng đời, backup, restore (đã chốt)

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
- **Khởi tạo DB mới**: chạy `database/01` → `26` lần lượt 1 lần duy nhất (làm tay, như quy ước SQL thủ công của dự án); sau này chỉ thêm script mới.
