// Sprites procéduraux : outils de rastérisation pixel (polygones, prismes isométriques),
// avatars, icônes, bulles, étiquettes, ampoules d'effort. Tout est mis en cache.
import { texteCanvas, couperLignes, mesurer, tronquer, HAUTEUR_LIGNE } from './police.js';

export const MODELES = {
  haiku: { c: '#3cc251', f: '#21852f', clair: '#bff0c6', nom: 'Haiku' },
  sonnet: { c: '#3a86ff', f: '#2155b3', clair: '#c4dcff', nom: 'Sonnet' },
  opus: { c: '#9b5de5', f: '#6436a8', clair: '#e1cdf8', nom: 'Opus' },
  fable: { c: '#f2b318', f: '#a87806', clair: '#fbe7a9', nom: 'Fable' },
};
export const EFFORTS = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
export const CONTOUR = '#15151f';

export function modele(m) {
  return MODELES[m] || { c: '#8a8f99', f: '#5b6068', clair: '#dde0e5', nom: m || '?' };
}

// ---------- utilitaires ----------
export function creerCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return c;
}

export function hexRgb(h) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((x) => x + x).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbHex(r, g, b) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
// f > 0 éclaircit vers le blanc, f < 0 assombrit vers le noir.
export function nuance(hex, f) {
  const [r, g, b] = hexRgb(hex);
  if (f >= 0) return rgbHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
  return rgbHex(r * (1 + f), g * (1 + f), b * (1 + f));
}
export function melange(a, b, t) {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export function hacher(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function aleatoire(seed) {
  let a = seed >>> 0 || 1;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- rastérisation ----------
// Remplissage de polygone par lignes, échantillonné en bas de chaque rangée :
// reproduit exactement le losange 64×32 « classique » et reste étanche entre faces voisines.
export function poly(g, pts, col) {
  g.fillStyle = col;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const r0 = Math.floor(minY);
  const r1 = Math.ceil(maxY);
  const n = pts.length;
  const xs = [];
  for (let r = r0; r < r1; r++) {
    const ys = r + 1;
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const ya = a[1];
      const yb = b[1];
      if (ya === yb) continue;
      if ((ys >= ya && ys < yb) || (ys >= yb && ys < ya)) {
        xs.push(a[0] + ((ys - ya) * (b[0] - a[0])) / (yb - ya));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.round(xs[k]);
      const xb = Math.round(xs[k + 1]);
      if (xb > xa) g.fillRect(xa, r, xb - xa, 1);
    }
  }
}

// Projection isométrique locale : (x, y) en cases, z en pixels.
export function projeteur(ox, oy) {
  return (x, y, z = 0) => [ox + (x - y) * 32, oy + (x + y) * 16 - z];
}

export function teintes(c, k = 1) {
  return { t: nuance(c, 0.16 * k), g: c, d: nuance(c, -0.24 * k) };
}

// Prisme droit à base rectangulaire alignée sur la grille. Faces visibles : dessus, gauche (y = y1), droite (x = x1).
export function prisme(g, P, x0, y0, x1, y1, z0, z1, c, cg, cd) {
  let ct = c;
  if (cg === undefined) {
    const T = teintes(c);
    ct = T.t;
    cg = T.g;
    cd = T.d;
  }
  if (z1 > z0) {
    poly(g, [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], cg);
    poly(g, [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], cd);
  }
  poly(g, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], ct);
}
export function quadY(g, P, y, x0, x1, z0, z1, col) {
  poly(g, [P(x0, y, z1), P(x1, y, z1), P(x1, y, z0), P(x0, y, z0)], col);
}
export function quadX(g, P, x, y0, y1, z0, z1, col) {
  poly(g, [P(x, y0, z1), P(x, y1, z1), P(x, y1, z0), P(x, y0, z0)], col);
}
export function quadZ(g, P, z, x0, y0, x1, y1, col) {
  poly(g, [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], col);
}
export function pixel(g, pt, col, w = 1, h = 1) {
  g.fillStyle = col;
  g.fillRect(Math.round(pt[0]), Math.round(pt[1]), w, h);
}

// Lecture de pixels via un canvas de travail dédié (willReadFrequently), pour garder les sprites sur le GPU.
let travail = null;
function lirePixels(c) {
  if (!travail) {
    travail = document.createElement('canvas');
    travail.getContext('2d', { willReadFrequently: true });
  }
  travail.width = c.width;
  travail.height = c.height;
  const t = travail.getContext('2d', { willReadFrequently: true });
  t.drawImage(c, 0, 0);
  return t.getImageData(0, 0, c.width, c.height);
}
function ecrirePixels(c, img) {
  const g = c.getContext('2d');
  g.putImageData(img, 0, 0);
}

// Contour sombre d'1 px autour de la silhouette (pixels opaques).
export function contourner(c, couleur = CONTOUR) {
  const w = c.width;
  const h = c.height;
  const img = lirePixels(c);
  const d = img.data;
  const [r, gg, b] = hexRgb(couleur);
  const plein = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) plein[i] = d[i * 4 + 3] >= 120 ? 1 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i * 4 + 3] > 20) continue;
      if (
        (x > 0 && plein[i - 1]) ||
        (x < w - 1 && plein[i + 1]) ||
        (y > 0 && plein[i - w]) ||
        (y < h - 1 && plein[i + w])
      ) {
        d[i * 4] = r;
        d[i * 4 + 1] = gg;
        d[i * 4 + 2] = b;
        d[i * 4 + 3] = 255;
      }
    }
  }
  ecrirePixels(c, img);
  return c;
}

export function miroir(c) {
  const m = creerCanvas(c.width, c.height);
  const g = m.getContext('2d');
  g.translate(c.width, 0);
  g.scale(-1, 1);
  g.drawImage(c, 0, 0);
  return m;
}

export function griser(c, garder = null) {
  const img = lirePixels(c);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    if (garder && garder(d[i], d[i + 1], d[i + 2])) continue;
    const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    const v = 70 + l * 0.55;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v + 6;
  }
  ecrirePixels(c, img);
  return c;
}

