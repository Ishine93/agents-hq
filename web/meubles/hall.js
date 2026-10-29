// Meubles, sols et murs des décors au choix de la famille « hall » (1.0.10). Contrat : web/meubles/index.js.
// Grand hall (marbre, rosace, colonnes, porte tambour, comptoir d'accueil), tour de verre (façade vitrée, bassin,
// mur végétal) et hall au dinosaure (squelette de tyrannosaure, vitrines, tourniquets en laiton). Même pixel art que
// web/decor.js : volumes en prismes, lumière en haut à gauche, contour sombre.

// ---------- outils ----------
const graine = (O, it) => O.aleatoire(O.hacher(it.type + '|' + it.x + ',' + it.y + '|' + (it.variante ?? '')));
const VERRE = 'rgba(170,220,255,0.32)';
const REFLET = 'rgba(255,255,255,0.45)';

// Cylindre vertical (colonne, pot, socle) : centre (cx, cy) et rayon r en cases, de z0 à z1.
function cylindre(O, g, P, cx, cy, r, z0, z1, col, dessus = null) {
  const [sx, sy] = P(cx, cy, 0);
  const A = r * 45.25;
  const B = A / 2;
  const teintes = [O.nuance(col, 0.2), O.nuance(col, 0.08), col, O.nuance(col, -0.12), O.nuance(col, -0.26)];
  for (let i = Math.floor(-A); i <= Math.ceil(A); i++) {
    const u = Math.max(-1, Math.min(1, i / A));
    const hh = B * Math.sqrt(Math.max(0, 1 - u * u));
    g.fillStyle = teintes[Math.min(4, Math.floor(((u + 1) / 2) * 5))];
    g.fillRect(Math.round(sx + i), Math.round(sy - z1 - hh), 1, Math.max(1, Math.round(z1 - z0 + 2 * hh) + 1));
  }
  g.fillStyle = dessus || O.nuance(col, 0.24);
  for (let i = Math.floor(-A); i <= Math.ceil(A); i++) {
    const u = Math.max(-1, Math.min(1, i / A));
    const hh = B * Math.sqrt(Math.max(0, 1 - u * u));
    g.fillRect(Math.round(sx + i), Math.round(sy - z1 - hh), 1, Math.max(1, Math.round(2 * hh) + 1));
  }
}

// Volume de verre : O.prisme ne sait pas assombrir une couleur rgba, on pose donc les faces une à une (le fond
// d'abord, on voit à travers).
function prismeVerre(O, g, P, x0, y0, x1, y1, z0, z1, a = 0.25) {
  const c = (k) => `rgba(170,220,255,${Math.min(1, a * k).toFixed(2)})`;
  O.quadY(g, P, y0, x0, x1, z0, z1, c(0.6));
  O.quadX(g, P, x0, y0, y1, z0, z1, c(0.6));
  O.quadY(g, P, y1, x0, x1, z0, z1, c(1));
  O.quadX(g, P, x1, y0, y1, z0, z1, c(1.3));
  O.quadZ(g, P, z1, x0, y0, x1, y1, c(1.6));
}

// Trait épais entre deux points 3D (os, cordes, montants fins).
function trait(O, g, P, a, b, col, ep = 2) {
  const p0 = P(...a);
  const p1 = P(...b);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(p1[0] - p0[0]), Math.abs(p1[1] - p0[1]))));
  g.fillStyle = col;
  for (let k = 0; k <= n; k++) g.fillRect(Math.round(p0[0] + ((p1[0] - p0[0]) * k) / n - ep / 2), Math.round(p0[1] + ((p1[1] - p0[1]) * k) / n - ep / 2), ep, ep);
}

// Sur un bord de case : 'n' (le long de x, en v = 0) ou 'o' (le long de y, en u = 0). Pr(a0, b0, a1, b1…) : a le long
// du bord, b en travers.
const surBord = (O, g, P, bord) => (bord === 'n'
  ? (a0, b0, a1, b1, z0, z1, col) => O.prisme(g, P, a0, b0, a1, b1, z0, z1, col)
  : (a0, b0, a1, b1, z0, z1, col) => O.prisme(g, P, b0, a0, b1, a1, z0, z1, col));
const quadBord = (O, g, P, bord) => (bord === 'n'
  ? (b, a0, a1, z0, z1, col) => O.quadY(g, P, b, a0, a1, z0, z1, col)
  : (b, a0, a1, z0, z1, col) => O.quadX(g, P, b, a0, a1, z0, z1, col));

// ---------- portiques d'accès ----------
// Caisson de portique sur le bord de sa case (entre deux couloirs), lecteur de badge, battants de verre ouverts.
function portique(it, look, etat, O) {
  const corps = look === 'hall-grand' ? '#3a3d46' : '#e8eaee';
  const dessus = look === 'hall-grand' ? '#c9a227' : '#2b2f36';
  return O.spriteTuile(44, (g, P) => {
    const Pr = surBord(O, g, P, it.bord);
    const Q = quadBord(O, g, P, it.bord);
    Pr(0.12, -0.11, 0.88, 0.11, 0, 30, corps);
    Pr(0.1, -0.13, 0.9, 0.13, 30, 32, dessus);
    // lecteur de badge et voyant vert, des deux côtés
    Pr(0.2, -0.06, 0.34, 0.06, 32, 34, '#15151f');
    O.pixel(g, it.bord === 'n' ? P(0.27, 0.06, 34) : P(0.06, 0.27, 34), '#3dff7a', 2, 1);
    // battants de verre rentrés de part et d'autre
    if (!it.fin) Q(0.13, 0.42, 0.62, 12, 34, VERRE);
    Q(0.11, 0.16, 0.84, 24, 25, O.nuance(corps, -0.25));
  });
}

function portiqueVerre(it, look, etat, O) {
  return O.spriteTuile(52, (g, P) => {
    const Pr = surBord(O, g, P, it.bord);
    const Q = quadBord(O, g, P, it.bord);
    Pr(0.1, -0.08, 0.9, 0.08, 0, 26, '#f4f5f6');
    Pr(0.1, -0.08, 0.9, 0.08, 26, 27, '#9aa3ad');
    Q(0.08, 0.14, 0.86, 6, 22, '#dfe2e6');
    O.pixel(g, it.bord === 'n' ? P(0.18, 0.08, 20) : P(0.08, 0.18, 20), '#3df2ff', 3, 1);
    // grands battants de verre
    if (!it.fin) {
      Q(0.1, 0.3, 0.7, 14, 46, VERRE);
      Q(0.1, 0.3, 0.32, 18, 44, REFLET);
    }
  });
}

// ---------- grand hall ----------
function colonne(it, look, etat, O) {
  return O.spriteTuile(92, (g, P) => {
    O.prisme(g, P, 0.18, 0.18, 0.82, 0.82, 0, 6, '#3a3d46');
    O.prisme(g, P, 0.22, 0.22, 0.78, 0.78, 6, 9, '#c9a227');
    cylindre(O, g, P, 0.5, 0.5, 0.25, 9, 76, '#e9e3d6');
    // veines du marbre
    const [cx, cy] = P(0.5, 0.5, 0);
    g.fillStyle = 'rgba(150,140,125,0.55)';
    for (let k = 0; k < 9; k++) g.fillRect(cx - 6 + Math.round(Math.sin(k) * 3), cy - 18 - k * 6, 2, 3);
    O.prisme(g, P, 0.22, 0.22, 0.78, 0.78, 76, 79, '#c9a227');
    O.prisme(g, P, 0.16, 0.16, 0.84, 0.84, 79, 84, '#e9e3d6');
  });
}

