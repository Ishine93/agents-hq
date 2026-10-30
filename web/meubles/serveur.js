// Meubles, sols et murs des décors au choix de la famille « serveur » (1.0.10). Contrat : web/meubles/index.js.
// Datacenter (srv_datacenter) : rangées de baies vues de face ou de dos, chemins de câbles au-dessus, rideaux à
// lanières au bout des allées froides, climatiseurs, onduleurs, supervision, réserve.
// Labo du savant fou (srv_labo) : bobines Tesla (arcs animés vers les baies voisines), cuves à cerveaux, bocaux,
// grimoires, table d'opération, paillasses qui bouillonnent, échelle de Jacob, grand levier.
// Les baies des services elles-mêmes (`baie_service`) sont dessinées par web/decor.js, même pied (x 0,1–0,9,
// y 0,18–0,82) et même hauteur (66) que les baies d'ici.

const HW_ = 84;
const H_ = 12;
const graine = (it, O) => O.aleatoire(O.hacher(it.type + '|' + it.x + ',' + it.y + '|' + (it.variante || 0) + (it.part || '')));
const R_ = (g) => (x, y, w, h, col) => {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
};

// Sprite d'une case avec des marges (une lampe qui avance au-dessus de la case voisine…). Même repère que spriteTuile.
function spriteLibre(O, htop, gauche, droite, bas, fn, contour = true) {
  const c = O.creerCanvas(66 + gauche + droite, htop + 36 + bas);
  const g = c.getContext('2d');
  const P = O.projeteur(33 + gauche, htop + 1);
  fn(g, P);
  if (contour) O.contourner(c);
  return { c, dx: -1 - gauche, dy: -(htop + 1) };
}

// Cylindre vertical approché (octogone) : corps, puis dessus. cx, cy au centre, r en cases.
function cylindre(g, P, O, cx, cy, r, z0, z1, col, dessus = null) {
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  // flanc visible : la moitié avant (+x, +y), en deux teintes
  for (let i = 0; i < 12; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 12];
    const mx = (a[0] + b[0]) / 2 - cx;
    const my = (a[1] + b[1]) / 2 - cy;
    if (mx + my < -0.001) continue;
    const t = my > mx || !col.startsWith('#') ? col : O.nuance(col, -0.22);
    O.poly(g, [P(a[0], a[1], z1), P(b[0], b[1], z1), P(b[0], b[1], z0), P(a[0], a[1], z0)], t);
  }
  O.poly(g, pts.map(([x, y]) => P(x, y, z1)), dessus || (col.startsWith('#') ? O.nuance(col, 0.16) : col));
}

// ---------- datacenter ----------
const PIED = [0.1, 0.18, 0.9, 0.82]; // comme baie_service
const JAUNE_CHEMIN = '#e6b422';

// Tronçon de chemin de câbles au-dessus d'une baie (échelle jaune et ses tiges), du bout gauche au bout droit.
function chemin(g, P, O, bout) {
  const x0 = bout === 'g' ? PIED[0] : 0;
  const x1 = bout === 'd' ? PIED[2] : 1;
  for (const x of [0.3, 0.7]) O.prisme(g, P, x, 0.48, x + 0.03, 0.52, 66, 76, '#8d939c');
  O.prisme(g, P, x0, 0.36, x1, 0.4, 76, 80, JAUNE_CHEMIN);
  for (let x = x0 + 0.06; x < x1 - 0.02; x += 0.16) O.prisme(g, P, x, 0.4, x + 0.03, 0.6, 76, 77, '#b88a12');
  O.quadZ(g, P, 77, x0, 0.42, x1, 0.47, '#2f6fde');
  O.quadZ(g, P, 77.2, x0, 0.48, x1, 0.52, '#e3342f');
  O.quadZ(g, P, 77.1, x0, 0.53, x1, 0.57, '#3aa655');
  O.prisme(g, P, x0, 0.6, x1, 0.64, 76, 80, JAUNE_CHEMIN);
}

// Baie de serveurs décorative : face avant (+y) ou dos (+y aussi, la face avant donnant sur l'allée d'en face).
function baie(it, look, etat, O) {
  const rnd = graine(it, O);
  const dos = it.sens === 'dos';
  const [x0, y0, x1, y1] = PIED;
  return O.spriteTuile(84, (g, P) => {
    O.prisme(g, P, x0, y0, x1, y1, 0, 66, dos ? '#272b33' : '#1f2229');
    O.quadZ(g, P, 66.2, x0 + 0.06, y0 + 0.08, x1 - 0.06, y1 - 0.08, '#2b2f38');
    for (let i = 0; i < 4; i++) O.quadZ(g, P, 66.4, x0 + 0.1 + i * 0.17, y0 + 0.14, x0 + 0.16 + i * 0.17, y1 - 0.14, '#15171c');
    if (!dos) {
      // serveurs empilés : façades de 1U et 2U, baies de disques
      let z = 4;
      while (z < 62) {
        const u = rnd() < 0.3 ? 8 : 4;
        const col = ['#3a404c', '#4a5260', '#2e333d', '#c8ccd2'][Math.floor(rnd() * 4)];
        O.quadY(g, P, y1, x0 + 0.04, x1 - 0.04, z, Math.min(62, z + u - 1), col);
        if (u === 8) for (let k = 0; k < 4; k++) O.quadY(g, P, y1, x0 + 0.1 + k * 0.12, x0 + 0.2 + k * 0.12, z + 2, z + 6, O.nuance(col, 0.25));
        else O.quadY(g, P, y1, x0 + 0.08, x0 + 0.3, z + 1, z + 2, O.nuance(col, -0.3));
        z += u;
      }
      O.quadY(g, P, y1, x0, x0 + 0.03, 2, 64, '#8d939c');
      O.quadY(g, P, y1, x1 - 0.03, x1, 2, 64, '#8d939c');
    } else {
      // dos : porte grillagée, faisceaux de câbles, bandeau d'alimentation
      O.quadY(g, P, y1, x0 + 0.04, x1 - 0.04, 3, 63, '#1a1d23');
      for (let z = 6; z < 62; z += 3) for (let x = x0 + 0.08; x < x1 - 0.06; x += 0.08) O.pixel(g, P(x, y1, z), '#2f343e', 1, 1);
      const faisceaux = [['#2f6fde', 0.2], ['#f6c21c', 0.3], ['#e3342f', 0.62], ['#3aa655', 0.72]];
      for (const [col, x] of faisceaux) O.quadY(g, P, y1, x, x + 0.05, 4 + Math.floor(rnd() * 6), 62, col);
      O.quadY(g, P, y1, 0.44, 0.52, 4, 62, '#3a1a1a');
      for (let z = 8; z < 60; z += 6) O.pixel(g, P(0.48, y1, z), '#ff5a3a', 1, 1);
    }
    chemin(g, P, O, it.bout);
  });
}

// Chemin de câbles au-dessus d'une baie de service (meuble de passage, posé sur la même case que la baie) : tout
// est dans `avant`, dessiné après la baie.
function cheminSeul(it, look, etat, O) {
  return { c: O.creerCanvas(1, 1), dx: 0, dy: 0, avant: O.spriteTuile(84, (g, P) => chemin(g, P, O, it.bout)) };
}

// Rideau à lanières au bout d'une allée froide, sur l'arête x + 1 de la case (dessiné devant ce qui est derrière).
function rideau(it, look, etat, O) {
  const s = { c: O.creerCanvas(1, 1), dx: 0, dy: 0 };
  s.avant = O.spriteTuile(76, (g, P) => {
    O.prisme(g, P, 0.92, 0, 1, 1, 66, 70, '#8d939c');
    for (let i = 0; i < 9; i++) {
      const y = 0.03 + i * 0.106;
      O.quadX(g, P, 0.97, y, y + 0.09, 3, 66, 'rgba(190,225,245,0.30)');
      O.quadX(g, P, 0.97, y, y + 0.015, 3, 66, 'rgba(235,250,255,0.45)');
    }
  }, false);
  return s;
}

function clim(it, look, etat, O) {
  return O.spriteTuile(72, (g, P) => {
    O.prisme(g, P, 0.08, 0.04, 0.92, 0.62, 0, 64, '#e4e8ec');
    O.quadY(g, P, 0.62, 0.12, 0.88, 30, 60, '#c8ced6');
    for (let z = 32; z < 59; z += 3) O.quadY(g, P, 0.62, 0.14, 0.86, z, z + 1, '#9aa3ad');
    O.quadY(g, P, 0.62, 0.12, 0.88, 4, 14, '#b9c0c9');
    for (let x = 0.16; x < 0.86; x += 0.08) O.quadY(g, P, 0.62, x, x + 0.03, 5, 13, '#7d8692');
    O.quadY(g, P, 0.62, 0.16, 0.5, 18, 26, '#2a2d33');
    O.quadY(g, P, 0.62, 0.19, 0.42, 20, 24, '#5cff8a');
    O.quadY(g, P, 0.62, 0.6, 0.84, 20, 23, '#2f6fde');
    O.quadZ(g, P, 64.2, 0.14, 0.1, 0.86, 0.56, '#cfd5dc');
  });
}

function tableauElec(it, look, etat, O) {
  return O.spriteTuile(64, (g, P) => {
    O.prisme(g, P, 0.12, 0.04, 0.88, 0.36, 0, 56, '#9aa3ad');
    O.quadY(g, P, 0.36, 0.16, 0.84, 4, 52, '#aeb6c0');
    O.quadY(g, P, 0.36, 0.5, 0.52, 6, 50, '#7d8692');
    O.quadY(g, P, 0.36, 0.42, 0.48, 26, 30, '#3a3d44');
    // triangle « danger électrique »
    const [cx, cy] = P(0.3, 0.36, 44);
    const R = R_(g);
    for (let k = 0; k < 7; k++) R(cx - k, cy - 6 + k, k * 2 + 1, 1, '#f5c400');
    R(cx, cy - 3, 1, 3, '#1d1d1d');
    R(cx, cy + 1, 1, 1, '#1d1d1d');
  });
}

