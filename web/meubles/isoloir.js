// Meubles, sols et murs des décors au choix de la famille « isoloir » (1.0.10). Contrat : web/meubles/index.js.
// Trois décors : le studio feutré (cabine vitrée, mousse acoustique), la cellule de prison (barreaux, lit de camp,
// traits de craie) et la suite présidentielle (jacuzzi, lit king size, bar, baies vitrées).

// Style d'un meuble partagé (poste des sous-agents…) d'après le thème visuel de l'étage (carte.look).
const style = (typeTheme) => (typeTheme === 'isoloir-cellule' ? 'cellule' : typeTheme === 'isoloir-suite' ? 'suite' : 'studio');

// ---------- petits outils de dessin ----------
// Disque à plat (dessus d'une table ronde, d'un disque vinyle…) : centre (cx, cy) en cases, rayon r, hauteur z.
function disqueZ(O, g, P, cx, cy, r, z, col, ry = r) {
  const pts = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    pts.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * ry, z));
  }
  O.poly(g, pts, col);
}
// Rond sur une face tournée vers +y (haut-parleur, hublot…) : centre (cx, cz), rayon rx (cases) et rz (px).
function rondY(O, g, P, y, cx, cz, rx, rz, col) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push(P(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz));
  }
  O.poly(g, pts, col);
}
// Le même sur une face tournée vers +x.
function rondX(O, g, P, x, cy, cz, ry, rz, col) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push(P(x, cy + Math.cos(a) * ry, cz + Math.sin(a) * rz));
  }
  O.poly(g, pts, col);
}
// Rectangle plein sur un canvas plat (murs).
const rect = (g, x, y, w, h, col) => {
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};
// Disque plein sur un canvas plat (murs).
function rond(g, cx, cy, r, col) {
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y + 0.3));
    rect(g, cx - w, cy + y, w * 2 + 1, 1, col);
  }
}
// Haut-parleur sur une face +y : membrane sombre, cache clair, ogive.
function hautParleur(O, g, P, y, cx, cz, r) {
  rondY(O, g, P, y, cx, cz, r, r * 30, '#0e0c10');
  rondY(O, g, P, y, cx, cz, r * 0.72, r * 21, '#3a3640');
  rondY(O, g, P, y, cx, cz, r * 0.3, r * 9, '#6e6878');
}

// ---------- meubles communs aux trois décors ----------
// Poste d'un sous-agent : un bureau avec un écran qui montre du code. `face` : 'y' (l'écran regarde vers +y, la
// personne assise en y + 1) ou 'x' (l'écran regarde vers +x, la personne assise en x + 1).
function poste(it, typeTheme, etat, O) {
  const T = O.theme(typeTheme);
  const st = style(typeTheme);
  const fx = it.face === 'x';
  return O.spriteTuile(56, (g, P) => {
    // rectangle en repère local : u en travers de l'écran, v vers la personne assise
    const R = (u0, v0, u1, v1, z0, z1, col) => (fx ? O.prisme(g, P, v0, u0, v1, u1, z0, z1, col) : O.prisme(g, P, u0, v0, u1, v1, z0, z1, col));
    const Q = fx ? (x, y, z) => P(y, x, z) : P;
    const plateau = st === 'cellule' ? '#8d949c' : st === 'suite' ? '#f1ece0' : T.bureau;
    if (st === 'suite') {
      // pieds en X dorés, plateau de marbre blanc
      for (const u of [0.12, 0.82]) R(u, 0.2, u + 0.06, 0.8, 0, 20, '#c9a227');
    } else O.pieds(g, P, 0.08, 0.1, 0.92, 0.9, 20, O.nuance(plateau, -0.35));
    R(0.06, 0.08, 0.94, 0.92, 20, 24, plateau);
    if (st === 'cellule') {
      // vieil écran cathodique beige (le code en vert), clavier jauni
      R(0.26, 0.1, 0.74, 0.4, 24, 31, '#b9b096');
      R(0.22, 0.32, 0.78, 0.5, 24, 45, '#d8cfb2');
      O.ecranContenu(g, Q, 0.5, 0.3, 0.7, 29, 41, 'console');
      R(0.26, 0.64, 0.74, 0.82, 24, 26, '#c8bf9f');
      R(0.8, 0.6, 0.9, 0.7, 24, 30, '#f2f2f2');
      return;
    }
    R(0.46, 0.3, 0.54, 0.36, 24, 28, '#2a2d36');
    R(0.22, 0.3, 0.78, 0.36, 27, 44, st === 'suite' ? '#c9a227' : '#2a2d36');
    O.ecranContenu(g, Q, 0.36, 0.25, 0.75, 29, 42, 'code');
    R(0.3, 0.68, 0.7, 0.82, 24, 25, '#d9dce2');
    if (st === 'suite') {
      // une coupe de champagne
      R(0.84, 0.6, 0.88, 0.64, 24, 30, '#e8e8f0');
      R(0.81, 0.57, 0.91, 0.67, 30, 34, '#f6e7a1');
    } else {
      R(0.08, 0.6, 0.17, 0.69, 24, 30, '#ffffff');
    }
  });
}

// ---------- studio feutré ----------
// Aile du grand bureau de studio, de part et d'autre du bureau de l'agent (même plateau, même hauteur) :
// à gauche un micro sur bras articulé et une enceinte de proximité, à droite une table de mixage et l'autre enceinte.
function console_(it, typeTheme, etat, O) {
  const T = O.theme(typeTheme);
  const gauche = it.part === 'g';
  const x0 = gauche ? 0.06 : 0;
  const x1 = gauche ? 1 : 0.94;
  return O.spriteTuile(64, (g, P) => {
    const col = T.bureau;
    O.pieds(g, P, x0, 0.08, x1, 0.92, 20, O.nuance(col, -0.35), { e: gauche, w: !gauche });
    O.prisme(g, P, x0, 0.08, x1, 0.92, 20, 24, col);
    O.quadY(g, P, 0.92, x0 + 0.02, x1 - 0.02, 21, 22, '#c9a227');
    // enceinte de proximité, côté extérieur
    const ex = gauche ? 0.1 : 0.62;
    O.prisme(g, P, ex, 0.5, ex + 0.28, 0.84, 24, 44, '#221e26');
    hautParleur(O, g, P, 0.84, ex + 0.14, 30, 0.08);
    O.pixel(g, P(ex + 0.14, 0.84, 40), '#9a94a6', 2, 2);
    if (gauche) {
      // micro : pince, mât, bras qui se penche vers le fauteuil (case x + 1, y - 1)
      O.prisme(g, P, 0.5, 0.14, 0.6, 0.24, 24, 28, '#15151f');
      O.prisme(g, P, 0.53, 0.17, 0.57, 0.21, 28, 46, '#3a3a44');
      for (let i = 0; i <= 10; i++) O.pixel(g, P(0.55 + i * 0.035, 0.19 - i * 0.012, 46 - i * 0.4), '#4a4a56', 2, 1);
      O.prisme(g, P, 0.86, 0.04, 0.98, 0.14, 36, 48, '#2b2b33');
      O.quadX(g, P, 0.98, 0.05, 0.13, 38, 46, '#5a5a68');
      O.pixel(g, P(0.98, 0.09, 47), '#e3342f', 1, 1);
      // casque posé
      O.prisme(g, P, 0.22, 0.24, 0.42, 0.3, 24, 27, '#15151f');
      O.prisme(g, P, 0.2, 0.3, 0.27, 0.42, 24, 28, '#7a2a4a');
      O.prisme(g, P, 0.37, 0.3, 0.44, 0.42, 24, 28, '#7a2a4a');
    } else {
      // table de mixage : panneau incliné, faders, potards (le vumètre s'anime, voir ANIMES)
      O.prisme(g, P, 0.06, 0.12, 0.56, 0.84, 24, 26, '#2b2b33');
      O.prisme(g, P, 0.06, 0.12, 0.56, 0.3, 26, 30, '#2b2b33');
      for (let i = 0; i < 5; i++) {
        const x = 0.1 + i * 0.09;
        O.quadZ(g, P, 26.3, x, 0.42, x + 0.02, 0.8, '#101015');
        const pos = 0.48 + ((i * 37) % 30) / 100;
        O.prisme(g, P, x - 0.015, pos, x + 0.035, pos + 0.05, 26, 27.5, i === 4 ? '#e3342f' : '#e8e8ee');
        O.pixel(g, P(x + 0.01, 0.34, 26.5), ['#ffe14d', '#3df2ff', '#7dff6a', '#ff8fb1', '#ffffff'][i], 2, 1);
      }
    }
  });
}

// Meuble bas à vinyles (casiers carrés, pochettes de couleur) ; dessus : platine, disque d'or encadré ou plante.
function vinyles(it, typeTheme, etat, O) {
  const rnd = O.aleatoire(O.hacher('vin' + it.x + ',' + it.y + (it.variante || 0)));
  const bois = '#5a3a26';
  return O.spriteTuile(60, (g, P) => {
    O.prisme(g, P, 0.06, 0.22, 0.94, 0.86, 0, 30, bois);
    const pochettes = ['#e3342f', '#f6c21c', '#2f6fde', '#ececec', '#15151f', '#ef7d22', '#9b5de5', '#3aa655', '#ff8fb1'];
    for (const [a, b] of [[0.1, 0.48], [0.52, 0.9]]) {
      for (const [z0, z1] of [[3, 14], [16, 27]]) {
        O.quadY(g, P, 0.86, a, b, z0, z1, '#1c120c');
        let u = a + 0.02;
        while (u < b - 0.03) {
          const w = 0.02 + rnd() * 0.02;
          O.quadY(g, P, 0.86, u, Math.min(b - 0.01, u + w), z0 + 1, z1 - (rnd() < 0.3 ? 2 : 0), pochettes[Math.floor(rnd() * pochettes.length)]);
          u += w + 0.006;
        }
      }
    }
    if (it.platine) {
      O.prisme(g, P, 0.16, 0.3, 0.84, 0.8, 30, 33, '#c8b08a');
      disqueZ(O, g, P, 0.44, 0.55, 0.22, 33.5, '#111114');
      disqueZ(O, g, P, 0.44, 0.55, 0.07, 34, '#e3342f');
      O.prisme(g, P, 0.7, 0.36, 0.76, 0.42, 33, 36, '#d9dce2');
      for (let i = 0; i < 6; i++) O.pixel(g, P(0.72 - i * 0.03, 0.4 + i * 0.04, 36), '#d9dce2', 1, 1);
    } else if (it.disque) {
      // disque d'or encadré, posé debout
      O.prisme(g, P, 0.2, 0.46, 0.8, 0.54, 30, 58, '#c9a227');
      O.quadY(g, P, 0.54, 0.24, 0.76, 33, 55, '#1b1e2b');
      rondY(O, g, P, 0.54, 0.5, 44, 0.17, 9, '#f4d35e');
      rondY(O, g, P, 0.54, 0.5, 44, 0.05, 3, '#c0392b');
    } else if ((it.variante || 0) % 2) {
      O.prisme(g, P, 0.6, 0.4, 0.8, 0.6, 30, 34, '#c0603a');
      for (let i = 0; i < 10; i++) O.pixel(g, P(0.7 + (rnd() - 0.5) * 0.2, 0.5, 36 + rnd() * 10), ['#2e8b3e', '#3fae4f'][i % 2], 3, 2);
      O.prisme(g, P, 0.18, 0.4, 0.3, 0.7, 30, 44, '#ececec');
      O.prisme(g, P, 0.3, 0.42, 0.4, 0.7, 30, 41, '#2f6fde');
    } else {
      O.prisme(g, P, 0.2, 0.36, 0.56, 0.74, 30, 33, '#15151f');
      O.prisme(g, P, 0.22, 0.38, 0.54, 0.72, 33, 35, '#f6c21c');
    }
  });
}