// Dessin à partir de lignes de caractères et d'une palette.
export function spriteTexte(lignes, palette, contour = false) {
  const h = lignes.length;
  const w = Math.max(...lignes.map((l) => l.length));
  const m = contour ? 1 : 0;
  const c = creerCanvas(w + 2 * m, h + 2 * m);
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < lignes[y].length; x++) {
      const col = palette[lignes[y][x]];
      if (col) {
        g.fillStyle = col;
        g.fillRect(x + m, y + m, 1, 1);
      }
    }
  }
  if (contour) contourner(c);
  return c;
}

// ---------- avatars ----------
const PEAUX = ['#f6d3b3', '#eebc94', '#d49a6a', '#b07548', '#8a5530', '#5e3a20', '#fde3cc'];
const CHEVEUX = ['#2b1d14', '#5a3a1e', '#8e4f24', '#d9a441', '#1c1c22', '#7d7d86', '#b5372e', '#3a2a4a'];
const PANTALONS = ['#2c3e50', '#34405a', '#3b3b58', '#4a3728', '#25324a', '#43464f'];

export function apparence(graine, mod, type = 'agent', skin = null) {
  const r = aleatoire(hacher(graine));
  const M = modele(mod);
  const L = {
    type,
    peau: PEAUX[Math.floor(r() * PEAUX.length)],
    cheveux: CHEVEUX[Math.floor(r() * CHEVEUX.length)],
    coiffure: Math.floor(r() * 6),
    pantalon: PANTALONS[Math.floor(r() * PANTALONS.length)],
    chemise: M.c,
    chemiseF: M.f,
    badge: M.f,
    lunettes: type === 'inspecteur',
    cle: '',
  };
  if (type === 'dg') {
    L.peau = '#efc39c';
    L.cheveux = '#8d8d99';
    L.coiffure = 0;
    L.pantalon = '#22242d';
    L.chemise = '#2a2d3a';
    L.chemiseF = '#1c1e28';
  }
  if (type === 'inspecteur') L.coiffure = r() < 0.5 ? 4 : L.coiffure;
  if (type === 'joy') {
    // Joy, le happiness manager : tenue jaune, chapeau de fête, badge sourire
    L.peau = '#f6d3b3';
    L.cheveux = '#d9a441';
    L.coiffure = 2;
    L.pantalon = '#2f6fde';
    L.chemise = '#ffd23f';
    L.chemiseF = '#d9a400';
  }
  // Skin choisi dans Réglages › Équipe (par prénom, ou @dg / @joy) : il remplace le tirage au hasard.
  if (skin) {
    for (const k of ['peau', 'cheveux', 'pantalon']) if (skin[k]) L[k] = skin[k];
    if (Number.isInteger(skin.coiffure)) L.coiffure = skin.coiffure;
    if (typeof skin.lunettes === 'boolean') L.lunettes = skin.lunettes;
    if (skin.chemise) {
      L.chemise = skin.chemise;
      L.chemiseF = nuance(skin.chemise, -0.3);
    }
  }
  L.cle = [type, L.peau, L.cheveux, L.coiffure, L.pantalon, L.chemise, L.lunettes ? 1 : 0].join('|');
  return L;
}

export const PALETTE_PEAUX = PEAUX;
export const PALETTE_CHEVEUX = CHEVEUX;
export const PALETTE_PANTALONS = PANTALONS;

