// Meubles, sols et murs des décors au choix de la famille « repos » (1.0.10). Contrat : web/meubles/index.js.
// Plans : web/plans/repos.js.
// Les dormeurs (web/scenes.js) se posent sur les lits : la tête sur l'oreiller, en u = 0,3 au milieu de la largeur, à
// z + 3 ; la couverture de u = 0,4 à 1,9 et de z à z + 6 (u le long du lit, 0 = la tête). Un dormeur se trie juste
// après le sprite principal du meuble de sa case de pied (avant `haut`), celui de l'étage 2 entre `haut` et `devant` :
// ce qui doit passer devant lui (bord avant, paroi du pied, toit…) va donc dans `haut` ou `devant`.
// Les hauteurs de matelas Z sont les `couche.z` du plan : à changer ensemble.
const Z = { capsuleBas: 4, capsuleHaut: 45, tente: 3, sac: 2, hamac: 22 };

// ---------- outils de dessin ----------
// Feuille pour un meuble qui déborde de sa case : P(x, y, z) en cases relatives à la case du meuble, x de x0 à x1 et
// y de y0 à y1, jusqu'à htop pixels de haut. `apres` dessine après le contour (lueurs, fils).
function feuille(O, x0, y0, x1, y1, htop, fn, apres = null) {
  const minX = Math.floor((x0 - y1) * 32);
  const maxX = Math.ceil((x1 - y0) * 32);
  const haut = Math.floor((x0 + y0) * 16 - htop);
  const bas = Math.ceil((x1 + y1) * 16);
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

// Bulle de texte des easter eggs, la pointe en bas à gauche sur (x, y) (en bas à droite si `gauche` : la bulle
// s'étend alors vers la gauche, pour un meuble près du mur de droite) ; `ech` : taille du texte (1 ou 2).
function bulle(g, O, txt, x, y, col, ech = 1, gauche = false) {
  const tc = O.texteCanvas(txt, col);
  const w = tc.width * ech + 8;
  const h = tc.height * ech + 6;
  const bx = Math.round(x) - (gauche ? w : 0);
  const by = Math.round(y) - h - 4;
  O.cadre(g, bx, by, w, h, '#15151f', '#fff4d6');
  g.drawImage(tc, bx + 4, by + 3, tc.width * ech, tc.height * ech);
  g.fillStyle = '#15151f';
  const px = gauche ? bx + w - 6 : bx + 3;
  g.fillRect(px, by + h, 3, 3);
  g.fillRect(gauche ? px + 2 : px - 2, by + h + 2, 2, 2);
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

// Lit couché selon un axe : u le long du lit (0 = la tête), v en travers (comme axeLit de decor.js).
function axeLit(O, P, axe) {
  return axe === 'x'
    ? (g, u0, v0, u1, v1, z0, z1, col, cg, cd) => O.prisme(g, P, u0, v0, u1, v1, z0, z1, col, cg, cd)
    : (g, u0, v0, u1, v1, z0, z1, col, cg, cd) => O.prisme(g, P, v0, u0, v1, u1, z0, z1, col, cg, cd);
}
const ptLit = (P, axe) => (axe === 'x' ? (u, v, z) => P(u, v, z) : (u, v, z) => P(v, u, z));

// Petite lueur chaude (lampe allumée), dessinée après le contour.
function lueur(g, x, y, r = 5, col = 'rgba(255,214,140,0.35)') {
  ovale(g, x, y, r, Math.max(2, Math.round(r * 0.7)), col);
}

// ======================================================================================================
// Hôtel capsules
// ======================================================================================================
const COQUE = '#ece4d2';
const COQUE_IN = '#c4b89c';
const MATELAS_C = '#ddd6c6';
const STORES = ['#2f4a7a', '#8a3340', '#2f6a5a', '#5a3f7a', '#8a6a2f', '#3a5a8a', '#7a3f2f'];
// hauteurs : coque 0–2, matelas du bas 2–4, dalle 39–42, matelas du haut 42–45, toit 80–84. Une tête dépasse
// d'environ 15 pixels au-dessus du point de l'oreiller ; vue par l'ouverture (16 pixels de recul jusqu'au bord
// avant), elle monte donc à z + 3 + 15 + 16 = z + 34 : 38 sous la dalle (39), 79 sous le toit (80).
const CAP = { sol: 2, bas: Z.capsuleBas, dalle0: 39, dalle1: 42, haut: Z.capsuleHaut, toit0: 80, toit1: 84 };

// Outils de dessin en coordonnées de la capsule entière (u de 0 à 2 le long, v de 0 au fond à 1 à l'ouverture),
// depuis la case de la moitié `d` (0 : la tête, 1 : le pied).
function outilsCapsule(O, P, d) {
  const Pd = (u, v, z) => P(u - d, v, z);
  return {
    P: Pd,
    Pr: (g, u0, v0, u1, v1, z0, z1, col, cg, cd) => O.prisme(g, Pd, u0, v0, u1, v1, z0, z1, col, cg, cd),
    Y: (g, v, u0, u1, z0, z1, col) => O.quadY(g, Pd, v, u0, u1, z0, z1, col),
    Zq: (g, z, u0, v0, u1, v1, col) => O.quadZ(g, Pd, z, u0, v0, u1, v1, col),
  };
}

// Un étage de capsule vu par l'ouverture : paroi du fond, paroi de tête, matelas, lit fait. (Le haut de la paroi du
// fond est caché par la dalle : les détails vont sur la paroi de tête, près du bord.)
function etageCapsule(g, O, T, zf, zm, zc, couv) {
  const ombre = O.nuance(COQUE_IN, -0.12);
  T.Pr(g, 0, 0, 2, 0.08, zf, zc, COQUE_IN, COQUE_IN, ombre);
  T.Pr(g, 0, 0.08, 0.08, 1, zf, zc, COQUE, COQUE, ombre);
  // tablette et réveil sur la paroi de tête
  T.Pr(g, 0.08, 0.66, 0.16, 0.92, zf + 13, zf + 14, O.nuance(COQUE, -0.2));
  T.Pr(g, 0.09, 0.72, 0.14, 0.8, zf + 14, zf + 17, '#3a3f4a');
  // matelas et lit fait
  T.Pr(g, 0.08, 0.08, 1.92, 0.97, zf, zm, MATELAS_C);
  O.litFait(T.Pr, g, zm, couv);
}

// Veilleuse sur la paroi de tête, près de l'ouverture, dessinée après le contour pour rester lumineuse.
function veilleuse(g, O, T, zc) {
  O.quadX(g, T.P, 0.08, 0.74, 0.9, zc - 13, zc - 9, '#ffe2a0');
  O.quadX(g, T.P, 0.08, 0.78, 0.86, zc - 12, zc - 10, '#fff6d8');
  const [x, y] = T.P(0.1, 0.82, zc - 11);
  lueur(g, x + 2, y + 2, 8, 'rgba(255,214,140,0.16)');
}

// Coins arrondis en haut de l'ouverture d'un étage (sous la dalle ou le toit, à la hauteur zc).
function coinsOuverture(g, O, T, zc) {
  O.poly(g, [T.P(0.08, 1, zc), T.P(0.24, 1, zc), T.P(0.08, 1, zc - 7)], COQUE);
  O.poly(g, [T.P(1.92, 1, zc), T.P(1.76, 1, zc), T.P(1.92, 1, zc - 7)], COQUE);
}

// Capsule en deux moitiés d'une case. La moitié a (tête) porte tout l'étage du bas : son tri est celui de sa case, si
// bien qu'un avatar qui passe devant la tête est dessiné après. Les dormeurs du bas se couchent ensuite, puis la
// moitié b (pied) dessine en `haut` la paroi du pied, la dalle et tout l'étage du haut (par-dessus les dormeurs du
// bas), et en `devant` le toit et l'échelle (par-dessus les dormeurs du haut). Rien n'est coupé : pas de couture.
function capsule(it, typeTheme, etat, O) {
  const v = it.variante || 0;
  const couvBas = O.COUVERTURES[v % O.COUVERTURES.length];
  const couvHaut = O.COUVERTURES[(v + 3) % O.COUVERTURES.length];
  const storeBas = STORES[v % STORES.length];
  const storeHaut = STORES[(v + 2) % STORES.length];
  const tranche = O.nuance(COQUE, -0.08);
  const htop = 92;
  if (it.part !== 'b') {
    return feuille(O, -0.05, -0.05, 2.05, 1.1, htop, (g, P) => {
      const T = outilsCapsule(O, P, 0);
      T.Pr(g, 0, 0, 2, 1, 0, CAP.sol, COQUE);
      etageCapsule(g, O, T, CAP.sol, CAP.bas, CAP.dalle0, couvBas);
    }, (g, P) => veilleuse(g, O, outilsCapsule(O, P, 0), CAP.dalle0));
  }
  // haut : paroi du pied (bas), dalle avec le store roulé, coins arrondis de l'ouverture, puis l'étage du haut
  const dessinHaut = (g, T) => {
    T.Pr(g, 1.92, 0, 2, 1, 0, CAP.dalle1, COQUE, COQUE, tranche);
    T.Pr(g, 0, 0, 2, 1, CAP.dalle0, CAP.dalle1, COQUE, COQUE, tranche);
    T.Y(g, 1, 0.08, 1.92, CAP.dalle0 + 0.5, CAP.dalle1 - 0.5, storeBas);
    T.Y(g, 1, 0.08, 1.92, CAP.dalle1 - 1.5, CAP.dalle1 - 0.5, O.nuance(storeBas, 0.3));
    T.Y(g, 1, 0.1, 0.28, CAP.dalle0 + 0.5, CAP.dalle1 - 0.5, '#f6f0e0');
    coinsOuverture(g, O, T, CAP.dalle0);
    etageCapsule(g, O, T, CAP.dalle1, CAP.haut, CAP.toit0, couvHaut);
  };
  // devant : paroi du pied (haut), toit et son store, coins, échelle
  const dessinDevant = (g, T) => {
    T.Pr(g, 1.92, 0, 2, 1, CAP.dalle1, CAP.toit1, COQUE, COQUE, tranche);
    T.Pr(g, 0, 0, 2, 1, CAP.toit0, CAP.toit1, O.nuance(COQUE, 0.04), COQUE, tranche);
    T.Y(g, 1, 0.08, 1.92, CAP.toit0 + 0.5, CAP.toit1 - 0.5, storeHaut);
    T.Y(g, 1, 0.08, 1.92, CAP.toit1 - 1.5, CAP.toit1 - 0.5, O.nuance(storeHaut, 0.3));
    T.Y(g, 1, 0.1, 0.28, CAP.toit0 + 0.5, CAP.toit1 - 0.5, '#f6f0e0');
    // grille d'aération sur le toit
    for (let i = 0; i < 4; i++) T.Zq(g, CAP.toit1, 0.7 + i * 0.16, 0.35, 0.78 + i * 0.16, 0.65, O.nuance(COQUE, -0.14));
    coinsOuverture(g, O, T, CAP.toit0);
    // échelle d'accès à l'étage, au pied de la capsule
    const metal = '#8d96a1';
    T.Pr(g, 1.66, 1.0, 1.7, 1.05, 0, CAP.haut + 2, metal);
    T.Pr(g, 1.86, 1.0, 1.9, 1.05, 0, CAP.haut + 2, metal);
    for (let z = 9; z < CAP.haut; z += 9) T.Pr(g, 1.7, 1.01, 1.86, 1.04, z, z + 1.5, O.nuance(metal, 0.15));
  };
  const moitieB = (fn, apres) => feuille(O, -1.05, -0.05, 1.05, 1.1, htop, (g, P) => fn(g, outilsCapsule(O, P, 1)), apres);
  const veilleuseHaut = (g, P) => veilleuse(g, O, outilsCapsule(O, P, 1), CAP.toit0);
  // Tout est dans `haut` et `devant`, dessinés par-dessus les dormeurs à leur place dans le tri : le sprite principal
  // reste vide.
  const s = { c: O.creerCanvas(1, 1), dx: 0, dy: 0 };
  s.haut = moitieB(dessinHaut, veilleuseHaut);
  s.devant = moitieB(dessinDevant);
  return s;
}

// Distributeur de boissons (face +y) : vitrine éclairée, boutons, trappe.
function distributeurJp(it, typeTheme, etat, O) {
  const bleu = (it.variante || 0) % 2 === 1;
  const corps = bleu ? '#2f6fc0' : '#c8323c';
  return O.spriteTuile(72, (g, P) => {
    O.prisme(g, P, 0.1, 0.14, 0.9, 0.84, 0, 66, corps);
    const Y = (u0, u1, z0, z1, col) => O.quadY(g, P, 0.84, u0, u1, z0, z1, col);
    Y(0.1, 0.9, 60, 66, '#f4f4f4');
    Y(0.16, 0.84, 61, 64, bleu ? '#2f6fc0' : '#c8323c');
    Y(0.15, 0.85, 30, 58, '#1a1d26');
    Y(0.18, 0.82, 32, 56, '#e8f4ff');
    // trois rangées de canettes, chacune avec ses boutons
    const cols = ['#e8452f', '#2a6fd0', '#3aa655', '#ffd23f', '#8a5a30', '#f4f4f4', '#ff8fb1'];
    const rnd = O.aleatoire(O.hacher('distrib' + (it.variante || 0)));
    for (let r = 0; r < 3; r++) {
      const z = 34 + r * 8;
      for (let i = 0; i < 5; i++) {
        const u = 0.22 + i * 0.12;
        Y(u, u + 0.07, z + 2, z + 6, cols[Math.floor(rnd() * cols.length)]);
        Y(u + 0.01, u + 0.05, z, z + 1, r === 0 && i === 2 ? '#ff4a4a' : '#5ad66a');
      }
    }
    Y(0.62, 0.78, 18, 26, '#2a2d36');
    Y(0.66, 0.72, 21, 24, '#c9a227');
    Y(0.18, 0.72, 5, 13, '#1a1d26');
    Y(0.2, 0.7, 6, 8, '#3a3f4a');
  }, true);
}

// Easter egg du distributeur : il s'emballe (boutons qui clignotent, il tremble, « JACKPOT ! ») et crache des
// canettes qui roulent par terre devant lui.
function animeDistributeur(g, it, tx, ty, t, O, effet) {
  if (!effet) return;
  const P = O.projeteur(tx + 32, ty);
  const d = effet.depuis;
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 5; i++) {
      const u = 0.22 + i * 0.12;
      const on = (Math.floor(d / 110) + r + i) % 2 === 0;
      O.quadY(g, P, 0.84, u + 0.01, u + 0.05, 34 + r * 8, 35 + r * 8, on ? '#ffffff' : '#ff4a4a');
    }
  }
  if (d < 1000) {
    // il tremble
    const v = Math.round(Math.sin(d / 25) * 1.5);
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 3; k++) {
      const [x1, y1] = P(0.1, 0.84, 20 + k * 16);
      const [x2, y2] = P(0.9, 0.84, 20 + k * 16);
      g.fillRect(Math.round(x1) - 8 - v, Math.round(y1), 4, 1);
      g.fillRect(Math.round(x2) + 5 + v, Math.round(y2), 4, 1);
    }
  }
  // les canettes : elles sortent de la trappe, retombent devant et roulent un peu
  const cols = ['#e8452f', '#2a6fd0', '#3aa655', '#ffd23f', '#8a5a30', '#ff8fb1'];
  for (let k = 0; k < 11; k++) {
    const e = (d - 900 - k * 330) / 650;
    if (e < 0) continue;
    const rnd = O.aleatoire(O.hacher('canette' + k + ',' + it.x + ',' + it.y));
    const u1 = 0.2 + rnd() * 0.6;
    const v1 = 1.15 + rnd() * 0.55;
    const m = Math.min(1, e);
    const roule = Math.max(0, Math.min(1, e - 1)) * (0.15 + rnd() * 0.2);
    const u = 0.45 + (u1 - 0.45) * m;
    const v = 0.86 + (v1 - 0.86) * m + roule;
    const z = 9 * (1 - m) + Math.sin(m * Math.PI) * 14;
    const [x, y] = P(u, v, z);
    const X = Math.round(x);
    const Y = Math.round(y);
    const col = cols[k % cols.length];
    // couchée : un cylindre cerclé de noir, bande claire, couvercle d'alu ; le reflet tourne quand elle roule
    g.fillStyle = '#15151f';
    g.fillRect(X - 6, Y - 6, 13, 7);
    g.fillStyle = col;
    g.fillRect(X - 5, Y - 5, 11, 5);
    g.fillStyle = O.nuance(col, 0.35);
    g.fillRect(X - 2, Y - 5, 4, 5);
    g.fillStyle = '#ffffff';
    g.fillRect(X - 5 + (Math.floor((e + k) * 8) % 9), Y - 5, 1, 1);
    g.fillStyle = '#c0c8d0';
    g.fillRect(X + 5, Y - 5, 1, 5);
  }
  if (d > 900 && d < 5600) {
    const [x, y] = P(0.5, 0.5, 72);
    bulle(g, O, O.enseigne('JACKPOT !', 'JACKPOT!'), x + 4, y - 4, '#c8323c', d < 1050 ? 1 : 2, true);
  }
}

