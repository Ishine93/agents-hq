// Plan d'un étage : même gabarit pour tous, seul le thème change.
// Grille W×H. x croît vers le bas-droite de l'écran, y vers le bas-gauche.
// Murs du fond : le long de y = 0 (mur droit) et de x = 0 (mur gauche).

export const W = 16;
export const H = 12;
export const HW = 84; // hauteur des murs (px)

const s = (x, y, dir, extra = {}) => ({ x, y, dir, ...extra });

function zoneDe(x, y) {
  if (y <= 3) {
    if (x <= 2) return 'lobby';
    if (x <= 7) return 'dg';
    if (x <= 10) return 'bureau1';
    if (x <= 13) return 'bureau2';
    return 'machine';
  }
  if (x <= 3 && y >= 7) return 'pause';
  if (x <= 3 && y <= 6) return 'lobby';
  if (x >= 11 && y >= 6) return 'reunion';
  return 'open';
}

const DECOR_THEME = {
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
const ALIAS_THEME = { unity: 'unreal', godot: 'roblox', comfyui: 'unreal', web: 'atelier3d', python: 'etudes', projet: 'etudes' };

// Sièges : on s'y assoit (collision « siège »), on n'y passe pas.
const SIEGES = new Set(['chaise', 'fauteuil_dg', 'canape', 'fauteuil', 'canape_tv', 'pouf']);

// Grilles de collision (meubles de plusieurs cases : w × h) et arêtes des cloisons.
function grilles(meubles, cloisons, autresBloques = []) {
  const bloque = new Uint8Array(W * H);
  const siege = new Uint8Array(W * H);
  for (const it of meubles) {
    for (let dy = 0; dy < (it.h || 1); dy++) {
      for (let dx = 0; dx < (it.w || 1); dx++) {
        const x = it.x + dx;
        const y = it.y + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (SIEGES.has(it.type)) siege[y * W + x] = 1;
        bloque[y * W + x] = 1;
      }
    }
  }
  for (const e of autresBloques) bloque[e.y * W + e.x] = 1;
  const aretes = new Set();
  for (const cl of cloisons) aretes.add(cl.x + ',' + cl.y + ',' + cl.cote);
  return { bloque, siege, aretes };
}

// Points obligatoires des scènes, sans usage sur les étages partagés (pause, repos) : des cases neutres
// pour que rien ne casse si un cas imprévu y conduit quand même.
function spotsNeutres() {
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

export function construireCarte(type) {
  if (type === 'pause') return carteSallePause();
  if (type === 'repos') return carteSalleRepos();
  if (type === 'direction') return carteDirection();
  const theme = DECOR_THEME[type] ? type : DECOR_THEME[ALIAS_THEME[type]] ? ALIAS_THEME[type] : 'etudes';
  const zones = [];
  for (let y = 0; y < H; y++) {
    zones.push([]);
    for (let x = 0; x < W; x++) zones[y].push(zoneDe(x, y));
  }
  const meubles = [];
  const m = (type_, x, y, opts = {}) => meubles.push({ type: type_, x, y, ...opts });

  // Au sous-sol, les deux bureaux fermés et le bureau du DG accueillent les baies des services (rojo…).
  const sousSol = theme === 'serveur';
  const emplacementsServices = sousSol
    ? [[8, 0], [10, 0], [11, 0], [13, 0], [7, 0]].map(([x, y]) => ({ x, y, devant: s(x, y + 1, 'ne') }))
    : [];
  const libreSousSol = (x, y) => !emplacementsServices.some((e) => e.x === x && e.y === y);

  // --- bureau du DG ---
  m('plante', 3, 0, { variante: 1 });
  if (libreSousSol(7, 0)) m(theme === 'serveur' ? 'baie' : 'etagere', 7, 0);
  if (theme === 'direction') {
    m('bureau_dg', 3, 2, { part: 'g', lampe: true });
    m('bureau_dg', 4, 2, { part: 'm' });
    m('bureau_dg', 5, 2, { part: 'd', telephone: true });
  } else {
    m('bureau_dg', 4, 2, { part: 'g', lampe: true });
    m('bureau_dg', 5, 2, { part: 'd', telephone: true });
  }
  m('fauteuil_dg', 4, 1, { dir: 'sw' });
  m('plante', 7, 3, { variante: 2 });

  // --- bureaux fermés ---
  if (libreSousSol(8, 0)) m('plante', 8, 0, { variante: 3 });
  if (libreSousSol(10, 0)) m(theme === 'serveur' ? 'baie' : 'etagere', 10, 0);
  m('bureau', 9, 2, { cote: 'n', conn: {} });
  m('chaise', 9, 1, { dir: 'sw' });
  if (libreSousSol(11, 0)) m('plante', 11, 0, { variante: 4 });
  if (libreSousSol(13, 0)) m(theme === 'serveur' ? 'baie' : 'etagere', 13, 0);
  m('bureau', 12, 2, { cote: 'n', conn: {} });
  m('chaise', 12, 1, { dir: 'sw' });

  // --- poste machine ---
  m('poste_machine', 14, 0, { part: 'g', theme });
  m('poste_machine', 15, 0, { part: 'd', theme });
  m('chaise', 14, 1, { dir: 'ne' });

  // --- open space : îlot de 8 postes ---
  for (let x = 5; x <= 8; x++) {
    m('bureau', x, 7, { cote: 'n', conn: { w: x > 5, e: x < 8, s: true } });
    m('bureau', x, 8, { cote: 's', conn: { w: x > 5, e: x < 8, n: true } });
    m('chaise', x, 6, { dir: 'sw' });
    m('chaise', x, 9, { dir: 'ne' });
  }

  // --- salle de pause ---
  m('machine_cafe', 0, 7, { dir: 'se' });
  m('plante', 0, 8, { variante: 5 });
  m('canape', 0, 9, { part: 'a', dir: 'se' });
  m('canape', 0, 10, { part: 'b', dir: 'se' });
  m('table_basse', 1, 10, {});
  m('fontaine', 3, 7);

  // --- salle de réunion ---
  for (let x = 12; x <= 14; x++) {
    for (let y = 8; y <= 9; y++) {
      m('table_reunion', x, y, { conn: { w: x > 12, e: x < 14, n: y > 8, s: y < 9 } });
    }
  }
  for (const x of [12, 13, 14]) {
    m('chaise', x, 7, { dir: 'sw' });
    m('chaise', x, 10, { dir: 'ne' });
  }
  m('chaise', 15, 8, { dir: 'nw', variante: 'dg' });
  m('chaise', 15, 9, { dir: 'nw' });

  // --- salon de l'équipe (agents en réserve), à côté de l'ascenseur ---
  m('canape', 0, 4, { part: 'a', dir: 'se', equipe: true });
  m('canape', 0, 5, { part: 'b', dir: 'se', equipe: true });
  m('table_basse', 1, 4, { variante: 'equipe' });
  m('fauteuil', 0, 6, { dir: 'se' });
  m('fauteuil', 2, 6, { dir: 'nw' });

  // --- hall d'ascenseur ---
  m('plante', 0, 0, { variante: 7 });
  if (theme === 'hall') {
    m('accueil', 2, 0, { part: 'a' });
    m('accueil', 2, 1, { part: 'b' });
  }

  // --- décor du thème ---
  const slots = [[10, 11], [10, 10], [4, 11]];
  DECOR_THEME[theme].slice(0, slots.length).forEach((t, i) => m(t, slots[i][0], slots[i][1], { variante: i, dir: 'se' }));

  // --- cloisons vitrées (arêtes) ---
  const cloisons = [];
  const c = (x, y, cote) => cloisons.push({ x, y, cote });
  for (let y = 0; y <= 3; y++) {
    c(2, y, 'e');
    c(7, y, 'e');
    c(10, y, 'e');
    c(13, y, 'e');
  }
  for (const x of [3, 5, 6, 7, 8, 10, 11, 13]) c(x, 3, 's');
  for (const x of [0, 1, 2]) c(x, 6, 's');
  for (let x = 11; x <= 15; x++) c(x, 5, 's');
  for (const y of [6, 8, 9, 10, 11]) c(10, y, 'e');

  // --- grilles de collision ---
  const { bloque, siege, aretes } = grilles(meubles, cloisons, emplacementsServices);

  // --- points de passage ---
  const postes = [];
  for (let x = 5; x <= 8; x++) {
    postes.push({ cle: 'open-n' + x, chaise: s(x, 6, 'sw', { assis: true }), bureau: { x, y: 7 }, insp: s(x, 5, 'sw'), ferme: false });
    postes.push({ cle: 'open-s' + x, chaise: s(x, 9, 'ne', { assis: true }), bureau: { x, y: 8 }, insp: s(x, 10, 'ne'), ferme: false });
  }
  postes.push({ cle: 'bureau1', chaise: s(9, 1, 'sw', { assis: true }), bureau: { x: 9, y: 2 }, insp: s(10, 1, 'nw'), ferme: true });
  postes.push({ cle: 'bureau2', chaise: s(12, 1, 'sw', { assis: true }), bureau: { x: 12, y: 2 }, insp: s(13, 1, 'nw'), ferme: true });

  const spots = {
    ascenseur: { apparition: { gx: 0.18, gy: 2.0 }, tuile: { x: 0, y: 2 } },
    arrivee: [s(1, 2, 'se'), s(2, 3, 'se'), s(1, 3, 'se'), s(2, 2, 'se'), s(1, 1, 'se'), s(0, 3, 'se'), s(1, 0, 'se'),
      s(3, 4, 'se'), s(3, 5, 'se'), s(2, 4, 'se')],
    // réserve : sièges du salon d'abord, puis debout autour, puis le couloir
    equipe: [s(0, 4, 'se', { assis: true }), s(0, 5, 'se', { assis: true }), s(0, 6, 'se', { assis: true }), s(2, 6, 'nw', { assis: true }),
      s(1, 5, 'nw', { lire: true }), s(2, 5, 'sw', { lire: true }), s(1, 6, 'ne'), s(6, 4, 'sw'), s(7, 4, 'sw'), s(8, 4, 'sw'),
      s(9, 5, 'sw'), s(10, 5, 'sw')],
    fileDG: [s(4, 4, 'ne'), s(4, 5, 'ne'), s(4, 6, 'ne'), s(4, 7, 'ne'), s(4, 8, 'ne'), s(4, 9, 'ne'), s(4, 10, 'ne')],
    visiteurDG: [s(4, 3, 'ne'), s(5, 3, 'ne'), s(3, 3, 'ne'), s(6, 3, 'nw')],
    dg: { siege: s(4, 1, 'sw', { assis: true }), tableau: s(6, 1, 'ne'), tete: s(15, 8, 'nw', { assis: true }) },
    postes,
    machine: {
      cle: 'machine', chaise: s(14, 1, 'ne', { assis: true }), bureau: { x: 14, y: 0 }, insp: s(15, 1, 'nw'),
      file: [s(14, 3, 'ne'), s(15, 3, 'ne'), s(15, 4, 'ne'), s(14, 4, 'ne'), s(13, 4, 'se')],
    },
    pause: [
      s(0, 9, 'se', { assis: true }), s(0, 10, 'se', { assis: true }), s(1, 7, 'nw', { cafe: true }),
      s(2, 8, 'sw'), s(2, 10, 'nw'), s(1, 8, 'se'), s(2, 9, 'nw'), s(3, 8, 'sw'), s(1, 11, 'ne'), s(3, 10, 'nw'),
      s(2, 11, 'ne'), s(2, 7, 'sw'), s(3, 9, 'nw'), s(0, 11, 'ne'), s(3, 11, 'ne'),
    ],
    reunion: {
      nord: [s(12, 7, 'sw', { assis: true }), s(13, 7, 'sw', { assis: true }), s(14, 7, 'sw', { assis: true })],
      sud: [s(12, 10, 'ne', { assis: true }), s(13, 10, 'ne', { assis: true }), s(14, 10, 'ne', { assis: true })],
      est: [s(15, 9, 'nw', { assis: true })],
      // plus de monde que de chaises : les suivants restent debout autour de la table
      debout: [s(11, 8, 'se'), s(11, 9, 'se'), s(13, 6, 'sw'), s(12, 6, 'sw'), s(14, 6, 'sw'), s(13, 11, 'ne'), s(12, 11, 'ne'),
        s(14, 11, 'ne'), s(15, 7, 'sw'), s(15, 10, 'nw'), s(11, 10, 'se')],
      tete: s(15, 8, 'nw', { assis: true }),
      table: { x0: 12, y0: 8, x1: 14, y1: 9 },
    },
    tourJoy: [s(3, 5, 'se'), s(8, 4, 'sw'), s(13, 4, 'sw'), s(7, 10, 'ne'), s(4, 10, 'ne'), s(6, 3, 'nw')],
  };

  return {
    W, H, HW, type: theme, zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices,
    salon: { x0: 0, y0: 4, x1: 3, y1: 7 },
    bureauDG: theme === 'direction' ? [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }] : [{ x: 4, y: 2 }, { x: 5, y: 2 }],
    tableau: { x0: 4, x1: 7 },
    ascenseur: { y0: 1, y1: 3 },
    horloge: { y: 8.6 },
    pancarte: { gx: 0, gy: 9.8 },
  };
}

// ---------- Direction : le bureau du DG (et pas un open space comme les autres étages) ----------
// Accueil près de l'ascenseur ; grand bureau du DG (baies vitrées, tableau blanc, salon privé) ; deux bureaux
// d'assistants (dont la « salle des marchés ») ; salle du conseil contre le mur gauche ; salon-bar ; un îlot
// de 4 postes pour les tâches de synthèse.
function zoneDirection(x, y) {
  if (x <= 2 && y <= 4) return 'lobby';
  if (x >= 3 && x <= 10 && y <= 4) return 'dg';
  if (x >= 11 && x <= 12 && y <= 3) return 'bureau1';
  if (x >= 13 && y <= 3) return 'machine';
  if (x <= 4 && y >= 6) return 'reunion';
  if (x >= 6 && x <= 10 && y >= 6) return 'pause';
  return 'open';
}

function carteDirection() {
  const zones = [];
  for (let y = 0; y < H; y++) {
    zones.push([]);
    for (let x = 0; x < W; x++) zones[y].push(zoneDirection(x, y));
  }
  const meubles = [];
  const m = (type_, x, y, opts = {}) => meubles.push({ type: type_, x, y, ...opts });

  // --- accueil ---
  m('plante', 0, 0, { variante: 7 });
  m('accueil', 2, 0, { part: 'a' });
  m('accueil', 2, 1, { part: 'b' });
  m('plante', 0, 4, { variante: 3 });

  // --- grand bureau du DG ---
  m('etagere', 3, 0);
  m('plante', 4, 0, { variante: 1, petite: true });
  m('trophee', 6, 0);
  m('etagere', 10, 0);
  m('bureau_dg', 4, 2, { part: 'g', lampe: true });
  m('bureau_dg', 5, 2, { part: 'm' });
  m('bureau_dg', 6, 2, { part: 'd', telephone: true });
  m('fauteuil_dg', 5, 1, { dir: 'sw' });
  m('globe', 3, 3);
  // salon privé du DG
  m('plante', 8, 2, { variante: 2 });
  m('canape', 8, 3, { part: 'a', dir: 'se' });
  m('canape', 8, 4, { part: 'b', dir: 'se' });
  m('table_basse', 9, 3, {});
  m('table_basse', 9, 4, {});
  m('fauteuil', 10, 3, { dir: 'nw' });
  m('fauteuil', 10, 4, { dir: 'nw' });
  m('lampadaire', 10, 2);

  // --- bureaux des assistants ---
  m('bureau', 11, 2, { cote: 'n', conn: {} });
  m('chaise', 11, 1, { dir: 'sw' });
  m('plante', 12, 0, { variante: 4 });
  m('plante', 13, 0, { variante: 6, petite: true });
  m('poste_machine', 14, 0, { part: 'g', theme: 'direction' });
  m('poste_machine', 15, 0, { part: 'd', theme: 'direction' });
  m('chaise', 14, 1, { dir: 'ne' });

  // --- salle du conseil ---
  for (let x = 1; x <= 3; x++) {
    for (let y = 8; y <= 9; y++) m('table_reunion', x, y, { conn: { w: x > 1, e: x < 3, n: y > 8, s: y < 9 } });
    m('chaise', x, 7, { dir: 'sw' });
    m('chaise', x, 10, { dir: 'ne' });
  }
  m('chaise', 4, 8, { dir: 'nw', variante: 'dg' });
  m('chaise', 4, 9, { dir: 'nw' });
  m('etagere', 0, 6, { mur: 'gauche' });
  m('etagere', 0, 11, { mur: 'gauche' });
  m('plante', 5, 11, { variante: 5 });

  // --- salon-bar ---
  m('lampadaire', 6, 7);
  m('canape', 6, 8, { part: 'a', dir: 'se', equipe: true });
  m('canape', 6, 9, { part: 'b', dir: 'se', equipe: true });
  m('table_basse', 7, 8, { variante: 'equipe' });
  m('table_basse', 7, 9, {});
  m('fauteuil', 8, 8, { dir: 'nw' });
  m('fauteuil', 8, 9, { dir: 'nw' });
  m('plante', 6, 11, { variante: 2 });
  m('machine_cafe', 10, 6, { dir: 'se' });
  m('fontaine', 10, 7);
  m('plante', 10, 11, { variante: 6 });

  // --- îlot des postes (tâches de synthèse) ---
  for (const x of [12, 13]) {
    m('bureau', x, 7, { cote: 'n', conn: { w: x > 12, e: x < 13, s: true } });
    m('bureau', x, 8, { cote: 's', conn: { w: x > 12, e: x < 13, n: true } });
    m('chaise', x, 6, { dir: 'sw' });
    m('chaise', x, 9, { dir: 'ne' });
  }
  m('plante', 15, 6, { variante: 1 });
  m('plante', 15, 11, { variante: 3 });

  // --- cloisons vitrées ---
  const cloisons = [];
  const c = (x, y, cote) => cloisons.push({ x, y, cote });
  for (let y = 0; y <= 4; y++) {
    if (y <= 3) c(2, y, 'e'); // accueil | bureau du DG (on entre par le couloir)
    c(10, y, 'e'); // bureau du DG | assistants
  }
  for (let x = 3; x <= 10; x++) if (x !== 5 && x !== 6) c(x, 4, 's'); // porte du DG en 5-6
  for (let y = 0; y <= 3; y++) c(12, y, 'e');
  for (const x of [11, 13, 15]) c(x, 3, 's'); // portes des assistants en 12 et 14
  // salle du conseil : deux portes sur sa droite, côté nord (6-7) et côté sud (10-11)
  for (let x = 0; x <= 4; x++) c(x, 5, 's');
  for (const y of [8, 9]) c(4, y, 'e');

  const { bloque, siege, aretes } = grilles(meubles, cloisons);

  const postes = [{ cle: 'bureau1', chaise: s(11, 1, 'sw', { assis: true }), bureau: { x: 11, y: 2 }, insp: s(12, 1, 'nw'), ferme: true }];
  for (const x of [12, 13]) {
    postes.push({ cle: 'ilot-n' + x, chaise: s(x, 6, 'sw', { assis: true }), bureau: { x, y: 7 }, insp: s(x, 5, 'sw'), ferme: false });
    postes.push({ cle: 'ilot-s' + x, chaise: s(x, 9, 'ne', { assis: true }), bureau: { x, y: 8 }, insp: s(x, 10, 'ne'), ferme: false });
  }

  const spots = {
    ascenseur: { apparition: { gx: 0.18, gy: 2.0 }, tuile: { x: 0, y: 2 } },
    arrivee: [s(1, 2, 'se'), s(1, 3, 'se'), s(2, 3, 'se'), s(2, 2, 'se'), s(1, 1, 'se'), s(1, 4, 'se'), s(2, 4, 'se'), s(0, 3, 'se'),
      s(3, 5, 'se'), s(4, 5, 'se')],
    // réserve : le salon-bar
    equipe: [s(6, 8, 'se', { assis: true }), s(6, 9, 'se', { assis: true }), s(8, 8, 'nw', { assis: true }), s(8, 9, 'nw', { assis: true }),
      s(7, 7, 'sw', { lire: true }), s(7, 10, 'ne', { lire: true }), s(9, 8, 'nw'), s(9, 9, 'nw'), s(8, 10, 'ne'), s(9, 7, 'sw'),
      s(8, 7, 'sw'), s(9, 10, 'ne')],
    fileDG: [s(5, 5, 'ne'), s(6, 5, 'ne'), s(5, 6, 'ne'), s(5, 7, 'ne'), s(5, 8, 'ne'), s(5, 9, 'ne'), s(5, 10, 'ne')],
    visiteurDG: [s(5, 3, 'ne'), s(4, 3, 'ne'), s(6, 3, 'ne'), s(7, 3, 'nw')],
    dg: { siege: s(5, 1, 'sw', { assis: true }), tableau: s(9, 1, 'ne'), tete: s(4, 8, 'nw', { assis: true }) },
    postes,
    machine: {
      cle: 'machine', chaise: s(14, 1, 'ne', { assis: true }), bureau: { x: 14, y: 0 }, insp: s(15, 1, 'nw'),
      file: [s(14, 3, 'ne'), s(15, 3, 'ne'), s(14, 4, 'ne'), s(15, 4, 'ne'), s(13, 4, 'se')],
    },
    pause: [s(11, 6, 'nw', { cafe: true }), s(11, 7, 'nw'), s(9, 6, 'se'), s(11, 8, 'nw'), s(10, 8, 'nw'), s(10, 9, 'nw'), s(9, 11, 'ne'),
      s(7, 11, 'ne'), s(11, 10, 'nw'), s(8, 11, 'ne')],
    reunion: {
      nord: [s(1, 7, 'sw', { assis: true }), s(2, 7, 'sw', { assis: true }), s(3, 7, 'sw', { assis: true })],
      sud: [s(1, 10, 'ne', { assis: true }), s(2, 10, 'ne', { assis: true }), s(3, 10, 'ne', { assis: true })],
      est: [s(4, 9, 'nw', { assis: true })],
      debout: [s(1, 6, 'sw'), s(2, 6, 'sw'), s(3, 6, 'sw'), s(1, 11, 'ne'), s(2, 11, 'ne'), s(3, 11, 'ne'), s(4, 7, 'sw'), s(4, 10, 'nw'),
        s(4, 6, 'sw'), s(4, 11, 'nw')],
      tete: s(4, 8, 'nw', { assis: true }),
      table: { x0: 1, y0: 8, x1: 3, y1: 9 },
    },
    tourJoy: [s(3, 5, 'se'), s(8, 5, 'sw'), s(12, 4, 'sw'), s(9, 10, 'ne'), s(5, 10, 'ne'), s(14, 10, 'nw')],
  };

  return {
    W, H, HW, type: 'direction', zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices: [],
    salon: { x0: 6, y0: 7, x1: 10, y1: 11 },
    // tapis : bureau du DG (rouge et or)
    tapis: [{ x0: 3.3, y0: 1.3, x1: 7.7, y1: 4.6, c0: '#c9a227', c1: '#8c2433' }],
    bureauDG: [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }],
    tableau: { x0: 7, x1: 10 },
    ascenseur: { y0: 1, y1: 3 },
    horloge: { y: 6.4 },
    pancarte: { gx: 0, gy: 11.3 },
  };
}

