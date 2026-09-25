"""Encrypt GitHub access tokens before they are stored."""

from cryptography.fernet import Fernet, InvalidToken

from .config import settings


def encrypt(plaintext: str) -> str:
    """Encrypt a token with the configured Fernet key."""
    return Fernet(settings.token_encryption_key.encode()).encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str | None) -> str | None:
    """Decrypt a token, returning None when the key no longer matches."""
    if not ciphertext or not settings.token_encryption_key:
        return None
    try:
        return Fernet(settings.token_encryption_key.encode()).decrypt(ciphertext.encode()).decode()
    except (InvalidToken, ValueError):
        return None