// Bambous en pot, minces : ils ne cachent pas l'enseigne du hall.
function bambouPot(it, typeTheme, etat, O) {
  const v = it.variante || 0;
  const rnd = O.aleatoire(O.hacher('bambou' + v));
  return feuille(O, -0.2, -0.2, 1.2, 1.2, 84, (g, P) => {
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.7, 0, 11, '#3a3a40');
    O.prisme(g, P, 0.33, 0.33, 0.67, 0.67, 11, 12, '#4a3a2a');
    const tiges = [[0.4, 0.46, 72], [0.52, 0.56, 64], [0.58, 0.42, 78]];
    for (const [u, w, h] of tiges) {
      O.prisme(g, P, u, w, u + 0.05, w + 0.05, 12, h, '#6aa84a');
      for (let z = 22; z < h; z += 11) O.prisme(g, P, u - 0.005, w - 0.005, u + 0.055, w + 0.055, z, z + 1, '#4a8a34');
      // feuilles en pointes
      for (let i = 0; i < 3; i++) {
        const [x, y] = P(u + 0.025, w + 0.025, h - 4 - i * 9 - rnd() * 3);
        const d = (i + Math.floor(rnd() * 2)) % 2 ? 1 : -1;
        g.fillStyle = '#4f9a3c';
        for (let j = 0; j < 6; j++) g.fillRect(Math.round(x + d * j), Math.round(y + j / 2 - 1), 2, 1);
      }
    }
  });
}

// Bonsaï sur un petit socle de bois.
function bonsaiJp(it, typeTheme, etat, O) {
  return O.spriteTuile(40, (g, P) => {
    O.prisme(g, P, 0.2, 0.25, 0.8, 0.75, 0, 9, '#5a3f2a');
    O.prisme(g, P, 0.3, 0.34, 0.7, 0.66, 9, 14, '#2f5a8a');
    const [x, y] = P(0.5, 0.5, 14);
    trait(g, [x, y], [x - 3, y - 7], '#5a3a24', 2);
    trait(g, [x - 3, y - 7], [x + 2, y - 13], '#5a3a24', 2);
    trait(g, [x + 1, y - 11], [x + 7, y - 15], '#5a3a24');
    ovale(g, x - 7, y - 11, 5, 3, '#3f7a3a');
    ovale(g, x + 7, y - 17, 6, 3, '#3f7a3a');
    ovale(g, x + 1, y - 21, 6, 3, '#4a8a42');
    ovale(g, x - 6, y - 12, 2, 1, '#5aa24f');
    ovale(g, x + 6, y - 18, 3, 1, '#5aa24f');
  });
}

