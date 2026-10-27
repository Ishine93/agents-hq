@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Installation du QG des agents
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\installer.ps1" %*
echo.
pause
