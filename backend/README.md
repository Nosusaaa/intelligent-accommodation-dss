# Backend (FastAPI)

CSV 与 SQLite 数据库位于仓库根目录的 **`Data/`**（见 [`../Data/README.md`](../Data/README.md)）。`seed_data.py` 从该目录读取 CSV，并在同目录生成 **`airbnb_dss.db`**。

**若出现 `zsh: command not found: python`：** macOS 没有 `python` 这个命令，请一律改用 **`python3`**（以及 **`pip3`** 或 `python3 -m pip`）。

## 最快测试（在 `backend/` 目录，需已安装 `make`）

```bash
cd backend
make install   # 首次或依赖变更时：安装依赖
make seed      # 写入 SQLite
make dev       # 启动 API：http://127.0.0.1:8000  文档：http://127.0.0.1:8000/docs
```

在 macOS 上通常没有 `python` / `pip` 命令，请使用 **`python3`** 和 **`pip3`**，或先创建虚拟环境（推荐）。

## 方式 A：虚拟环境（推荐，激活后可用 `python` / `pip`）

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python seed_data.py
uvicorn main:app --reload
```

## 方式 B：不建虚拟环境，直接用系统 Python 3

```bash
cd backend
python3 -m pip install -r requirements.txt
python3 seed_data.py
python3 -m uvicorn main:app --reload
```

若提示没有 `python3`，需先安装 [Python](https://www.python.org/downloads/) 或通过 Homebrew：`brew install python`.

## 重启后端
```bash
python seed_data.py
uvicorn main:app --reload
```

## 地图与 Overpass（无 Key 公共实例）

全地图检索使用公共 Overpass（默认 `https://overpass-api.de/api/interpreter`），无需 API Key。

离线优先目录：`Data/map_cache/`（`pois_rochester.json`、`listings_geo_snapshot.json`、`tile_manifest.json`）。

构建离线缓存：

```bash
cd backend
python3 build_map_cache.py
```

可选环境变量：

- `OVERPASS_BASE_URL`：Overpass 接口地址
- `OVERPASS_FALLBACK_URLS`：备用实例列表（逗号分隔）
- `OVERPASS_TIMEOUT_SEC`：请求超时秒数（默认 `14`）
- `OVERPASS_USER_AGENT`：上游请求标识
- `OVERPASS_FAILURE_COOLDOWN_SEC`：单实例失败后冷却窗口（默认 `25` 秒）
- `MAP_CACHE_DIR`：离线 POI 缓存目录（默认 `Data/map_cache`）

## Post-stay reviews（住后评价）

- **存储文件**：与全库相同，均为仓库根目录 **`Data/airbnb_dss.db`**（由 `database.py` 指定路径；`*.db` 通常在 `.gitignore` 中，不会提交到 Git）。
- **相关表**：`user_stays`（用户标记「已住」）、`user_stay_reviews`（每条住后评价，与 `stay_id` / `listing_id` 关联）。应用启动时会确保 `user_stay_reviews` 表存在（见 `main.py` 中 `_ensure_user_stay_review_table`）。
- **写入**：`POST /api/users/{user_id}/stays/{listing_id}/review`（需先存在对应 `user_stays` 记录）。
- **读取（所有访客可见）**：`GET /api/listings/{listing_id}/stay-reviews` 返回该房源下全部住后评价（含 `reviewer_name`）。多用户只要连接**同一后端、同一 `airbnb_dss.db`**，即可互相看到评价。

**演示数据（可选）**：在 `backend/` 下执行 `python3 seed_post_stay_reviews.py`，从 [`../Data/post_stay_reviews_seed.json`](../Data/post_stay_reviews_seed.json) 导入示例用户（若不存在）、`user_stays` 与 `user_stay_reviews`（已存在则跳过）。请先完成 `python3 seed_data.py` 以生成房源数据。

### 团队共用一套数据（住后评价等）

`*.db` 不会进 Git，每人本机各有一份 SQLite 时，**互相看不到**对方写入的数据。要让全队看到同一份评价，需要 **一台机器跑唯一后端 + 唯一 `Data/airbnb_dss.db`**，其他人只连这台 API。

1. **宿主机器**（跑数据库与 API）在 `backend/` 执行：
   ```bash
   export CORS_ORIGINS=http://<你的局域网IP>:5173
   python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   若多名队友各自用本机 `npm run dev` 打开前端，把每个人的 `http://<队友IP>:5173` 都写进 `CORS_ORIGINS`，**逗号分隔**（见 [`.env.example`](.env.example)）。
2. **其他队友**在前端仓库复制 [`../frontend/.env.example`](../frontend/.env.example) 为 `frontend/.env`，设置：
   `VITE_API_BASE_URL=http://<宿主局域网IP>:8000/api`，然后重启 `npm run dev`。
3. 宿主也可不设 `VITE_API_BASE_URL`，仍用本机代理；**远端队友必须设** `VITE_API_BASE_URL` 指向宿主，否则会打到自己的 `127.0.0.1:8000`。

后端通过环境变量 **`CORS_ORIGINS`** 扩展允许的来源（与默认的 `localhost` / `127.0.0.1` 合并），逻辑见 `main.py` 中 `_cors_allow_origins()`。

相关 API：

- `GET /api/listings?map_mode=true&north=...&south=...&east=...&west=...`：按视口 bbox 过滤房源
- `GET /api/map/pois?north=...&south=...&east=...&west=...&category=transport`：查询 POI（离线优先），返回 `cached`、`upstream`、`fallback_used`、`source`、`generated_at`、`coverage`

维护策略：

- 存在离线缓存时，`/api/map/pois` 直接返回离线数据（`source=offline`）。
- 离线缓存缺失时，主 Overpass 失败后按 fallback 顺序自动重试。
- 全部上游失败时，`/api/map/pois` 返回 `502`，并触发短时熔断冷却，避免持续打挂公共实例。

## PoC：房源图片抓取（Playwright）

`run_scraper.py` 读取 `Data/airbnb_dss.db` 中前 10 条 `listings.id`，用 Chromium 打开 `https://www.airbnb.com/rooms/{id}`，提取 `muscache.com` 图片 URL（最多 5 张），结果写入仓库根目录 **`data/scraped_galleries.json`**（可断点续跑）。

```bash
cd backend
pip install -r requirements.txt
python3 -m playwright install chromium
python3 run_scraper.py
```

Airbnb 可能拦截自动化访问；本脚本仅供本地 PoC。