// Casiers à chaussures contre le mur gauche (face +x) : portes à étiquette de bois.
function casiersGeta(it, typeTheme, etat, O) {
  const bois = '#7a5a3c';
  return O.spriteTuile(46, (g, P) => {
    O.prisme(g, P, 0.04, 0.04, 0.6, 0.96, 0, 42, bois);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const v0 = 0.08 + c * 0.29;
        const z0 = 3 + r * 9.5;
        O.quadX(g, P, 0.6, v0, v0 + 0.26, z0, z0 + 8, O.nuance(bois, 0.12));
        O.quadX(g, P, 0.6, v0 + 0.09, v0 + 0.17, z0 + 4, z0 + 7, '#d8c49a');
        O.quadX(g, P, 0.6, v0 + 0.12, v0 + 0.14, z0 + 5, z0 + 6, '#3a2a1a');
      }
    }
    // une paire de chaussures posée devant
    if ((it.variante || 0) === 1) {
      O.prisme(g, P, 0.68, 0.3, 0.9, 0.4, 0, 3, '#2a2a33');
      O.prisme(g, P, 0.68, 0.46, 0.9, 0.56, 0, 3, '#2a2a33');
    }
  });
}

// Banc bas avec un coussin.
function bancTatami(it, typeTheme, etat, O) {
  return O.spriteTuile(24, (g, P) => {
    for (const [u, v] of [[0.14, 0.2], [0.8, 0.2], [0.14, 0.74], [0.8, 0.74]]) O.prisme(g, P, u, v, u + 0.06, v + 0.06, 0, 9, '#4a3424');
    O.prisme(g, P, 0.1, 0.16, 0.9, 0.84, 9, 12, '#6a4c34');
    O.prisme(g, P, 0.22, 0.26, 0.78, 0.74, 12, 15, '#8a3340');
  });
}

// Lanterne de papier sur pieds (andon), allumée.
function andon(it, typeTheme, etat, O) {
  const s = O.spriteTuile(42, (g, P) => {
    for (const [u, v] of [[0.28, 0.28], [0.66, 0.28], [0.28, 0.66], [0.66, 0.66]]) O.prisme(g, P, u, v, u + 0.06, v + 0.06, 0, 34, '#3a2a1e');
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.7, 7, 31, '#f6e2b0', '#f8e8bf', '#e8cf95');
    for (const z of [7, 15, 23, 30]) O.prisme(g, P, 0.29, 0.29, 0.71, 0.71, z, z + 1, '#3a2a1e');
    O.prisme(g, P, 0.26, 0.26, 0.74, 0.74, 34, 36, '#3a2a1e');
  });
  const g = s.c.getContext('2d');
  const P = O.projeteur(33, 43);
  const [x, y] = P(0.5, 0.5, 20);
  lueur(g, x, y, 14, 'rgba(255,214,140,0.16)');
  return s;
}

// Fontaine en bambou (shishi-odoshi) : bassin de pierre, bec ; le bambou basculant est animé (ANIMES).
function shishiOdoshi(it, typeTheme, etat, O) {
  return O.spriteTuile(44, (g, P) => {
    O.prisme(g, P, 0.42, 0.18, 0.86, 0.66, 0, 9, '#8a8a86');
    O.quadZ(g, P, 9, 0.47, 0.23, 0.81, 0.61, '#3a7ab0');
    O.quadZ(g, P, 9, 0.5, 0.3, 0.62, 0.4, '#8fd0f0');
    // poteau et bec qui verse dans le bambou basculant
    O.prisme(g, P, 0.14, 0.4, 0.22, 0.48, 0, 34, '#7aa84a');
    O.prisme(g, P, 0.22, 0.42, 0.36, 0.46, 30, 33, '#7aa84a');
    // support du bambou basculant
    O.prisme(g, P, 0.3, 0.68, 0.34, 0.72, 0, 16, '#5a4a32');
    O.prisme(g, P, 0.3, 0.2, 0.34, 0.24, 0, 16, '#5a4a32');
    for (const [u, v] of [[0.2, 0.8], [0.6, 0.82], [0.85, 0.75]]) {
      const [x, y] = P(u, v, 0);
      ovale(g, x, y - 1, 2, 1, '#9a9a96');
    }
  });
}
function animeShishi(g, it, tx, ty, t, O, effet) {
  const P = O.projeteur(tx + 32, ty);
  // le bambou se remplit (lent), bascule (vite) puis revient
  const c = (t % 5200) / 5200;
  let a = c < 0.8 ? -0.25 + c * 0.35 : c < 0.86 ? 0.55 : 0.55 - ((c - 0.86) / 0.14) * 0.8;
  // easter egg : un « TOC ! » de toute beauté, le bambou rebondit
  if (effet && effet.phase === 1) a = 0.7 - Math.abs(Math.sin(effet.depuis / 70)) * 0.5 * (1 - effet.depuis / 700);
  const [px, py] = P(0.32, 0.46, 16);
  const L = 15;
  const dx = Math.cos(a) * L;
  const dy = Math.sin(a) * L * 0.5;
  trait(g, [px - dx * 0.6, py + dy * 0.6 - 1], [px + dx * 0.4, py - dy * 0.4 - 1], O.CONTOUR, 4);
  trait(g, [px - dx * 0.6, py + dy * 0.6], [px + dx * 0.4, py - dy * 0.4], '#8ac05a', 2);
  if (c >= 0.8 && c < 0.9) {
    g.fillStyle = 'rgba(160,215,255,0.8)';
    g.fillRect(Math.round(px + dx * 0.45), Math.round(py - dy * 0.4 + 1), 1, 3);
  }
  // filet d'eau du bec
  const [bx, by] = P(0.36, 0.44, 31);
  g.fillStyle = 'rgba(160,215,255,0.7)';
  g.fillRect(Math.round(bx), Math.round(by), 1, 4 + Math.round(Math.sin(t / 90)));
  if (effet) grenouilleShishi(g, P, O, effet);
}

// … et le bruit réveille une grenouille : elle bondit hors du bassin, coasse devant la fontaine, puis replonge.
function grenouilleShishi(g, P, O, effet) {
  const d = effet.depuis;
  // (les bulles partent vers la gauche : le bambou en pot voisin, plus en avant, les cacherait)
  if (d < 1200) {
    const [x, y] = P(0.3, 0.45, 34);
    bulle(g, O, O.enseigne('TOC !', 'CLACK!'), x - 2, y - 2, '#5a4a32', d < 120 ? 1 : 2, true);
  }
  // bassin (0,64 ; 0,42 ; 9) → devant la fontaine (0,7 ; 1,25 ; 0) et retour
  const aller = Math.min(1, Math.max(0, (d - 700) / 600));
  const retour = Math.min(1, Math.max(0, (d - 3900) / 600));
  if (d < 700 || retour >= 1) {
    // ronds dans l'eau au départ et au retour
    if (d >= 4500 || (d >= 500 && d < 900)) {
      const e = d >= 4500 ? (d - 4500) / 700 : (d - 500) / 400;
      const [x, y] = P(0.64, 0.42, 9);
      g.fillStyle = 'rgba(220,240,255,0.85)';
      const r = Math.round(3 + e * 7);
      g.fillRect(Math.round(x) - r, Math.round(y), r * 2 + 1, 1);
      g.fillRect(Math.round(x) - r + 2, Math.round(y) - 2, 2, 1);
      g.fillRect(Math.round(x) + r - 3, Math.round(y) - 2, 2, 1);
      if (d >= 4500 && d < 5000) bulle(g, O, O.enseigne('PLOUF !', 'SPLASH!'), x - 6, y - 6, '#2f6fc0', 1, true);
    }
    return;
  }
  const m = retour > 0 ? 1 - retour : aller;
  const enVol = (aller > 0 && aller < 1) || (retour > 0 && retour < 1);
  const u = 0.64 + (0.7 - 0.64) * m;
  const v = 0.42 + (1.25 - 0.42) * m;
  const z = 9 * (1 - m) + (enVol ? Math.sin(m * Math.PI) * 22 : 0);
  const [x, y] = P(u, v, z);
  grenouille(g, x, y, enVol);
  if (!enVol && d > 1500 && d < 3800 && Math.floor(d / 500) % 2 === 0) bulle(g, O, O.enseigne('CROA !', 'RIBBIT!'), x - 4, y - 10, '#3f7a2a', 1, true);
}
function grenouille(g, x, y, saut) {
  const X = Math.round(x);
  const Y = Math.round(y);
  g.fillStyle = '#15151f';
  g.fillRect(X - 6, Y - 7, 13, 8);
  g.fillRect(X - 5, Y - 10, 4, 4);
  g.fillRect(X + 2, Y - 10, 4, 4);
  if (saut) {
    g.fillRect(X - 7, Y, 3, 4);
    g.fillRect(X + 5, Y, 3, 4);
  }
  g.fillStyle = '#5aa83a';
  g.fillRect(X - 5, Y - 6, 11, 6);
  g.fillRect(X - 4, Y - 9, 2, 3);
  g.fillRect(X + 3, Y - 9, 2, 3);
  if (saut) {
    g.fillRect(X - 6, Y + 1, 1, 2);
    g.fillRect(X + 6, Y + 1, 1, 2);
  }
  g.fillStyle = '#c8e8a0';
  g.fillRect(X - 2, Y - 3, 5, 3);
  g.fillStyle = '#ffffff';
  g.fillRect(X - 4, Y - 9, 1, 1);
  g.fillRect(X + 3, Y - 9, 1, 1);
  g.fillStyle = '#15151f';
  g.fillRect(X - 3, Y - 8, 1, 1);
  g.fillRect(X + 4, Y - 8, 1, 1);
  g.fillRect(X - 2, Y - 4, 5, 1);
}

// Rocher du jardin sec, entouré de cercles de graviers ratissés.
function rocherZen(it, typeTheme, etat, O) {
  return O.spriteTuile(32, (g, P) => {
    const [x, y] = P(0.5, 0.5, 0);
    ovale(g, x, y, 26, 13, '#98927f');
    ovale(g, x, y, 22, 11, '#b2ac9a');
    ovale(g, x, y, 18, 9, '#98927f');
    ovale(g, x, y, 14, 7, '#b2ac9a');
    O.poly(g, [[x - 12, y + 3], [x - 8, y - 14], [x + 1, y - 23], [x + 11, y - 12], [x + 13, y + 3]], '#62625e');
    O.poly(g, [[x - 8, y - 14], [x + 1, y - 23], [x, y - 8], [x - 11, y + 1]], '#7e7e77');
    O.poly(g, [[x + 1, y - 23], [x + 11, y - 12], [x + 4, y - 9]], '#55554f');
    ovale(g, x - 6, y, 4, 1, '#4f7a3a');
    ovale(g, x + 9, y + 1, 2, 1, '#4f7a3a');
  });
}

