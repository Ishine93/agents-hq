// Décors au choix de la famille « isoloir » (1.0.10) : l'étage des demandes directes. Un agent seul (Claude ou Codex)
// y travaille à un grand bureau central, le premier poste (`principal`) ; les sous-agents qu'il lance apparaissent aux
// postes d'à côté et s'évanouissent quand ils ont fini (posteSousAgent dans web/scenes.js). Une deuxième demande
// directe prend un de ces postes latéraux.
// Contrat : web/plans/index.js et tests/plans-etages.js. Module pur (aucun accès au DOM) : n'importe que ./outils.js.
import { W, H, HW, s, grilles, zonesDe } from './outils.js';

// Atelier d'un plan : meubles, cloisons vitrées (dessinées) et arêtes « muettes » qui bloquent sans cloison vitrée
// (barreaux, cordons) : leur dessin est un meuble `passage: true` posé sur la case de devant (web/meubles/isoloir.js).
function atelier() {
  const meubles = [];
  const cloisons = [];
  const muettes = [];
  return {
    meubles,
    cloisons,
    muettes,
    m: (type, x, y, opts = {}) => meubles.push({ type, x, y, ...opts }),
    c: (x, y, cote) => cloisons.push({ x, y, cote }),
    a: (x, y, cote) => muettes.push({ x, y, cote }),
  };
}

// Un poste : la chaise (place assise), la case du bureau (écran cliquable, dossier jaune), une place debout à côté.
const poste = (cle, chaise, bureau, insp, extra = {}) => ({ cle, chaise: { ...chaise, assis: true }, bureau, insp, ferme: false, ...extra });

// Carte complète d'un isoloir : même forme que celles de web/carte.js.
function carteIsoloir(A, { look, zoneDe, spots, ...reste }) {
  const { bloque, siege, aretes } = grilles(A.meubles, [...A.cloisons, ...A.muettes]);
  return {
    W, H, HW, type: 'isoloir', look, zones: zonesDe(zoneDe), meubles: A.meubles, cloisons: A.cloisons, bloque, siege, aretes,
    spots: { ascenseur: { apparition: { gx: 0.18, gy: 2.0 }, tuile: { x: 0, y: 2 } }, ...spots },
    emplacementsServices: [], salon: null, bureauDG: [], tableau: null,
    ascenseur: { y0: 1, y1: 3 },
    ...reste,
  };
}

// ---------- Studio feutré (décor par défaut) ----------
// Une pièce sombre tapissée de mousse acoustique ; au milieu, une cabine vitrée insonorisée : l'agent y tape à un grand
// bureau de studio (micro, table de mixage, enceintes), face à nous. Ses sous-agents ont trois postes à sa droite,
// le long de la vitre. Canapé de velours tourné vers la cabine, coin écoute (platine, fauteuils club), table ronde.
function zoneStudio(x, y) {
  if (x >= 5 && x <= 9 && y >= 4 && y <= 7) return 'cabine';
  if (x <= 2 && y <= 4) return 'lobby';
  if (x <= 3 && y >= 7) return 'pause';
  if (x >= 4 && x <= 9 && y >= 9) return 'salon';
  return 'studio';
}

