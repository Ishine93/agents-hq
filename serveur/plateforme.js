// Couche de plateforme : le seul module du serveur qui connaît le système (Windows, macOS).
// Tout ce qui dépend de l'OS passe par ici : binaires (Node portable, Claude Code, Python, Electron, tar),
// chemins des règles de permission, ouverture d'un lien ou d'une fenêtre de terminal, notification
// système, ports en écoute, arrêt d'un arbre de processus, état de connexion d'un compte, choix d'un dossier.
// Chaque fonction accepte une plateforme injectée (`plat`, par défaut process.platform) pour les tests.
// Règle : la branche win32 reprend le code Windows d'avant le portage tel quel (zéro régression).
// Linux n'est pas pris en charge officiellement : les branches POSIX lui servent quand c'est raisonnable.
import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLATEFORME = process.platform;

export const estWindows = (plat = PLATEFORME) => plat === 'win32';
export const estMac = (plat = PLATEFORME) => plat === 'darwin';
export const nom = (plat = PLATEFORME) => (estWindows(plat) ? 'windows' : estMac(plat) ? 'mac' : 'linux');
// Module de chemins de la plateforme simulée (path.win32 ou path.posix).
const chemins = (plat) => (estWindows(plat) ? path.win32 : path.posix);

// ---------------------------------------------------------------- binaires et dossiers

