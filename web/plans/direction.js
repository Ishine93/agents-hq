// Décors au choix de la famille « direction » (1.0.10). Contrat : web/plans/index.js et tests/plans-etages.js.
// Module pur (aucun accès au DOM) : n'importe que ./outils.js.
// L'étage du DG : son grand bureau (bureau_dg, fauteuil_dg, tableau blanc), la salle du conseil où il fait ses
// synthèses (table_reunion), les postes des tâches de synthèse, le poste machine, la file et les visiteurs du DG,
// le salon de l'équipe et le coin pause. Mêmes places que carteDirection() de web/carte.js, autre disposition.
import { W, H, HW, s, grilles, zonesDe } from './outils.js';

const ASCENSEUR = { apparition: { gx: 0.18, gy: 2.0 }, tuile: { x: 0, y: 2 } };

// Carte complète d'après ses meubles, ses cloisons et ses places (collisions calculées ici).
function carte({ look, zoneDe, meubles, cloisons, spots, ...reste }) {
  const { bloque, siege, aretes } = grilles(meubles, cloisons);
  return {
    W, H, HW, type: 'direction', look, zones: zonesDe(zoneDe), meubles, cloisons, bloque, siege, aretes,
    spots: { ascenseur: ASCENSEUR, ...spots }, emplacementsServices: [], ascenseur: { y0: 1, y1: 3 }, ...reste,
  };
}

// Table du conseil de x0..x1 × y0..y1 (cases reliées), comme dans carte.js.
function tableConseil(m, x0, y0, x1, y1) {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) m('table_reunion', x, y, { conn: { w: x > x0, e: x < x1, n: y > y0, s: y < y1 } });
  }
}

// ---------- Penthouse : baies vitrées sur la ville, piscine à débordement sur la terrasse ----------
// Le long des baies du fond : le bureau du DG (avec son piano), puis cinq postes face à la vue et le poste machine.
// Un couloir traverse l'étage. Dessous : le bar contre le mur gauche, le salon autour d'un brasero, la
// salle du conseil vitrée. Devant, derrière la façade de verre : la terrasse en teck et la piscine qui déborde
// dans le vide.
function zonePenthouse(x, y) {
  if (y >= 9) return 'pause'; // terrasse
  if (x <= 2 && y <= 4) return 'lobby';
  if (y <= 3) return x <= 8 ? 'dg' : x <= 13 ? 'bureau1' : 'machine';
  if (y === 4) return 'open';
  if (x <= 2) return 'bar';
  if (x >= 9) return 'reunion';
  if (x >= 4 && x <= 7) return 'salon';
  return 'open';
}

