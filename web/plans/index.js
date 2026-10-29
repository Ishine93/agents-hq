// Décors au choix (1.0.10) : pour chaque famille d'étage, des plans différents (disposition, meubles, sols, murs),
// choisis dans Réglages › Étages. Chaque décor garde toutes les places dont les scènes ont besoin (voir
// tests/plans-etages.js) : seul l'aspect et les chemins changent.
// Module pur : lu par le site (web/carte.js), par le serveur (décors permis) et par les tests.
import { SKINS as bureau } from './bureau.js';
import { SKINS as direction } from './direction.js';
import { SKINS as pause } from './pause.js';
import { SKINS as repos } from './repos.js';
import { SKINS as hall } from './hall.js';
import { SKINS as serveur } from './serveur.js';
import { SKINS as isoloir } from './isoloir.js';

/**
 * Un décor : { id, famille, nom, nomEn, description, descriptionEn, construire(theme) → carte }.
 * `construire` reçoit le thème de l'étage (bureau d'études, atelier 3D… pour un étage de projet, sinon le type).
 */
export const FAMILLES = { bureau, direction, pause, repos, hall, serveur, isoloir };

// Décors d'avant la 1.0.10 pour un étage de projet : même plan, autre thème.
export const THEMES_BUREAU = ['etudes', 'atelier3d', 'unreal', 'roblox', 'bac'];

// Familles sans plan d'origine à garder : leur décor quand aucun n'est choisi (repli sur le plan d'origine s'il manque).
export const DEFAUTS = { hall: 'hall-grand', isoloir: 'isoloir-studio' };

const TYPES_FAMILLE = { direction: 'direction', pause: 'pause', repos: 'repos', hall: 'hall', serveur: 'serveur', isoloir: 'isoloir' };

/** Famille d'un type d'étage : tout étage de projet est un « bureau ». */
export const familleDe = (type) => TYPES_FAMILLE[type] || 'bureau';

const PAR_ID = new Map();
for (const [famille, liste] of Object.entries(FAMILLES)) {
  for (const sk of liste) {
    if (sk.famille !== famille) throw new Error(`décor ${sk.id} : famille ${sk.famille} au lieu de ${famille}`);
    if (PAR_ID.has(sk.id)) throw new Error(`décor ${sk.id} en double`);
    PAR_ID.set(sk.id, sk);
  }
}

/** Décor d'après son identifiant (null s'il n'existe pas). */
export const skin = (id) => (id && PAR_ID.get(id)) || null;

/** Décors au choix d'un type d'étage (sans les thèmes d'origine). */
export const skinsDe = (type) => FAMILLES[familleDe(type)] || [];

/** Identifiants permis pour le champ `decor` d'un étage de ce type (Réglages › Étages). */
export function decorsPermis(type) {
  const famille = familleDe(type);
  return [...(famille === 'bureau' ? THEMES_BUREAU : []), ...(FAMILLES[famille] || []).map((sk) => sk.id)];
}
