// Logique pure du réglage graphique (sans DOM, testée dans tests/graphismes.test.js) :
// niveaux, choix automatique, limiteur de cadence, résolution interne et surveillance des images lentes.

export const NIVEAUX = ['auto', 'leger', 'equilibre', 'haute', 'maximum'];
// Niveaux que le mode automatique peut prendre, du plus léger au plus beau. Jamais au-delà d'Équilibré :
// le QG reste ouvert en fond, 30 images/s suffisent au pixel art ; Haute et Maximum se choisissent à la main.
export const NIVEAUX_AUTO = ['leger', 'equilibre'];
const ORDRE = ['leger', 'equilibre', 'haute'];
// Au-delà, un GPU intégré passe en Léger (pixels de l'écran : largeur × hauteur × dpr²).
export const PIXELS_ECRAN_LOURD = 4_000_000;

// fps : images par seconde visées (0 = rythme de l'écran) ; veille : images par seconde quand la fenêtre n'a
// pas le focus ou que personne ne s'en sert (0 = pas de veille) ; zoomMin : zoom minimal de l'art dans la
// résolution interne (Infinity = pleine résolution) ; pixelsMax : plafond de pixels internes ;
// decor : vitesse des petites animations du décor ; masque : dessiner quand l'onglet est masqué.
export const PROFILS = {
  leger: { fps: 15, veille: 5, zoomMin: 1, pixelsMax: Infinity, decor: 0.5, masque: false },
  equilibre: { fps: 30, veille: 5, zoomMin: 2, pixelsMax: 2_100_000, decor: 1, masque: false },
  haute: { fps: 60, veille: 5, zoomMin: Infinity, pixelsMax: Infinity, decor: 1, masque: false },
  maximum: { fps: 0, veille: 0, zoomMin: Infinity, pixelsMax: Infinity, decor: 1, masque: true },
};

export const niveauValide = (v) => NIVEAUX.includes(v);

const plusLeger = (a, b) => ORDRE[Math.min(ORDRE.indexOf(a), ORDRE.indexOf(b))];

// Nom du GPU vu par le navigateur (WEBGL_debug_renderer_info) → 'logiciel' | 'integre' | 'dedie' | null (inconnu).
// Exemples : « ANGLE (Intel, Intel(R) Iris(R) Xe Graphics …) », « ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Ti Laptop GPU …) »,
// « ANGLE (Apple, ANGLE Metal Renderer: Apple M2, …) », « Google SwiftShader », « llvmpipe (LLVM 15.0.7, 256 bits) ».
export function classerGpu(nom) {
  if (typeof nom !== 'string' || !nom.trim()) return null;
  const n = nom.toLowerCase().replace(/\((tm|r)\)/g, '');
  if (/swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render|software (adapter|renderer|rasterizer)|\bwarp\b/.test(n)) return 'logiciel';
  if (/nvidia|geforce|quadro|tesla|\brtx\b|\bgtx\b/.test(n)) return 'dedie';
  // Radeon RX / Pro / R9 / HD 7970 / 540… ; « Radeon Graphics », « Vega 8 », « 780M » sont intégrés aux processeurs AMD
  if (/radeon (rx|pro|r9|r7|vii|hd \d{4})\b|firepro|radeon \d{3,4}\b/.test(n)) return 'dedie';
  if (/\barc [ab]\d{3}/.test(n)) return 'dedie'; // Intel Arc A770, B580… (« Intel Arc Graphics » seul est intégré)
  if (/intel|iris|uhd graphics|hd graphics/.test(n)) return 'integre';
  if (/radeon/.test(n)) return 'integre'; // Radeon(TM) Graphics, Vega 8, 780M… des processeurs AMD
  if (/apple|mali|adreno|powervr|videocore|tegra/.test(n)) return 'integre';
  return null;
}