// Enceinte colonne (noyer sombre, deux haut-parleurs et un tweeter).
function enceinte(it, typeTheme, etat, O) {
  return O.spriteTuile(64, (g, P) => {
    O.prisme(g, P, 0.26, 0.3, 0.74, 0.72, 0, 3, '#15151f');
    O.prisme(g, P, 0.28, 0.32, 0.72, 0.7, 3, 56, '#3a2a22');
    O.quadY(g, P, 0.7, 0.3, 0.7, 5, 54, '#241a16');
    hautParleur(O, g, P, 0.7, 0.5, 14, 0.15);
    hautParleur(O, g, P, 0.7, 0.5, 31, 0.15);
    rondY(O, g, P, 0.7, 0.5, 46, 0.07, 3, '#c9a227');
  });
}

// Panneau acoustique sur pied : mousse en pointes de diamant.
function panneau(it, typeTheme, etat, O) {
  return O.spriteTuile(76, (g, P) => {
    for (const x of [0.16, 0.8]) O.prisme(g, P, x, 0.36, x + 0.05, 0.64, 0, 4, '#15151f');
    O.prisme(g, P, 0.12, 0.44, 0.88, 0.58, 4, 70, '#3b3346');
    for (let z = 8; z < 66; z += 8) {
      for (let i = 0; i < 4; i++) {
        const x = 0.15 + i * 0.18;
        O.quadY(g, P, 0.58, x, x + 0.09, z, z + 4, '#4f455c');
        O.quadY(g, P, 0.58, x + 0.09, x + 0.17, z + 4, z + 8, '#2c2535');
      }
    }
  });
}

// Platine vinyle sur son meuble (coin écoute) : le disque tourne (ANIMES).
function platine(it, typeTheme, etat, O) {
  return O.spriteTuile(40, (g, P) => {
    O.prisme(g, P, 0.14, 0.14, 0.86, 0.86, 0, 22, '#4a3020');
    O.quadX(g, P, 0.86, 0.2, 0.8, 4, 18, '#3a2416');
    for (let i = 0; i < 6; i++) O.quadX(g, P, 0.86, 0.24 + i * 0.09, 0.28 + i * 0.09, 6, 17, ['#e3342f', '#ececec', '#2f6fde', '#f6c21c', '#15151f', '#9b5de5'][i]);
    O.prisme(g, P, 0.18, 0.18, 0.82, 0.82, 22, 25, '#d8c39a');
    disqueZ(O, g, P, 0.46, 0.5, 0.26, 25.5, '#111114');
    disqueZ(O, g, P, 0.46, 0.5, 0.08, 26, '#f6c21c');
    O.prisme(g, P, 0.7, 0.24, 0.77, 0.31, 25, 29, '#d9dce2');
    for (let i = 0; i < 7; i++) O.pixel(g, P(0.73 - i * 0.025, 0.28 + i * 0.05, 29), '#e8e8ee', 1, 1);
  });
}

// Petite table ronde sur pied central, deux tasses et une bougie ; `nappe` : dîner aux chandelles (nappe blanche,
// chandelier à trois bougies qui vacillent, deux assiettes, deux verres de vin).
function tableRonde(it, typeTheme, etat, O) {
  const T = O.theme(typeTheme);
  const plateau = T.table;
  if (it.nappe) {
    return O.spriteTuile(56, (g, P) => {
      for (let z = 4; z <= 23; z++) disqueZ(O, g, P, 0.5, 0.5, 0.46, z, z < 6 ? '#dcd8cc' : '#f2efe6');
      disqueZ(O, g, P, 0.5, 0.5, 0.46, 23.5, '#fbfaf5');
      for (const [u, v] of [[0.32, 0.62], [0.68, 0.36]]) {
        disqueZ(O, g, P, u, v, 0.12, 24, '#ffffff');
        disqueZ(O, g, P, u, v, 0.07, 24.3, '#e8e2d0');
      }
      for (const [u, v] of [[0.62, 0.66], [0.36, 0.32]]) {
        O.prisme(g, P, u - 0.01, v - 0.01, u + 0.01, v + 0.01, 24, 29, '#e8eef2');
        O.prisme(g, P, u - 0.04, v - 0.04, u + 0.04, v + 0.04, 29, 33, '#7a1f3a');
      }
      O.prisme(g, P, 0.47, 0.47, 0.53, 0.53, 24, 34, '#c9a227');
      O.prisme(g, P, 0.36, 0.48, 0.64, 0.52, 34, 35, '#c9a227');
      for (const u of [0.36, 0.5, 0.64]) O.prisme(g, P, u - 0.02, 0.48, u + 0.02, 0.52, 35, 41, '#f6f4ee');
    });
  }
  return O.spriteTuile(44, (g, P) => {
    disqueZ(O, g, P, 0.5, 0.5, 0.26, 0, '#1d1d22');
    O.prisme(g, P, 0.46, 0.46, 0.54, 0.54, 0, 20, '#c9a227');
    disqueZ(O, g, P, 0.5, 0.5, 0.44, 20, O.nuance(plateau, -0.25));
    disqueZ(O, g, P, 0.5, 0.5, 0.44, 23, plateau);
    O.prisme(g, P, 0.46, 0.44, 0.54, 0.52, 23, 29, '#f4ecd2');
    O.pixel(g, P(0.5, 0.48, 31), '#ffd98a', 1, 2);
    O.prisme(g, P, 0.26, 0.56, 0.34, 0.64, 23, 27, '#ffffff');
    O.prisme(g, P, 0.66, 0.3, 0.74, 0.38, 23, 27, '#ffffff');
  });
}

// Boîte des rendus : un pupitre de laiton avec sa corbeille à courrier (les agents y déposent leur dossier).
function depot(it, typeTheme, etat, O) {
  return O.spriteTuile(44, (g, P) => {
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.7, 0, 3, '#15151f');
    O.prisme(g, P, 0.44, 0.44, 0.56, 0.56, 3, 22, '#c9a227');
    O.prisme(g, P, 0.2, 0.22, 0.8, 0.78, 22, 25, '#3a2a22');
    O.prisme(g, P, 0.24, 0.26, 0.76, 0.32, 25, 30, '#3a2a22');
    O.prisme(g, P, 0.24, 0.68, 0.76, 0.74, 25, 28, '#3a2a22');
    O.prisme(g, P, 0.3, 0.34, 0.7, 0.66, 25, 27, '#f5f5f0');
    O.prisme(g, P, 0.33, 0.36, 0.68, 0.62, 27, 28, '#f2c14e');
  });
}

// Piano à queue noir laqué (2 × 2 cases), clavier tourné vers -x (le pianiste s'assoit en x - 1), couvercle ouvert.
function piano(it, typeTheme, etat, O) {
  // laque noire (studio) ou blanche (suite) : clair, flanc, dessus, couvercle (dessous, dessus, reflet)
  const C = it.blanc
    ? { pied: '#d8d2c6', bas: '#c9c3b6', flanc: '#e9e5dc', dessus: '#fbfaf6', laque: '#f2efe8', c1: '#d6d0c4', c2: '#f4f1ea', c3: '#ffffff', pupitre: '#e0dbd0' }
    : { pied: '#0d0c10', bas: '#0b0a0e', flanc: '#24212b', dessus: '#3a3442', laque: '#17151c', c1: '#0d0c10', c2: '#2c2834', c3: '#4a4456', pupitre: '#24212b' };
  return O.spriteBloc(2, 2, 80, (g, P) => {
    // contour vu de dessus : côté droit le long de y = 1.92, courbe côté y = 0.6, queue vers +x
    const contour = [[0.36, 0.62], [0.36, 1.92], [1.94, 1.92], [1.94, 1.66], [1.7, 1.42], [1.4, 1.26], [1.16, 1.1], [0.98, 0.84], [0.78, 0.66], [0.56, 0.6]];
    for (const [x, y] of [[0.42, 0.7], [0.42, 1.8], [1.8, 1.8]]) O.prisme(g, P, x, y, x + 0.06, y + 0.06, 0, 22, C.pied);
    O.prisme(g, P, 0.46, 1.86, 1.86, 1.9, 6, 8, '#c9a227');
    for (let z = 22; z < 36; z++) O.poly(g, contour.map(([x, y]) => P(x, y, z)), z < 24 ? C.bas : C.flanc);
    O.poly(g, contour.map(([x, y]) => P(x, y, 36)), C.dessus);
    // cordes et cadre doré sous le couvercle
    O.poly(g, contour.map(([x, y]) => P(x + (x > 1 ? -0.06 : 0.06), y + (y > 1.5 ? -0.06 : 0.06), 36.5)), '#b08a3a');
    for (let i = 0; i < 8; i++) O.quadZ(g, P, 37, 0.5, 0.9 + i * 0.12, 1.85 - (i < 4 ? (4 - i) * 0.12 : 0), 0.92 + i * 0.12, '#e8d7a0');
    // clavier et pupitre
    O.prisme(g, P, 0.06, 0.62, 0.36, 1.9, 22, 30, C.laque);
    O.quadZ(g, P, 30.5, 0.1, 0.68, 0.32, 1.84, '#f4f1e8');
    for (let i = 0; i < 14; i++) {
      O.quadZ(g, P, 30.6, 0.1, 0.72 + i * 0.08, 0.32, 0.725 + i * 0.08, '#b8b2a4');
      if (i % 7 !== 2 && i % 7 !== 6) O.quadZ(g, P, 30.8, 0.2, 0.74 + i * 0.08, 0.32, 0.77 + i * 0.08, '#15151f');
    }
    O.prisme(g, P, 0.38, 0.9, 0.44, 1.66, 36, 48, C.pupitre);
    O.quadX(g, P, 0.44, 1.0, 1.56, 38, 46, '#f4f1e8');
    // couvercle ouvert, appuyé sur sa béquille
    O.prisme(g, P, 1.3, 1.4, 1.33, 1.43, 36, 58, C.pied);
    O.poly(g, [P(0.6, 1.92, 37), P(1.94, 1.92, 37), P(1.94, 1.6, 62), P(1.4, 1.2, 66), P(0.9, 0.9, 62)], C.c1);
    O.poly(g, [P(0.66, 1.9, 38), P(1.9, 1.9, 38), P(1.9, 1.64, 61), P(1.42, 1.26, 64), P(0.94, 0.96, 60)], C.c2);
    O.poly(g, [P(1.2, 1.88, 40), P(1.7, 1.88, 40), P(1.7, 1.74, 50), P(1.3, 1.5, 54)], C.c3);
  });
}

// Banquette (siège) : celle du piano (velours sur pieds noirs), celle du pied du lit (velours bordeaux, pieds dorés).
function banquette(it, typeTheme, etat, O) {
  const suite = style(typeTheme) === 'suite';
  const [pied, velours] = suite ? ['#c9a227', '#7a1f3a'] : ['#15151f', '#6a2b4f'];
  return O.spriteTuile(30, (g, P) => {
    for (const [x, y] of [[0.24, 0.26], [0.7, 0.26], [0.24, 0.68], [0.7, 0.68]]) O.prisme(g, P, x, y, x + 0.06, y + 0.06, 0, 10, pied);
    O.prisme(g, P, 0.2, 0.22, 0.8, 0.78, 10, 13, pied);
    O.prisme(g, P, 0.22, 0.24, 0.78, 0.76, 13, 15, velours);
  });
}

