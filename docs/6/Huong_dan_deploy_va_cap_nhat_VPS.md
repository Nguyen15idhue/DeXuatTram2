# Hướng dẫn Deploy & Cập nhật trên VPS

> Cập nhật: **14/09/2026**. Đây là tài liệu **chuẩn để vận hành** dự án **Station Management (DeXuatTram2)**.
> Các file `Chuanbi_deploy.md` và `Cac_buoc_code_truoc_deploy.md` là **tài liệu lịch sử/quá trình** (còn nhắc `docker-compose.prod.yml`, baseline `01→44` — đã lỗi thời), chỉ dùng tham khảo.
> Đối tượng: deploy mới hoàn toàn trên VPS + cập nhật code về sau.

---

## 0. TL;DR

```bash
# 1) Cài Docker (nếu chưa)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 2) Clone ĐÚNG tên thư mục DeXuatTram2 (xem mục 3.1)
git clone https://github.com/Nguyen15idhue/DeXuatTram2.git
cd DeXuatTram2

# 3) Deploy 1 lệnh
chmod +x deploy.sh update.sh scripts/*.sh
./deploy.sh                     # web ở http://<IP>:8081

# 4) Có code mới
git pull && ./update.sh
```

- Mật khẩu mặc định: `admin@station.com / 123456` → **đổi ngay**.
- MySQL: root `RootPass2026!`, app `station_app` / `AppPass2026!` → **đổi sau**.
- Truy cập ngoài: mở cổng `${WEB_PORT}` trên firewall/security group, hoặc dùng **Cloudflare Tunnel** (mục 8) để không phải mở cổng.

---

## 1. Thành phần & script

| File | Vai trò |
|---|---|
| `deploy.sh` | Deploy lần đầu: tạo `.env` → build → nạp datadir MySQL → import seed → **áp migration còn thiếu** → chạy 3 service. |
| `update.sh` | Cập nhật code: chạy migration mới → build lại → `up -d`. |
| `scripts/migrate.sh` | Quản lý migration `database/*.sql` (tracking bảng `schema_migrations`). |
| `scripts/sync-data.sh` | Đồng bộ dữ liệu dev → VPS (chạy trên máy dev). |
| `docker-compose.simple.yml` | Stack production: `frontend` (Vite, `:5173`), `backend` (`Dockerfile.prod`, `:3000`), `mysql` (`8.0.44-debian`), `caddy` (profile `tls`, tùy chọn). |
| `docker/mysql-datadir.tar.gz` | Datadir MySQL init sẵn (khởi động nhanh, **không chứa bảng app**). |
| `docker/station_lite_dump.sql` | **Base schema + data cấu hình + 4 user seed** (xem mục 7). |
| `docker/mysql-init/01-app-user.sh` | Tạo user `station_app` (chỉ chạy khi volume MySQL trống hoàn toàn). |
| `docker/docker-compose.pma.yml` | phpMyAdmin (tùy chọn). |

`.env` do `deploy.sh` tạo và **bị gitignore** — không commit, không bị `git pull` ghi đè.

---

## 2. Yêu cầu VPS

- Ubuntu 22.04 / 24.04 LTS, tối thiểu **2 vCPU / 2 GB RAM** (1 GB thì bắt buộc thêm swap — Vite build dễ OOM), 40 GB SSD.
- Docker Engine + Compose plugin.
- Mở **outbound 443** (backend gọi 1Office / Turnstile / geocode / tile proxy).
- Mở **inbound** đúng 1 cổng web (`WEB_PORT`, mặc định `8081`) — **không** mở 3000/3306.

Swap (nếu RAM ≤ 2 GB):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 3. Deploy lần đầu

### 3.1 Clone đúng tên thư mục

Docker Compose đặt tên volume theo **tên thư mục project** (viết thường). Repo dùng tên **`DeXuatTram2`** → project `dexuattram2` → volume `dexuattram2_mysql_data`, `dexuattram2_uploads_data`. `deploy.sh` và `sync-data.sh` mặc định theo tên này.

> Nếu bạn bắt buộc clone vào tên khác, phải sửa biến `VOL`/`PROJECT` trong `deploy.sh` và truyền `--volume=...` cho `sync-data.sh`. Cách an toàn nhất: **clone đúng `DeXuatTram2`**.

