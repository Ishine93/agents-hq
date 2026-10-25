@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QG des agents
rem Premier lancement (ou dossier copie sans ses dependances) : on installe d'abord.
rem Pas d'accents dans les .bat : apres chcp 65001, cmd relirait la suite du fichier decalee.
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
rem Code 42 : une mise a jour a ete lancee au demarrage, elle relancera le QG dans une autre fenetre.
if "%errorlevel%"=="42" exit /b 0
echo.
echo Le QG est arrete. Tu peux fermer cette fenetre.
pause
