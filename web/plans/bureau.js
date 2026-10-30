// Décors au choix de la famille « bureau » (1.0.10). Contrat : web/plans/index.js et tests/plans-etages.js.
// Module pur (aucun accès au DOM) : n'importe que ./outils.js.
//
// Trois plans d'étage de projet, chacun avec toutes les places du plan d'origine (10 postes dont 2 fermés, poste
// machine, réunion, file du DG, bureau du DG, tableau blanc, salon de l'équipe, coin pause) :
// - bureau-box : un labyrinthe de box gris façon open space des années 90 ; le couloir fait un Z entre les box ;
// - bureau-loft : un loft industriel (briques, piliers en fonte, verrières, grande table commune, cuisine ouverte) ;
// - bureau-pirate : le pont d'un bateau pirate (mât, canons, barre, table des cartes, cambuse au tonneau de rhum).
import { W, H, HW, s, grilles, zonesDe, DECOR_THEME } from './outils.js';

// Chantier d'un plan : meubles, cloisons (vitrées, ou pleines avec `panneau`), et arêtes bloquantes dessinées par
// un meuble (rambardes du bateau) : ce meuble « passage » se pose sur le bord nord ('n', entre y-1 et y) ou ouest
// ('o', entre x-1 et x) de sa case, et l'arête correspondante bloque le passage comme une cloison.
function chantier() {
  const meubles = [];
  const cloisons = [];
  const bords = [];
  const m = (type, x, y, o = {}) => meubles.push({ type, x, y, ...o });
  const c = (x, y, cote) => cloisons.push({ x, y, cote });
  // cloison pleine sur le bord nord ou ouest de la case (même repère que `bord`)
  const panneau = (x, y, b, o = {}) => cloisons.push(b === 'n' ? { x, y: y - 1, cote: 's', plein: true, ...o } : { x: x - 1, y, cote: 'e', plein: true, ...o });
  const bord = (type, x, y, b, o = {}) => {
    m(type, x, y, { bord: b, passage: true, ...o });
    bords.push(b === 'n' ? x + ',' + (y - 1) + ',s' : x - 1 + ',' + y + ',e');
  };
  const fin = (autres = []) => {
    const g = grilles(meubles, cloisons, autres);
    for (const a of bords) g.aretes.add(a);
    return g;
  };
  return { meubles, cloisons, m, c, bord, panneau, fin };
}

// Tissu des panneaux de box selon le thème du projet : du gris des années 90, teinté du thème.
const TISSU_BOX = { etudes: '#929882', roblox: '#6e89b6', unreal: '#737486', atelier3d: '#989895', bac: '#b4a152' };

// Objets du thème de l'étage (blocs Roblox, écrans de rendu…) posés sur les cases données.
function objetsTheme(m, theme, cases) {
  (DECOR_THEME[theme] || DECOR_THEME.etudes).slice(0, cases.length).forEach((t, i) => m(t, cases[i][0], cases[i][1], { variante: i, dir: 'se' }));
}

// Table de réunion de w × h cases (conn : les cases se joignent).
function tableReunion(m, x0, y0, w, h) {
  for (let x = x0; x < x0 + w; x++) {
    for (let y = y0; y < y0 + h; y++) m('table_reunion', x, y, { conn: { w: x > x0, e: x < x0 + w - 1, n: y > y0, s: y < y0 + h - 1 } });
  }
}

const ARRIVEE = () => [s(1, 2, 'se'), s(2, 3, 'se'), s(1, 3, 'se'), s(2, 2, 'se'), s(1, 1, 'se'), s(0, 3, 'se'), s(1, 0, 'se'),
  s(2, 1, 'se'), s(1, 4, 'se'), s(2, 4, 'se')];
const ASCENSEUR = () => ({ apparition: { gx: 0.18, gy: 2.0 }, tuile: { x: 0, y: 2 } });

// ---------- Labyrinthe de box ----------
// Hall d'ascenseur et salle de réunion vitrée au fond ; deux bureaux fermés et le poste machine le long du mur
// droit ; huit box (deux rangées dos à dos) au milieu. Le couloir passe au-dessus des box, tourne au bout, revient
// en dessous et mène à la kitchenette : un Z. Le DG a le bureau d'angle vitré, à l'avant.
function zoneBox(x, y) {
  if (x <= 2 && y <= 4) return 'lobby';
  if (x <= 2 && y <= 7) return 'salon';
  if (x <= 2 || (x <= 4 && y >= 10)) return 'pause';
  if (x <= 8 && y <= 4) return 'reunion';
  if (x >= 9 && x <= 10 && y <= 3) return 'bureau1';
  if (x >= 11 && x <= 12 && y <= 3) return 'bureau2';
  if (x >= 13 && y <= 3) return 'machine';
  if (x >= 12 && y >= 6) return 'dg';
  if (x >= 3 && x <= 10 && y >= 6 && y <= 9) return 'box';
  return 'def';
}

