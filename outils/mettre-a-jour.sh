#!/bin/bash
# Mise a jour du QG des agents sur macOS depuis la derniere version publiee sur GitHub (lancee par
# mettre-a-jour.command, ou par le site). Equivalent de mettre-a-jour.ps1.
# Tes reglages (config/*.json, fiches), ton historique (dossiers/) et runtime/ ne sont jamais touches :
# le zip de la version ne contient que le code et les reglages par defaut.
# Options : --silencieux, --attendre-pid N (le QG se ferme d'abord), --relancer (le QG redemarre a la fin,
# meme si la mise a jour echoue), --ouvrir (a la relance, ouvrir le site dans le navigateur).
set -euo pipefail

OUTILS="$(cd "$(dirname "$0")" && pwd)"
QG="$(cd "$OUTILS/.." && pwd)"
. "$OUTILS/commun.sh"

DEPOT='Ishine93/agents-hq'
TMP="$QG/runtime/mise-a-jour"
ATTENDRE_PID=0
RELANCER=0
OUVRIR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --silencieux) SILENCIEUX=1 ;;
    --attendre-pid) shift; ATTENDRE_PID="${1:-0}" ;;
    --relancer) RELANCER=1 ;;
    --ouvrir) OUVRIR=1 ;;
  esac
  shift
done

relance() {
  [ "$RELANCER" = "1" ] || return 0
  printf 'Relance du QG...\n'
  # --sans-maj : le QG relance ne reverifie pas (pas de boucle si la mise a jour a echoue).
  local args='--sans-maj' port fichier essai s
  [ "$OUVRIR" = "1" ] || args='--sans-maj --no-open'
  port=$(port_qg "$QG")
  # `open` ne transmet pas d'arguments a un .command : on ecrit un petit lanceur (sur place, donc sans quarantaine).
  fichier="$QG/runtime/relance.command"
  # (chemin entre apostrophes, une apostrophe du chemin devenant '\'' )
  qg_cite="'$(printf '%s' "$QG" | sed "s/'/'\\\\''/g")'"
  printf '#!/bin/bash\ncd %s || exit 1\nexec /bin/bash ./lancer.command %s\n' "$qg_cite" "$args" > "$fichier"
  chmod +x "$fichier"
  essai=1
  while [ "$essai" -le 3 ]; do
    if ! qg_tourne "$QG"; then open "$fichier" || printf 'open a echoue\n'; fi
    s=0
    while [ "$s" -lt 40 ]; do
      sleep 1
      if qg_repond "$port"; then
        printf '\033[32mLe QG est reparti.\033[0m\n'
        sleep 1
        return 0
      fi
      if [ "$s" -ge 6 ] && ! qg_tourne "$QG"; then break; fi
      s=$((s + 1))
    done
    printf '\033[33mLe QG ne repond pas encore, nouvel essai (%s/3)...\033[0m\n' "$essai"
    essai=$((essai + 1))
  done
  printf '\033[33mLe QG n a pas redemarre tout seul : lance lancer.command (la mise a jour, elle, est faite).\033[0m\n'
  printf 'Appuie sur Entree pour fermer cette fenetre.'
  read -r _
}

echec_maj() {
  printf '\n\033[31mECHEC : %s\033[0m\n' "$1"
  relance
  if [ "$RELANCER" = "1" ]; then printf 'Appuie sur Entree pour fermer cette fenetre.'; read -r _; fi
  exit 1
}

if [ "$ATTENDRE_PID" != "0" ]; then
  printf 'Fermeture du QG (les dossiers en cours sont enregistres et reprendront)...\n'
  s=0
  while kill -0 "$ATTENDRE_PID" 2>/dev/null && [ "$s" -lt 60 ]; do sleep 1; s=$((s + 1)); done
  kill -0 "$ATTENDRE_PID" 2>/dev/null && echec_maj "le QG ne s'est pas ferme."
fi

ACTUELLE=$(grep -E '"version"[[:space:]]*:' "$QG/package.json" | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)
[ -n "$ACTUELLE" ] || echec_maj 'package.json illisible : version inconnue.'
printf 'QG des agents -- version installee : %s\n' "$ACTUELLE"

