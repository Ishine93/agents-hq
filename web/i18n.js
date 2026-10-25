// Langue de l'interface. Le texte source est le français : t('Envoyer') renvoie sa traduction dans la
// langue choisie (dictionnaire web/i18n/<langue>.js), ou le français si elle manque.
// Les textes de index.html portent data-t (contenu), data-t-title, data-t-placeholder ou data-t-aria.
import EN from './i18n/en.js';

const DICOS = { en: EN };
export const LANGUES_INTERFACE = [
  { id: 'fr', nom: 'Français' },
  { id: 'en', nom: 'English' },
];
export const LANGUES_IA = [
  { id: 'fr', nom: 'Français' },
  { id: 'en', nom: 'English' },
  { id: 'es', nom: 'Español' },
  { id: 'de', nom: 'Deutsch' },
  { id: 'it', nom: 'Italiano' },
  { id: 'pt', nom: 'Português' },
  { id: 'nl', nom: 'Nederlands' },
  { id: 'pl', nom: 'Polski' },
];

let langue = 'fr';
try {
  langue = localStorage.getItem('qg-langue') || 'fr';
} catch {
  langue = 'fr';
}
document.documentElement.lang = langue;

export const langueCourante = () => langue;
export const locale = () => (langue === 'fr' ? 'fr-FR' : langue === 'en' ? 'en-GB' : langue);

/** Traduit un texte source français ; {cle} est remplacé par vars.cle. */
export function t(fr, vars = null) {
  let s = (langue !== 'fr' && DICOS[langue] && DICOS[langue][fr]) || fr;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  return s;
}

/** Pluriel simple : tn(n, '{n} tâche', '{n} tâches'). */
export const tn = (n, un, plusieurs) => t(n > 1 ? plusieurs : un, { n });

const ATTRS = [
  ['tTitle', 'title'],
  ['tPlaceholder', 'placeholder'],
  ['tAria', 'aria-label'],
];

export function traduireStatique(racine = document) {
  for (const e of racine.querySelectorAll('[data-t]')) {
    if (e.dataset.tFr === undefined) e.dataset.tFr = e.textContent;
    e.textContent = t(e.dataset.tFr);
  }
  for (const [cle, attr] of ATTRS) {
    const sel = '[data-' + cle.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ']';
    for (const e of racine.querySelectorAll(sel)) e.setAttribute(attr, t(e.dataset[cle]));
  }
  document.title = t('QG des agents');
}

/** Change la langue (mémorisée dans ce navigateur) ; le site se redessine. */
export function definirLangue(l) {
  if (!LANGUES_INTERFACE.some((x) => x.id === l)) return;
  langue = l;
  document.documentElement.lang = l;
  try {
    localStorage.setItem('qg-langue', l);
  } catch {
    /* stockage indisponible */
  }
  traduireStatique();
}
