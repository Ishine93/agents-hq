// Décor procédural : sols, murs, mobilier, cloisons, tableau blanc, ascenseur, horloge.
// Coordonnées « art » : 1 unité = 1 pixel du pixel art (avant zoom de la caméra).
import {
  creerCanvas, poly, projeteur, prisme, quadY, quadX, quadZ, pixel, contourner, nuance, melange,
  hacher, aleatoire, modele, CONTOUR,
} from './sprites.js';
import { W, H, HW } from './carte.js';
import { texteCanvas, tronquer, mesurer, dessinerTexte } from './police.js';
import { langueCourante } from './i18n.js';

// Texte d'une enseigne peinte, en français ou en anglais. La langue est lue quand les murs sont peints :
// construireCouche (non mise en cache) repeint tout à chaque changement d'étage.
const enseigne = (fr, en) => (langueCourante() === 'en' ? en : fr);

export const MARGE = 16;
export const OX = H * 32 + MARGE;
export const OY = HW + MARGE;
export const LARGEUR_MONDE = (W + H) * 32 + 2 * MARGE;
export const HAUTEUR_MONDE = (W + H) * 16 + HW + 2 * MARGE + 14;

export function versArt(gx, gy) {
  return [OX + (gx - gy) * 32, OY + (gx + gy) * 16];
}
export function coinTuile(x, y) {
  return [OX + (x - y) * 32 - 32, OY + (x + y) * 16];
}

// ---------- thèmes ----------
const THEMES = {
  roblox: {
    sols: { def: ['clous', '#a2a7ad'], bureau1: ['clous', '#bcc0c4'], bureau2: ['clous', '#bcc0c4'], machine: ['clous', '#8c9298'],
      pause: ['clous', '#5fae5a'], reunion: ['clous', '#d3b77b'], dg: ['clous', '#3f7fd6'] },
    mur: 'briques', dalle: '#5a5f66', bureau: '#e9e6dd', chaise: null, canape: '#2f6fde', canapeEquipe: '#e3342f', table: '#d8d3c4',
  },
  unreal: {
    sols: { def: ['moquette', '#272b42'], bureau1: ['moquette', '#30355a'], bureau2: ['moquette', '#30355a'], machine: ['moquette', '#1d2034'],
      pause: ['moquette', '#1f3b42'], reunion: ['moquette', '#35294d'], dg: ['moquette', '#1b2c58'] },
    mur: 'neon', dalle: '#14162a', bureau: '#3b4058', chaise: '#1f2230', canape: '#3b3570', canapeEquipe: '#1f6f8a', table: '#2f3346',
  },
  atelier3d: {
    sols: { def: ['beton', '#b6b1a6'], bureau1: ['beton', '#c5c0b5'], bureau2: ['beton', '#c5c0b5'], machine: ['beton', '#a39d90'],
      pause: ['planches', '#c49a6c'], reunion: ['planches', '#b88b5d'], dg: ['beton', '#9ea8a3'] },
    mur: 'atelier', dalle: '#6d6a63', bureau: '#b98a57', chaise: '#3d4450', canape: '#7a5c3a', canapeEquipe: '#2f6fde', table: '#a9794a',
  },
  etudes: {
    sols: { def: ['planches', '#dab37d'], bureau1: ['planches', '#d1a66c'], bureau2: ['planches', '#d1a66c'], machine: ['planches', '#c99a5e'],
      pause: ['lino', '#eadfc4'], reunion: ['planches', '#c79a62'], dg: ['moquette', '#3e6b4a'] },
    mur: 'liege', dalle: '#7b5a36', bureau: '#c99c66', chaise: '#4a5a4a', canape: '#5a7d52', canapeEquipe: '#9a4a2a', table: '#b9895a',
  },
  serveur: {
    sols: { def: ['metal', '#5c626a'], bureau1: ['metal', '#666d76'], bureau2: ['metal', '#666d76'], machine: ['metal', '#4f555c'],
      pause: ['metal', '#4d6a6a'], reunion: ['metal', '#585e6a'], dg: ['metal', '#4a5363'] },
    mur: 'metal', dalle: '#2a2e33', bureau: '#6d737c', chaise: '#2b2f36', canape: '#3f4a55', canapeEquipe: '#2b8a5a', table: '#5d636c',
  },
  direction: {
    sols: { def: ['parquet', '#a96b3b'], bureau1: ['parquet', '#b27647'], bureau2: ['parquet', '#b27647'], machine: ['parquet', '#9a6036'],
      pause: ['lino', '#ebe3cf'], reunion: ['parquet', '#9d6034'], dg: ['moquette', '#7c2130'] },
    mur: 'boiseries', dalle: '#4a2a14', bureau: '#7a4a2a', chaise: '#5a2a1a', canape: '#6b1f2a', canapeEquipe: '#2a4a6b', table: '#6e3f20',
  },
  hall: {
    sols: { def: ['marbre', '#ebebf0'], bureau1: ['marbre', '#e4e6ee'], bureau2: ['marbre', '#e4e6ee'], machine: ['marbre', '#dfe2ea'],
      pause: ['lino', '#d8e8ee'], reunion: ['marbre', '#e2e2ea'], dg: ['moquette', '#2c4a7a'] },
    mur: 'hall', dalle: '#5b6478', bureau: '#e1e5ec', chaise: '#2c4a7a', canape: '#2a9d8f', canapeEquipe: '#e07a2a', table: '#cfd5df',
  },
  bac: {
    sols: { def: ['damier', '#f5c400'] },
    mur: 'chantier', dalle: '#2a2a2a', bureau: '#d9d9d9', chaise: '#1d1d1d', canape: '#1d1d1d', canapeEquipe: '#f5c400', table: '#cfcfcf',
  },
  // Salle de pause : bois chaud, moquette violette au salon télé, sol de salle d'arcade, couleurs vives.
  pause: {
    sols: { def: ['parquet', '#b97a45'], lobby: ['lino', '#e9dcc0'], cafe: ['lino', '#e9dcc0'], tele: ['moquette', '#5d4280'],
      billard: ['moquette', '#7d2c36'], babyfoot: ['clous', '#e8962e'], arcade: ['arcade', '#1e2040'], pingpong: ['lino', '#4f86c6'],
      poufs: ['moquette', '#2f7a68'] },
    mur: 'pause', dalle: '#5a3a24', bureau: '#c99c66', chaise: '#e76f51', canape: '#e76f51', canapeEquipe: '#2a9d8f', table: '#8d5a34',
  },
  // Salle de repos : bleu nuit, couleurs éteintes.
  repos: {
    sols: { def: ['moquette', '#2a2d55'], lobby: ['lino', '#3a3e66'], allee: ['moquette', '#303462'] },
    mur: 'nuit', dalle: '#17192f', bureau: '#4a4e7a', chaise: '#3a3e66', canape: '#4b4f8a', canapeEquipe: '#6b5b9a', table: '#4a4e7a',
  },
};
export function theme(type) {
  return THEMES[type] || THEMES.roblox;
}

// ---------- tuiles de sol ----------
function losangeTuile(g, col) {
  poly(g, [[32, 0], [64, 16], [32, 32], [0, 16]], col);
}
function bordsBas(g, col) {
  g.fillStyle = col;
  for (let r = 16; r <= 30; r++) {
    const hw = 62 - 2 * r;
    g.fillRect(32 - hw, r, 2, 1);
    g.fillRect(32 + hw - 2, r, 2, 1);
  }
}
function dansTuile(x, y) {
  // (x, y) pixel dans le losange canonique ?
  if (y < 0 || y > 30) return false;
  const hw = y <= 15 ? 2 * y + 2 : 62 - 2 * y;
  return x >= 32 - hw && x <= 32 + hw - 1;
}
function ligneTuile(g, x0, y0, n, sens, col) {
  // ligne 2:1 de n pas ; sens +1 = vers la droite, -1 = vers la gauche (en descendant)
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 2; k++) {
      const x = x0 + sens * (2 * i + k);
      const y = y0 + i;
      if (dansTuile(x, y)) g.fillRect(x, y, 1, 1);
    }
  }
}

const cacheTuiles = new Map();
function tuile(typeTheme, zone, x, y) {
  const T = theme(typeTheme);
  const [motif, base] = T.sols[zone] || T.sols.def;
  const parite = (x + y) & 1;
  const variante = hacher(x * 31 + y * 17 + 7) % 4;
  const cle = typeTheme + '|' + motif + '|' + base + '|' + parite + '|' + variante + '|' + (motif === 'parquet' ? parite : '');
  let c = cacheTuiles.get(cle);
  if (c) return c;
  c = creerCanvas(64, 32);
  const g = c.getContext('2d');
  const rnd = aleatoire(hacher(cle));
  let col = base;
  if (motif === 'damier') col = parite ? '#1e1e1e' : '#f5c400';
  if (motif === 'marbre') col = parite ? nuance(base, -0.1) : base;
  losangeTuile(g, col);
  const fonce = nuance(col, -0.12);
  const clair = nuance(col, 0.12);
  if (motif === 'clous') {
    const plots = [[32, 8], [48, 16], [16, 16], [32, 24]];
    for (const [cx, cy] of plots) {
      g.fillStyle = nuance(col, -0.22);
      g.fillRect(cx - 3, cy + 1, 7, 1);
      g.fillRect(cx - 2, cy + 2, 5, 1);
      g.fillStyle = nuance(col, 0.16);
      g.fillRect(cx - 2, cy - 2, 5, 1);
      g.fillRect(cx - 3, cy - 1, 7, 2);
      g.fillStyle = nuance(col, 0.32);
      g.fillRect(cx - 2, cy - 1, 2, 1);
    }
  } else if (motif === 'moquette') {
    for (let i = 0; i < 70; i++) {
      const px = Math.floor(rnd() * 64);
      const py = Math.floor(rnd() * 31);
      if (!dansTuile(px, py)) continue;
      g.fillStyle = rnd() < 0.5 ? fonce : clair;
      g.fillRect(px, py, 1, 1);
    }
  } else if (motif === 'beton') {
    for (let i = 0; i < 45; i++) {
      const px = Math.floor(rnd() * 64);
      const py = Math.floor(rnd() * 31);
      if (!dansTuile(px, py)) continue;
      g.fillStyle = rnd() < 0.6 ? fonce : clair;
      g.fillRect(px, py, rnd() < 0.3 ? 2 : 1, 1);
    }
    if (variante === 0) ligneTuile(g, 20, 10, 6, 1, nuance(col, -0.2));
  } else if (motif === 'planches' || motif === 'parquet') {
    const versX = motif === 'planches' ? true : parite === 0;
    const teintesBois = [col, nuance(col, -0.08), nuance(col, 0.07), nuance(col, -0.14)];
    // bandes de planches
    for (let b = 0; b < 4; b++) {
      const t = teintesBois[(b + variante) % 4];
      const v0 = b / 4;
      const v1 = (b + 1) / 4;
      const Pt = projeteur(32, 0);
      if (versX) poly(g, [Pt(0, v0), Pt(1, v0), Pt(1, v1), Pt(0, v1)], t);
      else poly(g, [Pt(v0, 0), Pt(v1, 0), Pt(v1, 1), Pt(v0, 1)], t);
    }
    const Pt = projeteur(32, 0);
    for (let b = 1; b < 4; b++) {
      const a = Pt(versX ? 0 : b / 4, versX ? b / 4 : 0);
      ligneTuile(g, a[0], a[1], 16, versX ? 1 : -1, nuance(col, -0.25));
    }
  } else if (motif === 'metal') {
    const Pt = projeteur(32, 0);
    const a = Pt(0.5, 0);
    ligneTuile(g, a[0] - 1, a[1], 16, -1, nuance(col, -0.25));
    const b = Pt(0, 0.5);
    ligneTuile(g, b[0], b[1], 16, 1, nuance(col, -0.25));
    for (const [u, v] of [[0.12, 0.12], [0.62, 0.12], [0.12, 0.62], [0.62, 0.62]]) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pixel(g, Pt(u + i * 0.1, v + j * 0.1), nuance(col, -0.18), 1, 1);
    }
    pixel(g, Pt(0.06, 0.06), clair, 2, 1);
  } else if (motif === 'marbre') {
    if (variante < 2) {
      const sx = 10 + Math.floor(rnd() * 30);
      ligneTuile(g, sx, 8 + Math.floor(rnd() * 6), 8, rnd() < 0.5 ? 1 : -1, nuance(col, -0.12));
    }
  } else if (motif === 'lino') {
    const Pt = projeteur(32, 0);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        if ((i + j) % 2) poly(g, [Pt(i / 2, j / 2), Pt((i + 1) / 2, j / 2), Pt((i + 1) / 2, (j + 1) / 2), Pt(i / 2, (j + 1) / 2)], nuance(col, -0.1));
      }
    }
  } else if (motif === 'arcade') {
    // moquette de salle d'arcade : confettis fluo sur fond sombre
    const fluo = ['#3df2ff', '#ff4fd8', '#ffe14d', '#7dff6a'];
    for (let i = 0; i < 26; i++) {
      const px = Math.floor(rnd() * 64);
      const py = Math.floor(rnd() * 31);
      if (!dansTuile(px, py)) continue;
      g.fillStyle = i % 3 ? nuance(col, 0.1) : fluo[Math.floor(rnd() * fluo.length)];
      g.fillRect(px, py, rnd() < 0.4 ? 2 : 1, 1);
    }
  } else if (motif === 'damier') {
    if (!parite) {
      for (let i = 0; i < 12; i++) {
        const px = Math.floor(rnd() * 64);
        const py = Math.floor(rnd() * 31);
        if (dansTuile(px, py)) pixel(g, [px, py], nuance(col, -0.08));
      }
    }
  }
  bordsBas(g, nuance(col, motif === 'damier' && parite ? 0.12 : -0.2));
  cacheTuiles.set(cle, c);
  return c;
}

