// Décors au choix de la famille « pause » (1.0.10). Contrat : web/plans/index.js et tests/plans-etages.js.
// Module pur (aucun accès au DOM) : n'importe que ./outils.js.
// Les agents qui attendent leur tour y jouent : places de jeu (`spots.jeu`) avec une activité, une table commune
// (`table` + `centre`, et le meuble `jeu` du même nom) pour les jeux à plusieurs. Dessin : web/meubles/pause.js.
import { W, H, HW, s, grilles, spotsNeutres, zonesDe } from './outils.js';

// Une place de jeu : case, orientation, activité et détails (assis, table, centre, pose…). Les phrases viennent de
// l'activité (SORTE_JEU et ARRIVEE_JEU dans web/scenes.js) ; `phrases` et `arrivee` les remplacent pour une place
// (un « café » qui sert des cocktails, une « arcade » à peluches). Listes : web/phrases.js.
const J = (x, y, dir, activite, extra = {}) => s(x, y, dir, { activite, ...extra });

// ---------- Plage : sable, mer, paillote, volley ----------
// La mer borde le côté droit (x ≥ 14), le rivage la longe. Paillote (bar) contre le mur du fond, terrain de volley
// au milieu, raquettes et transats près de l'eau, château de sable et pétanque devant.
// Lignes du terrain de volley (x 4 à 8, y 4 à 9) : un motif de sol par bord (web/meubles/pause.js, SOLS).
function bordTerrain(x, y) {
  let b = '';
  if (y === 4) b += 'n';
  if (y === 9) b += 's';
  if (x === 4) b += 'w';
  if (x === 8) b += 'e';
  return b;
}
function zonePlage(x, y) {
  if (x >= 15) return 'large';
  if (x === 14) return 'mer';
  if (x === 13) return 'rivage';
  if (x <= 2 && y <= 4) return 'ponton';
  if (x >= 3 && x <= 9 && y <= 2) return 'terrasse';
  if (x >= 4 && x <= 8 && y >= 4 && y <= 9) return 'terrain' + (bordTerrain(x, y) ? '-' + bordTerrain(x, y) : '');
  return 'sable';
}

