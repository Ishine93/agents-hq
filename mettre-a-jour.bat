@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Mise a jour du QG des agents
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\mettre-a-jour.ps1" %*
echo.
pause
