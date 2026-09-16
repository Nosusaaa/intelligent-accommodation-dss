# 4007UI 产品功能说明（PRD 式功能列表）


| 项目   | 说明                                 |
| ---- | ---------------------------------- |
| 文档版本 | 0.2.5                              |
| 最后更新 | 2026-03-21                         |
| 代码范围 | 仓库内 `frontend/`、`backend/`、`Data/` |


本文档依据当前代码实现整理，用于对齐「已上线能力」与「演示/占位」边界；不包含未实现功能的承诺。

---

## 1. 产品概述

**定位**：面向民宿/短租房源的数据驱动浏览与决策辅助——支持多条件筛选、房源详情、评论情感分布、月度均价与入住率（预测/指标）展示；另含独立的管理端演示模块（与后端业务 API 无鉴权联动）。

**技术栈摘要**


| 层级  | 技术                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------- |
| 前端  | React 19、Vite 8、React Router 7、Tailwind CSS v4、axios、lucide-react、Recharts、Leaflet + react-leaflet |
| 后端  | FastAPI、SQLAlchemy、SQLite、bcrypt                                                                   |
| 数据  | `Data/` 下 CSV 与 `airbnb_dss.db`（详见 `[Data/README.md](../Data/README.md)`）                          |


---

## 2. 用户角色


| 角色          | 说明                                                                      |
| ----------- | ----------------------------------------------------------------------- |
| **访客 / 旅客** | 使用首页、可选注册/登录或游客进入、完成引导后使用搜索、详情、预测、对比（对比页部分为演示数据）。                       |
| **管理员**     | 通过 `/admin/login` 进入后台子路由；登录调用后端 `POST /api/admin/login`，数据持久化到 SQLite。 |


---

## 3. 旅客端功能（路由与能力）

路由定义见 `[frontend/src/App.jsx](../frontend/src/App.jsx)`；旅客主流程包裹在 `UserLayout`（顶栏：Onboarding、Smart Search、Compare）。全局使用 `CompareProvider` 维护对比列表。

### 3.1 页面与 API 对照


| 路由              | 页面                  | 后端 API / 数据                                                | 说明                                                                                                                      |
| --------------- | ------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/`             | 首页 `Home`           | 无                                                          | 营销落地；跳转旅客登录、管理员登录。                                                                                                      |
| `/guest-login`  | `GuestLogin`        | `POST /api/auth/signup`、`POST /api/auth/login`             | 注册/登录成功后跳转 `/search`；「以游客继续」直达 `/onboarding`，不调接口。前端未持久化 token，请求头不携带认证信息。                                              |
| `/onboarding`   | `SwipeOnboarding`   | 无                                                          | 滑动式偏好卡片（静态内容与占位图），完成后进入 `/search`。                                                                                      |
| `/search`       | `SmartSearch`       | `GET /api/listings`、`GET /api/map/pois`                    | 筛选、标签、分页列表、跳转详情；内置 Leaflet 真实地图，拖拽/缩放按 bbox 联动房源；可切换 POI 分类图层。类别选择会影响列表排序（`map_intent_score`）。每页 **12** 条（`PAGE_SIZE`）。 |
| `/details/:id`  | `PropertyDetails`   | `GET /api/listings/{id}`、`GET /api/listings/{id}/reviews`  | 展示 API 返回的房源与评论；情感图表与评论弹窗基于真实评论数据；部分文案/图集可能仍为占位。                                                                        |
| `/forecast/:id` | `ForecastDashboard` | `GET /api/listings/{id}`、`GET /api/listings/{id}/forecast` | 月度指标图表；无数据时使用基于当前价格的占位曲线。                                                                                               |
| `/compare`      | `RadarCompare`      | 无（对比维度为前端写死）                                               | 从 `CompareContext` 读取已选房源卡片信息；雷达图与对比表使用**预设演示分数/字段**，与所选 listing 的真实字段未一一对应。                                            |


### 3.2 智能搜索：`GET /api/listings` 参数（前端 → 后端）

前端通过 `[frontend/src/services/api.js](../frontend/src/services/api.js)` 请求 `baseURL`：`http://127.0.0.1:8000/api`。`vibe_tags` 以**重复 query 键**序列化（如 `vibe_tags=a&vibe_tags=b`），与 FastAPI `List[str]` 一致。

