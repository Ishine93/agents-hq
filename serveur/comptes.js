// Comptes Claude : chaque compte = un dossier de config Claude Code (CLAUDE_CONFIG_DIR)
// qui contient sa propre connexion. Le serveur ne lit, ne copie ni ne stocke aucun jeton.
// Autant de comptes que tu veux : ajout, renommage et connexion depuis le site ou ajouter-un-compte.bat.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RACINE, NODE_DIR, ecrireJson } from './config.js';
import { t } from './i18n.js';

const FICHIER = path.join(RACINE, 'config', 'comptes.json');
export const CLAUDE_EXE = path.join(RACINE, 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64', 'claude.exe');

export function chargerComptes() {
  return JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
}

export function trouverCompte(id) {
  const { defaut, comptes } = chargerComptes();
  return comptes.find((c) => c.id === (id || defaut)) || comptes.find((c) => c.id === defaut) || comptes[0];
}

export function dossierConfig(compte) {
  return compte.configDir || path.join(os.homedir(), '.claude');
}

// Les sessions héritent sinon des variables de l'app desktop (jeton hôte, proxy, ids de session),
// ce qui les ferait tourner avec l'authentification de l'app au lieu de celle du compte choisi.
// On retire donc tout ce qui commence par CLAUDE ou ANTHROPIC, y compris ANTHROPIC_API_KEY
// (facturation au token) puis on pose uniquement le dossier de config du compte.
export function envPour(compte) {
  const env = {};
  for (const [cle, val] of Object.entries(process.env)) {
    if (/^(CLAUDE|ANTHROPIC)/i.test(cle)) continue;
    env[cle] = val;
  }
  if (compte?.configDir) env.CLAUDE_CONFIG_DIR = compte.configDir;
  // Compte « clé API » : facturé au token par Anthropic, sans connexion par navigateur.
  if (compte?.cleApi) env.ANTHROPIC_API_KEY = compte.cleApi;
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'qg-agents/1.0';
  return env;
}

export function compteConnecte(compte) {
  return !!compte && (!!compte.cleApi || fs.existsSync(path.join(dossierConfig(compte), '.credentials.json')));
}

// ---------------------------------------------------------------- gestion de la liste

const nettoyerNom = (nom) => String(nom || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 40);

export function ajouterCompte({ nom = '', configDir = null, cleApi = null } = {}) {
  const brut = chargerComptes();
  let n = 1;
  while (brut.comptes.some((c) => c.id === `claude${n}`)) n++;
  const id = `claude${n}`;
  const dossier = configDir ? path.resolve(configDir) : path.join(os.homedir(), '.claude-qg', id);
  if (brut.comptes.some((c) => path.resolve(dossierConfig(c)).toLowerCase() === dossier.toLowerCase())) {
    throw new Error(t('un compte utilise déjà ce dossier de connexion'));
  }
  const cle = cleApi ? String(cleApi).trim() : null;
  if (cle && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(cle)) throw new Error(t('clé API invalide (elle commence par sk-ant-)'));
  // La clé reste dans config/comptes.json, sur ce PC (jamais publiée, illisible pour les agents).
  const compte = { id, nom: nettoyerNom(nom) || `Claude ${n}`, configDir: dossier, ...(cle ? { cleApi: cle } : {}) };
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

// Retire le compte de la liste. Son dossier de connexion reste sur le disque (rien n'est effacé).
export function supprimerCompte(id) {
  const brut = chargerComptes();
  if (brut.comptes.length <= 1) throw new Error(t('il faut garder au moins un compte'));
  const i = brut.comptes.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(t('compte inconnu'));
  const [c] = brut.comptes.splice(i, 1);
  if (brut.defaut === id) brut.defaut = brut.comptes[0].id;
  ecrireJson(FICHIER, brut);
  return c;
}

// ---------------------------------------------------------------- connexion

// Ouvre une fenêtre avec la connexion officielle de Claude Code (page de connexion dans le navigateur).
export function ouvrirConnexion(id) {
  const c = trouverCompte(id);
  if (!c || c.id !== id) throw new Error(t('compte inconnu'));
  if (!fs.existsSync(CLAUDE_EXE)) throw new Error(t('Claude Code introuvable : relance installer.bat'));
  fs.mkdirSync(dossierConfig(c), { recursive: true });
  const node = path.join(NODE_DIR, 'node.exe');
  const script = path.join(RACINE, 'serveur', 'connexion.js');
  const ligne = `start "Connexion" "${fs.existsSync(node) ? node : process.execPath}" "${script}" ${c.id} login --pause`;
  spawn('cmd.exe', ['/d', '/c', ligne], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
  return c;
}

export function deconnecter(id) {
  const c = trouverCompte(id);
  if (!c || c.id !== id) return Promise.reject(new Error(t('compte inconnu')));
  return new Promise((resolve) => {
    const p = spawn(CLAUDE_EXE, ['auth', 'logout'], { env: envPour(c), stdio: 'ignore', windowsHide: true });
    p.on('exit', () => resolve(!compteConnecte(c)));
    p.on('error', () => resolve(false));
  });
}
