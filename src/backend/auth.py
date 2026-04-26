import os
import logging

from pyicloud import PyiCloudService
from pyicloud.exceptions import (
    PyiCloudAPIResponseException,
    PyiCloudFailedLoginException,
)
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


class _HybridChinaPyiCloud(PyiCloudService):
    """Login via international IDMSA, but talk to the China data cluster.

    For +86 phone-number Apple IDs, idmsa.apple.com.cn rate-limits hard
    (503), but the account's reminders/calendar/etc. live on the China
    CloudKit cluster. When we authenticate via international IDMSA and
    then POST setup.icloud.com/accountLogin, Apple returns a 302 toward
    setup.icloud.com.cn that pyicloud doesn't follow, leaving webservices
    unpopulated. Pinning the data endpoints to .cn skips the redirect:
    the international IDMSA token is presented directly to the China
    setup endpoint, and Apple honors it (the 302 was the hint).
    """

    def _setup_endpoints(self) -> None:
        super()._setup_endpoints()
        # IDMSA stays international (no 503 for +86 accounts).
        # Setup/home pinned to China cluster (where the data actually is).
        self._home_endpoint = "https://www.icloud.com.cn"
        self._setup_endpoint = "https://setup.icloud.com.cn/setup/ws/1"


class _ResumeOnlyPyiCloud(PyiCloudService):
    """PyiCloudService that refuses SRP fallback during resume.

    pyicloud's authenticate() silently retries with full SRP (password) auth
    when the saved session token is rejected. For resumes that's harmful: it
    burns Apple's anti-abuse quota — phone-number Apple IDs on idmsa.apple.com.cn
    get throttled (503), which pyicloud reports as "Invalid email/password
    combination" and the user thinks the password is wrong.

    Resumes should reuse cookies or fail cleanly so the user re-enters
    credentials manually.
    """

    def _srp_authentication(self) -> None:
        raise PyiCloudFailedLoginException(
            "Session expired; user must re-enter credentials."
        )


def _classify_login_exception(exc: BaseException):
    """Walk the exception chain looking for an HTTP 5xx from Apple.

    Returns ('rate_limited', status) for 5xx, else ('credentials', None).
    """
    seen = set()
    cur = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if isinstance(cur, PyiCloudAPIResponseException):
            code = cur.code
            try:
                code_int = int(code) if code is not None else None
            except (TypeError, ValueError):
                code_int = None
            if code_int is not None and 500 <= code_int < 600:
                return ("rate_limited", code_int)
        resp = getattr(cur, "response", None)
        status = getattr(resp, "status_code", None)
        if isinstance(status, int) and 500 <= status < 600:
            return ("rate_limited", status)
        cur = cur.__cause__ or cur.__context__
    return ("credentials", None)


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


def login(email, password, remember=False, use_international=False):
    """
    Authenticate with iCloud.
    Returns dict with status: 'ok', '2fa_required', or 'error'.

    use_international=True forces the international endpoint
    (idmsa.apple.com) instead of the China endpoint
    (idmsa.apple.com.cn). Useful when phone-number Apple IDs
    are throttled (503) on the China endpoint.
    """
    global _api
    try:
        if use_international:
            # Hybrid: international IDMSA + China data cluster
            _api = _HybridChinaPyiCloud(
                email, password,
                cookie_directory=COOKIE_DIR,
                china_mainland=False,
            )
        else:
            _api = PyiCloudService(
                email, password,
                cookie_directory=COOKIE_DIR,
                china_mainland=_is_china_mainland(email),
            )
        if remember:
            save_credentials(email, password, use_international=use_international)

        if _needs_2fa(_api):
            return {"status": "2fa_required"}
        return {"status": "ok"}
    except Exception as e:
        _api = None
        kind, status = _classify_login_exception(e)
        _log.info(f"[LOGIN] Exception classified as {kind} (status={status}): {e}")
        if kind == "rate_limited":
            return {
                "status": "error",
                "code": "rate_limited",
                "message": (
                    "Apple 登录服务暂时拒绝了登录请求（HTTP "
                    f"{status}）。这通常是短时间多次登录触发的限流，"
                    "请等待 15-60 分钟后再试，期间不要反复重启 App。"
                ),
            }
        return {"status": "error", "message": str(e)}


