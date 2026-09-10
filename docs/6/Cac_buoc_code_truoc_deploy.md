# Các bước cần làm trên mã nguồn trước khi Deploy VPS

> Nguồn: `docs/6/Chuanbi_deploy.md` (mục 4 & 9). Tài liệu này là checklist thi công trên mã nguồn hiện tại.
> Trạng thái dùng: ⬜ Chưa làm · 🔄 Đang làm · ✅ Xong · ⚠️ Cần xem lại
> Kết quả test điền vào cột "Kết quả sau test".
>
> **Chốt tạm thời 10/09/2026:**
> - **TẮT CAPTCHA** khi deploy (`CAPTCHA_ENABLED=false`, `VITE_TURNSTILE_SITE_KEY=` để trống). Các bước liên quan Turnstile/Cloudflare Turnstile chỉ là **tùy chọn, hoãn lại** — không nằm trong phạm vi bắt buộc.
> - **Trỏ tên miền qua Cloudflare dashboard** (DNS/proxy/TLS), KHÔNG nhúng domain vào code. Code dùng `VITE_API_URL=/api` relative nên đổi domain không phải sửa/build lại code. Xem mục 16.

---

## 0. Bảng tổng hợp

| # | Hạng mục | File / vị trí | Mức độ | Trạng thái |
|---|---|---|---|---|
| 1 | `.dockerignore` (gốc + service) | `.dockerignore`, `frontend/.dockerignore`, `backend/.dockerignore` | Bắt buộc | ✅ |
| 2 | `frontend/Dockerfile.prod` | `frontend/Dockerfile.prod` | Bắt buộc | ✅ |
| 3 | `frontend/nginx.conf` | `frontend/nginx.conf` | Bắt buộc | ✅ |
| 4 | `frontend/.env.production` (captcha tắt) | `frontend/.env.production` | Bắt buộc | ✅ |
| 5 | `docker-compose.prod.yml` | `docker-compose.prod.yml` | Bắt buộc | ✅ |
| 6 | `trust proxy` (+ fix crash-loop queueWorker) | `backend/src/app.js` | Bắt buộc (bảo mật) | ✅ |
| 7 | Fix tile self-hosted `http→https` | `backend/src/services/mapConfigService.js`, `frontend/src/utils/tileProviders.js` | Cao | ✅ |
| 8 | Fix link file Excel + `BASE_URL` | `backend/src/services/excelService.js` | Cao | ✅ |
| 9 | Tắt/chặn Swagger production (+ fix YAML) | `backend/src/app.js`, `backend/src/routes/forms.js` | Cao (bảo mật) | ✅ |
| 10 | Chuẩn hóa `backend/Dockerfile` (+ fix lockfile) | `backend/Dockerfile.prod`, `backend/package-lock.json` | Trung bình | ✅ |
| 11 | Cập nhật `.env.example` | `.env.example` | Trung bình | ✅ |
| 12 | Rotate token 1Office + xóa seed | `database/37-seed-1office-api-config.sql` | Khẩn (bảo mật) | ✅ code / ⏳ rotate thủ công |
| 13 | Đổi mật khẩu tài khoản seed | DB runtime | Khẩn (bảo mật) | ⏳ chờ mật khẩu mới |
| 14 | (Tùy chọn) MySQL user riêng cho app | `.env` + DB runtime | Thấp | ⬜ (bỏ qua) |
| 15 | Tắt Captcha (tạm thời) | `.env`, `frontend/.env.production` | Bắt buộc | ✅ |
| 16 | Trỏ tên miền qua Cloudflare (không nhúng code) | Cloudflare dashboard + `.env` trên VPS | Bắt buộc khi public | ✅ code / ⏳ ops |

---

## 1. Tạo `.dockerignore`

### Yêu cầu cần đạt
- Build context không chứa `node_modules`, `.git`, `.env`, `storage/uploads`, `dist`, log, test artifacts.
- Image không bị ghi đè `node_modules` bằng binary của Windows host.

### Các bước chi tiết
1. Tạo `.dockerignore` ở gốc repo.
2. Tạo `frontend/.dockerignore` và `backend/.dockerignore` cùng nội dung (để build từng context cũng sạch).

Nội dung:
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

### Checklist test
- [x] `docker build` frontend không copy `node_modules` (kiểm tra log / kích thước context).
- [ ] `docker compose -f docker-compose.prod.yml build` chạy không lỗi. *(phụ thuộc bước 5 — test sau)*
- [x] Không có `.env` thật nằm trong image (`docker run --rm <image> ls -a`).

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | Build `./frontend` với `.dockerignore`: `docker run ... test -f /app/.env` → `ENV_ABSENT` (trước đây `.env` bị copy). `node_modules` trong image là do `npm install`, không lấy từ host. Đã xoá image test. |
| | ⬜ Pending | Test `docker compose -f docker-compose.prod.yml build` để sang bước 5. |