function cartePenthouse() {
  const meubles = [];
  const m = (type, x, y, o = {}) => meubles.push({ type, x, y, ...o });

  // --- entrée ---
  m('dir_palmier', 0, 0, { variante: 0 });

  // --- bureau du DG : dos aux baies, face à la terrasse ---
  m('dir_sculpture', 3, 0);
  m('bureau_dg', 3, 2, { part: 'g', lampe: true });
  m('bureau_dg', 4, 2, { part: 'm' });
  m('bureau_dg', 5, 2, { part: 'd', telephone: true });
  m('fauteuil_dg', 4, 1, { dir: 'sw' });
  m('dir_piano', 7, 2, { w: 2, h: 2 });
  m('dir_palmier', 8, 0, { variante: 1 });

  // --- postes face à la vue, poste machine ---
  for (let x = 9; x <= 13; x++) {
    m('bureau', x, 0, { cote: 's', conn: { w: x > 9, e: x < 13 } });
    m('chaise', x, 1, { dir: 'ne' });
  }
  m('poste_machine', 14, 0, { part: 'g' });
  m('poste_machine', 15, 0, { part: 'd' });
  m('chaise', 14, 1, { dir: 'ne' });

  // --- bar contre le mur gauche ---
  for (let y = 5; y <= 8; y++) {
    m('dir_arriere_bar', 0, y, { part: y - 5 });
    m('dir_comptoir', 1, y, { part: y === 5 ? 'n' : y === 8 ? 's' : 'm', cafe: y === 6 });
    m('dir_tabouret', 2, y, { dir: 'nw', siege: true });
  }

  // --- salon autour du brasero (réserve de l'équipe) ---
  m('dir_sofa', 5, 5, { dir: 'sw', part: 'g', siege: true });
  m('dir_sofa', 6, 5, { dir: 'sw', part: 'd', siege: true });
  m('dir_sofa', 4, 6, { dir: 'se', part: 'g', siege: true });
  m('dir_sofa', 4, 7, { dir: 'se', part: 'd', siege: true });
  m('dir_sofa', 7, 6, { dir: 'nw', part: 'g', siege: true });
  m('dir_sofa', 7, 7, { dir: 'nw', part: 'd', siege: true });
  m('dir_brasero', 5, 6, { w: 2, h: 2 });

  // --- salle du conseil vitrée : table en long, le DG en bout de table face à la terrasse ---
  tableConseil(m, 11, 6, 12, 8);
  for (let y = 6; y <= 8; y++) {
    m('chaise', 10, y, { dir: 'se' });
    m('chaise', 13, y, { dir: 'nw' });
  }
  m('chaise', 11, 5, { dir: 'sw', variante: 'dg' });
  m('chaise', 12, 5, { dir: 'sw' });
  m('plante', 15, 5, { variante: 4 });

  // --- terrasse : piscine à débordement, transats, parasols ---
  for (let x = 5; x <= 12; x++) {
    for (const y of [10, 11]) m('dir_piscine', x, y, { conn: { w: x > 5, e: x < 12, n: y > 10, s: y < 11 } });
  }
  for (const x of [1, 2, 3, 14, 15]) m('dir_transat', x, 10, { dir: 'sw', siege: true });
  m('dir_parasol', 0, 10);
  m('dir_palmier', 0, 11, { variante: 2 });
  m('dir_parasol', 15, 11);

  // --- cloisons vitrées ---
  const cloisons = [];
  const c = (x, y, cote) => cloisons.push({ x, y, cote });
  for (let y = 0; y <= 3; y++) {
    c(2, y, 'e'); // entrée | bureau du DG
    c(8, y, 'e'); // bureau du DG | postes
  }
  for (let x = 3; x <= 8; x++) if (x !== 5 && x !== 6) c(x, 3, 's'); // porte du DG en 5-6
  for (let x = 10; x <= 15; x++) if (x !== 14) c(x, 4, 's'); // salle du conseil : portes en 9 et 14
  for (let y = 5; y <= 8; y++) c(8, y, 'e');
  for (let x = 0; x <= 15; x++) if (x !== 3 && x !== 8) c(x, 8, 's'); // façade : portes-fenêtres en 3 et 8

  const postes = [];
  for (let x = 9; x <= 13; x++) postes.push({ cle: 'vue-' + x, chaise: s(x, 1, 'ne', { assis: true }), bureau: { x, y: 0 }, insp: s(x, 2, 'ne'), ferme: false });

  const spots = {
    arrivee: [s(1, 2, 'se'), s(1, 3, 'se'), s(2, 3, 'se'), s(2, 2, 'se'), s(1, 1, 'se'), s(1, 4, 'se'), s(2, 4, 'se'), s(0, 4, 'se'),
      s(2, 1, 'se'), s(1, 0, 'se')],
    // réserve : le salon autour du brasero, puis les tabourets du bar
    equipe: [s(4, 6, 'se', { assis: true }), s(4, 7, 'se', { assis: true }), s(7, 6, 'nw', { assis: true }), s(7, 7, 'nw', { assis: true }),
      s(5, 5, 'sw', { assis: true }), s(6, 5, 'sw', { assis: true }), s(5, 8, 'ne', { lire: true }), s(6, 8, 'ne', { lire: true }),
      s(2, 6, 'nw', { assis: true }), s(2, 7, 'nw', { assis: true }), s(2, 5, 'nw', { assis: true }), s(2, 8, 'nw', { assis: true }),
      s(4, 8, 'ne'), s(7, 5, 'sw')],
    fileDG: [s(5, 4, 'ne'), s(6, 4, 'ne'), s(7, 4, 'nw'), s(8, 4, 'nw'), s(8, 5, 'ne'), s(8, 6, 'ne'), s(8, 7, 'ne')],
    visiteurDG: [s(4, 3, 'ne'), s(3, 3, 'ne'), s(5, 3, 'ne'), s(6, 3, 'nw')],
    dg: { siege: s(4, 1, 'sw', { assis: true }), tableau: s(6, 1, 'ne'), tete: s(11, 5, 'sw', { assis: true }) },
    postes,
    machine: {
      cle: 'machine', chaise: s(14, 1, 'ne', { assis: true }), bureau: { x: 14, y: 0 }, insp: s(15, 1, 'nw'),
      file: [s(14, 2, 'ne'), s(15, 2, 'ne'), s(14, 3, 'ne'), s(15, 3, 'ne'), s(13, 3, 'ne')],
    },
    // pause : la terrasse (transats, bord de piscine, un verre à la main)
    pause: [s(1, 10, 'sw', { assis: true }), s(2, 10, 'sw', { assis: true }), s(14, 10, 'sw', { assis: true }), s(3, 10, 'sw', { assis: true }),
      s(15, 10, 'sw', { assis: true }), s(4, 10, 'se', { cafe: true }), s(13, 10, 'nw', { cafe: true }), s(6, 9, 'sw'), s(10, 9, 'sw'),
      s(4, 11, 'se'), s(13, 9, 'sw', { cafe: true }), s(2, 11, 'sw')],
    reunion: {
      // table en long : « nord » le long du côté gauche, « sud » le long du côté droit, le DG en bout de table
      nord: [s(10, 6, 'se', { assis: true }), s(10, 7, 'se', { assis: true }), s(10, 8, 'se', { assis: true })],
      sud: [s(13, 6, 'nw', { assis: true }), s(13, 7, 'nw', { assis: true }), s(13, 8, 'nw', { assis: true })],
      est: [s(12, 5, 'sw', { assis: true })],
      debout: [s(9, 6, 'se'), s(9, 7, 'se'), s(14, 6, 'nw'), s(14, 7, 'nw'), s(9, 8, 'se'), s(14, 8, 'nw'), s(10, 5, 'se'), s(13, 5, 'sw'),
        s(9, 5, 'se'), s(14, 5, 'sw'), s(15, 7, 'nw'), s(15, 6, 'nw')],
      tete: s(11, 5, 'sw', { assis: true }),
      table: { x0: 11, y0: 6, x1: 12, y1: 8 },
    },
    tourJoy: [s(3, 6, 'se'), s(8, 4, 'sw'), s(12, 3, 'sw'), s(7, 9, 'ne'), s(2, 9, 'ne'), s(11, 4, 'sw')],
  };

  return carte({
    look: 'dir_penthouse', zoneDe: zonePenthouse, meubles, cloisons, spots,
    salon: { x0: 4, y0: 5, x1: 8, y1: 9 },
    tapis: [{ x0: 3.15, y0: 1.2, x1: 6.85, y1: 3.85, c0: '#cfc6b4', c1: '#e9e2d3' }],
    bureauDG: [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }],
    tableau: { x0: 5, x1: 8 },
    horloge: { y: 9.5 },
    pancarte: { gx: 0, gy: 10.6 },
    ascenseurMetal: '#c8ccd2',
  });
}