function dessinerAvatar(g, L, o) {
  const R = (x, y, w, h, c) => {
    if (w <= 0 || h <= 0) return;
    g.fillStyle = c;
    g.fillRect(x + 1, y + 1, w, h);
  };
  const face = o.face;
  const grand = L.type === 'dg' ? 4 : 0;
  const assis = o.posture === 'assis';
  const marche = o.posture === 'marche';
  const fr = o.frame | 0;
  const bob = marche && fr % 2 === 1 ? -1 : 0;
  const drop = assis ? 8 : 0;
  const Lj = 16 + grand / 2;
  const Tt = 12 + grand / 2;
  const shoeTop = 61;
  const legTop = shoeTop - Lj;
  const belt = legTop - 1 + drop + bob + (o.triste ? 1 : 0);
  const torsoTop = belt - Tt;
  const neck = torsoTop - 1;
  const headTop = neck - 16 + (o.triste ? 1 : 0);
  const peau = L.peau;
  const peauF = nuance(peau, -0.18);
  const sh = L.chemise;
  const shF = L.chemiseF;
  const shC = nuance(sh, 0.22);
  const pan = L.pantalon;
  const panF = nuance(pan, -0.25);
  const chaus = L.type === 'dg' ? '#0e0e12' : '#1e1b1b';
  const ch = L.cheveux;
  const chF = nuance(ch, -0.25);

  // --- jambes ---
  if (!assis) {
    let lOff = 0;
    let rOff = 0;
    let lUp = 0;
    let rUp = 0;
    if (marche) {
      if (fr === 1) { lOff = -1; rOff = 1; rUp = 1; }
      if (fr === 3) { lOff = 1; rOff = -1; lUp = 1; }
    }
    const lt = legTop + bob;
    const mid = legTop + 8;
    R(11, lt, 4, mid - lt, pan);
    R(17, lt, 4, mid - lt, pan);
    R(15, lt, 2, 3, pan);
    R(11 + lOff, mid, 4, shoeTop - mid - lUp, pan);
    R(17 + rOff, mid, 4, shoeTop - mid - rUp, panF);
    R(14 + lOff, mid, 1, shoeTop - mid - lUp, panF);
    const toe = face ? 1 : 0;
    R(10 + lOff + toe, shoeTop - lUp, 5, 3, chaus);
    R(17 + rOff + toe, shoeTop - rUp, 5, 3, chaus);
    R(11 + lOff + toe, shoeTop - lUp, 2, 1, nuance(chaus, 0.25));
  } else if (face) {
    R(11, belt + 1, 13, 3, pan);
    R(11, belt + 3, 13, 1, panF);
    R(17, belt + 4, 4, shoeTop - belt - 4, panF);
    R(21, belt + 4, 4, shoeTop - belt - 4, pan);
    R(17, shoeTop, 5, 3, chaus);
    R(21, shoeTop, 5, 3, chaus);
  } else {
    R(10, belt + 1, 12, 3, pan);
  }

  // --- torse ---
  R(11, torsoTop, 10, 1, sh);
  R(10, torsoTop + 1, 12, Tt - 1, sh);
  R(20, torsoTop + 1, 2, Tt - 1, shF);
  R(10, torsoTop + 1, 1, Tt - 1, shC);
  R(10, belt, 12, 1, L.type === 'dg' ? sh : panF);
  if (L.type === 'dg' && face) {
    const lap = '#3d4156';
    R(13, torsoTop, 2, 6, lap);
    R(17, torsoTop, 2, 6, lap);
    R(14, torsoTop, 4, 2, '#f2f2f2');
    R(15, torsoTop + 2, 2, 5, '#f2f2f2');
    R(15, torsoTop + 1, 2, 1, '#a8121b');
    R(15, torsoTop + 2, 2, 6, '#e02a36');
    R(15, torsoTop + 8, 1, 1, '#e02a36');
    R(16, torsoTop + 2, 1, 6, '#b81d28');
    R(19, torsoTop + 3, 2, 1, '#e02a36');
    R(13, torsoTop + 9, 1, 1, '#c9a227');
  } else if (face) {
    R(14, torsoTop, 4, 1, peau);
    R(15, torsoTop + 1, 2, 1, peau);
    R(13, torsoTop, 1, 1, shC);
    R(18, torsoTop, 1, 1, shC);
    if (L.type === 'joy') {
      R(11, torsoTop + 3, 5, 5, '#15151f');
      R(12, torsoTop + 4, 3, 3, '#ffe14d');
      R(12, torsoTop + 4, 1, 1, '#15151f');
      R(14, torsoTop + 4, 1, 1, '#15151f');
      R(12, torsoTop + 6, 3, 1, '#c45f00');
    } else {
      R(12, torsoTop + 3, 3, 3, '#f7f7f2');
      R(13, torsoTop + 4, 1, 1, L.badge);
    }
  } else {
    R(15, torsoTop + 2, 1, Tt - 3, nuance(sh, -0.1));
  }
  if (o.ruban) {
    for (let i = 0; i < Tt + 1; i++) {
      const x = 10 + Math.round(i * (12 / (Tt + 1)));
      R(x, torsoTop + i, 2, 1, i % 3 === 0 ? '#1d1d1d' : '#ffd200');
    }
  }
  R(14, neck, 4, 1, peauF);

  // --- tête ---
  const hy = headTop;
  R(10, hy, 12, 1, peau);
  R(9, hy + 1, 14, 1, peau);
  R(8, hy + 2, 16, 12, peau);
  R(9, hy + 14, 14, 1, peau);
  R(10, hy + 15, 12, 1, peau);
  R(23, hy + 3, 1, 10, peauF);
  R(10, hy + 15, 12, 1, peauF);
  const st = L.coiffure;
  if (face) {
    // oreille et traits
    R(9, hy + 8, 1, 3, peauF);
    if (o.yeuxFermes || o.triste) {
      R(14, hy + 9, 2, 1, '#1b1b2b');
      R(19, hy + 9, 2, 1, '#1b1b2b');
    } else {
      R(15, hy + 8, 1, 2, '#1b1b2b');
      R(20, hy + 8, 1, 2, '#1b1b2b');
    }
    R(19, hy + 10, 1, 1, peauF);
    R(21, hy + 11, 2, 1, melange(peau, '#ff6b6b', 0.35));
    if (o.triste) {
      R(17, hy + 12, 3, 1, '#7a3b30');
      R(16, hy + 13, 1, 1, '#7a3b30');
      R(20, hy + 13, 1, 1, '#7a3b30');
    } else if (o.bouche) {
      R(17, hy + 12, 3, 2, '#6b2525');
    } else {
      R(17, hy + 12, 3, 1, '#a0523f');
    }
    if (L.lunettes) {
      R(13, hy + 7, 4, 1, '#222');
      R(18, hy + 7, 4, 1, '#222');
      R(13, hy + 10, 4, 1, '#222');
      R(18, hy + 10, 4, 1, '#222');
      R(13, hy + 8, 1, 2, '#222');
      R(16, hy + 8, 2, 1, '#222');
      R(18, hy + 8, 1, 2, '#222');
      R(21, hy + 8, 1, 2, '#222');
    }
    if (L.type === 'dg') R(16, hy + 11, 5, 1, ch);
    // cheveux (vue de face)
    if (st === 4) {
      const cap = nuance(sh, -0.1);
      R(9, hy - 1, 14, 2, cap);
      R(8, hy + 1, 16, 4, cap);
      R(17, hy + 4, 9, 1, nuance(cap, -0.2));
      R(19, hy + 3, 7, 1, cap);
      R(8, hy + 5, 2, 4, ch);
    } else if (st === 5) {
      R(8, hy + 4, 2, 5, ch);
      R(22, hy + 4, 2, 2, ch);
      R(11, hy, 10, 1, nuance(peau, 0.15));
    } else {
      R(10, hy, 12, 1, ch);
      R(9, hy + 1, 14, 1, ch);
      R(8, hy + 2, 16, 3, ch);
      R(9, hy + 1, 4, 1, nuance(ch, 0.2));
      if (st === 2) {
        R(8, hy + 5, 3, 10, ch);
        R(22, hy + 5, 2, 8, ch);
        R(11, hy + 5, 6, 1, ch);
        R(8, hy + 12, 3, 3, chF);
      } else {
        R(8, hy + 5, 3, 4, ch);
        R(22, hy + 5, 2, 1, ch);
        R(12, hy + 5, 5, 1, ch);
      }
      if (st === 1) {
        R(10, hy - 2, 2, 2, ch);
        R(14, hy - 3, 2, 3, ch);
        R(18, hy - 2, 2, 2, ch);
        R(21, hy - 1, 2, 1, ch);
      }
      if (st === 3) {
        R(9, hy - 3, 5, 4, ch);
        R(10, hy - 3, 3, 1, nuance(ch, 0.2));
      }
    }
  } else {
    // vue de dos
    if (st === 4) {
      const cap = nuance(sh, -0.1);
      R(9, hy - 1, 14, 2, cap);
      R(8, hy + 1, 16, 5, cap);
      R(8, hy + 6, 16, 4, ch);
    } else if (st === 5) {
      R(8, hy + 5, 16, 6, ch);
    } else {
      R(10, hy, 12, 1, ch);
      R(9, hy + 1, 14, 1, ch);
      R(8, hy + 2, 16, st === 2 ? 13 : 10, ch);
      R(10, hy + 2, 3, 2, nuance(ch, 0.18));
      if (st === 1) {
        R(10, hy - 2, 2, 2, ch);
        R(14, hy - 3, 2, 3, ch);
        R(18, hy - 2, 2, 2, ch);
      }
      if (st === 3) R(13, hy - 3, 6, 4, ch);
    }
    R(8, hy + 8, 1, 3, peauF);
    R(23, hy + 8, 1, 3, peauF);
    if (st !== 2) R(11, hy + 12, 10, 2, peauF);
  }

  // chapeau de fête de Joy
  if (L.type === 'joy') {
    const rayures = ['#e3342f', '#2f6fde', '#3aa655', '#ffd23f'];
    for (let k = 0; k < 9; k++) {
      const w = 1 + Math.floor(k * 0.9) * 2;
      R(16 - Math.floor(w / 2) + (face ? 1 : 0), hy - 9 + k, w, 1, rayures[Math.floor(k / 2) % rayures.length]);
    }
    R(15 + (face ? 1 : 0), hy - 12, 3, 3, '#ffffff');
    R(16 + (face ? 1 : 0), hy - 11, 1, 1, '#ff8fb1');
  }

  // --- bras ---
  const top = torsoTop + 1;
  const ar = Tt - 2;
  const pendant = (x, dy) => {
    R(x, top + dy, 3, ar - 2, sh);
    R(x, top + dy, 1, ar - 2, shC);
    R(x, top + dy + ar - 2, 3, 2, peau);
  };
  const bras = o.bras || 'repos';
  if (bras === 'taper') {
    const a = fr % 2;
    if (face) {
      R(7, top, 3, 5, sh);
      R(8, top + 5, 7, 2, sh);
      R(15, top + 5 - a, 2, 2, peau);
      R(22, top, 3, 5, sh);
      R(22, top + 5, 5, 2, shF);
      R(27, top + 4 + a, 2, 2, peau);
    } else {
      R(7, top - a, 3, 6, sh);
      R(22, top - (1 - a), 3, 6, sh);
    }
  } else if (bras === 'boire') {
    pendant(7, 0);
    if (fr % 2 === 0 || !face) {
      R(22, top, 3, 4, sh);
      R(21, top + 4, 3, 3, sh);
      R(19, top + 6, 3, 2, peau);
      if (face) {
        R(17, top + 4, 3, 3, '#ffffff');
        R(17, top + 4, 3, 1, '#6b3e1f');
      }
    } else {
      R(22, top, 3, 3, sh);
      R(21, hy + 13, 3, top - hy - 13, sh);
      R(20, hy + 12, 2, 2, peau);
      R(17, hy + 11, 3, 3, '#ffffff');
      R(17, hy + 11, 3, 1, '#6b3e1f');
    }
  } else if (bras === 'lever') {
    pendant(7, 0);
    const yTop = hy - 7;
    R(22, yTop + 2, 3, top + 3 - yTop - 2, sh);
    R(22, yTop + 2, 1, top + 3 - yTop - 2, shC);
    R(22, yTop, 3, 2, peau);
  } else if (bras === 'dossier') {
    pendant(7, 0);
    const col = o.dossierCouleur || '#f2c14e';
    R(22, top, 3, 4, sh);
    R(23, top + 4, 4, 2, sh);
    R(25, top - 1, 7, 9, col);
    R(25, top + 7, 7, 1, nuance(col, -0.3));
    R(26, top - 2, 5, 1, '#ffffff');
    R(25, top - 2, 2, 1, col);
    R(26, top + 4, 2, 2, peau);
  } else if (bras === 'tel') {
    pendant(7, 0);
    R(22, top, 3, 3, sh);
    R(22, hy + 10, 3, top - hy - 10 + 1, sh);
    R(22, hy + 9, 3, 2, peau);
    R(23, hy + 5, 2, 7, '#1d1d24');
    R(23, hy + 5, 1, 1, '#555a66');
  } else if (bras === 'lire') {
    if (face) {
      const cov = o.dossierCouleur || '#2f6fde';
      R(8, top, 3, 6, sh);
      R(21, top, 3, 6, sh);
      R(11, top + 3, 11, 7, cov);
      R(12, top + 3, 4, 6, '#f6f6f0');
      R(17, top + 3, 4, 6, '#f6f6f0');
      R(16, top + 3, 1, 7, nuance(cov, -0.35));
      R(12, top + 5, 3, 1, '#9aa3b0');
      R(17, top + 5, 3, 1, '#9aa3b0');
      R(12, top + 7, 2, 1, '#9aa3b0');
      R(17, top + 7, 3, 1, '#9aa3b0');
      R(10, top + 5, 2, 2, peau);
      R(21, top + 5, 2, 2, peau);
    } else {
      R(7, top, 3, 7, sh);
      R(22, top, 3, 7, sh);
    }
  } else if (bras === 'clip') {
    if (face) {
      R(8, top, 3, 6, sh);
      R(21, top, 3, 6, sh);
      R(12, top + 1, 9, 10, '#8b5a2b');
      R(13, top + 2, 7, 8, '#f6f6f0');
      R(15, top, 3, 2, '#a0a6ad');
      R(14, top + 4, 5, 1, '#9aa3b0');
      R(14, top + 6, 4, 1, '#9aa3b0');
      R(14, top + 8, 5, 1, '#9aa3b0');
      R(11, top + 5, 2, 2, peau);
      R(20, top + 5, 2, 2, peau);
    } else {
      R(7, top, 3, 7, sh);
      R(22, top, 3, 7, sh);
    }
  } else if (marche) {
    const d = fr === 1 ? 1 : fr === 3 ? -1 : 0;
    pendant(7, d);
    pendant(22, -d);
  } else {
    pendant(7, 0);
    pendant(22, 0);
  }
}

