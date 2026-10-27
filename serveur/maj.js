// Mises à jour : la dernière version publiée sur GitHub, et le lancement de outils/mettre-a-jour.ps1
// (outils/mettre-a-jour.sh sur Mac) : le QG se ferme proprement, le script attend sa fin, met à jour,
// puis relance le QG.
import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from './config.js';
import * as plateforme from './plateforme.js';
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

// Sans l'API : la page « dernière version » redirige vers celle de sa version (…/releases/tag/v1.0.5) et le
// zip a une adresse connue. Sert quand l'API refuse (403 : 60 demandes par heure et par connexion, vite
// atteintes sur une connexion partagée, 4G, VPN…) ; on n'a alors pas les notes.
async function derniereSansApi(delaiMs) {
  const opts = { method: 'HEAD', headers: { 'User-Agent': 'QG-des-agents' }, signal: AbortSignal.timeout(delaiMs) };
  const r = await fetch(`https://github.com/${DEPOT}/releases/latest`, opts).catch(() => null);
  const m = r && r.ok && r.url.match(/\/releases\/tag\/v?([\w.-]+)$/);
  if (!m) return null;
  const zip = await fetch(`https://github.com/${DEPOT}/releases/download/v${m[1]}/QG-des-agents-${m[1]}.zip`, { ...opts, signal: AbortSignal.timeout(delaiMs) }).catch(() => null);
  return { derniere: m[1], notes: '', url: r.url, publieLe: null, zip: !!zip && zip.ok };
}

let cache = null;
export async function verifierMaj({ forcer = false, delaiMs = 10000 } = {}) {
  if (forcer || !cache || Date.now() - cache.t > 3600 * 1000) {
    // QG_MAJ_SANS_API (tests) : comme si l'API refusait
    const r = process.env.QG_MAJ_SANS_API ? null : await fetch(`https://api.github.com/repos/${DEPOT}/releases/latest`, {
      headers: { 'User-Agent': 'QG-des-agents', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(delaiMs),
    }).catch(() => null);
    let info = null;
    if (r && r.ok) {
      const j = await r.json();
      info = {
        derniere: String(j.tag_name || '').replace(/^v/, ''),
        notes: String(j.body || ''),
        url: j.html_url || `https://github.com/${DEPOT}/releases`,
        publieLe: j.published_at || null,
        zip: (j.assets || []).some((a) => a.name.endsWith('.zip')),
      };
    } else info = await derniereSansApi(delaiMs);
    if (!info) {
      if (!r) throw new Error(t('GitHub est injoignable : vérifie ta connexion Internet.'));
      if (r.status === 403 || r.status === 429) throw new Error(t('GitHub limite les vérifications depuis ta connexion ({code}) : réessaie dans une heure.', { code: r.status }));
      throw new Error(t('GitHub ne répond pas ({code}).', { code: r.status }));
    }
    cache = { t: Date.now(), r: info };
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
  plateforme.lancerMiseAJour({ pid: process.pid, ouvrir });
  setTimeout(arreter, delaiMs);
}

// Code de sortie qui dit à lancer.bat (lancer.command) « mise à jour en cours, ferme ta fenêtre » (la mise à jour relance le QG).
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
