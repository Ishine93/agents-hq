// Visionneuse plein écran : zoom (molette, boutons), déplacement à la souris,
// flèches pour passer d'une image à l'autre du même message, Échap pour fermer.
import { t } from './i18n.js';

const ZMIN = 0.1;
const ZMAX = 16;

export class Visionneuse {
  constructor() {
    this.pieces = [];
    this.i = 0;
    this.z = 1;
    this.x = 0;
    this.y = 0;
    this.glisse = null;
    this.construire();
  }

  construire() {
    const el = (tag, cls, txt) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt !== undefined) e.textContent = txt;
      return e;
    };
    const fond = el('div', 'visionneuse');
    fond.hidden = true;
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-modal', 'true');
    // data-t-* : traduireStatique (i18n.js) refait les libellés quand la langue change.
    fond.setAttribute('aria-label', t('Visionneuse d’images'));
    fond.dataset.tAria = 'Visionneuse d’images';
    const scene = el('div', 'vis-scene');
    const img = el('img', 'vis-image');
    img.alt = '';
    img.draggable = false;
    scene.appendChild(img);
    const barre = el('div', 'vis-barre');
    const bouton = (txt, titre, fn) => {
      const b = el('button', 'vis-bouton', txt);
      b.type = 'button';
      b.title = t(titre);
      b.setAttribute('aria-label', t(titre));
      b.dataset.tTitle = titre;
      b.dataset.tAria = titre;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      return b;
    };
    this.bPrec = bouton('◀', 'Image précédente (←)', () => this.aller(-1));
    this.compteur = el('span', 'vis-compteur');
    this.bSuiv = bouton('▶', 'Image suivante (→)', () => this.aller(1));
    const bMoins = bouton('−', 'Dézoomer (molette)', () => this.zoomer(1 / 1.25));
    this.niveau = el('span', 'vis-niveau');
    const bPlus = bouton('+', 'Zoomer (molette)', () => this.zoomer(1.25));
    const bAjuster = bouton(t('Ajuster'), 'Ajuster à l’écran (0)', () => this.ajuster());
    bAjuster.dataset.tFr = 'Ajuster';
    bAjuster.dataset.t = '';
    const bReel = bouton('1:1', 'Taille réelle (1)', () => this.reel());
    const bFermer = bouton('×', 'Fermer (Échap)', () => this.fermer());
    bFermer.classList.add('fermer');
    barre.append(this.bPrec, this.compteur, this.bSuiv, bMoins, this.niveau, bPlus, bAjuster, bReel, bFermer);
    this.legende = el('div', 'vis-legende');
    fond.append(scene, barre, this.legende);
    document.body.appendChild(fond);
    this.fond = fond;
    this.scene = scene;
    this.img = img;

    img.addEventListener('load', () => this.ajuster());
    scene.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = scene.getBoundingClientRect();
      this.zoomer(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    }, { passive: false });
    scene.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.glisse = { x: e.clientX, y: e.clientY, ox: this.x, oy: this.y, bouge: false };
      scene.setPointerCapture(e.pointerId);
      scene.classList.add('saisie');
    });
    scene.addEventListener('pointermove', (e) => {
      if (!this.glisse) return;
      const dx = e.clientX - this.glisse.x;
      const dy = e.clientY - this.glisse.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.glisse.bouge = true;
      this.x = this.glisse.ox + dx;
      this.y = this.glisse.oy + dy;
      this.appliquer();
    });
    const lacher = (e) => {
      if (!this.glisse) return;
      const g = this.glisse;
      this.glisse = null;
      scene.classList.remove('saisie');
      // un clic sur le fond (hors image, sans glisser) ferme
      if (!g.bouge && e.target === scene) this.fermer();
    };
    scene.addEventListener('pointerup', lacher);
    scene.addEventListener('pointercancel', lacher);
    scene.addEventListener('dblclick', () => (Math.abs(this.z - this.zAjuste) < 0.01 ? this.reel() : this.ajuster()));
    window.addEventListener('keydown', (e) => {
      if (this.fond.hidden) return;
      const k = e.key;
      if (k === 'Escape') this.fermer();
      else if (k === 'ArrowLeft') this.aller(-1);
      else if (k === 'ArrowRight') this.aller(1);
      else if (k === '+' || k === '=') this.zoomer(1.25);
      else if (k === '-') this.zoomer(1 / 1.25);
      else if (k === '0') this.ajuster();
      else if (k === '1') this.reel();
      else return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  ouvrir(pieces, index = 0) {
    this.pieces = (pieces || []).filter((p) => p && p.url);
    if (!this.pieces.length) return;
    this.retourFocus = document.activeElement;
    this.fond.hidden = false;
    this.afficher(Math.max(0, Math.min(this.pieces.length - 1, index)));
    this.fond.querySelector('.fermer').focus();
  }

  fermer() {
    this.fond.hidden = true;
    this.img.removeAttribute('src');
    if (this.retourFocus && this.retourFocus.focus) this.retourFocus.focus();
  }

  get ouverte() {
    return !this.fond.hidden;
  }

  aller(d) {
    if (this.pieces.length < 2) return;
    this.afficher((this.i + d + this.pieces.length) % this.pieces.length);
  }

  afficher(i) {
    this.i = i;
    const p = this.pieces[i];
    this.img.src = p.url;
    this.img.alt = p.legende || p.nom || t('image');
    const plusieurs = this.pieces.length > 1;
    this.bPrec.hidden = !plusieurs;
    this.bSuiv.hidden = !plusieurs;
    this.compteur.hidden = !plusieurs;
    this.compteur.textContent = i + 1 + ' / ' + this.pieces.length;
    const origine = p.origine === 'agent' ? t('Image d’un agent') : p.origine === 'toi' ? t('Ton image') : '';
    this.legende.textContent = [p.legende, p.nom, origine].filter(Boolean).join(' — ');
    if (this.img.complete && this.img.naturalWidth) this.ajuster();
  }

  ajuster() {
    const w = this.img.naturalWidth || 1;
    const h = this.img.naturalHeight || 1;
    const r = this.scene.getBoundingClientRect();
    this.zAjuste = Math.min(1, (r.width - 40) / w, (r.height - 40) / h);
    if (!isFinite(this.zAjuste) || this.zAjuste <= 0) this.zAjuste = 1;
    this.z = this.zAjuste;
    this.x = 0;
    this.y = 0;
    this.appliquer();
  }

  reel() {
    this.z = 1;
    this.x = 0;
    this.y = 0;
    this.appliquer();
  }

  // Zoom autour d'un point (coordonnées relatives au centre de la scène).
  zoomer(f, cx = 0, cy = 0) {
    const z = Math.max(ZMIN, Math.min(ZMAX, this.z * f));
    const k = z / this.z;
    this.x = cx - (cx - this.x) * k;
    this.y = cy - (cy - this.y) * k;
    this.z = z;
    this.appliquer();
  }

  appliquer() {
    const w = this.img.naturalWidth || 0;
    const h = this.img.naturalHeight || 0;
    this.img.style.width = w + 'px';
    this.img.style.height = h + 'px';
    this.img.style.transform = 'translate(-50%, -50%) translate(' + this.x + 'px, ' + this.y + 'px) scale(' + this.z + ')';
    // pixels nets quand on agrandit (captures, pixel art)
    this.img.style.imageRendering = this.z >= 2 ? 'pixelated' : 'auto';
    this.niveau.textContent = t('{n} %', { n: Math.round(this.z * 100) });
  }
}
