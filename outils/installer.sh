#!/bin/bash
# Installation du QG des agents sur macOS (lancee par installer.command). Equivalent de installer.ps1 :
# 1. Node.js portable dans runtime/node (rien n'est installe ailleurs sur le Mac) ;
# 2. dependances npm (SDK Claude Agent, qui contient Claude Code pour Apple Silicon ou Intel) ;
# 3. verifie git (outils en ligne de commande d'Apple) ;
# 4. retire la quarantaine du dossier du QG, pour que les .command s'ouvrent d'un double-clic.
# Chaque telechargement est verifie (empreinte SHA-256 publiee par l'editeur).
# Options : --sans-lancer (ne pas ouvrir le QG a la fin), --silencieux (aucune question).
set -euo pipefail

OUTILS="$(cd "$(dirname "$0")" && pwd)"
QG="$(cd "$OUTILS/.." && pwd)"
. "$OUTILS/commun.sh"

SANS_LANCER=0
for a in "$@"; do
  case "$a" in
    --sans-lancer) SANS_LANCER=1 ;;
    --silencieux) SILENCIEUX=1 ;;
  esac
done

RUNTIME="$QG/runtime"
NODE_VERSION='24.22.1'
NODE_DOSSIER="$RUNTIME/node"
NODE_EXE="$NODE_DOSSIER/bin/node"

printf 'QG des agents -- installation (macOS)\n'
printf 'Dossier : %s\n' "$QG"

# ------------------------------------------------------------------ systeme
etape 'Systeme'
[ "$(uname -s)" = "Darwin" ] || echec 'ce script est fait pour macOS (sur Windows, lance installer.bat).'
VERSION_MAC=$(sw_vers -productVersion 2>/dev/null || echo 0)
MAJEUR=${VERSION_MAC%%.*}
[ "$MAJEUR" -ge 13 ] 2>/dev/null || echec "macOS 13 ou plus est necessaire (version trouvee : $VERSION_MAC)."
ARCH=$(architecture)
ok "macOS $VERSION_MAC, $([ "$ARCH" = "arm64" ] && echo 'Apple Silicon' || echo 'Intel')"
case "$QG" in
  *[!' '-~]*) attention "Le chemin du dossier contient des caracteres speciaux : si l'installation echoue, deplace le QG dans un dossier simple (ex. ~/QG-des-agents)." ;;
esac
command -v curl >/dev/null 2>&1 || echec 'curl est introuvable.'
mkdir -p "$RUNTIME"

# ------------------------------------------------------------------ Node.js portable
etape "Node.js $NODE_VERSION (portable, dans runtime/node)"
VERSION_ACTUELLE=''
if [ -x "$NODE_EXE" ]; then VERSION_ACTUELLE=$("$NODE_EXE" -v 2>/dev/null || true); fi
if [ "$VERSION_ACTUELLE" = "v$NODE_VERSION" ]; then
  ok "deja installe ($VERSION_ACTUELLE)"
else
  NOM="node-v$NODE_VERSION-darwin-$ARCH"
  BASE="https://nodejs.org/dist/v$NODE_VERSION"
  TMP="$RUNTIME/telechargements"
  mkdir -p "$TMP"
  ARCHIVE="$TMP/$NOM.tar.gz"
  SOMMES="$TMP/SHASUMS256-node-$NODE_VERSION.txt"
  telecharger "$BASE/SHASUMS256.txt" "$SOMMES" || echec 'telechargement de Node.js impossible. Verifie ta connexion Internet.'
  telecharger "$BASE/$NOM.tar.gz" "$ARCHIVE" || echec 'telechargement de Node.js impossible. Verifie ta connexion Internet.'
  # (|| true : sous set -e, une ligne absente de SHASUMS256.txt doit mener au message echec ci-dessous, pas a une sortie muette)
  ATTENDUE=$(grep "  $NOM.tar.gz\$" "$SOMMES" | head -1 | awk '{print $1}' | tr 'A-F' 'a-f' || true)
  OBTENUE=$(sha256 "$ARCHIVE")
  if [ -z "$ATTENDUE" ] || [ "$OBTENUE" != "$ATTENDUE" ]; then
    rm -f "$ARCHIVE"
    echec 'empreinte de Node.js incorrecte : le fichier telecharge a ete supprime.'
  fi
  ok 'empreinte SHA-256 verifiee'
  EXTRAIT="$TMP/node-extrait"
  rm -rf "$EXTRAIT"
  mkdir -p "$EXTRAIT"
  tar -xzf "$ARCHIVE" -C "$EXTRAIT"
  rm -rf "$NODE_DOSSIER"
  mv "$EXTRAIT/$NOM" "$NODE_DOSSIER"
  rm -rf "$EXTRAIT" "$ARCHIVE" "$SOMMES"
  ok "installe ($("$NODE_EXE" -v))"
fi
export PATH="$NODE_DOSSIER/bin:$PATH"

# ------------------------------------------------------------------ dependances npm
etape 'Dependances (SDK Claude Agent et Claude Code)'
CLAUDE_EXE="$QG/node_modules/@anthropic-ai/claude-agent-sdk-darwin-$ARCH/claude"
cd "$QG"
if ! "$NODE_DOSSIER/bin/npm" ci --omit=dev --no-audit --no-fund --loglevel=error; then
  echec 'installation des dependances impossible (npm ci a echoue).'
fi
[ -x "$CLAUDE_EXE" ] || echec "Claude Code est introuvable apres l'installation (node_modules incomplet)."
ok "Claude Code $("$CLAUDE_EXE" --version 2>/dev/null | head -1)"

# ------------------------------------------------------------------ git
etape 'Git (utilise par les agents et par Claude Code)'
if xcode-select -p >/dev/null 2>&1 && command -v git >/dev/null 2>&1; then
  ok "$(git --version)"
else
  attention "Les outils en ligne de commande d'Apple (git) ne sont pas installes. Sans eux, les agents ne peuvent pas utiliser git."
  if question "Lancer leur installation maintenant (xcode-select --install, fenetre d'Apple) ?" 0; then
    xcode-select --install || true
    attention 'Termine cette installation dans la fenetre qui vient de s ouvrir, puis relance le QG.'
  else
    attention 'Plus tard : tape « xcode-select --install » dans le Terminal.'
  fi
fi

# ------------------------------------------------------------------ quarantaine et droits
etape 'Fichiers du QG'
# Un zip telecharge par un navigateur met chaque fichier extrait en quarantaine (Gatekeeper bloque les .command).
# On ne touche qu'au dossier du QG.
xattr -dr com.apple.quarantine "$QG" 2>/dev/null || true
chmod +x "$QG"/*.command "$OUTILS"/*.sh 2>/dev/null || true
ok 'quarantaine retiree, scripts executables'

# ------------------------------------------------------------------ raccourci
etape 'Raccourci'
BUREAU="$HOME/Desktop"
LIEN="$BUREAU/QG des agents.command"
if [ -d "$BUREAU" ] && [ ! -e "$LIEN" ] && question 'Creer un raccourci « QG des agents » sur le bureau ?' 0; then
  ln -s "$QG/lancer.command" "$LIEN" && ok 'raccourci cree sur le bureau' || attention 'raccourci impossible'
else
  info 'pas de raccourci'
fi

printf '\n\033[32mInstallation terminee.\033[0m\n'
if [ "$SANS_LANCER" = "0" ]; then
  printf "Le QG va s'ouvrir dans ton navigateur : la configuration guidee t'accompagne (connexion a Claude, choix de tes dossiers).\n"
  open "$QG/lancer.command"
fi
