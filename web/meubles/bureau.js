// Meubles, sols et murs des décors au choix de la famille « bureau » (1.0.10). Contrat : web/meubles/index.js.
// Labyrinthe de box (panneaux, retours de bureau, photocopieuse…), loft industriel (cuisine ouverte, piliers en fonte,
// moto…) et bateau pirate (mât, canons, barre, tonneaux…). Même pixel art que web/decor.js : volumes en prismes,
// lumière en haut à gauche, contour sombre.

// ---------- outils ----------
const graine = (O, it) => O.aleatoire(O.hacher(it.type + '|' + it.x + ',' + it.y + '|' + (it.variante ?? '')));

// Sprite plus large qu'une case (mât, hamac…) : même repère que spriteTuile, avec une marge de chaque côté.
function spriteLarge(O, marge, htop, fn, contour = true) {
  const c = O.creerCanvas(66 + 2 * marge, htop + 36 + marge);
  const g = c.getContext('2d');
  const P = O.projeteur(33 + marge, htop + 1);
  fn(g, P);
  if (contour) O.contourner(c);
  return { c, dx: -1 - marge, dy: -(htop + 1) };
}

// Cylindre vertical (tonneau, mât, pot) : centre (cx, cy) et rayon r en cases, de z0 à z1. `bombe` renfle le milieu
// (tonneau), `cercles` : hauteurs des cerclages, `dessus` : couleur du couvercle.
function cylindre(O, g, P, cx, cy, r, z0, z1, col, { bombe = 0, cercles = [], cerclage = '#2b2b33', dessus = null } = {}) {
  const [sx, sy] = P(cx, cy, 0);
  const teintes = [O.nuance(col, 0.2), O.nuance(col, 0.08), col, O.nuance(col, -0.12), O.nuance(col, -0.26)];
  const tranche = (z, c0, rr) => {
    const A = rr * 45.25;
    const B = A / 2;
    for (let i = Math.floor(-A); i <= Math.ceil(A); i++) {
      const u = Math.max(-1, Math.min(1, i / A));
      const hh = B * Math.sqrt(Math.max(0, 1 - u * u));
      g.fillStyle = c0 || teintes[Math.min(4, Math.floor(((u + 1) / 2) * 5))];
      g.fillRect(Math.round(sx + i), Math.round(sy - z - hh), 1, Math.max(1, Math.round(2 * hh) + 1));
    }
  };
  const rayon = (z) => r * (1 + bombe * Math.sin((Math.PI * (z - z0)) / Math.max(1, z1 - z0)));
  for (let z = z0; z < z1; z++) tranche(z, cercles.some((h) => Math.abs(h - z) < 0.6) ? cerclage : null, rayon(z));
  tranche(z1, dessus || O.nuance(col, 0.24), rayon(z1));
}

// Disque vertical (roue, fond de tonneau couché) : centre (cx, cy, cz), dans le plan perpendiculaire à l'axe 'x' ou 'y'.
function disque(O, g, P, axe, cx, cy, cz, r, col, n = 20) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    pts.push(axe === 'x' ? P(cx, cy + r * Math.cos(t), cz + r * 30 * Math.sin(t)) : P(cx + r * Math.cos(t), cy, cz + r * 30 * Math.sin(t)));
  }
  O.poly(g, pts, col);
}

// Cylindre couché le long de x (tonneau sur son chevalet, fût de canon) : tranches de x0 à x1.
function cylindreX(O, g, P, x0, x1, cy, cz, r, col, { bombe = 0, cercles = [], cerclage = '#2b2b33', fond = null } = {}) {
  const n = Math.max(2, Math.round((x1 - x0) * 32));
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n;
    const rr = r * (1 + bombe * Math.sin((Math.PI * k) / n));
    const cer = cercles.some((h) => Math.abs(h - x) < 0.5 / 32 + 0.012);
    disque(O, g, P, 'x', x, cy, cz, rr, cer ? cerclage : k === n ? fond || O.nuance(col, 0.16) : O.nuance(col, -0.06 + 0.12 * Math.sin((k / n) * Math.PI)));
  }
}

// ---------- Labyrinthe de box ----------
// (les panneaux de tissu des box sont des cloisons pleines du plan : web/plans/bureau.js)
function retourBox(it, look, etat, O) {
  const T = O.theme(look);
  const col = T.bureau;
  const nord = it.cote === 'n';
  const y0 = nord ? 0.08 : 0;
  const y1 = nord ? 1 : 0.92;
  const v = (it.variante || 0) % 4;
  return O.spriteTuile(50, (g, P) => {
    O.pieds(g, P, 0, y0, 0.94, y1, 20, O.nuance(col, -0.35), { w: true, n: !nord, s: nord });
    O.prisme(g, P, 0, y0, 0.94, y1, 20, 24, col);
    const yb = nord ? 0.62 : 0.2; // côté de la cloison du milieu
    if (v === 0) {
      // bannettes « arrivée / départ » et papiers
      O.prisme(g, P, 0.5, yb, 0.84, yb + 0.22, 24, 27, '#3a3d46');
      O.prisme(g, P, 0.53, yb + 0.02, 0.81, yb + 0.2, 27, 28, '#f4f2ea');
      O.prisme(g, P, 0.5, yb, 0.84, yb + 0.22, 30, 31, '#3a3d46');
      O.prisme(g, P, 0.53, yb + 0.02, 0.81, yb + 0.2, 31, 32, '#f7e9a8');
      O.prisme(g, P, 0.12, 0.4, 0.22, 0.5, 24, 31, '#2f6fde');
      O.pixel(g, P(0.15, 0.43, 33), '#f6c21c', 1, 2);
    } else if (v === 1) {
      // téléphone beige à fil et cadre photo
      O.prisme(g, P, 0.2, 0.35, 0.5, 0.6, 24, 27, '#d8cfb6');
      O.prisme(g, P, 0.22, 0.36, 0.48, 0.44, 27, 30, '#c7bd9f');
      O.pixel(g, P(0.35, 0.6, 26), '#6b6455', 3, 1);
      O.prisme(g, P, 0.66, yb + 0.04, 0.82, yb + 0.08, 24, 34, '#8b5a2b');
      O.quadY(g, P, yb + 0.08, 0.68, 0.8, 26, 32, '#9fd3ff');
    } else if (v === 2) {
      // pot à crayons, mug, petit cactus
      O.prisme(g, P, 0.15, 0.3, 0.27, 0.42, 24, 31, '#5a5f6b');
      for (const [u, c] of [[0.17, '#e3342f'], [0.21, '#2f6fde'], [0.24, '#f6c21c']]) O.pixel(g, P(u, 0.35, 34), c, 1, 3);
      O.prisme(g, P, 0.62, 0.5, 0.74, 0.62, 24, 30, '#ffffff');
      O.prisme(g, P, 0.4, yb + 0.04, 0.52, yb + 0.16, 24, 29, '#c0603a');
      O.prisme(g, P, 0.43, yb + 0.07, 0.49, yb + 0.13, 29, 37, '#3fae4f');
    } else {
      // pile de dossiers et calculatrice
      for (let k = 0; k < 4; k++) O.prisme(g, P, 0.45, 0.25, 0.85, 0.6, 24 + k * 2, 26 + k * 2, ['#f4f2ea', '#f6c21c', '#9fd3ff', '#f4f2ea'][k]);
      O.prisme(g, P, 0.12, 0.5, 0.3, 0.72, 24, 25.5, '#3a3d46');
      O.quadZ(g, P, 25.6, 0.14, 0.52, 0.28, 0.58, '#b8e0a0');
    }
  });
}

function porteManteau(it, look, etat, O) {
  return O.spriteTuile(70, (g, P) => {
    O.prisme(g, P, 0.36, 0.36, 0.64, 0.64, 0, 2, '#2b2b33');
    O.prisme(g, P, 0.47, 0.47, 0.53, 0.53, 2, 60, '#6b4423');
    O.prisme(g, P, 0.42, 0.42, 0.58, 0.58, 58, 61, '#6b4423');
    // imperméable et écharpe accrochés
    O.prisme(g, P, 0.28, 0.5, 0.48, 0.66, 26, 56, '#c9a25a');
    O.prisme(g, P, 0.3, 0.52, 0.46, 0.64, 54, 58, '#b08a48');
    O.prisme(g, P, 0.54, 0.3, 0.62, 0.4, 36, 58, '#c0392b');
    // parapluie au pied
    O.prisme(g, P, 0.62, 0.58, 0.7, 0.66, 0, 26, '#1f2a44');
    O.pixel(g, P(0.66, 0.62, 30), '#6b4423', 2, 3);
  });
}

function classeur(it, look, etat, O) {
  const tole = ['#9aa0a8', '#b7b2a2', '#8d969c'][(it.variante || 0) % 3];
  return O.spriteTuile(56, (g, P) => {
    O.prisme(g, P, 0.15, 0.08, 0.85, 0.66, 0, 48, tole);
    for (let k = 0; k < 4; k++) {
      const z = 3 + k * 11;
      O.quadY(g, P, 0.66, 0.19, 0.81, z, z + 9, O.nuance(tole, 0.08));
      O.quadY(g, P, 0.66, 0.42, 0.58, z + 6, z + 7, '#3a3d46');
      O.quadY(g, P, 0.66, 0.44, 0.56, z + 3, z + 5, '#f4f2ea');
    }
    O.prisme(g, P, 0.3, 0.2, 0.62, 0.5, 48, 50, '#f6c21c');
  });
}

