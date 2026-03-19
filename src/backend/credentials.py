import keyring
from config import SERVICE_NAME


def save_credentials(email, password):
    """Save Apple ID credentials to Windows Credential Manager."""
    keyring.set_password(SERVICE_NAME, "apple_id", email)
    keyring.set_password(SERVICE_NAME, "apple_password", password)


def get_credentials():
    """Retrieve saved credentials. Returns (email, password) or None."""
    email = keyring.get_password(SERVICE_NAME, "apple_id")
    password = keyring.get_password(SERVICE_NAME, "apple_password")
    if email and password:
        return (email, password)
    return None


def delete_credentials():
    """Remove saved credentials from Windows Credential Manager."""
    try:
        keyring.delete_password(SERVICE_NAME, "apple_id")
    except keyring.errors.PasswordDeleteError:
        pass
    try:
        keyring.delete_password(SERVICE_NAME, "apple_password")
    except keyring.errors.PasswordDeleteError:
        pass
