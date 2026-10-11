"""ORM mappings for the existing schema; numbered SQL migrations own all DDL.

These classes are database internals, never API response models. Only columns needed
by migrated queries are mapped here; additional mappings arrive with each query migration.
"""

from datetime import datetime

from decimal import Decimal
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    github_id: Mapped[int] = mapped_column(BigInteger)
    github_login: Mapped[str] = mapped_column(Text)
    name: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    # Deferred by default: ordinary ORM user reads must not fetch stored tokens.
    github_access_token: Mapped[str | None] = mapped_column(Text, deferred=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    github_id: Mapped[int] = mapped_column(BigInteger)
    full_name: Mapped[str] = mapped_column(Text)
    owner_login: Mapped[str] = mapped_column(Text)
    owner_type: Mapped[str | None] = mapped_column(Text)
    primary_language: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    stargazers_count: Mapped[int] = mapped_column(Integer)
    repo_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    github_id: Mapped[int] = mapped_column(BigInteger)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"))
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    html_url: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    category_source: Mapped[str] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(Text)
    labels: Mapped[list[str]] = mapped_column(ARRAY(Text))
    comments_count: Mapped[int] = mapped_column(Integer)
    issue_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    issue_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class IssuePoints(Base):
    __tablename__ = "issue_points"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    repo_full_name: Mapped[str] = mapped_column(Text)
    issue_number: Mapped[int] = mapped_column(Integer)
    points: Mapped[int] = mapped_column(Integer)
    set_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(Text)


class AvaxRewardTerms(Base):
    __tablename__ = "avax_reward_terms"

    bounty_id: Mapped[int] = mapped_column(ForeignKey("issue_points.id"), primary_key=True)
    amount_wei: Mapped[Decimal] = mapped_column(Numeric(78, 0))
    chain_id: Mapped[int] = mapped_column(Integer)