function photocopieuse(it, look, etat, O) {
  return O.spriteTuile(50, (g, P) => {
    O.prisme(g, P, 0.08, 0.12, 0.92, 0.82, 0, 34, '#d7d2c4');
    O.quadY(g, P, 0.82, 0.12, 0.88, 4, 14, '#c4bfb0');
    O.quadY(g, P, 0.82, 0.14, 0.86, 9, 10, '#8a8678');
    O.quadY(g, P, 0.82, 0.14, 0.86, 20, 21, '#8a8678');
    // bac de sortie et feuilles
    O.prisme(g, P, 0.9, 0.25, 1.04, 0.65, 18, 20, '#bdb8a9');
    O.prisme(g, P, 0.92, 0.3, 1.02, 0.6, 20, 22, '#ffffff');
    // capot et pupitre
    O.prisme(g, P, 0.1, 0.12, 0.9, 0.7, 34, 38, '#bfb9a8');
    O.prisme(g, P, 0.14, 0.7, 0.86, 0.84, 34, 36, '#3a3d46');
    O.quadZ(g, P, 36.2, 0.2, 0.72, 0.4, 0.8, '#9fd3a0');
    for (let k = 0; k < 3; k++) O.pixel(g, P(0.5 + k * 0.1, 0.77, 36.5), '#d9dce2', 2, 1);
  });
}

function animePhotocopieuse(g, it, tx, ty, t, O, effet) {
  if (effet) return effetPhotocopieuse(g, it, tx, ty, O, effet);
  const P = O.projeteur(tx + 32, ty);
  // voyant vert, et de temps en temps la barre lumineuse du scanner sous le capot
  O.pixel(g, P(0.82, 0.8, 37), Math.floor(t / 700) % 2 ? '#3dff7a' : '#0f4a22', 2, 1);
  const c = (t % 9000) / 9000;
  if (c < 0.3) {
    const u = 0.14 + (c / 0.3) * 0.72;
    O.quadY(g, P, 0.705, u, u + 0.05, 34, 35, '#c8ffd8');
  }
}

function frigo(it, look, etat, O) {
  const corps = look === 'bureau-loft' ? '#c9ced4' : '#eef0f2';
  return O.spriteTuile(74, (g, P) => {
    O.prisme(g, P, 0.12, 0.1, 0.88, 0.78, 0, 66, corps);
    O.quadY(g, P, 0.78, 0.14, 0.86, 44, 45, O.nuance(corps, -0.3));
    O.prisme(g, P, 0.74, 0.78, 0.79, 0.81, 48, 60, '#7d8692');
    O.prisme(g, P, 0.74, 0.78, 0.79, 0.81, 22, 40, '#7d8692');
    // magnets et dessin d'enfant
    O.quadY(g, P, 0.78, 0.22, 0.42, 26, 38, '#ffffff');
    O.quadY(g, P, 0.78, 0.25, 0.39, 28, 31, '#58a55c');
    O.pixel(g, P(0.32, 0.78, 36), '#f6c21c', 3, 3);
    O.pixel(g, P(0.5, 0.78, 54), '#e3342f', 2, 2);
    O.pixel(g, P(0.58, 0.78, 50), '#2f6fde', 2, 2);
  });
}

// ---------- Loft industriel ----------
function comptoir(it, look, etat, O) {
  const v = it.variante || 'evier';
  const caisson = '#2f3438';
  const plan = '#b8885a';
  return O.spriteTuile(60, (g, P) => {
    O.prisme(g, P, 0, 0.08, 1, 0.74, 0, 26, caisson);
    O.quadY(g, P, 0.74, 0.04, 0.48, 3, 23, O.nuance(caisson, 0.1));
    O.quadY(g, P, 0.74, 0.52, 0.96, 3, 23, O.nuance(caisson, 0.1));
    O.prisme(g, P, 0.38, 0.74, 0.46, 0.77, 18, 20, '#c9a227');
    O.prisme(g, P, 0.54, 0.74, 0.62, 0.77, 18, 20, '#c9a227');
    O.prisme(g, P, 0, 0.05, 1, 0.78, 26, 29, plan);
    // crédence en carreaux métro
    O.quadY(g, P, 0.06, 0, 1, 29, 44, '#f2f2ee');
    for (let z = 32; z < 44; z += 4) O.quadY(g, P, 0.06, 0, 1, z, z + 0.6, '#c9ccd0');
    if (v === 'evier') {
      O.quadZ(g, P, 29.2, 0.2, 0.25, 0.8, 0.62, '#9aa3ad');
      O.quadZ(g, P, 29.3, 0.25, 0.3, 0.75, 0.58, '#5d6570');
      O.prisme(g, P, 0.46, 0.12, 0.54, 0.2, 29, 42, '#c3cad3');
      O.prisme(g, P, 0.46, 0.12, 0.54, 0.36, 40, 43, '#c3cad3');
      O.prisme(g, P, 0.66, 0.6, 0.76, 0.7, 29, 33, '#ffffff');
    } else if (v === 'cafe') {
      // machine à espresso chromée et tasses
      O.prisme(g, P, 0.18, 0.12, 0.72, 0.52, 29, 48, '#c3cad3');
      O.prisme(g, P, 0.18, 0.12, 0.72, 0.52, 48, 50, '#8a1f2a');
      O.quadY(g, P, 0.52, 0.24, 0.66, 36, 44, '#2b2f36');
      O.prisme(g, P, 0.3, 0.52, 0.4, 0.62, 36, 38, '#1d1d22');
      O.prisme(g, P, 0.5, 0.52, 0.6, 0.62, 36, 38, '#1d1d22');
      O.prisme(g, P, 0.31, 0.55, 0.39, 0.62, 29, 33, '#ffffff');
      O.pixel(g, P(0.3, 0.52, 46), '#3dff7a', 1, 1);
      for (const u of [0.78, 0.88]) O.prisme(g, P, u, 0.3, u + 0.08, 0.38, 29, 32, '#ffffff');
    } else {
      // plaques de cuisson et casserole
      O.quadZ(g, P, 29.2, 0.12, 0.18, 0.88, 0.66, '#15151f');
      for (const [u, v2] of [[0.3, 0.3], [0.68, 0.3], [0.3, 0.54], [0.68, 0.54]]) O.quadZ(g, P, 29.4, u - 0.1, v2 - 0.08, u + 0.1, v2 + 0.08, '#3a3d46');
      O.prisme(g, P, 0.58, 0.44, 0.8, 0.64, 29, 35, '#9aa3ad');
      O.prisme(g, P, 0.8, 0.52, 0.98, 0.56, 33, 34, '#2b2b33');
    }
  });
}

function animeComptoir(g, it, tx, ty, t, O) {
  if (it.variante !== 'cafe') return;
  const P = O.projeteur(tx + 32, ty);
  const ph = (t / 1100) % 3;
  if (ph < 1) {
    const [x, y] = P(0.35, 0.58, 34 + ph * 10);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(x + Math.round(Math.sin(t / 200)), y, 2, 2);
    g.fillRect(x + 2, y - 4, 1, 2);
  }
}

function ilot(it, look, etat, O) {
  const p = it.part;
  const x0 = p === 'g' ? 0.06 : 0;
  const x1 = p === 'd' ? 0.94 : 1;
  return O.spriteTuile(44, (g, P) => {
    O.prisme(g, P, x0 + 0.04, 0.12, x1 - (p === 'd' ? 0.04 : 0), 0.66, 0, 26, '#2f3438');
    O.quadY(g, P, 0.66, x0 + 0.08, x1 - 0.08, 4, 22, '#3b4146');
    O.prisme(g, P, x0, 0.08, x1, 0.86, 26, 30, '#c8a173');
    if (p === 'm') {
      // corbeille de fruits
      O.prisme(g, P, 0.3, 0.3, 0.7, 0.62, 30, 33, '#8b5a2b');
      for (const [u, v, c] of [[0.38, 0.38, '#e3342f'], [0.5, 0.42, '#f6c21c'], [0.58, 0.36, '#3aa655'], [0.45, 0.5, '#ef7d22']]) O.pixel(g, P(u, v, 36), c, 3, 3);
    } else if (p === 'g') {
      O.prisme(g, P, 0.3, 0.3, 0.4, 0.4, 30, 36, '#ffffff');
      O.quadZ(g, P, 30.3, 0.55, 0.35, 0.8, 0.7, '#f4f2ea');
    } else {
      O.prisme(g, P, 0.2, 0.35, 0.3, 0.45, 30, 42, '#3a6b3a');
      O.pixel(g, P(0.25, 0.4, 46), '#c9a227', 1, 3);
    }
  });
}

