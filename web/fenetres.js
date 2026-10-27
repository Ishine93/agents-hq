// Fenêtres flottantes du QG (plan, terminal, navigateur, discussion, vieil écran…) : déplaçables par leur
// barre de titre, redimensionnables par les bords et les coins, zoomables, plusieurs ouvertes à la fois
// (la dernière cliquée passe devant). Position, taille et zoom sont gardés par fenêtre dans ce navigateur.
// Elles restent dans l'écran quand il change de taille ; sur un petit écran, elles prennent toute la largeur.
import { h } from './modale.js';
import { t as tr } from './i18n.js';

const CLE = 'qg.fenetres';
let zDevant = 40;
const ouvertes = new Set();

function lireTout() {
  try {
    return JSON.parse(localStorage.getItem(CLE) || '{}') || {};
  } catch {
    return {};
  }
}
function garder(cle, v) {
  if (!cle) return;
  try {
    const tout = lireTout();
    tout[cle] = { ...(tout[cle] || {}), ...v };
    localStorage.setItem(CLE, JSON.stringify(tout));
  } catch {
    /* navigation privée : rien de gardé */
  }
}

// Places par défaut, pour qu'on puisse en ouvrir plusieurs sans qu'elles se recouvrent.
function placeParDefaut(coin, w, hgt) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const m = 16;
  const haut = 64;
  switch (coin) {
    case 'haut-gauche': return { x: m + 220, y: haut };
    case 'haut-droite': return { x: W - w - m - 20, y: haut };
    case 'bas-gauche': return { x: m + 220, y: H - hgt - 90 };
    case 'bas-droite': return { x: W - w - m - 20, y: H - hgt - 90 };
    default: return { x: Math.round((W - w) / 2), y: Math.max(haut, Math.round((H - hgt) / 2)) };
  }
}

