// Visionneur de fichiers : les .md s'affichent mis en forme (titres, gras, tableaux…), les autres
// fichiers texte en code. « Documents » liste les .md d'un étage, du plus récent au plus ancien :
// ce que les agents viennent d'écrire est en tête. Lecture seule.
import { h, ouvrirModale, api } from './modale.js';
import { md } from './markdown.js';
import { t, locale, langueCourante } from './i18n.js';

const date = (ms) => new Date(ms).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const taille = (o) => {
  const [u, ku, mu] = langueCourante() === 'fr' ? ['o', 'ko', 'Mo'] : ['B', 'KB', 'MB'];
  return o > 1048576 ? (o / 1048576).toFixed(1) + ' ' + mu : o > 1024 ? Math.round(o / 1024) + ' ' + ku : o + ' ' + u;
};

export class Lecteur {
  constructor(store) {
    this.store = store;
    this.m = null;
    this.historique = [];
  }

  get ouvert() {
    return !!this.m;
  }

  fenetre() {
    if (this.m) return this.m;
    this.m = ouvrirModale({ titre: t('Documents'), classe: 'lecteur', surFermer: () => (this.m = null) });
    try {
      const l = Number(localStorage.getItem('qg-lecteur-police'));
      if (l) this.m.corps.style.fontSize = l + 'px';
    } catch {
      /* rien */
    }
    const police = (d) => {
      const actuel = parseFloat(getComputedStyle(this.m.corps).fontSize) || 14;
      const n = Math.max(11, Math.min(22, actuel + d));
      this.m.corps.style.fontSize = n + 'px';
      try {
        localStorage.setItem('qg-lecteur-police', String(n));
      } catch {
        /* rien */
      }
    };
    this.m.outils.append(
      h('button', { class: 'petit', type: 'button', title: t('Texte plus petit'), on: { click: () => police(-1) } }, 'A−'),
      h('button', { class: 'petit', type: 'button', title: t('Texte plus grand'), on: { click: () => police(1) } }, 'A+'),
    );
    return this.m;
  }

  /** Ouvre un fichier ; `etage` sert à résoudre un chemin relatif (fichiers rapportés par un agent). */
  async ouvrir(chemin, etage = null, { garder = true } = {}) {
    const m = this.fenetre();
    if (garder && this.courant) this.historique.push(this.courant);
    this.courant = { type: 'fichier', chemin, etage };
    m.titre(chemin.split(/[\\/]/).pop());
    m.corps.replaceChildren(h('div', { class: 'vide' }, t('Chargement…')));
    let f;
    try {
      f = await api('/api/fichier?chemin=' + encodeURIComponent(chemin) + (etage ? '&etage=' + encodeURIComponent(etage) : ''));
    } catch (e) {
      m.corps.replaceChildren(this.barre(), h('div', { class: 'vide erreur' }, t('Impossible d’ouvrir ce fichier : {raison}', { raison: e.message })));
      return;
    }
    const estMd = /\.(md|markdown)$/i.test(f.nom);
    const contenu = estMd
      ? md(f.contenu, { titres: 'plein', classe: 'md-document', fichier: (c) => this.ouvrir(this.relatif(f.chemin, c), null) })
      : h('pre', { class: 'md-code lecteur-code' }, h('code', {}, f.contenu));
    m.corps.replaceChildren(
      this.barre(),
      h('div', { class: 'lecteur-meta' }, h('code', { title: f.chemin }, f.chemin), ' · ', taille(f.taille), ' · ', t('modifié le {date}', { date: date(f.modifie) })),
      contenu,
    );
    m.corps.scrollTop = 0;
  }

  // Lien relatif dans un .md (ex. « voir ./annexes/plan.md ») : résolu depuis le dossier du fichier.
  relatif(base, cible) {
    if (/^[A-Za-z]:[\\/]/.test(cible)) return cible;
    const dossier = base.replace(/[\\/][^\\/]*$/, '');
    const parts = (dossier + '\\' + cible.replace(/\//g, '\\')).split('\\');
    const out = [];
    for (const p of parts) {
      if (p === '..') out.pop();
      else if (p && p !== '.') out.push(p);
    }
    return out.join('\\');
  }

  barre() {
    const b = h('div', { class: 'lecteur-barre' });
    if (this.historique.length) {
      b.append(h('button', { class: 'petit', type: 'button', on: { click: () => this.retour() } }, '← ' + t('Retour')));
    }
    if (this.courant?.type === 'fichier' && this.dernierEtage) {
      b.append(h('button', { class: 'petit', type: 'button', on: { click: () => this.documents(this.dernierEtage) } }, t('Tous les documents de l’étage')));
    }
    return b;
  }

  retour() {
    const prec = this.historique.pop();
    if (!prec) return;
    if (prec.type === 'liste') this.documents(prec.etage, { garder: false });
    else this.ouvrir(prec.chemin, prec.etage, { garder: false });
  }

  /** Liste des .md d'un étage (les plus récents d'abord), avec filtre. */
  async documents(etageId, { garder = true } = {}) {
    const m = this.fenetre();
    if (garder && this.courant) this.historique.push(this.courant);
    this.courant = { type: 'liste', etage: etageId };
    this.dernierEtage = etageId;
    const e = this.store.etage(etageId);
    m.titre(t('Documents — {etage}', { etage: e ? e.nom : etageId }));
    m.corps.replaceChildren(h('div', { class: 'vide' }, t('Recherche des fichiers .md…')));
    let fichiers = [];
    try {
      fichiers = (await api('/api/etages/' + encodeURIComponent(etageId) + '/markdown')).fichiers;
    } catch (err) {
      m.corps.replaceChildren(h('div', { class: 'vide erreur' }, err.message));
      return;
    }
    const filtre = h('input', { class: 'champ', type: 'search', placeholder: t('Filtrer par nom ou dossier…'), 'aria-label': t('Filtrer') });
    const liste = h('ul', { class: 'lecteur-liste' });
    const remplirListe = () => {
      const q = filtre.value.trim().toLowerCase();
      const vus = fichiers.filter((f) => !q || f.relatif.toLowerCase().includes(q));
      liste.replaceChildren(
        ...(vus.length
          ? vus.map((f) =>
              h('li', {},
                h('button', { class: 'lecteur-fichier', type: 'button', title: f.chemin, on: { click: () => this.ouvrir(f.chemin, null) } },
                  h('span', { class: 'nom' }, f.relatif),
                  h('span', { class: 'meta' }, date(f.modifie) + ' · ' + taille(f.taille)))))
          : [h('li', { class: 'vide' }, fichiers.length ? t('Aucun fichier ne correspond.') : t('Aucun fichier .md dans cet étage.'))]),
      );
    };
    filtre.addEventListener('input', remplirListe);
    remplirListe();
    m.corps.replaceChildren(this.barre(), h('p', { class: 'meta' }, t('{n} fichier(s) .md, du plus récent au plus ancien.', { n: fichiers.length })), filtre, liste);
    filtre.focus();
  }
}
