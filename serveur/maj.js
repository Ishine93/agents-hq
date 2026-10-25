// Mises à jour : la dernière version publiée sur GitHub, et le lancement de outils/mettre-a-jour.ps1
// (le QG se ferme proprement, le script attend sa fin, met à jour, puis relance le QG).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from './config.js';
import { t } from './i18n.js';

export const DEPOT = 'Ishine93/agents-hq';
// (un éditeur Windows peut avoir ajouté un BOM en tête du fichier : on l'ignore)
const versionLocale = () => JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8').replace(/^﻿/, '')).version;

function comparer(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  return 0;
}

// Copie de travail (dossiers tests/ ou SPEC.md présents) : la mise à jour automatique écraserait des
// changements pas encore publiés, on la refuse.
export const installationDev = () => fs.existsSync(path.join(RACINE, 'tests')) || fs.existsSync(path.join(RACINE, 'SPEC.md'));

let cache = null;
export async function verifierMaj({ forcer = false, delaiMs = 10000 } = {}) {
  if (forcer || !cache || Date.now() - cache.t > 3600 * 1000) {
    const r = await fetch(`https://api.github.com/repos/${DEPOT}/releases/latest`, {
      headers: { 'User-Agent': 'QG-des-agents', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(delaiMs),
    }).catch(() => null);
    if (!r) throw new Error(t('GitHub est injoignable : vérifie ta connexion Internet.'));
    if (!r.ok) throw new Error(t('GitHub ne répond pas ({code}).', { code: r.status }));
    const j = await r.json();
    cache = {
      t: Date.now(),
      r: {
        derniere: String(j.tag_name || '').replace(/^v/, ''),
        notes: String(j.body || ''),
        url: j.html_url || `https://github.com/${DEPOT}/releases`,
        publieLe: j.published_at || null,
        zip: (j.assets || []).some((a) => a.name.endsWith('.zip')),
      },
    };
  }
  const actuelle = versionLocale();
  return { ...cache.r, actuelle, disponible: cache.r.zip && comparer(cache.r.derniere, actuelle) > 0, dev: installationDev(), depot: DEPOT };
}

/**
 * Lance la mise à jour dans une fenêtre à part, puis ferme le QG (arreter) pour qu'elle puisse remplacer les fichiers.
 * ouvrir : à la relance, ouvrir le site dans le navigateur (mise à jour au lancement : il n'est pas encore ouvert).
 */
export function lancerMaj(arreter, { ouvrir = false, delaiMs = 1500 } = {}) {
  if (installationDev()) throw new Error(t('Installation de développement : la mise à jour automatique est désactivée ici.'));
  const ps1 = path.join(RACINE, 'outils', 'mettre-a-jour.ps1');
  const ligne = `start "Mise a jour du QG" powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}" -AttendrePid ${process.pid} -Relancer${ouvrir ? ' -Ouvrir' : ''}`;
  spawn('cmd.exe', ['/d', '/c', ligne], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true, cwd: RACINE }).unref();
  setTimeout(arreter, delaiMs);
}

// Code de sortie qui dit à lancer.bat « mise à jour en cours, ferme ta fenêtre » (la mise à jour relance le QG).
export const CODE_MISE_A_JOUR = 42;

/**
 * Au lancement : si une version plus récente est publiée (et que la mise à jour automatique n'est pas coupée),
 * on la lance et on s'arrête avant d'avoir démarré quoi que ce soit. Hors ligne : on démarre normalement.
 * @returns true si le QG doit s'arrêter pour se mettre à jour
 */
export async function majAuLancement(reglages) {
  if (reglages.miseAJourAuto === false || installationDev()) return false;
  let m;
  try {
    m = await verifierMaj({ forcer: true, delaiMs: 5000 });
  } catch {
    return false;
  }
  if (!m.disponible) return false;
  console.log(t('Nouvelle version {version} disponible (tu as la {actuelle}) : mise à jour automatique, le QG se relance tout seul.', { version: m.derniere, actuelle: m.actuelle }));
  lancerMaj(() => process.exit(CODE_MISE_A_JOUR), { ouvrir: true, delaiMs: 300 });
  return true;
}
