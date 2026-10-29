// Meubles, sols et murs des décors au choix de la famille « pause » (1.0.10). Contrat : web/meubles/index.js.
// Plans : web/plans/pause.js.

// ---------- outils de dessin ----------
// Feuille pour un meuble qui déborde de sa case (toit, parasol, palmier…) : P(u, v, z) en cases relatives à la case du
// meuble, u de u0 à u1 et v de v0 à v1, jusqu'à htop pixels de haut. `apres` dessine après le contour (filets, fils).
function feuille(O, u0, v0, u1, v1, htop, fn, apres = null) {
  const minX = Math.floor((u0 - v1) * 32);
  const maxX = Math.ceil((u1 - v0) * 32);
  const haut = Math.floor((u0 + v0) * 16 - htop);
  const bas = Math.ceil((u1 + v1) * 16);
  const c = O.creerCanvas(maxX - minX + 4, bas - haut + 4);
  const g = c.getContext('2d');
  const P = O.projeteur(2 - minX, 2 - haut);
  fn(g, P);
  O.contourner(c);
  if (apres) apres(g, P);
  return { c, dx: 30 + minX, dy: haut - 2 };
}

// Trait d'un pixel entre deux points de l'écran.
function trait(g, a, b, col, ep = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
  g.fillStyle = col;
  for (let i = 0; i <= n; i++) g.fillRect(Math.round(a[0] + ((b[0] - a[0]) * i) / n), Math.round(a[1] + ((b[1] - a[1]) * i) / n), ep, ep);
}

// Disque plein (ellipse) à l'écran.
function ovale(g, cx, cy, rx, ry, col) {
  g.fillStyle = col;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.01))));
    g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

// Texte posé sur une face « y constant » (il descend de 1 pixel tous les 2 vers la droite).
function texteBiais(g, O, txt, x, y, col) {
  const t = O.texteCanvas(txt, col);
  for (let i = 0; i < t.width; i++) g.drawImage(t, i, 0, 1, t.height, Math.round(x + i), Math.round(y + Math.floor(i / 2)), 1, t.height);
}

// Le losange d'une tuile de sol (64 × 32).
function dansTuile(x, y) {
  if (y < 0 || y > 30) return false;
  const hw = y <= 15 ? 2 * y + 2 : 62 - 2 * y;
  return x >= 32 - hw && x <= 32 + hw - 1;
}
function grains(g, rnd, n, cols, taille = 1) {
  for (let i = 0; i < n; i++) {
    const px = Math.floor(rnd() * 64);
    const py = Math.floor(rnd() * 31);
    if (!dansTuile(px, py)) continue;
    g.fillStyle = cols[Math.floor(rnd() * cols.length)];
    g.fillRect(px, py, rnd() < 0.3 ? taille + 1 : taille, 1);
  }
}
// Quadrilatère d'une tuile en coordonnées (u, v) de 0 à 1.
function quadTuile(g, O, u0, v0, u1, v1, col) {
  const Pt = O.projeteur(32, 0);
  O.poly(g, [Pt(u0, v0), Pt(u1, v0), Pt(u1, v1), Pt(u0, v1)], col);
}

// Petite image mise en cache (bouée, canard, crabe : dessinés par l'animation, qui les fait bouger).
const cacheImages = new Map();
function image(cle, w, h, fn, O) {
  let c = cacheImages.get(cle);
  if (c) return c;
  c = O.creerCanvas(w, h);
  fn(c.getContext('2d'));
  O.contourner(c);
  cacheImages.set(cle, c);
  return c;
}

// ---------- Plage : sols ----------
function sable(g, col, { rnd, variante, parite }, O) {
  grains(g, rnd, 46, [O.nuance(col, 0.08), O.nuance(col, -0.07), O.nuance(col, -0.12), O.nuance(col, 0.14)]);
  if (variante === 0 && parite === 0) {
    // un coquillage
    const x = 22 + Math.floor(rnd() * 20);
    const y = 10 + Math.floor(rnd() * 10);
    g.fillStyle = '#f6c6b8';
    g.fillRect(x, y, 3, 2);
    g.fillStyle = '#fff4ee';
    g.fillRect(x + 1, y, 1, 1);
    g.fillStyle = '#c98a7c';
    g.fillRect(x, y + 2, 3, 1);
  } else if (variante === 2 && parite === 1) {
    // ondulations laissées par le vent
    for (let i = 0; i < 3; i++) {
      const x = 14 + i * 10 + Math.floor(rnd() * 4);
      const y = 9 + i * 4;
      g.fillStyle = O.nuance(col, -0.1);
      g.fillRect(x, y, 6, 1);
      g.fillStyle = O.nuance(col, 0.1);
      g.fillRect(x + 1, y - 1, 4, 1);
    }
  }
}
// Lignes blanches du terrain de volley, le long des bords indiqués (n : v = 0, s : v = 1, w : u = 0, e : u = 1).
function ligneTerrain(bords) {
  return (g, col, ctx, O) => {
    sable(g, col, ctx, O);
    const blanc = '#fbf6ea';
    const w = bords.includes('w');
    const e = bords.includes('e');
    const n = bords.includes('n');
    const s = bords.includes('s');
    if (n) quadTuile(g, O, w ? 0.06 : 0, 0.06, e ? 0.94 : 1, 0.12, blanc);
    if (s) quadTuile(g, O, w ? 0.06 : 0, 0.88, e ? 0.94 : 1, 0.94, blanc);
    if (w) quadTuile(g, O, 0.06, n ? 0.06 : 0, 0.12, s ? 0.94 : 1, blanc);
    if (e) quadTuile(g, O, 0.88, n ? 0.06 : 0, 0.94, s ? 0.94 : 1, blanc);
  };
}
// Sable mouillé du rivage : plus sombre, écume côté mer (u = 1).
function rivage(g, col, { rnd }, O) {
  grains(g, rnd, 34, [O.nuance(col, -0.08), O.nuance(col, 0.06), O.nuance(col, -0.14)]);
  quadTuile(g, O, 0.78, 0, 1, 1, O.nuance(col, -0.12));
  quadTuile(g, O, 0.9, 0, 1, 1, '#e9f7f8');
  const Pt = O.projeteur(32, 0);
  for (let i = 0; i < 6; i++) {
    const v = rnd();
    const [x, y] = Pt(0.82 + rnd() * 0.06, v);
    g.fillStyle = rnd() < 0.5 ? '#ffffff' : '#cdeef2';
    g.fillRect(Math.round(x), Math.round(y), 2, 1);
  }
}
// Eau : vaguelettes claires et reflets.
function eau(g, col, { rnd, variante }, O) {
  const clair = O.nuance(col, 0.22);
  const fonce = O.nuance(col, -0.12);
  grains(g, rnd, 20, [fonce, O.nuance(col, 0.08)], 2);
  for (let i = 0; i < 4; i++) {
    const x = 8 + Math.floor(rnd() * 44);
    const y = 6 + Math.floor(rnd() * 20);
    if (!dansTuile(x, y) || !dansTuile(x + 7, y)) continue;
    g.fillStyle = clair;
    g.fillRect(x + 2, y, 4, 1);
    g.fillRect(x, y + 1, 2, 1);
    g.fillRect(x + 6, y + 1, 2, 1);
  }
  if (variante === 1) {
    g.fillStyle = '#ffffff';
    g.fillRect(30, 14, 2, 1);
    g.fillRect(31, 13, 1, 3);
  }
}
// Ponton : planches dans le sens de x, joints sombres et clous.
function ponton(g, col, { variante }, O) {
  const Pt = O.projeteur(32, 0);
  const teintes = [col, O.nuance(col, -0.07), O.nuance(col, 0.06), O.nuance(col, -0.12)];
  for (let b = 0; b < 4; b++) O.poly(g, [Pt(0, b / 4), Pt(1, b / 4), Pt(1, (b + 1) / 4), Pt(0, (b + 1) / 4)], teintes[(b + variante) % 4]);
  for (let b = 1; b < 4; b++) {
    const a = Pt(0, b / 4);
    const z = Pt(1, b / 4);
    trait(g, a, z, O.nuance(col, -0.3));
  }
  for (let b = 0; b < 4; b++) {
    for (const u of [0.12, 0.88]) {
      const [x, y] = Pt(u, b / 4 + 0.125);
      g.fillStyle = O.nuance(col, -0.35);
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
}

// ---------- Plage : murs ----------
// Vue sur la mer : ciel, horizon, palissade de bambou en bas.
function horizon(g, longueur, cote, rnd) {
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const ciel = ['#4fb6e8', '#62c0ec', '#78caef', '#8fd4f2', '#a6ddf4', '#bce6f6', '#d2eef8'];
  for (let i = 0; i < ciel.length; i++) R(0, i * 7, longueur, 7, ciel[i]);
  // nuages
  for (let i = 0; i < longueur / 90; i++) {
    const x = Math.floor(rnd() * longueur);
    const y = 6 + Math.floor(rnd() * 22);
    R(x, y, 18, 3, '#ffffff');
    R(x + 4, y - 2, 9, 2, '#ffffff');
    R(x + 2, y + 3, 14, 1, '#e3f3fb');
  }
  // mer jusqu'à l'horizon
  R(0, 49, longueur, 1, '#e8f7fb');
  R(0, 50, longueur, 5, '#2f9fd0');
  R(0, 55, longueur, 6, '#2a92c4');
  R(0, 61, longueur, 8, '#2687b8');
  for (let i = 0; i < longueur / 5; i++) {
    g.fillStyle = rnd() < 0.5 ? '#9fe0f4' : '#ffffff';
    g.fillRect(Math.floor(rnd() * longueur), 51 + Math.floor(rnd() * 14), 2 + Math.floor(rnd() * 3), 1);
  }
  // palissade de bambou
  for (let x = 0; x < longueur; x += 5) {
    const h = 18 + ((x * 7) % 5);
    const col = (x / 5) % 2 ? '#c9a45a' : '#d8b66a';
    R(x, 84 - h, 4, h, col);
    R(x, 84 - h, 1, h, '#e8cf8f');
    R(x + 3, 84 - h, 1, h, '#a8843f');
    R(x, 84 - h, 4, 1, '#8a6a30');
    for (let y = 84 - h + 6; y < 84; y += 7) R(x, y, 4, 1, '#a8843f');
  }
  R(0, 72, longueur, 2, '#7a5a2a');
  R(0, 74, longueur, 1, '#b08a52');
}

// Décor des murs de la plage : enseigne du QG, soleil, voilier, mouettes ; bouée, panneaux et plaque de l'étage à gauche.
function decorsPlage(g, cote, longueur, etage, O) {
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const mouette = (x, y) => {
    R(x, y + 1, 2, 1, '#2b3a4a');
    R(x + 2, y, 2, 1, '#2b3a4a');
    R(x + 4, y + 1, 2, 1, '#2b3a4a');
  };
  if (cote === 'droite') {
    O.enseigneQG(g);
    // soleil
    const sx = 300;
    const sy = 16;
    for (let y = -9; y <= 9; y++) {
      const w = Math.round(Math.sqrt(85 - y * y));
      R(sx - w - 2, sy + y, w * 2 + 4, 1, 'rgba(255,240,170,0.45)');
    }
    for (let y = -7; y <= 7; y++) {
      const w = Math.round(Math.sqrt(52 - y * y));
      R(sx - w, sy + y, w * 2 + 1, 1, y < -2 ? '#fff6b8' : '#ffe27a');
    }
    // voilier à l'horizon
    R(342, 46, 12, 3, '#ffffff');
    R(343, 49, 10, 1, '#c95a3a');
    R(347, 34, 1, 12, '#5a4a3a');
    for (let i = 0; i < 10; i++) R(348, 35 + i, Math.floor(i * 0.7) + 1, 1, '#ffffff');
    for (let i = 0; i < 7; i++) R(346 - Math.floor(i * 0.6), 38 + i, Math.floor(i * 0.6) + 1, 1, '#f2e2c8');
    // îlot et son palmier
    R(452, 46, 30, 3, '#e9cf95');
    R(456, 44, 20, 2, '#e9cf95');
    R(466, 32, 2, 12, '#7a5a3a');
    for (const [dx, dy, l] of [[-7, 1, 7], [1, 1, 7], [-5, -1, 5], [1, -1, 5]]) R(466 + dx, 32 + dy, l, 2, '#3a9a4a');
    mouette(232, 12);
    mouette(246, 18);
    mouette(410, 9);
    return;
  }
  const c = (gy) => (H_ - gy) * 32;
  O.plaqueEtage(g, etage);
  // bouée accrochée au mur
  const bx = Math.round(c(9.3));
  const by = 32;
  for (let y = -10; y <= 10; y++) {
    const w = Math.round(Math.sqrt(110 - y * y));
    R(bx - w - 1, by + y, w * 2 + 3, 1, O.CONTOUR);
  }
  for (let y = -9; y <= 9; y++) {
    const w = Math.round(Math.sqrt(90 - y * y));
    for (let x = -w; x <= w; x++) {
      const a = Math.atan2(y, x);
      const q = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8);
      g.fillStyle = q % 2 ? '#ffffff' : '#e8452f';
      if (x * x + y * y > 20) g.fillRect(bx + x, by + y, 1, 1);
    }
  }
  for (let y = -4; y <= 4; y++) {
    const w = Math.round(Math.sqrt(20 - y * y));
    R(bx - w, by + y, w * 2 + 1, 1, '#2c80b0');
  }
  R(bx - 1, by - 13, 2, 4, '#8a6a30');
  // panneau « baignade surveillée »
  const t1 = O.enseigne('BAIGNADE', 'LIFEGUARD');
  const t2 = O.enseigne('SURVEILLEE', 'ON DUTY');
  const lp = Math.max(O.mesurer(t1), O.mesurer(t2)) + 10;
  const p0 = Math.round(c(10.95));
  O.cadre(g, p0 - Math.round(lp / 2), 14, lp, 24, '#7a5a2a', '#f4ead2');
  g.drawImage(O.texteCanvas(t1, '#c0392b'), Math.round(p0 - O.mesurer(t1) / 2), 18);
  g.drawImage(O.texteCanvas(t2, '#2a5a8a'), Math.round(p0 - O.mesurer(t2) / 2), 28);
  R(p0 - 1, 38, 2, 8, '#7a5a2a');
}
const H_ = 12;

// ---------- Plage : meubles ----------
function palmier(it, typeTheme, etat, O) {
  const v = it.variante || 0;
  const rnd = O.aleatoire(O.hacher('palmier' + it.x + ',' + it.y));
  const penche = [[0.18, -0.1], [-0.12, 0.16], [0.16, 0.12], [-0.1, -0.14], [0.12, -0.16]][v % 5];
  // un petit palmier en pot dans le hall (il ne cache pas l'enseigne du QG)
  const petit = !!it.petit;
  const hTronc = petit ? 34 : 78 + (v % 3) * 6;
  const longueur = petit ? 0.55 : 1;
  return feuille(O, -1.1, -1.1, 2.1, 2.1, hTronc + 34, (g, P) => {
    if (petit) {
      // pot de terre cuite
      O.prisme(g, P, 0.26, 0.26, 0.74, 0.74, 0, 14, '#c0603a');
      O.quadZ(g, P, 14, 0.3, 0.3, 0.7, 0.7, '#3b2a1e');
    } else {
      // petit monticule de sable
      O.prisme(g, P, 0.28, 0.28, 0.72, 0.72, 0, 2, '#dcbd80');
    }
    // tronc annelé, légèrement penché
    const n = petit ? 6 : 13;
    const z00 = petit ? 14 : 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const cu = 0.5 + penche[0] * t * t * longueur;
      const cv = 0.5 + penche[1] * t * t * longueur;
      const r = (0.085 - t * 0.025) * (petit ? 0.8 : 1);
      const z0 = z00 + (hTronc * i) / n;
      O.prisme(g, P, cu - r, cv - r, cu + r, cv + r, z0, z0 + hTronc / n + 0.5, i % 2 ? '#8a6440' : '#9c7349');
    }
    const tu = 0.5 + penche[0] * longueur;
    const tv = 0.5 + penche[1] * longueur;
    const [cx, cy] = P(tu, tv, z00 + hTronc);
    // palmes : sept feuilles qui retombent
    const verts = ['#2f8f3e', '#3fae4f', '#25793a', '#4cbf5a'];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rnd() * 0.5 + v;
      const L = (30 + rnd() * 10) * (petit ? 0.6 : 1);
      const col = verts[k % verts.length];
      let px = cx;
      let py = cy;
      for (let s = 1; s <= 12; s++) {
        const t = s / 12;
        const x = cx + Math.cos(a) * L * t;
        const y = cy + Math.sin(a) * L * 0.42 * t - 8 * t + 22 * t * t;
        trait(g, [px, py], [x, y], col, 3);
        // folioles
        if (s > 2 && s < 12) {
          g.fillStyle = O.nuance(col, -0.15);
          g.fillRect(Math.round(x - Math.sin(a) * 4), Math.round(y + 3), 1, 3);
          g.fillRect(Math.round(x + Math.sin(a) * 4), Math.round(y + 2), 1, 3);
        }
        px = x;
        py = y;
      }
    }
    // noix de coco
    for (const [dx, dy] of [[-3, 3], [2, 4], [0, 1]]) {
      ovale(g, cx + dx, cy + dy, 2, 2, '#6b4a2a');
      g.fillStyle = '#8a6440';
      g.fillRect(Math.round(cx + dx - 1), Math.round(cy + dy - 1), 1, 1);
    }
  });
}

