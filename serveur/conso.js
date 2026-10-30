// Consommation : tokens et coût (équivalent API) de chaque appel au modèle, en temps réel, rangés par
// jour, compte, modèle, étage, rôle, dossier et tâche. Et les limites du forfait claude.ai de chaque compte
// (fenêtres 5 h, 7 jours, par modèle), lues sans consommer de tokens (session ouverte sans message).
import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { RACINE } from './config.js';
import { chargerComptes, compteConnecte, envPour, trouverCompte, fournisseur as fournisseurDuCompte } from './comptes.js';
import { lireAppServer, fenetresDe } from './ia/codex-app-server.js';
import { t } from './i18n.js';

// QG_CONSO_FICHIER : pour les tests (ne pas mélanger leurs appels à ta vraie consommation).
const FICHIER = process.env.QG_CONSO_FICHIER || path.join(RACINE, 'runtime', 'conso.json');
const JOURS_GARDES = 31;
const vide = () => ({ entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0, cout: 0, appels: 0 });

let etat = { jours: {}, dossiers: {}, taches: {}, limites: {}, reemplois: { nombre: 0, contexte: 0 } };
try {
  etat = { ...etat, ...JSON.parse(fs.readFileSync(FICHIER, 'utf8')) };
} catch {
  /* première fois */
}

let sale = false;
const abonnes = new Set();
let minuterie = null;
function changement() {
  sale = true;
  if (minuterie) return;
  // Diffusion au plus une fois par seconde (les flux de plusieurs agents arrivent en rafale).
  minuterie = setTimeout(() => {
    minuterie = null;
    for (const fn of abonnes) fn();
  }, 1000);
}
export const surChangement = (fn) => abonnes.add(fn);

// 1.0.11 : jusque-là, une conversation reprise ou copiée comptait une deuxième fois tout son coût passé. Une seule
// fois, le rapport « $ → % de la fenêtre » appris sur ces coûts est effacé, et les estimations en $ ne se servent
// plus que des tâches finies après cette date. Les tokens, eux, étaient justes : ils restent.
if (!etat.coutsFiablesDepuis) {
  etat.coutsFiablesDepuis = Date.now();
  delete etat.calibrage;
  changement();
}

setInterval(() => {
  if (!sale) return;
  sale = false;
  try {
    fs.writeFileSync(FICHIER + '.tmp', JSON.stringify(etat));
    fs.renameSync(FICHIER + '.tmp', FICHIER);
  } catch {
    /* disque occupé : au prochain tour */
  }
}, 10000).unref();

const jourDe = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function jour() {
  const cle = jourDe();
  if (!etat.jours[cle]) {
    etat.jours[cle] = { total: vide(), comptes: {}, modeles: {}, etages: {}, roles: {} };
    const cles = Object.keys(etat.jours).sort();
    for (const k of cles.slice(0, Math.max(0, cles.length - JOURS_GARDES))) delete etat.jours[k];
  }
  return etat.jours[cle];
}

function ajouterA(agg, delta) {
  for (const k of Object.keys(delta)) agg[k] = (agg[k] || 0) + delta[k];
}

function limiter(obj, max) {
  const cles = Object.keys(obj);
  for (const k of cles.slice(0, Math.max(0, cles.length - max))) delete obj[k];
}

// Nom court du modèle (claude-opus-5-5 → opus-5-5).
const modeleCourt = (m) => String(m || 'inconnu').replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/\[1m\]$/, '');

function repartir(meta, delta, modele = null) {
  const j = jour();
  ajouterA(j.total, delta);
  const dans = (groupe, cle) => cle && ajouterA((j[groupe][cle] = j[groupe][cle] || vide()), delta);
  dans('comptes', meta.compte);
  dans('etages', meta.etage);
  dans('roles', meta.role);
  if (modele) dans('modeles', modeleCourt(modele));
  if (meta.dossier) {
    ajouterA((etat.dossiers[meta.dossier] = etat.dossiers[meta.dossier] || vide()), delta);
    limiter(etat.dossiers, 60);
  }
  if (meta.tache) {
    ajouterA((etat.taches[meta.tache] = etat.taches[meta.tache] || vide()), delta);
    limiter(etat.taches, 400);
  }
  changement();
}

