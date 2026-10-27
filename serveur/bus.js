// Bus d'événements : état courant du QG, diffusion SSE et journal par dossier.
// Une tâche a des champs publics (protocole, docs/protocole.md) et un sous-objet `x` interne
// (prompt, dépendances détaillées, sessions…) qui n'est jamais envoyé au site.
import fs from 'node:fs';
import { etatInstallation as etatInstallationCodex } from './ia/codex-installation.js';
import path from 'node:path';
import os from 'node:os';
import { RACINE, REGLAGES, etages, racines } from './config.js';
import * as plateforme from './plateforme.js';
import { chargerComptes, compteConnecte, dossierConfig, fournisseur as fournisseurDuCompte, adaptateur as adaptateurDuCompte } from './comptes.js';
import { listeFournisseurs, FOURNISSEURS } from './ia/fournisseurs.js';
import { decouverteEnCache } from './decouverte.js';
import { vueMcp } from './mcp.js';
import { etatDictee } from './dictee.js';
import { agentsPublics, personnalisation } from './equipe.js';
import { bonheurPublic } from './bonheur.js';
import { consoPublique } from './conso.js';
import { t } from './i18n.js';
import { appInstallee } from './navigateur.js';
import { listeSkills } from './skills.js';
import { noterReflexion } from './pensees.js';
import { travailReglages, profilsTravail } from './travail.js';

export let DOSSIERS_DIR = path.join(RACINE, 'dossiers');
const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8').replace(/^﻿/, '')).version;
  } catch {
    return null;
  }
})();

// Le mode démo range ses dossiers à part pour ne pas mélanger l'historique réel.
export function utiliserDossiers(nom) {
  DOSSIERS_DIR = path.join(RACINE, nom);
}

let seq = 0;
let compteurMessages = 0;
const clients = new Set();
const aSauver = new Set();
let minuterieSauvegarde = null;

export const etat = {
  dossiers: new Map(),
  taches: new Map(),
  permissions: new Map(),
  decisions: new Map(),
  notifications: new Map(), // actions qui t'attendent (permission, question, validation…)
  services: new Map(), // serveurs longs du sous-sol (rojo serve…)
  terminaux: new Map(), // tacheId → dernières commandes Bash de l'agent (avec leur sortie)
  modifications: new Map(), // tacheId → derniers fichiers écrits par l'agent, avec leur diff
  pensees: new Map(), // cible ('dg' ou tacheId) → dernière pensée en direct
  reflexions: new Map(), // cible → texte complet des derniers blocs de réflexion (plafonné)
  messages: [],
  dg: { etat: 'libre', dossier: null, etage: 'direction', action: null },
  ordonnanceur: { pause: null },
};

export function abonner(fn) {
  clients.add(fn);
  return () => clients.delete(fn);
}

export const nbClients = () => clients.size;

// Dossiers supprimés (voir effacerDossier) : un événement tardif (session qui se termine…) ne doit ni les
// faire réapparaître à l'écran, ni recréer leur dossier sur le disque.
const supprimes = new Set();

// État du mini-jeu des personnages (personnages.js le fournit : pas d'import circulaire).
let fournisseurMiniJeu = () => null;
export const fournirMiniJeu = (fn) => (fournisseurMiniJeu = fn);

export function emettre(type, donnees = {}, dossierId = null) {
  if (dossierId && supprimes.has(dossierId)) return null;
  const ev = { seq: ++seq, t: Date.now(), type, ...donnees };
  for (const envoyer of clients) {
    try {
      envoyer(ev);
    } catch {
      /* client déconnecté */
    }
  }
  if (dossierId) journaliser(dossierId, ev);
  return ev;
}

export const publicTache = ({ x, ...pub }) => pub;
export const publicDossier = ({ x, ...pub }) => pub;