// Étagère du barman (contre le mur du fond) : bouteilles, noix de coco, ananas.
function barFond(it, typeTheme, etat, O) {
  const rnd = O.aleatoire(O.hacher('bar' + it.x));
  const bambou = '#c9a45a';
  return O.spriteTuile(64, (g, P) => {
    O.prisme(g, P, 0, 0.06, 1, 0.5, 0, 30, '#9a6a3c');
    O.quadY(g, P, 0.5, 0.06, 0.94, 4, 26, '#7a5230');
    for (const u of [0.25, 0.5, 0.75]) O.quadY(g, P, 0.5, u - 0.01, u + 0.01, 4, 26, '#5e3f20');
    O.prisme(g, P, 0, 0.04, 1, 0.52, 30, 33, '#b07d4c');
    // étagère haute sur le mur
    O.prisme(g, P, 0, 0.04, 1, 0.3, 50, 52, bambou);
    const cols = ['#3aa655', '#e8a33a', '#c0392b', '#f4ead2', '#2c80b0', '#8e44ad'];
    for (let i = 0; i < 4; i++) {
      const u = 0.12 + i * 0.22 + rnd() * 0.04;
      const col = cols[Math.floor(rnd() * cols.length)];
      O.prisme(g, P, u, 0.12, u + 0.08, 0.2, 52, 62, col);
      O.prisme(g, P, u + 0.02, 0.14, u + 0.06, 0.18, 62, 66, O.nuance(col, -0.2));
    }
    // sur le meuble : noix de coco ou ananas
    if (it.variante % 2) {
      for (const u of [0.25, 0.42]) {
        O.prisme(g, P, u, 0.2, u + 0.13, 0.33, 33, 40, '#6b4a2a');
      }
    } else {
      O.prisme(g, P, 0.45, 0.18, 0.62, 0.35, 33, 44, '#e8a33a');
      for (let k = 0; k < 4; k++) O.prisme(g, P, 0.5 + (k % 2) * 0.05, 0.22 + k * 0.02, 0.53 + (k % 2) * 0.05, 0.25 + k * 0.02, 44, 50 + k, '#3aa655');
    }
    if (it.part === 'g') O.prisme(g, P, 0.02, 0.06, 0.08, 0.12, 0, 80, bambou);
    if (it.part === 'd') O.prisme(g, P, 0.92, 0.06, 0.98, 0.12, 0, 80, bambou);
  });
}

// Comptoir de la paillote, avec son toit de paille (qui couvre aussi l'étagère du fond) et l'enseigne au milieu.
function comptoir(it, typeTheme, etat, O) {
  const p = it.part;
  const u0 = p === 'g' ? -0.12 : 0;
  const u1 = p === 'd' ? 1.12 : 1;
  const rnd = O.aleatoire(O.hacher('comptoir' + it.x));
  const bambou = '#d0ab5f';
  const paille = '#dcb862';
  return feuille(O, u0, -1.1, u1, 1, 86, (g, P) => {
    // poteaux avant
    if (p === 'g') O.prisme(g, P, 0.02, 0.78, 0.1, 0.86, 0, 66, bambou);
    if (p === 'd') O.prisme(g, P, 0.9, 0.78, 0.98, 0.86, 0, 66, bambou);
    // caisson en bambou et plateau
    O.prisme(g, P, p === 'g' ? 0.12 : 0, 0.12, p === 'd' ? 0.88 : 1, 0.72, 0, 28, '#c49a52');
    for (let u = p === 'g' ? 0.16 : 0.03; u < (p === 'd' ? 0.86 : 1); u += 0.12) {
      O.quadY(g, P, 0.72, u, u + 0.08, 1, 27, '#d9b468');
      O.quadY(g, P, 0.72, u + 0.08, u + 0.09, 1, 27, '#9a7438');
      O.quadY(g, P, 0.72, u, u + 0.08, 12, 13, '#9a7438');
    }
    O.prisme(g, P, p === 'g' ? 0.1 : 0, 0.08, p === 'd' ? 0.9 : 1, 0.8, 28, 32, '#8a5a30');
    // boissons sur le comptoir
    const n = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const u = 0.25 + i * 0.35 + rnd() * 0.08;
      if (rnd() < 0.5) {
        // noix de coco et sa paille
        O.prisme(g, P, u, 0.42, u + 0.14, 0.56, 32, 39, '#6b4a2a');
        O.quadZ(g, P, 39, u + 0.03, 0.45, u + 0.11, 0.53, '#f4ead2');
        O.prisme(g, P, u + 0.06, 0.48, u + 0.08, 0.5, 39, 46, '#ff5fa2');
      } else {
        // cocktail et son ombrelle
        O.prisme(g, P, u + 0.03, 0.44, u + 0.09, 0.5, 32, 34, '#e8f4f8');
        O.prisme(g, P, u, 0.41, u + 0.12, 0.53, 34, 40, '#ff9a3a');
        O.prisme(g, P, u + 0.05, 0.46, u + 0.07, 0.48, 40, 45, '#5a4a3a');
        O.prisme(g, P, u - 0.02, 0.4, u + 0.14, 0.55, 45, 46, rnd() < 0.5 ? '#ff5fa2' : '#3df2ff');
      }
    }
    // toit de paille, en pente vers l'avant
    const zA = 80;
    const zB = 64;
    O.poly(g, [P(u0, -1.06, zA), P(u1, -1.06, zA), P(u1, 0.98, zB), P(u0, 0.98, zB)], paille);
    for (let k = 0; k < 9; k++) {
      const v = -1 + k * 0.23;
      const z = zA + ((zB - zA) * (v + 1.06)) / 2.04;
      trait(g, P(u0 + 0.02, v, z), P(u1 - 0.02, v, z), O.nuance(paille, -0.14));
    }
    // frange du toit
    for (let u = u0; u < u1 - 0.01; u += 0.035) {
      const l = 6 + Math.floor(rnd() * 5);
      const a = P(u, 0.98, zB);
      g.fillStyle = (Math.round(u * 100) % 3) ? '#c9a24a' : '#e8c878';
      g.fillRect(Math.round(a[0]), Math.round(a[1]), 2, l);
    }
    if (p === 'd') {
      const a = P(u1, -1.06, zA);
      const b = P(u1, 0.98, zB);
      for (let i = 0; i <= 20; i++) {
        const x = a[0] + ((b[0] - a[0]) * i) / 20;
        const y = a[1] + ((b[1] - a[1]) * i) / 20;
        g.fillStyle = i % 2 ? '#c9a24a' : '#b8913a';
        g.fillRect(Math.round(x), Math.round(y), 2, 7 + (i % 3));
      }
    }
  }, it.variante === 6 ? (g, P) => {
    // enseigne en bois accrochée sous la frange
    const a = P(0.12, 0.99, 54);
    const b = P(0.88, 0.99, 54);
    trait(g, P(0.2, 0.99, 64), P(0.2, 0.99, 54), '#5a3a1a');
    trait(g, P(0.8, 0.99, 64), P(0.8, 0.99, 54), '#5a3a1a');
    O.poly(g, [P(0.1, 0.99, 56), P(0.9, 0.99, 56), P(0.9, 0.99, 44), P(0.1, 0.99, 44)], '#7a4a22');
    O.poly(g, [P(0.12, 0.99, 55), P(0.88, 0.99, 55), P(0.88, 0.99, 45), P(0.12, 0.99, 45)], '#9a6232');
    texteBiais(g, O, 'TIKI BAR', a[0] + 2, a[1] + 3, '#ffe27a');
    void b;
  } : null);
}

