// Réglages › Priorités : qui fait quoi quand plusieurs comptes IA sont connectés. Le DG (compte, modèle, effort),
// les consignes au DG (une générale, une par type de tâche), les comptes de production par type de tâche, les
// images (tâches d'images et délégation à ChatGPT · Codex), le vérificateur et l'ambiance, la conduite à tenir à la
// limite d'usage d'un compte et les comptes en pause. Tout passe par /api/priorites. « Maintenant » dit qui ferait
// quoi avec les comptes connectés. Chaque réglage a son « i » (web/aide.js).
import { h, api } from './modale.js';
import { t } from './i18n.js';
import { ligneI, titreI, bulle, choixAide, valeurAide, exempleAide } from './aide.js';

const TYPES = [['code', 'Code'], ['recherche', 'Recherche'], ['redaction', 'Rédaction'], ['image', 'Images'], ['defaut', 'Autres tâches']];
const ROLES = [['verif', 'Vérificateur'], ['ambiance', 'Ambiance (Joy, mini-jeu)']];
const NATURES = { analyse: 'analyse', impl: 'implémentation', bench: 'banc d’essai', test: 'tests', review: 'relecture', doc: 'documentation', asset: 'visuels', synthese: 'synthèse', ops: 'opérations' };
const NIVEAUX = [['eco', 'économe'], ['standard', 'standard'], ['fort', 'fort'], ['max', 'maximum']];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// Un exemple de consigne par type de tâche (texte grisé du champ vide et exemple de son « i »)
const EXEMPLES = {
  code: 'ajoute un test pour chaque correction ; commente le code en français',
  recherche: 'donne tes sources avec leur lien ; compare au moins trois solutions',
  redaction: 'phrases courtes, tutoiement, pas de mots anglais',
  image: 'style pixel art, fond transparent, couleurs vives',
  defaut: 'termine par un résumé de trois lignes de ce que tu as fait',
};
// À quoi sert chaque type (son « i » dans Production)
const ROLE_TYPE = {
  code: 'Écrire ou corriger du code, l’essayer, le relire, le déployer.',
  recherche: 'Lire, chercher, analyser, comparer, mesurer.',
  redaction: 'Écrire de la documentation, des résumés, des textes.',
  defaut: 'Les tâches dont la nature n’est cochée dans aucun type. Sa liste sert aussi après celle de chaque type.',
};

const ligne = (lib, ...contenu) => h('div', { class: 'param-ligne' }, h('label', { class: 'param-lib' }, lib), h('div', { class: 'param-val' }, ...contenu));
const choix = (valeur, options, change, attrs = {}) =>
  h('select', { class: 'champ', ...attrs, on: { change: (e) => change(e.target.value) } }, options.map(([v, l]) => h('option', { value: v, selected: v === (valeur ?? '') ? true : null }, l)));
// En-tête de bloc (type de tâche, rôle) avec son « i » : [en-tête, panneau]
const teteI = (cle, lib, aide) => {
  const b = bulle(cle, aide, { titre: lib });
  return [h('div', { class: 'param-compte-tete' }, h('b', {}, lib), b.bouton), b.panneau];
};

/** Badge « pas encore qualifié » : compte jamais essayé avec un vrai agent par le QG (agents ACP). */
export const badgeQualification = (c) => (c && c.qualification === 'non-faite' ? h('span', { class: 'badge st-warn', title: t('Ce type d’agent n’a pas encore été essayé par le QG : à essayer d’abord sur un petit projet.') }, t('pas encore qualifié')) : null);

/** Événement `priorites` (même corps que GET /api/priorites) : changement fait ici, dans un autre onglet ou par le
 *  fichier de Coût › mode avancé. Réglages › Priorités le montre tout de suite, sans relire le serveur. */
export function recevoirPriorites(param, ev) {
  const { seq, t: _t, type, ...donnees } = ev || {};
  if (!donnees.priorites || !donnees.apercu) return false;
  param.donneesPrio = donnees;
  param.prioritesT = Date.now();
  return true;
}