// ---------- Salle de pause : les agents qui attendent leur tour y jouent ----------
function zonePause(x, y) {
  if (x <= 2 && y <= 3) return 'lobby';
  if (x <= 2 && y <= 7) return 'cafe';
  if (x <= 4 && y >= 8) return 'poufs';
  if (x <= 9 && y <= 4) return 'tele';
  if (x <= 9) return 'billard';
  if (y <= 1) return 'arcade';
  if (y <= 6) return 'babyfoot';
  return 'pingpong';
}

function carteSallePause() {
  const zones = [];
  for (let y = 0; y < H; y++) {
    zones.push([]);
    for (let x = 0; x < W; x++) zones[y].push(zonePause(x, y));
  }
  const meubles = [];
  const m = (type_, x, y, opts = {}) => meubles.push({ type: type_, x, y, ...opts });
  // hall d'ascenseur et mur du fond
  m('plante', 0, 0, { variante: 7 });
  m('plante', 3, 0, { variante: 1 });
  m('meuble_tv', 5, 0, { part: 'g' });
  m('meuble_tv', 6, 0, { part: 'd' });
  m('jukebox', 8, 0);
  m('arcade', 14, 0, { variante: 0 });
  m('arcade', 15, 0, { variante: 1 });
  // salon télé : canapé tourné vers l'écran (mur du fond), table basse, poufs
  for (let x = 4; x <= 7; x++) m('canape_tv', x, 3, { part: x === 4 ? 'g' : x === 7 ? 'd' : 'm' });
  m('table_basse', 5, 2, { variante: 'tele' });
  m('table_basse', 6, 2, { variante: 'tele' });
  m('pouf', 3, 2, { dir: 'se' });
  m('pouf', 8, 2, { dir: 'nw' });
  // jeux (meubles de deux cases)
  m('billard', 6, 7, { w: 2, h: 1, jeu: 'billard' });
  m('babyfoot', 11, 4, { w: 2, h: 1, jeu: 'babyfoot' });
  m('pingpong', 11, 9, { w: 2, h: 1, jeu: 'pingpong' });
  // coin café (mur gauche)
  m('machine_cafe', 0, 6, { dir: 'se' });
  m('distributeur', 0, 7);
  // coin poufs
  m('table_basse', 1, 9, { variante: 'poufs' });
  m('pouf', 1, 8, { dir: 'sw' });
  m('pouf', 0, 9, { dir: 'se' });
  m('pouf', 2, 9, { dir: 'nw' });
  m('pouf', 1, 10, { dir: 'ne' });
  m('plante', 0, 8, { variante: 5 }); // (pas en 0,11 : le pouf de gauche n'aurait plus d'accès)
  m('plante', 15, 6, { variante: 2 });
  m('plante', 15, 11, { variante: 6 });

  const cloisons = [];
  const { bloque, siege, aretes } = grilles(meubles, cloisons);
  // Places de jeu, dans l'ordre où on les remplit : on forme d'abord des duos (billard, baby-foot)
  // pour qu'un agent seul ne joue pas contre personne.
  const J = (x, y, dir, activite, extra = {}) => s(x, y, dir, { activite, ...extra });
  const T = (x, y, dir) => J(x, y, dir, 'tele', { assis: true, centre: [6, 0.5] });
  const B = (x, y, dir) => J(x, y, dir, 'billard', { table: 'billard', centre: [7, 7.5] });
  const F = (x, y, dir) => J(x, y, dir, 'babyfoot', { table: 'babyfoot', centre: [12, 4.5] });
  const Pg = (x, y, dir) => J(x, y, dir, 'pingpong', { table: 'pingpong', centre: [12, 9.5] });
  const Pf = (x, y, dir) => J(x, y, dir, 'pouf', { assis: true, centre: [1.5, 9.5] });
  const A = (x, y) => J(x, y, 'ne', 'arcade', { centre: [x + 0.5, 0.5] });
  const C = (x, y) => J(x, y, 'nw', 'cafe', { cafe: true, centre: [0.5, y + 0.5] });
  const jeu = [
    T(5, 3, 'ne'), B(5, 7, 'se'), B(8, 7, 'nw'), F(11, 3, 'sw'), F(11, 5, 'ne'), T(6, 3, 'ne'), A(14, 1),
    Pf(1, 8, 'sw'), Pf(2, 9, 'nw'), F(12, 3, 'sw'), F(12, 5, 'ne'), Pg(10, 9, 'se'), Pg(13, 9, 'nw'),
    T(4, 3, 'ne'), T(7, 3, 'ne'), C(1, 6), A(15, 1), B(6, 6, 'sw'), B(7, 8, 'ne'), Pf(0, 9, 'se'), Pf(1, 10, 'ne'),
    T(3, 2, 'se'), T(8, 2, 'nw'), C(1, 7),
    // spectateurs (pas juste derrière un joueur : on les verrait l'un sur l'autre)
    J(9, 6, 'nw', 'regarde', { centre: [7, 7.5] }), J(14, 5, 'nw', 'regarde', { centre: [12, 4.5] }),
    J(10, 10, 'ne', 'regarde', { centre: [12, 9.5] }), J(4, 8, 'se', 'regarde', { centre: [7, 7.5] }),
  ];
  const spots = {
    ...spotsNeutres(),
    jeu,
    tourJoy: [s(3, 4, 'se'), s(9, 4, 'sw'), s(9, 9, 'nw'), s(13, 7, 'sw'), s(4, 9, 'ne'), s(10, 2, 'sw')],
  };
  return {
    W, H, HW, type: 'pause', zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices: [],
    salon: null,
    tapis: [{ x0: 3.15, y0: 1.2, x1: 8.85, y1: 4.75, c0: '#4b2f6b', c1: '#7b56a6' }, { x0: 0.15, y0: 7.9, x1: 3.75, y1: 11.1, c0: '#2a6b5a', c1: '#49a88b' }],
    bureauDG: [],
    tableau: null,
    tele: { x0: 4.3, x1: 7.7 },
    ascenseur: { y0: 1, y1: 3 },
    horloge: { y: 8.6 },
    pancarte: { gx: 0, gy: 10.3 },
  };
}