function tabouret(it, typeTheme, etat, O) {
  return O.spriteTuile(30, (g, P) => {
    for (const [u, v] of [[0.3, 0.3], [0.64, 0.3], [0.3, 0.64], [0.64, 0.64]]) O.prisme(g, P, u, v, u + 0.06, v + 0.06, 0, 14, '#b8913a');
    O.prisme(g, P, 0.32, 0.36, 0.68, 0.42, 6, 7, '#9a7438');
    O.prisme(g, P, 0.24, 0.24, 0.76, 0.76, 14, 17, '#8a5a30');
    O.quadZ(g, P, 17, 0.3, 0.3, 0.7, 0.7, '#a86e3a');
  });
}

// Filet de volley : poteaux aux deux bouts, filet le long de x au milieu de la case.
function filet(it, typeTheme, etat, O) {
  const p = it.part;
  const ua = p === 'g' ? 0.14 : 0;
  const ub = p === 'd' ? 0.86 : 1;
  return feuille(O, 0, 0, 1, 1, 66, (g, P) => {
    if (p === 'g') O.prisme(g, P, 0.04, 0.4, 0.24, 0.6, 0, 1, '#dcbd80');
    if (p === 'd') O.prisme(g, P, 0.76, 0.4, 0.96, 0.6, 0, 1, '#dcbd80');
    if (p === 'g') {
      O.prisme(g, P, 0.1, 0.46, 0.18, 0.54, 0, 58, '#f4f4f4');
      for (let z = 6; z < 56; z += 12) O.prisme(g, P, 0.1, 0.46, 0.18, 0.54, z, z + 6, '#e8452f');
    }
    if (p === 'd') {
      O.prisme(g, P, 0.82, 0.46, 0.9, 0.54, 0, 58, '#f4f4f4');
      for (let z = 6; z < 56; z += 12) O.prisme(g, P, 0.82, 0.46, 0.9, 0.54, z, z + 6, '#e8452f');
    }
  }, (g, P) => {
    // le filet (sans contour : des fils fins)
    const z0 = 34;
    const z1 = 52;
    for (let u = ua; u <= ub + 0.001; u += 0.0625) trait(g, P(u, 0.5, z1), P(u, 0.5, z0), 'rgba(30,30,40,0.55)');
    for (let z = z0; z <= z1; z += 3) trait(g, P(ua, 0.5, z), P(ub, 0.5, z), 'rgba(30,30,40,0.55)');
    O.poly(g, [P(ua, 0.5, z1 + 2), P(ub, 0.5, z1 + 2), P(ub, 0.5, z1 - 1), P(ua, 0.5, z1 - 1)], '#ffffff');
    trait(g, P(ua, 0.5, z1 + 2), P(ub, 0.5, z1 + 2), '#9aa3ad');
    O.poly(g, [P(ua, 0.5, z0 + 1), P(ub, 0.5, z0 + 1), P(ub, 0.5, z0 - 1), P(ua, 0.5, z0 - 1)], '#ffffff');
  });
}

// Serviette de plage (on peut marcher dessus) : rayures, et pour les raquettes, la balle posée et la crème solaire.
function serviette(it, typeTheme, etat, O) {
  const cols = [['#e8452f', '#ffffff'], ['#2c80b0', '#ffe27a'], ['#8e44ad', '#ffffff']][(it.variante || 0) % 3];
  return O.spriteTuile(16, (g, P) => {
    for (let i = 0; i < 6; i++) O.quadZ(g, P, 0.6, 0.18 + i * 0.11, 0.12, 0.29 + i * 0.11, 0.88, cols[i % 2]);
    if (it.jeu) {
      O.prisme(g, P, 0.66, 0.2, 0.76, 0.3, 0.6, 7, '#ffe27a');
      O.prisme(g, P, 0.67, 0.21, 0.75, 0.29, 7, 9, '#e8452f');
    } else {
      O.prisme(g, P, 0.3, 0.6, 0.5, 0.72, 0.6, 3, '#2a2a33');
      O.prisme(g, P, 0.55, 0.6, 0.75, 0.72, 0.6, 3, '#2a2a33');
    }
  }, false);
}

// Transat tourné vers la mer (+x), parfois sous un parasol planté entre deux transats.
function transat(it, typeTheme, etat, O) {
  const toile = [['#2c80b0', '#ffffff'], ['#e8452f', '#ffffff'], ['#3aa655', '#ffe27a']][Math.floor((it.variante || 0) / 3) % 3];
  const bois = '#b07d4c';
  const fn = (g, P) => {
    // pieds et cadre
    for (const [u, v] of [[0.14, 0.2], [0.14, 0.74], [0.86, 0.2], [0.86, 0.74]]) O.prisme(g, P, u, v, u + 0.06, v + 0.06, 0, 9, O.nuance(bois, -0.2));
    O.prisme(g, P, 0.3, 0.2, 0.94, 0.8, 9, 11, bois);
    for (let i = 0; i < 4; i++) O.quadZ(g, P, 11, 0.32 + i * 0.155, 0.22, 0.46 + i * 0.155, 0.78, toile[i % 2]);
    // dossier incliné
    O.poly(g, [P(0.08, 0.2, 34), P(0.08, 0.8, 34), P(0.32, 0.8, 11), P(0.32, 0.2, 11)], O.nuance(toile[0], -0.1));
    for (let i = 0; i < 3; i++) {
      const a = 0.2 + i * 0.2;
      O.poly(g, [P(0.08, a, 34), P(0.08, a + 0.1, 34), P(0.32, a + 0.1, 11), P(0.32, a, 11)], toile[1]);
    }
    trait(g, P(0.08, 0.8, 34), P(0.32, 0.8, 11), O.nuance(bois, -0.1), 2);
    O.prisme(g, P, 0.06, 0.18, 0.12, 0.82, 32, 35, bois);
  };
  if (!it.parasol) return feuille(O, 0, 0, 1, 1, 40, fn);
  const cols = ['#e8452f', '#ffffff', '#ffe27a', '#ffffff'];
  return feuille(O, -0.9, -0.1, 1.1, 2.0, 92, (g, P) => {
    fn(g, P);
    // mât planté entre les deux transats, derrière les têtes
    O.prisme(g, P, 0.06, 0.96, 0.12, 1.02, 0, 76, '#f4f4f4');
  }, (g, P) => {
    // toile du parasol : huit pans en cône (dessinée après le contour pour garder des arêtes nettes)
    const cu = 0.09;
    const cv = 0.99;
    const r = 0.95;
    const sommet = P(cu, cv, 84);
    const bord = [];
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      bord.push(P(cu + Math.cos(a) * r, cv + Math.sin(a) * r, 70));
    }
    // les pans du fond d'abord, puis ceux de devant
    const ordre = [...Array(8).keys()].sort((a, b) => Math.sin(((a + 0.5) / 8) * Math.PI * 2 + Math.PI / 4) - Math.sin(((b + 0.5) / 8) * Math.PI * 2 + Math.PI / 4));
    for (const k of ordre) O.poly(g, [sommet, bord[k], bord[k + 1]], cols[k % cols.length]);
    for (let k = 0; k < 8; k++) trait(g, bord[k], bord[k + 1], O.CONTOUR);
    for (let k = 0; k < 8; k++) {
      const m = [(bord[k][0] + bord[k + 1][0]) / 2, (bord[k][1] + bord[k + 1][1]) / 2];
      g.fillStyle = O.nuance(cols[k % cols.length], -0.25);
      g.fillRect(Math.round(m[0]), Math.round(m[1]) + 1, 2, 2);
    }
    g.fillStyle = '#c9a24a';
    g.fillRect(Math.round(sommet[0]) - 1, Math.round(sommet[1]) - 3, 3, 3);
  });
}

// Glacière entre deux transats.
function glaciere(it, typeTheme, etat, O) {
  const col = it.variante ? '#e8452f' : '#2c80b0';
  return O.spriteTuile(30, (g, P) => {
    O.prisme(g, P, 0.25, 0.3, 0.75, 0.7, 0, 13, col);
    O.prisme(g, P, 0.23, 0.28, 0.77, 0.72, 13, 16, '#f4f4f4');
    O.prisme(g, P, 0.42, 0.28, 0.58, 0.32, 16, 20, '#9aa3ad');
    O.quadY(g, P, 0.7, 0.3, 0.7, 4, 9, O.nuance(col, 0.25));
    // une bouteille posée dessus
    O.prisme(g, P, 0.55, 0.45, 0.63, 0.53, 16, 24, '#3aa655');
    O.prisme(g, P, 0.57, 0.47, 0.61, 0.51, 24, 27, '#2a7a3a');
  });
}

// Château de sable : quatre tours, un donjon et son drapeau ; seau et pelle à côté.
const SABLE_CHATEAU = '#e2bf78';
function chateau(it, typeTheme, etat, O) {
  return feuille(O, 0, 0, 1, 1, 52, (g, P) => {
    O.prisme(g, P, 0.08, 0.08, 0.92, 0.92, 0, 4, O.nuance(SABLE_CHATEAU, -0.06));
    const tour = (u, v, h) => {
      O.prisme(g, P, u, v, u + 0.18, v + 0.18, 4, h, SABLE_CHATEAU);
      for (const [a, b] of [[0, 0], [0.12, 0], [0, 0.12], [0.12, 0.12]]) O.prisme(g, P, u + a, v + b, u + a + 0.06, v + b + 0.06, h, h + 3, SABLE_CHATEAU);
    };
    O.prisme(g, P, 0.2, 0.2, 0.8, 0.8, 4, 12, SABLE_CHATEAU);
    tour(0.14, 0.14, 20);
    tour(0.68, 0.14, 20);
    tour(0.14, 0.68, 20);
    O.prisme(g, P, 0.36, 0.36, 0.64, 0.64, 12, 28, O.nuance(SABLE_CHATEAU, 0.04));
    for (const [a, b] of [[0, 0], [0.2, 0], [0, 0.2], [0.2, 0.2]]) O.prisme(g, P, 0.36 + a, 0.36 + b, 0.44 + a, 0.44 + b, 28, 31, SABLE_CHATEAU);
    tour(0.68, 0.68, 20);
    O.quadY(g, P, 0.8, 0.44, 0.56, 4, 10, O.nuance(SABLE_CHATEAU, -0.35));
    O.prisme(g, P, 0.49, 0.49, 0.51, 0.51, 31, 44, '#5a4a3a');
    // seau renversé et pelle
    O.prisme(g, P, 0.84, 0.02, 0.98, 0.16, 0, 8, '#e8452f');
    O.prisme(g, P, 0.82, 0.0, 1.0, 0.18, 8, 9, '#c0392b');
  });
}

// Boules de pétanque et cochonnet (on peut marcher dessus).
function boules(it, typeTheme, etat, O) {
  return O.spriteTuile(14, (g, P) => {
    const boule = (u, v) => {
      const [x, y] = P(u, v, 2);
      ovale(g, x, y, 2, 2, '#9aa3ad');
      g.fillStyle = '#e8eef4';
      g.fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 1);
    };
    boule(0.3, 0.45);
    boule(0.62, 0.35);
    boule(0.55, 0.7);
    const [x, y] = P(0.5, 0.52, 1);
    ovale(g, x, y, 1, 1, '#ff8a2a');
    // traces dans le sable
    trait(g, P(-0.6, 0.6, 0), P(0.25, 0.47, 0), 'rgba(150,110,60,0.35)');
  }, false);
}

// Charrette de glaces contre le mur gauche, sous son ombrelle.
function glacier(it, typeTheme, etat, O) {
  return feuille(O, -0.1, -0.4, 1.2, 1.3, 84, (g, P) => {
    for (const v of [0.12, 0.82]) {
      const [x, y] = P(0.42, v + 0.03, 8);
      ovale(g, x, y, 4, 7, '#5a4a3a');
      ovale(g, x, y, 2, 4, '#9aa3ad');
    }
    O.prisme(g, P, 0.12, 0.16, 0.74, 0.84, 8, 30, '#f7d6e0');
    O.quadX(g, P, 0.74, 0.2, 0.8, 14, 24, '#ff8fb1');
    O.quadX(g, P, 0.74, 0.2, 0.8, 18, 19, '#ffffff');
    O.prisme(g, P, 0.1, 0.14, 0.76, 0.86, 30, 32, '#e8f4f8');
    // bacs de glace sous la vitre
    const gouts = ['#ffe9c4', '#ff8fb1', '#7a4a2a', '#9be08a', '#ffd23f'];
    for (let i = 0; i < 5; i++) O.quadZ(g, P, 32.5, 0.2, 0.2 + i * 0.12, 0.6, 0.3 + i * 0.12, gouts[i]);
    O.prisme(g, P, 0.12, 0.14, 0.18, 0.86, 32, 38, 'rgba(200,235,255,0.7)');
    // cornets sur le côté
    for (let i = 0; i < 3; i++) O.prisme(g, P, 0.66, 0.3 + i * 0.12, 0.72, 0.36 + i * 0.12, 32, 38, '#d9a45a');
    O.prisme(g, P, 0.43, 0.48, 0.47, 0.52, 32, 72, '#f4f4f4');
  }, (g, P) => {
    const cols = ['#ff8fb1', '#ffffff'];
    const cu = 0.45;
    const cv = 0.5;
    const sommet = P(cu, cv, 80);
    const bord = [];
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      bord.push(P(cu + Math.cos(a) * 0.72, cv + Math.sin(a) * 0.72, 69));
    }
    for (let k = 0; k < 8; k++) O.poly(g, [sommet, bord[k], bord[k + 1]], cols[k % 2]);
    for (let k = 0; k < 8; k++) trait(g, bord[k], bord[k + 1], O.CONTOUR);
  });
}

