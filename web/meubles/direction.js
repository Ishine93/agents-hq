// Meubles, sols et murs des décors au choix de la famille « direction » (1.0.10). Contrat : web/meubles/index.js.
// Penthouse (dir_penthouse) : baies vitrées sur la ville au crépuscule, bar, salon autour d'un brasero, piano,
// piscine à débordement sur la terrasse en teck.
// Repaire du méchant (dir_repaire) : volcan creux, rivière de lave et ses ponts, bassin aux requins, fusée,
// gros bouton rouge, chat blanc du DG et carte du monde géante.

// ---------- petits outils ----------
const graine = (it, O) => O.aleatoire(O.hacher(it.type + '|' + it.x + ',' + it.y + '|' + (it.variante || 0) + (it.part || '')));

// (x, y) pixel dans le losange 64×32 d'une tuile de sol ?
function dansTuile(x, y) {
  if (y < 0 || y > 30) return false;
  const hw = y <= 15 ? 2 * y + 2 : 62 - 2 * y;
  return x >= 32 - hw && x <= 32 + hw - 1;
}
// Points (x, y) du losange, pour semer des détails.
function semer(g, rnd, n, couleurs, l = 1) {
  for (let i = 0; i < n; i++) {
    const px = Math.floor(rnd() * 64);
    const py = Math.floor(rnd() * 31);
    if (!dansTuile(px, py) || !dansTuile(px + l - 1, py)) continue;
    g.fillStyle = couleurs[i % couleurs.length];
    g.fillRect(px, py, l, 1);
  }
}

// Sprite d'une case qui descend plus bas que spriteTuile (cascade sur la tranche de la dalle). Sans contour, une
// surface continue (eau, lave) ne montre pas le quadrillage des cases : `fnContour` dessine par-dessus ce qui en a un.
function spriteGrand(O, htop, bas, fn, fnContour = null) {
  const c = O.creerCanvas(66, htop + 36 + bas);
  const g = c.getContext('2d');
  const P = O.projeteur(33, htop + 1);
  fn(g, P);
  if (fnContour) {
    const d = O.creerCanvas(66, htop + 36 + bas);
    fnContour(d.getContext('2d'), P);
    O.contourner(d);
    g.drawImage(d, 0, 0);
  }
  return { c, dx: -1, dy: -(htop + 1) };
}
// Trait sombre d'un bord (contour à la main d'une surface sans contour automatique).
function trait(g, P, O, x0, y0, x1, y1, z) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 32) + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    O.pixel(g, P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z), O.CONTOUR, 1, 1);
  }
}

// Bouteilles alignées sur une face x = cste (vues de face depuis +x).
function bouteillesX(g, P, O, x, y0, y1, z, rnd) {
  const cols = ['#2f7a3a', '#7a2a1f', '#c9a227', '#e8e2d0', '#3a5a9a', '#5a2a6a', '#d9822b'];
  let y = y0;
  while (y < y1 - 0.06) {
    const col = cols[Math.floor(rnd() * cols.length)];
    const h = 8 + Math.floor(rnd() * 4);
    O.quadX(g, P, x, y, y + 0.06, z, z + h, col);
    O.quadX(g, P, x, y + 0.02, y + 0.04, z + h, z + h + 3, O.nuance(col, -0.3));
    O.pixel(g, P(x, y + 0.02, z + h - 3), O.nuance(col, 0.5), 1, 2);
    y += 0.08 + rnd() * 0.03;
  }
}

// Coussins, dossier et accoudoirs d'un canapé tourné vers `dir`. Repère (u le long du canapé, v en profondeur :
// 0 = dos). Le dossier des canapés tournés vers le fond (ne, nw) passe devant la personne assise (sprite `avant`).
function repereSiege(P, dir) {
  // retourne un prisme (u0, v0, u1, v1, z0, z1, col) dans le repère de la case
  return (O, g, u0, v0, u1, v1, z0, z1, col) => {
    let r;
    if (dir === 'se') r = [v0, u0, v1, u1];
    else if (dir === 'nw') r = [1 - v1, u0, 1 - v0, u1];
    else if (dir === 'sw') r = [u0, v0, u1, v1];
    else r = [u0, 1 - v1, u1, 1 - v0];
    O.prisme(g, P, r[0], r[1], r[2], r[3], z0, z1, col);
  };
}

// ---------- penthouse ----------
function palmier(it, T, etat, O) {
  const rnd = graine(it, O);
  const v = it.variante || 0;
  return O.spriteTuile(96, (g, P) => {
    O.prisme(g, P, 0.28, 0.28, 0.72, 0.72, 0, 16, '#e2ddd2');
    O.prisme(g, P, 0.28, 0.28, 0.72, 0.72, 15, 17, '#f2efe8');
    O.quadZ(g, P, 17, 0.32, 0.32, 0.68, 0.68, '#4a3424');
    // tronc annelé, un peu penché
    const pench = [0.05, -0.04, 0.03, -0.06][v % 4];
    for (let z = 17, i = 0; z < 70; z += 5, i++) {
      const d = pench * ((z - 17) / 53);
      O.prisme(g, P, 0.45 + d, 0.45 - d, 0.55 + d, 0.55 - d, z, z + 5, i % 2 ? '#8a6a44' : '#6e5232');
    }
    const [cx, cy] = P(0.5 + pench, 0.5 - pench, 72);
    const verts = ['#2f8a3e', '#3fae4f', '#25703a', '#56c45f'];
    for (let f = 0; f < 8; f++) {
      const a = (f / 8) * Math.PI * 2 + v + rnd() * 0.4;
      const L = 15 + rnd() * 7;
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const x = Math.round(cx + Math.cos(a) * L * t);
        const y = Math.round(cy + Math.sin(a) * L * t * 0.45 - Math.sin(t * Math.PI) * 5 + t * t * 10);
        g.fillStyle = verts[(f + k) % verts.length];
        g.fillRect(x - 1, y - 1, 3, 2);
        if (k > 2 && k % 2) {
          g.fillRect(x - 2, y + 1, 1, 2);
          g.fillRect(x + 2, y + 1, 1, 2);
        }
      }
    }
    g.fillStyle = '#6e5232';
    g.fillRect(cx - 2, cy - 1, 4, 3);
  });
}

function sculpture(it, T, etat, O) {
  return O.spriteTuile(70, (g, P) => {
    O.prisme(g, P, 0.24, 0.24, 0.76, 0.76, 0, 26, '#f1eee8');
    O.quadZ(g, P, 26, 0.3, 0.3, 0.7, 0.7, '#ffffff');
    // anneau de bronze doré, debout sur son socle
    const [cx, cy] = P(0.5, 0.5, 26);
    for (let a = 0; a < 360; a += 3) {
      const r = (a * Math.PI) / 180;
      const x = Math.round(cx + Math.cos(r) * 9);
      const y = Math.round(cy - 16 + Math.sin(r) * 15);
      g.fillStyle = Math.cos(r - 2.3) > 0.3 ? '#f4d35e' : Math.cos(r - 2.3) > -0.4 ? '#c9a227' : '#8a6a14';
      g.fillRect(x - 1, y - 1, 3, 3);
    }
    g.fillStyle = '#e8c547';
    g.fillRect(cx - 3, cy - 3, 6, 3);
  });
}