`[SmartSearch.jsx](../frontend/src/pages/SmartSearch.jsx)` 中 `buildListingParams` 映射关系：


| Query 参数                                                                             | 含义                                              | 前端来源                                        |
| ------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------- |
| `min_price` / `max_price`                                                            | 价格区间                                            | 价格筛选                                        |
| `guests`                                                                             | 最少容纳人数（`accommodates >= guests`）                | 步进器                                         |
| `bedrooms` / `beds` / `bathrooms`                                                    | 卧室/床/卫浴下限                                       | 步进器                                         |
| `room_type`                                                                          | 房型精确匹配，逗号分隔多个值                                  | 多选房型 label 拼接                               |
| `has_wifi`、`has_kitchen`、`has_air_conditioning`、`has_parking`、`has_tv`、`has_balcony` | 仅在为 `true` 时收紧条件                                | 设施多选                                        |
| `vibe_tags`                                                                          | 可重复；对 `listing_tags.vibe_tags` 做不区分大小写的子串匹配（OR） | 搜索启发标签 + 手动选中标签                             |
| `north` / `south` / `east` / `west`                                                  | 地图视口边界（bbox）                                    | 地图拖拽/缩放联动                                   |
| `map_mode`                                                                           | `true` 时启用 bbox 过滤                              | 地图联动请求                                      |
| `skip` / `limit`                                                                     | 分页                                              | `skip = (page - 1) * limit`，默认 `limit = 12` |


后端另支持未在前端使用的 `room_types`（重复 query）与 `room_type` 合并去重后筛选。`_listing_full` 同时返回 `latitude`、`longitude` 供地图 Marker 渲染。

### 3.6 地图与 POI（Overpass）

- 地图组件Map component：Leaflet + OpenStreetMap tile。
- 房源点位：来自 `GET /api/listings` 返回的 `latitude` / `longitude`。
- POI 图层：前端按当前 bbox 请求 `GET /api/map/pois`，默认分类 `transport`，支持 `park`、`restaurant`、`education`、`hospital`。
- 类别生效：所选 POI 分类会参与列表排序，按邻近度生成 `map_intent_score`（前端计算）并用于排序。
- 数据源策略：后端读取 `Data/map_cache/pois_rochester.json`（离线优先）；离线不可用时再走 Overpass 在线与 fallback。
- 稳定性策略：主实例失败时自动重试 fallback 实例；全部失败触发短时熔断窗口并返回可读错误，前端保持列表可用。
- 前端地图容错：地图子树异常由错误边界兜底，自动切换“仅列表模式”，并支持手动重试地图挂载。

### 3.3 跨页状态：对比列表

`[CompareContext](../frontend/src/context/CompareContext.jsx)` 提供 `add` / `remove` / `toggle` / `isInCompare` / `setCompareItems`，在搜索页卡片上可加入对比，托盘非空时可进入 `/compare`。

### 3.4 房源「展示价」规则（`price_clean`，方案 C — 仅前端）

**数据来源**：后端 `GET /api/listings` / `GET /api/listings/{id}` 返回的 `**price_clean`**（来自 SQLite `listings` 表；种子阶段缺失值可能被写成 `0`）。

**统一逻辑**（实现于 `[frontend/src/utils/listingPriceDisplay.js](../frontend/src/utils/listingPriceDisplay.js)`）：


| 条件                                                                 | UI 展示                                       |
| ------------------------------------------------------------------ | ------------------------------------------- |
| `price_clean` 为 `null` / `undefined`，或非有限数字，或 `**≤ 0`**（含 `**0**`） | 视为**无有效 nightly 价**，展示 `**询价`**（不按 `$0` 展示） |
| 为正有限数字                                                             | 展示 `**$` + 四舍五入整数**（如 `$129`）               |


**使用页面（与列表一致）**：

