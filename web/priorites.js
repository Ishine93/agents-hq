// Réglages › Priorités (1.0.6, plusieurs IA) : quel compte pour quel rôle (DG, production par type de tâche,
// vérificateur, ambiance), consigne au DG, comportement au quota (D4), comptes en pause et délégation d'images
// (D2, D3). Tout passe par /api/priorites. L'aperçu « Maintenant » dit qui ferait quoi avec les comptes présents ;
// rien ne change de compte tout seul.
import { h, api } from './modale.js';
import { t } from './i18n.js';

const TYPES = [['code', 'Code'], ['recherche', 'Recherche'], ['redaction', 'Rédaction'], ['image', 'Images'], ['defaut', 'Autres tâches']];
const ROLES = [['verif', 'Vérificateur'], ['ambiance', 'Ambiance (Joy, mini-jeu)']];
const NATURES = { analyse: 'analyse', impl: 'implémentation', bench: 'banc d’essai', test: 'tests', review: 'relecture', doc: 'documentation', asset: 'visuels', synthese: 'synthèse', ops: 'opérations' };
const NIVEAUX = [['eco', 'économe'], ['standard', 'standard'], ['fort', 'fort'], ['max', 'maximum']];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const ligne = (lib, ...contenu) => h('div', { class: 'param-ligne' }, h('label', { class: 'param-lib' }, lib), h('div', { class: 'param-val' }, ...contenu));
const choix = (valeur, options, change, attrs = {}) =>
  h('select', { class: 'champ', ...attrs, on: { change: (e) => change(e.target.value) } }, options.map(([v, l]) => h('option', { value: v, selected: v === (valeur ?? '') ? true : null }, l)));

/** Badge « pas encore qualifié » : compte jamais essayé avec un vrai agent par le QG (agents ACP). */
export const badgeQualification = (c) => (c && c.qualification === 'non-faite' ? h('span', { class: 'badge st-warn', title: t('Ce type d’agent n’a pas encore été essayé par le QG : à essayer d’abord sur un petit projet.') }, t('pas encore qualifié')) : null);

