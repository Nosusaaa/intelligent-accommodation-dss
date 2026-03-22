# Admin 控制台功能说明

本文档描述本项目中 **Admin（管理端）** 的路由结构、各页面职责、数据来源，以及与 **FastAPI 后端** 的关系。

---

## 1. 总览

| 项目 | 说明 |
|------|------|
| 入口 | 首页「Admin Login」→ `/admin/login` |
| 布局 | 登录成功后使用 `AdminLayout`：左侧导航 + 右侧内容区 |
| 数据形态 | **Admin 子系统通过 FastAPI 后端 API 操作 SQLite 数据库** |
| 用户端 API | 搜索、房源详情、预测、评论等使用 FastAPI（见第 4 节） |

---

## 2. 路由与导航

| 路径 | 组件 | 说明 |
|------|------|------|
| `/admin/login` | `AdminLogin.jsx` | 管理端登录页 |
| `/admin` | 重定向到 `/admin/sync` | — |
| `/admin/sync` | `DataSync.jsx` | 数据同步 |
| `/admin/scenic` | `ScenicManagement.jsx` | 景点/景观区管理 |
| `/admin/strategy` | `StrategyConfig.jsx` | 排序权重与配置 |

侧边栏导航定义于 `frontend/src/components/layout/AdminLayout.jsx`（Data sync · Scenic · Strategy）。

---

## 3. 各模块功能说明

### 3.1 Admin Login（`/admin/login`）

- **功能**：用户名、密码表单；校验通过后调用 `POST /api/admin/login`。
- **认证方式**：后端 bcrypt 验证，数据存储在 `admin_users` 表。
  - 演示账号：`admin` / `password123`
- **初始账号创建**：运行 `seed_data.py` 时自动创建默认管理员。

### 3.2 Data Sync（`/admin/sync`）

- **功能**：展示拖拽上传占位文案、**Simulate Sync** 按钮、同步进度条、同步日志表格。
- **行为**：点击「Simulate Sync」在约 2 秒内用 `requestAnimationFrame` 模拟进度，结束后调用 `POST /api/admin/sync-logs` 保存记录。
- **后端**：日志数据持久化到 `sync_logs` 表。

### 3.3 Scenic Management（`/admin/scenic`）

- **功能**：景点列表、按名称搜索、新增景点（侧滑抽屉：名称、描述、半径 km）、编辑、删除。
- **数据**：`GET /api/admin/scenics` 加载，CRUD 操作调用对应 API。
- **后端**：`scenic_spots` 表，字段：`name`, `description`, `radius_km`, `thumbnail_url`。

### 3.4 Strategy Config（`/admin/strategy`）

- **功能**：四个维度权重滑块（Scenic / Cost / Sentiment / Preference，0–100）。
- **持久化**：加载时调用 `GET /api/admin/strategy`，保存时调用 `PUT /api/admin/strategy`。
- **数据**：策略配置存储在 `strategy_configs` 表（config_key = "default"）。

---

## 4. 前后端连接关系

### 4.1 Admin API（新增）

`frontend/src/services/api.js` 新增以下 Admin 方法：

| 方法 | API 路径 | 说明 |
|------|----------|------|
| POST | `/api/admin/login` | 管理员登录验证 |
| GET | `/api/admin/scenics` | 获取景点列表 |
| POST | `/api/admin/scenics` | 新增景点 |
| PUT | `/api/admin/scenics/{id}` | 更新景点 |
| DELETE | `/api/admin/scenics/{id}` | 删除景点 |
| GET | `/api/admin/strategy` | 获取策略配置 |
| PUT | `/api/admin/strategy` | 保存策略配置 |
| GET | `/api/admin/sync-logs` | 获取同步日志 |
| POST | `/api/admin/sync-logs` | 创建同步记录 |

### 4.2 连接性检查

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8000/api/admin/scenics"
```

若返回 **`200`**，表示 Admin API 可正常响应。

**本地联调建议**：

1. 终端 A：在 `backend/` 启动 API，
   `python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`
2. 终端 B：在 `frontend/` 启动
   `npm run dev`
3. 浏览器访问 `http://localhost:5173/admin/login`，使用 `admin` / `password123` 登录。

---

## 5. 相关文件索引

| 路径 | 作用 |
|------|------|
| `frontend/src/App.jsx` | Admin 路由注册 |
| `frontend/src/components/layout/AdminLayout.jsx` | Admin 侧栏与 Outlet |
| `frontend/src/pages/admin/AdminLogin.jsx` | 登录（对接后端 API） |
| `frontend/src/pages/admin/DataSync.jsx` | 数据同步（对接后端 API） |
| `frontend/src/pages/admin/ScenicManagement.jsx` | 景点管理（对接后端 API） |
| `frontend/src/pages/admin/StrategyConfig.jsx` | 策略权重（对接后端 API） |
| `frontend/src/services/api.js` | API 客户端（含 Admin 方法） |
| `frontend/vite.config.js` | `/api` → `:8000` 代理 |
| `backend/main.py` | FastAPI 路由定义（含 Admin API） |
| `backend/models.py` | ORM 模型（含 AdminUser、ScenicSpot、StrategyConfig、SyncLog） |
| `backend/seed_data.py` | 数据初始化（含默认管理员创建） |

---

## 6. 数据库模型

| 表名 | 说明 |
|------|------|
| `admin_users` | 管理员账号（username, email, password, is_active） |
| `scenic_spots` | 景点管理（name, description, radius_km, thumbnail_url） |
| `strategy_configs` | 策略配置（config_key, scenic_weight, cost_weight, sentiment_weight, preference_weight） |
| `sync_logs` | 同步日志（file_type, status, records_updated, sync_date） |

---

## 7. 结论

- **Admin 模块**：已与 FastAPI 完全集成，账号密码加密存储，数据持久化到 SQLite。
- **用户端与后端**：通过 `/api` 代理与 `backend/main.py` 中路由对接。
