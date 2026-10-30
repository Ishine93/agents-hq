// Routeur multi-IA (docs/multi-ia/conception.md §5) : quel compte, quel modèle et quel effort pour chaque rôle
// (DG, production selon la nature de la tâche, vérificateur, questions, ambiance). Les priorités se règlent
// dans config/priorites.json (défauts : config/defauts/priorites.json ; listes vides : tout tourne sur le compte
// de la demande). Le même fichier garde le réglage du DG (compte, modèle, effort), les consignes de l'utilisateur
// au DG (une générale, une par type de tâche) et l'ordre des comptes vers lesquels basculer (quota.ordre).
// Règle D4 : le routeur ne bascule jamais seul d'un compte à un autre. Un compte choisi qui est en pause
// (limite d'usage, connexion perdue) met la tâche en attente, avec une proposition : selon quota.bascule,
// l'utilisateur l'accepte (carte de décision de l'ordonnanceur, défaut), l'ordonnanceur la prend tout seul
// (« auto », que l'utilisateur a choisi), ou il n'y en a pas (« jamais »). Un compte qui ne sait pas faire le
// profil d'une tâche, lui, est écarté sans bruit (ce n'est pas un contournement de limite) : le rôle n'est jamais laissé sans IA tant
// qu'un compte connecté peut le faire, qualifié de préférence.
import fs from 'node:fs';
import path from 'node:path';
import { RACINE, REGLAGES, ecrireJson } from './config.js';
import { chargerComptes, compteConnecte } from './comptes.js';
import { adaptateurDe, fournisseurDe, FOURNISSEURS, chargerEquivalences, niveauDe, modeleParNiveau, convertirModele, convertirEffort } from './ia/fournisseurs.js';
import { t as tr } from './i18n.js';

// ---------------------------------------------------------------- priorités

const DEFAUTS = path.join(RACINE, 'config', 'defauts', 'priorites.json');
// QG_PRIORITES_FICHIER : pour les tests (un fichier de priorités à part).
const fichierPriorites = () => process.env.QG_PRIORITES_FICHIER || path.join(RACINE, 'config', 'priorites.json');
export const TYPES = ['code', 'recherche', 'redaction', 'image', 'defaut'];
export const NATURES = ['analyse', 'impl', 'bench', 'test', 'review', 'doc', 'asset', 'synthese', 'ops'];
const ROLES = ['verif', 'ambiance'];
const MOTEURS = ['abonnement', 'api'];
// Compte en pause, un autre est libre : demander (carte), auto (y passer tout seul), jamais (attendre).
export const BASCULES = ['demander', 'auto', 'jamais'];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const lireJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

let cache = null;

// Défauts + fichier personnel (le fichier n'est pas obligatoire : il n'existe qu'une fois les priorités réglées).
export function chargerPriorites() {
  if (cache) return cache;
  const base = lireJson(DEFAUTS) || {};
  cache = normaliser(migrer(lireJson(fichierPriorites()) || {}), normaliser(base, null));
  return cache;
}

export function rechargerPriorites() {
  cache = null;
  return chargerPriorites();
}

// texte : une ligne ; texteLong : plusieurs lignes (consignes), sans tabulation ni grands blancs
const texte = (v, max) => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '');
const texteLong = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '');
const idCompte = (v) => (typeof v === 'string' && /^[\w.-]{1,40}$/.test(v) ? v : null);

// Fichier d'avant la 1.0.7 (version 1) : dg.modele et dg.effort ne pouvaient que relever le modèle et l'effort
// du DG des réglages ; une valeur plus basse était sans effet. Ils sont maintenant le réglage lui-même : une
// valeur plus basse est retirée (le DG garde ce qu'il avait).
function migrer(brut) {
  if ((brut.version || 1) >= 2 || !brut.dg || typeof brut.dg !== 'object') return brut;
  const dg = { ...brut.dg };
  const ref = REGLAGES.dg || {};
  if (typeof dg.modele === 'string' && ref.modele && rangNiveau(niveauModele(dg.modele)) < rangNiveau(niveauModele(ref.modele))) dg.modele = null;
  if (typeof dg.effort === 'string' && EFFORTS.indexOf(dg.effort) <= EFFORTS.indexOf(ref.effort)) dg.effort = null;
  return { ...brut, dg };
}

function entree(e) {
  if (!e || typeof e !== 'object') return null;
  const r = {};
  if (typeof e.compte === 'string' && /^[\w.-]{1,40}$/.test(e.compte)) r.compte = e.compte;
  else if (typeof e.fournisseur === 'string' && FOURNISSEURS[e.fournisseur]) r.fournisseur = e.fournisseur;
  else return null;
  const m = texte(e.modele, 80);
  if (m) r.modele = m;
  if (chargerEquivalences().niveaux.includes(e.niveau)) r.niveau = e.niveau;
  if (MOTEURS.includes(e.moteur)) r.moteur = e.moteur;
  return r;
}
const ordre = (liste) => (Array.isArray(liste) ? liste.map(entree).filter(Boolean).slice(0, 20) : null);