export function comptesPublics() {
  const { defaut, comptes } = chargerComptes();
  return {
    compteDefaut: defaut,
    // compte qui exécute les tâches des nouvelles demandes (null = le compte du DG)
    compteAgents: REGLAGES.compteAgents && comptes.some((c) => c.id === REGLAGES.compteAgents) ? REGLAGES.compteAgents : null,
    fournisseurs: listeFournisseurs(),
    // Codex installé à la demande (Réglages › Comptes IA) : absent, installation, installe, erreur
    installationCodex: etatInstallationCodex(),
    // agents ACP connus (Grok, Cursor…), présents ou non sur ce PC, pour l'ajout d'un compte « Autres agents »
    agentsAcp: FOURNISSEURS.acp.cataloguePublic(),
    comptes: comptes.map((c) => {
      const d = decouverteEnCache(c.id);
      const f = fournisseurDuCompte(c);
      const cap = adaptateurDuCompte(c).capacites(c);
      return {
        id: c.id,
        nom: c.nom,
        fournisseur: f,
        acces: c.cleApi ? 'cle' : 'abonnement',
        connecte: compteConnecte(c),
        type: c.cleApi ? 'api' : 'abonnement',
        abonnement: c.cleApi ? 'API' : d?.abonnement || null,
        email: d?.email || null,
        dossier: dossierConfig(c),
        // Compte partagé avec Claude Code installé sur ce PC (~/.claude).
        partage: f === 'claude' && plateforme.memeChemin(dossierConfig(c), path.join(os.homedir(), '.claude')),
        // agent ACP du compte (grok, cursor… ou personnalise)
        ...(f === 'acp' ? { agent: cap.agent, qualification: cap.qualification } : {}),
        // ce que le fournisseur garantit (profils, mode prudent…), résumé pour le site
        capacites: { profils: cap.profils, modePrudent: cap.modePrudent, fork: cap.fork, sessionsParCompte: cap.sessionsParCompte, compaction: cap.compaction !== false, plafondBudget: cap.plafondBudget !== false, sousAgents: cap.sousAgents !== false, filtreTests: cap.filtreTests !== false, modeles: cap.modeles !== false, effort: cap.effort !== false },
      };
    }),
  };
}

// Réglages modifiables depuis le site (Réglages, configuration du premier lancement).
export function reglagesPublics() {
  return {
    langueInterface: REGLAGES.langueInterface,
    langueIA: REGLAGES.langueIA,
    travail: travailReglages(REGLAGES),
    niveauxTravail: profilsTravail().cout, // valeurs de chaque niveau (Réglages › Général › Coût › Personnaliser)
    filtreTests: REGLAGES.filtreTests !== false,
    utilisateur: REGLAGES.utilisateur || '',
    racines: REGLAGES.racines || [],
    racinesValides: racines(),
    modeTravail: REGLAGES.modeTravail,
    onboarding: !!REGLAGES.onboarding,
    plafondGlobal: REGLAGES.plafondGlobal,
    plafondEtage: REGLAGES.plafondEtage,
    recolteAuto: REGLAGES.recolteAuto !== false,
    rojoPortsAuto: !!REGLAGES.rojoPortsAuto,
    gitAuto: REGLAGES.gitAuto === true,
    traduireReflexion: REGLAGES.traduireReflexion === true,
    validationUtilisateur: REGLAGES.validationUtilisateur === true,
    ouvrirEnApp: REGLAGES.ouvrirEnApp !== false,
    entreeEnvoie: REGLAGES.entreeEnvoie === true,
    ecritureHorsProjet: REGLAGES.ecritureHorsProjet === true,
    gardeFable: { actif: REGLAGES.gardeFable?.actif !== false, resteMin: REGLAGES.gardeFable?.resteMin ?? 30 },
    navigateurApp: appInstallee(),
    miseAJourAuto: REGLAGES.miseAJourAuto !== false,
    dureeBulles: Number(REGLAGES.dureeBulles) || 1,
    dg: { modele: REGLAGES.dg.modele, effort: REGLAGES.dg.effort },
    dictee: REGLAGES.dictee || {},
    qg: RACINE,
    version: VERSION,
    demo: process.argv.includes('--demo'),
    // Claude Code déjà connecté sur ce poste (~/.claude) : fichier sur Windows, trousseau sur Mac
    claudeCodeLocal: compteConnecte({ id: 'local', configDir: null }),
    // Windows ou Mac : noms des scripts, dictée locale possible, raccourci de dictée (voir plateforme.infos)
    plateforme: plateforme.infos(),
  };
}