// ---------- Salle de repos : les agents en réserve y dorment ----------
function zoneRepos(x, y) {
  if (x <= 2 && y <= 4) return 'lobby';
  if (y <= 1) return 'lits-fond';
  if (x <= 1) return 'lits-gauche';
  if (y >= 5 && y <= 6) return 'lits-milieu';
  if (y >= 9) return 'lits-devant';
  return 'allee';
}

function carteSalleRepos() {
  const zones = [];
  for (let y = 0; y < H; y++) {
    zones.push([]);
    for (let x = 0; x < W; x++) zones[y].push(zoneRepos(x, y));
  }
  const meubles = [];
  const m = (type_, x, y, opts = {}) => meubles.push({ type: type_, x, y, ...opts });
  const lits = [];
  // Place d'un dormeur : la case du pied du lit (on y entre), la tête sur l'oreiller.
  // axe 'y' : tête au fond (mur droit) ; axe 'x' : tête contre le mur gauche.
  const place = (lit, niveau, z) => {
    const pied = lit.axe === 'y' ? { x: lit.x, y: lit.y + 1 } : { x: lit.x + 1, y: lit.y };
    const extra = { couche: { ox: lit.x, oy: lit.y, axe: lit.axe, z, niveau: niveau || 0 } };
    if (niveau) extra.niveau = niveau;
    return s(pied.x, pied.y, lit.axe === 'y' ? 'sw' : 'se', extra);
  };
  m('plante', 0, 0, { variante: 7 });
  // lits superposés le long du mur du fond
  const fond = [];
  [4, 6, 8, 10, 12, 14].forEach((x, i) => {
    const l = { type: 'lit_superpose', x, y: 0, w: 1, h: 2, axe: 'y', variante: i };
    meubles.push(l);
    fond.push(l);
  });
  for (const x of [5, 9, 13]) m('table_chevet', x, 0, { lampe: true });
  m('plante', 7, 0, { variante: 4, petite: true });
  m('plante', 11, 0, { variante: 2, petite: true });
  m('plante', 15, 0, { variante: 6 });
  // lits superposés contre le mur gauche
  const gauche = [];
  [6, 8, 10].forEach((y, i) => {
    const l = { type: 'lit_superpose', x: 0, y, w: 2, h: 1, axe: 'x', variante: i + 2 };
    meubles.push(l);
    gauche.push(l);
  });
  m('table_chevet', 0, 7, { lampe: true });
  m('table_chevet', 0, 9, { lampe: false });
  m('plante', 0, 11, { variante: 1 });
  // lits simples au milieu, matelas au sol devant
  const milieu = [];
  [5, 7, 9, 11, 13].forEach((x, i) => {
    const l = { type: 'lit', x, y: 5, w: 1, h: 2, axe: 'y', variante: i };
    meubles.push(l);
    milieu.push(l);
  });
  const devant = [];
  [5, 7, 9, 11, 13].forEach((x, i) => {
    const l = { type: 'futon', x, y: 9, w: 1, h: 2, axe: 'y', variante: i + 1 };
    meubles.push(l);
    devant.push(l);
  });
  m('lampadaire', 3, 5);
  m('plante', 15, 5, { variante: 3 });
  m('plante', 15, 11, { variante: 5 });
  // ordre de remplissage : lits du fond (bas puis haut), lits du milieu, mur gauche, matelas
  // hauteurs des matelas : voir MATELAS dans decor.js
  for (const l of fond) lits.push(place(l, 1, 14), place(l, 2, 48));
  for (const l of milieu) lits.push(place(l, 0, 14));
  for (const l of gauche) lits.push(place(l, 1, 14), place(l, 2, 48));
  for (const l of devant) lits.push(place(l, 0, 6));

  const cloisons = [];
  const { bloque, siege, aretes } = grilles(meubles, cloisons);
  const spots = {
    ...spotsNeutres(),
    lits,
    tourJoy: [s(3, 3, 'se'), s(8, 3, 'sw'), s(13, 3, 'sw'), s(8, 8, 'ne'), s(3, 8, 'ne')],
  };
  return {
    W, H, HW, type: 'repos', zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices: [],
    salon: null,
    tapis: [{ x0: 3.2, y0: 2.2, x1: 15.8, y1: 4.8, c0: '#3b3270', c1: '#5a4c9a' }, { x0: 3.2, y0: 7.2, x1: 15.8, y1: 8.8, c0: '#3b3270', c1: '#5a4c9a' }],
    bureauDG: [],
    tableau: null,
    nuit: true,
    lampes: [{ x: 5.5, y: 0.45, z: 32 }, { x: 9.5, y: 0.45, z: 32 }, { x: 13.5, y: 0.45, z: 32 }, { x: 0.45, y: 7.5, z: 32 }, { x: 3.5, y: 5.5, z: 58 }],
    ascenseur: { y0: 1, y1: 3 },
    horloge: { y: 7.5 },
    pancarte: { gx: 0, gy: 9.8 },
  };
}

// Une case est-elle praticable (en passage) ?
export function praticable(carte, x, y) {
  if (x < 0 || y < 0 || x >= carte.W || y >= carte.H) return false;
  return !carte.bloque[y * carte.W + x];
}

// Le passage de (x,y) à (x+dx, y+dy) traverse-t-il une cloison ?
export function cloisonEntre(carte, x, y, dx, dy) {
  if (dx === 1) return carte.aretes.has(x + ',' + y + ',e');
  if (dx === -1) return carte.aretes.has(x - 1 + ',' + y + ',e');
  if (dy === 1) return carte.aretes.has(x + ',' + y + ',s');
  if (dy === -1) return carte.aretes.has(x + ',' + (y - 1) + ',s');
  return false;
}
