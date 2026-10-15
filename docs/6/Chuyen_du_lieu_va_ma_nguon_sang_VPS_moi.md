# Chuyển dữ liệu + mã nguồn sang VPS mới (từ VPS đang chạy)

> Cập nhật: **15/10/2026**. Tài liệu chuẩn cho việc **dời toàn bộ hệ thống TMT-EGREEN (DeXuatTram2) từ VPS cũ đang chạy sang 1 VPS mới tinh chưa cài gì**, giữ nguyên dữ liệu và gián đoạn tối thiểu.
> Tài liệu vận hành chung (deploy mới/cập nhật): `docs/6/Huong_dan_deploy_va_cap_nhat_VPS.md` (đọc kèm, dưới đây gọi tắt là **tài liệu deploy**).

---

## 0. TL;DR + nguyên tắc an toàn

```bash
# VPS CŨ: kiểm tra sức khỏe + backup đầy đủ + checksum
./scripts/pre-migration-check.sh        # (tay, xem mục 2 — không có sẵn script, chạy từng lệnh)
docker exec station-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --events --hex-blob --set-gtid-purged=OFF --default-character-set=utf8mb4 "$MYSQL_DATABASE" | gzip' > /root/backups/full-$(date +%F).sql.gz
docker run --rm -v dexuattram2_uploads_data:/data -v /root/backups:/backup busybox tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
sha256sum /root/backups/*$(date +%F)* | tee /root/backups/SHA256SUMS

# VPS MỚI (Ubuntu trắng): user + firewall + swap + Docker (mục 4)
# Chép backup + .env + secrets/ + pmtiles sang VPS mới bằng scp/rsync (mục 5)

# VPS MỚI: git clone ĐÚNG tên DeXuatTram2 → đặt .env/secrets → build → dựng mysql → import dump → migrate run → bung uploads → up -d → kiểm tra (mục 6+8)
```

**5 nguyên tắc bắt buộc:**

1. **VPS cũ không đụng tới** cho đến khi VPS mới đã verify xong và DNS đã trỏ sang (giữ cũ chạy song song ít nhất 7 ngày).
2. **Clone đúng tên thư mục `DeXuatTram2`** trên VPS mới — Docker Compose đặt tên volume theo tên thư mục (`dexuattram2_mysql_data`, `dexuattram2_uploads_data`); sai tên là toàn bộ lệnh volume trong tài liệu này trật theo.
3. **Giữ nguyên mật khẩu MySQL + `JWT_SECRET` trên VPS mới** (copy `.env` cũ sang). Đổi pass DB là backend mất kết nối ngay; đổi `JWT_SECRET` là toàn bộ user bị logout. Muốn rotate thì làm **sau** khi đã cutover (mục 10).
4. **Mọi secret chỉ đi qua SSH/scp** (chmod 600), **không** qua chat/email/USB lạ, **không commit** (`.env`, `secrets/`, `frontend/.env.production`, `backups/` đều đã gitignore).
5. **Không `docker compose ... down -v`** ở bất kỳ đâu trong quá trình này (xóa volume = mất dữ liệu).

---

## 1. Kiểm kê thứ cần chuyển

| # | Thứ | Đang nằm ở VPS cũ | Ghi chú |
|---|---|---|---|
| 1 | Database đầy đủ | volume `dexuattram2_mysql_data` (container `station-mysql`) | Gồm cả `schema_migrations` + token 1Office trong `api_configs` + key geocode — đi theo dump là đúng, không tách |
| 2 | File uploads | volume `dexuattram2_uploads_data` (`/app/storage/uploads`: file đề xuất, avatar, video help, template `.docx` sau sửa bố cục, document versions) | Bắt buộc, nếu không ảnh/file 404 hàng loạt |
| 3 | `.env` (repo root) | `~/DeXuatTram2/.env` | Chứa DB pass, `JWT_SECRET`, webhook secrets, Gemini/OpenRouter keys, `BASE_URL`... — file quan trọng nhất ngoài DB |
| 4 | `secrets/` | `~/DeXuatTram2/secrets/` (VD `ggsheet-sa.json`, xem `GGSA_KEY_PATH`) | Gitignore, chỉ có trên VPS |
| 5 | `frontend/.env.production` | `~/DeXuatTram2/frontend/.env.production` | `VITE_TURNSTILE_SITE_KEY` (build-time; đổi key là phải rebuild frontend) |
| 6 | `vietnam.pmtiles` (nếu dùng) | `~/DeXuatTram2/frontend/public/pmtiles/*.pmtiles` (~300MB, gitignore) | Chỉ cần nếu bản đồ dùng self-host PMTiles (`docs/5/37`); provider online thì bỏ qua |
| 7 | Cấu hình Cloudflare Tunnel (nếu dùng) | `/etc/cloudflared/config.yml` + `/root/.cloudflared/<ID>.json` | Hoặc tạo tunnel mới cho VPS mới (khuyến nghị, mục 7) |
| 8 | Mã nguồn | GitHub `Nguyen15idhue/DeXuatTram2` — **clone mới, không copy tay** | Đảm bảo đúng branch đang chạy (`git branch --show-current` trên VPS cũ) |
| 9 | Backups cũ (tùy chọn) | `/root/backups/` | Copy sang để có lịch sử rollback |

