# Hướng dẫn Deploy & Cập nhật trên VPS

> Tài liệu thực hành cho dự án **Station Management (DeXuatTram2)**.
> Tập trung vào: deploy 1 lệnh, **khắc phục lỗi MySQL**, và quy trình cập nhật code.
> Đọc kèm: `docs/6/Chuanbi_deploy.md` (kế hoạch), `docs/6/Cac_buoc_code_truoc_deploy.md` (chi tiết code).

---

## 1. Yêu cầu

- VPS Ubuntu 22.04/24.04, **Docker + Compose plugin**.
- CPU có thể cũ (x86-64 v1) — script đã xử lý.
- Mở cổng **8081** inbound trên **security group/cloud firewall** của nhà cung cấp (chỉ lần đầu).
- Mật khẩu MySQL mặc định (đặt sẵn trong datadir): root `RootPass2026!`, app `AppPass2026!` → **đổi sau khi lên web**.

Cài Docker:
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker compose version
```
VPS đang có sẵn host nginx (80/443) và nhiều service khác → app chỉ dùng cổng 8081, backend/mysql ẩn trong Docker nên **không đụng** các service khác.

---

## 2. Deploy lần đầu (1 lệnh)

```bash
git clone https://github.com/Nguyen15idhue/DeXuatTram2.git
cd DeXuatTram2
chmod +x deploy.sh
./deploy.sh
```
Kết quả in ra:
```
Link truy cap : http://<IP>:8081
Tai khoan     : admin@station.com / 123456
```
Tùy chọn:
```bash
./deploy.sh --port=8088     # đổi cổng web
./deploy.sh --skip-schema   # không import dữ liệu DB
```

---

## 3. `deploy.sh` làm gì (tự động)

1. Tạo `.env` (JWT random ≥32 ký tự, mật khẩu MySQL khớp datadir, `WEB_PORT=8081`).
2. Build images.
3. Nếu **volume MySQL chưa có dữ liệu** → nạp `docker/mysql-datadir.tar.gz` (chown `999:999`) → MySQL **khởi động tức thì, KHÔNG chạy `mysqld --initialize`**.
4. Chạy `station-mysql`, chờ `healthy`.
5. Nếu DB chưa có bảng → import `docker/station_lite_dump.sql` (16 bảng + cấu hình + 4 user).
6. Chạy `station-backend` + `station-frontend`, in link.

**Idempotent:** chạy lại không mất dữ liệu (đã có volume/bảng thì bỏ qua nạp & import).

Cấu trúc liên quan:
```
deploy.sh                       # deploy 1 lệnh
update.sh                       # cập nhật code
docker-compose.simple.yml       # 3 service (frontend Vite, backend, mysql)
docker/mysql-datadir.tar.gz     # datadir MySQL init sẵn
docker/station_lite_dump.sql    # data DB gọn
docker/mysql-init/01-app-user.sh# tạo user station_app (không root)
docker/docker-compose.pma.yml   # (tùy chọn) phpMyAdmin
```

---

## 4. Xử lý lỗi MySQL (phần quan trọng nhất)

Đây là các lỗi **đã gặp thực tế** trên VPS và cách khắc phục — script đã "bake sẵn", nhưng nắm để xử lý khi gặp lại.

### 4.1 `Fatal glibc error: CPU does not support x86-64-v2`

**Nguyên nhân:** image `mysql:8.0` / `mysql:latest` dựa trên **Oracle Linux** yêu cầu CPU x86-64-v2; VPS CPU cũ không đáp ứng → MySQL crash liên tục.

**Khắc phục (đã áp dụng):** dùng **`mysql:8.0.44-debian`** (bản Debian 12, chạy được trên x86-64 v1). Image đã ghim trong `docker-compose.simple.yml`.
```bash
grep "image:" docker-compose.simple.yml   # phải thấy mysql:8.0.44-debian
```
**Không** đổi về `mysql:8.0`, `mysql:latest`, hay `mysql:8.0.33` (el8).

### 4.2 `mysqld --initialize` treo hoặc cực chậm

**Biểu hiện:** log đứng ở `InnoDB initialization has started`, `docker stats` CPU ~0%, hoặc mỗi `CREATE TABLE` mất vài chục giây. **Nguyên nhân:** đĩa VPS chậm (fsync) hoặc native AIO không tương thích.

**Khắc phục (đã áp dụng):** **không init trên VPS** — dùng **datadir đã tạo sẵn** (`docker/mysql-datadir.tar.gz`). Script tự nạp khi volume trống. Kiểm tra:
```bash
docker run --rm -v dexuattram2_mysql_data:/data busybox sh -c 'test -d /data/mysql && echo DATADIR_OK || echo DATADIR_MISSING'
```
Nếu `DATADIR_MISSING` và cần nạp tay:
```bash
docker rm -f station-mysql 2>/dev/null
docker volume rm dexuattram2_mysql_data 2>/dev/null
docker volume create dexuattram2_mysql_data
docker run --rm -v dexuattram2_mysql_data:/data -v "$PWD":/src busybox \
  sh -c "tar xzf /src/docker/mysql-datadir.tar.gz -C /data && chown -R 999:999 /data"