### Ghi chú
- Hiện repo không có file này → `COPY . .` đang kéo cả `node_modules` host.

---

## 2. Tạo `frontend/Dockerfile.prod`

### Yêu cầu cần đạt
- Build đa tầng: Node build → nginx serve static.
- Dùng `npm ci` (không `npm install`).
- Ảnh cuối không chứa source/node_modules.

### Các bước chi tiết
1. Tạo `frontend/Dockerfile.prod`:
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
2. Không sửa `frontend/Dockerfile` (giữ cho dev).

### Checklist test
- [x] `npm run build` trong container thành công.
- [x] Image cuối có `/usr/share/nginx/html/index.html`.
- [x] `docker images` cho thấy image prod nhỏ hơn image dev.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | `docker build --target build -f frontend/Dockerfile.prod ./frontend` → Vite build thành công (`✓ built in 11.01s`), sinh `dist/index.html` + assets. Dùng `npm ci`. |
| 10/09/2026 | ✅ PASS | Build full image + `docker run ... sh -c "test -f /usr/share/nginx/html/index.html"` → `INDEX_PRESENT`. Kích thước: prod `96.8MB` < dev `707MB`. |

### Ghi chú
- `frontend/.env.production` được Vite đọc tự động khi build (xem mục 4).

---

## 3. Tạo `frontend/nginx.conf`

### Yêu cầu cần đạt
- SPA fallback đúng, proxy `/api/` và `/tiles/` về backend.
- Upload 10MB không bị 413.
- Chuyển tiếp IP thật (`X-Forwarded-For`) để backend phân quyền/rate limit đúng.

### Các bước chi tiết
1. Tạo `frontend/nginx.conf`:
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 10m;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /tiles/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
2. Không thêm `location /uploads/` (backend không serve static).

### Checklist test
- [x] F5 tại route con (`/map`, `/admin/...`) không 404.
- [x] `POST /api/files/upload` file ~9MB trả 201, không 413.
- [x] `GET /tiles/{z}/{x}/{y}` trả ảnh PNG.
- [ ] Response API chứa header `X-Forwarded-For` (log backend thấy IP thật). *(xác minh đầy đủ ở bước 6 — cần `trust proxy`)*

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | Chạy container prod nối network `dexuattram2_station-network`: `nginx -t` syntax ok. `GET /` → 200; `GET /map` → 200 (SPA fallback); `GET /api/test` → JSON từ backend; `GET /tiles/0/0/0` → `image/png`. |
| 10/09/2026 | ✅ PASS | Upload qua nginx: file 9MB (PNG signature) → **201**, file 11MB → **413**. `client_max_body_size 10m` hoạt động đúng. File test đã xoá sau test. |

### Ghi chú
- Nếu dùng Caddy/host-nginx TLS phía trước, cần thêm header tương tự ở tầng đó.

---

## 4. Tạo `frontend/.env.production`

### Yêu cầu cần đạt
- `VITE_API_URL=/api` (relative), KHÔNG dùng URL tuyệt đối.
- **Captcha TẮT (chốt tạm thời)**: `VITE_TURNSTILE_SITE_KEY` để trống.

### Các bước chi tiết
1. Tạo `frontend/.env.production`:
```
VITE_API_URL=/api
VITE_TURNSTILE_SITE_KEY=
```
2. Xác nhận file KHÔNG bị `.gitignore` chặn (pattern `.env` không khớp `.env.production`).

### Checklist test
- [x] `git status` thấy `frontend/.env.production` (untracked/added được).
- [x] Build xong, `grep -r "localhost:3000" frontend/dist` không còn kết quả.
- [ ] Gọi API từ web dùng domain thật thành công. *(chỉ xác minh được trên VPS — bước 16)*
- [x] Mở trang guest proposal: **không** hiện widget Turnstile, vẫn submit được.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | `git check-ignore frontend/.env.production` → `NOT_IGNORED`; `git status` thấy `?? frontend/.env.production`. |
| 10/09/2026 | ✅ PASS | Build lại với `.env.production`: `docker run ... grep -rl 'localhost:3000' /app/dist` → `NO_LOCALHOST`. |
| 10/09/2026 | ✅ PASS | Script `frontend/test-deploy-step4-captcha.cjs` (Playwright, tiếng Việt) chạy trên bản build production: **6/6 đạt** — không nạp script/iframe/widget Turnstile, form "Nhập thông tin" và khu "Tra cứu đề xuất" hiển thị, không lỗi console. Kết quả: `frontend/test-deploy-step4-results.json`. |
| | ⬜ Pending | Submit guest qua web dùng domain thật kiểm tra ở bước 15/16. |

