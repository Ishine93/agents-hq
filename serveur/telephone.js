// Alertes sur le téléphone (1.0.8), pour qui laisse le QG travailler sans le regarder : un agent qui a besoin de
// toi, un dossier fini, une limite d'usage qui met en pause, un redémarrage après un plantage. Par ntfy
// (application gratuite, Android et iPhone) : le QG publie sur un « sujet » au nom tiré au hasard, et le
// téléphone abonné à ce sujet sonne. Coupé par défaut.
// Rien du travail ne part : seulement un titre court (« T3 a besoin de ton avis », « Dossier D12 terminé »).
// Sur ntfy.sh, quiconque connaît le nom du sujet peut le lire : d'où un nom long et impossible à deviner.
import crypto from 'node:crypto';
import { REGLAGES, modifierReglages } from './config.js';
import { t } from './i18n.js';

export const SERVEUR_DEFAUT = 'https://ntfy.sh';
export const CATEGORIES = ['attente', 'fin', 'pause', 'relance'];
const DEMO = process.argv.includes('--demo') || process.argv.includes('--replay');
const MAX_PAR_HEURE = 30;

// Type de notification du site → catégorie d'alerte (les autres types ne partent pas).
const PAR_TYPE = { permission: 'attente', decision: 'attente', question: 'attente', validation: 'attente' };

/** Réglages complets, valeurs par défaut comprises. */
export function reglagesTelephone() {
  const r = REGLAGES.telephone || {};
  const c = {};
  for (const k of CATEGORIES) c[k] = r[k] !== false;
  return { actif: r.actif === true && !!r.sujet, serveur: r.serveur || SERVEUR_DEFAUT, sujet: r.sujet || '', ...c };
}

/** Nom de sujet impossible à deviner : « qg- » et 24 lettres ou chiffres. */
export function sujetAuHasard() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'; // sans l, o, 0, 1 : facile à recopier
  return 'qg-' + [...crypto.randomBytes(24)].map((b) => alphabet[b % alphabet.length]).join('');
}

/** Patch validé pour REGLAGES.telephone (route /api/reglages). Lève une erreur sur une valeur refusée. */
export function patchTelephone(corps) {
  const p = {};
  if (typeof corps.actif === 'boolean') p.actif = corps.actif;
  for (const k of CATEGORIES) if (typeof corps[k] === 'boolean') p[k] = corps[k];
  if (corps.sujet === 'nouveau') p.sujet = sujetAuHasard();
  else if (typeof corps.sujet === 'string') {
    const s = corps.sujet.trim();
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(s)) throw new Error(t('Nom de sujet refusé : 16 à 64 lettres, chiffres, - ou _ (sinon, n’importe qui pourrait le deviner).'));
    p.sujet = s;
  }
  if (typeof corps.serveur === 'string') {
    const s = corps.serveur.trim().replace(/\/+$/, '') || SERVEUR_DEFAUT;
    let u = null;
    try {
      u = new URL(s);
    } catch {
      /* refusé plus bas */
    }
    if (!u || u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error(t('Adresse du serveur ntfy refusée : elle doit commencer par https://'));
    p.serveur = s;
  }
  // activer sans sujet : on en tire un
  const avant = REGLAGES.telephone || {};
  if (p.actif && !p.sujet && !avant.sujet) p.sujet = sujetAuHasard();
  return { ...avant, ...p };
}

// ---------------------------------------------------------------- envoi
let envoi = async (serveur, message) => {
  const r = await fetch(serveur + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`ntfy ${r.status}`);
};
/** Pour les tests : remplace l'envoi réseau. */
export const utiliserEnvoi = (fn) => (envoi = fn);

const recents = new Map(); // texte → date d'envoi (pas deux fois la même alerte en une minute)
let heure = { debut: 0, n: 0 };

function publier({ titre, texte = '', priorite = 3, tags = [] }, { forcer = false } = {}) {
  const r = reglagesTelephone();
  if (!forcer && (!r.actif || DEMO)) return Promise.resolve(false);
  if (!r.sujet) return Promise.resolve(false);
  const maintenant = Date.now();
  const cle = `${titre}|${texte}`;
  if (!forcer) {
    if (maintenant - (recents.get(cle) || 0) < 60000) return Promise.resolve(false);
    if (maintenant - heure.debut > 3600000) heure = { debut: maintenant, n: 0 };
    if (heure.n >= MAX_PAR_HEURE) return Promise.resolve(false);
    heure.n++;
  }
  recents.set(cle, maintenant);
  if (recents.size > 200) recents.delete(recents.keys().next().value);
  const message = { topic: r.sujet, title: String(titre).slice(0, 120), message: String(texte || titre).slice(0, 300), priority: priorite, tags };
  return envoi(r.serveur, message).then(
    () => true,
    (e) => {
      console.warn(`[QG] alerte téléphone non envoyée : ${e.message}`);
      return false;
    },
  );
}

/** Une notification du site (voir notifications.notifier) : envoyée si sa catégorie est cochée. */
export function alerterNotification(n, categorie = null) {
  const cat = categorie || PAR_TYPE[n.type];
  if (!cat || !reglagesTelephone()[cat]) return Promise.resolve(false);
  const texte = cat === 'attente' ? t('Ouvre le QG pour répondre.') : cat === 'pause' ? n.texte || '' : n.dossier ? t('Dossier {id}', { id: n.dossier }) : '';
  return publier({ titre: n.titre, texte, priorite: cat === 'attente' ? 4 : 3, tags: [{ attente: 'raising_hand', fin: 'white_check_mark', pause: 'hourglass', relance: 'arrows_counterclockwise' }[cat]] });
}

/** Alerte directe (redémarrage après un plantage…). */
export function alerter(categorie, titre, texte = '') {
  if (!reglagesTelephone()[categorie]) return Promise.resolve(false);
  return publier({ titre, texte, priorite: 4, tags: ['warning'] });
}

/** Bouton « Envoyer un essai » : part même si l'alerte est coupée (mais il faut un sujet). */
export async function envoyerEssai() {
  if (!REGLAGES.telephone?.sujet) modifierReglages({ telephone: patchTelephone({ sujet: 'nouveau' }) });
  const ok = await publier({ titre: t('QG des agents'), texte: t('Essai réussi : ton téléphone recevra les alertes du QG.'), tags: ['tada'] }, { forcer: true });
  if (!ok) throw new Error(t('Envoi impossible : vérifie ta connexion Internet et l’adresse du serveur.'));
  return reglagesTelephone();
}
