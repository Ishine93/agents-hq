// Étanchéité des agents dont la sandbox lit tout le disque (Codex : `:root` en lecture ; ACP : lectures et
// écritures filtrées par le QG). Ce module liste les dossiers et fichiers personnels qu'aucun agent ne doit
// lire : clés SSH et GPG, identifiants des outils (AWS, Azure, gcloud, GitHub CLI, Docker, npm, git…),
// dossiers de connexion des IA (.claude*, .codex*), profils des navigateurs (cookies, mots de passe
// enregistrés), trousseaux et coffres d'identifiants du système, gestionnaires de mots de passe.
// Les chemins sont des sous-arbres exacts (forme la plus fiable des règles `deny` de Codex). Le QG ne lit
// jamais ces fichiers : il liste seulement les noms du dossier personnel (pour .claude*, .codex*).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sousChemin } from '../plateforme.js';

// Relatifs au dossier personnel, sur toutes les plateformes.
const COMMUNS = [
  '.ssh',
  '.gnupg',
  '.aws',
  '.azure',
  '.kube',
  '.docker',
  '.config/gh',
  '.config/gcloud',
  '.config/hub',
  '.config/git/credentials',
  '.git-credentials',
  '.netrc',
  '_netrc',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.pypirc',
  '.terraform.d',
  '.vault-token',
  '.password-store',
  '.claude',
  '.claude.json',
  '.codex',
  '.claude-qg',
  '.codex-qg',
  '.acp-qg',
  // agents ACP connus (dossiers de connexion par défaut)
  '.grok',
  '.cursor',
  '.copilot',
  '.config/github-copilot',
  '.gemini',
  '.qwen',
  '.kimi',
  '.kimi-code',
  '.vibe',
  '.local/share/opencode',
  '.config/goose',
];

// Windows : dossiers sous %LOCALAPPDATA% et %APPDATA%.
const WINDOWS_LOCAL = [
  'Google/Chrome/User Data',
  'Google/Chrome Beta/User Data',
  'Microsoft/Edge/User Data',
  'BraveSoftware/Brave-Browser/User Data',
  'Chromium/User Data',
  'Vivaldi/User Data',
  'Microsoft/Credentials',
  'Microsoft/Vault',
  '1Password',
  'Packages/Microsoft.MicrosoftEdge_8wekyb3d8bbwe',
];
const WINDOWS_ROAMING = [
  'Mozilla/Firefox',
  'Opera Software',
  'Microsoft/Credentials',
  'Microsoft/Protect',
  'Microsoft/Crypto',
  'Microsoft/SystemCertificates',
  'GitHub CLI',
  'gcloud',
  'Bitwarden',
  'KeePass',
];

// Mac : sous ~/Library.
const MAC = [
  'Keychains',
  'Cookies',
  'Safari',
  'Application Support/Google/Chrome',
  'Application Support/Microsoft Edge',
  'Application Support/BraveSoftware/Brave-Browser',
  'Application Support/Chromium',
  'Application Support/Vivaldi',
  'Application Support/Firefox',
  'Application Support/com.operasoftware.Opera',
  'Application Support/Bitwarden',
  'Application Support/1Password',
  'Group Containers/2BUA8C4S2C.com.1password',
  'Containers/com.apple.Safari',
];

// Linux : sous le dossier personnel.
const LINUX = [
  '.config/google-chrome',
  '.config/microsoft-edge',
  '.config/BraveSoftware',
  '.config/chromium',
  '.config/vivaldi',
  '.config/opera',
  '.config/Bitwarden',
  '.config/1Password',
  '.mozilla',
  '.local/share/keyrings',
  '.local/share/kwalletd',
];

// Noms du dossier personnel qui commencent par .claude ou .codex (autres comptes, copies, sauvegardes).
function dossiersIa(home, lister) {
  try {
    return lister(home).filter((n) => /^\.(claude|codex)/i.test(n));
  } catch {
    return [];
  }
}

/**
 * Chemins absolus fermés aux agents (sous-arbres exacts), pour la plateforme donnée.
 * @param home dossier personnel ; plat 'win32' | 'darwin' | 'linux' ; env (LOCALAPPDATA, APPDATA) ;
 *        lister(dossier) → noms (injectable pour les tests)
 */
export function dossiersSensibles({ home = os.homedir(), plat = process.platform, env = process.env, lister = (d) => fs.readdirSync(d) } = {}) {
  const ch = plat === 'win32' ? path.win32 : path.posix;
  const sous = (base, rel) => ch.join(base, ...rel.split('/'));
  const liste = [...COMMUNS, ...dossiersIa(home, lister)].map((r) => sous(home, r));
  if (plat === 'win32') {
    const local = env.LOCALAPPDATA || sous(home, 'AppData/Local');
    const roaming = env.APPDATA || sous(home, 'AppData/Roaming');
    liste.push(...WINDOWS_LOCAL.map((r) => sous(local, r)), ...WINDOWS_ROAMING.map((r) => sous(roaming, r)));
  } else if (plat === 'darwin') {
    liste.push(...MAC.map((r) => sous(home, `Library/${r}`)));
  } else {
    liste.push(...LINUX.map((r) => sous(home, r)));
  }
  // sans doublons (comparaison selon la casse de la plateforme)
  const vus = new Set();
  return liste.filter((p) => {
    const cle = plat === 'linux' ? p : p.toLowerCase();
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

/** Un chemin est-il dans un dossier sensible (ou est-il l'un d'eux) ? */
export function cheminSensible(chemin, { liste = null, plat = process.platform, ...opts } = {}) {
  return sousChemin(liste || dossiersSensibles({ plat, ...opts }), chemin, plat);
}