const cacheAvatars = new Map();
export const AVATAR_AX = 17;
export const AVATAR_AY = 65;

// dir : 'se' | 'sw' | 'ne' | 'nw'
export function spriteAvatar(L, o) {
  const cle = [L.cle, o.dir, o.posture, o.bras || '', o.frame | 0, o.bouche ? 1 : 0, o.triste ? 1 : 0, o.gris ? 1 : 0,
    o.ruban ? 1 : 0, o.yeuxFermes ? 1 : 0, o.dossierCouleur || ''].join('/');
  let s = cacheAvatars.get(cle);
  if (s) return s;
  const face = o.dir === 'se' || o.dir === 'sw';
  let c = creerCanvas(34, 70);
  dessinerAvatar(c.getContext('2d'), L, { ...o, face });
  contourner(c);
  if (o.dir === 'sw' || o.dir === 'nw') c = miroir(c);
  if (o.gris) griser(c, (r, g, b) => r === 255 && g === 210 && b === 0);
  if (cacheAvatars.size > 4000) cacheAvatars.clear();
  cacheAvatars.set(cle, c);
  return c;
}

// Tête d'un dormeur (yeux fermés), posée sur l'oreiller : le haut d'un avatar assis, coupé sous le menton.
// La couverture (dessinée par decor.js) vient par-dessus le cou.
export const TETE_AX = 17;
export const TETE_AY = 41;
const cacheTetes = new Map();
export function teteDormeur(L, dir = 'sw') {
  const cle = L.cle + '|' + dir;
  let c = cacheTetes.get(cle);
  if (c) return c;
  const corps = spriteAvatar(L, { dir, posture: 'assis', bras: 'repos', frame: 0, yeuxFermes: true });
  c = creerCanvas(corps.width, TETE_AY + 2);
  c.getContext('2d').drawImage(corps, 0, 0, corps.width, TETE_AY + 2, 0, 0, corps.width, TETE_AY + 2);
  if (cacheTetes.size > 400) cacheTetes.clear();
  cacheTetes.set(cle, c);
  return c;
}

