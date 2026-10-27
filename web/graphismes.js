// Réglage graphique, propre à cet appareil (localStorage, sans serveur) : niveau choisi, choix automatique,
// veille (fenêtre sans focus, personne devant), classes CSS des animations, bloc de Réglages › Général.
// Le moteur lui demande à chaque rafraîchissement l'intervalle voulu et lui rend compte de chaque image.
import { t } from './i18n.js';
import { h } from './modale.js';
import {
  NIVEAUX, PROFILS, choisirAuto, lireBatterie, enVeille, intervalleVoulu, Evaluateur, niveauEnDessous, plusLeger, niveauValide, classerGpu,
} from './cadence.js';

const CLE = 'qg-graphismes';
const INACTIF_MS = 30000; // sans souris ni clavier depuis 30 s : veille
const REVEIL_MS = 1500; // un événement du flux (carte, bulle, avatar qui part) : rythme du niveau un moment
const PREMIERES_MS = 3000; // temps JavaScript moyen des premières images, pour le choix automatique

function lire() {
  try {
    const v = localStorage.getItem(CLE);
    return niveauValide(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

// Nom du GPU vu par le navigateur, lu une fois sur un contexte WebGL jetable, libéré tout de suite.
function nomGpu() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const nom = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    const perte = gl.getExtension('WEBGL_lose_context');
    if (perte) perte.loseContext();
    return nom;
  } catch {
    return '';
  }
}

// Pixels de l'écran (largeur × hauteur × dpr²).
function pixelsEcran() {
  try {
    const d = window.devicePixelRatio || 1;
    return Math.round(screen.width * screen.height * d * d) || 0;
  } catch {
    return 0;
  }
}

function ecrire(v) {
  try {
    if (v === 'auto') localStorage.removeItem(CLE);
    else localStorage.setItem(CLE, v);
  } catch {
    /* stockage indisponible : le choix vaut pour cette page */
  }
}

export const nomNiveau = (n) => ({
  auto: t('Automatique'), leger: t('Léger'), equilibre: t('Équilibré'), haute: t('Haute'), maximum: t('Maximum'),
})[n] || n;

const phraseNiveau = (n) => ({
  auto: t('Équilibré au plus ; Léger sur batterie, avec un GPU modeste ou si la machine peine.'),
  leger: t('15 images/s, résolution réduite, animations calmes. Pour les petites machines.'),
  equilibre: t('30 images/s, résolution plafonnée, animations allégées.'),
  haute: t('60 images/s, pleine résolution.'),
  maximum: t('Rythme de l’écran, toujours dessiné (comme avant la 1.0.6).'),
})[n] || '';

const texteRaison = (r) => ({
  coeurs: t('peu de cœurs'),
  memoire: t('peu de mémoire'),
  batterie: t('sur batterie'),
  portable: t('ordinateur portable'),
  mouvement: t('animations réduites demandées par le système'),
  lent: t('images lentes à dessiner'),
  peine: t('la machine peinait'),
  'gpu-logiciel': t('rendu logiciel, sans GPU'),
  'gpu-integre': t('GPU intégré'),
  pixels: t('écran très défini'),
  plafond: t('30 images/s suffisent pour un QG ouvert en fond'),
})[r] || r;

class Graphismes {
  constructor() {
    this.choix = lire();
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const gpuNom = nomGpu();
    this.mesures = {
      coeurs: nav.hardwareConcurrency || 0, memoire: nav.deviceMemory || 0, mouvementReduit: false, batterie: null, msImage: null,
      gpu: classerGpu(gpuNom), gpuNom, pixels: pixelsEcran(),
    };
    this.plafond = null; // posé par la surveillance quand la machine peine, pour la session
    this.auto = choisirAuto(this.mesures);
    this.focus = document.hasFocus();
    this.derniereEntree = performance.now();
    this.reveilJusqua = 0;
    this.mouvement = false;
    this.veille = false;
    this.evaluateur = new Evaluateur();
    this.premieres = { t0: null, n: 0, ms: 0 };
    this.ecouteurs = new Set();
    this.moteur = null;
    // débogage et mesures : { focus: true } simule une fenêtre au premier plan, { actif: true } quelqu'un devant
    this.forcer = {};
    const lien = document.createElement('link');
    lien.rel = 'stylesheet';
    lien.href = 'graphismes.css';
    document.head.append(lien);
    this.brancherDom();
    this.appliquerClasses();
  }

  get niveau() {
    return this.choix === 'auto' ? this.auto.niveau : this.choix;
  }

  get profil() {
    return PROFILS[this.niveau];
  }

  // « Automatique (Équilibré) », ou le nom du niveau choisi.
  libelle() {
    return this.choix === 'auto' ? t('Automatique ({niveau})', { niveau: nomNiveau(this.auto.niveau) }) : nomNiveau(this.choix);
  }

  brancher(moteur, store) {
    this.moteur = moteur;
    if (store) store.ecouter(() => this.reveiller(REVEIL_MS));
  }

  brancherDom() {
    const entree = () => this.entree();
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, entree, { capture: true, passive: true });
    window.addEventListener('focus', () => this.majFocus());
    window.addEventListener('blur', () => this.majFocus());
    document.addEventListener('visibilitychange', () => {
      this.evaluateur.interrompre();
      if (!document.hidden) this.reveiller();
    });
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.mesures.mouvementReduit = mq.matches;
      mq.addEventListener('change', () => {
        this.mesures.mouvementReduit = mq.matches;
        this.reevaluer();
      });
    } catch {
      /* matchMedia indisponible */
    }
    try {
      if (navigator.getBattery) {
        navigator.getBattery().then((b) => {
          const maj = () => {
            this.mesures.batterie = lireBatterie(b);
            this.reevaluer();
          };
          maj();
          b.addEventListener('chargingchange', maj);
          b.addEventListener('levelchange', maj);
        }).catch(() => {});
      }
    } catch {
      /* API batterie absente */
    }
    this.reevaluer();
  }

  aLeFocus() {
    if (this.forcer.focus !== undefined) return !!this.forcer.focus;
    return this.focus;
  }

  majFocus() {
    const f = document.hasFocus();
    if (f === this.focus) return;
    this.focus = f;
    this.appliquerClasses();
    if (f) this.entree();
  }

  // souris, clavier, molette : la cadence remonte tout de suite
  entree() {
    this.derniereEntree = performance.now();
    if (this.veille && this.moteur) this.moteur.reveiller();
  }

  // ms : garder le rythme du niveau ce temps-là (événement du flux, changement d'étage) ; 0 : une image tout de suite.
  // Hors veille, le rythme est déjà le bon : rien à réveiller.
  reveiller(ms = 0) {
    if (ms) this.reveilJusqua = Math.max(this.reveilJusqua, performance.now() + ms);
    if (this.moteur && (this.veille || !ms)) this.moteur.reveiller();
  }

  choisir(n) {
    if (!niveauValide(n) || n === this.choix) return;
    this.choix = n;
    ecrire(n);
    this.evaluateur.interrompre();
    this.changer();
  }

  reevaluer() {
    const a = choisirAuto(this.mesures);
    if (this.plafond && plusLeger(a.niveau, this.plafond) !== a.niveau) {
      a.niveau = this.plafond;
      a.raisons = ['peine'];
    }
    const avant = this.auto;
    this.auto = a;
    if (avant.niveau !== a.niveau || avant.raisons.join() !== a.raisons.join()) this.changer();
  }

  changer() {
    this.appliquerClasses();
    if (this.moteur) {
      this.moteur.redimensionner();
      this.moteur.reveiller();
    }
    for (const fn of this.ecouteurs) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
  }

  appliquerClasses() {
    const c = document.documentElement.classList;
    for (const n of NIVEAUX) c.toggle('gfx-' + n, n === this.niveau);
    c.toggle('gfx-sans-focus', this.niveau !== 'maximum' && !this.aLeFocus());
  }

  // ---------------------------------------------------------------- appelé par le moteur
  // Intervalle (ms) voulu avant la prochaine image ; 0 = rythme de l'écran.
  intervalle(t) {
    const p = this.profil;
    const actif = this.forcer.actif ? 0 : t - this.derniereEntree;
    const veille = enVeille(p, { focus: this.aLeFocus(), inactifMs: actif, mouvement: this.mouvement, reveil: t < this.reveilJusqua }, INACTIF_MS);
    if (veille !== this.veille) {
      this.veille = veille;
      this.evaluateur.interrompre();
    }
    return intervalleVoulu(p, veille);
  }

  // Dessiner quand l'onglet est masqué ? (Maximum seulement, comme avant)
  dessinerMasque() {
    return this.profil.masque;
  }

  // Une image vient d'être dessinée : ms = son temps JavaScript ; mouvement = quelque chose bouge dans la scène.
  apresImage(t, ms, intervalle, mouvement) {
    this.mouvement = mouvement;
    if (document.hidden || this.veille) return;
    const pr = this.premieres;
    if (this.mesures.msImage === null) {
      if (pr.t0 === null) pr.t0 = t;
      else {
        pr.n++;
        pr.ms += ms;
        if (t - pr.t0 >= PREMIERES_MS && pr.n >= 10) {
          this.mesures.msImage = pr.ms / pr.n;
          this.reevaluer();
        }
      }
    }
    if (this.choix !== 'auto') return;
    if (this.evaluateur.noter(t, ms, intervalle) === 'baisser' && this.auto.niveau !== 'leger') {
      this.plafond = niveauEnDessous(this.auto.niveau);
      this.reevaluer();
    }
  }

  // Débogage : QG.graphismes.etat()
  etat() {
    const m = this.moteur;
    return {
      choix: this.choix, niveau: this.niveau, libelle: this.libelle(), raisons: this.auto.raisons, plafond: this.plafond,
      veille: this.veille, focus: this.aLeFocus(), mouvement: this.mouvement, mesures: { ...this.mesures },
      canvas: m ? m.canvas.width + 'x' + m.canvas.height : null, division: m ? m.division : null, zoom: m ? m.zoom : null,
    };
  }
}