- **搜索列表** `[SmartSearch.jsx](../frontend/src/pages/SmartSearch.jsx)`：卡片右下角价签。
- **详情** `[PropertyDetails.jsx](../frontend/src/pages/PropertyDetails.jsx)`：Property details 区块增加 **「询价 / $N / night」** 一行，与列表同一套 `formatListingPriceDisplay`。
- **引导滑动** `[SwipeOnboarding.jsx](../frontend/src/pages/SwipeOnboarding.jsx)`：大卡片价格区；仅在有有效价时显示 **「/ night」** 后缀。
- **预测页** `[ForecastDashboard.jsx](../frontend/src/pages/ForecastDashboard.jsx)`：用 `getListingPriceNightly` 参与图表与建议逻辑；**无有效 `price_clean` 时**占位曲线基准为 **100 USD**（仅用于无月度数据时的示意，**不**在 UI 上显示为房源标价）。

**说明**：本规则**不修改**数据库与 API 字段；若需从根上消除 `0`，需在 ETL/种子层保留 `NULL` 或补全价格（见产品讨论，非本 PRD 范围）。

### 3.5 封面图 `picture_url` vs 抓取图库 `gallery_urls`


| 字段                 | 来源                                         | 使用场景                                                                                                                          |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `**picture_url`**  | CSV / 种子写入 `listings`                      | **搜索列表卡片主图**（`SmartSearch.jsx`）、**首页背景轮播**（`RoomSliderBackground.jsx` 仅 `l.picture_url`）。必须为 `http` 才使用，否则占位图。                |
| `**gallery_urls`** | PoC 抓取脚本 `update_galleries.py` 写入，逗号分隔 URL | **仅详情页** `[PropertyDetails.jsx](../frontend/src/pages/PropertyDetails.jsx)`：优先整段作为图库；无抓取数据时回退为单张 `picture_url` 或 Unsplash 占位。 |


**后端约束**：`[update_galleries.py](../backend/update_galleries.py)` **只更新 `gallery_urls`**，**不得**修改 `picture_url`。

**详情页图库**：解析 `gallery_urls.split(',')`；主 Hero 为 `displayImages[activeImage]`（默认首张为抓取图库 `[0]` 或回退封面）；缩略图为 `**displayImages.slice(1)`** 动态条数（`flex-wrap`），**不**固定 5 格。

---

## 4. 管理端功能（`/admin`）

布局见 `[AdminLayout.jsx](../frontend/src/components/layout/AdminLayout.jsx)`。`/admin` 重定向至 `/admin/sync`。

**2026-03-22 更新**：Admin 模块已与 FastAPI 后端完全对接，登录鉴权、景点管理、策略配置、同步日志均使用真实后端 API，数据持久化到 SQLite 数据库。


| 路由                | 页面                 | 后端 API                                                                                                            | 说明                                                    |
| ----------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `/admin/login`    | `AdminLogin`       | `POST /api/admin/login`                                                                                           | 调用后端验证，返回 username/email。默认账号：`admin` / `password123` |
| `/admin/sync`     | `DataSync`         | `GET /api/admin/sync-logs`、`POST /api/admin/sync-logs`                                                            | 同步日志从后端加载；Simulate Sync 同步成功后写入数据库。                   |
| `/admin/scenic`   | `ScenicManagement` | `GET /api/admin/scenics`、`POST /api/admin/scenics`、`PUT /api/admin/scenics/{id}`、`DELETE /api/admin/scenics/{id}` | 景点 CRUD；支持新增、编辑、删除、搜索。                                |
| `/admin/strategy` | `StrategyConfig`   | `GET /api/admin/strategy`、`PUT /api/admin/strategy`                                                               | 权重配置持久化到数据库；支持保存与加载上次配置。                              |


---

## 5. 后端 API 清单

实现文件：`[backend/main.py](../backend/main.py)`。应用标题 `Airbnb DSS API`，版本 `0.1.0`。启动时在 lifespan 内 `create_all` 建表。

**CORS**：允许来源 `http://localhost:5173`、`http://localhost:3000`。若开发时用 `http://127.0.0.1:5173` 打开前端，请求 API 时的 `Origin` 为 `127.0.0.1`，**不在**当前白名单内，需在 `main.py` 中扩展 `allow_origins` 或改用语义一致的访问地址。