// Ramène un brut (fichier ou modification du site) à la forme attendue ; base : valeurs à garder.
function normaliser(brut, base) {
  const b = base || { version: 2, types: {}, roles: {}, dg: { compte: null, modele: null, effort: null }, consigneDg: '', quota: { pause: 'compte', bascule: 'demander', ordre: [], seulementListe: false }, delegation: DELEGATION_DEFAUT };
  const r = {
    version: 2,
    types: {},
    roles: {},
    dg: { ...b.dg },
    consigneDg: b.consigneDg || '',
    quota: { pause: b.quota.pause || 'compte', bascule: b.quota.bascule || 'demander', ordre: [...(b.quota.ordre || [])], seulementListe: b.quota.seulementListe === true },
    delegation: structuredClone(b.delegation || DELEGATION_DEFAUT),
  };
  for (const ty of TYPES) {
    const src = brut.types?.[ty] || {};
    const avant = b.types[ty] || { natures: [], ordre: [], consigne: '' };
    r.types[ty] = {
      ...(ty === 'defaut' ? {} : { natures: Array.isArray(src.natures) ? [...new Set(src.natures.filter((n) => NATURES.includes(n)))] : [...(avant.natures || [])] }),
      ordre: ordre(src.ordre) ?? [...avant.ordre],
      // consigne de l'utilisateur pour ce type de tâche (recopiée dans la mission de chaque tâche du type)
      consigne: typeof src.consigne === 'string' ? texteLong(src.consigne, 1000) : avant.consigne || '',
    };
  }
  // une nature n'appartient qu'à un type : le dernier qui la réclame dans cette modification la garde
  const modifies = TYPES.filter((ty) => Array.isArray(brut.types?.[ty]?.natures));
  for (const ty of modifies) {
    for (const n of r.types[ty].natures) for (const autre of TYPES) if (autre !== ty && r.types[autre].natures) r.types[autre].natures = r.types[autre].natures.filter((x) => x !== n);
  }
  for (const ro of ROLES) r.roles[ro] = { ordre: ordre(brut.roles?.[ro]?.ordre) ?? [...(b.roles[ro]?.ordre || [])] };
  // DG des nouvelles demandes : compte (null = celui de la demande), modèle et effort (null = ceux des réglages)
  if (brut.dg && typeof brut.dg === 'object') {
    if ('compte' in brut.dg) r.dg.compte = idCompte(brut.dg.compte);
    if ('modele' in brut.dg) r.dg.modele = texte(brut.dg.modele, 80) || null;
    if ('effort' in brut.dg) r.dg.effort = EFFORTS.includes(brut.dg.effort) ? brut.dg.effort : null;
  }
  if (typeof brut.consigneDg === 'string') r.consigneDg = texteLong(brut.consigneDg, 2000);
  if (brut.quota && typeof brut.quota === 'object') {
    if (['compte', 'globale'].includes(brut.quota.pause)) r.quota.pause = brut.quota.pause;
    if (BASCULES.includes(brut.quota.bascule)) r.quota.bascule = brut.quota.bascule;
    // avant la 1.0.7 : proposerBascule oui / non
    else if (typeof brut.quota.proposerBascule === 'boolean') r.quota.bascule = brut.quota.proposerBascule ? 'demander' : 'jamais';
    // comptes vers lesquels basculer, dans l'ordre ; seulementListe : jamais un autre compte que ceux-là
    if (Array.isArray(brut.quota.ordre)) r.quota.ordre = [...new Set(brut.quota.ordre.map(idCompte).filter(Boolean))].slice(0, 20);
    if (typeof brut.quota.seulementListe === 'boolean') r.quota.seulementListe = brut.quota.seulementListe;
    // liste vidée : la case « seulement ces comptes » n'est plus montrée, elle ne filtre plus rien
    if (!r.quota.ordre.length) r.quota.seulementListe = false;
  }
  if (brut.delegation?.images && typeof brut.delegation.images === 'object') normaliserImages(brut.delegation.images, r.delegation.images);
  return r;
}

// Délégation d'images (D2, D3) : tout coupé par défaut ; limite par demande et par étage, de 1 à illimitée (null).
const DELEGATION_DEFAUT = { images: { actif: false, accord: true, limites: { defaut: 3, etages: {} }, api: { actif: false, compte: null, plafondMensuelUsd: null } } };
const limiteImages = (v) => (v === null ? null : Number.isInteger(v) && v >= 1 ? Math.min(v, 1000) : undefined);
function normaliserImages(s, im) {
  if (typeof s.actif === 'boolean') im.actif = s.actif;
  if (typeof s.accord === 'boolean') im.accord = s.accord;
  if (s.limites && typeof s.limites === 'object') {
    const d = limiteImages(s.limites.defaut);
    if (d !== undefined) im.limites.defaut = d;
    if (s.limites.etages && typeof s.limites.etages === 'object') {
      im.limites.etages = Object.fromEntries(
        Object.entries(s.limites.etages).map(([k, v]) => [texte(k, 80), limiteImages(v)]).filter(([k, v]) => k && v !== undefined).slice(0, 100),
      );
    }
  }
  if (s.api && typeof s.api === 'object') {
    if (typeof s.api.actif === 'boolean') im.api.actif = s.api.actif;
    if ('compte' in s.api) im.api.compte = texte(s.api.compte, 80) || null;
    if ('plafondMensuelUsd' in s.api) {
      const p = s.api.plafondMensuelUsd;
      im.api.plafondMensuelUsd = typeof p === 'number' && Number.isFinite(p) && p >= 0 ? Math.min(p, 100000) : null;
    }
  }
}

// Modification depuis le site (champ par champ) : écrite dans config/priorites.json.
export function modifierPriorites(patch = {}) {
  const r = normaliser(patch, chargerPriorites());
  ecrireJson(fichierPriorites(), r);
  cache = r;
  return r;
}

export function typeDe(nature, prio = chargerPriorites()) {
  return TYPES.find((ty) => ty !== 'defaut' && prio.types[ty]?.natures?.includes(nature)) || 'defaut';
}

// ---------------------------------------------------------------- DG et consignes (Réglages › Priorités)

/** Modèle et effort conseillés pour le DG (config/defauts/reglages.json), pour le bouton « Remettre le conseillé ». */
export function dgConseille() {
  const d = lireJson(path.join(RACINE, 'config', 'defauts', 'reglages.json'))?.dg || {};
  return { modele: d.modele || 'opus', effort: d.effort || 'xhigh' };
}