Ước lượng dung lượng trước để chuẩn bị đĩa (VPS mới nên ≥ 40 GB như tài liệu deploy):

```bash
# Trên VPS CŨ:
df -h / /var/lib/docker | cat
docker system df | cat
docker exec station-mysql sh -c 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT table_schema, ROUND(SUM(data_length+index_length)/1024/1024,1) AS MB FROM information_schema.tables WHERE table_schema='\''station_management'\''"' | cat
docker run --rm -v dexuattram2_uploads_data:/data busybox du -sh /data | cat
du -sh ~/DeXuatTram2/frontend/public/pmtiles/ 2>/dev/null | cat
```

---

## 2. Chuẩn bị trên VPS CŨ (trước ngày chuyển)

### 2.1 Kiểm tra sức khỏe

```bash
cd ~/DeXuatTram2
git branch --show-current; git log --oneline -3 | cat        # ghi lại branch + commit đang chạy
docker compose -f docker-compose.simple.yml ps | cat
bash scripts/migrate.sh status | tail -5                     # phải không còn file "chưa chạy"
docker exec station-backend date | cat                       # phải +07
curl -s -o /dev/null -w "api=%{http_code}\n" http://127.0.0.1:${WEB_PORT:-8081}/api/test
```

Nếu `migrate.sh status` còn file chưa chạy → `bash scripts/migrate.sh run` cho sạch **trước** khi dump (DB chuyển đi phải ở schema mới nhất).

### 2.2 Hạ TTL DNS + thông báo (trước 24–48h)

- Hạ TTL bản ghi A/domain xuống **300 giây** để lúc cutover đổi IP có hiệu lực nhanh. Sau ổn định mới nâng lại.
- Thông báo khung giờ bảo trì cho người dùng (dù quy trình dưới đây downtime chỉ vài phút lúc khóa ghi cuối).
- Ghi lại: `WEB_PORT`, domain, `BASE_URL/CORS_ORIGINS/FRONTEND_URL` trong `.env`, tunnel name (nếu có), tài khoản test.

### 2.3 Chốt "điểm đóng băng" dữ liệu

Chọn 1 thời điểm `T0` làm backup cuối (khóa ghi). Mọi thay đổi sau `T0` trên VPS cũ sẽ **không** sang VPS mới (trừ khi sync delta, mục 12). Trước `T0` vài phút:

```bash
docker compose -f docker-compose.simple.yml stop backend   # dừng ghi DB (worker tự requeue job dở khi boot lại)
```

---

## 3. Backup toàn bộ trên VPS CŨ