### Ghi chú
- `frontend/.env` bị gitignore → VPS clone không có; đây là lý do code fallback về `http://localhost:3000/api`.
- Khi bật lại captcha sau này chỉ cần điền site key + rebuild (xem mục 16), không sửa code.

---

## 5. Tạo `docker-compose.prod.yml`

### Yêu cầu cần đạt
- Frontend nginx expose đúng port; backend `npm start`; MySQL named volume + healthcheck.
- Tất cả service có `restart: unless-stopped`.
- Không expose 3000/3306 ra ngoài.

### Các bước chi tiết
1. Tạo `docker-compose.prod.yml` theo mục 3 của `Chuanbi_deploy.md`.
2. Frontend `ports: ["127.0.0.1:8080:80"]` (khi dùng host proxy TLS) hoặc `["80:80"]`.
3. `env_file: .env` cho backend và mysql; thêm `NODE_ENV=production`, `TZ=Asia/Ho_Chi_Minh`.
4. `volumes: mysql_data`, `uploads_data`.

### Checklist test
- [x] `docker compose -f docker-compose.prod.yml config` hợp lệ.
- [x] `up -d` → 3 container `Up`/`healthy`.
- [x] Reboot giả lập: `docker restart` tự lên lại.
- [x] `docker ps` không thấy port 3000/3306 publish ra `0.0.0.0`.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | `docker compose -f docker-compose.prod.yml config` hợp lệ. Dựng stack cách ly (`-p stationprodt` + override tạm) để không đụng dev: 3 container `Up`, mysql `healthy`. `GET /api/test` qua frontend → `environment: "production"`. `docker restart stationprodt-backend` → tự Up lại. Chỉ frontend publish `127.0.0.1:8080/18082`; backend/mysql chỉ `3000/tcp`, `3306/tcp` (không ra host). Đã dọn stack test. |

### Ghi chú
- Khác biệt cốt lõi so với `docker-compose.yml` dev: build static + `npm start`, không hot reload.
- **PHÁT HIỆN 1 (cần xử lý):** Trên DB trống, backend **crash-loop** vì `queueWorker.start()` (`app.js:106`) gọi `requeuePending()` khi bảng `api_queue_logs` chưa tồn tại → unhandled rejection làm tiến trình thoát. Trên VPS nếu `up` trước khi init DB sẽ thấy restart liên tục (tự phục hồi sau khi có schema). Đề xuất: bọc `queueWorker.start().catch(...)` (thực hiện ở bước 6 khi sửa `app.js`).
- **PHÁT HIỆN 2 (quan trọng):** Chạy tuần tự `database/01→44` trên DB trống phát sinh lỗi FK `form_fields`/`view_fields` (script 19, 22, 26, 28, 31, 41) và lỗi cú pháp `CREATE INDEX IF NOT EXISTS` trong `36-1office-api-configs.sql:101` (MySQL 8.0 không hỗ trợ). Nghĩa là **DB mới KHÔNG giống hệt DB dev** (một số form_fields/view_fields không được tạo). Cần đối chiếu/đưa dữ liệu còn thiếu vào script trước khi deploy. *(Ghi nhận, chưa sửa vì ngoài phạm vi bước 5.)*
- **PHÁT HIỆN 3:** Swagger báo lỗi YAML ở `backend/src/routes/forms.js:30` (`description` chứa dấu `:`), spec swagger không đầy đủ. Liên quan bước 9.

---

## 6. Thêm `trust proxy` trong backend

### Yêu cầu cần đạt
- `req.ip` là IP thật của client khi qua nginx.
- Rate limit và ownership file guest theo IP hoạt động đúng.

### Các bước chi tiết
1. Mở `backend/src/app.js`.
2. Thêm `app.set('trust proxy', 1);` ngay sau khi tạo `const app = express();` (trước helmet/CORS).

### Checklist test
- [x] Spam `POST /api/auth/login` từ 1 IP → bị 429 đúng ngưỡng.
- [x] Guest upload rồi guest khác IP không xem được file (ownership đúng).
- [x] Log/`req.ip` trả IP client, không phải IP container nginx.
- [x] Không còn cảnh báo express-rate-limit về `X-Forwarded-For`.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | Thêm `app.set('trust proxy', 1)` (`app.js:37`). Guest upload kèm `X-Forwarded-For: 198.51.100.23` → `files.submitter_ip = 198.51.100.23` (đúng IP client, không phải `172.19.0.1`). |
| 10/09/2026 | ✅ PASS | Spam login 35 lần cùng IP giả lập `198.51.100.99`: 30 lần đầu `400`, 5 lần sau `429` → rate limit theo IP hoạt động đúng. |
| 10/09/2026 | ✅ PASS | Guest upload IP `203.0.113.10` → `GET /api/files/:id/image` từ IP `203.0.113.11` → **403**; đúng IP `203.0.113.10` → **200**. Ownership theo IP đúng. File test đã xoá. |
| 10/09/2026 | ✅ PASS | Không còn log `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`. |
| 10/09/2026 | ✅ PASS | Fix kèm (Phát hiện 1): `queueWorker.start().catch(...)` tại `app.js` → không còn unhandled rejection làm crash backend khi bảng chưa tồn tại. |

