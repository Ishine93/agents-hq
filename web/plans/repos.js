// Décors au choix de la famille « repos » (1.0.10). Contrat : web/plans/index.js et tests/plans-etages.js.
// Module pur (aucun accès au DOM) : n'importe que ./outils.js.
// Les agents en réserve y dorment : chaque lit donne une place `couche: { ox, oy, axe, z, niveau }` (voir carte.js et,
// dans web/decor.js, spriteCouverture et oreiller). La tête se pose en (ox + 0,3 ; oy + 0,5) pour un lit selon x,
// en (ox + 0,5 ; oy + 0,3) pour un lit selon y, à z + 3 pixels ; la couverture couvre le lit de 0,4 à 1,9 case, de z à
// z + 6. Les hauteurs `z` ci-dessous sont celles des matelas dessinés dans web/meubles/repos.js (même objet Z).
import { W, H, HW, s, grilles, spotsNeutres, zonesDe } from './outils.js';

// Hauteur du dessus de chaque matelas (pixels) : à garder égale au dessin (web/meubles/repos.js).
const Z = { capsuleBas: 4, capsuleHaut: 45, tente: 3, sac: 2, hamac: 22 };

// Place d'un dormeur : la case du pied du lit (on y entre), la tête sur l'oreiller.
function place(lit, niveau, z) {
  const pied = lit.axe === 'y' ? { x: lit.x, y: lit.y + 1 } : { x: lit.x + 1, y: lit.y };
  const extra = { couche: { ox: lit.x, oy: lit.y, axe: lit.axe, z, niveau: niveau || 0 } };
  if (niveau) extra.niveau = niveau;
  return s(pied.x, pied.y, lit.axe === 'y' ? 'sw' : 'se', extra);
}

// ---------- Hôtel capsules : trois rangées de capsules sur deux niveaux ----------
// Une capsule fait deux cases selon x et s'ouvre sur son long côté, face à nous (+y) : la tête à gauche, le pied et
// l'échelle à droite. Elle est dessinée en deux moitiés d'une case (a : la tête, b : le pied) pour que le tri par
// profondeur reste juste. La première rangée est contre le mur du fond, les deux autres sont en îlots, chacune avec
// son couloir de tatamis devant elle. Casiers à chaussures et estampe à gauche, petit jardin sec devant à droite.
const RANGEES = [
  { y: 0, x: [3, 5, 7, 9, 11, 13] },
  { y: 4, x: [4, 6, 8, 10, 12] },
  { y: 8, x: [5, 7, 9, 11] },
];
function zoneCapsules(x, y) {
  if (x <= 2 && y <= 4) return 'hall';
  if (RANGEES.some((r) => r.y === y && r.x.some((cx) => x >= cx && x <= cx + 1))) return 'sous';
  if (x >= 13 && y >= 9) return 'jardin';
  return 'tatami';
}

