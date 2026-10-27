# Portage macOS du QG des agents : analyse

*Tâche T3, 26 octobre 2026. Analyse seule : aucun code n'a été modifié.*

**Référence des lignes : commit `925649b` (« Base 1.0.5 »).** D'autres tâches modifient en ce moment `serveur/api-reglages.js`, `serveur/config.js`, `serveur/detection.js`, `serveur/index.js` et plusieurs fichiers de `web/`. Les numéros de ligne cités ici sont donc ceux de `git show 925649b:<fichier>`. Dans la copie de travail, ils peuvent être décalés de quelques lignes.

---

## 0. Ce qu'il faut retenir

Le cœur du QG (serveur Node, site web, SDK Agent) est **déjà presque portable** :
- le SDK `@anthropic-ai/claude-agent-sdk` 0.3.310 publie un binaire natif par plateforme (`claude-agent-sdk-darwin-arm64`, `-darwin-x64`, etc. en dépendances optionnelles) ;
- le SDK choisit lui-même `@anthropic-ai/claude-agent-sdk-${platform}-${arch}/claude${win32 ? '.exe' : ''}` (fonction de résolution dans `sdk.mjs`) ;
- `package-lock.json` contient déjà les entrées `darwin-arm64` et `darwin-x64` (lignes 43-68), donc `npm ci` sur Mac installera le bon binaire.

Ce qui casse, c'est **tout le contour** : scripts `.bat` et `.ps1`, appels à `cmd.exe`, `powershell.exe`, `taskkill`, `netstat`, `reg`, `tar.exe`, chemins `C:\` et `\\` dans les défauts. Il y a aussi **trois points de sécurité ou d'identité propres au Mac** :
1. **Identifiants dans le trousseau** : sur macOS, Claude Code range le jeton dans le trousseau, pas dans `.credentials.json`. Le QG croirait donc chaque compte « non connecté ».
2. **Règles de permission** : `cheminRegle()` produit `/Users/x/Dev`, que Claude Code lit comme un chemin **relatif au fichier de réglages**, pas comme un chemin absolu. Il faut écrire `//Users/x/Dev`.
3. **Écriture hors zones** : `reglesPourZones()` ne parcourt que les lettres de lecteur `A:` à `Z:`. Sur Mac, elle ne produit **aucune règle « demander »** : un agent en mode auto pourrait écrire n'importe où.

---

## 1. Inventaire des dépendances à Windows

Gravités : **B** = bloquant (la fonction ne marche pas, ou faille de sécurité) ; **D** = dégradé acceptable (marche moins bien, ou peut être désactivé proprement) ; **C** = cosmétique (textes, icônes).

### 1.1 Scripts à la racine et `outils/`