// Piano à queue laqué noir : clavier vers le devant (+y), queue arrondie vers le fond, couvercle entrouvert.
function piano(it, T, etat, O) {
  return O.spriteBloc(2, 2, 76, (g, P) => {
    const noir = '#1c1c24';
    for (const [x, y] of [[0.34, 1.4], [1.42, 1.4], [0.5, 0.3]]) O.prisme(g, P, x, y, x + 0.08, y + 0.08, 0, 18, '#101015');
    O.prisme(g, P, 0.86, 1.5, 0.92, 1.56, 0, 5, '#c9a227'); // pédales
    // caisse : côté droit long (x = 0.3), côté courbe vers +x, queue au fond (escalier de prismes)
    const caisse = [[0.3, 1.0, 1.62, 1.56], [0.3, 0.6, 1.5, 1.0], [0.3, 0.34, 1.3, 0.6], [0.3, 0.16, 1.0, 0.34]];
    for (const [x0, y0, x1, y1] of caisse) O.prisme(g, P, x0, y0, x1, y1, 16, 30, noir);
    // couvercle levé sur sa béquille, articulé le long du côté droit
    O.prisme(g, P, 1.36, 0.9, 1.4, 0.94, 30, 54, '#3a3a46');
    O.poly(g, [P(0.3, 1.5, 31), P(0.3, 0.16, 31), P(0.95, 0.2, 60), P(1.45, 0.62, 60), P(1.55, 1.1, 58)], '#24242e');
    O.poly(g, [P(0.42, 1.36, 34), P(0.42, 0.32, 34), P(0.6, 0.3, 42), P(0.6, 1.3, 42)], '#3e3e4c');
    // cadre doré qu'on aperçoit dessous
    O.quadZ(g, P, 30.4, 1.2, 0.95, 1.52, 1.45, '#c9a227');
    // clavier et pupitre
    O.prisme(g, P, 0.28, 1.56, 1.62, 1.86, 22, 26, noir);
    O.quadZ(g, P, 26.2, 0.34, 1.6, 1.56, 1.8, '#f4f1e8');
    for (let i = 0; i < 17; i++) if (i % 7 !== 2 && i % 7 !== 6) O.quadZ(g, P, 26.4, 0.37 + i * 0.07, 1.6, 0.41 + i * 0.07, 1.69, '#15151b');
    O.quadY(g, P, 1.5, 0.6, 1.3, 31, 40, '#f4f1e8');
    for (let z = 33; z < 40; z += 2) O.quadY(g, P, 1.5, 0.66, 1.24, z, z + 0.6, '#8a8f99');
    // banquette
    for (const x of [0.62, 1.2]) O.prisme(g, P, x, 1.9, x + 0.05, 1.96, 0, 12, '#101015');
    O.prisme(g, P, 0.58, 1.88, 1.3, 1.99, 12, 15, noir);
  });
}

function sofa(it, T, etat, O) {
  const col = T.canape;
  const dir = it.dir || 'se';
  const g0 = it.part === 'g';
  const devant = dir === 'ne' || dir === 'nw';
  const coussin = ['#c9a227', '#2a4a6b', '#8c2433'][(it.x + it.y) % 3];
  const corps = (g, P) => {
    const R = repereSiege(P, dir);
    R(O, g, 0.04, 0.08, 0.96, 0.94, 0, 11, O.nuance(col, -0.12));
    R(O, g, 0.06, 0.3, 0.94, 0.92, 11, 15, O.nuance(col, 0.1));
    R(O, g, g0 ? 0.04 : 0.84, 0.1, g0 ? 0.16 : 0.96, 0.94, 11, 21, col);
    if (it.part === 'g') R(O, g, 0.3, 0.32, 0.5, 0.42, 15, 24, coussin);
  };
  const dos = (g, P) => repereSiege(P, dir)(O, g, 0.04, 0.08, 0.96, 0.3, 11, 30, col);
  const s = O.spriteTuile(44, (g, P) => {
    corps(g, P);
    if (!devant) dos(g, P);
  });
  if (devant) s.avant = O.spriteTuile(44, dos);
  return s;
}

function brasero(it, T, etat, O) {
  return O.spriteBloc(2, 2, 40, (g, P) => {
    O.prisme(g, P, 0.2, 0.2, 1.8, 1.8, 0, 13, '#4a4f58');
    O.prisme(g, P, 0.14, 0.14, 1.86, 1.86, 13, 16, '#2a2d33');
    O.quadZ(g, P, 16.2, 0.5, 0.5, 1.5, 1.5, '#15151a');
    // galets de lave et pierres
    const pierres = [[0.62, 0.7], [0.9, 0.62], [1.2, 0.74], [1.36, 1.0], [0.72, 1.1], [1.0, 1.28], [1.3, 1.3], [0.6, 1.36]];
    for (const [x, y] of pierres) O.pixel(g, P(x, y, 17), '#6b6f78', 3, 2);
    // vitre pare-vent (seulement ses arêtes)
    for (const [x0, y0, x1, y1] of [[0.42, 0.42, 1.58, 0.45], [0.42, 1.55, 1.58, 1.58], [0.42, 0.42, 0.45, 1.58], [1.55, 0.42, 1.58, 1.58]]) {
      O.prisme(g, P, x0, y0, x1, y1, 16, 24, '#bfe6f2', 'rgba(190,230,245,0.35)', 'rgba(160,210,230,0.35)');
    }
    // magazines et deux verres sur le rebord
    O.quadZ(g, P, 16.4, 0.22, 1.5, 0.42, 1.78, '#e9e2d3');
    O.quadZ(g, P, 16.6, 0.25, 1.53, 0.4, 1.75, '#8c2433');
    O.prisme(g, P, 1.62, 0.24, 1.7, 0.32, 16, 21, '#d8f2ff');
    O.prisme(g, P, 1.7, 0.34, 1.78, 0.42, 16, 21, '#d8f2ff');
  });
}

function comptoir(it, T, etat, O) {
  const rnd = graine(it, O);
  const p = it.part;
  const y0 = p === 'n' ? 0.08 : 0;
  const y1 = p === 's' ? 0.92 : 1;
  return O.spriteTuile(56, (g, P) => {
    O.prisme(g, P, 0.12, y0 + 0.02, 0.84, y1 - 0.02, 0, 26, '#3a2414');
    for (let y = y0 + 0.1; y < y1 - 0.05; y += 0.22) O.quadX(g, P, 0.84, y, y + 0.02, 3, 24, '#2a190d');
    O.quadX(g, P, 0.84, y0 + 0.02, y1 - 0.02, 2, 3.5, '#ffd27a');
    O.prisme(g, P, 0.06, y0, 0.94, y1, 26, 29, '#efece6');
    for (let i = 0; i < 2; i++) O.quadZ(g, P, 29.2, 0.2 + rnd() * 0.5, y0 + 0.1 + rnd() * 0.6, 0.3 + rnd() * 0.5, y0 + 0.14 + rnd() * 0.6, '#c9c4ba');
    if (it.cafe) {
      // machine à expresso
      O.prisme(g, P, 0.16, 0.22, 0.56, 0.78, 29, 44, '#c8ccd2');
      O.prisme(g, P, 0.16, 0.22, 0.56, 0.78, 44, 46, '#8d939c');
      O.quadX(g, P, 0.56, 0.32, 0.68, 32, 38, '#2a2d33');
      O.prisme(g, P, 0.56, 0.4, 0.66, 0.6, 37, 39, '#2a2d33');
      O.prisme(g, P, 0.6, 0.44, 0.7, 0.54, 29, 33, '#ffffff');
    } else if (p === 'n') {
      // seau à champagne
      O.prisme(g, P, 0.3, 0.3, 0.6, 0.6, 29, 38, '#d8dbe0');
      O.prisme(g, P, 0.4, 0.38, 0.5, 0.48, 38, 48, '#1f4a2a');
      O.prisme(g, P, 0.42, 0.4, 0.48, 0.46, 48, 50, '#c9a227');
    } else {
      // verres à cocktail et shaker
      O.prisme(g, P, 0.5, 0.3, 0.58, 0.38, 29, 33, '#d8f2ff');
      O.prisme(g, P, 0.46, 0.26, 0.62, 0.42, 33, 35, rnd() < 0.5 ? '#ff8f6b' : '#ffd36b');
      O.prisme(g, P, 0.3, 0.6, 0.4, 0.7, 29, 40, '#c8ccd2');
      O.prisme(g, P, 0.32, 0.62, 0.38, 0.68, 40, 43, '#8d939c');
    }
  });
}

function arriereBar(it, T, etat, O) {
  const rnd = graine(it, O);
  return O.spriteTuile(52, (g, P) => {
    O.prisme(g, P, 0.04, 0.02, 0.44, 0.98, 0, 18, '#2a190d');
    O.quadX(g, P, 0.44, 0.08, 0.92, 3, 15, '#3a2414');
    O.pixel(g, P(0.44, 0.5, 10), '#c9a227', 1, 2);
    // étagères rétroéclairées, miroir et bouteilles
    O.prisme(g, P, 0.04, 0.02, 0.24, 0.98, 18, 42, '#2a190d');
    O.quadX(g, P, 0.24, 0.06, 0.94, 19, 41, '#c98a3a');
    O.quadX(g, P, 0.24, 0.1, 0.9, 21, 39, '#e8b866');
    O.prisme(g, P, 0.04, 0.02, 0.4, 0.98, 18, 19.5, '#5a3a20');
    O.prisme(g, P, 0.04, 0.02, 0.36, 0.98, 29, 30.5, '#5a3a20');
    O.prisme(g, P, 0.04, 0.02, 0.4, 0.98, 41, 43, '#3a2414');
    bouteillesX(g, P, O, 0.3, 0.1, 0.92, 19.5, rnd);
    bouteillesX(g, P, O, 0.28, 0.12, 0.9, 30.5, rnd);
  });
}