function carteCapsules() {
  const zones = zonesDe(zoneCapsules);
  const meubles = [];
  const m = (type, x, y, opts = {}) => meubles.push({ type, x, y, ...opts });
  // hall : bambou (mince, il laisse voir l'enseigne du QG) et bonsaï
  m('bambou_pot', 0, 0);
  m('bonsai_jp', 2, 0);
  // capsules : deux moitiés d'une case ; `lit` garde la capsule entière pour la place du dormeur
  const rangs = RANGEES.map((r, i) => r.x.map((x, k) => {
    const variante = i * 6 + k;
    m('capsule', x, r.y, { part: 'a', variante });
    m('capsule', x + 1, r.y, { part: 'b', variante });
    return { x, y: r.y, axe: 'x' };
  }));
  m('distributeur_jp', 15, 0);
  // côté gauche : casiers à chaussures, banc, lanterne, bonsaï
  m('casiers_geta', 0, 5);
  m('casiers_geta', 0, 6, { variante: 1 });
  m('casiers_geta', 0, 7, { variante: 2 });
  m('banc_tatami', 2, 6);
  m('andon', 0, 9);
  m('bonsai_jp', 0, 11, { variante: 1 });
  // bouts des îlots
  m('andon', 14, 4);
  m('distributeur_jp', 3, 8, { variante: 1 });
  m('andon', 4, 8);
  // jardin sec : fontaine en bambou, bambous, rocher
  m('shishi_odoshi', 13, 8);
  m('bambou_pot', 14, 8, { variante: 2 });
  m('rocher_zen', 13, 10);
  m('toro', 15, 11);
  // pantoufles rangées devant quelques capsules
  for (const [x, y] of [[4, 1], [12, 1], [9, 5], [10, 9]]) m('pantoufles', x, y, { passage: true, variante: x + y });

  const cloisons = [];
  const { bloque, siege, aretes } = grilles(meubles, cloisons);
  // ordre de remplissage : en bas d'abord (devant, puis milieu, puis fond), puis en haut
  const lits = [];
  for (const niveau of [1, 2]) {
    for (const r of [rangs[2], rangs[1], rangs[0]]) {
      for (const l of r) lits.push(place(l, niveau, niveau === 1 ? Z.capsuleBas : Z.capsuleHaut));
    }
  }
  const spots = {
    ...spotsNeutres(),
    lits,
    tourJoy: [s(3, 2, 'se'), s(9, 2, 'sw'), s(15, 5, 'sw'), s(8, 10, 'ne'), s(2, 10, 'ne'), s(12, 11, 'nw')],
  };
  return {
    W, H, HW, type: 'repos', look: 'capsules', zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices: [],
    salon: null,
    tapis: [],
    bureauDG: [],
    tableau: null,
    nuit: true,
    // veilleuses des capsules, lanternes en papier, distributeurs
    lampes: [
      { x: 5.2, y: 8.5, z: 30 }, { x: 9.2, y: 8.5, z: 72 }, { x: 6.2, y: 4.5, z: 72 }, { x: 10.2, y: 4.5, z: 30 },
      { x: 3.2, y: 0.5, z: 30 }, { x: 11.2, y: 0.5, z: 72 }, { x: 4.5, y: 8.5, z: 22 }, { x: 14.5, y: 4.5, z: 22 },
      { x: 0.5, y: 9.5, z: 22 }, { x: 15.5, y: 0.8, z: 40 }, { x: 3.5, y: 8.8, z: 40 }, { x: 15.5, y: 11.5, z: 28 },
    ],
    ascenseur: { y0: 1, y1: 3 },
    ascenseurMetal: '#b08a5a',
    horloge: { y: 8.6 },
    pancarte: { gx: 0, gy: 10 },
  };
}

// ---------- Camping : tentes, hamacs et sacs de couchage autour du feu ----------
// Sous un ciel étoilé : quatre tentes de deux places contre le mur du fond et deux contre le mur gauche (le pan de
// toile côté porte est roulé pour la nuit : on voit les dormeurs) ; douze sacs de couchage en étoile autour du feu de
// camp ; quatre hamacs tendus entre les sapins, devant à droite.
const FEU = { x: 7, y: 6 };
function zoneCamping(x, y) {
  if (x <= 2 && y <= 4) return 'chemin';
  if (Math.abs(x - FEU.x) <= 1 && Math.abs(y - FEU.y) <= 1) return 'terre';
  if (Math.abs(x - FEU.x) + Math.abs(y - FEU.y) === 2) return 'terre-bord';
  return 'herbe';
}

