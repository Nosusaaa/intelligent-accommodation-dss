# Backend helpers (use python3 explicitly — macOS often has no `python` command).
PYTHON ?= python3

.PHONY: install seed dev

install:
	$(PYTHON) -m pip install -r requirements.txt

seed:
	$(PYTHON) seed_data.py

dev:
	$(PYTHON) -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