// Node.js portable : runtime/node (Windows : node.exe à la racine ; Mac : runtime/node/bin/node).
export const nodeBin = (plat = PLATEFORME) => (estWindows(plat) ? path.join(RACINE, 'runtime', 'node') : path.join(RACINE, 'runtime', 'node', 'bin'));
export const nodeExe = (plat = PLATEFORME) => path.join(nodeBin(plat), estWindows(plat) ? 'node.exe' : 'node');
// Le Node portable s'il est installé, sinon celui qui fait tourner le QG (copie de développement).
export const nodeOuCourant = (plat = PLATEFORME) => (fs.existsSync(nodeExe(plat)) ? nodeExe(plat) : process.execPath);
export const npmCli = (plat = PLATEFORME) =>
  estWindows(plat)
    ? path.join(RACINE, 'runtime', 'node', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : path.join(RACINE, 'runtime', 'node', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');

// Claude Code livré par le SDK : un paquet natif par plateforme et par processeur (le SDK choisit le même).
export const claudeExe = (plat = PLATEFORME, arch = process.arch) =>
  path.join(RACINE, 'node_modules', '@anthropic-ai', `claude-agent-sdk-${plat}-${arch}`, estWindows(plat) ? 'claude.exe' : 'claude');

// Codex CLI (OpenAI) : le paquet npm @openai/codex apporte un lanceur bin/codex.js qui choisit lui-même le
// binaire natif de @openai/codex-<plateforme>-<processeur> (vendor/<triple>/…, agencement variable selon la
// version). On lance donc ce lanceur avec Node plutôt que de deviner le chemin du binaire.
// QG_CODEX_BIN : un autre exécutable (un script .js est lancé par Node ; sert au faux Codex des tests).
export const codexLanceur = () => path.join(RACINE, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
// Codex installé à la demande par le QG (Réglages › Comptes IA) : runtime/codex, version épinglée.
export const codexRuntime = () => path.join(RACINE, 'runtime', 'codex');
export const codexLanceurRuntime = (dossier = codexRuntime()) => path.join(dossier, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
export const codexPaquet = (plat = PLATEFORME, arch = process.arch) => `@openai/codex-${plat}-${arch === 'x64' ? 'x64' : 'arm64'}`;

// Commande pour lancer Codex : { exe, args, present }. Les args précèdent ceux de l'appel (exec, login…).
export function codexCommande(plat = PLATEFORME, { env = process.env, existe = fs.existsSync } = {}) {
  const perso = env.QG_CODEX_BIN;
  if (perso) {
    if (/\.(m?js|cjs)$/i.test(perso)) return { exe: nodeOuCourant(plat), args: [perso], present: existe(perso) };
    return { exe: perso, args: [], present: existe(perso) };
  }
  const installe = codexLanceurRuntime();
  if (existe(installe)) return { exe: nodeOuCourant(plat), args: [installe], present: true };
  const lanceur = codexLanceur();
  if (existe(lanceur)) return { exe: nodeOuCourant(plat), args: [lanceur], present: true };
  // Codex installé par ailleurs (installeur officiel, npm -g) : cherché dans le PATH.
  const cle = Object.keys(env).find((k) => k.toLowerCase() === 'path');
  for (const dossier of String(env[cle] || '').split(estWindows(plat) ? ';' : ':').filter(Boolean)) {
    if (estWindows(plat)) {
      // un .cmd ne se lance pas sans shell : on vise le script JS qu'il enveloppe quand c'est npm, sinon cmd /c
      const cmd = path.join(dossier, 'codex.cmd');
      const js = path.join(dossier, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (existe(js)) return { exe: nodeOuCourant(plat), args: [js], present: true };
      const exe = path.join(dossier, 'codex.exe');
      if (existe(exe)) return { exe, args: [], present: true };
      if (existe(cmd)) return { exe: 'cmd.exe', args: ['/d', '/c', cmd], present: true };
    } else {
      const bin = path.join(dossier, 'codex');
      if (existe(bin)) return { exe: bin, args: [], present: true };
    }
  }
  return { exe: nodeOuCourant(plat), args: [lanceur], present: false };
}

// Agent ACP (Grok, Cursor, Copilot…) : argv = [binaire, ...arguments] du catalogue (config/defauts/agents-acp.json)
// ou de la commande personnalisée du compte. QG_ACP_BIN (tests) : un script JS lancé par Node, qui reçoit argv
// en entier. Sinon : chemin absolu tel quel, ou recherche dans le PATH (Windows : .exe, puis .cmd/.bat par cmd /c).
export function acpCommande(argv, plat = PLATEFORME, { env = process.env, existe = fs.existsSync } = {}) {
  const [bin = '', ...reste] = (argv || []).map(String);
  const parScript = (js, args) => ({ exe: nodeOuCourant(plat), args: [js, ...args], present: existe(js) });
  const perso = env.QG_ACP_BIN;
  if (perso) return /\.(m?js|cjs)$/i.test(perso) ? parScript(perso, [bin, ...reste]) : { exe: perso, args: [bin, ...reste], present: existe(perso) };
  if (!bin) return { exe: '', args: [], present: false };
  const chemin = chemins(plat);
  const enveloppe = (fichier) => {
    if (/\.(m?js|cjs)$/i.test(fichier)) return parScript(fichier, reste);
    if (estWindows(plat) && /\.(cmd|bat)$/i.test(fichier)) return { exe: 'cmd.exe', args: ['/d', '/c', fichier, ...reste], present: true };
    return { exe: fichier, args: reste, present: true };
  };
  if (chemin.isAbsolute(bin)) return existe(bin) ? enveloppe(bin) : { exe: bin, args: reste, present: false };
  const cle = Object.keys(env).find((k) => k.toLowerCase() === 'path');
  for (const dossier of String(env[cle] || '').split(estWindows(plat) ? ';' : ':').filter(Boolean)) {
    const noms = estWindows(plat) ? (/\.[a-z0-9]+$/i.test(bin) ? [bin] : ['.exe', '.cmd', '.bat', '.com'].map((x) => bin + x)) : [bin];
    for (const n of noms) {
      const f = chemin.join(dossier, n);
      if (existe(f)) return enveloppe(f);
    }
  }
  return { exe: bin, args: reste, present: false };
}

export const pythonVenv = (venv, plat = PLATEFORME) => (estWindows(plat) ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python'));

// Electron installé par npm dans runtime/navigateur : electron.exe sur Windows ; sur Mac, le paquet note
// le chemin de son binaire dans path.txt (Electron.app/Contents/MacOS/Electron).
export function electronExe(dossierApp, plat = PLATEFORME) {
  const dist = path.join(dossierApp, 'node_modules', 'electron', 'dist');
  if (estWindows(plat)) return path.join(dist, 'electron.exe');
  try {
    const note = fs.readFileSync(path.join(dossierApp, 'node_modules', 'electron', 'path.txt'), 'utf8').trim();
    if (note) return path.join(dist, note);
  } catch {
    /* pas encore installé */
  }
  return estMac(plat) ? path.join(dist, 'Electron.app', 'Contents', 'MacOS', 'Electron') : path.join(dist, 'electron');
}

// tar capable de lire un zip : celui de Windows (bsdtar, dans System32), ou /usr/bin/tar (bsdtar aussi).
export const tar = (plat = PLATEFORME) => (estWindows(plat) ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : '/usr/bin/tar');

// Scripts de la racine du QG : lancer.bat sur Windows, lancer.command sur Mac.
export const script = (nomScript, plat = PLATEFORME) => `${nomScript}.${estWindows(plat) ? 'bat' : 'command'}`;

// PATH des sessions et des services : le Node portable en tête (séparateur « ; » sur Windows, « : » ailleurs).
export const pathAvecNode = (valeur, plat = PLATEFORME) => `${nodeBin(plat)}${estWindows(plat) ? ';' : ':'}${valeur || ''}`;

// Navigateurs pour la capture de page (mcp__qg__capturer_page), dans l'ordre d'essai.
export function navigateursCapture(plat = PLATEFORME) {
  if (estWindows(plat)) {
    return [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ];
  }
  if (estMac(plat)) {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
}

// Dossiers système à ne pas parcourir pendant la détection des projets (noms en minuscules).
export function dossiersSystemeIgnores(plat = PLATEFORME) {
  if (estWindows(plat)) return ['$recycle.bin', 'system volume information', 'windows', 'program files', 'program files (x86)', 'programdata'];
  if (estMac(plat)) return ['library', 'applications', 'system', 'volumes', 'private', 'cores', 'opt', 'usr', 'bin', 'sbin', 'etc', 'dev', 'movies', 'music', 'pictures'];
  return ['proc', 'sys', 'dev', 'usr', 'bin', 'sbin', 'etc', 'opt', 'var', 'lib', 'lib64', 'boot'];
}

// Un dossier (parent + nom) est-il un dossier système à sauter ? Windows : par le nom, comme avant.
// POSIX : seulement directement sous « / » ou sous le dossier personnel (un projet « music » dans ~/Projets
// reste un projet).
export function estDossierSysteme(parent, nomDossier, plat = PLATEFORME, home = os.homedir()) {
  const n = String(nomDossier).toLowerCase();
  if (!dossiersSystemeIgnores(plat).includes(n)) return false;
  if (estWindows(plat)) return true;
  const p = cleChemin(parent, plat);
  return p === '' || p === cleChemin(home, plat);
}

// ---------------------------------------------------------------- chemins et comparaisons

// Clé de comparaison d'un chemin : Windows et APFS (par défaut) ignorent la casse ; APFS garde la forme
// Unicode des noms (NFD possible), on normalise en NFC. Linux garde la casse.
export function cleChemin(p, plat = PLATEFORME) {
  const ch = chemins(plat);
  if (estWindows(plat)) return ch.resolve(p).replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
  const abs = ch.resolve(p).normalize('NFC').replace(/\/+$/, '');
  return estMac(plat) ? abs.toLowerCase() : abs;
}
export const memeChemin = (a, b, plat = PLATEFORME) => cleChemin(a, plat) === cleChemin(b, plat);

// Un chemin est-il sous un des dossiers donnés (ou égal à l'un d'eux) ?
export function sousChemin(dossiers, chemin, plat = PLATEFORME) {
  if (!chemin) return false;
  const cible = cleChemin(chemin, plat);
  return dossiers.filter(Boolean).some((d) => {
    const base = cleChemin(d, plat);
    return cible === base || cible.startsWith(base + '/');
  });
}

// Chemin → forme des règles de permission de Claude Code. Windows : D:\Dev → //d/Dev.
// POSIX : /Users/x/Dev → //Users/x/Dev (un chemin qui commence par un seul « / » serait lu comme relatif
// au fichier de réglages). La racine « / » donne « / », donc « //** » avec le suffixe « /** ».
export function cheminRegle(p, plat = PLATEFORME) {
  const ch = chemins(plat);
  if (estWindows(plat)) {
    const abs = ch.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
    const m = abs.match(/^([A-Za-z]):(.*)$/);
    return m ? `//${m[1].toLowerCase()}${m[2]}` : abs;
  }
  return '/' + ch.resolve(p).replace(/\/+$/, '');
}

// Racines du système de fichiers à parcourir pour les règles « demander hors des zones » :
// les lecteurs existants A:\ … Z:\ sur Windows, la racine « / » ailleurs.
export function racinesRegles(plat = PLATEFORME, existe = fs.existsSync) {
  if (!estWindows(plat)) return ['/'];
  const out = [];
  for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const lecteur = `${l}:\\`;
    if (existe(lecteur)) out.push(lecteur);
  }
  return out;
}

// Une zone est-elle sur cette racine ? (Windows : même lettre de lecteur ; POSIX : toujours)
export function surRacine(zone, racine, plat = PLATEFORME) {
  if (!estWindows(plat)) return true;
  return path.win32.resolve(zone)[0].toUpperCase() === racine[0].toUpperCase();
}

// ---------------------------------------------------------------- processus et fenêtres

const detache = { detached: true, stdio: 'ignore' };

// Ouvre un lien dans le navigateur par défaut.
export function ouvrirUrl(url, plat = PLATEFORME) {
  if (estWindows(plat)) return spawn('cmd.exe', ['/d', '/c', 'start', '', url], { ...detache, windowsHide: true }).unref();
  if (estMac(plat)) return spawn('open', [url], detache).unref();
  return spawn('xdg-open', [url], detache).unref();
}

// Ligne de commande Windows pour `start` : un argument avec espace ou guillemet est cité (cmd le relit tel quel).
const citerWindows = (a) => (a === '' || /[\s"&|<>^]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : String(a));
// Shell POSIX : tout entre apostrophes.
export const citerShell = (a) => `'${String(a).replace(/'/g, "'\\''")}'`;

const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'terminal';
let compteurTerminaux = 0;

/**
 * Ouvre une fenêtre de terminal visible qui lance argv (programme + arguments) et y reste.
 * Windows : `cmd /d /c start "titre" …`. Mac : un petit fichier .command écrit dans runtime/terminaux
 * (donc jamais en quarantaine), ouvert avec `open` (Terminal). Un .command ou .sh en tête d'argv est lancé
 * par /bin/bash (pas besoin de son bit exécutable).
 * Renvoie le chemin du fichier .command écrit (Mac) ou null.
 */
export function ouvrirTerminal(titre, argv, { cwd = RACINE, plat = PLATEFORME } = {}) {
  if (estWindows(plat)) {
    const ligne = `start "${String(titre).replace(/"/g, '')}" ${argv.map(citerWindows).join(' ')}`;
    spawn('cmd.exe', ['/d', '/c', ligne], { ...detache, windowsVerbatimArguments: true, cwd }).unref();
    return null;
  }
  const dossier = path.join(RACINE, 'runtime', 'terminaux');
  fs.mkdirSync(dossier, { recursive: true });
  const fichier = path.join(dossier, `${slug(titre)}-${process.pid}-${++compteurTerminaux}.command`);
  fs.writeFileSync(fichier, scriptTerminal(titre, argv, cwd), { mode: 0o755 });
  try {
    fs.chmodSync(fichier, 0o755);
  } catch {
    /* droits déjà posés */
  }
  if (estMac(plat)) spawn('open', [fichier], detache).unref();
  else spawn('x-terminal-emulator', ['-e', '/bin/bash', fichier], detache).unref();
  return fichier;
}

// Contenu du .command d'une fenêtre de terminal (bash 3.2, LF).
export function scriptTerminal(titre, argv, cwd) {
  const commande = (/\.(command|sh)$/i.test(argv[0]) ? ['/bin/bash', ...argv] : argv).map(citerShell).join(' ');
  return ['#!/bin/bash', `printf '\\033]0;%s\\007' ${citerShell(titre)}`, `cd ${citerShell(cwd)} || exit 1`, `exec ${commande}`, ''].join('\n');
}

// Mise à jour depuis le site : le script attend la fin du QG (pid), met à jour, puis relance le QG.
export function lancerMiseAJour({ pid, ouvrir = false, plat = PLATEFORME } = {}) {
  if (estWindows(plat)) {
    const ps1 = path.join(RACINE, 'outils', 'mettre-a-jour.ps1');
    const ligne = `start "Mise a jour du QG" powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}" -AttendrePid ${pid} -Relancer${ouvrir ? ' -Ouvrir' : ''}`;
    spawn('cmd.exe', ['/d', '/c', ligne], { ...detache, windowsVerbatimArguments: true, cwd: RACINE }).unref();
    return null;
  }
  const sh = path.join(RACINE, 'outils', 'mettre-a-jour.sh');
  return ouvrirTerminal('Mise a jour du QG', ['/bin/bash', sh, '--attendre-pid', String(pid), '--relancer', ...(ouvrir ? ['--ouvrir'] : [])], { cwd: RACINE, plat });
}

// Options de spawn d'un service long (rojo serve…). POSIX : un groupe de processus à part, pour pouvoir
// tuer tout l'arbre d'un coup (tuerArbre).
export const optionsSpawnService = (plat = PLATEFORME) => (estWindows(plat) ? { windowsHide: true } : { detached: true });

// Tue un processus et ses enfants. Windows : taskkill /T. POSIX : SIGTERM au groupe, puis SIGKILL après 3 s.
export function tuerArbre(pid, plat = PLATEFORME, { tuer = process.kill, delaiMs = 3000 } = {}) {
  if (!pid) return;
  if (estWindows(plat)) {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
    return;
  }
  const signaler = (signal) => {
    try {
      tuer(-pid, signal);
    } catch {
      try {
        tuer(pid, signal);
      } catch {
        /* déjà parti */
      }
    }
  };
  signaler('SIGTERM');
  setTimeout(() => signaler('SIGKILL'), delaiMs).unref();
}

// Ports TCP en écoute → PID. Windows : netstat -ano ; POSIX : lsof -nP -iTCP -sTCP:LISTEN -Fpn.
export function analyserPorts(sortie, plat = PLATEFORME) {
  const ports = new Map();
  if (estWindows(plat)) {
    for (const l of String(sortie).split('\n')) {
      const m = l.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
      if (m) ports.set(Number(m[1]), Number(m[2]));
    }
    return ports;
  }
  // Format -F : une ligne « p<pid> » puis des lignes « n<adresse>:<port> » pour chaque descripteur.
  let pid = null;
  for (const l of String(sortie).split('\n')) {
    if (l.startsWith('p')) pid = Number(l.slice(1)) || null;
    else if (l.startsWith('n') && pid) {
      const m = l.match(/:(\d+)$/);
      if (m && !ports.has(Number(m[1]))) ports.set(Number(m[1]), pid);
    }
  }
  return ports;
}
export function portsEnEcoute(plat = PLATEFORME) {
  const [exe, args] = estWindows(plat) ? ['netstat', ['-ano', '-p', 'tcp']] : ['lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn']];
  return new Promise((resolve) => {
    execFile(exe, args, { windowsHide: true, timeout: 8000 }, (err, sortie) => resolve(err && !sortie ? new Map() : analyserPorts(sortie || '', plat)));
  });
}

// ---------------------------------------------------------------- notification système

const echapperXml = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
const echapperAppleScript = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');

/**
 * Notification du système quand aucun onglet du site n'est ouvert.
 * Windows : toast natif via PowerShell, un clic ouvre le site. Mac : « display notification » (osascript) ;
 * elle apparaît au nom de l'Éditeur de scripts et un clic n'ouvre pas le QG (limite connue).
 */
export function notificationSysteme({ titre, texte, attribution }, lienSite, plat = PLATEFORME) {
  if (estWindows(plat)) {
    const xml = `<toast activationType="protocol" launch="${echapperXml(lienSite)}"><visual><binding template="ToastGeneric"><text>${echapperXml(titre)}</text><text>${echapperXml(texte).slice(0, 240)}</text><text placement="attribution">${echapperXml(attribution)}</text></binding></visual></toast>`;
    const script = [
      '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
      '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
      '$x = New-Object Windows.Data.Xml.Dom.XmlDocument',
      `$x.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(xml, 'utf8').toString('base64')}')))`,
      "$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
      '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show([Windows.UI.Notifications.ToastNotification]::new($x))',
    ].join('; ');
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  if (estMac(plat)) {
    const script = `display notification "${echapperAppleScript(String(texte).slice(0, 240))}" with title "${echapperAppleScript(titre)}" subtitle "${echapperAppleScript(attribution)}"`;
    spawn('osascript', ['-e', script], { stdio: 'ignore' }).unref();
    return;
  }
  spawn('notify-send', [String(titre), String(texte).slice(0, 240)], { stdio: 'ignore' }).unref();
}

// ---------------------------------------------------------------- choix d'un dossier (Mac)

// osascript « choose folder » : le chemin POSIX choisi, ou null (Annuler rend l'erreur -128).
// rappeler() ne fait rien : ramener la fenêtre devant exigerait une autorisation d'accessibilité.
export function selecteurDossierMac(titre, { delai = 10 * 60 * 1000, lancer = execFile } = {}) {
  const prompt = echapperAppleScript(String(titre).slice(0, 120));
  const script = `POSIX path of (choose folder with prompt "${prompt}")`;
  const promesse = new Promise((resolve) => {
    lancer('osascript', ['-e', script], { timeout: delai, encoding: 'utf8' }, (err, sortie) => resolve(err ? null : String(sortie).trim().replace(/\/+$/, '') || null));
  });
  return { promesse, rappeler: () => {} };
}

// ---------------------------------------------------------------- état de connexion d'un compte

export const fichierIdentifiants = (configDir) => path.join(configDir, '.credentials.json');
// Codex range son jeton dans CODEX_HOME/auth.json (stockage « file » imposé par le QG, sur tous les systèmes).
export const fichierIdentifiantsCodex = (configDir) => path.join(configDir, 'auth.json');
// Fichier dont l'existence (jamais le contenu) dit qu'un compte est connecté, selon le fournisseur.
export const fichierConnexion = (fournisseur, configDir) => (fournisseur === 'codex' ? fichierIdentifiantsCodex(configDir) : fichierIdentifiants(configDir));

// Sur Mac, Claude Code range le jeton dans le trousseau : le fichier .credentials.json n'existe pas
// (sauf si le trousseau a refusé). On demande alors « claude auth status --json » ({loggedIn}), mis en cache
// 30 s ; une relecture périmée se fait en arrière-plan. Windows : le fichier seulement (comme avant).
const DUREE_CACHE = 30 * 1000;
const cacheConnexion = new Map(); // configDir → { t, connecte, enCours }

const lireLoggedIn = (sortie) => {
  try {
    return JSON.parse(String(sortie || '')).loggedIn === true;
  } catch {
    return false;
  }
};

export function compteConnecteSelonPlateforme({ configDir, env = process.env, plat = PLATEFORME, exe = claudeExe(plat), fournisseur = 'claude' }) {
  // Codex : le fichier auth.json du CODEX_HOME, sur tous les systèmes (stat seulement, jamais lu).
  if (fournisseur === 'codex') return fs.existsSync(fichierIdentifiantsCodex(configDir));
  if (fs.existsSync(fichierIdentifiants(configDir))) return true;
  if (estWindows(plat)) return false;
  const c = cacheConnexion.get(configDir);
  if (c) {
    if (Date.now() - c.t > DUREE_CACHE) rafraichirConnexion({ configDir, env, plat, exe }).catch(() => null);
    return c.connecte;
  }
  // première lecture : synchrone, pour que le site ait le bon état dès le démarrage
  let connecte = false;
  if (fs.existsSync(exe)) {
    try {
      connecte = lireLoggedIn(execFileSync(exe, ['auth', 'status', '--json'], { env, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch (e) {
      connecte = lireLoggedIn(e.stdout); // code 1 = non connecté, le JSON est quand même là
    }
  }
  cacheConnexion.set(configDir, { t: Date.now(), connecte, enCours: null });
  return connecte;
}

// Relecture forcée (surveillance d'une connexion en cours, après une déconnexion).
export function rafraichirConnexion({ configDir, env = process.env, plat = PLATEFORME, exe = claudeExe(plat), fournisseur = 'claude' }) {
  if (fournisseur === 'codex') return Promise.resolve(fs.existsSync(fichierIdentifiantsCodex(configDir)));
  if (fs.existsSync(fichierIdentifiants(configDir))) return Promise.resolve(true);
  if (estWindows(plat)) return Promise.resolve(false);
  const c = cacheConnexion.get(configDir);
  if (c?.enCours) return c.enCours;
  const enCours = new Promise((resolve) => {
    if (!fs.existsSync(exe)) return resolve(false);
    execFile(exe, ['auth', 'status', '--json'], { env, encoding: 'utf8', timeout: 15000, windowsHide: true }, (err, sortie) => resolve(lireLoggedIn(sortie || err?.stdout)));
  }).then((connecte) => {
    cacheConnexion.set(configDir, { t: Date.now(), connecte, enCours: null });
    return connecte;
  });
  cacheConnexion.set(configDir, { t: c?.t || 0, connecte: c?.connecte || false, enCours });
  return enCours;
}

export const oublierConnexion = (configDir) => cacheConnexion.delete(configDir);

// Ligne {SYSTEME} des consignes du DG, des agents et du vérificateur : quel système, quel shell.
// Windows : rien (les consignes restent celles d'avant le portage, mot pour mot).
export function consigneSysteme(plat = PLATEFORME) {
  if (estWindows(plat)) return '';
  if (estMac(plat)) return "- Système : macOS (shell zsh/bash, commandes Unix). `python3` plutôt que `python`, `open` pour ouvrir un fichier ou un lien. Pas de PowerShell, pas de `.bat`, pas de chemins `C:\\`.";
  return '- Système : Linux (shell bash, commandes Unix). `python3` plutôt que `python`. Pas de PowerShell ni de `.bat`.';
}

// ---------------------------------------------------------------- ce que le site doit savoir

// Envoyé dans /api/reglages (reglages.plateforme) : noms des scripts, dictée locale possible ou non.
export function infos(plat = PLATEFORME) {
  return {
    nom: nom(plat),
    scripts: {
      lancer: script('lancer', plat),
      installer: script('installer', plat),
      ajouterCompte: script('ajouter-un-compte', plat),
      mettreAJour: script('mettre-a-jour', plat),
      demo: script('lancer-demo', plat),
    },
    // La dictée locale (Whisper, installer-dictee) n'est installable que sur Windows pour l'instant.
    dicteeLocale: estWindows(plat),
    raccourciDictee: estMac(plat) ? '⌥M' : 'Alt+M',
    dossierComptes: path.join(os.homedir(), '.claude-qg'),
    // Comptes IA : dossiers de connexion par fournisseur, et présence du binaire Codex sur ce poste.
    dossiersComptes: { claude: path.join(os.homedir(), '.claude-qg'), codex: path.join(os.homedir(), '.codex-qg') },
    codex: codexCommande(plat).present,
  };
}