DERNIERE=''
if [ -z "${QG_MAJ_SANS_API:-}" ]; then
  REL=$(curl -fsL -A 'QG-des-agents' --max-time 20 "https://api.github.com/repos/$DEPOT/releases/latest" 2>/dev/null || true)
  # (sous set -e et pipefail : un grep sans résultat ne doit pas arrêter le script, le repli ci-dessous prend le relais)
  DERNIERE=$(printf '%s' "$REL" | grep -E '"tag_name"' | head -1 | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v?([^"]+)".*/\1/' || true)
fi
if [ -z "$DERNIERE" ]; then
  # L'API refuse (403 : 60 demandes par heure et par connexion) : la page « derniere version » redirige vers celle de sa version.
  printf 'API GitHub indisponible : on passe par la page des versions.\n'
  FINAL=$(curl -sIL -A 'QG-des-agents' --max-time 20 -o /dev/null -w '%{url_effective}' "https://github.com/$DEPOT/releases/latest" 2>/dev/null || true)
  DERNIERE=$(printf '%s' "$FINAL" | sed -nE 's#.*/releases/tag/v?([A-Za-z0-9._-]+)$#\1#p' || true)
  [ -n "$DERNIERE" ] || echec_maj 'impossible de lire la derniere version publiee sur GitHub (connexion Internet ?).'
fi
printf 'Derniere version publiee : %s\n' "$DERNIERE"
if [ "$DERNIERE" = "$ACTUELLE" ]; then
  printf '\033[32mTu as deja la derniere version.\033[0m\n'
  relance
  exit 0
fi
# Une seule archive par version, au nom connu (la meme pour Windows et Mac).
ZIP_NOM="QG-des-agents-$DERNIERE.zip"
ZIP_URL="https://github.com/$DEPOT/releases/download/v$DERNIERE/$ZIP_NOM"
SHA_URL="$ZIP_URL.sha256"

# Le QG ne doit pas tourner pendant la copie.
if qg_tourne "$QG"; then echec_maj 'le QG est ouvert : ferme sa fenetre Terminal (cela arrete le QG), puis relance mettre-a-jour.command.'; fi

rm -rf "$TMP"
mkdir -p "$TMP"
ZIP="$TMP/$ZIP_NOM"
SHA="$TMP/$ZIP_NOM.sha256"
printf 'Telechargement de %s...\n' "$ZIP_NOM"
telecharger "$ZIP_URL" "$ZIP" || echec_maj 'telechargement impossible.'
telecharger "$SHA_URL" "$SHA" || echec_maj 'telechargement impossible.'
ATTENDUE=$(head -1 "$SHA" | awk '{print $1}' | tr 'A-F' 'a-f')
[ "$(sha256 "$ZIP")" = "$ATTENDUE" ] || echec_maj 'empreinte incorrecte : mise a jour annulee.'
printf '\033[32mEmpreinte SHA-256 verifiee.\033[0m\n'

EXTRAIT="$TMP/extrait"
mkdir -p "$EXTRAIT"
# ditto garde les droits Unix (bit executable des .command) ; unzip en secours
if command -v ditto >/dev/null 2>&1; then ditto -x -k "$ZIP" "$EXTRAIT"; else unzip -q "$ZIP" -d "$EXTRAIT"; fi
SOURCE=$(find "$EXTRAIT" -mindepth 1 -maxdepth 1 -type d | head -1)
[ -n "$SOURCE" ] && [ -f "$SOURCE/serveur/index.js" ] || echec_maj 'contenu du zip inattendu.'

# Copie par-dessus : les fichiers personnels n'existent pas dans le zip, ils restent tels quels.
rsync -a --exclude node_modules --exclude runtime --exclude dossiers "$SOURCE/" "$QG/" || echec_maj 'copie des fichiers impossible (rsync).'
rm -rf "$TMP"
chmod +x "$QG"/*.command "$OUTILS"/*.sh 2>/dev/null || true

printf 'Fichiers mis a jour. Verification des dependances...\n'
/bin/bash "$OUTILS/installer.sh" --sans-lancer --silencieux || true
printf '\n'
if [ "$RELANCER" = "1" ]; then
  printf '\033[32mQG des agents mis a jour en version %s.\033[0m\n' "$DERNIERE"
  relance
else
  printf '\033[32mQG des agents mis a jour en version %s. Relance lancer.command.\033[0m\n' "$DERNIERE"
fi
