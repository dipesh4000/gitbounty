"""Encrypting GitHub access tokens before they touch the database.

A stored access token can act as the user on GitHub, so it is never written in
plain text. Everything here is symmetric Fernet encryption keyed by
TOKEN_ENCRYPTION_KEY.
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings

_fernet: Fernet | None = None


def _cipher() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(get_settings().token_encryption_key.encode())
    return _fernet


def encrypt(plaintext: str) -> str:
    """Encrypt a token for storage."""
    return _cipher().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str | None) -> str | None:
    """Decrypt a stored token, or return None if it can't be read.

    A None result means the encryption key changed since the token was stored.
    The caller should treat that as "not logged in" and send the user through
    the GitHub login again.
    """
    if not ciphertext:
        return None
    try:
        return _cipher().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, ValueError):
        return None