### 3.2 Chạy

```bash
git clone https://github.com/Nguyen15idhue/DeXuatTram2.git
cd DeXuatTram2
chmod +x deploy.sh update.sh scripts/migrate.sh scripts/sync-data.sh
./deploy.sh

# Tùy chọn
./deploy.sh --port=8088     # đổi cổng web
./deploy.sh --skip-schema   # KHÔNG import seed + KHÔNG chạy migration
```

Kết thúc script in ra link `http://<IP>:<WEB_PORT>` và tài khoản `admin@station.com / 123456`.

### 3.3 `deploy.sh` làm gì

1. Tạo `.env` (nếu chưa có): MySQL `station_app`/`AppPass2026!` + root `RootPass2026!`, `JWT_SECRET` random, `WEB_PORT`, domain = `http://<IP>:<PORT>`, `ENABLE_SWAGGER=false`.
2. Build images (tự retry legacy builder nếu gặp `DeadlineExceeded`).
3. Nếu volume MySQL **chưa có datadir** → nạp `docker/mysql-datadir.tar.gz` (chown `999:999`) → MySQL khởi động tức thì.
4. Khởi động MySQL, chờ `healthy` (tối đa ~6 phút).
5. Nếu DB **chưa có bảng `users`** → import `docker/station_lite_dump.sql`.
6. **Áp migration còn thiếu**: đánh dấu các file `database/*.sql` có số **≤ `DUMP_MAX_MIGRATION` (mặc định 44)** là "đã có trong dump", rồi chạy `migrate.sh run` cho phần **> 44** (45→mới nhất). Nhờ vậy DB mới khớp hoàn toàn với mã nguồn.
7. Chạy backend + frontend (caddy KHÔNG chạy vì nằm trong profile `tls`).

Idempotent: chạy lại không mất dữ liệu và bỏ qua các bước đã làm.

> **Vì sao cần bước 6?** `docker/station_lite_dump.sql` là *base* (schema tới mốc ~44 + data cấu hình), không phải bản dump đầy đủ. Các migration 45+ tạo thêm `notifications`, `user_external_map`, `external_users`, `geocode_configs`, `geocode_cache` và các cột mới (duyệt đề xuất, cấu hình bản đồ). Xem mục 7 để biết khi nào cần cập nhật `DUMP_MAX_MIGRATION`.

### 3.4 Kiểm tra sau deploy

```bash
# Container
docker compose -f docker-compose.simple.yml ps
docker exec station-backend date          # phải hiện +07 (TZ Asia/Ho_Chi_Minh)

# API sống
curl -s -o /dev/null -w "api=%{http_code}\n" http://127.0.0.1:8081/api/test   # mong đợi 200

# DB: kỳ vọng tracked=112, tables=34
docker exec -i station-mysql sh -c 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" station_management' <<'SQL'
SELECT COUNT(*) AS tracked FROM schema_migrations;
SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema='station_management';
SELECT COUNT(*) AS missing_review_cols FROM information_schema.columns
  WHERE table_schema='station_management' AND table_name='station_proposals'
    AND column_name IN ('reject_reason','reviewed_by','reviewed_at');   -- kỳ vọng 3
SELECT COUNT(*) AS missing_map_cols FROM information_schema.columns
  WHERE table_schema='station_management' AND table_name='map_configs'
    AND column_name IN ('renderer','tile_mode','retina','default_mode','layers_config','enable_3d'); -- kỳ vọng 6
-- Tính năng BCĐX (Quản lý tài liệu): kỳ vọng templates=3, có 2 bảng mới
SELECT COUNT(*) AS doc_templates FROM document_templates;          -- kỳ vọng 3
SELECT COUNT(*) AS doc_constants FROM document_constants;          -- kỳ vọng >= 9
SELECT COUNT(*) AS has_help_tables FROM information_schema.tables
  WHERE table_schema='station_management' AND table_name IN ('help_articles','assistant_knowledge'); -- kỳ vọng 2
SQL
```

> `tracked` = số file migration trong `database/` (hiện **112**). `tables` = **34**. Nếu thiếu số nhiều → DB chưa chạy đủ migration, xem mục 7.