// Batterie compacte : grosse caisse (peau tournée vers nous), caisse claire, tom, charleston et cymbale, tabouret.
function batterie(it, typeTheme, etat, O) {
  return O.spriteTuile(56, (g, P) => {
    // tabouret derrière
    O.prisme(g, P, 0.46, 0.1, 0.5, 0.14, 0, 12, '#3a3a44');
    disqueZ(O, g, P, 0.48, 0.12, 0.1, 12, '#15151f');
    // grosse caisse
    O.prisme(g, P, 0.3, 0.42, 0.7, 0.74, 0, 4, '#15151f');
    for (let y = 0.44; y <= 0.72; y += 0.04) rondY(O, g, P, y, 0.5, 13, 0.2, 12, y < 0.7 ? '#7a1f2a' : '#9a2a3a');
    rondY(O, g, P, 0.74, 0.5, 13, 0.18, 11, '#f2efe6');
    rondY(O, g, P, 0.745, 0.5, 13, 0.07, 4, '#c9a227');
    // tom sur la grosse caisse, caisse claire, charleston, cymbale
    for (let z = 26; z <= 30; z++) disqueZ(O, g, P, 0.52, 0.5, 0.1, z, z < 30 ? '#7a1f2a' : '#f2efe6');
    O.prisme(g, P, 0.2, 0.26, 0.23, 0.29, 0, 20, '#8a9098');
    for (let z = 20; z <= 23; z++) disqueZ(O, g, P, 0.22, 0.28, 0.11, z, z < 23 ? '#c8cdd3' : '#f2efe6');
    O.prisme(g, P, 0.85, 0.3, 0.87, 0.32, 0, 34, '#8a9098');
    disqueZ(O, g, P, 0.86, 0.31, 0.12, 34, '#c9a227');
    disqueZ(O, g, P, 0.86, 0.31, 0.12, 36, '#e8c547');
    O.prisme(g, P, 0.14, 0.62, 0.16, 0.64, 0, 44, '#8a9098');
    disqueZ(O, g, P, 0.15, 0.63, 0.16, 44, '#e8c547', 0.12);
    // baguettes posées
    O.prisme(g, P, 0.4, 0.46, 0.66, 0.48, 30, 31, '#e0b070');
  });
}

// Support de guitares : une électrique rouge, une acoustique, une basse noire.
function guitares(it, typeTheme, etat, O) {
  return O.spriteTuile(70, (g, P) => {
    O.prisme(g, P, 0.12, 0.42, 0.88, 0.6, 0, 6, '#2b2b33');
    O.prisme(g, P, 0.12, 0.3, 0.16, 0.36, 0, 30, '#2b2b33');
    O.prisme(g, P, 0.84, 0.3, 0.88, 0.36, 0, 30, '#2b2b33');
    O.prisme(g, P, 0.12, 0.3, 0.88, 0.34, 28, 30, '#2b2b33');
    const g1 = (cx, corps, bord, manche) => {
      O.quadY(g, P, 0.5, cx - 0.025, cx + 0.025, 20, 58, manche);
      O.quadY(g, P, 0.5, cx - 0.04, cx + 0.04, 56, 64, O.nuance(manche, -0.3));
      rondY(O, g, P, 0.5, cx, 12, 0.13, 7, bord);
      rondY(O, g, P, 0.5, cx, 21, 0.1, 6, bord);
      rondY(O, g, P, 0.5, cx, 12, 0.11, 6, corps);
      rondY(O, g, P, 0.5, cx, 21, 0.08, 5, corps);
      O.pixel(g, P(cx, 0.5, 16), '#15151f', 2, 2);
    };
    g1(0.26, '#c0392b', '#7a1f1a', '#8a5a3a');
    g1(0.5, '#e0a050', '#7a4a1a', '#6a4a2a');
    g1(0.74, '#22202a', '#0d0c10', '#3a3440');
  });
}

// Boule dessinée à l'écran (boulet, ballon) : disque ombré, reflet en haut à gauche.
function boule(g, cx, cy, r, col) {
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y + 0.3));
    for (let x = -w; x <= w; x++) {
      const l = (-x - y) / (r * 1.6);
      g.fillStyle = l > 0.45 ? nuanceHex(col, 0.35) : l > 0 ? col : l > -0.5 ? nuanceHex(col, -0.25) : nuanceHex(col, -0.45);
      g.fillRect(cx + x, cy + y, 1, 1);
    }
  }
}
// Copie locale de nuance (sprites.js) : boule() n'a pas O sous la main.
function nuanceHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)));
  return '#' + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

// ---------- cellule de prison ----------
// Barreaux le long d'une arête de la case : 'n' (arête y = 0, de x = 0 à 1) ou 'w' (arête x = 0, de y = 0 à 1).
// `porte` : la porte coulissante ouverte, rangée devant ce pan ; `grillage` : grillage de la cour, plus bas.
function barreaux(it, typeTheme, etat, O) {
  const nord = it.bord === 'n';
  const haut = it.grillage ? 46 : 58;
  return O.spriteTuile(haut + 8, (g, P) => {
    // t le long de l'arête, d en travers
    const B = (t0, t1, d0, d1, z0, z1, col) => (nord ? O.prisme(g, P, t0, d0, t1, d1, z0, z1, col) : O.prisme(g, P, d0, t0, d1, t1, z0, z1, col));
    const Q = (t, d, z) => (nord ? P(t, d, z) : P(d, t, z));
    if (it.grillage) {
      // grillage à mailles losanges entre deux poteaux, fil barbelé en haut
      for (let k = -8; k < 16; k++) {
        for (let z = 3; z < haut - 4; z += 1) {
          const t1 = k * 0.125 + z / 64;
          const t2 = k * 0.125 + 0.0625 - z / 64 + 0.6875;
          if (t1 > 0.02 && t1 < 0.98) O.pixel(g, Q(t1, 0, z), '#a9b0b7', 1, 1);
          if (t2 > 0.02 && t2 < 0.98) O.pixel(g, Q(t2, 0, z), '#8d949c', 1, 1);
        }
      }
      B(0, 1, -0.012, 0.012, haut - 5, haut - 3, '#7d848c');
      B(0, 0.05, -0.025, 0.025, 0, haut + 4, '#5d646c');
      if (it.fin) B(0.95, 1, -0.025, 0.025, 0, haut + 4, '#5d646c');
      for (let i = 0; i < 8; i++) O.pixel(g, Q(0.06 + i * 0.12, 0, haut + 2 + (i % 2) * 2), '#c9ced4', 2, 1);
      return;
    }
    // barreaux ronds, tracés au pixel (clair à gauche, ombré à droite) ; traverses en bas, au milieu et en haut
    const rangee = (dec) => {
      for (let i = 0; i < 5; i++) {
        const [x, y] = Q(0.1 + i * 0.2, dec, 0);
        const px = Math.round(x);
        for (let z = 1; z < haut - 1; z++) {
          g.fillStyle = '#aab1ba';
          g.fillRect(px, Math.round(y) - z, 1, 1);
          g.fillStyle = '#5f666f';
          g.fillRect(px + 1, Math.round(y) - z, 1, 1);
        }
      }
      for (const z of [0, 27, haut - 3]) B(0, 1, dec - 0.018, dec + 0.018, z, z + 3, '#59606a');
    };
    rangee(0);
    if (it.porte) {
      // la porte coulissante, ouverte, glissée devant ce pan ; sa serrure
      rangee(0.07);
      B(0.8, 0.92, 0.05, 0.1, 22, 34, '#3a3f47');
      O.pixel(g, Q(0.86, 0.1, 29), '#c9a227', 1, 2);
    }
    B(-0.025, 0.025, -0.025, 0.025, 0, haut + 3, '#4a5058');
  }, false);
}

// Lit de camp (2 × 1, tête en x = 0) : cadre en tube, toile kaki, couverture grise, oreiller plat.
function litCamp(it, typeTheme, etat, O) {
  const couv = ['#6d7066', '#5f6b5a', '#77706a'][(it.variante || 0) % 3];
  return O.spriteBloc(2, 1, 30, (g, P) => {
    const tube = '#6e747c';
    for (const x of [0.1, 1.86]) {
      O.prisme(g, P, x, 0.14, x + 0.04, 0.18, 0, 12, tube);
      O.prisme(g, P, x, 0.82, x + 0.04, 0.86, 0, 12, tube);
    }
    O.prisme(g, P, 0.06, 0.12, 1.94, 0.88, 11, 13, '#7a7a5a');
    O.prisme(g, P, 0.06, 0.1, 1.94, 0.16, 12, 14, tube);
    O.prisme(g, P, 0.06, 0.84, 1.94, 0.9, 12, 14, tube);
    O.prisme(g, P, 0.14, 0.24, 0.5, 0.76, 13, 16, '#e3ddc8');
    O.quadZ(g, P, 16.2, 0.3, 0.4, 0.38, 0.52, '#c9bf9a');
    O.prisme(g, P, 0.62, 0.14, 1.9, 0.86, 13, 16, couv);
    O.quadY(g, P, 0.86, 0.66, 1.86, 13.5, 14.5, O.nuance(couv, -0.25));
    O.quadZ(g, P, 16.3, 0.62, 0.14, 0.72, 0.86, O.nuance(couv, 0.25));
  });
}

// Lavabo-WC en inox d'un seul bloc, contre le mur du fond.
function wcInox(it, typeTheme, etat, O) {
  return O.spriteTuile(48, (g, P) => {
    const inox = '#b4bac2';
    O.prisme(g, P, 0.16, 0.04, 0.84, 0.42, 0, 40, inox);
    O.quadY(g, P, 0.42, 0.2, 0.22, 2, 38, '#e4e8ec');
    disqueZ(O, g, P, 0.5, 0.24, 0.2, 40.5, '#8a9098', 0.12);
    disqueZ(O, g, P, 0.5, 0.25, 0.14, 40.7, '#6e747c', 0.08);
    O.prisme(g, P, 0.46, 0.08, 0.54, 0.14, 40, 46, '#d8dde2');
    O.prisme(g, P, 0.66, 0.2, 0.74, 0.28, 40, 42, '#3a3f47');
    // cuvette
    O.prisme(g, P, 0.3, 0.42, 0.7, 0.72, 0, 12, inox);
    disqueZ(O, g, P, 0.5, 0.66, 0.22, 0, inox, 0.22);
    for (let z = 1; z <= 14; z++) disqueZ(O, g, P, 0.5, 0.66, 0.22, z, z < 13 ? '#9aa0a8' : '#c8cdd3', 0.22);
    disqueZ(O, g, P, 0.5, 0.66, 0.15, 14.3, '#5d7f8f', 0.15);
    O.pixel(g, P(0.44, 0.6, 14.5), '#9fd3e8', 2, 1);
  });
}

// Boulet et sa chaîne, qui serpente jusqu'à un bracelet ouvert : le détenu s'en est débarrassé pour taper.
function boulet(it, typeTheme, etat, O) {
  return O.spriteTuile(30, (g, P) => {
    for (let i = 0; i <= 10; i++) {
      const [x, y] = P(0.46 + i * 0.04, 0.56 + Math.sin(i * 0.7) * 0.1 + i * 0.012, 1 + (i % 2));
      g.fillStyle = i % 2 ? '#8a9098' : '#5d646c';
      g.fillRect(Math.round(x), Math.round(y), 3, 2);
    }
    const [bx, by] = P(0.9, 0.72, 1);
    g.fillStyle = '#3a3f47';
    g.fillRect(Math.round(bx) - 3, Math.round(by) - 2, 7, 1);
    g.fillRect(Math.round(bx) - 4, Math.round(by) - 1, 1, 3);
    g.fillRect(Math.round(bx) + 3, Math.round(by) - 1, 1, 2);
    g.fillRect(Math.round(bx) - 3, Math.round(by) + 2, 3, 1);
    const [cx, cy] = P(0.36, 0.46, 9);
    boule(g, Math.round(cx), Math.round(cy), 8, '#2b2e34');
  });
}

