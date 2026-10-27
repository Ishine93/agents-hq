// Fiche d'un agent, du DG ou du vérificateur : fil chronologique de ses blocs de réflexion complets.
// Le bloc en cours grandit en direct ; les précédents se replient. Le fil n'est jamais redessiné en entier :
// on met à jour ses nœuds, pour garder le défilement et ce que l'utilisateur a ouvert ou fermé.
import { h } from './modale.js';
import { t as tr } from './i18n.js';

const heure = (t) => {
  const d = new Date(t || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
};
const apercu = (s) => {
  const x = String(s || '').replace(/\s+/g, ' ').trim();
  return x.length > 110 ? x.slice(0, 109) + '…' : x;
};
const MARGE_BAS = 24; // px : en dessous, on considère que l'utilisateur suit le direct

export class FilPensees {
  constructor() {
    this.titre = h('h4', {});
    this.fil = h('div', { class: 'fil-pensees' });
    this.suivre = h('button', { class: 'petit fil-suivre', type: 'button', hidden: true }, tr('↓ Suivre en direct'));
    this.racine = h('div', { class: 'bloc pensees' }, this.titre, this.fil, this.suivre);
    this.cible = null;
    this.noeuds = new Map(); // clé -> { el, texte?, resume?, longueur }
    this.choix = new Map(); // clé de bloc -> ouvert/fermé choisi par l'utilisateur
    this.colle = true;
    this.position = 0;
    this.fil.addEventListener('scroll', () => {
      if (this.ignorerScroll) return;
      this.position = this.fil.scrollTop;
      this.colle = this.fil.scrollTop + this.fil.clientHeight >= this.fil.scrollHeight - MARGE_BAS;
      this.suivre.hidden = this.colle || !this.enCours;
    });
    this.suivre.addEventListener('click', () => {
      this.colle = true;
      this.suivre.hidden = true;
      this.defiler();
    });
  }

  /**
   * @param o { cible, blocs: [{ bloc, debut, texte, fin, verificateur, coupe, trou }], outils: [{ nom, cible, t }], titre, phase }
   * @returns l'élément du fil, ou null s'il n'y a rien à montrer
   */
  maj({ cible, blocs = [], outils = [], titre, phase = '' }) {
    if (cible !== this.cible) {
      this.cible = cible;
      this.noeuds.clear();
      this.choix.clear();
      this.fil.replaceChildren();
      this.colle = true;
      this.position = 0;
    }
    if (!blocs.length && !phase) return null;
    this.titre.replaceChildren(...[titre, phase ? h('span', { class: 'phase' }, ' — ' + phase) : null].filter(Boolean));
    const debut = blocs.length ? blocs[0].debut || 0 : Infinity;
    // actions faites entre deux réflexions (seulement après le premier bloc connu)
    const entrees = [
      ...blocs.map((b, i) => ({ cle: 'b:' + b.bloc, t: b.debut || 0, ordre: i, b })),
      ...outils.filter((o) => (o.t || 0) >= debut).map((o, i) => ({ cle: 'o:' + o.t + ':' + i, t: o.t || 0, ordre: -1, o })),
    ].sort((a, b) => a.t - b.t || a.ordre - b.ordre);
    const dernier = blocs.length ? 'b:' + blocs[blocs.length - 1].bloc : null;
    this.enCours = blocs.length > 0 && !blocs[blocs.length - 1].fin;
    const voulus = new Set(entrees.map((e) => e.cle));
    for (const [cle, n] of this.noeuds) {
      if (!voulus.has(cle)) {
        n.el.remove();
        this.noeuds.delete(cle);
      }
    }
    let precedent = null;
    for (const e of entrees) {
      let n = this.noeuds.get(e.cle);
      if (!n) {
        n = e.b ? this.creerBloc(e.cle, e.b) : { el: h('div', { class: 'fil-outil' }, '→ ' + (e.o.nom || '') + (e.o.cible ? ' ' + e.o.cible : '')) };
        this.noeuds.set(e.cle, n);
      }
      if (e.b) this.majBloc(n, e.cle, e.b, e.cle === dernier);
      // ordre chronologique : on ne déplace un nœud que s'il n'est pas déjà à sa place
      const attendu = precedent ? precedent.nextSibling : this.fil.firstChild;
      if (attendu !== n.el) this.fil.insertBefore(n.el, attendu);
      precedent = n.el;
    }
    this.suivre.hidden = this.colle || !this.enCours;
    this.defiler();
    return this.racine;
  }

  creerBloc(cle, b) {
    const resume = h('summary', {});
    const texte = h('div', { class: 'reflexion-texte' });
    // bloc traduit (Réglages › Général) : un clic montre le texte d'origine, un autre la traduction
    const bascule = h('button', { class: 'lien fil-vo', type: 'button', hidden: true });
    const el = h('details', { class: 'reflexion' + (b.verificateur ? ' verif' : '') }, resume, bascule, texte);
    el.open = true;
    const n = { el, resume, texte, bascule, longueur: -1, ouvertAuto: true, voirOriginal: false };
    bascule.addEventListener('click', () => {
      n.voirOriginal = !n.voirOriginal;
      n.etat = null;
      this.majBloc(n, cle, n.b, n.dernier);
    });
    el.addEventListener('toggle', () => {
      if (el.open !== n.ouvertAuto) this.choix.set(cle, el.open); // changé à la main
    });
    return n;
  }

  majBloc(n, cle, b, dernier) {
    n.b = b;
    n.dernier = dernier;
    const total = (b.coupe || 0) + b.texte.length;
    const traduit = !!(b.traduction && b.traduction.texte);
    const montre = traduit && !n.voirOriginal ? b.traduction.texte : b.texte;
    const etat = (b.fin ? 'f' : 'c') + (dernier ? 'd' : '') + (traduit ? 't' : '') + (n.voirOriginal ? 'o' : '');
    if (n.longueur !== total || n.etat !== etat) {
      n.texte.textContent = (b.coupe && montre === b.texte ? '[…] ' : '') + montre;
      n.bascule.hidden = !traduit;
      n.bascule.textContent = n.voirOriginal ? tr('Voir la traduction') : tr('Voir l’original');
      n.longueur = total;
      n.etat = etat;
      n.resume.replaceChildren(...[
        h('span', { class: 'heure' }, heure(b.debut)),
        b.verificateur ? h('span', { class: 'fil-badge' }, tr('vérificateur')) : null,
        b.fin ? null : h('span', { class: 'fil-direct' }, tr('en cours…')),
        h('span', { class: 'fil-apercu' }, ' ' + apercu(montre)),
      ].filter(Boolean));
    }
    // un bloc s'ouvre en direct puis se replie quand un autre commence, sauf choix de l'utilisateur
    const ouvert = this.choix.has(cle) ? this.choix.get(cle) : dernier;
    n.ouvertAuto = ouvert;
    if (n.el.open !== ouvert) n.el.open = ouvert;
  }

  defiler() {
    if (!this.racine.isConnected) return;
    this.ignorerScroll = true;
    this.fil.scrollTop = this.colle ? this.fil.scrollHeight : this.position;
    requestAnimationFrame(() => (this.ignorerScroll = false));
  }

  // Le fil vient d'être remis dans la page (changement d'onglet) : le défilement se perd au détachement.
  restaurer() {
    this.defiler();
  }
}