// ---------- Repaire du méchant : un volcan creux ----------
// Une rivière de lave coupe l'étage en deux ; on la traverse par trois passerelles (x = 2, 8 et 13). Au nord :
// la fusée de secours du DG, son bureau avec le chat blanc et le gros bouton rouge, la trappe où se tiennent les
// visiteurs, juste devant le bassin aux requins, et la rangée de consoles des sbires face au tableau. Au sud : la
// salle de guerre sous la carte du monde, le salon des sbires et la cantine, où l'on grille des guimauves au bord
// de la lave.
const PONTS = [2, 8, 13];
function zoneRepaire(x, y) {
  if (y === 6) return 'lave';
  if (x <= 2 && y <= 5) return 'lobby';
  if (y <= 5) return x <= 8 ? 'dg' : x >= 14 && y <= 2 ? 'machine' : 'bureau1';
  if (x <= 5) return 'reunion';
  if (x <= 10) return 'salon';
  return 'pause';
}

function carteRepaire() {
  const meubles = [];
  const m = (type, x, y, o = {}) => meubles.push({ type, x, y, ...o });

  // --- entrée et fusée de secours ---
  m('plante', 0, 0, { variante: 3 });
  m('dir_fusee', 3, 0, { w: 2, h: 2 });

  // --- bureau du DG : chat, bouton rouge, trappe et bassin aux requins ---
  m('bureau_dg', 5, 2, { part: 'g', lampe: true });
  m('bureau_dg', 6, 2, { part: 'm' });
  m('bureau_dg', 7, 2, { part: 'd', telephone: true });
  m('fauteuil_dg', 6, 1, { dir: 'sw' });
  m('dir_chat', 5, 1);
  m('dir_bouton', 8, 2);
  for (let x = 5; x <= 7; x++) m('dir_trappe', x, 3, { sol: true, conn: { w: x > 5, e: x < 7 } });
  m('dir_requins', 5, 4, { w: 3, h: 2 });
  m('dir_diamant', 9, 0);

  // --- consoles des sbires face au tableau, poste machine ---
  for (let x = 10; x <= 14; x++) {
    m('bureau', x, 3, { cote: 's', conn: { w: x > 10, e: x < 14 } });
    m('chaise', x, 4, { dir: 'ne' });
  }
  m('poste_machine', 14, 0, { part: 'g' });
  m('poste_machine', 15, 0, { part: 'd' });
  m('chaise', 14, 1, { dir: 'ne' });

  // --- rivière de lave et passerelles ---
  for (let x = 0; x < W; x++) {
    if (PONTS.includes(x)) m('dir_pont', x, 6, { passage: true });
    else m('dir_lave', x, 6, { conn: { w: x > 0, e: x < W - 1 } });
  }

  // --- salle de guerre sous la carte du monde ---
  tableConseil(m, 1, 8, 3, 9);
  m('dir_hologramme', 2, 8, { passage: true });
  for (let x = 1; x <= 3; x++) {
    m('chaise', x, 7, { dir: 'sw' });
    m('chaise', x, 10, { dir: 'ne' });
  }
  m('chaise', 4, 8, { dir: 'nw', variante: 'dg' });
  m('chaise', 4, 9, { dir: 'nw' });

  // --- salon des sbires ---
  m('dir_sofa', 7, 8, { dir: 'sw', part: 'g', siege: true });
  m('dir_sofa', 8, 8, { dir: 'sw', part: 'd', siege: true });
  m('dir_sofa', 7, 10, { dir: 'ne', part: 'g', siege: true });
  m('dir_sofa', 8, 10, { dir: 'ne', part: 'd', siege: true });
  m('table_basse', 7, 9, { variante: 'equipe' });
  m('table_basse', 8, 9, {});
  m('fauteuil', 6, 9, { dir: 'se' });
  m('fauteuil', 9, 9, { dir: 'nw' });
  m('dir_caisse_tnt', 10, 11);
  m('dir_caisse_tnt', 9, 11, { variante: 1 });

  // --- cantine : guimauves au bord de la lave ---
  m('machine_cafe', 11, 10, { dir: 'se' });
  m('dir_mange_debout', 13, 9);
  m('dir_tonneau', 15, 11);
  m('plante', 11, 11, { variante: 2 });

  const cloisons = [];
  const postes = [];
  for (let x = 10; x <= 14; x++) postes.push({ cle: 'console-' + x, chaise: s(x, 4, 'ne', { assis: true }), bureau: { x, y: 3 }, insp: s(x, 5, 'ne'), ferme: false });

  const spots = {
    arrivee: [s(1, 2, 'se'), s(1, 3, 'se'), s(2, 3, 'se'), s(2, 2, 'se'), s(1, 1, 'se'), s(1, 4, 'se'), s(2, 4, 'se'), s(0, 4, 'se'),
      s(1, 5, 'se'), s(2, 1, 'se')],
    // réserve : le salon des sbires
    equipe: [s(7, 8, 'sw', { assis: true }), s(8, 8, 'sw', { assis: true }), s(7, 10, 'ne', { assis: true }), s(8, 10, 'ne', { assis: true }),
      s(6, 9, 'se', { assis: true }), s(9, 9, 'nw', { assis: true }), s(6, 8, 'se', { lire: true }), s(9, 8, 'sw', { lire: true }),
      s(6, 10, 'ne'), s(9, 10, 'nw'), s(7, 11, 'ne'), s(8, 11, 'ne'), s(10, 9, 'nw')],
    fileDG: [s(4, 3, 'se'), s(4, 4, 'ne'), s(4, 5, 'ne'), s(3, 5, 'ne'), s(3, 4, 'ne'), s(3, 3, 'ne'), s(3, 2, 'se')],
    // les visiteurs du DG se tiennent sur la trappe…
    visiteurDG: [s(6, 3, 'ne'), s(5, 3, 'ne'), s(7, 3, 'ne'), s(8, 3, 'nw')],
    dg: { siege: s(6, 1, 'sw', { assis: true }), tableau: s(11, 1, 'ne'), tete: s(4, 8, 'nw', { assis: true }) },
    postes,
    machine: {
      cle: 'machine', chaise: s(14, 1, 'ne', { assis: true }), bureau: { x: 14, y: 0 }, insp: s(15, 1, 'nw'),
      file: [s(13, 1, 'ne'), s(13, 2, 'ne'), s(14, 2, 'ne'), s(15, 2, 'ne'), s(12, 2, 'ne')],
    },
    // pause : guimauves grillées au-dessus de la lave, café, mange-debout
    pause: [s(11, 7, 'ne', { cafe: true }), s(12, 7, 'ne', { cafe: true }), s(14, 7, 'ne', { cafe: true }), s(15, 7, 'ne', { cafe: true }),
      s(12, 10, 'nw', { cafe: true }), s(12, 9, 'se'), s(14, 9, 'nw'), s(13, 8, 'sw'), s(13, 10, 'ne'), s(14, 10, 'ne'), s(15, 9, 'nw')],
    reunion: {
      nord: [s(1, 7, 'sw', { assis: true }), s(2, 7, 'sw', { assis: true }), s(3, 7, 'sw', { assis: true })],
      sud: [s(1, 10, 'ne', { assis: true }), s(2, 10, 'ne', { assis: true }), s(3, 10, 'ne', { assis: true })],
      est: [s(4, 9, 'nw', { assis: true })],
      debout: [s(0, 7, 'sw'), s(4, 7, 'sw'), s(0, 10, 'ne'), s(4, 10, 'nw'), s(5, 8, 'nw'), s(5, 9, 'nw'), s(1, 11, 'ne'), s(2, 11, 'ne'),
        s(3, 11, 'ne'), s(0, 11, 'ne'), s(4, 11, 'nw'), s(0, 8, 'se'), s(0, 9, 'se')],
      tete: s(4, 8, 'nw', { assis: true }),
      table: { x0: 1, y0: 8, x1: 3, y1: 9 },
    },
    tourJoy: [s(3, 4, 'se'), s(9, 2, 'sw'), s(9, 5, 'sw'), s(5, 10, 'ne'), s(10, 8, 'sw'), s(13, 11, 'ne')],
  };

  // lueurs de la lave (et de la lampe du DG) dans la pénombre
  const lampes = [0.5, 4.5, 10.5, 15.2].map((x) => ({ x, y: 6.5, z: 6 }));
  lampes.push({ x: 5.4, y: 2.4, z: 40 }, { x: 2.5, y: 8.9, z: 50 });
  return carte({
    look: 'dir_repaire', zoneDe: zoneRepaire, meubles, cloisons, spots,
    salon: { x0: 6, y0: 7.6, x1: 10, y1: 10.5 },
    tapis: [{ x0: 4.85, y0: 0.9, x1: 8.15, y1: 3.95, c0: '#2a0f12', c1: '#7a1f24' }],
    bureauDG: [{ x: 5, y: 2 }, { x: 6, y: 2 }, { x: 7, y: 2 }],
    tableau: { x0: 10, x1: 13 },
    horloge: { y: 6.6 },
    pancarte: { gx: 13.5, gy: 7.2 },
    nuit: true,
    lampes,
    ascenseurMetal: '#6a6f78',
  });
}

/** @type {Array<{ id: string, famille: string, nom: string, nomEn: string, description: string, descriptionEn: string, construire: (theme: string) => object }>} */
export const SKINS = [
  {
    id: 'direction-penthouse',
    famille: 'direction',
    nom: 'Penthouse',
    nomEn: 'Penthouse',
    description: 'Baies vitrées sur la ville, bar, salon autour du feu et piscine à débordement',
    descriptionEn: 'Glass walls over the city, a bar, a fireside lounge and an infinity pool',
    construire: () => cartePenthouse(),
  },
  {
    id: 'direction-repaire',
    famille: 'direction',
    nom: 'Repaire du méchant',
    nomEn: "Villain's lair",
    description: 'Volcan creux, rivière de lave, bassin aux requins et carte du monde géante',
    descriptionEn: 'Hollow volcano, lava river, shark tank and a giant world map',
    construire: () => carteRepaire(),
  },
];
