// MCP activables à la volée, par compte (connecteurs claude.ai, MCP utilisateur) et par étage
// (.mcp.json du projet). Trois modes : off, demander (chaque appel lève la main), auto.
// Réglages dans config/mcp.json (modifiables dans Réglages › Connecteurs MCP) : par compte, un mode
// par défaut et un mode par connecteur ; sans réglage, un connecteur est coupé. Les MCP de projet
// déclarés dans etages.json sont « demander ».
import fs from 'node:fs';
import path from 'node:path';
import { RACINE, etage as trouverEtage, etages } from './config.js';
import { decouverteEnCache, prefixeOutils } from './decouverte.js';

const FICHIER = path.join(RACINE, 'config', 'mcp.json');
export const MODES = ['off', 'demander', 'auto'];

function lire() {
  try {
    return JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  } catch {
    return { comptes: {}, etages: {} };
  }
}

function ecrire(cfg) {
  const tmp = FICHIER + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n');
  fs.renameSync(tmp, FICHIER);
}

function serveursProjet(e) {
  if (!e?.projet) return {};
  try {
    return JSON.parse(fs.readFileSync(path.join(e.projet, '.mcp.json'), 'utf8')).mcpServers || {};
  } catch {
    return {};
  }
}

const modeEtage = (cfg, e, nom) => cfg.etages?.[e.id]?.[nom] ?? (e.mcp?.includes(nom) ? 'demander' : 'off');
const modeCompte = (cfg, compteId, nom) => {
  const c = cfg.comptes?.[compteId];
  return c?.modes?.[nom] ?? c?.defaut ?? 'off';
};
const estPerso = (cfg, compteId, nom) => {
  const p = cfg.comptes?.[compteId]?.perso;
  return p === '*' || (Array.isArray(p) && p.includes(nom));
};

export function changerMode(cible, id, nom, mode) {
  if (!MODES.includes(mode)) throw new Error(`mode inconnu : ${mode}`);
  const cfg = lire();
  if (cible === 'compte') {
    cfg.comptes = cfg.comptes || {};
    const c = (cfg.comptes[id] = cfg.comptes[id] || { defaut: 'off', perso: [], modes: {} });
    c.modes = { ...(c.modes || {}), [nom]: mode };
  } else {
    cfg.etages = cfg.etages || {};
    cfg.etages[id] = { ...(cfg.etages[id] || {}), [nom]: mode };
  }
  ecrire(cfg);
}

// Vue pour le site.
export function vueMcp(comptesIds) {
  const cfg = lire();
  const comptes = {};
  for (const id of comptesIds) {
    const d = decouverteEnCache(id);
    comptes[id] = {
      decouverte: d?.date || null,
      serveurs: (d?.mcp || []).map((s) => ({ nom: s.nom, statut: s.statut, source: s.source, outils: s.outils.length, mode: modeCompte(cfg, id, s.nom), perso: estPerso(cfg, id, s.nom) })),
    };
  }
  const parEtage = {};
  for (const e of etages()) {
    const noms = Object.keys(serveursProjet(e));
    if (noms.length) parEtage[e.id] = noms.map((nom) => ({ nom, mode: modeEtage(cfg, e, nom) }));
  }
  return { comptes, etages: parEtage };
}

// Résumé pour le DG : ce qui est activé et donc utilisable par les tâches.
export function resumePourDg(compteId) {
  const cfg = lire();
  const d = decouverteEnCache(compteId);
  const comptes = (d?.mcp || []).filter((s) => modeCompte(cfg, compteId, s.nom) !== 'off').map((s) => `${s.nom} (${modeCompte(cfg, compteId, s.nom)})`);
  const lignes = [];
  if (comptes.length) lignes.push(`Connecteurs activés pour ce compte : ${comptes.join(', ')}.`);
  for (const e of etages()) {
    const actifs = Object.keys(serveursProjet(e)).filter((nom) => modeEtage(cfg, e, nom) !== 'off');
    if (actifs.length && e.actif) lignes.push(`MCP du projet ${e.nom} : ${actifs.join(', ')} (seulement si l'application correspondante est ouverte).`);
  }
  return lignes.length ? lignes.join('\n') : 'Aucun MCP activé.';
}

/**
 * Options MCP d'une session de tâche.
 * - Rien d'activé côté compte : strictMcpConfig (seuls les MCP du projet passés explicitement).
 * - Des connecteurs activés : on charge la config normale du compte et on retire, par préfixe
 *   d'outils, chaque serveur non activé (connecteurs, MCP utilisateur, MCP du projet hors liste).
 */
export function optionsMcp(etageId, compteId, lectureSeule) {
  if (lectureSeule) return { mcpServers: {}, strictMcpConfig: true, interdits: [], autorises: [] };
  const cfg = lire();
  const e = trouverEtage(etageId);
  const projet = serveursProjet(e);
  const projetActifs = Object.fromEntries(Object.entries(projet).filter(([nom]) => modeEtage(cfg, e, nom) !== 'off'));
  const autorises = Object.keys(projetActifs).filter((nom) => modeEtage(cfg, e, nom) === 'auto').map(prefixeOutils);
  const d = decouverteEnCache(compteId);
  const connecteurs = (d?.mcp || []).filter((s) => modeCompte(cfg, compteId, s.nom) !== 'off');
  if (!connecteurs.length) return { mcpServers: projetActifs, strictMcpConfig: true, interdits: [], autorises };
  const interdits = [
    ...(d?.mcp || []).filter((s) => modeCompte(cfg, compteId, s.nom) === 'off').map((s) => s.prefixe),
    ...Object.keys(projet).filter((nom) => !(nom in projetActifs)).map(prefixeOutils),
  ];
  autorises.push(...connecteurs.filter((s) => modeCompte(cfg, compteId, s.nom) === 'auto').map((s) => s.prefixe));
  return { mcpServers: projetActifs, strictMcpConfig: false, interdits, autorises };
}