Sau đó mở web bằng trình duyệt: login, vào `/map`, `/admin/proposals`, chuông thông báo, `/admin/map-config` — đảm bảo không lỗi console.

---

## 4. Cập nhật khi có code mới

Trên VPS:

```bash
cd ~/DeXuatTram2
git pull origin ui-redesign
./update.sh
```

`update.sh` tự: `migrate.sh run` (áp file migration mới) → build lại → `up -d` → **seed template BCĐX** (best-effort) → index kho tri thức chatbot. Dữ liệu giữ nguyên.

Nếu `git pull` báo "local changes would be overwritten":

```bash
git checkout -- .
git pull origin ui-redesign
./update.sh
```

---

## 5. Cập nhật database (`migrate.sh`)

Thường **không cần chạy tay** (deploy.sh/update.sh đã chạy). Khi cần:

```bash
scripts/migrate.sh status          # xem file nào đã/chưa chạy
scripts/migrate.sh run             # chạy các file mới
scripts/migrate.sh mark <file>     # đánh dấu 1 file đã áp (không thực thi)
scripts/migrate.sh unmark <file>   # gỡ đánh dấu
scripts/migrate.sh mark-all --yes  # đánh dấu TẤT CẢ (chỉ khi DB cũ đã đúng schema mà thiếu tracking)
```

Quy tắc: migration viết **tiến tới**, đặt trong `database/`, đánh số tăng dần, **không DROP**, phải idempotent. DB trống thì **không** dùng runner (dùng datadir + dump).

> `migrate.sh` đọc `MYSQL_CONTAINER` từ biến môi trường (mặc định `station-mysql`) — hữu ích khi test với container khác.

---

## 6. Đồng bộ dữ liệu dev → VPS (`sync-data.sh`)

Chạy **trên máy dev**. Dùng khi muốn VPS có dữ liệu (user, trạm, đề xuất...) đã tạo trên dev.

```bash
bash scripts/sync-data.sh push --host root@<IP-VPS>
```

Mặc định **chỉ thêm** (bản ghi trùng PK/unique giữ theo VPS, không ghi đè), kèm đồng bộ uploads, và **backup VPS trước khi ghi** vào `/root/backups/`.

```bash
--no-uploads                 # chỉ DB, bỏ qua file
--full                       # GHI ĐÈ toàn bộ DB VPS bằng dev (chỉ khi thật cần)
--volume=<tên>               # nếu thư mục VPS không phải DeXuatTram2
--dry-run                    # xem trước
--yes                        # không hỏi xác nhận
bash scripts/sync-data.sh export --out dev.sql.gz   # xuất dev
bash scripts/sync-data.sh import dev.sql.gz --yes   # nhập vào dev
```

> **Bắt buộc**: trên VPS chạy `./update.sh` **trước** để schema đủ cột/bảng, rồi mới sync dữ liệu.

---

## 7. Ghi chú về seed DB (quan trọng)

- `docker/station_lite_dump.sql` = **base dump**: schema tới **mốc migration 44** + data cấu hình (forms/views/field_definitions/data_lists/map_configs/proposal_sequences) + **4 user seed** (SUPER_ADMIN/ADMIN/SALES/CTV). **Không chứa** token 1Office, API key geocode, hay dữ liệu nghiệp vụ.
- `deploy.sh` hoàn thiện schema bằng cách chạy các migration **> `DUMP_MAX_MIGRATION`**. Hằng số này nằm ở đầu `deploy.sh`:

  ```bash
  DUMP_MAX_MIGRATION=44   # dump phản ánh schema tới mốc này
  ```

- **Khi nào tăng `DUMP_MAX_MIGRATION`?** Khi bạn thay `docker/station_lite_dump.sql` bằng bản base mới (đã bao gồm thêm migration). Nếu **không** thay dump thì **không cần** đổi — cứ để 44, các migration mới tự chạy.
- **Tuyệt đối không** `mysqldump` toàn bộ DB dev rồi commit: sẽ lộ token 1Office (`api_configs`), API key geocode (`geocode_configs`), và dữ liệu/PII thật.
- `database/baseline/station_management_baseline.sql` là **artifact cũ** (16 bảng, mốc ~44), **không dùng** cho deploy hiện tại.