function credence(it, look, etat, O) {
  const p = it.part;
  const x0 = p === 'g' ? 0.04 : 0;
  const x1 = p === 'd' ? 0.96 : 1;
  const v = (it.variante || 0) % 4;
  return O.spriteTuile(56, (g, P) => {
    O.prisme(g, P, x0, 0.06, x1, 0.46, 0, 24, '#6b4423');
    O.quadY(g, P, 0.46, x0 + 0.06, x1 - 0.06, 3, 21, '#5a3418');
    O.prisme(g, P, x0, 0.04, x1, 0.48, 24, 26, '#2b2f36');
    if (v === 0) {
      // grand vase de fleurs
      O.prisme(g, P, 0.4, 0.16, 0.6, 0.36, 26, 40, '#f4f2ea');
      for (const [u, z, c] of [[0.42, 48, '#e3342f'], [0.52, 52, '#f6c21c'], [0.6, 46, '#ff8fb1'], [0.48, 44, '#3fae4f'], [0.56, 50, '#3fae4f']]) O.pixel(g, P(u, 0.26, z), c, 3, 3);
    } else if (v === 1) {
      O.prisme(g, P, 0.2, 0.12, 0.6, 0.42, 26, 34, '#d9dce2');
      O.prisme(g, P, 0.24, 0.16, 0.56, 0.38, 34, 35, '#f4f2ea');
    } else if (v === 2) {
      for (let k = 0; k < 5; k++) O.prisme(g, P, 0.2 + k * 0.1, 0.12, 0.28 + k * 0.1, 0.4, 26, 40 - (k % 2) * 3, ['#2f6fde', '#e3342f', '#1f2a44', '#f6c21c', '#3aa655'][k]);
    } else {
      O.prisme(g, P, 0.4, 0.18, 0.62, 0.36, 26, 29, '#c9a227');
      O.prisme(g, P, 0.46, 0.22, 0.56, 0.32, 29, 38, '#c9a227');
    }
  });
}

// Comptoir d'accueil : on le sert depuis le côté nord (y - 1), les visiteurs sont au sud.
function comptoir(it, look, etat, O) {
  const p = it.part;
  const bois = it.variante === 'bois';
  const corps = bois ? '#6b3a1f' : '#ece6da';
  const bande = bois ? '#c9a227' : '#c9a227';
  const plateau = bois ? '#8a5a2b' : '#2b2f36';
  const x0 = p === 'g' ? 0.08 : 0;
  const x1 = p === 'd' ? 0.92 : 1;
  const n = typeof it.variante === 'number' ? it.variante % 4 : 0;
  return O.spriteTuile(56, (g, P) => {
    O.prisme(g, P, x0, 0.22, x1, 0.86, 0, 26, corps);
    if (bois) {
      for (const u of [0.25, 0.5, 0.75]) if (u > x0 && u < x1) O.quadY(g, P, 0.86, u - 0.01, u + 0.01, 3, 24, O.nuance(corps, -0.2));
    } else {
      // veines du marbre en façade
      const rnd = graine(O, it);
      for (let k = 0; k < 5; k++) {
        const u = x0 + 0.08 + rnd() * (x1 - x0 - 0.16);
        const z = 4 + rnd() * 16;
        O.quadY(g, P, 0.86, u, u + 0.12, z, z + 1, 'rgba(150,140,125,0.6)');
      }
    }
    O.quadY(g, P, 0.86, x0, x1, 2, 4, bande);
    // tablette haute côté visiteurs, plan de travail plus bas côté accueil
    O.prisme(g, P, x0, 0.66, x1, 0.9, 26, 31, plateau);
    O.quadY(g, P, 0.9, x0, x1, 29, 30, bande);
    O.prisme(g, P, x0, 0.18, x1, 0.66, 22, 24, O.nuance(plateau, 0.25));
    if (p === 'm' || (p === 'd' && bois)) {
      // écran (tourné vers l'hôtesse) et clavier, sur le côté de la case
      O.prisme(g, P, 0.1, 0.4, 0.3, 0.46, 24, 26, '#2b2f36');
      O.prisme(g, P, 0.06, 0.44, 0.34, 0.5, 26, 40, '#15151f');
      O.prisme(g, P, 0.4, 0.26, 0.62, 0.36, 24, 25, '#d9dce2');
      if (n % 2) {
        O.prisme(g, P, 0.7, 0.3, 0.86, 0.44, 24, 27, '#2b2f36');
        O.prisme(g, P, 0.7, 0.3, 0.86, 0.36, 27, 29, '#3a3d46');
      }
    }
    if (p === 'g' && !bois) {
      // orchidée en bout de comptoir
      O.prisme(g, P, 0.3, 0.72, 0.42, 0.84, 31, 36, '#f4f2ea');
      O.prisme(g, P, 0.35, 0.77, 0.37, 0.79, 36, 48, '#3a6b3a');
      for (const [u, z] of [[0.3, 46], [0.4, 48], [0.46, 44]]) O.pixel(g, P(u, 0.78, z), '#f2b8e8', 3, 2);
    }
    if (p === 'd' && !bois) {
      // sonnette et registre des visiteurs
      O.prisme(g, P, 0.3, 0.72, 0.4, 0.82, 31, 33, '#c9a227');
      O.pixel(g, P(0.35, 0.77, 35), '#f4d35e', 2, 1);
      O.quadZ(g, P, 31.2, 0.5, 0.7, 0.8, 0.86, '#f4f2ea');
    }
    if (bois && p === 'g') {
      // billetterie : guichet vitré
      prismeVerre(O, g, P, 0.1, 0.62, 0.9, 0.68, 31, 54, 0.35);
      O.prisme(g, P, 0.08, 0.6, 0.92, 0.7, 54, 57, '#6b3a1f');
      O.quadY(g, P, 0.7, 0.3, 0.7, 50, 56, '#f4d35e');
    }
  });
}

function presentoir(it, look, etat, O) {
  const musee = it.variante === 'musee';
  return O.spriteTuile(56, (g, P) => {
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.7, 0, 2, '#2b2f36');
    O.prisme(g, P, 0.46, 0.46, 0.54, 0.54, 2, 14, '#9aa3ad');
    O.prisme(g, P, 0.24, 0.42, 0.76, 0.58, 14, 48, musee ? '#5a3418' : '#c9a227');
    const cols = musee ? ['#f4d35e', '#3aa655', '#e3342f', '#f4f2ea'] : ['#2f6fde', '#f4f2ea', '#e3342f', '#3aa655'];
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 2; k++) {
        const u = 0.28 + k * 0.24;
        O.quadY(g, P, 0.585, u, u + 0.2, 17 + r * 10, 25 + r * 10, cols[(r * 2 + k) % cols.length]);
        O.quadY(g, P, 0.585, u + 0.03, u + 0.17, 22 + r * 10, 23 + r * 10, '#15151f');
      }
    }
  });
}

function tambour(it, look, etat, O) {
  return O.spriteBloc(2, 1, 84, (g, P) => {
    const cx = 1;
    const r = 0.85;
    const arc = (z, n = 24) => Array.from({ length: n + 1 }, (_, k) => {
      const a = (Math.PI * k) / n;
      return P(cx + r * Math.cos(a), r * Math.sin(a), z);
    });
    // sol du tambour
    O.poly(g, arc(0.5), '#5d6570');
    // verre courbe, montants
    for (let k = 0; k < 24; k++) {
      const a0 = (Math.PI * k) / 24;
      const a1 = (Math.PI * (k + 1)) / 24;
      const p = (a, z) => P(cx + r * Math.cos(a), r * Math.sin(a), z);
      O.poly(g, [p(a0, 2), p(a1, 2), p(a1, 72), p(a0, 72)], k > 15 ? 'rgba(170,220,255,0.22)' : 'rgba(170,220,255,0.3)');
    }
    for (const a of [0.05, 0.9, 2.25, 3.09]) {
      const x = cx + r * Math.cos(a);
      const y = r * Math.sin(a);
      O.prisme(g, P, x - 0.03, y - 0.03, x + 0.03, y + 0.03, 0, 72, '#9aa3ad');
    }
    // marquise
    const haut = arc(78);
    O.poly(g, [...arc(72), ...arc(78).reverse()], '#3a3d46');
    O.poly(g, haut, '#c3cad3');
    O.prisme(g, P, cx - 0.04, 0, cx + 0.04, 0.04, 0, 72, '#c3cad3');
  });
}

function animeTambour(g, it, tx, ty, t, O) {
  // quatre battants de verre qui tournent lentement autour de l'axe
  const P = O.projeteur(tx + 32, ty);
  const r = 0.82;
  for (let k = 0; k < 4; k++) {
    const a = t / 2600 + (k * Math.PI) / 2;
    const s = Math.sin(a);
    if (s <= 0.02) continue;
    const x = 1 + r * Math.cos(a);
    const y = r * s;
    O.poly(g, [P(1, 0, 3), P(x, y, 3), P(x, y, 70), P(1, 0, 70)], 'rgba(200,235,255,0.28)');
    const [x0, y0] = P(x, y, 3);
    const [x1, y1] = P(x, y, 70);
    g.fillStyle = '#9aa3ad';
    g.fillRect(Math.round(x0), Math.round(y1), 1, Math.round(y0 - y1));
  }
}