### Ghi chú
- Thiếu dòng này là lỗi bảo mật/phân quyền nghiêm trọng sau reverse proxy.
- **CẦN LƯU Ý:** Khi đặt sau Cloudflare + proxy TLS (2 lớp), `trust proxy: 1` có thể chưa đủ; sẽ cân nhắc tăng số hop ở bước 16.

---

## 7. Fix tile self-hosted `http → https`

### Yêu cầu cần đạt
- Không bị mixed-content khi site chạy HTTPS.

### Các bước chi tiết
1. `backend/src/services/mapConfigService.js` (dòng 7-8): đổi `http://{domain}` → `https://{domain}` cho `tile_url` và `style_url`.
2. `frontend/src/utils/tileProviders.js` (dòng 80, 82, 96): tương tự.

### Checklist test
- [x] Trang map load không có lỗi mixed-content trong console.
- [x] Cấu hình self-hosted lưu vào DB không còn `http://`.
- [x] Các provider mặc định (OSM/MapLibre) vẫn hoạt động.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | Đổi toàn bộ `http://{domain}` → `https://{domain}` trong `mapConfigService.js` và `tileProviders.js` (3 vị trí). `grep` lại trong `src` → **KHÔNG CÒN**. |
| 10/09/2026 | ✅ PASS | `map_configs` trong DB dùng `https://{s}.tile.openstreetmap.org/...`, không có `http://`. |
| 10/09/2026 | ✅ PASS | Script `frontend/test-deploy-step7-map.cjs` (Playwright, tiếng Việt): **3/3 đạt** — `.leaflet-container` hiển thị, không lỗi Mixed Content, không tham chiếu `http://{domain}`. Kết quả: `frontend/test-deploy-step7-results.json`. |

### Ghi chú
- Chỉ ảnh hưởng khi dùng provider tự host; đã sửa để tránh mixed-content khi chạy HTTPS.

---

## 8. Fix link file Excel + `BASE_URL`

### Yêu cầu cần đạt
- Link file trong Excel export mở được.

### Các bước chi tiết
1. `backend/src/services/excelService.js` (dòng 324, 328): thay link `${baseUrl}/uploads/${f.storage_key}` bằng endpoint tồn tại `/api/files/{id}/download`.
2. Đảm bảo `.env` có `BASE_URL=https://domain.com`.

### Checklist test
- [x] Export Excel có link file.
- [x] Click link tải file thành công (đăng nhập đúng quyền).
- [x] Không còn tham chiếu `/uploads/` trong response export.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | `exportRowToValues` dùng `f.id` sinh link `${BASE_URL}/api/files/{id}/download?token=...`; truyền token từ `req.headers.authorization` cho `exportDynamic` và `exportDuplicates`. Thêm `BASE_URL=http://localhost:3000` vào `.env`. |
| 10/09/2026 | ✅ PASS | Export `station_proposals`: trong `xl/sharedStrings.xml` có **38 link** dạng `http://localhost:3000/api/files/{id}/download?token=...`, **không còn `/uploads/`**. |
| 10/09/2026 | ✅ PASS | Link kèm token tải được: `GET /api/files/1071/download?token=...` → **200**; không token → **403**. |
| | ⚠️ Lưu ý | Token JWT nhúng trong link sẽ hết hạn theo `JWT_EXPIRES_IN` (12h). Trên VPS đặt `BASE_URL=https://domain`. |

### Ghi chú
- Backend không có route `/uploads/*`; đây là lỗi có sẵn từ trước.
- **Lưu ý vận hành:** backend dev dùng `node --watch` nhưng không tự reload khi sửa file qua bind-mount trên Windows → cần `docker restart station-backend` sau mỗi lần sửa code (đã gặp ở bước 6 & 8).

---

## 9. Tắt / chặn Swagger trên production

### Yêu cầu cần đạt
- `/api-docs` không truy cập được từ internet trên production.

### Các bước chi tiết
1. `backend/src/app.js`: bọc đăng ký `/api-docs` và `/api-docs.json` trong điều kiện `process.env.ENABLE_SWAGGER !== 'false'` (hoặc chỉ bật khi `NODE_ENV !== 'production'`).
2. Thêm `ENABLE_SWAGGER=false` vào `.env` production.
3. (Phòng thủ thêm) chặn `/api-docs` theo IP ở nginx.

