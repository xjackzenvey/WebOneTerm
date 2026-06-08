"""Credential encryption using Fernet (symmetric AES-CBC)."""

from cryptography.fernet import Fernet

from src.weboneterm.config import settings


def get_fernet() -> Fernet:
    """Get or create the Fernet key for credential encryption.

    The key is stored at ~/.weboneterm/fernet.key with 0600 permissions.
    On first run, a new key is generated.
    """
    settings.ensure_data_dir()
    key_path = settings.fernet_key_path

    if key_path.exists():
        key = key_path.read_bytes()
    else:
        key = Fernet.generate_key()
        key_path.write_bytes(key)
        key_path.chmod(0o600)

    return Fernet(key)


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns base64-encoded ciphertext."""
    f = get_fernet()
    return f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    """Decrypt a Fernet-encrypted string. Returns the original plaintext."""
    f = get_fernet()
    return f.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