function onduleur(it, look, etat, O) {
  return O.spriteTuile(64, (g, P) => {
    O.prisme(g, P, 0.1, 0.04, 0.9, 0.62, 0, 54, '#22252b');
    O.quadY(g, P, 0.62, 0.14, 0.86, 4, 30, '#2b2f38');
    for (let z = 6; z < 29; z += 3) O.quadY(g, P, 0.62, 0.16, 0.84, z, z + 1, '#1a1c21');
    O.quadY(g, P, 0.62, 0.3, 0.7, 38, 48, '#0d1a12');
    O.quadY(g, P, 0.62, 0.68, 0.84, 36, 38, '#2f6fde');
    O.quadZ(g, P, 54.2, 0.16, 0.1, 0.84, 0.56, '#2e3238');
  });
}

function bouteilles(it, look, etat, O) {
  return O.spriteTuile(78, (g, P) => {
    for (const [cx, cy] of [[0.32, 0.3], [0.68, 0.3]]) {
      cylindre(g, P, O, cx, cy, 0.15, 0, 46, '#c0392b');
      cylindre(g, P, O, cx, cy, 0.06, 46, 52, '#8d939c');
      O.prisme(g, P, cx - 0.06, cy - 0.06, cx + 0.06, cy + 0.06, 52, 55, '#2a2d33');
      O.pixel(g, P(cx, cy + 0.15, 32), '#f4f1e8', 2, 4);
    }
    O.prisme(g, P, 0.3, 0.27, 0.72, 0.33, 55, 58, '#8d939c');
    O.prisme(g, P, 0.48, 0.27, 0.54, 0.33, 58, 76, '#8d939c');
  });
}

// Poste de supervision contre le mur gauche : bureau, écrans tournés vers +x (vers la pièce).
function noc(it, look, etat, O) {
  const p = it.part;
  const y0 = p === 'g' ? 0.08 : 0;
  const y1 = p === 'd' ? 0.92 : 1;
  return O.spriteTuile(60, (g, P) => {
    for (const y of [y0 + 0.04, y1 - 0.08]) if ((p === 'g' && y < 0.5) || (p === 'd' && y > 0.5)) O.prisme(g, P, 0.62, y, 0.68, y + 0.06, 0, 22, '#2a2d33');
    O.prisme(g, P, 0.04, y0, 0.74, y1, 0, 22, '#3a3f48');
    O.prisme(g, P, 0.02, y0, 0.78, y1, 22, 25, '#c8ccd2');
    // écrans
    O.prisme(g, P, 0.2, y0 + 0.06, 0.26, y1 - 0.06, 25, 30, '#2a2d33');
    O.prisme(g, P, 0.14, y0 + 0.04, 0.22, y1 - 0.04, 29, p === 'm' ? 56 : 48, '#15171c');
    const zh = p === 'm' ? 54 : 46;
    O.quadX(g, P, 0.22, y0 + 0.08, y1 - 0.08, 31, zh, '#0b1a2a');
    const n = 7;
    for (let i = 0; i < n; i++) {
      const y = y0 + 0.1 + (i * (y1 - y0 - 0.2)) / n;
      const h = 4 + ((i * 7 + (p === 'g' ? 3 : 5)) % 9);
      O.quadX(g, P, 0.22, y, y + 0.05, 33, 33 + h, p === 'd' ? '#ffb02e' : '#3dff7a');
    }
    if (p === 'm') O.quadX(g, P, 0.22, y0 + 0.1, y1 - 0.1, 50, 52, '#2f6fde');
    O.prisme(g, P, 0.4, 0.3, 0.52, 0.7, 25, 26, '#2a2d33');
  });
}

function extincteur(it, look, etat, O) {
  return O.spriteTuile(44, (g, P) => {
    O.prisme(g, P, 0.04, 0.3, 0.1, 0.7, 6, 40, '#c8ccd2');
    cylindre(g, P, O, 0.24, 0.5, 0.1, 6, 30, '#d2382c');
    O.prisme(g, P, 0.2, 0.46, 0.28, 0.54, 30, 34, '#2a2d33');
    O.prisme(g, P, 0.26, 0.48, 0.42, 0.52, 32, 34, '#2a2d33');
    O.quadX(g, P, 0.1, 0.36, 0.64, 36, 44, '#d2382c');
  });
}

// Dalle de faux plancher soulevée : on voit les câbles dessous ; cône de chantier et dalle posée à côté.
function dalleOuverte(it, look, etat, O) {
  return O.spriteTuile(40, (g, P) => {
    O.quadZ(g, P, 0.2, 0.08, 0.08, 0.92, 0.92, '#0e1014');
    O.quadZ(g, P, 0.3, 0.1, 0.3, 0.9, 0.36, '#2f6fde');
    O.quadZ(g, P, 0.3, 0.1, 0.45, 0.9, 0.5, '#f6c21c');
    O.quadZ(g, P, 0.3, 0.1, 0.62, 0.9, 0.68, '#e3342f');
    for (const [x, y] of [[0.12, 0.12], [0.82, 0.12], [0.12, 0.82], [0.82, 0.82]]) O.prisme(g, P, x, y, x + 0.06, y + 0.06, -4, 0.5, '#8d939c');
    O.poly(g, [P(0.84, 0.1, 1), P(0.96, 0.1, 1), P(0.96, 0.9, 1), P(0.84, 0.9, 1)], '#aeb6c0');
    // cône
    O.prisme(g, P, 0.36, 0.36, 0.64, 0.64, 0, 2, '#c94a10');
    O.prisme(g, P, 0.42, 0.42, 0.58, 0.58, 2, 10, '#ff6a1f');
    O.prisme(g, P, 0.44, 0.44, 0.56, 0.56, 10, 15, '#ffffff');
    O.prisme(g, P, 0.46, 0.46, 0.54, 0.54, 15, 22, '#ff6a1f');
  });
}

function bobine(it, look, etat, O) {
  return O.spriteTuile(44, (g, P) => {
    const disque = (x) => {
      const pts = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        pts.push(P(x, 0.5 + Math.cos(a) * 0.38, 19 + Math.sin(a) * 18));
      }
      O.poly(g, pts, '#a8743c');
      O.pixel(g, P(x, 0.5, 19), '#5a3a1c', 3, 3);
    };
    disque(0.22);
    O.prisme(g, P, 0.24, 0.26, 0.76, 0.74, 6, 32, '#2f6fde');
    for (let z = 8; z < 32; z += 4) O.quadY(g, P, 0.74, 0.24, 0.76, z, z + 1, '#2155b3');
    disque(0.78);
  });
}

function cartons(it, look, etat, O) {
  const v = it.variante || 0;
  return O.spriteTuile(52, (g, P) => {
    const boite = (x0, y0, x1, y1, z0, z1) => {
      O.prisme(g, P, x0, y0, x1, y1, z0, z1, '#b98a57');
      O.quadZ(g, P, z1 + 0.1, (x0 + x1) / 2 - 0.02, y0, (x0 + x1) / 2 + 0.02, y1, '#d9b98a');
      O.quadY(g, P, y1, x0 + 0.08, x0 + 0.3, z0 + 3, z0 + 8, '#f4f1e8');
    };
    boite(0.1, 0.12, 0.9, 0.88, 0, 18);
    boite(0.16, 0.2, 0.8, 0.8, 18, 32);
    if (!v) boite(0.26, 0.28, 0.7, 0.7, 32, 42);
  });
}

function chariot(it, look, etat, O) {
  return O.spriteTuile(60, (g, P) => {
    for (const [x, y] of [[0.2, 0.2], [0.74, 0.2], [0.2, 0.74], [0.74, 0.74]]) {
      O.prisme(g, P, x, y, x + 0.06, y + 0.06, 0, 3, '#15151b');
      O.prisme(g, P, x + 0.01, y + 0.01, x + 0.05, y + 0.05, 3, 28, '#8d939c');
    }
    O.prisme(g, P, 0.16, 0.16, 0.84, 0.84, 10, 12, '#5d636c');
    O.prisme(g, P, 0.16, 0.16, 0.84, 0.84, 26, 28, '#5d636c');
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.62, 12, 18, '#2a2d33');
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.36, 28, 46, '#15171c');
    O.quadY(g, P, 0.36, 0.33, 0.67, 30, 44, '#050805');
    for (let i = 0; i < 4; i++) O.quadY(g, P, 0.36, 0.36, 0.42 + i * 0.06, 32 + i * 3, 33 + i * 3, '#39ff6a');
    O.prisme(g, P, 0.3, 0.5, 0.7, 0.66, 28, 29, '#c8ccd2');
  });
}

// ---------- labo du savant fou ----------
const VIOLET = '#c77dff';

// Bobine Tesla : socle de bois, bobine primaire en spirale de cuivre, longue bobine secondaire, tore d'aluminium.
function tesla(it, look, etat, O) {
  return O.spriteTuile(90, (g, P) => {
    O.prisme(g, P, 0.16, 0.16, 0.84, 0.84, 0, 10, '#4a2f1f');
    O.prisme(g, P, 0.16, 0.16, 0.84, 0.84, 9, 11, '#c9a227');
    for (const [x, y] of [[0.2, 0.2], [0.74, 0.2], [0.2, 0.74], [0.74, 0.74]]) O.prisme(g, P, x, y, x + 0.06, y + 0.06, 11, 16, '#e8e2d0');
    cylindre(g, P, O, 0.5, 0.5, 0.3, 14, 16, '#b87333', '#d8884a');
    for (const r of [0.24, 0.17]) cylindre(g, P, O, 0.5, 0.5, r, 16, 17, r > 0.2 ? '#d8884a' : '#b87333');
    cylindre(g, P, O, 0.5, 0.5, 0.09, 16, 64, '#e2c08a');
    for (let z = 18; z < 63; z += 2) O.quadY(g, P, 0.59, 0.43, 0.57, z, z + 0.8, '#b87333');
    // tore : anneau épais, plus clair dessus, trou sombre au centre
    cylindre(g, P, O, 0.5, 0.5, 0.36, 64, 70, '#8d96a2', '#c8d0da');
    cylindre(g, P, O, 0.5, 0.5, 0.12, 70, 70.5, '#4a5260', '#3a414c');
    O.pixel(g, P(0.3, 0.42, 70), '#f4f8fc', 4, 1);
  });
}