// Choix automatique à partir de ce que le navigateur dit de la machine.
// m : { coeurs, memoire (Go, plafonné à 8 par les navigateurs), mouvementReduit, batterie: { presente, charge, niveau },
//       msImage, gpu (classerGpu), pixels (pixels de l'écran) }
// Rend { niveau, raisons } : Équilibré au plus ; raisons = codes courts (traduits par graphismes.js) de ce qui a
// mené à ce niveau ('plafond' quand rien ne l'a baissé).
export function choisirAuto(m = {}) {
  const causes = [];
  const baisser = (vers, raison) => causes.push([vers, raison]);
  const { coeurs, memoire, batterie, msImage, gpu, pixels } = m;
  if (gpu === 'logiciel') baisser('leger', 'gpu-logiciel');
  else if (gpu === 'integre') {
    if (pixels > PIXELS_ECRAN_LOURD) {
      baisser('leger', 'gpu-integre');
      baisser('leger', 'pixels');
    } else baisser('equilibre', 'gpu-integre');
  }
  if (coeurs > 0 && coeurs <= 4) baisser('leger', 'coeurs');
  else if (coeurs > 0 && coeurs < 8) baisser('equilibre', 'coeurs');
  if (memoire > 0 && memoire <= 2) baisser('leger', 'memoire');
  else if (memoire > 0 && memoire < 8) baisser('equilibre', 'memoire');
  if (batterie && batterie.presente) baisser(batterie.charge ? 'equilibre' : 'leger', batterie.charge ? 'portable' : 'batterie');
  if (m.mouvementReduit) baisser('equilibre', 'mouvement');
  if (msImage > 8) baisser('leger', 'lent');
  else if (msImage > 3) baisser('equilibre', 'lent');
  const niveau = causes.some(([v]) => v === 'leger') ? 'leger' : 'equilibre';
  const raisons = causes.filter(([v]) => v === niveau).map(([, r]) => r);
  return { niveau, raisons: raisons.length ? raisons.filter((r, i) => raisons.indexOf(r) === i) : ['plafond'] };
}

// Une batterie existe si le navigateur la voit se vider, se charger, ou ne pas être pleine.
// (Un PC fixe répond : en charge, 100 %, chargingTime 0, dischargingTime Infinity.)
export function lireBatterie(b) {
  if (!b) return null;
  const presente = !b.charging || b.level < 1 || (Number.isFinite(b.chargingTime) && b.chargingTime > 0) || Number.isFinite(b.dischargingTime);
  return { presente: !!presente, charge: !!b.charging, niveau: typeof b.level === 'number' ? b.level : null };
}

// Limiteur de cadence : dessine au plus une image par intervalle (ms), sans dériver. Le rythme de l'écran
// (requestAnimationFrame) arrive avec un peu de gigue : une tolérance évite de sauter une image sur deux.
// Quand l'intervalle change (veille → rythme du niveau), l'échéance repart de la dernière image dessinée.
export class Cadence {
  constructor() {
    this.prochaine = 0;
    this.derniere = -Infinity;
    this.intervalle = 0;
  }

  echeance(intervalle) {
    if (intervalle !== this.intervalle) return this.prochaine === 0 ? 0 : this.derniere + intervalle;
    return this.prochaine;
  }

  doitDessiner(t, intervalle) {
    if (!(intervalle > 0)) {
      this.prochaine = t;
      this.derniere = t;
      this.intervalle = 0;
      return true;
    }
    const tolerance = Math.min(4, intervalle * 0.2);
    const echeance = this.echeance(intervalle);
    if (t < echeance - tolerance) return false;
    // nouvel intervalle : le rythme repart de cette image (pas de rafale pour rattraper)
    this.prochaine = intervalle !== this.intervalle ? t + intervalle : echeance + intervalle;
    this.intervalle = intervalle;
    this.derniere = t;
    // en retard d'au moins une image (pause, réveil) : on repart de maintenant
    if (this.prochaine <= t) this.prochaine = t + intervalle;
    return true;
  }

  // Temps (ms) avant la prochaine image voulue (0 = tout de suite).
  attente(t, intervalle) {
    if (!(intervalle > 0)) return 0;
    return Math.max(0, this.echeance(intervalle) - t);
  }

  // Activité : la prochaine image part dès le prochain rafraîchissement.
  reveiller() {
    this.prochaine = 0;
  }
}