### Checklist test
- [x] Production: `GET /api-docs` → 404.
- [x] Dev/`ENABLE_SWAGGER=true`: Swagger vẫn mở được.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | `app.js`: bọc `/api-docs` + `/api-docs.json` trong `if (process.env.ENABLE_SWAGGER !== 'false')`, require `config/swagger` lazily (không build spec khi tắt). |
| 10/09/2026 | ✅ PASS | Chạy instance phụ `ENABLE_SWAGGER=false PORT=3999`: `/api-docs` → **404**, `/api-docs.json` → **404**, `/health` → **200**. |
| 10/09/2026 | ✅ PASS | Dev (không set biến): `/api-docs` → **200**, `/api-docs.json` → **200**. |
| 10/09/2026 | ✅ PASS | Fix kèm (Phát hiện 3): quote `description` tại `forms.js:133` → `require('./src/config/swagger')` không còn `YAMLSemanticError`. |
| | ⚠️ Lưu ý | Log vẫn in dòng "Swagger UI: ..." dù tắt (chỉ là log). Thêm `ENABLE_SWAGGER=false` vào `.env` VPS (bước 11). **Không** thêm vào `.env` dev để giữ Swagger dev. |

### Ghi chú
- Hiện `/api-docs` đang public mặc định.
- (Tùy chọn) chặn `/api-docs` theo IP ở nginx (bước 16).

---

## 10. Chuẩn hóa `backend/Dockerfile`

### Yêu cầu cần đạt
- Image prod gọn, chỉ dependency production, `NODE_ENV=production`.

### Các bước chi tiết
1. Tạo `backend/Dockerfile.prod` (hoặc sửa multi-stage):
```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```
2. Cập nhật `docker-compose.prod.yml` dùng `dockerfile: Dockerfile.prod` cho backend.

### Checklist test
- [x] Image build thành công, không có devDependencies.
- [x] Backend khởi động với `npm start` (không `--watch`).
- [x] `GET /health` trả `{status:"ok"}`.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ⚠️ Fix | `npm ci --omit=dev` **thất bại**: `backend/package-lock.json` lệch với `package.json` (thiếu `helmet`, `mathjs`, `swagger-jsdoc`, `swagger-ui-express`...). Đã chạy `npm install --package-lock-only` (node:20) → cập nhật lock (+589 dòng, 108.421 bytes, lockfileVersion 3). |
| 10/09/2026 | ✅ PASS | Build `backend/Dockerfile.prod` thành công. `docker inspect` → `NODE_ENV=production`. |
| 10/09/2026 | ✅ PASS | Chạy image prod (network dev, ENABLE_SWAGGER=false): `/health` → **200** `{status:"ok"}`, `/api/test` → `environment: "production"`, `/api-docs` → **404**. Đã dọn image/container test. |
| | ⚠️ Lưu ý | `docker-compose.prod.yml` đã đổi backend sang `dockerfile: Dockerfile.prod`. Cần commit `backend/package-lock.json` (không push). |

### Ghi chú
- Có thể đơn giản chỉ override `command` trong compose; nhưng tách Dockerfile.prod sạch hơn.
- **PHÁT HIỆN 4:** lockfile backend trước đây không đồng bộ → build dev dùng `npm install` nên không phát hiện. Cần đảm bảo dùng `npm ci` để build tái lập.

---

## 11. Cập nhật `.env.example`

### Yêu cầu cần đạt
- Phản ánh đủ biến code dùng, làm mẫu cho VPS.

### Các bước chi tiết
Bổ sung các biến:
```
NODE_ENV=production
PORT=3000
TZ=Asia/Ho_Chi_Minh
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=CHANGE_ME
DB_NAME=station_management
MYSQL_ROOT_PASSWORD=CHANGE_ME
MYSQL_DATABASE=station_management
JWT_SECRET=CHANGE_ME_64_HEX
JWT_EXPIRES_IN=12h
CORS_ORIGINS=https://yourdomain.com
BASE_URL=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
CAPTCHA_ENABLED=false
TURNSTILE_SECRET_KEY=
ORPHAN_FILE_TTL_HOURS=24
ENABLE_SWAGGER=false
```
Kèm ghi chú tạo `frontend/.env.production`.

### Checklist test
- [x] Đối chiếu mọi `process.env.*` trong backend đều có trong `.env.example`.
- [x] Không chứa secret thật.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | Đối chiếu 16 biến backend dùng (`BASE_URL, CAPTCHA_ENABLED, CORS_ORIGINS, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER, ENABLE_SWAGGER, FRONTEND_URL, JWT_EXPIRES_IN, JWT_SECRET, NODE_ENV, ORPHAN_FILE_TTL_HOURS, PORT, TURNSTILE_SECRET_KEY`) → **đủ trong `.env.example`**. Thêm cả `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE` cho container mysql. |
| 10/09/2026 | ✅ PASS | Không có secret thật; chỉ dùng placeholder `CHANGE_ME`. |