// Banquette capitonnée d'une case (dos du côté opposé à `dir`) ; `part` pour les accoudoirs.
function banquette(it, look, etat, O) {
  const T = O.theme(look);
  const cuir = T.canape || '#6b3a2a';
  const dir = it.dir || 'se';
  const devant = dir === 'ne' || dir === 'nw';
  const dossier = { se: [0.08, 0.1, 0.26, 0.9], nw: [0.74, 0.1, 0.92, 0.9], sw: [0.1, 0.08, 0.9, 0.26], ne: [0.1, 0.74, 0.9, 0.92] }[dir];
  const s = O.spriteTuile(40, (g, P) => {
    for (const [x, y] of [[0.14, 0.14], [0.8, 0.14], [0.14, 0.8], [0.8, 0.8]]) O.prisme(g, P, x, y, x + 0.06, y + 0.06, 0, 6, '#c9a227');
    O.prisme(g, P, 0.1, 0.1, 0.9, 0.9, 6, 13, O.nuance(cuir, -0.1));
    O.prisme(g, P, 0.12, 0.12, 0.88, 0.88, 13, 15, O.nuance(cuir, 0.1));
    for (const [u, v] of [[0.35, 0.35], [0.65, 0.35], [0.35, 0.65], [0.65, 0.65]]) O.pixel(g, P(u, v, 15), O.nuance(cuir, -0.25), 1, 1);
    if (!devant) O.prisme(g, P, ...dossier, 13, 28, cuir);
  });
  if (devant) s.avant = O.spriteTuile(40, (g, P) => O.prisme(g, P, ...dossier, 13, 28, cuir));
  return s;
}

function tableBasse(it, look, etat, O) {
  return O.spriteBloc(2, 1, 30, (g, P) => {
    for (const [x, y] of [[0.2, 0.25], [1.74, 0.25], [0.2, 0.7], [1.74, 0.7]]) O.prisme(g, P, x, y, x + 0.06, y + 0.06, 0, 9, '#c9a227');
    O.prisme(g, P, 0.12, 0.18, 1.88, 0.82, 9, 13, '#ece6da');
    O.quadZ(g, P, 13.1, 0.3, 0.3, 0.6, 0.55, '#2f6fde');
    O.quadZ(g, P, 13.2, 0.36, 0.34, 0.62, 0.52, '#f4f2ea');
    O.prisme(g, P, 1.3, 0.35, 1.5, 0.6, 13, 18, '#f4f2ea');
    for (const [u, c] of [[1.34, '#e3342f'], [1.42, '#f6c21c'], [1.46, '#ff8fb1']]) O.pixel(g, P(u, 0.47, 22), c, 2, 2);
  });
}

function totem(it, look, etat, O) {
  return O.spriteTuile(70, (g, P) => {
    O.prisme(g, P, 0.3, 0.38, 0.7, 0.62, 0, 3, '#3a3d46');
    O.prisme(g, P, 0.34, 0.42, 0.66, 0.58, 3, 62, '#2b2f36');
    O.quadY(g, P, 0.58, 0.37, 0.63, 8, 58, '#1b1e2b');
    O.quadY(g, P, 0.58, 0.39, 0.61, 52, 56, '#c9a227');
    for (let k = 0; k < 6; k++) {
      O.quadY(g, P, 0.58, 0.39, 0.42, 42 - k * 6, 44 - k * 6, '#f4d35e');
      O.quadY(g, P, 0.58, 0.44, 0.6 - (k % 3) * 0.03, 42 - k * 6, 43 - k * 6, '#d9dce2');
    }
  });
}

function presse(it, look, etat, O) {
  return O.spriteTuile(44, (g, P) => {
    O.prisme(g, P, 0.2, 0.3, 0.8, 0.7, 0, 3, '#2b2f36');
    for (const x of [0.22, 0.74]) O.prisme(g, P, x, 0.32, x + 0.04, 0.68, 3, 36, '#9aa3ad');
    for (let r = 0; r < 3; r++) {
      O.prisme(g, P, 0.24, 0.36, 0.76, 0.64, 8 + r * 10, 9 + r * 10, '#9aa3ad');
      O.quadY(g, P, 0.64, 0.28, 0.72, 9 + r * 10, 17 + r * 10, ['#f4f2ea', '#ffe9b0', '#f4f2ea'][r]);
      O.quadY(g, P, 0.64, 0.32, 0.6, 14 + r * 10, 15 + r * 10, '#15151f');
      O.quadY(g, P, 0.64, 0.32, 0.46, 11 + r * 10, 13 + r * 10, ['#e3342f', '#2f6fde', '#3aa655'][r]);
    }
  });
}

// ---------- tour de verre ----------
function arbre(it, look, etat, O) {
  const rnd = graine(O, it);
  const v = (it.variante || 0) % 4;
  if (v === 3) {
    // buis taillé en boule dans un bac bas (ne cache pas la plaque d'étage)
    return O.spriteTuile(44, (g, P) => {
      O.prisme(g, P, 0.2, 0.2, 0.8, 0.8, 0, 12, '#f4f5f6');
      O.quadZ(g, P, 12.2, 0.24, 0.24, 0.76, 0.76, '#3b2a1e');
      const [cx, cy] = P(0.5, 0.5, 12);
      const verts = ['#2e7a3a', '#3a8f45', '#25632f', '#4aa055'];
      for (let i = 0; i < 70; i++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * 11;
        g.fillStyle = verts[Math.floor(rnd() * 4)];
        g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy - 10 + Math.sin(a) * r * 0.8), 2, 2);
      }
    });
  }
  return O.spriteTuile(88, (g, P) => {
    O.prisme(g, P, 0.22, 0.22, 0.78, 0.78, 0, 20, '#f4f5f6');
    O.quadZ(g, P, 20.2, 0.26, 0.26, 0.74, 0.74, '#3b2a1e');
    O.quadZ(g, P, 20.4, 0.3, 0.3, 0.7, 0.7, '#cfc6b0');
    const [cx, cy] = P(0.5, 0.5, 20);
    if (v === 1) {
      // bambous
      for (let k = 0; k < 7; k++) {
        const dx = -8 + k * 3;
        const h = 44 + Math.round(rnd() * 20);
        for (let z = 0; z < h; z++) O.pixel(g, [cx + dx, cy - z], z % 9 === 0 ? '#5e8a3a' : '#7fae4a', 2, 1);
        for (let j = 0; j < 4; j++) O.pixel(g, [cx + dx + (j % 2 ? 2 : -4), cy - h + j * 6], '#4f9a3a', 4, 2);
      }
      return;
    }
    // tronc et feuillage en nuage (olivier, ou ficus taillé en boule)
    for (let z = 0; z < 30; z++) O.pixel(g, [cx - 1 + Math.round(Math.sin(z / 6) * 1.5), cy - z], '#6b5338', 3, 1);
    const verts = v === 2 ? ['#2e8b3e', '#3fae4f', '#1f6b2d', '#56c45f'] : ['#8fa58a', '#a8bca3', '#6f8a6b', '#7f9a7a'];
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 16;
      g.fillStyle = verts[Math.floor(rnd() * 4)];
      g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy - 46 + Math.sin(a) * r * 0.8), 3, 2);
    }
  });
}

function bancVerre(it, look, etat, O) {
  return O.spriteTuile(30, (g, P) => {
    for (const y of [0.2, 0.74]) O.prisme(g, P, 0.16, y, 0.84, y + 0.06, 0, 12, '#2b2f36');
    O.prisme(g, P, 0.12, 0.14, 0.88, 0.86, 12, 15, '#c49a6c');
    O.quadZ(g, P, 15.1, 0.2, 0.2, 0.5, 0.4, '#d8b88a');
  });
}

function monolithe(it, look, etat, O) {
  const p = it.part;
  const x0 = p === 'g' ? 0.06 : 0;
  const x1 = p === 'd' ? 0.94 : 1;
  return O.spriteTuile(56, (g, P) => {
    O.prisme(g, P, x0, 0.2, x1, 0.86, 0, 30, '#f4f5f6');
    O.quadY(g, P, 0.86, x0, x1, 3, 4, '#3df2ff');
    O.quadY(g, P, 0.86, x0, x1, 4, 5, 'rgba(61,242,255,0.4)');
    if (p === 'g') {
      // « QG » discret en façade
      O.quadY(g, P, 0.86, 0.5, 0.92, 16, 22, '#dfe2e6');
      O.quadY(g, P, 0.86, 0.56, 0.62, 17, 21, '#9aa3ad');
      O.quadY(g, P, 0.86, 0.7, 0.76, 17, 21, '#9aa3ad');
      O.prisme(g, P, 0.3, 0.3, 0.46, 0.46, 30, 33, '#e8eaee');
      O.prisme(g, P, 0.33, 0.33, 0.43, 0.43, 33, 40, '#3a6b3a');
    } else {
      // écran tout-en-un tourné vers l'hôtesse, clavier
      O.prisme(g, P, 0.36, 0.42, 0.44, 0.48, 30, 36, '#c3cad3');
      O.prisme(g, P, 0.14, 0.46, 0.66, 0.5, 34, 50, '#e8eaee');
      O.prisme(g, P, 0.2, 0.28, 0.6, 0.38, 30, 31, '#f4f5f6');
    }
  });
}