// Douche de plage : poteau, pomme et caillebotis.
function douche(it, typeTheme, etat, O) {
  return O.spriteTuile(80, (g, P) => {
    for (let i = 0; i < 4; i++) O.prisme(g, P, 0.2, 0.2 + i * 0.15, 0.8, 0.3 + i * 0.15, 0, 2, '#a8763f');
    O.prisme(g, P, 0.44, 0.14, 0.56, 0.26, 0, 70, '#8a6440');
    O.prisme(g, P, 0.47, 0.26, 0.53, 0.5, 66, 68, '#c0c8d0');
    O.prisme(g, P, 0.42, 0.42, 0.58, 0.58, 62, 66, '#c0c8d0');
    O.prisme(g, P, 0.53, 0.2, 0.6, 0.27, 30, 34, '#c0c8d0');
  });
}

// Planches de surf appuyées contre le mur du fond.
function surfs(it, typeTheme, etat, O) {
  const jeux = [[['#ff8a2a', '#ffffff'], ['#2c80b0', '#ffe27a']], [['#3aa655', '#ffffff'], ['#ff5fa2', '#2b3a4a']]][(it.variante || 0) % 2];
  return O.spriteTuile(84, (g, P) => {
    jeux.forEach(([col, bande], i) => {
      const u = 0.3 + i * 0.4;
      const pts = [];
      const n = 14;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const w = 0.13 * Math.pow(Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, t))), 0.6);
        pts.push(P(u + w, 0.42 - 0.3 * t, 2 + 74 * t));
      }
      for (let k = n; k >= 0; k--) {
        const t = k / n;
        const w = 0.13 * Math.pow(Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, t))), 0.6);
        pts.push(P(u - w, 0.42 - 0.3 * t, 2 + 74 * t));
      }
      O.poly(g, pts, col);
      trait(g, P(u, 0.42 - 0.3 * 0.1, 2 + 7.4), P(u, 0.42 - 0.3 * 0.9, 2 + 66.6), bande, 2);
    });
  });
}

// Chaise haute du maître-nageur, avec son drapeau.
function mns(it, typeTheme, etat, O) {
  return feuille(O, 0, -0.2, 1, 1, 100, (g, P) => {
    for (const [u, v] of [[0.18, 0.18], [0.74, 0.18], [0.18, 0.74], [0.74, 0.74]]) O.prisme(g, P, u, v, u + 0.08, v + 0.08, 0, 50, '#f4f4f4');
    for (const z of [14, 32]) {
      O.prisme(g, P, 0.18, 0.74, 0.82, 0.8, z, z + 3, '#f4f4f4');
      O.prisme(g, P, 0.74, 0.18, 0.8, 0.82, z, z + 3, '#f4f4f4');
    }
    O.prisme(g, P, 0.14, 0.14, 0.86, 0.86, 50, 54, '#e8452f');
    O.prisme(g, P, 0.14, 0.14, 0.22, 0.86, 54, 70, '#f4f4f4');
    O.quadX(g, P, 0.22, 0.3, 0.7, 58, 66, '#e8452f');
    O.quadX(g, P, 0.22, 0.46, 0.54, 59, 65, '#ffffff');
    O.quadX(g, P, 0.22, 0.38, 0.62, 61, 63, '#ffffff');
    // drapeau
    O.prisme(g, P, 0.84, 0.04, 0.88, 0.08, 50, 96, '#5a4a3a');
    O.poly(g, [P(0.88, 0.06, 96), P(0.88, 0.42, 92), P(0.88, 0.06, 86)], '#3aa655');
    // bouée accrochée
    const [x, y] = P(0.86, 0.5, 40);
    ovale(g, x, y, 5, 6, '#e8452f');
    ovale(g, x, y, 2, 3, '#f4f4f4');
  });
}

// ---------- animations (dans l'eau, sur le rivage) ----------
function imgBouee(O, v) {
  return image('bouee' + v, 26, 14, (g) => {
    ovale(g, 13, 7, 11, 5, v ? '#ffd23f' : '#e8452f');
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(13 + Math.cos(a) * 8) - 1, Math.round(7 + Math.sin(a) * 3.5) - 1, 3, 2);
    }
    ovale(g, 13, 7, 5, 2, '#2687b8');
  }, O);
}
function imgCanard(O) {
  return image('canard', 34, 34, (g) => {
    ovale(g, 15, 24, 12, 6, '#ffd23f');
    ovale(g, 15, 22, 10, 4, '#ffe56a');
    ovale(g, 22, 13, 6, 6, '#ffd23f');
    ovale(g, 21, 11, 4, 3, '#ffe56a');
    g.fillStyle = '#ff8a2a';
    g.fillRect(27, 13, 5, 3);
    g.fillStyle = '#15151f';
    g.fillRect(23, 11, 2, 2);
    g.fillStyle = '#ffffff';
    g.fillRect(23, 11, 1, 1);
    g.fillStyle = '#f2b81f';
    g.fillRect(8, 21, 8, 2);
  }, O);
}
function imgCrabe(O, f) {
  return image('crabe' + f, 18, 10, (g) => {
    ovale(g, 9, 6, 5, 3, '#e8452f');
    g.fillStyle = '#ff7a5a';
    g.fillRect(6, 4, 5, 1);
    g.fillStyle = '#c0392b';
    for (const s of [-1, 1]) {
      g.fillRect(9 + s * 6 - (s < 0 ? 1 : 0), 3 - f, 2, 2);
      for (let k = 0; k < 3; k++) g.fillRect(9 + s * (4 + k) - (s < 0 ? 0 : 0), 8 + ((k + f) % 2), 1, 1);
    }
    g.fillStyle = '#15151f';
    g.fillRect(7, 2, 1, 1);
    g.fillRect(11, 2, 1, 1);
  }, O);
}
// Meuble sans image fixe : tout est dessiné par son animation.
const vide = (it, typeTheme, etat, O) => ({ c: O.creerCanvas(1, 1), dx: 0, dy: 0 });

// ---------- jeux de la plage ----------
// Volley : la balle passe d'un joueur à l'autre par-dessus le filet (case du filet = (6, 6) ; centre du terrain 6.5).
function jeuVolley(g, it, tx, ty, t, actif, O) {
  const P = O.projeteur(tx + 32, ty);
  if (!actif) {
    const [x, y] = P(-1.4, 0.95, 3);
    balleVolley(g, x, y);
    return;
  }
  // joueurs : (5, 4) → (7, 8) → (7, 5) → (5, 7) → …, relatifs à la case du filet
  const pts = [[-0.5, -1.5], [1.5, 2.5], [1.5, -0.5], [-0.5, 1.5]];
  const d = 1100;
  const k = Math.floor(t / d) % pts.length;
  const e = (t % d) / d;
  const a = pts[k];
  const b = pts[(k + 1) % pts.length];
  const u = a[0] + (b[0] - a[0]) * e;
  const v = a[1] + (b[1] - a[1]) * e;
  const z = 56 + Math.sin(e * Math.PI) * 44;
  const [x, y] = P(u, v, z);
  const [ox, oy] = P(u, v, 0);
  g.fillStyle = 'rgba(80,60,30,0.25)';
  g.fillRect(Math.round(ox) - 2, Math.round(oy) - 1, 5, 2);
  balleVolley(g, x, y);
}
function balleVolley(g, x, y) {
  x = Math.round(x);
  y = Math.round(y);
  ovale(g, x, y, 4, 4, '#15151f');
  ovale(g, x, y, 3, 3, '#ffffff');
  g.fillStyle = '#ffd23f';
  g.fillRect(x - 3, y - 1, 3, 3);
  g.fillStyle = '#2c80b0';
  g.fillRect(x + 1, y + 1, 2, 2);
  g.fillRect(x - 1, y - 3, 2, 1);
}
// Raquettes de plage : la balle file d'un joueur à l'autre (de (10, 2) à (10, 6), serviette en (10, 4)).
function jeuRaquettes(g, it, tx, ty, t, actif, O) {
  if (!actif) return;
  const P = O.projeteur(tx + 32, ty);
  const c = (t % 1400) / 1400;
  const aller = c < 0.5;
  const e = aller ? c * 2 : (1 - c) * 2;
  const v = -1.5 + e * 4;
  const z = 58 + Math.sin(e * Math.PI) * 20;
  const [x, y] = P(0.5, v, z);
  g.fillStyle = '#15151f';
  g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
  g.fillStyle = '#ffe27a';
  g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
}
// Château de sable : le drapeau flotte ; quand on construit, des grains de sable volent.
function jeuChateau(g, it, tx, ty, t, actif, O) {
  const P = O.projeteur(tx + 32, ty);
  const [x, y] = P(0.51, 0.5, 44);
  const f = Math.floor(t / 260) % 3;
  g.fillStyle = O.CONTOUR;
  g.fillRect(Math.round(x), Math.round(y) - 1, 9, 7);
  g.fillStyle = '#e8452f';
  g.fillRect(Math.round(x) + 1, Math.round(y), 7, 5);
  g.fillStyle = '#ff7a5a';
  g.fillRect(Math.round(x) + 1 + f * 2, Math.round(y) + 1, 2, 1);
  if (!actif) return;
  for (let i = 0; i < 6; i++) {
    const c = ((t / 700 + i / 6) % 1);
    const a = i * 2.1;
    const [gx, gy] = P(0.5 + Math.cos(a) * (0.35 + c * 0.25), 0.5 + Math.sin(a) * (0.35 + c * 0.25), 8 + Math.sin(c * Math.PI) * 14);
    g.fillStyle = i % 2 ? '#e2bf78' : '#c9a35a';
    g.fillRect(Math.round(gx), Math.round(gy), 2, 2);
  }
}
// Pétanque : une boule roule des joueurs vers le cochonnet, puis on recommence.
function jeuPetanque(g, it, tx, ty, t, actif, O) {
  if (!actif) return;
  const P = O.projeteur(tx + 32, ty);
  const c = (t % 5200) / 5200;
  let u;
  let v;
  let z;
  if (c < 0.3) {
    // lancer en cloche
    const e = c / 0.3;
    u = -2.2 + e * 2.3;
    v = 0.8 - e * 0.25;
    z = 18 + Math.sin(e * Math.PI) * 26 - e * 16;
  } else if (c < 0.5) {
    const e = (c - 0.3) / 0.2;
    u = 0.1 + (1 - Math.pow(1 - e, 2)) * 0.3;
    v = 0.55;
    z = 2;
  } else {
    u = 0.4;
    v = 0.55;
    z = 2;
  }
  const [x, y] = P(u, v, z);
  ovale(g, Math.round(x), Math.round(y), 2, 2, '#15151f');
  ovale(g, Math.round(x), Math.round(y), 1, 1, '#c0c8d0');
}

// ========== Fête foraine ==========
const ROUGE = '#c0392b';
const CREME = '#f1e2c2';
const OR = '#e8b830';
// Texte posé sur une face « x constant » (il monte de 1 pixel tous les 2 vers la droite).
function texteBiaisX(g, O, txt, x, y, col) {
  const t = O.texteCanvas(txt, col);
  for (let i = 0; i < t.width; i++) g.drawImage(t, i, 0, 1, t.height, Math.round(x + i), Math.round(y - Math.floor(i / 2)), 1, t.height);
}
// Ampoule de guirlande (allumée).
function ampoule(g, x, y, col = '#ffe9a0') {
  x = Math.round(x);
  y = Math.round(y);
  g.fillStyle = 'rgba(255,220,140,0.35)';
  g.fillRect(x - 2, y - 2, 5, 5);
  g.fillStyle = col;
  g.fillRect(x - 1, y - 1, 3, 3);
  g.fillStyle = '#ffffff';
  g.fillRect(x, y - 1, 1, 1);
}