export class Fenetre {
  /**
   * cle : nom sous lequel la place est gardée ; coin : place par défaut ('centre', 'haut-gauche'…)
   * outils : éléments en plus dans la barre de titre ; surFermer : appelé à la fermeture.
   */
  constructor({ cle, titre = '', classe = '', largeur = 640, hauteur = 420, min = [300, 160], coin = 'centre', zoomable = true, outils = [], surFermer = null }) {
    this.cle = cle;
    this.min = min;
    this.surFermer = surFermer;
    this.zoom = 1;
    this.titreEl = h('span', { class: 'fen-titre' }, titre);
    this.bNiveau = h('button', { class: 'fen-b fen-niveau', type: 'button', title: tr('Taille normale'), on: { click: () => this.zoomer(0) } }, '100 %');
    const zoom = zoomable ? [
      h('button', { class: 'fen-b', type: 'button', title: tr('Dézoomer'), on: { click: () => this.zoomer(1 / 1.15) } }, '−'),
      this.bNiveau,
      h('button', { class: 'fen-b', type: 'button', title: tr('Zoomer'), on: { click: () => this.zoomer(1.15) } }, '+'),
    ] : [];
    this.outils = h('span', { class: 'fen-outils' }, outils);
    this.tete = h('div', { class: 'fen-tete' }, this.titreEl, this.outils, h('span', { class: 'fen-zoom' }, zoom),
      h('button', { class: 'fen-b', type: 'button', title: tr('Réduire la fenêtre'), on: { click: () => this.reduire() } }, '–'),
      h('button', { class: 'fen-b fen-fermer', type: 'button', title: tr('Fermer'), on: { click: () => this.fermer() } }, '×'));
    this.corps = h('div', { class: 'fen-corps' });
    const poignees = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => h('div', { class: 'fen-poignee fen-' + d, 'data-d': d }));
    this.el = h('div', { class: 'fen ' + classe, hidden: true, role: 'dialog', 'aria-label': titre }, this.tete, this.corps, poignees);
    this.el.addEventListener('pointerdown', () => this.devant(), true);
    this.glisser();
    for (const p of poignees) this.redimensionner(p);
    const g = lireTout()[cle] || {};
    const w = g.w || largeur;
    const hgt = g.h || hauteur;
    const p = g.x !== undefined ? { x: g.x, y: g.y } : placeParDefaut(coin, w, hgt);
    Object.assign(this.el.style, { left: p.x + 'px', top: p.y + 'px', width: w + 'px', height: hgt + 'px' });
    if (g.zoom) this.appliquerZoom(g.zoom);
    document.body.appendChild(this.el);
  }

  get ouvert() {
    return !this.el.hidden;
  }

  definirTitre(texte) {
    this.titreEl.textContent = texte;
    this.el.setAttribute('aria-label', texte);
  }

  ouvrir() {
    this.el.hidden = false;
    this.el.classList.remove('reduite');
    ouvertes.add(this);
    this.dansEcran();
    this.devant();
  }

  fermer() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    ouvertes.delete(this);
    this.surFermer?.();
  }

  // Réduite : seule la barre de titre reste (une vidéo, un direct continuent).
  reduire() {
    this.el.classList.toggle('reduite');
  }

  devant() {
    this.el.style.zIndex = String(++zDevant);
  }

  zoomer(f) {
    this.appliquerZoom(f === 0 ? 1 : Math.max(0.5, Math.min(2.5, Math.round(this.zoom * f * 100) / 100)));
    garder(this.cle, { zoom: this.zoom });
  }

  appliquerZoom(z) {
    this.zoom = z;
    this.corps.style.zoom = String(z);
    this.bNiveau.textContent = Math.round(z * 100) + ' %';
  }

  // Dans l'écran : la fenêtre (et donc ses boutons) reste visible ; trop grande, elle rétrécit.
  dansEcran() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (this.el.offsetWidth > W) this.el.style.width = W + 'px';
    if (this.el.offsetHeight > H) this.el.style.height = H - 10 + 'px';
    const r = this.el.getBoundingClientRect();
    const x = Math.max(0, Math.min(W - r.width, r.left));
    const y = Math.max(0, Math.min(H - Math.min(r.height, 60), r.top));
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
  }

  glisser() {
    let d = null;
    this.tete.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button, input, select, a')) return;
      const r = this.el.getBoundingClientRect();
      d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      this.tete.setPointerCapture(e.pointerId);
      this.el.classList.add('bouge');
    });
    this.tete.addEventListener('pointermove', (e) => {
      if (!d) return;
      this.el.style.left = Math.max(-this.el.offsetWidth + 120, Math.min(window.innerWidth - 120, e.clientX - d.dx)) + 'px';
      this.el.style.top = Math.max(0, Math.min(window.innerHeight - 36, e.clientY - d.dy)) + 'px';
    });
    const fin = () => {
      if (!d) return;
      d = null;
      this.el.classList.remove('bouge');
      garder(this.cle, { x: this.el.offsetLeft, y: this.el.offsetTop });
    };
    this.tete.addEventListener('pointerup', fin);
    this.tete.addEventListener('pointercancel', fin);
    this.tete.addEventListener('dblclick', (e) => {
      if (!e.target.closest('button, input, select')) this.reduire();
    });
  }

  redimensionner(p) {
    let d = null;
    const dir = p.dataset.d;
    p.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      d = { x: e.clientX, y: e.clientY, l: this.el.offsetLeft, t: this.el.offsetTop, w: this.el.offsetWidth, h: this.el.offsetHeight };
      p.setPointerCapture(e.pointerId);
      this.el.classList.add('bouge');
    });
    p.addEventListener('pointermove', (e) => {
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      let { l, t, w, h: hh } = d;
      if (dir.includes('e')) w = d.w + dx;
      if (dir.includes('s')) hh = d.h + dy;
      if (dir.includes('w')) {
        w = d.w - dx;
        l = d.l + dx;
      }
      if (dir.includes('n')) {
        hh = d.h - dy;
        t = d.t + dy;
      }
      if (w < this.min[0]) {
        if (dir.includes('w')) l -= this.min[0] - w;
        w = this.min[0];
      }
      if (hh < this.min[1]) {
        if (dir.includes('n')) t -= this.min[1] - hh;
        hh = this.min[1];
      }
      Object.assign(this.el.style, { left: l + 'px', top: Math.max(0, t) + 'px', width: w + 'px', height: hh + 'px' });
    });
    const fin = () => {
      if (!d) return;
      d = null;
      this.el.classList.remove('bouge');
      garder(this.cle, { x: this.el.offsetLeft, y: this.el.offsetTop, w: this.el.offsetWidth, h: this.el.offsetHeight });
    };
    p.addEventListener('pointerup', fin);
    p.addEventListener('pointercancel', fin);
  }
}

// Échap ferme la fenêtre de devant (si le curseur n'est pas dans un champ de saisie d'une autre zone).
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !ouvertes.size) return;
  const devant = [...ouvertes].sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex))[0];
  if (!devant || (document.activeElement && !devant.el.contains(document.activeElement) && document.activeElement.closest('input, textarea'))) return;
  e.stopPropagation();
  devant.fermer();
});
window.addEventListener('resize', () => {
  for (const f of ouvertes) f.dansEcran();
});