/** Un appel au modèle (un message assistant unique) : `usage` tel que renvoyé par l'API. */
export function enregistrerAppel(meta, usage, modele, nouveau = true) {
  if (!usage) return;
  repartir(meta, {
    entree: usage.input_tokens || 0,
    sortie: usage.output_tokens || 0,
    cacheLu: usage.cache_read_input_tokens || 0,
    cacheEcrit: usage.cache_creation_input_tokens || 0,
    appels: nouveau ? 1 : 0,
  }, modele);
}

/** Coût (équivalent API, en dollars) d'une session : on reçoit le cumul, on ajoute l'écart. */
export function enregistrerCout(meta, delta) {
  if (!(delta > 0)) return;
  repartir(meta, { cout: delta });
}

/**
 * Dernier coût total vu pour chaque conversation Claude (1.0.11). Claude Code repart de ce total quand on reprend
 * ou qu'on copie une conversation : c'est le point de départ de l'écart à ajouter.
 */
export const coutConnuSession = (id) => (id && typeof etat.sessions?.[id] === 'number' ? etat.sessions[id] : null);

export function noterCoutSession(id, total) {
  if (!id || typeof total !== 'number') return;
  etat.sessions ||= {};
  delete etat.sessions[id]; // remise en dernier : le ménage retire les plus anciennes
  etat.sessions[id] = total;
  limiter(etat.sessions, 500);
  changement();
}

/** Compaction automatique d'une session (lot A2) : nombre et tokens résumés. */
export function enregistrerCompaction(avant) {
  etat.compactions ||= { nombre: 0, tokens: 0 };
  etat.compactions.nombre += 1;
  etat.compactions.tokens += avant || 0;
  changement();
}

/** Un agent réembauché réutilise son contexte au lieu d'en reconstruire un. */
export function enregistrerReemploi(contexte) {
  etat.reemplois.nombre += 1;
  etat.reemplois.contexte += contexte || 0;
  changement();
}

// ---------------------------------------------------------------- limites du forfait

// La lecture des limites répond en pourcentage (0-100) ; les événements des sessions, en fraction (0-1).
// (Deviner l'échelle d'après la valeur affichait 1 % de la semaine comme 100 %.)
const pctLecture = (v) => (v == null ? null : Math.round(v * 10) / 10);
const pctEvenement = (v) => (v == null ? null : Math.min(Math.round(v * 1000) / 10, 100));

/** Événement « rate_limit » reçu pendant une session : mise à jour immédiate de la fenêtre concernée. */
export function majLimiteEvenement(compteId, info) {
  if (!info?.rateLimitType || !compteId) return;
  const l = (etat.limites[compteId] = etat.limites[compteId] || { fenetres: {} });
  const f = (l.fenetres[info.rateLimitType] = l.fenetres[info.rateLimitType] || {});
  if (info.utilization != null) f.utilisation = pctEvenement(info.utilization);
  if (info.resetsAt) f.reinit = info.resetsAt * (info.resetsAt < 1e12 ? 1000 : 1);
  f.statut = info.status;
  // Seule cette fenêtre est neuve : l.maj reste l'heure de la dernière lecture complète.
  f.lu = Date.now();
  changement();
}

// Après chaque lecture réussie (forfait changé, pause à lever…) : abonnés posés par index.js et l'ordonnanceur.
const abonnesLimites = new Set();
export const surLimitesLues = (fn) => abonnesLimites.add(fn);