function tabouret(it, T, etat, O) {
  const dir = it.dir || 'nw';
  const cuir = '#b98b52';
  const dossier = { nw: [0.66, 0.3, 0.72, 0.7], se: [0.28, 0.3, 0.34, 0.7], sw: [0.3, 0.28, 0.7, 0.34], ne: [0.3, 0.66, 0.7, 0.72] }[dir];
  const devant = dir === 'ne' || dir === 'nw';
  const s = O.spriteTuile(40, (g, P) => {
    O.prisme(g, P, 0.34, 0.34, 0.66, 0.66, 0, 2, '#2a2a30');
    O.prisme(g, P, 0.47, 0.47, 0.53, 0.53, 2, 11, '#c9a227');
    O.prisme(g, P, 0.38, 0.38, 0.62, 0.62, 5, 6, '#c9a227');
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.7, 11, 14, cuir);
    if (!devant) O.prisme(g, P, ...dossier, 14, 21, cuir);
  });
  if (devant) s.avant = O.spriteTuile(40, (g, P) => O.prisme(g, P, ...dossier, 14, 21, cuir));
  return s;
}

const EAU = '#3fb6d6';
function piscine(it, T, etat, O) {
  const conn = it.conn || {};
  const rnd = graine(it, O);
  const bord = '#f1eee6';
  return spriteGrand(O, 12, 14, (g, P) => {
    // eau au ras du bord (plus sombre vers le fond du bassin), reflets clairs
    O.quadZ(g, P, 0.5, 0, 0, 1, 1, conn.n ? EAU : '#36a6c8');
    O.quadZ(g, P, 0.6, 0, 0.5, 1, 1, conn.s ? EAU : '#4cc4e0');
    for (let i = 0; i < 3; i++) {
      const x = 0.08 + rnd() * 0.66;
      const y = 0.12 + rnd() * 0.7;
      O.quadZ(g, P, 0.8, x, y, x + 0.2, y + 0.035, '#8be3f2');
    }
    // margelle de pierre blanche sur trois côtés, contour à la main sur les bords extérieurs
    if (!conn.n) {
      O.prisme(g, P, 0, 0, 1, 0.12, 0, 3, bord);
      trait(g, P, O, 0, 0, 1, 0, 3);
    }
    if (!conn.w) {
      O.prisme(g, P, 0, 0, 0.12, 1, 0, 3, bord);
      trait(g, P, O, 0, 0, 0, 1, 3);
    }
    if (!conn.e) {
      O.prisme(g, P, 0.88, 0, 1, 1, 0, 3, bord);
      trait(g, P, O, 1, 0, 1, 1, 3);
      trait(g, P, O, 1, 1, 1, 1, 0);
    }
    if (!conn.s) {
      // débordement : la nappe d'eau coule sur la tranche de la dalle, jusqu'à la goulotte
      O.quadY(g, P, 1, 0, 1, -10, 0.5, '#2f9cc0');
      for (let i = 0; i < 4; i++) {
        const x = 0.06 + i * 0.25 + rnd() * 0.06;
        O.quadY(g, P, 1, x, x + 0.04, -9, 0, '#8fdcf0');
      }
      O.quadY(g, P, 1, 0, 1, -12, -10, '#e6fbff');
      trait(g, P, O, 0, 1, 1, 1, -12.5);
      if (!conn.w) trait(g, P, O, 0, 1, 0, 1, -12);
    }
  });
}

function transat(it, T, etat, O) {
  const serviette = ['#2a4a6b', '#c9a227', '#8c2433', '#2a9d8f', '#e76f51'][(it.x * 3 + it.y) % 5];
  return O.spriteTuile(40, (g, P) => {
    for (const [x, y] of [[0.26, 0.4], [0.68, 0.4], [0.26, 0.88], [0.68, 0.88]]) O.prisme(g, P, x, y, x + 0.06, y + 0.06, 0, 6, '#8a5a30');
    O.prisme(g, P, 0.24, 0.36, 0.76, 0.96, 6, 9, '#b07a48');
    O.prisme(g, P, 0.27, 0.38, 0.73, 0.94, 9, 11, '#f4f1e8');
    O.quadZ(g, P, 11.2, 0.36, 0.5, 0.64, 0.9, serviette);
    // dossier relevé (côté tête, vers le fond)
    O.poly(g, [P(0.24, 0.36, 9), P(0.76, 0.36, 9), P(0.76, 0.1, 26), P(0.24, 0.1, 26)], '#b07a48');
    O.poly(g, [P(0.27, 0.34, 11), P(0.73, 0.34, 11), P(0.73, 0.12, 26), P(0.27, 0.12, 26)], '#f4f1e8');
    O.poly(g, [P(0.36, 0.3, 14), P(0.64, 0.3, 14), P(0.64, 0.16, 23), P(0.36, 0.16, 23)], serviette);
  });
}

function parasol(it, T, etat, O) {
  const toile = ['#f4f1e8', '#2a4a6b'];
  return O.spriteTuile(80, (g, P) => {
    O.prisme(g, P, 0.36, 0.36, 0.64, 0.64, 0, 4, '#d8d3c6');
    O.prisme(g, P, 0.48, 0.48, 0.52, 0.52, 4, 66, '#e9e2d3');
    const n = 8;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 8;
      pts.push([0.5 + Math.cos(a) * 0.9, 0.5 + Math.sin(a) * 0.9]);
    }
    const pans = pts.map((p, i) => ({ a: p, b: pts[(i + 1) % n], i }));
    pans.sort((u, v) => u.a[0] + u.a[1] + u.b[0] + u.b[1] - (v.a[0] + v.a[1] + v.b[0] + v.b[1]));
    for (const pan of pans) {
      const ombre = pan.a[0] + pan.b[0] > 1.2 ? -0.18 : 0;
      O.poly(g, [P(0.5, 0.5, 74), P(pan.a[0], pan.a[1], 60), P(pan.b[0], pan.b[1], 60)], O.nuance(toile[pan.i % 2], ombre));
    }
    for (const p of pts) O.pixel(g, P(p[0], p[1], 59), '#c9a227', 2, 2);
    O.pixel(g, P(0.5, 0.5, 77), '#c9a227', 2, 3);
  });
}

// ---------- animations ----------
function animPiscine(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  for (let i = 0; i < 3; i++) {
    const ph = (t / 2600 + i * 0.37 + (it.x * 7 + it.y * 3) * 0.11) % 1;
    const x = 0.12 + ((i * 0.31 + ph * 0.6) % 0.76);
    const y = 0.18 + ((i * 0.27 + it.x * 0.13) % 0.62);
    O.pixel(g, P(x, y, 1.4), ph < 0.5 ? '#c8f4ff' : '#9fe6f7', 3, 1);
  }
  if (!(it.conn || {}).s) {
    // filets d'eau qui tombent
    for (let i = 0; i < 3; i++) {
      const ph = (t / 700 + i * 0.33 + it.x * 0.21) % 1;
      O.pixel(g, P(0.15 + i * 0.3, 1, -1 - ph * 8), '#e6fbff', 1, 2);
    }
  }
}

function animBrasero(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const cols = ['#fff3a0', '#ffd23f', '#ff9a1f', '#ff5a1f'];
  for (let i = 0; i < 9; i++) {
    const u = 0.62 + (i % 3) * 0.36;
    const v = 0.62 + Math.floor(i / 3) * 0.36;
    const f = Math.sin(t / 130 + i * 1.7) * 0.5 + 0.5;
    const h = 4 + Math.round(f * 7) + (i % 2) * 2;
    const [x, y] = P(u, v, 17);
    for (let k = 0; k < h; k++) {
      g.fillStyle = cols[Math.min(3, Math.floor((k / h) * 4))];
      g.fillRect(x - (k < h / 2 ? 1 : 0), y - k, k < h / 2 ? 3 : 1, 1);
    }
  }
}