### Ghi chú
- `.env.example` cũ chỉ có 12 dòng, thiếu nhiều biến.
- **Captcha đang tắt**: giữ `CAPTCHA_ENABLED=false` và `TURNSTILE_SECRET_KEY=` (trống). Turnstile hoãn lại, xem mục 15-16.

---

## 12. Rotate token 1Office + xóa khỏi seed (KHẨN)

### Yêu cầu cần đạt
- Không còn token thật trong repo.
- Token đang dùng đã bị vô hiệu hóa và thay mới trong DB.

### Các bước chi tiết
1. Vào hệ thống 1Office → tạo token mới, thu hồi token cũ (token cũ đã bị lộ trong git).
2. Xóa/placeholder token trong `database/37-seed-1office-api-config.sql`.
3. Cập nhật token mới trực tiếp trong DB `api_configs` (không commit).

### Checklist test
- [x] `git grep "<token cũ đã lộ>"` không còn kết quả.
- [ ] Sync 1Office push/pull thành công với token mới.
- [ ] Token cũ trả 401 khi gọi API.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | Thay token trong `database/37-seed-1office-api-config.sql` bằng `CHANGE_ME_1OFFICE_TOKEN`. Quét toàn working tree (trừ `node_modules/.git`): **không còn token**. `git grep` → sạch. |
| 10/09/2026 | ✅ PASS | Dọn thêm token trong `test_files/1office/*.js` + `TEST_PLAN.md` → chuyển sang `process.env.ONE_OFFICE_TOKEN`. |
| | ⏳ Chờ thủ công | **Cần người dùng**: (a) thu hồi token cũ trên 1Office + tạo token mới; (b) cập nhật token mới vào DB `api_configs`. DB dev hiện vẫn giữ token cũ (`api_configs` id=3) — chưa đổi để không phá sync dev. |
| | ⚠️ Cảnh báo | Token vẫn tồn tại trong **lịch sử git**; nếu repo từng public cần coi token cũ đã lộ. Không push cho tới khi xử lý xong. |

### Ghi chú
- Đây là secret đã lộ trong lịch sử git → nên cân nhắc viết lại lịch sử hoặc chấp nhận rằng token đã bị lộ và đã rotate.

---

## 13. Đổi mật khẩu tài khoản seed (KHẨN)

### Yêu cầu cần đạt
- Không tài khoản nào dùng mật khẩu `123456`.

### Các bước chi tiết
1. Đăng nhập `admin@station.com` / `123456`.
2. Đổi mật khẩu admin + toàn bộ user seed (`user1@example.com`, ...).
3. Xác nhận `database/03-update-passwords.sql` chỉ là seed dev, không dùng lại.

Quy trình trên VPS (sau khi đã init DB):
```bash
# (a) Liệt kê tài khoản còn dùng mật khẩu mặc định (script kiểm tra bcrypt)
docker cp checkpw.js station-backend:/app/checkpw.js
docker exec -w /app station-backend node checkpw.js

# (b) Sinh hash mật khẩu mới
docker exec station-backend node -e "console.log(require('bcryptjs').hashSync('MatKhauMoiManh!',10))"

# (c) Cập nhật DB (hoặc qua UI admin)
docker exec -i station-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" station_management \
  --default-character-set=utf8mb4 -e "UPDATE users SET password='<hash>' WHERE email='admin@station.com';"
```

### Checklist test
- [ ] Login bằng `123456` thất bại.
- [ ] Login bằng mật khẩu mới thành công.
- [ ] Phân quyền SUPER_ADMIN/ADMIN/SALES/CTV đúng sau đổi.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ⚠️ Audit | Kiểm tra bcrypt trên 17 tài khoản DB: **16/17 dùng mật khẩu mặc định `123456`** (chỉ id 36 `testp4@example.com` khác). Danh sách cần đổi/xoá: `admin@station.com` (SUPER_ADMIN), `admin@admin.com` (ADMIN), `sales_test@example.com` (SALES), nhiều `@example.com` là tài khoản test. |
| | ⏳ Chờ thủ công | **Cần người dùng** chọn mật khẩu mạnh và đổi trên VPS (mục (b)(c)). **Không đổi trên DB dev** để giữ `admin@station.com/123456` cho test/dev (AGENTS + script Playwright). |
| | 📌 Đề xuất | Trên production nên **xoá/vô hiệu hoá tài khoản test** (`*@example.com`, `testrefactor`, `reg_test_rbac`, `testp4`...) thay vì chỉ đổi mật khẩu. |

### Ghi chú
- Bắt buộc làm ngay sau khi deploy xong và trước khi public domain.
- File `database/03-update-passwords.sql` chỉ là seed dev (hash mẫu), không dùng lại cho production.

---

