"""Persist a verified sign-in without exposing stored credentials to API models."""

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..orm import User


async def save_sign_in(
    db_session: AsyncSession,
    *,
    github_id: int,
    github_login: str,
    name: str | None,
    avatar_url: str | None,
    encrypted_token: str | None,
) -> int:
    statement = insert(User).values(
        github_id=github_id,
        github_login=github_login,
        name=name,
        avatar_url=avatar_url,
        github_access_token=encrypted_token,
        last_login_at=func.now(),
    )
    statement = statement.on_conflict_do_update(
        index_elements=[User.github_id],
        set_={
            "github_login": statement.excluded.github_login,
            "name": statement.excluded.name,
            "avatar_url": statement.excluded.avatar_url,
            "github_access_token": statement.excluded.github_access_token,
            "updated_at": func.now(),
            "last_login_at": func.now(),
        },
    ).returning(User.id)
    return await db_session.scalar(statement)
