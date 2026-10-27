@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QG des agents - DEMO
rem Demo du QG : agents simules, aucune session Claude, sur le port suivant celui du QG (4748 par defaut).
rem Depuis le QG (Reglages > A propos > Lancer la demo) : --neuve (on repart de zero) --spectacle (le grand scenario demarre seul).
rem Bloc lu en entier avant de lancer : une mise a jour peut remplacer ce fichier pendant la demo.
(
  "%~dp0runtime\node\node.exe" serveur\index.js --demo %*
  if errorlevel 1 pause
  exit 0
)