// Lanterne de pierre (tōrō) du jardin, allumée.
function toro(it, typeTheme, etat, O) {
  const pierre = '#8a8a84';
  const s = O.spriteTuile(52, (g, P) => {
    O.prisme(g, P, 0.28, 0.28, 0.72, 0.72, 0, 5, O.nuance(pierre, -0.08));
    O.prisme(g, P, 0.42, 0.42, 0.58, 0.58, 5, 20, pierre);
    O.prisme(g, P, 0.3, 0.3, 0.7, 0.7, 20, 24, pierre);
    O.prisme(g, P, 0.36, 0.36, 0.64, 0.64, 24, 34, pierre);
    O.quadY(g, P, 0.64, 0.43, 0.57, 26, 32, '#ffd27a');
    O.quadX(g, P, 0.64, 0.43, 0.57, 26, 32, '#f2b84a');
    O.prisme(g, P, 0.22, 0.22, 0.78, 0.78, 34, 37, O.nuance(pierre, 0.06));
    O.poly(g, [P(0.24, 0.24, 37), P(0.76, 0.24, 37), P(0.76, 0.76, 37), P(0.24, 0.76, 37), P(0.5, 0.5, 45)], O.nuance(pierre, 0.1));
    O.poly(g, [P(0.76, 0.24, 37), P(0.76, 0.76, 37), P(0.5, 0.5, 45)], O.nuance(pierre, -0.12));
    O.poly(g, [P(0.24, 0.76, 37), P(0.76, 0.76, 37), P(0.5, 0.5, 45)], O.nuance(pierre, -0.02));
    O.prisme(g, P, 0.47, 0.47, 0.53, 0.53, 45, 49, pierre);
  });
  const P = O.projeteur(33, 53);
  const [x, y] = P(0.64, 0.64, 29);
  lueur(s.c.getContext('2d'), x, y, 10, 'rgba(255,214,140,0.2)');
  return s;
}

// Paire de pantoufles posée au sol (passage).
function pantoufles(it, typeTheme, etat, O) {
  const cols = ['#e8dcc0', '#8a3340', '#2f4a7a', '#3f6a4a'];
  const col = cols[(it.variante || 0) % cols.length];
  return O.spriteTuile(6, (g, P) => {
    for (const v of [0.34, 0.54]) {
      O.prisme(g, P, 0.3, v, 0.66, v + 0.14, 0, 1.5, col);
      O.prisme(g, P, 0.3, v, 0.44, v + 0.14, 1.5, 3, O.nuance(col, -0.1));
    }
  });
}

// ---------- capsules : sols ----------
// Tatamis carrés posés en damier : la trame change de sens d'une case à l'autre, liseré sombre sur deux bords.
function tatami(g, col, { parite, variante }, O) {
  const sens = parite === 0;
  const trame = O.nuance(col, -0.07);
  for (let i = 1; i < 12; i += 2) {
    const a = i / 12;
    if (sens) quadTuile(g, O, 0.08, a, 0.92, a + 0.03, trame);
    else quadTuile(g, O, a, 0.08, a + 0.03, 0.92, trame);
  }
  const liseré = '#2c3a2a';
  if (sens) {
    quadTuile(g, O, 0, 0, 0.08, 1, liseré);
    quadTuile(g, O, 0.92, 0, 1, 1, liseré);
  } else {
    quadTuile(g, O, 0, 0, 1, 0.08, liseré);
    quadTuile(g, O, 0, 0.92, 1, 1, liseré);
  }
  if (variante === 1) quadTuile(g, O, 0.3, 0.3, 0.7, 0.7, O.nuance(col, 0.04));
}
// Plancher de bois sombre, lames selon x.
function parquetJp(g, col, { variante }, O) {
  for (let i = 0; i < 4; i++) {
    if ((i + variante) % 2) quadTuile(g, O, 0, i / 4, 1, (i + 1) / 4, O.nuance(col, 0.06));
    quadTuile(g, O, 0, i / 4, 1, i / 4 + 0.025, O.nuance(col, -0.25));
  }
  quadTuile(g, O, ((variante * 3) % 4) / 4 + 0.1, 0, ((variante * 3) % 4) / 4 + 0.12, 0.25, O.nuance(col, -0.25));
}
// Graviers ratissés du jardin sec.
function gravierRatisse(g, col, { rnd }, O) {
  for (let i = 0; i < 6; i++) quadTuile(g, O, 0, i / 6 + 0.04, 1, i / 6 + 0.08, O.nuance(col, 0.1));
  for (let i = 0; i < 6; i++) quadTuile(g, O, 0, i / 6 + 0.1, 1, i / 6 + 0.12, O.nuance(col, -0.1));
  grains(g, rnd, 20, [O.nuance(col, -0.15), O.nuance(col, 0.12)]);
}

// ---------- capsules : murs ----------
// Lambris de bois sombre en bas, rail, panneaux de papier (shoji) quadrillés au-dessus.
function boisJp(g, longueur, cote, rnd, O) {
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  R(0, 0, longueur, 84, '#3a2c22');
  R(0, 6, longueur, 1, '#5a4432');
  for (let x = 0; x < longueur; x += 32) {
    R(x + 3, 9, 26, 43, '#d9c9a0');
    for (let i = 1; i < 4; i++) R(x + 3 + i * 6.5, 9, 1, 43, '#5a4432');
    for (let j = 1; j < 5; j++) R(x + 3, 9 + j * 8.6, 26, 1, '#5a4432');
    R(x + 3, 9, 26, 1, '#efe2bf');
  }
  R(0, 52, longueur, 4, '#6a4c34');
  R(0, 52, longueur, 1, '#8a6a48');
  for (let x = 0; x < longueur; x += 16) {
    R(x, 56, 16, 28, (x / 16) % 2 ? '#3f3026' : '#45352a');
    R(x, 56, 1, 28, '#2a1f18');
  }
}

// Décor des murs : enseigne du QG et lanternes rouges à droite ; plaque, estampe de la vague et rouleau à gauche.
const H_ = 12;
function chochin(g, x, y, O) {
  const R = (a, b, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(a, b, w, h);
  };
  R(x, 0, 1, y - 8, '#1a1410');
  for (let r = 0; r <= 16; r++) {
    const w = Math.round(Math.sqrt(1 - ((r - 8) / 9) ** 2) * 8);
    R(x - w - 1, y - 8 + r, w * 2 + 3, 1, O.CONTOUR);
  }
  for (let r = 1; r < 16; r++) {
    const w = Math.round(Math.sqrt(1 - ((r - 8) / 9) ** 2) * 8);
    R(x - w, y - 8 + r, w * 2 + 1, 1, r % 4 === 0 ? '#9a2028' : r < 6 ? '#e8504a' : '#c8323c');
  }
  R(x - 4, y - 9, 9, 2, '#1a1410');
  R(x - 4, y + 8, 9, 2, '#1a1410');
  R(x - 2, y - 2, 5, 4, '#ffd27a');
}
function decorsCapsules(g, cote, longueur, etage, O) {
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  if (cote === 'droite') {
    O.enseigneQG(g);
    chochin(g, 88, 20, O);
    chochin(g, 500, 14, O);
    return;
  }
  const c = (gy) => (H_ - gy) * 32;
  O.plaqueEtage(g, etage);
  // estampe : la grande vague et le mont Fuji
  const x0 = Math.round(c(7.9));
  const x1 = Math.round(c(6.1));
  O.cadre(g, x0, 12, x1 - x0, 26, '#2a1f18', '#ece2c6');
  const w = x1 - x0;
  R(x0 + 2, 30, w - 4, 6, '#2f5a8a');
  O.poly(g, [[x0 + w * 0.62, 31], [x0 + w * 0.72, 22], [x0 + w * 0.82, 31]], '#5a7a9a');
  O.poly(g, [[x0 + w * 0.69, 24], [x0 + w * 0.72, 22], [x0 + w * 0.75, 24]], '#ffffff');
  O.poly(g, [[x0 + 2, 36], [x0 + 4, 24], [x0 + 12, 16], [x0 + 24, 15], [x0 + 30, 19], [x0 + 22, 19], [x0 + 18, 24], [x0 + 22, 36]], '#1f3a6a');
  O.poly(g, [[x0 + 8, 34], [x0 + 9, 26], [x0 + 15, 20], [x0 + 22, 19], [x0 + 16, 24], [x0 + 14, 34]], '#4a7ab0');
  for (const [dx, dy] of [[24, 15], [28, 17], [31, 19], [26, 20], [21, 17]]) R(x0 + dx, dy, 2, 1, '#ffffff');
  R(x0 + 4, 35, w - 8, 1, '#ffffff');
  // rouleau suspendu : un cercle au pinceau (ensō)
  const rx = Math.round(c(10.5));
  R(rx - 1, 4, 2, 4, '#1a1410');
  R(rx - 9, 8, 18, 2, '#3a2a1e');
  R(rx - 8, 10, 16, 36, '#6a4c34');
  R(rx - 6, 12, 12, 32, '#efe6cf');
  for (let a = 0; a < 5.6; a += 0.08) {
    const ep = a < 1 ? 2 : 1;
    R(Math.round(rx + Math.cos(a - 1.2) * 4), Math.round(26 + Math.sin(a - 1.2) * 5), ep, ep, '#1a1410');
  }
  R(rx - 9, 46, 18, 2, '#3a2a1e');
}

// ======================================================================================================
// Camping
// ======================================================================================================
const TOILES = ['#e8742a', '#3f8a4a', '#2f6fc0', '#c8323c', '#e8b830', '#7a4ab0'];
const FAITE = 50;

