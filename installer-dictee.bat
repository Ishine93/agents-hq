@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Installation de la dictee locale
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\installer-dictee.ps1" %*
echo.
pause
