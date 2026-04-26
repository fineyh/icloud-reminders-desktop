import sys
import os

# Ensure the backend directory is in the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify
from flask_cors import CORS
from waitress import serve

from config import FLASK_PORT
from auth import login, validate_2fa, try_session_resume, logout, get_auth_status, request_sms_code
from reminders_api import reminders_bp

app = Flask(__name__)
CORS(app, origins=["http://localhost:*", "http://127.0.0.1:*"])

app.register_blueprint(reminders_bp)


@app.route("/api/auth/status", methods=["GET"])
def auth_status():
    from auth import _api, _needs_2fa
    debug = {}
    if _api is not None:
        debug["_requires_mfa"] = getattr(_api, '_requires_mfa', None)
        debug["_auth_data_bool"] = bool(getattr(_api, '_auth_data', None))
        debug["is_trusted_session"] = _api.is_trusted_session
        debug["requires_2fa"] = _api.requires_2fa
        debug["requires_2sa"] = _api.requires_2sa
        debug["_needs_2fa"] = _needs_2fa(_api)
        debug["hsaTrustedBrowser"] = _api.data.get("hsaTrustedBrowser")
        debug["hsaVersion"] = _api.data.get("dsInfo", {}).get("hsaVersion")
    else:
        debug["_api"] = "None"
    status = get_auth_status()
    debug["final_status"] = status
    return jsonify({"status": status, "_debug": debug})


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json()
    if not data or "email" not in data or "password" not in data:
        return jsonify({"status": "error", "message": "Email and password required."}), 400
    result = login(
        data["email"],
        data["password"],
        data.get("remember", False),
        use_international=data.get("use_international", False),
    )
    return jsonify(result)


@app.route("/api/auth/2fa", methods=["POST"])
def auth_2fa():
    data = request.get_json()
    if not data or "code" not in data:
        return jsonify({"status": "error", "message": "Verification code required."}), 400
    result = validate_2fa(data["code"])
    return jsonify(result)


@app.route("/api/auth/2fa/send-sms", methods=["POST"])
def auth_send_sms():
    return jsonify(request_sms_code())


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    result = logout()
    return jsonify(result)


@app.route("/api/shutdown", methods=["POST"])
def shutdown():
    """Graceful shutdown endpoint for Electron to call before killing the process."""
    os._exit(0)


if __name__ == "__main__":
    # Try to resume a previous session on startup
    resume_result = try_session_resume()
    print(f"Session resume: {resume_result['status']}")

    print(f"Starting iCloud Reminders backend on port {FLASK_PORT}...")
    serve(app, host="127.0.0.1", port=FLASK_PORT)