// Repère d'une moitié de tente : u le long des couchages (0 = le fond, côté tête ; 2 = la porte), w en travers (0 à 2,
// faîte en w = 1) ; k = 0 pour la moitié « a » (sous le pan de toile), 1 pour la moitié « b » (pan roulé).
function repereTente(O, P, axe, k) {
  const pt = axe === 'x' ? (u, w, z) => P(u, w - k, z) : (u, w, z) => P(w - k, u, z);
  const box = (g, u0, w0, u1, w1, z0, z1, col, cg, cd) => {
    const a = Math.max(w0, k);
    const b = Math.min(w1, k + 1);
    if (b <= a) return;
    if (axe === 'x') O.prisme(g, P, u0, a - k, u1, b - k, z0, z1, col, cg, cd);
    else O.prisme(g, P, a - k, u0, b - k, u1, z0, z1, col, cg, cd);
  };
  // le lit de cette moitié : v de 0 à 1 en travers (comme litFait)
  const lit = (g, u0, v0, u1, v1, z0, z1, col, cg, cd) => box(g, u0, k + v0, u1, k + v1, z0, z1, col, cg, cd);
  return { pt, box, lit };
}

function tente(it, typeTheme, etat, O) {
  const axe = it.axe || 'y';
  const k = it.part === 'b' ? 1 : 0;
  const v = it.variante || 0;
  const toile = TOILES[v % TOILES.length];
  const dedans = O.nuance(toile, -0.28);
  const couv = O.COUVERTURES[(v * 2 + k) % O.COUVERTURES.length];
  const mousse = k ? '#3f5a7a' : '#5a7a3f';
  // la feuille couvre la case et un peu autour (cordes, piquets)
  const [x0, y0, x1, y1] = axe === 'x' ? [-0.05, -0.05, 2.05, 1.05] : [-0.05, -0.05, 1.05, 2.05];
  const dessin = (fn) => feuille(O, x0, y0, x1, y1, FAITE + 8, (g, P) => fn(g, repereTente(O, P, axe, k)));
  const corps = (g, T) => {
    const { pt, box } = T;
    // tapis de sol
    box(g, 0.02, 0.04, 1.98, 1.96, 0, 1, '#4a4a3a');
    // fond de la tente (pignon arrière), vu de l'intérieur
    if (k === 0) O.poly(g, [pt(0.03, 0.04, 0), pt(0.03, 1, FAITE), pt(0.03, 1, 0)], O.nuance(toile, -0.15));
    else O.poly(g, [pt(0.03, 1, FAITE), pt(0.03, 1.96, 0), pt(0.03, 1, 0)], O.nuance(toile, -0.15));
    if (k === 0) {
      // pan de toile côté a, vu de l'intérieur, avec ses coutures
      O.poly(g, [pt(0.03, 0.04, 0), pt(1.97, 0.04, 0), pt(1.97, 1, FAITE), pt(0.03, 1, FAITE)], dedans);
      for (const u of [0.66, 1.32]) trait(g, pt(u, 0.06, 1), pt(u, 0.98, FAITE - 1), O.nuance(dedans, -0.12));
    } else {
      // faîte, pan roulé et attaché, hauban du fond
      // (le rouleau reste au-dessus de la ligne de vue de la tête du dormeur a : z > 42 en w = 1,15)
      box(g, 0.0, 0.97, 2.0, 1.03, FAITE - 2, FAITE + 1, '#5a4a3a');
      box(g, 0.02, 1.02, 1.98, 1.15, FAITE - 6, FAITE + 2, O.nuance(toile, 0.1));
      box(g, 0.02, 1.02, 1.98, 1.15, FAITE - 6, FAITE - 5, O.nuance(toile, -0.25));
      for (const u of [0.4, 1.0, 1.6]) {
        trait(g, pt(u, 1.15, FAITE - 6), pt(u, 1.15, FAITE + 2), '#3a2a1e');
        trait(g, pt(u, 1.02, FAITE + 2), pt(u, 1.15, FAITE + 2), '#3a2a1e');
      }
      trait(g, pt(0.04, 1.15, FAITE - 3), pt(0.04, 1.95, 1), '#d8d0c0');
      // lanterne suspendue au faîte, côté porte (loin des têtes)
      trait(g, pt(1.5, 1.0, FAITE - 2), pt(1.5, 1.0, FAITE - 9), '#2a2a2a');
      box(g, 1.45, 0.95, 1.55, 1.05, FAITE - 15, FAITE - 9, '#ffd27a', '#ffe9a0', '#f2b84a');
      box(g, 1.44, 0.94, 1.56, 1.06, FAITE - 9, FAITE - 8, '#2a2a2a');
    }
    // matelas de mousse et duvet
    T.lit(g, 0.06, 0.1, 1.92, 0.9, 1, Z.tente, mousse);
    O.litFait(T.lit, g, Z.tente, couv);
  };
  // la porte (moitié a : pan avant fermé et mât ; moitié b : l'autre moitié du mât et un piquet)
  const porte = (g, T) => {
    const { pt, box } = T;
    if (k === 0) {
      O.poly(g, [pt(1.97, 0.04, 0), pt(1.97, 1, FAITE), pt(1.97, 1, 0)], toile);
      O.poly(g, [pt(1.97, 0.04, 0), pt(1.97, 0.5, FAITE / 2), pt(1.97, 0.5, 0)], O.nuance(toile, 0.08));
      trait(g, pt(1.97, 0.97, 2), pt(1.97, 0.97, FAITE - 4), O.nuance(toile, -0.3));
      box(g, 1.95, 0.96, 2.0, 1.0, 0, FAITE + 2, '#5a4a3a');
    } else {
      box(g, 1.95, 1.0, 2.0, 1.04, 0, FAITE + 2, '#5a4a3a');
      box(g, 1.94, 1.92, 1.98, 1.96, 0, 3, '#9aa3ad');
    }
  };
  // la porte passe devant le dormeur (`haut`)
  const s = dessin(corps);
  s.haut = dessin(porte);
  return s;
}

// Sac de couchage sur son matelas de mousse, capuche autour de l'oreiller.
function sacCouchage(it, typeTheme, etat, O) {
  const axe = it.axe || 'y';
  const v = it.variante || 0;
  const col = O.COUVERTURES[v % O.COUVERTURES.length];
  return O.spriteBloc(axe === 'x' ? 2 : 1, axe === 'x' ? 1 : 2, 14, (g, P) => {
    const Pr = axeLit(O, P, axe);
    Pr(g, 0.04, 0.1, 1.96, 0.9, 0, Z.sac, v % 2 ? '#3a4a6a' : '#5a4a3a');
    Pr(g, 0.1, 0.16, 0.5, 0.84, Z.sac, Z.sac + 2, O.nuance(col, -0.2));
    Pr(g, 0.16, 0.3, 0.42, 0.7, Z.sac, Z.sac + 3, '#ece6d8');
    Pr(g, 0.5, 0.14, 1.88, 0.86, Z.sac, Z.sac + 4, col);
    Pr(g, 1.88, 0.24, 1.95, 0.76, Z.sac, Z.sac + 3, col);
    Pr(g, 0.56, 0.76, 1.8, 0.8, Z.sac + 4, Z.sac + 4.4, O.nuance(col, 0.35));
  });
}

// Hamac tendu entre deux sapins (les sapins sont des meubles voisins, troncs à u = -0,5 et u = 2,5). Le fond plat
// porte le dormeur à z = Z.hamac ; les bords de toile se relèvent vers les barres d'écartement et pendent en ventre
// dessous ; les deux bouts remontent jusqu'aux barres. Le bord avant et le bout du pied (dans `haut`) bordent le
// dormeur.
function hamac(it, typeTheme, etat, O) {
  const axe = it.axe || 'y';
  const v = it.variante || 0;
  const tissus = [['#e8742a', '#f4d35e'], ['#2f6fc0', '#9fd3ff'], ['#c8323c', '#f1e2c2'], ['#3f8a4a', '#e8e0b0']];
  const [c1, c2] = tissus[v % tissus.length];
  const couv = O.COUVERTURES[(v + 5) % O.COUVERTURES.length];
  const zb = Z.hamac;
  const zBarre = zb + 12;
  const zNoeud = 36;
  const q = (u) => (u - 1) / 0.96;
  const haut = (u) => zb + 3 + 9 * q(u) ** 2;
  const bas = (u) => zb - 3 - 7 * (1 - q(u) ** 2);
  const [x0, y0, x1, y1] = axe === 'x' ? [-0.5, 0, 2.5, 1] : [0, -0.5, 1, 2.5];
  // un bord de toile (v constant), en bandes rayées
  const bord = (g, pt, w) => {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = 0.04 + (1.92 * i) / n;
      const b = 0.04 + (1.92 * (i + 1)) / n;
      O.poly(g, [pt(a, w, haut(a)), pt(b, w, haut(b)), pt(b, w, bas(b)), pt(a, w, bas(a))], i % 2 ? c2 : c1);
    }
  };
  const fond = (g, Pr, pt) => {
    O.poly(g, [pt(0.3, 0.25, 0), pt(1.7, 0.25, 0), pt(1.7, 0.75, 0), pt(0.3, 0.75, 0)], 'rgba(0,0,0,0.22)');
    // cordes de la tête jusqu'au tronc, barre d'écartement
    for (const w of [0.04, 0.5, 0.96]) trait(g, pt(0.04, w, zBarre), pt(-0.42, 0.5, zNoeud), '#d8d0b8');
    bord(g, pt, 0.06);
    O.poly(g, [pt(0.07, 0.06, zBarre), pt(0.07, 0.94, zBarre), pt(0.07, 0.94, zb - 3), pt(0.07, 0.06, zb - 3)], O.nuance(c2, -0.1));
    Pr(g, 0.12, 0.08, 1.88, 0.92, zb - 2, zb, c1);
    for (let i = 1; i < 8; i += 2) Pr(g, 0.12 + i * 0.22, 0.08, 0.34 + i * 0.22, 0.92, zb - 1.9, zb + 0.1, c2);
    O.litFait(Pr, g, zb, couv);
    Pr(g, 0.02, 0.02, 0.07, 0.98, zBarre - 1, zBarre + 1, '#7a5a3a');
  };
  const devant = (g, Pr, pt) => {
    bord(g, pt, 0.94);
    O.poly(g, [pt(1.93, 0.06, zBarre), pt(1.93, 0.94, zBarre), pt(1.93, 0.94, zb - 3), pt(1.93, 0.06, zb - 3)], c1);
    for (const w of [0.3, 0.62]) trait(g, pt(1.93, w, zBarre - 1), pt(1.93, w + 0.08, zb - 2), O.nuance(c1, -0.2));
    Pr(g, 1.93, 0.02, 1.98, 0.98, zBarre - 1, zBarre + 1, '#7a5a3a');
    for (const w of [0.04, 0.5, 0.96]) trait(g, pt(1.96, w, zBarre), pt(2.42, 0.5, zNoeud), '#d8d0b8');
  };
  const dessin = (...fns) => feuille(O, x0, y0, x1, y1, 50, (g, P) => fns.forEach((fn) => fn(g, axeLit(O, P, axe), ptLit(P, axe))));
  // le bord avant borde le dormeur (`haut`)
  const s = dessin(fond);
  s.haut = dessin(devant);
  return s;
}