export function sectionPriorites(param) {
  const S = param.store;
  const ui = param.ui;
  const charger = async () => {
    param.prioritesT = Date.now();
    try {
      param.donneesPrio = await api('/api/priorites');
    } catch (e) {
      param.donneesPrio = param.donneesPrio || { erreur: e.message };
      ui.toast('erreur', e.message);
    }
    param.rendre();
  };
  // relu à l'ouverture, quand l'ordonnanceur change (pauses, reprises) et au plus toutes les 15 s
  if (!param.donneesPrio || param.ordoVu !== S.ordonnanceur || Date.now() - (param.prioritesT || 0) > 15000) {
    param.ordoVu = S.ordonnanceur;
    charger();
    if (!param.donneesPrio) return h('p', { class: 'meta' }, t('Chargement…'));
  }
  const P = param.donneesPrio;
  if (P.erreur) return h('p', { class: 'meta' }, P.erreur);
  const prio = P.priorites;
  const comptes = S.comptes || [];
  const compte = (id) => comptes.find((c) => c.id === id) || null;
  const nomCompte = (id) => (compte(id) || { nom: id }).nom;
  const fournisseurs = (S.fournisseurs || []).filter((f) => comptes.some((c) => (c.fournisseur || 'claude') === f.id));
  const nomFournisseur = (id) => (S.fournisseurs || []).find((f) => f.id === id)?.nom || id;
  const envoyer = async (patch, ok = null) => {
    const r = await param.poster('/api/priorites', patch, ok);
    if (r) {
      param.donneesPrio = r;
      param.rendre();
    }
  };

  // --- maintenant : qui ferait quoi
  const etiquette = (l) => {
    if (!l) return h('span', { class: 'meta' }, t('aucune nature rattachée'));
    const c = compte(l.compte);
    return h('span', { class: 'param-val' },
      l.compte ? h('b', {}, nomCompte(l.compte)) : null,
      c ? h('span', { class: 'badge st-gris' }, nomFournisseur(c.fournisseur || 'claude')) : null,
      badgeQualification(c),
      l.moteur ? h('span', { class: 'badge st-gris' }, l.moteur === 'api' ? t('API Images, facturée') : t('abonnement ChatGPT')) : null,
      l.repli ? h('span', { class: 'badge st-gris', title: t('Aucun compte de la liste ne peut le faire : premier compte connecté capable.') }, t('repli')) : null,
      l.attente ? h('span', { class: 'badge st-warn' }, l.attente) : null);
  };
  const A = P.apercu;
  const maintenant = h('div', { class: 'param-compte' },
    ligne(t('DG'), etiquette(A.dg)),
    ...TYPES.map(([ty, lib]) => ligne(t(lib), etiquette(A.types[ty]))),
    ...ROLES.map(([ro, lib]) => ligne(t(lib), etiquette(A[ro]))),
    A.images ? ligne(t('Délégation d’images'), etiquette(A.images)) : null,
    h('small', { class: 'meta' }, t('Les questions d’un agent passent par le compte de sa tâche. Un compte en pause n’est jamais remplacé sans ton accord.')));

  // --- préréglages
  const prereglages = h('div', { class: 'boutons' }, (P.prereglages || []).map((p) =>
    h('button', { class: 'petit', type: 'button', on: { click: () => envoyer({ prereglage: p.id }, t('Préréglage appliqué.')) } }, p.libelle)));

  // --- DG : compte, modèle, effort (ne peuvent que relever ceux de Réglages › Général)
  const cDg = prio.dg.compte;
  const modelesDg = cDg ? (S.modeles || {})[cDg] || [] : [];
  const dg = h('div', {},
    ligne(t('Compte du DG'), choix(cDg || '', [['', t('Automatique (compte par défaut, puis le premier connecté)')], ...comptes.map((c) => [c.id, c.nom])], (v) => envoyer({ dg: { compte: v || null, modele: null } }))),
    cDg && modelesDg.length ? ligne(t('Modèle du DG'), choix(prio.dg.modele || '', [['', t('celui de Réglages › Général')], ...modelesDg.map((m) => [m.id, m.nom || m.id])], (v) => envoyer({ dg: { modele: v || null } }))) : null,
    ligne(t('Effort du DG'), choix(prio.dg.effort || '', [['', t('celui de Réglages › Général')], ...EFFORTS.map((e) => [e, e])], (v) => envoyer({ dg: { effort: v || null } })),
      h('small', { class: 'meta' }, t('Ces choix peuvent seulement relever le modèle et l’effort du DG, jamais les baisser.'))));

  // --- listes ordonnées « compte ou fournisseur · niveau »
  const libEntree = (e) => (e.compte ? nomCompte(e.compte) : t('tous les comptes {ia}', { ia: nomFournisseur(e.fournisseur) })) + (e.modele ? ' · ' + e.modele : e.niveau ? ' · ' + t((NIVEAUX.find((n) => n[0] === e.niveau) || [0, e.niveau])[1]) : '');
  const editeurOrdre = (ordre, patch) => {
    const ecrire = (liste) => envoyer(patch(liste));
    const items = ordre.map((e, i) => h('li', {},
      h('code', {}, libEntree(e)),
      badgeQualification(e.compte ? compte(e.compte) : null),
      h('button', { class: 'petit', type: 'button', title: t('Monter'), disabled: i === 0 ? true : null, on: { click: () => { const l = ordre.slice(); [l[i - 1], l[i]] = [l[i], l[i - 1]]; ecrire(l); } } }, '↑'),
      h('button', { class: 'petit', type: 'button', title: t('Descendre'), disabled: i === ordre.length - 1 ? true : null, on: { click: () => { const l = ordre.slice(); [l[i + 1], l[i]] = [l[i], l[i + 1]]; ecrire(l); } } }, '↓'),
      h('button', { class: 'petit danger', type: 'button', title: t('Retirer'), on: { click: () => ecrire(ordre.filter((_, j) => j !== i)) } }, '✕')));
    const cible = h('select', { class: 'champ' },
      h('option', { value: '' }, t('+ Ajouter…')),
      ...comptes.map((c) => h('option', { value: 'c:' + c.id }, c.nom)),
      ...fournisseurs.map((f) => h('option', { value: 'f:' + f.id }, t('tous les comptes {ia}', { ia: f.nom }))));
    const niveau = choix('', [['', t('niveau du DG')], ...NIVEAUX.map(([v, l]) => [v, t(l)])], () => {}, { 'aria-label': t('Niveau') });
    const ajouter = h('button', { class: 'petit ok', type: 'button', on: { click: () => {
      const v = cible.value;
      if (!v) return;
      const e = v.startsWith('c:') ? { compte: v.slice(2) } : { fournisseur: v.slice(2) };
      if (niveau.value) e.niveau = niveau.value;
      ecrire([...ordre, e]);
    } } }, t('Ajouter'));
    return h('div', {}, ordre.length ? h('ul', { class: 'param-liste' }, items) : h('small', { class: 'meta' }, t('Liste vide : le compte de la demande, comme avant.')), h('div', { class: 'param-ajout' }, cible, niveau, ajouter));
  };
  const naturesDe = (ty) => {
    if (ty === 'defaut') return h('small', { class: 'meta' }, t('Les tâches dont la nature n’est rattachée à aucun type.'));
    const actuelles = prio.types[ty].natures || [];
    return h('div', { class: 'param-val' }, (P.natures || Object.keys(NATURES)).map((n) =>
      h('label', { class: 'param-case' }, h('input', { type: 'checkbox', checked: actuelles.includes(n) ? true : null, on: { change: (e) => envoyer({ types: { [ty]: { natures: e.target.checked ? [...actuelles, n] : actuelles.filter((x) => x !== n) } } }) } }), ' ', t(NATURES[n] || n))));
  };
  const types = TYPES.map(([ty, lib]) => h('div', { class: 'param-compte' },
    h('div', { class: 'param-compte-tete' }, h('b', {}, t(lib))),
    naturesDe(ty),
    editeurOrdre(prio.types[ty].ordre, (l) => ({ types: { [ty]: { ordre: l } } }))));
  const roles = ROLES.map(([ro, lib]) => h('div', { class: 'param-compte' },
    h('div', { class: 'param-compte-tete' }, h('b', {}, t(lib))),
    ro === 'verif' ? h('small', { class: 'meta' }, t('Vide : le compte qui a produit la tâche, ou un autre fournisseur si le DG demande une relecture croisée.')) : null,
    editeurOrdre(prio.roles[ro].ordre, (l) => ({ roles: { [ro]: { ordre: l } } }))));

  // --- consigne au DG
  const consigne = h('textarea', { class: 'champ', rows: '3', maxlength: '2000', placeholder: t('ex. crée en priorité des tâches sur Codex') });
  consigne.value = prio.consigneDg || '';
  consigne.addEventListener('change', () => envoyer({ consigneDg: consigne.value }, t('Consigne enregistrée.')));

  // --- quota (D4)
  const quota = h('div', {},
    ligne(t('Limite d’usage atteinte'), choix(prio.quota.pause, [['compte', t('pause de ce compte seulement')], ['globale', t('pause de tout le QG (comme avant)')]], (v) => envoyer({ quota: { pause: v } }))),
    ligne(t('Autre compte libre'), h('label', { class: 'param-case' }, h('input', { type: 'checkbox', checked: prio.quota.proposerBascule ? true : null, on: { change: (e) => envoyer({ quota: { proposerBascule: e.target.checked } }) } }), ' ', t('me proposer de passer sur un autre compte (jamais sans mon accord)'))));
  const pauses = Object.entries(P.pauses || {});
  const blocPauses = pauses.length
    ? h('ul', { class: 'param-liste' }, pauses.map(([id, p]) => h('li', {},
      h('b', {}, nomCompte(id)), h('span', { class: 'badge st-warn' }, p.raison || t('en pause')),
      p.jusqua ? h('small', { class: 'meta' }, t('reprise vers {heure}', { heure: new Date(p.jusqua).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })) : null,
      h('button', { class: 'petit ok', type: 'button', on: { click: async () => { if (await param.poster('/api/reprendre', { compte: id }, t('{compte} reprend.', { compte: nomCompte(id) }))) charger(); } } }, t('Reprendre')))))
    : h('small', { class: 'meta' }, t('Aucun compte en pause.'));

  return [
    h('h4', {}, t('Maintenant')), maintenant,
    P.prereglages && P.prereglages.length ? h('h4', {}, t('Préréglages')) : null, prereglages,
    h('h4', {}, t('DG')), dg,
    h('h4', {}, t('Production par type de tâche')),
    h('small', { class: 'meta' }, t('Le premier compte de la liste qui est connecté et libre prend la tâche. Un niveau ne baisse jamais le modèle choisi par le DG.')),
    ...types,
    h('h4', {}, t('Autres rôles')), ...roles,
    h('h4', {}, t('Consigne au DG')), consigne,
    h('h4', {}, t('Quota')), quota,
    h('h4', {}, t('Comptes en pause')), blocPauses,
    h('h4', {}, t('Délégation d’images')), sectionDelegation(param, prio.delegation.images, envoyer, comptes),
  ];
}