// ---------- sols ----------
const SOLS_DIR = {
  // grandes dalles de travertin : petites cavités allongées, joints clairs
  dir_travertin(g, col, { rnd }, O) {
    semer(g, rnd, 22, [O.nuance(col, -0.1), O.nuance(col, -0.06), O.nuance(col, 0.08)], 2);
    semer(g, rnd, 6, [O.nuance(col, -0.16)], 3);
    g.fillStyle = O.nuance(col, 0.12);
    for (let r = 0; r <= 15; r++) g.fillRect(32 - 2 * r - 2, r, 2, 1);
  },
  // lames de teck d'une terrasse, avec leurs joints sombres et leurs vis
  dir_teck(g, col, { variante }, O) {
    const Pt = O.projeteur(32, 0);
    const teintes = [col, O.nuance(col, -0.07), O.nuance(col, 0.06), O.nuance(col, -0.12)];
    for (let b = 0; b < 5; b++) {
      O.poly(g, [Pt(0, b / 5), Pt(1, b / 5), Pt(1, (b + 1) / 5), Pt(0, (b + 1) / 5)], teintes[(b + variante) % 4]);
      O.poly(g, [Pt(0, (b + 1) / 5 - 0.03), Pt(1, (b + 1) / 5 - 0.03), Pt(1, (b + 1) / 5), Pt(0, (b + 1) / 5)], O.nuance(col, -0.35));
      for (const u of [0.15, 0.85]) O.pixel(g, Pt(u, b / 5 + 0.08), O.nuance(col, -0.25), 1, 1);
    }
  },
};

// ---------- murs ----------
// Baies vitrées du sol au plafond sur la ville au crépuscule (penthouse).
function murBaies(g, longueur, cote, rnd, O) {
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const ciel = ['#2b2558', '#3d2f6e', '#5a3a7a', '#86477e', '#b8567a', '#e07a6a', '#f2a65a', '#f7c873'];
  const horizon = 50;
  for (let i = 0; i < ciel.length; i++) {
    const y0 = 6 + Math.floor(((horizon - 6) * i) / ciel.length);
    const y1 = 6 + Math.floor(((horizon - 6) * (i + 1)) / ciel.length);
    R(0, y0, longueur, y1 - y0, ciel[i]);
  }
  for (let i = 0; i < longueur / 9; i++) R(Math.floor(rnd() * longueur), 7 + Math.floor(rnd() * 18), 1, 1, rnd() < 0.3 ? '#fff4c4' : '#aab4ff');
  // soleil couchant sur le mur droit
  if (cote === 'droite') {
    const cx = 300;
    for (let y = -9; y <= 0; y++) {
      const w = Math.round(Math.sqrt(90 - y * y));
      R(cx - w, horizon + y, w * 2, 1, y > -3 ? '#ffe9a0' : '#ffd36b');
    }
  }
  // la ville en contrebas : toits lointains, puis immeubles proches éclairés
  R(0, horizon, longueur, HW_ - horizon, '#3a2f5a');
  let x = 0;
  while (x < longueur) {
    const w = 6 + Math.floor(rnd() * 10);
    const h = 3 + Math.floor(rnd() * 9);
    R(x, horizon - h, w, h, '#4a3a68');
    x += w + Math.floor(rnd() * 3);
  }
  x = 0;
  while (x < longueur) {
    const w = 8 + Math.floor(rnd() * 14);
    const top = horizon - 4 + Math.floor(rnd() * 12);
    R(x, top, w, HW_ - top, '#2a2246');
    R(x, top, w, 1, '#5a4a7a');
    for (let yy = top + 3; yy < HW_ - 8; yy += 4) {
      for (let xx = x + 2; xx < x + w - 2; xx += 3) if (rnd() < 0.45) R(xx, yy, 1, 2, rnd() < 0.7 ? '#ffd98a' : '#9fd3ff');
    }
    x += w + 1 + Math.floor(rnd() * 4);
  }
  // reflets sur le verre
  for (let p = 0; p < longueur; p += 32) {
    if (rnd() < 0.5) continue;
    for (let k = 0; k < 14; k++) R(p + 6 + k, 30 - k, 1, 2, 'rgba(255,255,255,0.10)');
  }
  // montants, traverse, poutre du haut et seuil
  for (let p = 0; p < longueur; p += 32) {
    R(p, 0, 2, HW_, '#d9dce2');
    R(p + 2, 0, 1, HW_, '#9aa0aa');
  }
  R(0, 60, longueur, 2, '#d9dce2');
  R(0, 62, longueur, 1, '#9aa0aa');
  R(0, 0, longueur, 6, '#eceae4');
  R(0, 6, longueur, 1, '#b8b4aa');
  R(0, HW_ - 5, longueur, 5, '#cfcac0');
  R(0, HW_ - 5, longueur, 1, '#f1eee8');
}
const HW_ = 84;

function decorMursPenthouse(g, cote, longueur, etage, O) {
  if (cote === 'droite') O.enseigneQG(g);
  else O.plaqueEtage(g, etage);
}

// ---------- repaire du méchant ----------
const JAUNE = '#f5c400';
const LAVE = ['#e8551a', '#ff7a1a', '#ffb52e', '#ffe27a'];

// Bandes jaunes et noires le long d'une face y = cste (x0..x1) ou x = cste (y0..y1).
function hachuresY(g, P, O, y, x0, x1, z0, z1) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.12));
  for (let i = 0; i < n; i++) O.quadY(g, P, y, x0 + ((x1 - x0) * i) / n, x0 + ((x1 - x0) * (i + 1)) / n, z0, z1, i % 2 ? '#1d1d1d' : JAUNE);
}
function hachuresX(g, P, O, x, y0, y1, z0, z1) {
  const n = Math.max(2, Math.round((y1 - y0) / 0.12));
  for (let i = 0; i < n; i++) O.quadX(g, P, x, y0 + ((y1 - y0) * i) / n, y0 + ((y1 - y0) * (i + 1)) / n, z0, z1, i % 2 ? '#1d1d1d' : JAUNE);
}

// Fusée de secours du DG sur son pas de tir, avec sa tour de lancement.
function fusee(it, T, etat, O) {
  return O.spriteBloc(2, 2, 112, (g, P) => {
    O.prisme(g, P, 0.08, 0.08, 1.92, 1.92, 0, 6, '#4a4f58');
    hachuresY(g, P, O, 1.92, 0.08, 1.92, 1, 5);
    hachuresX(g, P, O, 1.92, 0.08, 1.92, 1, 5);
    O.quadZ(g, P, 6.2, 0.7, 0.7, 1.5, 1.5, '#2a2d33');
    // tour de lancement (treillis rouge) et son bras
    const tour = '#b8322a';
    for (const [x, y] of [[0.14, 0.14], [0.44, 0.14], [0.14, 0.44], [0.44, 0.44]]) O.prisme(g, P, x, y, x + 0.05, y + 0.05, 6, 90, tour);
    for (let z = 16; z < 90; z += 14) {
      O.prisme(g, P, 0.14, 0.44, 0.49, 0.49, z, z + 2, tour);
      O.prisme(g, P, 0.44, 0.14, 0.49, 0.49, z, z + 2, tour);
    }
    O.prisme(g, P, 0.49, 0.28, 0.9, 0.34, 74, 77, '#8a8f99');
    O.prisme(g, P, 0.12, 0.12, 0.51, 0.51, 90, 93, '#2a2d33');
    O.pixel(g, P(0.3, 0.3, 95), '#ff3b3b', 2, 2);
    // ailerons, tuyère, fuselage, hublot, coiffe
    O.prisme(g, P, 0.92, 0.92, 1.28, 1.28, 6, 12, '#2a2d33');
    O.prisme(g, P, 1.04, 1.28, 1.16, 1.52, 10, 30, '#d2382c');
    O.prisme(g, P, 1.28, 1.04, 1.52, 1.16, 10, 30, '#b02a20');
    O.prisme(g, P, 0.86, 0.86, 1.34, 1.34, 12, 84, '#eef0f2');
    O.prisme(g, P, 0.86, 0.86, 1.34, 1.34, 56, 61, '#2a2d33');
    O.prisme(g, P, 0.86, 0.86, 1.34, 1.34, 20, 23, '#d2382c');
    O.quadY(g, P, 1.34, 1.0, 1.2, 66, 74, '#2a2d33');
    O.quadY(g, P, 1.34, 1.03, 1.17, 67, 73, '#7fd3ff');
    O.prisme(g, P, 0.9, 0.9, 1.3, 1.3, 84, 92, '#d2382c');
    O.prisme(g, P, 0.96, 0.96, 1.24, 1.24, 92, 99, '#d2382c');
    O.prisme(g, P, 1.03, 1.03, 1.17, 1.17, 99, 106, '#d2382c');
    O.prisme(g, P, 1.08, 1.08, 1.12, 1.12, 106, 110, '#eef0f2');
    O.prisme(g, P, 1.04, 0.62, 1.16, 0.86, 10, 30, '#d2382c');
  });
}

