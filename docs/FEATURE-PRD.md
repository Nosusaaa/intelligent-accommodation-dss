# 4007UI 产品功能说明（PRD 式功能列表）


| 项目   | 说明                                 |
| ---- | ---------------------------------- |
| 文档版本 | 0.4.0                              |
| 最后更新 | 2026-03-22                         |
| 代码范围 | 仓库内 `frontend/`、`backend/`、`Data/` |


本文档依据当前代码实现整理，用于对齐「已上线能力」与「演示/占位」边界；不包含未实现功能的承诺。

---

## 1. 产品概述

**定位**：面向民宿/短租房源的数据驱动浏览与决策辅助——支持多条件筛选、房源详情、评论情感分布、月度均价与入住率（预测/指标）展示；另含独立的管理端演示模块（与后端业务 API 无鉴权联动）。

**技术栈摘要**


| 层级  | 技术                                                                         |
| --- | -------------------------------------------------------------------------- |
| 前端  | React 19、Vite 8、React Router 7、Tailwind CSS v4、axios、lucide-react、Recharts、Leaflet + react-leaflet |
| 后端  | FastAPI、SQLAlchemy、SQLite、bcrypt                                           |
| 数据  | `Data/` 下 CSV 与 `airbnb_dss.db`（详见 `[Data/README.md](../Data/README.md)`）  |


---

## 2. 用户角色


| 角色            | 说明                                                      |
| ------------- | ------------------------------------------------------- |
| **访客 / 旅客**   | 使用首页、可选注册/登录或游客进入、完成引导后使用搜索、详情、预测、对比（对比页部分为演示数据）。       |
| **管理员** | 通过 `/admin/login` 进入后台子路由；登录调用后端 `POST /api/admin/login`，数据持久化到 SQLite。 |


---

## 3. 旅客端功能（路由与能力）

路由定义见 `[frontend/src/App.jsx](../frontend/src/App.jsx)`；旅客主流程包裹在 `UserLayout`（顶栏：Onboarding、Smart Search、Compare）。全局使用 `CompareProvider` 维护对比列表。

### 3.1 页面与 API 对照


| 路由              | 页面                  | 后端 API / 数据                                                | 说明                                                                           |
| --------------- | ------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `/`             | 首页 `Home`           | 无                                                          | 营销落地；跳转旅客登录、管理员登录。                                                           |
| `/guest-login`  | `GuestLogin`        | `POST /api/auth/signup`、`POST /api/auth/login`             | 注册/登录成功后跳转 `/search`；「以游客继续」直达 `/onboarding`，不调接口。前端未持久化 token，请求头不携带认证信息。   |
| `/onboarding`   | `SwipeOnboarding`   | 无                                                          | 滑动式偏好卡片（静态内容与占位图），完成后进入 `/search`。                                           |
| `/search`       | `SmartSearch`       | `GET /api/listings`                                        | 筛选、标签、分页列表、跳转详情；地图区域为 Leaflet 真实交互地图，基于 `Data/neighbourhoods.geojson`（Rochester S/NE/NW/E 四个社区多边形）绘制社区边界线（蓝色 outline + 淡蓝填充），其余区域以半透明灰色遮罩覆盖，形成「聚焦 Rochester」视觉效果；房源以蓝色 marker 显示，hover 房源时飞入放大并展开 1 km 虚线圆圈，通过 Overpass API 加载该房源周边 POI（橙色餐厅 + 绿色景点各最多 8 个），hover POI 显示到当前房源的 Haversine 距离。地图默认中心为 Rochester, NY（43.1553, -77.6052）。每页 **12** 条（`PAGE_SIZE`）。    |
| `/details/:id`  | `PropertyDetails`   | `GET /api/listings/{id}`、`GET /api/listings/{id}/reviews`  | 展示 API 返回的房源与评论；情感图表与评论弹窗基于真实评论数据；部分文案/图集可能仍为占位。                             |
| `/forecast/:id` | `ForecastDashboard` | `GET /api/listings/{id}`、`GET /api/listings/{id}/forecast` | 月度指标图表；无数据时使用基于当前价格的占位曲线。                                                    |
| `/compare`      | `RadarCompare`      | 无（对比维度为前端写死）                                               | 从 `CompareContext` 读取已选房源卡片信息；雷达图与对比表使用**预设演示分数/字段**，与所选 listing 的真实字段未一一对应。 |


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
| `skip` / `limit`                                                                     | 分页                                              | `skip = (page - 1) * limit`，默认 `limit = 12` |