function chaiseDesign(it, look, etat, O) {
  const dir = it.dir || 'sw';
  const devant = dir === 'ne' || dir === 'nw';
  const dossier = { sw: [0.24, 0.2, 0.76, 0.28], ne: [0.24, 0.72, 0.76, 0.8], se: [0.2, 0.24, 0.28, 0.76], nw: [0.72, 0.24, 0.8, 0.76] }[dir];
  const s = O.spriteTuile(44, (g, P) => {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      O.prisme(g, P, 0.48 + Math.cos(a) * 0.2, 0.48 + Math.sin(a) * 0.2, 0.52 + Math.cos(a) * 0.2, 0.52 + Math.sin(a) * 0.2, 0, 2, '#9aa3ad');
    }
    O.prisme(g, P, 0.47, 0.47, 0.53, 0.53, 2, 10, '#c3cad3');
    O.prisme(g, P, 0.26, 0.26, 0.74, 0.74, 10, 14, '#f4f5f6');
    if (!devant) O.prisme(g, P, ...dossier, 14, 32, '#f4f5f6');
  });
  if (devant) s.avant = O.spriteTuile(44, (g, P) => O.prisme(g, P, ...dossier, 14, 32, '#f4f5f6'));
  return s;
}

function bassin(it, look, etat, O) {
  const p = it.part;
  const x0 = p === 'g' ? 0.08 : 0;
  const x1 = p === 'd' ? 0.92 : 1;
  return O.spriteTuile(24, (g, P) => {
    O.prisme(g, P, x0, 0.12, x1, 0.88, 0, 10, '#2b2f36');
    O.quadZ(g, P, 10.1, x0 + (p === 'g' ? 0.06 : 0), 0.18, x1 - (p === 'd' ? 0.06 : 0), 0.82, '#1f5f7a');
    O.quadZ(g, P, 10.2, x0 + (p === 'g' ? 0.1 : 0), 0.24, x1 - (p === 'd' ? 0.1 : 0), 0.76, '#2a7a98');
    if (p === 'm') O.pixel(g, P(0.4, 0.5, 10.3), '#9fe0ff', 4, 1);
  });
}

function animeBassin(g, it, tx, ty, t, O) {
  // reflets qui glissent sur l'eau, ronds dans l'eau de temps en temps
  const P = O.projeteur(tx + 32, ty);
  const u = ((t / 3000 + (it.x % 3) * 0.33) % 1) * 0.8 + 0.1;
  O.pixel(g, P(u, 0.4, 10.4), 'rgba(200,240,255,0.8)', 3, 1);
  O.pixel(g, P((u + 0.4) % 0.9 + 0.05, 0.62, 10.4), 'rgba(200,240,255,0.6)', 2, 1);
  const c = ((t + it.x * 1300) % 5200) / 5200;
  if (c < 0.4) {
    const r = 0.05 + c * 0.4;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      O.pixel(g, P(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r * 0.8, 10.4), `rgba(220,245,255,${0.7 - c * 1.5})`, 1, 1);
    }
  }
}

function sculpture(it, look, etat, O) {
  return O.spriteTuile(84, (g, P) => {
    O.prisme(g, P, 0.22, 0.22, 0.78, 0.78, 0, 14, '#2b2f36');
    O.prisme(g, P, 0.24, 0.24, 0.76, 0.76, 14, 15, '#3a3f48');
    // anneau de Möbius rouge, en tranches
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const tor = Math.sin(a * 0.5);
      const x = 0.5 + Math.cos(a) * 0.3;
      const z = 46 + Math.sin(a) * 26;
      const w = 0.04 + Math.abs(tor) * 0.08;
      O.prisme(g, P, x - 0.03, 0.5 - w, x + 0.03, 0.5 + w, z - 2, z + 2, tor > 0 ? '#d63a2f' : '#a82a22');
    }
    O.prisme(g, P, 0.46, 0.46, 0.54, 0.54, 15, 22, '#a82a22');
  });
}

function fauteuilDesign(it, look, etat, O) {
  const dir = it.dir || 'se';
  const devant = dir === 'ne' || dir === 'nw';
  const cuir = '#f0ede6';
  const dossier = { se: [0.1, 0.16, 0.3, 0.84], nw: [0.7, 0.16, 0.9, 0.84], sw: [0.16, 0.1, 0.84, 0.3], ne: [0.16, 0.7, 0.84, 0.9] }[dir];
  const s = O.spriteTuile(40, (g, P) => {
    // pieds en X chromés
    for (const [x, y] of [[0.16, 0.16], [0.78, 0.16], [0.16, 0.78], [0.78, 0.78]]) O.prisme(g, P, x, y, x + 0.06, y + 0.06, 0, 8, '#c3cad3');
    O.prisme(g, P, 0.14, 0.14, 0.86, 0.86, 8, 12, '#c3cad3');
    O.prisme(g, P, 0.16, 0.16, 0.84, 0.84, 12, 15, cuir);
    for (const [u, v] of [[0.35, 0.35], [0.65, 0.35], [0.35, 0.65], [0.65, 0.65], [0.5, 0.5]]) O.pixel(g, P(u, v, 15), '#cfc8b8', 1, 1);
    if (!devant) O.prisme(g, P, ...dossier, 14, 30, cuir);
  });
  if (devant) s.avant = O.spriteTuile(40, (g, P) => O.prisme(g, P, ...dossier, 14, 30, cuir));
  return s;
}

function tableVerre(it, look, etat, O) {
  return O.spriteTuile(30, (g, P) => {
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.7, 0, 2, '#c3cad3');
    O.prisme(g, P, 0.46, 0.46, 0.54, 0.54, 2, 10, '#c3cad3');
    prismeVerre(O, g, P, 0.14, 0.14, 0.86, 0.86, 10, 12, 0.5);
    O.quadZ(g, P, 12.1, 0.3, 0.3, 0.55, 0.5, '#15151f');
    O.quadZ(g, P, 12.2, 0.33, 0.33, 0.52, 0.47, '#f4f2ea');
    O.prisme(g, P, 0.62, 0.58, 0.74, 0.7, 12, 18, '#ffffff');
  });
}

// ---------- hall au dinosaure ----------
function cordon(it, look, etat, O) {
  return O.spriteTuile(40, (g, P) => {
    const Pr = surBord(O, g, P, it.bord);
    const poteau = (a) => {
      Pr(a - 0.08, -0.08, a + 0.08, 0.08, 0, 2, '#b08a3a');
      Pr(a - 0.03, -0.03, a + 0.03, 0.03, 2, 26, '#c9a227');
      Pr(a - 0.05, -0.05, a + 0.05, 0.05, 26, 29, '#f4d35e');
    };
    poteau(0.04);
    // corde de velours qui pend entre les poteaux
    for (let k = 0; k <= 24; k++) {
      const a = 0.04 + (0.92 * k) / 24;
      const z = 24 - Math.sin((Math.PI * k) / 24) * 6;
      O.pixel(g, it.bord === 'n' ? P(a, 0, z) : P(0, a, z), k % 6 ? '#a8232a' : '#7a1a20', 2, 2);
    }
    poteau(0.96);
  });
}

function tourniquet(it, look, etat, O) {
  return O.spriteTuile(40, (g, P) => {
    O.prisme(g, P, 0.06, 0.04, 0.3, 0.22, 0, 30, '#c9a227');
    O.prisme(g, P, 0.04, 0.02, 0.32, 0.24, 30, 32, '#f4d35e');
    O.quadY(g, P, 0.22, 0.1, 0.26, 10, 24, '#b08a3a');
    // trois bras en laiton
    for (const [u, v] of [[0.62, 0.2], [0.3, 0.55], [0.22, 0.2]]) {
      for (let k = 0; k <= 10; k++) O.pixel(g, P(0.2 + (u - 0.2) * (k / 10), 0.14 + (v - 0.14) * (k / 10), 26 - k * 0.6), '#d9b648', 2, 2);
    }
  });
}