// Générateur de Van de Graaff : colonne isolante et grosse sphère d'aluminium.
function vanDeGraaff(it, look, etat, O) {
  return O.spriteTuile(84, (g, P) => {
    O.prisme(g, P, 0.24, 0.24, 0.76, 0.76, 0, 12, '#3a3d44');
    O.quadY(g, P, 0.76, 0.3, 0.5, 4, 8, '#d2382c');
    cylindre(g, P, O, 0.5, 0.5, 0.08, 12, 50, '#e8e2d0');
    const [cx, cy] = P(0.5, 0.5, 62);
    const R = R_(g);
    for (let y = -13; y <= 13; y++) {
      const w = Math.round(Math.sqrt(169 - y * y));
      R(cx - w, cy + y, w * 2, 1, y < -6 ? '#e4e8ee' : y < 4 ? '#b8c0ca' : '#8d96a2');
    }
    R(cx - 7, cy - 9, 5, 3, '#ffffff');
  });
}

// Cage de fer où s'agite une petite créature verte (elle cligne des yeux, voir ANIMES).
function cage(it, look, etat, O) {
  return O.spriteTuile(70, (g, P) => {
    O.prisme(g, P, 0.14, 0.14, 0.86, 0.86, 0, 4, '#3a3230');
    const [cx, cy] = P(0.5, 0.5, 4);
    const R = R_(g);
    R(cx - 7, cy - 12, 14, 11, '#5fbf4a');
    R(cx - 5, cy - 15, 10, 4, '#5fbf4a');
    R(cx - 8, cy - 4, 3, 3, '#4aa03a');
    R(cx + 5, cy - 4, 3, 3, '#4aa03a');
    R(cx - 4, cy - 12, 3, 3, '#ffffff');
    R(cx + 1, cy - 12, 3, 3, '#ffffff');
    R(cx - 3, cy - 11, 1, 2, '#15151f');
    R(cx + 2, cy - 11, 1, 2, '#15151f');
    R(cx - 2, cy - 6, 4, 1, '#2a6a1f');
    for (let i = 0; i <= 6; i++) {
      const u = 0.14 + (i * 0.72) / 6;
      O.prisme(g, P, u, 0.84, u + 0.025, 0.86, 4, 52, '#5d636c');
      O.prisme(g, P, 0.84, u, 0.86, u + 0.025, 4, 52, '#5d636c');
      O.prisme(g, P, u, 0.14, u + 0.025, 0.16, 4, 52, '#4a4f58');
      O.prisme(g, P, 0.14, u, 0.16, u + 0.025, 4, 52, '#4a4f58');
    }
    O.prisme(g, P, 0.14, 0.14, 0.86, 0.86, 52, 55, '#3a3230');
    O.prisme(g, P, 0.48, 0.48, 0.52, 0.52, 55, 64, '#3a3230');
  });
}

function marquage(it, look, etat, O) {
  return O.spriteTuile(6, (g, P) => {
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      O.pixel(g, P(0.5 + Math.cos(a) * 0.4, 0.5 + Math.sin(a) * 0.4, 0.3), '#e8e2d0', 2, 1);
    }
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      const b = ((k + 2) / 5) * Math.PI * 2 - Math.PI / 2;
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        O.pixel(g, P(0.5 + (Math.cos(a) * (1 - t) + Math.cos(b) * t) * 0.36, 0.5 + (Math.sin(a) * (1 - t) + Math.sin(b) * t) * 0.36, 0.3), '#d8d0bc', 1, 1);
      }
    }
  }, false);
}

const BOCAUX = ['#7dff6a', '#ff8fb1', '#ffd23f', '#8fe6ff', '#c77dff', '#ff9a5a'];
function bocaux(it, look, etat, O) {
  const rnd = graine(it, O);
  return O.spriteTuile(78, (g, P) => {
    O.prisme(g, P, 0.06, 0.04, 0.94, 0.42, 0, 70, '#5a3a22');
    O.quadY(g, P, 0.42, 0.1, 0.9, 3, 67, '#2e1e12');
    for (const z of [3, 25, 47]) {
      O.prisme(g, P, 0.06, 0.04, 0.94, 0.42, z - 2, z, '#6e4c36');
      let x = 0.12;
      while (x < 0.8) {
        const w = 0.12 + rnd() * 0.05;
        const h = 11 + Math.floor(rnd() * 6);
        const col = BOCAUX[Math.floor(rnd() * BOCAUX.length)];
        const plein = Math.round(h * (0.45 + rnd() * 0.35));
        // bocal de verre : liquide coloré en bas, verre clair au-dessus, couvercle sombre
        cylindre(g, P, O, x + w / 2, 0.27, w / 2, z, z + plein, O.nuance(col, -0.12));
        cylindre(g, P, O, x + w / 2, 0.27, w / 2, z + plein, z + h, 'rgba(210,235,245,0.45)', 'rgba(230,245,250,0.5)');
        cylindre(g, P, O, x + w / 2, 0.27, w / 2 - 0.01, z + h, z + h + 2, '#3a3230');
        if (rnd() < 0.4) O.pixel(g, P(x + w / 2, 0.27 + w / 2, z + plein / 2), '#f4f1e8', 2, 2);
        x += w + 0.04;
      }
    }
  });
}

function grimoires(it, look, etat, O) {
  const rnd = graine(it, O);
  const cuirs = ['#6b2a1f', '#2a4a2f', '#3a2a4a', '#7a5a2a', '#4a1f1f'];
  return O.spriteTuile(84, (g, P) => {
    O.prisme(g, P, 0.06, 0.04, 0.94, 0.4, 0, 62, '#4a2f1f');
    O.quadY(g, P, 0.4, 0.1, 0.9, 3, 59, '#24160c');
    for (const z of [3, 22, 41]) {
      O.prisme(g, P, 0.06, 0.04, 0.94, 0.4, z - 2, z, '#5e3e28');
      let x = 0.12;
      while (x < 0.86) {
        const w = 0.05 + rnd() * 0.05;
        const h = 11 + Math.floor(rnd() * 5);
        const col = cuirs[Math.floor(rnd() * cuirs.length)];
        O.quadY(g, P, 0.4, x, Math.min(0.88, x + w), z, z + h, col);
        O.quadY(g, P, 0.4, x, Math.min(0.88, x + w), z + h - 3, z + h - 2, '#c9a227');
        x += w + 0.01;
      }
    }
    // crâne et bougie sur le dessus
    const [cx, cy] = P(0.36, 0.24, 62);
    const R = R_(g);
    R(cx - 4, cy - 8, 8, 6, '#ece4d0');
    R(cx - 3, cy - 2, 6, 3, '#ece4d0');
    R(cx - 3, cy - 6, 2, 2, '#2a2422');
    R(cx + 1, cy - 6, 2, 2, '#2a2422');
    R(cx - 1, cy - 1, 1, 2, '#2a2422');
    R(cx + 1, cy - 1, 1, 2, '#2a2422');
    O.prisme(g, P, 0.66, 0.18, 0.74, 0.26, 62, 72, '#f4ecd2');
  });
}

// Cuve de verre contre le mur gauche, liquide vert ; on y voit flotter un cerveau, un œil ou une main.
function cuve(it, look, etat, O) {
  const v = (it.variante || 0) % 3;
  return O.spriteTuile(88, (g, P) => {
    cylindre(g, P, O, 0.42, 0.5, 0.34, 0, 10, '#5d636c');
    cylindre(g, P, O, 0.42, 0.5, 0.3, 10, 64, '#3fbf6a', 'rgba(140,255,170,0.6)');
    O.quadX(g, P, 0.72, 0.36, 0.42, 14, 60, 'rgba(255,255,255,0.35)');
    const [cx, cy] = P(0.42, 0.5, 36);
    const R = R_(g);
    if (v === 0) {
      R(cx - 7, cy - 5, 14, 9, '#f2a0b0');
      R(cx - 6, cy - 7, 12, 2, '#f2a0b0');
      R(cx - 5, cy - 3, 3, 1, '#c86a80');
      R(cx + 1, cy - 4, 4, 1, '#c86a80');
      R(cx - 2, cy + 1, 5, 1, '#c86a80');
      R(cx, cy - 7, 1, 11, '#c86a80');
      R(cx - 1, cy + 4, 2, 6, '#e08a9a');
    } else if (v === 1) {
      // pendant l'easter egg, la pupille (qui bouge) et la main (qui fait coucou) sont dessinées par ANIMES
      R(cx - 5, cy - 5, 10, 10, '#f4f4f0');
      R(cx - 6, cy - 3, 12, 6, '#f4f4f0');
      if (!etat.effet) {
        R(cx - 2, cy - 2, 5, 5, '#3a8ad6');
        R(cx - 1, cy - 1, 3, 3, '#15151f');
      }
      R(cx + 3, cy + 3, 4, 1, '#e3342f');
    } else if (etat.effet) {
      // la main est dessinée par animCuve
    } else {
      R(cx - 4, cy - 2, 8, 7, '#d8b8a0');
      for (let k = 0; k < 4; k++) R(cx - 4 + k * 2, cy - 9 + (k === 0 ? 3 : 0), 1, 7, '#d8b8a0');
      R(cx + 4, cy, 3, 2, '#d8b8a0');
    }
    cylindre(g, P, O, 0.42, 0.5, 0.34, 64, 70, '#5d636c');
    O.prisme(g, P, 0.1, 0.46, 0.18, 0.54, 70, 84, '#b87333');
    O.prisme(g, P, 0.02, 0.46, 0.18, 0.54, 82, 86, '#b87333');
  });
}

function chandelier(it, look, etat, O) {
  return O.spriteTuile(56, (g, P) => {
    O.prisme(g, P, 0.36, 0.36, 0.64, 0.64, 0, 2, '#2a2422');
    O.prisme(g, P, 0.48, 0.48, 0.52, 0.52, 2, 34, '#3a3230');
    O.prisme(g, P, 0.26, 0.48, 0.74, 0.52, 32, 34, '#3a3230');
    for (const x of [0.26, 0.48, 0.7]) {
      O.prisme(g, P, x - 0.02, 0.46, x + 0.06, 0.54, 34, 36, '#3a3230');
      O.prisme(g, P, x, 0.47, x + 0.04, 0.53, 36, x === 0.48 ? 46 : 42, '#f4ecd2');
    }
  });
}