/** Range une réponse de la lecture des limites (exportée pour les tests). Lève une erreur si elle est vide. */
export function appliquerLecture(compteId, u) {
  // Forfait sans limites (clé API…) : rien à lire. Forfait avec limites mais réponse vide : le serveur
  // n'a pas répondu (trop de lectures rapprochées), c'est un échec, on garde les anciennes valeurs.
  if (u.rate_limits_available && !u.rate_limits) throw new Error(t('le serveur n’a pas donné les limites, nouvel essai dans quelques minutes'));
  const lu = Date.now();
  const l = { maj: lu, essai: lu, abonnement: u.subscription_type || null, disponible: !!u.rate_limits_available, fenetres: {} };
  const r = u.rate_limits || {};
  for (const k of ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet']) {
    if (r[k]) l.fenetres[k] = { utilisation: pctLecture(r[k].utilization), reinit: r[k].resets_at ? Date.parse(r[k].resets_at) : null };
  }
  for (const m of r.model_scoped || []) l.fenetres[`modele:${m.display_name}`] = { nom: m.display_name, utilisation: pctLecture(m.utilization), reinit: m.resets_at ? Date.parse(m.resets_at) : null };
  if (r.extra_usage?.is_enabled) l.extra = { utilisation: pctLecture(r.extra_usage.utilization), credits: r.extra_usage.used_credits, plafond: r.extra_usage.monthly_limit, devise: r.extra_usage.currency || null };
  // Tout est remplacé : une fenêtre d'avant (ancien forfait, événement « limite atteinte ») ne survit pas.
  etat.limites[compteId] = l;
  changement();
  for (const fn of abonnesLimites) {
    try {
      fn(compteId, l);
    } catch (e) {
      console.error('limites', compteId, e.message);
    }
  }
  return l;
}

/** Lecture Codex (app-server) rangée au même format : fenêtres `codex:primary` / `codex:secondary` avec leur nom. */
export function appliquerLectureCodex(compteId, lecture, compte = null) {
  const { fenetres, forfait, credits } = fenetresDe(lecture);
  const lu = Date.now();
  const l = { maj: lu, essai: lu, abonnement: compte?.cleApi ? 'API' : forfait, disponible: !!Object.keys(fenetres).length, fenetres };
  if (credits && typeof credits === 'object') l.extra = { credits: credits.balance ?? credits.used ?? null, devise: null };
  etat.limites[compteId] = l;
  changement();
  for (const fn of abonnesLimites) {
    try {
      fn(compteId, l);
    } catch (e) {
      console.error('limites', compteId, e.message);
    }
  }
  return l;
}

/** Lecture ratée : on garde les dernières valeurs, mais marquées comme anciennes (maj = dernière lecture réussie). */
export function echecLecture(compteId, e) {
  etat.limites[compteId] = { ...(etat.limites[compteId] || { fenetres: {} }), erreur: String(e?.message || e), essai: Date.now() };
  changement();
}

/** Limites telles que gardées (pour les tests). */
export const limitesDe = (compteId) => etat.limites[compteId];

/** Fable a sa propre fenêtre (semaine) : ce qu'il en reste pour ce compte, ou null si on ne sait pas. */
export function quotaFable(compteId) {
  const l = etat.limites[compteId];
  const f = l && Object.entries(l.fenetres || {}).find(([k, x]) => /fable/i.test(k + ' ' + (x.nom || '')))?.[1];
  if (!f || f.utilisation == null) return null;
  return { utilisation: f.utilisation, reste: Math.max(0, Math.round((100 - f.utilisation) * 10) / 10), reinit: f.reinit || null, lu: f.lu || l.maj || null };
}

const enCours = new Map();
/** Lit les limites du forfait d'un compte (aucun appel au modèle, ≈ 3 s). */
export function lireLimites(compteId) {
  if (enCours.has(compteId)) return enCours.get(compteId);
  const p = (async () => {
    const compte = trouverCompte(compteId);
    if (!compteConnecte(compte)) return null;
    // Agent ACP : le protocole ne donne pas les limites du forfait (seulement le coût par session, s'il le donne).
    if (fournisseurDuCompte(compte) === 'acp') {
      enCours.delete(compteId);
      return null;
    }
    if (fournisseurDuCompte(compte) === 'codex') {
      // Codex : `codex app-server` › account/rateLimits/read (fenêtres primary/secondary avec leur durée), sans tokens.
      try {
        const r = await lireAppServer({ env: envPour(compte), cwd: path.join(RACINE, 'runtime'), methodes: ['account/rateLimits/read'] });
        if (r.erreur && !r['account/rateLimits/read']) throw new Error(r.erreur);
        return appliquerLectureCodex(compteId, r['account/rateLimits/read'], compte);
      } catch (e) {
        echecLecture(compteId, e);
        return null;
      } finally {
        enCours.delete(compteId);
      }
    }
    let liberer;
    const silence = new Promise((r) => (liberer = r));
    async function* aucunMessage() {
      await silence;
    }
    const q = query({
      prompt: aucunMessage(),
      options: { cwd: path.join(RACINE, 'runtime'), env: envPour(compte), settingSources: [], model: 'haiku', maxTurns: 1, permissionMode: 'dontAsk', tools: [] },
    });
    const lecture = (async () => {
      try {
        for await (const _ of q) {
          /* rien */
        }
      } catch {
        /* fermeture */
      }
    })();
    try {
      const u = await Promise.race([
        q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé')), 20000)),
      ]);
      return appliquerLecture(compteId, u);
    } catch (e) {
      echecLecture(compteId, e);
      return null;
    } finally {
      liberer();
      q.close();
      await Promise.race([lecture, new Promise((r) => setTimeout(r, 3000))]);
      enCours.delete(compteId);
    }
  })();
  enCours.set(compteId, p);
  return p;
}