// Gamelle cabossée (purée grise, cuillère) et quignon de pain, posés par terre.
function gamelle(it, typeTheme, etat, O) {
  return O.spriteTuile(20, (g, P) => {
    disqueZ(O, g, P, 0.42, 0.48, 0.22, 0, '#7d848c');
    for (let z = 1; z <= 6; z++) disqueZ(O, g, P, 0.42, 0.48, 0.22 + z * 0.006, z, '#9aa1a8');
    disqueZ(O, g, P, 0.42, 0.48, 0.2, 6.2, '#c8cdd3');
    disqueZ(O, g, P, 0.42, 0.48, 0.16, 6.4, '#b9ad8e');
    O.pixel(g, P(0.36, 0.44, 7), '#d4c9a8', 3, 1);
    O.prisme(g, P, 0.5, 0.36, 0.86, 0.4, 6, 7, '#d8dde2');
    O.prisme(g, P, 0.62, 0.64, 0.86, 0.8, 0, 5, '#c08a4a');
    O.quadZ(g, P, 5.2, 0.66, 0.67, 0.8, 0.77, '#e0b070');
  });
}

// Aile d'un bureau (à gauche 'g' ou à droite 'd' du bureau de l'agent) : même plateau que le bureau du thème.
// Cellule : le plateau-repas ; suite : lampe dorée, téléphone en or, cigares, whisky.
function aile(it, typeTheme, etat, O) {
  const T = O.theme(typeTheme);
  const st = style(typeTheme);
  const gauche = it.part === 'g';
  const x0 = gauche ? 0.06 : 0;
  const x1 = gauche ? 1 : 0.94;
  return O.spriteTuile(60, (g, P) => {
    const col = T.bureau;
    if (st === 'suite') {
      for (const x of gauche ? [0.1] : [0.84]) O.prisme(g, P, x, 0.12, x + 0.06, 0.88, 0, 20, '#c9a227');
    } else O.pieds(g, P, x0, 0.08, x1, 0.92, 20, O.nuance(col, -0.35), { e: gauche, w: !gauche });
    O.prisme(g, P, x0, 0.08, x1, 0.92, 20, 24, col);
    if (st === 'suite') {
      O.quadY(g, P, 0.92, x0, x1, 20, 21, '#c9a227');
      if (gauche) {
        // lampe de banquier (abat-jour vert) et photo encadrée
        O.prisme(g, P, 0.24, 0.3, 0.44, 0.44, 24, 26, '#c9a227');
        O.prisme(g, P, 0.32, 0.35, 0.36, 0.39, 26, 38, '#c9a227');
        O.prisme(g, P, 0.16, 0.28, 0.52, 0.48, 36, 42, '#1f7a4a');
        O.quadY(g, P, 0.48, 0.18, 0.5, 35, 36, '#fff6b0');
        O.prisme(g, P, 0.6, 0.62, 0.84, 0.66, 24, 38, '#c9a227');
        O.quadY(g, P, 0.66, 0.63, 0.81, 27, 35, '#9fd3ff');
        O.pixel(g, P(0.7, 0.66, 31), '#f4c9a0', 2, 2);
      } else {
        // téléphone en or, boîte à cigares, verre de whisky
        O.prisme(g, P, 0.14, 0.24, 0.42, 0.46, 24, 27, '#c9a227');
        O.prisme(g, P, 0.14, 0.24, 0.42, 0.31, 27, 30, '#e8c547');
        O.prisme(g, P, 0.5, 0.56, 0.84, 0.8, 24, 28, '#5b3418');
        O.quadZ(g, P, 28.2, 0.54, 0.6, 0.8, 0.76, '#7a4a24');
        O.prisme(g, P, 0.6, 0.62, 0.78, 0.66, 28, 29, '#8a5a3a');
        O.prisme(g, P, 0.22, 0.62, 0.32, 0.72, 24, 31, '#e8eef2');
        O.prisme(g, P, 0.23, 0.63, 0.31, 0.71, 24, 27, '#c98a2a');
      }
      return;
    }
    // le plateau-repas : purée, petits pois, saucisse, pain, gobelet en fer
    O.prisme(g, P, 0.12, 0.3, 0.74, 0.84, 24, 25.5, '#8f969e');
    O.quadZ(g, P, 25.6, 0.16, 0.34, 0.42, 0.56, '#e8dfbf');
    O.quadZ(g, P, 25.6, 0.46, 0.34, 0.7, 0.56, '#5f8f3a');
    for (const [u, v] of [[0.52, 0.4], [0.6, 0.46], [0.55, 0.5], [0.64, 0.38]]) O.pixel(g, P(u, v, 26), '#8fc25a', 1, 1);
    O.prisme(g, P, 0.18, 0.62, 0.56, 0.7, 25.5, 27.5, '#a0522d');
    O.prisme(g, P, 0.58, 0.6, 0.7, 0.8, 25.5, 27, '#d9a35a');
    O.prisme(g, P, 0.8, 0.2, 0.92, 0.32, 24, 31, '#9aa1a8');
    O.quadZ(g, P, 31.2, 0.81, 0.21, 0.91, 0.31, '#5a4a3a');
    O.prisme(g, P, 0.78, 0.5, 0.9, 0.53, 24, 25, '#d8dde2');
  });
}

// Casiers métalliques du poste de garde.
function casier(it, typeTheme, etat, O) {
  return O.spriteTuile(72, (g, P) => {
    const tole = '#5e7387';
    O.prisme(g, P, 0.08, 0.06, 0.92, 0.5, 0, 64, tole);
    O.quadY(g, P, 0.5, 0.495, 0.505, 2, 62, '#3a4a5a');
    for (const x0 of [0.12, 0.54]) {
      for (let z = 50; z < 58; z += 3) O.quadY(g, P, 0.5, x0 + 0.06, x0 + 0.3, z, z + 1, '#3a4a5a');
      O.quadY(g, P, 0.5, x0 + 0.28, x0 + 0.32, 30, 36, '#c9ced4');
    }
    O.quadY(g, P, 0.5, 0.6, 0.74, 40, 46, '#f2f2ee');
  });
}

// Marquage au sol de la file d'attente : bande jaune et deux pieds peints ; le premier a sa ligne « stop ».
function marquage(it, typeTheme, etat, O) {
  return O.spriteTuile(4, (g, P) => {
    O.quadZ(g, P, 0.4, 0.06, 0.08, 0.94, 0.16, '#e8c21c');
    O.quadZ(g, P, 0.4, 0.06, 0.84, 0.94, 0.92, '#e8c21c');
    for (const [u, v] of [[0.36, 0.42], [0.56, 0.5]]) {
      O.quadZ(g, P, 0.5, u, v, u + 0.1, v + 0.18, '#f2d64a');
      O.quadZ(g, P, 0.5, u + 0.01, v + 0.2, u + 0.09, v + 0.25, '#f2d64a');
    }
    if (it.premier) for (let i = 0; i < 5; i++) O.quadZ(g, P, 0.45, 0.06 + i * 0.18, 0.08, 0.15 + i * 0.18, 0.92, i % 2 ? '#1d1d1d' : '#e8c21c');
  }, false);
}

// Banc de musculation (siège) : banc rembourré, montants, barre chargée.
function muscu(it, typeTheme, etat, O) {
  return O.spriteTuile(50, (g, P) => {
    for (const [x, y] of [[0.2, 0.36], [0.2, 0.6], [0.78, 0.36], [0.78, 0.6]]) O.prisme(g, P, x, y, x + 0.05, y + 0.05, 0, 11, '#2b2e34');
    O.prisme(g, P, 0.16, 0.32, 0.86, 0.68, 11, 15, '#1d1d22');
    O.quadZ(g, P, 15.2, 0.2, 0.36, 0.82, 0.4, '#3a3a44');
    for (const y of [0.12, 0.84]) O.prisme(g, P, 0.1, y, 0.16, y + 0.05, 0, 36, '#6e747c');
    O.prisme(g, P, 0.11, -0.05, 0.15, 1.05, 34, 36, '#c8cdd3');
    for (const y of [0.02, 0.9]) {
      rondX(O, g, P, 0.16, y + 0.05, 35, 0.05, 9, '#15151f');
      rondX(O, g, P, 0.165, y + 0.05, 35, 0.03, 5, '#3a3f47');
    }
  });
}

// Ballon de basket oublié dans la cour.
function ballon(it, typeTheme, etat, O) {
  return O.spriteTuile(20, (g, P) => {
    const [cx, cy] = P(0.5, 0.5, 6);
    boule(g, Math.round(cx), Math.round(cy), 6, '#e0782a');
    g.fillStyle = '#5a2a10';
    g.fillRect(Math.round(cx) - 6, Math.round(cy), 13, 1);
    g.fillRect(Math.round(cx), Math.round(cy) - 6, 1, 13);
  });
}

// Comptoir du parloir : vitre de séparation, cloisons de box, un téléphone de chaque côté.
function parloir(it, typeTheme, etat, O) {
  const c = it.conn || {};
  const x0 = c.w ? 0 : 0.04;
  const x1 = c.e ? 1 : 0.96;
  return O.spriteTuile(70, (g, P) => {
    O.prisme(g, P, x0, 0.22, x1, 0.78, 0, 26, '#7d8a80');
    O.quadY(g, P, 0.78, x0, x1, 4, 6, '#5f6b62');
    O.prisme(g, P, x0, 0.18, x1, 0.82, 26, 29, '#c8c0a6');
    // téléphone côté nord (contre la vitre, à gauche) puis côté sud
    O.prisme(g, P, 0.7, 0.4, 0.8, 0.47, 34, 46, '#15151f');
    O.prisme(g, P, 0.72, 0.53, 0.82, 0.6, 32, 44, '#15151f');
    for (let i = 0; i < 4; i++) O.pixel(g, P(0.78, 0.6, 31 - i * 2), '#2b2b33', 1, 1);
    O.prisme(g, P, 0.05, 0.22, 0.1, 0.78, 29, 50, '#9aa3a6');
    if (!c.e) O.prisme(g, P, 0.9, 0.22, 0.95, 0.78, 29, 50, '#9aa3a6');
    O.quadY(g, P, 0.5, x0, x1, 29, 64, 'rgba(170,220,255,0.34)');
    O.quadY(g, P, 0.5, 0.2, 0.32, 36, 58, 'rgba(255,255,255,0.4)');
    O.prisme(g, P, x0, 0.48, x1, 0.52, 62, 65, '#6e747c');
    O.quadY(g, P, 0.5, 0.42, 0.58, 30, 33, '#2b2b33');
  });
}

// Tabouret d'acier scellé au sol (siège, sans dossier).
function tabouret(it, typeTheme, etat, O) {
  return O.spriteTuile(30, (g, P) => {
    disqueZ(O, g, P, 0.5, 0.5, 0.2, 0, '#4a4f57');
    O.prisme(g, P, 0.46, 0.46, 0.54, 0.54, 0, 11, '#6e747c');
    disqueZ(O, g, P, 0.5, 0.5, 0.26, 11, '#5d646c');
    disqueZ(O, g, P, 0.5, 0.5, 0.26, 13, '#9aa1a8');
  });
}