export const graphismes = new Graphismes();

// ---------------------------------------------------------------- Réglages › Général › Affichage
export function blocGraphismes() {
  const g = graphismes;
  const boutons = NIVEAUX.map((n) => h('button', {
    type: 'button', role: 'radio', class: 'param-niveau', 'data-niveau': n, on: { click: () => g.choisir(n) },
  }, h('b', {}), h('small', {}, phraseNiveau(n))));
  const groupe = h('div', { class: 'param-niveaux gfx-niveaux', role: 'radiogroup', 'aria-label': t('Graphismes') }, ...boutons);
  const etat = h('small', { class: 'meta gfx-etat' });
  const maj = () => {
    if (!groupe.isConnected && groupe.dataset.vu) {
      g.ecouteurs.delete(maj);
      return;
    }
    if (groupe.isConnected) groupe.dataset.vu = '1';
    for (const b of boutons) {
      const n = b.dataset.niveau;
      const ch = n === g.choix;
      b.classList.toggle('choisi', ch);
      b.setAttribute('aria-checked', ch ? 'true' : 'false');
      b.firstChild.textContent = n === 'auto' ? t('Automatique ({niveau})', { niveau: nomNiveau(g.auto.niveau) }) : nomNiveau(n);
    }
    etat.textContent = g.choix === 'auto' && g.auto.raisons.length
      ? t('Sur cet appareil : {niveau} — {raisons}.', { niveau: g.libelle(), raisons: g.auto.raisons.map(texteRaison).join(', ') })
      : t('Sur cet appareil : {niveau}.', { niveau: g.libelle() });
  };
  g.ecouteurs.add(maj);
  maj();
  return [
    h('h4', {}, t('Affichage')),
    h('div', { class: 'param-ligne gfx-ligne' },
      h('label', { class: 'param-lib' }, t('Graphismes')),
      h('div', { class: 'param-val' },
        groupe,
        etat,
        h('small', { class: 'meta gfx-etat' }, t('Propre à cet appareil (rien n’est envoyé au serveur). Sauf en Maximum : rien n’est dessiné quand l’onglet est caché, et 5 images/s quand la fenêtre n’est pas au premier plan ou que personne ne s’en sert ; la cadence remonte dès que la souris bouge ou que quelque chose bouge dans la scène.')))),
  ];
}
