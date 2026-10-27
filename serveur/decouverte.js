// Découverte sans tokens : on démarre une session en mode streaming SANS lui envoyer de message,
// on interroge les modèles disponibles et les serveurs MCP visibles par le compte, puis on la ferme.
// Aucun appel au modèle n'a lieu.
import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { RACINE } from './config.js';
import { trouverCompte, envPour, fournisseur as fournisseurDuCompte, adaptateur as adaptateurDuCompte } from './comptes.js';
import { lireAppServer, modelesDe } from './ia/codex-app-server.js';

const CACHE = path.join(RACINE, 'runtime', 'decouverte');

// Nom du serveur tel qu'il apparaît dans les noms d'outils : mcp__<nom normalisé>__<outil>
export const prefixeOutils = (nom) => `mcp__${nom.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

// Codex : forfait, e-mail et modèles par `codex app-server` (account/read, model/list), sans tokens.
// Si le protocole ne répond pas, la liste des équivalences sert de modèles.
async function decouvrirCodex(compte, cwd) {
  const r = await lireAppServer({ env: envPour(compte), cwd, methodes: ['account/read', 'model/list'] });
  const c = r['account/read'] || {};
  const compteInfo = c.account || c;
  const resultat = {
    compte: compte.id,
    date: Date.now(),
    fournisseur: 'codex',
    abonnement: compte.cleApi ? 'API' : compteInfo.planType || compteInfo.plan_type || compteInfo.plan || null,
    email: compteInfo.email || null,
    organisation: compteInfo.organization || null,
    modeles: modelesDe(r['model/list']) || adaptateurDuCompte(compte).modeles(compte),
    mcp: [],
    erreur: r.erreur || null,
  };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(path.join(CACHE, `${compte.id}.json`), JSON.stringify(resultat, null, 2));
  return resultat;
}

// Agent ACP : initialize + session/new sans message (modèles, efforts, modes, reprise), par l'adaptateur.
async function decouvrirAcp(compte, cwd) {
  const resultat = await adaptateurDuCompte(compte).decouvrir(compte, { cwd });
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(path.join(CACHE, `${compte.id}.json`), JSON.stringify(resultat, null, 2));
  return resultat;
}

export async function decouvrir(compteId, { cwd = path.join(RACINE, 'runtime'), attenteMcpMs = 25000 } = {}) {
  const compte = trouverCompte(compteId);
  if (!compte) throw new Error('compte inconnu');
  if (fournisseurDuCompte(compte) === 'codex') return decouvrirCodex(compte, cwd);
  if (fournisseurDuCompte(compte) === 'acp') return decouvrirAcp(compte, cwd);
  let liberer;
  const silence = new Promise((r) => (liberer = r));
  async function* aucunMessage() {
    await silence;
  }
  const q = query({
    prompt: aucunMessage(),
    options: { cwd, env: envPour(compte), settingSources: [], model: 'haiku', maxTurns: 1, permissionMode: 'dontAsk', tools: [] },
  });
  const lecture = (async () => {
    try {
      for await (const _ of q) {
        /* on ignore le flux */
      }
    } catch {
      /* fermeture */
    }
  })();
  try {
    const [modeles, compteInfo] = await Promise.all([q.supportedModels(), q.accountInfo().catch(() => null)]);
    // Les connecteurs claude.ai arrivent en différé : on attend que la liste soit stable 4 s
    // de suite et qu'aucun serveur ne soit encore « pending ».
    let mcp = await q.mcpServerStatus();
    let signature = '';
    let stableDepuis = Date.now();
    const fin = Date.now() + attenteMcpMs;
    while (Date.now() < fin) {
      await new Promise((r) => setTimeout(r, 1000));
      mcp = await q.mcpServerStatus();
      const s = mcp.map((x) => `${x.name}:${x.status}`).join('|');
      if (s !== signature) {
        signature = s;
        stableDepuis = Date.now();
      } else if (Date.now() - stableDepuis >= 4000 && !mcp.some((x) => x.status === 'pending')) break;
    }
    const resultat = {
      compte: compte.id,
      date: Date.now(),
      abonnement: compteInfo?.subscriptionType || null,
      email: compteInfo?.email || null,
      organisation: compteInfo?.organization || null,
      modeles: modeles.map((m) => ({ id: m.value, nom: m.displayName, description: m.description, modeleResolu: m.resolvedModel || null, efforts: m.supportedEffortLevels || [] })),
      mcp: mcp.map((s) => ({ nom: s.name, statut: s.status, source: s.source || s.scope || null, prefixe: prefixeOutils(s.name), outils: (s.tools || []).map((t) => t.name) })),
    };
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(path.join(CACHE, `${compte.id}.json`), JSON.stringify(resultat, null, 2));
    return resultat;
  } finally {
    liberer();
    q.close();
    await Promise.race([lecture, new Promise((r) => setTimeout(r, 3000))]);
  }
}

export function decouverteEnCache(compteId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CACHE, `${compteId}.json`), 'utf8'));
  } catch {
    return null;
  }
}

// Lancement direct : node serveur/decouverte.js claude1
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(RACINE, 'serveur', 'decouverte.js')) {
  const r = await decouvrir(process.argv[2] || 'claude1');
  console.log(JSON.stringify({ ...r, mcp: r.mcp.map((s) => ({ ...s, outils: s.outils.length })) }, null, 2));
  process.exit(0);
}