// Table d'opération (2 cases selon x) : drap blanc sur une forme allongée, sangles et électrodes. Phase 3 de
// l'easter egg du levier : la créature s'est redressée, bras tendus, le drap retombé sur les jambes.
function tableOp(it, look, etat, O) {
  const assis = etat.effet === 3;
  return O.spriteBloc(2, 1, 66, (g, P) => {
    const electrodes = () => {
      for (const [x, y] of [[0.26, 0.3], [0.26, 0.7]]) {
        O.prisme(g, P, x, y - 0.04, x + 0.08, y + 0.04, 30, 34, '#c9a227');
        O.prisme(g, P, x + 0.02, y - 0.01, x + 0.05, y + 0.02, 34, 56, '#1d1d1d');
      }
    };
    for (const x of [0.3, 1.62]) O.prisme(g, P, x, 0.42, x + 0.08, 0.58, 0, 18, '#5d636c');
    O.prisme(g, P, 0.24, 0.36, 1.76, 0.64, 2, 4, '#3a3d44');
    O.prisme(g, P, 0.1, 0.16, 1.9, 0.84, 18, 22, '#8d939c');
    // forme sous le drap : tête, torse, jambes, pieds
    O.prisme(g, P, 0.18, 0.2, 1.84, 0.8, 22, 25, '#e8e6ee');
    if (assis) {
      electrodes();
      // la créature assise : veste sombre, cou à boulons, tête verte au crâne plat
      O.prisme(g, P, 0.36, 0.3, 0.6, 0.7, 25, 46, '#3a3a46');
      O.prisme(g, P, 0.42, 0.42, 0.56, 0.58, 46, 49, '#6fbf4a');
      O.prisme(g, P, 0.47, 0.32, 0.51, 0.42, 46.5, 48.5, '#8d939c');
      O.prisme(g, P, 0.47, 0.58, 0.51, 0.68, 46.5, 48.5, '#8d939c');
      O.prisme(g, P, 0.38, 0.36, 0.62, 0.64, 49, 62, '#7fcf5a');
      O.prisme(g, P, 0.37, 0.35, 0.63, 0.65, 60, 64, '#15151f');
      O.quadX(g, P, 0.621, 0.41, 0.47, 54.5, 57, '#ffffff');
      O.quadX(g, P, 0.621, 0.53, 0.59, 54.5, 57, '#ffffff');
      O.quadX(g, P, 0.622, 0.44, 0.46, 55, 56.5, '#15151f');
      O.quadX(g, P, 0.622, 0.56, 0.58, 55, 56.5, '#15151f');
      O.quadX(g, P, 0.621, 0.43, 0.57, 51, 52, '#2a5a1f');
      O.quadX(g, P, 0.621, 0.4, 0.6, 59, 59.6, '#3a7a2a');
      O.prisme(g, P, 0.62, 0.26, 1.08, 0.74, 25, 29, '#f2f0f8');
    } else {
      O.prisme(g, P, 0.2, 0.36, 0.44, 0.64, 25, 32, '#f2f0f8');
      O.prisme(g, P, 0.5, 0.26, 1.08, 0.74, 25, 31, '#f2f0f8');
    }
    O.prisme(g, P, 1.1, 0.3, 1.66, 0.7, 25, 28, '#f2f0f8');
    O.prisme(g, P, 1.66, 0.3, 1.8, 0.46, 25, 32, '#f2f0f8');
    O.prisme(g, P, 1.66, 0.54, 1.8, 0.7, 25, 32, '#f2f0f8');
    for (const x of assis ? [1.3] : [0.7, 1.3]) O.prisme(g, P, x, 0.14, x + 0.06, 0.86, 22, 31.5, '#5a3a22');
    // deux grands pieds verts dépassent du drap ; une main pend, ou les deux bras se tendent
    O.prisme(g, P, 1.84, 0.3, 1.96, 0.44, 24, 33, '#6fbf4a');
    O.prisme(g, P, 1.84, 0.56, 1.96, 0.7, 24, 33, '#6fbf4a');
    if (assis) {
      for (const y of [0.3, 0.6]) {
        O.prisme(g, P, 0.6, y, 1.0, y + 0.1, 40, 44, '#3a3a46');
        O.prisme(g, P, 1.0, y, 1.1, y + 0.1, 40, 44, '#7fcf5a');
      }
    } else {
      O.prisme(g, P, 0.86, 0.84, 0.98, 0.92, 12, 24, '#6fbf4a');
      O.prisme(g, P, 0.84, 0.84, 1.0, 0.94, 8, 12, '#5aa03a');
      electrodes();
    }
  });
}

// Scialytique : grande lampe sur pied dont le bras avance au-dessus de la table d'opération (case voisine).
function scialytique(it, look, etat, O) {
  return spriteLibre(O, 90, 56, 0, 0, (g, P) => {
    O.prisme(g, P, 0.34, 0.34, 0.66, 0.66, 0, 3, '#3a3d44');
    O.prisme(g, P, 0.47, 0.47, 0.53, 0.53, 3, 78, '#8d939c');
    O.prisme(g, P, -0.3, 0.97, 0.53, 1.03, 76, 79, '#8d939c');
    O.prisme(g, P, 0.47, 0.5, 0.53, 1.03, 76, 79, '#8d939c');
    cylindre(g, P, O, -0.3, 1.0, 0.26, 66, 74, '#c8ccd2', '#e4e8ec');
    O.poly(g, [P(-0.52, 0.78, 66), P(-0.08, 0.78, 66), P(-0.08, 1.22, 66), P(-0.52, 1.22, 66)], '#fff6c4');
  });
}

// Paillasse carrelée : fioles, ballons, serpentin et bec Bunsen (bulles et flamme animées).
function paillasse(it, look, etat, O) {
  const p = it.part;
  const x0 = p === 'g' ? 0.06 : 0;
  const x1 = p === 'd' ? 0.94 : 1;
  return O.spriteTuile(64, (g, P) => {
    for (const x of p === 'g' ? [0.1] : [0.84]) for (const y of [0.16, 0.76]) O.prisme(g, P, x, y, x + 0.06, y + 0.06, 0, 22, '#4a2f1f');
    O.prisme(g, P, x0, 0.12, x1, 0.84, 20, 24, '#e8e2d0');
    for (let x = x0 + 0.1; x < x1; x += 0.2) O.quadZ(g, P, 24.1, x, 0.12, x + 0.01, 0.84, '#b8b0a0');
    if (p === 'g') {
      // ballon sur son support, bec Bunsen dessous
      O.prisme(g, P, 0.28, 0.4, 0.34, 0.46, 24, 30, '#5d636c');
      O.prisme(g, P, 0.22, 0.32, 0.4, 0.54, 33, 44, '#7dff6a', '#6ae85a', '#4cbf3e');
      O.prisme(g, P, 0.28, 0.4, 0.34, 0.46, 44, 52, 'rgba(220,255,230,0.7)');
      O.prisme(g, P, 0.6, 0.3, 0.78, 0.48, 24, 36, '#ff8fb1', '#f07aa0', '#c85a80');
      O.prisme(g, P, 0.66, 0.36, 0.72, 0.42, 36, 44, 'rgba(255,220,235,0.8)');
      O.prisme(g, P, 0.3, 0.6, 0.5, 0.8, 24, 27, '#3a3d44');
    } else {
      // serpentin et éprouvettes
      O.prisme(g, P, 0.2, 0.3, 0.26, 0.36, 24, 50, '#5d636c');
      for (let z = 30; z < 48; z += 4) O.prisme(g, P, 0.26, 0.28, 0.52, 0.38, z, z + 1.5, '#9fe6f7');
      O.prisme(g, P, 0.56, 0.5, 0.86, 0.6, 24, 26, '#6e4c36');
      for (let i = 0; i < 4; i++) O.prisme(g, P, 0.58 + i * 0.07, 0.52, 0.62 + i * 0.07, 0.58, 26, 38, BOCAUX[i]);
    }
  });
}

function jacob(it, look, etat, O) {
  return O.spriteTuile(64, (g, P) => {
    O.prisme(g, P, 0.24, 0.3, 0.76, 0.7, 0, 14, '#3a3d44');
    O.quadY(g, P, 0.7, 0.3, 0.44, 5, 9, '#ff3b3b');
    O.quadY(g, P, 0.7, 0.5, 0.7, 5, 9, '#f5c400');
    O.prisme(g, P, 0.34, 0.46, 0.38, 0.54, 14, 56, '#b87333');
    O.prisme(g, P, 0.62, 0.46, 0.66, 0.54, 14, 56, '#b87333');
    O.prisme(g, P, 0.34, 0.44, 0.4, 0.56, 14, 18, '#e8e2d0');
    O.prisme(g, P, 0.6, 0.44, 0.66, 0.56, 14, 18, '#e8e2d0');
  });
}

// Le grand levier : socle de fonte, deux mâchoires de cuivre et un long manche à poignée rouge, relevé ; abaissé
// (lames dans les mâchoires) pendant l'easter egg « Il est vivant ! ».
function levier(it, look, etat, O) {
  if (etat.effet) {
    return O.spriteTuile(78, (g, P) => {
      socleLevier(g, P, O);
      O.poly(g, [P(0.64, 0.4, 28), P(0.64, 0.44, 28), P(0.3, 0.44, 31), P(0.3, 0.4, 31)], '#d8884a');
      O.poly(g, [P(0.64, 0.58, 28), P(0.64, 0.62, 28), P(0.3, 0.62, 31), P(0.3, 0.58, 31)], '#d8884a');
      O.prisme(g, P, 0.22, 0.4, 0.3, 0.62, 29, 33, '#3a2a22');
      O.prisme(g, P, 0.12, 0.47, 0.22, 0.55, 29, 32, '#d2382c');
    });
  }
  return O.spriteTuile(78, (g, P) => {
    socleLevier(g, P, O);
    // lames et manche
    O.poly(g, [P(0.64, 0.4, 28), P(0.64, 0.44, 28), P(0.5, 0.44, 66), P(0.5, 0.4, 66)], '#d8884a');
    O.poly(g, [P(0.64, 0.58, 28), P(0.64, 0.62, 28), P(0.5, 0.62, 66), P(0.5, 0.58, 66)], '#d8884a');
    O.prisme(g, P, 0.46, 0.4, 0.54, 0.62, 64, 68, '#3a2a22');
    O.prisme(g, P, 0.47, 0.47, 0.53, 0.55, 68, 76, '#d2382c');
    O.pixel(g, P(0.48, 0.48, 75), '#ff9a9a', 1, 2);
  });
}
// Socle de fonte, mâchoires (contacts) de cuivre et isolateurs du levier.
function socleLevier(g, P, O) {
  O.prisme(g, P, 0.18, 0.22, 0.82, 0.78, 0, 12, '#2a2d33');
  O.quadY(g, P, 0.78, 0.22, 0.78, 3, 9, '#3a3f48');
  for (let i = 0; i < 6; i++) O.quadY(g, P, 0.78, 0.22 + i * 0.1, 0.27 + i * 0.1, 1, 3, i % 2 ? '#1d1d1d' : '#f5c400');
  for (const y of [0.32, 0.62]) {
    O.prisme(g, P, 0.3, y, 0.42, y + 0.08, 12, 20, '#e8e2d0');
    O.prisme(g, P, 0.31, y + 0.01, 0.41, y + 0.07, 20, 30, '#d8884a');
  }
  O.prisme(g, P, 0.58, 0.4, 0.7, 0.62, 12, 22, '#e8e2d0');
  O.prisme(g, P, 0.6, 0.42, 0.68, 0.6, 22, 28, '#c9a227');
}