function tabouret(it, look, etat, O) {
  return O.spriteTuile(30, (g, P) => {
    for (const [x, y] of [[0.3, 0.3], [0.64, 0.3], [0.3, 0.64], [0.64, 0.64]]) O.prisme(g, P, x, y, x + 0.06, y + 0.06, 0, 12, '#2b2f36');
    O.prisme(g, P, 0.32, 0.32, 0.68, 0.68, 6, 7, '#2b2f36');
    O.prisme(g, P, 0.26, 0.26, 0.74, 0.74, 12, 14, '#c0392b');
    O.quadZ(g, P, 14.1, 0.3, 0.3, 0.5, 0.42, '#e05a4b');
  });
}

function planteXL(it, look, etat, O) {
  const rnd = graine(O, it);
  const v = (it.variante || 0) % 3;
  return O.spriteTuile(86, (g, P) => {
    cylindre(O, g, P, 0.5, 0.5, 0.26, 0, 20, v === 1 ? '#c6c2b8' : '#5a5f66', { dessus: '#3b2a1e' });
    const [cx, cy] = P(0.5, 0.5, 20);
    if (v === 2) {
      // olivier : tronc tordu, feuillage argenté
      for (let z = 0; z < 26; z++) O.pixel(g, [cx - 1 + Math.round(Math.sin(z / 5) * 2), cy - z], '#6b5338', 3, 1);
      for (let i = 0; i < 70; i++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * 15;
        g.fillStyle = ['#8fa58a', '#a8bca3', '#6f8a6b'][Math.floor(rnd() * 3)];
        g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy - 40 + Math.sin(a) * r * 0.75), 3, 2);
      }
      return;
    }
    // monstera / ficus : grandes feuilles
    const verts = ['#2e8b3e', '#3fae4f', '#1f6b2d', '#56c45f'];
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 14;
      const hgt = 8 + rnd() * 50;
      const x = Math.round(cx + Math.cos(a) * r * (0.4 + hgt / 70));
      const y = Math.round(cy - hgt + Math.sin(a) * r * 0.35);
      g.fillStyle = verts[Math.floor(rnd() * verts.length)];
      g.fillRect(x - 3, y - 1, 7, 3);
      g.fillRect(x - 2, y - 2, 5, 1);
      g.fillRect(x - 2, y + 2, 5, 1);
    }
  });
}

function velo(it, look, etat, O) {
  return O.spriteTuile(52, (g, P) => {
    const roue = (u) => {
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        O.pixel(g, P(u + Math.cos(a) * 0.2, 0.3, 12 + Math.sin(a) * 11), '#1d1d22', 2, 2);
      }
      O.pixel(g, P(u, 0.3, 12), '#c3cad3', 2, 2);
    };
    roue(0.24);
    roue(0.76);
    const cadre = '#2f7a68';
    const trait = (u0, z0, u1, z1) => {
      for (let k = 0; k <= 12; k++) O.pixel(g, P(u0 + ((u1 - u0) * k) / 12, 0.3, z0 + ((z1 - z0) * k) / 12), cadre, 2, 2);
    };
    trait(0.24, 12, 0.48, 12);
    trait(0.48, 12, 0.42, 26);
    trait(0.42, 26, 0.68, 26);
    trait(0.68, 26, 0.48, 12);
    trait(0.68, 26, 0.76, 12);
    trait(0.42, 26, 0.24, 12);
    O.prisme(g, P, 0.36, 0.25, 0.48, 0.35, 28, 30, '#5a3a1f');
    O.prisme(g, P, 0.68, 0.22, 0.72, 0.38, 30, 32, '#1d1d22');
    O.prisme(g, P, 0.38, 0.27, 0.42, 0.33, 26, 28, cadre);
  });
}

function etagereMetal(it, look, etat, O) {
  const rnd = graine(O, it);
  const gauche = it.mur === 'gauche';
  return O.spriteTuile(72, (g, P) => {
    const Pr = (a0, b0, a1, b1, z0, z1, col) => (gauche ? O.prisme(g, P, b0, a0, b1, a1, z0, z1, col) : O.prisme(g, P, a0, b0, a1, b1, z0, z1, col));
    for (const a of [0.1, 0.86]) for (const b of [0.08, 0.38]) Pr(a, b, a + 0.04, b + 0.04, 0, 64, '#3a3d46');
    for (const z of [4, 22, 40, 58]) {
      Pr(0.1, 0.08, 0.9, 0.42, z, z + 2, '#5d6570');
      if (z > 50) continue;
      // caisses, cartons, bobines
      let a = 0.14;
      while (a < 0.82) {
        const w = 0.18 + rnd() * 0.14;
        const h = 6 + Math.floor(rnd() * 9);
        const col = ['#b98a57', '#c9a25a', '#2f6fde', '#3a3d46', '#e3342f'][Math.floor(rnd() * 5)];
        Pr(a, 0.12, Math.min(0.86, a + w), 0.38, z + 2, z + 2 + h, col);
        a += w + 0.04;
      }
    }
  });
}

function pilier(it, look, etat, O) {
  const fonte = '#3d4a46';
  return O.spriteTuile(92, (g, P) => {
    O.prisme(g, P, 0.28, 0.28, 0.72, 0.72, 0, 5, O.nuance(fonte, -0.1));
    O.prisme(g, P, 0.33, 0.33, 0.67, 0.67, 5, 8, fonte);
    O.prisme(g, P, 0.39, 0.39, 0.61, 0.61, 8, 76, fonte);
    // cannelures
    for (const u of [0.43, 0.49, 0.55]) O.quadY(g, P, 0.61, u, u + 0.015, 10, 74, O.nuance(fonte, 0.18));
    for (const v of [0.45, 0.53]) O.quadX(g, P, 0.61, v, v + 0.015, 10, 74, O.nuance(fonte, -0.3));
    O.prisme(g, P, 0.33, 0.33, 0.67, 0.67, 76, 80, fonte);
    O.prisme(g, P, 0.26, 0.26, 0.74, 0.74, 80, 84, O.nuance(fonte, 0.1));
    for (const [u, v] of [[0.3, 0.74], [0.5, 0.74], [0.7, 0.74]]) O.pixel(g, P(u, v, 82), '#9aa3ad');
  });
}

function moto(it, look, etat, O) {
  return O.spriteTuile(44, (g, P) => {
    const roue = (u) => {
      for (let k = 0; k < 26; k++) {
        const a = (k / 26) * Math.PI * 2;
        O.pixel(g, P(u + Math.cos(a) * 0.17, 0.5, 10 + Math.sin(a) * 9), '#15151f', 3, 2);
      }
      O.pixel(g, P(u, 0.5, 10), '#c3cad3', 3, 2);
    };
    roue(0.18);
    roue(0.82);
    O.prisme(g, P, 0.3, 0.42, 0.7, 0.58, 8, 16, '#3a3d46');
    O.prisme(g, P, 0.36, 0.44, 0.6, 0.56, 6, 12, '#9aa3ad');
    O.prisme(g, P, 0.52, 0.4, 0.8, 0.6, 18, 26, '#8a1f2a');
    O.quadZ(g, P, 26.2, 0.56, 0.44, 0.74, 0.5, '#c94a4a');
    O.prisme(g, P, 0.24, 0.43, 0.52, 0.57, 18, 22, '#6b4423');
    O.prisme(g, P, 0.2, 0.43, 0.26, 0.57, 18, 25, '#6b4423');
    O.prisme(g, P, 0.8, 0.46, 0.84, 0.54, 14, 28, '#c3cad3');
    O.prisme(g, P, 0.78, 0.3, 0.84, 0.7, 28, 30, '#1d1d22');
    O.prisme(g, P, 0.86, 0.45, 0.92, 0.55, 22, 26, '#fff1b0');
    O.prisme(g, P, 0.1, 0.6, 0.4, 0.66, 8, 10, '#c3cad3');
  });
}

// ---------- Bateau pirate ----------
function rambarde(it, look, etat, O) {
  const bois = '#6b4423';
  const n = it.bord === 'n';
  return O.spriteTuile(44, (g, P) => {
    const Pr = (a0, b0, a1, b1, z0, z1, col) => (n ? O.prisme(g, P, a0, b0, a1, b1, z0, z1, col) : O.prisme(g, P, b0, a0, b1, a1, z0, z1, col));
    Pr(0, 0, 1, 0.08, 0, 3, O.nuance(bois, -0.15));
    for (const a of [0.12, 0.37, 0.62, 0.87]) {
      Pr(a - 0.03, 0.01, a + 0.03, 0.07, 3, 22, O.nuance(bois, 0.15));
      Pr(a - 0.045, 0, a + 0.045, 0.08, 10, 14, O.nuance(bois, 0.15));
    }
    Pr(-0.01, -0.01, 1.01, 0.09, 22, 26, bois);
    if (it.pilier || it.fin) {
      Pr(-0.02, -0.03, 0.1, 0.11, 0, 30, O.nuance(bois, -0.05));
      Pr(0, -0.01, 0.08, 0.09, 30, 34, '#c9a227');
    }
  });
}