| Fichier:ligne | Rôle | Ce qui casse sur macOS | Solution proposée | Grav. |
|---|---|---|---|---|
| `installer.bat:5` | lance `outils/installer.ps1` | `.bat` illisible sur Mac, pas de PowerShell | `installer.command` (bash, LF, exécutable) qui fait le travail de `installer.ps1` | B |
| `lancer.bat:7-27` | 1er lancement, puis `node serveur/index.js`, gestion du code 42 | idem | `lancer.command` : `cd "$(dirname "$0")"`, installation si `runtime/node/bin/node` manque, puis `runtime/node/bin/node serveur/index.js "$@"` ; code 42 → `exit 0` | B |
| `lancer-demo.bat:8-11` | démo sur port+1 | idem | `lancer-demo.command` | B |
| `mettre-a-jour.bat:5` | lance `mettre-a-jour.ps1` | idem | `mettre-a-jour.command` → `outils/mettre-a-jour.sh` | B |
| `ajouter-un-compte.bat:10`, `connecter-un-compte.bat:10` | `node serveur/connexion.js` | idem | `ajouter-un-compte.command`, `connecter-un-compte.command` | B |
| `connexion-compte-1.bat`, `connexion-compte-2.bat` | anciens raccourcis de connexion | idem | pas de version Mac (remplacés par Réglages › Comptes) | C |
| `installer-dictee.bat:5` | lance `installer-dictee.ps1` | idem | `installer-dictee.command` → `outils/installer-dictee.sh` | D |
| `outils/installer.ps1:52-55` | vérifie Windows 10/11 64 bits | PowerShell | `uname -s` = Darwin, `sw_vers -productVersion` ≥ 13 (Claude Code demande macOS 13+) | B |
| `outils/installer.ps1:67` | archive `node-v…-win-x64.zip` | mauvaise archive | `node-v24.22.1-darwin-arm64.tar.gz` ou `-darwin-x64.tar.gz` selon le processeur (voir §3.4) | B |
| `outils/installer.ps1:77-79` | SHA-256 (`Get-FileHash`) | PowerShell | `shasum -a 256` + ligne correspondante de `SHASUMS256.txt` | B |
| `outils/installer.ps1:83` | `Expand-Archive` | PowerShell | `tar -xzf` (garde les liens `bin/npm`, `bin/npx`) | B |
| `outils/installer.ps1:61`, `:90`, `:95` | `node.exe`, `npm.cmd`, PATH avec `;` | binaires dans `runtime/node/bin/`, séparateur `:` | `runtime/node/bin/node`, `runtime/node/bin/npm`, `PATH="$QG/runtime/node/bin:$PATH"` | B |
| `outils/installer.ps1:94`, `:105-106` | vérifie `claude-agent-sdk-win32-x64/claude.exe` | ce paquet n'existe pas sur Mac | vérifier `claude-agent-sdk-darwin-$ARCH/claude` (ou demander le chemin à `node -e` via `plateforme.js`) | B |
| `outils/installer.ps1:110-124` | Git pour Windows, `bash.exe`, `winget` | sans objet | `xcode-select -p` ; si absent, proposer `xcode-select --install` (outils en ligne de commande d'Apple, qui contiennent git). Le shell vient du système (zsh/bash) | D |
| `outils/installer.ps1:127-142` | raccourci `.lnk` (COM `WScript.Shell`) | sans objet | facultatif : lien symbolique `~/Desktop/QG des agents.command` → `lancer.command` ; sinon rien | C |
| `outils/installer.ps1:149` | `Start-Process lancer.bat` | idem | `open "$QG/lancer.command"` (ouvre une fenêtre Terminal) | B |
| `outils/installer.ps1` (nouveau) | — | fichiers extraits d'un zip téléchargé : attribut de quarantaine | `xattr -dr com.apple.quarantine "$QG"` en fin d'installation (dossier du QG seulement) | B |
| `outils/mettre-a-jour.ps1:17-34` | port, test TCP, `Get-CimInstance Win32_Process` | PowerShell / WMI | `nc -z 127.0.0.1 $port` ou `curl -s`, `pgrep -f "$QG/serveur/index.js"` | B |
| `outils/mettre-a-jour.ps1:70-74` | `Wait-Process -AttendrePid` | idem | `while kill -0 "$pid" 2>/dev/null; do sleep 1; done` (délai 60 s) | B |
| `outils/mettre-a-jour.ps1:85-89` | prend le **premier** asset `*.zip` et le **premier** `*.sha256` | (risque Windows) une archive Mac à part dans la même version pourrait être prise à la place | **une seule archive universelle** `QG-des-agents-<v>.zip` (voir §3.4) ; ne jamais publier un 2ᵉ `.zip` ou `.sha256` | B |
| `outils/mettre-a-jour.ps1:131-138` | téléchargement, SHA-256, `Expand-Archive` | PowerShell | `curl -fL --retry 3`, `shasum -a 256`, `ditto -x -k` (garde les droits) | B |
| `outils/mettre-a-jour.ps1:143` | `robocopy /E /XD node_modules runtime dossiers` | Windows | `rsync -a --exclude node_modules --exclude runtime --exclude dossiers "$src/" "$QG/"` (rsync est livré avec macOS) | B |
| `outils/mettre-a-jour.ps1:148` | relance `installer.ps1 -SansLancer -Silencieux` | idem | `bash outils/installer.sh --sans-lancer --silencieux` | B |
| `outils/mettre-a-jour.ps1:45` | relance `lancer.bat` | idem | `open "$QG/lancer.command" --args …` ne transmet pas les arguments à un `.command` → écrire `runtime/relance.command` (voir §3.2) | B |
| `outils/installer-dictee.ps1:26-34` | détection `nvidia-smi` | jamais de NVIDIA sur Mac récent | sauter : CPU (Intel) ou Apple Silicon (voir §2.8) | D |
| `outils/installer-dictee.ps1:44-51` | `uv-x86_64-pc-windows-msvc.zip` | mauvaise archive | `uv-aarch64-apple-darwin.tar.gz` / `uv-x86_64-apple-darwin.tar.gz` + `.sha256` (publiés, uv 0.13.5) | D |
| `outils/installer-dictee.ps1:60-64` | `venv\Scripts\python.exe` | `venv/bin/python` sur Mac | chemin selon la plateforme | D |
| `outils/installer-dictee.ps1:66`, `:72-73` | paquets CUDA, modèle large-v3 GPU | sans objet | pas de `nvidia-*` ; modèle `large-v3-turbo` (CPU int8), voir §2.8 | D |
| `outils/preparer-release.mjs:23-26` | liste blanche des fichiers racine | ne contient que des `.bat` | ajouter les `.command` | B |
| `outils/preparer-release.mjs:34` | `outils/` : `.ps1` et `.mjs` seulement | les `.sh` ne partiraient pas | ajouter `.sh` | B |
| `outils/preparer-release.mjs:59-69` | force CRLF (`.bat`) et BOM+CRLF (`.ps1`) | rien ne force LF sur `.sh`/`.command` ; `core.autocrlf=true` sur ce poste | forcer LF + pas de BOM pour `.sh`/`.command` ; refuser un `\r` | B |
| `outils/preparer-release.mjs:52` | motif « dossier personnel Windows » | pas de motif Mac | ajouter `/Users/(?!Shared\b)[A-Za-z0-9._-]+` | D |
| `outils/preparer-release.mjs:125-127` | zip via `C:\Windows\System32\tar.exe` | ne fixe aucun droit Unix : les `.command` ne seraient pas exécutables une fois extraits sur Mac | écrire le zip en Node (zlib) avec les droits Unix (0755 pour `.command`/`.sh`, 0644 sinon) dans les attributs externes (voir §3.4) | B |
| `outils/fabriquer-icone.ps1:6` | icône `.ico` via System.Drawing | outil de dev Windows | inchangé (outil auteur) ; ajouter plus tard un `icone.icns`/`png` si besoin | C |

### 1.2 Serveur (`serveur/`)

| Fichier:ligne | Rôle | Ce qui casse sur macOS | Solution proposée | Grav. |
|---|---|---|---|---|
| `serveur/comptes.js:12` | `CLAUDE_EXE` = `claude-agent-sdk-win32-x64/claude.exe` | chemin inexistant : connexion et déconnexion impossibles | `plateforme.claudeExe()` = `node_modules/@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude${ext}` | B |
| `serveur/comptes.js:45` | `compteConnecte` = existence de `.credentials.json` | sur Mac, le jeton est **dans le trousseau** (service lié au `CLAUDE_CONFIG_DIR`) : compte toujours « non connecté », suivi des limites coupé | `plateforme.etatConnexion(compte)` : sur Mac, `claude auth status --json` (avec `envPour(compte)`), résultat mis en cache 30 s ; le fichier reste vérifié en secours | B |
| `serveur/comptes.js:58` | doublon de dossier comparé en minuscules | APFS est insensible à la casse par défaut, sauf volume sensible | comparer avec `plateforme.memeChemin()` | C |
| `serveur/comptes.js:105-108` | ouvre une fenêtre `cmd start "Connexion" node.exe connexion.js` | pas de `cmd.exe` ni de `node.exe` | `plateforme.ouvrirTerminal('Connexion', [node, script, id, 'login', '--pause'])` (voir §3.1) | B |
| `serveur/comptes.js:116` | `spawn(CLAUDE_EXE, ['auth','logout'])` | dépend de la ligne 12 | idem ligne 12 | B |
| `serveur/connexion.js:25`, `:46-47` | lance `claude auth login/status` ; message « lance installer.bat » | chemin, texte | chemin via `plateforme` ; texte avec le nom du script de la plateforme | B |
| `serveur/api-reglages.js:28` | `mtimeIdentifiants` : date de `.credentials.json` pour voir la fin d'une connexion | le fichier n'existe pas sur Mac : la surveillance ne voit jamais la connexion | sur Mac, interroger `etatConnexion()` toutes les 3 s pendant la fenêtre de 15 min | B |
| `serveur/api-reglages.js:66-80` | `choisirDossier` : PowerShell `FolderBrowserDialog` (T2 la refond : `SELECTEURS_DOSSIER = { win32 }`) | pas de PowerShell : renvoie `null` | ajouter `darwin: selecteurMac` : `osascript -e 'POSIX path of (choose folder with prompt "…")'` ; l'annulation rend l'erreur −128 → `null` ; `rappeler()` est un no-op | B |
| `serveur/api-reglages.js:252` | compte « partagé » = `process.env.USERPROFILE/.claude` | `USERPROFILE` absent : `.claude` relatif | `os.homedir()` | B |
| `serveur/api-reglages.js:300-302` | installe la dictée : `cmd start installer-dictee.bat` | idem | `plateforme.ouvrirTerminal('Dictée', ['bash', 'outils/installer-dictee.sh'])` | D |
| `serveur/bus.js:101` | `partage` comparé en minuscules | (casse) | `memeChemin` | C |
| `serveur/bus.js:135` | `claudeCodeLocal` = `~/.claude/.credentials.json` | trousseau sur Mac | `etatConnexion({ configDir: null })` mis en cache | D |
| `serveur/config.js:14` | `NODE_DIR = runtime/node` | sur Mac, les binaires sont dans `runtime/node/bin` | `plateforme.nodeBin()` (dossier) et `plateforme.nodeExe()` | B |
| `serveur/config.js:41-42` | remplace `{QG}`/`{HOME}` dans les défauts, double les `\` | les défauts écrivent `\\` comme séparateur (voir 1.4) | sur POSIX, convertir aussi les `\\` des modèles en `/` (dans `assurerConfig`, seulement à la création) | B |
| `serveur/config.js:110` | `{DEMO}\\direction` (démo) | idem | idem | B |
| `serveur/config.js:201` | `normaliser` : minuscules + `\`→`/` | (casse) ; pas de normalisation Unicode (APFS garde la forme NFD des noms anciens) | `plateforme.cleChemin(p)` : `path.resolve` + `.normalize('NFC')` + minuscules sur win32 et darwin | D |
| `serveur/config.js:220-224` | `cheminRegle` : `D:\Dev` → `//d/Dev` ; sinon chemin tel quel | sur Mac renvoie `/Users/x/Dev`, que Claude Code lit comme **relatif au fichier de réglages** : toutes les règles `{ZONES}`, `{QG}`, `{COMPTES}`, « demander » visent le mauvais endroit | POSIX : préfixer `/` → `//Users/x/Dev` (forme absolue documentée) | B |
| `serveur/permissions.js:21` | `meme()` en minuscules | (casse) | `memeChemin` | C |
| `serveur/permissions.js:51-57` | `reglesPourZones` : boucle `A:` à `Z:` | **aucune** règle « demander » sur Mac : écriture libre hors zones en mode auto | POSIX : `explorer('/', zones, cibles)` (même algorithme, racine unique) ; `/Volumes` est couvert par le parcours | B |
| `serveur/permissions.js:76` | `{HOME}`, `{QG}` via `cheminRegle` | dépend de `cheminRegle` | corrigé par `cheminRegle` | B |
| `serveur/session.js:42-43` | `PATH = NODE_DIR;PATH` | séparateur `;` : la 1ʳᵉ entrée du PATH Mac est cassée et Node portable introuvable | `${plateforme.nodeBin()}${path.delimiter}${PATH}` | B |
| `serveur/maj.js:72-74` | `cmd start powershell mettre-a-jour.ps1 -AttendrePid -Relancer` | idem | `plateforme.lancerMiseAJour({ pid, ouvrir })` → `outils/mettre-a-jour.sh` dans un Terminal | B |
| `serveur/maj.js:52` | `zip: assets.some(.zip)` | rien (archive universelle) | inchangé si §3.4 est suivi | — |
| `serveur/raccourci.js:22` | sort si non win32 | rien | rien à faire (déjà protégé) | — |
| `serveur/raccourci.js:32` | cible `lancer.bat` | Windows seul | inchangé | — |
| `serveur/notifications.js:21`, `:32-46` | toast Windows via PowerShell si aucun onglet n'est ouvert | pas de PowerShell | `plateforme.notifier(titre, texte)` : `osascript -e 'display notification …'`. Clic sans effet (ouvre l'Éditeur de scripts), permission demandée au nom de « Éditeur de scripts » | D |
| `serveur/index.js:396`, `:451` | ouvre le site : `cmd /c start "" lien` | idem | `plateforme.ouvrirUrl(lien)` → `open lien` | B |
| `serveur/index.js:399` | lance la démo : `cmd start lancer-demo.bat` | idem | `plateforme.ouvrirTerminal('QG démo', [node, 'serveur/index.js', '--demo', …])` | D |
| `serveur/index.js:550` | `SIGHUP` « fenêtre fermée » | rien : fermer la fenêtre Terminal envoie aussi SIGHUP | inchangé ; commentaire à corriger | C |
| `serveur/index.js:427`, `:449` ; `serveur/ordonnanceur.js:177-178`, `:710` ; `serveur/basculer.js:31` | messages « lance lancer.bat / ajouter-un-compte.bat / connexion-compte-{n}.bat » | textes faux sur Mac | `plateforme.script('lancer')` → `lancer.bat` ou `lancer.command` ; « connexion-compte-{n}.bat » → « Réglages › Comptes » partout | C |
| `serveur/services.js:94-98` | `netstat -ano -p tcp` (format Windows) | format différent, pas de PID : conflits de port non vus | `lsof -nP -iTCP -sTCP:LISTEN -Fpn` (PID + port) | D |
| `serveur/services.js:145` | `spawn(def.exe, …)` sans groupe | sur POSIX, l'arbre ne peut pas être tué d'un coup | `detached: true` sur POSIX (nouveau groupe de processus) | B |
| `serveur/services.js:190`, `:214` | `taskkill /PID /T /F` | absent : les services (Rojo…) ne s'arrêtent pas | `plateforme.tuerArbre(pid)` : `process.kill(-pid, 'SIGTERM')`, puis `SIGKILL` après 3 s | B |
| `serveur/dictee.js:10` | `venv\Scripts\python.exe` | `venv/bin/python` | `plateforme.pythonVenv(venv)` | D |
| `serveur/dictee_worker.py:19-24` | DLL CUDA (`os.add_dll_directory`) | protégé par `is_dir()` : sans effet sur Mac | rien ; le repli `cpu/int8/large-v3-turbo` (l.56) suffit | — |
| `serveur/navigateur.js:18` | `electron.exe` | sur Mac : `dist/Electron.app/Contents/MacOS/Electron` | lire `node_modules/electron/path.txt` (fichier du paquet electron) | D |
| `serveur/navigateur.js:42` | `node.exe` pour `npm install electron` | idem `nodeExe()` | `plateforme.nodeExe()` | D |
| `serveur/navigateur.js:186-225` | navigateur par défaut via le registre (`reg query`), `chrome.exe --app`, `cmd start` | rien ne marche | Mac : `open "$url"` (onglet du navigateur par défaut). Plus tard : lire `LSHandlers` (`defaults read com.apple.LaunchServices/com.apple.launchservices.secure`) et lancer `open -na "Google Chrome" --args --app=URL` | D |
| `serveur/navigateur.js:167` | User-Agent « Windows NT 10.0 » | rien de cassé | facultatif : UA Mac | C |
| `serveur/recherche.js:13-17` | Edge/Chrome dans `C:\Program Files` pour `mcp__qg__capturer_page` | introuvables : capture impossible | ajouter `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `…/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`, Brave, Chromium | D |
| `serveur/skills.js:22`, `:218` | `C:\Windows\System32\tar.exe` pour extraire un `.skill`/`.zip` | chemin inexistant : import d'archive impossible | `/usr/bin/tar` (bsdtar, lit le zip) | D |
| `serveur/skills.js:229` | `~/.claude/skills` | rien | — | — |
| `serveur/detection.js:15`, `:17` | `norme` en minuscules ; dossiers ignorés = dossiers système Windows | rien de cassé ; un scan de `~` remonterait `Library`, `Applications`… | ajouter `library`, `applications`, `system`, `volumes`, `.trash` (déjà ignoré par le `.`), `movies`, `music`, `pictures` | C |
| `serveur/ports.js:7` ; `serveur/explication.js:33` ; `serveur/pieces.js:51`, `:55` ; `serveur/ordonnanceur.js:46` | comparaisons de chemins en minuscules | (casse, voir §6) | `cleChemin` / `memeChemin` | C |
| `serveur/explication.js:48-49` | reconnaît `iwr`, `Remove-Item`, `del`… | rien de cassé (les commandes Unix sont aussi reconnues) | — | — |

### 1.3 Fenêtre application Electron (`app/`)

| Fichier:ligne | Rôle | Ce qui casse sur macOS | Solution proposée | Grav. |
|---|---|---|---|---|
| `app/main.cjs:22` | `app.setAppUserModelId` | API documentée pour Windows seulement : risque d'exception au démarrage selon la version d'Electron | `if (process.platform === 'win32')` | B (à vérifier) |
| `app/main.cjs:65` | `icon: icone.ico` | ignoré sur Mac | `app.dock.setIcon(web/icone.png)` sur darwin | C |
| `app/main.cjs:67`, `:71` | `autoHideMenuBar`, `removeMenu()` | sur Mac, sans menu Édition, **⌘C / ⌘V / ⌘A ne marchent plus** dans les champs du QG | darwin : `Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]))` | B |
| `app/main.cjs:25` | UA « Windows NT 10.0 » | rien de cassé | facultatif : UA Mac | C |
| `app/main.cjs:156` | `window-all-closed` → quitter si inutile | convention Mac différente, sans gravité | inchangé | — |

### 1.4 Réglages par défaut (`config/defauts/`)

| Fichier:ligne | Rôle | Ce qui casse sur macOS | Solution proposée | Grav. |
|---|---|---|---|---|
| `config/defauts/comptes.json:4` | `"{HOME}\\.claude-qg\\claude1"` | donne `/Users/x\.claude-qg\claude1` : un seul nom avec des antislashs, à créer dans `/Users` (refusé) | conversion à la création (voir `config.js:41`) | B |
| `config/defauts/etages.json:4` | `"{QG}\\bac-a-sable\\projet-demo"` | étage Bac à sable introuvable | idem | B |
| `config/defauts/etages-demo.json` (tous les `{DEMO}\\…`) | immeuble de la démo | idem | idem | B |
| `config/defauts/profils.json:12` | `Read(//c/Users/*/.claude/.credentials.json)` | forme Windows | ajouter `Read(//Users/*/.claude/.credentials.json)` (fichier de secours écrit quand le trousseau refuse) | D |
| `config/defauts/profils.json:9-11` | refuse `shutdown`, `reg`, `setx` | `reg`/`setx` n'existent pas sur Mac (sans danger) | ajouter `Bash(security *)` (lecture du trousseau), `Bash(sudo *)`, `Bash(launchctl *)`, `Bash(defaults write *)` ; voir §6 pour les limites des règles Bash | B |
| `config/defauts/profils.json:166`, `:200` | `Bash(python tools/*)` | sur Mac, `python` n'existe souvent pas, seulement `python3` | ajouter `Bash(python3 tools/*)`, `Bash(python3 -m pytest *)` | D |
| `config/defauts/directive-dg.md`, `config/defauts/directive-tache.md`, `config/defauts/directive-verif.md` | consignes | **aucune mention de PowerShell, de Windows ni de `.bat`** (vérifié par Grep) | rien d'obligatoire ; facultatif : un `{SYSTEME}` (« macOS, shell zsh » / « Windows, Git Bash ») pour que les agents choisissent leurs commandes | C |
| `config/defauts/services.json:7` | `"exe": "rojo"` | rien (PATH du Terminal) | — | — |

### 1.5 Site (`web/`)

| Fichier:ligne | Rôle | Ce qui casse sur macOS | Solution proposée | Grav. |
|---|---|---|---|---|
| `web/dictee.js:24` | raccourci `Alt+M` testé sur `e.key === 'm'` | sur Mac, ⌥M produit `e.key = 'µ'` : le raccourci ne marche pas | tester `e.code === 'KeyM'` | D |
| `web/dictee.js:6` | libellé `'Alt+M'` | Mac : « ⌥M » | libellé selon la plateforme (`navigator.userAgentData?.platform` ou `navigator.platform`) | C |
| `web/dictee.js:56`, `:62` ; `web/accueil.js:217` ; `web/parametres.js:754` | « dictée de Windows (Win+H) », « carte NVIDIA » | faux sur Mac | Mac : « Dictée de macOS (touche micro ou Fn deux fois) » ; tailles du modèle Mac | C |
| `web/accueil.js:215` ; `web/parametres.js:751` | « Alt+M » | idem | idem | C |
| `web/parametres.js:279` ; `web/main.js:25` | « ajouter-un-compte.bat », « lancer.bat » | idem | nom de script envoyé par le serveur (`plateforme` dans `/api/reglages`) | C |
| `web/parametres.js:172` ; `web/ui.js:782`, `:1506`, `:1749` | « Ctrl+Entrée », « Ctrl+V » | `ui.js:1555` accepte déjà ⌘ : seul le texte est faux | libellés « ⌘↩ », « ⌘V » sur Mac | C |
| `web/nav-distant.js:222-243` | clavier du navigateur complet : ⌥ (`altKey`) traité comme raccourci | sur les claviers Mac, ⌥ sert à taper `{ } [ ] \| \ ~` : ces caractères partiraient comme raccourcis | sur Mac, ⌥ sans ⌘ ni Ctrl et `e.key.length === 1` → envoyer comme caractère (comme AltGr) | D |
| `web/i18n/en.js`, `web/i18n/parts/*.json`, `serveur/i18n/en.json` | traductions | nouvelles chaînes Mac | ajouter les clés (`npm run traductions`) | C |
| `web/sprites.js:795`, `web/phrases.js:69` | reconnaissent l'outil `PowerShell` | rien de cassé | — | — |

### 1.6 Racine et documentation

| Fichier:ligne | Rôle | Ce qui casse sur macOS | Solution proposée | Grav. |
|---|---|---|---|---|
| `package.json:8-10` | `engines.node >= 24` | rien | — | — |
| `package.json:17` | `@anthropic-ai/claude-agent-sdk` 0.3.310 | rien : binaires darwin-arm64/x64 en optionnelles | — | — |
| `README.md:16` | « Windows 10 ou 11 » | texte | section « Sur Mac » (§3.5) | C |
| `.gitignore` | — | pas de `.gitattributes` : avec `core.autocrlf=true` (réglage de ce poste), un `.sh` sortirait en CRLF (`bad interpreter: /bin/bash^M`) | créer `.gitattributes` (§3.3) | B |

---

## 2. Fonction par fonction : solution Mac ou « Windows uniquement »

### 2.1 Installation
`installer.command` lance `outils/installer.sh` (bash 3.2, voir §6), qui :
1. vérifie macOS ≥ 13 (`sw_vers -productVersion`) et l'architecture ;
2. télécharge Node 24.22.1 `darwin-arm64` ou `darwin-x64` en `.tar.gz` avec `curl -fL --retry 3`, vérifie l'empreinte dans `SHASUMS256.txt` (`shasum -a 256`) et l'extrait dans `runtime/node` ;
3. lance `runtime/node/bin/npm ci --omit=dev`, puis vérifie `node_modules/@anthropic-ai/claude-agent-sdk-darwin-<arch>/claude --version` ;
4. vérifie git (`xcode-select -p`), propose `xcode-select --install` ;
5. retire la quarantaine du dossier du QG (`xattr -dr com.apple.quarantine "$QG"`), pour que les autres `.command` s'ouvrent ensuite d'un double-clic ;
6. propose (facultatif) le lien sur le bureau, puis `open lancer.command`.

Empreintes Node 24.22.1, relevées le 26/10/2026 dans `https://nodejs.org/dist/v24.22.1/SHASUMS256.txt` :
- `89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7  node-v24.22.1-darwin-arm64.tar.gz`
- `d132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035  node-v24.22.1-darwin-x64.tar.gz`

Comme sous Windows, l'empreinte est lue au moment de l'installation dans `SHASUMS256.txt` : on ne la code pas en dur.

### 2.2 Lancement
`lancer.command` : `cd "$(dirname "$0")"` (Terminal démarre dans `~`), installation si `runtime/node/bin/node` ou le SDK manquent, puis `runtime/node/bin/node serveur/index.js "$@"`. Code de sortie 42 (mise à jour) : `exit 0` sans pause. Sinon : « Le QG est arrêté », `read`.

Fermer la fenêtre Terminal envoie SIGHUP au processus : `index.js:550` gère déjà ce signal et enregistre l'état. Terminal peut demander « Voulez-vous arrêter les processus ? » : c'est normal.

Le site s'ouvre avec `open <lien>` (navigateur par défaut) ou dans la fenêtre Electron si elle est installée.

### 2.3 Mise à jour
`outils/mettre-a-jour.sh` reprend la même logique que le `.ps1` : API GitHub, puis repli sur la page `releases/latest` ; même archive `QG-des-agents-<v>.zip` et même `.sha256` ; `ditto -x -k` ; `rsync -a` en excluant `node_modules`, `runtime` et `dossiers` ; puis `installer.sh --sans-lancer --silencieux`.

Depuis le site, `maj.js` appelle `plateforme.lancerMiseAJour({ pid, ouvrir })`, qui ouvre le script dans un Terminal avec `--attendre-pid` et `--relancer`. La relance écrit `runtime/relance.command` (avec ses arguments `--sans-maj [--no-open]`, droits 0755) puis fait `open` dessus. Ce fichier a été écrit sur place, il n'est donc pas en quarantaine.

`installationDev()` (`maj.js:22`) est inchangé.

### 2.4 Ajout et connexion de compte
- `ajouter-un-compte.command` et `connecter-un-compte.command` appellent `serveur/connexion.js` (inchangé, sauf le chemin du binaire).
- Depuis le site, `ouvrirConnexion` passe par `plateforme.ouvrirTerminal()` : `claude auth login` ouvre le navigateur, comme sous Windows.
- **État « connecté »** : sur Mac, `claude auth status --json` (option vérifiée sur le binaire 2.1.310 : « --json Output as JSON (default) »), lancé avec `envPour(compte)` donc le bon `CLAUDE_CONFIG_DIR`. Résultat en cache 30 s (le serveur l'appelle souvent : `bus.js`, `conso.js`, `ordonnanceur.js`). Sous Windows, on garde le test du fichier (zéro régression).
- La documentation de Claude Code confirme que, sur macOS, le jeton va dans le trousseau, et que l'entrée du trousseau est propre à chaque `CLAUDE_CONFIG_DIR`. Le binaire montre comment le nom est calculé : `Claude Code…-credentials-<8 premiers caractères hex du sha256 du dossier>`. On ne s'appuie pas sur ce détail interne : on passe par `auth status`.
- Compte « partagé » : `os.homedir()/.claude` au lieu de `USERPROFILE`.

### 2.5 Choix de dossier
`osascript -e 'POSIX path of (choose folder with prompt "…")'`. Le titre est échappé (guillemets, antislashs) ; l'annulation rend l'erreur −128, qu'on traduit en `null`. Le délai reste de 10 min.

S'insère dans le `SELECTEURS_DOSSIER` que T2 est en train de créer (`{ win32: selecteurWindows }` → ajouter `darwin`). `rappeler()` ne fait rien sur Mac : ramener la fenêtre devant exigerait une autorisation d'accessibilité. Dégradé acceptable.

### 2.6 Raccourci
**Windows uniquement** pour le `.lnk` avec icône (`raccourci.js` est déjà protégé). Sur Mac, l'installation propose seulement un lien symbolique `~/Desktop/QG des agents.command` → `lancer.command`, sans icône personnalisée. Un vrai `.app` (Dock, icône) est hors périmètre : il faudrait le signer et le notariser.

### 2.7 Notifications
Celles du navigateur et de la cloche ne changent pas (ce sont les principales). La notification système (aucun onglet ouvert) passe par `osascript display notification`. Limites connues : elle apparaît au nom de « Éditeur de scripts », un clic ouvre l'Éditeur de scripts et pas le QG, et l'autorisation des notifications se donne à l'Éditeur de scripts. Dégradé acceptable. Le texte du réglage le dira. On peut couper cette notification sur Mac si les tests la trouvent gênante.

### 2.8 Dictée
- Le worker `dictee_worker.py` est déjà portable : le chargement CUDA est protégé, et il se replie sur `cpu/int8/large-v3-turbo`.
- **Lot Mac 1** : `installer-dictee.sh` avec uv `aarch64-apple-darwin` ou `x86_64-apple-darwin` (+ `.sha256`), Python 3.12 dans `runtime/dictee`, `faster-whisper==1.2.1 av numpy` (sans `nvidia-*`), modèle `large-v3-turbo` uniquement ; chemin `venv/bin/python`. CTranslate2 (le moteur de faster-whisper) **n'utilise pas le GPU des Mac** (pas de Metal/MPS) : la transcription tourne sur le processeur. C'est plus lent, mais ça marche sur Apple Silicon comme sur Intel.
- **Lot Mac 2 (facultatif, Apple Silicon)** : un second moteur `mlx-whisper` (`mlx-community/whisper-large-v3-turbo`) qui utilise le GPU par MLX. D'après un banc d'essai communautaire, il est environ 2× plus rapide que whisper.cpp sur M1 Max. whisper.cpp (Metal, Core ML) est l'autre option, mais il faudrait le compiler ou le télécharger et changer le worker. Décision à prendre après mesure sur un vrai Mac.
- Le micro : le navigateur demande l'autorisation, comme sous Windows ; rien côté serveur.

### 2.9 Navigateur intégré
- **Mode simple** : `ouvrirFenetre` fait `open URL` (onglet du navigateur par défaut, sans fenêtre « application »). Dégradé acceptable. La fenêtre `--app` de Chrome, Edge ou Brave est une amélioration pour plus tard.
- **Mode complet (Electron)** : même `npm install electron@44.7.0` + `install.js`. Le binaire se lit dans `node_modules/electron/path.txt`. Dans `app/main.cjs` : protéger `setAppUserModelId`, **ajouter le menu Édition** (⌘C/⌘V), icône du Dock. Electron est téléchargé par npm (pas de quarantaine). Dans `nav-distant.js` : gérer ⌥ comme AltGr.

### 2.10 Arrêt d'urgence et arbre de processus
- Les sessions Claude sont coupées par `AbortController` : le SDK tue le processus `claude` sur toutes les plateformes. À vérifier sur Mac : qu'une commande longue lancée par l'outil Bash (`npm run dev`…) meure bien avec la session.
- Les services du QG : `spawn` avec `detached: true` sur POSIX, puis `process.kill(-pid, 'SIGTERM')` et `SIGKILL` 3 s plus tard (`plateforme.tuerArbre`). Utilisé par `arreter()`, `arreterTout()` et donc aussi par l'arrêt du QG.

### 2.11 Services (Rojo…)
`rojo` est cherché dans le PATH hérité du Terminal (shell de connexion : `~/.zprofile`, donc Homebrew et `~/.rokit/bin` s'ils y sont). Les ports occupés se lisent avec `lsof -nP -iTCP -sTCP:LISTEN -Fpn` au lieu de `netstat`. Studio est sur Mac, donc Rojo y a son sens. Si `rojo` est absent, l'erreur `ENOENT` est déjà affichée dans le journal du service.

### 2.12 Git
Sur Mac, git vient des outils en ligne de commande d'Apple (ou de Homebrew). `/usr/bin/git` sans ces outils ouvre une fenêtre d'installation système : l'installation le détecte d'avance avec `xcode-select -p`. Claude Code n'a pas besoin de Git Bash sur Mac (il utilise le shell du système). Les règles `Bash(git …)` et `gitAuto` ne changent pas.

### 2.13 Profils de permissions et consignes (bash/zsh)
- Les profils n'utilisent que des noms d'outils et des motifs indépendants du shell. La correction se trouve dans `cheminRegle` (`//` absolu), `reglesPourZones` (racine `/`) et les ajouts de `toujoursRefuse` (§1.4).
- Les consignes du DG et des agents ne citent ni PowerShell ni Windows. Ajout facultatif : une ligne `{SYSTEME}` dans `directive-tache.md` (« Système : macOS, shell zsh ; `python3` au lieu de `python` »), remplacée par `config.js` comme `{QG}`.

### 2.14 Démo
`lancer-demo.command` et `plateforme.ouvrirTerminal()` pour Réglages › À propos. Les défauts `etages-demo.json` sont convertis (§1.4). Aucune autre dépendance.

---

## 3. Architecture proposée

### 3.1 Module `serveur/plateforme.js`
Le seul endroit qui connaît le système. Chaque fonction accepte une plateforme injectée (`plat = process.platform`), pour les tests.

| Fonction | win32 (comportement actuel, recopié tel quel) | darwin |
|---|---|---|
| `nom()` / `estMac()` / `estWindows()` | — | — |
| `nodeBin()` | `runtime/node` | `runtime/node/bin` |
| `nodeExe()` | `runtime/node/node.exe` (sinon `process.execPath`) | `runtime/node/bin/node` (sinon `process.execPath`) |
| `npmCli()` | `runtime/node/node_modules/npm/bin/npm-cli.js` | `runtime/node/lib/node_modules/npm/bin/npm-cli.js` |
| `claudeExe()` | `…-win32-x64/claude.exe` (selon `process.arch`) | `…-darwin-${arch}/claude` |
| `pythonVenv(dir)` | `Scripts/python.exe` | `bin/python` |
| `electronExe(dirApp)` | `dist/electron.exe` | d'après `path.txt` |
| `tar()` | `%SystemRoot%\System32\tar.exe` | `/usr/bin/tar` |
| `script(nom)` | `nom.bat` | `nom.command` |
| `ouvrirUrl(url)` | `cmd /c start "" url` | `open url` |
| `ouvrirTerminal(titre, argv, { cwd })` | `cmd /d /c start "titre" …` | écrit `runtime/terminaux/<titre>.command` (bash, LF, 0755 : `cd`, la commande, `read` si `--pause`), puis `open` dessus |
| `lancerMiseAJour({ pid, ouvrir })` | ligne actuelle de `maj.js` | `ouvrirTerminal('Mise à jour', ['bash', 'outils/mettre-a-jour.sh', '--attendre-pid', pid, '--relancer', …])` |
| `choisirDossier(titre)` | sélecteur de T2 | `osascript choose folder` |
| `notifier(titre, texte, lien)` | toast PowerShell (`notifications.js`) | `osascript display notification` |
| `portsEnEcoute()` | `netstat -ano` | `lsof -nP -iTCP -sTCP:LISTEN -Fpn` |
| `optionsSpawnService()` | `{ windowsHide: true }` | `{ detached: true }` |
| `tuerArbre(pid)` | `taskkill /PID /T /F` | `kill(-pid, TERM)`, puis `KILL` |
| `etatConnexion(compte)` | `.credentials.json` existe | `claude auth status --json` (cache 30 s), fichier en secours |
| `cheminRegle(p)` | `D:\x` → `//d/x` | `/Users/x` → `//Users/x` |
| `racinesRegles()` | lecteurs `A:\`…`Z:\` existants | `['/']` |
| `cleChemin(p)` / `memeChemin(a, b)` | resolve + `\`→`/` + minuscules | resolve + NFC + minuscules (APFS insensible par défaut ; voir §6) |
| `navigateursCapture()` | les 3 chemins actuels | `/Applications/…` (Chrome, Edge, Brave, Chromium) |
| `infos()` | `{ plateforme, scripts, raccourciDictee, dicteeSysteme }` envoyés au site dans `/api/reglages` | idem, version Mac |

**Règle de zéro régression** : la branche `win32` de chaque fonction reprend **mot pour mot** le code actuel. On déplace le code, on ne le réécrit pas.

### 3.2 Scripts à créer
| Racine (double-clic) | Contenu |
|---|---|
| `installer.command` | `cd "$(dirname "$0")" && exec bash outils/installer.sh "$@"` |
| `lancer.command` | installation si besoin, lancement, code 42 |
| `lancer-demo.command` | `--demo "$@"` |
| `mettre-a-jour.command` | `bash outils/mettre-a-jour.sh` |
| `ajouter-un-compte.command`, `connecter-un-compte.command` | `node serveur/connexion.js [--nouveau]` |
| `installer-dictee.command` | `bash outils/installer-dictee.sh` |

Dans `outils/` : `installer.sh`, `mettre-a-jour.sh`, `installer-dictee.sh`, plus un éventuel `commun.sh` (couleurs, `etape`, `echec`, `telecharger` avec 3 essais).

Contraintes :
- `#!/bin/bash`, compatible **bash 3.2** (version livrée par macOS) : pas de tableaux associatifs, pas de `${v,,}`, pas de `mapfile` ;
- `set -euo pipefail` ;
- ASCII seulement dans les `.command` (comme les `.bat`) ;
- fins de ligne LF, bit exécutable.

### 3.3 Fins de ligne et bit exécutable
`.gitattributes` (nouveau) :
```
*.sh       text eol=lf
*.command  text eol=lf
*.bat      text eol=crlf
*.ps1      text eol=crlf
```
- Bit exécutable dans git : `git update-index --chmod=+x *.command outils/*.sh`. Sur ce poste, `core.fileMode` est désactivé par défaut sous Windows : sans cette commande, le bit n'est pas enregistré.
- `preparer-release.mjs` force aussi LF et sans BOM pour `.sh` et `.command`, refuse tout `\r`, et pose 0755 dans le zip (§3.4). Il ne faut pas compter sur git seul : la release est copiée depuis la copie de travail.

### 3.4 Empaquetage de la release
- **Une seule archive universelle `QG-des-agents-<v>.zip` + `.sha256`**, pour Windows, Mac Apple Silicon et Mac Intel. Le zip ne contient que du code et des scripts : Node, `node_modules` (avec le bon binaire `claude`) et Electron sont téléchargés à l'installation, pour la bonne architecture.
- Pourquoi pas une archive Mac à part : `mettre-a-jour.ps1:87-88` (déjà installé chez tous les utilisateurs Windows) prend le **premier** `*.zip` et le **premier** `*.sha256` de la version. Une 2ᵉ archive pourrait casser la mise à jour Windows. Si un jour il en faut une, la nommer `.tar.gz` **et** ne pas publier de second `.sha256` (empreinte dans les notes) ; ou faire d'abord une version Windows qui filtre sur le nom exact.
- Le zip est écrit **en Node** (zlib `deflateRawSync` + `zlib.crc32`, disponible en Node 24) dans `preparer-release.mjs`, avec « version made by » Unix et les droits dans les attributs externes : `0o100755 << 16` pour `.command`/`.sh`, `0o100644 << 16` pour le reste. L'Utilitaire d'archive (`ditto`) et `unzip` appliquent ces droits. Le `tar.exe` de Windows n'est plus utilisé (ce qu'il écrit pour les droits n'est pas maîtrisé).
- Détection Apple Silicon dans `installer.sh` : `sysctl -n hw.optional.arm64` = 1. Ne pas se fier à `uname -m` seul : un Terminal ouvert sous Rosetta répond `x86_64`.

### 3.5 Gatekeeper et instructions pour l'utilisateur Mac
Faits (sources en §7) :
- les fichiers téléchargés par un navigateur reçoivent l'attribut `com.apple.quarantine`, et l'Utilitaire d'archive le recopie sur les fichiers extraits ;
- `curl` ne pose pas cet attribut (ce que l'installation télécharge n'est donc pas en quarantaine) ;
- depuis macOS Sequoia (15), le Ctrl-clic › Ouvrir ne permet plus de passer outre Gatekeeper : il faut passer par Réglages Système › Confidentialité et sécurité › « Ouvrir quand même ».

Pas de signature ni de notarisation au départ : il faudrait un compte Apple Developer, et on ne signe pas un script `.command`. Instructions proposées pour le README :

> **Sur Mac (macOS 13 ou plus, Apple Silicon ou Intel)**
> 1. Télécharge `QG-des-agents-<version>.zip` et double-clique dessus pour l'extraire. Range le dossier `QG-des-agents` dans ton dossier personnel (par exemple `~/QG-des-agents`), pas dans Téléchargements ni iCloud Drive.
> 2. Ouvre **Terminal** (Applications › Utilitaires), tape `bash ` (avec un espace), glisse `installer.command` dans la fenêtre, puis appuie sur Entrée.
>    *(Le lancer avec `bash` évite l'alerte « Apple n'a pas pu vérifier… ». L'installation retire ensuite cette alerte pour les autres fichiers du QG.)*
> 3. Ensuite : double-clic sur **`lancer.command`**. Laisse la fenêtre Terminal ouverte : la fermer arrête le QG.
>
> Si tu as double-cliqué `installer.command` et que macOS l'a bloqué : Réglages Système › Confidentialité et sécurité › en bas, « Ouvrir quand même ».

Option plus simple, à décider (§6, point ouvert) : une commande d'installation en une ligne (`curl -fsSL …/installer-mac.sh | bash`), qui télécharge par curl, donc sans quarantaine.

---

## 4. Plan de réalisation en lots

**Règle pour tous les lots : zéro régression sous Windows.** Chaque lot se termine par les tests existants (`tests/*.js` dans `_QG-dev`) et une installation propre depuis le zip, sous Windows. Le code Windows est déplacé, pas réécrit.

| Lot | Contenu | Fichiers | Vérification Windows | Ampleur (estimation) |
|---|---|---|---|---|
| **L0 — Socle** | `serveur/plateforme.js` (branche win32 = code actuel, branche darwin), tests unitaires avec plateforme injectée ; `.gitattributes` | `serveur/plateforme.js`, `tests/plateforme.js`, `.gitattributes` | les fonctions win32 rendent exactement ce que rend le code actuel (mêmes entrées, mêmes sorties) | 1 à 1,5 j |
| **L1 — Cœur serveur et sécurité** | `comptes.js:12/45/105-116`, `api-reglages.js:28/252`, `bus.js:135`, `session.js:43`, `config.js:14/41-42/110/201/220`, `permissions.js:21/51-57`, défauts `\\`, `profils.json` | serveur + `config/defauts` | `tests/regles-zones.js`, `tests/permissions-toujours.js`, `tests/mode-auto.js` inchangés ; `optionsProfil()` identique, octet pour octet, avant et après | 2 à 3 j |
| **L2 — Processus et fenêtres** | `index.js:396/399/451`, `maj.js:72-74`, `services.js:94/145/190/214`, `notifications.js`, `navigateur.js:18/42/186-225`, `recherche.js:13`, `skills.js:22`, `dictee.js:10`, choix de dossier (après T2) | serveur | `tests/services.js`, `tests/skills.js`, `tests/demo-e2e.js`, ouverture du site, démo, mise à jour simulée (`QG_MAJ_SANS_API`) | 2 j |
| **L3 — Scripts Mac et release** | `*.command`, `outils/*.sh`, `preparer-release.mjs` (liste blanche, LF, zip Node avec droits, motif `/Users/`) | racine, `outils/` | zip produit = mêmes fichiers Windows qu'avant + nouveaux ; installation et mise à jour Windows depuis ce zip ; ancien `mettre-a-jour.ps1` 1.0.5 → nouvelle version OK | 2 à 3 j |
| **L4 — Electron et clavier** | `app/main.cjs` (menu Édition darwin, `setAppUserModelId` protégé, Dock), `web/nav-distant.js` (⌥), `web/dictee.js` (`e.code`) | `app/`, `web/` | `tests/app-fenetres.js`, `tests/app-navigateur.js`, `tests/moteur-navigateur.js` ; Alt+M marche toujours | 1 j |
| **L5 — Textes et i18n** | libellés selon la plateforme (`infos()`), messages `.bat` → `script()`, README Mac, traductions | `web/`, `serveur/i18n`, `README.md` | textes Windows identiques | 1 j |
| **L6 — Dictée Mac** | `installer-dictee.sh` (CPU) ; option mlx-whisper à décider | `outils/`, `serveur/dictee.js` | dictée Windows inchangée | 1 j (+1 à 2 j si mlx) |
| **L7 — Recette sur vrai Mac** | check-list §5.2 sur Apple Silicon **et** Intel, corrections | — | — | 2 à 3 j |

Ordre conseillé : L0 → L1 (bloquants de sécurité) → L3 (sans scripts, rien à tester sur Mac) → L2 → L4 → L5 → L6 → L7. L2 doit attendre que T2 ait fusionné sa refonte du choix de dossier (même fichier, même fonction).

---

## 5. Vérifications

### 5.1 Ce qui se vérifie sous Windows (plateforme simulée)
- **`plateforme.js`** : chaque fonction appelée avec `'darwin'` et `path.posix` :
  - `cheminRegle('/Users/a/Dev')` → `//Users/a/Dev` ;
  - `cheminRegle('D:\\Dev', 'win32')` → `//d/Dev` (inchangé) ;
  - `claudeExe('darwin','arm64')` → `…-darwin-arm64/claude` ;
  - `nodeExe('darwin')` → `runtime/node/bin/node` ;
  - `pythonVenv` ; séparateur du PATH `:` ;
  - `script('lancer','darwin')` → `lancer.command`.
- **`reglesPourZones`** avec racine `/` et un système de fichiers factice (liste injectée : `/Applications`, `/Users/a/Dev`, `/Users/a/Documents`, `/Volumes/X`) → attendu : `//Applications/**`, `//Users/a/Documents/**`, `//Volumes/**`… et **rien** sous `//Users/a/Dev`.
- **Défauts** : `assurerConfig` simulé darwin → `configDir` = `/Users/a/.claude-qg/claude1`, sans aucun `\`.
- **`etatConnexion` darwin** avec un faux `claude` (script Node qui imprime `{"loggedIn":true}`) → connecté ; sortie invalide → repli sur le fichier.
- **`portsEnEcoute` darwin** : analyse d'une sortie `lsof -Fpn` enregistrée.
- **Zip de release** : relire le zip produit (en-têtes du répertoire central) → `.command`/`.sh` en `0100755`, pas de `\r` dans ces fichiers, `.bat` en CRLF, `.ps1` avec BOM.
- **Scripts shell** : `bash -n outils/*.sh *.command` avec le bash de Git pour Windows (syntaxe seulement ; le bash de Git est en version 5, ce qui ne prouve pas la compatibilité 3.2 → `shellcheck --shell=bash` si on l'installe).
- **Non-régression** : comparer `optionsProfil(nom)` (JSON) avant et après pour chaque profil ; tests existants ; installation propre et mise à jour depuis le zip (y compris depuis une 1.0.5 réelle).

### 5.2 Check-list de test manuel sur un vrai Mac
À faire sur **Apple Silicon** et sur **Intel** (ou Rosetta à défaut), avec macOS 13 ou plus (idéalement 15 Sequoia).

**Installation**
- [ ] Zip téléchargé avec Safari, extrait par double-clic : `xattr -l installer.command` montre `com.apple.quarantine`.
- [ ] Double-clic sur `installer.command` : alerte Gatekeeper ; « Ouvrir quand même » fonctionne ; noter le texte exact de l'alerte pour le README.
- [ ] `bash installer.command` : Node darwin installé (`runtime/node/bin/node -v` = v24.22.1, bonne architecture : `file runtime/node/bin/node`), empreinte vérifiée.
- [ ] `node_modules/@anthropic-ai/claude-agent-sdk-darwin-<arch>/claude --version` répond.
- [ ] Sans outils Xcode : message clair et proposition `xcode-select --install`.
- [ ] Après installation : `xattr -l lancer.command` n'a plus de quarantaine ; double-clic OK.
- [ ] Chemin avec espace ou accent (`~/Mes Projets/QG é`) : tout fonctionne.

**Lancement et arrêt**
- [ ] `lancer.command` ouvre le site ; le jeton marche ; la configuration guidée se lance.
- [ ] Fermer la fenêtre Terminal : l'état est enregistré, les dossiers reprennent au lancement suivant.
- [ ] Ctrl+C dans Terminal : même chose.

**Comptes**
- [ ] Réglages › Comptes › Se connecter : un Terminal s'ouvre, la page de connexion s'ouvre, le compte passe « connecté » **sans recharger** (surveillance).
- [ ] Le trousseau contient une entrée « Claude Code…-credentials-xxxxxxxx » par compte ; deux comptes restent séparés.
- [ ] Déconnexion : le compte passe « non connecté ».
- [ ] Compte « partagé » (`~/.claude`) détecté si Claude Code est déjà connecté sur ce Mac.
- [ ] Limites du forfait lues (⚡).
- [ ] `ajouter-un-compte.command` fonctionne.

**Agents et permissions**
- [ ] Demande simple : DG, tâche en `edition`, fichier écrit dans un dossier racine **sans** demande.
- [ ] Écriture dans `~/Documents` (hors zones) → carte « demander ».
- [ ] Écriture dans le dossier du QG (`config/`, `serveur/`) → refusée.
- [ ] `cat ~/.claude-qg/claude1/.credentials.json` et `security find-generic-password -s "Claude Code-credentials" -w` → refusés (et noter si macOS montre une invite du trousseau).
- [ ] Mode prudent : chaque action non couverte demande.
- [ ] `gitAuto` : commit OK, push refusé par défaut.
- [ ] Chemin de dossier racine avec accents (forme NFD) reconnu comme zone.

**Fonctions**
- [ ] Choix de dossier : la fenêtre « choisir un dossier » s'ouvre **devant** le navigateur ; Annuler → rien ; le chemin choisi est ajouté.
- [ ] Notification système avec aucun onglet ouvert (et autorisation demandée à l'Éditeur de scripts).
- [ ] Dictée : `installer-dictee.command`, puis 🎤 et ⌥M ; mesurer la durée de transcription d'une phrase de 10 s (pour décider mlx-whisper).
- [ ] Navigateur simple : YouTube intégré ; autre site → onglet du navigateur par défaut.
- [ ] Navigateur complet : installation d'Electron, ouverture, Google se connecte, ⌘C/⌘V dans le QG et dans la page, ⌥ + touches (`{`, `[`, `|`) sur clavier français.
- [ ] Capture de page (`mcp__qg__capturer_page`) avec Chrome installé.
- [ ] Import d'un skill `.zip`.
- [ ] Service Rojo : démarrage, journal, conflit de port détecté (`lsof`), arrêt (plus aucun processus `rojo` : `pgrep rojo`).
- [ ] Arrêt d'urgence pendant qu'un agent lance une commande longue (`sleep 600` ou `npm run dev`) : plus aucun processus enfant après coup (`ps -ef | grep claude`).
- [ ] Démo : Réglages › À propos › Lancer la démo.
- [ ] Mise à jour : depuis le site (publier une version de test sur un dépôt de test) → fermeture, mise à jour, relance automatique ; réglages et `dossiers/` intacts.
- [ ] Mise en veille du Mac pendant une tâche, puis réveil : le QG reprend.

---

## 6. Risques et points ouverts

**Risques**
1. **Lecture du jeton par un agent** : sur Mac, `security find-generic-password -w -s "<service>"` peut renvoyer le jeton OAuth. Si Claude Code a créé l'entrée avec l'outil `security` (le binaire appelle bien `security find-generic-password`), l'outil est probablement autorisé sans invite : **à vérifier**. Les règles `Bash(security *)` sont des préfixes : la documentation de Claude Code prévient qu'une règle Bash « ne reconnaît pas le même programme appelé par son chemin ou dans `sh -c` ». Le risque existe déjà sous Windows avec `cat .credentials.json`. Pour une vraie barrière, il faudrait le bac à sable de Claude Code (sandbox) : piste à étudier, hors de ce portage.
2. **Casse et Unicode des chemins** : APFS est insensible à la casse par défaut, mais un volume peut être sensible ; la comparaison en minuscules pourrait alors confondre `Dev` et `dev`. De plus, les noms de fichiers peuvent être en NFD. On ignore si Claude Code compare les règles en tenant compte de la casse sur Mac : à tester (§5.2).
3. **bash 3.2** : un script écrit et testé sous Git Bash (bash 5) peut casser sur Mac. Il faut s'imposer le sous-ensemble 3.2 et tester sur Mac.
4. **`setAppUserModelId` sous Electron Mac** : peut lever une exception si la méthode n'existe pas hors Windows. Protégé dans L4 ; à confirmer.
5. **Choix de dossier caché** : la fenêtre d'osascript peut s'ouvrir derrière le navigateur. Sans autorisation d'accessibilité, impossible de la ramener devant. À mesurer.
6. **PATH des services** : si le QG est un jour lancé hors Terminal (Electron, launchd), le PATH sera minimal et Rojo introuvable. Avec `.command`, le PATH du shell de connexion est hérité.
7. **Mise à jour Windows des versions déjà installées** : ne jamais publier de second `.zip`/`.sha256` dans une version (§3.4).
8. **Dossiers sous iCloud Drive ou Téléchargements** : synchronisation et autorisations de dossiers (macOS demande l'accès aux Documents, au Bureau et aux Téléchargements au Terminal). À signaler dans le README.
9. **Autorisations macOS** : Terminal recevra des demandes d'accès (Documents, Bureau) quand les agents liront ces dossiers. Le premier refus est mémorisé.

**Points ouverts (à décider par l'utilisateur ou le DG)**
- Installation en une ligne (`curl … | bash`) en plus du zip ? C'est plus simple pour l'utilisateur, mais c'est une publication de plus (le script doit vivre sur GitHub).
- Dictée Mac : faster-whisper CPU seulement (simple), ou en plus mlx-whisper pour Apple Silicon (plus rapide, second moteur à maintenir) ?
- Notification système Mac : la garder (clic sans effet, au nom de « Éditeur de scripts ») ou la couper et compter sur les notifications du navigateur ?
- À terme, un vrai `QG des agents.app` signé et notarisé (icône, Dock, pas d'alerte Gatekeeper) ? Il faut un compte Apple Developer (payant).
- Ajouter `{SYSTEME}` aux consignes des agents (macOS/zsh, `python3`) ?
- Linux : la plupart des branches POSIX serviraient aussi (binaires `linux-x64` du SDK disponibles). Hors périmètre, mais l'architecture le permet.

---

## 7. Sources (consultées le 26/10/2026)
- Node.js 24.22.1, empreintes darwin : https://nodejs.org/dist/v24.22.1/SHASUMS256.txt
- Claude Code, stockage des identifiants (trousseau macOS, entrée propre à `CLAUDE_CONFIG_DIR`) : https://code.claude.com/docs/en/iam (section « Credential management »)
- Claude Code, syntaxe des chemins dans les règles (`//chemin` absolu, `/chemin` relatif au fichier de réglages, `~/`, `./`) : https://code.claude.com/docs/en/permissions, recoupé par https://dev.to/rulestack/claude-code-permission-rules-how-allow-deny-and-ask-actually-match-1bj7 ; limites des règles Bash (chemin du programme, `sh -c`) : même page officielle
- Claude Code, macOS 13.0+ requis : https://code.claude.com/docs/en/setup
- Claude Code 2.1.310, `claude auth status --json` : vérifié sur le binaire livré dans `node_modules` (aide de la commande)
- SDK : `node_modules/@anthropic-ai/claude-agent-sdk/package.json` (`optionalDependencies` darwin-arm64/x64), résolution du binaire dans `sdk.mjs`
- Gatekeeper, fin du Ctrl-clic sous Sequoia et « Ouvrir quand même » : https://www.macworld.com/article/2457844/what-to-do-when-you-cant-open-an-app-you-just-installed-in-macos-sequoia.html, https://www.idownloadblog.com/apple-macos-sequoia-gatekeeper-change-install-unsigned-apps-mac/, https://en.wikipedia.org/wiki/Gatekeeper_(macOS)
- Quarantaine : curl ne la pose pas : https://unit42.paloaltonetworks.com/gatekeeper-bypass-macos et https://developer.apple.com/forums/thread/666452 ; l'Utilitaire d'archive la propage : https://www.jamf.com/blog/jamf-threat-labs-macos-archive-utility-vulnerability/ ; retrait par `xattr -d com.apple.quarantine` : https://flaviocopes.com/courses/macos-internals-troubleshooting/inspect-extended-attributes/
- osascript `display notification` (attribuée à l'Éditeur de scripts, clic qui ouvre l'Éditeur) : https://claudeissues.com/issue/41511-macos-notifications-appear-from-script-editor-instead-of-claude-code, https://forum.latenightsw.com/t/trying-to-use-terminal-for-display-notification/5068
- `choose folder`, annulation = erreur −128 : https://community.jamf.com/general-discussions-2/allow-end-user-to-input-file-folder-path-as-variable-12643
- uv 0.13.5 (21/10/2026), archives `aarch64-apple-darwin` et `x86_64-apple-darwin` avec `.sha256` : https://github.com/astral-sh/uv/releases/latest
- faster-whisper / CTranslate2 sans GPU Apple (pas de MPS) : https://pyvideotrans.com/blog/ctranslate2-whisper, https://bbs.pyvideotrans.com/show/2912
- whisper.cpp (Metal, Core ML) : https://github.com/ggml-org/whisper.cpp ; mlx-whisper : https://simonwillison.net/2024/Aug/13/mlx-whisper, comparaison communautaire : https://notes.billmill.org/link_blog/2024/08/mlx-whisper.html
- Menu Édition nécessaire pour ⌘C/⌘V sur Mac : constat sur un framework voisin (https://github.com/tauri-apps/tauri/issues/1055) et fonctionnement d'AppKit. Pas de source Electron officielle trouvée : à confirmer pendant la recette (§5.2).

---

## 8. Résumé

**Les 5 points bloquants principaux**
1. **Aucun script de lancement** : tout passe par `.bat` et PowerShell (installation avec Node `win-x64`, lancement, mise à jour, connexion). Il faut des `.command`/`.sh` en LF, exécutables dans le zip, et un parcours qui contourne Gatekeeper.
2. **Comptes jamais « connectés »** : `CLAUDE_EXE` est codé en dur sur `win32-x64/claude.exe` (`comptes.js:12`), et la connexion se détecte par `.credentials.json` alors que macOS range le jeton dans le trousseau (`comptes.js:45`, `api-reglages.js:28`, `bus.js:135`).
3. **Permissions fausses, donc faille** : `cheminRegle` produit `/Users/…`, que Claude Code lit comme un chemin relatif (`config.js:220`), et `reglesPourZones` ne parcourt que les lettres de lecteur (`permissions.js:51`). Sur Mac, les règles ne protègent rien et un agent pourrait écrire n'importe où.
4. **Chemins Windows dans les défauts et le PATH** : `\\` dans `comptes.json`/`etages.json`/`etages-demo.json`, `;` dans `session.js:43`, `node.exe` et `NODE_DIR` sans `bin/`.
5. **Processus Windows partout** : `cmd start` (ouvrir le site, connexion, démo, dictée, mise à jour), `taskkill` (arrêt des services), `netstat`, `tar.exe`, `reg`, et le menu Électron absent qui coupe ⌘C/⌘V.

**Ampleur estimée** : 12 à 16 jours de travail, recette sur Mac comprise (estimation, pas une mesure), en 8 lots. Environ 40 points dans environ 25 fichiers. Un module nouveau (`serveur/plateforme.js`), 7 `.command`, 3 scripts `.sh`, un `.gitattributes` ; le reste, ce sont des changements ciblés. Le cœur (ordonnanceur, DG, sessions, site) ne bouge presque pas : le SDK fournit déjà les binaires Mac. Sans un vrai Mac (Apple Silicon et Intel), la recette (§5.2) est impossible.