// Résolution interne : facteur k (diviseur entier du zoom à pleine résolution) ; la scène est dessinée au
// zoom zoomPlein / k puis agrandie k fois, pixels nets. Le zoom reste entier, le rendu est donc le même
// pixel pour pixel (seuls les déplacements sont arrondis à la nouvelle grille).
// largeur / hauteur : taille du canvas à pleine résolution (pixels de l'écran).
export function diviseurRendu(zoomPlein, largeur, hauteur, profil) {
  if (!profil || !(zoomPlein >= 2) || !Number.isInteger(zoomPlein)) return 1;
  const diviseurs = [];
  for (let k = 1; k <= zoomPlein; k++) if (zoomPlein % k === 0) diviseurs.push(k);
  let k = 1;
  for (const d of diviseurs) if (zoomPlein / d >= profil.zoomMin) k = d;
  const pixels = (d) => Math.ceil(largeur / d) * Math.ceil(hauteur / d);
  for (const d of diviseurs) if (d > k && pixels(k) > profil.pixelsMax) k = d;
  return k;
}

// Mouvement dans la scène (avatars qui marchent ou apparaissent, glissements, ascenseur qui bouge) :
// la cadence remonte au rythme du niveau tant qu'il dure.
export function sceneEnMouvement(dir) {
  if (!dir) return false;
  if (dir.glissements && dir.glissements.length) return true;
  const asc = dir.asc;
  if (asc && asc.ouverture > 0 && asc.ouverture < 1) return true;
  if (dir.avatars) {
    for (const av of dir.avatars.values()) {
      if ((av.chemin && av.chemin.length) || av.versAsc || av.fondu) return true;
    }
  }
  return false;
}

// Veille : moins d'images quand personne ne regarde. etat : { focus, inactifMs, mouvement, reveil }
export function enVeille(profil, etat, delaiInactif = 30000) {
  if (!profil || !profil.veille) return false;
  if (etat.mouvement || etat.reveil) return false;
  return !etat.focus || etat.inactifMs >= delaiInactif;
}

// Intervalle (ms) entre deux images ; 0 = rythme de l'écran.
export function intervalleVoulu(profil, veille) {
  if (!profil) return 0;
  const fps = veille ? profil.veille : profil.fps;
  return fps > 0 ? 1000 / fps : 0;
}

// Surveillance : sur des fenêtres de quelques secondes d'images dessinées au rythme du niveau, la machine
// peine si le JavaScript d'une image prend plus de la moitié de l'intervalle, ou si moins de 70 % des
// images prévues sortent. Deux fenêtres de suite → « baisser ». Rien n'est mesuré pendant la veille.
export class Evaluateur {
  constructor({ fenetre = 3000, fenetresDeSuite = 2, repos = 10000 } = {}) {
    this.fenetre = fenetre;
    this.deSuite = fenetresDeSuite;
    this.repos = repos;
    this.mauvaises = 0;
    this.dernierVerdict = -Infinity;
    this.raz(null);
  }

  raz(t) {
    this.t0 = t;
    this.n = 0;
    this.ms = 0;
    this.intervalle = 0;
  }

  // Pause dans la mesure (veille, onglet masqué, changement de niveau) : la fenêtre en cours est jetée.
  interrompre() {
    this.raz(null);
  }

  // Une image dessinée à l'instant t, son temps JavaScript ms, l'intervalle visé. Rend 'baisser' ou null.
  noter(t, ms, intervalle) {
    if (!(intervalle > 0)) return null;
    if (this.t0 === null || intervalle !== this.intervalle) {
      this.raz(t);
      this.intervalle = intervalle;
      return null;
    }
    this.n++;
    this.ms += ms;
    const duree = t - this.t0;
    if (duree < this.fenetre) return null;
    const prevues = duree / intervalle;
    const lente = this.ms / this.n > intervalle * 0.5 || this.n < prevues * 0.7;
    this.raz(t);
    this.mauvaises = lente ? this.mauvaises + 1 : 0;
    if (this.mauvaises >= this.deSuite && t - this.dernierVerdict >= this.repos) {
      this.mauvaises = 0;
      this.dernierVerdict = t;
      return 'baisser';
    }
    return null;
  }

  // Moyennes de la fenêtre en cours (débogage).
  stats() {
    return { images: this.n, msMoyen: this.n ? this.ms / this.n : 0 };
  }
}

// Niveau juste en dessous (pour « baisser ») ; reste au plus léger.
export const niveauEnDessous = (n) => ORDRE[Math.max(0, ORDRE.indexOf(n) - 1)] || 'leger';
export { plusLeger };