### 7.1 Vá VPS deploy bằng bản cũ (thiếu bảng)

Bản `deploy.sh` cũ chạy `mark-all` nên đánh dấu 45→67 là "đã chạy" mà **không thực thi** → DB thiếu `notifications`, `user_external_map`, `external_users`, `geocode_configs`, `geocode_cache` và các cột mới. Trên VPS đó, sau `git pull` chạy:

```bash
cd ~/DeXuatTram2

# Gỡ đánh dấu các migration CHƯA hề chạy (45→67), rồi áp thật
for f in database/4[5-9]*.sql database/5*.sql database/6*.sql; do
  [ -e "$f" ] && bash scripts/migrate.sh unmark "$(basename "$f")"
done
bash scripts/migrate.sh run
```

Nếu 1 file báo lỗi kiểu "Duplicate column/table" (nghĩa là phần đó đã có sẵn), đánh dấu nó rồi chạy tiếp:

```bash
bash scripts/migrate.sh mark <tên-file-vừa-lỗi>
bash scripts/migrate.sh run
```

Kiểm tra lại bằng truy vấn ở mục 3.4 (kỳ vọng `tracked=65`, `tables=22`).

### 7.2 `update.sh` dừng ở migration với lỗi `Unknown column` (mark mà không chạy)

Hiện tượng: `git pull && ./update.sh` chạy tới bước migration thì dừng, log kiểu:

```
[migrate] Chay 101-supplement-deadline-days.sql ...
ERROR 1054 (42S22): Unknown column 'supplement_deadline_at' in 'field list'
[migrate] LOI: Dung lai do loi. Sua script roi chay lai.
```

Nguyên nhân: các migration **phụ thuộc nhau** (97 tạo cột `supplement_deadline_at`, 101 mới dùng cột đó). Nếu 96–100 đã bị `mark` (đánh dấu "đã chạy") mà **không thực thi** — thường do tự `mark`/`mark-all` schema lên một mốc nào đó — thì migration sau sẽ thiếu cột/bảng.

Nếu log cho thấy `run` **nhảy thẳng tới `100-…`/`101-…`** mà bỏ qua `96-…`/`97-…`, đó là lỗi cũ của `migrate.sh`: `list_files` dùng `sort` chuỗi nên `100-*`/`101-*` đứng **trước** `95-*`…`99-*`, gặp lỗi là `break` luôn. Bản vá (`LC_ALL=C sort -V`) đã có trong repo — **`git pull` trước** rồi mới chạy lại.

Xử lý (mọi migration 96+ đều idempotent, có guard `information_schema` nên chạy lại an toàn):

```bash
cd ~/DeXuatTram2
git pull origin ui-redesign          # lấy bản vá migrate.sh (sort -V)

# Gỡ đánh dấu 96→101 rồi áp thật (đúng thứ tự số)
for f in database/9[6-9]*.sql database/10[0-1]*.sql; do
  [ -e "$f" ] && bash scripts/migrate.sh unmark "$(basename "$f")"
done
bash scripts/migrate.sh run
```

> Quy tắc chung: khi `update.sh` báo lỗi migration, **đừng** `mark` file đang lỗi nếu chưa xác minh schema — hãy `unmark` **toàn bộ nhóm phụ thuộc** rồi `run` lại. Lần `update.sh` lỗi sẽ
> **dừng trước bước build**, nên sau khi sửa migration **phải chạy lại `./update.sh`** để build + `up -d` (nếu không, web vẫn chạy image cũ).

Kiểm tra nhanh sau khi vá:

```bash
docker exec -i station-mysql sh -c 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' <<'SQL'
SELECT COUNT(*) AS has_deadline_col FROM information_schema.columns
  WHERE table_schema='station_management' AND table_name='station_proposals' AND column_name='supplement_deadline_at';
SELECT COLUMN_TYPE AS status_enum FROM information_schema.columns
  WHERE table_schema='station_management' AND table_name='station_proposals' AND column_name='status';
SELECT `key`,`value` FROM proposal_lifecycle_configs WHERE `key` LIKE '%supplement%';
SELECT COUNT(*) AS tracked FROM schema_migrations;
SQL
```