function carteBox(theme) {
  const { meubles, cloisons, m, c, panneau, fin } = chantier();
  const zones = zonesDe(zoneBox);

  // --- panneaux des box : cloisons pleines en tissu, cadre beige ---
  const P = (x, y, b) => panneau(x, y, b, { couleur: TISSU_BOX[theme] || '#8d8a80', cadre: '#cfcbc0', hauteur: 33 });
  for (const x of [3, 5, 7, 9]) {
    P(x, 6, 'n'); // dos de la rangée du haut (entrée à côté, en x + 1)
    P(x, 10, 'n'); // devant de la rangée du bas
    for (const y of [6, 7, 8, 9]) P(x, y, 'o');
  }
  for (const y of [6, 7, 8, 9]) P(11, y, 'o'); // bout des box, côté couloir
  for (let x = 3; x <= 10; x++) P(x, 8, 'n'); // cloison du milieu, entre les bureaux dos à dos

  // --- hall d'ascenseur ---
  m('plante', 0, 0, { variante: 7 });
  m('box_porte_manteau', 2, 0);

  // --- salle de réunion vitrée (tableau blanc au mur) ---
  tableReunion(m, 5, 1, 2, 3);
  for (const y of [1, 2, 3]) {
    m('chaise', 4, y, { dir: 'se' });
    m('chaise', 7, y, { dir: 'nw' });
  }
  m('chaise', 5, 4, { dir: 'ne', variante: 'dg' });
  m('chaise', 6, 4, { dir: 'ne' });
  m('plante', 8, 0, { variante: 2 });

  // --- bureaux fermés ---
  for (const x of [9, 11]) {
    m('bureau', x, 2, { cote: 'n', conn: {} });
    m('chaise', x, 1, { dir: 'sw' });
    m('box_classeur', x + 1, 0, { variante: x });
  }
  m('plante', 9, 0, { variante: 3, petite: true });
  m('plante', 11, 0, { variante: 4 });

  // --- poste machine et photocopieuse ---
  m('box_photocopieuse', 13, 0);
  m('poste_machine', 14, 0, { part: 'g', theme });
  m('poste_machine', 15, 0, { part: 'd', theme });
  m('chaise', 14, 1, { dir: 'ne' });

  // --- huit box : bureau + retour, chaise ; la case libre à côté de la chaise est l'entrée ---
  for (const x of [3, 5, 7, 9]) {
    m('bureau', x, 7, { cote: 'n', conn: { e: true, s: true } });
    m('box_retour', x + 1, 7, { cote: 'n', variante: x });
    m('chaise', x, 6, { dir: 'sw' });
    m('bureau', x, 8, { cote: 's', conn: { e: true, n: true } });
    m('box_retour', x + 1, 8, { cote: 's', variante: x + 1 });
    m('chaise', x, 9, { dir: 'ne' });
  }

  // --- bureau d'angle du DG (vitré) ---
  m('fauteuil_dg', 13, 7, { dir: 'sw' });
  m('bureau_dg', 13, 8, { part: 'g', lampe: true });
  m('bureau_dg', 14, 8, { part: 'd', telephone: true });
  m('plante', 12, 6, { variante: 1 });
  m('etagere', 15, 6);
  m('canape', 12, 10, { part: 'a', dir: 'se' });
  m('canape', 12, 11, { part: 'b', dir: 'se' });
  m('table_basse', 13, 11, {});
  m('plante', 15, 11, { variante: 5 });

  // --- salon de l'équipe ---
  m('canape', 0, 5, { part: 'a', dir: 'se', equipe: true });
  m('canape', 0, 6, { part: 'b', dir: 'se', equipe: true });
  m('table_basse', 1, 5, { variante: 'equipe' });
  m('fauteuil', 0, 7, { dir: 'se' });
  m('fauteuil', 2, 7, { dir: 'nw' });

  // --- kitchenette ---
  m('machine_cafe', 0, 8, { dir: 'se' });
  m('distributeur', 0, 9);
  m('canape', 0, 10, { part: 'a', dir: 'se' });
  m('canape', 0, 11, { part: 'b', dir: 'se' });
  m('loft_frigo', 2, 8);
  m('fontaine', 2, 11);

  // --- objets du thème, dans le couloir du fond ---
  objetsTheme(m, theme, [[13, 5], [14, 5], [15, 5], [15, 4]]);

  // --- cloisons vitrées ---
  for (let y = 0; y <= 4; y++) {
    c(2, y, 'e');
    c(8, y, 'e');
  }
  for (let x = 4; x <= 7; x++) c(x, 4, 's'); // portes de la salle de réunion en x = 3 et x = 8
  for (let y = 0; y <= 3; y++) {
    c(10, y, 'e');
    c(12, y, 'e');
  }
  c(9, 3, 's');
  c(11, 3, 's'); // portes des bureaux fermés en x = 10 et x = 12
  for (const x of [0, 1, 2]) c(x, 7, 's'); // salon | kitchenette
  for (const y of [6, 7, 8, 10, 11]) c(11, y, 'e'); // bureau du DG : porte en y = 9
  for (let x = 12; x <= 15; x++) c(x, 5, 's');

  const { bloque, siege, aretes } = fin();

  const postes = [];
  for (const x of [3, 5, 7, 9]) {
    postes.push({ cle: 'box-h' + x, chaise: s(x, 6, 'sw', { assis: true }), bureau: { x, y: 7 }, insp: s(x + 1, 6, 'sw'), ferme: false });
    postes.push({ cle: 'box-b' + x, chaise: s(x, 9, 'ne', { assis: true }), bureau: { x, y: 8 }, insp: s(x + 1, 9, 'ne'), ferme: false });
  }
  postes.push({ cle: 'bureau1', chaise: s(9, 1, 'sw', { assis: true }), bureau: { x: 9, y: 2 }, insp: s(10, 1, 'nw'), ferme: true });
  postes.push({ cle: 'bureau2', chaise: s(11, 1, 'sw', { assis: true }), bureau: { x: 11, y: 2 }, insp: s(12, 1, 'nw'), ferme: true });

  const spots = {
    ascenseur: ASCENSEUR(),
    arrivee: ARRIVEE(),
    equipe: [s(0, 5, 'se', { assis: true }), s(0, 6, 'se', { assis: true }), s(0, 7, 'se', { assis: true }), s(2, 7, 'nw', { assis: true }),
      s(1, 6, 'nw', { lire: true }), s(2, 6, 'sw', { lire: true }), s(2, 5, 'sw'), s(1, 7, 'ne'), s(3, 5, 'sw'), s(4, 5, 'sw'), s(5, 5, 'sw'),
      s(6, 5, 'sw')],
    // la file du DG remonte le couloir, devant la porte de son bureau
    fileDG: [s(11, 9, 'sw'), s(11, 8, 'sw'), s(11, 7, 'sw'), s(11, 6, 'sw'), s(11, 5, 'sw'), s(10, 5, 'se'), s(9, 5, 'se')],
    visiteurDG: [s(13, 9, 'ne'), s(14, 9, 'ne'), s(12, 9, 'ne'), s(15, 9, 'nw')],
    dg: { siege: s(13, 7, 'sw', { assis: true }), tableau: s(5, 0, 'ne'), tete: s(5, 4, 'ne', { assis: true }) },
    postes,
    machine: {
      cle: 'machine', chaise: s(14, 1, 'ne', { assis: true }), bureau: { x: 14, y: 0 }, insp: s(15, 1, 'nw'),
      file: [s(14, 3, 'ne'), s(15, 3, 'ne'), s(13, 3, 'ne'), s(13, 4, 'ne'), s(14, 4, 'ne')],
    },
    pause: [
      s(0, 10, 'se', { assis: true }), s(0, 11, 'se', { assis: true }), s(1, 8, 'nw', { cafe: true }),
      s(1, 9, 'sw'), s(2, 9, 'sw'), s(1, 11, 'nw'), s(2, 10, 'nw'), s(1, 10, 'nw'), s(3, 10, 'nw'), s(3, 11, 'nw'),
      s(4, 10, 'nw'), s(4, 11, 'nw'), s(5, 11, 'nw'), s(5, 10, 'nw'), s(6, 11, 'nw'),
    ],
    reunion: {
      nord: [s(4, 1, 'se', { assis: true }), s(4, 2, 'se', { assis: true }), s(4, 3, 'se', { assis: true })],
      sud: [s(7, 1, 'nw', { assis: true }), s(7, 2, 'nw', { assis: true }), s(7, 3, 'nw', { assis: true })],
      est: [s(6, 4, 'ne', { assis: true })],
      debout: [s(3, 1, 'se'), s(3, 2, 'se'), s(8, 1, 'nw'), s(8, 2, 'nw'), s(3, 3, 'se'), s(8, 3, 'nw'), s(4, 0, 'sw'), s(7, 0, 'sw'),
        s(3, 0, 'se'), s(4, 4, 'ne'), s(7, 4, 'ne'), s(6, 0, 'sw')],
      tete: s(5, 4, 'ne', { assis: true }),
      table: { x0: 5, y0: 1, x1: 6, y1: 3 },
    },
    tourJoy: [s(3, 5, 'se'), s(8, 5, 'sw'), s(12, 4, 'sw'), s(7, 10, 'ne'), s(4, 10, 'ne'), s(13, 2, 'nw')],
  };

  return {
    W, H, HW, type: theme, zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices: [],
    salon: { x0: 0, y0: 5, x1: 3, y1: 8 },
    bureauDG: [{ x: 13, y: 8 }, { x: 14, y: 8 }],
    tableau: { x0: 4, x1: 8 },
    ascenseur: { y0: 1, y1: 3 },
    horloge: { y: 7.9 },
    pancarte: { gx: 0, gy: 9.8 },
  };
}