def _check_sms_rate_limit(auth_data):
    """Inspect Apple's securityCode flags and return a user-facing
    error dict if SMS is currently blocked, else None.

    Apple exposes booleans rather than timestamps, so we can't show an
    exact countdown — we map each flag to a sensible Chinese hint.
    """
    pnv = auth_data.get("phoneNumberVerification") or {}
    sec = pnv.get("securityCode") or auth_data.get("securityCode") or {}
    if sec.get("securityCodeLocked"):
        return {
            "status": "error",
            "code": "sms_locked",
            "message": "Apple 已锁定此账号的短信验证码功能。请前往 https://iforgot.apple.com 走账号恢复流程。",
        }
    if sec.get("tooManyCodesValidated"):
        return {
            "status": "error",
            "code": "too_many_attempts",
            "message": "短时间内输入错误验证码次数过多，Apple 已临时锁定。请等待数小时后再试。",
        }
    if sec.get("tooManyCodesSent"):
        return {
            "status": "error",
            "code": "too_many_sent",
            "message": "短时间内发送验证码次数过多，请等 30 分钟以上再试。",
        }
    if sec.get("securityCodeCooldown"):
        return {
            "status": "error",
            "code": "cooldown",
            "message": "上一条验证码刚发出，请等待约 1 分钟后再试。",
        }
    return None


def request_sms_code():
    """Ask Apple to SMS a 6-digit code to the trusted phone number.

    Used as a fallback when the system push to trusted Apple devices
    never arrives — common for +86 phone-number Apple IDs when login
    went through the international IDMSA endpoint, because the push
    can't always cross to the China APNs cluster.

    On success, also flips _auth_data['mode'] to 'sms' so a subsequent
    validate_2fa_code(code) routes through pyicloud's _validate_sms_code.
    """
    global _api
    if _api is None:
        return {"status": "error", "message": "Not authenticated. Please login first."}
    auth_data = getattr(_api, "_auth_data", None) or {}

    # Pre-flight: avoid burning quota when Apple has already flagged us
    blocked = _check_sms_rate_limit(auth_data)
    if blocked:
        return blocked

    phone = auth_data.get("trustedPhoneNumber")
    if not phone:
        pnv = auth_data.get("phoneNumberVerification") or {}
        phone = pnv.get("trustedPhoneNumber")
        if not phone:
            numbers = pnv.get("trustedPhoneNumbers") or []
            phone = numbers[0] if numbers else None
    if not phone:
        return {"status": "error", "message": "No trusted phone number available."}
    try:
        headers = _api._get_auth_headers({"Accept": "application/json"})
        body = {
            "phoneNumber": {
                "id": phone.get("id", 1),
                "nonFTEU": phone.get("nonFTEU", True),
            },
            "mode": "sms",
        }
        resp = _api.session.put(
            f"{_api._auth_endpoint}/verify/phone",
            json=body,
            headers=headers,
        )
        # Apple sometimes returns 200 but updates the cooldown flags in
        # the response body — re-check before declaring success.
        try:
            updated = resp.json() or {}
            blocked = _check_sms_rate_limit(updated)
            if blocked:
                return blocked
        except ValueError:
            pass

        _api._auth_data["mode"] = "sms"
        if "trustedPhoneNumber" not in _api._auth_data:
            _api._auth_data["trustedPhoneNumber"] = phone
        last_two = phone.get("lastTwoDigits", "")
        return {"status": "ok", "phone_tail": last_two}
    except Exception as e:
        # Apple's HTTP error often carries the same flags in its body
        resp = getattr(e, "response", None)
        if resp is not None:
            try:
                blocked = _check_sms_rate_limit(resp.json() or {})
                if blocked:
                    return blocked
            except ValueError:
                pass
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
        # validate_2fa_code() internally calls trust_session() on success,
        # so don't call it again — that wastes a round trip and can
        # mutate session state mid-flight.
        if _api.validate_2fa_code(code):
            return {"status": "ok"}
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

    email, password, use_international = creds
    try:
        if use_international:
            class _ResumeHybridChina(_HybridChinaPyiCloud):
                _srp_authentication = _ResumeOnlyPyiCloud._srp_authentication
            _api = _ResumeHybridChina(
                email, password,
                cookie_directory=COOKIE_DIR,
                china_mainland=False,
            )
        else:
            _api = _ResumeOnlyPyiCloud(
                email, password,
                cookie_directory=COOKIE_DIR,
                china_mainland=_is_china_mainland(email),
            )
        if _needs_2fa(_api):
            return {"status": "2fa_required"}
        return {"status": "ok"}
    except Exception:
        _api = None
        return {"status": "needs_login"}


def logout():
    """Clear current session, saved credentials, and cookie/session files.

    Without removing the cookie/session files, anyone with read access
    to COOKIE_DIR could resume the session even after the user clicked
    "log out" — the saved session token plus the trust token are
    enough for pyicloud to silently re-authenticate.
    """
    global _api
    _api = None
    delete_credentials()
    try:
        for entry in os.scandir(COOKIE_DIR):
            if entry.is_file() and entry.name.endswith((".session", ".cookiejar")):
                try:
                    os.remove(entry.path)
                except OSError:
                    pass
    except FileNotFoundError:
        pass
    return {"status": "ok"}


def get_auth_status():
    """Return current authentication state."""
    if _api is None:
        return "needs_login"
    try:
        if _needs_2fa(_api):
            return "needs_2fa"
    except Exception:
        return "needs_login"
    return "authenticated"