## 14. (Tùy chọn) MySQL user riêng cho app

### Yêu cầu cần đạt
- Backend không dùng `root`.

### Các bước chi tiết
1. Trong MySQL: `CREATE USER 'station_app'@'%' IDENTIFIED BY '<mạnh>';` + `GRANT` trên `station_management.*`.
2. Đổi `DB_USER` / `DB_PASSWORD` trong `.env` (giữ `MYSQL_ROOT_PASSWORD` chỉ cho backup/cron).

### Checklist test
- [ ] Backend kết nối và chạy đủ chức năng với user mới.
- [ ] User mới không có quyền ngoài DB app.

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| | ⬜ Pending | |

### Ghi chú
- Ưu tiên thấp; có thể làm sau lần deploy đầu.

---

## 15. Tắt Captcha (tạm thời)

### Yêu cầu cần đạt
- Guest proposal tạo được mà không cần Turnstile.
- Không có lỗi console do thiếu site key; widget không render.

### Các bước chi tiết
1. Trong `.env` (backend): `CAPTCHA_ENABLED=false` và `TURNSTILE_SECRET_KEY=` (trống).
2. Trong `frontend/.env.production`: `VITE_TURNSTILE_SITE_KEY=` (trống).
3. Không cần sửa code: `GuestProposalPage.jsx:325` chỉ render widget khi `TURNSTILE_SITE_KEY` có giá trị; backend `proposalService.js:84` trả `true` khi `CAPTCHA_ENABLED === 'false'`.

### Checklist test
- [x] Trang guest proposal không hiện widget Turnstile.
- [x] Submit đề xuất guest thành công (có `user_id = null`).
- [x] Không có lỗi console liên quan `turnstile`/`challenges.cloudflare.com`.
- [ ] (Nếu bật lại) `CAPTCHA_ENABLED=true` + đủ 2 key → bắt buộc token hợp lệ. *(hoãn)*

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ PASS | Cấu hình: `CAPTCHA_ENABLED=false` (compose dev + `.env.example`), `VITE_TURNSTILE_SITE_KEY=` trống (`frontend/.env.production`). Không sửa code. |
| 10/09/2026 | ✅ PASS | UI: script `test-deploy-step4-captcha.cjs` → không nạp script/iframe/widget Turnstile, không lỗi console (đã test ở bước 4). |
| 10/09/2026 | ✅ PASS | API: `POST /api/proposals/guest` **không kèm** `captcha_token` → `success:true`, `user_id:null`, `submission_source:"guest"`, `submitter_ip` đúng, `ma_tinh` suy ra tự động. Đề xuất test id 421 đã xoá. |
| | ⚠️ Phát hiện | Guest submit còn yêu cầu trường động bắt buộc `province` (Tỉnh/Thành phố) — không liên quan captcha. |

### Ghi chú
- Bật lại sau này: tạo Turnstile site/secret key gắn domain trên Cloudflare, điền `VITE_TURNSTILE_SITE_KEY` (build-time → phải rebuild frontend) và `TURNSTILE_SECRET_KEY`, đặt `CAPTCHA_ENABLED=true`. Tất cả là config, không sửa code.
- Khi bật captcha cần HTTPS thật (Turnstile yêu cầu secure context).

---

## 16. Trỏ tên miền qua Cloudflare (không nhúng vào code)

### Yêu cầu cần đạt
- Domain trỏ về VPS qua Cloudflare dashboard, web chạy HTTPS bình thường.
- Không có domain nào hardcode trong code/build.

### Các bước chi tiết
1. Xác nhận code không hardcode domain: frontend dùng `VITE_API_URL=/api` (relative); backend không có env domain ở build.
2. Trên Cloudflare: tạo A record `@`/`www` → IP VPS, bật proxy. Đặt SSL/TLS = **Full (strict)** (cần Origin Certificate cho Caddy/nginx) hoặc dùng **Cloudflare Tunnel** nếu không muốn mở port.
3. Trên VPS, set biến môi trường (config, không phải code):
```
CORS_ORIGINS=https://yourdomain.com
BASE_URL=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
```
   Restart backend để nạp env.
4. Nếu Cloudflare proxy, cấu hình đọc IP thật ở nginx (`CF-Connecting-IP` / `real_ip`) và cân nhắc `trust proxy` phù hợp số lớp proxy.

### Checklist test
- [ ] `https://yourdomain.com` load web, redirect HTTP→HTTPS.
- [ ] API qua domain trả đúng (`/api/...`), login/thao tác OK.
- [ ] Bản đồ + geolocation chạy (secure context).
- [ ] Rate limit/ownership file nhận đúng IP client (không phải IP Cloudflare).
- [x] Đổi domain khác không cần sửa code, chỉ đổi env + DNS (build lại không bắt buộc vì `/api` relative).