function fougere(it, look, etat, O) {
  const rnd = graine(O, it);
  const v = (it.variante || 0) % 3;
  return O.spriteTuile(70, (g, P) => {
    cylindre(O, g, P, 0.5, 0.5, 0.24, 0, 14, v === 2 ? '#6b4423' : '#7a6a58', '#3b2a1e');
    const [cx, cy] = P(0.5, 0.5, 14);
    const verts = ['#2e8b3e', '#3fae4f', '#1f6b2d', '#56c45f', '#4a8a2a'];
    for (let f = 0; f < 11; f++) {
      const a = (f / 11) * Math.PI * 2 + rnd();
      const L = 16 + rnd() * 12;
      for (let k = 0; k < L; k++) {
        const x = cx + Math.cos(a) * k * 0.9;
        const y = cy - k * (0.9 - k / (L * 1.6)) * 1.3 + Math.sin(a) * k * 0.3;
        g.fillStyle = verts[(f + k) % 5];
        g.fillRect(Math.round(x), Math.round(y), 2, 1);
        if (k % 3 === 0) g.fillRect(Math.round(x - 2), Math.round(y - 1), 5, 1);
      }
    }
  });
}

function palmier(it, look, etat, O) {
  return O.spriteTuile(96, (g, P) => {
    cylindre(O, g, P, 0.5, 0.5, 0.28, 0, 16, '#b08a3a', '#3b2a1e');
    const [cx, cy] = P(0.5, 0.5, 16);
    for (let z = 0; z < 50; z++) O.pixel(g, [cx - 2 + Math.round(Math.sin(z / 9) * 2), cy - z], z % 5 < 2 ? '#7a5a3a' : '#9a7a52', 5, 1);
    const tx = cx + Math.round(Math.sin(50 / 9) * 2);
    const ty = cy - 52;
    for (let f = 0; f < 8; f++) {
      const a = (f / 8) * Math.PI * 2;
      for (let k = 0; k < 20; k++) {
        const x = tx + Math.cos(a) * k * 1.2;
        const y = ty + Math.sin(a) * k * 0.45 + (k * k) / 26;
        g.fillStyle = f % 2 ? '#2e8b3e' : '#3fae4f';
        g.fillRect(Math.round(x), Math.round(y), 3, 2);
      }
    }
  });
}

function vitrine(it, look, etat, O) {
  const meteorite = it.variante === 'meteorite';
  return O.spriteTuile(66, (g, P) => {
    O.prisme(g, P, 0.14, 0.14, 0.86, 0.86, 0, 24, '#5a3418');
    O.quadY(g, P, 0.86, 0.3, 0.7, 10, 16, '#c9a227');
    O.prisme(g, P, 0.18, 0.18, 0.82, 0.82, 24, 25, '#e8e1d2');
    if (meteorite) {
      // météorite noire et cratère de lumière
      O.prisme(g, P, 0.34, 0.36, 0.66, 0.62, 25, 34, '#2b2b33');
      O.prisme(g, P, 0.4, 0.4, 0.6, 0.56, 34, 38, '#3a3d46');
      O.pixel(g, P(0.45, 0.45, 39), '#9aa3ad', 2, 1);
      O.pixel(g, P(0.55, 0.5, 35), '#ff9a1f', 1, 1);
    } else {
      // ammonite et dents fossiles
      const [cx, cy] = P(0.42, 0.48, 30);
      for (let k = 0; k < 40; k++) {
        const a = k * 0.4;
        const r = k * 0.18;
        g.fillStyle = k % 4 ? '#c9b07a' : '#8a7448';
        g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.7), 2, 2);
      }
      for (const u of [0.62, 0.7]) O.prisme(g, P, u, 0.62, u + 0.04, 0.66, 25, 30, '#efe6cf');
    }
    // cloche de verre
    prismeVerre(O, g, P, 0.18, 0.18, 0.82, 0.82, 25, 54, 0.22);
    O.quadY(g, P, 0.82, 0.22, 0.3, 30, 50, REFLET);
    O.prisme(g, P, 0.16, 0.16, 0.84, 0.84, 54, 56, '#5a3418');
  });
}

// Banc de musée sans dossier, à lattes : deux cases le long de x (w: 2) ou une case allongée le long de y.
function banc(it, look, etat, O) {
  const long = (it.w || 1) > 1;
  const L = long ? 2 : 1;
  const dessin = (g, P) => {
    // en repère « a » le long du banc, « b » en travers
    const pr = long || it.axe !== 'y'
      ? (a0, b0, a1, b1, z0, z1, c) => O.prisme(g, P, a0, b0, a1, b1, z0, z1, c)
      : (a0, b0, a1, b1, z0, z1, c) => O.prisme(g, P, b0, a0, b1, a1, z0, z1, c);
    const bas = long ? [0.24, 0.76] : [0.3, 0.7];
    for (const a of [0.14, L - 0.22]) pr(a, bas[0] + 0.04, a + 0.08, bas[1] - 0.04, 0, 11, '#2b2f36');
    pr(0.1, bas[0], L - 0.1, bas[1], 11, 13, '#5a3418');
    const n = long ? 7 : 4;
    for (let k = 0; k < n; k++) {
      const b0 = bas[0] + ((bas[1] - bas[0]) * k) / n;
      pr(0.08, b0 + 0.01, L - 0.08, b0 + (bas[1] - bas[0]) / n - 0.01, 13, 15, k % 2 ? '#8a5a2b' : '#9a6a35');
    }
  };
  return long ? O.spriteBloc(2, 1, 28, dessin) : O.spriteTuile(28, dessin);
}

function oeuf(it, look, etat, O) {
  return O.spriteTuile(52, (g, P) => {
    O.prisme(g, P, 0.24, 0.24, 0.76, 0.76, 0, 26, '#2b2f36');
    O.quadY(g, P, 0.76, 0.34, 0.66, 18, 22, '#c9a227');
    // nid et trois œufs tachetés
    O.prisme(g, P, 0.22, 0.22, 0.78, 0.78, 26, 30, '#8a6a3a');
    for (const [u, v] of [[0.38, 0.42], [0.58, 0.4], [0.48, 0.6]]) {
      const [x, y] = P(u, v, 30);
      g.fillStyle = '#e8dcc0';
      g.fillRect(x - 3, y - 9, 7, 9);
      g.fillRect(x - 2, y - 11, 5, 2);
      g.fillStyle = '#9a8a6a';
      g.fillRect(x - 1, y - 7, 1, 1);
      g.fillRect(x + 2, y - 4, 1, 1);
    }
  });
}