// Les étages livrés gardent leur nom traduit tant que tu ne les as pas renommés.
const NOMS_LIVRES = new Set(['Direction', 'Bac à sable', 'Hall', 'Salle de pause', 'Salle de repos', 'Sous-sol serveurs', "Bureau d'études", 'Atelier 3D', 'Studio vidéo']);
export const etagesPublics = () =>
  etages().map(({ id, nom, type, ordre, projet, actif, dossiers }) => ({
    id, nom: NOMS_LIVRES.has(nom) ? t(nom) : nom, type, ordre, projet, actif: !!actif, dossiers: dossiers || (projet ? [projet] : []),
  }));

// Modèles proposables par compte (pour le sélecteur du DG dans le site).
export function modelesPublics() {
  const { comptes } = chargerComptes();
  return Object.fromEntries(
    comptes.map((c) => {
      const d = decouverteEnCache(c.id);
      // un agent ACP peut n'avoir aucun réglage d'effort : ses modèles restent proposés
      const liste = (d?.modeles || []).filter((m) => m.id !== 'default' && (m.efforts?.length || fournisseurDuCompte(c) === 'acp')).map((m) => ({ id: m.id, nom: m.nom, efforts: m.efforts }));
      // repli par fournisseur : Opus pour Claude (comme avant), la liste des équivalences pour les autres
      const repli = fournisseurDuCompte(c) === 'claude' ? [{ id: 'opus', nom: 'Opus 5.5', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] }] : adaptateurDuCompte(c).modeles(c).map(({ id, nom, efforts }) => ({ id, nom, efforts }));
      return [c.id, liste.length ? liste : repli];
    }),
  );
}

export function mcpPublic() {
  return vueMcp(chargerComptes().comptes.map((c) => c.id));
}

export function instantane() {
  const dossiers = [...etat.dossiers.values()].slice(-REGLAGES.historiqueDossiers);
  const ids = new Set(dossiers.map((d) => d.id));
  return {
    seq: ++seq,
    t: Date.now(),
    type: 'etat',
    etages: etagesPublics(),
    ...comptesPublics(),
    reglages: reglagesPublics(),
    personnalisation: personnalisation(),
    conso: consoPublique(),
    modeles: modelesPublics(),
    dgDefaut: { modele: REGLAGES.dg.modele, effort: REGLAGES.dg.effort },
    mcp: mcpPublic(),
    dossiers: dossiers.map(publicDossier),
    taches: [...etat.taches.values()].filter((t) => ids.has(t.dossier)).map(publicTache),
    // Plans (tableau blanc du DG) avec les vraies dépendances, pour un site qui se reconnecte.
    plans: Object.fromEntries(
      dossiers.map((d) => [
        d.id,
        [...etat.taches.values()]
          .filter((t) => t.dossier === d.id)
          .sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)))
          .map((t) => ({ ref: t.ref, titre: t.titre, etage: t.etage, deps: (t.x?.deps || []).map((x) => x.ref), modele: t.modele, effort: t.effort })),
      ]),
    ),
    permissions: [...etat.permissions.values()],
    decisions: [...etat.decisions.values()],
    notifications: [...etat.notifications.values()],
    equipe: agentsPublics(),
    bonheur: bonheurPublic(),
    services: [...etat.services.values()].map(({ lignes, ...s }) => ({ ...s, dernieresLignes: (lignes || []).slice(-20) })),
    terminaux: Object.fromEntries([...etat.terminaux].filter(([id]) => ids.has(id.split('-')[0]))),
    pensees: Object.fromEntries([...etat.pensees].filter(([, p]) => Date.now() - p.t < 120000)),
    reflexions: Object.fromEntries(etat.reflexions),
    dictee: { disponible: etatDictee.disponible, appareil: etatDictee.appareil },
    messages: etat.messages.slice(-200),
    dg: etat.dg,
    ordonnanceur: etat.ordonnanceur,
    miniJeu: fournisseurMiniJeu(),
    skills: listeSkills(),
  };
}

