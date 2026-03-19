import os

FLASK_PORT = 18923
SERVICE_NAME = "iCloudReminders"
COOKIE_DIR = os.path.join(os.environ.get("APPDATA", "."), "iCloudReminders", "session")

# Ensure cookie directory exists
os.makedirs(COOKIE_DIR, exist_ok=True)