// Table du réfectoire en inox (conn : tables voisines), un plateau de chaque côté.
function tableCantine(it, typeTheme, etat, O) {
  const c = it.conn || {};
  const x0 = c.w ? 0 : 0.06;
  const x1 = c.e ? 1 : 0.94;
  return O.spriteTuile(40, (g, P) => {
    O.pieds(g, P, x0 + 0.02, 0.14, x1 - 0.02, 0.86, 20, '#4a4f57', { w: c.w, e: c.e });
    O.prisme(g, P, x0, 0.1, x1, 0.9, 20, 23, '#b8bec6');
    O.quadY(g, P, 0.9, x0, x1, 22, 23, '#e4e8ec');
    for (const [v0, v1] of [[0.14, 0.44], [0.56, 0.86]]) {
      O.prisme(g, P, 0.2, v0, 0.8, v1, 23, 24, '#c46a2a');
      O.quadZ(g, P, 24.1, 0.24, v0 + 0.04, 0.46, v1 - 0.04, '#e8dfbf');
      O.quadZ(g, P, 24.1, 0.5, v0 + 0.04, 0.76, v0 + 0.14, '#5f8f3a');
      O.prisme(g, P, 0.52, v1 - 0.12, 0.74, v1 - 0.05, 24, 25.5, '#a0522d');
    }
    O.prisme(g, P, 0.84, 0.44, 0.92, 0.52, 23, 29, '#9aa1a8');
  });
}

// Banc (siège, conn : bancs voisins), lattes de bois sur piètement d'acier.
function banc(it, typeTheme, etat, O) {
  const c = it.conn || {};
  const x0 = c.w ? 0 : 0.06;
  const x1 = c.e ? 1 : 0.94;
  return O.spriteTuile(30, (g, P) => {
    O.pieds(g, P, x0 + 0.04, 0.3, x1 - 0.04, 0.7, 10, '#4a4f57', { w: c.w, e: c.e });
    O.prisme(g, P, x0, 0.26, x1, 0.74, 10, 13, '#8a6a42');
    O.quadZ(g, P, 13.1, x0, 0.49, x1, 0.51, '#6a4e2e');
  });
}

// Le greffe : comptoir derrière un guichet grillagé (registre, tampon, sonnette).
function guichet(it, typeTheme, etat, O) {
  const gauche = it.part === 'g';
  return O.spriteTuile(66, (g, P) => {
    const x0 = gauche ? 0.06 : 0;
    const x1 = gauche ? 1 : 0.94;
    O.prisme(g, P, x0, 0.16, x1, 0.8, 0, 28, '#6f8a7a');
    O.quadY(g, P, 0.8, x0 + 0.04, x1 - 0.04, 4, 24, '#5f7a6a');
    O.prisme(g, P, x0, 0.12, x1, 0.84, 28, 31, '#8a6a42');
    O.prisme(g, P, x0, 0.12, x1, 0.18, 31, 40, '#5d646c');
    for (let i = 0; i < 7; i++) O.quadY(g, P, 0.18, x0 + 0.06 + i * 0.13, x0 + 0.08 + i * 0.13, 33, 39, '#3a3f47');
    O.quadY(g, P, 0.18, x0, x1, 33, 34, '#3a3f47');
    if (gauche) {
      O.prisme(g, P, 0.2, 0.4, 0.7, 0.76, 31, 33, '#7a1f2a');
      O.quadZ(g, P, 33.2, 0.24, 0.42, 0.66, 0.74, '#f4ecd2');
      O.quadZ(g, P, 33.3, 0.44, 0.42, 0.46, 0.74, '#7a1f2a');
      O.prisme(g, P, 0.78, 0.5, 0.88, 0.6, 31, 38, '#5b3418');
    } else {
      O.prisme(g, P, 0.3, 0.46, 0.46, 0.62, 31, 33, '#c9a227');
      O.prisme(g, P, 0.35, 0.51, 0.41, 0.57, 33, 36, '#e8c547');
      O.prisme(g, P, 0.58, 0.36, 0.84, 0.72, 31, 32, '#9aa1a8');
      O.pixel(g, P(0.66, 0.5, 33), '#f2c14e', 2, 1);
      O.pixel(g, P(0.74, 0.6, 33), '#c8cdd3', 2, 1);
    }
  });
}

// Portique détecteur de métaux à l'entrée (on passe dessous) ; son voyant clignote (ANIMES).
function portique(it, typeTheme, etat, O) {
  return O.spriteTuile(66, (g, P) => {
    const coque = '#cfc8b4';
    O.prisme(g, P, 0.04, 0.38, 0.18, 0.62, 0, 56, coque);
    O.prisme(g, P, 0.82, 0.38, 0.96, 0.62, 0, 56, coque);
    O.prisme(g, P, 0.04, 0.38, 0.96, 0.62, 56, 62, coque);
    O.quadY(g, P, 0.62, 0.06, 0.16, 6, 52, '#b7af98');
    O.quadY(g, P, 0.62, 0.84, 0.94, 6, 52, '#b7af98');
    O.prisme(g, P, 0.44, 0.44, 0.56, 0.56, 62, 65, '#3a3f47');
  });
}

// ---------- suite présidentielle ----------
// Cordon de velours tendu le long de l'arête y = 0, entre deux potelets dorés.
function cordon(it, typeTheme, etat, O) {
  return O.spriteTuile(34, (g, P) => {
    const potelet = (t) => {
      disqueZ(O, g, P, t, 0.02, 0.07, 0, '#8a6a1a');
      O.prisme(g, P, t - 0.02, 0, t + 0.02, 0.04, 0, 24, '#c9a227');
      const [x, y] = P(t, 0.02, 27);
      boule(g, Math.round(x), Math.round(y), 2, '#e8c547');
    };
    potelet(0.04);
    for (let i = 0; i <= 24; i++) {
      const t = 0.04 + (i / 24) * 0.92;
      O.pixel(g, P(t, 0.02, 21 - Math.sin((i / 24) * Math.PI) * 6), '#a01830', 2, 2);
    }
    if (it.fin) potelet(0.96);
  });
}

// Serviettes pliées sur une étagère en teck… et un canard en plastique.
function serviettes(it, typeTheme, etat, O) {
  return O.spriteTuile(52, (g, P) => {
    for (const [x, y] of [[0.2, 0.2], [0.76, 0.2], [0.2, 0.62], [0.76, 0.62]]) O.prisme(g, P, x, y, x + 0.05, y + 0.05, 0, 30, '#8a5a32');
    for (const z of [8, 28]) O.prisme(g, P, 0.16, 0.16, 0.84, 0.72, z, z + 2, '#9a6a3a');
    for (let i = 0; i < 3; i++) {
      O.prisme(g, P, 0.24, 0.24, 0.76, 0.64, 10 + i * 5, 14 + i * 5, '#f6f4ee');
      O.quadY(g, P, 0.64, 0.24, 0.76, 12 + i * 5, 13 + i * 5, '#c9a227');
    }
    O.prisme(g, P, 0.24, 0.24, 0.76, 0.64, 30, 35, '#f6f4ee');
    O.prisme(g, P, 0.24, 0.24, 0.76, 0.64, 35, 39, '#f6f4ee');
    // canard
    O.prisme(g, P, 0.4, 0.36, 0.62, 0.56, 39, 44, '#ffd23f');
    O.prisme(g, P, 0.42, 0.38, 0.54, 0.5, 44, 49, '#ffd23f');
    O.prisme(g, P, 0.54, 0.42, 0.62, 0.48, 45, 47, '#ef7d22');
    O.pixel(g, P(0.5, 0.5, 47), '#15151f', 1, 1);
  });
}

// Jacuzzi rond (2 × 2) : coque de marbre, eau turquoise, pétales de rose ; les bulles s'animent (ANIMES).
function jacuzzi(it, typeTheme, etat, O) {
  return O.spriteBloc(2, 2, 40, (g, P) => {
    for (let z = 0; z <= 16; z++) disqueZ(O, g, P, 1, 1, 0.9, z, z < 2 ? '#8a7a64' : z % 5 === 0 ? '#c9a227' : '#d9cfbf');
    disqueZ(O, g, P, 1, 1, 0.92, 18, '#f4efe4');
    disqueZ(O, g, P, 1, 1, 0.76, 18.3, '#1f8fa6');
    disqueZ(O, g, P, 1.04, 1.04, 0.6, 18.5, '#36b5c9');
    disqueZ(O, g, P, 1.1, 1.1, 0.34, 18.6, '#6fd8e3');
    for (const [u, v] of [[0.6, 0.9], [1.3, 0.7], [1.2, 1.4], [0.8, 1.3], [1.45, 1.1]]) O.pixel(g, P(u, v, 19), '#e3342f', 2, 1);
    // marche, bougies sur le rebord
    O.prisme(g, P, 0.66, 1.78, 1.34, 1.98, 0, 7, '#f4efe4');
    for (const [u, v] of [[0.3, 0.6], [1.7, 0.6], [0.24, 1.2]]) {
      O.prisme(g, P, u - 0.03, v - 0.03, u + 0.03, v + 0.03, 18, 23, '#f6f4ee');
      O.pixel(g, P(u, v, 25), '#ffd98a', 1, 2);
    }
  });
}

// Seau à champagne sur trépied, deux coupes.
function champagne(it, typeTheme, etat, O) {
  return O.spriteTuile(56, (g, P) => {
    for (const [x, y] of [[0.3, 0.34], [0.66, 0.34], [0.48, 0.68]]) O.prisme(g, P, x, y, x + 0.04, y + 0.04, 0, 26, '#c9a227');
    for (let z = 26; z <= 38; z++) disqueZ(O, g, P, 0.5, 0.5, 0.18, z, z < 37 ? '#c8cdd3' : '#eef2f5');
    disqueZ(O, g, P, 0.5, 0.5, 0.15, 38.3, '#e8f4fa');
    O.prisme(g, P, 0.44, 0.44, 0.54, 0.54, 36, 48, '#1f4a2a');
    O.prisme(g, P, 0.46, 0.46, 0.52, 0.52, 48, 52, '#c9a227');
    for (const [u, v] of [[0.4, 0.58], [0.58, 0.4]]) O.pixel(g, P(u, v, 39), '#ffffff', 2, 1);
  });
}

// Arrière-bar contre les baies : meuble bas, plateau de marbre, bouteilles (et le shaker, le seau à glace).
function arriereBar(it, typeTheme, etat, O) {
  const rnd = O.aleatoire(O.hacher('bar' + (it.variante || 0)));
  const x0 = it.part === 'g' ? 0.06 : 0;
  const x1 = it.part === 'd' ? 0.94 : 1;
  return O.spriteTuile(56, (g, P) => {
    O.prisme(g, P, x0, 0.06, x1, 0.5, 0, 28, '#3a1f14');
    O.quadY(g, P, 0.5, x0 + 0.06, x1 - 0.06, 4, 24, '#4a2a1a');
    O.quadY(g, P, 0.5, (x0 + x1) / 2 - 0.01, (x0 + x1) / 2 + 0.01, 4, 24, '#2a140c');
    O.quadY(g, P, 0.5, x0, x1, 25, 26, '#c9a227');
    O.prisme(g, P, x0, 0.04, x1, 0.52, 28, 31, '#ece6da');
    const cols = ['#c98a2a', '#2f6b3a', '#7a1f2a', '#e8eef2', '#3a2a5a', '#c9a227'];
    if (it.part === 'g') {
      O.prisme(g, P, 0.3, 0.2, 0.42, 0.32, 31, 42, '#c8cdd3');
      O.prisme(g, P, 0.33, 0.23, 0.39, 0.29, 42, 45, '#c8cdd3');
      for (const u of [0.56, 0.7]) O.prisme(g, P, u, 0.3, u + 0.08, 0.38, 31, 37, '#e8eef2');
      return;
    }
    for (let i = 0; i < 4; i++) {
      const u = 0.12 + i * 0.2;
      const h = 12 + Math.floor(rnd() * 6);
      const col = cols[Math.floor(rnd() * cols.length)];
      O.prisme(g, P, u, 0.18, u + 0.1, 0.28, 31, 31 + h, col);
      O.prisme(g, P, u + 0.03, 0.21, u + 0.07, 0.25, 31 + h, 36 + h, col);
      O.quadY(g, P, 0.28, u + 0.01, u + 0.09, 34, 38, '#f4ecd2');
    }
  });
}

