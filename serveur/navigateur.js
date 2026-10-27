// Navigateur du QG : une fenêtre dans le site pour aller sur les sites qu'on veut.
// Beaucoup de sites (YouTube, Twitch, Kick…) refusent de s'afficher dans une autre page (X-Frame-Options,
// CSP frame-ancestors) : leurs vidéos et directs passent alors par leur lecteur officiel, fait pour ça ;
// pour le reste, on ouvre le site dans une fenêtre « application » de ton navigateur habituel, avec ta
// session (cookies, comptes connectés).
import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { RACINE } from './config.js';
import * as plateforme from './plateforme.js';
import { t } from './i18n.js';

// ---------- fenêtre « application » (Electron) : un vrai navigateur dans le QG, pour TOUS les sites ----------
// Installée à la demande (≈ 100 Mo) dans runtime/navigateur : jamais publiée, jamais écrasée par une mise à jour.
export const VERSION_ELECTRON = '44.7.0';
const DOSSIER_APP = path.join(RACINE, 'runtime', 'navigateur');
// electron.exe sur Windows ; sur Mac, le binaire dans Electron.app (chemin noté par le paquet après l'installation)
const ELECTRON = () => plateforme.electronExe(DOSSIER_APP);
export const appInstallee = () => fs.existsSync(ELECTRON());
// Lancé depuis une application Electron (VS Code, Claude…), le QG peut hériter de ELECTRON_RUN_AS_NODE :
// présente, même vide, elle ferait tourner notre Electron comme un simple Node.
function lancerElectron(args) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let sortie = 'ignore';
  try {
    sortie = fs.openSync(path.join(DOSSIER_APP, 'electron.log'), 'w');
  } catch {
    /* journal facultatif */
  }
  spawn(ELECTRON(), [path.join(RACINE, 'app'), ...args], { detached: true, stdio: ['ignore', sortie, sortie], cwd: RACINE, env, windowsHide: false }).unref();
  if (typeof sortie === 'number') fs.closeSync(sortie);
}
let installation = null; // { etat: 'en_cours' | 'ok' | 'erreur', texte, debut }
export const etatApp = () => ({ installee: appInstallee(), version: VERSION_ELECTRON, installation });

export function installerApp(publier) {
  if (installation?.etat === 'en_cours') return installation;
  fs.mkdirSync(DOSSIER_APP, { recursive: true });
  const pj = path.join(DOSSIER_APP, 'package.json');
  if (!fs.existsSync(pj)) fs.writeFileSync(pj, JSON.stringify({ name: 'qg-navigateur', private: true, description: 'Electron pour la fenêtre application du QG' }, null, 2));
  const node = plateforme.nodeOuCourant();
  const npm = plateforme.npmCli();
  installation = { etat: 'en_cours', texte: t('Téléchargement du navigateur (≈ 100 Mo)…'), debut: Date.now() };
  publier();
  let journal = '';
  const executer = (args, suite) => {
    const p = spawn(node, args, { cwd: DOSSIER_APP, windowsHide: true, env: { ...process.env, npm_config_update_notifier: 'false' } });
    p.stdout.on('data', (d) => (journal = (journal + d).slice(-4000)));
    p.stderr.on('data', (d) => (journal = (journal + d).slice(-4000)));
    p.on('close', suite);
    p.on('error', (e) => {
      installation = { etat: 'erreur', texte: t('Installation impossible ({raison}).', { raison: e.message }) };
      publier();
    });
  };
  const fin = (code) => {
    installation = appInstallee()
      ? { etat: 'ok', texte: t('Navigateur installé : tous les sites s’affichent maintenant dans le QG.') }
      : { etat: 'erreur', texte: t('Installation impossible ({raison}).', { raison: journal.trim().split(/\r?\n/).pop() || 'code ' + code }) };
    publier();
  };
  // 1. le paquet npm, 2. son install.js, qui télécharge le vrai navigateur (Electron ne le fait plus tout seul)
  executer([npm, 'install', `electron@${VERSION_ELECTRON}`, '--no-audit', '--no-fund', '--loglevel=error'], (code) => {
    if (code !== 0) return fin(code);
    executer([path.join(DOSSIER_APP, 'node_modules', 'electron', 'install.js')], fin);
  });
  return installation;
}

// Ouvre le QG dans sa fenêtre application (si elle est déjà ouverte, elle passe devant).
export function ouvrirApp(lien) {
  if (!appInstallee()) return false;
  lancerElectron([`--qg-url=${lien}`]);
  return true;
}