// Chat blanc à poils longs sur son coussin de velours (le chat du méchant).
function chat(it, T, etat, O) {
  return O.spriteTuile(52, (g, P) => {
    O.prisme(g, P, 0.26, 0.26, 0.74, 0.74, 0, 14, '#4a1a3a');
    O.prisme(g, P, 0.26, 0.26, 0.74, 0.74, 12, 14, '#c9a227');
    O.prisme(g, P, 0.22, 0.22, 0.78, 0.78, 14, 18, '#7a2a8a');
    O.pixel(g, P(0.22, 0.22, 18), '#c9a227', 2, 2);
    O.pixel(g, P(0.78, 0.78, 16), '#c9a227', 2, 2);
    const [cx, cy] = P(0.5, 0.5, 18);
    const R = (x, y, w, h, col) => {
      g.fillStyle = col;
      g.fillRect(cx + x, cy + y, w, h);
    };
    // corps en boule, tête, oreilles, yeux bleus, collier doré
    R(-8, -9, 16, 8, '#f2f2f6');
    R(-9, -7, 18, 5, '#f2f2f6');
    R(-6, -11, 12, 3, '#f2f2f6');
    R(-8, -3, 16, 2, '#cfd0da');
    R(-9, -13, 9, 8, '#f8f8fb');
    R(-10, -12, 11, 6, '#f8f8fb');
    R(-9, -16, 3, 3, '#f8f8fb');
    R(-4, -16, 3, 3, '#f8f8fb');
    R(-8, -15, 1, 1, '#ff9fb8');
    R(-3, -15, 1, 1, '#ff9fb8');
    R(-8, -11, 2, 2, '#3a8ad6');
    R(-4, -11, 2, 2, '#3a8ad6');
    R(-8, -11, 1, 1, '#15151f');
    R(-4, -11, 1, 1, '#15151f');
    R(-6, -9, 1, 1, '#ff7f9f');
    R(-8, -6, 7, 1, '#c9a227');
    R(-5, -5, 2, 2, '#f4d35e');
  });
}

// Gros bouton rouge sur sa colonne, capot de verre relevé.
function bouton(it, T, etat, O) {
  return O.spriteTuile(52, (g, P) => {
    O.prisme(g, P, 0.36, 0.36, 0.64, 0.64, 0, 26, '#3a3d44');
    hachuresY(g, P, O, 0.64, 0.36, 0.64, 4, 10);
    hachuresX(g, P, O, 0.64, 0.36, 0.64, 4, 10);
    O.prisme(g, P, 0.28, 0.28, 0.72, 0.72, 26, 29, JAUNE);
    O.prisme(g, P, 0.38, 0.38, 0.62, 0.62, 29, 32, '#b01a22');
    O.prisme(g, P, 0.41, 0.41, 0.59, 0.59, 32, 35, '#e3242f');
    O.pixel(g, P(0.45, 0.45, 35.5), '#ff9a9a', 2, 1);
    O.poly(g, [P(0.3, 0.3, 29), P(0.7, 0.3, 29), P(0.7, 0.26, 44), P(0.3, 0.26, 44)], 'rgba(200,235,255,0.45)');
  });
}

// Trappe dans le sol devant le bureau du DG (on y marche… à ses risques).
function trappe(it, T, etat, O) {
  const conn = it.conn || {};
  return O.spriteTuile(8, (g, P) => {
    O.quadZ(g, P, 0.3, 0, 0.1, 1, 0.9, '#2b2e34');
    O.quadZ(g, P, 0.4, 0, 0.48, 1, 0.52, '#121317');
    for (const x of [0.25, 0.75]) {
      O.quadZ(g, P, 0.5, x - 0.04, 0.3, x + 0.04, 0.34, '#5a5f68');
      O.quadZ(g, P, 0.5, x - 0.04, 0.66, x + 0.04, 0.7, '#5a5f68');
    }
    const n = 8;
    for (let i = 0; i < n; i++) {
      const col = i % 2 ? '#1d1d1d' : JAUNE;
      O.quadZ(g, P, 0.6, i / n, 0, (i + 1) / n, 0.1, col);
      O.quadZ(g, P, 0.6, i / n, 0.9, (i + 1) / n, 1, col);
    }
    if (!conn.w) for (let i = 0; i < n; i++) O.quadZ(g, P, 0.6, 0, i / n, 0.08, (i + 1) / n, i % 2 ? '#1d1d1d' : JAUNE);
    if (!conn.e) for (let i = 0; i < n; i++) O.quadZ(g, P, 0.6, 0.92, i / n, 1, (i + 1) / n, i % 2 ? JAUNE : '#1d1d1d');
  }, false);
}

// Bassin aux requins vitré (3 × 2 cases) : un requin derrière la vitre, un aileron qui tourne en surface (animé).
function requins(it, T, etat, O) {
  return O.spriteBloc(3, 2, 40, (g, P) => {
    O.prisme(g, P, 0, 0, 3, 2, 0, 3, '#3a3d44');
    hachuresY(g, P, O, 2, 0, 3, 0.5, 2.5);
    hachuresX(g, P, O, 3, 0, 2, 0.5, 2.5);
    O.prisme(g, P, 0.08, 0.08, 2.92, 1.92, 3, 15, '#1c4d78', '#1f5a8c', '#163f63');
    // requin derrière la vitre de devant
    const s = '#5d6b78';
    O.quadY(g, P, 1.92, 0.7, 1.7, 7, 11, s);
    O.quadY(g, P, 1.92, 0.5, 0.7, 6, 12, s);
    O.quadY(g, P, 1.92, 1.7, 1.9, 8, 10, s);
    O.quadY(g, P, 1.92, 1.1, 1.3, 11, 13, s);
    O.quadY(g, P, 1.92, 0.8, 1.6, 7, 8, '#c8d0d8');
    O.pixel(g, P(1.6, 1.92, 10), '#15151f', 1, 1);
    // surface
    O.quadZ(g, P, 15, 0.08, 0.08, 2.92, 1.92, '#24689a');
    for (const [x, y] of [[0.4, 0.4], [1.6, 0.7], [2.3, 1.4], [0.9, 1.5], [2.5, 0.4]]) O.quadZ(g, P, 15.2, x, y, x + 0.3, y + 0.04, '#3f8cc0');
    // cadre et arêtes de verre
    for (const [x, y] of [[0, 0], [2.92, 0], [0, 1.92], [2.92, 1.92]]) O.prisme(g, P, x, y, x + 0.08, y + 0.08, 3, 17, '#8d939c');
    O.prisme(g, P, 0, 0, 3, 0.08, 15, 17, '#8d939c');
    O.prisme(g, P, 0, 0, 0.08, 2, 15, 17, '#8d939c');
    O.prisme(g, P, 0, 1.92, 3, 2, 15, 17, '#a9afb8');
    O.prisme(g, P, 2.92, 0, 3, 2, 15, 17, '#a9afb8');
    O.quadY(g, P, 2, 0.2, 0.5, 5, 13, 'rgba(255,255,255,0.18)');
  });
}

// Le diamant volé, sous sa cloche de verre.
function diamant(it, T, etat, O) {
  return O.spriteTuile(64, (g, P) => {
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.7, 0, 24, '#1d1e24');
    O.prisme(g, P, 0.26, 0.26, 0.74, 0.74, 22, 25, '#c9a227');
    O.prisme(g, P, 0.42, 0.42, 0.58, 0.58, 25, 28, '#7a2a8a');
    const [cx, cy] = P(0.5, 0.5, 34);
    const R = (x, y, w, h, col) => {
      g.fillStyle = col;
      g.fillRect(cx + x, cy + y, w, h);
    };
    R(-5, -4, 10, 3, '#bff4ff');
    R(-3, -6, 6, 2, '#e8fdff');
    R(-4, -1, 8, 2, '#7fd8f0');
    R(-2, 1, 4, 2, '#5fb8d8');
    R(-1, 3, 2, 1, '#5fb8d8');
    R(-2, -5, 1, 1, '#ffffff');
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.7, 25, 50, 'rgba(210,240,255,0.25)', 'rgba(190,230,255,0.22)', 'rgba(170,215,245,0.22)');
    O.quadZ(g, P, 50.2, 0.32, 0.32, 0.68, 0.68, 'rgba(255,255,255,0.3)');
  });
}