// Squelette de tyrannosaure (4 × 2 cases) sur son socle, tête vers la droite (+x).
function trex(it, look, etat, O) {
  const os = '#efe6cf';
  const ombre = '#c9b98f';
  return O.spriteBloc(4, 2, 124, (g, P0) => {
    // socle et plaque
    O.prisme(g, P0, 0.1, 0.2, 3.9, 1.8, 0, 9, '#2b2f36');
    O.prisme(g, P0, 0.14, 0.24, 3.86, 1.76, 9, 10, '#3a3f48');
    O.quadY(g, P0, 1.8, 1.6, 2.4, 3, 7, '#c9a227');
    // le squelette est dessiné en « unités d'os », étirées en hauteur pour qu'il domine les visiteurs
    const P = (x, y, z) => P0(x, y, z <= 10 ? z : 10 + (z - 10) * 1.35);
    const v0 = 0.9;
    const v1 = 1.1;
    const pt = (u, z, v = 1) => [u, v, z];
    // tige de soutien
    trait(O, g, P, pt(1.95, 10), pt(1.95, 60), '#3a3d46', 2);
    trait(O, g, P, pt(2.85, 10), pt(2.85, 66), '#3a3d46', 1);
    // patte du fond
    const patte = (v, col) => {
      trait(O, g, P, [1.9, v, 60], [2.25, v, 36], col, 4);
      trait(O, g, P, [2.25, v, 36], [1.95, v, 16], col, 3);
      trait(O, g, P, [1.95, v, 16], [2.05, v, 10], col, 3);
      trait(O, g, P, [2.05, v, 10], [2.45, v, 10], col, 2);
      trait(O, g, P, [2.05, v, 10], [1.85, v, 10], col, 2);
    };
    patte(v0, ombre);
    // colonne vertébrale : queue, bassin, dos, cou
    const colonne = [[0.2, 22], [0.6, 34], [1.0, 46], [1.4, 56], [1.8, 64], [2.2, 66], [2.6, 66], [2.95, 66], [3.15, 72], [3.25, 80]];
    for (let k = 0; k < colonne.length - 1; k++) trait(O, g, P, pt(...colonne[k]), pt(...colonne[k + 1]), os, k < 3 ? 2 : 3);
    for (let k = 1; k < colonne.length - 2; k++) {
      const [u, z] = colonne[k];
      trait(O, g, P, pt(u, z), pt(u - 0.04, z + 4 + (k > 3 && k < 7 ? 3 : 0)), os, 2);
    }
    // côtes du fond puis du devant
    const cotes = (v, col) => {
      for (let k = 0; k < 6; k++) {
        const u = 2.1 + k * 0.14;
        trait(O, g, P, [u, 1, 65], [u + 0.08, v, 50], col, 1);
        trait(O, g, P, [u + 0.08, v, 50], [u + 0.02, 1, 40 + k], col, 1);
      }
    };
    cotes(v0 - 0.05, ombre);
    // bassin
    trait(O, g, P, pt(1.75, 62), pt(2.15, 60), os, 4);
    trait(O, g, P, pt(1.95, 60), pt(2.05, 50), os, 3);
    cotes(v1 + 0.05, os);
    // petits bras
    trait(O, g, P, pt(2.95, 60), pt(3.05, 52), os, 2);
    trait(O, g, P, pt(3.05, 52), pt(3.15, 50), os, 1);
    patte(v1, os);
    // crâne : mâchoires et dents
    const crane = [[3.15, 78], [3.35, 88], [3.6, 88], [3.95, 80], [3.98, 76], [3.4, 74], [3.2, 72]];
    O.poly(g, crane.map(([u, z]) => P(u, 1, z)), os);
    const machoire = [[3.25, 72], [3.9, 72], [3.88, 68], [3.3, 66]];
    O.poly(g, machoire.map(([u, z]) => P(u, 1, z)), ombre);
    for (let k = 0; k < 6; k++) O.pixel(g, P(3.38 + k * 0.09, 1, 73.5), '#ffffff', 1, 2);
    O.pixel(g, P(3.45, 1, 84), '#15151f', 3, 3);
    O.pixel(g, P(3.68, 1, 82), '#3a3d46', 4, 2);
    O.pixel(g, P(3.88, 1, 80), '#3a3d46', 1, 1);
  });
}

// ---------- sols ----------
// (u, v) d'un pixel du losange de 64 × 32 : la case va de (0, 0) à (1, 1).
const uv = (X, Y) => {
  const a = (X + 0.5 - 32) / 32;
  const b = (Y + 0.5) / 16;
  return [(a + b) / 2, (b - a) / 2];
};
const dedans = (u, v) => u >= 0 && v >= 0 && u <= 1 && v <= 1;

function solMarbre(g, col, { parite, variante, rnd }, O) {
  // grandes dalles de marbre, deux tons en damier, veines fines et joint sombre
  if (parite) {
    const Pt = O.projeteur(32, 0);
    O.poly(g, [Pt(0.04, 0.04), Pt(0.96, 0.04), Pt(0.96, 0.96), Pt(0.04, 0.96)], O.nuance(col, -0.06));
  }
  for (let k = 0; k < 2; k++) {
    let x = 8 + Math.floor(rnd() * 44);
    let y = 6 + Math.floor(rnd() * 18);
    for (let s = 0; s < 14; s++) {
      x += rnd() < 0.5 ? 1 : 2;
      y += rnd() < 0.4 ? 1 : 0;
      const [u, v] = uv(x, y);
      if (dedans(u, v)) O.pixel(g, [x, y], 'rgba(140,128,112,0.45)');
    }
  }
  if (variante === 3) O.pixel(g, [24, 12], 'rgba(255,255,255,0.5)', 6, 1);
}

// Rosace de marbre de 3 × 3 cases : étoile des vents, anneaux de laiton et de marbre vert.
function solRosace(i, j) {
  return (g, col, ctx, O) => {
    const img = g.getImageData(0, 0, 64, 32);
    const d = img.data;
    const coul = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const LAITON = coul('#c9a227');
    const VERT = coul('#2f5a4a');
    const SOMBRE = coul('#2f3438');
    const GRIS = coul('#6a717c');
    const OCRE = coul('#b08a3a');
    const OCRE2 = coul('#8a6a2a');
    for (let Y = 0; Y < 32; Y++) {
      for (let X = 0; X < 64; X++) {
        const k = (Y * 64 + X) * 4;
        if (d[k + 3] < 200) continue;
        const [u, v] = uv(X, Y);
        const U = i + u - 1.5;
        const V = j + v - 1.5;
        const r = Math.hypot(U, V);
        const a = Math.atan2(V, U);
        let c = null;
        if (r > 1.36 && r < 1.44) c = LAITON;
        else if (r > 1.16 && r <= 1.36) c = VERT;
        else if (r > 1.1 && r <= 1.16) c = LAITON;
        else if (r <= 1.1) {
          const phi = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
          const t = Math.abs(phi - Math.PI / 4) / (Math.PI / 4);
          const rl = 0.12 + 0.96 * Math.pow(t, 4);
          const rs = 0.12 + 0.6 * Math.pow(1 - t, 4);
          const cote = phi < Math.PI / 4;
          if (r < 0.1) c = LAITON;
          else if (r < rl) c = cote ? SOMBRE : GRIS;
          else if (r < rs) c = cote ? OCRE : OCRE2;
        }
        if (c) {
          d[k] = c[0];
          d[k + 1] = c[1];
          d[k + 2] = c[2];
        }
      }
    }
    g.putImageData(img, 0, 0);
  };
}

function solDalle(g, col, { parite, variante }, O) {
  // dalles blanches brillantes : un reflet de lumière, joint gris très fin
  const Pt = O.projeteur(32, 0);
  if (parite) O.poly(g, [Pt(0.02, 0.02), Pt(0.98, 0.02), Pt(0.98, 0.98), Pt(0.02, 0.98)], O.nuance(col, -0.03));
  O.poly(g, [Pt(0.2, 0.15), Pt(0.32, 0.15), Pt(0.2, 0.55), Pt(0.08, 0.55)], 'rgba(255,255,255,0.55)');
  if (variante === 1) O.pixel(g, Pt(0.6, 0.6), 'rgba(255,255,255,0.7)', 4, 1);
}

function solTerrazzo(g, col, { rnd }, O) {
  const eclats = ['#a89a84', '#7a6a58', '#f4efe4', '#b9433a', '#3a3d46', '#c9a227'];
  for (let k = 0; k < 46; k++) {
    const X = Math.floor(rnd() * 64);
    const Y = Math.floor(rnd() * 31);
    const [u, v] = uv(X, Y);
    if (!dedans(u, v)) continue;
    g.fillStyle = eclats[Math.floor(rnd() * eclats.length)];
    g.fillRect(X, Y, rnd() < 0.3 ? 2 : 1, 1);
  }
}

function solTrace(g, col, ctx, O) {
  solTerrazzo(g, col, ctx, O);
  // empreinte à trois doigts, vers le squelette
  const Pt = O.projeteur(32, 0);
  const tache = (u, v, ru, rv) => O.poly(g, [Pt(u - ru, v), Pt(u, v - rv), Pt(u + ru, v), Pt(u, v + rv)], 'rgba(60,48,36,0.55)');
  tache(0.58, 0.42, 0.14, 0.14);
  for (const [u, v] of [[0.3, 0.68], [0.42, 0.78], [0.26, 0.5]]) {
    for (let k = 0; k < 5; k++) tache(0.5 + (u - 0.5) * (k / 4), 0.5 + (v - 0.5) * (k / 4), 0.04, 0.04);
  }
}

// ---------- murs ----------
function murPierre(g, longueur, cote, rnd, O) {
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  const HW = O.HW;
  R(0, 0, longueur, HW, '#e3dccd');
  // grands panneaux de pierre
  for (let y = 4; y < HW - 14; y += 22) R(0, y, longueur, 1, '#cfc6b4');
  for (let row = 0, y = 4; y < HW - 14; y += 22, row++) for (let x = (row % 2) * 24; x < longueur; x += 48) R(x, y, 1, 22, '#cfc6b4');
  for (let i = 0; i < longueur / 3; i++) R(Math.floor(rnd() * longueur), Math.floor(rnd() * (HW - 14)), 1, 1, rnd() < 0.5 ? '#d8d0bf' : '#ece6da');
  R(0, 0, longueur, 4, '#f2ede2');
  R(0, 3, longueur, 1, '#c9a227');
  R(0, HW - 14, longueur, 14, '#4a2a14');
  R(0, HW - 14, longueur, 1, '#c9a227');
  R(0, HW - 12, longueur, 1, '#6b4423');
}

