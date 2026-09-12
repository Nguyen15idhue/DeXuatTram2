# Hướng dẫn Deploy & Cập nhật trên VPS

> Tài liệu dành cho vận hành dự án **Station Management (DeXuatTram2)**.
> Mục tiêu: deploy hệ thống, cập nhật code và đồng bộ dữ liệu một cách đơn giản.
> Đọc kèm: `docs/6/Chuanbi_deploy.md`, `docs/6/Cac_buoc_code_truoc_deploy.md`.

---

## 1. Tổng quan 4 script

| Script | Chạy ở đâu | Làm gì |
|---|---|---|
| `deploy.sh` | VPS | Cài đặt hệ thống lần đầu (tạo `.env`, build, khởi động MySQL + backend + frontend). |
| `update.sh` | VPS | Cập nhật code mới: pull code, cập nhật database, build lại và chạy lại. |
| `scripts/migrate.sh` | VPS | Quản lý thay đổi database (thêm bảng/cột) theo từng file trong `database/`. |
| `scripts/sync-data.sh` | Máy dev | Đẩy dữ liệu từ máy dev lên VPS (mặc định chỉ thêm, không xoá). |

**Luồng sử dụng:**

```
Lần đầu          :  deploy.sh
Có code mới      :  git pull  →  ./update.sh   (trên VPS)
Cần dữ liệu mới  :  scripts/sync-data.sh push  (trên máy dev)
```

---

## 2. Yêu cầu & cài Docker

- VPS Ubuntu 22.04/24.04, đã cài Docker.
- Mở cổng **8081** (hoặc cổng bạn chọn) trên firewall/security group.

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker compose version
```

Mật khẩu MySQL mặc định: root `RootPass2026!`, app `AppPass2026!` → **nên đổi sau khi lên web**.

---

## 3. Deploy lần đầu (1 lệnh)

```bash
git clone https://github.com/Nguyen15idhue/DeXuatTram2.git
cd DeXuatTram2
chmod +x deploy.sh
./deploy.sh
```

In ra:
```
Link truy cap : http://<IP>:8081
Tai khoan     : admin@station.com / 123456
```

Tùy chọn:

```bash
./deploy.sh --port=8088     # đổi cổng web
./deploy.sh --skip-schema   # không import dữ liệu DB
```

**`deploy.sh` tự làm:** tạo `.env` → build → nạp dữ liệu MySQL có sẵn → chạy 3 service.
Chạy lại nhiều lần không sao, **không mất dữ liệu**.

---

## 4. Cập nhật khi có code mới

Trên máy dev: commit + push lên GitHub.

Trên VPS:

```bash
cd ~/DeXuatTram2
git pull origin ui-redesign
./update.sh
```

`update.sh` sẽ tự: cập nhật database (migration) → build lại → chạy lại. Dữ liệu cũ được giữ nguyên.

> `.env` trên VPS không bị ghi đè (đã được gitignore).

Nếu gặp lỗi khi `git pull` do file sửa tay, bỏ thay đổi cục bộ rồi pull lại:

```bash
git checkout -- .
git pull origin ui-redesign
./update.sh
```

---

## 5. Đồng bộ dữ liệu từ dev lên VPS

**Chạy trên máy dev.** Dùng khi muốn VPS có dữ liệu (đề xuất, trạm, user...) đã tạo trên dev.

```bash
bash scripts/sync-data.sh push --host root@<IP-VPS>
```

Mặc định script **chỉ thêm dữ liệu**:
- Bản ghi dev **chưa có** trên VPS → được thêm vào.
- Bản ghi **đã có** (trùng ID/khoá) → giữ nguyên bản trên VPS, **không ghi đè**.
- Kèm đồng bộ file uploads.
- Trước khi ghi, tự backup VPS vào `/root/backups/`.

Tùy chọn:

```bash
--no-uploads      # chỉ đồng bộ DB, bỏ qua file
--full            # GHI ĐÈ toàn bộ DB VPS bằng dev (chỉ dùng khi thật cần)
--dry-run         # xem trước các bước, chưa làm gì
--yes             # không hỏi xác nhận
```

**Lưu ý quan trọng:** trên VPS hãy chạy `./update.sh` **trước** để database đủ cột/bảng, rồi mới sync dữ liệu.

Các lệnh khác:

```bash
bash scripts/sync-data.sh export --out dev.sql.gz   # xuất dữ liệu dev ra file
bash scripts/sync-data.sh import dev.sql.gz         # nhập file vào DB dev
```

---

## 6. Cập nhật database (migrate.sh)

Thường **không cần chạy tay** vì `update.sh` đã tự chạy. Khi cần:

```bash
scripts/migrate.sh status        # xem file nào chưa chạy
scripts/migrate.sh run           # chạy các file mới
scripts/migrate.sh mark-all --yes # đánh dấu tất cả đã chạy (DB cũ chưa có tracking)
```

Quy tắc: script DB viết dạng **tiến tới**, đặt trong `database/`, đánh số tăng dần, **không DROP**.

---

## 7. Vận hành & Backup

```bash
# Trạng thái
docker compose -f docker-compose.simple.yml ps