// ---------- sols ----------
// Pavés en quinconce et confettis tombés des guirlandes.
function pave(g, col, { rnd }, O) {
  quadTuile(g, O, 0, 0, 1, 1, O.nuance(col, -0.22));
  const teintes = [col, O.nuance(col, 0.06), O.nuance(col, -0.06), O.nuance(col, 0.1)];
  for (let j = 0; j < 4; j++) {
    const dec = (j % 2) * 0.125;
    for (let i = -1; i < 4; i++) {
      const u0 = Math.max(0, i / 4 + dec + 0.025);
      const u1 = Math.min(1, (i + 1) / 4 + dec - 0.025);
      if (u1 - u0 < 0.04) continue;
      quadTuile(g, O, u0, j / 4 + 0.03, u1, (j + 1) / 4 - 0.03, teintes[Math.floor(rnd() * teintes.length)]);
    }
  }
  const confettis = ['#ff5fa2', '#ffd23f', '#3df2ff', '#7dff6a', '#ff8a2a'];
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rnd() * 64);
    const y = Math.floor(rnd() * 31);
    if (!dansTuile(x, y)) continue;
    g.fillStyle = confettis[Math.floor(rnd() * confettis.length)];
    g.fillRect(x, y, rnd() < 0.5 ? 2 : 1, 1);
  }
}
// Plancher métallique des autos tamponneuses : tôle striée et rivets.
function piste(g, col, { rnd }, O) {
  const Pt = O.projeteur(32, 0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const [x, y] = Pt((i + 0.5) / 4, (j + 0.5) / 4);
      g.fillStyle = O.nuance(col, 0.16);
      if ((i + j) % 2) g.fillRect(Math.round(x) - 2, Math.round(y), 4, 1);
      else {
        g.fillRect(Math.round(x), Math.round(y) - 1, 1, 1);
        g.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
      }
    }
  }
  for (const [u, v] of [[0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94]]) {
    const [x, y] = Pt(u, v);
    g.fillStyle = O.nuance(col, 0.3);
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  grains(g, rnd, 8, [O.nuance(col, -0.12)]);
}
// Sciure autour de la pêche aux canards.
function sciure(g, col, { rnd }, O) {
  grains(g, rnd, 70, [O.nuance(col, 0.12), O.nuance(col, -0.1), O.nuance(col, 0.2), O.nuance(col, -0.18)]);
}

// ---------- murs ----------
// Toile de chapiteau : larges rayures, lambrequin festonné en haut, soubassement de bois.
function chapiteau(g, longueur) {
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  for (let x = 0; x < longueur; x += 32) {
    R(x, 0, 16, 84, '#a8303a');
    R(x + 16, 0, 16, 84, '#e9d6b0');
    R(x + 15, 0, 1, 84, '#7a1f2a');
    R(x + 31, 0, 1, 84, '#c9b48e');
  }
  // lambrequin
  R(0, 0, longueur, 7, '#6a1a24');
  for (let x = 0; x < longueur; x += 16) {
    const col = (x / 16) % 2 ? OR : '#8a2230';
    for (let y = 0; y < 6; y++) {
      const w = Math.round(Math.sqrt(36 - y * y) * 1.3);
      R(x + 8 - w, 7 + y, w * 2, 1, col);
    }
    R(x + 7, 13, 2, 1, '#3a0a14');
  }
  R(0, 6, longueur, 1, OR);
  // soubassement
  R(0, 70, longueur, 14, '#3a2418');
  R(0, 70, longueur, 1, OR);
  for (let x = 4; x < longueur; x += 24) R(x, 74, 16, 7, '#4a3020');
}
// Fanions en travers du mur.
function fanions(g, longueur, y0, graine) {
  const cols = ['#ffd23f', '#2a6fd0', '#3aa655', '#ff5fa2', '#ff8a2a'];
  for (let x = 0; x < longueur; x++) {
    const y = y0 + Math.round(Math.abs(Math.sin((x + graine) / 28)) * 5);
    g.fillStyle = '#2a1a10';
    g.fillRect(x, y, 1, 1);
    if ((x + graine) % 14 === 0) {
      const col = cols[Math.floor((x + graine) / 14) % cols.length];
      for (let k = 0; k < 7; k++) {
        g.fillStyle = col;
        g.fillRect(x + Math.floor(k / 2), y + 1 + k, 7 - k, 1);
      }
    }
  }
}
function decorsFoire(g, cote, longueur, etage, O) {
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  fanions(g, longueur, 16, cote === 'droite' ? 3 : 9);
  if (cote !== 'droite') {
    O.plaqueEtage(g, etage);
    return;
  }
  O.enseigneQG(g);
  // grande roue peinte (au-dessus du test de force)
  const cx = 344;
  const cy = 40;
  const r = 26;
  R(cx - 1, cy, 2, 34, '#3a2a4a');
  for (let i = 0; i < 30; i++) {
    R(cx - Math.round(i * 0.55), cy + i, 2, 1, '#3a2a4a');
    R(cx + Math.round(i * 0.55), cy + i, 2, 1, '#3a2a4a');
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (let i = 0; i < r; i++) R(Math.round(cx + Math.cos(a) * i), Math.round(cy + Math.sin(a) * i), 1, 1, '#5a4a6a');
  }
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    R(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 2, 2, k % 4 ? '#5a4a6a' : '#ffe9a0');
  }
  const nacelles = ['#ff5fa2', '#3df2ff', '#ffd23f', '#7dff6a'];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    R(x, y, 1, 3, '#3a2a4a');
    R(x - 3, y + 3, 7, 5, '#15151f');
    R(x - 2, y + 4, 5, 3, nacelles[k % 4]);
  }
  R(cx - 3, cy - 3, 6, 6, OR);
}

// ---------- meubles ----------
// Guichet des tickets, dans le hall.
function guichet(it, typeTheme, etat, O) {
  return feuille(O, -0.1, -0.1, 1.1, 1.1, 100, (g, P) => {
    O.prisme(g, P, 0.12, 0.12, 0.88, 0.88, 0, 52, ROUGE);
    for (let k = 0; k < 4; k++) {
      O.quadX(g, P, 0.88, 0.14 + k * 0.19, 0.22 + k * 0.19, 1, 52, CREME);
      O.quadY(g, P, 0.88, 0.14 + k * 0.19, 0.22 + k * 0.19, 1, 52, CREME);
    }
    // guichet éclairé côté ascenseur (+y)
    O.quadY(g, P, 0.88, 0.24, 0.76, 20, 42, '#2a1a10');
    O.quadY(g, P, 0.88, 0.28, 0.72, 23, 40, '#ffd98a');
    O.quadY(g, P, 0.88, 0.28, 0.72, 23, 26, '#e8a33a');
    O.prisme(g, P, 0.22, 0.88, 0.78, 0.98, 18, 21, '#7a4a22');
    // toit pointu rayé
    const S = P(0.5, 0.5, 90);
    const coins = [P(0.04, 0.04, 52), P(0.96, 0.04, 52), P(0.96, 0.96, 52), P(0.04, 0.96, 52)];
    const faces = [[0, 1], [3, 0], [1, 2], [2, 3]];
    for (const [a, b] of faces) {
      for (let k = 0; k < 4; k++) {
        const A = coins[a];
        const B = coins[b];
        const p0 = [A[0] + ((B[0] - A[0]) * k) / 4, A[1] + ((B[1] - A[1]) * k) / 4];
        const p1 = [A[0] + ((B[0] - A[0]) * (k + 1)) / 4, A[1] + ((B[1] - A[1]) * (k + 1)) / 4];
        O.poly(g, [S, p0, p1], k % 2 ? CREME : ROUGE);
      }
    }
    O.prisme(g, P, 0.48, 0.48, 0.52, 0.52, 90, 98, '#5a3a1a');
    O.poly(g, [P(0.52, 0.5, 98), P(0.52, 0.5, 92), P(0.52, 0.8, 95)], OR);
  }, (g, P) => {
    const a = P(0.3, 0.88, 49);
    texteBiais(g, O, O.enseigne('TICKETS', 'TICKETS'), a[0], a[1] - 2, '#ffe9a0');
  });
}

// Fond d'un stand (contre le mur), sous un auvent rayé peu profond : boîtes du chamboule-tout (voir JEUX) ou rebord
// des canards du tir, lots suspendus au bord de l'auvent. Le dernier morceau porte l'enseigne, posée sur l'auvent.
// (L'auvent ne déborde pas au-dessus du comptoir : on ne verrait plus le fond du stand.)
const ENSEIGNES = { chamboule: ['CHAMBOULE-TOUT', 'KNOCK DOWN'], tir: ['TIR', 'SHOOTING'] };
function peluche(g, x, y, col, O) {
  trait(g, [x, y - 12], [x, y - 6], '#e8e0d0');
  ovale(g, x, y + 2, 4, 4, col);
  ovale(g, x, y - 3, 3, 3, col);
  g.fillStyle = O.nuance(col, -0.3);
  g.fillRect(Math.round(x) - 3, Math.round(y) - 6, 2, 2);
  g.fillRect(Math.round(x) + 2, Math.round(y) - 6, 2, 2);
  g.fillStyle = '#15151f';
  g.fillRect(Math.round(x) - 1, Math.round(y) - 3, 1, 1);
  g.fillRect(Math.round(x) + 1, Math.round(y) - 3, 1, 1);
}
function standFond(it, typeTheme, etat, O) {
  const tir = it.variante === 'tir';
  const p = it.part;
  const rnd = O.aleatoire(O.hacher('stand' + it.x));
  const rayures = tir ? ['#2a6fd0', CREME] : [ROUGE, CREME];
  const u0 = p === 'g' ? -0.04 : 0;
  const u1 = p === 'd' ? 1.04 : 1;
  const ens = it.enseigne && ENSEIGNES[it.enseigne];
  const zA = 84;
  const zB = 78;
  return feuille(O, ens ? -1.6 : u0, -0.1, u1, 1, 100, (g, P) => {
    O.prisme(g, P, 0, 0.02, 1, 0.12, 0, 80, tir ? '#24345a' : '#5a1f2a');
    if (tir) {
      // ballons à crever sur le panneau, au-dessus du rebord des canards
      const cols = ['#ff5fa2', '#ffd23f', '#3df2ff', '#7dff6a', '#ff8a2a'];
      for (let k = 0; k < 4; k++) {
        const [x, y] = P(0.14 + k * 0.24, 0.12, 49);
        ovale(g, x, y, 3, 4, cols[Math.floor(rnd() * cols.length)]);
        g.fillStyle = '#ffffff';
        g.fillRect(Math.round(x) - 1, Math.round(y) - 2, 1, 1);
      }
      O.prisme(g, P, 0, 0.12, 1, 0.42, 0, 30, '#1c2a48');
      O.quadY(g, P, 0.42, 0.04, 0.96, 4, 26, '#24345a');
      O.prisme(g, P, 0, 0.12, 1, 0.48, 30, 32, '#5a3a1a');
    } else {
      // étagère nappée où trônent les boîtes
      O.prisme(g, P, 0, 0.14, 1, 0.7, 0, 24, '#2a6fd0');
      for (let k = 0; k < 5; k++) O.quadY(g, P, 0.7, k * 0.2 + 0.02, k * 0.2 + 0.1, 2, 22, '#4a8fe8');
      O.prisme(g, P, 0, 0.12, 1, 0.72, 24, 25, '#f4f4f4');
    }
    // parois rayées aux deux bouts, poteaux de l'auvent
    if (p === 'g') O.prisme(g, P, 0, 0.02, 0.06, 0.96, 0, 72, CREME);
    if (p === 'd') O.prisme(g, P, 0.94, 0.02, 1, 0.96, 0, 72, CREME);
    if (p === 'g' || p === 'd') {
      const u = p === 'g' ? 0.06 : 1;
      for (let z = 6; z < 66; z += 16) O.quadX(g, P, u, 0.02, 0.96, z, z + 7, rayures[0]);
    }
    // auvent : presque à plat, il ne couvre que le fond du stand
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = u0 + ((u1 - u0) * k) / n;
      const b = u0 + ((u1 - u0) * (k + 1)) / n;
      O.poly(g, [P(a, -0.04, zA), P(b, -0.04, zA), P(b, 0.98, zB), P(a, 0.98, zB)], rayures[k % 2]);
      const m = P((a + b) / 2, 0.98, zB);
      O.poly(g, [P(a, 0.98, zB), P(b, 0.98, zB), [m[0] + 2, m[1] + 4], [m[0] - 2, m[1] + 3]], rayures[k % 2]);
    }
    // lots suspendus au bord de l'auvent (sur les côtés : on voit le jeu au milieu)
    const cols = tir ? ['#ffd23f', '#c9a0ff', '#b07a45'] : ['#b07a45', '#ff8fb1', '#9be0f4'];
    for (let k = 0; k < 2; k++) {
      const [x, y] = P(0.14 + k * 0.72, 0.92, 68);
      peluche(g, x, y, cols[(k + it.x) % 3], O);
    }
  }, (g, P) => {
    for (let k = 0; k <= 4; k++) {
      const [x, y] = P(u0 + ((u1 - u0) * k) / 4, 0.98, 75);
      ampoule(g, x, y);
    }
    if (!ens) return;
    // enseigne posée sur l'auvent, centrée sur le stand
    const txt = O.enseigne(ens[0], ens[1]);
    const largeur = (O.mesurer(txt) + 10) / 32;
    const c = it.enseigne === 'tir' ? -0.5 : 0;
    const a0 = c - largeur / 2;
    const a1 = c + largeur / 2;
    const v = 0.92;
    O.poly(g, [P(a0, v, 96), P(a1, v, 96), P(a1, v, 80), P(a0, v, 80)], O.CONTOUR);
    O.poly(g, [P(a0 + 0.03, v, 95), P(a1 - 0.03, v, 95), P(a1 - 0.03, v, 81), P(a0 + 0.03, v, 81)], '#3a1a24');
    const t = P(a0 + 0.16, v, 92);
    texteBiais(g, O, txt, t[0], t[1], '#ffe9a0');
    for (let k = 0; k <= 6; k++) {
      const [x, y] = P(a0 + ((a1 - a0) * k) / 6, v, 96);
      g.fillStyle = k % 2 ? '#ff5fa2' : '#ffe9a0';
      g.fillRect(Math.round(x), Math.round(y) - 1, 2, 2);
    }
  });
}