// Sapin : étages de branches en cônes au bord dentelé. `petit` : un jeune sapin ; `tronc` : branches hautes (on noue
// les hamacs au tronc, à 36 pixels, sous les branches).
function cone(g, P, z0, z1, r, clair, sombre, O) {
  const [cx, cy] = P(0.5, 0.5, z0);
  const [ax, ay] = P(0.5, 0.5, z1);
  const hw = r * 45;
  const hh = r * 22.6;
  const arc = (a0, a1) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      const f = i % 2 ? 0.84 : 1;
      pts.push([cx + Math.cos(a) * hw * f, cy + Math.sin(a) * hh * f + (i % 2 ? 0 : 2)]);
    }
    return pts;
  };
  O.poly(g, [[ax, ay], ...arc(Math.PI, Math.PI / 2)], clair);
  O.poly(g, [[ax, ay], ...arc(Math.PI / 2, 0)], sombre);
  // reflet sur le flanc éclairé
  trait(g, [ax - 1, ay + 3], [cx - hw * 0.55, cy - 2], O.nuance(clair, 0.18));
}
function sapinCamp(it, typeTheme, etat, O) {
  const f = it.petit ? 0.6 : 0.94 + ((it.variante || 0) % 3) * 0.03;
  const etages = it.tronc ? [[42, 64, 0.42], [54, 78, 0.32], [66, 92, 0.2]] : [[10, 44, 0.46], [28, 64, 0.36], [48, 84, 0.24]];
  const fut = it.tronc ? 46 : 14;
  return feuille(O, -0.1, -0.1, 1.1, 1.1, Math.round(94 * f) + 2, (g, P) => {
    O.poly(g, [P(0.15, 0.3, 0), P(0.7, 0.15, 0), P(0.9, 0.7, 0), P(0.3, 0.88, 0)], 'rgba(0,0,0,0.22)');
    O.prisme(g, P, 0.44, 0.44, 0.56, 0.56, 0, fut * f, '#5a3a24');
    etages.forEach(([z0, z1, r], i) => cone(g, P, z0 * f, z1 * f, r * (it.petit ? 0.8 : 1), ['#2a5e40', '#2f6846', '#367452'][i], '#18392a', O));
  });
}

// Panneau d'accueil du camping (deux cases selon x) : planche gravée sur deux poteaux.
function panneauCamping(it, typeTheme, etat, O) {
  const s = O.spriteBloc(2, 1, 42, (g, P) => {
    O.prisme(g, P, 0.22, 0.46, 0.3, 0.54, 0, 36, '#5a3f2a');
    O.prisme(g, P, 1.7, 0.46, 1.78, 0.54, 0, 36, '#5a3f2a');
    O.prisme(g, P, 0.1, 0.5, 1.9, 0.56, 18, 34, '#8a6a48');
    O.quadY(g, P, 0.56, 0.14, 1.86, 19, 33, '#9a7a56');
    // petite tente gravée
    O.poly(g, [P(0.2, 0.56, 21), P(0.36, 0.56, 31), P(0.52, 0.56, 21)], '#e8742a');
    O.poly(g, [P(0.32, 0.56, 21), P(0.36, 0.56, 26), P(0.4, 0.56, 21)], '#3a2a1e');
  }, false);
  O.contourner(s.c);
  // le nom, après le contour pour rester net
  const P = O.projeteur(33, 43);
  const [x, y] = P(0.6, 0.56, 30);
  texteBiais(s.c.getContext('2d'), O, 'CAMPING', x, y, '#f6ecd0');
  return s;
}

// Poteau et lanterne à pétrole allumée.
function lanterneCamp(it, typeTheme, etat, O) {
  const s = O.spriteTuile(60, (g, P) => {
    O.prisme(g, P, 0.44, 0.44, 0.54, 0.54, 0, 54, '#6a4a2e');
    O.prisme(g, P, 0.44, 0.54, 0.54, 0.8, 50, 53, '#6a4a2e');
    O.prisme(g, P, 0.45, 0.72, 0.53, 0.8, 40, 42, '#2a2a2a');
    O.prisme(g, P, 0.43, 0.7, 0.55, 0.82, 32, 40, '#ffd27a', '#ffe9a0', '#f2b84a');
    O.prisme(g, P, 0.42, 0.69, 0.56, 0.83, 31, 32, '#2a2a2a');
    O.prisme(g, P, 0.36, 0.36, 0.62, 0.62, 0, 2, '#4a4a3a');
  });
  const P = O.projeteur(33, 61);
  const [x, y] = P(0.49, 0.76, 36);
  lueur(s.c.getContext('2d'), x, y, 9, 'rgba(255,214,140,0.22)');
  return s;
}

// Feu de camp : cercle de pierres, bûches croisées, braises ; les flammes sont animées (ANIMES).
function feuCamp(it, typeTheme, etat, O) {
  return O.spriteTuile(20, (g, P) => {
    const [cx, cy] = P(0.5, 0.5, 0);
    ovale(g, cx, cy, 18, 9, '#2a2420');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = cx + Math.cos(a) * 17;
      const y = cy + Math.sin(a) * 8.5;
      ovale(g, x, y - 1, 3, 2, i % 3 ? '#8a8682' : '#a29e98');
    }
    ovale(g, cx, cy, 10, 5, '#ff7a1a');
    ovale(g, cx, cy, 6, 3, '#ffd23f');
    O.prisme(g, P, 0.26, 0.44, 0.74, 0.56, 1, 5, '#6a4a2e');
    O.prisme(g, P, 0.44, 0.26, 0.56, 0.74, 3, 7, '#5a3a24');
    O.quadZ(g, P, 7, 0.44, 0.3, 0.56, 0.4, '#ff7a1a');
  });
}
function animeFeu(g, it, tx, ty, t, O, effet) {
  const P = O.projeteur(tx + 32, ty);
  const [cx, cy] = P(0.5, 0.5, 6);
  // easter egg : le feu s'embrase d'un coup (flammes géantes, gerbe d'étincelles), puis sa fumée dessine un cœur
  const d = effet ? effet.depuis : 0;
  const flambee = effet && effet.phase === 1 ? Math.sin(Math.min(1, d / 1800) * Math.PI) : 0;
  const grand = 1 + flambee * 2.2;
  const flammes = [[-5, 14, '#ff6a1a'], [4, 16, '#ff6a1a'], [0, 22, '#ff8a2a'], [-2, 15, '#ffb52e'], [2, 12, '#ffe27a']];
  flammes.forEach(([dx, h, col], i) => {
    const os = Math.sin(t / 110 + i * 1.7) * 2 * grand;
    const hh = (h + Math.sin(t / 170 + i) * 3) * grand;
    const l = (i < 3 ? 5 : 3) * (1 + flambee * 0.6);
    O.poly(g, [[cx + dx * (1 + flambee * 0.5) - l, cy], [cx + dx + os, cy - hh], [cx + dx * (1 + flambee * 0.5) + l, cy]], col);
  });
  // étincelles qui montent (une gerbe pendant la flambée)
  const n = 5 + Math.round(flambee * 14);
  for (let i = 0; i < n; i++) {
    const c = ((t + i * 470) % 2300) / 2300;
    const x = cx + Math.sin(i * 2.3 + c * 5) * (6 + flambee * 14);
    const y = cy - 14 - c * (40 + flambee * 50);
    g.fillStyle = `rgba(255,210,122,${(1 - c).toFixed(2)})`;
    g.fillRect(Math.round(x), Math.round(y), 1 + (flambee > 0.3 && i % 3 === 0 ? 1 : 0), 1);
  }
  if (effet && effet.phase === 2) coeurFumee(g, cx, cy, d - 1800, effet.duree - 1800);
}
// Le cœur de fumée : des volutes montent du feu, se rangent en cœur au-dessus de lui, puis s'élèvent et s'effacent.
function coeurFumee(g, cx, cy, d, duree) {
  const s = d / duree;
  const N = 22;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const hx = 16 * Math.pow(Math.sin(a), 3);
    const hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
    // chaque volute part du feu à son tour, rejoint sa place dans le cœur
    const m = Math.min(1, Math.max(0, (s - (k / N) * 0.25) / 0.2));
    if (m <= 0) continue;
    const e = 1 - (1 - m) * (1 - m);
    const montee = Math.max(0, s - 0.45) * 40;
    const x = cx + hx * 1.3 * e + Math.sin(d / 400 + k) * (1 - e) * 4;
    const y = cy - 18 + (-62 + hy * 1.3 + 18) * e - montee;
    const alpha = 0.85 * Math.min(1, (1 - s) / 0.3);
    if (alpha <= 0) continue;
    g.globalAlpha = alpha;
    ovale(g, x, y, 3, 2, '#c9c9d4');
    g.fillStyle = '#ececf2';
    g.fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 1);
    g.globalAlpha = 1;
  }
}

