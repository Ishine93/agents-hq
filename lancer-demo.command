#!/bin/bash
# Demo du QG : agents simules, aucune session Claude, sur le port suivant celui du QG (4748 par defaut).
# Depuis le QG (Reglages > A propos > Lancer la demo) : --neuve (on repart de zero) --spectacle (le grand scenario demarre seul).
cd "$(dirname "$0")" || exit 1
printf '\033]0;QG des agents - DEMO\007'
if [ ! -x "runtime/node/bin/node" ]; then
  echo "Lance d'abord installer.command."
  read -r _
  exit 1
fi
"$(pwd)/runtime/node/bin/node" "$(pwd)/serveur/index.js" --demo "$@"
code=$?
if [ "$code" != "0" ]; then
  printf '\nAppuie sur Entree pour fermer cette fenetre.'
  read -r _
fi
exit 0