/** Vrai si le modèle ou l'effort du DG est plus bas que le conseillé : le site le signale, sans rien changer. */
export function dgSousConseille(dg = reglageDg()) {
  const c = dgConseille();
  const r = rangNiveau(niveauModele(dg.modele));
  const rc = rangNiveau(niveauModele(c.modele));
  return (r >= 0 && rc >= 0 && r < rc) || EFFORTS.indexOf(dg.effort) < EFFORTS.indexOf(c.effort);
}

/** DG des nouvelles demandes : compte (null = celui de la demande), modèle, effort. Le coût ne le change jamais. */
export function reglageDg(prio = chargerPriorites()) {
  return { compte: prio.dg.compte || null, modele: prio.dg.modele || REGLAGES.dg.modele, effort: prio.dg.effort || REGLAGES.dg.effort };
}

// Consignes de l'utilisateur au DG : une générale (méthode, style, choix des IA) et une par type de tâche. Figées
// dans le dossier à l'envoi (d.consignes) : changer les réglages ne touche pas une demande déjà partie.
export function consignesActuelles(prio = chargerPriorites()) {
  return { generale: prio.consigneDg || '', types: Object.fromEntries(TYPES.filter((ty) => prio.types[ty]?.consigne).map((ty) => [ty, prio.types[ty].consigne])) };
}
export const consignesDossier = (d) => d?.consignes || consignesActuelles();

/** Consigne d'une tâche : celle de son type, sinon celle « par défaut » ; '' s'il n'y en a pas. */
export function consigneTache(t, d) {
  const c = consignesDossier(d).types || {};
  return c[typeDe(t.nature)] || c.defaut || '';
}

// ---------------------------------------------------------------- comptes

const comptesActifs = () => chargerComptes().comptes.filter((c) => c.actif !== false);
function capacitesDe(c) {
  try {
    return adaptateurDe(c).capacites(c) || {};
  } catch {
    return {};
  }
}
// Qualifié = déjà essayé avec un vrai agent (Claude, Codex). Un agent ACP ne l'est pas encore : il reste
// utilisable, avec un badge « pas encore qualifié » dans le site.
export const qualifie = (c) => capacitesDe(c).qualification !== 'non-faite';
const nomDe = (c, id = null) => c?.nom || id || '?';
const connecte = (c) => {
  try {
    return !!compteConnecte(c);
  } catch {
    return false;
  }
};

// Statut du profil pour ce compte ('garanti', 'restreint', 'refuse') et le motif d'un refus.
function profilPour(c, profil) {
  if (!profil) return { ok: true };
  const statut = capacitesDe(c).profils?.[profil];
  if (statut === 'refuse') return { ok: false, motif: tr('{nom} ne garantit pas le profil {profil}', { nom: nomDe(c), profil }) };
  return { ok: true, statut: statut || 'garanti' };
}

/** Le compte sait-il faire ce profil (non « refuse ») ? */
export const profilOk = (c, profil) => profilPour(c, profil).ok;

// ---------------------------------------------------------------- pauses par compte (décision D4)

const pauses = new Map();
const ecouteurs = new Set();
const MARGE_REPRISE_MS = 30000;
const prevenir = () => {
  for (const fn of ecouteurs) {
    try {
      fn(pausesComptes());
    } catch (e) {
      console.error('pauses', e?.message || e);
    }
  }
};

/** type : 'quota' (limite d'usage) ou 'connexion' (compte à reconnecter). jusqua : ms ou null. */
export function pauseCompte(id, { raison = '', jusqua = null, type = 'quota' } = {}) {
  if (!id) return;
  pauses.set(id, { raison, jusqua: jusqua || null, type, depuis: pauses.get(id)?.depuis || Date.now() });
  prevenir();
}
export function leverPauseCompte(id) {
  if (!pauses.delete(id)) return false;
  prevenir();
  return true;
}
export function pauseDe(id) {
  const p = pauses.get(id);
  if (!p) return null;
  // filet : l'heure de remise à zéro est passée (la minuterie de l'ordonnanceur lève aussi la pause)
  if (p.jusqua && p.jusqua + MARGE_REPRISE_MS < Date.now()) {
    leverPauseCompte(id);
    return null;
  }
  return p;
}
export const pausesComptes = () => Object.fromEntries([...pauses].map(([id, p]) => [id, { ...p }]));
export const surPauses = (fn) => ecouteurs.add(fn);
export function viderPauses() {
  if (!pauses.size) return;
  pauses.clear();
  prevenir();
}

// Démo : la simulation n'a pas de comptes, tout reste sur le compte de la demande.
let demo = false;
export const modeDemo = (v) => (demo = !!v);
export const enDemo = () => demo;