function tableauNoir(it, look, etat, O) {
  return O.spriteTuile(66, (g, P) => {
    for (const x of [0.16, 0.8]) O.prisme(g, P, x, 0.5, x + 0.05, 0.58, 0, 58, '#6e4c36');
    O.prisme(g, P, 0.12, 0.42, 0.88, 0.5, 18, 56, '#6e4c36');
    O.quadY(g, P, 0.5, 0.16, 0.84, 21, 53, '#23332b');
    const craie = '#e8e6dc';
    // formules griffonnées : E = mc², une courbe, une flèche
    const [ax, ay] = P(0.2, 0.5, 50);
    g.drawImage(O.texteCanvas('E=MC2', craie), ax + 1, ay);
    for (let i = 0; i < 18; i++) O.pixel(g, P(0.22 + i * 0.03, 0.5, 30 + Math.sin(i / 2.5) * 5), craie, 1, 1);
    for (let i = 0; i < 10; i++) O.pixel(g, P(0.58 + i * 0.022, 0.5, 34), craie, 1, 1);
    O.pixel(g, P(0.78, 0.5, 35), craie, 1, 3);
    O.prisme(g, P, 0.18, 0.5, 0.82, 0.56, 19, 20, '#6e4c36');
  });
}

function tonneau(it, look, etat, O) {
  const v = it.variante || 0;
  return O.spriteTuile(44, (g, P) => {
    cylindre(g, P, O, 0.5, 0.5, 0.3, 0, 30, '#7a5028');
    for (const z of [4, 14, 25]) cylindre(g, P, O, 0.5, 0.5, 0.31, z, z + 2, '#3a3d44');
    O.quadZ(g, P, 30.2, 0.3, 0.3, 0.7, 0.7, v ? '#6e4c36' : '#7dff6a');
    if (!v) O.pixel(g, P(0.45, 0.45, 31), '#d8ffc8', 3, 1);
    else {
      const [cx, cy] = P(0.5, 0.8, 18);
      const R = R_(g);
      R(cx - 3, cy - 3, 7, 7, JAUNE_CHEMIN);
      R(cx - 1, cy - 1, 3, 3, '#1d1d1d');
    }
  });
}

// ---------- animations ----------
function animBaie(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const y1 = PIED[3];
  if (it.sens === 'dos') {
    for (let k = 0; k < 6; k++) {
      const on = (Math.floor(t / (260 + k * 70)) + k + it.x) % 3 !== 0;
      O.pixel(g, P(0.24 + (k % 2) * 0.5, y1, 12 + k * 8), on ? '#3dff7a' : '#14421f', 1, 1);
    }
    return;
  }
  for (let z = 6, k = 0; z < 60; z += 6, k++) {
    for (let j = 0; j < 3; j++) {
      const on = (Math.floor(t / (170 + j * 60 + k * 29)) + j * 3 + k + it.x) % 5 !== 0;
      const col = j === 2 ? (on && (k + it.x) % 7 === 0 ? '#ffb02e' : '#2a2a20') : on ? '#3dff7a' : '#14421f';
      O.pixel(g, P(0.72 + j * 0.05, y1, z + 1), col, 1, 1);
    }
  }
}

function animOnduleur(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  const n = 2 + (Math.floor(t / 700) % 4);
  for (let i = 0; i < n; i++) O.quadY(g, P, 0.62, 0.34 + i * 0.08, 0.4 + i * 0.08, 40, 46, '#3dff7a');
}

function animNoc(g, it, tx, ty, t, O, effet) {
  const P = O.projeteur(tx + 32, ty);
  const y0 = it.part === 'g' ? 0.08 : 0;
  const y1 = it.part === 'd' ? 0.92 : 1;
  if (effet) {
    pong(g, P, O, it, y0, y1, effet.depuis);
    return;
  }
  const u = ((t / 3000) + (it.part === 'm' ? 0.3 : it.part === 'd' ? 0.6 : 0)) % 1;
  const y = y0 + 0.1 + u * (y1 - y0 - 0.2);
  O.pixel(g, P(0.22, y, 44), '#ffffff', 1, 2);
}

// Easter egg de la supervision : une partie de Pong sur les trois écrans du poste ; la balle passe d'un écran à
// l'autre (terrain commun, en y de l'étage), les raquettes sont sur les écrans des deux bouts.
function pong(g, P, O, it, y0, y1, d) {
  const zh = it.part === 'm' ? 54 : 46;
  const a = y0 + 0.08;
  const b = y1 - 0.08;
  O.quadX(g, P, 0.22, a, b, 31, zh, '#04121c');
  const base = it.y - (it.part === 'g' ? 0 : it.part === 'm' ? 1 : 2);
  const ya = base + 0.26;
  const yb = base + 2.74;
  const tri = (v) => (v % 2 < 1 ? v % 2 : 2 - (v % 2));
  const yBalle = ya + 0.06 + tri(d / 1100) * (yb - ya - 0.12);
  const zBalle = 34 + tri(d / 700 + 0.3) * 9;
  const zr = Math.max(35, Math.min(42, zBalle));
  for (const yr of [ya, yb]) {
    const l = yr - it.y;
    if (l > a && l < b) O.quadX(g, P, 0.221, l - 0.025, l + 0.025, zr - 3, zr + 4, '#ffffff');
  }
  if (it.part === 'm') for (let z = 32; z < zh - 1; z += 3) O.quadX(g, P, 0.221, 0.485, 0.515, z, z + 1.5, '#b8c4ce');
  const lb = yBalle - it.y;
  if (lb > a + 0.04 && lb < b - 0.04) O.quadX(g, P, 0.222, lb - 0.045, lb + 0.045, zBalle, zBalle + 3, '#ffffff');
}

function animClim(g, it, tx, ty, t, O, effet) {
  // souffle froid qui sort par le bas
  const P = O.projeteur(tx + 32, ty);
  for (let i = 0; i < 3; i++) {
    const ph = (t / 1500 + i / 3) % 1;
    O.pixel(g, P(0.25 + i * 0.25, 0.62 + ph * 0.5, 6), `rgba(150,210,255,${(0.7 * (1 - ph)).toFixed(2)})`, 3, 1);
  }
  if (!effet) return;
  // easter egg : neige sur le dessus, rafales de flocons qui partent du haut au-dessus des baies (on les voit
  // par-dessus les rangées), un pingouin sort du climatiseur cliqué
  const d = effet.depuis;
  O.quadZ(g, P, 64.4, 0.18, 0.12, 0.82, 0.3, '#ffffff');
  O.quadZ(g, P, 64.4, 0.7, 0.3, 0.82, 0.52, '#ffffff');
  for (let x = 0.16; x < 0.86; x += 0.1) O.quadY(g, P, 0.622, x, x + 0.025, 58 + (Math.round(x * 37) % 4), 64, '#dff2ff');
  for (let i = 0; i < 50; i++) {
    const age = (d - i * 80) / 2000;
    if (age < 0 || age > 1) continue;
    const u = 0.2 + ((i * 0.377) % 0.6) + Math.sin(age * 6 + i) * 0.12;
    const v = 0.35 + age * (1.2 + (i % 4) * 0.45);
    const z = 66 + Math.sin(age * Math.PI) * (16 + (i % 3) * 8) + (1 - age) * 2;
    const [x, y] = P(u, v, z);
    g.fillStyle = i % 3 ? '#ffffff' : '#cfe9ff';
    if (i % 5 === 0) {
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x, y - 1, 1, 3);
    } else g.fillRect(x, y, i % 4 ? 2 : 1, i % 4 ? 2 : 1);
  }
  if (effet.clique) pingouin(g, P, O, d);
}

// Pingouin qui sort par la trappe du dessus du climatiseur, salue de l'aile et y redescend.
function pingouin(g, P, O, d) {
  const leve = d < 400 ? d / 400 : d > 4800 ? Math.max(0, 1 - (d - 4800) / 500) : 1;
  if (leve <= 0) return;
  O.quadZ(g, P, 64.3, 0.34, 0.2, 0.66, 0.46, '#1a1d22');
  const [fx, fy] = P(0.5, 0.33, 64);
  const dy = Math.round((1 - leve) * 24);
  g.save();
  g.beginPath();
  g.rect(fx - 20, fy - 60, 40, 62);
  g.clip();
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(fx + x, fy + dy + y, w, h);
  };
  const noir = '#15151f';
  R(-6, -23, 12, 2, noir);
  R(-7, -21, 14, 18, noir);
  R(-6, -3, 12, 2, noir);
  R(-5, -15, 10, 12, '#f4f8fc');
  R(-4, -16, 8, 1, '#f4f8fc');
  R(-4, -20, 3, 3, '#ffffff');
  R(1, -20, 3, 3, '#ffffff');
  R(-3, -19, 1, 2, noir);
  R(2, -19, 1, 2, noir);
  R(-1, -17, 3, 2, '#ff9a1f');
  R(-6, -1, 5, 2, '#ff9a1f');
  R(1, -1, 5, 2, '#ff9a1f');
  R(-9, -15, 2, 9, noir);
  if (d > 400 && d < 4800 && Math.floor(d / 220) % 2) for (let k = 0; k < 8; k++) R(7 + Math.round(k * 0.5), -16 - k, 2, 1, noir);
  else R(7, -15, 2, 9, noir);
  g.restore();
}