export function majDossier(d) {
  if (supprimes.has(d.id)) return;
  etat.dossiers.set(d.id, d);
  emettre('dossier', { dossier: publicDossier(d) }, d.id);
  planifierSauvegarde(d.id);
}

export function majTache(t, de = null) {
  if (supprimes.has(t.dossier)) return;
  etat.taches.set(t.id, t);
  emettre('tache', { tache: publicTache(t), transition: { de, a: t.etat } }, t.dossier);
  planifierSauvegarde(t.dossier);
}

export function changerEtatTache(t, nouvelEtat, extra = {}) {
  const de = t.etat;
  Object.assign(t, extra, { etat: nouvelEtat });
  majTache(t, de);
}

// `pieces` : images publiques ({id, nom, type, legende, origine, url}) affichées avec le message.
// extra : champs en plus, ex. { nom, tache, reponse: true } pour la réponse d'un agent (de: 'agent').
export function message(dossierId, de, texte, etagesCibles = null, pieces = [], extra = null) {
  if (dossierId && supprimes.has(dossierId)) return null;
  const d = dossierId ? etat.dossiers.get(dossierId) : null;
  const m = {
    id: `M${++compteurMessages}`,
    dossier: dossierId,
    etages: etagesCibles || d?.etages || [],
    de,
    texte,
    pieces,
    t: Date.now(),
    ...(extra || {}),
  };
  etat.messages.push(m);
  if (etat.messages.length > 500) etat.messages.splice(0, etat.messages.length - 500);
  emettre('message', { message: m }, dossierId);
  return m;
}

export function majDg(dg) {
  etat.dg = { ...etat.dg, ...dg };
  emettre('dg', { dg: etat.dg }, dg.dossier || null);
}

// Pensée en direct d'un agent (cible = id de tâche) ou du DG (cible = 'dg').
// Une réflexion arrive par morceaux (bloc, pos, ajout, fin) : on garde son texte complet pour l'état initial.
export function pensee(cible, dossierId, p) {
  const ev = { cible, dossier: dossierId, ...p, t: Date.now() };
  noterReflexion(etat.reflexions, cible, ev);
  const { ajout, pos, ...dernier } = ev; // l'état initial porte déjà le texte complet
  etat.pensees.set(cible, dernier);
  emettre('pensee', ev, dossierId);
}

// Traduction d'un bloc de réflexion terminé (Réglages › Général) : gardée avec le bloc, le texte d'origine reste.
export function traductionPensee(cible, dossierId, bloc, traduction) {
  const b = (etat.reflexions.get(cible) || []).find((x) => x.bloc === bloc);
  if (b) b.traduction = traduction;
  emettre('pensee_traduction', { cible, dossier: dossierId, bloc, traduction }, dossierId);
}

// Terminal d'un agent : chaque commande Bash (début puis fin avec sa sortie).
export function commande(tacheId, dossierId, c) {
  const liste = etat.terminaux.get(tacheId) || [];
  const i = liste.findIndex((x) => x.id === c.id);
  if (i >= 0) liste[i] = { ...liste[i], ...c };
  else liste.push(c);
  if (liste.length > 40) liste.splice(0, liste.length - 40);
  etat.terminaux.set(tacheId, liste);
  emettre('commande', { tache: tacheId, commande: c }, dossierId);
}

// Code écrit par un agent (Edit, Write…) : le diff part en direct au site et dans le journal du dossier ;
// la tâche garde le total des lignes ajoutées et supprimées.
export function modification(t, dossierId, mod) {
  const liste = etat.modifications.get(t.id) || [];
  liste.push(mod);
  if (liste.length > 60) liste.splice(0, liste.length - 60);
  etat.modifications.set(t.id, liste);
  const fichiers = new Set([...(t.x.fichiersTouches || []), mod.fichier]);
  t.x.fichiersTouches = [...fichiers];
  const l = t.lignes || { ajouts: 0, suppressions: 0, fichiers: 0 };
  t.lignes = { ajouts: l.ajouts + mod.ajouts, suppressions: l.suppressions + mod.suppressions, fichiers: fichiers.size };
  emettre('modification', { tache: t.id, modification: mod }, dossierId);
  majTache(t);
}

