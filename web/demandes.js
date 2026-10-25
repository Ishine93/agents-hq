// Pile des demandes (mains levées, permissions, questions des agents) : déplaçable par sa poignée, à l'endroit
// que tu veux (en haut à gauche, en haut à droite…). Elle y reste pour les demandes suivantes, et se remplit
// vers le bas quand elle est en haut de l'écran, vers le haut quand elle est en bas. ↺ la remet à sa place.
import { t as tr } from './i18n.js';

const CLE = 'qg.demandes';

function lire() {
  try {
    return JSON.parse(localStorage.getItem(CLE) || 'null');
  } catch {
    return null;
  }
}
function ecrire(v) {
  try {
    if (v) localStorage.setItem(CLE, JSON.stringify(v));
    else localStorage.removeItem(CLE);
  } catch {
    /* navigation privée */
  }
}

export function brancherDemandes() {
  const boite = document.getElementById('demandes-boite');
  const poignee = document.getElementById('demandes-poignee');
  if (!boite || !poignee) return () => {};
  const libelle = document.createElement('span');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'demandes-reset';
  reset.textContent = '↺';
  poignee.append(libelle, reset);

  // place gardée : { h: 'gauche' | 'droite', v: 'haut' | 'bas', x, y } (distances au bord choisi)
  const appliquer = () => {
    const p = lire();
    const s = boite.style;
    boite.classList.toggle('placee', !!p);
    boite.classList.toggle('haut', !!p && p.v === 'haut');
    reset.hidden = !p;
    if (!p) {
      s.left = s.right = s.top = s.bottom = '';
      return;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    const x = Math.max(0, Math.min(W - 120, p.x));
    const y = Math.max(0, Math.min(H - 60, p.y));
    s.left = p.h === 'gauche' ? x + 'px' : 'auto';
    s.right = p.h === 'droite' ? x + 'px' : 'auto';
    s.top = p.v === 'haut' ? y + 'px' : 'auto';
    s.bottom = p.v === 'bas' ? y + 'px' : 'auto';
  };

  let d = null;
  poignee.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target === reset) return;
    const r = boite.getBoundingClientRect();
    d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    poignee.setPointerCapture(e.pointerId);
    boite.classList.add('bouge');
    Object.assign(boite.style, { left: r.left + 'px', top: r.top + 'px', right: 'auto', bottom: 'auto' });
  });
  poignee.addEventListener('pointermove', (e) => {
    if (!d) return;
    boite.style.left = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - d.dx)) + 'px';
    boite.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - d.dy)) + 'px';
  });
  const fin = () => {
    if (!d) return;
    d = null;
    boite.classList.remove('bouge');
    const r = boite.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    // on s'accroche au bord le plus proche : la pile grandit vers le milieu de l'écran
    const h = r.left + r.width / 2 < W / 2 ? 'gauche' : 'droite';
    const v = r.top + Math.min(r.height, 120) / 2 < H / 2 ? 'haut' : 'bas';
    ecrire({ h, v, x: Math.round(h === 'gauche' ? r.left : W - r.right), y: Math.round(v === 'haut' ? r.top : H - r.bottom) });
    appliquer();
  };
  poignee.addEventListener('pointerup', fin);
  poignee.addEventListener('pointercancel', fin);
  reset.addEventListener('click', () => {
    ecrire(null);
    appliquer();
  });
  window.addEventListener('resize', appliquer);
  appliquer();

  // appelé à chaque mise à jour des cartes : la poignée n'apparaît que s'il y a des demandes
  return (n) => {
    poignee.hidden = !n;
    libelle.textContent = '✋ ' + tr('{n} demande(s) — glisse ici pour déplacer', { n });
    poignee.title = tr('Glisse pour placer les demandes où tu veux ; elles y restent.');
    reset.title = tr('Remettre les demandes à leur place');
  };
}