// Arcs électriques : du tore de la bobine vers les baies voisines de la frise (x - 1, y + 1) et (x + 1, y - 1).
function eclair(g, P, x0, y0, z0, x1, y1, z1, t, graineArc) {
  const n = 9;
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const j = i && i < n ? Math.sin(t / 37 + i * 2.1 + graineArc) * 5 : 0;
    const [x, y] = P(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k + Math.sin(k * Math.PI) * 10);
    const pt = [Math.round(x + j * 0.6), Math.round(y + j)];
    if (prev) {
      const steps = Math.max(Math.abs(pt[0] - prev[0]), Math.abs(pt[1] - prev[1]), 1);
      for (let s = 0; s <= steps; s++) {
        const px = Math.round(prev[0] + ((pt[0] - prev[0]) * s) / steps);
        const py = Math.round(prev[1] + ((pt[1] - prev[1]) * s) / steps);
        g.fillStyle = VIOLET;
        g.fillRect(px - 1, py, 3, 1);
        g.fillStyle = '#ffffff';
        g.fillRect(px, py, 1, 1);
      }
    }
    prev = pt;
  }
}
function animTesla(g, it, tx, ty, t, O, effet) {
  const P = O.projeteur(tx + 32, ty);
  const v = it.variante || 0;
  // easter egg du levier : la bobine se charge (1), lâche la grande décharge (2), puis se calme (3)
  const charge = !effet ? 0 : effet.phase === 1 ? effet.depuis / 1000 : effet.phase === 2 ? 1 : Math.max(0, 1 - (effet.depuis - 4500) / 1500);
  if (effet && effet.phase === 2) {
    const k = Math.floor(t / 70);
    eclair(g, P, 0.5, 0.5, 70, -0.5, 1.5, 64, k * 37, v * 3);
    eclair(g, P, 0.5, 0.5, 70, 1.5, -0.5, 64, k * 41, v * 3 + 1);
    eclair(g, P, 0.5, 0.5, 72, 0.5 + Math.sin(k + v) * 0.6, 0.5 + Math.cos(k * 1.3 + v) * 0.6, 120, k * 29, v);
  }
  // lueur autour du tore (une couronne, sans voiler le métal)
  g.save();
  g.globalAlpha = Math.min(1, 0.35 + 0.2 * Math.sin(t / 120 + v) + charge * 0.5);
  g.fillStyle = VIOLET;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + t / 700;
    const [x, y] = P(0.5 + Math.cos(a) * 0.46, 0.5 + Math.sin(a) * 0.46, 67);
    g.fillRect(Math.round(x), Math.round(y), 2, 1);
  }
  g.restore();
  // un arc vers une baie voisine, par salves
  const cycle = (t + v * 700) % 2600;
  if (cycle < 900) {
    const vers = Math.floor((t + v * 700) / 2600) % 2 ? [-0.5, 1.5] : [1.5, -0.5];
    eclair(g, P, 0.5, 0.5, 70, vers[0], vers[1], 64, t, v * 3);
  }
  // petites décharges autour du tore
  for (let i = 0; i < 2; i++) {
    const a = t / 90 + i * 3 + v;
    const [x, y] = P(0.5 + Math.cos(a) * 0.45, 0.5 + Math.sin(a) * 0.45, 70 + Math.sin(a * 3) * 4);
    g.fillStyle = '#e8d0ff';
    g.fillRect(Math.round(x), Math.round(y), 2, 1);
  }
}

function animCage(g, it, tx, ty, t, O) {
  // la créature cligne des yeux de temps en temps
  if ((t + it.x * 900) % 3200 > 180) return;
  const P = O.projeteur(tx + 32, ty);
  const [cx, cy] = P(0.5, 0.5, 4);
  g.fillStyle = '#4aa03a';
  g.fillRect(cx - 4, cy - 12, 3, 3);
  g.fillRect(cx + 1, cy - 12, 3, 3);
}

function animCuve(g, it, tx, ty, t, O, effet) {
  const P = O.projeteur(tx + 32, ty);
  const n = effet ? 6 : 3;
  for (let i = 0; i < n; i++) {
    const ph = (t / (effet ? 900 : 2200) + i / n + (it.variante || 0) * 0.2) % 1;
    O.pixel(g, P(0.32 + (i % 3) * 0.08, 0.66, 14 + ph * 48), 'rgba(220,255,225,0.85)', 2, 2);
  }
  if (!effet) return;
  // easter egg : le cerveau a une idée, l'œil regarde partout puis cligne, la main fait coucou
  const v = (it.variante || 0) % 3;
  const d = effet.depuis;
  const [cx, cy] = P(0.42, 0.5, 36);
  const R = R_(g);
  if (v === 0) {
    if (Math.floor(d / 300) % 2) {
      R(cx - 5, cy - 3, 3, 1, '#ffe0ea');
      R(cx + 1, cy - 4, 4, 1, '#ffe0ea');
      R(cx - 2, cy + 1, 5, 1, '#ffe0ea');
    }
    if (d > 700) {
      // bulle de pensée et ampoule allumée
      const [bx, by] = P(0.42, 0.5, 104);
      R(bx + 2, by + 12, 2, 2, '#f4f8fc');
      R(bx + 4, by + 6, 3, 3, '#f4f8fc');
      O.cadre(g, bx - 9, by - 17, 19, 18, '#15151f', '#f4f8fc');
      const on = d < 1200 || Math.floor(d / 250) % 3;
      R(bx - 3, by - 13, 7, 6, on ? '#ffd23f' : '#c9b46a');
      R(bx - 2, by - 14, 5, 1, on ? '#ffd23f' : '#c9b46a');
      R(bx - 1, by - 7, 3, 1, on ? '#ffd23f' : '#c9b46a');
      R(bx - 2, by - 6, 5, 3, '#8d939c');
      R(bx - 2, by - 12, 1, 2, '#fff8c0');
      if (on) {
        R(bx - 8, by - 11, 2, 1, '#ffd23f');
        R(bx + 7, by - 11, 2, 1, '#ffd23f');
        R(bx, by - 17, 1, 1, '#ffd23f');
      }
    }
  } else if (v === 1) {
    const [ox, oy] = [[-2, 0], [2, 0], [0, -2], [0, 0]][Math.min(3, Math.floor(d / 900))];
    const cligne = (d > 3000 && d < 3200) || (d > 3500 && d < 3700) || d > 4400;
    if (cligne) {
      R(cx - 5, cy - 5, 10, 10, '#d89a9a');
      R(cx - 6, cy - 3, 12, 6, '#d89a9a');
      R(cx - 5, cy, 10, 1, '#8a4a4a');
    } else {
      R(cx - 2 + ox, cy - 2 + oy, 5, 5, '#3a8ad6');
      R(cx - 1 + ox, cy - 1 + oy, 3, 3, '#15151f');
      R(cx + ox, cy - 1 + oy, 1, 1, '#ffffff');
    }
  } else {
    const p = Math.floor(d / 240) % 2 ? 2 : -2;
    const h = Math.floor(d / 480) % 2;
    main(g, cx, cy - h, p);
  }
}

// Main dans sa cuve, doigts penchés de `p` pixels en haut (la main fait coucou).
function main(g, cx, cy, p) {
  const peau = '#d8b8a0';
  const R = R_(g);
  R(cx - 4, cy - 2, 8, 7, peau);
  for (let k = 0; k < 4; k++) {
    const h = k === 0 ? 4 : 7;
    for (let r = 0; r < h; r++) R(cx - 4 + k * 2 + Math.round((p * (h - 1 - r)) / 6), cy - 9 + (7 - h) + r, 1, 1, peau);
  }
  R(cx + 4, cy, 3, 2, peau);
}

function animPaillasse(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  if (it.part !== 'g') {
    const k = Math.floor(t / 400) % 4;
    O.pixel(g, P(0.62 + k * 0.07, 0.52, 39 + (t / 100) % 4), 'rgba(255,255,255,0.7)', 1, 1);
    return;
  }
  // flamme du bec Bunsen et bulles du ballon
  const f = Math.floor(t / 90) % 3;
  O.prisme(g, P, 0.29, 0.41, 0.33, 0.45, 27, 30 + f, '#5fa8ff');
  for (let i = 0; i < 3; i++) {
    const ph = (t / 600 + i / 3) % 1;
    O.pixel(g, P(0.27 + i * 0.05, 0.43, 35 + ph * 18), ph < 0.6 ? '#c8ffb0' : 'rgba(230,255,220,0.5)', 2, 2);
  }
}

function animJacob(g, it, tx, ty, t, O, effet) {
  const P = O.projeteur(tx + 32, ty);
  // easter egg du levier : pendant la grande décharge, deux arcs qui montent trois fois plus vite
  const vite = effet && effet.phase === 2;
  for (const decale of vite ? [0, 0.5] : [0]) {
    const ph = (t / (vite ? 430 : 1300) + decale) % 1;
    const z = 18 + ph * 38;
    const ecart = 0.12 + ph * 0.18;
    const [ax, ay] = P(0.5 - ecart, 0.5, z);
    const [bx, by] = P(0.5 + ecart, 0.5, z);
    const n = Math.max(1, Math.round(Math.abs(bx - ax)));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(ax + ((bx - ax) * i) / n);
      const y = Math.round(ay + ((by - ay) * i) / n - Math.sin((i / n) * Math.PI) * 4 + Math.sin(t / 40 + i) * 1.2);
      g.fillStyle = VIOLET;
      g.fillRect(x, y - 1, 1, 3);
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, 1, 1);
    }
  }
}

// ---------- easter egg du levier : « Il est vivant ! » ----------
// Trait pixel de (x0, y0) à (x1, y1).
function segment(g, x0, y0, x1, y1, col) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  g.fillStyle = col;
  for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
}

