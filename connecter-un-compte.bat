@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Connecter un compte Claude
if not exist "%~dp0runtime\node\node.exe" (
  echo Lance d'abord installer.bat.
  pause
  exit /b 1
)
"%~dp0runtime\node\node.exe" serveur\connexion.js
echo.
pause
