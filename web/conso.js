// Consommation en temps réel : compteur dans la barre du haut (tokens du jour, fenêtre de 5 h du forfait)
// et détail au clic (forfait de chaque compte, jour, 7 jours, dossiers, économies du cache).
import { h, ouvrirModale, api, fmtTokens } from './modale.js';
import { t, locale } from './i18n.js';

const totalTokens = (a) => (a ? (a.entree || 0) + (a.sortie || 0) + (a.cacheLu || 0) + (a.cacheEcrit || 0) : 0);
// Un token relu depuis le cache coûte un dixième d'un token d'entrée : 90 % économisés.
const economie = (a) => Math.round((a?.cacheLu || 0) * 0.9);
const dollars = (v) => (v || 0).toLocaleString(locale(), { style: 'currency', currency: 'USD', maximumFractionDigits: (v || 0) < 10 ? 2 : 0 });
const NOMS_FENETRES = {
  five_hour: 'Session (5 h)', seven_day: 'Semaine (7 jours)', seven_day_opus: 'Semaine — Opus', seven_day_sonnet: 'Semaine — Sonnet',
  seven_day_overage_included: 'Semaine — modèles inclus', overage: 'Dépassement',
};
const NOMS_ROLES = { dg: 'DG', tache: 'Agents', verif: 'Vérificateurs', bonheur: 'Joy (blagues)', autre: 'Autre' };