function studio() {
  const A = atelier();
  const { m, c } = A;
  // --- hall d'ascenseur et mur du fond ---
  m('plante', 0, 0, { variante: 7 });
  m('iso_panneau', 3, 0);
  m('iso_vinyles', 4, 0, { variante: 0 });
  m('iso_vinyles', 5, 0, { variante: 1, platine: true });
  m('lampadaire', 6, 0);
  // piano à queue derrière la cabine : un agent qui attend y joue
  m('iso_piano', 8, 1, { w: 2, h: 2 });
  m('iso_banquette', 7, 2, { dir: 'se', siege: true });
  m('iso_panneau', 10, 0);
  m('plante', 11, 0, { variante: 3 });
  m('iso_enceinte', 12, 0);
  m('iso_guitares', 13, 0);

  // --- la cabine vitrée : grand bureau de studio, l'agent face à nous ---
  m('iso_enceinte', 5, 4);
  m('iso_vinyles', 6, 4, { variante: 2 });
  m('iso_vinyles', 7, 4, { variante: 3, disque: true });
  m('iso_vinyles', 8, 4, { variante: 4 });
  m('iso_enceinte', 9, 4);
  m('fauteuil_dg', 7, 5, { dir: 'sw' });
  m('iso_console', 6, 6, { part: 'g' });
  m('bureau', 7, 6, { cote: 'n', conn: { w: true, e: true } });
  m('iso_console', 8, 6, { part: 'd' });
  for (let x = 5; x <= 9; x++) {
    c(x, 3, 's');
    c(x, 7, 's');
  }
  for (const y of [4, 5, 7]) c(4, y, 'e'); // porte à l'ouest, en (4,6) → (5,6)
  for (let y = 4; y <= 7; y++) c(9, y, 'e');

  // --- postes des sous-agents : trois ordinateurs le long de la vitre ---
  for (const y of [4, 5, 6]) {
    m('iso_poste', 11, y, { face: 'x' });
    m('chaise', 12, y, { dir: 'nw' });
  }
  m('plante', 11, 7, { variante: 5, petite: true });

  // --- poste machine (contre le mur du fond) ---
  m('poste_machine', 14, 0, { part: 'g' });
  m('poste_machine', 15, 0, { part: 'd' });
  m('chaise', 14, 1, { dir: 'ne' });

  // --- coin écoute (pause) : café, platine, fauteuils club ---
  m('machine_cafe', 0, 7, { dir: 'se' });
  m('iso_platine', 0, 8);
  m('table_basse', 1, 10, { variante: 'poufs' });
  m('fauteuil', 0, 10, { dir: 'se' });
  m('fauteuil', 2, 10, { dir: 'nw' });
  m('fauteuil', 1, 11, { dir: 'ne' });
  m('plante', 0, 11, { variante: 6, petite: true });

  // --- salon de velours tourné vers la cabine (l'agent y attend quand il a fini) ---
  for (let x = 5; x <= 8; x++) m('canape_tv', x, 10, { part: x === 5 ? 'g' : x === 8 ? 'd' : 'm' });
  m('table_basse', 6, 9, { variante: 'equipe' });
  m('table_basse', 7, 9, {});
  m('lampadaire', 9, 11);

  // --- table ronde (réunion) et boîte des rendus ---
  m('iso_table_ronde', 13, 9);
  m('chaise', 13, 8, { dir: 'sw' });
  m('chaise', 12, 9, { dir: 'se' });
  m('chaise', 14, 9, { dir: 'nw', variante: 'dg' });
  m('chaise', 13, 10, { dir: 'ne' });
  m('iso_depot', 10, 9);
  m('plante', 15, 11, { variante: 6 });
  m('iso_batterie', 15, 6);
  m('plante', 15, 8, { variante: 4 });

  const postes = [
    poste('isoloir', s(7, 5, 'sw'), { x: 7, y: 6 }, s(8, 5, 'nw'), { principal: true, ferme: true }),
    ...[4, 5, 6].map((y, i) => poste('cote' + (i + 1), s(12, y, 'nw'), { x: 11, y }, s(13, y, 'nw'))),
  ];
  const reunion = {
    nord: [s(13, 8, 'sw', { assis: true })],
    sud: [s(13, 10, 'ne', { assis: true })],
    est: [s(12, 9, 'se', { assis: true })],
    debout: [s(12, 8, 'se'), s(14, 8, 'sw'), s(12, 10, 'se'), s(14, 10, 'nw'), s(13, 11, 'ne')],
    tete: s(14, 9, 'nw', { assis: true }),
    table: { x0: 13, y0: 9, x1: 13, y1: 9 },
  };
  return carteIsoloir(A, {
    look: 'isoloir-studio',
    zoneDe: zoneStudio,
    spots: {
      arrivee: [s(1, 2, 'se'), s(1, 3, 'se'), s(2, 2, 'se'), s(2, 3, 'se'), s(1, 1, 'se'), s(2, 1, 'se'), s(0, 3, 'se')],
      // l'agent qui a fini : le canapé de velours, puis debout autour
      equipe: [s(5, 10, 'ne', { assis: true }), s(6, 10, 'ne', { assis: true }), s(7, 10, 'ne', { assis: true }), s(8, 10, 'ne', { assis: true }),
        s(4, 10, 'ne', { lire: true }), s(9, 10, 'nw', { lire: true }), s(5, 9, 'ne'), s(8, 9, 'ne')],
      // compte IA occupé : on patiente devant la porte de la cabine
      fileDG: [s(3, 6, 'se'), s(3, 5, 'se'), s(3, 4, 'se'), s(2, 5, 'se')],
      visiteurDG: [s(10, 8, 'sw'), s(11, 9, 'nw')],
      dg: { siege: s(3, 2, 'se'), tableau: s(4, 1, 'se'), tete: reunion.tete },
      postes,
      machine: {
        cle: 'machine', chaise: s(14, 1, 'ne', { assis: true }), bureau: { x: 14, y: 0 }, insp: s(15, 1, 'nw'),
        file: [s(14, 3, 'ne'), s(15, 3, 'ne'), s(15, 4, 'ne'), s(13, 3, 'ne')],
      },
      pause: [s(1, 7, 'nw', { cafe: true }), s(7, 2, 'se', { assis: true }), s(0, 10, 'se', { assis: true }), s(2, 10, 'nw', { assis: true }), s(1, 11, 'ne', { assis: true }),
        s(1, 8, 'nw'), s(2, 8, 'sw'), s(1, 9, 'sw'), s(3, 9, 'nw'), s(2, 11, 'ne'), s(3, 11, 'nw')],
      reunion,
      tourJoy: [s(3, 3, 'se'), s(10, 3, 'sw'), s(10, 7, 'sw'), s(4, 8, 'ne'), s(13, 6, 'sw')],
    },
    tapis: [{ x0: 4.2, y0: 8.7, x1: 9.8, y1: 11.6, c0: '#3b1d33', c1: '#7a3a5e' }, { x0: 0.15, y0: 8.8, x1: 3.4, y1: 11.85, c0: '#3a2a1e', c1: '#8a6a3a' }],
    // lumière tamisée : pénombre et halos des lampes
    nuit: true,
    lampes: [{ x: 6.5, y: 0.5, z: 58 }, { x: 9.5, y: 11.5, z: 58 }, { x: 7.5, y: 6.4, z: 40 }, { x: 0.5, y: 8.5, z: 30 }],
    ascenseurMetal: '#8a6a4a',
    horloge: { y: 6.6 },
    pancarte: { gx: 0, gy: 9.7 },
  });
}