# Log
docker compose -f docker-compose.simple.yml logs -f
docker logs -f station-mysql

# Dừng / chạy lại (giữ nguyên dữ liệu)
docker compose -f docker-compose.simple.yml down
docker compose -f docker-compose.simple.yml up -d
```

**Backup định kỳ:**

```bash
# Database
docker exec station-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' | gzip > /root/backups/db-$(date +%F).sql.gz

# File uploads
docker run --rm -v dexuattram2_uploads_data:/data -v /root/backups:/backup busybox \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

> **Không** dùng `docker compose ... down -v` (sẽ xoá volume → mất dữ liệu).

---

## 8. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Web không mở được | Kiểm tra `docker compose -f docker-compose.simple.yml ps`; mở cổng 8081 trên firewall. |
| Lỗi `Failed to fetch` khi login | Kiểm tra backend chạy: `docker start station-backend`. |
| Backend `Exited` | `docker logs --tail 40 station-backend` rồi `docker start station-backend`. |
| MySQL `unhealthy` / khởi động chậm | Chạy lại `./deploy.sh` (script tự nạp datadir có sẵn, chờ tối đa 10 phút). |
| Build lỗi `DeadlineExceeded` | `./update.sh` lại; nếu vẫn lỗi, khởi động lại Docker: `sudo systemctl restart docker`. |
| Import bị kẹt `Waiting for schema metadata lock` | Tắt backend trước khi import: `docker kill station-backend`. |
| Log MySQL có `mbind: Operation not permitted` | Cảnh báo vô hại, bỏ qua. |

Kiểm tra nhanh toàn hệ thống:

```bash
docker ps -a --filter "name=station-"
curl -s -o /dev/null -w "api=%{http_code}\n" http://127.0.0.1:8081/api/test   # mong đợi 200
```

---

## 9. Bảo mật (VPS public)

1. Đổi mật khẩu `admin@station.com` ngay.
2. Xoá/khoá tài khoản test.
3. Rotate token 1Office cũ và cập nhật vào bảng `api_configs`.
4. Đổi mật khẩu MySQL mặc định nếu muốn.
5. Không mở MySQL (3306) / backend (3000) ra ngoài.

---

## 10. Phụ lục

### phpMyAdmin (tùy chọn)

```bash
docker compose -f docker/docker-compose.pma.yml up -d
ssh -L 8082:127.0.0.1:8082 root@<IP-VPS>   # rồi mở http://localhost:8082
```
Đăng nhập: `root` / `RootPass2026!`.

### Có domain / HTTPS sau này

Sửa `.env` rồi chạy lại `up -d`:

```
CORS_ORIGINS=https://yourdomain.com
BASE_URL=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

```bash
docker compose -f docker-compose.simple.yml up -d
```
