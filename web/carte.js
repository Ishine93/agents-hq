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

export function construireCarte(type) {
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
  const bloque = new Uint8Array(W * H);
  const siege = new Uint8Array(W * H);
  for (const it of meubles) {
    const i = it.y * W + it.x;
    if (it.type === 'chaise' || it.type === 'fauteuil_dg' || it.type === 'canape' || it.type === 'fauteuil') siege[i] = 1;
    bloque[i] = 1;
  }
  for (const e of emplacementsServices) bloque[e.y * W + e.x] = 1;
  const aretes = new Set();
  for (const cl of cloisons) aretes.add(cl.x + ',' + cl.y + ',' + cl.cote);

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
      tete: s(15, 8, 'nw', { assis: true }),
      table: { x0: 12, y0: 8, x1: 14, y1: 9 },
    },
  };

  return {
    W, H, HW, type: theme, zones, meubles, cloisons, bloque, siege, aretes, spots, emplacementsServices,
    salon: { x0: 0, y0: 4, x1: 3, y1: 7 },
    bureauDG: theme === 'direction' ? [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }] : [{ x: 4, y: 2 }, { x: 5, y: 2 }],
    tableau: { x0: 4, x1: 7 },
    ascenseur: { y0: 1, y1: 3 },
    horloge: { y: 8.6 },
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