// ---------- Loft industriel ----------
// Grand plateau ouvert : cuisine ouverte au fond (comptoir, îlot et tabourets), deux cabines vitrées (les postes
// fermés), la verrière du DG dans l'angle ; une grande table commune au milieu, piliers en fonte ; table de ferme
// pour les réunions, salon en cuir près de l'atelier.
function zoneLoft(x, y) {
  if (x <= 2 && y <= 4) return 'lobby';
  if (x >= 3 && x <= 7 && y <= 3) return 'pause';
  if (x >= 8 && x <= 11 && y <= 1) return 'cabine';
  if (x >= 12 && y <= 4) return 'dg';
  if (x <= 4 && y >= 8) return 'salon';
  if (x >= 10 && y >= 7) return 'reunion';
  if (x <= 2 && y <= 7) return 'atelier';
  return 'def';
}

function carteLoft(theme) {
  const { meubles, cloisons, m, c, fin } = chantier();
  const zones = zonesDe(zoneLoft);

  // --- hall d'ascenseur ---
  m('loft_plante', 0, 0, { variante: 0 });
  m('loft_velo', 2, 0);

  // --- cuisine ouverte ---
  m('loft_comptoir', 3, 0, { variante: 'evier' });
  m('loft_comptoir', 4, 0, { variante: 'cafe' });
  m('loft_comptoir', 5, 0, { variante: 'plaques' });
  m('loft_frigo', 6, 0);
  for (let x = 4; x <= 6; x++) {
    m('loft_ilot', x, 2, { part: x === 4 ? 'g' : x === 6 ? 'd' : 'm' });
    m('loft_tabouret', x, 3, { dir: 'ne', siege: true });
  }

  // --- deux cabines vitrées (postes fermés) ---
  for (const x of [8, 10]) {
    m('bureau', x, 1, { cote: 'n', conn: {} });
    m('chaise', x, 0, { dir: 'sw' });
  }

  // --- verrière du DG ---
  m('fauteuil_dg', 14, 1, { dir: 'sw' });
  m('bureau_dg', 14, 2, { part: 'g', lampe: true });
  m('bureau_dg', 15, 2, { part: 'd', telephone: true });
  m('loft_plante', 15, 0, { variante: 1 });
  m('loft_etagere', 15, 4, { variante: 0 });

  // --- poste machine, établis de l'atelier ---
  m('poste_machine', 0, 5, { part: 'g', theme: 'atelier3d' });
  m('poste_machine', 1, 5, { part: 'd', theme: 'atelier3d' });
  m('chaise', 0, 6, { dir: 'ne' });
  m('loft_etagere', 0, 7, { variante: 1, mur: 'gauche' });

  // --- table commune : huit postes ---
  for (let x = 5; x <= 8; x++) {
    m('bureau', x, 6, { cote: 'n', conn: { w: x > 5, e: x < 8, s: true } });
    m('bureau', x, 7, { cote: 's', conn: { w: x > 5, e: x < 8, n: true } });
    m('chaise', x, 5, { dir: 'sw' });
    m('chaise', x, 8, { dir: 'ne' });
  }

  // --- piliers en fonte ---
  m('loft_pilier', 10, 5);
  m('loft_pilier', 3, 6);

  // --- table de ferme (réunion) ---
  tableReunion(m, 11, 8, 3, 2);
  for (const x of [11, 12, 13]) {
    m('chaise', x, 7, { dir: 'sw' });
    m('chaise', x, 10, { dir: 'ne' });
  }
  m('chaise', 14, 8, { dir: 'nw', variante: 'dg' });
  m('chaise', 14, 9, { dir: 'nw' });
  m('lampadaire', 15, 7);
  m('loft_plante', 15, 11, { variante: 2 });

  // --- salon en cuir ---
  m('canape', 0, 9, { part: 'a', dir: 'se', equipe: true });
  m('canape', 0, 10, { part: 'b', dir: 'se', equipe: true });
  m('table_basse', 1, 9, { variante: 'equipe' });
  m('table_basse', 1, 10, {});
  m('fauteuil', 2, 9, { dir: 'nw' });
  m('fauteuil', 2, 10, { dir: 'nw' });
  m('lampadaire', 4, 8);
  m('loft_moto', 4, 11);

  // --- objets du thème ---
  objetsTheme(m, theme, [[6, 11], [7, 11], [8, 11], [9, 11]]);

  // --- verrières (cloisons) ---
  for (const y of [0, 1]) {
    c(7, y, 'e');
    c(9, y, 'e');
  }
  c(8, 1, 's');
  c(10, 1, 's'); // portes des cabines en x = 9 et x = 11
  for (let y = 0; y <= 4; y++) c(11, y, 'e');
  for (let x = 13; x <= 15; x++) c(x, 4, 's'); // porte du DG en x = 12

  const { bloque, siege, aretes } = fin();

  const postes = [];
  for (let x = 5; x <= 8; x++) {
    postes.push({ cle: 'table-n' + x, chaise: s(x, 5, 'sw', { assis: true }), bureau: { x, y: 6 }, insp: s(x, 4, 'sw'), ferme: false });
    postes.push({ cle: 'table-s' + x, chaise: s(x, 8, 'ne', { assis: true }), bureau: { x, y: 7 }, insp: s(x, 9, 'ne'), ferme: false });
  }
  postes.push({ cle: 'cabine1', chaise: s(8, 0, 'sw', { assis: true }), bureau: { x: 8, y: 1 }, insp: s(9, 0, 'nw'), ferme: true });
  postes.push({ cle: 'cabine2', chaise: s(10, 0, 'sw', { assis: true }), bureau: { x: 10, y: 1 }, insp: s(11, 0, 'nw'), ferme: true });

  const spots = {
    ascenseur: ASCENSEUR(),
    arrivee: ARRIVEE(),
    equipe: [s(0, 9, 'se', { assis: true }), s(0, 10, 'se', { assis: true }), s(2, 9, 'nw', { assis: true }), s(2, 10, 'nw', { assis: true }),
      s(1, 8, 'sw', { lire: true }), s(1, 11, 'ne', { lire: true }), s(2, 8, 'sw'), s(2, 11, 'ne'), s(3, 9, 'nw'), s(3, 10, 'nw'),
      s(3, 8, 'sw'), s(0, 11, 'ne')],
    fileDG: [s(12, 5, 'ne'), s(13, 5, 'nw'), s(14, 5, 'nw'), s(15, 5, 'nw'), s(15, 6, 'ne'), s(14, 6, 'se'), s(13, 6, 'se')],
    visiteurDG: [s(14, 3, 'ne'), s(15, 3, 'ne'), s(13, 3, 'ne'), s(13, 2, 'se')],
    dg: { siege: s(14, 1, 'sw', { assis: true }), tableau: s(12, 1, 'ne'), tete: s(14, 8, 'nw', { assis: true }) },
    postes,
    machine: {
      cle: 'machine', chaise: s(0, 6, 'ne', { assis: true }), bureau: { x: 0, y: 5 }, insp: s(1, 6, 'nw'),
      file: [s(2, 6, 'nw'), s(2, 5, 'nw'), s(2, 7, 'nw'), s(1, 7, 'ne'), s(3, 7, 'nw')],
    },
    pause: [
      s(4, 3, 'ne', { assis: true }), s(5, 3, 'ne', { assis: true }), s(6, 3, 'ne', { assis: true }), s(4, 1, 'ne', { cafe: true }),
      s(3, 1, 'ne'), s(5, 1, 'ne'), s(6, 1, 'ne'), s(7, 1, 'nw'), s(3, 2, 'se'), s(7, 2, 'nw'), s(3, 3, 'se'), s(7, 3, 'nw'),
      s(3, 4, 'ne'), s(7, 0, 'sw'), s(4, 4, 'ne'),
    ],
    reunion: {
      nord: [s(11, 7, 'sw', { assis: true }), s(12, 7, 'sw', { assis: true }), s(13, 7, 'sw', { assis: true })],
      sud: [s(11, 10, 'ne', { assis: true }), s(12, 10, 'ne', { assis: true }), s(13, 10, 'ne', { assis: true })],
      est: [s(14, 9, 'nw', { assis: true })],
      debout: [s(10, 8, 'se'), s(10, 9, 'se'), s(12, 6, 'sw'), s(11, 6, 'sw'), s(13, 11, 'ne'), s(12, 11, 'ne'), s(11, 11, 'ne'),
        s(14, 7, 'sw'), s(14, 10, 'nw'), s(10, 10, 'se'), s(10, 7, 'se'), s(15, 9, 'nw')],
      tete: s(14, 8, 'nw', { assis: true }),
      table: { x0: 11, y0: 8, x1: 13, y1: 9 },
    },
    tourJoy: [s(3, 5, 'se'), s(9, 4, 'sw'), s(12, 6, 'sw'), s(9, 10, 'ne'), s(4, 7, 'ne'), s(9, 2, 'nw')],
  };

  return {
    W, H, HW, type: theme, look: 'bureau-loft', zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices: [],
    salon: { x0: 0, y0: 8, x1: 4, y1: 12 },
    bureauDG: [{ x: 14, y: 2 }, { x: 15, y: 2 }],
    tableau: { x0: 12, x1: 15 },
    ascenseur: { y0: 1, y1: 3 },
    horloge: { y: 6.6 },
    pancarte: { gx: 5, gy: 0.2 },
  };
}