```bash
mkdir -p /root/backups /root/migrate-new
TS=$(date +%Y%m%d-%H%M%S)

# 3.1 Database FULL (KHÁC với sync-data.sh: giữ nguyên schema + routines/triggers/events + schema_migrations)
docker exec station-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --events --hex-blob --set-gtid-purged=OFF --no-tablespaces --default-character-set=utf8mb4 "$MYSQL_DATABASE" | gzip' \
  > /root/migrate-new/full-$TS.sql.gz
[ -s /root/migrate-new/full-$TS.sql.gz ] || { echo "DUMP RONG - DUNG LAI"; exit 1; }

# 3.2 Uploads (volume, giữ nguyên owner/permissions trong tar)
docker run --rm -v dexuattram2_uploads_data:/data -v /root/migrate-new:/backup busybox \
  tar czf /backup/uploads-$TS.tar.gz -C /data .
[ -s /root/migrate-new/uploads-$TS.tar.gz ] || { echo "UPLOADS RONG - DUNG LAI"; exit 1; }

# 3.3 Đếm dòng đối chiếu (ghi ra file để sang VPS mới so)
for t in users stations station_proposals leads files data_lists document_templates schema_migrations; do
  n=$(docker exec station-mysql sh -c "mysql -N -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e \"SELECT COUNT(*) FROM $t\" \"\$MYSQL_DATABASE\"" 2>/dev/null | tr -d '\r\n ')
  echo "$t=$n"
done | tee /root/migrate-new/rowcounts-$TS.txt | cat

# 3.4 Kiểm tra archive mở được + checksum
gzip -t /root/migrate-new/full-$TS.sql.gz && echo "dump OK"
gzip -t /root/migrate-new/uploads-$TS.tar.gz && echo "uploads OK"
sha256sum /root/migrate-new/*-$TS.* > /root/migrate-new/SHA256SUMS-$TS.txt
cat /root/migrate-new/SHA256SUMS-$TS.txt

docker compose -f docker-compose.simple.yml start backend   # mở ghi lại (nếu chưa cutover ngay)
```

> Vì sao không dùng `sync-data.sh push --full`? Script đó sinh ra cho dev→VPS (mặc định merge `INSERT IGNORE`, bỏ `schema_migrations`), và chiều push cần VPS đích đã có project. Dời VPS→VPS cần **full fidelity** nên dump/restore trực tiếp như trên.

---

## 4. Dựng VPS MỚI từ con số 0

SSH vào VPS mới (root hoặc user sudo). Toàn bộ mục này chạy **trên VPS mới**.

### 4.1 Hệ điều hành + user + SSH

```bash
lsb_release -a                                    # kỳ vọng Ubuntu 22.04 / 24.04
apt update && apt -y upgrade
apt -y install curl git ufw openssl ca-certificates

# User vận hành (khỏi dùng root hàng ngày)
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
# chép public key của bạn vào:
nano /home/deploy/.ssh/authorized_keys            # dán 1 dòng ssh-ed25519/rsa...
chmod 600 /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh

# Củng cố SSH (làm sau khi chắc chắn key login được, giữ 1 phiên root dự phòng)
nano /etc/ssh/sshd_config
#   PermitRootLogin no
#   PasswordAuthentication no
systemctl reload ssh
```

### 4.2 Firewall — chỉ mở đúng cổng cần

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp                                  # SSH (đổi số nếu SSHD chạy cổng khác)
ufw allow 8081/tcp                                # WEB_PORT (đổi theo .env cũ)
# KHÔNG mở 3000 (backend), 3306 (mysql)
ufw --force enable
ufw status numbered | cat
```

### 4.3 Swap (RAM ≤ 4 GB nên có; build frontend dễ OOM)

```bash
free -h | cat
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 4.4 Cài Docker Engine + Compose plugin (chính chủ Docker)

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker --version && docker compose version
systemctl enable --now docker
usermod -aG docker deploy                        # login lại để có hiệu lực

# Kiểm tra khói:
docker run --rm hello-world | cat
```

> Không cài MySQL/nginx/phpMyAdmin trên host — mọi thứ chạy trong container như VPS cũ.

---

## 5. Chép dữ liệu sang VPS MỚI

Chạy từ **máy của bạn** (có SSH tới cả 2 VPS) hoặc từ VPS cũ. Dùng biến cho gọn:

```bash
OLD=root@<IP-VPS-CU>
NEW=root@<IP-VPS-MOI>        # hoặc deploy@... (sudo cho docker)
TS=20261015-093000           # timestamp đã backup ở mục 3
```

### 5.1 Kênh SSH phải thông

```bash
ssh -o BatchMode=yes $OLD "echo OLD-OK"
ssh -o BatchMode=yes $NEW "docker --version && echo NEW-OK"
```

### 5.2 Chép các gói (nén sẵn, có resume cho file lớn)

```bash
# DB + uploads + manifest đếm dòng (nhỏ, scp nhanh)
scp -C $OLD:/root/migrate-new/full-$TS.sql.gz \
       $OLD:/root/migrate-new/uploads-$TS.tar.gz \
       $OLD:/root/migrate-new/rowcounts-$TS.txt \
       $OLD:/root/migrate-new/SHA256SUMS-$TS.txt /tmp/