后端另支持未在前端使用的 `room_types`（重复 query）与 `room_type` 合并去重后筛选。

### 3.3 跨页状态：对比列表

`[CompareContext](../frontend/src/context/CompareContext.jsx)` 提供 `add` / `remove` / `toggle` / `isInCompare` / `setCompareItems`，在搜索页卡片上可加入对比，托盘非空时可进入 `/compare`。

### 3.4 房源「展示价」规则（`price_clean`，方案 C — 仅前端）

**数据来源**：后端 `GET /api/listings` / `GET /api/listings/{id}` 返回的 **`price_clean`**（来自 SQLite `listings` 表；种子阶段缺失值可能被写成 `0`）。

**统一逻辑**（实现于 `[frontend/src/utils/listingPriceDisplay.js](../frontend/src/utils/listingPriceDisplay.js)`）：

| 条件 | UI 展示 |
| --- | --- |
| `price_clean` 为 `null` / `undefined`，或非有限数字，或 **`≤ 0`**（含 **`0`**） | 视为**无有效 nightly 价**，展示 **`询价`**（不按 `$0` 展示） |
| 为正有限数字 | 展示 **`$` + 四舍五入整数**（如 `$129`） |

**使用页面（与列表一致）**：

- **搜索列表** `[SmartSearch.jsx](../frontend/src/pages/SmartSearch.jsx)`：卡片右下角价签。
- **详情** `[PropertyDetails.jsx](../frontend/src/pages/PropertyDetails.jsx)`：Property details 区块增加 **「询价 / $N / night」** 一行，与列表同一套 `formatListingPriceDisplay`。
- **引导滑动** `[SwipeOnboarding.jsx](../frontend/src/pages/SwipeOnboarding.jsx)`：大卡片价格区；仅在有有效价时显示 **「/ night」** 后缀。
- **预测页** `[ForecastDashboard.jsx](../frontend/src/pages/ForecastDashboard.jsx)`：用 `getListingPriceNightly` 参与图表与建议逻辑；**无有效 `price_clean` 时**占位曲线基准为 **100 USD**（仅用于无月度数据时的示意，**不**在 UI 上显示为房源标价）。

**说明**：本规则**不修改**数据库与 API 字段；若需从根上消除 `0`，需在 ETL/种子层保留 `NULL` 或补全价格（见产品讨论，非本 PRD 范围）。

---

## 4. 管理端功能（`/admin`）

布局见 `[AdminLayout.jsx](../frontend/src/components/layout/AdminLayout.jsx)`。`/admin` 重定向至 `/admin/sync`。

**2026-03-22 更新**：Admin 模块已与 FastAPI 后端完全对接，登录鉴权、景点管理、策略配置、同步日志均使用真实后端 API，数据持久化到 SQLite 数据库。


| 路由                | 页面                 | 后端 API | 说明                                                               |
| ----------------- | ------------------ | ------- | ---------------------------------------------------------------- |
| `/admin/login`    | `AdminLogin`       | `POST /api/admin/login` | 调用后端验证，返回 username/email。默认账号：`admin` / `password123` |
| `/admin/sync`     | `DataSync`         | `GET /api/admin/sync-logs`、`POST /api/admin/sync-logs` | 同步日志从后端加载；Simulate Sync 同步成功后写入数据库。 |
| `/admin/scenic`   | `ScenicManagement` | `GET /api/admin/scenics`、`POST /api/admin/scenics`、`PUT /api/admin/scenics/{id}`、`DELETE /api/admin/scenics/{id}` | 景点 CRUD；支持新增、编辑、删除、搜索。 |
| `/admin/strategy` | `StrategyConfig`   | `GET /api/admin/strategy`、`PUT /api/admin/strategy` | 权重配置持久化到数据库；支持保存与加载上次配置。 |


---

## 5. 后端 API 清单

实现文件：`[backend/main.py](../backend/main.py)`。应用标题 `Airbnb DSS API`，版本 `0.1.0`。启动时在 lifespan 内 `create_all` 建表。