// Comptoir du bar (conn : comptoirs voisins) : façade capitonnée, filet doré, plateau de marbre noir.
function comptoir(it, typeTheme, etat, O) {
  const c = it.conn || {};
  const x0 = c.w ? 0 : 0.06;
  const x1 = c.e ? 1 : 0.94;
  return O.spriteTuile(44, (g, P) => {
    O.prisme(g, P, x0, 0.2, x1, 0.8, 0, 30, '#7a1f3a');
    for (let u = 0.12; u < 1; u += 0.25) for (const z of [9, 20]) O.pixel(g, P(u, 0.8, z), '#4a1022', 1, 1);
    O.quadY(g, P, 0.8, x0, x1, 2, 4, '#c9a227');
    O.prisme(g, P, x0, 0.14, x1, 0.86, 30, 33, '#1d1a20');
    O.quadY(g, P, 0.86, x0, x1, 30, 31, '#c9a227');
    const [u0, u1] = [0.3, 0.7];
    if ((it.x + it.y) % 2) {
      O.prisme(g, P, u0, 0.5, u0 + 0.08, 0.58, 33, 36, '#e8eef2');
      O.prisme(g, P, u0 + 0.035, 0.53, u0 + 0.045, 0.55, 36, 40, '#e8eef2');
      O.quadZ(g, P, 40, u0 - 0.02, 0.48, u0 + 0.1, 0.6, '#f2c0d0');
    } else {
      O.prisme(g, P, u1 - 0.08, 0.5, u1, 0.6, 33, 39, '#e8eef2');
      O.prisme(g, P, u1 - 0.07, 0.51, u1 - 0.01, 0.59, 33, 36, '#c98a2a');
    }
  });
}

// Tabouret de bar (siège) : pied chromé, assise de cuir bordeaux.
function tabouretBar(it, typeTheme, etat, O) {
  return O.spriteTuile(30, (g, P) => {
    disqueZ(O, g, P, 0.5, 0.5, 0.22, 0, '#9aa1a8');
    O.prisme(g, P, 0.47, 0.47, 0.53, 0.53, 0, 11, '#c8cdd3');
    disqueZ(O, g, P, 0.5, 0.5, 0.17, 5, '#c8cdd3');
    disqueZ(O, g, P, 0.5, 0.5, 0.27, 11, '#4a1022');
    disqueZ(O, g, P, 0.5, 0.5, 0.27, 14, '#7a1f3a');
    O.pixel(g, P(0.42, 0.42, 14), '#a8405e', 2, 1);
  });
}

// Le trône de l'agent : dossier haut capitonné, cadre doré, petite couronne.
function trone(it, typeTheme, etat, O) {
  return O.spriteTuile(70, (g, P) => {
    const or = '#c9a227';
    const velours = '#7a1f3a';
    for (const [x, y] of [[0.2, 0.2], [0.74, 0.2], [0.2, 0.74], [0.74, 0.74]]) O.prisme(g, P, x, y, x + 0.06, y + 0.06, 0, 10, or);
    O.prisme(g, P, 0.16, 0.16, 0.84, 0.84, 9, 12, or);
    O.prisme(g, P, 0.2, 0.22, 0.8, 0.8, 12, 15, velours);
    O.prisme(g, P, 0.14, 0.08, 0.86, 0.2, 9, 56, or);
    O.quadY(g, P, 0.2, 0.2, 0.8, 14, 52, velours);
    for (const [u, z] of [[0.35, 24], [0.65, 24], [0.5, 34], [0.35, 44], [0.65, 44]]) O.pixel(g, P(u, 0.2, z), '#4a1022', 1, 1);
    for (const u of [0.24, 0.5, 0.76]) O.prisme(g, P, u - 0.04, 0.1, u + 0.04, 0.18, 56, 62, or);
    O.pixel(g, P(0.5, 0.18, 60), '#e3342f', 2, 2);
    for (const x of [0.12, 0.8]) O.prisme(g, P, x, 0.2, x + 0.08, 0.8, 12, 22, or);
  });
}

// Lit king size (3 × 3, tête contre le mur gauche) : tête de lit capitonnée, oreillers, plaid, cœur de pétales.
function litKing(it, typeTheme, etat, O) {
  return O.spriteBloc(3, 3, 70, (g, P) => {
    const velours = '#7a1f3a';
    O.prisme(g, P, 0.02, 0.04, 0.16, 2.96, 0, 44, velours);
    O.prisme(g, P, 0.02, 0.04, 0.16, 2.96, 44, 47, '#c9a227');
    for (let y = 0.3; y < 2.9; y += 0.4) for (const z of [24, 36]) O.pixel(g, P(0.16, y, z), '#4a1022', 1, 1);
    O.prisme(g, P, 0.16, 0.08, 2.94, 2.92, 0, 10, '#3a2a22');
    O.quadX(g, P, 2.94, 0.1, 2.9, 4, 5, '#c9a227');
    O.prisme(g, P, 0.18, 0.1, 2.9, 2.9, 10, 18, '#f6f4ee');
    for (const y of [0.25, 0.95, 1.65, 2.35]) O.prisme(g, P, 0.24, y, 0.62, y + 0.6, 18, 23, y < 1.5 ? '#ffffff' : '#f0e8d8');
    O.prisme(g, P, 1.6, 0.06, 2.92, 2.94, 12, 20, '#7a1f3a');
    O.prisme(g, P, 1.6, 0.06, 1.72, 2.94, 20, 20.5, '#c9a227');
    // cœur de pétales de rose
    const coeur = [[1.05, 1.3], [1.0, 1.4], [1.0, 1.55], [1.05, 1.65], [1.15, 1.5], [1.15, 1.75], [1.25, 1.6], [1.35, 1.5], [1.15, 1.25], [1.25, 1.4], [1.45, 1.5]];
    for (const [u, v] of coeur) O.pixel(g, P(u, v, 18.5), '#d42a4a', 2, 1);
  });
}

// Statue dorée d'un agent triomphant, sur son socle de marbre.
function statue(it, typeTheme, etat, O) {
  return O.spriteTuile(84, (g, P) => {
    O.prisme(g, P, 0.22, 0.22, 0.78, 0.78, 0, 22, '#ece6da');
    O.quadY(g, P, 0.78, 0.3, 0.7, 8, 14, '#c9a227');
    O.prisme(g, P, 0.18, 0.18, 0.82, 0.82, 22, 25, '#d8d0c0');
    const or = '#d4a927';
    // jambes, buste, bras levés en V, tête ronde
    O.prisme(g, P, 0.4, 0.44, 0.47, 0.56, 25, 40, or);
    O.prisme(g, P, 0.53, 0.44, 0.6, 0.56, 25, 40, or);
    O.prisme(g, P, 0.37, 0.4, 0.63, 0.6, 40, 56, or);
    for (let i = 0; i < 12; i++) {
      O.prisme(g, P, 0.34 - i * 0.012, 0.46, 0.39 - i * 0.012, 0.54, 52 + i * 1.5, 54 + i * 1.5, or);
      O.prisme(g, P, 0.61 + i * 0.012, 0.46, 0.66 + i * 0.012, 0.54, 52 + i * 1.5, 54 + i * 1.5, or);
    }
    const [cx, cy] = P(0.5, 0.5, 63);
    boule(g, Math.round(cx), Math.round(cy), 5, '#e8c547');
    O.pixel(g, P(0.62, 0.5, 46), '#fff3c4', 1, 6);
  });
}

// Chariot du room service : nappe blanche, cloche d'argent, une rose ; les agents y déposent leur dossier.
function chariot(it, typeTheme, etat, O) {
  return O.spriteTuile(50, (g, P) => {
    for (const [x, y] of [[0.16, 0.2], [0.78, 0.2], [0.16, 0.74], [0.78, 0.74]]) {
      O.prisme(g, P, x, y, x + 0.04, y + 0.04, 3, 24, '#c9a227');
      O.prisme(g, P, x - 0.01, y - 0.01, x + 0.05, y + 0.05, 0, 3, '#15151f');
    }
    O.prisme(g, P, 0.14, 0.18, 0.86, 0.82, 7, 9, '#c9a227');
    O.prisme(g, P, 0.1, 0.14, 0.9, 0.86, 24, 27, '#f6f4ee');
    O.quadY(g, P, 0.86, 0.1, 0.9, 17, 24, '#f6f4ee');
    O.quadX(g, P, 0.9, 0.14, 0.86, 17, 24, '#ebe8df');
    for (let z = 27; z <= 34; z++) disqueZ(O, g, P, 0.38, 0.5, 0.2 - (z - 27) * 0.02, z, z < 33 ? '#c8cdd3' : '#eef2f5');
    O.prisme(g, P, 0.36, 0.48, 0.4, 0.52, 34, 37, '#c8cdd3');
    O.prisme(g, P, 0.7, 0.3, 0.76, 0.36, 27, 36, '#e8f4fa');
    O.prisme(g, P, 0.72, 0.32, 0.74, 0.34, 36, 41, '#2f6b3a');
    O.prisme(g, P, 0.7, 0.3, 0.76, 0.36, 41, 44, '#d42a4a');
  });
}

export const MEUBLES = {
  iso_barreaux: barreaux,
  iso_lit_camp: litCamp,
  iso_wc_inox: wcInox,
  iso_boulet: boulet,
  iso_gamelle: gamelle,
  iso_aile: aile,
  iso_casier: casier,
  iso_marquage: marquage,
  iso_muscu: muscu,
  iso_ballon: ballon,
  iso_parloir: parloir,
  iso_tabouret: tabouret,
  iso_table_cantine: tableCantine,
  iso_banc: banc,
  iso_guichet: guichet,
  iso_portique: portique,
  iso_cordon: cordon,
  iso_serviettes: serviettes,
  iso_jacuzzi: jacuzzi,
  iso_champagne: champagne,
  iso_arriere_bar: arriereBar,
  iso_comptoir: comptoir,
  iso_tabouret_bar: tabouretBar,
  iso_trone: trone,
  iso_lit_king: litKing,
  iso_statue: statue,
  iso_chariot: chariot,
  iso_piano: piano,
  iso_banquette: banquette,
  iso_guitares: guitares,
  iso_batterie: batterie,
  iso_poste: poste,
  iso_console: console_,
  iso_vinyles: vinyles,
  iso_enceinte: enceinte,
  iso_panneau: panneau,
  iso_platine: platine,
  iso_table_ronde: tableRonde,
  iso_depot: depot,
};