# Secret files (RIÊNG LẺ, không gộp chung chỗ công cộng):
scp -C $OLD:~/DeXuatTram2/.env /tmp/new-vps.env
scp -rC $OLD:~/DeXuatTram2/secrets /tmp/new-vps-secrets
scp -C $OLD:~/DeXuatTram2/frontend/.env.production /tmp/new-vps.frontend-env 2>/dev/null || echo "(khong co frontend/.env.production)"
# pmtiles ~300MB nếu dùng self-host (rsync resume được):
rsync -avP -e ssh $OLD:~/DeXuatTram2/frontend/public/pmtiles/ /tmp/pmtiles/ 2>/dev/null || echo "(khong co pmtiles)"

# Đẩy sang VPS mới:
scp -C /tmp/full-$TS.sql.gz /tmp/uploads-$TS.tar.gz /tmp/rowcounts-$TS.txt $NEW:/root/migrate-new/
scp -C /tmp/new-vps.env $NEW:/root/migrate-new/dot-env
scp -rC /tmp/new-vps-secrets $NEW:/root/migrate-new/secrets
scp -C /tmp/new-vps.frontend-env $NEW:/root/migrate-new/frontend-dot-env-production 2>/dev/null || true
rsync -avP /tmp/pmtiles/ -e ssh $NEW:/root/migrate-new/pmtiles/ 2>/dev/null || true