// Le levier : étincelles aux mâchoires quand on l'abaisse et pendant la décharge, puis la réplique culte.
function animLevier(g, it, tx, ty, t, O, effet) {
  if (!effet) return;
  const P = O.projeteur(tx + 32, ty);
  const d = effet.depuis;
  if (d < 1400 || (effet.phase === 2 && Math.floor(d / 160) % 3 === 0)) {
    for (const y of [0.36, 0.66]) {
      const [x0, y0] = P(0.36, y, 30);
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + d / 60;
        const r = 2 + ((d / 30 + i * 3) % 6);
        g.fillStyle = i % 2 ? '#fff3a0' : '#ffd23f';
        g.fillRect(Math.round(x0 + Math.cos(a) * r), Math.round(y0 + Math.sin(a) * r * 0.7 - r * 0.4), 1, 1);
      }
    }
  }
  if (effet.phase === 3) {
    const tc = O.texteCanvas(O.enseigne('IL EST VIVANT !', "IT'S ALIVE!"), '#15151f');
    const [x, y] = P(0.5, 0.5, 84);
    const w = tc.width * 2 + 10;
    const h = tc.height * 2 + 8;
    const bx = Math.round(x - 10);
    const by = Math.round(y - h - 6);
    O.cadre(g, bx, by, w, h, '#15151f', '#fff4d6');
    g.drawImage(tc, bx + 5, by + 4, tc.width * 2, tc.height * 2);
    g.fillStyle = '#15151f';
    g.fillRect(bx + 8, by + h, 3, 3);
    g.fillRect(bx + 8, by + h + 3, 2, 2);
  }
}

// Générateur de Van de Graaff : pendant la décharge, des étincelles jaillissent de la sphère.
function animVanDeGraaff(g, it, tx, ty, t, O, effet) {
  if (!effet || effet.phase !== 2) return;
  const P = O.projeteur(tx + 32, ty);
  const [cx, cy] = P(0.5, 0.5, 62);
  const k = Math.floor(t / 80);
  for (let i = 0; i < 4; i++) {
    const a = (((k * 7 + i * 13) % 20) / 20) * Math.PI * 2;
    let x = cx + Math.cos(a) * 13;
    let y = cy + Math.sin(a) * 13;
    for (let s = 0; s < 5; s++) {
      const nx = x + Math.cos(a) * 4 + (((k + s + i) % 3) - 1) * 2;
      const ny = y + Math.sin(a) * 4 + (((k * 2 + s) % 3) - 1) * 2;
      segment(g, x, y, nx, ny, s % 2 ? '#ffffff' : VIOLET);
      x = nx;
      y = ny;
    }
  }
}

// Table d'opération : la décharge frappe les électrodes (2), puis la créature redressée cligne des yeux (3).
function animTableOp(g, it, tx, ty, t, O, effet) {
  if (!effet) return;
  const P = O.projeteur(tx + 32, ty);
  const d = effet.depuis;
  if (effet.phase === 2) {
    const k = Math.floor(t / 60);
    eclair(g, P, 0.3, 0.3, 56, 0.34, 0.5, 33, k * 31, 1);
    eclair(g, P, 0.3, 0.7, 56, 0.34, 0.5, 33, k * 43, 2);
    // le drap tressaute
    if (k % 2) for (const [x, y] of [[0.6, 0.26], [0.9, 0.74], [1.3, 0.3]]) O.pixel(g, P(x, y, 32), '#ffffff', 2, 1);
  } else if (effet.phase === 3) {
    if (Math.floor(d / 500) % 5 === 0) O.quadX(g, P, 0.632, 0.4, 0.6, 54, 57.5, '#7fcf5a');
    const [x, y] = P(0.5, 0.5, 70);
    g.drawImage(O.texteCanvas('!', '#ffd23f'), x - 1, y - 8 - (Math.floor(d / 200) % 2));
  }
}

// Scialytique : la lampe clignote pendant la décharge.
function animScialytique(g, it, tx, ty, t, O, effet) {
  if (!effet || effet.phase !== 2 || Math.floor(t / 90) % 3) return;
  const P = O.projeteur(tx + 32, ty);
  O.poly(g, [P(-0.52, 0.78, 66), P(-0.08, 0.78, 66), P(-0.08, 1.22, 66), P(-0.52, 1.22, 66)], '#5a5648');
}

function animChandelier(g, it, tx, ty, t, O) {
  const P = O.projeteur(tx + 32, ty);
  for (const x of [0.26, 0.48, 0.7]) {
    const h = x === 0.48 ? 46 : 42;
    const f = Math.floor(t / 110 + x * 10) % 3;
    const [cx, cy] = P(x + 0.02, 0.5, h);
    g.fillStyle = '#ff9a1f';
    g.fillRect(cx - 1, cy - 4 - f, 3, 4 + f);
    g.fillStyle = '#fff3a0';
    g.fillRect(cx, cy - 3 - f, 1, 3);
  }
}

// ---------- sols ----------
function dansTuile(x, y) {
  if (y < 0 || y > 30) return false;
  const hw = y <= 15 ? 2 * y + 2 : 62 - 2 * y;
  return x >= 32 - hw && x <= 32 + hw - 1;
}
export const SOLS = {
  // dalle de faux plancher : bord clair, joints, petit trou de levage
  srv_plancher(g, col, { variante }, O) {
    const Pt = O.projeteur(32, 0);
    const fonce = O.nuance(col, -0.16);
    for (let i = 0; i <= 20; i++) {
      O.pixel(g, Pt(i / 20, 0.03), O.nuance(col, 0.14), 1, 1);
      O.pixel(g, Pt(0.03, i / 20), O.nuance(col, 0.1), 1, 1);
    }
    O.pixel(g, Pt(0.5, 0.5), fonce, 2, 1);
    if (variante === 1) O.pixel(g, Pt(0.22, 0.7), fonce, 3, 1);
  },
  // dalle perforée de l'allée froide : grille de petits trous
  srv_perfore(g, col, info, O) {
    const Pt = O.projeteur(32, 0);
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) O.pixel(g, Pt(0.14 + i * 0.12, 0.14 + j * 0.12), O.nuance(col, -0.3), 1, 1);
    for (let i = 0; i <= 20; i++) O.pixel(g, Pt(i / 20, 0.03), O.nuance(col, 0.18), 1, 1);
  },
  // dalles de pierre irrégulières, mousse et fissures (cave du labo)
  srv_dalles(g, col, { rnd, variante }, O) {
    const Pt = O.projeteur(32, 0);
    const joint = O.nuance(col, -0.35);
    const cx = 0.35 + (variante % 2) * 0.3;
    for (let i = 0; i <= 24; i++) {
      O.pixel(g, Pt(cx, i / 24), joint, 1, 1);
      O.pixel(g, Pt(i / 24, 0.02), joint, 1, 1);
      if (i / 24 < cx) O.pixel(g, Pt(i / 24, 0.55), joint, 1, 1);
    }
    for (let i = 0; i < 26; i++) {
      const px = Math.floor(rnd() * 64);
      const py = Math.floor(rnd() * 31);
      if (!dansTuile(px, py)) continue;
      g.fillStyle = i % 5 === 0 ? '#4a5a3a' : rnd() < 0.5 ? O.nuance(col, -0.1) : O.nuance(col, 0.08);
      g.fillRect(px, py, 1, 1);
    }
  },
  // damier noir et blanc usé du laboratoire
  srv_damier(g, col, { parite, rnd }, O) {
    const Pt = O.projeteur(32, 0);
    const noir = '#2a2622';
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        if ((i + j + parite) % 2) O.poly(g, [Pt(i / 2, j / 2), Pt((i + 1) / 2, j / 2), Pt((i + 1) / 2, (j + 1) / 2), Pt(i / 2, (j + 1) / 2)], noir);
      }
    }
    for (let i = 0; i < 14; i++) {
      const px = Math.floor(rnd() * 64);
      const py = Math.floor(rnd() * 31);
      if (dansTuile(px, py)) O.pixel(g, [px, py], i % 4 ? O.nuance(col, -0.2) : '#5a7a3a', 1, 1);
    }
  },
};

// ---------- murs ----------
// Datacenter : panneaux gris clair, grille de reprise d'air en haut, chemin de câbles mural, plinthe bleue.
function murPanneaux(g, longueur, cote, rnd, O) {
  const R = R_(g);
  R(0, 0, longueur, HW_, '#d3d8de');
  for (let x = 0; x < longueur; x += 32) {
    R(x, 0, 1, HW_, '#b8bec6');
    R(x + 1, 0, 1, HW_, '#e6eaee');
  }
  R(0, 16, longueur, 12, '#aeb6c0');
  for (let x = 2; x < longueur; x += 3) for (let y = 18; y < 27; y += 3) R(x, y, 1, 1, '#7d8692');
  R(0, 4, longueur, 2, JAUNE_CHEMIN);
  R(0, 10, longueur, 2, JAUNE_CHEMIN);
  for (let x = 4; x < longueur; x += 12) R(x, 6, 2, 4, '#b88a12');
  R(0, 6, longueur, 1, '#2f6fde');
  R(0, 8, longueur, 1, '#e3342f');
  R(0, HW_ - 6, longueur, 6, '#2f6fde');
  R(0, HW_ - 6, longueur, 1, '#5f8fee');
}

// Labo : pierres de taille, tuyaux de cuivre avec vannes et manomètres, toiles d'araignée.
function murPierre(g, longueur, cote, rnd, O) {
  const R = R_(g);
  R(0, 0, longueur, HW_, '#2e2a26');
  const teintes = ['#5e574d', '#6b6358', '#544d44', '#655d52'];
  for (let y = 0, r = 0; y < HW_ - 8; y += 11, r++) {
    for (let x = r % 2 ? -12 : 0; x < longueur; x += 24) {
      const col = teintes[Math.floor(rnd() * teintes.length)];
      R(x + 1, y + 1, 22, 9, col);
      R(x + 1, y + 1, 22, 1, O.nuance(col, 0.15));
      R(x + 2, y + 9, 21, 1, O.nuance(col, -0.2));
      if (rnd() < 0.25) R(x + 4 + Math.floor(rnd() * 14), y + 3 + Math.floor(rnd() * 5), 2, 1, '#4a5a3a');
    }
  }
  // tuyaux de cuivre
  for (const y of [30, 36]) {
    R(0, y, longueur, 3, '#b87333');
    R(0, y, longueur, 1, '#e8a060');
    R(0, y + 2, longueur, 1, '#7a4a20');
  }
  for (let x = 40; x < longueur; x += 96) {
    R(x, 28, 4, 11, '#7a4a20');
    // vanne
    R(x - 4, 22, 12, 2, '#c0392b');
    R(x + 1, 18, 2, 10, '#c0392b');
    // manomètre
    R(x + 20, 24, 9, 9, '#c9a227');
    R(x + 21, 25, 7, 7, '#f4ecd2');
    R(x + 24, 26, 1, 3, '#1d1d1d');
    R(x + 24, 28, 2, 1, '#c0392b');
  }
  R(0, HW_ - 8, longueur, 8, '#24201c');
  R(0, HW_ - 8, longueur, 1, '#4a433a');
  // toiles d'araignée dans les coins hauts
  for (const x0 of [0, longueur - 18]) {
    for (let k = 0; k < 16; k++) {
      R(x0 + (x0 ? 18 - k : k), 0, 1, 1, 'rgba(230,230,230,0.5)');
      R(x0 + (x0 ? 18 - k : k), k, 1, 1, 'rgba(230,230,230,0.35)');
      if (k % 4 === 0) R(x0 + (x0 ? 18 - k : 0), k, k, 1, 'rgba(230,230,230,0.25)');
    }
  }
}

