// Bac à sable de Codex sous Windows (1.0.9). Codex lance les commandes de l'agent dans un bac à sable. Le mode
// ordinaire (sans droits d'administrateur) ne sait pas fermer un dossier en lecture, or le QG ferme toujours les
// secrets (dossiers de connexion, réglages, jeton du site) : Codex refuse alors de démarrer (« windows unelevated
// restricted-token sandbox cannot enforce deny-read restrictions »). Le mode « élevé » sait le faire ; il se
// prépare une fois par compte (dossier CODEX_HOME), en administrateur : Windows demande ton accord.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as plateforme from '../plateforme.js';

export const concerne = (plat = plateforme.PLATEFORME) => plateforme.estWindows(plat);

// Fichier posé par « codex sandbox setup --elevated » dans le dossier du compte.
export const marqueur = (codexHome) => path.join(codexHome, '.sandbox', 'setup_marker.json');

// null (pas Windows), 'pret' ou 'a-preparer'.
export function etat(codexHome, { plat = plateforme.PLATEFORME, existe = fs.existsSync } = {}) {
  if (!concerne(plat)) return null;
  return existe(marqueur(codexHome)) ? 'pret' : 'a-preparer';
}

// Message de Codex quand son bac à sable Windows ne peut pas appliquer la table du QG.
export const ERREUR_BAC_A_SABLE = /windows sandbox|restricted-token sandbox|elevated windows sandbox/i;

// Compte Windows qui fera tourner Codex : celui du QG (pas l'administrateur qui accepte la demande de Windows).
export const utilisateur = (env = process.env) => {
  const nom = env.USERNAME || os.userInfo().username;
  return env.USERDOMAIN ? `${env.USERDOMAIN}\\${nom}` : nom;
};

const citer = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * Script PowerShell lancé en administrateur : une préparation par dossier de compte, puis une pause si l'une
 * d'elles a échoué (pour lire le message avant que la fenêtre se ferme).
 */
export function scriptPreparation({ exe, args = [], homes, user, messages }) {
  const lignes = ["$ErrorActionPreference = 'Continue'", '$echecs = 0'];
  for (const h of homes) {
    lignes.push(`Write-Host ${citer(messages.compte.replace('{dossier}', h))}`);
    lignes.push(`& ${citer(exe)} ${[...args, 'sandbox', 'setup', '--elevated', '--user', user, '--codex-home', h].map(citer).join(' ')}`);
    lignes.push('if ($LASTEXITCODE -ne 0) { $echecs++ }');
  }
  lignes.push(`if ($echecs -gt 0) { Write-Host ''; Write-Host ${citer(messages.echec)}; Read-Host ${citer(messages.fermer)} }`);
  return lignes.join('\n');
}

const encoder = (script) => Buffer.from(script, 'utf16le').toString('base64');

/**
 * Prépare le bac à sable élevé pour ces dossiers de comptes. Windows affiche sa demande d'autorisation ; la
 * promesse se résout quand la fenêtre d'administration se ferme : { ok, refuse, etats: { home: 'pret'|'a-preparer' } }.
 * (lancer : injectable pour les tests)
 */
export function preparer(homes, { commande = plateforme.codexCommande(), messages, lancer = spawn, env = process.env } = {}) {
  if (!concerne()) return Promise.resolve({ ok: true, refuse: false, etats: {} });
  if (!commande.present) return Promise.reject(new Error(messages.absent));
  for (const h of homes) fs.mkdirSync(h, { recursive: true });
  const interieur = scriptPreparation({ exe: commande.exe, args: commande.args, homes, user: utilisateur(env), messages });
  // -EncodedCommand : ni fichier .ps1 ni stratégie d'exécution (bloquée sur certains PC de bureau)
  const exterieur = `Start-Process -FilePath powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile','-EncodedCommand','${encoder(interieur)}'`;
  return new Promise((resolve) => {
    const p = lancer('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoder(exterieur)], { stdio: 'ignore', windowsHide: true });
    const fin = (code) => {
      const etats = Object.fromEntries(homes.map((h) => [h, etat(h)]));
      const ok = Object.values(etats).every((e) => e === 'pret');
      // Start-Process échoue (code 1) quand tu refuses la demande de Windows
      resolve({ ok, refuse: !ok && code !== 0, etats });
    };
    p.on('exit', fin);
    p.on('error', () => fin(1));
  });
}
