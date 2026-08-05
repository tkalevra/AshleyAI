@echo off
REM Ashley AI guided installer (Windows).
REM Delegates to the cross-platform Python wizard so there is one real implementation.
setlocal
cd /d "%~dp0"
where python >nul 2>&1
if %errorlevel%==0 (
  python install.py %*
  goto :eof
)
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 install.py %*
  goto :eof
)
echo Python 3.9+ is required. Install it from https://www.python.org/downloads/ and re-run.
exit /b 1