// ---------- Bateau pirate ----------
// Le pont d'un trois-mâts : l'ascenseur sort sur la poupe ; quatre postes « à la bande », face à la mer, et quatre
// autour du grand mât ; la dunette du capitaine (le DG) derrière sa rambarde, avec la barre et deux officiers (les
// postes fermés) ; la table des cartes pour les réunions ; la cambuse et son tonneau de rhum.
function zonePirate(x, y) {
  if (x <= 2 && y <= 4) return 'lobby';
  if (x >= 10 && y <= 4) return 'dg';
  if (x <= 2 && y <= 7) return 'salon';
  if (x <= 3 && y >= 8) return 'pause';
  if (x >= 10 && y >= 6) return 'reunion';
  return 'def';
}

function cartePirate(theme) {
  const { meubles, cloisons, m, c, bord, fin } = chantier();
  const zones = zonesDe(zonePirate);

  // --- rambarde de la dunette (posée en premier) ---
  for (let y = 0; y <= 4; y++) bord('pirate_rambarde', 10, y, 'o', { fin: y === 0 ? 'n' : null });
  for (let x = 10; x <= 15; x++) if (x !== 13) bord('pirate_rambarde', x, 5, 'n', { pilier: x === 10 || x === 12 || x === 14 });

  // --- poupe : arrivée ---
  m('pirate_tonneau', 0, 0, { variante: 0 });
  m('pirate_cordage', 2, 0, { sol: true }); // rouleau de cordage à plat sur le pont : on marche dessus

  // --- postes à la bande, face à la mer ---
  for (let x = 3; x <= 6; x++) {
    m('bureau', x, 0, { cote: 's', conn: { w: x > 3, e: x < 6 } });
    m('chaise', x, 1, { dir: 'ne' });
  }
  m('pirate_canon', 7, 0, { dir: 'ne' });
  m('pirate_canon', 8, 0, { dir: 'ne' });
  m('pirate_tonneau', 9, 0, { variante: 1 });

  // --- grand mât et poste machine à son pied ---
  m('pirate_mat', 8, 3);
  m('pirate_cordage', 9, 4, { variante: 1, sol: true });
  m('poste_machine', 4, 3, { part: 'g', theme });
  m('poste_machine', 5, 3, { part: 'd', theme });
  m('chaise', 4, 4, { dir: 'ne' });

  // --- dunette du capitaine ---
  m('fauteuil_dg', 14, 1, { dir: 'sw' });
  m('bureau_dg', 14, 2, { part: 'g', lampe: true });
  m('bureau_dg', 15, 2, { part: 'd', telephone: true });
  m('pirate_barre', 15, 1);
  m('pirate_coffre', 15, 0);
  for (const x of [10, 12]) {
    m('bureau', x, 2, { cote: 'n', conn: {} });
    m('chaise', x, 1, { dir: 'sw' });
  }
  m('pirate_lanterne', 15, 4);

  // --- postes du pont, autour du mât ---
  for (let x = 4; x <= 7; x++) {
    m('bureau', x, 8, { cote: 'n', conn: { w: x > 4, e: x < 7 } });
    m('chaise', x, 7, { dir: 'sw' });
  }

  // --- table des cartes (réunion) ---
  tableReunion(m, 11, 8, 3, 2);
  m('pirate_carte', 12, 8, { passage: true });
  for (const x of [11, 12, 13]) {
    m('chaise', x, 7, { dir: 'sw' });
    m('chaise', x, 10, { dir: 'ne' });
  }
  m('chaise', 14, 8, { dir: 'nw', variante: 'dg' });
  m('chaise', 14, 9, { dir: 'nw' });
  m('pirate_perroquet', 15, 7);

  // --- salon de l'équipe : caisse et tonneaux en guise de tabourets ---
  m('pirate_caisse', 1, 6, { variante: 'table' });
  m('pirate_tabouret', 0, 6, { siege: true });
  m('pirate_tabouret', 2, 6, { siege: true });
  m('pirate_tabouret', 1, 5, { siege: true });
  m('pirate_tabouret', 1, 7, { siege: true });
  m('pirate_ancre', 0, 7);

  // --- cambuse ---
  m('pirate_rhum', 0, 8);
  m('pirate_caisse', 1, 10, { variante: 'table' });
  m('pirate_tabouret', 0, 10, { siege: true });
  m('pirate_tabouret', 2, 10, { siege: true });
  m('pirate_hamac', 2, 11, { w: 2, h: 1 });
  m('pirate_caisse', 0, 11, { variante: 'pile' });
  m('pirate_tonneau', 1, 11, { variante: 3 });

  // --- cargaison : les objets du thème ---
  objetsTheme(m, theme, [[14, 5], [15, 5], [15, 6], [9, 11]]);
  m('pirate_caisse', 8, 11, { variante: 'pile' });
  m('pirate_tonneau', 15, 11, { variante: 2 });

  const { bloque, siege, aretes } = fin();

  const postes = [];
  for (let x = 3; x <= 6; x++) postes.push({ cle: 'bande' + x, chaise: s(x, 1, 'ne', { assis: true }), bureau: { x, y: 0 }, insp: s(x, 2, 'ne'), ferme: false });
  for (let x = 4; x <= 7; x++) postes.push({ cle: 'pont' + x, chaise: s(x, 7, 'sw', { assis: true }), bureau: { x, y: 8 }, insp: s(x, 6, 'sw'), ferme: false });
  postes.push({ cle: 'second', chaise: s(10, 1, 'sw', { assis: true }), bureau: { x: 10, y: 2 }, insp: s(11, 1, 'nw'), ferme: true });
  postes.push({ cle: 'maitre', chaise: s(12, 1, 'sw', { assis: true }), bureau: { x: 12, y: 2 }, insp: s(11, 2, 'se'), ferme: true });

  const spots = {
    ascenseur: ASCENSEUR(),
    arrivee: ARRIVEE(),
    equipe: [s(0, 6, 'se', { assis: true }), s(2, 6, 'nw', { assis: true }), s(1, 5, 'sw', { assis: true }), s(1, 7, 'ne', { assis: true }),
      s(0, 5, 'se', { lire: true }), s(2, 5, 'sw', { lire: true }), s(4, 5, 'sw'), s(2, 7, 'nw'), s(3, 5, 'sw'), s(3, 6, 'nw'),
      s(3, 7, 'nw'), s(3, 4, 'sw')],
    // la file du capitaine longe la rambarde jusqu'à l'échelle de la dunette
    fileDG: [s(13, 5, 'ne'), s(12, 5, 'se'), s(11, 5, 'se'), s(10, 5, 'se'), s(9, 5, 'se'), s(8, 5, 'se'), s(8, 6, 'ne')],
    visiteurDG: [s(14, 3, 'ne'), s(15, 3, 'ne'), s(13, 3, 'ne'), s(13, 2, 'se')],
    dg: { siege: s(14, 1, 'sw', { assis: true }), tableau: s(13, 1, 'ne'), tete: s(14, 8, 'nw', { assis: true }) },
    postes,
    machine: {
      cle: 'machine', chaise: s(4, 4, 'ne', { assis: true }), bureau: { x: 4, y: 3 }, insp: s(5, 4, 'nw'),
      file: [s(6, 4, 'nw'), s(7, 4, 'nw'), s(6, 5, 'nw'), s(7, 5, 'nw'), s(5, 5, 'ne')],
    },
    pause: [
      s(0, 10, 'se', { assis: true }), s(2, 10, 'nw', { assis: true }), s(1, 8, 'nw', { cafe: true }),
      s(2, 8, 'sw'), s(1, 9, 'sw'), s(0, 9, 'se'), s(2, 9, 'sw'), s(3, 8, 'sw'), s(3, 9, 'nw'), s(3, 10, 'nw'), s(4, 9, 'nw'),
      s(4, 10, 'nw'), s(4, 11, 'nw'), s(5, 10, 'nw'), s(5, 11, 'nw'),
    ],
    reunion: {
      nord: [s(11, 7, 'sw', { assis: true }), s(12, 7, 'sw', { assis: true }), s(13, 7, 'sw', { assis: true })],
      sud: [s(11, 10, 'ne', { assis: true }), s(12, 10, 'ne', { assis: true }), s(13, 10, 'ne', { assis: true })],
      est: [s(14, 9, 'nw', { assis: true })],
      debout: [s(10, 8, 'se'), s(10, 9, 'se'), s(10, 7, 'se'), s(14, 7, 'sw'), s(13, 11, 'ne'), s(12, 11, 'ne'), s(11, 11, 'ne'),
        s(14, 10, 'nw'), s(15, 8, 'nw'), s(15, 9, 'nw'), s(10, 10, 'se'), s(14, 11, 'ne')],
      tete: s(14, 8, 'nw', { assis: true }),
      table: { x0: 11, y0: 8, x1: 13, y1: 9 },
    },
    tourJoy: [s(3, 3, 'se'), s(9, 7, 'sw'), s(12, 4, 'sw'), s(9, 10, 'ne'), s(5, 10, 'ne'), s(15, 10, 'nw')],
  };

  return {
    W, H, HW, type: theme, look: 'bureau-pirate', zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices: [],
    salon: { x0: 0, y0: 5, x1: 3, y1: 8 },
    bureauDG: [{ x: 14, y: 2 }, { x: 15, y: 2 }],
    tableau: { x0: 11, x1: 14 },
    ascenseur: { y0: 1, y1: 3 },
    ascenseurMetal: '#8a5a2b',
    horloge: { y: 6.6 },
    pancarte: { gx: 0, gy: 9.8 },
  };
}

/** @type {Array<{ id: string, famille: string, nom: string, nomEn: string, description: string, descriptionEn: string, construire: (theme: string) => object }>} */
export const SKINS = [
  {
    id: 'bureau-box', famille: 'bureau', nom: 'Labyrinthe de box', nomEn: 'Cubicle maze',
    description: 'Des box gris comme dans les années 90, un couloir en zigzag entre eux',
    descriptionEn: 'Grey 90s cubicles with a zigzag corridor between them',
    construire: carteBox,
  },
  {
    id: 'bureau-loft', famille: 'bureau', nom: 'Loft industriel', nomEn: 'Industrial loft',
    description: 'Briques, piliers en fonte, verrières et grande table commune',
    descriptionEn: 'Bricks, cast-iron pillars, glass partitions and one big shared table',
    construire: carteLoft,
  },
  {
    id: 'bureau-pirate', famille: 'bureau', nom: 'Bateau pirate', nomEn: 'Pirate ship',
    description: 'Le pont d’un bateau : mât, canons, barre du capitaine et tonneau de rhum',
    descriptionEn: 'A ship’s deck: mast, cannons, the captain’s wheel and a rum barrel',
    construire: cartePirate,
  },
];
