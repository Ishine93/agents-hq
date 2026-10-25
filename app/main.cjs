// Fenêtre « application » du QG (Electron, installé à la demande dans runtime/navigateur) : le site du QG
// dans sa propre fenêtre, avec un vrai navigateur dedans (<webview>) qui affiche tous les sites (Google,
// Reddit, X, YouTube…). Les sites ont leur propre session, gardée d'un lancement à l'autre : on s'y
// connecte une fois.
// Lancement (par le serveur) : electron.exe <ce dossier> --qg-url=http://127.0.0.1:PORT/?jeton=…
const { app, BrowserWindow, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const RACINE = path.resolve(__dirname, '..');
const PARTITION = 'persist:qg-navigateur';
const argUrl = (argv) => {
  const a = argv.find((x) => x.startsWith('--qg-url='));
  return a ? a.slice('--qg-url='.length) : null;
};
const URL_QG = argUrl(process.argv) || 'http://127.0.0.1:4747/';
const ORIGINE = new URL(URL_QG).origin;

// profil (cookies des sites, taille de la fenêtre) dans le dossier du QG, jamais publié
app.setPath('userData', path.join(RACINE, 'runtime', 'navigateur', 'profil'));
app.setAppUserModelId('QG des agents');

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

let fenetre = null;

function creer() {
  const sites = session.fromPartition(PARTITION);
  sites.setUserAgent(UA);
  // les sites n'ont ni caméra, ni micro, ni position, ni notifications : juste le plein écran
  sites.setPermissionRequestHandler((_wc, permission, ok) => ok(['fullscreen', 'clipboard-sanitized-write', 'pointerLock'].includes(permission)));

  const etat = lireFenetre();
  fenetre = new BrowserWindow({
    ...etat,
    minWidth: 900,
    minHeight: 560,
    title: 'QG des agents',
    backgroundColor: '#0b0e1c',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), webviewTag: true, contextIsolation: true, sandbox: true },
  });
  fenetre.removeMenu();
  if (etat.agrandie) fenetre.maximize();

  // la fenêtre principale ne montre que le QG ; un lien vers ailleurs part dans le navigateur par défaut
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && !url.startsWith(ORIGINE)) shell.openExternal(url);
    return { action: 'deny' };
  });
  fenetre.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGINE)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
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
  fenetre.on('close', enregistrer);
  fenetre.on('closed', () => (fenetre = null));
  fenetre.loadURL(URL_QG);
}

// Pages ouvertes depuis un site : un lien « nouvel onglet » s'ouvre dans la même vue ; une vraie fenêtre
// (connexion Google ou Twitch, paiement…) s'ouvre en petite fenêtre, avec la même session.
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url, disposition }) => {
    if (!/^https?:/i.test(url)) return { action: 'deny' };
    if (disposition === 'new-window') {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, backgroundColor: '#ffffff', webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true } } };
    }
    contents.loadURL(url);
    return { action: 'deny' };
  });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // QG relancé alors que la fenêtre est ouverte : on la montre (avec la nouvelle adresse, nouveau jeton)
  app.on('second-instance', (_e, argv) => {
    if (!fenetre) return creer();
    const u = argUrl(argv);
    if (u) fenetre.loadURL(u);
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
  });
  app.whenReady().then(creer);
  app.on('window-all-closed', () => app.quit());
}
