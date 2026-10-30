// Décors au choix de la famille « serveur » (1.0.10). Contrat : web/plans/index.js et tests/plans-etages.js.
// Module pur (aucun accès au DOM) : n'importe que ./outils.js.
// Le sous-sol : les serveurs longs lancés par les agents (rojo serve…) y tournent dans des baies
// (`emplacementsServices`, dessinées par la scène). Un agent descend allumer ou éteindre une baie depuis la case
// `devant` (face avant de la baie, côté +y) ; aucune tâche n'y travaille. Places : spotsNeutres() (hall
// d'ascenseur), plus l'arrivée et la tournée de Joy.
import { W, H, HW, s, grilles, zonesDe, spotsNeutres } from './outils.js';

// Carte complète d'après ses meubles, ses cloisons, ses baies et ses places (collisions calculées ici).
function carte({ look, zoneDe, meubles, cloisons, baies, spots, ...reste }) {
  const emplacementsServices = baies.map(([x, y]) => ({ x, y, devant: s(x, y + 1, 'ne') }));
  const { bloque, siege, aretes } = grilles(meubles, cloisons, emplacementsServices);
  return {
    W, H, HW, type: 'serveur', look, zones: zonesDe(zoneDe), meubles, cloisons, bloque, siege, aretes,
    spots: { ...spotsNeutres(), ...spots }, emplacementsServices, salon: null, bureauDG: [], tableau: null,
    ascenseur: { y0: 1, y1: 3 }, ...reste,
  };
}

const ARRIVEE = [s(1, 2, 'se'), s(2, 3, 'se'), s(1, 3, 'se'), s(2, 2, 'se'), s(1, 1, 'se'), s(1, 4, 'se'), s(2, 4, 'se'), s(0, 4, 'se')];

// ---------- Datacenter : allées froides et chaudes ----------
// Quatre rangées de baies entre le hall vitré et la réserve. Les rangées A et C montrent leur face avant sur une
// allée froide de deux dalles perforées (y = 3-4 et 8-9) : on y voit l'agent qui allume une baie. Les rangées B et
// D tournent le dos à l'allée chaude (y = 6) et au couloir de devant. Les baies des services sont dans les rangées A
// et C ; des chemins de câbles courent au-dessus de chaque rangée. Climatiseurs, tableau électrique et onduleurs
// contre le mur du fond, poste de supervision contre le mur gauche, réserve de matériel à droite.
const RANGEES = { 2: 'avant', 5: 'dos', 7: 'avant', 10: 'dos' };
const FROIDES = [3, 4, 8, 9];
const BAIES_DATACENTER = [[5, 2], [7, 2], [9, 2], [11, 2], [4, 7], [6, 7], [8, 7], [10, 7]];

function zoneDatacenter(x, y) {
  if (x <= 2 && y <= 4) return 'lobby';
  if (x >= 4 && x <= 12 && FROIDES.includes(y)) return 'froide';
  if (x >= 4 && x <= 12 && y === 6) return 'chaude';
  if (x >= 14) return 'reserve';
  return 'def';
}

function carteDatacenter() {
  const meubles = [];
  const m = (type, x, y, o = {}) => meubles.push({ type, x, y, ...o });
  const estBaie = (x, y) => BAIES_DATACENTER.some(([bx, by]) => bx === x && by === y);

  // --- mur du fond : climatiseurs, tableau électrique, onduleurs ---
  m('plante', 0, 0, { variante: 3 });
  m('srv_clim', 3, 0);
  m('srv_clim', 4, 0, { variante: 1 });
  m('srv_tableau_elec', 6, 0);
  m('srv_clim', 9, 0);
  m('srv_clim', 10, 0, { variante: 1 });
  m('srv_onduleur', 13, 0);
  m('srv_onduleur', 14, 0, { variante: 1 });
  m('srv_bouteilles', 15, 0);

  // --- rangées de baies (et chemins de câbles au-dessus des baies des services) ---
  for (const [ry, sens] of Object.entries(RANGEES)) {
    const y = Number(ry);
    for (let x = 4; x <= 12; x++) {
      const bout = x === 4 ? 'g' : x === 12 ? 'd' : '';
      if (estBaie(x, y)) m('srv_chemin', x, y, { passage: true, bout });
      else m('srv_baie', x, y, { sens, bout, variante: (x * 5 + y) % 4 });
    }
  }
  // rideaux à lanières aux deux bouts des allées froides (sur l'arête x + 1 de la case)
  for (const y of FROIDES) {
    m('srv_rideau', 3, y, { passage: true });
    m('srv_rideau', 12, y, { passage: true });
  }

  // --- supervision contre le mur gauche ---
  m('srv_noc', 0, 7, { part: 'g' });
  m('srv_noc', 0, 8, { part: 'm' });
  m('srv_noc', 0, 9, { part: 'd' });
  m('chaise', 1, 8, { dir: 'nw' });
  m('srv_extincteur', 0, 6);
  m('srv_dalle_ouverte', 1, 11);

  // --- réserve : chariot, bobine de câble, cartons, bouteilles d'extinction ---
  m('srv_chariot', 14, 3);
  m('srv_bouteilles', 15, 6);
  m('srv_bobine', 14, 8);
  m('srv_cartons', 15, 10);
  m('srv_cartons', 15, 11, { variante: 1 });
  m('srv_cartons', 14, 11, { variante: 1 });

  // --- hall vitré (sas d'entrée) ---
  const cloisons = [];
  for (let y = 0; y <= 3; y++) cloisons.push({ x: 2, y, cote: 'e' });

  return carte({
    look: 'srv_datacenter', zoneDe: zoneDatacenter, meubles, cloisons, baies: BAIES_DATACENTER,
    spots: {
      arrivee: [...ARRIVEE, s(2, 5, 'se'), s(1, 5, 'se')],
      tourJoy: [s(3, 6, 'se'), s(13, 6, 'sw'), s(8, 11, 'ne'), s(2, 9, 'ne'), s(14, 1, 'sw')],
    },
    horloge: { y: 6.8 },
    pancarte: { gx: 0, gy: 10.4 },
    ascenseurMetal: '#b8c0ca',
  });
}