function cartePlage() {
  const zones = zonesDe(zonePlage);
  const meubles = [];
  const m = (type, x, y, opts = {}) => meubles.push({ type, x, y, ...opts });
  // hall d'ascenseur (ponton) et fond
  m('palmier', 0, 0, { variante: 0, petit: true });
  m('palmier', 3, 0, { variante: 1 });
  // paillote : étagère du barman contre le mur, comptoir sous le toit de paille, tabourets
  for (let x = 4; x <= 8; x++) {
    const part = x === 4 ? 'g' : x === 8 ? 'd' : 'm';
    m('bar_fond', x, 0, { part, variante: x });
    m('comptoir', x, 1, { part, variante: x });
    m('tabouret', x, 2, { dir: 'ne', siege: true });
  }
  m('douche', 9, 0);
  m('surfs', 10, 0, { variante: 0 });
  m('surfs', 11, 0, { variante: 1 });
  m('palmier', 12, 0, { variante: 2 });
  m('mns', 13, 0);
  // terrain de volley : le filet coupe le terrain en deux (poteaux aux deux bouts)
  for (let x = 4; x <= 8; x++) m('filet', x, 6, { part: x === 4 ? 'g' : x === 8 ? 'd' : 'm', ...(x === 6 ? { jeu: 'volley' } : {}) });
  // raquettes de plage : la serviette entre les deux joueurs
  m('serviette', 10, 4, { passage: true, jeu: 'raquettes', variante: 0 });
  // transats sous parasol, tournés vers la mer, et glacières entre eux
  for (const y of [2, 5, 8]) {
    m('transat', 12, y, { dir: 'se', siege: true, parasol: true, variante: y });
    m('transat', 12, y + 1, { dir: 'se', siege: true, variante: y + 1 });
  }
  m('glaciere', 12, 4);
  m('glaciere', 12, 7, { variante: 1 });
  // devant : château de sable, pétanque, glacier contre le mur gauche
  m('chateau_sable', 8, 10, { jeu: 'chateau' });
  m('boules', 4, 10, { passage: true, jeu: 'petanque' });
  m('glacier', 0, 7);
  m('serviette', 1, 9, { passage: true, variante: 2 });
  m('palmier', 12, 11, { variante: 4 });
  m('serviette', 11, 9, { passage: true, variante: 1 });
  m('crabe', 13, 10, { passage: true });
  // dans l'eau (cases bloquées par la mer)
  m('bouee', 14, 3, { passage: true });
  m('canard', 15, 6, { passage: true });
  m('bouee', 14, 9, { passage: true, variante: 1 });

  const cloisons = [];
  const mer = [];
  for (let y = 0; y < H; y++) for (const x of [14, 15]) mer.push({ x, y });
  const { bloque, siege, aretes } = grilles(meubles, cloisons, mer);

  // Places de jeu, dans l'ordre où on les remplit : les duos d'abord (volley, raquettes, château, pétanque).
  const V = (x, y, dir, pose) => J(x, y, dir, 'volley', { table: 'volley', centre: [6.5, 6.5], pose, rythme: pose === 'taper' ? 260 : 600 });
  const R = (x, y, dir) => J(x, y, dir, 'pingpong', { table: 'raquettes', centre: [10.5, 4.5], phrases: 'jeuRaquettes' });
  const Ch = (x, y, dir) => J(x, y, dir, 'chateau', { table: 'chateau', centre: [8.5, 10.5], pose: 'taper', rythme: 380 });
  const Pq = (x, y, dir) => J(x, y, dir, 'petanque', { table: 'petanque', centre: [4.5, 10.5], pose: 'taper', rythme: 900 });
  const Bar = (x) => J(x, 2, 'ne', 'cafe', { assis: true, cafe: true, centre: [x + 0.5, 1.5], phrases: 'jeuBar', arrivee: 'jeuBar' });
  const Tr = (y) => J(12, y, 'se', 'transat', { assis: true, centre: [14.5, y + 0.5], pose: 'lire', rythme: 1200 });
  const Gl = (x, y, dir) => J(x, y, dir, 'cafe', { cafe: true, centre: [0.5, 7.5], phrases: 'jeuGlace', arrivee: 'jeuGlace' });
  const Rg = (x, y, dir, centre) => J(x, y, dir, 'regarde', { centre });
  const jeu = [
    V(5, 4, 'sw', 'lever'), V(7, 8, 'ne', 'taper'), R(10, 2, 'sw'), R(10, 6, 'ne'), Ch(7, 10, 'se'), Ch(9, 10, 'nw'),
    Pq(1, 10, 'se'), Pq(2, 11, 'se'), Bar(4), Tr(2), V(7, 5, 'sw', 'taper'), V(5, 7, 'ne', 'lever'), Bar(5), Tr(5),
    Gl(1, 7, 'nw'), Ch(8, 11, 'ne'), Bar(6), Tr(8), Rg(3, 5, 'se', [6.5, 6.5]), Rg(9, 8, 'nw', [6.5, 6.5]), Bar(7), Tr(3),
    Gl(0, 8, 'ne'), Rg(11, 4, 'nw', [10.5, 4.5]), Bar(8), Tr(6), Rg(3, 9, 'sw', [4.5, 10.5]), Tr(9), Rg(3, 8, 'se', [6.5, 6.5]),
  ];
  const spots = {
    ...spotsNeutres(),
    jeu,
    tourJoy: [s(3, 3, 'se'), s(9, 3, 'sw'), s(11, 7, 'sw'), s(6, 10, 'ne'), s(13, 5, 'nw'), s(2, 8, 'se')],
  };
  return {
    W, H, HW, type: 'pause', look: 'plage', zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices: [],
    salon: null,
    tapis: [],
    bureauDG: [],
    tableau: null,
    ascenseur: { y0: 1, y1: 3 },
    ascenseurMetal: '#c9a46a',
    horloge: { y: 8.6 },
    pancarte: { gx: 0, gy: 10.3 },
  };
}

// ---------- Fête foraine : la nuit, sous les guirlandes ----------
// Stands contre le mur du fond (chamboule-tout, tir, test de force, machines à pinces), pêche aux canards au milieu,
// autos tamponneuses derrière leur barrière (on y entre par le portillon de gauche), barbe à papa et passe-tête
// (une planche peinte, le visage dans le trou) contre le mur gauche.
const PISTE = { x0: 10, y0: 6, x1: 14, y1: 10, porte: { x: 10, y: 8 } };
const dansPiste = (x, y) => x >= PISTE.x0 && x <= PISTE.x1 && y >= PISTE.y0 && y <= PISTE.y1;
function zoneFoire(x, y) {
  if (x <= 2 && y <= 4) return 'hall';
  if (y <= 1 && x >= 3) return 'stand';
  if (dansPiste(x, y)) return 'piste';
  if (x >= 4 && x <= 7 && y >= 5 && y <= 7) return 'sciure';
  return 'pave';
}