function tonneau(it, look, etat, O) {
  const bois = ['#8a5a2b', '#7a4a22', '#9a6a3a', '#6e4a2a'][(it.variante || 0) % 4];
  return O.spriteTuile(40, (g, P) => {
    cylindre(O, g, P, 0.5, 0.5, 0.27, 0, 28, bois, { bombe: 0.14, cercles: [4, 13, 15, 24], cerclage: '#3a3d46', dessus: O.nuance(bois, 0.18) });
    const [cx, cy] = P(0.5, 0.5, 28);
    O.pixel(g, [cx - 6, cy], O.nuance(bois, -0.25), 12, 1);
    O.pixel(g, [cx - 1, cy - 3], O.nuance(bois, -0.25), 2, 2);
  });
}

function tabouretTonneau(it, look, etat, O) {
  return O.spriteTuile(24, (g, P) => {
    cylindre(O, g, P, 0.5, 0.5, 0.22, 0, 14, '#8a5a2b', { bombe: 0.1, cercles: [3, 11], cerclage: '#3a3d46', dessus: '#a8763f' });
  });
}

function cordage(it, look, etat, O) {
  return O.spriteTuile(10, (g, P) => {
    const [cx, cy] = P(0.5, 0.5, 1);
    for (let k = 0; k < 160; k++) {
      const a = k * 0.32;
      const r = 3 + k * 0.09;
      g.fillStyle = k % 9 < 5 ? '#c9a46a' : '#a8844c';
      g.fillRect(Math.round(cx + Math.cos(a) * r * 1.4), Math.round(cy + Math.sin(a) * r * 0.7 - (k > 140 ? 1 : 0)), 2, 2);
    }
  }, false);
}

function canon(it, look, etat, O) {
  return O.spriteTuile(36, (g, P) => {
    // affût et roues, fût tourné vers le bastingage (-y)
    O.prisme(g, P, 0.28, 0.3, 0.72, 0.86, 3, 12, '#6b4423');
    O.prisme(g, P, 0.28, 0.6, 0.72, 0.86, 12, 17, '#6b4423');
    for (const v of [0.36, 0.78]) {
      disque(O, g, P, 'x', 0.26, v, 6, 0.12, '#3a2a1a', 14);
      disque(O, g, P, 'x', 0.74, v, 6, 0.12, '#4a3624', 14);
      O.pixel(g, P(0.74, v, 6), '#c9a227', 2, 2);
    }
    // fût
    for (let k = 0; k <= 20; k++) {
      const v = 0.92 - k * 0.042;
      const rr = 0.11 - k * 0.002;
      const [x, y] = P(0.5, v, 18 - k * 0.2);
      const rx = Math.round(rr * 45);
      g.fillStyle = k === 20 ? '#3a3d46' : '#1d1f26';
      g.fillRect(x - rx, y - rx, rx * 2, rx * 2);
      if (k % 6 === 0) {
        g.fillStyle = '#3a3d46';
        g.fillRect(x - rx, y - rx, rx * 2, 1);
      }
    }
    const [mx, my] = P(0.5, 0.06, 14);
    g.fillStyle = '#000000';
    g.fillRect(mx - 2, my - 2, 4, 4);
  });
}

function mat(it, look, etat, O) {
  return spriteLarge(O, 70, 186, (g, P) => {
    // grand mât cerclé de fer, vergue et voile ferlée, hune ; le pavillon est animé (animeMat)
    cylindre(O, g, P, 0.5, 0.5, 0.2, 0, 8, '#6b4423');
    cylindre(O, g, P, 0.5, 0.5, 0.12, 8, 176, '#9a6a3a');
    for (const z of [40, 90]) cylindre(O, g, P, 0.5, 0.5, 0.135, z, z + 3, '#3a3d46');
    O.prisme(g, P, -1.2, 0.45, 2.2, 0.55, 118, 122, '#7a4a22');
    O.prisme(g, P, -1.05, 0.42, 2.05, 0.58, 108, 118, '#efe6cf');
    for (let u = -0.9; u < 2; u += 0.45) O.prisme(g, P, u, 0.41, u + 0.05, 0.59, 107, 119, '#c9b98f');
    cylindre(O, g, P, 0.5, 0.5, 0.42, 148, 154, '#7a4a22', { dessus: '#8a5a2b' });
    cylindre(O, g, P, 0.5, 0.5, 0.42, 154, 158, '#6b4423', { dessus: '#5a3a1f' });
  });
}

function animeMat(g, it, tx, ty, t, O) {
  // pavillon noir à tête de mort, qui claque au vent en haut du mât
  const P = O.projeteur(tx + 32, ty);
  const [x0, y0] = P(0.5, 0.5, 186);
  for (let i = 0; i < 26; i++) {
    const onde = Math.round(Math.sin(t / 180 + i / 4) * 2 * (i / 26));
    g.fillStyle = i === 0 ? '#3a2a1a' : '#15151f';
    g.fillRect(x0 + 2 + i, y0 + onde, 1, 16);
  }
  const [cx, cy] = [x0 + 15, y0 + Math.round(Math.sin(t / 180 + 13 / 4) * 1)];
  g.fillStyle = '#f4f2ea';
  g.fillRect(cx - 3, cy + 3, 6, 5);
  g.fillRect(cx - 2, cy + 8, 4, 2);
  g.fillStyle = '#15151f';
  g.fillRect(cx - 2, cy + 5, 1, 1);
  g.fillRect(cx + 1, cy + 5, 1, 1);
  g.fillStyle = '#f4f2ea';
  g.fillRect(cx - 6, cy + 11, 3, 1);
  g.fillRect(cx + 3, cy + 11, 3, 1);
  g.fillRect(cx - 4, cy + 12, 8, 1);
  g.fillStyle = '#6b4423';
  g.fillRect(x0, y0 - 2, 2, 22);
}

function barre(it, look, etat, O) {
  return O.spriteTuile(66, (g, P) => {
    O.prisme(g, P, 0.36, 0.36, 0.64, 0.64, 0, 4, '#5a3a1f');
    O.prisme(g, P, 0.42, 0.42, 0.58, 0.58, 4, 34, '#7a4a22');
    O.prisme(g, P, 0.38, 0.38, 0.62, 0.62, 30, 36, '#6b4423');
    // la roue, dans le plan x = 0.5 (tournée vers le capitaine)
    const cz = 46;
    const R = 0.36;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      for (let s = 0; s <= 10; s++) {
        const r = (R * 1.3 * s) / 10;
        O.pixel(g, P(0.46, 0.5 + Math.cos(a) * r, cz + Math.sin(a) * r * 30), s > 7 ? '#c9a46a' : '#8a5a2b', 2, 2);
      }
    }
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      O.pixel(g, P(0.46, 0.5 + Math.cos(a) * R, cz + Math.sin(a) * R * 30), '#6b4423', 2, 2);
    }
    O.pixel(g, P(0.46, 0.5, cz), '#c9a227', 3, 3);
  });
}

function coffre(it, look, etat, O) {
  return O.spriteTuile(44, (g, P) => {
    O.prisme(g, P, 0.14, 0.24, 0.86, 0.76, 0, 16, '#7a4a22');
    for (const u of [0.24, 0.76]) O.quadY(g, P, 0.76, u - 0.04, u + 0.04, 0, 16, '#c9a227');
    O.quadY(g, P, 0.76, 0.45, 0.55, 8, 13, '#c9a227');
    // trésor qui déborde
    O.quadZ(g, P, 16, 0.18, 0.28, 0.82, 0.72, '#f4c430');
    for (const [u, v, c] of [[0.3, 0.4, '#ffe680'], [0.5, 0.5, '#e3342f'], [0.62, 0.36, '#3df2ff'], [0.42, 0.6, '#ffe680'], [0.7, 0.58, '#3aa655']]) O.pixel(g, P(u, v, 18), c, 2, 2);
    // couvercle ouvert, rabattu vers le mur
    O.poly(g, [P(0.14, 0.24, 16), P(0.86, 0.24, 16), P(0.86, 0.12, 34), P(0.14, 0.12, 34)], '#8a5a2b');
    O.poly(g, [P(0.2, 0.235, 17), P(0.8, 0.235, 17), P(0.8, 0.13, 32), P(0.2, 0.13, 32)], '#5a3a1f');
    // pièces tombées par terre
    O.pixel(g, P(0.7, 0.9, 1), '#f4c430', 3, 2);
    O.pixel(g, P(0.9, 0.7, 1), '#f4c430', 3, 2);
  });
}