function decorMursDatacenter(g, cote, longueur, etage, O) {
  const R = R_(g);
  const panneau = (x, y, w, h, fond, txt, col) => {
    O.cadre(g, x, y, w, h, '#2a2d33', fond);
    g.drawImage(O.texteCanvas(txt, col), Math.round(x + w / 2 - O.mesurer(txt) / 2), y + Math.round(h / 2) - 4);
  };
  if (cote === 'droite') {
    O.enseigneQG(g);
    // température et hygrométrie au-dessus du tableau électrique
    O.cadre(g, 7 * 32 + 6, 34, 52, 24, '#2a2d33', '#0b1a2a');
    g.drawImage(O.texteCanvas('21.5C', '#3dff7a'), 7 * 32 + 12, 38);
    g.drawImage(O.texteCanvas('45%', '#8fe6ff'), 7 * 32 + 12, 47);
    // arrêt d'urgence et sortie de secours
    O.cadre(g, 12 * 32 + 4, 36, 18, 20, '#f5c400', '#f5c400');
    for (let y = -3; y <= 3; y++) R(12 * 32 + 13 - Math.round(Math.sqrt(10 - y * y)), 46 + y, Math.round(Math.sqrt(10 - y * y)) * 2, 1, '#d2382c');
    panneau(11 * 32 + 2, 32, 22, 10, '#2f9e44', '->', '#ffffff');
  } else {
    O.plaqueEtage(g, etage);
    const c = (gy) => Math.round((H_ - gy) * 32);
    // allée froide (au-dessus de son bout gauche)
    panneau(c(8.5) - 20, 4, 40, 9, '#2f6fde', O.enseigne('FROID', 'COLD'), '#ffffff');
    // écran de supervision au-dessus du poste
    const x0 = c(10.8);
    const x1 = c(8.2);
    O.cadre(g, x0, 18, x1 - x0, 34, '#2a2d33', '#0b1a2a');
    for (let i = 0; i < x1 - x0 - 10; i++) {
      R(x0 + 5 + i, 44 - Math.round(6 + Math.sin(i / 6) * 4 + Math.sin(i / 2.3) * 2), 1, 1, '#3dff7a');
      R(x0 + 5 + i, 46 - Math.round(3 + Math.cos(i / 9) * 3), 1, 1, '#ffb02e');
    }
    g.drawImage(O.texteCanvas('OK', '#3dff7a'), x0 + 5, 21);
  }
}

function decorMursLabo(g, cote, longueur, etage, O) {
  const R = R_(g);
  if (cote === 'droite') {
    O.enseigneQG(g);
    // le grand interrupteur à couteaux, entre deux isolateurs
    const x = 6 * 32;
    O.cadre(g, x, 10, 46, 50, '#4a2f1f', '#2a2d33');
    for (const k of [0, 1, 2]) {
      R(x + 9 + k * 12, 18, 4, 4, '#c9a227');
      R(x + 9 + k * 12, 46, 4, 4, '#c9a227');
      R(x + 10 + k * 12, 22, 2, 24, '#d8884a');
    }
    R(x + 7, 32, 34, 3, '#3a2a22');
    R(x + 20, 26, 8, 6, '#d2382c');
    // « Danger ! Haute tension »
    const tx = 8 * 32 + 6;
    for (let k = 0; k < 13; k++) R(tx + 13 - k, 14 + k, k * 2 + 1, 1, '#f5c400');
    R(tx + 13, 18, 1, 6, '#1d1d1d');
    R(tx + 13, 25, 1, 1, '#1d1d1d');
    // tableau noir couvert d'équations
    const bx = 10 * 32;
    O.cadre(g, bx, 10, 90, 44, '#6e4c36', '#23332b');
    const craie = '#e8e6dc';
    g.drawImage(O.texteCanvas('E=MC2', craie), bx + 6, 14);
    g.drawImage(O.texteCanvas('?!', '#ff8fb1'), bx + 70, 14);
    for (let i = 0; i < 74; i++) R(bx + 8 + i, 40 - Math.round(Math.sin(i / 8) * 8), 1, 1, craie);
    for (let i = 0; i < 30; i++) R(bx + 8 + i, 28, 1, 1, craie);
    R(bx + 50, 26, 20, 1, craie);
    R(bx + 52, 30, 16, 1, craie);
    // soupirail : orage la nuit
    const sx = 13 * 32 + 20;
    O.cadre(g, sx, 8, 40, 20, '#3a3230', '#141a33');
    for (let k = 0; k < 9; k++) R(sx + 22 - k, 10 + k * 2, 2, 2, '#fff6a0');
    for (let k = 0; k < 4; k++) R(sx + 6 + k * 9, 8, 2, 20, '#3a3230');
  } else {
    O.plaqueEtage(g, etage);
    const c = (gy) => Math.round((H_ - gy) * 32);
    // planche d'anatomie : un squelette
    const ax = c(11.4);
    O.cadre(g, ax, 12, 34, 46, '#6e4c36', '#ece4d0');
    const cx = ax + 17;
    R(cx - 3, 16, 7, 6, '#3a3230');
    R(cx - 2, 18, 1, 1, '#ece4d0');
    R(cx + 1, 18, 1, 1, '#ece4d0');
    R(cx, 22, 1, 16, '#3a3230');
    for (let k = 0; k < 4; k++) R(cx - 5, 25 + k * 3, 11, 1, '#3a3230');
    R(cx - 7, 24, 1, 12, '#3a3230');
    R(cx + 7, 24, 1, 12, '#3a3230');
    R(cx - 3, 38, 1, 14, '#3a3230');
    R(cx + 3, 38, 1, 14, '#3a3230');
    R(cx - 3, 38, 7, 1, '#3a3230');
  }
}

// ---------- thèmes ----------
export const THEMES = {
  srv_datacenter: {
    sols: {
      def: ['srv_plancher', '#c9ced6'], lobby: ['srv_plancher', '#d9dde3'], froide: ['srv_perfore', '#a9bccf'], chaude: ['srv_plancher', '#c4b6b0'],
      reserve: ['srv_plancher', '#bfc4cc'],
    },
    mur: 'srv_panneaux', dalle: '#3a3f48', bureau: '#c8ccd2', chaise: '#2b2f36', canape: '#3f4a55', canapeEquipe: '#2b8a5a', table: '#5d636c',
  },
  srv_labo: {
    sols: {
      def: ['srv_dalles', '#6b6358'], lobby: ['srv_dalles', '#757064'], cave: ['srv_dalles', '#5e574d'], ligne: ['srv_dalles', '#4a443c'],
      labo: ['srv_damier', '#d8d0bc'],
    },
    mur: 'srv_pierre', dalle: '#2a2622', bureau: '#6e4c36', chaise: '#3a2a22', canape: '#5a2a2a', canapeEquipe: '#3a4a2a', table: '#5a3a22',
  },
};

export const MEUBLES = {
  srv_baie: baie,
  srv_chemin: cheminSeul,
  srv_rideau: rideau,
  srv_clim: clim,
  srv_tableau_elec: tableauElec,
  srv_onduleur: onduleur,
  srv_bouteilles: bouteilles,
  srv_noc: noc,
  srv_extincteur: extincteur,
  srv_dalle_ouverte: dalleOuverte,
  srv_bobine: bobine,
  srv_cartons: cartons,
  srv_chariot: chariot,
  srv_tesla: tesla,
  srv_vandegraaff: vanDeGraaff,
  srv_cage: cage,
  srv_marquage: marquage,
  srv_bocaux: bocaux,
  srv_grimoires: grimoires,
  srv_cuve: cuve,
  srv_chandelier: chandelier,
  srv_table_op: tableOp,
  srv_scialytique: scialytique,
  srv_paillasse: paillasse,
  srv_jacob: jacob,
  srv_levier: levier,
  srv_tableau_noir: tableauNoir,
  srv_tonneau: tonneau,
};
export const ANIMES = {
  srv_baie: animBaie, srv_onduleur: animOnduleur, srv_noc: animNoc, srv_clim: animClim, srv_tesla: animTesla, srv_cuve: animCuve, srv_cage: animCage,
  srv_paillasse: animPaillasse, srv_jacob: animJacob, srv_chandelier: animChandelier, srv_levier: animLevier,
  srv_vandegraaff: animVanDeGraaff, srv_table_op: animTableOp, srv_scialytique: animScialytique,
};
// Easter eggs (web/clics.js) : un clic sur ces meubles lance une petite scène, puis tout revient comme avant.
export const CLICS = {
  // datacenter : tous les climatiseurs soufflent une tempête de neige, un pingouin sort de celui qu'on a cliqué
  srv_clim: { duree: 6000, declenche: ['srv_clim'] },
  // datacenter : partie de Pong sur les trois écrans de supervision
  srv_noc: { duree: 8000, declenche: ['srv_noc'] },
  // labo : « Il est vivant ! » — levier abaissé, les bobines se chargent (1), grande décharge (2), la créature se
  // redresse sur la table d'opération (3)
  srv_levier: { duree: 8500, declenche: ['srv_tesla', 'srv_jacob', 'srv_vandegraaff', 'srv_table_op', 'srv_scialytique'], phases: [1000, 4500] },
  // labo : le cerveau a une idée, l'œil regarde partout et cligne, la main fait coucou
  srv_cuve: { duree: 5000, declenche: ['srv_cuve'] },
};
export const JEUX = {};
export const MURS = { srv_panneaux: murPanneaux, srv_pierre: murPierre };
export const DECORS_MURS = { srv_datacenter: decorMursDatacenter, srv_labo: decorMursLabo };
