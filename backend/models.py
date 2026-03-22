"""SQLAlchemy ORM models for listings, calendar, metrics, reviews, and tags."""

from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base, SessionLocal  # SessionLocal re-exported for app wiring (defined in database.py)


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    picture_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    property_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    room_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    accommodates: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    price_clean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bedrooms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    beds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bathrooms_num: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bathrooms_text: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)

    neighbourhood_cleansed: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    neighborhood_overview: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    review_scores_rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    number_of_reviews: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    has_wifi: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    has_parking: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    has_kitchen: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    has_air_conditioning: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    has_tv: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    has_balcony: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    average_sentiment_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    intelligent_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sentiment_positive_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sentiment_neutral_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sentiment_negative_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sentiment_positive_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sentiment_neutral_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sentiment_negative_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    calendars: Mapped[List["Calendar"]] = relationship(
        back_populates="listing", cascade="all, delete-orphan"
    )
    monthly_metrics: Mapped[List["MonthlyMetric"]] = relationship(
        back_populates="listing", cascade="all, delete-orphan"
    )
    reviews: Mapped[List["Review"]] = relationship(
        back_populates="listing", cascade="all, delete-orphan"
    )
    listing_tags: Mapped[List["ListingTag"]] = relationship(
        back_populates="listing", cascade="all, delete-orphan"
    )


class Calendar(Base):
    __tablename__ = "calendar"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    listing_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("listings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[Optional[Date]] = mapped_column(Date, nullable=True, index=True)
    available: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    adjusted_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    listing: Mapped["Listing"] = relationship(back_populates="calendars")


class MonthlyMetric(Base):
    __tablename__ = "monthly_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    listing_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("listings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    year_month: Mapped[Optional[str]] = mapped_column(String(7), nullable=True, index=True)
    avg_adjusted_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    occupancy_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    listing: Mapped["Listing"] = relationship(back_populates="monthly_metrics")


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    listing_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("listings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reviewer_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    review_date: Mapped[Optional[Date]] = mapped_column(Date, nullable=True)
    review_text_cleaned: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    vibe_tags_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sentiment_label: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    listing: Mapped["Listing"] = relationship(back_populates="reviews")


class ListingTag(Base):
    __tablename__ = "listing_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    listing_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("listings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vibe_tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    listing: Mapped["Listing"] = relationship(back_populates="listing_tags")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)

    preferences: Mapped[List["UserPreference"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserPreference(Base):
    """Stores per-user vibe tag preference scores collected during onboarding."""

    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tag_name: Mapped[str] = mapped_column(String(256), nullable=False)
    preference_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    user: Mapped["User"] = relationship(back_populates="preferences")


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[Optional[str]] = mapped_column(String(26), nullable=True)


class ScenicSpot(Base):
    __tablename__ = "scenic_spots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    radius_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[Optional[str]] = mapped_column(String(26), nullable=True)


class StrategyConfig(Base):
    __tablename__ = "strategy_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    config_key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    scenic_weight: Mapped[int] = mapped_column(Integer, default=28, nullable=False)
    cost_weight: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    sentiment_weight: Mapped[int] = mapped_column(Integer, default=26, nullable=False)
    preference_weight: Mapped[int] = mapped_column(Integer, default=22, nullable=False)
    updated_at: Mapped[Optional[str]] = mapped_column(String(26), nullable=True)


class SyncLog(Base):
    __tablename__ = "sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    records_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sync_date: Mapped[Optional[str]] = mapped_column(String(26), nullable=True)
    created_at: Mapped[Optional[str]] = mapped_column(String(26), nullable=True)
