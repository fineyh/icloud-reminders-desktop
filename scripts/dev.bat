@echo off
echo Starting iCloud Reminders in development mode...

:: Start Python backend in background
echo Starting Python backend...
start /B python "%~dp0..\src\backend\server.py"

:: Wait for backend to be ready
timeout /t 3 /nobreak > nul

:: Start Electron
echo Starting Electron...
npx electron "%~dp0.."

:: When Electron exits, kill Python backend
taskkill /f /im python.exe /fi "WINDOWTITLE eq *server.py*" > nul 2>&1
echo Done.
