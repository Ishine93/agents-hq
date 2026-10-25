// Code écrit par les agents : le diff de chaque fichier (lignes vertes ajoutées, rouges supprimées) dans
// la fiche (onglet « Code ») et le journal, et le vieil écran d'ordinateur qui s'ouvre au clic sur un
// poste : le code de l'agent assis là s'y tape en direct.
// Tout texte venant du serveur passe par textContent (via h).
import { h, api } from './modale.js';
import { t as tr, locale } from './i18n.js';
import { Fenetre } from './fenetres.js';

const heure = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// « +12 −3 » en couleurs.
export function compteLignes(ajouts, suppressions) {
  return h('span', { class: 'compte-lignes' },
    h('span', { class: 'plus' }, '+' + (ajouts || 0)), ' ',
    h('span', { class: 'moins' }, '−' + (suppressions || 0)));
}

// Lignes d'un diff avec leurs numéros (ancien fichier pour une suppression, nouveau sinon).
function lignesNumerotees(mod) {
  const out = [];
  for (const m of mod.morceaux || []) {
    out.push({ sorte: 'entete', texte: m.ancien ? tr('ligne {n}', { n: m.nouveau || m.ancien }) : tr('nouveau fichier') });
    let a = m.ancien || 0;
    let n = m.nouveau || 1;
    for (const l of m.lignes) {
      const c = l.charAt(0);
      const texte = l.slice(1);
      if (c === '+') out.push({ sorte: 'ajout', no: n++, texte });
      else if (c === '-') out.push({ sorte: 'suppr', no: a++, texte });
      else if (c === '\\') continue; // « \ No newline at end of file »
      else {
        out.push({ sorte: 'ctx', no: n, texte });
        a++;
        n++;
      }
    }
    if (m.tronque) out.push({ sorte: 'entete', texte: tr('… (suite coupée)') });
  }
  return out;
}

export function diffDom(mod) {
  return h('div', { class: 'diff' }, lignesNumerotees(mod).map((l) =>
    l.sorte === 'entete'
      ? h('div', { class: 'dl entete' }, l.texte)
      : h('div', { class: 'dl ' + l.sorte },
        h('span', { class: 'no' }, String(l.no)),
        h('span', { class: 'signe' }, l.sorte === 'ajout' ? '+' : l.sorte === 'suppr' ? '−' : ' '),
        h('span', { class: 'src' }, l.texte || ' '))));
}

// Onglet « Code » de la fiche : un bloc par fichier écrit, le plus récent en haut, le diff dépliable.
export function rendreModifications(box, S, tache, ouverts, surBascule) {
  const liste = (S.modifications.get(tache.id) || []).slice().reverse();
  const L = tache.lignes;
  box.replaceChildren(
    h('div', { class: 'code-resume' },
      L ? [compteLignes(L.ajouts, L.suppressions), ' ', tr('dans {n} fichier(s)', { n: L.fichiers || 0 })] : tr('Aucun fichier écrit pour l’instant.')),
    ...liste.map((m, i) => {
      const ouvert = ouverts.has(m.id) || (i === 0 && !ouverts.has('ferme:' + m.id));
      return h('div', { class: 'modif' + (ouvert ? ' ouvert' : '') },
        h('button', { class: 'modif-tete', type: 'button', on: { click: () => surBascule(m.id, ouvert) } },
          h('span', { class: 'fleche' }, ouvert ? '▾' : '▸'),
          h('span', { class: 'fichier' }, m.rel),
          m.type === 'create' ? h('span', { class: 'nouveau' }, tr('nouveau')) : null,
          compteLignes(m.ajouts, m.suppressions),
          h('span', { class: 'heure' }, heure(m.t))),
        ouvert ? diffDom(m) : null);
    }));
}

// Modifications d'une tâche relues au serveur (avant l'ouverture de la page, ou après un redémarrage).
export async function chargerModifications(S, tacheId) {
  S.modificationsLues = S.modificationsLues || new Set();
  if (S.modificationsLues.has(tacheId)) return false;
  S.modificationsLues.add(tacheId);
  try {
    const r = await api('/api/taches/' + encodeURIComponent(tacheId) + '/modifications');
    const deja = S.modifications.get(tacheId) || [];
    const ids = new Set(deja.map((m) => m.id));
    const tout = [...(r.modifications || []).filter((m) => !ids.has(m.id)), ...deja].sort((a, b) => a.t - b.t).slice(-60);
    S.modifications.set(tacheId, tout);
    return true;
  } catch {
    S.modificationsLues.delete(tacheId);
    return false;
  }
}

// ---------- le vieil écran d'ordinateur ----------
// Ouvert au clic sur un poste : l'écran montre le code de l'agent assis à ce poste, tapé en direct
// (les lignes vertes s'écrivent, les rouges s'effacent). Poste libre : l'écran est vide.
export class EcranRetro {
  constructor(store, ui) {
    this.store = store;
    this.ui = ui;
    this.tacheId = null;
    this.file = [];
    this.anim = null;
    this.vues = []; // modifications déjà montrées (◀ ▶ pour les revoir)
    this.index = -1;
    this.construire();
  }