// ---------- murs ----------
function murPlat(typeTheme, longueur, cote, etage) {
  const T = theme(typeTheme);
  const c = creerCanvas(longueur, HW);
  const g = c.getContext('2d');
  const rnd = aleatoire(hacher(typeTheme + cote));
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  switch (T.mur) {
    case 'briques': {
      const cols = ['#e3342f', '#2f6fde', '#f6c21c', '#3aa655', '#e3342f', '#2f6fde'];
      R(0, 0, longueur, HW, '#3a3d44');
      for (let row = 0; row * 8 < HW; row++) {
        const dec = row % 2 ? 8 : 0;
        for (let bx = -dec; bx < longueur; bx += 16) {
          const col = cols[Math.floor(rnd() * cols.length)];
          R(bx + 1, row * 8 + 1, 15, 7, col);
          R(bx + 1, row * 8 + 1, 15, 1, nuance(col, 0.3));
          R(bx + 1, row * 8 + 7, 15, 1, nuance(col, -0.25));
          R(bx + 4, row * 8 + 2, 2, 1, nuance(col, 0.45));
        }
      }
      R(0, HW - 6, longueur, 6, '#4a4e57');
      R(0, HW - 6, longueur, 1, '#6a6f7a');
      break;
    }
    case 'neon': {
      R(0, 0, longueur, HW, '#1c1f31');
      for (let x = 0; x < longueur; x += 32) R(x, 0, 1, HW, '#141628');
      for (let x = 16; x < longueur; x += 32) R(x, 40, 1, HW - 52, '#232741');
      R(0, HW - 12, longueur, 12, '#111322');
      R(0, HW - 12, longueur, 1, '#2a2f4a');
      R(0, 18, longueur, 1, 'rgba(61,242,255,0.18)');
      R(0, 19, longueur, 1, 'rgba(61,242,255,0.35)');
      R(0, 20, longueur, 2, '#8ff8ff');
      R(0, 22, longueur, 1, 'rgba(61,242,255,0.45)');
      R(0, 23, longueur, 2, 'rgba(61,242,255,0.18)');
      R(0, HW - 13, longueur, 1, '#2fb6d9');
      break;
    }
    case 'atelier': {
      R(0, 0, longueur, HW, '#c8c7c1');
      for (let x = 0; x < longueur; x += 32) R(x, 0, 1, HW, '#adaba4');
      for (let y = 26; y < HW; y += 26) R(0, y, longueur, 1, '#b5b3ad');
      for (let x = 0; x < longueur; x += 32) {
        R(x + 3, 3, 1, 1, '#8d8b85');
        R(x + 28, 3, 1, 1, '#8d8b85');
      }
      for (let x = 0; x < longueur; x++) {
        for (let y = HW - 9; y < HW - 2; y++) {
          g.fillStyle = (x + y) % 8 < 4 ? '#f2c21b' : '#1f1f1f';
          g.fillRect(x, y, 1, 1);
        }
      }
      break;
    }
    case 'liege': {
      R(0, 0, longueur, HW, '#ecdcb8');
      for (let x = 0; x < longueur; x += 6) R(x, 0, 1, HW - 24, '#e4d2aa');
      R(0, HW - 24, longueur, 24, '#a8794d');
      R(0, HW - 25, longueur, 2, '#7c5532');
      for (let x = 4; x < longueur; x += 20) R(x, HW - 20, 14, 16, '#9a6d43');
      break;
    }
    case 'metal': {
      R(0, 0, longueur, HW, '#4a5059');
      for (let y = 0; y < HW; y += 4) {
        R(0, y, longueur, 1, '#555c66');
        R(0, y + 2, longueur, 1, '#40464e');
      }
      R(0, 8, longueur, 7, '#1a1c20');
      const cables = ['#e3342f', '#2f6fde', '#f6c21c', '#3aa655'];
      cables.forEach((cc, i) => R(0, 9 + i * 1.5, longueur, 1, cc));
      R(0, HW - 8, longueur, 8, '#2c3036');
      break;
    }
    case 'boiseries': {
      R(0, 0, longueur, HW, '#efe3cb');
      for (let x = 0; x < longueur; x += 8) R(x, 0, 2, HW - 34, '#e7d8ba');
      R(0, HW - 34, longueur, 34, '#7b4a2a');
      R(0, HW - 35, longueur, 2, '#c9a227');
      for (let x = 3; x < longueur; x += 24) {
        R(x, HW - 29, 18, 24, '#6c3f22');
        R(x + 1, HW - 28, 16, 22, '#86522f');
      }
      R(0, 0, longueur, 3, '#d8c8a8');
      break;
    }
    case 'hall': {
      R(0, 0, longueur, HW, '#e9eef6');
      R(0, HW - 30, longueur, 4, '#2f6fde');
      R(0, HW - 26, longueur, 26, '#cfd8e6');
      for (let x = 0; x < longueur; x += 32) R(x, HW - 26, 1, 26, '#b9c4d6');
      break;
    }
    case 'pause': {
      // crème à larges rayures, soubassement turquoise et cimaise orange
      R(0, 0, longueur, HW, '#f3d9b1');
      for (let x = 0; x < longueur; x += 24) R(x, 0, 12, HW - 30, '#eecd9c');
      R(0, HW - 30, longueur, 30, '#2a9d8f');
      R(0, HW - 31, longueur, 3, '#e76f51');
      R(0, HW - 31, longueur, 1, '#f4a261');
      for (let x = 6; x < longueur; x += 16) R(x, HW - 26, 1, 22, '#23887c');
      R(0, HW - 4, longueur, 4, '#1f6f66');
      break;
    }
    case 'nuit': {
      // bleu nuit étoilé, plinthe sombre
      R(0, 0, longueur, HW, '#1f2350');
      for (let y = 0; y < HW - 24; y += 6) R(0, y, longueur, 1, '#22265a');
      for (let i = 0; i < longueur / 7; i++) {
        const x = Math.floor(rnd() * longueur);
        const y = 2 + Math.floor(rnd() * (HW - 30));
        g.fillStyle = rnd() < 0.25 ? '#fff4c4' : rnd() < 0.5 ? '#aab4ff' : '#5c66b0';
        g.fillRect(x, y, 1, 1);
      }
      R(0, HW - 22, longueur, 22, '#262a5c');
      R(0, HW - 23, longueur, 1, '#3c4280');
      for (let x = 10; x < longueur; x += 20) R(x, HW - 18, 12, 12, '#2c3066');
      break;
    }
    default: {
      R(0, 0, longueur, HW, '#9c9c97');
      for (let i = 0; i < longueur * 2; i++) {
        g.fillStyle = rnd() < 0.5 ? '#8f8f8a' : '#a9a9a3';
        g.fillRect(Math.floor(rnd() * longueur), Math.floor(rnd() * HW), 1, 1);
      }
      for (let x = 0; x < longueur; x++) {
        for (let y = HW - 12; y < HW - 2; y++) {
          g.fillStyle = (x + y) % 10 < 5 ? '#f5c400' : '#1d1d1d';
          g.fillRect(x, y, 1, 1);
        }
      }
    }
  }
  if (typeTheme === 'pause' || typeTheme === 'repos') {
    if (cote === 'droite') decorMurDroitDetente(g, typeTheme, longueur);
    else decorMurGaucheDetente(g, typeTheme, longueur, etage);
  } else if (cote === 'droite') decorMurDroit(g, typeTheme, longueur);
  else decorMurGauche(g, typeTheme, longueur, etage);
  return c;
}

function cadre(g, x, y, w, h, bord = '#2b2b35', fond = '#ffffff') {
  g.fillStyle = CONTOUR;
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = bord;
  g.fillRect(x, y, w, h);
  g.fillStyle = fond;
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
}

function fenetre(g, x, y, w, h, typeTheme) {
  if (typeTheme === 'serveur') {
    cadre(g, x, y + 6, w, h - 12, '#2c3036', '#1a1d22');
    for (let yy = y + 10; yy < y + h - 8; yy += 3) {
      g.fillStyle = '#3d434b';
      g.fillRect(x + 4, yy, w - 8, 1);
    }
    return;
  }
  cadre(g, x, y, w, h, '#e9edf2', '#88c9ff');
  let ciel = ['#7cc4ff', '#a8dbff', '#d2efff'];
  let ville = '#7f8fa6';
  let fenetres = null;
  const nuit = typeTheme === 'unreal' || typeTheme === 'repos';
  if (nuit) {
    ciel = ['#0a1030', '#141f4a', '#22306a'];
    ville = '#0d1124';
    fenetres = '#ffd86b';
  } else if (typeTheme === 'direction') {
    ciel = ['#ff8a5c', '#ffb36b', '#ffd98f'];
    ville = '#4a2f4f';
    fenetres = '#ffe7a6';
  }
  const ih = h - 4;
  for (let i = 0; i < 3; i++) {
    g.fillStyle = ciel[i];
    g.fillRect(x + 2, y + 2 + Math.floor((ih * i) / 3), w - 4, Math.ceil(ih / 3));
  }
  const rnd = aleatoire(hacher(x + typeTheme));
  if (nuit) {
    for (let i = 0; i < 10; i++) {
      g.fillStyle = '#ffffff';
      g.fillRect(x + 3 + Math.floor(rnd() * (w - 6)), y + 3 + Math.floor(rnd() * (ih / 2)), 1, 1);
    }
    if (typeTheme === 'repos') {
      // croissant de lune
      const lx = x + w - 12;
      const ly = y + 8;
      for (let yy = -4; yy <= 4; yy++) {
        const d = Math.round(Math.sqrt(20 - yy * yy));
        g.fillStyle = '#fff1b0';
        g.fillRect(lx - d, ly + yy, d * 2, 1);
      }
      for (let yy = -4; yy <= 3; yy++) {
        const d = Math.round(Math.sqrt(14 - yy * yy));
        g.fillStyle = ciel[0];
        g.fillRect(lx - d + 3, ly + yy - 1, d * 2, 1);
      }
    }
  } else if (typeTheme !== 'direction') {
    g.fillStyle = '#ffffff';
    g.fillRect(x + 8, y + 7, 10, 3);
    g.fillRect(x + 6, y + 8, 14, 2);
    g.fillRect(x + w - 22, y + 11, 9, 2);
  }
  let bx = x + 2;
  while (bx < x + w - 2) {
    const bw = 5 + Math.floor(rnd() * 7);
    const bh = 6 + Math.floor(rnd() * (ih / 2));
    const ww = Math.min(bw, x + w - 2 - bx);
    g.fillStyle = ville;
    g.fillRect(bx, y + h - 2 - bh, ww, bh);
    if (fenetres) {
      for (let yy = y + h - bh; yy < y + h - 3; yy += 3) {
        for (let xx = bx + 1; xx < bx + ww - 1; xx += 2) {
          if (rnd() < 0.4) {
            g.fillStyle = fenetres;
            g.fillRect(xx, yy, 1, 1);
          }
        }
      }
    }
    bx += bw + 1;
  }
  g.fillStyle = '#e9edf2';
  g.fillRect(x + Math.floor(w / 2) - 1, y, 2, h);
  g.fillRect(x, y + Math.floor(h / 2) - 1, w, 2);
}

function affiche(g, x, y, w, h, typeTheme) {
  const txt = (s, cx, cy, col) => g.drawImage(texteCanvas(s, col), Math.round(cx - mesurer(s) / 2), cy);
  switch (typeTheme) {
    case 'roblox': {
      cadre(g, x, y, w, h, '#2b2b35', '#393b44');
      const cx = x + w / 2;
      const cy = y + 12;
      g.fillStyle = '#f0f0f0';
      for (let i = -6; i <= 6; i++) {
        const half = 6 - Math.abs(i);
        g.fillRect(cx + i - 1, cy - half - 1, 2, half * 2 + 2);
      }
      g.fillStyle = '#393b44';
      g.fillRect(cx - 2, cy - 2, 3, 3);
      txt('STUDIO', cx, y + h - 11, '#ffffff');
      break;
    }
    case 'unreal': {
      cadre(g, x, y, w, h, '#0b0c12', '#11131c');
      const cx = x + w / 2;
      for (let a = 0; a < 360; a += 4) {
        const r = 8;
        g.fillStyle = '#e8e8f0';
        g.fillRect(Math.round(cx + Math.cos((a * Math.PI) / 180) * r), Math.round(y + 12 + Math.sin((a * Math.PI) / 180) * r), 1, 1);
      }
      txt('U', cx, y + 9, '#e8e8f0');
      txt(enseigne('RENDU', 'RENDER'), cx, y + h - 11, '#7ff6ff');
      break;
    }
    case 'atelier3d':
      cadre(g, x, y, w, h, '#2b2b35', '#f06a2a');
      txt('3D', x + w / 2, y + 7, '#ffffff');
      txt(enseigne('IMPRESSION', 'PRINTING'), x + w / 2, y + h - 11, '#ffffff');
      break;
    case 'etudes':
      cadre(g, x, y, w, h, '#2b2b35', '#2a5ba8');
      for (let i = 0; i < 4; i++) {
        g.fillStyle = '#8fb4ef';
        g.fillRect(x + 5, y + 6 + i * 5, w - 10, 1);
      }
      g.fillStyle = '#ffffff';
      g.fillRect(x + 8, y + 8, 12, 10);
      g.fillStyle = '#2a5ba8';
      g.fillRect(x + 9, y + 9, 10, 8);
      txt('PLANS', x + w / 2, y + h - 11, '#ffffff');
      break;
    case 'serveur':
      cadre(g, x, y, w, h, '#1d1d1d', '#f5c400');
      txt('!', x + w / 2, y + 5, '#1d1d1d');
      txt(enseigne('SERVEURS', 'SERVERS'), x + w / 2, y + h - 11, '#1d1d1d');
      break;
    case 'direction':
      cadre(g, x, y, w, h, '#c9a227', '#3a1f2a');
      txt(enseigne('QG', 'HQ'), x + w / 2, y + 7, '#f4d35e');
      txt(enseigne('DIRECTION', 'BOARD'), x + w / 2, y + h - 11, '#f4d35e');
      break;
    case 'hall':
      cadre(g, x, y, w, h, '#2f6fde', '#ffffff');
      txt(enseigne('BIENVENUE', 'WELCOME'), x + w / 2, y + h / 2 - 4, '#2f6fde');
      break;
    default:
      cadre(g, x, y, w, h, '#1d1d1d', '#f5c400');
      txt(enseigne('BAC A', 'SAND'), x + w / 2, y + 6, '#1d1d1d');
      txt(enseigne('SABLE', 'BOX'), x + w / 2, y + h - 12, '#1d1d1d');
  }
}

function decorMurDroit(g, typeTheme, longueur) {
  // hall d'ascenseur : enseigne du QG
  enseigneQG(g);
  // bureau du DG : petit tableau
  cadre(g, 100, 22, 26, 20, '#8b5a2b', '#9fd3ff');
  g.fillStyle = '#58a55c';
  g.fillRect(102, 34, 22, 6);
  g.fillStyle = '#f4d35e';
  g.fillRect(115, 26, 4, 4);
  // fenêtres des bureaux fermés
  fenetre(g, 8 * 32 + 12, 14, 72, 38, typeTheme);
  fenetre(g, 11 * 32 + 12, 14, 72, 38, typeTheme);
  // coin machine : affiche du thème
  affiche(g, 14 * 32 + 6, 14, 52, 34, typeTheme);
}

// Plaque du nom de l'étage (mur gauche, à côté de l'ascenseur).
function plaqueEtage(g, etage) {
  const c = (gy) => (H - gy) * 32;
  const x0 = Math.round(c(5.7));
  const x1 = Math.round(c(3.3));
  cadre(g, x0, 20, x1 - x0, 20, '#c9a227', '#1b1e2b');
  const nom = tronquer((etage && etage.nom) || '', x1 - x0 - 8);
  g.drawImage(texteCanvas(nom, '#ffffff'), Math.round((x0 + x1) / 2 - mesurer(nom) / 2), 26);
}

// Enseigne de l'immeuble au-dessus du hall d'ascenseur (mur droit).
function enseigneQG(g) {
  cadre(g, 18, 16, 60, 30, '#1b1e2b', '#23283b');
  const haut = enseigne('QG DES', "AGENTS'");
  const bas = enseigne('AGENTS', 'HQ');
  g.drawImage(texteCanvas(haut, '#f4d35e'), 48 - Math.round(mesurer(haut) / 2), 21);
  g.drawImage(texteCanvas(bas, '#ffffff'), 48 - Math.round(mesurer(bas) / 2), 32);
}

// Texte pixel agrandi ×2 (néons, enseignes).
function texteDouble(g, s, cx, y, col, ombre = null) {
  const t = texteCanvas(s, col, ombre);
  g.drawImage(t, Math.round(cx - t.width), y, t.width * 2, t.height * 2);
}

