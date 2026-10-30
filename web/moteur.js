// Moteur de rendu : canvas plein écran, caméra (zoom entier quand c'est possible), boucle,
// tri en profondeur, transitions d'étage (effet d'ascenseur) et entrées souris.
// Cadence et résolution interne suivent le réglage graphique (graphismes.js, logique dans cadence.js).
import { OX, OY, LARGEUR_MONDE, HAUTEUR_MONDE } from './decor.js';
import { W, H, HW } from './carte.js';
import { Cadence, diviseurRendu, sceneEnMouvement } from './cadence.js';

const BORNES = {
  x0: OX - H * 32 - 10,
  x1: OX + W * 32 + 10,
  y0: OY - HW - 14,
  y1: OY + (W + H) * 16 + 26,
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Moteur {
  constructor(canvas, directeur, graphismes = null) {
    this.canvas = canvas;
    this.gfx = graphismes;
    this.cadence = new Cadence();
    this.raf = 0;
    this.minuteur = 0;
    this.division = 1;
    this.g = canvas.getContext('2d', { alpha: false });
    this.dir = directeur;
    this.zoom = 1;
    this.ox = 0;
    this.oy = 0;
    this.pan = { x: 0, y: 0 };
    this.zoomManuel = null;
    this.marges = { gauche: 0, droite: 0, haut: 0, bas: 0 };
    this.transition = null;
    this.onClic = null;
    this.dernier = performance.now();
    this.fond = null;
    this.glisse = null;
    this.redimensionner();
    window.addEventListener('resize', () => this.redimensionner());
    this.brancherSouris();
    this.derniereImage = 0;
    this.pret = true;
    this.programmer();
    // Si l'onglet est masqué (ou la page couverte), requestAnimationFrame s'arrête : on garde la scène à jour
    // à petit pas, sans la dessiner puisque personne ne la voit (sauf en Maximum, qui dessine toujours).
    setInterval(() => {
      const t = performance.now();
      if (t - this.derniereImage <= 400) return;
      if (this.gfx && !this.gfx.dessinerMasque()) this.avancerSeul(t);
      else this.image(t);
    }, 250);
  }

  setMarges(m) {
    Object.assign(this.marges, m);
    this.calculerCamera();
  }

  redimensionner() {
    this.dprEcran = window.devicePixelRatio || 1;
    this.fond = null;
    this.calculerCamera();
  }

  // La caméra se calcule à pleine résolution (pixels de l'écran : zoomAuto, zoomManuel et pan y restent),
  // puis se rapporte à la résolution interne : le canvas fait 1/k de l'écran (k = this.division, diviseur
  // entier du zoom, voir diviseurRendu) et le navigateur l'agrandit k fois en pixels nets.
  // this.dpr = pixels du canvas par pixel CSS (versArt) ; this.zoom, this.ox, this.oy : dans le canvas.
  calculerCamera() {
    const de = this.dprEcran || 1;
    const L = Math.max(1, Math.round(window.innerWidth * de));
    const Hc = Math.max(1, Math.round(window.innerHeight * de));
    const m = this.marges;
    const fx0 = m.gauche * de;
    const fy0 = m.haut * de;
    const fw = Math.max(50, L - (m.gauche + m.droite) * de);
    const fh = Math.max(50, Hc - (m.haut + m.bas) * de);
    const bw = BORNES.x1 - BORNES.x0;
    const bh = BORNES.y1 - BORNES.y0;
    const fit = Math.min(fw / bw, fh / bh);
    this.zoomAuto = fit >= 1 ? Math.floor(fit) : Math.max(0.4, fit);
    const zp = this.zoomManuel || this.zoomAuto;
    const k = this.gfx ? diviseurRendu(zp, L, Hc, this.gfx.profil) : 1;
    const w = Math.ceil(L / k);
    const hc = Math.ceil(Hc / k);
    const c = this.canvas;
    const change = c.width !== w || c.height !== hc;
    if (change) {
      c.width = w;
      c.height = hc;
    }
    // k > 1 : la taille CSS couvre k pixels d'écran par pixel du canvas (dépasse d'au plus k-1 pixels, masqués)
    const sw = (k === 1 ? window.innerWidth : (w * k) / de) + 'px';
    const sh = (k === 1 ? window.innerHeight : (hc * k) / de) + 'px';
    if (c.style.width !== sw) c.style.width = sw;
    if (c.style.height !== sh) c.style.height = sh;
    this.division = k;
    this.dpr = de / k;
    this.zoom = zp / k;
    const cx = (BORNES.x0 + BORNES.x1) / 2;
    const cy = (BORNES.y0 + BORNES.y1) / 2;
    this.ox = Math.round((fx0 + fw / 2 - cx * zp + this.pan.x) / k);
    this.oy = Math.round((fy0 + fh / 2 - cy * zp + this.pan.y) / k);
    // un canvas redimensionné est vide : on le redessine tout de suite (sinon noir jusqu'à la prochaine image)
    if (change && this.pret) this.image(performance.now());
  }

  versArt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * this.dpr;
    const py = (clientY - r.top) * this.dpr;
    return [(px - this.ox) / this.zoom, (py - this.oy) / this.zoom];
  }

  brancherSouris() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.glisse = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y, bouge: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (this.glisse && (e.buttons & 1)) {
        const dx = e.clientX - this.glisse.x;
        const dy = e.clientY - this.glisse.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) this.glisse.bouge = true;
        if (this.glisse.bouge) {
          this.pan.x = this.glisse.px + dx * this.dprEcran;
          this.pan.y = this.glisse.py + dy * this.dprEcran;
          this.calculerCamera();
        }
        return;
      }
      if (e.target !== c) {
        if (this.dir.survol) this.dir.survol = null;
        return;
      }
      const [ax, ay] = this.versArt(e.clientX, e.clientY);
      const trouve = this.dir.trouver(ax, ay);
      // un meuble à surprise du décor ne se trahit pas au survol : ni main, ni surbrillance
      const av = trouve && trouve.type !== 'decor' ? trouve : null;
      this.dir.survol = av ? av.id : null;
      c.style.cursor = av ? 'pointer' : 'grab';
    });
    window.addEventListener('pointerup', (e) => {
      const gl = this.glisse;
      this.glisse = null;
      if (!gl || gl.bouge || e.target !== c) return;
      const [ax, ay] = this.versArt(e.clientX, e.clientY);
      const av = this.dir.trouver(ax, ay);
      // easter egg d'un meuble du décor : l'effet se joue dans la scène, la sélection ne bouge pas
      if (av && av.type === 'decor') {
        if (this.dir.cliquerDecor(av.meuble) && this.gfx) this.gfx.reveiller(800);
        return;
      }
      if (this.onClic) this.onClic(av);
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const base = this.zoomManuel || this.zoomAuto;
      let z;
      if (e.deltaY < 0) z = base < 1 ? 1 : Math.min(5, Math.floor(base) + 1);
      else z = base <= 1 ? Math.max(0.5, this.zoomAuto < 1 ? this.zoomAuto : 0.5) : Math.ceil(base) - 1;
      this.zoomManuel = Math.abs(z - this.zoomAuto) < 0.001 ? null : z;
      this.calculerCamera();
    }, { passive: false });
    c.addEventListener('dblclick', () => this.recentrer());
  }

  // Centre la caméra sur un point de la grille avec un zoom donné (utile au débogage).
  regarder(gx, gy, z = 3) {
    this.zoomManuel = z;
    this.pan = { x: 0, y: 0 };
    this.calculerCamera();
    const ax = OX + (gx - gy) * 32;
    const ay = OY + (gx + gy) * 16 - 24;
    // en pixels de l'écran, comme le pan
    const d = this.dprEcran || 1;
    const k = this.division;
    const m = this.marges;
    const cx = m.gauche * d + (Math.round(window.innerWidth * d) - (m.gauche + m.droite) * d) / 2;
    const cy = m.haut * d + (Math.round(window.innerHeight * d) - (m.haut + m.bas) * d) / 2;
    this.pan = { x: cx - (this.ox * k + ax * z), y: cy - (this.oy * k + ay * z) };
    this.calculerCamera();
  }

  recentrer() {
    this.zoomManuel = null;
    this.pan = { x: 0, y: 0 };
    this.calculerCamera();
  }

  // Change d'étage avec un glissement vertical (sens +1 : on monte).
  changerEtage(reconstruire, sens) {
    let img = null;
    if (sens) {
      img = document.createElement('canvas');
      img.width = this.canvas.width;
      img.height = this.canvas.height;
      img.getContext('2d').drawImage(this.canvas, 0, 0);
    }
    reconstruire();
    // changement d'étage : rythme du niveau tout de suite, même en veille
    if (this.gfx) this.gfx.reveiller(800);
    if (sens) this.transition = { img, t0: performance.now(), duree: 560, sens };
    else this.dir.ouvrirAscenseur(0);
  }

  dessinerFond() {
    const c = this.canvas;
    if (!this.fond || this.fond.width !== c.width || this.fond.height !== c.height) {
      const f = document.createElement('canvas');
      f.width = c.width;
      f.height = c.height;
      const g = f.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, c.height);
      grad.addColorStop(0, '#182038');
      grad.addColorStop(1, '#090c16');
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
      const rad = g.createRadialGradient(c.width / 2, c.height * 0.45, 10, c.width / 2, c.height * 0.45, Math.max(c.width, c.height) * 0.6);
      rad.addColorStop(0, 'rgba(90,120,200,0.18)');
      rad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rad;
      g.fillRect(0, 0, c.width, c.height);
      this.fond = f;
    }
    this.g.drawImage(this.fond, 0, 0);
  }

  dessinerMonde(now, decalY = 0) {
    const g = this.g;
    const z = this.zoom;
    g.setTransform(z, 0, 0, z, this.ox, Math.round(this.oy + decalY));
    // En dessous de ×1, un lissage de qualité évite de perdre des lignes de pixels entières.
    g.imageSmoothingEnabled = z < 1;
    if (z < 1) g.imageSmoothingQuality = 'high';
    if (this.dir.couche) g.drawImage(this.dir.couche, 0, 0);
    const { monde, dessus } = this.dir.dessinables(now, z);
    monde.sort((a, b) => a.k - b.k);
    dessus.sort((a, b) => a.k - b.k);
    const dessiner = (it) => {
      const a = it.alpha === undefined ? 1 : it.alpha;
      if (a <= 0) return;
      if (a < 1) g.globalAlpha = a;
      if (it.img) g.drawImage(it.img, it.x, it.y);
      if (it.draw) it.draw(g);
      if (it.extra) for (const f of it.extra) f(g);
      if (a < 1) g.globalAlpha = 1;
    };
    for (const it of monde) dessiner(it);
    // Bulles, étiquettes et ampoules : jamais plus petites que 1 pixel d'art par pixel d'écran,
    // pour rester lisibles quand l'étage est réduit (elles restent ancrées sur l'avatar).
    const zt = z >= 1 ? z : 1;
    for (const it of dessus) {
      if (z >= 1 || it.ax === undefined || !it.img) {
        g.setTransform(z, 0, 0, z, this.ox, Math.round(this.oy + decalY));
        dessiner(it);
        continue;
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      const sx = Math.round(this.ox + it.ax * z + (it.x - it.ax) * zt);
      const sy = Math.round(this.oy + decalY + it.ay * z + (it.y - it.ay) * zt);
      const a = it.alpha === undefined ? 1 : it.alpha;
      if (a <= 0) continue;
      if (a < 1) g.globalAlpha = a;
      g.drawImage(it.img, sx, sy);
      if (a < 1) g.globalAlpha = 1;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Une image par intervalle du réglage graphique (Maximum ou sans réglage : à chaque rafraîchissement).
  boucle(t) {
    this.raf = 0;
    const intervalle = this.gfx ? this.gfx.intervalle(t) : 0;
    const cache = document.hidden && this.gfx && !this.gfx.dessinerMasque();
    if (!cache && this.cadence.doitDessiner(t, intervalle)) {
      const a = performance.now();
      this.image(t);
      if (this.gfx) this.gfx.apresImage(t, performance.now() - a, intervalle, !!this.transition || sceneEnMouvement(this.dir));
    }
    this.programmer();
  }

  // Prochaine image : au prochain rafraîchissement, ou après un minuteur quand la cadence est basse
  // (la page ne se réveille alors pas à chaque rafraîchissement de l'écran pour rien).
  programmer() {
    if (this.raf || this.minuteur) return;
    const t = performance.now();
    const attente = this.cadence.attente(t, this.gfx ? this.gfx.intervalle(t) : 0);
    if (attente > 25) {
      this.minuteur = setTimeout(() => {
        this.minuteur = 0;
        this.programmer();
      }, attente - 10);
    } else {
      this.raf = requestAnimationFrame((tt) => this.boucle(tt));
    }
  }

  // Activité (souris, événement, changement de réglage) : la prochaine image part tout de suite.
  reveiller() {
    this.cadence.reveiller();
    if (this.minuteur) {
      clearTimeout(this.minuteur);
      this.minuteur = 0;
    }
    this.programmer();
  }

  // Onglet masqué : l'état avance (avatars, programme, bulles, transition), rien n'est dessiné.
  avancerSeul(t) {
    this.derniereImage = t;
    const dt = Math.max(0, Math.min(1000, t - this.dernier));
    this.dernier = t;
    try {
      this.dir.maj(Date.now(), dt);
      const tr = this.transition;
      if (tr && t - tr.t0 >= tr.duree) {
        this.transition = null;
        this.dir.ouvrirAscenseur(tr.sens);
      }
    } catch (e) {
      console.error(e);
    }
  }

  image(t) {
    this.derniereImage = performance.now();
    if (this.gfx) this.dir.vitesseDecor = this.gfx.profil.decor;
    const dt = Math.max(0, Math.min(1000, t - this.dernier));
    this.dernier = t;
    const now = Date.now();
    try {
      this.dir.maj(now, dt);
      const g = this.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      this.dessinerFond();
      if (this.transition) {
        const tr = this.transition;
        const u = Math.min(1, (t - tr.t0) / tr.duree);
        const e = ease(u);
        const h = this.canvas.height;
        this.dessinerMonde(now, -(1 - e) * h * tr.sens);
        g.drawImage(tr.img, 0, Math.round(e * h * tr.sens));
        // dalle entre les deux étages
        const yb = tr.sens > 0 ? Math.round(e * h) : Math.round(h - e * h);
        g.fillStyle = '#05070d';
        const ep = Math.max(1, Math.round(6 / this.division));
        g.fillRect(0, yb - ep, this.canvas.width, 2 * ep);
        if (u >= 1) {
          this.transition = null;
          this.dir.ouvrirAscenseur(tr.sens);
        }
      } else {
        this.dessinerMonde(now);
      }
    } catch (e) {
      console.error(e);
    }
  }
}

export { LARGEUR_MONDE, HAUTEUR_MONDE };
