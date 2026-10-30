// Décors au choix de la famille « hall » (1.0.10). Contrat : web/plans/index.js et tests/plans-etages.js.
// Module pur (aucun accès au DOM) : n'importe que ./outils.js.
//
// Le rez-de-chaussée de l'immeuble : aucune tâche n'y a lieu. Des halls d'immeuble crédibles : porte d'entrée sur
// le mur du fond, portiques d'accès devant l'ascenseur, comptoir d'accueil avec une ou deux personnes derrière
// (spots.accueil), sièges d'attente, plantes… :
// - hall-grand : le grand hall de bureaux (marbre, rosace au sol, colonnes, porte tambour, grand comptoir à deux) ;
// - hall-verre : une tour de verre minimaliste (façade vitrée, mur végétal, bassin, petit comptoir blanc) ;
// - hall-dino : un hall façon muséum, avec un squelette de tyrannosaure au milieu.
import { W, H, HW, s, grilles, zonesDe, spotsNeutres } from './outils.js';

// Chantier d'un plan : meubles, cloisons vitrées, et arêtes bloquantes dessinées par un meuble (caissons des
// portiques, cordons) : ce meuble « passage » se pose sur le bord nord ('n', entre y-1 et y) ou ouest ('o', entre
// x-1 et x) de sa case, et l'arête correspondante bloque le passage comme une cloison.
function chantier() {
  const meubles = [];
  const cloisons = [];
  const bords = [];
  const m = (type, x, y, o = {}) => meubles.push({ type, x, y, ...o });
  const c = (x, y, cote) => cloisons.push({ x, y, cote });
  const bord = (type, x, y, b, o = {}) => {
    m(type, x, y, { bord: b, passage: true, ...o });
    bords.push(b === 'n' ? x + ',' + (y - 1) + ',s' : x - 1 + ',' + y + ',e');
  };
  const fin = () => {
    const g = grilles(meubles, cloisons);
    for (const a of bords) g.aretes.add(a);
    return g;
  };
  return { meubles, cloisons, m, c, bord, fin };
}

// Le reste de la carte d'un hall : pas de poste, pas de salon, pas de tableau blanc.
function carteHall(zones, meubles, cloisons, g, spots, extra) {
  return {
    W, H, HW, type: 'hall', zones, meubles, cloisons, bloque: g.bloque, siege: g.siege, aretes: g.aretes, spots,
    emplacementsServices: [], salon: null, bureauDG: [], tableau: null, ascenseur: { y0: 1, y1: 3 }, ...extra,
  };
}

// Rosace au sol de 3 × 3 cases, de (6, 6) à (8, 8) : une seule zone, le motif 'hall_rosace' dessine son morceau
// d'après la case (web/meubles/hall.js, motif « parPosition »).
const dansRosace = (x, y) => x >= 6 && x <= 8 && y >= 6 && y <= 8;

// ---------- Grand hall ----------
// Le hall d'un immeuble de bureaux : porte tambour dans la façade vitrée (au fond à droite), grand comptoir d'accueil
// en marbre devant le mur au nom du QG, entre deux colonnes ; quatre portiques d'accès devant l'ascenseur ; rosace
// de marbre au milieu ; banquettes d'attente, boîtes aux lettres au mur, plantes.
function zoneGrand(x, y) {
  if (dansRosace(x, y)) return 'rosace';
  if (x <= 2 && y <= 5) return 'lobby';
  if (x >= 6 && x <= 11 && y <= 2) return 'accueil';
  return 'def';
}

