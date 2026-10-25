// Pièces jointes (images) : celles que tu joins à une demande, celles que les agents te montrent et
// les captures qu'ils reçoivent de leurs outils (ex. capture de Roblox Studio via le MCP).
// Tout est rangé dans dossiers/<id>/pieces/ et servi par /api/pieces/<id>/<fichier>.
import fs from 'node:fs';
import path from 'node:path';
import { DOSSIERS_DIR } from './bus.js';
import { etage as trouverEtage, dansEtage } from './config.js';

export const TYPES_IMAGES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const EXTENSIONS = Object.fromEntries(Object.entries(TYPES_IMAGES).map(([ext, type]) => [type, ext]));
export const TAILLE_MAX = 15 * 1024 * 1024;
let compteur = 0;

export const dossierPieces = (dossierId) => path.join(DOSSIERS_DIR, dossierId, 'pieces');

function nomSur(nom) {
  return String(nom || 'image').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40) || 'image';
}

function enregistrer(dossierId, tampon, type, nom, legende, origine) {
  const ext = EXTENSIONS[type];
  if (!ext) throw new Error(`type d'image non pris en charge : ${type}`);
  if (tampon.length > TAILLE_MAX) throw new Error('image trop lourde (15 Mo au plus)');
  const dir = dossierPieces(dossierId);
  fs.mkdirSync(dir, { recursive: true });
  const fichier = `${Date.now().toString(36)}-${++compteur}-${nomSur(nom)}${ext}`;
  const chemin = path.join(dir, fichier);
  fs.writeFileSync(chemin, tampon);
  return { id: fichier, nom: nom || fichier, type, legende: legende || null, origine, chemin, url: `/api/pieces/${dossierId}/${encodeURIComponent(fichier)}` };
}

// Images envoyées par le site (base64).
export function sauverPiecesUtilisateur(dossierId, pieces = []) {
  if (!Array.isArray(pieces)) return [];
  if (pieces.length > 10) throw new Error('10 images au plus par message');
  return pieces.map((p) => {
    const brut = String(p.base64 || '').replace(/^data:[^,]+,/, '');
    return enregistrer(dossierId, Buffer.from(brut, 'base64'), p.type, p.nom, null, 'toi');
  });
}

// Capture reçue par un agent dans le résultat d'un outil (bloc image base64).
export function sauverCapture(dossierId, base64, type, legende) {
  return enregistrer(dossierId, Buffer.from(base64, 'base64'), type, 'capture', legende, 'agent');
}

// Image qu'un agent veut te montrer : un fichier de son projet (ou du dossier).
export function copierImage(dossierId, etageId, chemin, cwd) {
  const absolu = path.isAbsolute(chemin) ? chemin : path.resolve(cwd, chemin);
  const e = trouverEtage(etageId);
  const autorise = dansEtage(e, absolu) || absolu.toLowerCase().startsWith(dossierPieces(dossierId).toLowerCase());
  if (!autorise) throw new Error(`image hors du projet : ${chemin}`);
  const type = TYPES_IMAGES[path.extname(absolu).toLowerCase()];
  if (!type) throw new Error(`pas une image : ${chemin}`);
  if (absolu.toLowerCase().startsWith(dossierPieces(dossierId).toLowerCase())) {
    const fichier = path.basename(absolu);
    return { id: fichier, nom: fichier, type, legende: null, origine: 'agent', chemin: absolu, url: `/api/pieces/${dossierId}/${encodeURIComponent(fichier)}` };
  }
  return enregistrer(dossierId, fs.readFileSync(absolu), type, path.basename(absolu), null, 'agent');
}

// Version publique (sans chemin disque) pour le site.
export const piecePublique = ({ chemin, ...p }) => p;

// Blocs image pour un message SDK (le DG voit les images jointes).
export function blocsImages(pieces = []) {
  return pieces.map((p) => ({ type: 'image', source: { type: 'base64', media_type: p.type, data: fs.readFileSync(p.chemin).toString('base64') } }));
}

export function cheminPiece(dossierId, fichier) {
  const dir = dossierPieces(dossierId);
  const chemin = path.resolve(dir, fichier);
  if (!chemin.startsWith(dir + path.sep)) return null;
  return fs.existsSync(chemin) ? chemin : null;
}
