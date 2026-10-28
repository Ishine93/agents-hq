#!/bin/bash
# Installation du QG des agents sur Mac en une ligne, sans l'alerte « Apple n'a pas pu confirmer... » :
#   curl -fsSL https://raw.githubusercontent.com/Ishine93/agents-hq/main/outils/installer-en-ligne.sh | bash
# Un zip telecharge par un navigateur est mis en quarantaine, et Gatekeeper bloque alors chaque .command.
# Ce script telecharge la derniere version avec curl (pas de quarantaine), verifie son empreinte SHA-256,
# l'extrait dans ~/QG-des-agents puis lance l'installation habituelle (outils/installer.sh).
# Si ~/QG-des-agents contient deja le QG : on reprend son installation, sans rien ecraser.
# QG_DOSSIER : autre dossier d'installation. QG_SANS_INSTALLATION=1 : telecharger et extraire seulement.
# Compatible bash 3.2 (celui de macOS). Tout est dans une fonction, appelee a la fin : un telechargement
# coupe en route n'execute rien.

installer_qg() {
  set -euo pipefail
  local DEPOT='Ishine93/agents-hq'
  local DEST="${QG_DOSSIER:-$HOME/QG-des-agents}"
  local TMP='' VERSION='' REL='' FINAL='' ZIP='' ATTENDUE='' OBTENUE='' SOURCE=''

  rouge() { printf '\n\033[31m%s\033[0m\n' "$1"; }
  vert() { printf '\033[32m%s\033[0m\n' "$1"; }
  echec() {
    rouge "ECHEC : $1"
    printf "Rien n'a ete installe. Tu peux relancer la meme commande.\n"
    [ -n "$TMP" ] && rm -rf "$TMP"
    exit 1
  }
  empreinte() {
    if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}' | tr 'A-F' 'a-f'
    else sha256sum "$1" | awk '{print $1}' | tr 'A-F' 'a-f'; fi
  }
  telecharger() {
    local essai=1
    while [ "$essai" -le 3 ]; do
      if curl -fL --retry 2 --connect-timeout 30 --max-time 900 -A 'QG-des-agents' -o "$2" "$1"; then return 0; fi
      [ "$essai" -eq 3 ] && return 1
      printf 'Telechargement interrompu, nouvel essai (%s/3)...\n' "$essai"
      sleep 3
      essai=$((essai + 1))
    done
    return 1
  }
  # L'installation pose des questions (git, raccourci) : on lit le clavier, pas la commande recue par curl.
  installer_dans() {
    if [ "${QG_SANS_INSTALLATION:-0}" = "1" ]; then vert "Extrait dans $1 (installation non lancee)."; return 0; fi
    if [ -r /dev/tty ]; then /bin/bash "$1/outils/installer.sh" < /dev/tty; else /bin/bash "$1/outils/installer.sh" --silencieux; fi
  }

  printf 'QG des agents -- installation sur Mac\n'
  [ "$(uname -s)" = "Darwin" ] || echec 'ce script est fait pour macOS. Sur Windows : telecharge le zip et lance installer.bat (voir le README).'
  command -v curl >/dev/null 2>&1 || echec 'curl est introuvable.'

  # Deja la ? (zip extrait a la main, ou installation precedente)
  if [ -f "$DEST/serveur/index.js" ]; then
    printf 'Le QG est deja dans %s : on reprend son installation (tes reglages et tes dossiers restent).\n' "$DEST"
    xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
    installer_dans "$DEST"
    return 0
  fi
  [ -e "$DEST" ] && echec "$DEST existe deja et ne contient pas le QG. Renomme-le, ou choisis un autre dossier : QG_DOSSIER=~/autre-dossier devant bash."

  # Derniere version : l'API GitHub, sinon la page « latest » qui redirige vers celle de sa version.
  REL=$(curl -fsL -A 'QG-des-agents' --max-time 20 "https://api.github.com/repos/$DEPOT/releases/latest" 2>/dev/null || true)
  VERSION=$(printf '%s' "$REL" | grep -E '"tag_name"' | head -1 | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v?([^"]+)".*/\1/' || true)
  if [ -z "$VERSION" ]; then
    FINAL=$(curl -sIL -A 'QG-des-agents' --max-time 20 -o /dev/null -w '%{url_effective}' "https://github.com/$DEPOT/releases/latest" 2>/dev/null || true)
    VERSION=$(printf '%s' "$FINAL" | sed -nE 's#.*/releases/tag/v?([A-Za-z0-9._-]+)$#\1#p' || true)
  fi
  [ -n "$VERSION" ] || echec 'impossible de lire la derniere version sur GitHub (connexion Internet ?).'
  printf 'Version %s, installee dans %s\n' "$VERSION" "$DEST"

  TMP=$(mktemp -d "${TMPDIR:-/tmp}/qg-installation.XXXXXX")
  ZIP="$TMP/QG-des-agents-$VERSION.zip"
  telecharger "https://github.com/$DEPOT/releases/download/v$VERSION/QG-des-agents-$VERSION.zip" "$ZIP" || echec 'telechargement impossible.'
  telecharger "https://github.com/$DEPOT/releases/download/v$VERSION/QG-des-agents-$VERSION.zip.sha256" "$ZIP.sha256" || echec 'telechargement impossible.'
  ATTENDUE=$(head -1 "$ZIP.sha256" | awk '{print $1}' | tr 'A-F' 'a-f')
  OBTENUE=$(empreinte "$ZIP")
  [ -n "$ATTENDUE" ] && [ "$OBTENUE" = "$ATTENDUE" ] || echec 'empreinte SHA-256 incorrecte : fichier abime ou modifie.'
  vert 'Empreinte SHA-256 verifiee.'

  mkdir -p "$TMP/extrait"
  # ditto garde les droits Unix (bit executable des .command) ; unzip en secours
  if command -v ditto >/dev/null 2>&1; then ditto -x -k "$ZIP" "$TMP/extrait"; else unzip -q "$ZIP" -d "$TMP/extrait"; fi
  SOURCE="$TMP/extrait/QG-des-agents"
  [ -f "$SOURCE/serveur/index.js" ] || echec 'contenu du zip inattendu.'
  mkdir -p "$(dirname "$DEST")"
  mv "$SOURCE" "$DEST"
  rm -rf "$TMP"
  TMP=''
  chmod +x "$DEST"/*.command "$DEST"/outils/*.sh 2>/dev/null || true
  vert "QG des agents $VERSION extrait dans $DEST"

  installer_dans "$DEST"
}

installer_qg "$@"