./deploy.sh
```

> Khi import dữ liệu lớn bằng CLI, tạm tắt ghi bền để nhanh hơn (nhớ bật lại):
> ```bash
> docker exec station-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SET GLOBAL innodb_flush_log_at_trx_commit=0; SET GLOBAL sync_binlog=0;"'
> # ... import ...
> docker exec station-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SET GLOBAL innodb_flush_log_at_trx_commit=1; SET GLOBAL sync_binlog=1;"'
> ```

### 4.3 Import bị kẹt "Waiting for schema metadata lock"

**Nguyên nhân:** file `.sql` có `LOCK TABLES ... WRITE` (mysqldump mặc định) + có session khác đang giữ khóa (vd backend đang kết nối, hoặc lần import trước chưa kết thúc).

**Khắc phục:**
1. Tắt backend trước khi import: `docker kill station-backend`.
2. Xem session đang giữ khóa:
   ```bash
   docker exec station-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SHOW FULL PROCESSLIST;"'
   ```
3. Kill session import cũ: `KILL CONNECTION <id>;`
4. Bỏ dòng `LOCK TABLES` khỏi file dump rồi import lại:
   ```bash
   grep -v -E '^LOCK TABLES|^UNLOCK TABLES' file.sql > file_nolock.sql
   ```

### 4.4 Login sai mật khẩu trên DB mới

**Nguyên nhân:** `database/03-update-passwords.sql` (bản cũ) chứa **hash bcrypt sai** → login `123456` thất bại. **Đã sửa** trong repo. Nếu import bằng datadir/lite dump thì không dính (user lấy từ datadir).

### 4.5 Kiểm tra nhanh DB

```bash
# Đếm bảng (mong đợi 16)
docker exec station-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N station_management -e "SHOW TABLES"' | wc -l

# Danh sách user
docker exec station-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT id,email,role FROM station_management.users;"'

# Xem mật khẩu/DB trong .env
grep -E '^MYSQL_|^DB_' .env
```

---

## 5. Lỗi thường gặp khác

| Hiện tượng | Nguyên nhân | Xử lý |
|---|---|---|
| `dependency failed to start: container station-mysql is unhealthy` | MySQL init chậm/treo | Dùng datadir (mục 4.2); script mới đã chờ tới 10 phút và in log khi lỗi |
| `Failed to fetch` khi login | Frontend gọi sai `/api` **hoặc** backend tắt | Kiểm tra `frontend/.env.development` có `VITE_API_URL=/api`; `docker start station-backend` |
| Login `Failed to fetch` (đã đảm bảo backend chạy) | Image frontend cũ thiếu `VITE_API_URL` | `docker compose -f docker-compose.simple.yml up -d --build frontend` rồi hard-refresh trình duyệt |
| Web nội bộ OK nhưng ngoài không vào | Security group chặn cổng | Mở cổng `${WEB_PORT}` (8081) trên bảng điều khiển VPS |
| Backend `Exited` | DB thiếu bảng / lỗi khởi động | `docker start station-backend`; xem `docker logs --tail 40 station-backend` |
| `mbind: Operation not permitted` trong log MySQL | Cảnh báo NUMA vô hại | Bỏ qua |

Kiểm tra nhanh toàn hệ thống:
```bash
docker ps -a --filter "name=station-"
curl -s -o /dev/null -w "api=%{http_code}\n" http://127.0.0.1:8081/api/test   # mong đợi 200
docker logs --tail 20 station-backend
```

---

## 6. Cập nhật khi có code mới

Trên máy dev: commit + push lên GitHub (nhánh `ui-redesign`).

Trên VPS:
```bash
cd ~/DeXuatTram2
git pull origin ui-redesign
./update.sh
```
`update.sh` = `docker compose -f docker-compose.simple.yml up -d --build` (build lại image có code mới, giữ nguyên dữ liệu trong volume).

Hoặc làm tay:
```bash
git pull origin ui-redesign
docker compose -f docker-compose.simple.yml up -d --build
```

### 6.1 Lỗi `Your local changes ... would be overwritten by merge`

**Biểu hiện:**
```
error: Your local changes to the following files would be overwritten by merge:
        deploy-datadir.sh