// Petit « z » qui s'envole au-dessus d'un dormeur.
const cacheZ = new Map();
export function lettreZ(grand = false) {
  const cle = grand ? 'Z' : 'z';
  let c = cacheZ.get(cle);
  if (c) return c;
  c = texteCanvas(cle, '#dfe6ff', '#262a5c');
  cacheZ.set(cle, c);
  return c;
}

let ombreCache = null;
export function ombre() {
  if (ombreCache) return ombreCache;
  const largeurs = [10, 16, 20, 22, 20, 16, 10];
  const c = creerCanvas(22, largeurs.length);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,10,30,0.28)';
  largeurs.forEach((w, y) => g.fillRect((22 - w) / 2, y, w, 1));
  ombreCache = c;
  return c;
}

// ---------- icônes ----------
const K = CONTOUR;
const ICONES_DEF = {
  page: [
    ['.KKKKK...', '.KWWWKK..', '.KWWWKWK.', '.KWGGGKKK', '.KWWWWWWK', '.KWGGGGWK', '.KWWWWWWK', '.KWGGGGWK', '.KWWWWWWK', '.KKKKKKKK'],
    { K, W: '#ffffff', G: '#9aa3b5' },
  ],
  terminal: [
    ['KKKKKKKKKK', 'KDDDDDDDDK', 'KDGDDDDDDK', 'KDDGDDDDDK', 'KDGDDDDDDK', 'KDDDDGGGDK', 'KDDDDDDDDK', 'KKKKKKKKKK'],
    { K, D: '#22263a', G: '#4cff6a' },
  ],
  loupe: [
    ['..KKKK....', '.KBBBBK...', 'KBWBBBBK..', 'KBWBBBBK..', 'KBBBBBBK..', '.KBBBBK...', '..KKKKMK..', '......KMK.', '.......KMK', '........KK'],
    { K, B: '#bfe6ff', W: '#ffffff', M: '#8b5a2b' },
  ],
  globe: [
    ['..KKKKK..', '.KBBGGBK.', 'KBGGGBBBK', 'KBBGGBBGK', 'KBBBBBGGK', 'KGBBBBGBK', 'KGGBBBBBK', '.KGBBBBK.', '..KKKKK..'],
    { K, B: '#3a86ff', G: '#46c35a' },
  ],
  brique: [
    ['.KKK..KKK.', '.KRK..KRK.', 'KKKKKKKKKK', 'KLLLLLLLRK', 'KRRRRRRRRK', 'KRRRRRRRDK', 'KDDDDDDDDK', 'KKKKKKKKKK'],
    { K, L: '#ff7a70', R: '#e3342f', D: '#a3201c' },
  ],
  clap: [
    ['KKKKKKKKKK', 'KWKKWKKWKK', 'KKWKKWKKWK', 'KKKKKKKKKK', 'KDDDDDDDDK', 'KDGGGGGGDK', 'KDDDDDDDDK', 'KDGGGGDDDK', 'KKKKKKKKKK'],
    { K, W: '#ffffff', D: '#2e2f3c', G: '#8890a0' },
  ],
  crayon: [
    ['.......KK.', '......KPPK', '.....KYKPK', '....KYYYK.', '...KYYYK..', '..KYYYK...', '.KTYYK....', '.KTTK.....', 'KDKK......', 'KK........'],
    { K, P: '#ff8fb1', Y: '#ffcf3a', T: '#f1d9b0', D: '#3a3a3a' },
  ],
  engrenage: [
    ['...KKK...', '.KKGGGKK.', '.KGGGGGK.', 'KGGGKGGGK', 'KGGKKKGGK', 'KGGGKGGGK', '.KGGGGGK.', '.KKGGGKK.', '...KKK...'],
    { K, G: '#b8bec8' },
  ],
  telephone: [
    ['.KKKKKKKK.', 'KDDDDDDDDK', 'KDDKKKKDDK', 'KDK....KDK', 'KK..KK..KK', '...KDDK...', '..KDWWDK..', '..KDDDDK..', '..KKKKKK..'],
    { K, D: '#30323e', W: '#9aa0aa' },
  ],
  cafe: [
    ['..W.W....', '.W.W.....', 'KKKKKK...', 'KBBBBKKK.', 'KWWWWK.K.', 'KWWWWKKK.', 'KWWWWK...', '.KKKK....'],
    { K, W: '#ffffff', B: '#6b3e1f' },
  ],
  horloge: [
    ['..KKKKK..', '.KWWWWWK.', 'KWWWKWWWK', 'KWWWKWWWK', 'KWWWKKKWK', 'KWWWWWWWK', '.KWWWWWK.', '..KKKKK..'],
    { K, W: '#ffffff' },
  ],
  dossier: [
    ['KKKK......', 'KYYYKKKKKK', 'KYYYYYYYYK', 'KOOOOOOOOK', 'KYYYYYYYYK', 'KYYYYYYYYK', 'KYYYYYYYYK', 'KKKKKKKKKK'],
    { K, Y: '#f2c14e', O: '#c99422' },
  ],
  presse: [
    ['...KKK...', '.KKGGGKK.', '.KMKKKMK.', '.KMWWWMK.', '.KMWLWMK.', '.KMWWWMK.', '.KMWLWMK.', '.KMWWWMK.', '.KKKKKKK.'],
    { K, G: '#a0a6ad', M: '#8b5a2b', W: '#f6f6f0', L: '#7d8796' },
  ],
  recherche: [
    ['..KKKK....', '.KBGGBK...', 'KGBBGGBK..', 'KBBGBBBK..', 'KBGGBBGK..', '.KBBBGK...', '..KKKKMK..', '......KMK.', '.......KMK', '........KK'],
    { K, B: '#3a86ff', G: '#46c35a', M: '#8b5a2b' },
  ],
  appareil: [
    ['...KKK....', 'KKKWWWKKKK', 'KDDDDDDDDK', 'KDDKKKKDDK', 'KDKBBBBKDK', 'KDKBWBBKDK', 'KDKBBBBKDK', 'KDDKKKKDDK', 'KDDDDDDDRK', 'KKKKKKKKKK'],
    { K, D: '#3b3f4f', W: '#ffffff', B: '#7fa7d9', R: '#ff3b3b' },
  ],
  image: [
    ['KKKKKKKKKK', 'KOOOOOOOOK', 'KOSSSSSSOK', 'KOSSSSYSOK', 'KOSSSSSSOK', 'KOSGSSSSOK', 'KOGGGSGSOK', 'KOGGGGGGOK', 'KOOOOOOOOK', 'KKKKKKKKKK'],
    { K, O: '#c9a227', S: '#9fd3ff', Y: '#ffe14d', G: '#46c35a' },
  ],
  rire: [
    ['..KKKKK..', '.KYYYYYK.', 'KYKYYYKYK', 'KBYYYYYBK', 'KYKKKKKYK', 'KYKRRRKYK', '.KYKKKYK.', '..KKKKK..'],
    { K, Y: '#ffe14d', B: '#7fd0ff', R: '#e3342f' },
  ],
  sourire: [
    ['..KKKKK..', '.KYYYYYK.', 'KYKYYYKYK', 'KYYYYYYYK', 'KYKYYYKYK', 'KYYKKKYYK', '.KYYYYYK.', '..KKKKK..'],
    { K, Y: '#ffe14d' },
  ],
  fete: [
    ['.....R.Y.', '..B....K.', '.......KK', '......KYK', '.....KYRK', '....KRYK.', '...KYRK..', '..KRYK...', '.KYRK....', 'KKKK.....'],
    { K, R: '#e3342f', Y: '#ffd23f', B: '#3a86ff' },
  ],
  attente: [
    ['KKKKKKK', 'KWWWWWK', '.KWWWK.', '..KWK..', '.KWYWK.', 'KWYYYWK', 'KKKKKKK'],
    { K, W: '#e8f4ff', Y: '#f2c14e' },
  ],
};
const cacheIcones = new Map();
export function icone(nom) {
  let c = cacheIcones.get(nom);
  if (c) return c;
  const def = ICONES_DEF[nom] || ICONES_DEF.engrenage;
  c = spriteTexte(def[0], def[1]);
  cacheIcones.set(nom, c);
  return c;
}