export function heureReprise(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const loc = REGLAGES.langueInterface === 'en' ? 'en-GB' : 'fr-FR';
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString(loc, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function motifPause(c, p, id = null) {
  if (p.type === 'connexion') return tr('{nom} à reconnecter (Réglages › Comptes IA)', { nom: nomDe(c, id) });
  if (p.type === 'reserve') return tr('réserve de ta fenêtre sur {nom} jusqu’à {heure}', { nom: nomDe(c, id), heure: heureReprise(p.jusqua) });
  return p.jusqua ? tr("limite d'usage de {nom} jusqu'à {heure}", { nom: nomDe(c, id), heure: heureReprise(p.jusqua) }) : tr("limite d'usage de {nom}", { nom: nomDe(c, id) });
}

// ---------------------------------------------------------------- modèles

const ORDRE_NIVEAUX = () => chargerEquivalences().niveaux || ['eco', 'standard', 'fort', 'max'];
const rangNiveau = (n) => ORDRE_NIVEAUX().indexOf(n);
// « codex:gpt-6.1-sol » (doublon d'identifiant entre fournisseurs dans le schéma du DG) → « gpt-6.1-sol »
export function sansPrefixe(modele) {
  const m = String(modele || '');
  const i = m.indexOf(':');
  return i > 0 && FOURNISSEURS[m.slice(0, i)] ? m.slice(i + 1) : m;
}
const prefixe = (modele) => {
  const m = String(modele || '');
  const i = m.indexOf(':');
  return i > 0 && FOURNISSEURS[m.slice(0, i)] ? m.slice(0, i) : null;
};

export const prefixeModele = (modele) => prefixe(modele);

const modelesDe = (c) => {
  try {
    return adaptateurDe(c).modeles?.(c) || [];
  } catch {
    return [];
  }
};

// Le modèle appartient-il au fournisseur de ce compte ?
export function appartient(c, modele) {
  const m = sansPrefixe(modele).toLowerCase();
  if (!m) return false;
  const p = prefixe(modele);
  const f = fournisseurDe(c);
  if (p && p !== f) return false;
  const eq = chargerEquivalences();
  if (f === 'claude') {
    if (/^claude/.test(m)) return true;
    if (Object.keys(eq.codex || {}).includes(m)) return false;
    return Object.keys(eq.claude || {}).some((id) => m.includes(id));
  }
  if (f === 'codex' && eq.codex?.[m]) return true;
  return modelesDe(c).some((x) => String(x.id).toLowerCase() === m);
}

// Fournisseur d'un modèle (alias Claude, modèle Codex, modèle d'un agent ACP actif) ; null si inconnu.
export function fournisseurDuModele(modele, comptes = comptesActifs()) {
  const p = prefixe(modele);
  if (p) return p;
  const m = sansPrefixe(modele).toLowerCase();
  const eq = chargerEquivalences();
  if (eq.codex?.[m]) return 'codex';
  if (/^claude/.test(m) || Object.keys(eq.claude || {}).some((id) => m.includes(id))) return 'claude';
  for (const c of comptes) if (fournisseurDe(c) === 'acp' && modelesDe(c).some((x) => String(x.id).toLowerCase() === m)) return 'acp';
  return null;
}

// Niveau d'un modèle, y compris ceux des agents ACP (niveau appris de l'agent ou de son catalogue).
export function niveauModele(modele, comptes = comptesActifs()) {
  const m = sansPrefixe(modele);
  for (const c of comptes) {
    if (fournisseurDe(c) !== 'acp') continue;
    const x = modelesDe(c).find((y) => y.id === m);
    if (x?.niveau) return x.niveau;
  }
  return niveauDe(m);
}

function modeleDuNiveau(c, niveau) {
  const f = fournisseurDe(c);
  if (f !== 'acp') return modeleParNiveau(f, niveau);
  // agent ACP : le moins cher de ses modèles de niveau égal ou supérieur
  const r = rangNiveau(niveau);
  const liste = modelesDe(c).filter((m) => m.niveau && rangNiveau(m.niveau) >= r).sort((a, b) => rangNiveau(a.niveau) - rangNiveau(b.niveau));
  return liste[0]?.id || null;
}

/**
 * Modèle et effort pour ce compte : le modèle demandé s'il lui appartient, sinon celui du même niveau chez son
 * fournisseur. Une entrée des priorités (modele ou niveau) ne s'applique que si elle n'est pas plus basse que
 * la demande. Rend { modele, effort, justification } (justification null si rien n'a changé).
 */
export function modelePour(c, modele, effort, e = null) {
  const f = fournisseurDe(c);
  const demande = sansPrefixe(modele);
  const niveauVoulu = demande ? niveauModele(demande) : null;
  let choisi;
  let pourquoi = null;
  if (!demande) choisi = null;
  else if (appartient(c, demande)) choisi = demande;
  else {
    choisi = f === 'acp' ? convertirModele(c, demande) : modeleDuNiveau(c, niveauVoulu);
    pourquoi = choisi ? tr('même niveau') : tr("modèle par défaut de l'agent");
  }
  const rangVoulu = niveauVoulu ? rangNiveau(niveauVoulu) : -1;
  if (e?.modele && appartient(c, e.modele) && rangNiveau(niveauModele(e.modele)) >= rangVoulu && sansPrefixe(e.modele) !== choisi) {
    choisi = sansPrefixe(e.modele);
    pourquoi = tr('priorités');
  } else if (e?.niveau && rangNiveau(e.niveau) >= rangVoulu) {
    const m = modeleDuNiveau(c, e.niveau);
    if (m && m !== choisi) {
      choisi = m;
      pourquoi = tr('priorités, niveau {niveau}', { niveau: e.niveau });
    }
  }
  // Claude : effort transmis tel quel ; autres : le plus proche disponible pour ce modèle
  const eff = f === 'claude' || !effort ? effort : convertirEffort(c, choisi, effort);
  const justification = choisi !== demande || eff !== effort
    ? `${demande || '?'}${effort ? `/${effort}` : ''} → ${choisi || tr('défaut')}${eff ? `/${eff}` : ''}${pourquoi ? ` (${pourquoi})` : ''}`
    : null;
  return { modele: choisi, effort: eff, justification };
}

// ---------------------------------------------------------------- choix du compte

const compteTache = (d) => d?.compteAgents || d?.compte || null;

// Entrées → comptes (une entrée « fournisseur » vaut ses comptes, dans l'ordre de la liste des comptes).
function deplier(entrees, comptes, filtreFournisseur = null) {
  const r = [];
  for (const e of entrees || []) {
    const vises = e.compte ? comptes.filter((c) => c.id === e.compte) : comptes.filter((c) => fournisseurDe(c) === e.fournisseur);
    for (const c of vises) if (!filtreFournisseur || fournisseurDe(c) === filtreFournisseur) r.push({ id: c.id, e });
  }
  return r;
}

// Comptes connectés capables du profil (repli : jamais un rôle sans IA tant qu'un compte peut le faire),
// les comptes qualifiés d'abord, puis l'ordre de la liste des comptes.
function replis(comptes, profil, exclure = new Set()) {
  return comptes
    .filter((c) => !exclure.has(c.id) && profilPour(c, profil).ok && connecte(c))
    .sort((a, b) => Number(qualifie(b)) - Number(qualifie(a)));
}

/**
 * Compte pour un travail : liste ordonnée de candidats [{ id, e, base }] → premier compte apte.
 * - inconnu, profil refusé, non connecté : écarté sans bruit (sauf le compte de la demande, `base`, dernier
 *   recours gardé tel quel, même absent de la liste des comptes) ;
 * - en pause : jamais sauté ; attente + proposition (bascule acceptée pour ce dossier : prise directement).
 * quota : priorités.quota (ordre des comptes proposés à la place d'un compte bloqué).
 */
function premierApte(candidats, { profil, comptes, bascules = {}, impose = false, quota = {} }) {
  const parId = new Map(comptes.map((c) => [c.id, c]));
  const raisons = [];
  const vus = new Set();
  for (const cand of candidats) {
    if (!cand.id || vus.has(cand.id)) continue;
    vus.add(cand.id);
    const c = parId.get(cand.id);
    if (!c) {
      if (cand.base) return { compte: cand.id, c: null, e: cand.e };
      raisons.push(tr('compte {id} inconnu', { id: cand.id }));
      if (impose) return { attente: { motif: raisons[0], compteBloque: cand.id, raison: raisons[0], proposition: null } };
      continue;
    }
    const p = profilPour(c, profil);
    if (!p.ok) {
      raisons.push(p.motif);
      if (impose) return { attente: { motif: p.motif, compteBloque: c.id, raison: p.motif, proposition: null } };
      continue;
    }
    const pause = pauseDe(c.id);
    if (!pause && !cand.base && !connecte(c)) {
      const m = tr('{nom} non connecté', { nom: nomDe(c) });
      raisons.push(m);
      if (impose) return { attente: { motif: m, compteBloque: c.id, raison: m, proposition: propositionPour(c.id, profil, comptes, quota) } };
      continue;
    }
    if (pause) {
      // bascule acceptée par l'utilisateur pour ce dossier : le compte de remplacement, s'il peut travailler
      const vers = bascules[c.id] && parId.get(bascules[c.id]);
      if (vers && profilPour(vers, profil).ok && !pauseDe(vers.id) && connecte(vers)) return { compte: vers.id, c: vers, e: null, bascule: c.id };
      return { attente: { motif: motifPause(c, pause), compteBloque: c.id, raison: pause.raison, pause, proposition: propositionPour(c.id, profil, comptes, quota) } };
    }
    return { compte: c.id, c, e: cand.e };
  }
  return { raisons };
}

// Compte que l'on peut proposer à l'utilisateur à la place d'un compte bloqué (pris sans lui demander
// seulement s'il l'a permis : quota.bascule « auto »). Parmi les comptes libres : ceux de quota.ordre d'abord,
// dans cet ordre, puis les autres (qualifiés d'abord) ; avec quota.seulementListe, ceux de la liste seulement.
function propositionPour(bloque, profil, comptes, quota = {}) {
  const liste = quota.ordre || [];
  const rang = (c) => (liste.includes(c.id) ? liste.indexOf(c.id) : liste.length);
  const libres = replis(comptes, profil, new Set([bloque])).filter((x) => !pauseDe(x.id) && (!quota.seulementListe || !liste.length || liste.includes(x.id)));
  const c = libres.sort((a, b) => rang(a) - rang(b))[0] || null;
  return c ? { compte: c.id, nom: c.nom } : null;
}

function attenteAucun(profil, raisons) {
  const r = [...new Set(raisons)].join(' ; ') || tr('aucun compte connecté');
  const motif = tr('aucun compte IA ne peut faire {profil} ({raisons})', { profil: profil || '?', raisons: r });
  return { compte: null, modele: null, effort: null, justification: null, attente: { motif, compteBloque: null, raison: r, proposition: null, aucun: true } };
}

function resultat(choix, modele, effort, extra = {}) {
  const c = choix.c;
  const m = c ? modelePour(c, modele, effort, choix.e) : { modele, effort, justification: null };
  return { compte: choix.compte, fournisseur: c ? fournisseurDe(c) : null, ...m, attente: null, bascule: choix.bascule || null, ...extra };
}

/**
 * Production d'une tâche. ctx : { comptes } (tests). Ordre (§5.2) :
 * 1. compte imposé (conversation déjà commencée sur ce compte, compte du plan, ou compte choisi sur la demande) ;
 * 2. IA imposée par le plan (`ia`) : ses comptes, ceux de la liste du type d'abord ;
 * 3. liste du type de la tâche, puis « défaut », puis le compte de la demande ;
 * 4. repli : tout compte connecté capable du profil (qualifié d'abord) ;
 * 5. rien : attente avec motif.
 */
export function choisirProduction(t, d, ctx = {}) {
  const base = compteTache(d);
  if (demo) return { compte: base, fournisseur: null, modele: t.modele, effort: t.effort, justification: null, attente: null, bascule: null };
  const prio = ctx.priorites || chargerPriorites();
  const comptes = ctx.comptes || comptesActifs();
  const profil = t.x?.profil || null;
  const bascules = d?.x?.bascules || {};
  // conversation déjà commencée : elle reste sur son compte (sauf bascule acceptée pour ce dossier, qui repart
  // d'une conversation neuve) ; puis compte imposé sur la demande, puis compte demandé par le plan
  const collant = t.x?.session && t.x?.compteSession && (t.x.compteSession === base || comptes.some((c) => c.id === t.x.compteSession)) ? t.x.compteSession : null;
  const impose = collant || d?.compteImpose || t.x?.compteDemande || null;
  if (impose) {
    const choix = premierApte([{ id: impose, base: impose === base }], { profil, comptes, bascules, impose: true, quota: prio.quota });
    if (choix.attente) return { compte: impose, fournisseur: null, modele: t.modele, effort: t.effort, justification: null, attente: choix.attente, bascule: null };
    return resultat(choix, t.modele, t.effort, { impose: true });
  }
  const type = typeDe(t.nature, prio);
  const ia = t.x?.iaDemandee && t.x.iaDemandee !== 'auto' && FOURNISSEURS[t.x.iaDemandee] ? t.x.iaDemandee : null;
  const entrees = [...(prio.types[type]?.ordre || []), ...(type !== 'defaut' ? prio.types.defaut?.ordre || [] : [])];
  let candidats;
  if (ia) {
    candidats = [...deplier(entrees, comptes, ia), ...comptes.filter((c) => fournisseurDe(c) === ia).map((c) => ({ id: c.id, e: null }))];
  } else {
    candidats = [...deplier(entrees, comptes), { id: base, e: null, base: true }];
  }
  const choix = premierApte(candidats, { profil, comptes, bascules, quota: prio.quota });
  if (choix.attente) return { compte: choix.attente.compteBloque, fournisseur: null, modele: t.modele, effort: t.effort, justification: null, attente: choix.attente, bascule: null };
  if (choix.compte) return resultat(choix, t.modele, t.effort);
  // IA imposée sans compte apte : on ne la remplace pas par une autre IA (le DG l'a demandée explicitement)
  if (ia) return attenteAucun(profil, choix.raisons.length ? choix.raisons : [tr('aucun compte {ia} connecté', { ia })]);
  const repli = replis(comptes, profil).map((c) => ({ id: c.id, e: null }));
  const r2 = premierApte(repli, { profil, comptes, bascules, quota: prio.quota });
  if (r2.attente) return { compte: r2.attente.compteBloque, fournisseur: null, modele: t.modele, effort: t.effort, justification: null, attente: r2.attente, bascule: null };
  if (r2.compte) return resultat(r2, t.modele, t.effort, { repli: true });
  return attenteAucun(profil, [...choix.raisons, ...r2.raisons]);
}

/**
 * Vérificateur : un compte d'un autre fournisseur si le DG a choisi un modèle de cet autre fournisseur (relecture
 * croisée) et qu'un compte connecté et libre l'a ; sinon la liste « verif » des priorités ; sinon le compte qui a
 * produit la tâche.
 */
export function choisirVerif(t, d, ctx = {}) {
  const v = t.x?.verification || {};
  const prod = t.compte || compteTache(d);
  if (demo) return { compte: compteTache(d), fournisseur: null, modele: v.modele, effort: v.effort, justification: null, attente: null };
  const prio = ctx.priorites || chargerPriorites();
  const comptes = ctx.comptes || comptesActifs();
  const cProd = comptes.find((c) => c.id === prod);
  const fVoulu = v.modele ? fournisseurDuModele(v.modele, comptes) : null;
  const candidats = [];
  if (fVoulu && cProd && fVoulu !== fournisseurDe(cProd)) {
    candidats.push(...deplier(prio.roles.verif?.ordre, comptes, fVoulu), ...comptes.filter((c) => fournisseurDe(c) === fVoulu).map((c) => ({ id: c.id, e: null, croise: true })));
  }
  candidats.push(...deplier(prio.roles.verif?.ordre, comptes), { id: prod, e: null, base: true });
  const bascules = d?.x?.bascules || {};
  const choix = premierApte(candidats, { profil: 'verif', comptes, bascules, quota: prio.quota });
  if (choix.attente) return { compte: choix.attente.compteBloque, fournisseur: null, modele: v.modele, effort: v.effort, justification: null, attente: choix.attente };
  if (choix.compte) return resultat(choix, v.modele, v.effort, { croise: !!(choix.c && cProd && fournisseurDe(choix.c) !== fournisseurDe(cProd)) });
  // le compte de production ne sait pas vérifier : un autre compte qui le sait (qualifié d'abord)
  const r2 = premierApte(replis(comptes, 'verif').map((c) => ({ id: c.id, e: null })), { profil: 'verif', comptes, bascules, quota: prio.quota });
  if (r2.attente) return { compte: r2.attente.compteBloque, fournisseur: null, modele: v.modele, effort: v.effort, justification: null, attente: r2.attente };
  if (r2.compte) return resultat(r2, v.modele, v.effort, { repli: true });
  return { ...attenteAucun('verif', [...choix.raisons, ...r2.raisons]), modele: v.modele, effort: v.effort };
}

/**
 * Compte du DG d'une nouvelle demande. demandeCompte : compte de la demande (barre du bas ; 'auto' ou absent :
 * aucun). Ordre : le compte de Réglages › Priorités › DG (dg.compte) s'il est connecté, sinon le compte de la
 * demande, sinon le compte par défaut, sinon le premier compte connecté (qualifié d'abord). Un compte en pause
 * reste choisi (D4) : le DG attendra la remise à zéro, il ne bascule jamais.
 */
export function choisirDg(demandeCompte = null, ctx = {}) {
  const { defaut } = chargerComptes();
  const comptes = ctx.comptes || comptesActifs();
  const prio = ctx.priorites || chargerPriorites();
  const apte = (c) => c && profilPour(c, 'lecture').ok && connecte(c);
  const parId = new Map(comptes.map((c) => [c.id, c]));
  const regle = parId.get(prio.dg.compte);
  if (apte(regle)) return regle;
  if (demandeCompte && demandeCompte !== 'auto') return parId.get(demandeCompte) || null;
  if (apte(parId.get(defaut))) return parId.get(defaut);
  return replis(comptes, 'lecture')[0] || parId.get(defaut) || comptes[0] || null;
}

/**
 * Ambiance (Joy, mini-jeu) : liste « ambiance » des priorités, puis le compte par défaut (defautDabord), puis le
 * premier connecté (qualifié d'abord). Modèle : pour Claude, celui des réglages (modeleClaude) ; pour une autre IA, le
 * modèle du même niveau (haiku : eco).
 * Un compte en pause n'est pas remplacé : null (l'ambiance attend).
 */
export function choisirAmbiance({ modeleClaude = 'haiku', defautDabord = true, comptes = comptesActifs(), priorites = chargerPriorites() } = {}) {
  const { defaut } = chargerComptes();
  const parId = new Map(comptes.map((c) => [c.id, c]));
  const ok = (c) => c && profilPour(c, 'lecture').ok && connecte(c);
  const listes = [
    ...deplier(priorites.roles.ambiance?.ordre, comptes).map((x) => ({ c: parId.get(x.id), e: x.e })),
    ...(defautDabord ? [{ c: parId.get(defaut) }] : []),
    ...replis(comptes, 'lecture').map((c) => ({ c })),
  ];
  const x = listes.find((y) => ok(y.c));
  if (!x || pauseDe(x.c.id)) return null;
  const c = x.c;
  const f = fournisseurDe(c);
  // autre IA : le niveau de l'entrée des priorités, sinon celui du modèle Claude des réglages (haiku : eco)
  const modele = x.e?.modele && appartient(c, x.e.modele) ? sansPrefixe(x.e.modele) : f === 'claude' ? modeleClaude : x.e?.niveau ? modeleDuNiveau(c, x.e.niveau) : modelePour(c, modeleClaude, null).modele;
  return { compte: c.id, c, fournisseur: f, modele, effort: null };
}

// ---------------------------------------------------------------- pour le DG et le site

/** Comptes actifs et connectés (le DG ne choisit que parmi eux). */
export const comptesDisponibles = (comptes = comptesActifs()) => comptes.filter((c) => connecte(c));

/** Un compte connecté autre que Claude ? (sinon le schéma et la directive du DG ne parlent que de Claude) */
// sans liste : seuls les comptes autres que Claude sont sondés (le chemin tout Claude ne teste aucune connexion)
export const multiIa = (comptes = null) =>
  comptes ? comptes.some((c) => fournisseurDe(c) !== 'claude') : comptesActifs().some((c) => fournisseurDe(c) !== 'claude' && connecte(c));

/**
 * Moteur et compte d'une image déléguée (conception §7.2). Candidats : priorités « image » (comptes Codex),
 * puis les autres comptes Codex dans l'ordre de la liste.
 * - Moteur B, abonnement : le premier compte Codex abonnement ; sauté si l'agent impose taille, qualité,
 *   transparence ou références (ce moteur ne sait pas). En pause ou à reconnecter : aucun autre abonnement à
 *   sa place (jamais de bascule automatique, D4).
 * - Moteur A, API (clé facturée) : seulement si `delegation.images.api.actif` ; compte `api.compte`, sinon
 *   le premier compte Codex à clé.
 * → { moteur: 'abonnement' | 'api', compte } ou { indisponible: motif }.
 */
export function choisirImage({ precise = false } = {}, prio = chargerPriorites(), comptes = comptesActifs()) {
  const api = prio.delegation.images.api;
  const parId = new Map(comptes.map((c) => [c.id, c]));
  const cands = [...new Set([...deplier(prio.types.image?.ordre, comptes, 'codex').map((x) => parId.get(x.id)), ...comptes.filter((c) => fournisseurDe(c) === 'codex')])];
  const raisons = [];
  const abo = cands.find((c) => !c.cleApi);
  if (precise) raisons.push(tr("l'abonnement ChatGPT ne sait pas imposer la taille, la qualité, la transparence ni des références"));
  else if (abo) {
    const p = pauseDe(abo.id);
    if (!p && connecte(abo)) return { moteur: 'abonnement', compte: abo.id };
    raisons.push(p ? motifPause(abo, p, abo.id) : tr('{nom} à reconnecter (Réglages › Comptes IA)', { nom: nomDe(abo) }));
  }
  if (api.actif) {
    const a = api.compte ? cands.find((c) => c.id === api.compte && c.cleApi) : cands.find((c) => c.cleApi);
    const p = a ? pauseDe(a.id) : null;
    if (a && !p) return { moteur: 'api', compte: a.id };
    raisons.push(a ? motifPause(a, p, a.id) : tr("aucun compte ChatGPT · Codex avec clé API pour l'API Images"));
  } else if (precise || !abo) raisons.push(tr('API Images désactivée (Réglages › Priorités › Images)'));
  if (!cands.length) raisons.unshift(tr('aucun compte ChatGPT · Codex'));
  return { indisponible: raisons.join(' ; ') };
}

/** Profils qu'au moins un compte connecté garantit (pour validerTaches). */
export function profilsPossibles(comptes = comptesDisponibles()) {
  const r = new Set();
  for (const c of comptes) for (const [p, s] of Object.entries(capacitesDe(c).profils || {})) if (s !== 'refuse') r.add(p);
  return r;
}

/** Résumé des priorités pour la directive du DG ({PRIORITES}) ; '' si rien n'est réglé. */
export function resumePriorites(prio = chargerPriorites()) {
  const lignes = [];
  const libelle = (e) => `${e.compte || e.fournisseur}${e.modele ? ` · ${e.modele}` : e.niveau ? ` · ${e.niveau}` : ''}`;
  for (const ty of TYPES) {
    const o = prio.types[ty]?.ordre || [];
    if (!o.length) continue;
    const natures = prio.types[ty].natures?.length ? ` (${prio.types[ty].natures.join(', ')})` : '';
    lignes.push(`- ${ty}${natures} : ${o.map(libelle).join(' > ')}`);
  }
  for (const ro of ROLES) if (prio.roles[ro]?.ordre?.length) lignes.push(`- ${ro} : ${prio.roles[ro].ordre.map(libelle).join(' > ')}`);
  return lignes.join('\n');
}

/**
 * Préréglages proposés selon les comptes présents (site, configuration guidée). Chaque préréglage est un patch
 * pour modifierPriorites. Un bouton par compte, au nom que l'utilisateur lui a donné (« Tout sur Perso Claude »).
 */
export function prereglages(comptes = comptesActifs()) {
  const parF = (f) => comptes.filter((c) => fournisseurDe(c) === f);
  const vide = Object.fromEntries(TYPES.map((ty) => [ty, { ordre: [] }]));
  const r = [{ id: 'demande', libelle: tr('Tout sur le compte de la demande'), patch: { types: vide, roles: { verif: { ordre: [] }, ambiance: { ordre: [] } }, dg: { compte: null } } }];
  for (const c of comptes) {
    const sur = [{ compte: c.id }];
    const tout = Object.fromEntries(TYPES.map((ty) => [ty, { ordre: sur }]));
    r.push({ id: `tout-${c.id}`, libelle: tr('Tout sur {compte}', { compte: nomDe(c, c.id) }), patch: { types: tout, roles: { verif: { ordre: [] }, ambiance: { ordre: sur } }, dg: { compte: c.id } } });
  }
  const [claude, codex] = [parF('claude')[0], parF('codex')[0]];
  if (claude && codex) {
    const [a, b] = [[{ compte: claude.id }], [{ compte: codex.id }]];
    r.push({
      id: 'claude-code-codex-redaction',
      libelle: tr('{code} pour le code, {redaction} pour la rédaction et les images', { code: nomDe(claude, claude.id), redaction: nomDe(codex, codex.id) }),
      patch: {
        types: { code: { ordre: a }, recherche: { ordre: a }, redaction: { ordre: b }, image: { ordre: b }, defaut: { ordre: a } },
        roles: { verif: { ordre: [] }, ambiance: { ordre: [] } },
      },
    });
  }
  return r;
}

/**
 * Aperçu pour le site (Réglages › Priorités) : quel compte ferait quoi maintenant, avec les comptes présents,
 * leurs connexions et leurs pauses. Simulation seule : rien n'est lancé. Les questions suivent le compte de la
 * tâche qui les pose.
 * → { dg, types: { code: ligne… }, verif, ambiance, images } ; ligne = { compte, attente, repli }.
 * dg : en plus, demande (sans compte réglé, le DG prend celui de la demande ; l'aperçu montre le compte par
 * défaut) et repli avec son motif (compte réglé non connecté).
 */
export function apercu(prio = chargerPriorites(), comptes = comptesActifs()) {
  const ctx = { priorites: prio, comptes };
  const ligne = (r) => ({ compte: r?.compte || null, attente: r?.attente?.motif || (r?.compte ? null : tr('aucun compte connecté')), repli: !!r?.repli });
  const dg = choisirDg(null, ctx);
  const pDg = dg ? pauseDe(dg.id) : null;
  // les tâches tournent sur le compte de la demande (ici : le compte par défaut) ou sur « Agents de la demande »,
  // jamais sur celui du DG
  const demande = choisirDg(null, { comptes, priorites: { ...prio, dg: { ...prio.dg, compte: null } } });
  const agents = REGLAGES.compteAgents && comptes.some((c) => c.id === REGLAGES.compteAgents) ? REGLAGES.compteAgents : null;
  const d = demande ? { compte: demande.id, compteAgents: agents } : null;
  // Seulement des comptes Claude connectés : quand une liste ne donne rien, l'ordonnanceur garde les tâches sur le
  // compte de la demande et le vérificateur sur le compte de la tâche (pas de repli ; calculerRoute, routerVerif).
  const multi = comptes.some((c) => fournisseurDe(c) !== 'claude' && connecte(c));
  const base = compteTache(d);
  const production = (a) => {
    if (multi || !base) return ligne(a);
    if (a.attente && (a.attente.pause || (a.attente.compteBloque && a.attente.compteBloque !== base))) return ligne(a);
    return a.attente || a.repli ? ligne({ compte: base }) : ligne(a);
  };
  const types = {};
  for (const ty of TYPES) {
    const nature = ty === 'defaut' ? '-' : prio.types[ty]?.natures?.[0];
    types[ty] = nature ? production(choisirProduction({ nature, x: { profil: 'edition' } }, d, ctx)) : null;
  }
  const prodCode = types.code?.compte || base;
  const v = choisirVerif({ compte: prodCode, x: { verification: {} } }, d, ctx);
  const verif = !multi && prodCode && (v.repli || v.attente || !v.compte) ? ligne({ compte: prodCode }) : ligne(v);
  // comme bonheur.js : la liste de l'ambiance, puis les comptes connectés (qualifiés d'abord)
  const amb = choisirAmbiance({ comptes, priorites: prio, defautDabord: false });
  const im = prio.delegation.images.actif ? choisirImage({}, prio, comptes) : null;
  return {
    dg: {
      compte: dg?.id || null,
      attente: pDg ? motifPause(dg, pDg, dg.id) : dg ? null : tr('aucun compte connecté'),
      demande: !prio.dg.compte,
      repli: !!(prio.dg.compte && dg?.id !== prio.dg.compte),
      motif: prio.dg.compte && dg?.id !== prio.dg.compte ? tr('{nom} non connecté', { nom: nomDe(comptes.find((c) => c.id === prio.dg.compte), prio.dg.compte) }) : null,
    },
    types,
    verif,
    ambiance: { compte: amb?.compte || null, attente: amb ? null : tr('aucun compte connecté'), repli: false },
    images: im ? { compte: im.compte || null, moteur: im.moteur || null, attente: im.indisponible || null, repli: false } : null,
  };
}

export const priorites = { chargerPriorites, modifierPriorites, typeDe };