| 方法   | 路径                 | 说明                                                                                                                                                  |
| ---- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST | `/api/auth/signup` | Body：`{ email, password }`；邮箱规范化后唯一；密码 bcrypt；成功返回注册消息。                                                                                             |
| POST | `/api/auth/login`  | 校验邮箱密码；成功返回 `message`、`email`。**无 JWT / Session / Bearer token**。                                                                                   |
| GET  | `/api/listings`    | 分页与筛选见第 3.2 节；响应含 `listings`、`total`、`skip`、`limit`。单条 listing 由 `_listing_full` 序列化（含关联的 `vibe_tags` 文本、`latitude`、`longitude`）。                   |
| GET  | `/api/listings`    | 分页与筛选见第 3.2 节；支持 `map_mode + bbox` 过滤；响应含 `listings`、`total`、`skip`、`limit`。单条 listing 由 `_listing_full` 序列化（含 `vibe_tags`、`latitude`、`longitude`）。 |
| GET  | `/api/map/pois`    | 以 bbox + `category` 查询 POI（离线优先）；返回 `pois`、`cached`、`upstream`、`fallback_used`、`source`、`generated_at`、`coverage`。                                  |


| GET  | `/api/listings/{listing_id}`          | 单条房源；404 若不存在。                                                                                             |
| GET  | `/api/listings/{listing_id}/forecast` | 该房源 `monthly_metrics`，按 `year_month` 排序。                                                                   |
| GET  | `/api/listings/{listing_id}/reviews`  | 该房源评论，按日期与 id 降序。                                                                                          |
| **Admin API** |||
| POST | `/api/admin/login`                    | Body：`{ username, password }`；bcrypt 验证；成功返回 `username`、`email`。                                              |
| GET  | `/api/admin/scenics`                  | 获取所有景点列表。                                                                                                    |
| POST | `/api/admin/scenics`                  | 新增景点；Body：`{ name, description, radius_km, thumbnail_url }`。                                                  |
| PUT  | `/api/admin/scenics/{id}`             | 更新景点；Body：`{ name, description, radius_km, thumbnail_url }`。                                                   |
| DELETE | `/api/admin/scenics/{id}`           | 删除景点。                                                                                                        |
| GET  | `/api/admin/strategy`                 | 获取策略配置（config_key = "default"）。                                                                             |
| PUT  | `/api/admin/strategy`                 | 保存策略配置；Body：`{ scenic_weight, cost_weight, sentiment_weight, preference_weight }`。                           |
| GET  | `/api/admin/sync-logs`                | 获取同步日志列表，按 id 降序。                                                                                         |
| POST | `/api/admin/sync-logs`                | 创建同步记录；Body：`{ file_type, status, records_updated }`。                                                      |

**鉴权**：列表、详情、预测、评论等**业务接口均未要求登录**，与数据库 `User` 表无绑定。

**文档**：FastAPI 自动生成 `/docs`、`/openapi.json`。

---

## 6. 数据模型与离线脚本（简述）

ORM 见 `[backend/models.py](../backend/models.py)`：`Listing`、`Calendar`、`MonthlyMetric`、`Review`、`ListingTag`、`User`、`AdminUser`、`ScenicSpot`、`StrategyConfig`、`SyncLog` 等。


| 脚本                                                                  | 作用                                                                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `[backend/seed_data.py](../backend/seed_data.py)`                   | 将 `Data/` 下清洗后的 CSV 写入 SQLite（房源、日历、月度指标、评论、listing 标签等）；运行前需按 README 准备数据路径。                        |
| `[backend/preprocess_reviews.py](../backend/preprocess_reviews.py)` | 使用 VADER 处理 `reviews_tags.csv` 的 `sentiment_label` 并写回 CSV；非 HTTP 服务。                                |
| `[backend/update_galleries.py](../backend/update_galleries.py)`     | 从 `Data/scraped_galleries.json`（或 `data/`）读入图库 URL，**仅**更新 `listings.gallery_urls`；不碰 `picture_url`。 |
| `[backend/overpass_client.py](../backend/overpass_client.py)`       | 组装 Overpass 查询并拉取 bbox POI 数据；由 `/api/map/pois` 调用。                                                  |
| `[backend/build_map_cache.py](../backend/build_map_cache.py)`       | 生成 `Data/map_cache/` 离线地图缓存（POI 分类、房源坐标快照、瓦片元数据索引）。                                                  |