// Outil du protocole → icône pixel.
export function iconeOutil(nom) {
  const n = String(nom || '');
  const b = n.toLowerCase();
  if (b === 'mcp__qg__capturer_page') return 'appareil';
  if (b === 'mcp__qg__telecharger_image') return 'image';
  if (b.startsWith('mcp__')) {
    if (/roblox|studio|rojo/.test(b)) return 'brique';
    if (/unreal|ue5|ue_|unrealengine/.test(b)) return 'clap';
    if (/web|fetch|browser|chrome/.test(b)) return 'globe';
    return 'engrenage';
  }
  if (n === 'Read' || n === 'NotebookRead') return 'page';
  if (n === 'Edit' || n === 'Write' || n === 'MultiEdit' || n === 'NotebookEdit') return 'crayon';
  if (n === 'Bash' || n === 'PowerShell' || n === 'BashOutput' || n === 'KillShell') return 'terminal';
  if (n === 'Grep' || n === 'Glob' || n === 'LS') return 'loupe';
  if (n === 'WebSearch') return 'recherche';
  if (n === 'WebFetch') return 'globe';
  return 'engrenage';
}
export function estOutilMachine(nom) {
  const b = String(nom || '').toLowerCase();
  return b.startsWith('mcp__') && /roblox|studio|rojo|unreal|ue5/.test(b);
}

