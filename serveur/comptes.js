// Comptes IA : chaque compte = un fournisseur (claude, codex), un type d'accès (abonnement ou clé API) et un
// dossier de connexion à lui (CLAUDE_CONFIG_DIR ou CODEX_HOME) qui contient sa propre connexion. Le serveur
// ne lit, ne copie ni ne stocke aucun jeton. Autant de comptes que tu veux : ajout, renommage et connexion
// depuis le site (Réglages › Comptes IA) ou ajouter-un-compte.bat (ajouter-un-compte.command sur Mac).
// Fichier config/comptes.json en version 2 ; un fichier d'avant (comptes Claude seulement) est migré
// sans perte au premier chargement (sauvegarde config/comptes.v1.json).
import fs from 'node:fs';
import path from 'node:path';
import { RACINE, ecrireJson } from './config.js';
import * as plateforme from './plateforme.js';
import { adaptateurDe, fournisseurDe, FOURNISSEURS } from './ia/fournisseurs.js';
import { t } from './i18n.js';

// QG_COMPTES_FICHIER : pour les tests (un fichier de comptes à part).
const FICHIER = process.env.QG_COMPTES_FICHIER || path.join(RACINE, 'config', 'comptes.json');
export const VERSION_COMPTES = 2;
// Claude Code livré par le SDK, pour la plateforme et le processeur de ce poste (gardé pour les appelants).
export const CLAUDE_EXE = plateforme.claudeExe();

// ---------------------------------------------------------------- lecture et migration

/**
 * Migration v1 → v2 (idempotente, sans perte) : chaque compte reçoit `fournisseur: "claude"` et
 * `acces: "cle"` ou `"abonnement"` ; tout le reste (id, nom, configDir, cleApi, note) est gardé tel quel.
 * Aucun dossier de connexion n'est touché. Rend { brut, migre }.
 */
export function migrerComptes(brut) {
  if (brut && brut.version >= VERSION_COMPTES && Array.isArray(brut.comptes)) return { brut, migre: false };
  const comptes = (brut?.comptes || []).map((c) => ({
    ...c,
    fournisseur: c.fournisseur && FOURNISSEURS[c.fournisseur] ? c.fournisseur : 'claude',
    acces: c.acces === 'cle' || c.acces === 'abonnement' ? c.acces : c.cleApi ? 'cle' : 'abonnement',
  }));
  return { brut: { version: VERSION_COMPTES, defaut: brut?.defaut ?? comptes[0]?.id ?? null, comptes }, migre: true };
}

export function chargerComptes() {
  let brut;
  try {
    brut = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  } catch {
    brut = { version: VERSION_COMPTES, defaut: null, comptes: [] };
  }
  const { brut: v2, migre } = migrerComptes(brut);
  if (migre) {
    const sauvegarde = FICHIER.replace(/\.json$/, '') + '.v1.json';
    if (fs.existsSync(FICHIER) && !fs.existsSync(sauvegarde)) fs.copyFileSync(FICHIER, sauvegarde);
    ecrireJson(FICHIER, v2);
  }
  return v2;
}

// Le compte demandé, sinon le compte par défaut, sinon le premier ; undefined si la liste est vide.
export function trouverCompte(id) {
  const { defaut, comptes } = chargerComptes();
  return comptes.find((c) => c.id === (id || defaut)) || comptes.find((c) => c.id === defaut) || comptes[0];
}

export const fournisseur = (compte) => fournisseurDe(compte);
export const adaptateur = (compte) => adaptateurDe(compte);

export function dossierConfig(compte) {
  return adaptateurDe(compte).dossierConfig(compte);
}

// Environnement complet du processus de l'agent, propre au fournisseur (CLAUDE_CONFIG_DIR ou CODEX_HOME ;
// clé API seulement pour un compte « clé » ; variables des autres fournisseurs retirées).
export function envPour(compte) {
  return adaptateurDe(compte).envPour(compte);
}

// Connecté ? Claude : fichier .credentials.json (Windows) ou trousseau (Mac). Codex : auth.json. Jamais lus.
export function compteConnecte(compte) {
  if (!compte) return false;
  return adaptateurDe(compte).etatConnexion(compte);
}

// Relecture forcée de l'état de connexion (surveillance d'une connexion en cours, sur Mac).
export async function verifierConnexion(compte) {
  if (!compte) return false;
  return adaptateurDe(compte).verifierConnexion(compte);
}