Kỳ vọng: `has_deadline_col=1`; `status_enum` chứa `PRINCIPLE_APPROVED`; config `review_supplement_days=3`, `principle_supplement_days=15`, `supplement_webhook_url` (rỗng = tắt).

### 7.3 Tính năng mới theo mã nguồn (migration 104→112) — có cần làm gì thêm?

Từ mốc **104** trở đi, schema có thêm nhiều bảng mới (hướng dẫn/chatbot, tài liệu BCĐX). Chỉ cần `git pull && ./update.sh` là đủ để **chạy migration + build**, vì:

| Mốc | Thêm gì | `update.sh` tự lo? |
|---|---|---|
| 104 | `help_categories` / `help_articles` / `assistant_logs` (+ FULLTEXT) | ✅ chạy migration |
| 105–106 | `assistant_knowledge` / `assistant_code_knowledge` | ✅ migration + `index-knowledge`/`index-code-knowledge` (best-effort) |
| 107–109 | mở role `guest`, `assistant_provider_configs`, `assistant_model_cache` | ✅ migration |
| 111 | `document_templates` / `document_constants` (Quản lý tài liệu BCĐX) | ✅ migration |
| 112 | chuẩn hoá hằng số BCĐX (`signer_tgd_*`) | ✅ migration |

**Riêng `document_templates` cần thêm file `.docx` mẫu** — migration chỉ tạo bảng, không tạo template. `update.sh`/`deploy.sh` đã tự chạy bước **seed best-effort** sau khi `up -d`:

```bash
# Chạy tự động trong update.sh/deploy.sh; muốn chạy tay:
docker compose -f docker-compose.simple.yml exec -T backend node scripts/seed-document-templates.js
```

Script lấy 3 mẫu `backend/templates/bcxd/{tdt,nq,lk}.docx` (có sẵn trong image) + mapping từ `build-bcxd-templates.js`, tạo bản ghi `files` + `document_templates`. **Idempotent**: đã có template theo `model` thì bỏ qua. Muốn cập nhật lại mapping (ghi đè) dùng `--force`:

```bash
docker compose -f docker-compose.simple.yml exec -T backend node scripts/seed-document-templates.js --force
```

Kiểm tra: vào `/admin/documents` (SUPER_ADMIN) phải thấy 3 mẫu "Báo cáo đề xuất TDT/NQ/LK"; hoặc:

```bash
docker compose -f docker-compose.simple.yml exec -T backend node /tmp/q-info.js   # TEMPLATES=[...] đủ 3
```

**Hằng số BCĐX** sửa tại `/admin/documents` (tab Hằng số) — không cần sửa code. Giá trị mặc định: `company_name`, `company_short`, `plan_tdt/lk/nq/npp`, `signer_ketoan`, `signer_tgd_tdt`, `signer_tgd_nq_lk`, `so_van_ban`.

**Chatbot hướng dẫn (tùy chọn)**: để bật, thêm vào `.env` trên VPS rồi `docker compose -f docker-compose.simple.yml up -d backend`:

```env
ASSISTANT_ENABLED=true
GEMINI_API_KEY=<key>            # provider chính
OPENROUTER_API_KEY=<key>        # dự phòng (tùy chọn)
```

Không có key thì nút chatbot vẫn ẩn (`GET /api/assistant/status` báo chưa cấu hình) — phần còn lại của app không ảnh hưởng.

> **Lưu ý file không commit**: `frontend/public/pmtiles/vietnam.pmtiles` (~300MB) bị gitignore. Nếu VPS dùng chế độ bản đồ self-host PMTiles thì phải copy file này thủ công (`docs/5/37`). Mặc định `map_configs` dùng provider online nên **không bắt buộc**.

---

## 8. Cloudflare & HTTPS (không dùng Caddy)

`docker-compose.simple.yml` có service `caddy` trong **profile `tls`** nên **không tự chạy** khi `up -d`. Với Cloudflare, bạn **không cần** Caddy.

### 8.1 Cách khuyến nghị — Cloudflare Tunnel (không mở cổng)

Cloudflare proxy (orange cloud) chỉ nhận các cổng `80, 8080, 8880...` / `443, 8443...` — **`8081` không nằm trong danh sách**, nên nếu giữ `WEB_PORT=8081` thì hãy dùng Tunnel.