// Modifications d'une tâche : celles en mémoire, sinon relues dans le journal du dossier (après un redémarrage).
export function modificationsDe(tacheId) {
  if (etat.modifications.has(tacheId)) return etat.modifications.get(tacheId);
  const dossierId = String(tacheId).split('-')[0];
  const f = path.join(DOSSIERS_DIR, dossierId, 'events.jsonl');
  const liste = [];
  try {
    for (const ligne of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!ligne.includes('"modification"') || !ligne.includes(tacheId)) continue;
      try {
        const ev = JSON.parse(ligne);
        if (ev.type === 'modification' && ev.tache === tacheId && ev.modification) liste.push(ev.modification);
      } catch {
        /* ligne abîmée */
      }
    }
  } catch {
    /* pas de journal */
  }
  return liste.slice(-60);
}

export function alerte(niveau, texte, dossierId = null) {
  emettre('alerte', { niveau, texte }, dossierId);
}

// ---- Persistance : dossiers/<id>/events.jsonl + state.json

function journaliser(dossierId, ev) {
  try {
    const dir = path.join(DOSSIERS_DIR, dossierId);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify(ev) + '\n');
  } catch (e) {
    console.error('journal', dossierId, e.message);
  }
}

function planifierSauvegarde(dossierId) {
  aSauver.add(dossierId);
  if (minuterieSauvegarde) return;
  minuterieSauvegarde = setTimeout(() => {
    minuterieSauvegarde = null;
    for (const id of aSauver) sauver(id);
    aSauver.clear();
  }, 300);
}

/**
 * Efface complètement un dossier (déjà arrêté par l'ordonnanceur) : tâches, messages, notifications,
 * demandes en attente, et son dossier sur le disque (journal, état, pièces jointes). Le site le retire aussi.
 */
export function effacerDossier(id) {
  supprimes.add(id);
  aSauver.delete(id);
  const taches = new Set([...etat.taches.values()].filter((t) => t.dossier === id).map((t) => t.id));
  for (const tid of taches) {
    etat.taches.delete(tid);
    etat.terminaux.delete(tid);
    etat.modifications.delete(tid);
    etat.pensees.delete(tid);
    etat.reflexions.delete(tid);
  }
  const blocsDg = etat.reflexions.get('dg');
  if (blocsDg) etat.reflexions.set('dg', blocsDg.filter((b) => b.dossier !== id));
  for (const [k, p] of etat.permissions) if (taches.has(p.tache)) etat.permissions.delete(k);
  for (const [k, x] of etat.decisions) if (taches.has(x.tache)) etat.decisions.delete(k);
  for (const [k, n] of etat.notifications) if (n.dossier === id || taches.has(n.tache)) etat.notifications.delete(k);
  etat.messages = etat.messages.filter((m) => m.dossier !== id);
  etat.dossiers.delete(id);
  try {
    fs.rmSync(path.join(DOSSIERS_DIR, id), { recursive: true, force: true });
  } catch (e) {
    console.error('suppression', id, e.message);
  }
  emettre('dossier_supprime', { dossier: id });
}

export function sauver(dossierId) {
  const d = etat.dossiers.get(dossierId);
  if (!d) return;
  const taches = [...etat.taches.values()].filter((t) => t.dossier === dossierId);
  const dir = path.join(DOSSIERS_DIR, dossierId);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, 'state.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify({ dossier: d, taches }, null, 2));
  fs.renameSync(tmp, path.join(dir, 'state.json'));
}