// Guirlande lumineuse en haut d'un mur (salle de repos).
function guirlande(g, longueur, graine) {
  const cols = ['#ffd98a', '#ff8fb1', '#8fe6ff', '#c9ff8f'];
  for (let x = 0; x < longueur; x++) {
    const y = 7 + Math.round(Math.abs(Math.sin((x + graine) / 20)) * 4);
    g.fillStyle = '#0d0f22';
    g.fillRect(x, y, 1, 1);
    if ((x + graine) % 11 === 0) {
      g.fillStyle = cols[Math.floor((x + graine) / 11) % cols.length];
      g.fillRect(x - 1, y + 1, 3, 3);
      g.fillStyle = '#ffffff';
      g.fillRect(x, y + 1, 1, 1);
    }
  }
}

function etoile(g, cx, cy, col) {
  g.fillStyle = col;
  g.fillRect(cx, cy - 3, 1, 7);
  g.fillRect(cx - 3, cy, 7, 1);
  g.fillRect(cx - 1, cy - 1, 3, 3);
}

// Murs de la salle de pause et de la salle de repos.
function decorMurDroitDetente(g, typeTheme, longueur) {
  enseigneQG(g);
  if (typeTheme === 'pause') {
    // petite affiche « manette » au-dessus de la plante
    cadre(g, 88, 10, 38, 24, '#2b2b35', '#ffd23f');
    g.fillStyle = '#3b3f4f';
    g.fillRect(95, 18, 24, 9);
    g.fillRect(93, 20, 28, 7);
    g.fillStyle = '#ffffff';
    g.fillRect(98, 22, 5, 1);
    g.fillRect(100, 20, 1, 5);
    g.fillStyle = '#e3342f';
    g.fillRect(113, 21, 2, 2);
    g.fillStyle = '#3aa655';
    g.fillRect(116, 23, 2, 2);
    // fenêtre et néon « PAUSE » au-dessus du baby-foot
    fenetre(g, 9 * 32 + 3, 14, 34, 40, typeTheme);
    cadre(g, 10 * 32 + 6, 12, 104, 30, '#3a2a4a', '#251a33');
    texteDouble(g, enseigne('PAUSE', 'BREAK'), 10 * 32 + 58, 20, '#ff5fa2', '#7a1f4f');
    // fronton des bornes d'arcade
    cadre(g, 14 * 32 + 4, 3, 56, 13, '#15151f', '#15151f');
    const hs = 'HI-SCORE';
    g.drawImage(texteCanvas(hs, '#3df2ff'), 15 * 32 - Math.round(mesurer(hs) / 2), 5);
  } else {
    // salle de repos : guirlande, « Chut ! », hublots de nuit et petits cadres étoilés
    guirlande(g, longueur, 3);
    cadre(g, 82, 22, 42, 18, '#c9a227', '#1b1e2b');
    const chut = enseigne('CHUT !', 'SHHH!');
    g.drawImage(texteCanvas(chut, '#ffd98a'), 103 - Math.round(mesurer(chut) / 2), 27);
    for (const x of [5, 9, 13]) fenetre(g, x * 32 + 4, 16, 24, 24, typeTheme);
    for (const x of [7, 11, 15]) {
      cadre(g, x * 32 + 7, 16, 18, 16, '#c9a227', '#2a2e66');
      etoile(g, x * 32 + 16, 24, '#ffe9a0');
    }
  }
}

function decorMurGaucheDetente(g, typeTheme, longueur, etage) {
  const c = (gy) => (H - gy) * 32;
  plaqueEtage(g, etage);
  if (typeTheme === 'pause') {
    // cible de fléchettes au-dessus des poufs
    const cx = Math.round(c(10.6));
    const cy = 30;
    const anneaux = [[11, CONTOUR], [10, '#1d1d1d'], [8, '#e3342f'], [7, '#f4ecd2'], [5, '#3aa655'], [4, '#f4ecd2'], [2, '#e3342f'], [1, '#3aa655']];
    for (const [r, col] of anneaux) {
      for (let y = -r; y <= r; y++) {
        const w = Math.round(Math.sqrt(r * r - y * y + 0.5));
        g.fillStyle = col;
        g.fillRect(cx - w, cy + y, w * 2 + 1, 1);
      }
    }
    for (const [dx, dy] of [[3, -4], [-5, 2]]) {
      g.fillStyle = '#c9a227';
      g.fillRect(cx + dx, cy + dy, 1, 1);
      g.fillStyle = '#e3342f';
      g.fillRect(cx + dx + 1, cy + dy - 1, 2, 1);
    }
    // ardoise du coin café, au-dessus de la machine
    const a0 = Math.round(c(6.95));
    cadre(g, a0, 12, 30, 20, '#8b5a2b', '#2b3a33');
    g.drawImage(texteCanvas('CAFE', '#f4f4ee'), a0 + 15 - Math.round(mesurer('CAFE') / 2), 16);
    g.fillStyle = '#c8d6cf';
    g.fillRect(a0 + 6, 27, 18, 1);
  } else {
    guirlande(g, longueur, 9);
    fenetre(g, Math.round(c(9.5)) - 12, 16, 24, 24, typeTheme);
    const x = Math.round(c(11.5));
    cadre(g, x - 9, 16, 18, 16, '#c9a227', '#2a2e66');
    etoile(g, x, 24, '#ffe9a0');
  }
}

function decorMurGauche(g, typeTheme, longueur, etage) {
  const c = (gy) => (H - gy) * 32; // colonne plate pour une ordonnée de grille
  plaqueEtage(g, etage);
  // affiche « pause »
  const p0 = Math.round(c(11.6));
  cadre(g, p0, 18, 44, 28, '#2b2b35', '#fff4e0');
  g.fillStyle = '#ffffff';
  g.fillRect(p0 + 16, 24, 10, 9);
  g.fillStyle = CONTOUR;
  g.fillRect(p0 + 15, 23, 12, 1);
  g.fillRect(p0 + 15, 33, 12, 1);
  g.fillRect(p0 + 15, 23, 1, 11);
  g.fillRect(p0 + 26, 23, 1, 11);
  g.fillRect(p0 + 27, 26, 2, 1);
  g.fillRect(p0 + 29, 26, 1, 4);
  g.fillRect(p0 + 27, 29, 2, 1);
  g.fillStyle = '#6b3e1f';
  g.fillRect(p0 + 16, 24, 10, 2);
  const pause = enseigne('PAUSE', 'BREAK');
  g.drawImage(texteCanvas(pause, '#c0392b'), p0 + 22 - Math.round(mesurer(pause) / 2), 36);
  // panneau d'affichage
  const n0 = Math.round(c(7.5));
  cadre(g, n0, 20, 40, 26, '#7c5532', '#b07a45');
  const rnd = aleatoire(77);
  for (let i = 0; i < 5; i++) {
    const cols = ['#ffffff', '#fff3a0', '#ffd1dc', '#c8f2ff'];
    const px = n0 + 4 + Math.floor(rnd() * 26);
    const py = 23 + Math.floor(rnd() * 12);
    g.fillStyle = cols[i % 4];
    g.fillRect(px, py, 8, 9);
    g.fillStyle = i % 2 ? '#e3342f' : '#2f6fde';
    g.fillRect(px + 3, py, 2, 1);
  }
}

// Cisaille un dessin « à plat » pour le poser sur un mur isométrique.
// cote 'droite' : colonne u depuis le coin du fond ; 'gauche' : colonne c depuis l'extrémité avant.
export function cisailler(plat, cote, debut, v0 = 0) {
  const w = plat.width;
  const h = plat.height;
  const offs = new Array(w);
  let base;
  if (cote === 'droite') {
    base = Math.floor(debut / 2);
    for (let i = 0; i < w; i++) offs[i] = Math.floor((debut + i) / 2) - base;
  } else {
    const L = H * 32;
    base = Math.floor((L - 1 - (debut + w - 1)) / 2);
    for (let i = 0; i < w; i++) offs[i] = Math.floor((L - 1 - (debut + i)) / 2) - base;
  }
  const span = Math.max(...offs);
  const c = creerCanvas(w, h + span + 1);
  const g = c.getContext('2d');
  for (let i = 0; i < w; i++) g.drawImage(plat, i, 0, 1, h, i, offs[i], 1, h);
  const x = cote === 'droite' ? OX + debut : OX - H * 32 + debut;
  const y = OY + base - HW + 1 + v0;
  return { c, x, y };
}

// ---------- couche statique : sol + murs ----------
export function construireCouche(carte, etage) {
  const T = theme(carte.type);
  const c = creerCanvas(LARGEUR_MONDE, HAUTEUR_MONDE);
  const g = c.getContext('2d');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [tx, ty] = coinTuile(x, y);
      g.drawImage(tuile(carte.type, carte.zones[y][x], x, y), tx, ty);
    }
  }
  // tapis du bureau du DG à la Direction
  const P0 = projeteur(OX, OY);
  if (carte.type === 'direction') {
    poly(g, [P0(3.25, 0.4), P0(6.8, 0.4), P0(6.8, 3.6), P0(3.25, 3.6)], '#c9a227');
    poly(g, [P0(3.4, 0.55), P0(6.65, 0.55), P0(6.65, 3.45), P0(3.4, 3.45)], '#8c2433');
  }
  // tapis des étages de détente (salon télé, coin poufs, allées de la salle de repos)
  for (const tp of carte.tapis || []) {
    poly(g, [P0(tp.x0, tp.y0), P0(tp.x1, tp.y0), P0(tp.x1, tp.y1), P0(tp.x0, tp.y1)], tp.c0);
    poly(g, [P0(tp.x0 + 0.15, tp.y0 + 0.15), P0(tp.x1 - 0.15, tp.y0 + 0.15), P0(tp.x1 - 0.15, tp.y1 - 0.15), P0(tp.x0 + 0.15, tp.y1 - 0.15)], tp.c1);
    poly(g, [P0(tp.x0 + 0.3, tp.y0 + 0.3), P0(tp.x1 - 0.3, tp.y0 + 0.3), P0(tp.x1 - 0.3, tp.y1 - 0.3), P0(tp.x0 + 0.3, tp.y1 - 0.3)], tp.c0);
    poly(g, [P0(tp.x0 + 0.36, tp.y0 + 0.36), P0(tp.x1 - 0.36, tp.y0 + 0.36), P0(tp.x1 - 0.36, tp.y1 - 0.36), P0(tp.x0 + 0.36, tp.y1 - 0.36)], tp.c1);
  }
  // tapis du salon de l'équipe (réserve d'agents)
  if (carte.salon) {
    const sl = carte.salon;
    const coul = { roblox: ['#7a2f8f', '#b155c9'], unreal: ['#123a52', '#1f6f8a'], direction: ['#5b3418', '#c9a227'], serveur: ['#2b4a3a', '#3d6a52'], bac: ['#1d1d1d', '#f5c400'] }[carte.type] || ['#6b3a2a', '#c27a4a'];
    poly(g, [P0(sl.x0 + 0.08, sl.y0 + 0.08), P0(sl.x1 - 0.1, sl.y0 + 0.08), P0(sl.x1 - 0.1, sl.y1 - 0.12), P0(sl.x0 + 0.08, sl.y1 - 0.12)], coul[0]);
    poly(g, [P0(sl.x0 + 0.22, sl.y0 + 0.22), P0(sl.x1 - 0.24, sl.y0 + 0.22), P0(sl.x1 - 0.24, sl.y1 - 0.26), P0(sl.x0 + 0.22, sl.y1 - 0.26)], coul[1]);
  }
  // dalle du plancher (épaisseur visible devant)
  poly(g, [P0(0, H, 0), P0(W, H, 0), P0(W, H, -10), P0(0, H, -10)], T.dalle);
  poly(g, [P0(W, 0, 0), P0(W, H, 0), P0(W, H, -10), P0(W, 0, -10)], nuance(T.dalle, -0.25));
  // murs
  const droite = murPlat(carte.type, W * 32, 'droite', etage);
  const md = cisailler(droite, 'droite', 0);
  g.drawImage(md.c, md.x, md.y);
  const gauche = murPlat(carte.type, H * 32, 'gauche', etage);
  const gg = gauche.getContext('2d');
  gg.fillStyle = 'rgba(0,0,20,0.14)';
  gg.fillRect(0, 0, gauche.width, gauche.height);
  const mg = cisailler(gauche, 'gauche', 0);
  g.drawImage(mg.c, mg.x, mg.y);
  // épaisseur et chapeaux des murs
  const e = 0.14;
  const capeau = melange(nuance(T.dalle, 0.5), '#d0d4dc', 0.5);
  poly(g, [P0(0, 0, HW), P0(W, 0, HW), P0(W + e, -e, HW), P0(-e, -e, HW)], capeau);
  poly(g, [P0(0, 0, HW), P0(-e, -e, HW), P0(-e, H + e, HW), P0(0, H, HW)], nuance(capeau, -0.1));
  poly(g, [P0(W, 0, HW), P0(W + e, -e, HW), P0(W + e, -e, 0), P0(W, 0, 0)], nuance(capeau, -0.35));
  poly(g, [P0(0, H, HW), P0(-e, H + e, HW), P0(-e, H + e, 0), P0(0, H, 0)], nuance(capeau, -0.2));
  // liseré sombre au sommet
  g.fillStyle = CONTOUR;
  for (let u = 0; u < W * 32 + 4; u++) g.fillRect(OX + u, OY + Math.floor(u / 2) - HW - 3 - (u < 4 ? 0 : 0), 1, 1);
  for (let u = 0; u < H * 32 + 4; u++) g.fillRect(OX - 1 - u, OY + Math.floor(u / 2) - HW - 3, 1, 1);
  return c;
}

// ---------- mobilier ----------
function spriteTuile(htop, fn, contour = true) {
  const c = creerCanvas(66, htop + 36);
  const g = c.getContext('2d');
  const P = projeteur(33, htop + 1);
  fn(g, P);
  if (contour) contourner(c);
  return { c, dx: -1, dy: -(htop + 1) };
}

// Meuble de nx × ny cases (lits, billard…) dessiné d'un seul tenant. Même repère que spriteTuile :
// P(0, 0) est le coin du fond de la première case.
function spriteBloc(nx, ny, htop, fn, contour = true) {
  const c = creerCanvas(32 * (nx + ny) + 2, htop + 16 * (nx + ny) + 4);
  const g = c.getContext('2d');
  const P = projeteur(32 * ny + 1, htop + 1);
  fn(g, P);
  if (contour) contourner(c);
  return { c, dx: 31 - 32 * ny, dy: -(htop + 1) };
}

// Lits : u le long du lit (0 = tête), v en travers ; l'axe dit si le lit court selon x ou selon y.
function axeLit(P, axe) {
  return axe === 'x'
    ? (g, u0, v0, u1, v1, z0, z1, col) => prisme(g, P, u0, v0, u1, v1, z0, z1, col)
    : (g, u0, v0, u1, v1, z0, z1, col) => prisme(g, P, v0, u0, v1, u1, z0, z1, col);
}
const BOIS_LIT = '#6e4c36';
const DRAP = '#e4e2ee';
const COUVERTURES = ['#5b7bd6', '#c45b8a', '#4fae8a', '#c9a24a', '#8a6bd6', '#d6785b', '#5bb0c4', '#9ac45b'];
// Hauteur du dessus du matelas (là où l'on pose la tête), selon le lit et l'étage du lit superposé.
export const MATELAS = { lit: 14, futon: 6, bas: 14, haut: 48 };