// ---------- marques au-dessus des têtes ----------
const MARQUES_DEF = {
  '!': [['.OO.', 'OOOO', 'OOOO', 'OOOO', 'OOOO', '.OO.', '.OO.', '....', '.OO.', 'OOOO', '.OO.'], { O: '#ff9a1f' }],
  '?': [['.RRRRR.', 'RRR.RRR', 'RR...RR', '....RRR', '...RRR.', '..RRR..', '..RR...', '.......', '..RR...', '..RR...'], { R: '#ff3b3b' }],
  '?o': [['.RRRRR.', 'RRR.RRR', 'RR...RR', '....RRR', '...RRR.', '..RRR..', '..RR...', '.......', '..RR...', '..RR...'], { R: '#ff9a1f' }],
  ok: [['.........GG', '........GGG', '.......GGG.', 'GG....GGG..', 'GGG..GGG...', '.GGGGGG....', '..GGGG.....', '...GG......'], { G: '#3ddc5a' }],
  ko: [['RR.....RR', 'RRR...RRR', '.RRR.RRR.', '..RRRRR..', '...RRR...', '..RRRRR..', '.RRR.RRR.', 'RRR...RRR', 'RR.....RR'], { R: '#ff3b3b' }],
  nuage: [
    ['......GGGG..........', '....GGGGGGGG..GGG...', '..GGGGGGGGGGGGGGGG..', '.GGGGGGGGGGGGGGGGGG.', 'GGGGGGGGGGGGGGGGGGGG', 'GGGGGGGGGGGGGGGGGGGG', '.DDDDDDDDDDDDDDDDDD.', '..DDDDD..DDDD.DDD...', '...B.....B.....B....', '.....B.....B.....B..'],
    { G: '#a3a9b2', D: '#737a84', B: '#7fa7d9' },
  ],
};
const cacheMarques = new Map();
export function marque(nom) {
  let c = cacheMarques.get(nom);
  if (c) return c;
  const d = MARQUES_DEF[nom];
  if (!d) return null;
  c = spriteTexte(d[0], d[1], true);
  cacheMarques.set(nom, c);
  return c;
}

// ---------- ampoules d'effort ----------
const cacheAmpoules = new Map();
export function ampoules(n) {
  let c = cacheAmpoules.get(n);
  if (c) return c;
  const b = ['.YYY.', 'YWYYY', 'YYYYY', 'YYYYO', '.YYO.', '.GGG.', '.HHH.', '..H..'];
  const pal = { Y: '#ffe14d', W: '#ffffff', O: '#f0b400', G: '#b9bec7', H: '#7d838d' };
  const w = n * 6 - 1;
  c = creerCanvas(w + 2, 10);
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    for (let y = 0; y < b.length; y++) {
      for (let x = 0; x < 5; x++) {
        const col = pal[b[y][x]];
        if (col) {
          g.fillStyle = col;
          g.fillRect(1 + i * 6 + x, 1 + y, 1, 1);
        }
      }
    }
  }
  contourner(c);
  cacheAmpoules.set(n, c);
  return c;
}

// ---------- étiquette sous les pieds ----------
const cacheEtiq = new Map();
export function etiquette(texte, couleur, largeurMax = 74) {
  const cle = texte + '|' + couleur + '|' + largeurMax;
  let c = cacheEtiq.get(cle);
  if (c) return c;
  const t = tronquer(texte, largeurMax);
  const tw = mesurer(t);
  const w = tw + 9;
  const h = 12;
  c = creerCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#0d0f18';
  g.fillRect(1, 0, w - 2, h);
  g.fillRect(0, 1, w, h - 2);
  g.fillStyle = '#23283b';
  g.fillRect(1, 1, w - 2, h - 2);
  g.fillStyle = couleur;
  g.fillRect(1, 1, 3, h - 2);
  g.drawImage(texteCanvas(t, '#ffffff'), 6, 2);
  if (cacheEtiq.size > 600) cacheEtiq.clear();
  cacheEtiq.set(cle, c);
  return c;
}

// ---------- bulles ----------
const cacheBulles = new Map();
// opts : { texte, icone, couleur, max, lignes }
export function bulle(opts) {
  const cle = JSON.stringify(opts);
  let c = cacheBulles.get(cle);
  if (c) return c;
  const max = opts.max || 104;
  const ic = opts.icone ? icone(opts.icone) : null;
  const icw = ic ? ic.width + 3 : 0;
  const lignes = opts.texte ? couperLignes(opts.texte, max - icw, opts.lignes || 2) : [];
  let tw = 0;
  for (const l of lignes) tw = Math.max(tw, mesurer(l));
  const th = lignes.length ? lignes.length * HAUTEUR_LIGNE - 1 : 0;
  const ih = ic ? ic.height : 0;
  const innerW = icw + tw;
  const innerH = Math.max(th, ih, 7);
  const w = innerW + 10;
  const h = innerH + 8;
  const H = h + 4;
  c = creerCanvas(w, H);
  const g = c.getContext('2d');
  const fond = opts.fond || '#ffffff';
  g.fillStyle = CONTOUR;
  g.fillRect(2, 0, w - 4, h);
  g.fillRect(1, 1, w - 2, h - 2);
  g.fillRect(0, 2, w, h - 4);
  g.fillStyle = fond;
  g.fillRect(2, 1, w - 4, h - 2);
  g.fillRect(1, 2, w - 2, h - 4);
  // pointe
  const px = Math.floor(w / 2) - 3;
  g.fillStyle = CONTOUR;
  g.fillRect(px, h - 1, 7, 1);
  g.fillRect(px + 1, h, 5, 1);
  g.fillRect(px + 2, h + 1, 3, 1);
  g.fillRect(px + 3, h + 2, 1, 1);
  g.fillStyle = fond;
  g.fillRect(px + 1, h - 2, 5, 1);
  g.fillRect(px + 2, h - 1, 3, 1);
  g.fillRect(px + 3, h, 1, 1);
  // ombre douce sous la bulle
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(2, h - 2, px - 2, 1);
  let x = 5;
  if (ic) {
    g.drawImage(ic, x, 4 + Math.floor((innerH - ih) / 2));
    x += icw;
  }
  const y0 = 4 + Math.floor((innerH - th) / 2);
  lignes.forEach((l, i) => g.drawImage(texteCanvas(l, opts.couleur || '#15151f'), x, y0 + i * HAUTEUR_LIGNE));
  if (cacheBulles.size > 500) cacheBulles.clear();
  cacheBulles.set(cle, c);
  return c;
}