Please commit your changes or stash them before you merge.
Aborting
```
**Nguyên nhân:** trên VPS có file (theo dõi bởi git) bị sửa cục bộ — thường do lần trước bạn sửa tay, hoặc file đã bị **xóa/đổi tên ở bản mới** nhưng còn bản cũ trên VPS.

**Khắc phục:** trên VPS coi repo là chuẩn, bỏ hết thay đổi cục bộ rồi pull lại:
```bash
cd ~/DeXuatTram2
git status --short              # xem file nào đang bị lệch
git checkout -- deploy-datadir.sh   # bỏ thay đổi ở file bị báo (nếu muốn giữ thì git stash)
git pull origin ui-redesign
```
Nếu còn nhiều file báo lỗi, bỏ tất cả:
```bash
git checkout -- .
git pull origin ui-redesign
```
Hoặc dùng stash (giữ tạm thay đổi):
```bash
git stash
git pull origin ui-redesign
git stash pop
```
> `.env` là file **gitignore** nên không bị đụng — cấu hình của bạn vẫn giữ nguyên.

Sau khi pull thành công, `update.sh` mới tồn tại để chạy:
```bash
chmod +x update.sh deploy.sh
./update.sh
```

**Lưu ý:**
- Nếu có **thay đổi schema DB**: phải chạy thêm script SQL tương ứng (dự án quản lý schema thủ công qua `database/*.sql`).
- Nếu chỉ sửa frontend/backend → `up -d --build` là đủ, không mất dữ liệu.
- Muốn reset DB sạch: import lại `docker/station_lite_dump.sql` (xem mục 4.5/6).
- **Không** dùng `docker compose ... down -v` (sẽ xóa volume → mất dữ liệu).

---

## 7. Vận hành

```bash
# Trạng thái
docker compose -f docker-compose.simple.yml ps

# Log
docker compose -f docker-compose.simple.yml logs -f
docker logs -f station-mysql

# Dừng / chạy lại (giữ dữ liệu)
docker compose -f docker-compose.simple.yml down
docker compose -f docker-compose.simple.yml up -d

# Tài nguyên
docker stats --no-stream
```

**Backup (nên làm định kỳ):**
```bash
# DB
docker exec station-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' | gzip > /root/backups/db-$(date +%F).sql.gz

# Uploads (file)
docker run --rm -v dexuattram2_uploads_data:/data -v /root/backups:/backup busybox \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

---

## 8. Bảo mật (VPS public)

1. Đổi mật khẩu `admin@station.com` ngay.
2. Xoá/khoá tài khoản test (`*@example.com`, `testp4`, `reg_test_rbac`, `testrefactor`...).
3. Rotate token 1Office cũ (đã lộ trong git) và cập nhật vào bảng `api_configs`.
4. Đổi mật khẩu MySQL mặc định (`RootPass2026!` / `AppPass2026!`) nếu muốn.
5. Không mở MySQL (3306) / backend (3000) ra ngoài.

---

## 9. phpMyAdmin (tùy chọn)

```bash
docker compose -f docker/docker-compose.pma.yml up -d
```
Truy cập an toàn qua **SSH tunnel** (không cần mở cổng 8082 public):
```bash
ssh -L 8082:127.0.0.1:8082 root@<IP-VPS>
# rồi mở http://localhost:8082
```
Đăng nhập: `root` / `RootPass2026!` (hoặc `station_app` / `AppPass2026!`).

Khi import file lớn qua phpMyAdmin: dùng tab **Import** (không dán vào ô SQL); nên nén `.sql.gz`.

---

## 10. Có domain / HTTPS sau này

- VPS đã có host nginx (80/443) → cấu hình trỏ domain về `127.0.0.1:8081`.
- Cập nhật `.env`:
```
CORS_ORIGINS=https://yourdomain.com
BASE_URL=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
```
- Áp dụng: `docker compose -f docker-compose.simple.yml up -d`.