export const ANIMES = {
  // vumètre de la table de mixage, voyant rouge du micro
  iso_console(g, it, tx, ty, t, O) {
    const P = O.projeteur(tx + 32, ty);
    if (it.part === 'g') {
      if (Math.floor(t / 700) % 2) O.pixel(g, P(0.98, 0.09, 47), '#ff6b6b', 1, 1);
      return;
    }
    for (let i = 0; i < 2; i++) {
      const n = 2 + Math.floor((Math.sin(t / (90 + i * 37)) * 0.5 + 0.5) * 6);
      for (let k = 0; k < n; k++) O.pixel(g, P(0.16 + i * 0.12, 0.13, 26.5 + k * 0.5 + k), k > 5 ? '#ff3b3b' : k > 3 ? '#ffe14d' : '#3dff7a', 2, 1);
    }
  },
  // reflet qui tourne sur le disque
  iso_platine(g, it, tx, ty, t, O) {
    const P = O.projeteur(tx + 32, ty);
    const a = (t / 400) % (Math.PI * 2);
    for (let i = 0; i < 3; i++) O.pixel(g, P(0.46 + Math.cos(a) * (0.12 + i * 0.04), 0.5 + Math.sin(a) * (0.12 + i * 0.04), 26), '#5a5a66', 1, 1);
  },
  // bulles du jacuzzi : elles montent de la buse et éclatent en surface
  iso_jacuzzi(g, it, tx, ty, t, O) {
    const P = O.projeteur(tx + 32, ty);
    for (let i = 0; i < 9; i++) {
      const ph = ((t / 900 + i * 0.37) % 1 + 1) % 1;
      const a = i * 2.4 + Math.floor(t / 900 + i * 0.37) * 1.7;
      const r = 0.15 + ((i * 0.23) % 0.5);
      const u = 1 + Math.cos(a) * r;
      const v = 1 + Math.sin(a) * r;
      O.pixel(g, P(u, v, 19 + ph * 2), ph < 0.8 ? '#e8fbff' : '#9fe6f0', ph < 0.5 ? 1 : 2, 1);
    }
    // vapeur
    const ph = (t / 2400) % 1;
    O.pixel(g, P(0.8 + ph * 0.2, 0.9, 24 + ph * 18), 'rgba(255,255,255,' + (0.45 * (1 - ph)).toFixed(2) + ')', 3, 2);
  },
  // flammes des bougies du dîner aux chandelles
  iso_table_ronde(g, it, tx, ty, t, O) {
    const P = O.projeteur(tx + 32, ty);
    if (it.nappe) {
      [0.36, 0.5, 0.64].forEach((u, i) => {
        const f = Math.floor(t / (140 + i * 30)) % 3;
        O.pixel(g, P(u, 0.5, 42), f ? '#ffd98a' : '#ffb347', 1, f === 2 ? 3 : 2);
      });
    } else if (Math.floor(t / 230) % 3) O.pixel(g, P(0.5, 0.48, 31), '#ffe9a0', 1, 2);
  },
  // voyant du portique : vert, rouge quand ça sonne
  iso_portique(g, it, tx, ty, t, O) {
    const P = O.projeteur(tx + 32, ty);
    const sonne = (t % 7000) < 900;
    O.pixel(g, P(0.5, 0.5, 66), sonne ? (Math.floor(t / 120) % 2 ? '#ff3b3b' : '#7a1010') : '#3dff7a', 3, 2);
  },
  // goutte qui tombe du robinet du lavabo-WC
  iso_wc_inox(g, it, tx, ty, t, O) {
    const P = O.projeteur(tx + 32, ty);
    const ph = (t % 1800) / 1800;
    if (ph < 0.5) O.pixel(g, P(0.5, 0.16, 44 - ph * 7), '#9fd3e8', 1, 1);
  },
};

export const JEUX = {};

export const THEMES = {
  // Studio feutré : moquette aubergine, noyer, velours prune et canard, laiton.
  'isoloir-studio': {
    sols: { def: ['moquette', '#382a3e'], lobby: ['marbre', '#3d3644'], cabine: ['iso_chevrons', '#7a5236'], pause: ['iso_chevrons', '#6a462e'], salon: ['moquette', '#34263a'] },
    mur: 'iso_mousse', dalle: '#1a141c', bureau: '#6e4a33', chaise: '#8a5a3a', canape: '#6a2b4f', canapeEquipe: '#2c6262', table: '#4d3626',
  },
  // Cellule de prison : béton, parpaings, lino de cantine, mobilier d'acier, chaises orange.
  'isoloir-cellule': {
    sols: { def: ['beton', '#a39e93'], lobby: ['lino', '#9aa39a'], cellule: ['beton', '#8f8a80'], garde: ['lino', '#8b9890'], coursive: ['lino', '#a9b1a5'],
      pause: ['iso_cour', '#5f605c'], parloir: ['lino', '#c8c0a6'], cantine: ['lino', '#bdb79f'] },
    mur: 'iso_parpaing', dalle: '#3a3a36', bureau: '#8d949c', chaise: '#d9782a', canape: '#7a7a72', canapeEquipe: '#d9782a', table: '#b8bec6',
  },
  // Suite présidentielle : marbre blanc, mosaïque du spa, parquet du bar, moquette de la chambre, bordeaux et or.
  'isoloir-suite': {
    sols: { def: ['marbre', '#f1ede4'], lobby: ['marbre', '#e9e2d2'], spa: ['iso_mosaique', '#2f8fa6'], pause: ['parquet', '#5a3220'], chambre: ['moquette', '#e8dcc4'],
      coin: ['parquet', '#7a4a2a'], diner: ['parquet', '#6a3e22'], salon: ['marbre', '#ece6da'], centre: ['marbre', '#f1ede4'] },
    mur: 'iso_soie', dalle: '#4a3a2a', bureau: '#f3eee4', chaise: '#7a1f3a', canape: '#f0e8d8', canapeEquipe: '#7a1f3a', table: '#c9a227',
  },
};

export const SOLS = {
  // parquet à chevrons : quatre bandes, joints en zigzag
  iso_chevrons(g, col, { variante }, O) {
    const Pt = O.projeteur(32, 0);
    const teintes = [col, O.nuance(col, -0.08), O.nuance(col, 0.06), O.nuance(col, -0.13)];
    const u = (v) => Math.max(0, Math.min(1, v)); // les lames restent dans le losange
    for (let b = 0; b < 4; b++) {
      const v0 = b / 4;
      const v1 = (b + 1) / 4;
      const d = b % 2 ? 0.12 : -0.12;
      for (let k = -1; k <= 4; k++) {
        const u0 = k / 4;
        const u1 = (k + 1) / 4;
        O.poly(g, [Pt(u(u0), v0), Pt(u(u1), v0), Pt(u(u1 + d), v1), Pt(u(u0 + d), v1)], teintes[(b + k + 4 + variante) % 4]);
      }
    }
  },
  // bitume de la cour : grain, gravillons, une fissure de temps en temps
  iso_cour(g, col, { variante, rnd }, O) {
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(rnd() * 64);
      const y = Math.floor(rnd() * 31);
      if (!dansLosange(x, y)) continue;
      g.fillStyle = rnd() < 0.5 ? O.nuance(col, -0.15) : O.nuance(col, 0.14);
      g.fillRect(x, y, 1, 1);
    }
    if (variante === 1) {
      g.fillStyle = O.nuance(col, -0.3);
      let x = 18;
      for (let y = 9; y < 22; y++) {
        x += rnd() < 0.5 ? 1 : 2;
        if (dansLosange(x, y)) g.fillRect(x, y, 1, 1);
      }
    }
  },
  // mosaïque du spa : petits carreaux bleus, joints clairs
  iso_mosaique(g, col, { rnd }, O) {
    const Pt = O.projeteur(32, 0);
    O.poly(g, [Pt(0, 0), Pt(1, 0), Pt(1, 1), Pt(0, 1)], '#dfe9ea');
    const n = 5;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const t = rnd();
        const c = t < 0.15 ? '#f4efe4' : t < 0.5 ? O.nuance(col, 0.18) : t < 0.8 ? col : O.nuance(col, -0.15);
        const e = 0.03;
        O.poly(g, [Pt(i / n + e, j / n + e), Pt((i + 1) / n - e, j / n + e), Pt((i + 1) / n - e, (j + 1) / n - e), Pt(i / n + e, (j + 1) / n - e)], c);
      }
    }
  },
};

// Le pixel (x, y) est-il dans le losange de la tuile (64 × 32) ?
function dansLosange(x, y) {
  if (y < 0 || y > 30) return false;
  const hw = y <= 15 ? 2 * y + 2 : 62 - 2 * y;
  return x >= 32 - hw && x <= 32 + hw - 1;
}

export const MURS = {
  // mousse acoustique en pyramides, soubassement de lattes de noyer, filet de laiton
  iso_mousse(g, longueur, cote, rnd, O) {
    const HW = O.HW;
    rect(g, 0, 0, longueur, HW, '#241f2a');
    for (let y = 3; y < HW - 28; y += 12) {
      for (let x = (y / 12) % 2 ? 6 : 0; x < longueur; x += 12) {
        rect(g, x + 1, y + 1, 10, 10, '#3a3244');
        for (let i = 0; i < 5; i++) {
          rect(g, x + 1 + i, y + 1 + i, 10 - 2 * i, 1, '#4a4156');
          rect(g, x + 1 + i, y + 10 - i, 10 - 2 * i, 1, '#2b2433');
        }
        rect(g, x + 5, y + 5, 2, 2, '#564b63');
      }
    }
    rect(g, 0, HW - 27, longueur, 2, '#c9a227');
    rect(g, 0, HW - 25, longueur, 25, '#5a3a26');
    for (let x = 0; x < longueur; x += 5) rect(g, x, HW - 25, 1, 25, '#3e271a');
    for (let x = 2; x < longueur; x += 5) rect(g, x, HW - 25, 1, 25, '#6a4a32');
    rect(g, 0, HW - 3, longueur, 3, '#2a1a10');
  },
  // parpaings peints en gris clair, soubassement vert administration, coulures
  iso_parpaing(g, longueur, cote, rnd, O) {
    const HW = O.HW;
    rect(g, 0, 0, longueur, HW, '#8f928c');
    for (let row = 0; row * 9 < HW - 30; row++) {
      const dec = row % 2 ? 10 : 0;
      for (let x = -dec; x < longueur; x += 20) {
        const c = O.nuance('#c4c6bd', (rnd() - 0.5) * 0.08);
        rect(g, x + 1, row * 9 + 1, 19, 8, c);
        rect(g, x + 1, row * 9 + 1, 19, 1, O.nuance(c, 0.12));
      }
    }
    rect(g, 0, HW - 31, longueur, 31, '#4f6f5a');
    rect(g, 0, HW - 32, longueur, 2, '#2f4a3a');
    for (let row = 0; row < 3; row++) for (let x = (row % 2) * 10; x < longueur; x += 20) rect(g, x, HW - 30 + row * 9, 1, 8, '#45634f');
    for (let row = 1; row < 4; row++) rect(g, 0, HW - 31 + row * 9, longueur, 1, '#45634f');
    rect(g, 0, HW - 4, longueur, 4, '#2f3a33');
    // coulures et taches
    for (let i = 0; i < longueur / 60; i++) {
      const x = Math.floor(rnd() * longueur);
      const h = 4 + Math.floor(rnd() * 14);
      rect(g, x, HW - 32 - h, 1, h, 'rgba(90,80,60,0.35)');
      rect(g, x + 1, HW - 32 - h + 3, 1, h - 5, 'rgba(90,80,60,0.25)');
    }
  },
  // soie crème à damas doré, lambris blanc à moulures, cimaise et corniche dorées
  iso_soie(g, longueur, cote, rnd, O) {
    const HW = O.HW;
    rect(g, 0, 0, longueur, HW, '#efe6d2');
    for (let y = 8; y < HW - 30; y += 14) {
      for (let x = (y / 14) % 2 ? 9 : 2; x < longueur; x += 14) {
        rect(g, x + 2, y, 1, 1, '#d9c58f');
        rect(g, x + 1, y + 1, 3, 1, '#d9c58f');
        rect(g, x, y + 2, 5, 1, '#e2cf9a');
        rect(g, x + 1, y + 3, 3, 1, '#d9c58f');
        rect(g, x + 2, y + 4, 1, 2, '#d9c58f');
      }
    }
    rect(g, 0, 0, longueur, 4, '#f8f3e8');
    rect(g, 0, 4, longueur, 1, '#c9a227');
    rect(g, 0, HW - 30, longueur, 30, '#f6f1e6');
    rect(g, 0, HW - 31, longueur, 2, '#c9a227');
    for (let x = 4; x < longueur; x += 26) {
      rect(g, x, HW - 25, 20, 1, '#d8ccb0');
      rect(g, x, HW - 25, 1, 18, '#d8ccb0');
      rect(g, x, HW - 8, 20, 1, '#ffffff');
      rect(g, x + 19, HW - 25, 1, 18, '#ffffff');
    }
    rect(g, 0, HW - 4, longueur, 4, '#d8ccb0');
  },
};

