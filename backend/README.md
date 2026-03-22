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
