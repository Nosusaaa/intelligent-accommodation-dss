# 数据目录（Data）

本目录存放项目使用的**原始数据文件**与 **SQLite 数据库**：

| 文件 | 说明 |
|------|------|
| `airbnb_dss.db` | 由 `backend/seed_data.py` 生成的 SQLite 数据库（`*.db` 通常被 `.gitignore` 忽略） |
| `cleaned_listings.csv` | 房源主表 |
| `listings_intelligent_profile.csv` | 房源智能画像（与 listings 合并） |
| `listings_scores.csv` | 备用/评分相关 CSV（按需使用） |
| `calendar_cleaned.csv` | 日历 |
| `monthly_forecast_metrics.csv` | 月度指标 |
| `reviews_tags.csv` | 评论与标签；情感标签可由 `backend/preprocess_reviews.py` 预计算并写回此文件 |
| `room_tags.csv` | 房间标签 |
| `map_cache/` | 地图离线缓存（POI、房源坐标快照、瓦片元数据） |

路径约定：

- **数据库路径**：`backend/database.py` → `Data/airbnb_dss.db`
- **导入种子数据**：在 `backend/` 下运行 `python3 seed_data.py`（从 `Data/*.csv` 读取）
- **地图离线缓存构建**：在 `backend/` 下运行 `python3 build_map_cache.py`（写入 `Data/map_cache/*.json`）
