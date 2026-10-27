#!/bin/bash
# Connecte un compte Claude du QG (double-clic) : menu des comptes, puis connexion dans ton navigateur.
cd "$(dirname "$0")" || exit 1
printf '\033]0;Connecter un compte Claude\007'
if [ ! -x "runtime/node/bin/node" ]; then
  echo "Lance d'abord installer.command."
  read -r _
  exit 1
fi
"$(pwd)/runtime/node/bin/node" serveur/connexion.js
printf '\nAppuie sur Entree pour fermer cette fenetre.'
read -r _
