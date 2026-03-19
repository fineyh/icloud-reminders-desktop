import os
import logging

from pyicloud import PyiCloudService
from config import COOKIE_DIR
from credentials import save_credentials, get_credentials, delete_credentials

# Debug log file next to cookie dir
_log_path = os.path.join(os.path.dirname(COOKIE_DIR), "auth_debug.log")
logging.basicConfig(
    filename=_log_path,
    level=logging.DEBUG,
    format="%(asctime)s %(message)s",
)
_log = logging.getLogger("auth")

_api = None


def get_api():
    """Return the current PyiCloudService instance or None."""
    return _api


def _needs_2fa(api):
    """Check if 2FA is required, with fallbacks for pyicloud 2.x edge cases."""
    # If the session is already trusted (cookies from a previous trust_session() call),
    # no 2FA is needed even if _requires_mfa/_auth_data are set from SRP re-auth.
    if api.is_trusted_session:
        return False
    if api.requires_2fa or api.requires_2sa:
        return True
    # Fallback 1: pyicloud sets _requires_mfa when PyiCloud2FARequiredException
    # is caught in authenticate(), but requires_2fa/requires_2sa may still return
    # False if dsInfo.hsaVersion is missing from the response data.
    if getattr(api, '_requires_mfa', False):
        return True
    # Fallback 2: During SRP authentication, PyiCloud2FARequiredException is caught
    # internally in _srp_authentication() and never propagated. The MFA auth options
    # are stored in _auth_data instead. If _auth_data is populated, 2FA was triggered.
    if getattr(api, '_auth_data', None):
        return True
    return False


def _is_china_mainland(account):
    """Detect China mainland Apple ID by email domain, phone number, or env var."""
    import os
    import re
    if os.environ.get("icloud_china", "0") == "1":
        return True
    # Chinese phone number Apple IDs: +86..., 86..., or 1xx (11-digit mobile)
    digits_only = re.sub(r'\D', '', account)
    if digits_only.startswith('86') and len(digits_only) >= 13:
        return True
    if re.match(r'^1[3-9]\d{9}$', digits_only):
        return True
    # Common China mainland Apple ID email domains
    china_domains = (
        "@icloud.com.cn", "@qq.com", "@163.com", "@126.com",
        "@sina.com", "@sohu.com", "@foxmail.com", "@yeah.net",
    )
    return account.lower().endswith(china_domains)


def login(email, password, remember=False):
    """
    Authenticate with iCloud.
    Returns dict with status: 'ok', '2fa_required', or 'error'.
    """
    global _api
    try:
        _api = PyiCloudService(
            email, password,
            cookie_directory=COOKIE_DIR,
            china_mainland=_is_china_mainland(email),
        )
        if remember:
            save_credentials(email, password)

        # Debug: log all 2FA-related state
        _log.info(f"[LOGIN] requires_2fa={_api.requires_2fa}")
        _log.info(f"[LOGIN] requires_2sa={_api.requires_2sa}")
        _log.info(f"[LOGIN] _requires_mfa={getattr(_api, '_requires_mfa', 'N/A')}")
        _log.info(f"[LOGIN] _auth_data={getattr(_api, '_auth_data', 'N/A')}")
        _log.info(f"[LOGIN] is_trusted_session={_api.is_trusted_session}")
        _log.info(f"[LOGIN] hsaChallengeRequired={_api.data.get('hsaChallengeRequired', 'N/A')}")
        _log.info(f"[LOGIN] hsaVersion={_api.data.get('dsInfo', {}).get('hsaVersion', 'N/A')}")
        _log.info(f"[LOGIN] hsaTrustedBrowser={_api.data.get('hsaTrustedBrowser', 'N/A')}")
        _log.info(f"[LOGIN] _needs_2fa result={_needs_2fa(_api)}")

        if _needs_2fa(_api):
            return {"status": "2fa_required"}
        else:
            return {"status": "ok"}
    except Exception as e:
        _api = None
        return {"status": "error", "message": str(e)}


def validate_2fa(code):
    """
    Validate a 2FA verification code.
    Returns dict with status: 'ok' or 'error'.
    """
    global _api
    if _api is None:
        return {"status": "error", "message": "Not authenticated. Please login first."}
    try:
        result = _api.validate_2fa_code(code)
        if result:
            _api.trust_session()
            return {"status": "ok"}
        else:
            return {"status": "error", "message": "Invalid verification code."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def try_session_resume():
    """
    Attempt to resume a previous session using saved credentials and cookies.
    Returns dict with status: 'ok', '2fa_required', 'needs_login', or 'error'.
    """
    global _api
    creds = get_credentials()
    if creds is None:
        return {"status": "needs_login"}

    email, password = creds
    try:
        _log.info(f"[RESUME] Attempting session resume for {email}")
        _api = PyiCloudService(
            email, password,
            cookie_directory=COOKIE_DIR,
            china_mainland=_is_china_mainland(email),
        )
        _log.info(f"[RESUME] requires_2fa={_api.requires_2fa}")
        _log.info(f"[RESUME] requires_2sa={_api.requires_2sa}")
        _log.info(f"[RESUME] _requires_mfa={getattr(_api, '_requires_mfa', 'N/A')}")
        _log.info(f"[RESUME] _auth_data={getattr(_api, '_auth_data', 'N/A')}")
        _log.info(f"[RESUME] is_trusted_session={_api.is_trusted_session}")
        _log.info(f"[RESUME] hsaChallengeRequired={_api.data.get('hsaChallengeRequired', 'N/A')}")
        _log.info(f"[RESUME] hsaVersion={_api.data.get('dsInfo', {}).get('hsaVersion', 'N/A')}")
        _log.info(f"[RESUME] _needs_2fa result={_needs_2fa(_api)}")
        if _needs_2fa(_api):
            return {"status": "2fa_required"}
        return {"status": "ok"}
    except Exception as e:
        _log.info(f"[RESUME] Exception: {e}")
        _api = None
        return {"status": "needs_login"}


def logout():
    """Clear current session and optionally remove saved credentials."""
    global _api
    _api = None
    delete_credentials()
    return {"status": "ok"}


def get_auth_status():
    """Return current authentication state."""
    if _api is None:
        _log.info("[STATUS] _api is None -> needs_login")
        return "needs_login"
    try:
        result = _needs_2fa(_api)
        _log.info(f"[STATUS] _needs_2fa={result}, _requires_mfa={getattr(_api, '_requires_mfa', 'N/A')}, _auth_data_bool={bool(getattr(_api, '_auth_data', None))}")
        if result:
            return "needs_2fa"
    except Exception as e:
        _log.info(f"[STATUS] Exception: {e}")
        return "needs_login"
    return "authenticated"