### Kết quả sau test
| Lần test | Kết quả | Ghi chú |
|---|---|---|
| 10/09/2026 | ✅ Code-side | Xác nhận frontend dùng `VITE_API_URL=/api` (relative), dist không chứa `localhost:3000` (bước 4). Backend đọc domain từ env `CORS_ORIGINS/BASE_URL/FRONTEND_URL` — không hardcode. |
| | ⏳ Chờ thủ công | Tạo A record + proxy + SSL (Full strict) trên Cloudflare, set env domain trên VPS, restart backend. Cần domain + VPS thật mới test được. |

### Ghi chú
- `swagger.js:16` và `mapConfigService.js` self-hosted dùng `{domain}`/localhost chỉ mang tính tham chiếu; không ảnh hưởng vận hành web.
- Nếu dùng Cloudflare Tunnel: không cần mở 80/443 trên firewall VPS, nhưng vẫn cần set env domain như trên.
- **Quan trọng:** khi có thêm 1 lớp proxy (Cloudflare) trước nginx, cần cấu hình `real_ip`/`CF-Connecting-IP` ở nginx và cân nhắc `trust proxy` > 1 để IP client chính xác (liên quan bước 6).
- (Tùy chọn, bước 14) tạo MySQL user riêng — chưa thực hiện.

---

## 17. Ghi chú chung & thứ tự thực hiện đề xuất

1. **Trước khi code**: mục 12 (rotate token) — bảo mật, độc lập.
2. **Nhóm file hạ tầng**: mục 1 → 2 → 3 → 4 → 5 → 10 (tạo file + compose).
3. **Nhóm sửa code backend**: mục 6 → 7 → 8 → 9.
4. **Nhóm tài liệu/cấu hình**: mục 11 → 15 (tắt captcha).
5. **Sau deploy**: mục 13 → 14 → 16 (trỏ domain Cloudflare).
6. **Hoãn lại**: bật lại captcha Turnstile (ghi chú mục 15) khi thực sự cần.

### Quy tắc test chung (theo AGENTS.md)
- Backend test OK ≠ frontend OK → phải mở trình duyệt kiểm tra nút/gọi API/hiển thị.
- Chạy `npm run build` frontend không lỗi.
- Backend khởi động không lỗi, `/health` OK.
- Không phá vỡ chức năng hiện có.
- Docker container chạy, hot reload (dev) vẫn hoạt động.

### Nhật ký test tổng hợp
| Ngày | Người test | Hạng mục | Kết quả | Ghi chú |
|---|---|---|---|---|
| 10/09/2026 | Agent | 1-11, 15 | ✅ PASS | Chi tiết ở từng mục. Test trong stack cách ly `-p stationprodt` + script Playwright tiếng Việt. |
| 10/09/2026 | Agent | 12 | ✅ code / ⏳ manual | Đã xoá token khỏi mã nguồn; cần rotate trên 1Office + cập nhật DB. |
| 10/09/2026 | Agent | 13 | ⏳ manual | Audit 16/17 tài khoản dùng `123456`; cần mật khẩu mới do người dùng chọn. |
| 10/09/2026 | Agent | 16 | ✅ code / ⏳ ops | Code sẵn sàng (không hardcode domain); cần làm trên VPS + Cloudflare. |

### Kiểm tra cuối (theo AGENTS.md)
| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| Frontend prod build (`vite build`) | ✅ | `✓ built in 9.59s` sau toàn bộ chỉnh sửa. |
| Backend `npm start` (`/health`) | ✅ | Chạy trong `backend/Dockerfile.prod`, `environment: production`. |
| Docker containers | ✅ | `station-frontend/backend/mysql` Up (mysql healthy). |
| Đăng nhập + dữ liệu (stations, admin proposals) | ✅ | Smoke test API trả `success:true`. |
| Không phá vỡ chức năng hiện có | ✅ | Map (step 7), export (step 8), guest submit (step 15) hoạt động. |

### Việc còn lại (thủ công, ngoài môi trường này)
1. **Rotate token 1Office** + cập nhật `api_configs` (mục 12).
2. **Đổi mật khẩu/xoá tài khoản seed** trên VPS (mục 13).
3. **Tạo `.env` VPS** từ `.env.example` (điền secret mạnh, `ENABLE_SWAGGER=false`, `BASE_URL`/`CORS_ORIGINS`/`FRONTEND_URL` = domain).
4. **Cloudflare**: A record + proxy + SSL Full(strict)/Tunnel; cấu hình `real_ip`/`trust proxy` nếu cần (mục 16).
5. **Init DB trên VPS** theo `01→44` và xử lý **Phát hiện 2** (lỗi FK form_fields/view_fields + lỗi cú pháp `36-...:101`) trước khi coi là hoàn tất.
6. **Commit thay đổi** (KHÔNG push theo yêu cầu).