```bash
# Trên VPS
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

cloudflared tunnel login
cloudflared tunnel create station
cloudflared tunnel route dns station station.yourdomain.com

sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml >/dev/null <<'YML'
tunnel: station
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: station.yourdomain.com
    service: http://localhost:8081
  - service: http_status:404
YML

sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Hoặc dùng giao diện **Cloudflare Zero Trust → Networks → Tunnels** (tạo tunnel, public hostname trỏ tới `http://localhost:8081`).

Sau khi có domain, cập nhật `.env` trên VPS rồi restart backend:

```env
CORS_ORIGINS=https://station.yourdomain.com
BASE_URL=https://station.yourdomain.com
FRONTEND_URL=https://station.yourdomain.com
```

```bash
docker compose -f docker-compose.simple.yml up -d backend
```

### 8.2 Cách khác — proxy orange-cloud + origin ở cổng được hỗ trợ

Nếu muốn dùng proxy DNS thường: đặt `WEB_PORT=8080` trong `.env` (cổng `8080` được Cloudflare proxy), mở 8080 trên firewall, DNS A record → IP VPS, bật proxy, SSL/TLS = **Flexible** (đơn giản) hoặc dựng reverse proxy trên `80/443` với **Cloudflare Origin Certificate** + SSL **Full (strict)** (an toàn hơn).

> **IP client thật**: sau Cloudflare (và qua Vite proxy) `app.set('trust proxy', 1)` có thể chưa đủ — IP dùng cho rate limit/ownership file có thể là IP proxy. Nếu cần chính xác, cân nhắc tăng số hop và cấu hình `CF-Connecting-IP`. Đây là cải tiến, không bắt buộc để chạy.

### 8.3 Bật lại Captcha (Turnstile) — tùy chọn

Mặc định tắt (`CAPTCHA_ENABLED=false`, key trống). Muốn bật:

1. Tạo Turnstile site/secret gắn domain trên Cloudflare.
2. `.env`: `CAPTCHA_ENABLED=true`, `TURNSTILE_SECRET_KEY=<secret>`.
3. `frontend/.env.production`: `VITE_TURNSTILE_SITE_KEY=<site_key>` → **phải rebuild frontend** (`./update.sh`).
4. Cần HTTPS thật (Tunnel/proxy đã có).

---

## 9. Vận hành & Backup

```bash
# Trạng thái / log
docker compose -f docker-compose.simple.yml ps
docker compose -f docker-compose.simple.yml logs -f
docker logs -f station-mysql

# Dừng / chạy lại (giữ dữ liệu)
docker compose -f docker-compose.simple.yml down
docker compose -f docker-compose.simple.yml up -d
```

**Backup định kỳ** (tên volume theo project `dexuattram2`):

```bash
mkdir -p /root/backups

# Database (đọc mật khẩu từ container, không lộ ra lệnh)
docker exec station-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --set-gtid-purged=OFF "$MYSQL_DATABASE" | gzip' \
  > /root/backups/db-$(date +%F).sql.gz

# File uploads
docker run --rm -v dexuattram2_uploads_data:/data -v /root/backups:/backup busybox \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

Restore:

```bash
# DB
gunzip -c /root/backups/db-2026-09-14.sql.gz | \
  docker exec -i station-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'

# Uploads
docker run --rm -v dexuattram2_uploads_data:/data -v /root/backups:/backup busybox \
  tar xzf /backup/uploads-2026-09-14.tar.gz -C /data