// Ce qu'on accroche aux murs de chaque décor.
export const DECORS_MURS = {
  'isoloir-studio'(g, cote, longueur, etage, O) {
    const disqueOr = (x, y) => {
      O.cadre(g, x, y, 24, 30, '#c9a227', '#15151f');
      rond(g, x + 12, y + 13, 8, '#f4d35e');
      rond(g, x + 12, y + 13, 6, '#e0b92e');
      rond(g, x + 12, y + 13, 2, '#c0392b');
      rect(g, x + 5, y + 24, 14, 2, '#f4ecd2');
    };
    if (cote === 'droite') {
      O.enseigneQG(g);
      // « ON AIR » au-dessus de la cabine
      const x0 = 7.5 * 32 - 34;
      O.cadre(g, x0, 8, 68, 18, '#15151f', '#c0392b');
      rect(g, x0 + 3, 11, 62, 12, '#e3342f');
      rect(g, x0 + 3, 11, 62, 1, '#ff8a80');
      const t = O.enseigne('ON AIR', 'ON AIR');
      g.drawImage(O.texteCanvas(t, '#ffffff'), Math.round(x0 + 34 - O.mesurer(t) / 2), 13);
      disqueOr(3.4 * 32, 14);
      disqueOr(9.2 * 32, 14);
      // diffuseur en bois (blocs de hauteurs différentes) au-dessus de l'enceinte
      const d0 = 12 * 32 + 4;
      O.cadre(g, d0, 10, 54, 34, '#3e271a', '#3e271a');
      const r2 = O.aleatoire(42);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) rect(g, d0 + 3 + i * 8, 13 + j * 7, 7, 6, O.nuance('#8a5a3a', (r2() - 0.5) * 0.5));
    } else {
      O.plaqueEtage(g, etage);
      // trois vinyles accrochés au-dessus du coin écoute
      const c = (gy) => (12 - gy) * 32;
      for (const [gy, lab] of [[10.6, '#f6c21c'], [9.3, '#e3342f'], [8.0, '#2f6fde']]) {
        const x = Math.round(c(gy));
        rond(g, x, 30, 11, '#15151f');
        rond(g, x, 30, 9, '#222228');
        rond(g, x, 30, 4, lab);
        rect(g, x, 30, 1, 1, '#15151f');
      }
    }
  },
  'isoloir-cellule'(g, cote, longueur, etage, O) {
    // petite fenêtre haute à barreaux (ciel bleu)
    const lucarne = (x, y, w, h) => {
      O.cadre(g, x, y, w, h, '#5d646c', '#7cc4ff');
      rect(g, x + 2, y + h - 7, w - 4, 5, '#a8dbff');
      for (let i = x + 5; i < x + w - 2; i += 5) rect(g, i, y + 1, 1, h - 2, '#3a3f47');
    };
    // traits de craie : des paquets de cinq (quatre bâtons barrés)
    const craie = (x0, y0, paquets, parLigne) => {
      const rnd = O.aleatoire(x0 * 7 + y0);
      for (let p = 0; p < paquets; p++) {
        const x = x0 + (p % parLigne) * 17;
        const y = y0 + Math.floor(p / parLigne) * 15;
        const n = p === paquets - 1 ? 3 : 4;
        for (let i = 0; i < n; i++) rect(g, x + i * 3, y + (rnd() < 0.3 ? 1 : 0), 1, 10, rnd() < 0.2 ? '#d8d8cc' : '#f2f2ea');
        if (n === 4) for (let k = 0; k < 13; k++) rect(g, x - 1 + k, y + 8 - Math.round(k * 0.6), 1, 1, '#f2f2ea');
      }
    };
    if (cote === 'droite') {
      O.enseigneQG(g);
      lucarne(3 * 32 + 14, 10, 26, 20);
      // la grande cellule : lucarne, des jours et des jours de craie, un soleil et un bonhomme
      lucarne(9 * 32 + 6, 8, 34, 22);
      craie(5 * 32 + 8, 16, 14, 5);
      for (let a = 0; a < 16; a++) rect(g, Math.round(8 * 32 + 10 + Math.cos((a / 16) * Math.PI * 2) * 6), Math.round(20 + Math.sin((a / 16) * Math.PI * 2) * 6), 1, 1, '#f2f2ea');
      for (let a = 0; a < 8; a++) rect(g, Math.round(8 * 32 + 10 + Math.cos((a / 8) * Math.PI * 2) * 9), Math.round(20 + Math.sin((a / 8) * Math.PI * 2) * 9), 1, 1, '#f2f2ea');
      const b = 8 * 32 + 6;
      rect(g, b + 3, 36, 3, 3, '#f2f2ea');
      rect(g, b + 4, 39, 1, 7, '#f2f2ea');
      rect(g, b + 1, 41, 7, 1, '#f2f2ea');
      rect(g, b + 2, 46, 1, 4, '#f2f2ea');
      rect(g, b + 6, 46, 1, 4, '#f2f2ea');
      // cellule de droite
      lucarne(11 * 32 + 18, 10, 26, 20);
      craie(11 * 32 + 6, 36, 3, 3);
      // poste de garde : règlement et tableau des clés
      const r0 = 14 * 32 + 1;
      O.cadre(g, r0, 4, 36, 26, '#3a3f47', '#f4f1e6');
      const regles = O.enseigne('REGLES', 'RULES');
      g.drawImage(O.texteCanvas(regles, '#7a1f2a'), Math.round(r0 + 18 - O.mesurer(regles) / 2), 6);
      for (let i = 0; i < 4; i++) rect(g, r0 + 5, 16 + i * 3, 26 - (i % 2) * 8, 1, '#8a8a80');
      const k0 = 15 * 32 + 8;
      O.cadre(g, k0, 6, 22, 18, '#5b3418', '#8a5a32');
      for (let i = 0; i < 4; i++) {
        rect(g, k0 + 3 + i * 5, 9, 1, 2, '#3a3f47');
        rect(g, k0 + 2 + i * 5, 11, 3, 3, '#c9a227');
        rect(g, k0 + 3 + i * 5, 14, 1, 5, '#c9a227');
      }
    } else {
      O.plaqueEtage(g, etage);
      const c = (gy) => (12 - gy) * 32;
      // panier de basket au-dessus de la cour
      const p = Math.round(c(9.6));
      O.cadre(g, p - 16, 8, 32, 22, '#c8cdd3', '#f6f6f2');
      O.cadre(g, p - 6, 15, 12, 9, '#e3342f', '#f6f6f2');
      rect(g, p - 7, 30, 14, 2, '#e3342f');
      for (let i = 0; i < 4; i++) rect(g, p - 6 + i * 4, 32, 1, 8 - i % 2, '#f2f2ea');
      rect(g, p - 5, 36, 10, 1, '#f2f2ea');
      const pr = O.enseigne('PROMENADE', 'YARD');
      g.drawImage(O.texteCanvas(pr, '#e8c21c'), Math.round(c(10.9) - O.mesurer(pr) / 2), 44);
    }
  },
  'isoloir-suite'(g, cote, longueur, etage, O) {
    if (cote === 'droite') {
      O.enseigneQG(g);
      // baies vitrées du sol au plafond : la ville la nuit, la lune
      const x0 = 3 * 32 - 4;
      const x1 = longueur - 6;
      const y0 = 8;
      const y1 = O.HW - 9;
      const rnd = O.aleatoire(1234);
      O.cadre(g, x0, y0, x1 - x0, y1 - y0, '#c9a227', '#0c1430');
      const ciel = ['#0c1430', '#13204a', '#1e2f62', '#2b3f78'];
      for (let i = 0; i < 4; i++) rect(g, x0 + 2, y0 + 2 + i * ((y1 - y0 - 4) / 4), x1 - x0 - 4, Math.ceil((y1 - y0 - 4) / 4), ciel[i]);
      for (let i = 0; i < 40; i++) rect(g, x0 + 3 + Math.floor(rnd() * (x1 - x0 - 6)), y0 + 3 + Math.floor(rnd() * 26), 1, 1, rnd() < 0.3 ? '#fff4c4' : '#c8d0ff');
      rond(g, x0 + 170, y0 + 13, 6, '#fff1b0');
      rond(g, x0 + 173, y0 + 11, 5, ciel[0]);
      let bx = x0 + 2;
      while (bx < x1 - 2) {
        const bw = 8 + Math.floor(rnd() * 14);
        const bh = 14 + Math.floor(rnd() * 34);
        const w = Math.min(bw, x1 - 2 - bx);
        rect(g, bx, y1 - 2 - bh, w, bh, rnd() < 0.5 ? '#0a0f22' : '#111833');
        for (let yy = y1 - bh; yy < y1 - 4; yy += 3) for (let xx = bx + 1; xx < bx + w - 1; xx += 2) if (rnd() < 0.35) rect(g, xx, yy, 1, 1, rnd() < 0.8 ? '#ffd86b' : '#9fe6ff');
        if (bh > 40) rect(g, bx + Math.floor(w / 2), y1 - 4 - bh, 1, 3, '#ff3b3b');
        bx += bw + 1;
      }
      for (let x = x0 + 70; x < x1 - 20; x += 70) rect(g, x, y0, 3, y1 - y0, '#c9a227');
      rect(g, x0, y0 + 30, x1 - x0, 2, '#c9a227');
      // rideaux de velours et leurs embrasses
      for (const [rx, rw] of [[x0 - 8, 12], [x1 - 6, 6]]) {
        rect(g, rx, 4, rw, O.HW - 10, '#7a1f3a');
        for (let k = rx + 2; k < rx + rw; k += 4) rect(g, k, 4, 1, O.HW - 10, '#5a1428');
        rect(g, rx, 40, rw, 3, '#c9a227');
      }
      rect(g, x0 - 10, 2, x1 - x0 + 16, 3, '#c9a227');
    } else {
      O.plaqueEtage(g, etage);
      const c = (gy) => (12 - gy) * 32;
      // portrait de l'agent en majesté, au-dessus du lit, entre deux appliques
      const a = Math.round(c(8.9));
      const b = Math.round(c(6.5));
      O.cadre(g, a, 6, b - a, 32, '#c9a227', '#5a1428');
      const cx = Math.round((a + b) / 2);
      rect(g, cx - 10, 26, 20, 10, '#2f6fde');
      rect(g, cx - 6, 14, 12, 12, '#f4c9a0');
      rect(g, cx - 3, 18, 2, 2, '#15151f');
      rect(g, cx + 2, 18, 2, 2, '#15151f');
      rect(g, cx - 2, 22, 5, 1, '#7a1f2a');
      rect(g, cx - 7, 10, 14, 4, '#f4d35e');
      for (const k of [-7, -1, 5]) rect(g, cx + k, 8, 2, 2, '#f4d35e');
      rect(g, cx - 1, 11, 2, 2, '#e3342f');
      for (const x of [a - 8, b + 4]) {
        rect(g, x + 1, 22, 2, 8, '#c9a227');
        rect(g, x - 1, 14, 6, 8, '#fff3c4');
        rect(g, x - 1, 14, 6, 1, '#c9a227');
      }
    }
  },
};