function animeCoffre(g, it, tx, ty, t, O, effet) {
  const P = O.projeteur(tx + 32, ty);
  if (effet) {
    // easter egg : fontaine de pièces d'or qui retombent en tournant
    const rnd = O.aleatoire(11);
    for (let i = 0; i < 16; i++) {
      const vx = -0.5 + rnd();
      const vy = -0.5 + rnd();
      const h = 30 + rnd() * 30;
      const u = (effet.depuis - i * 150) / 1100;
      if (u < 0 || u > 1) continue;
      const [x, y] = P(0.5 + vx * u, 0.5 + vy * u, 18 + h * 4 * u * (1 - u));
      const large = Math.floor(effet.depuis / 90 + i) % 3;
      g.fillStyle = O.CONTOUR;
      g.fillRect(Math.round(x) - 1 - (large ? 1 : 0), Math.round(y) - 1, large ? 5 : 3, 5);
      g.fillStyle = large === 1 ? '#ffe680' : '#f4c430';
      g.fillRect(Math.round(x) - (large ? 1 : 0), Math.round(y), large ? 3 : 1, 3);
    }
  }
  const pts = [[0.32, 0.42], [0.6, 0.5], [0.46, 0.34], [0.7, 0.62]];
  const k = Math.floor(t / 400) % pts.length;
  const [x, y] = P(pts[k][0], pts[k][1], 19);
  g.fillStyle = '#ffffff';
  g.fillRect(x, y - 2, 1, 5);
  g.fillRect(x - 2, y, 5, 1);
}

function lanterne(it, look, etat, O) {
  return O.spriteTuile(70, (g, P) => {
    O.prisme(g, P, 0.42, 0.42, 0.58, 0.58, 0, 56, '#5a3a1f');
    O.prisme(g, P, 0.42, 0.42, 0.78, 0.5, 54, 57, '#5a3a1f');
    O.prisme(g, P, 0.62, 0.38, 0.8, 0.56, 34, 48, '#2b2b33');
    O.prisme(g, P, 0.64, 0.4, 0.78, 0.54, 36, 46, '#ffcf6a');
    O.prisme(g, P, 0.6, 0.36, 0.82, 0.58, 48, 51, '#2b2b33');
  });
}

function animeLanterne(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const f = 0.5 + 0.5 * Math.sin(t / 130) * Math.sin(t / 370);
  const [x, y] = P(0.71, 0.47, 41);
  g.fillStyle = `rgba(255, 220, 120, ${0.25 + f * 0.3})`;
  g.fillRect(x - 6, y - 6, 12, 12);
  g.fillStyle = '#fff3c4';
  g.fillRect(x - 1, y - 2, 2, 3);
}

function carteTresor(it, look, etat, O) {
  return O.spriteTuile(28, (g, P) => {
    O.quadZ(g, P, 24.4, -0.3, 0.12, 0.9, 0.92, '#e8d5a0');
    O.quadZ(g, P, 24.5, -0.26, 0.16, 0.86, 0.88, '#f2e2b4');
    // îles, pointillés et croix rouge
    O.quadZ(g, P, 24.6, -0.1, 0.3, 0.2, 0.55, '#9ab873');
    O.quadZ(g, P, 24.6, 0.45, 0.5, 0.75, 0.75, '#9ab873');
    for (let k = 0; k < 8; k++) O.pixel(g, P(0.05 + k * 0.07, 0.42 + k * 0.03, 24.7), '#8a1f2a');
    const [x, y] = P(0.62, 0.64, 24.8);
    g.fillStyle = '#c0392b';
    for (let k = -2; k <= 2; k++) {
      g.fillRect(x + k * 2, y + k, 2, 1);
      g.fillRect(x - k * 2, y + k, 2, 1);
    }
    // boussole et dague posées
    O.prisme(g, P, 0.7, 0.2, 0.84, 0.32, 24, 26, '#c9a227');
    O.prisme(g, P, -0.2, 0.7, 0.3, 0.74, 24, 25.5, '#c3cad3');
    O.prisme(g, P, -0.28, 0.68, -0.18, 0.76, 24, 26.5, '#5a3a1f');
  }, false);
}

function perroquet(it, look, etat, O) {
  return O.spriteTuile(70, (g, P) => {
    O.prisme(g, P, 0.36, 0.36, 0.64, 0.64, 0, 3, '#5a3a1f');
    O.prisme(g, P, 0.47, 0.47, 0.53, 0.53, 3, 46, '#7a4a22');
    O.prisme(g, P, 0.47, 0.2, 0.53, 0.8, 46, 49, '#7a4a22');
    O.prisme(g, P, 0.42, 0.62, 0.58, 0.74, 44, 46, '#c9a46a');
  });
}

function animePerroquet(g, it, tx, ty, t, O, effet) {
  // ara rouge perché, qui hoche la tête et bat des ailes de temps en temps ; easter eggs : il s'envole affolé quand les
  // canons tonnent, il crie « Pièces de huit ! » quand le coffre déborde
  const P = O.projeteur(tx + 32, ty);
  if (effet && effet.source.type === 'pirate_canon') {
    const a = effet.depuis / 280;
    const [cx, cy] = P(0.5, 0.4, 76);
    const fx = Math.round(cx + Math.cos(a) * 22);
    const fy = Math.round(cy + Math.sin(a) * 9);
    const aile = Math.floor(effet.depuis / 90) % 2;
    g.fillStyle = '#15151f';
    g.fillRect(fx - 4, fy - 4, 9, 7);
    g.fillStyle = '#e3342f';
    g.fillRect(fx - 3, fy - 3, 7, 5);
    g.fillStyle = '#2f6fde';
    g.fillRect(fx - 9, fy - (aile ? 6 : 0), 6, 2);
    g.fillRect(fx + 4, fy - (aile ? 6 : 0), 6, 2);
    g.fillStyle = '#f6c21c';
    g.fillRect(fx - (Math.sin(a) > 0 ? 5 : -5), fy + 2, 2, 3);
    O.phylactere(g, fx, fy - 6, O.enseigne('COUAC !', 'SQUAWK!'), '#a8232a');
    return;
  }
  const [x, y] = P(0.5, 0.4, 49);
  if (effet) O.phylactere(g, x, y - 18, O.enseigne('Pièces de huit !', 'Pieces of eight!'));
  const hoche = Math.floor(t / 600) % 4 === 0 ? 1 : 0;
  const bat = (t % 7000) < 700 && Math.floor(t / 120) % 2;
  const R = (dx, dy, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x + dx, y + dy, w, h);
  };
  R(-3, -12, 7, 11, '#15151f');
  R(-2, -11, 5, 9, '#e3342f');
  R(-1, -3, 2, 7, '#2f6fde');
  R(0, 4, 1, 3, '#f6c21c');
  if (bat) {
    R(-8, -12, 5, 3, '#2f6fde');
    R(4, -12, 5, 3, '#2f6fde');
  } else {
    R(-3, -8, 2, 5, '#2f6fde');
    R(2, -8, 2, 5, '#f6c21c');
  }
  R(-2, -16 + hoche, 6, 5, '#15151f');
  R(-1, -15 + hoche, 4, 3, '#e3342f');
  R(3, -14 + hoche, 2, 2, '#f4f2ea');
  R(1, -14 + hoche, 1, 1, '#15151f');
  R(-1, 0, 1, 1, '#c9a227');
  R(1, 0, 1, 1, '#c9a227');
}

function caisse(it, look, etat, O) {
  const bois = '#b5884e';
  const boite = (g, P, x0, y0, x1, y1, z0, z1) => {
    O.prisme(g, P, x0, y0, x1, y1, z0, z1, bois);
    const h = z1 - z0;
    O.quadY(g, P, y1, x0, x1, z0 + h * 0.45, z0 + h * 0.55, O.nuance(bois, -0.2));
    O.quadX(g, P, x1, y0, y1, z0 + h * 0.45, z0 + h * 0.55, O.nuance(bois, -0.35));
    O.quadY(g, P, y1, x0, x0 + 0.05, z0, z1, O.nuance(bois, -0.2));
    O.quadY(g, P, y1, x1 - 0.05, x1, z0, z1, O.nuance(bois, -0.2));
  };
  if (it.variante === 'pile') {
    return O.spriteTuile(56, (g, P) => {
      boite(g, P, 0.1, 0.1, 0.9, 0.9, 0, 22);
      boite(g, P, 0.2, 0.15, 0.8, 0.7, 22, 40);
      O.quadY(g, P, 0.7, 0.32, 0.68, 28, 34, '#f4f2ea');
      O.quadY(g, P, 0.7, 0.36, 0.64, 30, 32, '#8a1f2a');
    });
  }
  return O.spriteTuile(36, (g, P) => {
    boite(g, P, 0.12, 0.12, 0.88, 0.88, 0, 20);
    // cartes à jouer, dés et chope
    O.quadZ(g, P, 20.2, 0.22, 0.25, 0.42, 0.45, '#f4f2ea');
    O.quadZ(g, P, 20.3, 0.3, 0.32, 0.5, 0.52, '#ffffff');
    O.pixel(g, P(0.4, 0.42, 21), '#c0392b', 2, 1);
    O.prisme(g, P, 0.58, 0.3, 0.66, 0.38, 20, 23, '#f4f2ea');
    O.prisme(g, P, 0.6, 0.55, 0.76, 0.71, 20, 28, '#c9a46a');
    O.quadZ(g, P, 28.2, 0.62, 0.57, 0.74, 0.69, '#fff3c4');
  });
}

