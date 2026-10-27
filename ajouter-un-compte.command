#!/bin/bash
# Ajoute un compte Claude au QG et le connecte (double-clic).
cd "$(dirname "$0")" || exit 1
printf '\033]0;Ajouter un compte Claude\007'
if [ ! -x "runtime/node/bin/node" ]; then
  echo "Lance d'abord installer.command."
  read -r _
  exit 1
fi
"$(pwd)/runtime/node/bin/node" serveur/connexion.js --nouveau
printf '\nAppuie sur Entree pour fermer cette fenetre.'
read -r _
