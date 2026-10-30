@echo off
REM Klik dua kali setelah menambah / mengganti / mengubah nama frame di assets\frame\
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\update-frames.ps1"
echo.
pause
