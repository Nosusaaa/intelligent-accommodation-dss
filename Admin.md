# Admin 控制台功能说明

本文档描述本项目中 **Admin（管理端）** 的路由结构、各页面职责、数据来源，以及与 **FastAPI 后端** 的关系。

---

## 1. 总览

| 项目 | 说明 |
|------|------|
| 入口 | 首页「Admin Login」→ `/admin/login` |
| 布局 | 登录成功后使用 `AdminLayout`：左侧导航 + 右侧内容区 |
| 数据形态 | **当前 Admin 子系统全部为前端本地演示**：不调用 `frontend/src/services/api.js`，也 **无** 专用 `/api/admin/*` 后端路由 |
| 用户端 API | 搜索、房源详情、预测、评论等使用 FastAPI（见第 4 节） |

---

## 2. 路由与导航

| 路径 | 组件 | 说明 |
|------|------|------|
| `/admin/login` | `AdminLogin.jsx` | 管理端登录页 |
| `/admin` | 重定向到 `/admin/sync` | — |
| `/admin/sync` | `DataSync.jsx` | 数据同步（模拟） |
| `/admin/scenic` | `ScenicManagement.jsx` | 景点/景观区管理（本地状态） |
| `/admin/strategy` | `StrategyConfig.jsx` | 排序权重与预览（本地模拟） |

侧边栏导航定义于 `frontend/src/components/layout/AdminLayout.jsx`（Data sync · Scenic · Strategy）。

---

## 3. 各模块功能说明

### 3.1 Admin Login（`/admin/login`）

- **功能**：用户名、密码表单；校验通过后 `navigate('/admin/strategy')`。
- **认证方式**：前端硬编码常量（**非**后端会话、**非** `/api/auth/login`）。
  - 演示账号：`admin` / `password123`（见 `AdminLogin.jsx`）。
- **安全提示**：生产环境必须替换为服务端鉴权、HTTPS、HttpOnly Cookie 或 JWT 等方案。

### 3.2 Data Sync（`/admin/sync`）

- **功能**：展示「拖拽上传」占位文案、**Simulate Sync** 按钮、同步进度条、同步日志表格。
- **行为**：点击「Simulate Sync」在约 2 秒内用 `requestAnimationFrame` 模拟进度，结束后向表格 **prepend** 一条随机「成功」记录。
- **后端**：**无** 上传接口、**无** 写入数据库；日志初始数据与新增行均为 **前端内存**，刷新页面后除初始 mock 外，仅本次会话内新增的行会丢失（取决于实现，当前为内存状态）。

### 3.3 Scenic Management（`/admin/scenic`）

- **功能**：景点列表、按名称搜索、新增景点（侧滑抽屉：名称、描述、半径 km）、删除；缩略图使用 `picsum.photos` 按 ID 生成占位图。
- **数据**：`useState` 初始化为 `initialRows`（`SP-001` …），新增/删除仅更新 **浏览器内存**。
- **后端**：**无** CRUD API。

### 3.4 Strategy Config（`/admin/strategy`）

- **功能**：四个维度权重滑块（Scenic / Cost / Sentiment / Preference，0–100）、「Save Configuration」按钮（当前 **无持久化**）、右侧「Live Preview Ranking」按权重与内置 `PROPERTIES` 计算匹配分并排序（含确定性伪随机抖动）。
- **数据**：房源与分数均为 **前端写死的演示数据**。
- **后端**：**无** 保存或计算接口。

---

## 4. 前后端连接关系（用户端 vs Admin）

### 4.1 共享 API 客户端（用户功能）

`frontend/src/services/api.js` 通过 **axios** 请求：

- 默认 `baseURL` 为 **`/api`**（与 Vite 开发/预览代理一致）。
- 可通过环境变量 `VITE_API_BASE_URL` 覆盖（例如直连 `http://127.0.0.1:8000/api`）。

`vite.config.js` 将浏览器访问的 `/api` **代理**到 `http://127.0.0.1:8000`，避免开发时跨域问题。

**当前后端已提供的主要路由（节选）**：

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/api/listings` | 列表与筛选 |
| `GET` | `/api/listings/{id}` | 单条房源 |
| `GET` | `/api/listings/{id}/forecast` | 月度预测 |
| `GET` | `/api/listings/{id}/reviews` | 评论 |
| `POST` | `/api/auth/signup`、`/api/auth/login` | 访客注册/登录（与 Admin 登录无关） |

上述路由由 **Smart Search、Property Details、Forecast** 等页面使用；**Admin 各页未引用 `api` 对象**。

### 4.2 连接性检查（验证清单）

在编写本说明时，对运行中的 FastAPI 执行：

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8000/api/listings?limit=1"
```

若返回 **`200`**，表示后端可响应列表接口（与用户端一致）。

**本地联调建议**：

1. 终端 A：在 `backend/` 启动 API，例如  
   `python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`
2. 终端 B：在 `frontend/` 启动  
   `npm run dev`
3. 浏览器访问用户端 `/search` 等页面，确认列表与详情有数据；Admin 页面可独立打开，**不依赖** 上述 API。

### 4.3 Admin 与后端的差距（便于后续迭代）

若要将 Admin 与后端打通，典型需要：

- 后端：管理员认证、数据同步上传/任务、景点与策略配置的持久化与 CRUD。
- 前端：`DataSync` / `ScenicManagement` / `StrategyConfig` 改为调用新 API，并处理加载/错误状态。

---

## 5. 相关文件索引

| 路径 | 作用 |
|------|------|
| `frontend/src/App.jsx` | Admin 路由注册 |
| `frontend/src/components/layout/AdminLayout.jsx` | Admin 侧栏与 Outlet |
| `frontend/src/pages/admin/AdminLogin.jsx` | 登录 |
| `frontend/src/pages/admin/DataSync.jsx` | 数据同步 UI（模拟） |
| `frontend/src/pages/admin/ScenicManagement.jsx` | 景点管理 UI（本地） |
| `frontend/src/pages/admin/StrategyConfig.jsx` | 策略权重 UI（本地） |
| `frontend/src/services/api.js` | 用户端 API（Admin 未使用） |
| `frontend/vite.config.js` | `/api` → `:8000` 代理 |
| `backend/main.py` | FastAPI 路由定义 |

---

## 6. 结论

- **Admin 模块**：完整的前端交互与导航，功能以 **演示与原型** 为主，**当前未与 FastAPI 集成**。
- **用户端与后端**：通过 `/api` 代理与 `backend/main.py` 中路由对接；可用 `curl` 或实际页面验证 **HTTP 200** 与业务数据。
- 将 Admin 变为「真实运维后台」需要新增后端接口并改写各 Admin 页面的数据层。
