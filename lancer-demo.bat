@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QG des agents (demo)
"%~dp0runtime\node\node.exe" serveur\index.js --demo --port 4748 %*
pause