function carteGrand() {
  const { meubles, cloisons, m, c, bord, fin } = chantier();
  const zones = zonesDe(zoneGrand);

  // --- tapis (peints avec le sol, sous les avatars) : paillasson de la porte tambour, tapis persan du salon ---
  m('hall_tapis', 12, 0, { w: 4, h: 3, sol: true, variante: 'paillasson', bornes: [0.75, 0.85, 3.25, 2.15] });
  m('hall_tapis', 10, 7, { w: 4, h: 5, sol: true, variante: 'persan', bornes: [0.6, 0.6, 3.4, 4.4] });

  // --- portiques d'accès : quatre couloirs (3, 1) à (3, 4), caissons entre eux ---
  for (let y = 1; y <= 5; y++) bord('hall_portique', 3, y, 'n', { fin: y === 1 || y === 5 });

  // --- côté ascenseurs ---
  m('plante', 0, 0, { variante: 7 });
  m('hall_banquette', 0, 5, { dir: 'se', siege: true });
  m('plante', 3, 0, { variante: 3 });

  // --- accueil : grand comptoir, deux hôtesses ---
  m('hall_colonne', 6, 0);
  m('hall_colonne', 11, 0);
  for (let x = 7; x <= 10; x++) m('hall_credence', x, 0, { part: x === 7 ? 'g' : x === 10 ? 'd' : 'm', variante: [0, 1, 3, 2][x - 7] });
  for (let x = 7; x <= 10; x++) m('hall_comptoir', x, 3, { part: x === 7 ? 'g' : x === 10 ? 'd' : 'm', variante: x });
  m('chaise', 8, 2, { dir: 'sw' });
  m('chaise', 9, 2, { dir: 'sw' });
  m('hall_presentoir', 11, 3);

  // --- entrée : porte tambour dans la façade ---
  m('hall_tambour', 13, 0, { w: 2, h: 1 });
  m('plante', 12, 0, { variante: 2 });
  m('plante', 15, 0, { variante: 4 });

  // --- attente : banquettes, table basse, plantes ---
  m('hall_banquette', 11, 8, { w: 2, h: 1, dir: 'sw', siege: true });
  m('hall_banquette', 11, 10, { w: 2, h: 1, dir: 'ne', siege: true });
  m('hall_table_basse', 11, 9, { w: 2, h: 1 });
  m('plante', 13, 8, { variante: 1 });
  m('plante', 13, 10, { variante: 6, petite: true });
  m('fauteuil', 1, 8, { dir: 'se' });
  m('fauteuil', 1, 10, { dir: 'se' });
  m('table_basse', 1, 9, {});
  m('hall_totem', 5, 4);
  m('plante', 15, 11, { variante: 5 });
  m('plante', 4, 11, { variante: 3 });
  m('hall_presse', 15, 6);

  // --- vitres de sécurité : le côté ascenseurs ne s'ouvre que par les portiques ---
  c(2, 0, 'e');
  c(2, 5, 'e');
  for (const x of [0, 1, 2]) c(x, 5, 's');

  const g = fin();
  const spots = {
    ...spotsNeutres(),
    arrivee: [s(1, 2, 'se'), s(2, 3, 'se'), s(1, 3, 'se'), s(2, 2, 'se'), s(1, 1, 'se'), s(0, 3, 'se'), s(1, 4, 'se'), s(2, 4, 'se'),
      s(1, 0, 'se'), s(2, 1, 'se')],
    tourJoy: [s(5, 3, 'sw'), s(9, 5, 'ne'), s(13, 3, 'ne'), s(8, 10, 'ne'), s(3, 8, 'se'), s(14, 6, 'sw')],
    // les deux hôtesses, assises derrière le comptoir, face à l'entrée et au hall
    accueil: [s(8, 2, 'sw', { assis: true }), s(9, 2, 'sw', { assis: true })],
  };
  return carteHall(zones, meubles, cloisons, g, spots, {
    look: 'hall-grand',
    ascenseurMetal: '#c9a227',
    horloge: { y: 9.3 },
    pancarte: { gx: 0, gy: 9.8 },
  });
}

// ---------- Tour de verre ----------
// Minimaliste : façade entièrement vitrée sur la ville, grand écran au nom du QG, petit comptoir blanc (une
// personne), portiques en verre devant l'ascenseur, bassin d'eau, sculpture rouge, mur végétal, fauteuils design.
function zoneVerre(x, y) {
  if (x <= 3 && y <= 4) return 'lobby';
  if (x >= 6 && x <= 11 && y <= 2) return 'accueil';
  return 'def';
}