function ancre(it, look, etat, O) {
  return O.spriteTuile(70, (g, P) => {
    const fer = '#2b2f36';
    // contre le mur gauche (plan x ≈ 0.2), la tige debout
    O.prisme(g, P, 0.14, 0.46, 0.24, 0.54, 6, 58, fer);
    O.prisme(g, P, 0.12, 0.3, 0.26, 0.7, 50, 54, fer);
    for (let k = 0; k <= 14; k++) {
      const a = Math.PI * (k / 14);
      O.prisme(g, P, 0.15, 0.5 + Math.cos(a) * 0.3, 0.23, 0.5 + Math.cos(a) * 0.3 + 0.06, 6 + (1 - Math.sin(a)) * 10, 10 + (1 - Math.sin(a)) * 10, fer);
    }
    O.prisme(g, P, 0.12, 0.14, 0.26, 0.24, 16, 24, fer);
    O.prisme(g, P, 0.12, 0.76, 0.26, 0.86, 16, 24, fer);
    cylindre(O, g, P, 0.19, 0.5, 0.08, 58, 66, '#3a3d46', { dessus: '#15151f' });
  });
}

function tonneauRhum(it, look, etat, O) {
  return O.spriteTuile(52, (g, P) => {
    // chevalet
    for (const u of [0.22, 0.7]) O.prisme(g, P, u, 0.2, u + 0.08, 0.8, 0, 12, '#5a3a1f');
    // tonneau couché, robinet sur le fond
    cylindreX(O, g, P, 0.14, 0.84, 0.5, 24, 0.3, '#8a5a2b', { bombe: 0.1, cercles: [0.22, 0.4, 0.58, 0.76], cerclage: '#3a3d46', fond: '#a8763f' });
    const [x, y] = P(0.84, 0.5, 24);
    g.fillStyle = '#6b4423';
    g.fillRect(x - 1, y - 9, 3, 1);
    g.fillRect(x - 5, y - 5, 10, 1);
    g.fillStyle = '#f4f2ea';
    g.fillRect(x - 5, y - 2, 11, 5);
    g.drawImage(O.texteCanvas('RHUM', '#8a1f2a'), x - 7, y - 3);
    O.prisme(g, P, 0.84, 0.46, 0.96, 0.54, 12, 15, '#c9a227');
    O.prisme(g, P, 0.92, 0.47, 0.96, 0.53, 9, 12, '#c9a227');
    // chope dessous
    O.prisme(g, P, 0.9, 0.62, 1.0, 0.74, 0, 6, '#c9a46a');
  });
}

function animeTonneauRhum(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const c = (t % 2600) / 2600;
  if (c < 0.5) {
    const [x, y] = P(0.94, 0.5, 9 - c * 14);
    g.fillStyle = '#c0782a';
    g.fillRect(x, y, 1, 2);
  }
}

function hamac(it, look, etat, O) {
  return O.spriteBloc(2, 1, 50, (g, P) => {
    for (const u of [0.1, 1.84]) O.prisme(g, P, u, 0.44, u + 0.08, 0.56, 0, 42, '#6b4423');
    // toile qui pend entre les deux poteaux
    const toile = ['#d9cba6', '#b9433a', '#d9cba6', '#2f6fde', '#d9cba6'];
    for (let k = 0; k <= 32; k++) {
      const u = 0.2 + (1.62 * k) / 32;
      const z = 34 - Math.sin((Math.PI * k) / 32) * 18;
      toile.forEach((c, i) => O.pixel(g, P(u, 0.3 + i * 0.09, z), c, 2, 3));
    }
    for (const u of [0.18, 1.82]) for (let i = 0; i < 5; i++) O.pixel(g, P(u, 0.3 + i * 0.09, 37), '#a8844c', 1, 2);
  });
}

// ---------- sols ----------
function solBetonCire(g, col, { parite, variante, rnd }, O) {
  const Pt = O.projeteur(32, 0);
  for (let i = 0; i < 40; i++) {
    const [x, y] = [Math.floor(rnd() * 64), Math.floor(rnd() * 31)];
    if (Math.abs(x - 32) / 32 + Math.abs(y - 15.5) / 15.5 > 0.95) continue;
    g.fillStyle = rnd() < 0.5 ? O.nuance(col, -0.06) : O.nuance(col, 0.06);
    g.fillRect(x, y, 2, 1);
  }
  // reflet ciré et joint de dalle (une case sur deux)
  O.pixel(g, Pt(0.3, 0.25), O.nuance(col, 0.12), 6, 1);
  if (parite) {
    const a = Pt(1, 0);
    for (let k = 0; k < 16; k++) O.pixel(g, [a[0] - 2 * k - 2, a[1] + k], O.nuance(col, -0.2), 2, 1);
  }
  if (variante === 1) for (let k = 0; k < 7; k++) O.pixel(g, Pt(0.5 + k * 0.04, 0.6 - k * 0.03 + (k % 2) * 0.02), O.nuance(col, -0.18));
}

function solCarreauxCiment(g, col, { parite }, O) {
  const Pt = O.projeteur(32, 0);
  const bleu = '#2f5f8a';
  const noir = '#2b2f36';
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const u0 = i / 2;
      const v0 = j / 2;
      const q = (a, b, c, d, cc) => O.poly(g, [Pt(u0 + a / 2, v0 + b / 2), Pt(u0 + c / 2, v0 + b / 2), Pt(u0 + c / 2, v0 + d / 2), Pt(u0 + a / 2, v0 + d / 2)], cc);
      // étoile à quatre branches au centre de chaque carreau, quarts de cercle aux coins
      q(0.38, 0.1, 0.62, 0.9, (i + j + parite) % 2 ? bleu : noir);
      q(0.1, 0.38, 0.9, 0.62, (i + j + parite) % 2 ? bleu : noir);
      q(0.44, 0.44, 0.56, 0.56, col);
      for (const [a, b] of [[0, 0], [0.84, 0], [0, 0.84], [0.84, 0.84]]) q(a, b, a + 0.16, b + 0.16, '#c9a227');
    }
  }
}

function solPont(g, col, { variante, rnd }, O) {
  // planches du pont, le long de x, calfatées de noir, avec des clous
  const Pt = O.projeteur(32, 0);
  const teintes = [col, O.nuance(col, -0.07), O.nuance(col, 0.06), O.nuance(col, -0.12)];
  for (let b = 0; b < 3; b++) {
    O.poly(g, [Pt(0, b / 3), Pt(1, b / 3), Pt(1, (b + 1) / 3), Pt(0, (b + 1) / 3)], teintes[(b + variante) % 4]);
    for (let k = 0; k < 6; k++) O.pixel(g, Pt(rnd(), b / 3 + 0.05 + rnd() * 0.23), O.nuance(col, -0.15), 3, 1);
  }
  for (let b = 1; b < 3; b++) {
    const a = Pt(0, b / 3);
    for (let k = 0; k < 16; k++) O.pixel(g, [a[0] + 2 * k, a[1] + k], '#2b1d12', 2, 1);
  }
  const bout = Pt(variante % 2 ? 0.5 : 0.25, 0);
  for (let k = 0; k < 6; k++) O.pixel(g, [bout[0] - 2 * k, bout[1] + k], '#3a2717', 2, 1);
  for (const [u, v] of [[0.1, 0.15], [0.9, 0.15], [0.1, 0.5], [0.9, 0.5], [0.1, 0.83], [0.9, 0.83]]) O.pixel(g, Pt(u, v), '#2b2b33', 1, 1);
}

// ---------- murs ----------
function murBriques(g, longueur, cote, rnd, O) {
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  const HW = O.HW;
  R(0, 0, longueur, HW, '#b9ab98');
  const tons = ['#9a4a32', '#a85538', '#8a4029', '#b05e3f', '#94462f', '#7f3a26'];
  for (let row = 0; row * 7 < HW; row++) {
    const dec = row % 2 ? 9 : 0;
    for (let bx = -dec; bx < longueur; bx += 18) {
      const c = tons[Math.floor(rnd() * tons.length)];
      R(bx + 1, row * 7 + 1, 17, 6, c);
      R(bx + 1, row * 7 + 1, 17, 1, O.nuance(c, 0.18));
      if (rnd() < 0.3) R(bx + 3 + Math.floor(rnd() * 10), row * 7 + 3, 3, 2, O.nuance(c, -0.15));
    }
  }
  // poutrelle d'acier en haut, tuyaux apparents, soubassement béton
  R(0, 0, longueur, 7, '#2b2f36');
  R(0, 7, longueur, 1, '#15151f');
  for (let x = 6; x < longueur; x += 22) R(x, 3, 2, 2, '#6a717c');
  R(0, 11, longueur, 3, '#b87333');
  R(0, 11, longueur, 1, '#d99a5a');
  R(0, 16, longueur, 2, '#5d6570');
  for (let x = 30; x < longueur; x += 96) {
    R(x, 9, 4, 10, '#3a3d46');
    R(x + 40, 10, 3, 6, '#8a5a2b');
  }
  R(0, HW - 8, longueur, 8, '#8f8d87');
  R(0, HW - 8, longueur, 1, '#a9a7a1');
}

