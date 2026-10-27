import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Économie de tokens (1.0.6) : variables d'environnement par session, selon le rôle et le compte.
// Rien ici ne touche au modèle ni à l'effort des tâches ou du DG.

// Seuil de compaction automatique (tokens de contexte) : niveau « Max » par défaut (lot A2).
export const COMPACTION_PAR_DEFAUT = { tache: 400000, verif: 300000, dg: 300000 };

// Rôles qui attendent parfois l'utilisateur longtemps (mcp__qg__demander) : cache d'une heure pour les clés API (A7).
const ROLES_CACHE_LONG = new Set(['tache', 'dg']);

/**
 * Variables à poser pour une session Claude, fusionnées après envPour() (A1).
 * @param role  le rôle de conso (tache, verif, dg, question…)
 * @param compte  le compte résolu (ou null)
 * @param compaction  seuil propre (profil du lot B) ; sinon la valeur par défaut du rôle
 */
export function envSessionPour(role, compte = null, { compaction = null } = {}) {
  const env = {};
  const seuil = compaction || COMPACTION_PAR_DEFAUT[role];
  if (seuil) env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(seuil);
  // Abonnement : la conversation principale a déjà 1 h de cache ; on ne change rien.
  if (compte?.cleApi && ROLES_CACHE_LONG.has(role)) env.CLAUDE_CODE_PROMPT_CACHE_TTL = '1h';
  return env;
}

// B6 : plafond par tâche = facteur du profil × estimation (lot C), plancher 0,50 $ ; null si pas de facteur ou d'estimation.
// Les totaux restaurés à la reprise ne comptent pas : le SDK repart de zéro avec ce plafond.
export const PLANCHER_PLAFOND_USD = 0.5;
export function plafondTache(profil, estimationUsd) {
  const f = profil?.plafondTacheFacteur;
  if (typeof f !== 'number' || !(f > 0) || typeof estimationUsd !== 'number' || !(estimationUsd > 0)) return null;
  return Math.max(PLANCHER_PLAFOND_USD, Math.round(f * estimationUsd * 100) / 100);
}

// A9 : seuls les « bloquant » justifient une correction. Un rework sans aucun bloquant vaut pass,
// avec les remarques mineures gardées pour le résultat.
export function verdictEffectif(verdict) {
  if (verdict?.verdict !== 'rework') return verdict;
  const issues = verdict.issues || [];
  if (issues.some((i) => i.gravite === 'bloquant')) return verdict;
  return { ...verdict, verdict: 'pass', reworkSansBloquant: true };
}

// A3 : reprendre la session du vérificateur seulement si son cache est encore chaud.
export const REPRISE_VERIF_MS = 55 * 60 * 1000;
export function repriseVerif(x, maintenant = Date.now()) {
  return x?.verifSession && maintenant - (x.verifFin || 0) < REPRISE_VERIF_MS ? x.verifSession : null;
}

// Lance avec reprise, puis repli sur une session neuve si la reprise échoue
// (sauf compte déconnecté, limite atteinte ou arrêt demandé : une session neuve échouerait pareil).
export async function avecReprise(lancer, resume, signal = null) {
  if (resume) {
    const r = await lancer(resume);
    const definitif = r.erreur === 'authentication_failed' || r.erreur === 'billing_error' || r.limite || signal?.aborted;
    if (!r.echec || definitif) return r;
  }
  return lancer(null);
}

// A8 : coût fixe d'une session, mesuré une fois par rôle et par démarrage du serveur.
// detail 'summary' : estimations locales, sans appel de comptage en plus.
const DOSSIER_LOGS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'runtime', 'logs');
const rolesMesures = new Set();
export async function mesurerContexteFixe(q, role, modele, dossier = DOSSIER_LOGS) {
  if (!role || rolesMesures.has(role) || typeof q?.getContextUsage !== 'function') return null;
  rolesMesures.add(role);
  try {
    const u = await q.getContextUsage({ detail: 'summary' });
    const mesure = {
      date: new Date().toISOString(),
      modele: modele || null,
      total: u.totalTokens,
      max: u.maxTokens,
      postes: (u.categories || []).filter((c) => c.tokens > 0).map((c) => ({ nom: c.name, tokens: c.tokens })),
    };
    fs.mkdirSync(dossier, { recursive: true });
    const fichier = path.join(dossier, 'contexte-fixe.json');
    let tout = {};
    try { tout = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch {}
    tout[role] = mesure;
    fs.writeFileSync(fichier, JSON.stringify(tout, null, 2));
    return mesure;
  } catch {
    return null; // mesure facultative : jamais d'échec de session pour ça
  }
}

// A11 : seules les commandes de test reconnues, sans tube ni redirection ni enchaînement, sont réécrites.
const COMMANDE_TEST = /^\s*(node\s+(--[\w-]+\s+)*--test\b|npm\s+(run\s+)?test\b|npx\s+vitest\b|selene\b|rojo\s+build\b)/;
const FILTRE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'outils', 'filtre-tests.mjs').replace(/\\/g, '/');
export function commandeFiltree(commande, filtre = FILTRE) {
  if (typeof commande !== 'string' || !COMMANDE_TEST.test(commande)) return null;
  if (/[|<>;&`\n]|\$\(/.test(commande)) return null;
  return `set -o pipefail; { ${commande.trim()} ; } 2>&1 | node "${filtre}"`;
}
// Commande de test reconnue (mêmes conditions que commandeFiltree) : terminal du QG des agents ACP.
export const estCommandeTest = (commande) => commandeFiltree(commande) != null;

// Crochet PreToolUse (option hooks du SDK) pour les producteurs.
export function crochetsFiltreTests() {
  return {
    PreToolUse: [{
      matcher: 'Bash',
      hooks: [async (entree) => {
        const nouvelle = commandeFiltree(entree?.tool_input?.command);
        if (!nouvelle) return { continue: true };
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...entree.tool_input, command: nouvelle } } };
      }],
    }],
  };
}
