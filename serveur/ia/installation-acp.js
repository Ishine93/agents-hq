// Installation d'un agent ACP à la demande (1.0.8, Réglages › Comptes IA › prérequis), quand l'agent est
// publié sur npm : la version épinglée dans config/defauts/agents-acp.json (installer.npm) s'installe dans
// runtime/acp/<agent> (dossier du QG), avec le npm du Node portable : rien d'installé ailleurs sur le PC,
// pas de droits administrateur, pas de PATH à modifier. Même principe que Codex (codex-installation.js).
// L'état (absent, installation, installé, erreur) et les dernières lignes de npm sont publiés au site.
// QG_ACP_INSTALLATION (tests) : un script Node qui remplace npm (mêmes arguments, aucun téléchargement).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as plateforme from '../plateforme.js';
import { commandeNpm as npmDuQg } from './codex-installation.js';

const LIGNES_MAX = 12;
const DELAI_MS = 15 * 60 * 1000;

const etats = new Map(); // agent → { etat, lignes, erreur, debut, fin }
const enCours = new Map(); // agent → promesse

export const dossierAgent = (id) => path.join(plateforme.RACINE, 'runtime', 'acp', id);

/** Commande npm : celle des tests, sinon le npm du QG. */
export function commandeNpm({ env = process.env } = {}) {
  if (env.QG_ACP_INSTALLATION) return { exe: process.execPath, args: [env.QG_ACP_INSTALLATION] };
  return npmDuQg({ env: { ...env, QG_CODEX_INSTALLATION: '' } });
}

/** Arguments npm : version épinglée, sans audit. */
export const argumentsInstallation = (npm, dossier) => ['install', '--prefix', dossier, `${npm.paquet}@${npm.version}`, '--save-exact', '--no-audit', '--no-fund', '--no-update-notifier', '--loglevel', 'http'];

/**
 * Fichier JavaScript du binaire installé dans runtime/acp/<agent> (lu dans le package.json du paquet), ou null.
 * Lancé par le Node du QG : pas besoin des petits scripts .cmd de npm, ni de Node dans le PATH.
 */
export function lanceurInstalle(id, npm, { dossier = dossierAgent(id), existe = fs.existsSync, lire = (f) => fs.readFileSync(f, 'utf8') } = {}) {
  if (!npm?.paquet) return null;
  const racinePaquet = path.join(dossier, 'node_modules', ...npm.paquet.split('/'));
  let bin = null;
  try {
    const pj = JSON.parse(lire(path.join(racinePaquet, 'package.json')));
    bin = typeof pj.bin === 'string' ? pj.bin : pj.bin?.[npm.bin] || Object.values(pj.bin || {})[0] || null;
  } catch {
    return null;
  }
  if (!bin) return null;
  const f = path.join(racinePaquet, bin);
  return existe(f) ? f : null;
}

/**
 * Le binaire installé est-il un script Node (lancé par le Node du QG) ? Sinon c'est un programme natif, lancé tel
 * quel (Grok sur Mac remplace son script par le programme natif à l'installation ; OpenCode est natif partout).
 */
export function scriptNode(fichier, { lire = (f) => fs.readFileSync(f) } = {}) {
  if (/\.(m?js|cjs)$/i.test(fichier)) return true;
  try {
    const debut = lire(fichier).subarray(0, 128).toString('utf8');
    return /^#!.*\bnode\b/.test(debut);
  } catch {
    return false;
  }
}

/** État public d'un agent : { etat: 'absent'|'installation'|'installe'|'erreur', version, lignes, erreur }. */
export function etatInstallation(id, npm) {
  const e = etats.get(id) || {};
  const installe = !!lanceurInstalle(id, npm);
  const etat = e.etat === 'installation' || e.etat === 'erreur' ? e.etat : installe ? 'installe' : 'absent';
  return { agent: id, etat, version: npm?.version || null, lignes: [...(e.lignes || [])], erreur: e.erreur || null };
}

/**
 * Installe le paquet npm d'un agent dans runtime/acp/<agent>. Une seule installation à la fois par agent.
 * @returns Promise<état public final>
 */
export function installerAgent(id, npm, { commande = commandeNpm(), dossier = dossierAgent(id), surEtat = () => {}, delaiMs = DELAI_MS } = {}) {
  if (enCours.has(id)) return enCours.get(id);
  const publier = () => {
    try {
      surEtat(etatInstallation(id, npm));
    } catch {
      /* un abonné en erreur n'arrête pas l'installation */
    }
  };
  etats.set(id, { etat: 'installation', lignes: [], erreur: null, debut: Date.now(), fin: null });
  const echouer = (message) => {
    etats.set(id, { ...etats.get(id), etat: 'erreur', erreur: message, fin: Date.now() });
    publier();
    return etatInstallation(id, npm);
  };
  publier();
  const promesse = new Promise((resolve) => {
    if (!npm?.paquet || !npm?.version) {
      resolve(echouer('pas de paquet npm pour cet agent'));
      return;
    }
    if (!commande) {
      resolve(echouer('npm introuvable : le Node portable du QG est incomplet (réinstalle le QG).'));
      return;
    }
    try {
      fs.mkdirSync(dossier, { recursive: true });
    } catch (e) {
      resolve(echouer(`dossier ${dossier} impossible à créer : ${e.message}`));
      return;
    }
    let p;
    try {
      p = spawn(commande.exe, [...commande.args, ...argumentsInstallation(npm, dossier)], {
        cwd: dossier,
        env: { ...process.env, npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (e) {
      resolve(echouer(`npm n'a pas pu démarrer : ${e.message}`));
      return;
    }
    const minuterie = setTimeout(() => {
      try {
        p.kill();
      } catch {
        /* déjà terminé */
      }
    }, delaiMs);
    minuterie.unref?.();
    let reste = '';
    const lire = (morceau) => {
      reste += morceau.toString('utf8');
      const lignes = reste.split(/\r?\n/);
      reste = lignes.pop();
      const utiles = lignes.map((l) => l.trim()).filter(Boolean);
      if (!utiles.length) return;
      const e = etats.get(id);
      e.lignes = [...e.lignes, ...utiles.map((l) => l.slice(0, 300))].slice(-LIGNES_MAX);
      publier();
    };
    p.stdout.on('data', lire);
    p.stderr.on('data', lire);
    p.on('error', (e) => {
      clearTimeout(minuterie);
      resolve(echouer(`npm n'a pas pu démarrer : ${e.message}`));
    });
    p.on('close', (code, signal) => {
      clearTimeout(minuterie);
      const e = etats.get(id);
      if (reste.trim()) e.lignes = [...e.lignes, reste.trim().slice(0, 300)].slice(-LIGNES_MAX);
      if (code !== 0) {
        const derniere = [...e.lignes].reverse().find((l) => /err/i.test(l)) || e.lignes.at(-1) || '';
        resolve(echouer(signal ? `installation arrêtée (${signal}, délai dépassé ?)` : `npm a échoué (code ${code})${derniere ? ` : ${derniere}` : ''}`));
        return;
      }
      if (!lanceurInstalle(id, npm, { dossier })) {
        resolve(echouer(`npm a terminé, mais le programme de ${npm.paquet} est introuvable dans runtime/acp/${id}.`));
        return;
      }
      etats.set(id, { ...e, etat: null, erreur: null, fin: Date.now() });
      publier();
      resolve(etatInstallation(id, npm));
    });
  }).finally(() => {
    enCours.delete(id);
  });
  enCours.set(id, promesse);
  return promesse;
}

// Tests : remet les états à zéro.
export function reinitialiserInstallations() {
  etats.clear();
}