function murBastingage(g, longueur, cote, rnd, O) {
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  const HW = O.HW;
  // ciel, horizon, mer
  const ciel = ['#7cc4ff', '#8fceff', '#a4d8ff', '#bce3ff', '#d2edff'];
  ciel.forEach((c, i) => R(0, i * 6, longueur, 6, c));
  R(0, 30, longueur, 2, '#e8f6ff');
  R(0, 32, longueur, 22, '#1f6fa8');
  for (let i = 0; i < longueur / 6; i++) {
    const x = Math.floor(rnd() * longueur);
    const y = 34 + Math.floor(rnd() * 18);
    R(x, y, 3 + Math.floor(rnd() * 4), 1, rnd() < 0.5 ? '#5aa8de' : '#9fd3ff');
  }
  for (let i = 0; i < longueur / 90; i++) {
    const x = Math.floor(rnd() * longueur);
    R(x, 8, 14, 3, '#ffffff');
    R(x + 3, 6, 8, 2, '#ffffff');
  }
  // pavois : planches, lisse et dalots
  R(0, HW - 32, longueur, 32, '#7a4a22');
  for (let y = HW - 32; y < HW; y += 6) R(0, y, longueur, 1, '#5a3418');
  for (let x = 0; x < longueur; x += 40) R(x, HW - 32, 3, 32, '#6b4423');
  R(0, HW - 36, longueur, 5, '#9a6a3a');
  R(0, HW - 36, longueur, 1, '#c9a46a');
  R(0, HW - 31, longueur, 1, '#4a2a14');
  for (let x = 14; x < longueur; x += 64) {
    R(x, HW - 8, 8, 4, '#2b1d12');
  }
}

// ---------- décors muraux ----------
// Grande fenêtre d'atelier à petits carreaux (cadre acier), la ville dehors.
function fenetreAtelier(g, x, y, w, h, O) {
  O.cadre(g, x, y, w, h, '#2b2f36', '#a8dbff');
  const ciel = ['#9fd3ff', '#b5e0ff', '#cdeaff'];
  for (let i = 0; i < 3; i++) {
    g.fillStyle = ciel[i];
    g.fillRect(x + 2, y + 2 + Math.floor(((h - 4) * i) / 3), w - 4, Math.ceil((h - 4) / 3));
  }
  const rnd = O.aleatoire(O.hacher('loft' + x));
  let bx = x + 2;
  while (bx < x + w - 2) {
    const bw = 5 + Math.floor(rnd() * 8);
    const bh = 6 + Math.floor(rnd() * (h / 2));
    g.fillStyle = rnd() < 0.5 ? '#8a6a5a' : '#7f8fa6';
    g.fillRect(bx, y + h - 2 - bh, Math.min(bw, x + w - 2 - bx), bh);
    bx += bw + 1;
  }
  g.fillStyle = '#2b2f36';
  for (let xx = x + 8; xx < x + w - 2; xx += 9) g.fillRect(xx, y, 1, h);
  for (let yy = y + 7; yy < y + h - 2; yy += 7) g.fillRect(x, yy, w, 1);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(x + 3, y + 3, 3, 1);
}

function neonQG(g, cx, y, O) {
  const t = O.texteCanvas('QG', '#ff5fa2', '#7a1f4f');
  g.fillStyle = 'rgba(255, 95, 162, 0.18)';
  g.fillRect(Math.round(cx - t.width - 4), y - 3, t.width * 2 + 8, t.height * 2 + 6);
  O.texteDouble(g, 'QG', cx, y, '#ff8fc4', '#7a1f4f');
}

function decorsLoft(g, cote, longueur, etage, O) {
  if (cote === 'droite') {
    O.enseigneQG(g);
    fenetreAtelier(g, 3 * 32 + 6, 12, 4 * 32 - 12, 34, O);
    neonQG(g, 8 * 32 + 30, 22, O);
    fenetreAtelier(g, 9 * 32 + 22, 12, 2 * 32 + 10, 34, O);
    return;
  }
  const c = (gy) => (O.H - gy) * 32;
  O.plaqueEtage(g, etage);
  fenetreAtelier(g, Math.round(c(11.7)), 14, Math.round(c(7.6) - c(11.7)), 36, O);
  // affiche de l'atelier
  const a0 = Math.round(c(7.2));
  O.cadre(g, a0, 18, 30, 26, '#2b2f36', '#f6c21c');
  g.drawImage(O.texteCanvas('ATELIER', '#15151f'), a0 + 15 - Math.round(O.mesurer('ATELIER') / 2), 27);
}

function decorsPirate(g, cote, longueur, etage, O) {
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  if (cote === 'droite') {
    // planche gravée au nom du QG, au-dessus de la poupe
    R(16, 10, 66, 26, '#15151f');
    R(17, 11, 64, 24, '#8a5a2b');
    R(17, 11, 64, 1, '#b5884e');
    const haut = O.enseigne('QG DES', "AGENTS'");
    const bas = O.enseigne('AGENTS', 'HQ');
    g.drawImage(O.texteCanvas(haut, '#f4d35e'), 49 - Math.round(O.mesurer(haut) / 2), 14);
    g.drawImage(O.texteCanvas(bas, '#ffffff'), 49 - Math.round(O.mesurer(bas) / 2), 24);
    // île au trésor à l'horizon et un navire au loin
    const ix = 7 * 32;
    for (let k = 0; k < 40; k++) R(ix + k, 31 - Math.round(Math.sin((k / 40) * Math.PI) * 6), 1, Math.round(Math.sin((k / 40) * Math.PI) * 6) + 1, '#d9c27a');
    R(ix + 18, 18, 2, 10, '#6b4423');
    R(ix + 12, 17, 14, 2, '#2e8b3e');
    R(ix + 14, 15, 10, 2, '#3fae4f');
    const nx = 10 * 32 + 10;
    R(nx, 27, 16, 3, '#4a2a14');
    R(nx + 7, 15, 1, 12, '#4a2a14');
    R(nx + 3, 17, 9, 7, '#f4f2ea');
    R(nx + 7, 13, 4, 2, '#15151f');
    // mouettes
    for (const [x, y] of [[5 * 32, 12], [5 * 32 + 14, 16], [13 * 32, 10]]) {
      R(x, y, 2, 1, '#3a3d46');
      R(x + 2, y + 1, 1, 1, '#3a3d46');
      R(x + 3, y, 2, 1, '#3a3d46');
    }
    return;
  }
  const c = (gy) => (O.H - gy) * 32;
  O.plaqueEtage(g, etage);
  // bouée accrochée au pavois
  const bx = Math.round(c(9.2));
  const by = O.HW - 22;
  for (let y = -9; y <= 9; y++) {
    const w = Math.round(Math.sqrt(90 - y * y));
    const wi = Math.round(Math.sqrt(Math.max(0, 20 - y * y)));
    for (let x = -w; x <= w; x++) {
      if (Math.abs(x) <= wi && Math.abs(y) <= 4) continue;
      const a = Math.atan2(y, x);
      R(bx + x, by + y, 1, 1, Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 ? '#e3342f' : '#f4f2ea');
    }
  }
  // longue-vue et carte au mur gauche
  const m0 = Math.round(c(11.6));
  O.cadre(g, m0, 6, 40, 22, '#6b4423', '#e8d5a0');
  R(m0 + 6, 12, 10, 6, '#9ab873');
  R(m0 + 24, 10, 8, 10, '#9ab873');
  R(m0 + 28, 14, 3, 1, '#c0392b');
}

// ---------- registre ----------
export const MEUBLES = {
  box_retour: retourBox,
  box_porte_manteau: porteManteau,
  box_classeur: classeur,
  box_photocopieuse: photocopieuse,
  loft_frigo: frigo,
  loft_comptoir: comptoir,
  loft_ilot: ilot,
  loft_tabouret: tabouret,
  loft_plante: planteXL,
  loft_velo: velo,
  loft_etagere: etagereMetal,
  loft_pilier: pilier,
  loft_moto: moto,
  pirate_rambarde: rambarde,
  pirate_tonneau: tonneau,
  pirate_tabouret: tabouretTonneau,
  pirate_cordage: cordage,
  pirate_canon: canon,
  pirate_mat: mat,
  pirate_barre: barre,
  pirate_coffre: coffre,
  pirate_lanterne: lanterne,
  pirate_carte: carteTresor,
  pirate_perroquet: perroquet,
  pirate_caisse: caisse,
  pirate_ancre: ancre,
  pirate_rhum: tonneauRhum,
  pirate_hamac: hamac,
};

export const ANIMES = {
  box_photocopieuse: animePhotocopieuse,
  loft_frigo: animeFrigo,
  loft_moto: animeMoto,
  pirate_canon: animeCanon,
  loft_comptoir: animeComptoir,
  pirate_mat: animeMat,
  pirate_coffre: animeCoffre,
  pirate_lanterne: animeLanterne,
  pirate_perroquet: animePerroquet,
  pirate_rhum: animeTonneauRhum,
};