// Comptoir d'un stand, devant le fond : rayé, avec les carabines du tir ou le seau de balles du chamboule-tout.
function standComptoir(it, typeTheme, etat, O) {
  const p = it.part;
  const rayures = it.variante ? ['#2a6fd0', CREME] : [ROUGE, CREME];
  return O.spriteTuile(40, (g, P) => {
    O.prisme(g, P, p === 'g' ? 0.04 : 0, 0.24, p === 'd' ? 0.96 : 1, 0.78, 0, 28, rayures[0]);
    for (let u = 0.08; u < 0.95; u += 0.25) O.quadY(g, P, 0.78, u, u + 0.12, 2, 26, rayures[1]);
    O.prisme(g, P, p === 'g' ? 0.02 : 0, 0.2, p === 'd' ? 0.98 : 1, 0.84, 28, 31, '#7a4a22');
    if (it.fusils) {
      // carabines posées sur le comptoir
      for (const v of [0.4, 0.62]) {
        O.prisme(g, P, 0.18, v, 0.42, v + 0.07, 31, 33, '#8a5a30');
        O.prisme(g, P, 0.42, v + 0.02, 0.84, v + 0.05, 31, 32.5, '#2a2a33');
      }
    } else if (p === 'g') {
      // seau de balles
      O.prisme(g, P, 0.32, 0.4, 0.58, 0.66, 31, 37, '#9aa3ad');
      for (const [u, v] of [[0.38, 0.46], [0.48, 0.52], [0.42, 0.58]]) {
        const [x, y] = P(u, v, 38);
        ovale(g, x, y, 2, 2, '#f4f4f4');
      }
    }
  });
}

// Test de force : on frappe le plot, le palet monte le long de l'échelle jusqu'à la cloche.
function force(it, typeTheme, etat, O) {
  return feuille(O, 0, -0.1, 1, 1, 118, (g, P) => {
    O.prisme(g, P, 0.08, 0.08, 0.92, 0.94, 0, 6, '#6a4630');
    O.prisme(g, P, 0.34, 0.6, 0.66, 0.86, 6, 10, ROUGE);
    O.quadZ(g, P, 10, 0.42, 0.66, 0.58, 0.8, '#ffd23f');
    O.prisme(g, P, 0.34, 0.12, 0.66, 0.24, 6, 104, CREME);
    const cols = ['#3aa655', '#9be03a', '#ffd23f', '#ff9a3a', '#e8452f', '#b8323a'];
    for (let k = 0; k < 6; k++) O.quadY(g, P, 0.24, 0.37, 0.63, 12 + k * 15, 24 + k * 15, cols[k]);
    O.quadY(g, P, 0.24, 0.485, 0.515, 10, 100, '#3a2a1a');
    const [bx, by] = P(0.5, 0.18, 108);
    ovale(g, bx, by, 6, 5, OR);
    g.fillStyle = '#fff3b0';
    g.fillRect(Math.round(bx) - 3, Math.round(by) - 3, 2, 2);
    // maillet appuyé contre l'estrade
    O.prisme(g, P, 0.8, 0.5, 0.84, 0.54, 6, 34, '#b07d4c');
    O.prisme(g, P, 0.74, 0.44, 0.9, 0.6, 34, 42, '#5a3a1a');
  });
}
function jeuForce(g, it, tx, ty, t, actif, O) {
  const P = O.projeteur(tx + 32, ty);
  let z = 12;
  let cloche = false;
  if (actif) {
    const c = (t % 3200) / 3200;
    if (c < 0.12) z = 12;
    else if (c < 0.35) z = 12 + ((c - 0.12) / 0.23) * 86;
    else if (c < 0.55) {
      z = 98;
      cloche = true;
    } else if (c < 0.9) z = 98 - ((c - 0.55) / 0.35) * 86;
    if (c < 0.06) {
      const [x, y] = P(0.5, 0.73, 12);
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(x) - 4, Math.round(y) - 1, 9, 1);
      g.fillRect(Math.round(x), Math.round(y) - 5, 1, 9);
    }
  }
  const [x, y] = P(0.5, 0.25, z);
  g.fillStyle = O.CONTOUR;
  g.fillRect(Math.round(x) - 3, Math.round(y) - 2, 7, 4);
  g.fillStyle = '#c0c8d0';
  g.fillRect(Math.round(x) - 2, Math.round(y) - 1, 5, 2);
  if (cloche) {
    const [bx, by] = P(0.5, 0.18, 108);
    g.fillStyle = '#ffffff';
    for (const [dx, dy] of [[-10, -6], [10, -6], [-11, 1], [11, 1], [0, -11]]) g.fillRect(Math.round(bx + dx), Math.round(by + dy), 2, 2);
  }
}

// Machine à pinces : vitrine, peluches et pince qui se balade.
function pince(it, typeTheme, etat, O) {
  const col = ['#e8457f', '#2ab0c0'][(it.variante || 0) % 2];
  const rnd = O.aleatoire(O.hacher('pince' + it.x));
  return O.spriteTuile(86, (g, P) => {
    O.prisme(g, P, 0.14, 0.12, 0.86, 0.84, 0, 30, col);
    O.quadY(g, P, 0.84, 0.56, 0.76, 4, 14, '#15151f');
    O.quadY(g, P, 0.84, 0.2, 0.4, 18, 24, '#ffd23f');
    O.prisme(g, P, 0.2, 0.84, 0.5, 0.94, 26, 30, '#2a2a33');
    O.prisme(g, P, 0.3, 0.87, 0.33, 0.9, 30, 36, '#15151f');
    pixel(g, P(0.31, 0.88, 38), '#e8452f', 3, 2, O);
    // peluches au fond de la vitrine
    const peluches = ['#ff8fb1', '#ffd23f', '#9be0f4', '#b07a45', '#7dff6a', '#c9a0ff'];
    for (let i = 0; i < 7; i++) {
      const u = 0.22 + rnd() * 0.5;
      const v = 0.2 + rnd() * 0.5;
      const [x, y] = P(u, v, 34);
      ovale(g, x, y, 3, 3, peluches[i % peluches.length]);
      g.fillStyle = '#15151f';
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1);
      g.fillRect(Math.round(x) + 1, Math.round(y) - 1, 1, 1);
    }
    for (const [u, v] of [[0.14, 0.12], [0.82, 0.12], [0.14, 0.8], [0.82, 0.8]]) O.prisme(g, P, u, v, u + 0.04, v + 0.04, 30, 70, '#d0d6dd');
    O.quadY(g, P, 0.84, 0.18, 0.82, 30, 70, 'rgba(190,235,255,0.22)');
    O.quadX(g, P, 0.86, 0.16, 0.8, 30, 70, 'rgba(190,235,255,0.16)');
    O.prisme(g, P, 0.12, 0.1, 0.88, 0.86, 70, 80, col);
    for (let k = 0; k < 5; k++) pixel(g, P(0.18 + k * 0.15, 0.86, 75), k % 2 ? '#ffe9a0' : '#ffffff', 2, 2, O);
  });
}
function pixel(g, pt, col, w, h) {
  g.fillStyle = col;
  g.fillRect(Math.round(pt[0]), Math.round(pt[1]), w, h);
}

// Réverbère de fête : trois globes allumés.
function lampion(it, typeTheme, etat, O) {
  return feuille(O, 0, 0, 1, 1, 92, (g, P) => {
    O.prisme(g, P, 0.36, 0.36, 0.64, 0.64, 0, 4, '#2a2a33');
    O.prisme(g, P, 0.47, 0.47, 0.53, 0.53, 4, 76, '#3a3a46');
    O.prisme(g, P, 0.22, 0.48, 0.78, 0.52, 68, 70, '#3a3a46');
  }, (g, P) => {
    for (const [u, v, z] of [[0.5, 0.5, 82], [0.24, 0.5, 74], [0.76, 0.5, 74]]) {
      const [x, y] = P(u, v, z);
      ovale(g, x, y, 5, 5, O.CONTOUR);
      ovale(g, x, y, 4, 4, '#ffe9a0');
      ovale(g, x - 1, y - 1, 2, 2, '#ffffff');
    }
  });
}

// Barbe à papa : chariot rose, cuve, bâtonnets et auvent (le long du mur gauche, sur deux cases).
function barbe(it, typeTheme, etat, O) {
  return feuille(O, -0.1, -0.2, 1.2, 2.2, 92, (g, P) => {
    for (const v of [0.3, 1.7]) {
      const [x, y] = P(0.8, v, 8);
      ovale(g, x, y, 3, 6, '#3a2a2a');
      ovale(g, x, y, 1, 3, '#c0c8d0');
    }
    O.prisme(g, P, 0.12, 0.12, 0.78, 1.88, 6, 34, '#f7c6d6');
    for (let v = 0.2; v < 1.85; v += 0.36) O.quadX(g, P, 0.78, v, v + 0.18, 10, 30, '#ffffff');
    O.prisme(g, P, 0.1, 0.1, 0.8, 1.9, 34, 36, '#e8f4f8');
    // cuve et nuage de sucre
    O.prisme(g, P, 0.3, 1.0, 0.66, 1.36, 36, 44, '#c0c8d0');
    const [cx, cy] = P(0.48, 1.18, 48);
    ovale(g, cx, cy, 9, 5, '#ffb3cf');
    ovale(g, cx - 2, cy - 2, 5, 3, '#ffd6e6');
    // bâtonnets prêts
    for (let k = 0; k < 3; k++) {
      const [x, y] = P(0.4, 0.34 + k * 0.16, 36);
      g.fillStyle = '#f4ead2';
      g.fillRect(Math.round(x), Math.round(y) - 10, 1, 10);
      ovale(g, x, y - 14, 4, 5, k % 2 ? '#c9a0ff' : '#ff8fb1');
    }
    // poteaux de l'auvent
    for (const v of [0.14, 1.86]) O.prisme(g, P, 0.14, v - 0.03, 0.2, v + 0.03, 34, 85, '#f4f4f4');
  }, (g, P) => {
    // auvent haut (on voit la cuve dessous) et son bandeau
    const cols = ['#ff8fb1', '#ffffff'];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2;
      const b = ((k + 1) / 8) * 2;
      O.poly(g, [P(0.04, a, 88), P(0.04, b, 88), P(0.98, b, 78), P(0.98, a, 78)], cols[k % 2]);
    }
    O.poly(g, [P(0.98, 0, 78), P(0.98, 2, 78), P(0.98, 2, 69), P(0.98, 0, 69)], '#fff4f8');
    trait(g, P(0.98, 0, 78), P(0.98, 2, 78), O.CONTOUR);
    trait(g, P(0.98, 0, 69), P(0.98, 2, 69), O.CONTOUR);
    trait(g, P(0.04, 2, 88), P(0.98, 2, 78), O.CONTOUR);
    trait(g, P(0.98, 2, 78), P(0.98, 2, 69), O.CONTOUR);
    const txt = O.enseigne('BARBE A PAPA', 'CANDY FLOSS');
    const t = P(0.98, 1 + O.mesurer(txt) / 64, 77);
    texteBiaisX(g, O, txt, t[0], t[1], '#c4456f');
  });
}

