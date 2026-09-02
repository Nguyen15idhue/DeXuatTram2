# Chuẩn bị Deploy lên VPS

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
    ports:
      - "3000:3000"
    volumes:
      - ./backend/src:/app/src
      - ./backend/storage/uploads:/app/storage/uploads
    environment:
      - PORT=3000
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_USER=root
      - DB_PASSWORD=password
      - DB_NAME=station_management
      - JWT_SECRET=station-mgmt-dev-secret-2024-xK9mPz
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - station-network

  mysql:
    image: mysql:8.0
    container_name: station-mysql
    ports:
      - "3306:3306"
    environment:
      - MYSQL_ROOT_PASSWORD=password
      - MYSQL_DATABASE=station_management
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

networks:
  station-network:
    driver: bridge
```

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
- `backend/storage/uploads` được mount ra host (đã làm trong docker-compose.yml)
- `mathjs` đã trong `package.json` (đã làm)

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

- **Database**: Dùng MySQL managed service (AWS RDS, DigitalOcean Managed DB) thay vì MySQL container để data không mất khi restart
- **Storage**: Mount `backend/storage/uploads` ra volume persistent (NFS, S3) để file upload không mất
- **Environment variables**: Không hardcode trong docker-compose.prod.yml, dùng `.env` file hoặc CI/CD secrets
- **SSL**: Luôn dùng HTTPS trên production (Let's Encrypt miễn phí)
- **Backup**: Định kỳ backup database và storage uploads
