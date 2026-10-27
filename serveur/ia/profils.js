// Profils de permissions du QG → sandbox de chaque fournisseur (docs/multi-ia/conception.md §4).
// Règle : une correspondance n'est valable que si chaque invariant du profil est appliqué ; sinon le profil
// est « restreint » (capacités en moins) ou « refusé ». On n'élargit jamais.
import os from 'node:os';
import path from 'node:path';
import { RACINE, REGLAGES } from '../config.js';
import { chargerComptes } from '../comptes.js';
import { dossiersSensibles } from './codex-etancheite.js';

export const PROFILS = ['lecture', 'lecture+tests', 'verif', 'edition', 'edition+tests', 'ops'];
export const PROFILS_LECTURE = new Set(['lecture', 'lecture+tests', 'verif']);
export const PROFILS_ECRITURE = new Set(['edition', 'edition+tests', 'ops']);

/**
 * Ce que le fournisseur garantit pour un profil, selon les réglages : { statut: 'garanti'|'restreint'|'refuse', motif }.
 * Claude : tout est garanti (profils actuels, inchangés). Codex (codex exec, approval_policy = never) :
 * - ops est refusé (il ne peut pas demander ton accord avant chaque action) ;
 * - en mode prudent, les profils qui écrivent sont refusés (même raison) ;
 * - codex.lectureStricte refuse les profils de lecture (en sandbox lecture seule, Codex lance n'importe quelle
 *   commande, mais sans écrire, sans réseau et sans lire les secrets : écart jugé non élargissant, §4.2) ;
 * - edition et edition+tests sont restreints : écriture sur les dossiers de l'étage seulement, .git en lecture,
 *   réseau coupé, gitAuto et ecritureHorsProjet sans effet.
 * Agents ACP (Grok, Cursor, Copilot…) : aucun bac à sable imposé par le QG ; le QG décide de chaque demande qui
 * passe par lui (permissions, fichiers, terminal : ia/acp-permissions.js). Tous les profils sont donc
 * « restreints », ops est refusé, et le mode prudent refuse les profils qui écrivent.
 */
export function profilGaranti(fournisseur, profil, reglages = REGLAGES) {
  if (!PROFILS.includes(profil)) return { statut: 'refuse', motif: `profil inconnu : ${profil}` };
  if (fournisseur === 'acp') return profilGarantiAcp(profil, reglages);
  if (fournisseur !== 'codex') return { statut: 'garanti', motif: null };
  if (profil === 'ops') return { statut: 'refuse', motif: "Codex ne peut pas demander ton accord action par action (profil ops)" };
  if (reglages.modeTravail === 'prudent' && PROFILS_ECRITURE.has(profil)) return { statut: 'refuse', motif: 'mode prudent : Codex ne sait pas demander ton accord avant chaque action' };
  if (reglages.codex?.lectureStricte === true && PROFILS_LECTURE.has(profil)) return { statut: 'refuse', motif: 'lecture stricte demandée dans les réglages : Codex lancerait des commandes en lecture seule' };
  if (PROFILS_ECRITURE.has(profil)) return { statut: 'restreint', motif: 'écriture limitée aux dossiers de la tâche, .git en lecture, réseau coupé' };
  return { statut: 'garanti', motif: null };
}

function profilGarantiAcp(profil, reglages) {
  if (profil === 'ops') return { statut: 'refuse', motif: "un agent ACP ne peut pas être tenu action par action (profil ops)" };
  if (reglages.modeTravail === 'prudent' && PROFILS_ECRITURE.has(profil)) return { statut: 'refuse', motif: 'mode prudent : un agent ACP peut agir sans demander' };
  return { statut: 'restreint', motif: "garde-fou du QG sur les demandes de l'agent, pas de bac à sable" };
}

// Chemin en barres obliques, forme attendue par la table TOML des permissions Codex.
export const cheminToml = (p) => path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');

/**
 * Table de permissions Codex (profil `qg`) pour une demande : { filesystem: { chemin: 'read'|'write'|'deny' }, network: { enabled } }.
 * Sources identiques à Claude : dossiers de la tâche (cwd + dossiersSup), pièces, dossier du QG, dossiers de
 * connexion de tous les comptes, dossier personnel. Les `deny` portent sur des sous-arbres exacts.
 * `:root` reste en lecture (Codex a besoin des outils du système) : les dossiers personnels sensibles (clés,
 * identifiants, navigateurs, trousseaux, autres comptes d'IA) sont fermés par codex-etancheite.js.
 */
export function profilCodex(profil, { cwd, dossiersSup = [], pieces = null, comptes = null, racine = RACINE, home = os.homedir(), env = process.env } = {}) {
  const ecrit = PROFILS_ECRITURE.has(profil) && profil !== 'ops';
  const fs = {};
  fs[':root'] = 'read';
  if (ecrit) {
    fs[':tmpdir'] = 'write';
    for (const d of [cwd, ...dossiersSup].filter(Boolean)) {
      const c = cheminToml(d);
      fs[c] = 'write';
      fs[`${c}/.git`] = 'read'; // pas de commit, donc pas de push (I4)
    }
    if (pieces) fs[cheminToml(pieces)] = 'write';
  }
  const qg = cheminToml(racine);
  fs[qg] = 'read'; // I3 : le code du QG n'est jamais modifiable, même sous une racine
  fs[`${qg}/config`] = 'deny'; // I2 : réglages, comptes, clés
  fs[`${qg}/runtime/jeton.txt`] = 'deny';
  const liste = comptes || chargerComptes().comptes;
  for (const c of liste) if (c.configDir) fs[cheminToml(c.configDir)] = 'deny';
  const h = cheminToml(home);
  for (const d of ['.claude-qg', '.codex-qg', '.acp-qg']) fs[`${h}/${d}`] = 'deny';
  fs[`${h}/.claude/.credentials.json`] = 'deny';
  fs[`${h}/.codex/auth.json`] = 'deny';
  // clés, identifiants, profils de navigateurs, trousseaux : jamais lisibles, même sous un dossier de la tâche
  for (const p of dossiersSensibles({ home, env })) fs[cheminToml(p)] = 'deny';
  return { filesystem: fs, network: { enabled: false } };
}

// Variables d'environnement retirées des commandes que l'agent lance (shell_environment_policy de Codex).
export const EXCLUSIONS_ENV = ['*KEY*', '*TOKEN*', '*SECRET*', 'OPENAI_*', 'CODEX_*', 'ANTHROPIC_*', 'CLAUDE_*', 'QG_*'];

// ---------------------------------------------------------------- TOML en ligne (valeurs de --config)

const cleToml = (k) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));
export function tomlInline(v) {
  if (v === null || v === undefined) return '""';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(tomlInline).join(', ')}]`;
  return `{ ${Object.entries(v)
    .map(([k, x]) => `${cleToml(k)} = ${tomlInline(x)}`)
    .join(', ')} }`;
}

// Un chemin est-il couvert par une règle « write » de la table (sous un dossier écrivable, hors deny) ?
export function ecrivable(table, chemin) {
  const c = cheminToml(chemin);
  let regle = null;
  let longueur = -1;
  for (const [k, v] of Object.entries(table.filesystem || {})) {
    if (k.startsWith(':')) continue;
    if ((c === k || c.startsWith(k + '/')) && k.length > longueur) {
      longueur = k.length;
      regle = v;
    }
  }
  return regle === 'write';
}