function carteVerre() {
  const { meubles, cloisons, m, c, bord, fin } = chantier();
  const zones = zonesDe(zoneVerre);

  // --- tapis : paillasson des portes coulissantes, tapis gris du salon ---
  m('hall_tapis', 12, 0, { w: 4, h: 2, sol: true, variante: 'paillasson', bornes: [0.8, 0.85, 3.2, 1.9] });
  m('hall_tapis', 4, 7, { w: 5, h: 4, sol: true, variante: 'gris', bornes: [0.6, 0.6, 4.4, 3.4] });

  // --- portiques en verre : trois couloirs (1, 5) à (3, 5) ---
  for (let x = 1; x <= 4; x++) bord('hall_portique_verre', x, 5, 'o', { fin: x === 1 || x === 4 });
  m('hall_arbre', 0, 5, { variante: 3 });
  c(0, 4, 's');
  for (let y = 0; y <= 4; y++) c(3, y, 'e');

  // --- côté ascenseurs ---
  m('hall_banc_verre', 0, 0);

  // --- accueil : comptoir monolithe, une personne ---
  m('hall_monolithe', 8, 3, { part: 'g' });
  m('hall_monolithe', 9, 3, { part: 'd' });
  m('hall_chaise_design', 9, 2, { dir: 'sw', siege: true });
  m('hall_arbre', 11, 0, { variante: 1 });
  m('hall_arbre', 5, 0, { variante: 1 });

  // --- bassin et sculpture ---
  for (let x = 10; x <= 13; x++) m('hall_bassin', x, 6, { part: x === 10 ? 'g' : x === 13 ? 'd' : 'm' });
  m('hall_sculpture', 12, 9);

  // --- salon design ---
  m('hall_fauteuil_design', 5, 9, { dir: 'se', siege: true });
  m('hall_fauteuil_design', 7, 9, { dir: 'nw', siege: true });
  m('hall_table_verre', 6, 9);
  m('hall_fauteuil_design', 6, 8, { dir: 'sw', siege: true });

  // --- plantes ---
  m('hall_arbre', 15, 11, { variante: 2 });
  m('hall_arbre', 4, 11, { variante: 0 });
  m('hall_arbre', 15, 2, { variante: 2 });

  const g = fin();
  const spots = {
    ...spotsNeutres(),
    arrivee: [s(1, 2, 'se'), s(2, 3, 'se'), s(1, 3, 'se'), s(2, 2, 'se'), s(1, 1, 'se'), s(0, 3, 'se'), s(1, 4, 'se'), s(2, 4, 'se'),
      s(3, 2, 'se'), s(3, 3, 'se')],
    tourJoy: [s(5, 6, 'se'), s(9, 5, 'ne'), s(13, 3, 'ne'), s(9, 10, 'ne'), s(2, 8, 'se'), s(14, 8, 'nw')],
    accueil: [s(9, 2, 'sw', { assis: true })],
  };
  return carteHall(zones, meubles, cloisons, g, spots, {
    look: 'hall-verre',
    ascenseurMetal: '#d9dde4',
    horloge: { y: 6.6 },
    pancarte: { gx: 0, gy: 9.8 },
  });
}

// ---------- Hall au dinosaure ----------
// Le QG a racheté un muséum : squelette de tyrannosaure sur son socle au milieu du hall, empreintes au sol depuis la
// porte, vitrine de fossiles, fougères ; l'accueil est une petite billetterie en bois (une personne) ; les
// tourniquets en laiton et les cordons de velours ferment le côté ascenseurs.
const TRACES = new Set(['14,2', '13,4', '14,5', '12,6', '11,8', '10,9']);
function zoneDino(x, y) {
  if (x <= 2 && y <= 5) return 'lobby';
  if (x >= 9 && x <= 13 && y <= 2) return 'accueil';
  if (TRACES.has(x + ',' + y)) return 'trace';
  return 'def';
}