// ---------- moteur du navigateur complet, quand le QG est affiché dans un navigateur ordinaire ----------
// Les pages tournent dans Electron, hors écran (app/moteur.cjs) ; le site du QG s'y connecte directement
// (WebSocket sur 127.0.0.1, avec une clé que seul un site muni du jeton du QG obtient).
let moteur = null; // { port, cle }
let demarrageMoteur = null;
const portLibre = () =>
  new Promise((ok, ko) => {
    const s = net.createServer();
    s.unref();
    s.on('error', ko);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
async function moteurRepond(m) {
  try {
    const r = await fetch(`http://127.0.0.1:${m.port}/etat?cle=${m.cle}`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}
export async function moteurActif() {
  if (moteur && !(await moteurRepond(moteur))) moteur = null;
  return moteur;
}
export function demarrerMoteur(portQg) {
  if (demarrageMoteur) return demarrageMoteur;
  demarrageMoteur = (async () => {
    if (await moteurActif()) return moteur;
    if (!appInstallee()) throw new Error(t('Le navigateur complet n’est pas encore installé.'));
    const m = { port: await portLibre(), cle: crypto.randomBytes(24).toString('hex') };
    lancerElectron([`--qg-moteur=${m.port}:${m.cle}:${portQg}`]);
    for (let i = 0; i < 60; i++) {
      await new Promise((ok) => setTimeout(ok, 500));
      if (await moteurRepond(m)) return (moteur = m);
    }
    throw new Error(t('Le navigateur complet n’a pas démarré.'));
  })().finally(() => (demarrageMoteur = null));
  return demarrageMoteur;
}

// Adresse tapée → URL (une recherche si ce n'est pas une adresse).
export function normaliser(saisie) {
  const s = String(saisie || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(s)) return 'https://' + s;
  return 'https://www.google.com/search?q=' + encodeURIComponent(s);
}

// Vidéos et directs : le lecteur officiel, qui accepte d'être intégré.
export function lecteurIntegre(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const hote = u.hostname.replace(/^(www\.|m\.)/, '');
  const parents = '&parent=127.0.0.1&parent=localhost';
  if (hote === 'youtu.be' && u.pathname.length > 1) return { site: 'YouTube', url: `https://www.youtube.com/embed/${u.pathname.slice(1)}?autoplay=1` };
  if (hote === 'youtube.com') {
    const v = u.searchParams.get('v');
    if (v) return { site: 'YouTube', url: `https://www.youtube.com/embed/${v}?autoplay=1` };
    const m = u.pathname.match(/^\/(shorts|live|embed)\/([\w-]+)/);
    if (m) return { site: 'YouTube', url: `https://www.youtube.com/embed/${m[2]}?autoplay=1` };
    const liste = u.searchParams.get('list');
    if (liste) return { site: 'YouTube', url: `https://www.youtube.com/embed/videoseries?list=${liste}` };
  }
  if (hote === 'twitch.tv') {
    const m = u.pathname.match(/^\/videos\/(\d+)/);
    if (m) return { site: 'Twitch', url: `https://player.twitch.tv/?video=v${m[1]}${parents}` };
    const c = u.pathname.split('/').filter(Boolean)[0];
    if (c && !['directory', 'search', 'settings', 'downloads', 'p', 'subscriptions', 'inventory', 'wallet'].includes(c)) return { site: 'Twitch', url: `https://player.twitch.tv/?channel=${c}${parents}`, chat: `https://www.twitch.tv/embed/${c}/chat?darkpopout${parents}` };
  }
  if (hote === 'kick.com') {
    const c = u.pathname.split('/').filter(Boolean)[0];
    if (c && !['categories', 'search', 'following', 'browse'].includes(c)) return { site: 'Kick', url: `https://player.kick.com/${c}` };
  }
  return null;
}

// Le site accepte-t-il d'être affiché dans une autre page ? (on ne lit que ses en-têtes)
export async function integrable(url) {
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', Accept: 'text/html' } });
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (r.headers.get('content-security-policy') || '').toLowerCase();
    try {
      await r.body?.cancel();
    } catch {
      /* rien */
    }
    const fa = csp.split(';').map((x) => x.trim()).find((x) => x.startsWith('frame-ancestors'));
    if (xfo.includes('deny') || xfo.includes('sameorigin')) return { ok: false, final: r.url };
    if (fa && !/\*|127\.0\.0\.1|localhost/.test(fa)) return { ok: false, final: r.url };
    return { ok: true, final: r.url };
  } catch (e) {
    return { ok: false, final: url, erreur: e.name === 'AbortError' ? t('le site ne répond pas') : String(e.message || e) };
  } finally {
    clearTimeout(minuterie);
  }
}

// Ton navigateur par défaut (Windows) : Chrome, Edge, Brave ouvrent une fenêtre « application » sans
// onglets avec ton profil habituel ; Firefox une nouvelle fenêtre.
const PROGIDS = [
  [/^ChromeHTML/i, 'chrome.exe', 'app'],
  [/^MSEdgeHTM/i, 'msedge.exe', 'app'],
  [/^BraveHTML/i, 'brave.exe', 'app'],
  [/^VivaldiHTM/i, 'vivaldi.exe', 'app'],
  [/^Firefox/i, 'firefox.exe', 'fenetre'],
];
function regLire(cle, valeur) {
  return new Promise((ok) => {
    execFile('reg', ['query', cle, ...(valeur ? ['/v', valeur] : ['/ve'])], { windowsHide: true, timeout: 5000 }, (err, sortie) => {
      if (err) return ok(null);
      const l = String(sortie).split(/\r?\n/).find((x) => /REG_(SZ|EXPAND_SZ)/.test(x));
      ok(l ? l.replace(/^.*REG_(?:EXPAND_)?SZ\s+/, '').trim() : null);
    });
  });
}
async function navigateurParDefaut() {
  // (registre Windows ; sur Mac, pas de fenêtre « application » : un onglet du navigateur par défaut, via open)
  if (!plateforme.estWindows()) return null;
  const progId = await regLire('HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', 'ProgId');
  const connu = PROGIDS.find(([re]) => re.test(progId || ''));
  if (!connu) return null;
  const [, exe, mode] = connu;
  for (const base of ['HKCU', 'HKLM']) {
    const chemin = await regLire(`${base}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`, null);
    if (chemin && fs.existsSync(chemin.replace(/"/g, ''))) return { exe: chemin.replace(/"/g, ''), mode };
  }
  return null;
}

export async function ouvrirFenetre(url) {
  const nav = await navigateurParDefaut();
  if (nav) {
    const args = nav.mode === 'app' ? [`--app=${url}`] : ['-new-window', url];
    spawn(nav.exe, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    return { navigateur: nav.exe.split(/[\\/]/).pop(), mode: nav.mode };
  }
  // navigateur inconnu (ou Mac) : un onglet normal du navigateur par défaut
  plateforme.ouvrirUrl(url);
  return { navigateur: null, mode: 'onglet' };
}

const httpOk = (u) => {
  try {
    return ['http:', 'https:'].includes(new URL(u).protocol);
  } catch {
    return false;
  }
};

export async function routesNavigateur(req, res, chemin, { json, url, corps, lien, publier }) {
  if (req.method === 'GET' && chemin === '/api/navigateur/app') return json(res, 200, etatApp()), true;
  if (req.method === 'POST' && chemin === '/api/navigateur/app/installer') return json(res, 200, { installation: installerApp(publier) }), true;
  if (req.method === 'POST' && chemin === '/api/navigateur/app/ouvrir') {
    if (!ouvrirApp(lien)) return json(res, 409, { erreur: t('Le navigateur complet n’est pas encore installé.') }), true;
    return json(res, 200, { ok: true }), true;
  }
  if (chemin === '/api/navigateur/moteur') {
    if (req.method === 'GET') {
      const m = await moteurActif();
      return json(res, 200, { installee: appInstallee(), ...(m ? { port: m.port, cle: m.cle } : {}) }), true;
    }
    if (req.method === 'POST') {
      try {
        const m = await demarrerMoteur(Number(new URL(lien).port));
        return json(res, 200, { installee: true, port: m.port, cle: m.cle }), true;
      } catch (e) {
        return json(res, 409, { erreur: e.message, installee: appInstallee() }), true;
      }
    }
  }
  if (req.method === 'GET' && chemin === '/api/navigateur/ouvrir') {
    const u = normaliser(url.searchParams.get('url'));
    if (!u || !httpOk(u)) return json(res, 400, { erreur: t('adresse invalide') }), true;
    const lecteur = lecteurIntegre(u);
    if (lecteur) return json(res, 200, { url: u, integrable: true, affiche: lecteur.url, chat: lecteur.chat || null, site: lecteur.site }), true;
    const v = await integrable(u);
    return json(res, 200, { url: u, final: v.final, integrable: v.ok, affiche: v.ok ? v.final || u : null, erreur: v.erreur || null }), true;
  }
  if (req.method === 'POST' && chemin === '/api/navigateur/fenetre') {
    const u = normaliser(corps.url);
    if (!u || !httpOk(u)) return json(res, 400, { erreur: t('adresse invalide') }), true;
    return json(res, 200, { ok: true, ...(await ouvrirFenetre(u)) }), true;
  }
  return false;
}