function litFait(Pr, g, z, couv) {
  Pr(g, 0.14, 0.2, 0.44, 0.8, z, z + 3, '#f6f6fb');
  Pr(g, 0.62, 0.1, 1.9, 0.9, z, z + 2, couv);
  Pr(g, 0.62, 0.1, 0.72, 0.9, z + 2, z + 2.5, nuance(couv, 0.4));
}

function pieds(g, P, x0, y0, x1, y1, z, col, conn = {}) {
  const t = 0.07;
  const coins = [];
  if (!conn.w && !conn.n) coins.push([x0, y0]);
  if (!conn.e && !conn.n) coins.push([x1 - t, y0]);
  if (!conn.w && !conn.s) coins.push([x0, y1 - t]);
  if (!conn.e && !conn.s) coins.push([x1 - t, y1 - t]);
  for (const [x, y] of coins) prisme(g, P, x, y, x + t, y + t, 0, z, col);
}

function ecranContenu(g, P, y, x0, x1, z0, z1, genre) {
  const lx = (t) => x0 + (x1 - x0) * t;
  const lz = (t) => z0 + (z1 - z0) * t;
  const q = (a, b, c, d, col) => quadY(g, P, y, lx(a), lx(b), lz(c), lz(d), col);
  switch (genre) {
    case 'studio':
      q(0, 1, 0, 1, '#eef0f3');
      q(0, 1, 0.86, 1, '#3a86ff');
      q(0, 0.24, 0, 0.86, '#d3d6dc');
      q(0.28, 0.98, 0.05, 0.82, '#9fd3ff');
      q(0.28, 0.98, 0.05, 0.36, '#58a55c');
      q(0.55, 0.7, 0.3, 0.55, '#e3342f');
      q(0.03, 0.2, 0.7, 0.75, '#8a8f99');
      q(0.03, 0.17, 0.55, 0.6, '#8a8f99');
      break;
    case 'rendu':
      q(0, 1, 0, 1, '#18181e');
      q(0.04, 0.96, 0.12, 0.92, '#5a7dff');
      q(0.04, 0.96, 0.12, 0.6, '#ff9a5a');
      q(0.04, 0.96, 0.12, 0.35, '#3b2a55');
      q(0.6, 0.72, 0.62, 0.74, '#ffe14d');
      q(0, 1, 0, 0.1, '#2a2a33');
      break;
    case 'code':
      q(0, 1, 0, 1, '#1e2233');
      q(0.08, 0.5, 0.78, 0.84, '#7ee787');
      q(0.16, 0.7, 0.62, 0.68, '#79c0ff');
      q(0.16, 0.56, 0.46, 0.52, '#ffa657');
      q(0.08, 0.4, 0.3, 0.36, '#d2a8ff');
      q(0.16, 0.62, 0.14, 0.2, '#79c0ff');
      break;
    case 'console':
      q(0, 1, 0, 1, '#050805');
      for (let i = 0; i < 5; i++) q(0.06, 0.3 + ((i * 37) % 60) / 100, 0.12 + i * 0.17, 0.18 + i * 0.17, '#39ff6a');
      break;
    case 'plans':
      q(0, 1, 0, 1, '#2a5ba8');
      q(0.1, 0.9, 0.2, 0.24, '#d6e6ff');
      q(0.2, 0.24, 0.2, 0.85, '#d6e6ff');
      q(0.6, 0.64, 0.2, 0.7, '#d6e6ff');
      q(0.2, 0.9, 0.7, 0.74, '#d6e6ff');
      break;
    case 'bourse':
      q(0, 1, 0, 1, '#ffffff');
      for (let i = 0; i < 6; i++) q(0.1 + i * 0.14, 0.18 + i * 0.14, 0.1, 0.2 + i * 0.12, i % 2 ? '#3ddc5a' : '#2f9e44');
      break;
    case 'bac':
      q(0, 1, 0, 1, '#1d1d1d');
      q(0.08, 0.92, 0.2, 0.8, '#f5c400');
      q(0.16, 0.84, 0.3, 0.7, '#1d1d1d');
      q(0.22, 0.5, 0.55, 0.6, '#f5c400');
      break;
    default:
      q(0, 1, 0, 1, '#2f6fde');
      q(0.1, 0.9, 0.4, 0.6, '#ffffff');
  }
}

const GENRE_MACHINE = {
  roblox: 'studio', unreal: 'rendu', atelier3d: 'code', etudes: 'plans', serveur: 'console', direction: 'bourse', hall: 'code', bac: 'bac',
};

function plante(g, P, rnd, variante, petite = false) {
  prisme(g, P, 0.32, 0.32, 0.68, 0.68, 0, 12, '#c0603a');
  quadZ(g, P, 12, 0.36, 0.36, 0.64, 0.64, '#3b2a1e');
  const verts = ['#2e8b3e', '#3fae4f', '#1f6b2d', '#56c45f'];
  const haut = petite ? 24 : variante % 2 ? 44 : 34;
  const [cx, cy] = P(0.5, 0.5, 12);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 10;
    const hgt = 4 + rnd() * (haut - 8);
    const x = Math.round(cx + Math.cos(a) * r * (1 - hgt / (haut * 1.4)));
    const y = Math.round(cy - hgt + Math.sin(a) * r * 0.35);
    g.fillStyle = verts[Math.floor(rnd() * verts.length)];
    g.fillRect(x - 2, y - 1, 5, 3);
    g.fillRect(x - 1, y - 2, 3, 1);
  }
}

function livres(g, P, y, x0, x1, z0, h, rnd) {
  const cols = ['#e3342f', '#2f6fde', '#f6c21c', '#3aa655', '#9b5de5', '#ef7d22', '#ececec', '#1f2a44'];
  let x = x0;
  while (x < x1 - 0.03) {
    const w = 0.035 + rnd() * 0.04;
    const hh = h - Math.floor(rnd() * 4);
    quadY(g, P, y, x, Math.min(x1, x + w), z0, z0 + hh, cols[Math.floor(rnd() * cols.length)]);
    x += w + 0.008;
  }
}