// ---------- easter eggs (web/clics.js) ----------
// Labyrinthe de box : bourrage de la photocopieuse. Loft : un manchot sort du frigo, la moto démarre.
// Bateau pirate : bordée de canons (le perroquet s'affole), fontaine de pièces d'or du coffre.
export const CLICS = {
  box_photocopieuse: { duree: 4200 },
  loft_frigo: { duree: 4400 },
  loft_moto: { duree: 3200 },
  pirate_canon: { duree: 3800, declenche: ['pirate_canon', 'pirate_perroquet'] },
  pirate_coffre: { duree: 3600, declenche: ['pirate_perroquet'] },
};

const MANCHOT = [
  '..kkkk..',
  '.kkkkkk.',
  'kkwkkwkk',
  'kkkookkk',
  'kkwwwwkk',
  'kkwwwwkk',
  'kkwwwwkk',
  '.kwwwwk.',
  '..kwwk..',
  '.oo..oo.',
];
const COULEURS_MANCHOT = { k: '#1b1d24', w: '#f4f2ea', o: '#ff9a1f' };

// Bouffée de fumée (ou de givre) : carré qui grossit et pâlit, u de 0 à 1.
function bouffee(g, x, y, u, rgb = '120,120,130') {
  const r = 2 + Math.round(u * 5);
  g.fillStyle = `rgba(${rgb},${(0.75 * (1 - u)).toFixed(2)})`;
  g.fillRect(Math.round(x) - r, Math.round(y) - r, r * 2, r * 2);
}

function effetPhotocopieuse(g, it, tx, ty, O, effet) {
  // bourrage papier : voyant rouge, feuilles qui giclent du bac de sortie
  const P = O.projeteur(tx + 32, ty);
  const d = effet.depuis;
  O.pixel(g, P(0.82, 0.8, 37), Math.floor(d / 180) % 2 ? '#ff3030' : '#5a1010', 2, 1);
  const rnd = O.aleatoire(5);
  for (let i = 0; i < 12; i++) {
    const vx = 0.4 + rnd() * 1.6;
    const vy = -0.6 + rnd() * 1.2;
    const u = (d - i * 220) / 1300;
    if (u < 0 || u > 1) continue;
    const [x, y] = P(0.98 + vx * u, 0.45 + vy * u, 22 + 40 * u - 52 * u * u);
    const tourne = Math.floor(d / 110 + i) % 2;
    g.fillStyle = O.CONTOUR;
    g.fillRect(Math.round(x) - 1, Math.round(y) - 1, tourne ? 9 : 6, tourne ? 6 : 9);
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(x), Math.round(y), tourne ? 7 : 4, tourne ? 4 : 7);
    g.fillStyle = '#9aa3ad';
    g.fillRect(Math.round(x) + 1, Math.round(y) + 1, tourne ? 4 : 2, 1);
  }
  if (d < 3200) {
    const [cx, cy] = P(0.5, 0.5, 42);
    O.phylactere(g, cx, cy, O.enseigne('BOURRAGE !', 'PAPER JAM!'), '#a8232a');
  }
}

function animeFrigo(g, it, tx, ty, t, O, effet) {
  // un manchot sort du frigo dans un nuage de givre, se dandine, dit « Brr ! » et rentre au frais
  if (!effet) return;
  const P = O.projeteur(tx + 32, ty);
  const d = effet.depuis;
  const u = d / effet.duree;
  const sortie = u < 0.2 ? u / 0.2 : u > 0.8 ? (1 - u) / 0.2 : 1;
  const dandine = Math.sin(d / 160) * 0.12 * (u > 0.2 && u < 0.8 ? 1 : 0);
  for (let i = 0; i < 6; i++) {
    const v = (d / 900 + i / 6) % 1;
    const [x, y] = P(0.2 + i * 0.12, 0.8 + v * 0.3, 20 + i * 6 + v * 10);
    bouffee(g, x, y, v, '210,240,255');
  }
  const [x, y] = P(0.5 + dandine, 0.78 + 0.5 * sortie, 0);
  O.grillePixels(g, x, y - (Math.floor(d / 160) % 2), MANCHOT, COULEURS_MANCHOT, 2);
  if (u > 0.25 && u < 0.75) O.phylactere(g, x, y - 24, O.enseigne('Brr !', 'Brr!'), '#1f4a7a', '#eaf6ff');
}

function animeMoto(g, it, tx, ty, t, O, effet) {
  // la moto démarre : phare, pot d'échappement qui fume, vibrations, « VROUM ! »
  if (!effet) return;
  const P = O.projeteur(tx + 32, ty);
  const d = effet.depuis;
  for (let i = 0; i < 6; i++) {
    const v = (d / 700 + i / 6) % 1;
    const [x, y] = P(0.06 - v * 0.7, 0.55, 8 + v * 12);
    bouffee(g, x, y, v);
  }
  const allume = Math.floor(d / 150) % 2;
  const [hx, hy] = P(0.92, 0.5, 24);
  g.fillStyle = allume ? '#fff3a0' : '#c9a227';
  g.fillRect(hx - 1, hy - 1, 3, 3);
  if (allume) {
    g.fillStyle = 'rgba(255,243,160,0.35)';
    g.fillRect(hx + 2, hy - 3, 10, 7);
  }
  g.fillStyle = '#ffffff';
  for (const u of [0.18, 0.82]) {
    const [x, y] = P(u, 0.5, 10);
    const s = Math.floor(d / 60) % 2;
    g.fillRect(x - 12 - s, y - 2, 2, 1);
    g.fillRect(x + 10 + s, y - 4, 2, 1);
  }
  if (d < 2600) {
    const [cx, cy] = P(0.5, 0.5, 34);
    O.phylactere(g, cx + Math.round(Math.sin(d / 40)), cy, 'VROUM !');
  }
}

function animeCanon(g, it, tx, ty, t, O, effet) {
  // bordée : chaque canon tire à son tour (éclair, boulet qui part vers la mer, fumée)
  if (!effet) return;
  const P = O.projeteur(tx + 32, ty);
  const u = effet.depuis - (it.x % 2) * 450;
  if (u < 0) return;
  if (u < 220) {
    const [x, y] = P(0.5, 0.0, 15);
    const r = 4 + Math.round((u / 220) * 6);
    g.fillStyle = '#fff3a0';
    g.fillRect(x - r, y - 1, r * 2, 3);
    g.fillRect(x - 1, y - r, 3, r * 2);
    g.fillStyle = '#ff9a1f';
    g.fillRect(x - 2, y - 2, 5, 5);
  }
  if (u < 1300) {
    const k = u / 1300;
    const [x, y] = P(0.5, 0.0 - k * 3.2, 15 + 34 * k - 22 * k * k);
    g.fillStyle = '#15151f';
    g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
  }
  for (let i = 0; i < 5; i++) {
    const v = u / 2600 - i * 0.08;
    if (v < 0 || v > 1) continue;
    const [x, y] = P(0.5 + (i - 2) * 0.1, 0.02 - v * 0.3, 16 + v * 26);
    bouffee(g, x, y, v, '200,200,205');
  }
  if (effet.clique && u > 80 && u < 1600) {
    const [cx, cy] = P(0.5, 0.5, 24);
    O.phylactere(g, cx, cy, O.enseigne('BOUM !', 'BOOM!'), '#a8232a');
  }
}

export const JEUX = {};

export const THEMES = {
  // Loft : béton ciré, carreaux de ciment à la cuisine, parquet au salon ; chêne brut, cuir cognac, métal noir.
  'bureau-loft': {
    sols: { def: ['loft_beton', '#a19e97'], lobby: ['loft_beton', '#93918b'], pause: ['loft_carreaux', '#ece6d6'], cabine: ['planches', '#a87a4f'],
      dg: ['planches', '#8a5a36'], salon: ['planches', '#9a6b43'], reunion: ['loft_beton', '#aaa79f'], atelier: ['loft_beton', '#8d8a83'] },
    mur: 'loft_briques', dalle: '#4a4744', bureau: '#b8885a', chaise: '#2b2f36', canape: '#8a4b2a', canapeEquipe: '#8a4b2a', table: '#6e4a2c',
    salon: ['#3b2f2a', '#9a4a32'],
    cloison: { cadre: '#1f2226', verre: 'rgba(190,215,230,0.26)' }, // verrières d'atelier : acier noir
  },
  // Bateau pirate : pont en planches, bois sombre, velours rouge.
  'bureau-pirate': {
    sols: { def: ['pirate_pont', '#a4743f'], lobby: ['pirate_pont', '#97693a'], dg: ['pirate_pont', '#80572f'], salon: ['pirate_pont', '#a4743f'], pause: ['pirate_pont', '#94673a'],
      reunion: ['pirate_pont', '#9c6c3b'] },
    mur: 'pirate_bastingage', dalle: '#3d2a1a', bureau: '#8a5a2b', chaise: '#5a3a1f', canape: '#7a1f2a', canapeEquipe: '#7a1f2a', table: '#6b4423',
    salon: ['#5a1f1f', '#a33a2a'],
  },
};

export const SOLS = { loft_beton: solBetonCire, loft_carreaux: solCarreauxCiment, pirate_pont: solPont };

export const MURS = { loft_briques: murBriques, pirate_bastingage: murBastingage };

export const DECORS_MURS = { 'bureau-loft': decorsLoft, 'bureau-pirate': decorsPirate };
