// Bulles « i » (1.0.7) : un petit bouton rond à côté d'un libellé ouvre, juste en dessous, une explication en clair
// (à quoi sert le réglage, ce que fait chaque choix, des exemples). Une bulle ouverte le reste quand la fenêtre se redessine.
import { h } from './modale.js';
import { t } from './i18n.js';

const ouvertes = new Set();
let suivant = 0;

// Contenu : texte, nœud, ou liste de textes / nœuds / [titre, texte] (titre en gras).
function paragraphes(contenu) {
  return (Array.isArray(contenu) ? contenu : [contenu]).filter(Boolean).map((x) => {
    if (typeof x === 'string') return h('p', {}, x);
    if (Array.isArray(x)) return h('p', {}, h('b', {}, x[0]), ' ', ...x.slice(1));
    return x;
  });
}

// Un choix d'une liste : ce qu'il fait, ce qu'il apporte (+), ce qu'il coûte (−).
export const choixAide = (nom, quoi, plus = null, moins = null) => h('div', { class: 'aide-choix' },
  h('b', {}, nom), ' ', quoi,
  plus ? h('div', { class: 'aide-plus' }, h('span', { 'aria-hidden': 'true' }, '＋ '), plus) : null,
  moins ? h('div', { class: 'aide-moins' }, h('span', { 'aria-hidden': 'true' }, '－ '), moins) : null);

// Une valeur d'un nombre (0, 1, vide…) et son effet.
export const valeurAide = (valeur, effet) => h('div', { class: 'aide-valeur' }, h('code', {}, valeur), ' ', effet);

// Un exemple d'utilisation, en italique.
export const exempleAide = (texte) => h('div', { class: 'aide-exemple' }, h('span', {}, t('Exemple :')), ' ', texte);

/** Bouton « i » et son panneau. cle : nom stable (état ouvert gardé d'un redessin à l'autre). */
export function bulle(cle, contenu, { titre = null } = {}) {
  const id = 'aide-' + (++suivant);
  const ouverte = ouvertes.has(cle);
  const panneau = h('div', { class: 'aide-i', id, role: 'note', hidden: ouverte ? null : true }, ...paragraphes(contenu));
  const bouton = h('button', {
    type: 'button', class: 'bouton-i' + (ouverte ? ' ouvert' : ''), 'aria-expanded': ouverte ? 'true' : 'false', 'aria-controls': id,
    title: titre ? t('Explication : {sujet}', { sujet: titre }) : t('Explication'), 'aria-label': titre ? t('Explication : {sujet}', { sujet: titre }) : t('Explication'),
    on: { click: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ouvrir = panneau.hidden;
      panneau.hidden = !ouvrir;
      bouton.classList.toggle('ouvert', ouvrir);
      bouton.setAttribute('aria-expanded', ouvrir ? 'true' : 'false');
      if (ouvrir) ouvertes.add(cle);
      else ouvertes.delete(cle);
    } },
  }, 'i');
  return { bouton, panneau };
}

/** Ligne de réglage (comme `ligne`) avec un « i » après le libellé ; l'explication s'ouvre sous toute la ligne. */
export function ligneI(cle, lib, aide, ...contenu) {
  const b = aide ? bulle(cle, aide, { titre: lib }) : null;
  return h('div', { class: 'param-ligne' },
    h('div', { class: 'param-lib' }, h('span', {}, lib), b ? b.bouton : null),
    h('div', { class: 'param-val' }, ...contenu),
    b ? b.panneau : null);
}

/** Titre de rubrique (h4) avec un « i » ; renvoie [titre, panneau]. */
export function titreI(cle, texte, aide) {
  const b = bulle(cle, aide, { titre: texte });
  return [h('h4', { class: 'titre-i' }, texte, b.bouton), b.panneau];
}
