#!/usr/bin/env python3
"""Quick script to create admin user without running full seed."""

import bcrypt
from datetime import datetime

from database import Base, engine, SessionLocal
import models  # noqa: F401 - needed for ORM mapping

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def main():
    # Create all tables
    Base.metadata.create_all(bind=engine)
    print("Tables created.")

    # Create admin user
    db = SessionLocal()
    try:
        from sqlalchemy import text
        
        # Check if admin exists
        result = db.execute(text("SELECT id FROM admin_users WHERE username = 'admin'"))
        if result.fetchone():
            print("Admin user already exists.")
            return
        
        now = datetime.utcnow().isoformat() + "Z"
        db.execute(text("""
            INSERT INTO admin_users (username, email, password, is_active, created_at)
            VALUES (:username, :email, :password, :is_active, :created_at)
        """), {
            "username": "admin",
            "email": "admin@airbnb-dss.com",
            "password": hash_password("password123"),
            "is_active": True,
            "created_at": now,
        })
        db.commit()
        print("Admin user created: admin / password123")
    finally:
        db.close()

if __name__ == "__main__":
    main()
