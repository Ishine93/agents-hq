// Fenêtre « application » du QG (Electron, installé à la demande dans runtime/navigateur) : le site du QG
// dans sa propre fenêtre, avec un vrai navigateur dedans (<webview>) qui affiche tous les sites (Google,
// Reddit, X, YouTube…). Les sites ont leur propre session, gardée d'un lancement à l'autre : on s'y
// connecte une fois.
// Lancement (par le serveur) : electron.exe <ce dossier> --qg-url=http://127.0.0.1:PORT/?jeton=…
// ou, pour le navigateur complet d'un QG affiché dans un navigateur ordinaire : --qg-moteur=… (moteur.cjs).
// Un seul processus : un QG relancé, la démo (autre port) ou le moteur arrivent ici (« second-instance »).
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { lireArgument, demarrerMoteur, moteursActifs } = require('./moteur.cjs');

const RACINE = path.resolve(__dirname, '..');
const PARTITION = 'persist:qg-navigateur';
const argUrl = (argv) => {
  const a = argv.find((x) => x.startsWith('--qg-url='));
  return a ? a.slice('--qg-url='.length) : null;
};

// profil (cookies des sites, taille de la fenêtre) dans le dossier du QG, jamais publié
app.setPath('userData', path.join(RACINE, 'runtime', 'navigateur', 'profil'));
// identifiant d'application (barre des tâches, notifications) : API Windows seulement
if (process.platform === 'win32') app.setAppUserModelId('QG des agents');
// Mac : sans menu Édition, ⌘C / ⌘V / ⌘A ne marchent plus dans les champs ; on garde un menu minimal.
if (process.platform === 'darwin') Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));

// Les sites voient un Chrome ordinaire (Google refuse sinon la connexion : « navigateur non sécurisé »).
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

const FICHIER_FENETRE = () => path.join(app.getPath('userData'), 'fenetre.json');
function lireFenetre() {
  try {
    return JSON.parse(fs.readFileSync(FICHIER_FENETRE(), 'utf8'));
  } catch {
    return { width: 1440, height: 900 };
  }
}

const fenetres = new Map(); // origine du QG (port) → fenêtre : le QG et sa démo ont chacun la leur

function preparerSession() {
  const sites = session.fromPartition(PARTITION);
  sites.setUserAgent(UA);
  // les sites n'ont ni caméra, ni micro, ni position, ni notifications : juste le plein écran
  sites.setPermissionRequestHandler((_wc, permission, ok) => ok(['fullscreen', 'clipboard-sanitized-write', 'pointerLock'].includes(permission)));
}

function ouvrirQg(url) {
  const origine = new URL(url).origin;
  const f = fenetres.get(origine);
  if (!f) return creer(url, origine);
  f.loadURL(url);
  if (f.isMinimized()) f.restore();
  f.focus();
}

function creer(url, origine) {
  const etat = lireFenetre();
  const premiere = !fenetres.size;
  // une deuxième fenêtre (la démo) se décale pour ne pas recouvrir la première
  const decale = !premiere ? { x: (etat.x ?? 80) + 40 * fenetres.size, y: (etat.y ?? 60) + 40 * fenetres.size } : {};
  const fenetre = new BrowserWindow({
    ...etat,
    ...decale,
    minWidth: 900,
    minHeight: 560,
    title: 'QG des agents',
    icon: path.join(__dirname, 'icone.ico'),
    backgroundColor: '#0b0e1c',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), webviewTag: true, contextIsolation: true, sandbox: true },
  });
  fenetres.set(origine, fenetre);
  fenetre.removeMenu();
  if (etat.agrandie && premiere) fenetre.maximize();

  // la fenêtre principale ne montre que le QG ; un lien vers ailleurs part dans le navigateur par défaut
  fenetre.webContents.setWindowOpenHandler(({ url: lien }) => {
    if (/^https?:/i.test(lien) && !lien.startsWith(origine)) shell.openExternal(lien);
    return { action: 'deny' };
  });
  fenetre.webContents.on('will-navigate', (e, lien) => {
    if (!lien.startsWith(origine)) {
      e.preventDefault();
      if (/^https?:/i.test(lien)) shell.openExternal(lien);
    }
  });
  // <webview> du navigateur : réglages imposés quoi que demande la page (pas de Node, session des sites)
  fenetre.webContents.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    params.partition = PARTITION;
    if (params.src && !/^(https?:|about:blank)/i.test(params.src)) e.preventDefault();
  });

  const enregistrer = () => {
    try {
      const b = fenetre.getNormalBounds();
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(FICHIER_FENETRE(), JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, agrandie: fenetre.isMaximized() }));
    } catch {
      /* rien */
    }
  };
  // seule la fenêtre du QG principal retient sa place
  fenetre.on('close', () => {
    if ([...fenetres.keys()][0] === origine) enregistrer();
  });
  fenetre.on('closed', () => fenetres.delete(origine));
  fenetre.loadURL(url);
}

// Pages ouvertes depuis un site (dans la fenêtre application) : un lien « nouvel onglet » s'ouvre dans la
// même vue ; une vraie fenêtre (connexion Google ou Twitch, paiement…) s'ouvre en petite fenêtre, avec la
// même session. (Les pages du moteur gèrent les leurs dans moteur.cjs.)
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url, disposition }) => {
    if (!/^https?:/i.test(url)) return { action: 'deny' };
    if (disposition === 'new-window') {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, backgroundColor: '#ffffff', webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true } } };
    }
    contents.loadURL(url).catch(() => {});
    return { action: 'deny' };
  });
});

// Plus de fenêtre ni de moteur : on s'arrête.
const quitterSiInutile = () => {
  if (!moteursActifs() && !fenetres.size) app.quit();
};

function traiter(argv, premier) {
  const moteur = lireArgument(argv);
  if (moteur) demarrerMoteur(moteur, () => setTimeout(quitterSiInutile, 500));
  const u = argUrl(argv);
  if (u) ouvrirQg(u);
  else if (!moteur) {
    // relancé sans adresse : on montre ce qui est ouvert
    const f = [...fenetres.values()][0];
    if (f) {
      if (f.isMinimized()) f.restore();
      f.focus();
    } else if (premier) ouvrirQg('http://127.0.0.1:4747/');
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => traiter(argv, false));
  app.whenReady().then(() => {
    preparerSession();
    traiter(process.argv, true);
  });
  // les pages du moteur sont des fenêtres invisibles : tant qu'il tourne, l'application reste
  app.on('window-all-closed', quitterSiInutile);
}
