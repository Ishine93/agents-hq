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
rem Le bloc ci-dessous est lu en entier avant de lancer le QG : si une mise a jour remplace ce fichier
rem pendant que le QG tourne, cette fenetre ne relit pas la suite a une position decalee.
rem Code 41 : bouton Fermer du QG. Code 42 : une mise a jour a ete lancee, elle relance le QG dans une autre fenetre.
rem Dans les deux cas, cette fenetre se ferme sans attendre.
rem serveur\gardien.js lance le serveur et le relance tout seul s'il plante (voir ce fichier).
(
  "%~dp0runtime\node\node.exe" serveur\gardien.js %*
  if errorlevel 41 if not errorlevel 43 exit /b 0
  echo.
  echo Le QG est arrete. Tu peux fermer cette fenetre.
  pause
  exit /b 0
)