// Rivière de lave : coulée lumineuse entre deux berges de basalte, garde-corps jaunes ; à l'extrémité avant,
// elle tombe dans le vide par-dessus la dalle.
function laveDessin(g, P, O, conn, rnd) {
  O.quadZ(g, P, 1, 0, 0.16, 1, 0.84, LAVE[0]);
  for (let i = 0; i < 5; i++) {
    const x = rnd() * 0.85;
    const y = 0.22 + rnd() * 0.52;
    O.quadZ(g, P, 1.2, x, y, x + 0.12 + rnd() * 0.12, y + 0.04, LAVE[1 + (i % 3)]);
  }
  for (let i = 0; i < 2; i++) {
    const x = rnd() * 0.8;
    const y = 0.24 + rnd() * 0.44;
    O.quadZ(g, P, 1.3, x, y, x + 0.1, y + 0.08, '#6a2410');
  }
  if (!conn.w) O.quadZ(g, P, 1.4, 0, 0.2, 0.18, 0.8, LAVE[3]);
  for (const [y0, y1] of [[0, 0.16], [0.84, 1]]) {
    O.prisme(g, P, 0, y0, 1, y1, 0, 5, '#2e2628');
    O.quadZ(g, P, 5.1, 0.2, y0 + 0.04, 0.34, y0 + 0.08, '#4a3d3f');
    O.quadZ(g, P, 5.1, 0.62, y0 + 0.08, 0.8, y0 + 0.12, '#3a3033');
  }
  O.quadY(g, P, 0.16, 0, 1, 1, 5, '#ff8a3a');
  trait(g, P, O, 0, 0, 1, 0, 5);
  trait(g, P, O, 0, 1, 1, 1, 0);
  if (!conn.e) {
    // chute de lave sur la tranche de la dalle
    O.quadX(g, P, 1, 0.16, 0.84, -12, 1, LAVE[1]);
    O.quadX(g, P, 1, 0.3, 0.42, -12, 0, LAVE[3]);
    O.quadX(g, P, 1, 0.58, 0.66, -11, 0, LAVE[2]);
    O.quadX(g, P, 1, 0, 0.16, -10, 5, '#2e2628');
    O.quadX(g, P, 1, 0.84, 1, -10, 5, '#2e2628');
    trait(g, P, O, 1, 0, 1, 1, 5);
  }
}
function garde(g, P, O, y, x0, x1) {
  for (const x of [0.12, 0.62]) O.prisme(g, P, x, y - 0.03, x + 0.06, y + 0.03, 5, 18, JAUNE);
  O.prisme(g, P, x0, y - 0.025, x1, y + 0.025, 16, 18.5, JAUNE);
  O.prisme(g, P, x0, y - 0.02, x1, y + 0.02, 10, 11.5, '#1d1d1d');
}
function lave(it, T, etat, O) {
  const conn = it.conn || {};
  const rnd = graine(it, O);
  return spriteGrand(O, 24, 14, (g, P) => laveDessin(g, P, O, conn, rnd), (g, P) => {
    garde(g, P, O, 0.06, 0, 1);
    garde(g, P, O, 0.94, 0, 1);
  });
}

// Passerelle de caillebotis au-dessus de la lave ; le garde-corps de devant passe devant celui qui traverse.
function pont(it, T, etat, O) {
  const rnd = graine(it, O);
  const s = spriteGrand(O, 30, 14, (g, P) => laveDessin(g, P, O, { w: true, e: true }, rnd), (g, P) => {
    O.prisme(g, P, 0.12, -0.02, 0.88, 1.02, 3, 7, '#5a5f68');
    for (let y = 0.08; y < 1; y += 0.12) O.quadZ(g, P, 7.1, 0.14, y, 0.86, y + 0.025, '#3a3d44');
    O.quadZ(g, P, 7.2, 0.14, 0.02, 0.18, 0.98, '#7a8088');
    for (const y of [0.1, 0.5, 0.9]) O.prisme(g, P, 0.12, y - 0.03, 0.17, y + 0.03, 7, 22, '#8d939c');
    O.prisme(g, P, 0.12, -0.02, 0.17, 1.02, 20, 22, '#8d939c');
  });
  s.avant = O.spriteTuile(30, (g, P) => {
    for (const y of [0.1, 0.5, 0.9]) O.prisme(g, P, 0.83, y - 0.03, 0.88, y + 0.03, 3, 22, '#8d939c');
    O.prisme(g, P, 0.83, -0.02, 0.88, 1.02, 20, 22, '#8d939c');
    O.prisme(g, P, 0.83, -0.02, 0.88, 1.02, 12, 13, '#6a7078');
  });
  return s;
}

// Projecteur d'hologramme posé sur la table de guerre (le globe tourne, voir ANIMES).
function hologramme(it, T, etat, O) {
  return O.spriteTuile(70, (g, P) => {
    O.prisme(g, P, 0.38, 0.62, 0.62, 0.86, 24, 27, '#2a2d33');
    O.quadZ(g, P, 27.2, 0.42, 0.66, 0.58, 0.82, '#3df2ff');
  });
}

// Caisses de dynamite (sous le salon des sbires).
function caisseTnt(it, T, etat, O) {
  const v = it.variante || 0;
  return O.spriteTuile(40, (g, P) => {
    O.prisme(g, P, 0.12, 0.18, 0.88, 0.82, 0, 18, '#a8743c');
    O.quadY(g, P, 0.82, 0.12, 0.88, 7, 11, '#c0392b');
    O.quadX(g, P, 0.88, 0.18, 0.82, 7, 11, '#c0392b');
    for (const x of [0.2, 0.8]) O.quadY(g, P, 0.82, x - 0.02, x + 0.02, 0, 18, '#7a5028');
    if (v === 0) {
      O.prisme(g, P, 0.24, 0.3, 0.7, 0.7, 18, 30, '#a8743c');
      O.quadY(g, P, 0.7, 0.24, 0.7, 22, 26, '#c0392b');
      for (const y of [0.4, 0.5, 0.6]) O.prisme(g, P, 0.3, y, 0.66, y + 0.06, 30, 33, '#d2382c');
      O.prisme(g, P, 0.62, 0.48, 0.64, 0.5, 33, 38, '#2a2a2a');
    }
  });
}

// Mange-debout de la cantine, avec son plateau de guimauves.
function mangeDebout(it, T, etat, O) {
  return O.spriteTuile(44, (g, P) => {
    O.prisme(g, P, 0.34, 0.34, 0.66, 0.66, 0, 2, '#2a2d33');
    O.prisme(g, P, 0.47, 0.47, 0.53, 0.53, 2, 28, '#5a5f68');
    O.prisme(g, P, 0.16, 0.16, 0.84, 0.84, 28, 31, '#3a3d44');
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.62, 31, 32, '#c8ccd2');
    for (const [x, y] of [[0.36, 0.36], [0.5, 0.38], [0.42, 0.48], [0.58, 0.5], [0.62, 0.38]]) O.prisme(g, P, x, y, x + 0.07, y + 0.07, 32, 35, '#fff6f0');
    for (let i = 0; i < 3; i++) O.prisme(g, P, 0.2 + i * 0.03, 0.66, 0.22 + i * 0.03, 0.82, 31.5, 32.5, '#c9a46a');
  });
}

// Fût de déchets toxiques qui luit.
function tonneau(it, T, etat, O) {
  return O.spriteTuile(40, (g, P) => {
    O.prisme(g, P, 0.28, 0.28, 0.72, 0.72, 0, 26, '#c9a227');
    for (const z of [6, 19]) O.prisme(g, P, 0.27, 0.27, 0.73, 0.73, z, z + 2, '#8a6a14');
    O.quadY(g, P, 0.72, 0.38, 0.62, 10, 16, '#1d1d1d');
    O.pixel(g, P(0.5, 0.72, 14), JAUNE, 2, 2);
    O.quadZ(g, P, 26.2, 0.32, 0.32, 0.68, 0.68, '#7dff6a');
    O.quadZ(g, P, 26.4, 0.4, 0.4, 0.6, 0.6, '#c8ffb0');
  });
}

// ---------- animations du repaire ----------
function animLave(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  // bulles qui gonflent et éclatent, filets clairs qui glissent vers l'avant
  const ph = (t / 1700 + it.x * 0.37) % 1;
  const bx = 0.2 + ((it.x * 0.29) % 0.6);
  const by = 0.3 + ((it.x * 0.17) % 0.4);
  if (ph < 0.8) O.pixel(g, P(bx, by, 1.5 + ph * 2), ph < 0.6 ? LAVE[2] : LAVE[3], ph < 0.4 ? 2 : 3, ph < 0.4 ? 1 : 2);
  else O.pixel(g, P(bx, by, 4 + (ph - 0.8) * 20), LAVE[3], 1, 1);
  const u = (t / 2400 + it.x * 0.21) % 1;
  O.pixel(g, P(u, 0.5 + Math.sin(it.x + t / 900) * 0.12, 1.4), LAVE[3], 3, 1);
  if (!(it.conn || {}).e && !it.passage) {
    for (let i = 0; i < 3; i++) {
      const v = (t / 600 + i * 0.33) % 1;
      O.pixel(g, P(1, 0.3 + i * 0.16, -1 - v * 10), LAVE[3], 1, 2);
    }
  }
}