// Relecture régulière : toutes les 5 min s'il y a eu de l'activité récente (ou si urgent(), le QG en pause
// sur une limite d'usage), sinon toutes les 30 min. Un échec compte comme une lecture pour ce rythme.
let derniereActivite = 0;
export const signalerActivite = () => (derniereActivite = Date.now());
export function demarrerSuiviLimites({ urgent = () => false } = {}) {
  const tour = async () => {
    for (const c of chargerComptes().comptes) {
      if (!compteConnecte(c)) continue;
      const l = etat.limites[c.id];
      const age = Date.now() - Math.max(l?.maj || 0, l?.essai || 0);
      const actif = urgent() || Date.now() - derniereActivite < 10 * 60 * 1000;
      if (age > (actif ? 5 : 30) * 60 * 1000) await lireLimites(c.id).catch(() => null);
    }
  };
  setTimeout(tour, 15000).unref();
  setInterval(tour, 60000).unref();
}

// ---------------------------------------------------------------- vue pour le site

export function consoPublique() {
  const cle = jourDe();
  const j = etat.jours[cle] || { total: vide(), comptes: {}, modeles: {}, etages: {}, roles: {} };
  const semaine = [];
  for (let i = 6; i >= 0; i--) {
    const k = jourDe(Date.now() - i * 86400000);
    semaine.push({ jour: k, ...(etat.jours[k]?.total || vide()) });
  }
  const total = vide();
  for (const x of Object.values(etat.jours)) ajouterA(total, x.total);
  return {
    jour: cle,
    aujourdhui: j,
    semaine,
    mois: total,
    dossiers: Object.fromEntries(Object.entries(etat.dossiers).slice(-30)),
    limites: etat.limites,
    reemplois: etat.reemplois,
    compactions: etat.compactions || { nombre: 0, tokens: 0 },
    calibrage: etat.calibrage || {},
  };
}

// Dossier supprimé : il disparaît du détail « par dossier » (les totaux du jour gardent ce qui a été consommé).
export function oublierDossier(id) {
  delete etat.dossiers[id];
  for (const k of Object.keys(etat.taches)) if (k.startsWith(`${id}-`)) delete etat.taches[k];
  changement();
}

export const consoTaches = (dossierId) => Object.fromEntries(Object.entries(etat.taches).filter(([k]) => k.startsWith(`${dossierId}-`)));

// ---------------------------------------------------------------- lot C : estimation et calibrage (logique dans estimation.js)
export const donneesConso = () => etat;
/** Annotations d'un dossier (profil, estimation, compactions) ou d'une tâche (contexteMax, tours, compactions, cache). */
export function annoterConso(groupe, id, champs) {
  if (!id || !['dossiers', 'taches'].includes(groupe)) return;
  Object.assign((etat[groupe][id] = etat[groupe][id] || vide()), champs);
  limiter(etat[groupe], groupe === 'dossiers' ? 60 : 400);
  changement();
}
export function enregistrerCalibrage(compteId, cal) {
  (etat.calibrage ||= {})[compteId] = cal;
  changement();
}