**CORS**：允许来源 `http://localhost:5173`、`http://localhost:3000`。若开发时用 `http://127.0.0.1:5173` 打开前端，请求 API 时的 `Origin` 为 `127.0.0.1`，**不在**当前白名单内，需在 `main.py` 中扩展 `allow_origins` 或改用语义一致的访问地址。


| 方法   | 路径                                    | 说明                                                                                                         |
| ---- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST | `/api/auth/signup`                    | Body：`{ email, password }`；邮箱规范化后唯一；密码 bcrypt；成功返回注册消息。                                                    |
| POST | `/api/auth/login`                     | 校验邮箱密码；成功返回 `message`、`email`。**无 JWT / Session / Bearer token**。                                          |
| GET  | `/api/listings`                       | 分页与筛选见第 3.2 节；响应含 `listings`、`total`、`skip`、`limit`。单条 listing 由 `_listing_full` 序列化（含关联的 `vibe_tags` 文本、`latitude`、`longitude`）。 |
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


| 脚本                                                                  | 作用                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `[backend/seed_data.py](../backend/seed_data.py)`                   | 将 `Data/` 下清洗后的 CSV 写入 SQLite（房源、日历、月度指标、评论、listing 标签等）；运行前需按 README 准备数据路径。 |
| `[backend/preprocess_reviews.py](../backend/preprocess_reviews.py)` | 使用 VADER 处理 `reviews_tags.csv` 的 `sentiment_label` 并写回 CSV；非 HTTP 服务。         |


仓库根说明：`[README.md](../README.md)`；数据目录说明：`[Data/README.md](../Data/README.md)`。

---

## 7. 已知限制（非功能需求说明）

1. **认证**：后端登录仅返回 JSON，前端不存储 token；所有 listing 相关接口公开可访问。
2. **旅客登录与业务数据**：注册用户信息未用于个性化推荐或权限控制。
3. **管理端**：Admin 模块已与后端完全对接，账号密码存储在数据库（bcrypt 加密），景点/策略/同步日志均持久化。
4. **对比页 `/compare`**：雷达图与表格指标为**写死演示数据**，不代表当前选中房源的真实计算结果。
5. **搜索页**：部分 UI（如入住日期）未参与 `buildListingParams`；地图为 Leaflet 真实交互地图，仅在 hover 房源时加载其周边 POI，不一次性渲染所有 POI。
6. **CORS 与访问地址**：后端仅放行 `localhost` 来源的常用端口；前端通过 `127.0.0.1:8000` 调 API 时，只要页面是从 `http://localhost:5173` 打开，一般可正常跨域；若整站用 `127.0.0.1` 打开前端，可能需改 CORS 或统一用 `localhost`。

---

## 8. 修订记录


| 日期         | 变更                       |
| ---------- | ------------------------ |
| 2026-03-22 | 首版：基于当前前后端代码整理功能列表与 API。 |
| 2026-03-22 | Admin 模块与后端完全对接：新增 AdminUser、ScenicSpot、StrategyConfig、SyncLog 模型及相关 CRUD API；前端各 Admin 页面改为调用后端接口。 |
| 2026-03-22 | 搜索页地图升级：新增 `ListingMap` 组件（Leaflet + react-leaflet），房源以蓝色 marker 显示，hover 房源时飞入放大并展开 1 km 虚线圆圈，通过 Overpass API 加载周边 POI；`Listing` 模型新增 `latitude`/`longitude` 字段，种子脚本同步更新，`GET /api/listings` 返回经纬度数据。地图默认中心为 Rochester, NY（43.1553, -77.6052）。 |
| 2026-03-22 | 地图 Rochester 边界增强：引入 `Data/neighbourhoods.geojson`（S/NE/NW/E 四社区 MultiPolygon）作为地理边界层，绘制社区蓝色 outline + 淡蓝填充；其余区域以半透明灰色遮罩（large Rectangle）形成聚焦效果；hover 社区显示 tooltip 标签；`Data/neighbourhoods.csv` 提供社区名单。 |
| 2026-03-22 | **v0.2.1**：新增 §3.4 — 房源 `price_clean` 前端展示统一规则（`null`/无效/≤0 显示「询价」，非 `$0`）；实现 `listingPriceDisplay.js`；搜索列表、详情、引导、预测页对齐；预测页无有效价时占位曲线基准 100。 |