// Passe-tête : une planche peinte (un hercule de foire) avec un trou pour le visage. Elle se dessine devant la
// personne qui se tient sur la case (couche « avant ») : seul son visage apparaît dans le trou.
function passeTete(it, typeTheme, etat, O) {
  const planche = (g, P) => {
    const [hx, hy] = P(0.5, 0.5, 41);
    const X = (dx) => Math.round(hx + dx);
    const Y = (dy) => Math.round(hy + dy);
    const R = (x, y, w, h, col) => {
      g.fillStyle = col;
      g.fillRect(X(x), Y(y), w, h);
    };
    // pieds de la planche
    R(-15, 44, 3, 6, '#5a3a1a');
    R(12, 44, 3, 6, '#5a3a1a');
    // la planche : cadre de bois, ciel, ampoules
    R(-26, -34, 52, 80, '#7a4a22');
    R(-24, -32, 48, 76, '#7ec8f0');
    R(-24, 30, 48, 14, '#e9cf95');
    for (let k = 0; k < 7; k++) R(-24 + k * 8, -33, 2, 2, '#ffe9a0');
    // titre
    const titre = O.enseigne('HERCULE', 'HERCULES');
    g.drawImage(O.texteCanvas(titre, ROUGE), X(-Math.round(O.mesurer(titre) / 2)), Y(-31));
    // haltère au-dessus de la tête
    R(-20, -20, 40, 2, '#2a2a33');
    R(-22, -24, 5, 11, '#15151f');
    R(17, -24, 5, 11, '#15151f');
    // bras levés (peau peinte) et biceps
    const peau = '#f0b98a';
    R(-17, -18, 5, 20, peau);
    R(12, -18, 5, 20, peau);
    R(-19, -6, 7, 7, peau);
    R(12, -6, 7, 7, peau);
    // cou et torse
    R(-4, 8, 8, 4, peau);
    R(-15, 11, 30, 21, peau);
    R(-15, 11, 30, 2, O.nuance(peau, -0.15));
    // maillot léopard
    R(-12, 15, 24, 20, '#e8a33a');
    R(-12, 15, 4, 8, peau);
    for (const [dx, dy] of [[-6, 19], [2, 18], [7, 24], [-3, 27], [5, 31], [-9, 31], [-1, 22]]) {
      R(dx, dy, 3, 2, '#5a3a1a');
      R(dx + 1, dy, 1, 1, '#2a1a10');
    }
    // jambes
    R(-10, 35, 7, 8, peau);
    R(3, 35, 7, 8, peau);
    R(-11, 42, 9, 3, '#2a2a33');
    R(2, 42, 9, 3, '#2a2a33');
    // le trou du visage
    g.save();
    g.globalCompositeOperation = 'destination-out';
    ovale(g, hx, hy, 9, 9, '#000000');
    g.restore();
  };
  // le sprite principal reprend la planche (pour les aperçus, qui ne dessinent que lui) ; en jeu, `avant` la
  // redessine devant la personne
  const s = feuille(O, -0.4, -0.4, 1.4, 1.4, 90, (g, P) => {
    O.prisme(g, P, 0.66, 0.66, 0.72, 0.72, 0, 6, '#5a3a1a');
    planche(g, P);
  });
  s.avant = feuille(O, -0.4, -0.4, 1.4, 1.4, 90, planche);
  return s;
}

// Pêche aux canards (deux cases) : bassin rayé, îlot au phare ; les canards tournent (voir JEUX).
function bassin(it, typeTheme, etat, O) {
  return O.spriteBloc(2, 1, 50, (g, P) => {
    O.prisme(g, P, 0.06, 0.08, 1.94, 0.92, 0, 14, '#2a6fd0');
    for (let u = 0.12; u < 1.9; u += 0.3) O.quadY(g, P, 0.92, u, u + 0.15, 2, 12, '#f4f4f4');
    for (let v = 0.14; v < 0.9; v += 0.3) O.quadX(g, P, 1.94, v, v + 0.15, 2, 12, '#f4f4f4');
    O.quadZ(g, P, 14, 0.14, 0.16, 1.86, 0.84, '#2f9fd0');
    O.quadZ(g, P, 14, 0.14, 0.16, 1.86, 0.26, '#2687b8');
    O.quadZ(g, P, 14, 0.14, 0.16, 0.24, 0.84, '#2687b8');
    // îlot et petit phare
    O.prisme(g, P, 0.84, 0.38, 1.16, 0.62, 14, 17, '#e9cf95');
    O.prisme(g, P, 0.95, 0.45, 1.05, 0.55, 17, 32, '#f4f4f4');
    O.prisme(g, P, 0.95, 0.45, 1.05, 0.55, 22, 26, ROUGE);
    O.prisme(g, P, 0.94, 0.44, 1.06, 0.56, 32, 35, ROUGE);
  });
}
function jeuPeche(g, it, tx, ty, t, actif, O) {
  const P = O.projeteur(tx + 32, ty);
  const canards = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + t / 2600;
    canards.push([1 + Math.cos(a) * 0.66, 0.5 + Math.sin(a) * 0.26, a]);
  }
  canards.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  canards.forEach(([u, v], i) => {
    const [x, y] = P(u, v, 14);
    const b = Math.round(Math.sin(t / 300 + i) * 0.6);
    const X = Math.round(x);
    const Y = Math.round(y) + b;
    g.fillStyle = O.CONTOUR;
    g.fillRect(X - 4, Y - 3, 8, 4);
    g.fillRect(X - 1, Y - 6, 4, 4);
    g.fillStyle = '#ffd23f';
    g.fillRect(X - 3, Y - 2, 6, 2);
    g.fillRect(X, Y - 5, 2, 3);
    g.fillStyle = '#ff8a2a';
    g.fillRect(X + 2, Y - 4, 2, 1);
    if (i % 3 === 0) {
      g.fillStyle = '#e8452f';
      g.fillRect(X - 2, Y - 1, 1, 1);
    }
  });
}

// Banc de square (on s'y assoit, tourné vers +x).
function banc(it, typeTheme, etat, O) {
  const bois = it.variante ? '#9a6232' : '#8a5a30';
  const fer = '#2a2a33';
  return O.spriteTuile(40, (g, P) => {
    for (const v of [0.14, 0.82]) {
      O.prisme(g, P, 0.3, v, 0.36, v + 0.04, 0, 12, fer);
      O.prisme(g, P, 0.72, v, 0.78, v + 0.04, 0, 12, fer);
      O.prisme(g, P, 0.3, v, 0.78, v + 0.04, 18, 20, fer);
      O.prisme(g, P, 0.24, v, 0.28, v + 0.04, 12, 30, fer);
    }
    for (let k = 0; k < 3; k++) O.prisme(g, P, 0.3 + k * 0.16, 0.12, 0.42 + k * 0.16, 0.88, 12, 14, bois);
    for (const z of [17, 23]) O.prisme(g, P, 0.22, 0.1, 0.28, 0.9, z, z + 4, bois);
  });
}

// Ballons gonflés à l'hélium, attachés à un poids (ils se balancent : voir ANIMES).
function ballons(it, typeTheme, etat, O) {
  return O.spriteTuile(20, (g, P) => {
    O.prisme(g, P, 0.4, 0.4, 0.6, 0.6, 0, 8, '#5a5a66');
    O.prisme(g, P, 0.46, 0.46, 0.54, 0.54, 8, 10, '#3a3a46');
  });
}
const COULEURS_BALLONS = ['#ff5fa2', '#ffd23f', '#3df2ff', '#7dff6a', '#ff8a2a', '#c9a0ff', '#e8452f'];
function animeBallons(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const [bx, by] = P(0.5, 0.5, 10);
  const pos = [[-9, -58], [6, -62], [-2, -70], [12, -50], [-14, -48], [3, -50], [-6, -80]];
  pos.forEach(([dx, dy], k) => {
    const x = bx + dx + Math.sin(t / 900 + k) * 2;
    const y = by + dy + Math.sin(t / 700 + k * 2) * 1.5;
    trait(g, [bx, by], [x, y + 6], 'rgba(240,240,240,0.7)');
  });
  pos.forEach(([dx, dy], k) => {
    const x = Math.round(bx + dx + Math.sin(t / 900 + k) * 2);
    const y = Math.round(by + dy + Math.sin(t / 700 + k * 2) * 1.5);
    ovale(g, x, y, 6, 7, O.CONTOUR);
    ovale(g, x, y, 5, 6, COULEURS_BALLONS[k]);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(x - 3, y - 4, 2, 2);
    g.fillStyle = O.nuance(COULEURS_BALLONS[k], -0.3);
    g.fillRect(x - 1, y + 6, 2, 2);
  });
}

// Barrière des autos tamponneuses : bords du fond dans le dessin, bords de devant dans la couche « avant »
// (ils passent devant les gens sur la piste).
function barrierePiste(it, typeTheme, etat, O) {
  const b = it.bords || '';
  const rail = (g, P, cote) => {
    const seg = {
      n: [0, -0.05, 1, 0.05], s: [0, 0.95, 1, 1.05], w: [-0.05, 0, 0.05, 1], e: [0.95, 0, 1.05, 1],
    }[cote];
    O.prisme(g, P, ...seg, 0, 12, '#23305a');
    O.prisme(g, P, ...seg, 12, 15, '#ffd23f');
    for (let k = 0; k < 4; k++) {
      const a = k / 4;
      const z0 = 3;
      if (cote === 'n' || cote === 's') O.quadY(g, P, seg[3], a + 0.04, a + 0.14, z0, z0 + 6, '#ffd23f');
      else O.quadX(g, P, seg[2], a + 0.04, a + 0.14, z0, z0 + 6, '#ffd23f');
    }
  };
  const poteau = (g, P, u, v) => O.prisme(g, P, u - 0.05, v - 0.05, u + 0.05, v + 0.05, 0, 20, ROUGE);
  const devant = (g, P) => {
    if (b.includes('s')) rail(g, P, 's');
    if (b.includes('e')) rail(g, P, 'e');
    if (b.includes('s') && b.includes('e')) poteau(g, P, 1, 1);
    if (b.includes('s') && b.includes('w')) poteau(g, P, 0, 1);
    if (b.includes('n') && b.includes('e')) poteau(g, P, 1, 0);
  };
  // le sprite principal reprend aussi les bords de devant (pour les aperçus) ; en jeu, `avant` les redessine
  const s = feuille(O, -0.1, -0.1, 1.1, 1.1, 24, (g, P) => {
    if (b.includes('n')) rail(g, P, 'n');
    if (b.includes('w')) rail(g, P, 'w');
    if (b.includes('n') && b.includes('w')) poteau(g, P, 0, 0);
    devant(g, P);
  });
  if (b.includes('s') || b.includes('e')) s.avant = feuille(O, -0.1, -0.1, 1.1, 1.1, 24, devant);
  return s;
}
// Portillon d'entrée de la piste (côté gauche).
function portillon(it, typeTheme, etat, O) {
  return feuille(O, -0.2, -0.1, 0.4, 1.1, 44, (g, P) => {
    for (const v of [0.02, 0.98]) {
      O.prisme(g, P, -0.06, v - 0.05, 0.04, v + 0.05, 0, 30, ROUGE);
      O.prisme(g, P, -0.08, v - 0.07, 0.06, v + 0.07, 30, 33, OR);
    }
  });
}