function carteCamping() {
  const zones = zonesDe(zoneCamping);
  const meubles = [];
  const m = (type, x, y, opts = {}) => meubles.push({ type, x, y, ...opts });
  const lits = { tentes: [], sacs: [], hamacs: [] };
  const lit = (liste, type, x, y, axe, opts = {}) => {
    const l = { type, x, y, w: axe === 'x' ? 2 : 1, h: axe === 'x' ? 1 : 2, axe, ...opts };
    meubles.push(l);
    liste.push(l);
    return l;
  };
  m('sapin_camp', 0, 0, { variante: 0, petit: true });
  m('panneau_camping', 1, 0, { w: 2, h: 1 });
  // tentes de deux places : moitié « a » sous le pan de toile, moitié « b » sous le pan roulé ; contre le mur du fond…
  [3, 6, 9, 12].forEach((x, i) => {
    lit(lits.tentes, 'tente', x, 0, 'y', { part: 'a', variante: i });
    lit(lits.tentes, 'tente', x + 1, 0, 'y', { part: 'b', variante: i });
  });
  m('lanterne_camp', 15, 0);
  // … et contre le mur gauche (porte vers +x)
  [6, 9].forEach((y, i) => {
    lit(lits.tentes, 'tente', 0, y, 'x', { part: 'a', variante: 4 + i });
    lit(lits.tentes, 'tente', 0, y + 1, 'x', { part: 'b', variante: 4 + i });
  });
  // feu de camp, bûches et sacs de couchage en étoile (la tête toujours au bout « bas » du sac)
  m('feu_camp', FEU.x, FEU.y);
  m('buche_camp', 6, 6, { axe: 'y' });
  m('buche_camp', 8, 6, { axe: 'y', guitare: true });
  m('buche_camp', 7, 7, { axe: 'x' });
  for (const x of [6, 7, 8]) lit(lits.sacs, 'sac_couchage', x, 3, 'y', { variante: x });
  for (const y of [5, 6, 7]) lit(lits.sacs, 'sac_couchage', 3, y, 'x', { variante: y + 3 });
  for (const x of [6, 7, 8]) lit(lits.sacs, 'sac_couchage', x, 8, 'y', { variante: x + 6 });
  for (const y of [5, 6, 7]) lit(lits.sacs, 'sac_couchage', 10, y, 'x', { variante: y + 9 });
  // hamacs tendus entre les sapins (devant à droite)
  for (const [x, y] of [[13, 5], [15, 5], [13, 8], [15, 8]]) lit(lits.hamacs, 'hamac', x, y, 'y', { variante: x + y });
  for (const [x, y] of [[13, 4], [15, 4], [13, 7], [15, 7], [13, 10], [15, 10]]) m('sapin_camp', x, y, { variante: x * 3 + y, tronc: true });
  // le reste du camp
  m('glaciere_camp', 11, 2);
  m('pique_nique', 3, 10);
  m('canoe', 4, 11, { w: 2, h: 1 });
  m('lanterne_camp', 2, 11);
  m('sapin_camp', 10, 10, { variante: 7 });
  m('sapin_camp', 0, 11, { variante: 8, petit: true });

  const cloisons = [];
  const { bloque, siege, aretes } = grilles(meubles, cloisons);
  // ordre de remplissage : autour du feu, puis les tentes, puis les hamacs
  const S = (l, z) => place(l, 0, z);
  const spots = {
    ...spotsNeutres(),
    lits: [...lits.sacs.map((l) => S(l, Z.sac)), ...lits.tentes.map((l) => S(l, Z.tente)), ...lits.hamacs.map((l) => S(l, Z.hamac))],
    tourJoy: [s(5, 2, 'se'), s(9, 5, 'sw'), s(12, 8, 'sw'), s(7, 10, 'ne'), s(2, 8, 'se'), s(14, 2, 'sw')],
  };
  return {
    W, H, HW, type: 'repos', look: 'camping', zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices: [],
    salon: null,
    tapis: [],
    bureauDG: [],
    tableau: null,
    nuit: true,
    // le feu (trois halos qui s'additionnent), les lanternes des tentes et des poteaux
    lampes: [
      { x: 7.5, y: 6.5, z: 6 }, { x: 7.5, y: 6.5, z: 20 }, { x: 7.3, y: 6.3, z: 12 },
      { x: 4, y: 1, z: 38 }, { x: 7, y: 1, z: 38 }, { x: 10, y: 1, z: 38 }, { x: 13, y: 1, z: 38 },
      { x: 1, y: 7, z: 38 }, { x: 1, y: 10, z: 38 }, { x: 15.5, y: 0.5, z: 42 }, { x: 2.5, y: 11.5, z: 42 },
    ],
    ascenseur: { y0: 1, y1: 3 },
    ascenseurMetal: '#8a6a48',
    horloge: { y: 8.5 },
    pancarte: { gx: 0, gy: 11 },
  };
}

/** @type {Array<{ id: string, famille: string, nom: string, nomEn: string, description: string, descriptionEn: string, construire: (theme: string) => object }>} */
export const SKINS = [
  {
    id: 'repos-capsules',
    famille: 'repos',
    nom: 'Hôtel capsules',
    nomEn: 'Capsule hotel',
    description: 'Capsules empilées, couloirs de tatamis et lanternes en papier',
    descriptionEn: 'Stacked sleeping pods, tatami corridors and paper lanterns',
    construire: () => carteCapsules(),
  },
  {
    id: 'repos-camping',
    famille: 'repos',
    nom: 'Camping',
    nomEn: 'Campsite',
    description: 'Tentes, hamacs et sacs de couchage autour du feu, sous les étoiles',
    descriptionEn: 'Tents, hammocks and sleeping bags around the campfire, under the stars',
    construire: () => carteCamping(),
  },
];
