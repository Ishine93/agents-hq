// Outils communs des plans d'étage : web/carte.js (plans d'origine) et les décors au choix de web/plans/ (1.0.10).
// Module pur (aucun accès au DOM) : les tests le lisent avec Node, et le serveur y vérifie les décors permis.
// Grille W×H. x croît vers le bas-droite de l'écran, y vers le bas-gauche. Murs du fond : y = 0 (mur droit) et x = 0
// (mur gauche). L'ascenseur est toujours dans le mur gauche, cases (0, 1) à (0, 3).

export const W = 16;
export const H = 12;
export const HW = 84; // hauteur des murs (px)

/** Une place : case (x, y), orientation de l'avatar ('ne' | 'nw' | 'se' | 'sw') et détails (assis, activite…). */
export const s = (x, y, dir, extra = {}) => ({ x, y, dir, ...extra });

export const DECOR_THEME = {
  roblox: ['bloc_roblox', 'bloc_roblox2', 'plante', 'plante'],
  unreal: ['ecran_rendu', 'ecran_rendu', 'plante', 'plante'],
  atelier3d: ['imprimante3d', 'etabli', 'etabli', 'plante'],
  etudes: ['liege', 'liege', 'etagere_basse', 'plante'],
  serveur: ['baie', 'baie', 'baie', 'baie'],
  direction: ['globe', 'trophee', 'plante', 'plante'],
  hall: ['plante', 'plante', 'plante', 'fontaine'],
  bac: ['cone', 'barriere', 'cone', 'cone'],
};

// Projets sans décor dédié : ils empruntent celui d'un étage proche.
export const ALIAS_THEME = { unity: 'unreal', godot: 'roblox', comfyui: 'unreal', web: 'atelier3d', python: 'etudes', projet: 'etudes' };

/** Thème d'un étage de projet (ou d'un étage commun qui a le sien) : le type, son alias, sinon le bureau d'études. */
export const themeProjet = (type) => (DECOR_THEME[type] ? type : DECOR_THEME[ALIAS_THEME[type]] ? ALIAS_THEME[type] : 'etudes');

// Sièges : on s'y assoit (collision « siège »), on n'y passe pas. Un meuble d'un décor au choix qui sert de siège
// porte `siege: true`.
export const SIEGES = new Set(['chaise', 'fauteuil_dg', 'canape', 'fauteuil', 'canape_tv', 'pouf']);

/** Zones de la grille (une par case) d'après `zoneDe(x, y)` : elles choisissent le sol de chaque case. */
export function zonesDe(zoneDe) {
  const zones = [];
  for (let y = 0; y < H; y++) {
    zones.push([]);
    for (let x = 0; x < W; x++) zones[y].push(zoneDe(x, y));
  }
  return zones;
}

// Grilles de collision (meubles de plusieurs cases : w × h) et arêtes des cloisons.
// Un meuble `passage: true` se dessine sans bloquer, mais par-dessus les avatars de sa case ; un meuble plat
// (tapis, flaque, marquage) prend `sol: true` : il est peint avec le sol, sous les avatars, et ne bloque pas non plus.
export function grilles(meubles, cloisons, autresBloques = []) {
  const bloque = new Uint8Array(W * H);
  const siege = new Uint8Array(W * H);
  for (const it of meubles) {
    if (it.passage || it.sol) continue; // meuble de passage, ou plat au sol (tapis, marquage) : on marche dessus
    for (let dy = 0; dy < (it.h || 1); dy++) {
      for (let dx = 0; dx < (it.w || 1); dx++) {
        const x = it.x + dx;
        const y = it.y + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (SIEGES.has(it.type) || it.siege) siege[y * W + x] = 1;
        bloque[y * W + x] = 1;
      }
    }
  }
  for (const e of autresBloques) bloque[e.y * W + e.x] = 1;
  const aretes = new Set();
  for (const cl of cloisons) aretes.add(cl.x + ',' + cl.y + ',' + cl.cote);
  return { bloque, siege, aretes };
}

// Points obligatoires des scènes, sans usage sur les étages partagés (pause, repos, hall) : des cases neutres
// pour que rien ne casse si un cas imprévu y conduit quand même.
export function spotsNeutres() {
  return {
    ascenseur: { apparition: { gx: 0.18, gy: 2.0 }, tuile: { x: 0, y: 2 } },
    arrivee: [s(1, 2, 'se'), s(2, 3, 'se'), s(1, 3, 'se'), s(2, 2, 'se'), s(1, 1, 'se'), s(0, 3, 'se')],
    equipe: [],
    fileDG: [s(2, 4, 'ne'), s(2, 5, 'ne')],
    visiteurDG: [s(2, 1, 'se'), s(2, 2, 'se')],
    dg: { siege: s(1, 1, 'se'), tableau: s(2, 1, 'se'), tete: s(1, 2, 'se') },
    postes: [],
    machine: { cle: 'machine', chaise: s(1, 3, 'se'), bureau: { x: 0, y: 3 }, insp: s(2, 3, 'se'), file: [s(2, 3, 'se')] },
    pause: [],
    reunion: { nord: [], sud: [], est: [], debout: [], tete: s(1, 2, 'se'), table: { x0: 1, y0: 1, x1: 1, y1: 1 } },
  };
}
