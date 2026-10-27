#!/bin/bash
# Lance le QG des agents sur Mac (double-clic). Laisse cette fenetre ouverte : la fermer arrete le QG.
cd "$(dirname "$0")" || exit 1
QG="$(pwd)"
printf '\033]0;QG des agents\007'
# Premier lancement (ou dossier copie sans ses dependances) : on installe d'abord.
if [ ! -x "$QG/runtime/node/bin/node" ] || [ ! -f "$QG/node_modules/@anthropic-ai/claude-agent-sdk/package.json" ]; then
  echo "Premier lancement : installation de ce qu'il faut (Node.js portable, Claude Code)..."
  if ! /bin/bash "$QG/outils/installer.sh" --sans-lancer; then
    printf '\nAppuie sur Entree pour fermer cette fenetre.'
    read -r _
    exit 1
  fi
fi
echo "Le QG s'ouvre dans ton navigateur. Laisse cette fenetre ouverte : la fermer arrete le QG."
# (chemin absolu : mettre-a-jour.sh reconnait ainsi un QG en marche)
"$QG/runtime/node/bin/node" "$QG/serveur/index.js" "$@"
code=$?
# Code 42 : une mise a jour a ete lancee, elle relance le QG dans une autre fenetre.
if [ "$code" = "42" ]; then exit 0; fi
echo
echo "Le QG est arrete. Tu peux fermer cette fenetre."
read -r _
exit 0
