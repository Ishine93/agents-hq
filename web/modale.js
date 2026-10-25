// Fenêtres par-dessus le QG (réglages, consommation, visionneur de fichiers, premier lancement).
// Échap ou clic sur le fond pour fermer (sauf si `bloquante`).
import { t } from './i18n.js';

export function h(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'style') Object.assign(e.style, v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of enfants.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return e;
}

const ouvertes = [];
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !ouvertes.length) return;
  const m = ouvertes[ouvertes.length - 1];
  if (m.bloquante) return;
  e.stopPropagation();
  m.fermer();
}, true);

export const modaleOuverte = () => ouvertes.length > 0;

/**
 * @returns {{ fond, boite, tete, corps, pied, fermer, titre(t) }}
 */
export function ouvrirModale({ titre = '', classe = '', bloquante = false, surFermer = null } = {}) {
  const corps = h('div', { class: 'modale-corps' });
  const pied = h('div', { class: 'modale-pied', hidden: true });
  const libelle = h('span', { class: 'modale-titre' }, titre);
  const bFermer = h('button', { class: 'modale-fermer', type: 'button', title: t('Fermer (Échap)'), 'aria-label': t('Fermer') }, '×');
  const tete = h('div', { class: 'modale-tete' }, libelle, h('span', { class: 'modale-outils' }), bloquante ? null : bFermer);
  const boite = h('div', { class: 'modale-boite ' + classe, role: 'dialog', 'aria-modal': 'true', 'aria-label': titre }, tete, corps, pied);
  const fond = h('div', { class: 'modale-fond' }, boite);
  const m = {
    fond, boite, tete, corps, pied, bloquante,
    outils: tete.querySelector('.modale-outils'),
    titre: (x) => (libelle.textContent = x),
    fermer: () => {
      const i = ouvertes.indexOf(m);
      if (i >= 0) ouvertes.splice(i, 1);
      fond.remove();
      surFermer?.();
    },
  };
  bFermer.addEventListener('click', () => m.fermer());
  if (!bloquante) {
    fond.addEventListener('mousedown', (e) => {
      if (e.target === fond) m.fermer();
    });
  }
  ouvertes.push(m);
  document.body.appendChild(fond);
  return m;
}

/** Petit appel à l'API du QG (jeton en cookie). */
export async function api(route, corps = undefined, { methode = null, brut = null, type = null } = {}) {
  const opts = { method: methode || (corps !== undefined || brut ? 'POST' : 'GET'), headers: {} };
  if (brut) {
    opts.body = brut;
    if (type) opts.headers['Content-Type'] = type;
  } else if (corps !== undefined) {
    opts.body = JSON.stringify(corps);
    opts.headers['Content-Type'] = 'application/json';
  }
  const r = await fetch(route, opts);
  let j = null;
  try {
    j = await r.json();
  } catch {
    j = null;
  }
  if (!r.ok) throw new Error((j && j.erreur) || 'HTTP ' + r.status);
  return j;
}

export const fmtTokens = (n) => {
  const v = Math.round(n || 0);
  if (v >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' G';
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace('.', ',') + ' M';
  if (v >= 1e4) return Math.round(v / 1000) + ' k';
  if (v >= 1000) return (v / 1000).toFixed(1).replace('.', ',') + ' k';
  return String(v);
};