const cacheMeubles = new Map();
// Retourne { c, dx, dy, avant? } pour un meuble ; `etat` : variantes dynamiques (lampe, téléphone…).
export function spriteMeuble(it, typeTheme, etat = {}) {
  const cle = it.type + '|' + typeTheme + '|' + it.x + ',' + it.y + '|' + JSON.stringify(etat);
  let s = cacheMeubles.get(cle);
  if (s) return s;
  const T = theme(typeTheme);
  const rnd = aleatoire(hacher(cle));
  const conn = it.conn || {};
  switch (it.type) {
    case 'bureau': {
      const x0 = conn.w ? 0 : 0.06;
      const x1 = conn.e ? 1 : 0.94;
      const y0 = conn.n ? 0 : 0.08;
      const y1 = conn.s ? 1 : 0.92;
      s = spriteTuile(56, (g, P) => {
        const col = T.bureau;
        pieds(g, P, x0, y0, x1, y1, 20, nuance(col, -0.35), conn);
        prisme(g, P, x0, y0, x1, y1, 20, 24, col);
        const nord = it.cote === 'n';
        if (nord) {
          prisme(g, P, 0.46, 0.64, 0.54, 0.7, 24, 28, '#2a2d36');
          prisme(g, P, 0.22, 0.62, 0.78, 0.68, 27, 44, '#2a2d36');
          pixel(g, P(0.5, 0.68, 36), '#5b6170', 2, 1);
          prisme(g, P, 0.3, 0.18, 0.7, 0.32, 24, 25, '#d9dce2');
        } else {
          prisme(g, P, 0.46, 0.3, 0.54, 0.36, 24, 28, '#2a2d36');
          prisme(g, P, 0.22, 0.3, 0.78, 0.36, 27, 44, '#2a2d36');
          ecranContenu(g, P, 0.36, 0.25, 0.75, 29, 42, typeTheme === 'roblox' ? 'studio' : typeTheme === 'unreal' ? 'rendu' : 'code');
          prisme(g, P, 0.3, 0.7, 0.7, 0.84, 24, 25, '#d9dce2');
        }
        if (rnd() < 0.5) {
          const mx = nord ? 0.8 : 0.12;
          const my = nord ? 0.3 : 0.62;
          prisme(g, P, mx, my, mx + 0.09, my + 0.09, 24, 30, '#ffffff');
          quadZ(g, P, 30, mx + 0.01, my + 0.01, mx + 0.08, my + 0.08, '#6b3e1f');
        } else {
          quadZ(g, P, 24.5, nord ? 0.08 : 0.72, nord ? 0.2 : 0.55, nord ? 0.24 : 0.9, nord ? 0.4 : 0.75, '#f5f5f0');
        }
      });
      break;
    }
    case 'chaise': {
      const col = T.chaise || ['#e3342f', '#2f6fde', '#f6c21c', '#3aa655'][hacher(it.x + ',' + it.y) % 4];
      const dir = it.dir;
      const dossier = {
        sw: [0.27, 0.22, 0.73, 0.3],
        ne: [0.27, 0.7, 0.73, 0.78],
        se: [0.22, 0.27, 0.3, 0.73],
        nw: [0.7, 0.27, 0.78, 0.73],
      }[dir];
      const devant = dir === 'ne' || dir === 'nw';
      const zHaut = it.variante === 'dg' ? 36 : 30;
      s = spriteTuile(44, (g, P) => {
        prisme(g, P, 0.3, 0.3, 0.7, 0.7, 0, 2, '#2a2c33');
        prisme(g, P, 0.47, 0.47, 0.53, 0.53, 2, 10, '#555a66');
        prisme(g, P, 0.27, 0.27, 0.73, 0.73, 10, 14, col);
        if (!devant) prisme(g, P, ...dossier, 14, zHaut, col);
      });
      if (devant) {
        s.avant = spriteTuile(44, (g, P) => {
          prisme(g, P, ...dossier, 14, zHaut, col);
        });
      }
      break;
    }
    case 'fauteuil_dg': {
      const col = typeTheme === 'direction' ? '#5a1a22' : '#3a2a22';
      s = spriteTuile(52, (g, P) => {
        prisme(g, P, 0.28, 0.28, 0.72, 0.72, 0, 2, '#1d1d22');
        prisme(g, P, 0.46, 0.46, 0.54, 0.54, 2, 10, '#6a6f7a');
        prisme(g, P, 0.2, 0.18, 0.8, 0.27, 12, 42, col);
        prisme(g, P, 0.22, 0.24, 0.78, 0.78, 10, 16, col);
        prisme(g, P, 0.2, 0.3, 0.27, 0.74, 16, 22, nuance(col, -0.1));
        prisme(g, P, 0.73, 0.3, 0.8, 0.74, 16, 22, nuance(col, -0.1));
      });
      break;
    }
    case 'bureau_dg': {
      const p = it.part;
      const c2 = { w: p !== 'g', e: p !== 'd' };
      const x0 = c2.w ? 0 : 0.06;
      const x1 = c2.e ? 1 : 0.94;
      const bois = typeTheme === 'direction' ? '#5b3418' : nuance(T.bureau, -0.25);
      s = spriteTuile(60, (g, P) => {
        prisme(g, P, x0 + 0.02, 0.14, x1 - (c2.e ? 0 : 0.02), 0.86, 0, 22, bois);
        quadY(g, P, 0.86, x0 + 0.02, x1 - (c2.e ? 0 : 0.02), 17, 18, '#c9a227');
        prisme(g, P, x0, 0.08, x1, 0.92, 22, 26, nuance(bois, 0.15));
        if (it.lampe) {
          const on = !!etat.lampe;
          if (on) quadZ(g, P, 26.5, 0.08, 0.2, 0.5, 0.62, '#ffe9a0');
          prisme(g, P, 0.18, 0.3, 0.32, 0.44, 26, 28, '#c9a227');
          prisme(g, P, 0.24, 0.36, 0.27, 0.39, 28, 40, '#c9a227');
          prisme(g, P, 0.12, 0.28, 0.4, 0.46, 38, 44, on ? '#7af0a8' : '#1f7a4a');
          if (on) quadY(g, P, 0.46, 0.14, 0.38, 36, 38, '#fff6b0');
          prisme(g, P, 0.55, 0.55, 0.75, 0.62, 26, 29, '#f2f2ee');
        }
        if (it.telephone) {
          prisme(g, P, 0.5, 0.28, 0.78, 0.5, 26, 29, '#2a2c36');
          if (!etat.decroche) prisme(g, P, 0.5, 0.28, 0.78, 0.35, 29, 32, '#3a3d4a');
          pixel(g, P(0.62, 0.5, 28), '#e3342f');
          prisme(g, P, 0.15, 0.6, 0.4, 0.72, 26, 28, '#c9a227');
        }
        if (p === 'm') quadZ(g, P, 26.5, 0.2, 0.3, 0.8, 0.6, '#3a5a3a');
      });
      break;
    }
    case 'machine_cafe': {
      s = spriteTuile(64, (g, P) => {
        const corps = typeTheme === 'roblox' ? '#e3342f' : typeTheme === 'unreal' ? '#3b4058' : '#8d99a6';
        prisme(g, P, 0.06, 0.14, 0.6, 0.86, 0, 48, corps);
        quadX(g, P, 0.6, 0.2, 0.8, 24, 42, '#2b2f3a');
        quadX(g, P, 0.6, 0.26, 0.5, 34, 39, '#5cff8a');
        quadX(g, P, 0.6, 0.56, 0.62, 30, 32, '#ff4d4d');
        quadX(g, P, 0.6, 0.66, 0.72, 30, 32, '#ffe14d');
        quadX(g, P, 0.6, 0.32, 0.68, 6, 20, '#1b1d24');
        prisme(g, P, 0.55, 0.43, 0.6, 0.55, 6, 12, '#ffffff');
        quadZ(g, P, 48, 0.1, 0.18, 0.56, 0.82, nuance(corps, 0.3));
      });
      break;
    }
    case 'canape': {
      const col = it.equipe ? T.canapeEquipe || '#c0392b' : T.canape;
      const a = it.part === 'a';
      const y0 = a ? 0.08 : 0;
      const y1 = a ? 1 : 0.92;
      s = spriteTuile(40, (g, P) => {
        prisme(g, P, 0.1, y0, 0.88, y1, 0, 12, nuance(col, -0.1));
        prisme(g, P, 0.03, y0, 0.3, y1, 12, 30, col);
        prisme(g, P, 0.3, y0, 0.86, y1, 12, 14, nuance(col, 0.12));
        if (a) prisme(g, P, 0.1, 0.08, 0.88, 0.24, 12, 21, col);
        else prisme(g, P, 0.1, 0.76, 0.88, 0.92, 12, 21, col);
      });
      break;
    }
    case 'table_basse': {
      s = spriteTuile(30, (g, P) => {
        pieds(g, P, 0.18, 0.18, 0.82, 0.82, 9, '#4a4f5a');
        prisme(g, P, 0.15, 0.15, 0.85, 0.85, 9, 12, T.table);
        if (it.variante === 'tele') {
          // saladier de pop-corn et télécommande
          prisme(g, P, 0.3, 0.3, 0.62, 0.62, 12, 15, '#e3342f');
          quadZ(g, P, 15.2, 0.33, 0.33, 0.59, 0.59, '#fff3c4');
          for (const [u, v] of [[0.38, 0.4], [0.5, 0.36], [0.45, 0.5], [0.55, 0.52]]) pixel(g, P(u, v, 16.5), '#ffffff', 2, 1);
          prisme(g, P, 0.66, 0.5, 0.8, 0.58, 12, 13.5, '#2b2b33');
          pixel(g, P(0.7, 0.52, 14), '#e3342f');
          return;
        }
        if (it.variante === 'poufs') {
          // jeu de société en cours
          quadZ(g, P, 12.4, 0.24, 0.24, 0.76, 0.76, '#f4ecd2');
          for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) quadZ(g, P, 12.6, 0.26 + i * 0.12, 0.26 + j * 0.12, 0.38 + i * 0.12, 0.38 + j * 0.12, '#c45b5b');
          prisme(g, P, 0.36, 0.36, 0.42, 0.42, 12.6, 16, '#2f6fde');
          prisme(g, P, 0.6, 0.56, 0.66, 0.62, 12.6, 16, '#f2c14e');
          return;
        }
        quadZ(g, P, 12.5, 0.25, 0.3, 0.55, 0.5, '#e3342f');
        if (it.variante === 'equipe') {
          quadZ(g, P, 13, 0.3, 0.55, 0.62, 0.78, '#2f6fde');
          quadZ(g, P, 13.5, 0.34, 0.58, 0.6, 0.62, '#ffffff');
          prisme(g, P, 0.68, 0.25, 0.76, 0.33, 12, 16, '#ffffff');
          quadZ(g, P, 16.2, 0.69, 0.26, 0.75, 0.32, '#6b3e1f');
        } else prisme(g, P, 0.6, 0.55, 0.68, 0.63, 12, 16, '#ffffff');
      });
      break;
    }
    case 'fauteuil': {
      const col = T.canapeEquipe || '#c0392b';
      const dir = it.dir;
      const devant = dir === 'nw' || dir === 'ne';
      const dossier = { se: [0.08, 0.14, 0.3, 0.86], nw: [0.7, 0.14, 0.92, 0.86], sw: [0.14, 0.08, 0.86, 0.3], ne: [0.14, 0.7, 0.86, 0.92] }[dir];
      const bras = dir === 'se' || dir === 'nw'
        ? [[0.14, 0.1, 0.86, 0.24], [0.14, 0.76, 0.86, 0.9]]
        : [[0.1, 0.14, 0.24, 0.86], [0.76, 0.14, 0.9, 0.86]];
      s = spriteTuile(40, (g, P) => {
        prisme(g, P, 0.14, 0.14, 0.86, 0.86, 0, 12, nuance(col, -0.1));
        if (!devant) prisme(g, P, ...dossier, 12, 30, col);
        prisme(g, P, 0.24, 0.24, 0.76, 0.76, 12, 14, nuance(col, 0.12));
        for (const b of bras) prisme(g, P, ...b, 12, 20, col);
      });
      if (devant) s.avant = spriteTuile(40, (g, P) => prisme(g, P, ...dossier, 12, 30, col));
      break;
    }
    case 'baie_service': {
      s = spriteTuile(76, (g, P) => {
        prisme(g, P, 0.1, 0.18, 0.9, 0.82, 0, 66, '#20242c');
        quadY(g, P, 0.82, 0.14, 0.86, 3, 63, '#14171d');
        for (let z = 8; z < 58; z += 7) quadY(g, P, 0.82, 0.16, 0.84, z, z + 5, '#2b303a');
        quadY(g, P, 0.82, 0.16, 0.84, 58, 62, '#3a4050');
      });
      break;
    }
    case 'table_reunion': {
      const x0 = conn.w ? 0 : 0.08;
      const x1 = conn.e ? 1 : 0.92;
      const y0 = conn.n ? 0 : 0.08;
      const y1 = conn.s ? 1 : 0.92;
      s = spriteTuile(40, (g, P) => {
        pieds(g, P, x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04, 20, '#3a3d46', conn);
        prisme(g, P, x0, y0, x1, y1, 20, 24, T.table);
      });
      break;
    }
    case 'plante':
      s = spriteTuile(52, (g, P) => plante(g, P, rnd, it.variante || 0, !!it.petite));
      break;
    case 'etagere': {
      s = spriteTuile(70, (g, P) => {
        const bois = typeTheme === 'unreal' ? '#3b4058' : typeTheme === 'direction' ? '#5b3418' : '#9a6a3c';
        prisme(g, P, 0.08, 0.04, 0.92, 0.4, 0, 60, bois);
        quadY(g, P, 0.4, 0.12, 0.88, 3, 57, nuance(bois, -0.35));
        for (const z of [3, 17, 31, 45]) {
          quadY(g, P, 0.4, 0.12, 0.88, z - 1, z, nuance(bois, 0.1));
          livres(g, P, 0.4, 0.13, 0.87, z, 11, rnd);
        }
      });
      break;
    }
    case 'etagere_basse': {
      s = spriteTuile(40, (g, P) => {
        prisme(g, P, 0.1, 0.3, 0.9, 0.7, 0, 28, '#9a6a3c');
        quadY(g, P, 0.7, 0.14, 0.86, 3, 26, '#5e3f20');
        livres(g, P, 0.7, 0.15, 0.85, 3, 10, rnd);
        livres(g, P, 0.7, 0.15, 0.85, 15, 10, rnd);
      });
      break;
    }
    case 'poste_machine': {
      const p = it.part;
      const x0 = p === 'g' ? 0.06 : 0;
      const x1 = p === 'd' ? 0.94 : 1;
      const genre = GENRE_MACHINE[typeTheme] || 'code';
      s = spriteTuile(66, (g, P) => {
        pieds(g, P, x0, 0.06, x1, 0.72, 20, '#1d1f26', { e: p === 'g', w: p === 'd' });
        prisme(g, P, x0, 0.06, x1, 0.72, 20, 24, '#2a2d3a');
        if (typeTheme === 'atelier3d' && p === 'g') {
          for (const [x, y] of [[0.16, 0.14], [0.78, 0.14], [0.16, 0.56], [0.78, 0.56]]) prisme(g, P, x, y, x + 0.05, y + 0.05, 24, 58, '#1d1d22');
          prisme(g, P, 0.16, 0.14, 0.83, 0.61, 58, 61, '#1d1d22');
          prisme(g, P, 0.2, 0.18, 0.8, 0.58, 26, 28, '#9aa0a8');
          prisme(g, P, 0.4, 0.3, 0.6, 0.46, 28, 34, '#f06a2a');
        } else {
          prisme(g, P, 0.46, 0.18, 0.54, 0.24, 24, 28, '#1d1f26');
          prisme(g, P, 0.1, 0.14, 0.9, 0.2, 27, 52, '#15161c');
          ecranContenu(g, P, 0.2, 0.13, 0.87, 29, 50, genre);
        }
        if (p === 'g') prisme(g, P, 0.45, 0.4, 0.95, 0.56, 24, 25, '#d9dce2');
        else prisme(g, P, 0.1, 0.42, 0.2, 0.52, 24, 26, '#d9dce2');
      });
      break;
    }
    case 'fontaine': {
      s = spriteTuile(52, (g, P) => {
        prisme(g, P, 0.3, 0.3, 0.7, 0.7, 0, 26, '#e8ecf0');
        quadY(g, P, 0.7, 0.42, 0.58, 16, 20, '#3a86ff');
        prisme(g, P, 0.34, 0.34, 0.66, 0.66, 26, 42, '#9fd8ff', '#8cc9f2', '#6fa9d6');
        quadZ(g, P, 42, 0.42, 0.42, 0.58, 0.58, '#d9f1ff');
      });
      break;
    }
    case 'accueil': {
      const a = it.part === 'a';
      s = spriteTuile(40, (g, P) => {
        prisme(g, P, 0.1, a ? 0.1 : 0, 0.9, a ? 1 : 0.9, 0, 26, '#f4f6fa');
        quadX(g, P, 0.9, a ? 0.2 : 0, a ? 1 : 0.8, 8, 12, '#2f6fde');
        prisme(g, P, 0.04, a ? 0.04 : 0, 0.96, a ? 1 : 0.96, 26, 29, '#2f6fde');
      });
      break;
    }
    case 'baie': {
      s = spriteTuile(76, (g, P) => {
        prisme(g, P, 0.12, 0.2, 0.88, 0.8, 0, 64, '#1f2229');
        quadY(g, P, 0.8, 0.16, 0.84, 3, 61, '#14161b');
        for (let z = 6; z < 60; z += 6) quadY(g, P, 0.8, 0.18, 0.82, z, z + 4, '#2b2f38');
      });
      break;
    }
    case 'imprimante3d': {
      s = spriteTuile(56, (g, P) => {
        prisme(g, P, 0.15, 0.15, 0.85, 0.85, 0, 6, '#2b2b33');
        for (const [x, y] of [[0.15, 0.15], [0.8, 0.15], [0.15, 0.8], [0.8, 0.8]]) prisme(g, P, x, y, x + 0.05, y + 0.05, 6, 40, '#1d1d22');
        prisme(g, P, 0.15, 0.15, 0.85, 0.2, 38, 41, '#1d1d22');
        prisme(g, P, 0.15, 0.8, 0.85, 0.85, 38, 41, '#1d1d22');
        prisme(g, P, 0.22, 0.22, 0.78, 0.78, 9, 11, '#9aa0a8');
        prisme(g, P, 0.4, 0.4, 0.6, 0.6, 11, 17, '#f06a2a');
        prisme(g, P, 0.2, 0.46, 0.8, 0.54, 30, 32, '#5b6170');
      });
      break;
    }
    case 'etabli': {
      s = spriteTuile(40, (g, P) => {
        pieds(g, P, 0.06, 0.16, 0.94, 0.84, 22, '#5e3f20');
        prisme(g, P, 0.05, 0.15, 0.95, 0.85, 22, 27, '#b98a57');
        prisme(g, P, 0.12, 0.25, 0.3, 0.45, 27, 33, '#6d737c');
        prisme(g, P, 0.5, 0.5, 0.85, 0.56, 27, 29, '#8b5a2b');
        prisme(g, P, 0.78, 0.46, 0.88, 0.6, 27, 32, '#9aa0a8');
      });
      break;
    }
    case 'liege': {
      s = spriteTuile(60, (g, P) => {
        for (const x of [0.12, 0.84]) prisme(g, P, x, 0.47, x + 0.04, 0.53, 0, 14, '#5e3f20');
        prisme(g, P, 0.06, 0.46, 0.94, 0.52, 14, 50, '#7c5532');
        quadY(g, P, 0.52, 0.1, 0.9, 17, 47, '#b07a45');
        const cols = ['#ffffff', '#fff3a0', '#ffd1dc', '#c8f2ff'];
        for (let i = 0; i < 6; i++) {
          const x = 0.12 + rnd() * 0.6;
          const z = 19 + rnd() * 18;
          quadY(g, P, 0.52, x, x + 0.14, z, z + 9, cols[i % 4]);
          pixel(g, P(x + 0.07, 0.52, z + 9), i % 2 ? '#e3342f' : '#2f6fde');
        }
      });
      break;
    }
    case 'ecran_rendu': {
      s = spriteTuile(64, (g, P) => {
        prisme(g, P, 0.3, 0.3, 0.7, 0.7, 0, 2, '#1d1d22');
        prisme(g, P, 0.46, 0.46, 0.54, 0.54, 2, 18, '#2a2a33');
        prisme(g, P, 0.02, 0.44, 0.98, 0.5, 18, 56, '#111116');
        ecranContenu(g, P, 0.5, 0.06, 0.94, 21, 53, 'rendu');
      });
      break;
    }
    case 'bloc_roblox':
    case 'bloc_roblox2': {
      const cols = ['#e3342f', '#2f6fde', '#f6c21c', '#3aa655'];
      const v = it.type === 'bloc_roblox2';
      s = spriteTuile(50, (g, P) => {
        const b = (x0, y0, x1, y1, z0, z1, col) => {
          prisme(g, P, x0, y0, x1, y1, z0, z1, col);
          const cx = (x0 + x1) / 2;
          const cy = (y0 + y1) / 2;
          pixel(g, P(cx, cy, z1 + 1), nuance(col, 0.35), 4, 2);
        };
        if (!v) {
          b(0.1, 0.1, 0.5, 0.5, 0, 10, cols[0]);
          b(0.5, 0.1, 0.9, 0.5, 0, 10, cols[1]);
          b(0.1, 0.5, 0.5, 0.9, 0, 10, cols[2]);
          b(0.5, 0.5, 0.9, 0.9, 0, 10, cols[3]);
          b(0.3, 0.3, 0.7, 0.7, 10, 20, cols[0]);
        } else {
          b(0.25, 0.25, 0.75, 0.75, 0, 12, cols[1]);
          b(0.25, 0.25, 0.75, 0.75, 12, 24, cols[2]);
          b(0.3, 0.3, 0.7, 0.7, 24, 34, cols[3]);
        }
      });
      break;
    }
    case 'globe': {
      s = spriteTuile(52, (g, P) => {
        prisme(g, P, 0.34, 0.34, 0.66, 0.66, 0, 3, '#5b3418');
        prisme(g, P, 0.47, 0.47, 0.53, 0.53, 3, 16, '#c9a227');
        const [cx, cy] = P(0.5, 0.5, 30);
        for (let y = -10; y <= 10; y++) {
          const w = Math.round(Math.sqrt(100 - y * y));
          g.fillStyle = '#2f6fde';
          g.fillRect(cx - w, cy + y, w * 2, 1);
        }
        g.fillStyle = '#3aa655';
        g.fillRect(cx - 6, cy - 6, 5, 4);
        g.fillRect(cx - 3, cy - 2, 4, 6);
        g.fillRect(cx + 3, cy - 4, 4, 3);
        g.fillRect(cx + 2, cy + 3, 3, 3);
        g.fillStyle = '#c9a227';
        g.fillRect(cx - 11, cy, 1, 1);
        g.fillRect(cx + 10, cy, 1, 1);
      });
      break;
    }
    case 'trophee': {
      s = spriteTuile(52, (g, P) => {
        prisme(g, P, 0.3, 0.3, 0.7, 0.7, 0, 20, '#3a2a22');
        prisme(g, P, 0.42, 0.42, 0.58, 0.58, 20, 23, '#c9a227');
        prisme(g, P, 0.47, 0.47, 0.53, 0.53, 23, 28, '#f4d35e');
        prisme(g, P, 0.38, 0.38, 0.62, 0.62, 28, 38, '#f4d35e');
        const [cx, cy] = P(0.5, 0.5, 34);
        g.fillStyle = '#f4d35e';
        g.fillRect(cx - 10, cy - 2, 2, 4);
        g.fillRect(cx + 8, cy - 2, 2, 4);
      });
      break;
    }
    case 'cone': {
      s = spriteTuile(36, (g, P) => {
        prisme(g, P, 0.25, 0.25, 0.75, 0.75, 0, 2, '#c94a10');
        prisme(g, P, 0.36, 0.36, 0.64, 0.64, 2, 9, '#ff6a1f');
        prisme(g, P, 0.39, 0.39, 0.61, 0.61, 9, 14, '#ffffff');
        prisme(g, P, 0.42, 0.42, 0.58, 0.58, 14, 20, '#ff6a1f');
        prisme(g, P, 0.46, 0.46, 0.54, 0.54, 20, 24, '#ff6a1f');
      });
      break;
    }
    case 'barriere': {
      s = spriteTuile(36, (g, P) => {
        for (const x of [0.12, 0.82]) prisme(g, P, x, 0.44, x + 0.06, 0.56, 0, 18, '#d9d9d9');
        for (let i = 0; i < 6; i++) {
          prisme(g, P, 0.05 + i * 0.15, 0.45, 0.2 + i * 0.15, 0.55, 14, 20, i % 2 ? '#1d1d1d' : '#f5c400');
        }
      });
      break;
    }
    // ---------- salle de pause ----------
    case 'billard': {
      s = spriteBloc(2, 1, 100, (g, P) => {
        const bois = '#6b3d1f';
        for (const [x, y] of [[0.14, 0.16], [1.78, 0.16], [0.14, 0.7], [1.78, 0.7], [0.96, 0.7]]) prisme(g, P, x, y, x + 0.08, y + 0.14, 0, 16, nuance(bois, -0.25));
        prisme(g, P, 0.08, 0.1, 1.92, 0.9, 14, 22, bois);
        quadY(g, P, 0.9, 0.12, 1.88, 16, 18, '#c9a227');
        quadZ(g, P, 22.5, 0.16, 0.2, 1.84, 0.8, '#1f8a4c');
        quadZ(g, P, 22.6, 0.62, 0.3, 1.38, 0.7, '#27a35b');
        // bandes
        prisme(g, P, 0.06, 0.08, 1.94, 0.2, 22, 26, '#7a4524');
        prisme(g, P, 0.06, 0.08, 0.16, 0.92, 22, 26, '#7a4524');
        prisme(g, P, 0.06, 0.8, 1.94, 0.92, 22, 26, '#7a4524');
        prisme(g, P, 1.84, 0.08, 1.94, 0.92, 22, 26, '#7a4524');
        for (const [x, y] of [[0.16, 0.2], [0.99, 0.2], [1.82, 0.2], [0.16, 0.8], [0.99, 0.8], [1.82, 0.8]]) pixel(g, P(x, y, 26), '#101010', 3, 2);
        // triangle de billes (la blanche est dessinée à part : elle roule)
        const billes = [[0.62, 0.5, '#f6c21c'], [0.55, 0.44, '#e3342f'], [0.55, 0.56, '#2f6fde'], [0.48, 0.5, '#15151f'], [0.48, 0.38, '#3aa655'],
          [0.48, 0.62, '#ef7d22'], [0.41, 0.44, '#9b5de5'], [0.41, 0.56, '#7a1f2a']];
        for (const [x, y, col] of billes) pixel(g, P(x, y, 24.5), col, 2, 2);
        // lampe suspendue
        pixel(g, P(1, 0.5, 92), '#2b2b33', 1, 26);
        prisme(g, P, 0.6, 0.36, 1.4, 0.64, 60, 66, '#2f6b3a');
        quadY(g, P, 0.64, 0.6, 1.4, 60, 61, '#ffe9a0');
        quadX(g, P, 1.4, 0.36, 0.64, 60, 61, '#ffe9a0');
      });
      break;
    }
    case 'babyfoot': {
      s = spriteBloc(2, 1, 50, (g, P) => {
        const caisse = '#b5532a';
        for (const [x, y] of [[0.2, 0.26], [1.72, 0.26], [0.2, 0.66], [1.72, 0.66]]) prisme(g, P, x, y, x + 0.08, y + 0.08, 0, 18, '#2b2b33');
        prisme(g, P, 0.12, 0.22, 1.88, 0.78, 16, 22, caisse);
        quadZ(g, P, 22.5, 0.18, 0.28, 1.82, 0.72, '#2f9e44');
        quadZ(g, P, 22.6, 0.98, 0.28, 1.02, 0.72, '#e8f5e8');
        quadZ(g, P, 22.6, 0.18, 0.42, 0.22, 0.58, '#f4f4f4');
        quadZ(g, P, 22.6, 1.78, 0.42, 1.82, 0.58, '#f4f4f4');
        prisme(g, P, 0.12, 0.22, 1.88, 0.28, 22, 30, caisse);
        prisme(g, P, 0.12, 0.22, 0.18, 0.78, 22, 30, caisse);
        // barres et joueurs : gardien, défense, attaque adverse, milieu…
        const rouges = [true, true, false, true, false, true, false, false];
        const nb = [1, 2, 3, 5, 5, 3, 2, 1];
        for (let i = 0; i < 8; i++) {
          const x = 0.3 + i * 0.2;
          prisme(g, P, x - 0.005, -0.08, x + 0.035, 0.04, 26, 29, '#15151f');
          prisme(g, P, x, 0.04, x + 0.03, 0.96, 27, 28.5, '#c9ccd4');
          for (let k = 0; k < nb[i]; k++) {
            const y = 0.3 + ((k + 0.5) * 0.4) / nb[i];
            prisme(g, P, x - 0.015, y - 0.03, x + 0.045, y + 0.03, 23, 29.5, rouges[i] ? '#e3342f' : '#2f6fde');
          }
          prisme(g, P, x - 0.005, 0.96, x + 0.035, 1.08, 26, 29, '#15151f');
        }
        prisme(g, P, 0.12, 0.72, 1.88, 0.78, 22, 30, caisse);
        prisme(g, P, 1.82, 0.22, 1.88, 0.78, 22, 30, caisse);
        quadY(g, P, 0.78, 0.9, 1.1, 24, 28, '#f4f4f4');
      });
      break;
    }
    case 'pingpong': {
      s = spriteBloc(2, 1, 40, (g, P) => {
        for (const [x, y] of [[0.2, 0.2], [1.72, 0.2], [0.2, 0.72], [1.72, 0.72]]) prisme(g, P, x, y, x + 0.07, y + 0.07, 0, 20, '#3a3d46');
        prisme(g, P, 0.06, 0.1, 1.94, 0.9, 20, 23, '#1f5fa8');
        const ligne = (x0, y0, x1, y1) => quadZ(g, P, 23.3, x0, y0, x1, y1, '#ffffff');
        ligne(0.08, 0.12, 1.92, 0.15);
        ligne(0.08, 0.85, 1.92, 0.88);
        ligne(0.08, 0.12, 0.11, 0.88);
        ligne(1.89, 0.12, 1.92, 0.88);
        ligne(0.08, 0.49, 1.92, 0.51);
        prisme(g, P, 0.985, 0.02, 1.015, 0.98, 23, 28, '#d9dde4');
        quadX(g, P, 1.015, 0.04, 0.96, 27, 28, '#ffffff');
        // raquettes posées
        prisme(g, P, 0.3, 0.7, 0.42, 0.8, 23, 24, '#e3342f');
        prisme(g, P, 1.6, 0.22, 1.72, 0.32, 23, 24, '#1d1d1d');
      });
      break;
    }
    case 'canape_tv': {
      // canapé tourné vers l'écran (vers le mur du fond) : le dossier est devant les gens assis
      const col = T.canape;
      const p = it.part;
      const x0 = p === 'g' ? 0.04 : 0;
      const x1 = p === 'd' ? 0.96 : 1;
      s = spriteTuile(44, (g, P) => {
        prisme(g, P, x0, 0.14, x1, 0.84, 0, 11, nuance(col, -0.15));
        prisme(g, P, x0, 0.16, x1, 0.74, 11, 14, nuance(col, 0.14));
        if (p === 'g') prisme(g, P, 0.04, 0.14, 0.18, 0.84, 11, 22, col);
        if (p === 'd') prisme(g, P, 0.82, 0.14, 0.96, 0.84, 11, 22, col);
      });
      s.avant = spriteTuile(44, (g, P) => {
        prisme(g, P, x0, 0.72, x1, 0.88, 6, 30, col);
        quadZ(g, P, 30, x0 + 0.02, 0.74, x1 - 0.02, 0.8, nuance(col, 0.2));
      });
      break;
    }
    case 'meuble_tv': {
      const p = it.part;
      const x0 = p === 'g' ? 0.06 : 0;
      const x1 = p === 'd' ? 0.94 : 1;
      s = spriteTuile(40, (g, P) => {
        prisme(g, P, x0, 0.1, x1, 0.62, 0, 16, '#3b2f2a');
        quadY(g, P, 0.62, x0 + 0.06, x1 - 0.06, 3, 13, '#4d3d33');
        pixel(g, P(p === 'g' ? 0.86 : 0.12, 0.62, 9), '#c9a227', 2, 1);
        if (p === 'g') {
          prisme(g, P, 0.3, 0.22, 0.74, 0.5, 16, 19, '#ecedf2');
          pixel(g, P(0.68, 0.5, 18), '#3df2ff', 2, 1);
          prisme(g, P, 0.1, 0.3, 0.22, 0.42, 16, 18, '#2b2b33');
        } else {
          prisme(g, P, 0.56, 0.2, 0.8, 0.44, 16, 34, '#22222a');
          quadY(g, P, 0.44, 0.61, 0.75, 20, 30, '#3a3a46');
        }
      });
      break;
    }
    case 'arcade': {
      const c0 = ['#e3342f', '#2f6fde', '#9b5de5'][(it.variante || 0) % 3];
      s = spriteTuile(70, (g, P) => {
        prisme(g, P, 0.16, 0.12, 0.84, 0.6, 0, 62, '#1b1b26');
        quadX(g, P, 0.84, 0.16, 0.56, 4, 58, c0);
        quadX(g, P, 0.84, 0.24, 0.48, 22, 44, nuance(c0, 0.4));
        prisme(g, P, 0.16, 0.6, 0.84, 0.78, 0, 28, '#1b1b26');
        quadY(g, P, 0.78, 0.38, 0.62, 6, 14, '#2b2b36');
        pixel(g, P(0.48, 0.78, 12), '#ffb02e', 2, 2);
        prisme(g, P, 0.14, 0.58, 0.86, 0.86, 28, 31, '#2c2c3a');
        prisme(g, P, 0.3, 0.68, 0.35, 0.73, 31, 35, '#15151f');
        pixel(g, P(0.31, 0.7, 37), '#e3342f', 3, 2);
        pixel(g, P(0.55, 0.72, 32), '#ffe14d', 2, 1);
        pixel(g, P(0.66, 0.72, 32), '#3ddc5a', 2, 1);
        quadY(g, P, 0.6, 0.2, 0.8, 34, 55, '#05060a');
        quadY(g, P, 0.6, 0.18, 0.82, 56, 61, c0);
      });
      break;
    }
    case 'jukebox': {
      s = spriteTuile(58, (g, P) => {
        prisme(g, P, 0.18, 0.16, 0.82, 0.66, 0, 44, '#7a4524');
        prisme(g, P, 0.22, 0.2, 0.78, 0.62, 44, 50, '#b0703a');
        quadY(g, P, 0.66, 0.26, 0.74, 24, 40, '#ffe1a0');
        quadY(g, P, 0.66, 0.32, 0.68, 29, 35, '#c9a227');
        quadY(g, P, 0.66, 0.3, 0.7, 6, 16, '#2b1d14');
        for (let z = 7; z < 16; z += 2) quadY(g, P, 0.66, 0.32, 0.68, z, z + 1, '#4a3424');
      });
      break;
    }
    case 'distributeur': {
      // distributeur de friandises, contre le mur gauche (vitrine côté x)
      s = spriteTuile(70, (g, P) => {
        prisme(g, P, 0.06, 0.12, 0.62, 0.88, 0, 62, '#c0392b');
        quadX(g, P, 0.62, 0.16, 0.66, 20, 58, '#bfe3ff');
        const snacks = ['#ffe14d', '#3aa655', '#ff8fb1', '#ef7d22', '#2f6fde', '#9b5de5'];
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) pixel(g, P(0.62, 0.21 + c * 0.11, 24 + r * 9), snacks[(r * 4 + c) % snacks.length], 3, 3);
        quadX(g, P, 0.62, 0.7, 0.84, 34, 52, '#1b1d24');
        for (let r = 0; r < 3; r++) pixel(g, P(0.62, 0.74, 38 + r * 4), '#9fd3ff', 2, 1);
        quadX(g, P, 0.62, 0.2, 0.6, 5, 13, '#1b1d24');
      });
      break;
    }
    case 'pouf': {
      const cols = ['#e76f51', '#2a9d8f', '#e9c46a', '#9b5de5', '#f4a261', '#3a86ff'];
      const col = cols[hacher(it.x + ',' + it.y) % cols.length];
      const dir = it.dir || 'se';
      const dossier = { se: [0.18, 0.2, 0.42, 0.8], nw: [0.58, 0.2, 0.82, 0.8], sw: [0.2, 0.18, 0.8, 0.42], ne: [0.2, 0.58, 0.8, 0.82] }[dir];
      const devant = dir === 'ne' || dir === 'nw';
      s = spriteTuile(26, (g, P) => {
        prisme(g, P, 0.16, 0.16, 0.84, 0.84, 0, 6, nuance(col, -0.12));
        prisme(g, P, 0.2, 0.2, 0.8, 0.8, 6, 9, col);
        if (!devant) prisme(g, P, ...dossier, 9, 17, col);
        pixel(g, P(0.4, 0.4, 9), nuance(col, 0.35), 3, 1);
      });
      if (devant) s.avant = spriteTuile(26, (g, P) => prisme(g, P, ...dossier, 6, 17, col));
      break;
    }
    // ---------- salle de repos ----------
    case 'lit':
    case 'futon': {
      const axe = it.axe || 'y';
      const couv = COUVERTURES[(it.variante || 0) % COUVERTURES.length];
      const futon = it.type === 'futon';
      s = spriteBloc(axe === 'x' ? 2 : 1, axe === 'x' ? 1 : 2, 36, (g, P) => {
        const Pr = axeLit(P, axe);
        if (futon) {
          Pr(g, 0.06, 0.08, 1.94, 0.92, 0, 4, '#c9b79c');
          Pr(g, 0.08, 0.1, 1.92, 0.9, 4, 6, '#ddd3c4');
          litFait(Pr, g, MATELAS.futon, couv);
          return;
        }
        Pr(g, 0, 0.04, 0.12, 0.96, 0, 30, nuance(BOIS_LIT, 0.08));
        Pr(g, 0.06, 0.08, 1.94, 0.92, 0, 9, BOIS_LIT);
        Pr(g, 0.12, 0.1, 1.88, 0.9, 9, MATELAS.lit, DRAP);
        litFait(Pr, g, MATELAS.lit, couv);
        Pr(g, 1.88, 0.06, 1.96, 0.94, 0, 17, BOIS_LIT);
      });
      break;
    }
    case 'lit_superpose': {
      // trois couches : le bas (et les montants du fond), l'étage du haut, puis montants avant et échelle
      const axe = it.axe || 'y';
      const nx = axe === 'x' ? 2 : 1;
      const ny = axe === 'x' ? 1 : 2;
      const v = it.variante || 0;
      const couvBas = COUVERTURES[v % COUVERTURES.length];
      const couvHaut = COUVERTURES[(v + 3) % COUVERTURES.length];
      const bois2 = nuance(BOIS_LIT, 0.15);
      s = spriteBloc(nx, ny, 74, (g, P) => {
        const Pr = axeLit(P, axe);
        Pr(g, 0.02, 0.02, 0.1, 0.1, 0, 68, BOIS_LIT);
        Pr(g, 0.02, 0.9, 0.1, 0.98, 0, 68, BOIS_LIT);
        Pr(g, 0.04, 0.06, 1.96, 0.94, 4, 10, BOIS_LIT);
        Pr(g, 0.1, 0.1, 1.9, 0.9, 10, MATELAS.bas, DRAP);
        litFait(Pr, g, MATELAS.bas, couvBas);
      });
      s.haut = spriteBloc(nx, ny, 74, (g, P) => {
        const Pr = axeLit(P, axe);
        Pr(g, 0.04, 0.04, 1.96, 0.96, 38, 44, BOIS_LIT);
        Pr(g, 0.1, 0.1, 1.9, 0.9, 44, MATELAS.haut, DRAP);
        litFait(Pr, g, MATELAS.haut, couvHaut);
      });
      s.devant = spriteBloc(nx, ny, 74, (g, P) => {
        const Pr = axeLit(P, axe);
        Pr(g, 1.9, 0.02, 1.98, 0.1, 0, 68, BOIS_LIT);
        Pr(g, 1.9, 0.9, 1.98, 0.98, 0, 68, BOIS_LIT);
        Pr(g, 0.1, 0.92, 0.16, 0.98, 48, 57, BOIS_LIT);
        Pr(g, 1.2, 0.92, 1.26, 0.98, 48, 57, BOIS_LIT);
        Pr(g, 0.1, 0.92, 1.26, 0.98, 55, 58, BOIS_LIT);
        Pr(g, 1.42, 0.98, 1.46, 1.03, 0, 58, bois2);
        Pr(g, 1.72, 0.98, 1.76, 1.03, 0, 58, bois2);
        for (let z = 10; z <= 50; z += 10) Pr(g, 1.46, 0.98, 1.72, 1.02, z, z + 2, bois2);
      });
      break;
    }
    case 'table_chevet': {
      s = spriteTuile(44, (g, P) => {
        prisme(g, P, 0.24, 0.24, 0.76, 0.7, 0, 18, '#5b4636');
        quadY(g, P, 0.7, 0.3, 0.7, 6, 12, '#4a382b');
        pixel(g, P(0.5, 0.7, 10), '#c9a227', 2, 1);
        if (it.lampe) {
          prisme(g, P, 0.44, 0.4, 0.52, 0.48, 18, 28, '#c9a227');
          prisme(g, P, 0.32, 0.3, 0.64, 0.58, 28, 36, '#ffd98a');
          quadZ(g, P, 36, 0.36, 0.34, 0.6, 0.54, '#fff3c4');
        } else {
          prisme(g, P, 0.3, 0.3, 0.6, 0.5, 18, 21, '#2f6fde');
          prisme(g, P, 0.32, 0.32, 0.58, 0.48, 21, 23, '#e3342f');
          prisme(g, P, 0.62, 0.34, 0.72, 0.44, 18, 24, '#ff8fb1');
          pixel(g, P(0.62, 0.4, 22), '#ffffff', 1, 1);
        }
      });
      break;
    }
    case 'lampadaire': {
      s = spriteTuile(64, (g, P) => {
        prisme(g, P, 0.36, 0.36, 0.64, 0.64, 0, 2, '#2b2b33');
        prisme(g, P, 0.48, 0.48, 0.53, 0.53, 2, 50, '#c9a227');
        prisme(g, P, 0.3, 0.3, 0.7, 0.7, 50, 60, '#ffd98a');
        quadZ(g, P, 60, 0.34, 0.34, 0.66, 0.66, '#fff3c4');
      });
      break;
    }
    default:
      s = spriteTuile(20, (g, P) => prisme(g, P, 0.3, 0.3, 0.7, 0.7, 0, 10, '#ff00ff'));
  }
  if (cacheMeubles.size > 3000) cacheMeubles.clear();
  cacheMeubles.set(cle, s);
  return s;
}