const TERMINAUX_TACHE = new Set(['done', 'failed', 'cancelled', 'skipped']);
const TERMINAUX_DOSSIER = new Set(['termine', 'annule', 'echec']);
const EN_SESSION = new Set(['briefing', 'running', 'permission', 'rework', 'verifying', 'interrupted']);
export const PROMPT_REPRISE =
  "Le serveur du QG a redémarré pendant ta mission. Reprends exactement là où tu t'étais arrêté (vérifie l'état des fichiers que tu étais en train de modifier), termine la mission, puis rends ta sortie structurée complète.";

// Au démarrage : on recharge l'historique et on REPREND les dossiers non terminés. Une tâche qui tournait
// repart dans sa propre conversation Claude (reprise de session, avec tout son contexte) ; ce qui
// attendait repart normalement. La relance effective est faite par l'ordonnanceur (reprendreDossiers).
export function chargerHistorique() {
  if (!fs.existsSync(DOSSIERS_DIR)) return 0;
  let max = 0;
  const lus = [];
  for (const nom of fs.readdirSync(DOSSIERS_DIR)) {
    const f = path.join(DOSSIERS_DIR, nom, 'state.json');
    if (!fs.existsSync(f)) continue;
    try {
      const { dossier, taches } = JSON.parse(fs.readFileSync(f, 'utf8'));
      max = Math.max(max, Number(String(dossier.id).replace(/\D/g, '')) || 0);
      const actif = !TERMINAUX_DOSSIER.has(dossier.etat);
      for (const t of taches) {
        if (EN_SESSION.has(t.etat) && actif) {
          const userVerif = t.etat === 'verifying' && t.x?.verification?.mode === 'user';
          if (!userVerif) {
            const phase = t.etat === 'verifying' ? 'verification' : t.etat === 'rework' ? 'rework' : 'production';
            t.x.reprise = phase === 'verification' ? { phase } : t.x.session ? { phase, resume: t.x.session, prompt: PROMPT_REPRISE } : null;
            t.x.gen = (t.x.gen || 0) + 1;
            t.x.approbationEnCours = false;
            t.etat = 'ready';
            t.motifFile = null;
          }
        } else if (EN_SESSION.has(t.etat)) {
          t.etat = 'cancelled'; // dossier déjà clos : rien à reprendre
        }
        etat.taches.set(t.id, t);
      }
      if (actif) {
        dossier.x = { ...(dossier.x || {}), syntheseEnCours: false, repriseApresRedemarrage: true };
      }
      etat.dossiers.set(dossier.id, dossier);
      lus.push(dossier);
      sauver(dossier.id);
    } catch (e) {
      console.error('historique', nom, e.message);
    }
  }
  lus.sort((a, b) => a.creeLe - b.creeLe);
  etat.dossiers = new Map(lus.map((d) => [d.id, d]));
  return max;
}

// ---- Replay : on réapplique des événements enregistrés pour reconstruire l'état affiché.
export function appliquerEvenement(ev) {
  switch (ev.type) {
    case 'dossier':
      etat.dossiers.set(ev.dossier.id, ev.dossier);
      break;
    case 'tache':
      etat.taches.set(ev.tache.id, ev.tache);
      break;
    case 'message':
      etat.messages.push(ev.message);
      break;
    case 'permission':
      etat.permissions.set(ev.permission.id, ev.permission);
      break;
    case 'decision':
      etat.decisions.set(ev.decision.id, ev.decision);
      break;
    case 'notification':
      if (ev.notification.actions?.length) etat.notifications.set(ev.notification.id, ev.notification);
      break;
    case 'notification_resolue':
      etat.notifications.delete(ev.id);
      break;
    case 'service':
      etat.services.set(ev.service.id, { ...ev.service, lignes: ev.service.dernieresLignes || [] });
      break;
    case 'decision_resolue':
      etat.decisions.delete(ev.id);
      break;
    case 'permission_resolue':
      etat.permissions.delete(ev.id);
      break;
    case 'dg':
      etat.dg = ev.dg;
      break;
    case 'ordonnanceur':
      etat.ordonnanceur = ev.ordonnanceur;
      break;
    default:
      break;
  }
  const { seq: _s, t: _t, ...reste } = ev;
  emettre(ev.type, Object.fromEntries(Object.entries(reste).filter(([k]) => k !== 'type')));
}