// ---------- Cellule de prison ----------
// Un quartier de cellules contre le mur du fond. Au milieu, la grande cellule de l'agent : lit de camp, lavabo-WC en
// inox, boulet au pied, plateau-repas sur le bureau, traits de craie au mur… et il tape quand même. Ses sous-agents
// travaillent dans les cellules voisines, derrière les barreaux. Devant : la coursive, la cour de promenade (pause),
// le parloir (réunion) et le réfectoire (l'agent qui a fini y attend). Le greffe, à l'entrée, reçoit les rendus.
// Les barreaux ne sont pas des cloisons vitrées : ils bloquent par des arêtes muettes et se dessinent comme meubles.
function zoneCellule(x, y) {
  if (x <= 2 && y <= 4) return 'lobby';
  if (x >= 13 && y <= 4) return 'garde';
  if (y <= 4) return 'cellule';
  if (y <= 6) return 'coursive';
  if (x <= 4) return 'pause';
  if (x <= 10) return 'parloir';
  return 'cantine';
}

function cellule() {
  const A = atelier();
  const { m, a } = A;
  // barreaux le long d'une arête : posés sur la case de devant (x, y) ; 'n' = arête avec (x, y - 1), 'w' = avec (x - 1, y)
  const barreaux = (x, y, bord, opts = {}) => {
    m('iso_barreaux', x, y, { bord, passage: true, ...opts });
    if (bord === 'n') a(x, y - 1, 's');
    else a(x - 1, y, 'e');
  };
  // --- barreaux : façade des cellules (portes coulissantes ouvertes en 4, 8 et 12) et murs de séparation ---
  for (let x = 3; x <= 12; x++) {
    if (x === 4 || x === 8 || x === 12) continue;
    barreaux(x, 5, 'n', { porte: x === 3 || x === 9 || x === 11 });
  }
  for (let y = 0; y <= 4; y++) for (const x of [3, 5, 11, 13]) barreaux(x, y, 'w');

  // --- hall d'ascenseur : le greffe (où l'on rend son dossier) et le portique détecteur de métaux ---
  m('iso_guichet', 1, 0, { part: 'g' });
  m('iso_guichet', 2, 0, { part: 'd' });
  m('iso_portique', 1, 4, { passage: true });

  // --- cellule de gauche : un sous-agent ---
  m('iso_lit_camp', 3, 0, { w: 2, h: 1, variante: 1 });
  m('iso_poste', 3, 1, { face: 'y' });
  m('chaise', 3, 2, { dir: 'ne' });

  // --- la grande cellule de l'agent ---
  m('iso_lit_camp', 5, 0, { w: 2, h: 1, variante: 0 });
  m('iso_wc_inox', 10, 0);
  m('iso_boulet', 5, 2);
  m('chaise', 7, 1, { dir: 'sw' });
  m('bureau', 7, 2, { cote: 'n', conn: { e: true } });
  m('iso_aile', 8, 2, { part: 'd' });
  m('iso_gamelle', 9, 3);

  // --- cellule de droite : deux sous-agents ---
  m('iso_lit_camp', 11, 0, { w: 2, h: 1, variante: 2 });
  for (const x of [11, 12]) {
    m('iso_poste', x, 1, { face: 'y' });
    m('chaise', x, 2, { dir: 'ne' });
  }

  // --- poste de garde : écrans de surveillance (poste machine), casiers ---
  m('iso_casier', 13, 0);
  m('poste_machine', 14, 0, { part: 'g' });
  m('poste_machine', 15, 0, { part: 'd' });
  m('chaise', 14, 1, { dir: 'ne' });

  // --- coursive : marquage de la file d'attente ---
  for (let x = 8; x <= 11; x++) m('iso_marquage', x, 6, { passage: true, sol: true, premier: x === 8 });

  // --- cour de promenade (pause), fermée côté parloir par un grillage ---
  m('distributeur', 0, 7);
  m('iso_muscu', 2, 9, { dir: 'se', siege: true });
  m('iso_ballon', 3, 11);
  for (let y = 8; y <= 11; y++) barreaux(5, y, 'w', { grillage: true });

  // --- parloir (réunion) : comptoir à vitre et téléphones, tabourets de part et d'autre ---
  for (let x = 6; x <= 9; x++) {
    m('iso_parloir', x, 9, { conn: { w: x > 6, e: x < 9 } });
    m('iso_tabouret', x, 8, { dir: 'sw', siege: true });
    m('iso_tabouret', x, 10, { dir: 'ne', siege: true });
  }
  m('iso_tabouret', 10, 9, { dir: 'nw', siege: true });

  // --- réfectoire : l'agent qui a fini attend devant son plateau ---
  for (let x = 12; x <= 14; x++) {
    m('iso_table_cantine', x, 9, { conn: { w: x > 12, e: x < 14 } });
    m('iso_banc', x, 8, { dir: 'sw', siege: true, conn: { w: x > 12, e: x < 14 } });
    m('iso_banc', x, 10, { dir: 'ne', siege: true, conn: { w: x > 12, e: x < 14 } });
  }

  const postes = [
    poste('isoloir', s(7, 1, 'sw'), { x: 7, y: 2 }, s(8, 1, 'nw'), { principal: true, ferme: true }),
    poste('cellule-g', s(3, 2, 'ne'), { x: 3, y: 1 }, s(4, 2, 'nw'), { ferme: true }),
    poste('cellule-d1', s(11, 2, 'ne'), { x: 11, y: 1 }, s(11, 3, 'ne'), { ferme: true }),
    poste('cellule-d2', s(12, 2, 'ne'), { x: 12, y: 1 }, s(12, 3, 'ne'), { ferme: true }),
  ];
  const reunion = {
    nord: [6, 7, 8, 9].map((x) => s(x, 8, 'sw', { assis: true })),
    sud: [6, 7, 8, 9].map((x) => s(x, 10, 'ne', { assis: true })),
    est: [],
    debout: [s(10, 8, 'sw'), s(10, 10, 'nw'), s(6, 7, 'sw'), s(9, 7, 'sw'), s(6, 11, 'ne'), s(9, 11, 'ne')],
    tete: s(10, 9, 'nw', { assis: true }),
    table: { x0: 6, y0: 9, x1: 9, y1: 9 },
  };
  return carteIsoloir(A, {
    look: 'isoloir-cellule',
    zoneDe: zoneCellule,
    spots: {
      arrivee: [s(1, 2, 'se'), s(1, 3, 'se'), s(2, 2, 'se'), s(2, 3, 'se'), s(0, 3, 'se'), s(2, 4, 'se'), s(0, 4, 'se')],
      // l'agent qui a fini : au réfectoire, devant un plateau
      equipe: [12, 13, 14].flatMap((x) => [s(x, 8, 'sw', { assis: true }), s(x, 10, 'ne', { assis: true })]).concat([s(11, 9, 'se'), s(15, 9, 'nw')]),
      // compte IA occupé : on attend sur le marquage, devant la porte de la grande cellule
      fileDG: [s(8, 6, 'ne'), s(9, 6, 'nw'), s(10, 6, 'nw'), s(11, 6, 'nw')],
      // le greffe : on y rend son dossier
      visiteurDG: [s(1, 1, 'ne'), s(2, 1, 'ne')],
      dg: { siege: s(3, 6, 'se'), tableau: s(2, 5, 'se'), tete: reunion.tete },
      postes,
      machine: {
        cle: 'machine', chaise: s(14, 1, 'ne', { assis: true }), bureau: { x: 14, y: 0 }, insp: s(15, 1, 'nw'),
        file: [s(14, 3, 'ne'), s(15, 3, 'ne'), s(15, 4, 'ne'), s(14, 4, 'ne')],
      },
      pause: [s(1, 7, 'nw', { cafe: true }), s(2, 9, 'se', { assis: true }), s(1, 9, 'se'), s(3, 8, 'sw'), s(1, 10, 'ne'), s(3, 10, 'nw'),
        s(2, 11, 'ne'), s(0, 10, 'se'), s(4, 9, 'nw')],
      reunion,
      tourJoy: [s(2, 5, 'se'), s(6, 6, 'ne'), s(13, 5, 'sw'), s(11, 7, 'se'), s(4, 7, 'sw')],
    },
    tapis: [],
    ascenseurMetal: '#7d838a',
    horloge: { y: 6.5 },
    pancarte: { gx: 0, gy: 9.6 },
  });
}