// Bûche couchée (siège autour du feu), selon x ou y ; `guitare` : une guitare appuyée dessus.
function bucheCamp(it, typeTheme, etat, O) {
  const axe = it.axe || 'x';
  return O.spriteTuile(30, (g, P) => {
    const Pr = axeLit(O, P, axe);
    const pt = ptLit(P, axe);
    Pr(g, 0.1, 0.32, 0.9, 0.68, 0, 10, '#6a4a2e');
    for (const u of [0.3, 0.55, 0.75]) Pr(g, u, 0.32, u + 0.02, 0.68, 9.5, 10.2, '#4a3220');
    const [ex, ey] = pt(0.9, 0.5, 5);
    if (axe === 'x') {
      ovale(g, ex + 3, ey + 2, 3, 5, '#b08a5a');
      g.fillStyle = '#8a6a48';
      g.fillRect(Math.round(ex + 3), Math.round(ey + 1), 1, 2);
    } else {
      ovale(g, ex - 3, ey + 2, 3, 5, '#b08a5a');
      g.fillStyle = '#8a6a48';
      g.fillRect(Math.round(ex - 3), Math.round(ey + 1), 1, 2);
    }
    if (it.guitare) {
      const [x, y] = pt(0.45, 0.82, 0);
      trait(g, [x + 2, y - 8], [x + 10, y - 26], '#3a2a1e', 2);
      ovale(g, x, y - 4, 5, 5, '#c98a3a');
      ovale(g, x + 2, y - 10, 4, 4, '#c98a3a');
      ovale(g, x + 1, y - 6, 1, 1, '#2a1a10');
      g.fillStyle = '#2a1a10';
      g.fillRect(Math.round(x + 9), Math.round(y - 28), 3, 3);
    }
  });
}

// Table de pique-nique et ses bancs, une bouilloire et deux tasses.
function piqueNique(it, typeTheme, etat, O) {
  const bois = '#8a6a48';
  return O.spriteTuile(32, (g, P) => {
    for (const u of [0.16, 0.8]) {
      O.prisme(g, P, u, 0.12, u + 0.05, 0.18, 0, 12, O.nuance(bois, -0.2));
      O.prisme(g, P, u, 0.82, u + 0.05, 0.88, 0, 12, O.nuance(bois, -0.2));
      O.prisme(g, P, u, 0.46, u + 0.05, 0.54, 0, 22, O.nuance(bois, -0.2));
    }
    O.prisme(g, P, 0.08, 0.06, 0.92, 0.22, 12, 14, bois);
    O.prisme(g, P, 0.08, 0.3, 0.92, 0.7, 22, 24, bois);
    O.prisme(g, P, 0.08, 0.78, 0.92, 0.94, 12, 14, bois);
    O.prisme(g, P, 0.3, 0.42, 0.46, 0.58, 24, 31, '#9aa3ad');
    O.prisme(g, P, 0.34, 0.46, 0.42, 0.54, 31, 33, '#2a2a2a');
    O.prisme(g, P, 0.6, 0.38, 0.68, 0.46, 24, 28, '#c8323c');
    O.prisme(g, P, 0.7, 0.52, 0.78, 0.6, 24, 28, '#2f6fc0');
  });
}

// Canoë retourné sur l'herbe (deux cases selon x) et ses pagaies.
function canoe(it, typeTheme, etat, O) {
  return O.spriteBloc(2, 1, 20, (g, P) => {
    const coque = '#b8432e';
    O.poly(g, [P(0.08, 0.5, 2), P(0.4, 0.26, 2), P(1.6, 0.26, 2), P(1.92, 0.5, 2), P(1.6, 0.74, 2), P(0.4, 0.74, 2)], O.nuance(coque, -0.25));
    O.poly(g, [P(0.08, 0.5, 4), P(0.4, 0.5, 13), P(1.6, 0.5, 13), P(1.92, 0.5, 4), P(1.6, 0.74, 2), P(0.4, 0.74, 2)], coque);
    O.poly(g, [P(0.08, 0.5, 4), P(0.4, 0.5, 13), P(1.6, 0.5, 13), P(1.92, 0.5, 4)], O.nuance(coque, 0.12));
    trait(g, P(0.4, 0.5, 13), P(1.6, 0.5, 13), O.nuance(coque, 0.35));
    trait(g, P(0.42, 0.72, 3), P(1.58, 0.72, 3), '#f1e2c2');
    // pagaies
    O.prisme(g, P, 0.3, 0.84, 1.3, 0.88, 0, 1.5, '#c9a46a');
    O.prisme(g, P, 1.2, 0.8, 1.5, 0.92, 0, 1.5, '#c9a46a');
  });
}

// Glacière avec un sachet de guimauves posé dessus. Easter egg (etat.effet) : phase 1, le couvercle se soulève (deux
// yeux brillent dans la fente, voir animeGlaciere) ; ensuite il reste ouvert et le sachet a disparu.
function glaciereCamp(it, typeTheme, etat, O) {
  const effet = etat.effet || 0;
  return O.spriteTuile(40, (g, P) => {
    O.prisme(g, P, 0.22, 0.28, 0.78, 0.72, 0, 15, '#2f6fc0');
    O.prisme(g, P, 0.42, 0.72, 0.58, 0.76, 10, 13, '#f4f4f4');
    if (effet >= 2) {
      // ouverte : l'intérieur sombre, le couvercle relevé contre le fond
      O.quadZ(g, P, 15, 0.26, 0.32, 0.74, 0.68, '#1a2433');
      O.prisme(g, P, 0.2, 0.22, 0.8, 0.27, 15, 36, '#f4f4f4');
      return;
    }
    const z0 = effet === 1 ? 19 : 15;
    if (effet === 1) O.prisme(g, P, 0.24, 0.3, 0.76, 0.7, 15, z0, '#15151f');
    O.prisme(g, P, 0.2, 0.26, 0.8, 0.74, z0, z0 + 3, '#f4f4f4');
    O.prisme(g, P, 0.3, 0.36, 0.52, 0.56, z0 + 3, z0 + 7, '#ffd6e6');
    O.prisme(g, P, 0.33, 0.39, 0.38, 0.44, z0 + 7, z0 + 8, '#ffffff');
  });
}
// Le raton laveur de la glacière : yeux dans la fente, tête qui sort avec le sachet de guimauves (« MIAM ! »), puis il
// saute dehors et file vers les sapins, le sachet dans la gueule.
function animeGlaciere(g, it, tx, ty, t, O, effet) {
  if (!effet) return;
  const P = O.projeteur(tx + 32, ty);
  const d = effet.depuis;
  if (effet.phase === 1) {
    if (d > 250 && Math.floor(d / 380) % 4 !== 3) {
      // sur la face +x de la fente : la face +y est souvent cachée par le sapin voisin
      for (const v of [0.3, 0.45]) {
        const [x, y] = P(0.76, v, 16.5);
        g.fillStyle = '#ffe27a';
        g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      }
    }
    const v = Math.round(Math.sin(d / 30));
    const [x, y] = P(0.5, 0.5, 18);
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(x) - 22 + v, Math.round(y) + 2, 4, 1);
    g.fillRect(Math.round(x) + 19 - v, Math.round(y) + 2, 4, 1);
    return;
  }
  if (effet.phase === 2) {
    // la tête et les pattes dépassent, il grignote
    const sortie = Math.min(1, (d - 1000) / 300);
    const [x, y] = P(0.5, 0.5, 13 + sortie * 13);
    teteRaton(g, x, y, Math.floor(d / 200) % 2);
    if (d > 1500) bulle(g, O, O.enseigne('MIAM !', 'YUM!'), x + 8, y - 12, '#8a5a30');
    return;
  }
  // phase 3 : il saute hors de la glacière puis court selon +x (vers les sapins) et disparaît
  const e = (d - 3200) / (effet.duree - 3200);
  const u = 0.5 + e * 4.2;
  const saut = e < 0.08 ? Math.sin((e / 0.08) * Math.PI) * 14 + (1 - e / 0.08) * 15 : Math.abs(Math.sin(d / 90)) * 2;
  const [x, y] = P(u, 0.62, saut);
  g.globalAlpha = Math.min(1, (1 - e) / 0.15);
  raton(g, x, y, Math.floor(d / 90) % 2);
  g.globalAlpha = 1;
}
function teteRaton(g, x, y, f) {
  const X = Math.round(x);
  const Y = Math.round(y);
  const C = '#15151f';
  g.fillStyle = C;
  g.fillRect(X - 6, Y - 9, 13, 10);
  g.fillRect(X - 6, Y - 12, 4, 4);
  g.fillRect(X + 3, Y - 12, 4, 4);
  g.fillStyle = '#9a9aa2';
  g.fillRect(X - 5, Y - 8, 11, 8);
  g.fillRect(X - 5, Y - 11, 2, 3);
  g.fillRect(X + 4, Y - 11, 2, 3);
  // le masque, les yeux, le museau blanc
  g.fillStyle = '#2a2a30';
  g.fillRect(X - 5, Y - 6, 11, 3);
  g.fillStyle = '#ffffff';
  g.fillRect(X - 3, Y - 5, 1, 1);
  g.fillRect(X + 3, Y - 5, 1, 1);
  g.fillStyle = '#e4e4ea';
  g.fillRect(X - 2, Y - 3, 5, 3);
  g.fillStyle = C;
  g.fillRect(X, Y - 3, 1, 1);
  // les pattes tiennent le sachet de guimauves
  g.fillStyle = C;
  g.fillRect(X - 6, Y - 1 + f, 13, 5);
  g.fillStyle = '#ffd6e6';
  g.fillRect(X - 3, Y + f, 7, 3);
  g.fillStyle = '#ffffff';
  g.fillRect(X - 2, Y + f, 2, 1);
  g.fillStyle = '#6a6a72';
  g.fillRect(X - 5, Y + f, 2, 2);
  g.fillRect(X + 4, Y + f, 2, 2);
}
// Raton laveur de profil (tourné vers la droite de l'écran), (x, y) sous ses pattes ; `f` : foulée.
function raton(g, x, y, f) {
  const X = Math.round(x);
  const Y = Math.round(y);
  const C = '#15151f';
  // queue rayée
  g.fillStyle = C;
  g.fillRect(X - 15, Y - 11 + f, 9, 5);
  g.fillStyle = '#8a8a92';
  g.fillRect(X - 14, Y - 10 + f, 8, 3);
  g.fillStyle = '#3a3a40';
  g.fillRect(X - 13, Y - 10 + f, 1, 3);
  g.fillRect(X - 10, Y - 10 + f, 1, 3);
  // corps et pattes
  g.fillStyle = C;
  g.fillRect(X - 7, Y - 11, 13, 9);
  g.fillRect(X - 6 + f * 2, Y - 3, 3, 3);
  g.fillRect(X + 2 - f * 2, Y - 3, 3, 3);
  g.fillStyle = '#9a9aa2';
  g.fillRect(X - 6, Y - 10, 11, 7);
  // tête, oreille, masque
  g.fillStyle = C;
  g.fillRect(X + 3, Y - 16, 9, 8);
  g.fillRect(X + 4, Y - 18, 3, 3);
  g.fillStyle = '#b4b4bc';
  g.fillRect(X + 4, Y - 15, 7, 6);
  g.fillStyle = '#2a2a30';
  g.fillRect(X + 4, Y - 13, 7, 2);
  g.fillStyle = '#ffffff';
  g.fillRect(X + 8, Y - 13, 1, 1);
  // le sachet dans la gueule
  g.fillStyle = C;
  g.fillRect(X + 10, Y - 12, 6, 6);
  g.fillStyle = '#ffd6e6';
  g.fillRect(X + 11, Y - 11, 4, 4);
}

