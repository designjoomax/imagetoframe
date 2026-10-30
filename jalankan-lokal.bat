@echo off
REM Menjalankan website di http://localhost:8000 (perlu Python ATAU Node.js)
start "" http://localhost:8000
where python >nul 2>nul && (python -m http.server 8000 & goto :eof)
npx --yes serve -l 8000 .
