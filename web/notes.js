// Notes de version (1.0.7) : le numéro de version, en haut à gauche, ouvre une fenêtre avec la liste des versions à
// gauche et les notes de celle choisie à droite. Après une mise à jour, la fenêtre s'ouvre toute seule une fois.
import { h, ouvrirModale, api } from './modale.js';
import { t, langueCourante } from './i18n.js';
import { md } from './markdown.js';
import { MAQUETTE } from './flux.js';

const comparer = (a, b) => {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  return 0;
};

export class NotesVersion {
  constructor(ui) {
    this.ui = ui;
    this.verifie = false;
  }

  // Premier état reçu : les notes d'une mise à jour, une seule fois (le serveur dit lesquelles).
  async verifier() {
    if (this.verifie || MAQUETTE) return;
    this.verifie = true;
    const r = await api('/api/notes').catch(() => null);
    if (r && r.aMontrer && r.aMontrer.length) this.ouvrir({ donnees: r });
  }

  async ouvrir({ donnees = null } = {}) {
    if (MAQUETTE) return this.ui.toast('info', t('Mode maquette : aucune requête n’est envoyée au serveur.'));
    let r = donnees;
    if (!r) {
      try {
        r = await api('/api/notes');
      } catch (e) {
        return this.ui.toast('erreur', e.message);
      }
    }
    const nouvelles = r.aMontrer || [];
    // jusqu'à la version installée, de la plus récente à la plus ancienne
    const versions = (r.versions || []).filter((v) => !r.actuelle || comparer(v.version, r.actuelle) <= 0);
    const m = ouvrirModale({
      titre: nouvelles.length ? t('Nouvelle mise à jour : version {version}', { version: r.actuelle }) : t('Notes de version'),
      classe: 'notes-version',
    });
    // montrées : elles ne s'ouvriront plus toutes seules
    if (nouvelles.length) api('/api/notes/vu', {}).catch(() => {});
    if (!versions.length) {
      m.corps.append(h('p', { class: 'vide' }, t('Aucune note de version dans ce QG.')));
      return m;
    }
    const texte = h('div', { class: 'notes-texte' });
    const liste = h('nav', { class: 'notes-liste', 'aria-label': t('Versions') });
    const boutons = new Map();
    const choisir = (v) => {
      const n = versions.find((x) => x.version === v) || versions[0];
      for (const [cle, b] of boutons) {
        b.classList.toggle('choisi', cle === n.version);
        b.setAttribute('aria-pressed', cle === n.version ? 'true' : 'false');
      }
      texte.replaceChildren(md(n.texte));
      texte.scrollTop = 0;
    };
    for (const n of versions) {
      const b = h('button', { type: 'button', class: 'notes-version-bouton', on: { click: () => choisir(n.version) } },
        h('b', {}, 'v' + n.version),
        n.version === r.actuelle ? h('small', { class: 'meta' }, t('installée')) : null,
        nouvelles.includes(n.version) ? h('span', { class: 'badge st-ok' }, t('nouveau')) : null);
      boutons.set(n.version, b);
      liste.append(b);
    }
    // append() écrirait « null » : seulement les paragraphes utiles
    m.corps.append(...[
      nouvelles.length ? h('p', {}, t('Voici ce qui a changé. Tu peux fermer cette fenêtre : les notes restent à un clic, sur le numéro de version en haut à gauche.')) : null,
      langueCourante() !== 'fr' ? h('p', { class: 'meta' }, t('Les notes sont écrites en français, avec un résumé en anglais à la fin.')) : null,
      h('div', { class: 'notes-colonnes' }, liste, texte),
    ].filter(Boolean));
    choisir(nouvelles[0] || r.actuelle);
    return m;
  }
}