function murFacade(g, longueur, cote, rnd, O) {
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  const HW = O.HW;
  if (cote === 'gauche') {
    // panneaux de béton blanc
    R(0, 0, longueur, HW, '#eceef0');
    for (let x = 0; x < longueur; x += 48) R(x, 0, 1, HW, '#d7dade');
    for (let x = 6; x < longueur; x += 24) for (const y of [8, HW - 14]) R(x, y, 2, 2, '#c9ccd2');
    R(0, HW - 4, longueur, 4, '#c9ccd2');
    return;
  }
  // mur-rideau : ciel, tours de la ville, montants d'aluminium
  const ciel = ['#8fcfff', '#a3d8ff', '#b8e1ff', '#cdeaff', '#e0f2ff'];
  ciel.forEach((c, i) => R(0, Math.floor((i * HW) / 5), longueur, Math.ceil(HW / 5), c));
  let x = 0;
  while (x < longueur) {
    const w = 10 + Math.floor(rnd() * 18);
    const h = 18 + Math.floor(rnd() * 46);
    const c = ['#7f8fa6', '#93a2b8', '#6f7f96', '#a8b6c8'][Math.floor(rnd() * 4)];
    R(x, HW - 4 - h, w, h, c);
    for (let yy = HW - h; yy < HW - 6; yy += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) if (rnd() < 0.5) R(xx, yy, 1, 2, '#c9e6ff');
    x += w + Math.floor(rnd() * 3);
  }
  R(0, 0, longueur, HW, 'rgba(255,255,255,0.12)');
  for (let xx = 0; xx < longueur; xx += 32) R(xx, 0, 2, HW, '#c3cad3');
  R(0, 26, longueur, 1, '#c3cad3');
  R(0, 0, longueur, 3, '#9aa3ad');
  R(0, HW - 4, longueur, 4, '#7d8692');
  for (let xx = 4; xx < longueur; xx += 64) R(xx, 6, 10, 1, 'rgba(255,255,255,0.6)');
}

function murMusee(g, longueur, cote, rnd, O) {
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  const HW = O.HW;
  R(0, 0, longueur, HW, '#2f4a3a');
  for (let x = 0; x < longueur; x += 8) R(x, 0, 1, HW - 28, '#2b4436');
  // frise dorée, lambris de bois sombre
  R(0, 4, longueur, 2, '#c9a227');
  for (let x = 0; x < longueur; x += 12) R(x + 4, 7, 4, 2, '#b08a3a');
  R(0, HW - 28, longueur, 28, '#4a2a14');
  R(0, HW - 29, longueur, 2, '#c9a227');
  for (let x = 4; x < longueur; x += 26) {
    R(x, HW - 24, 20, 18, '#3d2210');
    R(x + 1, HW - 23, 18, 16, '#5a3418');
  }
}

// ---------- décors muraux ----------
function panneauFleche(g, x, y, texte, O) {
  const w = O.mesurer(texte) + 18;
  O.cadre(g, x, y, w, 13, '#1b1e2b', '#1b1e2b');
  g.drawImage(O.texteCanvas(texte, '#ffffff'), x + 12, y + 3);
  g.fillStyle = '#f4d35e';
  g.fillRect(x + 4, y + 6, 5, 1);
  g.fillRect(x + 5, y + 5, 1, 3);
  g.fillRect(x + 4, y + 6, 1, 1);
}

function boitesAuxLettres(g, x0, y0, colonnes, rangs, O) {
  O.cadre(g, x0, y0, colonnes * 9 + 3, rangs * 7 + 3, '#6b4423', '#5a3418');
  for (let r = 0; r < rangs; r++) {
    for (let c = 0; c < colonnes; c++) {
      const x = x0 + 2 + c * 9;
      const y = y0 + 2 + r * 7;
      g.fillStyle = '#c9a227';
      g.fillRect(x, y, 8, 6);
      g.fillStyle = '#b08a3a';
      g.fillRect(x + 1, y + 1, 6, 1);
      g.fillStyle = '#15151f';
      g.fillRect(x + 6, y + 3, 1, 1);
    }
  }
}

function decorsGrand(g, cote, longueur, etage, O) {
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  if (cote === 'droite') {
    panneauFleche(g, 10, 14, O.enseigne('ASCENSEURS', 'LIFTS'), O);
    // mur de l'accueil : boiserie et lettres de laiton au nom du QG
    // (entre les deux colonnes : de x 208 à 336 sur le mur)
    const x0 = 6 * 32 + 14;
    const x1 = 11 * 32 - 14;
    R(x0, 6, x1 - x0, 60, '#5a3418');
    for (let x = x0 + 4; x < x1; x += 10) R(x, 6, 1, 60, '#4a2a14');
    R(x0, 6, x1 - x0, 2, '#c9a227');
    R(x0, 64, x1 - x0, 2, '#c9a227');
    const cx = Math.round((x0 + x1) / 2);
    const centre = (s, y, col) => g.drawImage(O.texteCanvas(s, col), cx - Math.round(O.mesurer(s) / 2), y);
    const fr = O.enseigne('fr', 'en') === 'fr';
    // « QG » en grandes lettres de laiton, « DES AGENTS » dessous (en anglais : « AGENTS' » au-dessus de « HQ »)
    if (fr) {
      O.texteDouble(g, 'QG', cx, 11, '#f4d35e', '#6b4a10');
      centre('DES AGENTS', 29, '#f4d35e');
    } else {
      centre("AGENTS'", 11, '#f4d35e');
      O.texteDouble(g, 'HQ', cx, 19, '#f4d35e', '#6b4a10');
    }
    R(cx - 22, 38, 44, 1, '#c9a227');
    centre(O.enseigne('ACCUEIL', 'RECEPTION'), 41, '#e8d9a8');
    // façade vitrée autour de la porte tambour
    for (const [x, w] of [[12 * 32 + 6, 22], [15 * 32 + 6, 22]]) {
      O.fenetre(g, x, 6, w, 60, 'hall');
    }
    R(13 * 32 - 2, 2, 2 * 32 + 4, 4, '#3a3d46');
    g.drawImage(O.texteCanvas(O.enseigne('ENTREE', 'ENTRANCE'), '#f4d35e'), 14 * 32 - Math.round(O.mesurer(O.enseigne('ENTREE', 'ENTRANCE')) / 2), 2);
    return;
  }
  const c = (gy) => (O.H - gy) * 32;
  O.plaqueEtage(g, etage);
  // tableau des étages près des portiques, boîtes aux lettres, tableau de maître
  const t0 = Math.round(c(7.3));
  O.cadre(g, t0, 16, 40, 34, '#c9a227', '#1b1e2b');
  g.drawImage(O.texteCanvas(O.enseigne('ETAGES', 'FLOORS'), '#f4d35e'), t0 + 20 - Math.round(O.mesurer(O.enseigne('ETAGES', 'FLOORS')) / 2), 19);
  for (let k = 0; k < 4; k++) {
    R(t0 + 5, 29 + k * 5, 3, 3, '#f4d35e');
    R(t0 + 11, 30 + k * 5, 18 + (k % 2) * 6, 1, '#d9dce2');
  }
  boitesAuxLettres(g, Math.round(c(10.6)), 38, 7, 4, O);
  const p0 = Math.round(c(11.8));
  O.cadre(g, p0, 12, 18, 16, '#c9a227', '#9fd3ff');
  R(p0 + 2, 21, 14, 5, '#58a55c');
}