# Verify checksum ĐẦU-CUỐI (phải khớp từng byte):
ssh $OLD  "cd /root/migrate-new && sha256sum -c SHA256SUMS-$TS.txt"
ssh $NEW  "cd /root/migrate-new && sha256sum full-$TS.sql.gz uploads-$TS.tar.gz"
# Xóa bản trung gian trên máy bạn (đừng để .env nằm lại):
shred -u /tmp/new-vps.env 2>/dev/null || rm -P /tmp/new-vps.env 2>/dev/null || rm -f /tmp/new-vps.env
rm -rf /tmp/new-vps-secrets /tmp/full-$TS.sql.gz /tmp/uploads-$TS.tar.gz
```

---

## 6. Dựng hệ thống trên VPS MỚI (restore đầy đủ)

Toàn bộ chạy **trên VPS mới**, user có quyền docker. Giả sử branch đang chạy là `ui-redesign` (thay bằng branch ghi ở mục 2.1).

```bash
# 6.1 Clone ĐÚNG tên thư mục (quyết định tên volumes dexuattram2_*)
cd ~
git clone -b ui-redesign https://github.com/Nguyen15idhue/DeXuatTram2.git DeXuatTram2
cd ~/DeXuatTram2
git log --oneline -1 | cat
chmod +x deploy.sh update.sh scripts/*.sh

# 6.2 Đặt .env + secrets + frontend env (giữ nguyên password/JWT — xem nguyên tắc 3)
cp /root/migrate-new/dot-env .env
chmod 600 .env
cp -r /root/migrate-new/secrets ./secrets 2>/dev/null || true
chmod 600 secrets/* 2>/dev/null || true
cp /root/migrate-new/frontend-dot-env-production frontend/.env.production 2>/dev/null || true
mkdir -p frontend/public/pmtiles
cp /root/migrate-new/pmtiles/*.pmtiles frontend/public/pmtiles/ 2>/dev/null || true

# 6.3 Nếu ĐỔI domain/IP so với VPS cũ: sửa 3 dòng này trong .env (giữ nguyên phần còn lại!)
nano .env
#   CORS_ORIGINS=https://domain-moi.com
#   BASE_URL=https://domain-moi.com
#   FRONTEND_URL=https://domain-moi.com
#   (WEB_PORT giữ như cũ trừ khi muốn đổi cổng)

# 6.4 Build images (lần đầu vài phút)
docker compose -f docker-compose.simple.yml build || COMPOSE_BAKE=false DOCKER_BUILDKIT=0 docker compose -f docker-compose.simple.yml build

# 6.5 Dựng MySQL trắng (volume mới toanh) rồi IMPORT dump full
docker compose -f docker-compose.simple.yml up -d mysql
for i in $(seq 1 60); do
  s=$(docker inspect -f '{{.State.Health.Status}}' station-mysql 2>/dev/null || echo ...)
  [ "$s" = "healthy" ] && break
  sleep 5
done
docker inspect -f '{{.State.Health.Status}}' station-mysql | cat   # phải: healthy
gunzip -c /root/migrate-new/full-$TS.sql.gz | \
  docker compose -f docker-compose.simple.yml exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DATABASE"'

# 6.6 Chạy nốt migration mới hơn thời điểm dump (nếu repo mới hơn DB vài commit)
bash scripts/migrate.sh status | tail -5 | cat
bash scripts/migrate.sh run

# 6.7 Bung uploads vào volume (volume do compose tự tạo khi up mysql; tạo tường minh cho chắc)
docker volume create dexuattram2_uploads_data >/dev/null 2>&1 || true
docker run --rm -v dexuattram2_uploads_data:/data -v /root/migrate-new:/backup busybox \
  tar xzf /backup/uploads-$TS.tar.gz -C /data
docker run --rm -v dexuattram2_uploads_data:/data busybox ls /data | head | cat

# 6.8 Chạy toàn stack
docker compose -f docker-compose.simple.yml up -d
sleep 8
docker compose -f docker-compose.simple.yml ps | cat
docker exec station-backend date | cat                              # phải +07
curl -s -o /dev/null -w "api=%{http_code}\n" http://127.0.0.1:${WEB_PORT:-8081}/api/test   # 200
```

> Vì sao không chạy `./deploy.sh`? `deploy.sh` import **seed lite** khi DB trống — ở đây ta import **dump full** rồi nên bỏ qua deploy script, làm tay theo 6.4→6.8 để không lẫn 2 nguồn dữ liệu. (`deploy.sh --skip-schema` cũng được nhưng vẫn tạo `.env` mới với password khác — sai nguyên tắc 3, nên copy `.env` cũ như trên.)

---

## 7. Đổi DNS / Cloudflare sang VPS MỚI

### 7.1 Trường hợp dùng Cloudflare Tunnel (khuyến nghị — không mở cổng)

**Cách A — tunnel mới (sạch, khuyến nghị):** tạo tunnel mới trên VPS mới theo tài liệu deploy mục 8.1, public hostname tạm `new.domain.com` → kiểm tra xong mới đổi hostname chính sang VPS mới, xóa tunnel cũ sau 7 ngày.

**Cách B — mang tunnel cũ sang:** copy credentials (làm 1 lần, qua SSH):

```bash
# Trên VPS CŨ: xem tên tunnel + id
cloudflared tunnel list | cat
# Copy sang VPS mới (giữ nguyên path):
scp -r root@<IP-CU>:/root/.cloudflared /root/.cloudflared
scp root@<IP-CU>:/etc/cloudflared/config.yml /etc/cloudflared/config.yml
# Trên VPS MỚI: sửa service trỏ localhost:WEB_PORT rồi:
cloudflared service install
systemctl enable --now cloudflared
systemctl status cloudflared --no-pager | head -5
```

> Chỉ chạy tunnel ở **1 VPS tại 1 thời điểm** cho cùng hostname (trước cutover: tunnel mới dùng hostname tạm; sau cutover: dừng tunnel cũ).

### 7.2 Trường hợp DNS A record thường

1. Trên VPS mới mở web bằng **IP trực tiếp** `http://<IP-MOI>:<WEB_PORT>` kiểm tra xong hết (mục 8).
2. Đổi bản ghi A `domain.com` → IP mới (TTL đã hạ 300s ở mục 2.2).
3. Chờ 5–10 phút, kiểm tra `nslookup domain.com` từ 2–3 mạng, rồi mới cập nhật `.env` (`BASE_URL/...` → domain) + `docker compose ... up -d backend` + rebuild frontend nếu đổi `VITE_*`.

---

## 8. Kiểm tra sau chuyển (so VPS cũ ↔ mới)

### 8.1 Đối chiếu số liệu (phải khớp `rowcounts-*.txt` ở mục 3.3)

```bash
# Trên VPS MỚI:
docker exec -i station-mysql sh -c 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' <<'SQL' | cat
SELECT COUNT(*) AS tracked FROM schema_migrations;
SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema='station_management';
SELECT (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM stations) AS stations,
       (SELECT COUNT(*) FROM station_proposals) AS proposals,
       (SELECT COUNT(*) FROM leads) AS leads,
       (SELECT COUNT(*) FROM files) AS files;
SELECT COUNT(*) AS doc_templates FROM document_templates;
SELECT `key`,`value` FROM proposal_lifecycle_configs WHERE `key` LIKE '%supplement%' LIMIT 5;
SQL
diff <(sort /root/migrate-new/rowcounts-$TS.txt) <(echo "...paste số mới...") && echo "KHỚP"
```

### 8.2 Kiểm tra sống (mỗi dòng đều phải pass mới được cutover)

```bash
docker compose -f docker-compose.simple.yml ps | cat                    # 3 container Up (healthy với mysql)
docker exec station-backend date | cat                                  # +07
curl -s -o /dev/null -w "api=%{http_code}\n" http://127.0.0.1:${WEB_PORT:-8081}/api/test   # 200
curl -s http://127.0.0.1:${WEB_PORT:-8081}/api/test | head -c 300; echo
```

Mở trình duyệt kiểm tra tay (dùng hostname/IP tạm của VPS mới):

- [ ] Login `admin@station.com` (mật khẩu hiện tại — **không** phải 123456 nếu đã đổi) — session cũ còn hạn vẫn dùng được (cùng `JWT_SECRET`).
- [ ] `/map`: bản đồ hiện, marker + legend 2 cột, không khối trắng lạ, không banner tile lỗi.
- [ ] `/admin/proposals`: bảng + countdown "Chuyển TT", menu 3 chấm đủ mục.
- [ ] `/my-proposals`, `/admin/leads` (bulk Phân chia), `/admin/reports` (số liệu), `/admin/documents` (đủ 3 template TDT/NQ/LK), `/admin/help` (bài viết + video), `/huong-dan` (3 tab).
- [ ] Chuông thông báo có số; avatar user hiện (không vỡ — lỗi file 1197, xem tài liệu 79 §10.1 PW-R03).
- [ ] Tải 1 file đính kèm cũ (`/files/:id/download`) — kiểm tra uploads đã bung đúng.
- [ ] Nút chatbot ẩn/hiện đúng theo key (`/api/assistant/status`).
- [ ] Không lỗi đỏ console (F12) khi đi 1 vòng các trang.

---

## 9. Cutover + rollback

1. **Cutover:** khi §8 pass hết → dừng ghi ở VPS cũ (`stop backend`, mục 2.3) → nếu trong lúc verify có phát sinh dữ liệu mới trên VPS cũ sau `T0`, sync delta 1 lần bằng `sync-data.sh push` (merge, giữ VPS mới làm đích — đảo `--host` về VPS mới, chạy từ máy bạn) → đổi DNS/tunnel → mở VPS mới cho user.
2. **Giữ VPS cũ nguyên trạng 7–14 ngày** (chỉ `stop` container, không xóa): `docker compose -f docker-compose.simple.yml stop` — tốn ít tài nguyên, cần là `start` lại ngay.
3. **Rollback:** trỏ DNS/tunnel về IP cũ + `start` lại stack cũ. Vì DB mới và cũ đã rẽ nhánh sau cutover, rollback quá 24h cần cân nhắc dữ liệu phát sinh trên VPS mới (xuất delta ra trước khi revert).
4. Sau 14 ngày ổn định: snapshot/backup VPS mới 1 bản → mới được hủy VPS cũ (xóa theo quy trình nhà cung cấp, kèm xác nhận không còn traffic: check log Tunnel/DNS 48h = 0).

---

## 10. Sau cutover (trong 48h)

1. **Đổi mật khẩu admin + khóa tài khoản test** (nếu chưa làm ở VPS cũ thì làm ngay).
2. **Rotate secret (lên lịch, có thông báo):** `JWT_SECRET` mới → toàn bộ user phải login lại; `MYSQL_*_PASSWORD` mới → đổi cả trong MySQL (`ALTER USER`) lẫn `.env` rồi `up -d`; webhook secrets → cập nhật cả phía 1Office. (Vừa chuyển xong thì hệ thống đang dùng secret cũ copy sang — vẫn an toàn vì kênh chuyển là SSH, nhưng rotate định kỳ là đúng chính sách.)
3. Nâng TTL DNS về bình thường (3600+).
4. Bật backup định kỳ trên VPS mới (cron theo tài liệu deploy mục 9: dump DB + tar uploads vào `/root/backups`, giữ 5–7 bản).
5. Chạy `RUN_EXTRAS=1 ./update.sh` **một lần** để seed template BCĐX (thực ra đã có trong DB chuyển sang — bước này để chắc) + **index lại kho tri thức chatbot** (vì đường dẫn/source mới, xem AGENTS §4.5).
6. Cập nhật `AGENTS.md`/runbook nội bộ: IP mới, tunnel mới, nơi giữ backup, người phụ trách.

---

## 11. Xử lý sự cố

| Hiện tượng (VPS mới) | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `mysql` không healthy | Thiếu RAM/datadir lỗi | `docker logs --tail 60 station-mysql`; RAM ≤ 2GB thì thêm swap (mục 4.3); volume sai tên (phải `dexuattram2_*` → kiểm tra `docker volume ls`) |
| Backend `Exited`, log báo thiếu bảng/cột | Dump cũ hơn code / migration chưa chạy | `bash scripts/migrate.sh status` → `bash scripts/migrate.sh run` (xem tài liệu deploy mục 7.2) |
| Backend báo `Access denied for station_app` | `.env` mới có pass khác pass trong dump | Đồng bộ: đặt `DB_PASSWORD/MYSQL_APP_PASSWORD` về đúng pass cũ rồi `up -d` (nguyên tắc 3) |
| Login báo sai pass dù đúng | Nhầm DB (đang dùng seed lite thay vì dump full) | Kiểm tra `users` count có khớp rowcounts không; import lại dump mục 6.5 |
| Web trắng / `Failed to fetch` | Backend chưa lên; sai `WEB_PORT`/firewall | `ps`, `docker logs --tail 40 station-backend`, `ufw status`, kiểm tra `VITE_API_URL=/api` |
| Ảnh/file cũ 404 hàng loạt | Volume uploads sai tên hoặc bung sai path | `docker volume ls`, bung lại mục 6.7 (tar phải `-C /data`, không lồng thêm thư mục) |
| Bản đồ tile trắng | Outbound 443 bị chặn / provider key | `curl -sI https://tile.openstreetmap.de` từ VPS mới; kiểm tra `map_configs` |
| Checksum 2 đầu không khớp | File lỗi khi chép | Chép lại file đó bằng `rsync --partial`, verify lại; không restore khi checksum sai |
| Import dump báo `Unknown database` | `MYSQL_DATABASE` trong `.env` khác tên DB trong dump | Thống nhất `station_management` 2 bên |
| Tunnel không lên sau khi mang sang | Chạy 2 tunnel cùng hostname / sai ID | 1 hostname chỉ 1 tunnel active; `cloudflared tunnel list`, `journalctl -u cloudflared -n 50` |

---

## 12. Phụ lục: biến thể downtime ≈ 0 (pre-seed + delta cuối)

Khi DB lớn hoặc không muốn khóa ghi lâu:

1. Trước ngày chuyển 1–2 ngày: làm full 1 vòng mục 3→6 (pre-seed) trong lúc VPS cũ vẫn phục vụ bình thường (không `stop backend`).
2. Đến giờ cutover: `stop backend` VPS cũ → dump **delta** bằng `sync-data.sh push` (merge, chỉ thêm bản ghi mới — nhanh hơn full nhiều) từ máy bạn với `--host` = VPS mới → `start backend` cả 2 bên → verify nhanh §8 → đổi DNS.
3. Lưu ý merge giữ bản ghi VPS mới khi trùng PK/unique — đúng cho delta tiến tới; **không** dùng merge để sửa dữ liệu đã lệch (lệch thì làm lại full).

---

## 13. Checklist 1 trang (in ra đánh dấu)

- [ ] Ghi branch/commit VPS cũ; `migrate.sh status` sạch; hạ TTL DNS; thông báo bảo trì
- [ ] Backup full DB + uploads + rowcounts + `gzip -t` + SHA256 (mục 3)
- [ ] VPS mới: Ubuntu update, user `deploy` + key, SSH hardening, ufw (22 + WEB_PORT), swap, Docker + `hello-world`
- [ ] Chép backup + `.env` + `secrets/` + `frontend/.env.production` + pmtiles; checksum khớp; xóa bản trung gian
- [ ] Clone đúng `DeXuatTram2`; đặt secrets (chmod 600); sửa domain trong `.env` nếu đổi; build images
- [ ] Dựng mysql → import dump → `migrate.sh run` → bung uploads → `up -d`
- [ ] Đối chiếu rowcounts + tracked/tables; `/api/test` = 200; `date` +07
- [ ] Click-through trình duyệt full §8.2 (map, proposals, leads, reports, documents, help, bell, file, chat)
- [ ] Cutover DNS/tunnel → verify propagation → giữ VPS cũ 7–14 ngày
- [ ] Sau cutover: đổi pass admin, lên lịch rotate secret, nâng TTL, cron backup, `RUN_EXTRAS=1 ./update.sh`, cập nhật runbook
