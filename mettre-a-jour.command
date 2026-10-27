#!/bin/bash
# Mise a jour du QG des agents sur Mac (double-clic). Ferme d'abord le QG.
cd "$(dirname "$0")" || exit 1
printf '\033]0;Mise a jour du QG des agents\007'
/bin/bash outils/mettre-a-jour.sh "$@"
code=$?
printf '\nAppuie sur Entree pour fermer cette fenetre.'
read -r _
exit $code