function animRequins(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const a = t / 2600;
  const x = 1.5 + Math.cos(a) * 1.05;
  const y = 1.0 + Math.sin(a) * 0.55;
  const [cx, cy] = P(x, y, 15);
  const sens = -Math.sin(a) * 1.05 - Math.cos(a) * 0.55 > 0 ? 1 : -1;
  // sillage, puis l'aileron
  g.fillStyle = '#8fc8ea';
  g.fillRect(cx - 7 * sens - (sens < 0 ? 4 : 0), cy, 8, 1);
  g.fillStyle = '#15151f';
  for (let k = 0; k < 7; k++) {
    const w = 7 - k;
    g.fillRect(sens > 0 ? cx - w + 2 : cx - 2, cy - k - 1, w + 1, 1);
  }
  g.fillStyle = '#5d6b78';
  for (let k = 1; k < 6; k++) {
    const w = 5 - k;
    g.fillRect(sens > 0 ? cx - w + 2 : cx - 1, cy - k - 1, Math.max(1, w - 1), 1);
  }
  const b = (t / 900) % 1;
  O.pixel(g, P(0.5, 1.5, 4 + b * 10), 'rgba(200,235,255,0.7)', 1, 1);
  O.pixel(g, P(2.4, 1.2, 4 + ((b + 0.5) % 1) * 10), 'rgba(200,235,255,0.7)', 1, 1);
}

function animHologramme(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const [bx, by] = P(0.5, 0.74, 27);
  const [cx, cy] = P(0.5, 0.74, 50);
  g.save();
  g.globalAlpha = 0.28;
  g.fillStyle = '#3df2ff';
  for (let k = 0; k < by - cy - 6; k++) {
    const w = 2 + Math.round((k * 10) / (by - cy));
    g.fillRect(bx - w, by - k, w * 2, 1);
  }
  g.restore();
  // globe en fil de fer qui tourne, cibles rouges
  const r = 11;
  g.fillStyle = '#7ff8ff';
  for (let a = 0; a < 360; a += 8) {
    const q = (a * Math.PI) / 180;
    g.fillRect(Math.round(cx + Math.cos(q) * r), Math.round(cy + Math.sin(q) * r), 1, 1);
  }
  for (let m = 0; m < 3; m++) {
    const ph = t / 1400 + (m * Math.PI) / 3;
    const k = Math.cos(ph);
    for (let a = -90; a <= 90; a += 10) {
      const q = (a * Math.PI) / 180;
      g.fillRect(Math.round(cx + Math.cos(q) * r * k), Math.round(cy + Math.sin(q) * r), 1, 1);
    }
  }
  g.fillRect(cx - r, cy, r * 2, 1);
  if (Math.floor(t / 500) % 2) {
    g.fillStyle = '#ff3b3b';
    g.fillRect(cx + 3, cy - 4, 2, 2);
    g.fillRect(cx - 6, cy + 3, 2, 2);
  }
}

function animFusee(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  // vapeur qui s'échappe sous la fusée
  for (let i = 0; i < 4; i++) {
    const ph = (t / 1800 + i * 0.25) % 1;
    const [x, y] = P(1.1 + (i % 2 ? 0.3 : -0.3) * ph * 2, 1.1 + (i < 2 ? 0.3 : -0.2) * ph * 2, 6 + ph * 14);
    g.fillStyle = `rgba(235,240,245,${(0.6 * (1 - ph)).toFixed(2)})`;
    const w = 3 + Math.round(ph * 5);
    g.fillRect(x - w, y - 2, w * 2, 3);
  }
}

function animDiamant(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const k = Math.floor(t / 300) % 6;
  if (k < 2) {
    const [x, y] = P(0.5, 0.5, 34);
    g.fillStyle = '#ffffff';
    const dx = k ? 3 : -3;
    g.fillRect(x + dx, y - 8, 1, 5);
    g.fillRect(x + dx - 2, y - 6, 5, 1);
  }
}

function animChat(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const [cx, cy] = P(0.5, 0.5, 18);
  // la queue qui balance
  const a = Math.sin(t / 500) * 0.6;
  g.fillStyle = '#f2f2f6';
  for (let k = 0; k < 7; k++) {
    const x = Math.round(cx + 8 + k * Math.cos(a) * 0.9);
    const y = Math.round(cy - 4 - k * Math.sin(a + 0.9));
    g.fillRect(x, y, 2, 2);
  }
}

// ---------- sols du repaire ----------
SOLS_DIR.dir_tole = (g, col, { variante }, O) => {
  // tôle larmée : petits reliefs en chevrons, rivets aux coins
  const Pt = O.projeteur(32, 0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const u = 0.12 + i * 0.24;
      const v = 0.12 + j * 0.24;
      const [x, y] = Pt(u, v);
      g.fillStyle = O.nuance(col, 0.14);
      if ((i + j) % 2) g.fillRect(x - 2, y, 4, 1);
      else {
        g.fillRect(x - 1, y - 1, 1, 1);
        g.fillRect(x, y, 1, 1);
        g.fillRect(x + 1, y + 1, 1, 1);
      }
    }
  }
  for (const [u, v] of [[0.04, 0.04], [0.96, 0.04], [0.04, 0.96], [0.96, 0.96]]) O.pixel(g, Pt(u, v), O.nuance(col, 0.25), 2, 1);
  if (variante === 0) O.pixel(g, Pt(0.5, 0.5), O.nuance(col, -0.25), 6, 1);
};
SOLS_DIR.dir_grille = (g, col, info, O) => {
  // dalles sombres et quadrillage cyan lumineux (salle de guerre)
  const Pt = O.projeteur(32, 0);
  for (let i = 0; i <= 16; i++) {
    O.pixel(g, Pt(i / 16, 0.02), '#2fb6d9', 1, 1);
    O.pixel(g, Pt(0.02, i / 16), '#2fb6d9', 1, 1);
  }
  for (let i = 1; i < 4; i++) for (let j = 1; j < 4; j++) O.pixel(g, Pt(i / 4, j / 4), '#1f5a6a', 1, 1);
};

// ---------- murs du repaire ----------
// Basalte sombre, failles de lave, poutrelles d'acier rivetées et bande de danger en bas.
function murRoche(g, longueur, cote, rnd, O) {
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  R(0, 0, longueur, HW_, '#151112');
  const pierres = ['#2f2729', '#3a3033', '#2a2224', '#352b2d'];
  for (let y = 0; y < HW_ - 10; y += 9) {
    let x = -Math.floor(rnd() * 12);
    while (x < longueur) {
      const w = 9 + Math.floor(rnd() * 14);
      const h = 7 + Math.floor(rnd() * 3);
      const col = pierres[Math.floor(rnd() * pierres.length)];
      R(x + 1, y + 1, w - 1, h - 1, col);
      R(x + 1, y + 1, w - 1, 1, O.nuance(col, 0.18));
      R(x + 2, y + h - 1, w - 2, 1, O.nuance(col, -0.25));
      x += w;
    }
  }
  // failles de lave
  for (let f = 0; f < longueur / 90; f++) {
    let x = Math.floor(rnd() * longueur);
    let y = 6 + Math.floor(rnd() * 20);
    for (let k = 0; k < 18 + rnd() * 18; k++) {
      R(x - 1, y, 3, 1, '#7a2410');
      R(x, y, 1, 1, rnd() < 0.5 ? '#ff7a1a' : '#ffb52e');
      y += 1;
      x += rnd() < 0.5 ? -1 : 1;
      if (y > HW_ - 14) break;
    }
  }
  // poutrelles
  for (let p = 64; p < longueur; p += 128) {
    R(p, 0, 8, HW_ - 10, '#4a4f58');
    R(p, 0, 1, HW_ - 10, '#6a707a');
    R(p + 7, 0, 1, HW_ - 10, '#2a2d33');
    for (let y = 6; y < HW_ - 12; y += 10) R(p + 3, y, 2, 2, '#8d939c');
  }
  // bande de danger
  R(0, HW_ - 10, longueur, 10, '#26262a');
  for (let x = 0; x < longueur; x++) for (let y = HW_ - 8; y < HW_ - 2; y++) {
    g.fillStyle = (x + y) % 10 < 5 ? JAUNE : '#1d1d1d';
    g.fillRect(x, y, 1, 1);
  }
}