  construire() {
    this.titre = h('div', { class: 'crt-titre' });
    this.zone = h('div', { class: 'crt-zone' });
    this.etat = h('div', { class: 'crt-etat' });
    this.bPrec = h('button', { class: 'crt-bouton', type: 'button', title: tr('Modification précédente'), on: { click: () => this.revoir(-1) } }, '◀');
    this.bSuiv = h('button', { class: 'crt-bouton', type: 'button', title: tr('Modification suivante'), on: { click: () => this.revoir(1) } }, '▶');
    const fermer = h('button', { class: 'crt-bouton crt-off', type: 'button', title: tr('Éteindre (Échap)'), on: { click: () => this.fermer() } }, '⏻');
    this.boite = h('div', { class: 'crt-moniteur', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Écran de l’ordinateur') },
      h('div', { class: 'crt-cadre' },
        h('div', { class: 'crt-ecran' }, this.titre, this.zone, this.etat, h('div', { class: 'crt-lignes' }), h('div', { class: 'crt-reflet' }))),
      h('div', { class: 'crt-facade' }, h('span', { class: 'crt-marque' }, 'QG-80'), h('span', { class: 'crt-commandes' }, this.bPrec, this.bSuiv, fermer), h('span', { class: 'crt-voyant' })),
      h('div', { class: 'crt-pied' }));
    // fenêtre flottante : on peut la déplacer, l'agrandir, la zoomer, la garder ouverte à côté du reste
    this.fen = new Fenetre({ cle: 'ecran', titre: '🖥 ' + tr('Écran'), classe: 'fen-crt', largeur: 780, hauteur: 600, min: [420, 340], coin: 'centre', surFermer: () => this.eteindre() });
    this.fen.corps.append(this.boite);
    this.fen.el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.revoir(-1);
      else if (e.key === 'ArrowRight') this.revoir(1);
    });
  }

  get ouvert() {
    return this.fen.ouvert;
  }

  async ouvrir({ tacheId = null } = {}) {
    const S = this.store;
    this.arreter();
    this.tacheId = tacheId && S.taches.has(tacheId) ? tacheId : null;
    this.file = [];
    this.vues = [];
    this.index = -1;
    this.fen.ouvrir();
    this.boite.classList.remove('crt-eteint');
    this.boite.classList.add('crt-allumage');
    setTimeout(() => this.boite.classList.remove('crt-allumage'), 600);
    this.zone.replaceChildren();
    this.majTitre(null);
    this.fen.definirTitre('🖥 ' + (this.tacheId ? tr('Poste de {nom}', { nom: S.nom(S.taches.get(this.tacheId)) }) : tr('Poste libre')));
    if (!this.tacheId) {
      // poste libre : écran vide, juste le curseur
      this.etat.textContent = '';
      this.zone.replaceChildren(h('span', { class: 'crt-curseur' }));
      this.majBoutons();
      return;
    }
    this.majEtat();
    await chargerModifications(S, this.tacheId);
    const liste = S.modifications.get(this.tacheId) || [];
    this.vues = liste.slice();
    if (this.vues.length) {
      this.index = this.vues.length - 1;
      this.taper(this.vues[this.index]);
    } else {
      this.zone.replaceChildren(h('div', { class: 'crt-attente' }, tr('Pas encore de code écrit à ce poste.')), h('span', { class: 'crt-curseur' }));
    }
    this.majBoutons();
  }

  // ⏻ : l'écran s'éteint (petite animation), puis la fenêtre se ferme
  fermer() {
    this.boite.classList.add('crt-eteint');
    setTimeout(() => {
      this.boite.classList.remove('crt-eteint');
      this.fen.fermer();
    }, 260);
  }

  eteindre() {
    this.arreter();
    this.tacheId = null;
  }

  arreter() {
    if (this.anim) clearTimeout(this.anim.raf);
    this.anim = null;
  }

  surEvenement(ev) {
    if (!this.ouvert || !this.tacheId) return;
    if (ev.type === 'modification' && ev.tache === this.tacheId) {
      this.vues.push(ev.modification);
      // en train de revoir l'historique : on laisse ; sinon la nouvelle modification se tape après la courante
      if (this.index >= this.vues.length - 2 || this.index < 0) this.file.push(ev.modification);
      if (!this.anim) this.suivante();
      this.majBoutons();
    } else if ((ev.type === 'outil' || ev.type === 'tache' || ev.type === 'activite') && (ev.tache === this.tacheId || ev.tache?.id === this.tacheId)) {
      this.majEtat();
    }
  }

  suivante() {
    const m = this.file.shift();
    if (!m) return;
    this.index = this.vues.indexOf(m);
    this.taper(m);
  }

  revoir(sens) {
    if (!this.vues.length) return;
    const i = Math.max(0, Math.min(this.vues.length - 1, this.index + sens));
    if (i === this.index) return;
    this.file = [];
    this.index = i;
    this.taper(this.vues[i], true);
    this.majBoutons();
  }

  majBoutons() {
    this.bPrec.disabled = this.index <= 0;
    this.bSuiv.disabled = this.index < 0 || this.index >= this.vues.length - 1;
  }

  majTitre(mod) {
    const S = this.store;
    const t = this.tacheId ? S.taches.get(this.tacheId) : null;
    this.titre.replaceChildren(...[
      h('span', { class: 'crt-qui' }, t ? S.nom(t) + ' · ' + t.ref : tr('Poste libre')),
      mod ? h('span', { class: 'crt-fichier' }, ' — ' + mod.rel + (mod.type === 'create' ? ' (' + tr('nouveau') + ')' : '')) : null,
      mod ? h('span', { class: 'crt-compte' }, ' +' + mod.ajouts, h('span', { class: 'moins' }, ' −' + mod.suppressions)) : null,
    ].filter(Boolean));
  }

  // Ce que fait l'agent en ce moment (dernier outil), en bas de l'écran.
  majEtat() {
    const S = this.store;
    const t = this.tacheId ? S.taches.get(this.tacheId) : null;
    if (!t) {
      this.etat.textContent = '';
      return;
    }
    const o = (S.outils.get(t.id) || []).slice(-1)[0] || t.dernierOutil;
    const fini = ['done', 'failed', 'cancelled', 'skipped'].includes(t.etat);
    this.etat.textContent = fini ? tr('> session terminée') : o ? '> ' + o.nom + (o.cible ? ' ' + o.cible : '') : '> ' + tr('réfléchit…');
  }

  // Tape une modification : le contexte s'affiche, les lignes supprimées rougissent puis s'effacent,
  // les lignes ajoutées s'écrivent caractère par caractère en vert. Environ 4 s au plus par modification.
  taper(mod, vite = false) {
    this.arreter();
    this.majTitre(mod);
    const lignes = lignesNumerotees(mod);
    const zone = this.zone;
    zone.replaceChildren();
    const total = lignes.reduce((n, l) => n + (l.sorte === 'ajout' ? l.texte.length + 1 : 0), 0);
    const parImage = vite ? Infinity : Math.max(2, Math.ceil(total / 240));
    let i = 0;
    let enCours = null; // { el, texte, pos }
    const curseur = h('span', { class: 'crt-curseur' });
    const suivreBas = () => {
      zone.scrollTop = zone.scrollHeight;
    };
    const pas = () => {
      let budget = parImage;
      while (budget > 0) {
        if (enCours) {
          const n = Math.min(budget, enCours.texte.length - enCours.pos);
          enCours.pos += n;
          budget -= n;
          enCours.src.textContent = enCours.texte.slice(0, enCours.pos);
          if (enCours.pos >= enCours.texte.length) {
            enCours.el.classList.remove('frappe');
            enCours = null;
            budget -= 1;
          }
          continue;
        }
        if (i >= lignes.length) break;
        const l = lignes[i++];
        if (l.sorte === 'entete') {
          zone.append(h('div', { class: 'crt-l entete' }, '@@ ' + l.texte));
        } else if (l.sorte === 'ctx') {
          zone.append(h('div', { class: 'crt-l ctx' }, h('span', { class: 'no' }, String(l.no)), h('span', { class: 'src' }, l.texte || ' ')));
          budget -= 3;
        } else if (l.sorte === 'suppr') {
          const el = h('div', { class: 'crt-l suppr' }, h('span', { class: 'no' }, String(l.no)), h('span', { class: 'src' }, l.texte || ' '));
          zone.append(el);
          // rouge un instant, puis la ligne s'efface
          if (!vite) setTimeout(() => el.classList.add('efface'), 700);
          budget -= 6;
        } else {
          const src = h('span', { class: 'src' });
          const el = h('div', { class: 'crt-l ajout frappe' }, h('span', { class: 'no' }, String(l.no)), src);
          zone.append(el);
          enCours = { el, src, texte: l.texte || ' ', pos: 0 };
        }
      }
      if (enCours) enCours.src.append(curseur);
      else zone.append(curseur);
      suivreBas();
      if (i >= lignes.length && !enCours) {
        this.anim = null;
        // la suivante (s'il y en a) après une courte pause
        if (this.file.length) setTimeout(() => this.ouvert && !this.anim && this.suivante(), 1200);
        this.majBoutons();
        return;
      }
      this.anim.raf = setTimeout(pas, 16);
    };
    // minuterie plutôt que requestAnimationFrame : continue même si l’onglet passe en arrière-plan
    this.anim = { raf: setTimeout(pas, 16) };
  }
}
