const { spawn } = require('child_process');
const path = require('path');
const { app } = require('electron');

const BACKEND_PORT = 18923;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

let pythonProcess = null;

function getBackendUrl() {
  return BACKEND_URL;
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged;

    if (isDev) {
      const serverPath = path.join(__dirname, '..', 'backend', 'server.py');
      pythonProcess = spawn('python', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      const exePath = path.join(process.resourcesPath, 'backend', 'reminders-backend.exe');
      pythonProcess = spawn(exePath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Python] ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Python Error] ${data.toString().trim()}`);
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python backend:', err.message);
      reject(err);
    });

    pythonProcess.on('exit', (code) => {
      console.log(`Python backend exited with code ${code}`);
      pythonProcess = null;
    });

    // Health check: poll until backend is ready
    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/status`);
        if (response.ok) {
          clearInterval(interval);
          console.log('Python backend is ready.');
          resolve();
        }
      } catch {
        // Backend not ready yet
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        reject(new Error('Python backend failed to start within timeout.'));
      }
    }, 500);
  });
}

async function stopBackend() {
  if (!pythonProcess) return;

  try {
    // Try graceful shutdown first
    await fetch(`${BACKEND_URL}/api/shutdown`, { method: 'POST' });
  } catch {
    // If graceful shutdown fails, force kill
  }

  // Wait a moment, then force kill if still running
  setTimeout(() => {
    if (pythonProcess) {
      pythonProcess.kill();
      pythonProcess = null;
    }
  }, 2000);
}

module.exports = { startBackend, stopBackend, getBackendUrl };