仓库根说明：`[README.md](../README.md)`；数据目录说明：`[Data/README.md](../Data/README.md)`。

---

## 7. 已知限制（非功能需求说明）

1. **认证**：后端登录仅返回 JSON，前端不存储 token；所有 listing 相关接口公开可访问。
2. **旅客登录与业务数据**：注册用户信息未用于个性化推荐或权限控制。
3. **管理端**：Admin 模块已与后端完全对接，账号密码存储在数据库（bcrypt 加密），景点/策略/同步日志均持久化。
4. **对比页 `/compare`**：雷达图与表格指标为**写死演示数据**，不代表当前选中房源的真实计算结果。
5. **地图上游限制**：Overpass 为公共服务，可能限流或超时；后端已加入 fallback 与短时熔断，但极端情况下 POI 仍可能短时不可用（不影响列表检索）。
6. **CORS 与访问地址**：建议通过前端 `/api` 代理访问后端，避免本地跨域来源差异。

---

## 8. 修订记录


| 日期         | 变更                                                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-22 | 首版：基于当前前后端代码整理功能列表与 API。                                                                                                                                                                                                                        |
| 2026-03-22 | Admin 模块与后端完全对接：新增 AdminUser、ScenicSpot、StrategyConfig、SyncLog 模型及相关 CRUD API；前端各 Admin 页面改为调用后端接口。                                                                                                                                             |
| 2026-03-22 | 搜索页地图升级：新增 `ListingMap` 组件（Leaflet + react-leaflet），房源以蓝色 marker 显示，hover 房源时飞入放大并展开 1 km 虚线圆圈，通过 Overpass API 加载周边 POI；`Listing` 模型新增 `latitude`/`longitude` 字段，种子脚本同步更新，`GET /api/listings` 返回经纬度数据。地图默认中心为 Rochester, NY（43.1553, -77.6052）。 |
| 2026-03-22 | 地图 Rochester 边界增强：引入 `Data/neighbourhoods.geojson`（S/NE/NW/E 四社区 MultiPolygon）作为地理边界层，绘制社区蓝色 outline + 淡蓝填充；其余区域以半透明灰色遮罩（large Rectangle）形成聚焦效果；hover 社区显示 tooltip 标签；`Data/neighbourhoods.csv` 提供社区名单。                                         |
| 2026-03-22 | **v0.2.1**：新增 §3.4 — 房源 `price_clean` 前端展示统一规则（`null`/无效/≤0 显示「询价」，非 `$0`）；实现 `listingPriceDisplay.js`；搜索列表、详情、引导、预测页对齐；预测页无有效价时占位曲线基准 100。                                                                                                     |
| 2026-03-22 | **v0.2.2**：新增 §3.5 — 明确 `picture_url`（列表/首页）与 `gallery_urls`（详情图库）分工；`update_galleries.py` 仅写 `gallery_urls`；详情页图库动态条数、主图优先抓取序列；搜索卡与 `RoomSliderBackground` 仅绑定 `picture_url`。                                                                  |
| 2026-03-22 | **v0.2.3**：`/search` 升级为真实地图联动（Leaflet + OSM）；`/api/listings` 支持 `map_mode + bbox`；新增 `/api/map/pois`（Overpass）与后端缓存；文档补充 Overpass 公共实例配置。                                                                                                      |
| 2026-03-21 | **v0.2.4**：地图稳定性升级：依赖拓扑规范为 `frontend/` 单一依赖树；地图错误边界切换列表模式并支持重试；`/api/map/pois` 增加 fallback 上游、失败冷却窗口与 `upstream/fallback_used` 响应字段；补充前后端排障说明。                                                                                                  |
| 2026-03-21 | **v0.2.5**：地图离线优先：新增 `Data/map_cache` 与 `build_map_cache.py`；`/api/map/pois` 增加 `source/generated_at/coverage`；POI 类别选择参与列表排序（`map_intent_score`），不再仅影响图层显示。                                                                                    |