export function sectionPriorites(param) {
  const S = param.store;
  const ui = param.ui;
  const charger = async () => {
    const premier = !param.donneesPrio;
    param.prioritesT = Date.now();
    try {
      param.donneesPrio = await api('/api/priorites');
    } catch (e) {
      param.donneesPrio = param.donneesPrio || { erreur: e.message };
      ui.toast('erreur', e.message);
    }
    // une relecture ne redessine pas sous les doigts de quelqu'un qui écrit une consigne
    if (premier) param.rendre();
    else param.maj();
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
  const libCompte = (c) => c.nom + ' (' + nomFournisseur(c.fournisseur || 'claude') + ')' + (c.connecte ? '' : ' — ' + t('non connecté'));
  const modelesDe = (id) => (S.modeles || {})[id] || [];
  const nomModele = (id) => {
    for (const l of Object.values(S.modeles || {})) {
      const m = l.find((x) => x.id === id);
      if (m) return m.nom || m.id;
    }
    return id;
  };
  // doux : redessine seulement si personne n'écrit dans un champ (consignes)
  const envoyer = async (patch, ok = null, { doux = false } = {}) => {
    const r = await param.poster('/api/priorites', patch, ok);
    if (r) {
      param.donneesPrio = r;
      if (doux) param.maj();
      else param.rendre();
    }
  };

  // ---------------------------------------------------------------- maintenant : qui ferait quoi
  const etiquette = (l, titreRepli = t('Aucun compte de la liste ne peut le faire : premier compte connecté capable.')) => {
    if (!l) return h('span', { class: 'meta' }, t('aucune nature rattachée'));
    const c = compte(l.compte);
    return h('span', { class: 'param-val' },
      l.compte ? h('b', {}, nomCompte(l.compte)) : null,
      c ? h('span', { class: 'badge st-gris' }, nomFournisseur(c.fournisseur || 'claude')) : null,
      badgeQualification(c),
      l.demande ? h('span', { class: 'badge st-gris', title: t('Aucun compte réglé pour le DG : il prend le compte choisi en bas de l’écran (ici, le compte par défaut).') }, t('compte de la demande')) : null,
      l.moteur ? h('span', { class: 'badge st-gris' }, l.moteur === 'api' ? t('API Images, facturée') : t('abonnement ChatGPT')) : null,
      l.repli ? h('span', { class: 'badge st-gris', title: titreRepli }, t('repli')) : null,
      l.attente ? h('span', { class: 'badge st-warn' }, l.attente) : null);
  };
  const A = P.apercu;
  const maintenant = h('div', { class: 'param-compte' },
    ligne(t('DG'), etiquette(A.dg, A.dg.motif ? t('{motif} : le DG prend le compte de la demande.', { motif: A.dg.motif }) : undefined)),
    ...TYPES.map(([ty, lib]) => ligne(t(lib), etiquette(A.types[ty]))),
    ...ROLES.map(([ro, lib]) => ligne(t(lib), etiquette(A[ro]))),
    A.images ? ligne(t('Délégation d’images'), etiquette(A.images)) : null,
    h('small', { class: 'meta' }, t('Les questions d’un agent passent par le compte de sa tâche.'), ' ',
      prio.quota.bascule === 'auto' ? t('Un compte en pause est remplacé tout seul par un compte libre (Quota › Autre compte libre).')
        : prio.quota.bascule === 'jamais' ? t('Un compte en pause n’est jamais remplacé : ses tâches attendent sa reprise.')
          : t('Un compte en pause n’est jamais remplacé sans ton accord.')));
  const aideMaintenant = [
    t('Ce que le QG ferait si tu envoyais une demande maintenant, avec les comptes connectés et les réglages de cette page. Rien n’est lancé.'),
    [t('compte de la demande :'), t('le compte choisi en bas de l’écran, à côté du champ de saisie (ici, le compte par défaut). Les tâches sans liste tournent sur ce compte, ou sur celui de Réglages › Comptes IA › Agents de la demande s’il est réglé.')],
    [t('repli :'), t('aucun compte de la liste n’est connecté ou ne sait faire ce travail ; le QG prend le premier compte connecté qui sait le faire. Avec seulement des comptes Claude connectés, il n’y a pas de repli : le compte de la demande.')],
    [t('badge orange :'), t('le compte est en pause (limite d’usage, connexion perdue) ; ses tâches attendent ou passent sur un autre compte, selon « Quota ».')],
  ];

  // ---------------------------------------------------------------- préréglages
  const prereglages = h('div', { class: 'boutons' }, (P.prereglages || []).map((p) =>
    h('button', { class: 'petit', type: 'button', on: { click: () => envoyer({ prereglage: p.id }, t('Préréglage appliqué.')) } }, p.libelle)));
  const aidePrereglages = [
    t('Remplissent d’un clic le compte du DG et les listes de cette page selon les comptes que tu as. Tu peux tout retoucher ensuite.'),
    choixAide(t('Tout sur le compte de la demande'), t('vide toutes les listes : le DG et les tâches tournent sur le compte choisi en bas de l’écran.')),
    choixAide(t('Tout sur un compte'), t('le DG, toutes les tâches et l’ambiance sur ce compte ; chaque tâche est vérifiée par le compte qui l’a faite.')),
    t('Le modèle et l’effort du DG, les consignes et le quota ne changent pas.'),
  ];

  // ---------------------------------------------------------------- DG : compte, modèle, effort
  const D = P.dg || {};
  const conseille = D.conseille || { modele: 'opus', effort: 'xhigh' };
  const cDg = prio.dg.compte || '';
  const connectes = comptes.filter((c) => c.connecte);
  // compte choisi : ses modèles ; sinon ceux des IA connectées, groupés par IA, sans doublon
  const groupesModeles = () => {
    if (cDg) return [[null, modelesDe(cDg)]];
    const vus = new Set();
    const groupes = [];
    for (const f of S.fournisseurs || []) {
      const liste = [];
      for (const c of (connectes.length ? connectes : comptes).filter((x) => (x.fournisseur || 'claude') === f.id)) {
        for (const m of modelesDe(c.id)) {
          if (vus.has(m.id)) continue;
          vus.add(m.id);
          liste.push(m);
        }
      }
      if (liste.length) groupes.push([f.nom, liste]);
    }
    return groupes;
  };
  const groupes = groupesModeles();
  const tous = groupes.flatMap(([, l]) => l);
  const optionModele = (m) => h('option', { value: m.id, selected: m.id === D.modele ? true : null }, m.nom || m.id);
  const selModele = h('select', { class: 'champ', 'aria-label': t('Modèle du DG'), on: { change: (e) => envoyer({ dg: { modele: e.target.value } }, t('Modèle du DG enregistré.')) } },
    tous.some((m) => m.id === D.modele) ? null : h('option', { value: D.modele, selected: true }, t('{modele} (converti selon le compte)', { modele: nomModele(D.modele) })),
    groupes.map(([nom, l]) => (nom && groupes.length > 1 ? h('optgroup', { label: nom }, l.map(optionModele)) : l.map(optionModele))).flat());
  const effortsModele = tous.find((m) => m.id === D.modele)?.efforts;
  const efforts = effortsModele && effortsModele.length ? [...effortsModele] : [...EFFORTS];
  if (D.effort && !efforts.includes(D.effort)) efforts.push(D.effort);
  const selEffort = choix(D.effort, efforts.map((e) => [e, e === conseille.effort ? t('{effort} (conseillé)', { effort: e }) : e]), (v) => envoyer({ dg: { effort: v } }, t('Effort du DG enregistré.')), { 'aria-label': t('Effort du DG') });
  const estConseille = D.modele === conseille.modele && D.effort === conseille.effort;
  const parCompte = Object.entries(D.parCompte || {}).filter(([id]) => !cDg || id === cDg);
  const dg = h('div', { class: 'param-compte' },
    ligneI('prio-dg-compte', t('Compte du DG'), [
      choixAide(t('Celui de la demande'), t('le DG tourne sur le compte choisi en bas de l’écran, à côté du champ de saisie.')),
      choixAide(t('Un compte précis'), t('le DG tourne toujours sur ce compte, quel que soit le compte de la demande. Les tâches, elles, suivent « Production par type de tâche ».')),
      t('Si ce compte n’est pas connecté, le DG prend le compte de la demande. S’il est en pause (limite d’usage), le DG attend sa reprise.'),
      exempleAide(t('tes tâches de code partent sur ChatGPT · Codex, mais le DG reste sur ton compte Claude.')),
    ], choix(cDg, [['', t('celui de la demande (choisi en bas de l’écran)')], ...comptes.map((c) => [c.id, libCompte(c)])], (v) => envoyer({ dg: { compte: v || null } }, t('Compte du DG enregistré.')), { 'aria-label': t('Compte du DG') })),
    ligneI('prio-dg-modele', t('Modèle du DG'), [
      t('Le modèle d’IA qui fait le travail du DG. Les plus capables font de meilleurs plans, mais consomment plus vite ton quota.'),
      t('Si le compte du DG n’a pas ce modèle (autre IA, autre forfait), le QG prend chez lui un modèle de même niveau ou au-dessus ; s’il n’en a pas d’aussi fort, son modèle le plus capable. « Selon le compte » montre le résultat sur chaque compte connecté.'),
      t('Conseillé : {modele}.', { modele: nomModele(conseille.modele) }),
    ], selModele),
    ligneI('prio-dg-effort', t('Effort du DG'), [
      t('Le temps que le DG prend pour réfléchir avant de répondre.'),
      valeurAide('low', t('réponse rapide, réflexion courte')),
      valeurAide('medium', t('réflexion moyenne')),
      valeurAide('high', t('réflexion poussée')),
      valeurAide('xhigh', t('réflexion très poussée')),
      valeurAide('max', t('le plus long et le plus coûteux')),
      t('Conseillé : {effort}. Une IA qui ne connaît pas cet effort prend le plus proche qu’elle sait faire.', { effort: conseille.effort }),
    ], selEffort),
    ligneI('prio-dg-conseille', t('Réglage conseillé'), [
      t('Le modèle et l’effort que le QG conseille pour le DG : {modele} · {effort}.', { modele: nomModele(conseille.modele), effort: conseille.effort }),
      t('Plus bas, le DG découpe moins bien ta demande (tâches mal réparties, oublis). Plus haut, il consomme plus de quota.'),
    ],
    h('button', { class: 'petit', type: 'button', disabled: estConseille ? true : null, on: { click: () => envoyer({ dg: { modele: conseille.modele, effort: conseille.effort } }, t('Réglage conseillé remis.')) } },
      t('Remettre le réglage conseillé ({modele} · {effort})', { modele: nomModele(conseille.modele), effort: conseille.effort })),
    D.sousConseille ? h('div', { class: 'param-avert' }, t('Réglage plus bas que le conseillé : le DG peut faire des plans moins sûrs.')) : null),
    parCompte.length ? ligneI('prio-dg-par-compte', t('Selon le compte'), [
      t('Le modèle et l’effort que le DG aurait vraiment sur chaque compte connecté, avec les réglages ci-dessus.'),
    ], h('ul', { class: 'param-liste' }, parCompte.map(([id, r]) => h('li', {},
      h('b', {}, nomCompte(id)),
      h('span', {}, (r.modele ? nomModele(r.modele) : t('modèle par défaut de l’agent')) + ' · ' + (r.effort || '—')))))) : null,
    h('small', { class: 'meta' }, t('Le coût de la demande (Économe, Équilibré, Max, Personnalisé) ne touche jamais au DG.')));
  const aideDg = [
    t('Le DG (directeur général) lit ta demande, la découpe en tâches, choisit qui fait quoi, puis vérifie et résume le résultat. C’est lui qui réfléchit le plus : un bon modèle et un effort élevé donnent de meilleurs plans.'),
    t('Ces réglages valent pour chaque nouvelle demande ; une demande déjà envoyée garde ceux du moment de l’envoi.'),
    t('Le coût de la demande (Économe, Équilibré, Max, Personnalisé) ne touche jamais au DG.'),
  ];

  // ---------------------------------------------------------------- consignes au DG
  // Champ de consigne : enregistré après une pause de frappe (sans message) et en quittant le champ (avec message).
  const zone = (valeur, max, exemple, patch, attrs = {}) => {
    const z = h('textarea', { class: 'champ zone', rows: '2', maxlength: String(max), placeholder: exemple, ...attrs });
    z.value = valeur || '';
    let vu = z.value.trim();
    let minuteur = null;
    let aDire = false;
    const garder = (dire) => {
      clearTimeout(minuteur);
      const v = z.value.trim();
      if (v !== vu) {
        vu = v;
        aDire = !dire;
        envoyer(patch(v), dire ? t('Consigne enregistrée.') : null, { doux: true });
      } else if (dire && aDire) {
        aDire = false;
        ui.toast('info', t('Consigne enregistrée.'));
      }
    };
    z.addEventListener('input', () => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => garder(false), 1500);
    });
    z.addEventListener('change', () => garder(true));
    return z;
  };
  const naturesTexte = (ty) => (prio.types[ty]?.natures || []).map((n) => t(NATURES[n] || n)).join(', ');
  const consignes = h('div', { class: 'param-compte' },
    ligneI('prio-consigne-generale', t('Consigne générale'), [
      t('Le DG la suit pour toute la demande : son plan, son découpage en tâches, le choix des comptes et des IA.'),
      exempleAide(t('« Mon grand-père de 70 ans doit pouvoir tout comprendre : explique sans jargon. »')),
      exempleAide(t('« Le code sur Codex, la relecture sur Claude. »')),
    ], zone(prio.consigneDg, 2000, t('ex. {exemple}', { exemple: t('explique chaque étape comme à quelqu’un qui débute') }), (v) => ({ consigneDg: v }), { rows: '3', 'aria-label': t('Consigne générale') })),
    ...TYPES.map(([ty, lib]) => ligneI('prio-consigne-' + ty, t(lib), [
      ty === 'defaut'
        ? t('Pour les tâches d’un type sans consigne à lui, et celles dont la nature n’est rattachée à aucun type.')
        : naturesTexte(ty) ? t('Pour chaque tâche de type « {type} » ({natures}).', { type: t(lib), natures: naturesTexte(ty) }) : t('Aucune nature n’est rattachée à ce type : sa consigne ne sert pas.'),
      t('Le QG la recopie mot pour mot dans les instructions de l’agent de chaque tâche de ce type, et la montre au vérificateur. Si ta demande exige autre chose pour une tâche, sa mission l’emporte.'),
      exempleAide('« ' + t(EXEMPLES[ty]) + ' »'),
    ], zone(prio.types[ty]?.consigne, 1000, t('ex. {exemple}', { exemple: t(EXEMPLES[ty]) }), (v) => ({ types: { [ty]: { consigne: v } } }), { 'aria-label': t('Consigne pour : {type}', { type: t(lib) }) }))));
  const aideConsignes = [
    t('Des consignes que le DG suit à chaque nouvelle demande, sans que tu aies à les répéter dans ton message : une méthode de travail, un style d’écriture, le choix des IA pour telle ou telle tâche…'),
    [t('Générale :'), t('le DG la suit pour toute la demande.')],
    [t('Par type de tâche :'), t('le QG la recopie mot pour mot dans les instructions de l’agent de chaque tâche de ce type, et la montre au vérificateur ; le DG la connaît pour préparer ses tâches. Si ta demande exige autre chose pour une tâche, sa mission l’emporte.')],
    t('Un type sans consigne prend celle d’« Autres tâches ». Les consignes valent aussi avec une seule IA connectée.'),
    t('Une demande déjà envoyée garde les consignes du moment de l’envoi : les changer ici vaut pour les demandes suivantes.'),
    t('Le texte s’enregistre tout seul pendant que tu écris.'),
  ];

  // ---------------------------------------------------------------- listes ordonnées
  const boutonsOrdre = (liste, i, ecrire) => [
    h('button', { class: 'petit', type: 'button', title: t('Monter'), 'aria-label': t('Monter'), disabled: i === 0 ? true : null, on: { click: () => { const l = liste.slice(); [l[i - 1], l[i]] = [l[i], l[i - 1]]; ecrire(l); } } }, '↑'),
    h('button', { class: 'petit', type: 'button', title: t('Descendre'), 'aria-label': t('Descendre'), disabled: i === liste.length - 1 ? true : null, on: { click: () => { const l = liste.slice(); [l[i + 1], l[i]] = [l[i], l[i + 1]]; ecrire(l); } } }, '↓'),
    h('button', { class: 'petit danger', type: 'button', title: t('Retirer'), 'aria-label': t('Retirer'), on: { click: () => ecrire(liste.filter((_, j) => j !== i)) } }, '✕'),
  ];
  const nonConnecte = (c) => (c && !c.connecte ? h('span', { class: 'badge st-gris' }, t('non connecté')) : null);
  // « compte ou fournisseur · niveau »
  const libEntree = (e) => (e.compte ? nomCompte(e.compte) : t('tous les comptes {ia}', { ia: nomFournisseur(e.fournisseur) })) + (e.modele ? ' · ' + e.modele : e.niveau ? ' · ' + t((NIVEAUX.find((n) => n[0] === e.niveau) || [0, e.niveau])[1]) : '');
  const editeurOrdre = (ordre, patch, vide) => {
    const ecrire = (liste) => envoyer(patch(liste));
    const cible = h('select', { class: 'champ', 'aria-label': t('Compte ou IA à ajouter') },
      h('option', { value: '' }, t('+ Ajouter…')),
      ...comptes.map((c) => h('option', { value: 'c:' + c.id }, libCompte(c))),
      ...fournisseurs.map((f) => h('option', { value: 'f:' + f.id }, t('tous les comptes {ia}', { ia: f.nom }))));
    const niveau = choix('', [['', t('niveau choisi par le DG')], ...NIVEAUX.map(([v, l]) => [v, t('au moins {niveau}', { niveau: t(l) })])], () => {}, { 'aria-label': t('Niveau') });
    const ajouter = h('button', { class: 'petit ok', type: 'button', on: { click: () => {
      const v = cible.value;
      if (!v) return;
      const e = v.startsWith('c:') ? { compte: v.slice(2) } : { fournisseur: v.slice(2) };
      if (niveau.value) e.niveau = niveau.value;
      ecrire([...ordre, e]);
    } } }, t('Ajouter'));
    return h('div', {},
      ordre.length
        ? h('ol', { class: 'param-liste' }, ordre.map((e, i) => h('li', {}, h('code', {}, libEntree(e)), badgeQualification(e.compte ? compte(e.compte) : null), nonConnecte(e.compte ? compte(e.compte) : null), ...boutonsOrdre(ordre, i, ecrire))))
        : h('small', { class: 'meta' }, vide),
      h('div', { class: 'param-ajout' }, cible, niveau, ajouter));
  };
  const naturesDe = (ty) => {
    const actuelles = prio.types[ty].natures || [];
    return h('div', { class: 'param-val' }, (P.natures || Object.keys(NATURES)).map((n) =>
      h('label', { class: 'param-case' }, h('input', { type: 'checkbox', checked: actuelles.includes(n) ? true : null, on: { change: (e) => envoyer({ types: { [ty]: { natures: e.target.checked ? [...actuelles, n] : actuelles.filter((x) => x !== n) } } }) } }), ' ', t(NATURES[n] || n))));
  };
  const videType = (ty) => (ty === 'defaut' ? t('Liste vide : le compte de la demande.') : t('Liste vide : la liste d’« Autres tâches », puis le compte de la demande.'));

  // ---------------------------------------------------------------- production par type de tâche (sans les images)
  const production = TYPES.filter(([ty]) => ty !== 'image').map(([ty, lib]) => h('div', { class: 'param-compte' },
    ...teteI('prio-type-' + ty, t(lib), [
      t(ROLE_TYPE[ty]),
      ty === 'defaut' ? null : t('Les cases sont les natures de tâche de ce type. Une nature n’appartient qu’à un type : la cocher ici la retire de l’autre.'),
    ]),
    ty === 'defaut' ? null : naturesDe(ty),
    editeurOrdre(prio.types[ty].ordre, (l) => ({ types: { [ty]: { ordre: l } } }), videType(ty))));
  const aideProduction = [
    t('Le DG découpe ta demande en tâches et donne à chacune une nature (implémentation, tests, documentation…). Chaque nature appartient à un type : Code, Recherche, Rédaction, Images ou Autres tâches.'),
    t('La liste d’un type dit quels comptes font ses tâches, dans l’ordre de préférence : le premier compte de la liste qui est connecté et sait faire la tâche la prend. Après la liste du type viennent celle d’« Autres tâches », puis le compte de la demande (ou celui de Réglages › Comptes IA › Agents de la demande).'),
    t('Un compte non connecté est sauté. Un compte en pause (limite d’usage) ne l’est pas : la tâche l’attend, ou passe sur un autre compte selon « Quota ».'),
    t('« Tous les comptes » d’une IA : ses comptes, dans l’ordre de la liste de Réglages › Comptes IA.'),
    [t('Niveau :'), t('un plancher. Le modèle de la tâche est au moins de ce niveau ; si le DG a choisi plus fort, son choix reste. Un niveau ne baisse jamais le modèle choisi par le DG.')],
    t('Si le DG impose une IA pour une tâche, la liste sert à choisir parmi les comptes de cette IA (ceux de la liste d’abord) ; sans compte connecté de cette IA, la tâche attend. Une conversation déjà commencée reste sur son compte.'),
    t('Aucun compte de la liste ne peut faire la tâche : le QG prend le premier compte connecté qui sait la faire (« repli »). Avec seulement des comptes Claude connectés, il n’y a pas de repli : la tâche prend le compte de la demande.'),
    exempleAide(t('Code : « tous les comptes ChatGPT · Codex », puis ton compte Claude. Le code part sur Codex ; sans compte Codex connecté, sur Claude.')),
  ];

  // ---------------------------------------------------------------- images : tâches d'images et délégation
  const images = [
    h('div', { class: 'param-compte' },
      ...teteI('prio-images-taches', t('Tâches d’images et compte de la délégation'), [
        t('Les tâches d’images (icône, illustration, sprite…) partent sur le premier compte connecté de cette liste, comme les autres types de tâches.'),
        t('La même liste choisit le compte ChatGPT · Codex de la délégation : ses comptes Codex d’abord, dans l’ordre, puis les autres comptes Codex.'),
        t('Les cases sont les natures de tâche de ce type.'),
      ]),
      naturesDe('image'),
      editeurOrdre(prio.types.image.ordre, (l) => ({ types: { image: { ordre: l } } }), videType('image'))),
    sectionDelegation(param, prio.delegation.images, envoyer, comptes),
  ];
  const aideImages = [
    t('Le QG a deux façons de produire des images.'),
    [t('Tâches d’images :'), t('le DG crée une tâche de nature « visuels ». Elle part sur un compte de la liste ci-dessous, comme les autres tâches.')],
    [t('Délégation :'), t('pendant n’importe quelle tâche, un agent (Claude, Codex ou autre) demande une image toute faite au compte ChatGPT · Codex, avec l’outil « generer_image ». Coupée tant que tu ne l’actives pas.')],
  ];

  // ---------------------------------------------------------------- autres rôles
  const aideRoles = {
    verif: [
      t('Quand une tâche est relue par un vérificateur séparé, il tourne sur le premier compte connecté de cette liste. Il relit le travail et peut demander de le refaire.'),
      t('Liste vide, ou aucun compte de la liste connecté : le compte qui a fait la tâche.'),
      t('Relecture croisée : si le DG a choisi pour la vérification un modèle d’une autre IA, un compte de cette IA passe avant la liste.'),
      t('Le DG choisit pour chaque tâche si elle est vérifiée, et comment : par l’agent lui-même, par un vérificateur séparé, ou par toi.'),
    ],
    ambiance: [
      t('Les petits messages de Joy et le mini-jeu, qui ne touchent pas à ton travail.'),
      t('Liste vide : pour le mini-jeu, ton compte par défaut d’abord ; pour Joy, le premier compte connecté, dans l’ordre de Réglages › Comptes IA (les agents déjà essayés par le QG d’abord). Un compte en pause n’est pas remplacé : l’ambiance attend sa reprise.'),
    ],
  };
  const roles = ROLES.map(([ro, lib]) => h('div', { class: 'param-compte' },
    ...teteI('prio-role-' + ro, t(lib), aideRoles[ro]),
    editeurOrdre(prio.roles[ro].ordre, (l) => ({ roles: { [ro]: { ordre: l } } }), ro === 'verif' ? t('Liste vide : le compte qui a fait la tâche.') : t('Liste vide : ton compte par défaut pour le mini-jeu, le premier compte connecté pour Joy.'))));

  // ---------------------------------------------------------------- quota
  const ordreQuota = prio.quota.ordre || [];
  const ecrireQuota = (l) => envoyer({ quota: { ordre: l } });
  const ajoutQuota = h('select', { class: 'champ', 'aria-label': t('Compte à ajouter') },
    h('option', { value: '' }, t('+ Ajouter…')),
    ...comptes.filter((c) => !ordreQuota.includes(c.id)).map((c) => h('option', { value: c.id }, libCompte(c))));
  const quota = h('div', { class: 'param-compte' },
    ligneI('prio-quota-pause', t('Limite d’usage atteinte'), [
      choixAide(t('Pause de ce compte seulement'), t('seules les tâches de ce compte attendent ; les autres comptes continuent.')),
      choixAide(t('Pause de tout le QG'), t('plus aucune tâche ne part, sur aucun compte, jusqu’à la reprise.')),
      t('Avec un seul compte connecté, une limite met toujours tout le QG en pause : aucun autre compte ne peut continuer.'),
    ], choix(prio.quota.pause, [['compte', t('pause de ce compte seulement')], ['globale', t('pause de tout le QG : plus aucune tâche ne part, sur aucun compte')]], (v) => envoyer({ quota: { pause: v } }), { 'aria-label': t('Limite d’usage atteinte') })),
    ligneI('prio-quota-bascule', t('Autre compte libre'), [
      t('Ce que fait le QG quand un compte est en pause et qu’un autre compte libre pourrait prendre ses tâches.'),
      choixAide(t('Me demander'), t('une carte te propose d’attendre ou de passer les tâches du dossier sur un autre compte.')),
      choixAide(t('Passer tout seul'), t('les tâches du dossier passent sur un autre compte libre, sans te demander.'), null, t('changer de compte pour contourner une limite peut être contraire aux conditions d’utilisation du fournisseur (OpenAI le déconseille). Entre deux comptes Claude, les agents gardent leur conversation ; vers une autre IA (Codex, un agent ACP), ils repartent d’une conversation neuve et perdent leur contexte.')),
      choixAide(t('Ne jamais changer'), t('les tâches attendent la reprise du compte.')),
      t('Un changement de compte vaut pour ce dossier seulement et s’arrête quand le compte reprend.'),
    ], choix(prio.quota.bascule, [['demander', t('me demander avant de passer sur un autre compte')], ['auto', t('passer tout seul sur un autre compte libre')], ['jamais', t('ne jamais changer de compte : attendre la reprise')]], (v) => envoyer({ quota: { bascule: v } }), { 'aria-label': t('Autre compte libre') }),
    prio.quota.bascule === 'auto' ? h('div', { class: 'param-avert' }, t('Changer de compte pour contourner une limite peut être contraire aux conditions d’utilisation du fournisseur (OpenAI le déconseille). Entre deux comptes Claude, les agents gardent leur conversation ; vers une autre IA, ils perdent leur contexte.')) : null),
    prio.quota.bascule === 'jamais' ? null : ligneI('prio-quota-ordre', t('Comptes de remplacement'), [
      t('Vers quels comptes passer quand un compte est en pause, dans l’ordre de préférence. Le premier qui est connecté, libre et sait faire la tâche est proposé (ou pris tout seul, selon le choix du dessus).'),
      t('Liste vide : le premier compte connecté et libre qui sait faire la tâche (les agents déjà essayés par le QG d’abord).'),
      t('« Seulement ces comptes » : jamais un compte hors de la liste ; sans compte libre dans la liste, les tâches attendent.'),
      exempleAide(t('ton compte Claude perso est en pause : passer d’abord sur ton compte Claude pro, puis sur ChatGPT · Codex.')),
    ],
    ordreQuota.length
      ? h('ol', { class: 'param-liste' }, ordreQuota.map((id, i) => h('li', {}, h('code', {}, nomCompte(id)), badgeQualification(compte(id)), nonConnecte(compte(id)), ...boutonsOrdre(ordreQuota, i, ecrireQuota))))
      : h('small', { class: 'meta' }, t('Liste vide : le premier compte connecté et libre qui sait faire la tâche.')),
    h('div', { class: 'param-ajout' }, ajoutQuota, h('button', { class: 'petit ok', type: 'button', on: { click: () => ajoutQuota.value && ecrireQuota([...ordreQuota, ajoutQuota.value]) } }, t('Ajouter'))),
    ordreQuota.length
      ? h('label', { class: 'param-case' }, h('input', { type: 'checkbox', checked: prio.quota.seulementListe ? true : null, on: { change: (e) => envoyer({ quota: { seulementListe: e.target.checked } }) } }), ' ', t('seulement ces comptes'))
      : null));
  const aideQuota = [
    t('Chaque abonnement a une limite d’usage (par exemple sur 5 heures ou sur la semaine). Quand un compte l’atteint, ou perd sa connexion, il se met en pause jusqu’à sa reprise.'),
    t('Ces réglages disent qui attend, et si ses tâches peuvent passer sur un autre compte.'),
    t('Avec un seul compte connecté, une limite d’usage met tout le QG en pause jusqu’à la reprise. La pause d’un seul compte et les comptes de remplacement servent dès que deux comptes sont connectés, de la même IA ou non (par exemple deux comptes Claude).'),
  ];

  // ---------------------------------------------------------------- comptes en pause
  const pauses = Object.entries(P.pauses || {});
  const blocPauses = pauses.length
    ? h('ul', { class: 'param-liste' }, pauses.map(([id, p]) => h('li', {},
      h('b', {}, nomCompte(id)), h('span', { class: 'badge st-warn' }, p.raison || t('en pause')),
      p.jusqua ? h('small', { class: 'meta' }, t('reprise vers {heure}', { heure: new Date(p.jusqua).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })) : null,
      h('button', { class: 'petit ok', type: 'button', on: { click: async () => { if (await param.poster('/api/reprendre', { compte: id }, t('{compte} reprend.', { compte: nomCompte(id) }))) charger(); } } }, t('Reprendre')))))
    : h('small', { class: 'meta' }, t('Aucun compte en pause.'));
  const aidePauses = [
    t('Les comptes qui ont atteint leur limite d’usage ou perdu leur connexion. Un compte en pause pour sa limite d’usage reprend tout seul à l’heure indiquée ; un compte qui a perdu sa connexion reprend quand tu le reconnectes (Réglages › Comptes IA).'),
    t('« Reprendre » relance un compte tout de suite (par exemple après avoir changé d’abonnement). Si sa limite n’est pas levée, il se remet en pause à la tâche suivante.'),
  ];

  return [
    ...titreI('prio-maintenant', t('Maintenant'), aideMaintenant), maintenant,
    ...(P.prereglages && P.prereglages.length ? [...titreI('prio-prereglages', t('Préréglages'), aidePrereglages), prereglages] : []),
    ...titreI('prio-dg', t('DG'), aideDg), dg,
    ...titreI('prio-consignes', t('Consignes au DG'), aideConsignes), consignes,
    ...titreI('prio-production', t('Production par type de tâche'), aideProduction), ...production,
    ...titreI('prio-images', t('Images'), aideImages), ...images,
    ...titreI('prio-roles', t('Autres rôles'), [t('Le vérificateur et l’ambiance ont leur propre liste de comptes, dans l’ordre de préférence.')]), ...roles,
    ...titreI('prio-quota', t('Quota'), aideQuota), quota,
    ...titreI('prio-pauses', t('Comptes en pause'), aidePauses), blocPauses,
  ];
}

