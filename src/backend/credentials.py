import keyring
from config import SERVICE_NAME


def save_credentials(email, password, use_international=False):
    """Save Apple ID credentials to Windows Credential Manager."""
    keyring.set_password(SERVICE_NAME, "apple_id", email)
    keyring.set_password(SERVICE_NAME, "apple_password", password)
    keyring.set_password(SERVICE_NAME, "use_international", "1" if use_international else "0")


def get_credentials():
    """Retrieve saved credentials. Returns (email, password, use_international) or None."""
    email = keyring.get_password(SERVICE_NAME, "apple_id")
    password = keyring.get_password(SERVICE_NAME, "apple_password")
    if email and password:
        use_intl = keyring.get_password(SERVICE_NAME, "use_international") == "1"
        return (email, password, use_intl)
    return None


def delete_credentials():
    """Remove saved credentials from Windows Credential Manager."""
    for key in ("apple_id", "apple_password", "use_international"):
        try:
            keyring.delete_password(SERVICE_NAME, key)
        except keyring.errors.PasswordDeleteError:
            pass