// Bulle de pensée : nuage à bords ondulés et petites bulles en guise de pointe.
export function bullePensee(opts) {
  const cle = 'pensee|' + JSON.stringify(opts);
  let c = cacheBulles.get(cle);
  if (c) return c;
  const max = opts.max || 112;
  const ic = opts.icone ? icone(opts.icone) : null;
  const icw = ic ? ic.width + 3 : 0;
  const lignes = opts.texte ? couperLignes(opts.texte, max - icw, opts.lignes || 2) : [];
  let tw = 0;
  for (const l of lignes) tw = Math.max(tw, mesurer(l));
  const th = lignes.length ? lignes.length * HAUTEUR_LIGNE - 1 : 0;
  const innerH = Math.max(th, ic ? ic.height : 0, 7);
  const w = icw + tw + 14;
  const h = innerH + 10;
  c = creerCanvas(w + 4, h + 14);
  const g = c.getContext('2d');
  const fond = opts.fond || '#f4f6fb';
  const disque = (cx, cy, r) => {
    g.fillStyle = fond;
    for (let y = -r; y <= r; y++) {
      const dx = Math.floor(Math.sqrt(r * r - y * y + 0.5));
      g.fillRect(Math.round(cx - dx), Math.round(cy + y), dx * 2 + 1, 1);
    }
  };
  g.fillStyle = fond;
  g.fillRect(4, 4, w - 4, h - 4);
  for (let x = 6; x < w - 2; x += 7) {
    disque(x, 4, 3);
    disque(x + 3, h, 3);
  }
  disque(3, Math.floor(h / 2) + 1, 3);
  disque(w, Math.floor(h / 2) + 1, 3);
  disque(Math.floor(w / 2) - 4, h + 6, 2);
  disque(Math.floor(w / 2) - 8, h + 10, 1);
  contourner(c);
  let x = 7;
  if (ic) {
    g.drawImage(ic, x, 5 + Math.floor((innerH - ic.height) / 2));
    x += icw;
  }
  const y0 = 5 + Math.floor((innerH - th) / 2);
  lignes.forEach((l, i) => g.drawImage(texteCanvas(l, opts.couleur || '#3b4258'), x, y0 + i * HAUTEUR_LIGNE));
  if (cacheBulles.size > 500) cacheBulles.clear();
  cacheBulles.set(cle, c);
  return c;
}

// Pancarte suspendue (salle de pause) : bandeau titre + quelques lignes.
export function pancarte(titre, lignes, opts = {}) {
  const cle = 'pancarte|' + titre + '|' + lignes.join('\n') + '|' + (opts.icone || '');
  let c = cacheBulles.get(cle);
  if (c) return c;
  const max = opts.max || 160;
  const ic = opts.icone ? icone(opts.icone) : null;
  const lis = lignes.map((l) => tronquer(l, max));
  let tw = mesurer(titre) + (ic ? ic.width + 3 : 0);
  for (const l of lis) tw = Math.max(tw, mesurer(l));
  const w = tw + 14;
  const hTitre = Math.max(HAUTEUR_LIGNE + 2, ic ? ic.height + 2 : 0);
  const h = 4 + hTitre + 2 + lis.length * HAUTEUR_LIGNE + 3;
  const haut = 6; // ficelles
  c = creerCanvas(w, h + haut);
  const g = c.getContext('2d');
  g.fillStyle = CONTOUR;
  g.fillRect(6, 0, 1, haut);
  g.fillRect(w - 7, 0, 1, haut);
  g.fillRect(0, haut, w, h);
  g.fillStyle = '#b07a3e';
  g.fillRect(1, haut + 1, w - 2, h - 2);
  g.fillStyle = '#fff6df';
  g.fillRect(3, haut + 3, w - 6, h - 6);
  g.fillStyle = '#ff9a1f';
  g.fillRect(3, haut + 3, w - 6, hTitre);
  let x = 6;
  if (ic) {
    g.drawImage(ic, x, haut + 3 + Math.floor((hTitre - ic.height) / 2));
    x += ic.width + 3;
  }
  g.drawImage(texteCanvas(titre, '#ffffff'), x, haut + 3 + Math.floor((hTitre - HAUTEUR_LIGNE) / 2) + 1);
  lis.forEach((l, i) => g.drawImage(texteCanvas(l, '#3a2a14'), 7, haut + 3 + hTitre + 2 + i * HAUTEUR_LIGNE));
  if (cacheBulles.size > 500) cacheBulles.clear();
  cacheBulles.set(cle, c);
  return c;
}

export function bullePoints(n) {
  const cle = '…' + n;
  let c = cacheBulles.get(cle);
  if (c) return c;
  const base = bulle({ texte: 'ooo', max: 40 });
  c = creerCanvas(base.width, base.height);
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  const h = base.height - 4;
  g.fillStyle = '#ffffff';
  g.fillRect(3, 3, base.width - 6, h - 6);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = i < n ? '#15151f' : '#c9ccd4';
    g.fillRect(5 + i * 5, Math.floor(h / 2) - 1, 2, 2);
  }
  cacheBulles.set(cle, c);
  return c;
}