// Carte du monde en points (34 × 13) pour le grand écran de la salle de guerre.
const MONDE = [
  '                                  ',
  '  ####   ###         ######   #   ',
  ' ######## ##    ## ############## ',
  '  #######     ################ ## ',
  '   ######     #  ############     ',
  '    ####      ### ##########      ',
  '     ##      #####  ######        ',
  '      ###    ######   ##   #      ',
  '       ####   ####         ##     ',
  '       #####  ###         ####    ',
  '        ###    ##          ##     ',
  '        ##     #                  ',
  '        #                    #    ',
];

function decorMursRepaire(g, cote, longueur, etage, O) {
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const gyrophare = (x, y) => {
    R(x - 3, y, 7, 4, '#2a2d33');
    R(x - 2, y - 4, 5, 4, '#e3242f');
    R(x - 1, y - 4, 1, 2, '#ff9a9a');
  };
  if (cote === 'droite') {
    O.enseigneQG(g);
    // étendard rouge derrière le DG, la pieuvre de l'organisation
    const bx = 5 * 32 + 14;
    O.cadre(g, bx, 6, 68, 54, '#c9a227', '#8a1a1f');
    R(bx + 4, 10, 60, 2, '#a8242a');
    const cx = bx + 34;
    const cy = 26;
    for (let y = -8; y <= 8; y++) {
      const w = Math.round(Math.sqrt(64 - y * y) * 1.1);
      R(cx - w, cy + y, w * 2, 1, '#15151f');
    }
    for (let t = 0; t < 6; t++) {
      let x = cx - 12 + t * 5;
      for (let k = 0; k < 14; k++) {
        R(x, cy + 6 + k, 2, 1, '#15151f');
        x += Math.round(Math.sin((k + t * 2) / 3) * 1.2);
      }
    }
    R(cx - 4, cy - 2, 3, 3, '#f4d35e');
    R(cx + 2, cy - 2, 3, 3, '#f4d35e');
    // compte à rebours au-dessus du diamant
    const px = 8 * 32 + 10;
    O.cadre(g, px, 12, 70, 28, '#3a3d44', '#120a0a');
    O.texteDouble(g, '00:07', px + 35, 17, '#ff3b3b', '#5a0f0f');
    gyrophare(px + 6, 8);
    gyrophare(px + 64, 8);
    gyrophare(14 * 32 + 20, 10);
  } else {
    O.plaqueEtage(g, etage);
    const c = (gy) => (H_ - gy) * 32;
    // la lave sort d'une crevasse au pied du mur
    const lx = Math.round(c(6.95));
    const lw = Math.round(c(6.05)) - lx;
    for (let y = 0; y < 30; y++) {
      const w = Math.round(lw * (0.5 + 0.5 * Math.sqrt(y / 30)));
      R(lx + Math.round((lw - w) / 2), HW_ - 30 + y, w, 1, '#0d0a0a');
    }
    for (let y = 8; y < 30; y++) {
      const w = Math.round(lw * 0.36 * (0.4 + (0.6 * y) / 30));
      R(lx + Math.round((lw - w) / 2), HW_ - 30 + y, w, 1, y % 5 ? '#ff7a1a' : '#ffb52e');
    }
    R(lx + Math.round(lw / 2) - 1, HW_ - 22, 2, 22, '#ffe27a');
    // grand écran de la salle de guerre : carte du monde, cibles et trajectoires
    const x0 = Math.round(c(10.9));
    const x1 = Math.round(c(7.1));
    const w = x1 - x0;
    O.cadre(g, x0, 6, w, 50, '#2a2d33', '#071420');
    const titre = O.enseigne('CIBLES', 'TARGETS');
    g.drawImage(O.texteCanvas(titre, '#ff3b3b'), x0 + 5, 9);
    const pas = Math.floor((w - 8) / MONDE[0].length);
    const mx = x0 + Math.round((w - pas * MONDE[0].length) / 2);
    MONDE.forEach((ligne, j) => {
      for (let i = 0; i < ligne.length; i++) if (ligne[i] === '#') R(mx + i * pas, 19 + j * 3, pas - 1, 2, (i + j) % 4 ? '#2f9e6a' : '#3fd08a');
    });
    for (let i = 0; i < 6; i++) R(x0 + 4, 20 + i * 6, w - 8, 1, 'rgba(61,242,255,0.10)');
    const cibles = [[0.22, 0.32], [0.55, 0.28], [0.72, 0.45], [0.3, 0.72], [0.86, 0.36]];
    const pts = cibles.map(([u, v]) => [mx + Math.round(u * pas * MONDE[0].length), 19 + Math.round(v * 39)]);
    // trajectoires en pointillés depuis le repaire (au centre)
    const [ox, oy] = pts[2];
    for (const [px, py] of pts) {
      for (let k = 0; k < 20; k++) {
        const t = k / 20;
        if (k % 2) continue;
        R(Math.round(ox + (px - ox) * t), Math.round(oy + (py - oy) * t - Math.sin(t * Math.PI) * 8), 1, 1, '#ffd23f');
      }
      R(px - 2, py, 5, 1, '#ff3b3b');
      R(px, py - 2, 1, 5, '#ff3b3b');
    }
    gyrophare(x1 - 8, 4);
  }
}
const H_ = 12;

// ---------- thèmes ----------
export const THEMES = {
  dir_penthouse: {
    sols: {
      def: ['dir_travertin', '#e5ddcd'], lobby: ['marbre', '#f2eee7'], dg: ['parquet', '#8a5a36'], bureau1: ['dir_travertin', '#e5ddcd'],
      machine: ['dir_travertin', '#ddd4c2'], bar: ['marbre', '#3d3732'], salon: ['dir_travertin', '#e5ddcd'], reunion: ['parquet', '#6e4426'],
      pause: ['dir_teck', '#b07a48'],
    },
    mur: 'dir_baies', dalle: '#3d4049', bureau: '#ece8e0', chaise: '#25262b', canape: '#e7dfcf', canapeEquipe: '#b98b52', table: '#2a2a2f',
    salon: ['#6b5238', '#a8865c'],
  },
  dir_repaire: {
    sols: {
      def: ['dir_tole', '#3b3e45'], lobby: ['dir_tole', '#45484f'], dg: ['marbre', '#24202a'], bureau1: ['dir_tole', '#34373e'],
      machine: ['dir_tole', '#34373e'], lave: ['dir_tole', '#2a2224'], reunion: ['dir_grille', '#14202a'], salon: ['dir_tole', '#3b3e45'],
      pause: ['dir_tole', '#42403e'],
    },
    mur: 'dir_roche', dalle: '#1f1a1a', bureau: '#4a4f58', chaise: '#e0661a', canape: '#7a1f24', canapeEquipe: '#3a3f47', table: '#22262d',
    salon: ['#2a1416', '#5a1f24'],
  },
};

export const MEUBLES = {
  dir_palmier: palmier,
  dir_sculpture: sculpture,
  dir_piano: piano,
  dir_sofa: (it, look, etat, O) => sofa(it, O.theme(look), etat, O),
  dir_brasero: brasero,
  dir_comptoir: comptoir,
  dir_arriere_bar: arriereBar,
  dir_tabouret: tabouret,
  dir_piscine: piscine,
  dir_transat: transat,
  dir_parasol: parasol,
  dir_fusee: fusee,
  dir_chat: chat,
  dir_bouton: bouton,
  dir_trappe: trappe,
  dir_requins: requins,
  dir_diamant: diamant,
  dir_lave: lave,
  dir_pont: pont,
  dir_hologramme: hologramme,
  dir_caisse_tnt: caisseTnt,
  dir_mange_debout: mangeDebout,
  dir_tonneau: tonneau,
};
export const ANIMES = {
  dir_piscine: animPiscine, dir_brasero: animBrasero, dir_lave: animLave, dir_requins: animRequins, dir_hologramme: animHologramme,
  dir_fusee: animFusee, dir_diamant: animDiamant, dir_chat: animChat,
};
export const JEUX = {};
export const SOLS = SOLS_DIR;
export const MURS = { dir_baies: murBaies, dir_roche: murRoche };
export const DECORS_MURS = { dir_penthouse: decorMursPenthouse, dir_repaire: decorMursRepaire };