// Délégation d'images à ChatGPT · Codex (outil generer_image) : coupée par défaut.
function sectionDelegation(param, im, envoyer, comptes) {
  const S = param.store;
  const patch = (p) => envoyer({ delegation: { images: p } });
  const caseD = (val, lib, change, attrs = {}) => h('label', { class: 'param-case' }, h('input', { type: 'checkbox', checked: val ? true : null, ...attrs, on: { change: (e) => change(e.target.checked) } }), ' ', lib);
  const limite = (val, change) => {
    const n = h('input', { class: 'champ', type: 'number', min: '1', max: '1000', step: '1', value: val == null ? '' : String(val), disabled: val == null ? true : null, style: { width: '90px' }, 'aria-label': t('Nombre d’images') });
    n.addEventListener('change', () => {
      const v = Math.round(Number(n.value));
      if (v >= 1) change(v);
    });
    return h('span', { class: 'param-val' }, n, caseD(val == null, t('illimitée'), (x) => change(x ? null : 3)));
  };
  const etages = (S.etages || []).filter((e) => e.actif && e.projet);
  const codex = comptes.filter((c) => c.fournisseur === 'codex');
  const cles = codex.filter((c) => c.acces === 'cle');
  const plafond = h('input', { class: 'champ', type: 'number', min: '0', step: '1', placeholder: t('aucun'), value: im.api.plafondMensuelUsd == null ? '' : String(im.api.plafondMensuelUsd), style: { width: '110px' }, 'aria-label': t('Plafond mensuel (USD)') });
  plafond.addEventListener('change', () => patch({ api: { plafondMensuelUsd: plafond.value === '' ? null : Math.max(0, Number(plafond.value)) } }));
  return h('div', { class: 'param-compte' },
    ...teteI('prio-deleg', t('Délégation à ChatGPT · Codex'), [
      t('Pendant une tâche, un agent peut avoir besoin d’une image. Délégation activée, il la demande au compte ChatGPT · Codex avec l’outil « generer_image » et la reçoit dans le projet.'),
      t('Chaque image est notée dans runtime/delegations.jsonl et montrée dans le fil du dossier.'),
    ]),
    ligneI('prio-deleg-actif', t('Activer'), [
      choixAide(t('Coché'), t('les agents reçoivent l’outil « generer_image ».')),
      choixAide(t('Décoché'), t('aucun agent ne peut demander d’image.')),
    ], caseD(im.actif, t('les agents peuvent générer des images'), (v) => patch({ actif: v })),
    codex.length ? null : h('small', { class: 'meta' }, t('Ajoute un compte ChatGPT · Codex dans Réglages › Comptes IA.'))),
    im.actif ? ligneI('prio-deleg-accord', t('Accord'), [
      choixAide(t('Coché'), t('une carte te demande ton accord avant chaque image, avec sa description.')),
      choixAide(t('Décoché'), t('les images se font sans te demander, dans la limite par demande.')),
      t('Une image facturée par l’API qui dépasse le plafond mensuel demande toujours ton accord.'),
    ], caseD(im.accord, t('me demander mon accord pour chaque image'), (v) => patch({ accord: v }))) : null,
    im.actif ? ligneI('prio-deleg-limite', t('Limite par demande'), [
      t('Le nombre d’images qu’une même demande peut faire générer sur un étage.'),
      valeurAide('3', t('trois images au plus ; au-delà, ton accord est demandé si « Accord » est coché, sinon l’image est refusée.')),
      valeurAide(t('illimitée'), t('aucune limite.')),
      t('Un étage peut avoir sa propre limite : coche « limite propre » sur sa ligne.'),
    ], limite(im.limites.defaut, (v) => patch({ limites: { defaut: v } }))) : null,
    ...(im.actif ? etages.map((e) => {
      const propre = Object.prototype.hasOwnProperty.call(im.limites.etages, e.id);
      const avec = (v) => patch({ limites: { etages: { ...im.limites.etages, [e.id]: v } } });
      const sans = () => { const r = { ...im.limites.etages }; delete r[e.id]; patch({ limites: { etages: r } }); };
      return ligne(e.nom || e.id, propre ? limite(im.limites.etages[e.id], avec) : h('span', { class: 'meta' }, t('limite par demande')), caseD(propre, t('limite propre'), (x) => (x ? avec(im.limites.defaut) : sans())));
    }) : []),
    im.actif ? ligneI('prio-deleg-api', t('API Images (facturée)'), [
      t('Quand l’abonnement ChatGPT ne peut pas faire l’image (taille ou qualité imposée, fond transparent, images de référence, quota épuisé), le QG peut passer par l’API Images d’OpenAI, payée à l’image avec une clé API.'),
      t('Décoché : ces images-là ne sont pas faites ; l’agent le signale dans son rapport.'),
    ], caseD(im.api.actif, t('si l’abonnement ne peut pas (taille, transparence, références, quota)'), (v) => patch({ api: { actif: v } }), { disabled: cles.length ? null : true }),
    cles.length ? null : h('small', { class: 'meta' }, t('Ajoute un compte ChatGPT · Codex avec clé API dans Réglages › Comptes IA.'))) : null,
    im.actif && im.api.actif ? ligneI('prio-deleg-api-compte', t('Compte de l’API'), [t('Le compte ChatGPT · Codex dont la clé API paie les images.')],
      choix(im.api.compte || '', [['', t('le premier compte à clé')], ...cles.map((c) => [c.id, c.nom])], (v) => patch({ api: { compte: v || null } }), { 'aria-label': t('Compte de l’API') })) : null,
    im.actif && im.api.actif ? ligneI('prio-deleg-plafond', t('Plafond mensuel (USD)'), [
      t('Le montant maximum à dépenser chaque mois en images par l’API.'),
      t('Au-delà, ou sans plafond, ton accord est demandé avant chaque image facturée.'),
    ], plafond) : null);
}