// ---------- Suite présidentielle ----------
// Marbre, soie et dorures, la ville la nuit derrière les baies vitrées. Au milieu, l'agent trône à son bureau de marbre ;
// jacuzzi bouillonnant au fond, bar et ses tabourets (pause), lit king size contre le mur gauche, salon, dîner aux
// chandelles (réunion) et le coin bureau des sous-agents. Le chariot du room service reçoit les rendus.
function zoneSuite(x, y) {
  if (x <= 2 && y <= 4) return 'lobby';
  if (x <= 8 && y <= 3) return 'spa';
  if (y <= 3) return 'pause'; // le bar
  if (x <= 3) return 'chambre';
  if (x >= 10 && y <= 7) return 'coin';
  if (x >= 10) return 'diner';
  if (y >= 8) return 'salon';
  return 'centre';
}

function suite() {
  const A = atelier();
  const { m, a } = A;
  // --- entrée : cordon de velours devant la file d'attente ---
  m('plante', 0, 0, { variante: 7 });
  for (let x = 0; x <= 2; x++) {
    m('iso_cordon', x, 4, { passage: true, fin: x === 2 });
    a(x, 3, 's');
  }

  // --- spa : jacuzzi devant les baies vitrées, seau à champagne, serviettes ---
  m('plante', 3, 0, { variante: 1 });
  m('iso_serviettes', 4, 0);
  m('iso_jacuzzi', 5, 1, { w: 2, h: 2 });
  m('iso_champagne', 7, 2);
  m('plante', 8, 0, { variante: 4 });

  // --- bar (pause) ---
  for (let x = 10; x <= 13; x++) {
    m('iso_arriere_bar', x, 0, { part: x === 10 ? 'g' : x === 13 ? 'd' : 'm', variante: x });
    m('iso_comptoir', x, 2, { conn: { w: x > 10, e: x < 13 } });
    m('iso_tabouret_bar', x, 3, { dir: 'ne', siege: true });
  }
  m('plante', 15, 0, { variante: 2 });

  // --- au centre : l'agent sur son trône, bureau de marbre ---
  m('iso_trone', 7, 5, { dir: 'sw', siege: true });
  m('iso_aile', 6, 6, { part: 'g' });
  m('bureau', 7, 6, { cote: 'n', conn: { w: true, e: true } });
  m('iso_aile', 8, 6, { part: 'd' });

  // --- coin bureau des sous-agents (et poste machine) ---
  for (const x of [11, 12, 13]) {
    m('iso_poste', x, 5, { face: 'y' });
    m('chaise', x, 6, { dir: 'ne' });
  }
  m('poste_machine', 14, 5, { part: 'g' });
  m('poste_machine', 15, 5, { part: 'd' });
  m('chaise', 14, 6, { dir: 'ne' });

  // --- chambre : lit king size contre le mur gauche, chevets, banquette au pied du lit ---
  m('table_chevet', 0, 5, { lampe: true });
  m('iso_lit_king', 0, 6, { w: 3, h: 3 });
  m('table_chevet', 0, 9, { lampe: true });
  m('iso_banquette', 3, 7, { dir: 'se', siege: true });

  // --- salon (l'agent qui a fini y attend) ---
  m('canape', 5, 9, { part: 'a', dir: 'se' });
  m('canape', 5, 10, { part: 'b', dir: 'se' });
  m('table_basse', 6, 9, { variante: 'equipe' });
  m('table_basse', 6, 10, {});
  m('fauteuil', 7, 9, { dir: 'nw' });
  m('fauteuil', 7, 10, { dir: 'nw' });
  m('lampadaire', 4, 11);
  m('iso_statue', 9, 11);

  // --- dîner aux chandelles (réunion), piano à queue blanc, chariot du room service ---
  m('iso_table_ronde', 11, 9, { nappe: true });
  m('chaise', 11, 8, { dir: 'sw' });
  m('chaise', 10, 9, { dir: 'se' });
  m('chaise', 12, 9, { dir: 'nw', variante: 'dg' });
  m('chaise', 11, 10, { dir: 'ne' });
  m('iso_piano', 13, 9, { w: 2, h: 2, blanc: true });
  m('iso_banquette', 12, 10, { dir: 'se', siege: true });
  m('iso_chariot', 9, 8);
  m('plante', 15, 8, { variante: 5 });

  const postes = [
    poste('isoloir', s(7, 5, 'sw'), { x: 7, y: 6 }, s(8, 5, 'nw'), { principal: true, ferme: true }),
    ...[11, 12, 13].map((x, i) => poste('coin' + (i + 1), s(x, 6, 'ne'), { x, y: 5 }, s(x, 7, 'ne'))),
  ];
  const reunion = {
    nord: [s(11, 8, 'sw', { assis: true })],
    sud: [s(11, 10, 'ne', { assis: true })],
    est: [s(10, 9, 'se', { assis: true })],
    debout: [s(10, 8, 'se'), s(12, 8, 'sw'), s(10, 10, 'se'), s(11, 11, 'ne'), s(12, 11, 'ne')],
    tete: s(12, 9, 'nw', { assis: true }),
    table: { x0: 11, y0: 9, x1: 11, y1: 9 },
  };
  return carteIsoloir(A, {
    look: 'isoloir-suite',
    zoneDe: zoneSuite,
    spots: {
      arrivee: [s(1, 2, 'se'), s(1, 3, 'se'), s(2, 2, 'se'), s(2, 3, 'se'), s(1, 1, 'se'), s(2, 1, 'se'), s(0, 3, 'se')],
      // l'agent qui a fini : le salon, la banquette du lit
      equipe: [s(5, 9, 'se', { assis: true }), s(5, 10, 'se', { assis: true }), s(7, 9, 'nw', { assis: true }), s(7, 10, 'nw', { assis: true }),
        s(3, 7, 'se', { assis: true }), s(12, 10, 'se', { assis: true }), s(6, 8, 'sw', { lire: true }), s(6, 11, 'ne', { lire: true }), s(8, 10, 'nw')],
      // compte IA occupé : derrière le cordon de velours
      fileDG: [s(2, 4, 'se'), s(1, 4, 'se'), s(0, 4, 'se')],
      visiteurDG: [s(9, 7, 'sw'), s(10, 8, 'nw')],
      dg: { siege: s(3, 1, 'se'), tableau: s(4, 2, 'se'), tete: reunion.tete },
      postes,
      machine: {
        cle: 'machine', chaise: s(14, 6, 'ne', { assis: true }), bureau: { x: 14, y: 5 }, insp: s(15, 6, 'nw'),
        file: [s(14, 7, 'ne'), s(15, 7, 'ne'), s(14, 8, 'ne')],
      },
      pause: [10, 11, 12, 13].map((x) => s(x, 3, 'ne', { assis: true })).concat([s(9, 2, 'se'), s(14, 2, 'nw'), s(9, 3, 'ne'), s(14, 3, 'ne'), s(14, 1, 'nw')]),
      reunion,
      tourJoy: [s(3, 3, 'se'), s(9, 4, 'sw'), s(4, 6, 'ne'), s(10, 7, 'sw'), s(8, 11, 'ne')],
    },
    tapis: [{ x0: 5.25, y0: 4.25, x1: 9.75, y1: 7.75, c0: '#7a1f3a', c1: '#c9a227' }, { x0: 4.4, y0: 8.4, x1: 8.6, y1: 11.6, c0: '#e9dfc8', c1: '#c9b48a' }],
    nuit: true,
    lampes: [{ x: 0.5, y: 5.5, z: 34 }, { x: 0.5, y: 9.5, z: 34 }, { x: 4.5, y: 11.5, z: 58 }, { x: 11.5, y: 9.5, z: 42 }, { x: 11.5, y: 0.5, z: 40 }, { x: 6, y: 2, z: 20 }],
    ascenseurMetal: '#c9a227',
    horloge: { y: 10.6 },
    pancarte: { gx: 11.5, gy: 0 },
  });
}

/** @type {Array<{ id: string, famille: string, nom: string, nomEn: string, description: string, descriptionEn: string, construire: (theme: string) => object }>} */
export const SKINS = [
  {
    id: 'isoloir-studio',
    famille: 'isoloir',
    nom: 'Studio feutré',
    nomEn: 'Soundproof studio',
    description: 'Mousse acoustique, lumière tamisée et cabine vitrée au milieu',
    descriptionEn: 'Acoustic foam, dim light and a glass booth in the middle',
    construire: studio,
  },
  {
    id: 'isoloir-cellule',
    famille: 'isoloir',
    nom: 'Cellule de prison',
    nomEn: 'Prison cell',
    description: 'Barreaux, lit de camp, plateau-repas et traits de craie au mur',
    descriptionEn: 'Bars, a camp bed, a meal tray and chalk tally marks on the wall',
    construire: cellule,
  },
  {
    id: 'isoloir-suite',
    famille: 'isoloir',
    nom: 'Suite présidentielle',
    nomEn: 'Presidential suite',
    description: 'Jacuzzi, lit king size, bar et baies vitrées sur la ville',
    descriptionEn: 'Hot tub, king-size bed, bar and picture windows over the city',
    construire: suite,
  },
];