function decorsVerre(g, cote, longueur, etage, O) {
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  if (cote === 'droite') {
    // grand écran au nom du QG, derrière l'accueil
    const x0 = 5 * 32 + 8;
    const x1 = 11 * 32 - 8;
    R(x0 - 2, 6, x1 - x0 + 4, 54, '#2b2f36');
    for (let y = 0; y < 50; y++) {
      const t = y / 50;
      R(x0, 8 + y, x1 - x0, 1, `rgb(${Math.round(20 + 40 * t)},${Math.round(30 + 20 * t)},${Math.round(70 + 60 * t)})`);
    }
    const cx = Math.round((x0 + x1) / 2);
    O.texteDouble(g, O.enseigne('QG DES AGENTS', "AGENTS' HQ"), cx, 22, '#ffffff', '#3d8bff');
    for (let k = 0; k < 8; k++) R(x0 + 10 + k * 20, 48, 12, 2, ['#3df2ff', '#ff4fd8', '#ffe14d', '#7dff6a'][k % 4]);
    // portes coulissantes de l'entrée
    const d0 = 13 * 32 + 2;
    R(d0, 14, 60, 70, '#9aa3ad');
    R(d0 + 2, 16, 27, 68, 'rgba(200,235,255,0.55)');
    R(d0 + 31, 16, 27, 68, 'rgba(200,235,255,0.55)');
    R(d0 + 29, 16, 2, 68, '#7d8692');
    R(d0 + 24, 6, 12, 5, '#2b2f36');
    R(d0 + 27, 8, 6, 1, '#3dff7a');
    return;
  }
  const c = (gy) => (O.H - gy) * 32;
  O.plaqueEtage(g, etage);
  // mur végétal
  const x0 = Math.round(c(11.7));
  const x1 = Math.round(c(7.2));
  R(x0 - 2, 4, x1 - x0 + 4, O.HW - 10, '#3a3f48');
  const rnd = O.aleatoire(42);
  const verts = ['#2e8b3e', '#3fae4f', '#1f6b2d', '#56c45f', '#7fae4a', '#4a8a2a'];
  for (let k = 0; k < (x1 - x0) * 9; k++) {
    g.fillStyle = verts[Math.floor(rnd() * verts.length)];
    g.fillRect(x0 + Math.floor(rnd() * (x1 - x0 - 3)), 5 + Math.floor(rnd() * (O.HW - 14)), 3, 2);
  }
  for (let k = 0; k < (x1 - x0) / 6; k++) {
    g.fillStyle = rnd() < 0.5 ? '#f2b8e8' : '#f4d35e';
    g.fillRect(x0 + Math.floor(rnd() * (x1 - x0 - 2)), 6 + Math.floor(rnd() * (O.HW - 16)), 2, 2);
  }
}

function decorsDino(g, cote, longueur, etage, O) {
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  if (cote === 'droite') {
    O.enseigneQG(g);
    // bannières du muséum
    const banniere = (x, titre, sous, fond) => {
      R(x - 1, 8, 50, 2, '#c9a227');
      R(x, 10, 48, 40, fond);
      R(x, 50, 24, 4, fond);
      R(x + 24, 50, 24, 2, fond);
      g.drawImage(O.texteCanvas(titre, '#f4d35e'), x + 24 - Math.round(O.mesurer(titre) / 2), 16);
      g.drawImage(O.texteCanvas(sous, '#f4f2ea'), x + 24 - Math.round(O.mesurer(sous) / 2), 36);
    };
    banniere(4 * 32, 'T. REX', O.enseigne('-66 MA', '66 MYA'), '#7a1f2a');
    banniere(6 * 32 + 8, O.enseigne('FOSSILES', 'FOSSILS'), O.enseigne('SALLE 2', 'ROOM 2'), '#1f3b6b');
    // grandes portes en bois de l'entrée
    const d0 = 13 * 32 + 4;
    R(d0 - 3, 10, 62, 74, '#c9a227');
    R(d0, 13, 56, 71, '#4a2a14');
    for (const x of [d0 + 3, d0 + 30]) {
      R(x, 16, 23, 68, '#6b3a1f');
      R(x + 3, 20, 17, 24, '#5a3418');
      R(x + 3, 50, 17, 28, '#5a3418');
    }
    R(d0 + 26, 48, 2, 6, '#f4d35e');
    R(d0 + 30, 48, 2, 6, '#f4d35e');
    g.drawImage(O.texteCanvas(O.enseigne('ENTREE', 'ENTRANCE'), '#f4d35e'), d0 + 28 - Math.round(O.mesurer(O.enseigne('ENTREE', 'ENTRANCE')) / 2), 2);
    return;
  }
  const c = (gy) => (O.H - gy) * 32;
  O.plaqueEtage(g, etage);
  // fresque : volcan, ptérodactyles
  const x0 = Math.round(c(11.7));
  const x1 = Math.round(c(7.4));
  O.cadre(g, x0, 10, x1 - x0, 44, '#c9a227', '#f2b36b');
  R(x0 + 2, 12, x1 - x0 - 4, 14, '#f29a5b');
  const mx = Math.round((x0 + x1) / 2);
  for (let k = 0; k < 26; k++) R(mx - 26 + k, 52 - Math.round(k * 0.9), 52 - 2 * k, 1, '#5a3a2a');
  R(mx - 3, 26, 6, 4, '#ff6a1f');
  R(mx - 1, 18, 3, 8, 'rgba(90,80,80,0.7)');
  R(mx + 1, 13, 4, 6, 'rgba(90,80,80,0.5)');
  R(x0 + 2, 46, x1 - x0 - 4, 6, '#3a6b3a');
  for (const [px, py] of [[x0 + 12, 18], [x1 - 22, 22]]) {
    R(px, py, 9, 1, '#3a2a2a');
    R(px + 3, py - 1, 3, 1, '#3a2a2a');
    R(px - 2, py + 1, 3, 1, '#3a2a2a');
    R(px + 8, py + 1, 3, 1, '#3a2a2a');
  }
}

// ---------- registre ----------
export const MEUBLES = {
  hall_portique: portique,
  hall_portique_verre: portiqueVerre,
  hall_colonne: colonne,
  hall_credence: credence,
  hall_comptoir: comptoir,
  hall_presentoir: presentoir,
  hall_tambour: tambour,
  hall_banquette: banquette,
  hall_table_basse: tableBasse,
  hall_totem: totem,
  hall_presse: presse,
  hall_arbre: arbre,
  hall_banc_verre: bancVerre,
  hall_monolithe: monolithe,
  hall_chaise_design: chaiseDesign,
  hall_bassin: bassin,
  hall_sculpture: sculpture,
  hall_fauteuil_design: fauteuilDesign,
  hall_table_verre: tableVerre,
  hall_cordon: cordon,
  hall_tourniquet: tourniquet,
  hall_fougere: fougere,
  hall_palmier: palmier,
  hall_vitrine: vitrine,
  hall_banc: banc,
  hall_oeuf: oeuf,
  hall_trex: trex,
};

export const ANIMES = { hall_tambour: animeTambour, hall_bassin: animeBassin };

export const JEUX = {};

const ROSACE = {};
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ROSACE['r' + i + j] = ['hall_rosace' + i + j, '#e8e1d2'];

export const THEMES = {
  // Grand hall : marbre crème, rosace, boiseries, laiton, cuir.
  'hall-grand': {
    sols: { def: ['hall_marbre', '#e8e1d2'], lobby: ['hall_marbre', '#c9c4bb'], accueil: ['parquet', '#8f5a32'], ...ROSACE },
    mur: 'hall_pierre', dalle: '#5a5048', bureau: '#e8e1d2', chaise: '#2b2f36', canape: '#6b3a2a', canapeEquipe: '#6b3a2a', table: '#d9d2c4',
  },
  // Tour de verre : dalles blanches, aluminium, cuir blanc.
  'hall-verre': {
    sols: { def: ['hall_dalle', '#eceef0'], lobby: ['hall_dalle', '#dde0e4'], accueil: ['hall_dalle', '#f4f5f6'] },
    mur: 'hall_facade', dalle: '#3a3f48', bureau: '#f4f5f6', chaise: '#f4f5f6', canape: '#f0ede6', canapeEquipe: '#f0ede6', table: '#cfd5df',
  },
  // Hall au dinosaure : terrazzo, murs vert muséum, bois sombre et laiton.
  'hall-dino': {
    sols: { def: ['hall_terrazzo', '#d8cfbf'], lobby: ['hall_terrazzo', '#c6bcaa'], accueil: ['parquet', '#7a4a2a'], trace: ['hall_trace', '#d8cfbf'] },
    mur: 'hall_musee', dalle: '#3a2f25', bureau: '#7a4a2a', chaise: '#5a2a1a', canape: '#5a2a1a', canapeEquipe: '#5a2a1a', table: '#6e3f20',
  },
};

export const SOLS = { hall_marbre: solMarbre, hall_dalle: solDalle, hall_terrazzo: solTerrazzo, hall_trace: solTrace };
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) SOLS['hall_rosace' + i + j] = solRosace(i, j);

export const MURS = { hall_pierre: murPierre, hall_facade: murFacade, hall_musee: murMusee };

export const DECORS_MURS = { 'hall-grand': decorsGrand, 'hall-verre': decorsVerre, 'hall-dino': decorsDino };