// Fichier dont la date de modification (jamais le contenu) dit qu'une connexion vient d'aboutir.
export const fichierConnexion = (compte) => adaptateurDe(compte).fichierConnexion(compte);

// ---------------------------------------------------------------- gestion de la liste

const nettoyerNom = (nom) => String(nom || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 40);

/**
 * Ajoute un compte. fournisseur : 'claude' (défaut) ou 'codex'. Identifiant `${fournisseur}${n}` (claude1,
 * codex1…) ; les identifiants existants ne changent jamais. La clé API reste dans config/comptes.json, sur ce PC
 * (jamais publiée, illisible pour les agents).
 */
export function ajouterCompte({ nom = '', configDir = null, cleApi = null, fournisseur = 'claude', agent = null, commande = null, varCle = null } = {}) {
  const f = FOURNISSEURS[fournisseur] ? fournisseur : null;
  if (!f) throw new Error(t('fournisseur inconnu : {fournisseur}', { fournisseur }));
  const ad = FOURNISSEURS[f];
  const brut = chargerComptes();
  const cle = cleApi ? String(cleApi).trim() : null;
  // agent ACP (Grok, Cursor… ou commande personnalisée) : vérifié par l'adaptateur, identifiant grok1, cursor1…
  const choix = ad.agentPourAjout ? ad.agentPourAjout({ agent, commande, varCle }, cle) : {};
  const prefixe = ad.prefixeId ? ad.prefixeId(choix) : f;
  let n = 1;
  while (brut.comptes.some((c) => c.id === `${prefixe}${n}`)) n++;
  const id = `${prefixe}${n}`;
  const dossier = configDir ? path.resolve(configDir) : ad.dossierParDefaut(id, { agent: choix.agent || null, acces: cle ? 'cle' : 'abonnement' });
  if (brut.comptes.some((c) => plateforme.memeChemin(dossierConfig(c), dossier))) {
    throw new Error(t('un compte utilise déjà ce dossier de connexion'));
  }
  if (cle && !ad.FORMAT_CLE.test(cle)) throw new Error(t(ad.ERREUR_CLE));
  const compte = {
    id,
    nom: nettoyerNom(nom) || `${ad.nomParDefaut ? ad.nomParDefaut(choix) : ad.nomCourt} ${n}`,
    fournisseur: f,
    ...choix,
    acces: cle ? 'cle' : 'abonnement',
    configDir: dossier,
    ...(cle ? { cleApi: cle } : {}),
  };
  brut.comptes.push(compte);
  if (!brut.defaut || !brut.comptes.some((c) => c.id === brut.defaut)) brut.defaut = id;
  ecrireJson(FICHIER, brut);
  return compte;
}

export function modifierCompte(id, { nom, defaut } = {}) {
  const brut = chargerComptes();
  const c = brut.comptes.find((x) => x.id === id);
  if (!c) throw new Error(t('compte inconnu'));
  if (nom !== undefined) {
    const propre = nettoyerNom(nom);
    if (!propre) throw new Error(t('nom vide'));
    c.nom = propre;
  }
  if (defaut) brut.defaut = id;
  ecrireJson(FICHIER, brut);
  return c;
}

// Retire le compte de la liste (la liste peut devenir vide). Son dossier de connexion reste sur le disque.
export function supprimerCompte(id) {
  const brut = chargerComptes();
  const i = brut.comptes.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(t('compte inconnu'));
  const [c] = brut.comptes.splice(i, 1);
  if (brut.defaut === id) brut.defaut = brut.comptes[0]?.id ?? null;
  ecrireJson(FICHIER, brut);
  return c;
}

// ---------------------------------------------------------------- connexion

// Ouvre une fenêtre avec la connexion officielle du fournisseur (Claude Code, ou Codex par navigateur ou par
// code d'appareil : mode 'navigateur' | 'code').
export function ouvrirConnexion(id, { mode = 'navigateur' } = {}) {
  const c = trouverCompte(id);
  if (!c || c.id !== id) throw new Error(t('compte inconnu'));
  return adaptateurDe(c).ouvrirConnexion(c, { mode });
}

export function deconnecter(id) {
  const c = trouverCompte(id);
  if (!c || c.id !== id) return Promise.reject(new Error(t('compte inconnu')));
  return adaptateurDe(c).deconnecter(c);
}