// Auto tamponneuse : la caisse de devant (côtés +x et +y) passe devant le conducteur (couche « avant »).
const COULEURS_AUTOS = ['#e8452f', '#2a6fd0', '#ffd23f', '#3aa655'];
function repereAuto(dir) {
  // (le long du sens de marche a de 0 = arrière à 1 = avant, en travers c) → (u, v)
  return (a0, a1, c0, c1) => {
    if (dir === 'se') return [a0, c0, a1, c1];
    if (dir === 'nw') return [1 - a1, c0, 1 - a0, c1];
    if (dir === 'sw') return [c0, a0, c1, a1];
    return [c0, 1 - a1, c1, 1 - a0];
  };
}
function auto(it, typeTheme, etat, O) {
  const col = COULEURS_AUTOS[(it.variante || 0) % COULEURS_AUTOS.length];
  const dir = it.dir || 'se';
  const B = repereAuto(dir);
  const face = dir === 'se' || dir === 'sw'; // le conducteur nous fait face : le capot est devant lui
  const capot = (g, P) => {
    O.prisme(g, P, ...B(0.66, 0.9, 0.12, 0.88), 6, 17, col);
    O.prisme(g, P, ...B(0.7, 0.86, 0.2, 0.8), 17, 19, O.nuance(col, 0.2));
    O.prisme(g, P, ...B(0.6, 0.66, 0.42, 0.58), 17, 24, '#2a2a33');
    O.prisme(g, P, ...B(0.56, 0.68, 0.36, 0.64), 24, 26, '#15151f');
  };
  const dossier = (g, P) => {
    O.prisme(g, P, ...B(0.1, 0.24, 0.14, 0.86), 6, 30, col);
    O.prisme(g, P, ...B(0.14, 0.2, 0.47, 0.53), 30, 74, '#9aa3ad');
    O.prisme(g, P, ...B(0.12, 0.22, 0.4, 0.6), 72, 75, '#5a6068');
  };
  const devant = (g, P) => {
    if (face) capot(g, P);
    else dossier(g, P);
    if (dir === 'se' || dir === 'nw') O.prisme(g, P, 0.1, 0.82, 0.9, 0.9, 6, 16, col);
    else O.prisme(g, P, 0.82, 0.1, 0.9, 0.9, 6, 16, col);
    // numéro peint
    const [x, y] = dir === 'se' || dir === 'nw' ? P(0.5, 0.9, 11) : P(0.9, 0.5, 11);
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
  };
  // le sprite principal reprend aussi la caisse de devant (pour les aperçus) ; en jeu, `avant` la redessine
  const s = feuille(O, -0.05, -0.05, 1.05, 1.05, 84, (g, P) => {
    O.prisme(g, P, 0.06, 0.06, 0.94, 0.94, 0, 6, '#15151f');
    O.prisme(g, P, 0.1, 0.1, 0.9, 0.9, 6, 9, O.nuance(col, -0.25));
    O.prisme(g, P, ...B(0.24, 0.5, 0.2, 0.8), 9, 13, '#3a2a2a');
    if (face) dossier(g, P);
    else capot(g, P);
    // flancs du fond
    if (dir === 'se' || dir === 'nw') O.prisme(g, P, 0.1, 0.1, 0.9, 0.18, 6, 16, col);
    else O.prisme(g, P, 0.1, 0.1, 0.18, 0.9, 6, 16, col);
    devant(g, P);
  });
  s.avant = feuille(O, -0.05, -0.05, 1.05, 1.05, 84, devant);
  return s;
}
// Étincelles au bout de la perche (contact avec le plafond électrique).
function animeAuto(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const B = repereAuto(it.dir || 'se');
  const [u0, v0, u1, v1] = B(0.14, 0.2, 0.47, 0.53);
  const [x, y] = P((u0 + u1) / 2, (v0 + v1) / 2, 76);
  const f = Math.floor(t / 90 + (it.variante || 0) * 3) % 5;
  if (f === 4) return;
  g.fillStyle = f % 2 ? '#bff8ff' : '#ffffff';
  g.fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 2);
  g.fillStyle = '#3df2ff';
  const d = [[-3, -3], [3, -2], [-2, 1], [2, -4]][f];
  g.fillRect(Math.round(x) + d[0], Math.round(y) + d[1], 1, 1);
}
// Chocs entre autos (étoiles), quand on joue.
function jeuAutos(g, it, tx, ty, t, actif, O) {
  if (!actif) return;
  const P = O.projeteur(tx + 32, ty);
  const chocs = [[1.5, 0.5], [2.5, 1.5], [1.5, 2.5], [0.5, 1.5]];
  const k = Math.floor(t / 1300) % chocs.length;
  const c = (t % 1300) / 1300;
  if (c > 0.35) return;
  const [x, y] = P(chocs[k][0], chocs[k][1], 18 + c * 20);
  const r = 3 + Math.round(c * 8);
  g.fillStyle = '#ffffff';
  g.fillRect(Math.round(x) - r, Math.round(y), r * 2 + 1, 1);
  g.fillRect(Math.round(x), Math.round(y) - r, 1, r * 2 + 1);
  g.fillStyle = '#ffd23f';
  g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
  g.fillStyle = '#ffffff';
  g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
}

// Chamboule-tout (sur le fond du stand) et tir aux canards.
function jeuStand(g, it, tx, ty, t, actif, O) {
  const P = O.projeteur(tx + 32, ty);
  if (it.variante === 'tir') {
    // canards qui défilent sur le rebord (sur les trois cases du stand), un touché bascule
    const vitesse = 0.00025;
    for (let k = 0; k < 7; k++) {
      let u = ((k * 0.45 + t * vitesse) % 3.15) - 1.05;
      if (u > 1.95) continue;
      const [x, y] = P(u, 0.3, 32);
      const X = Math.round(x);
      const Y = Math.round(y);
      const touche = actif && Math.floor(t / 900) % 7 === k && (t % 900) < 600;
      g.fillStyle = O.CONTOUR;
      g.fillRect(X - 4, Y - 5, 9, 6);
      g.fillRect(X + 1, Y - 9, 4, 5);
      g.fillStyle = touche ? '#9aa3ad' : '#ffd23f';
      if (touche) g.fillRect(X - 3, Y - 2, 7, 2);
      else {
        g.fillRect(X - 3, Y - 4, 7, 4);
        g.fillRect(X + 2, Y - 8, 2, 4);
        g.fillStyle = '#ff8a2a';
        g.fillRect(X + 4, Y - 7, 2, 1);
      }
      if (touche && (t % 900) < 160) {
        g.fillStyle = '#ffffff';
        g.fillRect(X - 6, Y - 6, 2, 2);
        g.fillRect(X + 5, Y - 7, 2, 2);
        g.fillRect(X, Y - 12, 2, 2);
      }
    }
    return;
  }
  // chamboule-tout : deux pyramides de boîtes ; quand on joue, une balle part et en renverse une
  const boite = (u, v, z, couche, k) => {
    const cols = [ROUGE, '#c0c8d0', '#2a6fd0'];
    if (couche) O.prisme(g, P, u - 0.06, v - 0.04, u + 0.06, v + 0.04, z, z + 4, cols[k % 3]);
    else {
      O.prisme(g, P, u - 0.04, v - 0.04, u + 0.04, v + 0.04, z, z + 8, cols[k % 3]);
      O.quadZ(g, P, z + 8, u - 0.03, v - 0.03, u + 0.03, v + 0.03, '#e8eef4');
    }
  };
  const pyramide = (uc) => {
    let k = 0;
    for (let r = 0; r < 3; r++) for (let i = 0; i <= 2 - r; i++) boite(uc - (2 - r) * 0.05 + i * 0.1, 0.42, 25 + r * 8, false, k++);
  };
  const c = actif ? (t % 3600) / 3600 : 0.95;
  const cible = Math.floor(t / 3600) % 2;
  const uc = cible ? 1.5 : 0.5;
  pyramide(cible ? 0.5 : 1.5);
  if (c < 0.3 || c > 0.9) pyramide(uc);
  else {
    // boîtes renversées sur l'étagère
    const pos = [[-0.14, 0.38], [-0.02, 0.5], [0.1, 0.36], [0.2, 0.52], [-0.22, 0.56], [0.04, 0.6]];
    pos.forEach(([du, dv], k) => boite(uc + du, dv, 25, true, k));
  }
  if (actif && c < 0.3) {
    const e = c / 0.3;
    const [x, y] = P(uc, 2.5 - e * 2.05, 44 - e * 10 + Math.sin(e * Math.PI) * 10);
    ovale(g, x, y, 2, 2, O.CONTOUR);
    ovale(g, x, y, 1, 1, '#f4f4f4');
  }
}
function animePince(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const ph = t + (it.variante || 0) * 2300;
  const u = 0.5 + Math.sin(ph / 1300) * 0.22;
  const v = 0.46 + Math.cos(ph / 1700) * 0.18;
  const c = (ph % 7000) / 7000;
  const z = c > 0.7 && c < 0.9 ? 66 - Math.sin(((c - 0.7) / 0.2) * Math.PI) * 26 : 66;
  const [x0, y0] = P(u, v, 70);
  const [x, y] = P(u, v, z);
  trait(g, [x0, y0], [x, y], '#c0c8d0');
  g.fillStyle = '#5a6068';
  g.fillRect(Math.round(x) - 3, Math.round(y), 7, 2);
  g.fillRect(Math.round(x) - 3, Math.round(y) + 2, 1, 3);
  g.fillRect(Math.round(x) + 3, Math.round(y) + 2, 1, 3);
}

export const MEUBLES = {
  palmier, bar_fond: barFond, comptoir, tabouret, filet, serviette, transat, glaciere, chateau_sable: chateau, boules, glacier,
  douche, surfs, mns,
  bouee: vide, canard: vide, crabe: vide,
  guichet, stand_fond: standFond, stand_comptoir: standComptoir, force, pince, lampion, barbe, passe_tete: passeTete, bassin,
  banc, ballons, barriere_piste: barrierePiste, portillon, auto,
};
export const ANIMES = {
  pince: animePince,
  ballons: animeBallons,
  auto: animeAuto,
  bouee: (g, it, tx, ty, t, O) => {
    const [x, y] = O.projeteur(tx + 32, ty)(0.5, 0.5, 0);
    const b = Math.round(Math.sin(t / 700 + it.y) * 1.5);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(Math.round(x) - 14, Math.round(y) + 3, 28, 1);
    g.drawImage(imgBouee(O, it.variante || 0), Math.round(x) - 13, Math.round(y) - 8 + b);
  },
  canard: (g, it, tx, ty, t, O) => {
    const [x, y] = O.projeteur(tx + 32, ty)(0.5, 0.5, 0);
    const b = Math.round(Math.sin(t / 800) * 1.5);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(Math.round(x) - 15, Math.round(y) + 3, 30, 1);
    g.drawImage(imgCanard(O), Math.round(x) - 17, Math.round(y) - 28 + b);
  },
  crabe: (g, it, tx, ty, t, O) => {
    const c = (t % 9000) / 9000;
    const u = 0.5 + Math.sin(c * Math.PI * 2) * 0.28;
    const [x, y] = O.projeteur(tx + 32, ty)(u, 0.5 - Math.sin(c * Math.PI * 2) * 0.28, 0);
    g.drawImage(imgCrabe(O, Math.floor(t / 150) % 2), Math.round(x) - 9, Math.round(y) - 8);
  },
};
export const JEUX = {
  filet: jeuVolley, serviette: jeuRaquettes, chateau_sable: jeuChateau, boules: jeuPetanque,
  stand_fond: jeuStand, force: jeuForce, bassin: jeuPeche, auto: jeuAutos,
};

const bordsTerrain = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
export const SOLS = {
  sable, rivage, eau, ponton, pave, piste, sciure,
  ...Object.fromEntries(bordsTerrain.map((b) => ['ligne_' + b, ligneTerrain(b)])),
};
export const MURS = { horizon, chapiteau };
export const DECORS_MURS = { plage: decorsPlage, foire: decorsFoire };
export const THEMES = {
  plage: {
    sols: {
      def: ['sable', '#e9cf95'], sable: ['sable', '#e9cf95'], terrain: ['sable', '#efd9a3'],
      ...Object.fromEntries(bordsTerrain.map((b) => ['terrain-' + b, ['ligne_' + b, '#efd9a3']])),
      rivage: ['rivage', '#d6b679'], mer: ['eau', '#3cb6d8'], large: ['eau', '#2196c4'],
      ponton: ['ponton', '#b9864f'], terrasse: ['ponton', '#a87443'],
    },
    mur: 'horizon', dalle: '#b08a52', bureau: '#c99c66', chaise: '#e76f51', canape: '#2a9d8f', canapeEquipe: '#e76f51', table: '#c99c66',
  },
  // Fête foraine : pavés, sciure, planches des stands, tôle de la piste
  foire: {
    sols: {
      def: ['pave', '#57525e'], pave: ['pave', '#57525e'], hall: ['ponton', '#7a5236'], stand: ['ponton', '#6a4630'],
      piste: ['piste', '#5a6270'], sciure: ['sciure', '#b8925a'],
    },
    mur: 'chapiteau', dalle: '#2a2630', bureau: '#7a5236', chaise: ROUGE, canape: ROUGE, canapeEquipe: '#2a6fd0', table: '#7a5236',
  },
};
