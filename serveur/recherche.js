// Recherche visuelle pour les agents : capture d'écran d'une page web et téléchargement d'images.
// - La capture passe par Edge (ou Chrome) en mode sans affichage, avec un profil isolé et vide :
//   aucun de tes comptes, cookies ou sessions n'est utilisé.
// - Seules les adresses publiques sont acceptées (pas de localhost ni de réseau local).
import { execFile } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { RACINE } from './config.js';
import * as plateforme from './plateforme.js';

// Edge ou Chrome sur Windows ; Chrome, Edge, Brave ou Chromium dans /Applications sur Mac.
const NAVIGATEURS = plateforme.navigateursCapture();
const PROFIL_ISOLE = path.join(RACINE, 'runtime', 'navigateur-capture');
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TAILLE_MAX = 10 * 1024 * 1024;

function ipPrivee(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:127.') || x.startsWith('::ffff:10.') || x.startsWith('::ffff:192.168.');
}

export async function verifierUrl(brute) {
  let u;
  try {
    u = new URL(brute);
  } catch {
    throw new Error(`adresse invalide : ${brute}`);
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('seules les adresses http(s) sont acceptées');
  const adresses = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true });
  if (!adresses.length || adresses.some((a) => ipPrivee(a.address))) throw new Error('adresse locale ou privée refusée');
  return u;
}

export async function capturerPage(url, { largeur = 1366, hauteur = 900 } = {}) {
  await verifierUrl(url);
  const exe = NAVIGATEURS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('ni Edge ni Chrome trouvés pour la capture');
  fs.mkdirSync(PROFIL_ISOLE, { recursive: true });
  const fichier = path.join(os.tmpdir(), `qg-capture-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`);
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', `--user-data-dir=${PROFIL_ISOLE}`, `--window-size=${largeur},${hauteur}`,
    '--virtual-time-budget=10000', `--screenshot=${fichier}`, url,
  ];
  await new Promise((resolve, reject) => {
    execFile(exe, args, { timeout: 45000, windowsHide: true }, (err) => (err && !fs.existsSync(fichier) ? reject(new Error(`capture impossible : ${err.message}`)) : resolve()));
  });
  if (!fs.existsSync(fichier)) throw new Error('le navigateur n’a pas produit de capture');
  const base64 = fs.readFileSync(fichier).toString('base64');
  fs.rmSync(fichier, { force: true });
  return { base64, type: 'image/png' };
}

// Téléchargement d'une image : redirections suivies à la main (chaque étape vérifiée), 10 Mo au plus.
export async function telechargerImage(url) {
  let courant = url;
  for (let etape = 0; etape < 4; etape++) {
    await verifierUrl(courant);
    const rep = await fetch(courant, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 QG-des-agents' } });
    if (rep.status >= 300 && rep.status < 400 && rep.headers.get('location')) {
      courant = new URL(rep.headers.get('location'), courant).href;
      continue;
    }
    if (!rep.ok) throw new Error(`téléchargement refusé (HTTP ${rep.status})`);
    const type = String(rep.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPES.has(type)) throw new Error(`ce n’est pas une image prise en charge (${type || 'type inconnu'})`);
    if (Number(rep.headers.get('content-length') || 0) > TAILLE_MAX) throw new Error('image trop lourde (10 Mo au plus)');
    const tampon = Buffer.from(await rep.arrayBuffer());
    if (tampon.length > TAILLE_MAX) throw new Error('image trop lourde (10 Mo au plus)');
    return { base64: tampon.toString('base64'), type };
  }
  throw new Error('trop de redirections');
}
