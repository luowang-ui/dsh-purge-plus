@echo off
REM Purge Community - Windows entry point (double-click friendly)
REM Bypasses ExecutionPolicy, then calls install.ps1 next to this file.
REM All arguments are passed through, e.g. -DryRun / -Tag v1.6.1 / -Tarball D:\x.tar.gz
REM ASCII-only on purpose: cmd.exe would render UTF-8 as garbage under GBK codepage.

setlocal
set "SCRIPT=%~dp0install.ps1"

if not exist "%SCRIPT%" (
  echo [FAIL] install.ps1 not found next to this file.
  pause
  exit /b 1
)

echo.
echo === Purge Community installer ^(Windows^) ===
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo Done.
) else (
  echo Failed with exit code %RC%. Send the output above to the maintainer.
)
echo.
pause
exit /b %RC%