// Petites animations par-dessus les sprites (LED, buse d'imprimante, vapeur).
export function animerMeuble(g, it, tx, ty, t) {
  const P = projeteur(tx + 32, ty);
  if (it.type === 'baie') {
    for (let z = 6, k = 0; z < 60; z += 6, k++) {
      for (let j = 0; j < 4; j++) {
        const on = ((Math.floor(t / (180 + j * 70 + k * 23)) + j * 3 + k) % 4) !== 0;
        const col = j === 3 ? (on ? '#ff5050' : '#4a1a1a') : on ? '#3dff7a' : '#14421f';
        pixel(g, P(0.24 + j * 0.06, 0.8, z + 2), col, 1, 1);
      }
    }
  } else if (it.type === 'imprimante3d') {
    const u = 0.25 + (Math.sin(t / 600) * 0.5 + 0.5) * 0.45;
    const [x, y] = P(u, 0.5, 30);
    g.fillStyle = '#e8e8f0';
    g.fillRect(x - 2, y - 2, 5, 4);
    g.fillStyle = '#f06a2a';
    g.fillRect(x, y + 2, 1, 2);
  } else if (it.type === 'machine_cafe') {
    const ph = (t / 900) % 3;
    if (ph < 1) {
      const [x, y] = P(0.62, 0.5, 22 + ph * 10);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(x + Math.round(Math.sin(t / 200) * 1), y, 2, 2);
      g.fillRect(x + 2, y - 4, 1, 2);
    }
  } else if (it.type === 'poste_machine' && it.part === 'd') {
    if (Math.floor(t / 500) % 2) pixel(g, P(0.7, 0.2, 33), '#ffffff', 2, 1);
  } else if (it.type === 'arcade') {
    // écran en mode démo : envahisseurs, vaisseau, tir
    const cols = ['#3df2ff', '#ff4fd8', '#ffe14d', '#7dff6a'];
    const dec = Math.sin((t + (it.variante || 0) * 700) / 600) * 0.06;
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) pixel(g, P(0.28 + i * 0.12 + dec, 0.6, 52 - r * 4), cols[(r + i + (it.variante || 0)) % 4], 2, 1);
    const sx = 0.48 + Math.sin(t / 900 + (it.variante || 0)) * 0.18;
    pixel(g, P(sx, 0.6, 37), '#ffffff', 3, 1);
    const tir = (t / 320) % 1;
    pixel(g, P(sx + 0.03, 0.6, 39 + tir * 9), '#ffe14d', 1, 1);
  } else if (it.type === 'jukebox') {
    const cols = ['#ff5fa2', '#3df2ff', '#ffe14d', '#7dff6a'];
    const k = Math.floor(t / 420);
    quadY(g, P, 0.66, 0.2, 0.25, 4, 44, cols[k % 4]);
    quadY(g, P, 0.66, 0.75, 0.8, 4, 44, cols[(k + 2) % 4]);
    // notes de musique qui s'envolent
    const u = (t / 1600) % 1;
    pixel(g, P(0.62 + u * 0.3, 0.4, 52 + u * 18), u < 0.85 ? '#ffe14d' : '#7a6a2a', 2, 2);
    pixel(g, P(0.66 + u * 0.3, 0.4, 56 + u * 18), u < 0.85 ? '#ffe14d' : '#7a6a2a', 1, 4);
  }
}

