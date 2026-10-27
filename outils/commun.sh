#!/bin/bash
# Fonctions partagees par les scripts Mac du QG (installer.sh, mettre-a-jour.sh).
# Compatible bash 3.2 (celui livre avec macOS) : pas de tableaux associatifs, pas de ${v,,}.
# A charger avec : . "$(dirname "$0")/commun.sh"

SILENCIEUX=0

etape() { printf '\n\033[36m== %s\033[0m\n' "$1"; }
ok() { printf '   \033[32mOK\033[0m  %s\n' "$1"; }
info() { printf '   %s\n' "$1"; }
attention() { printf '   \033[33m!\033[0m   %s\n' "$1"; }
echec() {
  printf '\n\033[31mECHEC : %s\033[0m\n' "$1"
  printf "Rien n'a ete modifie en dehors du dossier du QG. Tu peux relancer le script.\n"
  exit 1
}

# question "texte" [reponse si silencieux : 1 = oui, 0 = non]
question() {
  local defaut="${2:-1}"
  if [ "$SILENCIEUX" = "1" ]; then return $((1 - defaut)); fi
  printf '%s [O/n] ' "$1"
  read -r r
  case "$r" in
    ''|[oOyY]*) return 0 ;;
    *) return 1 ;;
  esac
}

# telecharger URL FICHIER : trois essais (connexion qui coupe, serveur occupe...)
telecharger() {
  local url="$1" fichier="$2" essai=1
  info "Telechargement : $url"
  while [ "$essai" -le 3 ]; do
    if curl -fL --retry 2 --connect-timeout 30 --max-time 900 -A 'QG-des-agents' -o "$fichier" "$url"; then return 0; fi
    if [ "$essai" -eq 3 ]; then return 1; fi
    attention "Telechargement interrompu, nouvel essai ($essai/3)..."
    sleep 3
    essai=$((essai + 1))
  done
  return 1
}

# sha256 FICHIER : empreinte en minuscules
sha256() { shasum -a 256 "$1" | awk '{print $1}' | tr 'A-F' 'a-f'; }

# Apple Silicon ou Intel ? (un Terminal sous Rosetta repond x86_64 a uname -m : on demande au noyau)
architecture() {
  if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then echo arm64; else echo x64; fi
}

# Port du QG : config/reglages.json, sinon config/defauts/reglages.json, sinon 4747.
port_qg() {
  local qg="$1" f p
  for f in "$qg/config/reglages.json" "$qg/config/defauts/reglages.json"; do
    [ -f "$f" ] || continue
    p=$(grep -E '"port"[[:space:]]*:' "$f" | head -1 | sed -E 's/.*"port"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/')
    if [ -n "$p" ]; then echo "$p"; return; fi
  done
  echo 4747
}

# Le QG repond-il sur ce port ?
qg_repond() { curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/" ; }

# Un serveur du QG (CE dossier) tourne-t-il ? Les .command lancent « <QG>/runtime/node/bin/node <QG>/serveur/index.js » ;
# on reconnait aussi un lancement a la main (« node serveur/index.js » depuis le dossier du QG, chemin relatif).
qg_tourne() {
  pgrep -f "$1/serveur/index.js" >/dev/null 2>&1 && return 0
  pgrep -f "$1/runtime/node/bin/node serveur/index.js" >/dev/null 2>&1
}
