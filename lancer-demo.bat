@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QG des agents (demo)
rem Bloc lu en entier avant de lancer : une mise a jour peut remplacer ce fichier pendant la demo.
(
  "%~dp0runtime\node\node.exe" serveur\index.js --demo --port 4748 %*
  pause
  exit /b 0
)