// Jeux en cours (balle de baby-foot, de ping-pong, bille blanche du billard) : `actif` quand au moins deux joueurs sont là
// (un seul suffit au billard).
export function animerJeu(g, it, tx, ty, t, actif) {
  const P = projeteur(tx + 32, ty);
  if (it.type === 'billard') {
    // la blanche part du bas de la table, file vers le triangle puis revient se placer
    let u = 1.45;
    let v = 0.5;
    if (actif) {
      const c = (t % 6000) / 6000;
      if (c < 0.25) {
        const e = 1 - Math.pow(1 - c / 0.25, 2);
        u = 1.45 - e * 0.7;
        v = 0.5 + Math.sin(e * 3) * 0.06;
      } else if (c < 0.85) {
        u = 0.75;
        v = 0.5 + Math.sin(3) * 0.06;
      }
    }
    pixel(g, P(u, v, 24.5), '#ffffff', 2, 2);
  } else if (it.type === 'babyfoot' && actif) {
    const u = 0.3 + (Math.sin(t / 330) * 0.5 + 0.5) * 1.4;
    const v = 0.5 + Math.sin(t / 210) * 0.16;
    pixel(g, P(u, v, 24), '#ffffff', 2, 2);
  } else if (it.type === 'pingpong' && actif) {
    const c = (t % 1400) / 1400;
    const aller = c < 0.5;
    const e = aller ? c * 2 : (1 - c) * 2;
    const u = 0.12 + e * 1.76;
    const rebond = Math.abs(Math.sin(e * Math.PI * 2));
    pixel(g, P(u, aller ? 0.4 : 0.6, 24 + rebond * 14), '#ffffff', 2, 2);
  }
}

// ---------- télévision du salon (mur droit de la salle de pause) ----------
const cacheTele = new Map();
// Programme de la télé à l'instant t (le même pour tous les écrans) : un match de foot, puis un dessin animé.
// Ce que disent ceux qui la regardent suit ce programme (scenes.js).
const TELE_PROGRAMME_MS = 40000;
export const programmeTele = (t) => (Math.floor(t / TELE_PROGRAMME_MS) % 2 === 0 ? 'foot' : 'dessin');
export const resteProgrammeTele = (t) => TELE_PROGRAMME_MS - (t % TELE_PROGRAMME_MS);

export function spriteTele(carte, t) {
  const canal = programmeTele(t) === 'foot' ? 0 : 1;
  const f = Math.floor(t / 160) % 48;
  const cle = carte.type + '|' + canal + '|' + f;
  let r = cacheTele.get(cle);
  if (r) return r;
  const debut = Math.round(carte.tele.x0 * 32);
  const largeur = Math.round((carte.tele.x1 - carte.tele.x0) * 32);
  const hauteur = 46;
  const plat = creerCanvas(largeur, hauteur);
  const g = plat.getContext('2d');
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  };
  R(0, 0, largeur, hauteur - 2, CONTOUR);
  R(1, 1, largeur - 2, hauteur - 4, '#24242e');
  R(1, 1, largeur - 2, 1, '#3a3a48');
  const sx = 4;
  const sy = 4;
  const sw = largeur - 8;
  const sh = hauteur - 10;
  if (canal === 0) {
    // match de foot
    R(sx, sy, sw, sh, '#2f8f40');
    for (let x = 0; x < sw; x += 10) R(sx + x, sy, 5, sh, '#37a24a');
    R(sx + sw / 2, sy, 1, sh, '#e8f5e8');
    R(sx, sy, sw, 1, '#e8f5e8');
    R(sx, sy + sh - 1, sw, 1, '#e8f5e8');
    for (let a = 0; a < 24; a++) R(sx + sw / 2 + Math.cos((a / 24) * Math.PI * 2) * 6, sy + sh / 2 + Math.sin((a / 24) * Math.PI * 2) * 6, 1, 1, '#e8f5e8');
    R(sx, sy + sh / 2 - 7, 7, 1, '#e8f5e8');
    R(sx, sy + sh / 2 + 7, 7, 1, '#e8f5e8');
    R(sx + 7, sy + sh / 2 - 7, 1, 15, '#e8f5e8');
    R(sx + sw - 7, sy + sh / 2 - 7, 7, 1, '#e8f5e8');
    R(sx + sw - 7, sy + sh / 2 + 7, 7, 1, '#e8f5e8');
    R(sx + sw - 8, sy + sh / 2 - 7, 1, 15, '#e8f5e8');
    for (let i = 0; i < 3; i++) {
      R(sx + sw * 0.3 + Math.sin(f * 0.26 + i * 2) * sw * 0.16, sy + sh * (0.22 + i * 0.28) + Math.cos(f * 0.2 + i) * 3, 2, 3, '#e3342f');
      R(sx + sw * 0.7 + Math.sin(f * 0.22 + i * 1.7) * sw * 0.16, sy + sh * (0.22 + i * 0.28) + Math.sin(f * 0.18 + i) * 3, 2, 3, '#2f6fde');
    }
    R(sx + sw / 2 + Math.sin(f * 0.13) * sw * 0.36, sy + sh / 2 + Math.sin(f * 0.31) * sh * 0.32, 2, 2, '#ffffff');
    R(sx + 1, sy + 1, 19, 9, 'rgba(0,0,0,0.55)');
    g.drawImage(texteCanvas('2-1', '#ffffff'), sx + 3, sy + 2);
  } else {
    // dessin animé : petit héros qui saute, nuages, soleil
    R(sx, sy, sw, sh, '#7cc8ff');
    R(sx, sy + sh * 0.45, sw, sh * 0.2, '#a8dcff');
    for (let y = -4; y <= 4; y++) {
      const w = Math.round(Math.sqrt(17 - y * y));
      R(sx + sw - 12 - w, sy + 8 + y, w * 2, 1, '#ffe14d');
    }
    const nx = sx + ((f * 2) % (sw + 24)) - 12;
    R(nx, sy + 6, 12, 3, '#ffffff');
    R(nx + 3, sy + 4, 6, 2, '#ffffff');
    const sol = sy + sh - 8;
    R(sx, sol, sw, 8, '#58c26a');
    R(sx, sol, sw, 1, '#7ddc8a');
    const hx = sx + ((f * 3) % (sw - 8));
    const saut = Math.round(Math.abs(Math.sin(f * 0.5)) * 8);
    R(hx, sol - 8 - saut, 7, 7, '#ff8fb1');
    R(hx + 4, sol - 6 - saut, 1, 2, CONTOUR);
    R(hx + 6, sol - 6 - saut, 1, 2, CONTOUR);
    R(hx + 1, sol - 1 - saut, 2, 1, '#c4456f');
    R(hx + 4, sol - 1 - saut, 2, 1, '#c4456f');
  }
  // reflet et voyant
  R(sx + 2, sy + 2, 1, 6, 'rgba(255,255,255,0.25)');
  R(largeur - 7, hauteur - 5, 2, 1, '#ff3b3b');
  r = cisailler(plat, 'droite', debut, 14);
  if (cacheTele.size > 200) cacheTele.clear();
  cacheTele.set(cle, r);
  return r;
}

// ---------- dormeurs (salle de repos) ----------
// Couverture remontée sur un dormeur : `couche` = { ox, oy, axe, z } (voir carte.js) ; `souffle` 0 ou 1.
const cacheCouv = new Map();
export function spriteCouverture(couche, col, souffle) {
  const cle = couche.axe + '|' + couche.z + '|' + col + '|' + souffle;
  let s = cacheCouv.get(cle);
  if (s) return s;
  const axe = couche.axe;
  const z = couche.z;
  s = spriteBloc(axe === 'x' ? 2 : 1, axe === 'x' ? 1 : 2, z + 12, (g, P) => {
    const Pr = axeLit(P, axe);
    Pr(g, 0.4, 0.08, 1.9, 0.92, z, z + 3, col);
    Pr(g, 0.4, 0.08, 0.52, 0.92, z + 3, z + 4, '#f2f2f8');
    Pr(g, 0.58, 0.22, 1.66, 0.78, z + 3, z + 5 + souffle, col);
    Pr(g, 1.66, 0.3, 1.86, 0.7, z + 3, z + 6, col);
  });
  if (cacheCouv.size > 300) cacheCouv.clear();
  cacheCouv.set(cle, s);
  return s;
}

// Point de l'oreiller (coordonnées de grille et hauteur) où l'on pose la tête d'un dormeur.
export function oreiller(couche) {
  return couche.axe === 'x' ? { gx: couche.ox + 0.3, gy: couche.oy + 0.5, z: couche.z + 3 } : { gx: couche.ox + 0.5, gy: couche.oy + 0.3, z: couche.z + 3 };
}

