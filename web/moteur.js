// Moteur de rendu : canvas plein écran, caméra (zoom entier quand c'est possible), boucle,
// tri en profondeur, transitions d'étage (effet d'ascenseur) et entrées souris.
import { OX, OY, LARGEUR_MONDE, HAUTEUR_MONDE } from './decor.js';
import { W, H, HW } from './carte.js';

const BORNES = {
  x0: OX - H * 32 - 10,
  x1: OX + W * 32 + 10,
  y0: OY - HW - 14,
  y1: OY + (W + H) * 16 + 26,
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Moteur {
  constructor(canvas, directeur) {
    this.canvas = canvas;
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
    requestAnimationFrame((t) => this.boucle(t));
    // Si l'onglet est masqué, requestAnimationFrame s'arrête : on garde la scène à jour à petit pas.
    setInterval(() => {
      if (performance.now() - this.derniereImage > 400) this.image(performance.now());
    }, 250);
  }

  setMarges(m) {
    Object.assign(this.marges, m);
    this.calculerCamera();
  }

  redimensionner() {
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    const w = Math.max(1, Math.round(window.innerWidth * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.fond = null;
    this.calculerCamera();
  }

  calculerCamera() {
    const d = this.dpr || 1;
    const m = this.marges;
    const fx0 = m.gauche * d;
    const fy0 = m.haut * d;
    const fw = Math.max(50, this.canvas.width - (m.gauche + m.droite) * d);
    const fh = Math.max(50, this.canvas.height - (m.haut + m.bas) * d);
    const bw = BORNES.x1 - BORNES.x0;
    const bh = BORNES.y1 - BORNES.y0;
    const fit = Math.min(fw / bw, fh / bh);
    this.zoomAuto = fit >= 1 ? Math.floor(fit) : Math.max(0.4, fit);
    this.zoom = this.zoomManuel || this.zoomAuto;
    const cx = (BORNES.x0 + BORNES.x1) / 2;
    const cy = (BORNES.y0 + BORNES.y1) / 2;
    this.ox = Math.round(fx0 + fw / 2 - cx * this.zoom + this.pan.x);
    this.oy = Math.round(fy0 + fh / 2 - cy * this.zoom + this.pan.y);
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
          this.pan.x = this.glisse.px + dx * this.dpr;
          this.pan.y = this.glisse.py + dy * this.dpr;
          this.calculerCamera();
        }
        return;
      }
      if (e.target !== c) {
        if (this.dir.survol) this.dir.survol = null;
        return;
      }
      const [ax, ay] = this.versArt(e.clientX, e.clientY);
      const av = this.dir.trouver(ax, ay);
      this.dir.survol = av ? av.id : null;
      c.style.cursor = av ? 'pointer' : 'grab';
    });
    window.addEventListener('pointerup', (e) => {
      const gl = this.glisse;
      this.glisse = null;
      if (!gl || gl.bouge || e.target !== c) return;
      const [ax, ay] = this.versArt(e.clientX, e.clientY);
      const av = this.dir.trouver(ax, ay);
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
    const d = this.dpr || 1;
    const m = this.marges;
    const cx = m.gauche * d + (this.canvas.width - (m.gauche + m.droite) * d) / 2;
    const cy = m.haut * d + (this.canvas.height - (m.haut + m.bas) * d) / 2;
    this.pan = { x: cx - (this.ox + ax * z), y: cy - (this.oy + ay * z) };
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

  boucle(t) {
    this.image(t);
    requestAnimationFrame((tt) => this.boucle(tt));
  }

  image(t) {
    this.derniereImage = performance.now();
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
        g.fillRect(0, yb - 6, this.canvas.width, 12);
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