function carteDino() {
  const { meubles, cloisons, m, c, bord, fin } = chantier();
  const zones = zonesDe(zoneDino);

  // --- tapis rouge devant les portes du muséum ---
  m('hall_tapis', 12, 0, { w: 4, h: 2, sol: true, variante: 'musee', bornes: [0.8, 0.85, 3.2, 1.9] });

  // --- cordons de velours et tourniquets en laiton : couloirs (3, 2) et (3, 3) ---
  for (const y of [0, 1, 4, 5]) bord('hall_cordon', 3, y, 'o');
  for (const x of [0, 1, 2]) bord('hall_cordon', x, 6, 'n');
  m('hall_tourniquet', 3, 2, { passage: true });
  m('hall_tourniquet', 3, 3, { passage: true });

  // --- côté ascenseurs ---
  m('hall_fougere', 0, 0, { variante: 0 });
  m('hall_fougere', 0, 5, { variante: 1 });

  // --- billetterie (accueil) ---
  m('hall_comptoir', 10, 3, { part: 'g', variante: 'bois' });
  m('hall_comptoir', 11, 3, { part: 'd', variante: 'bois' });
  m('chaise', 11, 2, { dir: 'sw' });
  m('hall_presentoir', 9, 3, { variante: 'musee' });

  // --- le tyrannosaure ---
  m('hall_trex', 5, 6, { w: 4, h: 2 });

  // --- vitrines, fougères, bancs ---
  m('hall_vitrine', 14, 8, { variante: 'fossiles' });
  m('hall_vitrine', 14, 10, { variante: 'meteorite' });
  m('hall_palmier', 15, 0);
  m('hall_fougere', 12, 0, { variante: 2 });
  m('hall_fougere', 15, 5, { variante: 1 });
  m('hall_palmier', 4, 11);
  m('hall_fougere', 0, 11, { variante: 0 });
  m('hall_banc', 5, 10, { w: 2, h: 1, siege: true });
  m('hall_banc', 1, 8, { siege: true, axe: 'y' });
  m('hall_oeuf', 9, 10);

  const g = fin();
  const spots = {
    ...spotsNeutres(),
    arrivee: [s(1, 2, 'se'), s(2, 3, 'se'), s(1, 3, 'se'), s(2, 2, 'se'), s(1, 1, 'se'), s(0, 3, 'se'), s(1, 4, 'se'), s(2, 4, 'se'),
      s(1, 0, 'se'), s(2, 1, 'se')],
    tourJoy: [s(4, 4, 'se'), s(10, 5, 'ne'), s(13, 3, 'ne'), s(8, 9, 'ne'), s(3, 9, 'se'), s(12, 8, 'nw')],
    accueil: [s(11, 2, 'sw', { assis: true })],
  };
  return carteHall(zones, meubles, cloisons, g, spots, {
    look: 'hall-dino',
    ascenseurMetal: '#b08a3a',
    horloge: { y: 6.6 },
    pancarte: { gx: 0, gy: 9.8 },
  });
}

/** @type {Array<{ id: string, famille: string, nom: string, nomEn: string, description: string, descriptionEn: string, construire: (theme: string) => object }>} */
export const SKINS = [
  {
    id: 'hall-grand', famille: 'hall', nom: 'Grand hall', nomEn: 'Grand lobby',
    description: 'Marbre, colonnes, porte tambour et grand comptoir d’accueil à deux',
    descriptionEn: 'Marble, columns, a revolving door and a big front desk for two',
    construire: carteGrand,
  },
  {
    id: 'hall-verre', famille: 'hall', nom: 'Tour de verre', nomEn: 'Glass tower',
    description: 'Façade vitrée, mur végétal, bassin et petit comptoir blanc',
    descriptionEn: 'Glass front, green wall, water basin and a small white desk',
    construire: carteVerre,
  },
  {
    id: 'hall-dino', famille: 'hall', nom: 'Hall au dinosaure', nomEn: 'Dinosaur lobby',
    description: 'Un squelette de tyrannosaure au milieu du hall, comme au muséum',
    descriptionEn: 'A T. rex skeleton in the middle of the lobby, like in a museum',
    construire: carteDino,
  },
];