function carteFoire() {
  const zones = zonesDe(zoneFoire);
  const meubles = [];
  const m = (type, x, y, opts = {}) => meubles.push({ type, x, y, ...opts });
  m('guichet', 0, 0);
  // stands du fond : le meuble du fond porte les lots (et le jeu), le comptoir l'auvent rayé
  m('stand_fond', 4, 0, { part: 'g', variante: 'chamboule', jeu: 'chamboule' });
  m('stand_fond', 5, 0, { part: 'd', variante: 'chamboule', enseigne: 'chamboule' });
  m('stand_comptoir', 4, 1, { part: 'g', variante: 0 });
  m('stand_comptoir', 5, 1, { part: 'd', variante: 0 });
  m('stand_fond', 7, 0, { part: 'g', variante: 'tir' });
  m('stand_fond', 8, 0, { part: 'm', variante: 'tir', jeu: 'tir' });
  m('stand_fond', 9, 0, { part: 'd', variante: 'tir', enseigne: 'tir' });
  m('stand_comptoir', 7, 1, { part: 'g', variante: 1, fusils: true });
  m('stand_comptoir', 8, 1, { part: 'm', variante: 1, fusils: true });
  m('stand_comptoir', 9, 1, { part: 'd', variante: 1, fusils: true });
  m('force', 12, 0, { jeu: 'force' });
  m('pince', 13, 0, { variante: 0 });
  m('pince', 14, 0, { variante: 1 });
  m('lampion', 15, 0);
  m('lampion', 3, 5);
  m('lampion', 15, 5);
  m('lampion', 8, 11);
  // barbe à papa et passe-tête contre le mur gauche
  m('barbe', 0, 7, { w: 1, h: 2 });
  m('passe_tete', 0, 11, { passage: true });
  // pêche aux canards et bancs pour regarder
  m('bassin', 5, 6, { w: 2, h: 1, jeu: 'peche' });
  m('banc', 3, 8, { dir: 'se', siege: true });
  m('banc', 3, 9, { dir: 'se', siege: true, variante: 1 });
  m('ballons', 4, 11);
  // autos tamponneuses : barrière sur le pourtour (devant : couche « avant »), portillon à gauche
  const aretesPiste = [];
  for (let x = PISTE.x0; x <= PISTE.x1; x++) {
    for (let y = PISTE.y0; y <= PISTE.y1; y++) {
      let b = '';
      if (y === PISTE.y0) b += 'n';
      if (y === PISTE.y1) b += 's';
      if (x === PISTE.x0 && !(x === PISTE.porte.x && y === PISTE.porte.y)) b += 'w';
      if (x === PISTE.x1) b += 'e';
      if (b) m('barriere_piste', x, y, { passage: true, bords: b });
      if (x === PISTE.porte.x && y === PISTE.porte.y) m('portillon', x, y, { passage: true });
      // la barrière bloque le passage (arêtes sans cloison vitrée : on ne voit que la barrière)
      if (b.includes('n')) aretesPiste.push(x + ',' + (y - 1) + ',s');
      if (b.includes('s')) aretesPiste.push(x + ',' + y + ',s');
      if (b.includes('w')) aretesPiste.push(x - 1 + ',' + y + ',e');
      if (b.includes('e')) aretesPiste.push(x + ',' + y + ',e');
    }
  }
  m('auto', 11, 7, { dir: 'se', siege: true, variante: 0, jeu: 'autos' });
  m('auto', 13, 7, { dir: 'sw', siege: true, variante: 1 });
  m('auto', 13, 9, { dir: 'nw', siege: true, variante: 2 });
  m('auto', 11, 9, { dir: 'ne', siege: true, variante: 3 });

  const cloisons = [];
  const { bloque, siege, aretes } = grilles(meubles, cloisons);
  for (const a of aretesPiste) aretes.add(a);

  const Pc = (x, y, dir) => J(x, y, dir, 'peche', { table: 'peche', centre: [6, 6.5], pose: 'repos', accessoire: 'queue', rythme: 900 });
  const Au = (x, y, dir) => J(x, y, dir, 'autos', { table: 'autos', centre: [12.5, 8.5], assis: true, pose: 'taper', rythme: 180 });
  const Cb = (x) => J(x, 2, 'ne', 'chamboule', { table: 'chamboule', centre: [5, 0.5], pose: 'lever', rythme: 500 });
  const Ti = (x) => J(x, 2, 'ne', 'tir', { table: 'tir', centre: [8.5, 0.5], pose: 'taper', rythme: 650 });
  const Fo = (x) => J(x, 1, 'ne', 'force', { table: 'force', centre: [12.5, 0.5], pose: 'lever', rythme: 700 });
  const Pi = (x) => J(x, 1, 'ne', 'arcade', { centre: [x + 0.5, 0.5], phrases: 'jeuPince', arrivee: 'arriveeStand' });
  const Ba = (x, y) => J(x, y, 'nw', 'cafe', { cafe: true, centre: [0.5, y + 0.5], phrases: 'jeuBarbe', arrivee: 'jeuBarbe' });
  const Rg = (x, y, dir, centre, extra = {}) => J(x, y, dir, 'regarde', { centre, ...extra });
  const jeu = [
    Pc(4, 6, 'se'), Pc(7, 6, 'nw'), Au(11, 7, 'se'), Au(13, 9, 'nw'), Cb(4), Cb(5), Ti(7), Ti(9), Fo(12), Fo(11),
    J(0, 11, 'se', 'photo', { table: 'photo', centre: [1.5, 11.5], pose: 'repos' }),
    J(2, 11, 'nw', 'photo', { table: 'photo', centre: [0.5, 11.5], pose: 'tel', rythme: 1500 }),
    Ba(1, 7), Pi(13), Pc(5, 5, 'sw'), Pc(6, 7, 'ne'), Au(13, 7, 'sw'), Au(11, 9, 'ne'), Ti(8), Pi(14), Ba(1, 8),
    Rg(3, 8, 'se', [6, 6.5], { assis: true }), Rg(9, 7, 'se', [12.5, 8.5]), Rg(6, 3, 'ne', [5, 0.5]),
    Rg(3, 9, 'se', [6, 6.5], { assis: true }), Rg(12, 11, 'ne', [12.5, 8.5]), Rg(10, 3, 'ne', [8.5, 0.5]),
    Rg(15, 9, 'nw', [12.5, 8.5]), Ba(2, 8),
  ];
  const spots = {
    ...spotsNeutres(),
    jeu,
    tourJoy: [s(3, 3, 'se'), s(8, 4, 'sw'), s(8, 9, 'ne'), s(4, 10, 'ne'), s(12, 4, 'sw'), s(15, 7, 'nw')],
  };
  return {
    W, H, HW, type: 'pause', look: 'foire', zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices: [],
    salon: null,
    tapis: [],
    bureauDG: [],
    tableau: null,
    nuit: true,
    lampes: [
      { x: 3.5, y: 5.5, z: 74 }, { x: 15.5, y: 5.5, z: 74 }, { x: 8.5, y: 11.5, z: 74 }, { x: 15.5, y: 0.5, z: 74 },
      { x: 5, y: 1, z: 74 }, { x: 8.5, y: 1, z: 74 }, { x: 12.5, y: 0.2, z: 106 }, { x: 0.6, y: 8, z: 70 },
      { x: 12.5, y: 8.5, z: 70 },
    ],
    ascenseur: { y0: 1, y1: 3 },
    ascenseurMetal: '#c9a227',
    horloge: { y: 9.6 },
    pancarte: { gx: 0, gy: 10.8 },
  };
}

/** @type {Array<{ id: string, famille: string, nom: string, nomEn: string, description: string, descriptionEn: string, construire: (theme: string) => object }>} */
export const SKINS = [
  {
    id: 'pause-plage',
    famille: 'pause',
    nom: 'Plage',
    nomEn: 'Beach',
    description: 'Sable chaud, paillote, transats, volley et mer turquoise',
    descriptionEn: 'Warm sand, tiki bar, deck chairs, volleyball and a turquoise sea',
    construire: () => cartePlage(),
  },
  {
    id: 'pause-foire',
    famille: 'pause',
    nom: 'Fête foraine',
    nomEn: 'Funfair',
    description: 'Guirlandes la nuit, autos tamponneuses, pêche aux canards et stand de tir',
    descriptionEn: 'String lights at night, bumper cars, hook-a-duck and a shooting gallery',
    construire: () => carteFoire(),
  },
];
