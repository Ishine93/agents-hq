@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QG des agents
rem Premier lancement (ou dossier copié sans ses dépendances) : on installe d'abord.
if not exist "%~dp0runtime\node\node.exe" goto installer
if not exist "%~dp0node_modules\@anthropic-ai\claude-agent-sdk\package.json" goto installer
goto lancer

:installer
echo Premier lancement : installation de ce qu'il faut (Node.js portable, Claude Code)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\installer.ps1" -SansLancer
if errorlevel 1 (
  pause
  exit /b 1
)

:lancer
echo Le QG s'ouvre dans ton navigateur. Laisse cette fenetre ouverte : la fermer arrete le QG.
"%~dp0runtime\node\node.exe" serveur\index.js %*
echo.
echo Le QG est arrete. Tu peux fermer cette fenetre.
pause