function quand(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const auj = new Date();
  const memeJour = d.toDateString() === auj.toDateString();
  return memeJour
    ? t('à {heure}', { heure: d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) })
    : d.toLocaleString(locale(), { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Forfait affiché : celui de la découverte (« Claude Max »), sauf s'il ne correspond plus à celui que
// donne la dernière lecture des limites (« max ») : forfait changé, la découverte n'est pas encore refaite.
const motForfait = (s) => String(s || '').toLowerCase().replace(/^claude\s+/, '').split(/\s+/)[0];
function nomForfait(c, l) {
  const lu = l?.abonnement;
  if (!lu || !c.abonnement || motForfait(c.abonnement) === motForfait(lu)) return c.abonnement || lu || null;
  return 'Claude ' + lu.charAt(0).toUpperCase() + lu.slice(1);
}

function barre(pct) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return h('div', { class: 'conso-jauge' }, h('div', { class: 'conso-jauge-barre' + (p >= 90 ? ' haut' : p >= 70 ? ' moyen' : ''), style: { width: p + '%' } }));
}

export class Conso {
  constructor(store, ui) {
    this.store = store;
    this.ui = ui;
    this.m = null;
    this.ouverts = new Set();
    this.tachesDossier = new Map();
    this.dernierRendu = 0;
    this.bouton = document.getElementById('btn-conso');
    this.bouton?.addEventListener('click', () => this.ouvrir());
  }

  // Fenêtre la plus chargée parmi celles du compte (ou de tous les comptes).
  pireFenetre(compte = null) {
    const L = this.store.conso?.limites || {};
    let pire = null;
    for (const [id, l] of Object.entries(L)) {
      if (compte && id !== compte) continue;
      for (const [cle, f] of Object.entries(l.fenetres || {})) {
        if (f.utilisation == null) continue;
        if (!pire || f.utilisation > pire.utilisation) pire = { ...f, cle, compte: id };
      }
    }
    return pire;
  }

  majBouton() {
    if (!this.bouton) return;
    const C = this.store.conso;
    const jour = C?.aujourdhui?.total;
    const compte = this.ui.compte;
    const l5 = C?.limites?.[compte]?.fenetres?.five_hour;
    const pire = this.pireFenetre(compte);
    this.bouton.replaceChildren(...[
      h('span', { class: 'conso-eclair', 'aria-hidden': 'true' }, '⚡'),
      h('span', { class: 'conso-nb' }, fmtTokens(totalTokens(jour))),
      l5 && l5.utilisation != null ? h('span', { class: 'conso-mini' }, barre(l5.utilisation), h('span', {}, Math.round(l5.utilisation) + ' %')) : null,
    ].filter(Boolean));
    const nomCompte = this.store.comptes.find((c) => c.id === compte)?.nom || compte || '';
    this.bouton.title = [
      t('Consommation du jour : {n} tokens', { n: fmtTokens(totalTokens(jour)) }),
      l5 && l5.utilisation != null ? t('{compte} — session de 5 h : {p} % (remise à zéro {quand})', { compte: nomCompte, p: Math.round(l5.utilisation), quand: quand(l5.reinit) }) : null,
      pire && pire.cle !== 'five_hour' && pire.utilisation >= 50 ? t('{fenetre} : {p} %', { fenetre: t(NOMS_FENETRES[pire.cle] || pire.nom || pire.cle), p: Math.round(pire.utilisation) }) : null,
      C?.limites?.[compte]?.erreur ? t('Relecture impossible ({raison}) : valeurs lues {quand}.', { raison: C.limites[compte].erreur, quand: quand(C.limites[compte].maj) || '—' }) : null,
      t('Clique pour le détail.'),
    ].filter(Boolean).join('\n');
    this.bouton.classList.toggle('alerte', !!(pire && pire.utilisation >= 90));
  }

  maj() {
    this.majBouton();
    if (this.m && Date.now() - this.dernierRendu > 2000) this.rendre();
  }

  ouvrir() {
    if (this.m) return;
    this.m = ouvrirModale({ titre: t('Consommation'), classe: 'conso', surFermer: () => (this.m = null) });
    this.m.outils.append(h('button', { class: 'petit', type: 'button', title: t('Relire les limites du forfait de chaque compte (sans consommer de tokens)'), on: { click: () => this.actualiser() } }, t('Actualiser les limites')));
    this.rendre();
    // Les limites datent de plus de 3 min : on les relit en arrière-plan.
    const L = this.store.conso?.limites || {};
    if (this.store.comptes.some((c) => c.connecte && Date.now() - (L[c.id]?.maj || 0) > 180000)) this.actualiser(true);
  }

  async actualiser(discret = false) {
    try {
      const c = await api('/api/conso/limites', {});
      if (c) this.store.conso = c;
      this.majBouton();
      if (this.m) this.rendre();
    } catch (e) {
      if (!discret) this.ui.toast('erreur', t('Limites : {raison}', { raison: e.message }));
    }
  }

  rendre() {
    if (!this.m) return;
    this.dernierRendu = Date.now();
    const C = this.store.conso;
    const S = this.store;
    const corps = this.m.corps;
    const haut = corps.scrollTop;
    if (!C) {
      corps.replaceChildren(h('div', { class: 'vide' }, t('Pas encore de données de consommation.')));
      return;
    }
    const J = C.aujourdhui || { total: {} };
    const sections = [];

    // --- économies
    const ecoJour = economie(J.total);
    const ecoMois = economie(C.mois);
    sections.push(h('div', { class: 'conso-economie' },
      h('div', { class: 'gros' }, t('Vous avez économisé {n} tokens', { n: fmtTokens(ecoMois) })),
      h('div', { class: 'meta' }, t('Sur 30 jours, grâce au cache : {lu} tokens relus au dixième du prix ({jour} économisés aujourd’hui).', { lu: fmtTokens(C.mois?.cacheLu), jour: fmtTokens(ecoJour) })),
      C.reemplois?.nombre ? h('div', { class: 'meta' }, t('{n} agent(s) réembauché(s) avec leur contexte (≈ {k} tokens de connaissance du code réutilisés au lieu d’être reconstruits).', { n: C.reemplois.nombre, k: fmtTokens(C.reemplois.contexte) })) : null));

    // --- forfait de chaque compte
    const blocForfaits = h('section', { class: 'conso-section' }, h('h4', {}, t('Forfait de chaque compte')));
    for (const c of S.comptes) {
      const l = C.limites?.[c.id];
      const lignes = [];
      // Dernière relecture ratée : on montre quand même les anciennes valeurs, grisées et datées.
      const perime = !!l?.erreur;
      for (const [cle, f] of Object.entries(l?.fenetres || {})) {
        if (f.utilisation == null) continue;
        lignes.push(h('div', { class: 'conso-fenetre' + (perime && !(f.lu > (l.essai || 0)) ? ' perime' : '') },
          h('span', { class: 'lib' }, t(NOMS_FENETRES[cle] || f.nom || cle)),
          barre(f.utilisation),
          h('span', { class: 'pct' }, Math.round(f.utilisation) + ' %'),
          h('span', { class: 'meta' }, f.reinit ? t('remise à zéro {quand}', { quand: quand(f.reinit) }) : '')));
      }
      blocForfaits.append(h('div', { class: 'conso-compte' },
        h('div', { class: 'conso-compte-tete' },
          h('b', {}, c.nom),
          h('span', { class: 'meta' }, [nomForfait(c, l), !c.connecte ? t('non connecté') : null, l?.maj ? t('lu {quand}', { quand: quand(l.maj) }) : null].filter(Boolean).join(' · '))),
        perime && lignes.length ? h('div', { class: 'conso-perime' }, t('Relecture impossible ({raison}) : valeurs lues {quand}.', { raison: l.erreur, quand: l.maj ? quand(l.maj) : '—' })) : null,
        lignes.length ? lignes : h('div', { class: 'vide' }, c.connecte ? (l?.erreur ? t('Limites illisibles pour l’instant ({raison}).', { raison: l.erreur }) : t('Limites pas encore lues : clique sur « Actualiser les limites ».')) : t('Connecte ce compte pour voir son forfait.'))));
    }
    sections.push(blocForfaits);

    // --- aujourd'hui
    const T = J.total || {};
    sections.push(h('section', { class: 'conso-section' },
      h('h4', {}, t('Aujourd’hui')),
      h('div', { class: 'conso-chiffres' },
        this.chiffre(t('Tokens traités'), fmtTokens(totalTokens(T))),
        this.chiffre(t('Entrée'), fmtTokens(T.entree)),
        this.chiffre(t('Sortie'), fmtTokens(T.sortie)),
        this.chiffre(t('Cache relu'), fmtTokens(T.cacheLu)),
        this.chiffre(t('Cache écrit'), fmtTokens(T.cacheEcrit)),
        this.chiffre(t('Appels'), String(T.appels || 0)),
        this.chiffre(t('Équivalent API'), dollars(T.cout), t('Ce que coûteraient ces appels facturés au token. Ton abonnement ne facture pas au token : il est limité par les fenêtres ci-dessus.'))),
      h('div', { class: 'conso-grilles' },
        this.tableau(t('Par compte'), J.comptes, (id) => S.comptes.find((c) => c.id === id)?.nom || id),
        this.tableau(t('Par modèle'), J.modeles, (id) => id),
        this.tableau(t('Par étage'), J.etages, (id) => S.etage(id)?.nom || id),
        this.tableau(t('Par rôle'), J.roles, (id) => t(NOMS_ROLES[id] || id)))));

    // --- 7 jours
    const max = Math.max(1, ...(C.semaine || []).map(totalTokens));
    sections.push(h('section', { class: 'conso-section' },
      h('h4', {}, t('7 derniers jours')),
      h('div', { class: 'conso-histo' }, (C.semaine || []).map((j) =>
        h('div', { class: 'conso-jour', title: j.jour + ' : ' + fmtTokens(totalTokens(j)) + ' tokens · ' + dollars(j.cout) },
          h('div', { class: 'conso-colonne' }, h('div', { class: 'conso-colonne-barre', style: { height: Math.round((totalTokens(j) / max) * 100) + '%' } })),
          h('span', { class: 'conso-jour-nb' }, fmtTokens(totalTokens(j))),
          h('span', { class: 'meta' }, new Date(j.jour + 'T12:00').toLocaleDateString(locale(), { weekday: 'short' })))))));

    // --- dossiers
    const dossiers = Object.entries(C.dossiers || {}).reverse();
    const blocDossiers = h('section', { class: 'conso-section' }, h('h4', {}, t('Par dossier')));
    if (!dossiers.length) blocDossiers.append(h('div', { class: 'vide' }, t('Aucun dossier mesuré pour l’instant.')));
    for (const [id, a] of dossiers) {
      const d = S.dossiers.get(id);
      const ouvert = this.ouverts.has(id);
      const ligne = h('button', { class: 'conso-dossier', type: 'button', on: { click: () => this.basculerDossier(id) } },
        h('span', { class: 'ref' }, id),
        h('span', { class: 'titre' }, d ? d.titre || d.texte || '' : ''),
        h('span', { class: 'nb' }, fmtTokens(totalTokens(a))),
        h('span', { class: 'meta' }, dollars(a.cout)));
      blocDossiers.append(ligne);
      if (ouvert) {
        const taches = this.tachesDossier.get(id);
        blocDossiers.append(h('div', { class: 'conso-taches' },
          !taches ? h('div', { class: 'vide' }, t('Chargement…'))
            : Object.entries(taches).map(([tid, x]) => {
              const ta = S.taches.get(tid);
              return h('div', { class: 'conso-tache' },
                h('span', { class: 'ref' }, ta ? S.nom(ta) + ' · ' + ta.ref : tid.split('-').pop()),
                h('span', { class: 'titre' }, ta ? ta.titre || '' : ''),
                h('span', { class: 'nb' }, fmtTokens(totalTokens(x))),
                h('span', { class: 'meta' }, dollars(x.cout)));
            })));
      }
    }
    sections.push(blocDossiers);
    corps.replaceChildren(...sections);
    corps.scrollTop = haut;
  }

  async basculerDossier(id) {
    if (this.ouverts.has(id)) this.ouverts.delete(id);
    else {
      this.ouverts.add(id);
      api('/api/conso/' + encodeURIComponent(id))
        .then((r) => {
          this.tachesDossier.set(id, r.taches || {});
          this.rendre();
        })
        .catch(() => null);
    }
    this.rendre();
  }

  chiffre(lib, valeur, titre = null) {
    return h('div', { class: 'conso-chiffre', title: titre }, h('span', { class: 'v' }, valeur), h('span', { class: 'lib' }, lib + (titre ? ' ⓘ' : '')));
  }

  tableau(titre, groupes, nom) {
    const lignes = Object.entries(groupes || {}).sort((a, b) => totalTokens(b[1]) - totalTokens(a[1]));
    return h('div', { class: 'conso-tableau' },
      h('h5', {}, titre),
      lignes.length
        ? h('table', {}, h('tbody', {}, lignes.map(([id, a]) => h('tr', {}, h('td', {}, nom(id)), h('td', { class: 'nb' }, fmtTokens(totalTokens(a))), h('td', { class: 'meta' }, a.cout ? dollars(a.cout) : '')))))
        : h('div', { class: 'vide' }, '—'));
  }
}
