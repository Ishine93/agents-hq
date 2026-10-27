#!/bin/bash
# Installation du QG des agents sur Mac (double-clic, ou : bash installer.command).
cd "$(dirname "$0")" || exit 1
/bin/bash outils/installer.sh "$@"
code=$?
printf '\nAppuie sur Entree pour fermer cette fenetre.'
read -r _
exit $code