// ---------- camping : sols ----------
// Herbe la nuit : touffes plus claires et plus sombres, quelques fleurettes.
function herbeNuit(g, col, { rnd, variante, parite }, O) {
  const cl = O.nuance(col, 0.16);
  const so = O.nuance(col, -0.18);
  for (let i = 0; i < 30; i++) {
    const px = Math.floor(rnd() * 64);
    const py = Math.floor(rnd() * 31);
    if (!dansTuile(px, py) || !dansTuile(px, py - 2)) continue;
    g.fillStyle = rnd() < 0.5 ? cl : so;
    g.fillRect(px, py - 1, 1, 2);
    if (rnd() < 0.4) g.fillRect(px + 1, py - 2, 1, 2);
  }
  if (variante === 0 && parite === 1) {
    g.fillStyle = '#f4f0d0';
    g.fillRect(22, 14, 1, 1);
    g.fillRect(40, 19, 1, 1);
  }
}
// Terre battue autour du feu.
function terreFeu(g, col, { rnd }, O) {
  grains(g, rnd, 36, [O.nuance(col, -0.15), O.nuance(col, 0.12), '#8a8682']);
}
// Bord de la terre battue : terre et touffes d'herbe.
function terreHerbe(g, col, { rnd }, O) {
  grains(g, rnd, 20, [O.nuance(col, -0.12), O.nuance(col, 0.1)]);
  for (let i = 0; i < 14; i++) {
    const px = Math.floor(rnd() * 64);
    const py = Math.floor(rnd() * 31);
    if (!dansTuile(px, py) || !dansTuile(px, py - 2)) continue;
    g.fillStyle = rnd() < 0.5 ? '#3f6a44' : '#2a4a30';
    g.fillRect(px, py - 1, 1, 2);
  }
}
// Allée de gravier du hall.
function gravierCamp(g, col, { rnd }, O) {
  grains(g, rnd, 40, [O.nuance(col, -0.15), O.nuance(col, 0.15), O.nuance(col, 0.05)]);
}

// ---------- camping : murs ----------
// Ciel de nuit étoilé, montagnes au loin et lisière de sapins.
function cielNuit(g, longueur, cote, rnd, O) {
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  for (let y = 0; y < 84; y += 4) R(0, y, longueur, 4, O.melange('#0a0f2c', '#2a3a66', Math.min(1, y / 64)));
  for (let i = 0; i < longueur / 5; i++) {
    const x = Math.floor(rnd() * longueur);
    const y = Math.floor(rnd() * 56);
    R(x, y, 1, 1, rnd() < 0.3 ? '#ffe9a0' : '#dfe6ff');
  }
  for (let i = 0; i < longueur / 60; i++) {
    const x = Math.floor(rnd() * longueur);
    const y = 4 + Math.floor(rnd() * 40);
    R(x - 1, y, 3, 1, '#ffffff');
    R(x, y - 1, 1, 3, '#ffffff');
  }
  // montagnes au loin
  let h = 30;
  for (let x = 0; x < longueur; x++) {
    h += (rnd() - 0.5) * 2.2 + (x % 90 < 45 ? 0.35 : -0.35);
    h = Math.max(16, Math.min(38, h));
    R(x, Math.round(84 - h), 1, Math.round(h), '#1c2a48');
  }
  // lisière de sapins
  for (let x = -10; x < longueur + 10; x += 9 + Math.floor(rnd() * 8)) {
    const ht = 14 + Math.floor(rnd() * 16);
    for (let j = 0; j < ht; j++) {
      const w = Math.round((j / ht) * 6) + 1;
      R(x - w, 84 - ht + j, w * 2 + 1, 1, '#0b1716');
    }
  }
  R(0, 78, longueur, 6, '#0b1716');
}

// Décor des murs : enseigne du QG, lune et étoile filante à droite ; plaque et Grande Ourse à gauche.
function decorsCamping(g, cote, longueur, etage, O) {
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  if (cote === 'droite') {
    O.enseigneQG(g);
    // lune
    const lx = 300;
    const ly = 18;
    for (let y = -12; y <= 12; y++) {
      const w = Math.round(Math.sqrt(150 - y * y));
      R(lx - w, ly + y, w * 2 + 1, 1, 'rgba(244,239,210,0.12)');
    }
    for (let y = -8; y <= 8; y++) {
      const w = Math.round(Math.sqrt(66 - y * y));
      R(lx - w, ly + y, w * 2 + 1, 1, y < -3 ? '#fbf6dc' : '#f1ebc8');
    }
    R(lx - 3, ly - 3, 3, 2, '#ddd6b0');
    R(lx + 2, ly + 2, 2, 2, '#ddd6b0');
    R(lx - 1, ly + 4, 2, 1, '#ddd6b0');
    // étoile filante
    for (let i = 0; i < 18; i++) R(420 - i * 2, 10 + i, 2, 1, `rgba(255,255,255,${(1 - i / 18).toFixed(2)})`);
    R(420, 9, 2, 2, '#ffffff');
    return;
  }
  const c = (gy) => (H_ - gy) * 32;
  O.plaqueEtage(g, etage);
  // la Grande Ourse
  const etoiles = [[11.7, 22], [11.2, 18], [10.8, 16], [10.3, 15], [10.2, 9], [9.6, 8], [9.6, 14]].map(([gy, y]) => [Math.round(c(gy)), y]);
  const lignes = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]];
  for (const [a, b] of lignes) {
    const [xa, ya] = etoiles[a];
    const [xb, yb] = etoiles[b];
    const n = Math.max(Math.abs(xb - xa), Math.abs(yb - ya));
    for (let i = 0; i <= n; i += 2) R(Math.round(xa + ((xb - xa) * i) / n), Math.round(ya + ((yb - ya) * i) / n), 1, 1, 'rgba(160,180,255,0.45)');
  }
  for (const [x, y] of etoiles) {
    R(x - 1, y, 3, 1, '#fff6c8');
    R(x, y - 1, 1, 3, '#fff6c8');
  }
}

// ======================================================================================================
export const MEUBLES = {
  // hôtel capsules
  capsule,
  distributeur_jp: distributeurJp,
  bambou_pot: bambouPot,
  bonsai_jp: bonsaiJp,
  casiers_geta: casiersGeta,
  banc_tatami: bancTatami,
  andon,
  shishi_odoshi: shishiOdoshi,
  rocher_zen: rocherZen,
  toro,
  pantoufles,
  // camping
  tente,
  sac_couchage: sacCouchage,
  hamac,
  sapin_camp: sapinCamp,
  panneau_camping: panneauCamping,
  lanterne_camp: lanterneCamp,
  feu_camp: feuCamp,
  buche_camp: bucheCamp,
  pique_nique: piqueNique,
  canoe,
  glaciere_camp: glaciereCamp,
};
export const ANIMES = {
  shishi_odoshi: animeShishi, feu_camp: animeFeu, distributeur_jp: animeDistributeur, glaciere_camp: animeGlaciere,
};
// Easter eggs (web/clics.js) : distributeur (jackpot de canettes), fontaine en bambou (« TOC ! » et la grenouille),
// feu de camp (flambée et cœur de fumée), glacière (le raton laveur qui vole les guimauves).
export const CLICS = {
  distributeur_jp: { duree: 6500, phases: [900] },
  shishi_odoshi: { duree: 5200, phases: [700] },
  feu_camp: { duree: 7500, phases: [1800] },
  glaciere_camp: { duree: 7000, phases: [1000, 3200] },
};
export const JEUX = {};
export const SOLS = {
  tatami,
  parquet_jp: parquetJp,
  gravier_ratisse: gravierRatisse,
  herbe_nuit: herbeNuit,
  terre_feu: terreFeu,
  terre_herbe: terreHerbe,
  gravier_camp: gravierCamp,
};
export const MURS = { bois_jp: boisJp, ciel_nuit: cielNuit };
export const DECORS_MURS = { capsules: decorsCapsules, camping: decorsCamping };
export const THEMES = {
  // Hôtel capsules : tatamis, plancher sombre, jardin sec
  capsules: {
    sols: {
      def: ['tatami', '#b5b27a'], tatami: ['tatami', '#b5b27a'], hall: ['parquet_jp', '#5a4232'], sous: ['parquet_jp', '#4a3628'],
      jardin: ['gravier_ratisse', '#a8a292'],
    },
    mur: 'bois_jp', dalle: '#2a1f18', bureau: '#8a6a48', chaise: '#8a3340', canape: '#2f4a7a', canapeEquipe: '#8a3340', table: '#8a6a48',
  },
  // Camping : herbe, terre battue autour du feu, allée de gravier
  camping: {
    sols: {
      def: ['herbe_nuit', '#2e5236'], herbe: ['herbe_nuit', '#2e5236'], terre: ['terre_feu', '#6a5038'],
      'terre-bord': ['terre_herbe', '#4e4a32'], chemin: ['gravier_camp', '#6e6a5c'],
    },
    mur: 'ciel_nuit', dalle: '#1a2418', bureau: '#8a6a48', chaise: '#c8323c', canape: '#3f8a4a', canapeEquipe: '#e8742a', table: '#8a6a48',
  },
};