// Pénombre de la salle de repos, avec le halo des lampes de chevet.
export function voileNuit(g, carte) {
  const P0 = projeteur(OX, OY);
  const pts = [P0(-0.3, -0.3, HW + 6), P0(W + 0.3, -0.3, HW + 6), P0(W + 0.3, 0, -12), P0(W, H, -12), P0(0, H + 0.3, -12), P0(-0.3, H + 0.3, HW + 6)];
  g.save();
  g.fillStyle = 'rgba(8, 10, 40, 0.2)';
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  g.globalCompositeOperation = 'lighter';
  for (const l of carte.lampes || []) {
    const [x, y] = P0(l.x, l.y, l.z);
    const grad = g.createRadialGradient(x, y, 2, x, y, 46);
    grad.addColorStop(0, 'rgba(255, 196, 110, 0.26)');
    grad.addColorStop(1, 'rgba(255, 196, 110, 0)');
    g.fillStyle = grad;
    g.fillRect(x - 46, y - 46, 92, 92);
  }
  g.restore();
}

// Voyants d'une baie de service selon son état (actif, démarrage, erreur, arrêté, externe).
export function ledsService(g, tx, ty, t, etat, flash = 0) {
  const P = projeteur(tx + 32, ty);
  for (let z = 10, k = 0; z < 58; z += 7, k++) {
    for (let j = 0; j < 5; j++) {
      let col = '#15171c';
      const phase = (Math.floor(t / (140 + j * 53 + k * 31)) + j * 3 + k) % 5;
      if (etat === 'actif') col = phase ? '#3dff7a' : '#0f4a22';
      else if (etat === 'demarrage') col = Math.floor(t / 180 + j + k) % 2 ? '#ffb02e' : '#4a3000';
      else if (etat === 'erreur') col = j === 4 || Math.floor(t / 400) % 2 ? '#ff3b3b' : '#4a0f0f';
      else if (etat === 'externe') col = j < 3 ? '#7fa7d9' : '#2b3a52';
      pixel(g, P(0.22 + j * 0.07, 0.82, z + 2), col, 2, 1);
    }
  }
  const bande = { actif: '#3dff7a', demarrage: '#ffb02e', erreur: '#ff3b3b', externe: '#7fa7d9' }[etat] || '#2b303a';
  quadY(g, P, 0.82, 0.18, 0.82, 59, 61, bande);
  if (flash > 0) {
    g.save();
    g.globalAlpha = Math.min(1, flash);
    quadY(g, P, 0.82, 0.12, 0.88, 2, 64, '#ffffff');
    g.restore();
  }
}

// ---------- cloisons vitrées ----------
const cacheCloisons = new Map();
export function spriteCloison(cote, typeTheme) {
  const cle = cote + typeTheme;
  let s = cacheCloisons.get(cle);
  if (s) return s;
  const cadreCol = typeTheme === 'direction' ? '#5b3418' : typeTheme === 'unreal' ? '#3a3f5a' : '#7c8594';
  const Hc = 34;
  s = spriteTuile(Hc + 6, (g, P) => {
    if (cote === 's') {
      quadY(g, P, 1, 0, 1, 3, Hc - 2, 'rgba(170,220,255,0.30)');
      quadY(g, P, 1, 0.15, 0.3, 8, Hc - 6, 'rgba(255,255,255,0.35)');
      prisme(g, P, 0, 0.97, 1, 1.03, 0, 3, cadreCol);
      prisme(g, P, 0, 0.97, 1, 1.03, Hc - 2, Hc, cadreCol);
      prisme(g, P, 0, 0.96, 0.05, 1.04, 0, Hc, cadreCol);
      prisme(g, P, 0.95, 0.96, 1, 1.04, 0, Hc, cadreCol);
    } else {
      quadX(g, P, 1, 0, 1, 3, Hc - 2, 'rgba(170,220,255,0.24)');
      quadX(g, P, 1, 0.6, 0.75, 8, Hc - 6, 'rgba(255,255,255,0.3)');
      prisme(g, P, 0.97, 0, 1.03, 1, 0, 3, cadreCol);
      prisme(g, P, 0.97, 0, 1.03, 1, Hc - 2, Hc, cadreCol);
      prisme(g, P, 0.96, 0, 1.04, 0.05, 0, Hc, cadreCol);
      prisme(g, P, 0.96, 0.95, 1.04, 1, 0, Hc, cadreCol);
    }
  });
  cacheCloisons.set(cle, s);
  return s;
}

// ---------- ascenseur (sur le mur gauche) ----------
const cacheAsc = new Map();
export function spriteAscenseur(carte, ouverture, etiquetteEtage, sens) {
  const o = Math.round(Math.max(0, Math.min(1, ouverture)) * 8);
  const cle = o + '|' + etiquetteEtage + '|' + sens + '|' + carte.type;
  let r = cacheAsc.get(cle);
  if (r) return r;
  const largeur = (carte.ascenseur.y1 - carte.ascenseur.y0) * 32;
  const debut = (H - carte.ascenseur.y1) * 32;
  const plat = creerCanvas(largeur, HW);
  const g = plat.getContext('2d');
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const metal = carte.type === 'direction' ? '#c9a227' : '#9aa3ad';
  R(5, 13, largeur - 10, HW - 13, CONTOUR);
  R(6, 14, largeur - 12, HW - 14, metal);
  R(7, 15, largeur - 14, 1, nuance(metal, 0.3));
  const ox0 = 10;
  const ox1 = largeur - 10;
  R(ox0, 19, ox1 - ox0, HW - 19, '#1b1e27');
  R(ox0 + 2, 21, ox1 - ox0 - 4, 4, '#ffe9a0');
  R(ox0 + 2, 25, ox1 - ox0 - 4, HW - 25, '#2b303c');
  const demi = (ox1 - ox0) / 2;
  const dec = Math.round((o / 8) * (demi - 2));
  const porte = (x, w) => {
    if (w <= 0) return;
    R(x, 19, w, HW - 19, '#c3cad3');
    R(x, 19, 1, HW - 19, '#e4e8ee');
    R(x + w - 1, 19, 1, HW - 19, '#7d8692');
    R(x + Math.floor(w / 2), 26, 1, HW - 34, '#aeb6c0');
  };
  porte(ox0, demi - dec);
  porte(ox0 + demi + dec, demi - dec);
  if (dec === 0) R(ox0 + demi - 1, 19, 2, HW - 19, '#5d6570');
  // indicateur d'étage
  R(largeur / 2 - 12, 3, 24, 9, CONTOUR);
  R(largeur / 2 - 11, 4, 22, 7, '#160d06');
  g.drawImage(texteCanvas(String(etiquetteEtage), '#ffa02a'), Math.round(largeur / 2 - mesurer(String(etiquetteEtage)) / 2 + 3), 4);
  g.fillStyle = sens ? '#ffa02a' : '#4a2a10';
  const ax = largeur / 2 - 9;
  if (sens >= 0) {
    R(ax + 1, 5, 1, 1, sens > 0 ? '#ffa02a' : '#4a2a10');
    R(ax, 6, 3, 1, sens > 0 ? '#ffa02a' : '#4a2a10');
  }
  if (sens <= 0) {
    R(ax, 8, 3, 1, sens < 0 ? '#ffa02a' : '#4a2a10');
    R(ax + 1, 9, 1, 1, sens < 0 ? '#ffa02a' : '#4a2a10');
  }
  r = cisailler(plat, 'gauche', debut);
  if (cacheAsc.size > 200) cacheAsc.clear();
  cacheAsc.set(cle, r);
  return r;
}

// ---------- horloge (mur gauche, salle de pause) ----------
let cacheHorloge = { cle: '', r: null };
export function spriteHorloge(carte, date, alerte) {
  const cle = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() + (alerte ? '!' : '');
  if (cacheHorloge.cle === cle) return cacheHorloge.r;
  const taille = 21;
  const plat = creerCanvas(taille, taille);
  const g = plat.getContext('2d');
  const c = 10;
  for (let y = -10; y <= 10; y++) {
    const w = Math.round(Math.sqrt(100.5 - y * y));
    g.fillStyle = CONTOUR;
    g.fillRect(c - w, c + y, w * 2 + 1, 1);
  }
  for (let y = -9; y <= 9; y++) {
    const w = Math.round(Math.sqrt(81.5 - y * y));
    g.fillStyle = alerte ? '#ff4d4d' : '#c9a227';
    g.fillRect(c - w, c + y, w * 2 + 1, 1);
  }
  for (let y = -8; y <= 8; y++) {
    const w = Math.round(Math.sqrt(64.5 - y * y));
    g.fillStyle = '#ffffff';
    g.fillRect(c - w, c + y, w * 2 + 1, 1);
  }
  g.fillStyle = CONTOUR;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillRect(Math.round(c + Math.sin(a) * 7), Math.round(c - Math.cos(a) * 7), 1, 1);
  }
  const aiguille = (frac, len, col) => {
    const a = frac * Math.PI * 2;
    for (let k = 0; k <= len; k += 0.5) {
      g.fillStyle = col;
      g.fillRect(Math.round(c + Math.sin(a) * k), Math.round(c - Math.cos(a) * k), 1, 1);
    }
  };
  aiguille(((date.getHours() % 12) + date.getMinutes() / 60) / 12, 4, CONTOUR);
  aiguille(date.getMinutes() / 60, 6, CONTOUR);
  aiguille(date.getSeconds() / 60, 6, '#e3342f');
  const debut = Math.round((H - carte.horloge.y) * 32 - taille / 2);
  const r = cisailler(plat, 'gauche', debut, 12);
  cacheHorloge = { cle, r };
  return r;
}

// ---------- tableau blanc du DG (mur droit) ----------
const COULEUR_ETAT = {
  planned: '#9aa3b0', waiting: '#4aa3ff', ready: '#9aa3b0', queued: '#4aa3ff', briefing: '#f2c14e', running: '#f2c14e',
  permission: '#ff9a1f', verifying: '#b07cff', rework: '#f2c14e', done: '#2fbf4f', failed: '#ff3b3b',
  cancelled: '#3a3a44', skipped: '#3a3a44', interrupted: '#8a8f99',
};

let cacheTableau = { cle: '', r: null };
export function spriteTableau(carte, plan, etats, nbVisibles) {
  const cle = JSON.stringify([plan && plan.dossier, plan && plan.taches.length, etats, nbVisibles]);
  if (cacheTableau.cle === cle) return cacheTableau.r;
  const debut = carte.tableau.x0 * 32 + 4;
  const largeur = (carte.tableau.x1 - carte.tableau.x0) * 32 - 8;
  const hauteur = 54;
  const plat = creerCanvas(largeur, hauteur);
  const g = plat.getContext('2d');
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  R(0, 0, largeur, hauteur - 4, CONTOUR);
  R(1, 1, largeur - 2, hauteur - 6, '#c9ced6');
  R(3, 3, largeur - 6, hauteur - 10, '#fbfbfd');
  R(4, hauteur - 5, largeur - 8, 3, '#9aa0aa');
  R(4, hauteur - 2, largeur - 8, 1, CONTOUR);
  R(10, hauteur - 6, 6, 2, '#e3342f');
  R(18, hauteur - 6, 6, 2, '#2f6fde');
  R(largeur - 18, hauteur - 7, 8, 3, '#f2f2f2');
  if (!plan || !plan.taches || !plan.taches.length) {
    g.drawImage(texteCanvas('PLAN', '#c4c9d4'), Math.round(largeur / 2 - mesurer('PLAN') / 2), 20);
  } else {
    const taches = plan.taches;
    g.drawImage(texteCanvas(String(plan.dossier || ''), '#2f6fde'), 5, 4);
    const niveau = {};
    const parRef = {};
    taches.forEach((t) => (parRef[t.ref] = t));
    const calc = (ref, pile = new Set()) => {
      if (niveau[ref] !== undefined) return niveau[ref];
      if (pile.has(ref)) return 0;
      pile.add(ref);
      const t = parRef[ref];
      let n = 0;
      for (const d of (t && t.deps) || []) if (parRef[d]) n = Math.max(n, calc(d, pile) + 1);
      niveau[ref] = n;
      return n;
    };
    taches.forEach((t) => calc(t.ref));
    const cols = [];
    taches.forEach((t) => {
      const n = Math.min(niveau[t.ref], 5);
      (cols[n] = cols[n] || []).push(t);
    });
    const nc = cols.length;
    const maxRangs = Math.max(...cols.map((c) => (c ? c.length : 0)));
    const zoneX = 5;
    const zoneY = 13;
    const zoneW = largeur - 10;
    const zoneH = hauteur - 10 - zoneY - 1;
    const cw = 17;
    const chh = maxRangs > 3 ? 8 : 9;
    const pasX = nc > 1 ? (zoneW - cw) / (nc - 1) : 0;
    const pasY = maxRangs > 1 ? Math.min(12, (zoneH - chh) / (maxRangs - 1)) : 0;
    const pos = {};
    cols.forEach((c, i) => {
      if (!c) return;
      const hTot = (c.length - 1) * pasY + chh;
      const y0 = zoneY + Math.round((zoneH - hTot) / 2);
      c.forEach((t, j) => {
        pos[t.ref] = { x: Math.round(zoneX + (nc > 1 ? i * pasX : (zoneW - cw) / 2)), y: Math.round(y0 + j * pasY) };
      });
    });
    const visibles = new Set(taches.slice(0, nbVisibles).map((t) => t.ref));
    // flèches
    g.fillStyle = '#2b4c9a';
    for (const t of taches) {
      if (!visibles.has(t.ref)) continue;
      for (const d of t.deps || []) {
        if (!pos[d] || !visibles.has(d)) continue;
        const a = pos[d];
        const b = pos[t.ref];
        const x0 = a.x + cw;
        const y0 = a.y + Math.floor(chh / 2);
        const x1 = b.x - 1;
        const y1 = b.y + Math.floor(chh / 2);
        const xm = Math.round((x0 + x1) / 2);
        R(x0, y0, Math.max(1, xm - x0), 1, '#2b4c9a');
        R(xm, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, '#2b4c9a');
        R(xm, y1, Math.max(1, x1 - xm), 1, '#2b4c9a');
        R(x1 - 2, y1 - 1, 1, 3, '#2b4c9a');
        R(x1 - 1, y1 - 1, 1, 3, '#2b4c9a');
      }
    }
    for (const t of taches) {
      if (!visibles.has(t.ref)) continue;
      const p = pos[t.ref];
      const M = modele(t.modele);
      const e = (etats && etats[t.ref]) || 'planned';
      R(p.x, p.y, cw, chh, COULEUR_ETAT[e] || '#9aa3b0');
      R(p.x + 1, p.y + 1, cw - 2, chh - 2, M.clair);
      R(p.x + 1, p.y + 1, 2, chh - 2, M.c);
      g.drawImage(texteCanvas(t.ref, '#15151f'), p.x + 4, p.y + (chh === 9 ? 1 : 0));
      if (e === 'done') R(p.x + cw - 3, p.y + 1, 2, 2, '#2fbf4f');
      if (e === 'failed') R(p.x + cw - 3, p.y + 1, 2, 2, '#ff3b3b');
    }
  }
  const r = cisailler(plat, 'droite', debut, 10);
  cacheTableau = { cle, r };
  return r;
}

export { COULEUR_ETAT };
