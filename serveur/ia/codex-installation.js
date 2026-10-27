// Installation de Codex à la demande (Réglages › Comptes IA, au moment d'ajouter un compte Codex).
// Codex n'est pas dans les dépendances livrées du QG : le bouton installe la version épinglée de
// @openai/codex dans runtime/codex (dossier du QG, hors node_modules), avec le npm du Node portable.
// L'état (absent, installation, installé, erreur) et les dernières lignes de npm sont publiés au site.
// QG_CODEX_INSTALLATION (tests) : un script Node qui remplace npm (même arguments, aucun téléchargement).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as plateforme from '../plateforme.js';

export const VERSION_CODEX = '0.164.0';
export const PAQUET_CODEX = `@openai/codex@${VERSION_CODEX}`;
const LIGNES_MAX = 12;
const DELAI_MS = 15 * 60 * 1000;

let etat = { etat: null, version: VERSION_CODEX, lignes: [], erreur: null, debut: null, fin: null, dossier: null };
let enCours = null;

/** Commande npm : { exe, args } (args avant « install … »). */
export function commandeNpm({ env = process.env, plat = plateforme.PLATEFORME, existe = fs.existsSync } = {}) {
  if (env.QG_CODEX_INSTALLATION) return { exe: process.execPath, args: [env.QG_CODEX_INSTALLATION] };
  const cli = plateforme.npmCli(plat);
  if (existe(cli)) return { exe: plateforme.nodeOuCourant(plat), args: [cli] };
  // copie de développement : le npm livré avec le Node qui fait tourner le QG
  const voisin = plateforme.estWindows(plat)
    ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existe(voisin)) return { exe: process.execPath, args: [voisin] };
  return null;
}

/** Arguments npm de l'installation (épinglée, sans audit, sans scripts d'autres paquets que ceux de Codex). */
export const argumentsInstallation = (dossier = plateforme.codexRuntime()) => ['install', '--prefix', dossier, PAQUET_CODEX, '--save-exact', '--no-audit', '--no-fund', '--no-update-notifier', '--loglevel', 'http'];

/** État public : { etat: 'absent'|'installation'|'installe'|'erreur', version, lignes, erreur, present }. */
export function etatInstallation() {
  const dossier = etat.dossier || plateforme.codexRuntime();
  const present = plateforme.codexCommande().present || fs.existsSync(plateforme.codexLanceurRuntime(dossier));
  const e = etat.etat === 'installation' || etat.etat === 'erreur' ? etat.etat : present ? 'installe' : 'absent';
  return { etat: e, version: VERSION_CODEX, lignes: [...etat.lignes], erreur: etat.erreur, present, dossier };
}

/**
 * Installe Codex dans runtime/codex. Une seule installation à la fois (un 2e appel reçoit la même promesse).
 * @param commande  { exe, args } qui remplace npm (tests) ; par défaut commandeNpm()
 * @param surEtat   rappelé à chaque changement (état public)
 * @returns Promise<état public final>
 */
export function installerCodex({ commande = commandeNpm(), dossier = plateforme.codexRuntime(), surEtat = () => {}, delaiMs = DELAI_MS } = {}) {
  if (enCours) return enCours;
  const publier = () => {
    try {
      surEtat(etatInstallation());
    } catch {
      /* un abonné en erreur n'arrête pas l'installation */
    }
  };
  etat = { etat: 'installation', version: VERSION_CODEX, lignes: [], erreur: null, debut: Date.now(), fin: null, dossier };
  const echouer = (message) => {
    etat = { ...etat, etat: 'erreur', erreur: message, fin: Date.now() };
    publier();
    return etatInstallation();
  };
  publier();
  enCours = new Promise((resolve) => {
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
      p = spawn(commande.exe, [...commande.args, ...argumentsInstallation(dossier)], {
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
      etat.lignes = [...etat.lignes, ...utiles.map((l) => l.slice(0, 300))].slice(-LIGNES_MAX);
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
      if (reste.trim()) etat.lignes = [...etat.lignes, reste.trim().slice(0, 300)].slice(-LIGNES_MAX);
      if (code !== 0) {
        const derniere = [...etat.lignes].reverse().find((l) => /err/i.test(l)) || etat.lignes.at(-1) || '';
        resolve(echouer(signal ? `installation arrêtée (${signal}, délai dépassé ?)` : `npm a échoué (code ${code})${derniere ? ` : ${derniere}` : ''}`));
        return;
      }
      if (!fs.existsSync(plateforme.codexLanceurRuntime(dossier))) {
        resolve(echouer('npm a terminé, mais le lanceur de Codex est introuvable dans runtime/codex.'));
        return;
      }
      etat = { ...etat, etat: null, erreur: null, fin: Date.now() };
      publier();
      resolve(etatInstallation());
    });
  }).finally(() => {
    enCours = null;
  });
  return enCours;
}

// Tests : remet l'état à zéro.
export function reinitialiserInstallation() {
  etat = { etat: null, version: VERSION_CODEX, lignes: [], erreur: null, debut: null, fin: null, dossier: null };
}