```

> **KHÔNG** dùng `docker compose ... down -v` (xoá volume → mất dữ liệu).

---

## 10. Bảo mật (VPS public)

1. Đổi mật khẩu `admin@station.com` **ngay**; xoá/khoá tài khoản test (`*@example.com`, `sales_test@...`).
2. **Rotate token 1Office** (từng lộ trong lịch sử git) và cập nhật vào bảng `api_configs` (qua UI `/admin/api-configs`).
3. Đổi mật khẩu MySQL mặc định (`RootPass2026!`, `AppPass2026!`) nếu muốn.
4. Giữ `ENABLE_SWAGGER=false`.
5. Không mở MySQL (3306) / backend (3000) ra ngoài.
6. Giữ `CAPTCHA_ENABLED=false` chỉ khi chưa cần; bật khi public rộng.

---

## 11. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Web không mở | `docker compose -f docker-compose.simple.yml ps`; mở đúng `WEB_PORT` trên firewall (hoặc kiểm tra Tunnel `systemctl status cloudflared`). |
| Lỗi `Failed to fetch` khi login | Backend chưa chạy: `docker start station-backend`; xem `docker logs --tail 40 station-backend`. |
| Backend `Exited` | Thường do DB thiếu bảng/cột. Chạy `scripts/migrate.sh status` và `scripts/migrate.sh run`. |
| MySQL `unhealthy` / chậm | Chạy lại `./deploy.sh` (tự nạp datadir, chờ tối đa ~6 phút). |
| Build lỗi `DeadlineExceeded` | `./update.sh` lại; nếu vẫn lỗi: `sudo systemctl restart docker`. |
| Import kẹt `Waiting for schema metadata lock` | Dừng backend trước khi import: `docker kill station-backend`. |
| Log MySQL `mbind: Operation not permitted` | Vô hại, bỏ qua. |
| Đã deploy bản cũ, thiếu bảng (`notifications`, `geocode_configs`...) | Xem **mục 7.1** (unmark 45→67 rồi `migrate.sh run`). |
| `update.sh` dừng ở migration: `Unknown column ... in 'field list'` | Migration phụ thuộc bị mark mà chưa chạy → xem **mục 7.2** (unmark 96→101 rồi `run`, sau đó **chạy lại `./update.sh`** để build). |
| `migrate.sh run` báo "DB da co du lieu nhung chua co tracking" | Chỉ khi schema đã đúng: `scripts/migrate.sh mark-all --yes` rồi `run`. Nếu DB còn thiếu bảng thì làm theo mục 7.1. |
| `/admin/documents` không có mẫu báo cáo / xuất BCĐX báo "Chưa cấu hình template" | Seed template chưa chạy. Chạy tay: `docker compose -f docker-compose.simple.yml exec -T backend node scripts/seed-document-templates.js` (xem mục 7.3). |
| Chatbot hướng dẫn không hiện nút | Chưa cấu hình `GEMINI_API_KEY`/`ASSISTANT_ENABLED=true` trong `.env` (xem mục 7.3). |

Kiểm tra nhanh:

```bash
docker ps -a --filter "name=station-"
curl -s -o /dev/null -w "api=%{http_code}\n" http://127.0.0.1:8081/api/test   # 200
```

---

## 12. Phụ lục

### 12.1 phpMyAdmin (tùy chọn)

```bash
docker compose -f docker/docker-compose.pma.yml up -d
ssh -L 8082:127.0.0.1:8082 root@<IP-VPS>   # rồi mở http://localhost:8082
```
Đăng nhập `root` / `RootPass2026!` (hoặc `station_app` / `AppPass2026!`).

### 12.2 Caddy (tùy chọn — chỉ khi KHÔNG dùng Cloudflare)

Service `caddy` nằm trong profile `tls`, cần `DOMAIN` trong `.env` và file `Caddyfile` (đã có sẵn):

```bash
# .env
DOMAIN=station.yourdomain.com   # Caddyfile dùng biến này
docker compose -f docker-compose.simple.yml --profile tls up -d
```

Caddy tự xin Let's Encrypt và forward về `frontend:5173`. Nếu đã dùng Cloudflare Tunnel thì **bỏ qua** mục này.

### 12.3 Kiến trúc deploy hiện tại

```
Cloudflare (Tunnel/Proxy)
        │  https://domain
        ▼
[host] WEB_PORT (mặc định 8081)
        ▼
container station-frontend (Vite dev server :5173)
   ├── serve SPA (React)              → proxy /api, /tiles
   ▼
container station-backend (:3000)    → container station-mysql (:3306)
```

> `docker-compose.simple.yml` dùng `frontend/Dockerfile` (Vite dev server). Repo **có sẵn** `frontend/Dockerfile.prod` + `frontend/nginx.conf` (build static + nginx) nếu sau này muốn chuyển sang phục vụ static cho nhẹ hơn — khi đó đổi `dockerfile: Dockerfile.prod`, map cổng `80`, và thêm proxy `/api`, `/tiles` (đã có trong `nginx.conf`).