// ---------- Labo du savant fou ----------
// Une frise de baies et de bobines Tesla barre la cave en biais, du coin gauche au mur du fond (x + y = 12) : à
// l'écran, une ligne bien droite d'où jaillissent des arcs électriques. On passe par la porte du milieu (7, 5) ou
// par les deux bouts. Derrière : bocaux, cuves où flottent des cerveaux, grimoires. Devant : la table d'opération
// sous sa lampe, les paillasses qui bouillonnent, le grand levier et le tableau noir.
const LIGNE = 12; // x + y des baies et des bobines
const BAIES_LABO = [[6, 6], [8, 4], [4, 8], [10, 2], [2, 10], [12, 0]];
const BOBINES = [[3, 9], [5, 7], [9, 3], [11, 1]];

function zoneLabo(x, y) {
  if (x <= 2 && y <= 4) return 'lobby';
  if (x + y < LIGNE) return 'cave';
  if (x + y === LIGNE) return 'ligne';
  return 'labo';
}

function carteLabo() {
  const meubles = [];
  const m = (type, x, y, o = {}) => meubles.push({ type, x, y, ...o });

  // --- la frise : bobines Tesla entre les baies, porte du milieu marquée à la craie (peinte avec le sol) ---
  BOBINES.forEach(([x, y], i) => m('srv_tesla', x, y, { variante: i }));
  m('srv_marquage', 7, 5, { sol: true });

  // --- derrière : bocaux, grimoires, cuves ---
  m('srv_bocaux', 3, 0);
  m('srv_grimoires', 4, 0);
  m('srv_bocaux', 5, 0, { variante: 1 });
  m('srv_grimoires', 8, 0, { variante: 1 });
  m('srv_cuve', 0, 8, { variante: 0 });
  m('srv_cuve', 0, 6, { variante: 1 });
  m('srv_cuve', 0, 7, { variante: 2 });
  m('srv_chandelier', 0, 0);
  m('srv_chandelier', 3, 4);

  // --- devant : table d'opération, paillasses, levier, tableau noir ---
  m('srv_table_op', 8, 9, { w: 2, h: 1 });
  m('srv_scialytique', 10, 8);
  m('srv_paillasse', 13, 4, { part: 'g' });
  m('srv_paillasse', 14, 4, { part: 'd', variante: 1 });
  m('srv_jacob', 15, 6);
  m('srv_levier', 4, 11);
  m('srv_tableau_noir', 12, 9);
  m('srv_tonneau', 15, 11);
  m('srv_tonneau', 14, 11, { variante: 1 });
  m('srv_vandegraaff', 13, 8);
  m('srv_cage', 5, 9);
  m('srv_chandelier', 15, 2);
  m('srv_chandelier', 6, 11);

  // lueurs : bobines, cuves, chandeliers
  const lampes = [
    ...BOBINES.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5, z: 70 })),
    { x: 0.5, y: 6.5, z: 40 }, { x: 0.5, y: 0.5, z: 50 }, { x: 3.5, y: 4.5, z: 50 }, { x: 15.5, y: 2.5, z: 50 }, { x: 6.5, y: 11.5, z: 50 },
    { x: 9, y: 9.5, z: 60 },
  ];

  return carte({
    look: 'srv_labo', zoneDe: zoneLabo, meubles, cloisons: [], baies: BAIES_LABO,
    spots: {
      arrivee: [...ARRIVEE, s(2, 5, 'se'), s(1, 5, 'se')],
      tourJoy: [s(3, 5, 'se'), s(7, 5, 'se'), s(11, 7, 'sw'), s(6, 9, 'ne'), s(13, 2, 'sw')],
    },
    horloge: { y: 9.6 },
    pancarte: { gx: 0, gy: 10.4 },
    nuit: true,
    lampes,
    ascenseurMetal: '#9a6a3a',
  });
}

/** @type {Array<{ id: string, famille: string, nom: string, nomEn: string, description: string, descriptionEn: string, construire: (theme: string) => object }>} */
export const SKINS = [
  {
    id: 'serveur-datacenter',
    famille: 'serveur',
    nom: 'Datacenter',
    nomEn: 'Data center',
    description: 'Rangées de baies, allées froides et chaudes, câbles au plafond et climatiseurs',
    descriptionEn: 'Rows of racks, cold and hot aisles, overhead cable trays and air conditioners',
    construire: () => carteDatacenter(),
  },
  {
    id: 'serveur-labo',
    famille: 'serveur',
    nom: 'Labo du savant fou',
    nomEn: "Mad scientist's lab",
    description: 'Bobines Tesla entre les baies, cerveaux en bocal et table d’opération',
    descriptionEn: 'Tesla coils between the racks, brains in jars and an operating table',
    construire: () => carteLabo(),
  },
];