// Réglages › Priorités › Délégation (D2, D3) : coupée par défaut.
function sectionDelegation(param, im, envoyer, comptes) {
  const S = param.store;
  const patch = (p) => envoyer({ delegation: { images: p } });
  const caseD = (val, lib, change, attrs = {}) => h('label', { class: 'param-case' }, h('input', { type: 'checkbox', checked: val ? true : null, ...attrs, on: { change: (e) => change(e.target.checked) } }), ' ', lib);
  const limite = (val, change) => {
    const n = h('input', { class: 'champ', type: 'number', min: '1', max: '1000', step: '1', value: val == null ? '' : String(val), disabled: val == null ? true : null, style: { width: '90px' } });
    n.addEventListener('change', () => {
      const v = Math.round(Number(n.value));
      if (v >= 1) change(v);
    });
    return h('span', { class: 'param-val' }, n, caseD(val == null, t('illimitée'), (x) => change(x ? null : 3)));
  };
  const etages = (S.etages || []).filter((e) => e.actif && e.projet);
  const cles = comptes.filter((c) => c.fournisseur === 'codex' && c.acces === 'cle');
  const plafond = h('input', { class: 'champ', type: 'number', min: '0', step: '1', placeholder: t('aucun'), value: im.api.plafondMensuelUsd == null ? '' : String(im.api.plafondMensuelUsd), style: { width: '110px' } });
  plafond.addEventListener('change', () => patch({ api: { plafondMensuelUsd: plafond.value === '' ? null : Math.max(0, Number(plafond.value)) } }));
  return h('div', { class: 'param-compte' },
    h('small', { class: 'meta' }, t('Un agent (Claude, Codex ou autre) peut demander une image au compte ChatGPT · Codex : outil « generer_image ». Chaque image est notée dans runtime/delegations.jsonl et montrée dans le fil.')),
    ligne(t('Activer'), caseD(im.actif, t('les agents peuvent générer des images'), (v) => patch({ actif: v }))),
    im.actif ? ligne(t('Accord'), caseD(im.accord, t('me demander mon accord pour chaque image'), (v) => patch({ accord: v }))) : null,
    im.actif ? ligne(t('Limite par demande'), limite(im.limites.defaut, (v) => patch({ limites: { defaut: v } }))) : null,
    ...(im.actif ? etages.map((e) => {
      const propre = Object.prototype.hasOwnProperty.call(im.limites.etages, e.id);
      const avec = (v) => patch({ limites: { etages: { ...im.limites.etages, [e.id]: v } } });
      const sans = () => { const r = { ...im.limites.etages }; delete r[e.id]; patch({ limites: { etages: r } }); };
      return ligne(e.nom || e.id, propre ? limite(im.limites.etages[e.id], avec) : h('span', { class: 'meta' }, t('comme par défaut')), caseD(propre, t('limite propre'), (x) => (x ? avec(im.limites.defaut) : sans())));
    }) : []),
    im.actif ? ligne(t('API Images (facturée)'), caseD(im.api.actif, t('si l’abonnement ne peut pas (taille, transparence, références, quota)'), (v) => patch({ api: { actif: v } }), { disabled: cles.length ? null : true }),
      cles.length ? null : h('small', { class: 'meta' }, t('Ajoute un compte ChatGPT · Codex avec clé API dans Réglages › Comptes IA.'))) : null,
    im.actif && im.api.actif ? ligne(t('Compte de l’API'), choix(im.api.compte || '', [['', t('le premier compte à clé')], ...cles.map((c) => [c.id, c.nom])], (v) => patch({ api: { compte: v || null } }))) : null,
    im.actif && im.api.actif ? ligne(t('Plafond mensuel (USD)'), plafond, h('small', { class: 'meta' }, t('Au-delà, ou sans plafond, ton accord est demandé avant chaque image facturée.'))) : null);
}
