# DOCKER DEVELOPMENT GUIDE

> **Docker Compose v2**
> **3 Services:** frontend, backend, mysql

---

## 1. DOCKER SERVICES

### docker-compose.yml

```yaml
services:
  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    volumes:
      - ./frontend/src:/app/src           # Hot reload
      - ./frontend/index.html:/app/index.html
      - ./frontend/vite.config.js:/app/vite.config.js
    depends_on: [backend]

  backend:
    build: ./backend
    ports: ["3000:3000"]
    volumes:
      - ./backend/src:/app/src            # Hot reload
    environment:
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_USER=root
      - DB_PASSWORD=password
      - DB_NAME=station_management
      - JWT_SECRET=your-super-secret-jwt-key-change-in-production
    depends_on:
      mysql:
        condition: service_healthy

  mysql:
    image: mysql:8.0
    ports: ["3306:3306"]
    environment:
      - MYSQL_ROOT_PASSWORD=password
      - MYSQL_DATABASE=station_management
    volumes:
      - mysql_data:/var/lib/mysql         # Persistent data
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  mysql_data:
```

---

## 2. COMMON COMMANDS

### Khởi động
```bash
# Chạy tất cả containers
docker compose up -d

# Chạy và rebuild
docker compose up -d --build

# Xem logs
docker compose logs -f

# Xem logs 1 service
docker compose logs -f backend
```

### Dừng & Xóa
```bash
# Dừng containers
docker compose down

# Dừng + xóa volumes (XÓA DATA)
docker compose down -v

# Dừng + rebuild
docker compose down && docker compose up -d --build
```

### Kiểm tra
```bash
# Xem containers đang chạy
docker compose ps

# Vào container backend
docker exec -it station-backend sh

# Vào container mysql
docker exec -it station-mysql mysql -u root -ppassword

# Xem logs real-time
docker compose logs -f --tail=50
```

---

## 3. HOT RELOAD

### Frontend (Vite)
- Source mount: `./frontend/src:/app/src`
- Vite config: `usePolling: true, interval: 1000`
- YAML config: `atomic_save: false`
- **Lưu ý:** Docker Desktop Windows không propagates inotify events → cần polling

### Backend (Node.js)
- Source mount: `./backend/src:/app/src`
- Command: `node --watch src/app.js`
- Auto-restart khi file thay đổi

### Nếu hot reload không hoạt động
```bash
# Restart containers
docker compose restart frontend backend

# Hoặc rebuild
docker compose down && docker compose up -d --build
```

---

## 4. DATABASE MANAGEMENT

### Truy cập MySQL
```bash
# Vào MySQL CLI
docker exec -it station-mysql mysql -u root -ppassword station_management

# Hoặc dùng MySQL client bên ngoài
# Host: localhost, Port: 3306, User: root, Password: password
```

### Chạy SQL scripts
```bash
# Copy script vào container
docker cp database/01-create-tables.sql station-mysql:/tmp/

# Execute
docker exec -it station-mysql mysql -u root -ppassword station_management < /tmp/01-create-tables.sql
```

### Reset database
```bash
# Xóa data và chạy lại seed
docker exec -it station-mysql mysql -u root -ppassword -e "DROP DATABASE station_management; CREATE DATABASE station_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Chạy lại scripts
docker cp database/01-create-tables.sql station-mysql:/tmp/
docker cp database/02-seed-data.sql station-mysql:/tmp/
docker exec -it station-mysql mysql -u root -ppassword station_management < /tmp/01-create-tables.sql
docker exec -it station-mysql mysql -u root -ppassword station_management < /tmp/02-seed-data.sql
```

---

## 5. TROUBLESHOOTING

### Container không start
```bash
# Xem logs
docker compose logs backend
docker compose logs frontend
docker compose logs mysql

# Check ports
docker compose ps
```

### Port conflict
```bash
# Kiểm tra port đang dùng
netstat -ano | findstr :3000
netstat -ano | findstr :5173
netstat -ano | findstr :3306

# Kill process
taskkill /PID <PID> /F
```

### MySQL không connect
```bash
# Check MySQL health
docker exec station-mysql mysqladmin ping -u root -ppassword

# Check database exists
docker exec station-mysql mysql -u root -ppassword -e "SHOW DATABASES;"
```

### Frontend build lỗi
```bash
# Vào container và check
docker exec -it station-frontend sh
npm run build
```

### Backend không nhận DB
```bash
# Check DB connection
docker exec -it station-backend node -e "const pool = require('./src/utils/db'); pool.query('SELECT 1').then(() => console.log('OK')).catch(e => console.error(e));"
```

---

## 6. ENVIRONMENT VARIABLES

### .env
```env
PORT=3000
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=station_management
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

### Inject vào Docker
- Backend: environment vars trong docker-compose.yml
- Frontend: Vite env vars (chưa dùng, API URL hardcoded)

---

## 7. PRODUCTION CONSIDERATIONS

### Không dùng cho production
- ❌ Dev volumes mount
- ❌ Hot reload polling
- ❌ Debug logs
- ❌ CORS all origins

### Cần thay đổi
- ✅ Build optimized frontend (`npm run build`)
- ✅ Use production Dockerfile (nginx for frontend)
- ✅ Set secure JWT_SECRET
- ✅ Configure CORS properly
- ✅ Add HTTPS
- ✅ Add rate limiting
- ✅ Use managed database

### Production docker-compose
```yaml
# docker-compose.prod.yml
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    ports: ["80:80"]

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    environment:
      - NODE_ENV=production
      - JWT_SECRET=secure-random-string

  mysql:
    volumes:
      - mysql_data:/var/lib/mysql
    # Không expose port 3306
```

---

## 8. NETWORKING

### Service Discovery
```javascript
// Backend connect MySQL
const pool = mysql.createPool({
  host: 'mysql',      // Docker service name
  port: 3306,
  ...
});

// Frontend connect Backend
const API_URL = 'http://localhost:3000/api';  // Docker exposed port
```

### Container Communication
```
Frontend (5173) → Backend (3000) → MySQL (3306)
                    ↓
              Uses 'mysql' as host
              (Docker internal DNS)
```
