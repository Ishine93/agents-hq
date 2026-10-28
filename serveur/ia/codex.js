// Adaptateur Codex (OpenAI, abonnement ChatGPT ou clé API) : docs/multi-ia/conception.md §2.6.
// Un compte = un dossier CODEX_HOME (jeton dans auth.json, stockage « file » imposé). Les tâches tournent
// par `codex exec --experimental-json` (JSONL), avec un profil de permissions `qg` calculé depuis le profil
// du QG (jamais plus large, §4), les outils du QG par MCP HTTP, et les consignes en tête du premier message.
// Le QG ne lit, ne copie ni ne stocke aucun jeton.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { RACINE, REGLAGES } from '../config.js';
import * as plateforme from '../plateforme.js';
import { enregistrerAppel, signalerActivite } from '../conso.js';
import { creerJetonMcp, revoquerJetonMcp, adresseMcp } from '../mcp-http.js';
import { fluxPensees } from './flux.js';
import { lancerCodex } from './codex-exec.js';
import { profilGaranti, profilCodex, tomlInline, EXCLUSIONS_ENV } from './profils.js';
import { cibleOutil, modificationDe, diffLignes, finDe, profilDemande, consignesQg as consignes, copierSkills } from './commun.js';
export { ROLES_LECTURE, PROFILS_LECTURE, profilDemande } from './commun.js';
import { chargerEquivalences, convertirModele, convertirEffort } from './fournisseurs.js';
import { lireStructure, consigneRelance, RELANCES_STRUCTURE } from './schema.js';
import { t } from '../i18n.js';
import * as bacASable from './codex-bac-a-sable.js';

export const id = 'codex';
export const nom = 'ChatGPT · Codex';
export const nomCourt = 'Codex';
export const acces = ['abonnement', 'cle'];
export const connexions = ['navigateur', 'code'];
export const FORMAT_CLE = /^sk-[A-Za-z0-9_-]{20,}$/;
export const ERREUR_CLE = 'clé API invalide (elle commence par sk-)';

export const commande = () => plateforme.codexCommande();
export const binairePresent = () => plateforme.codexCommande().present;
export const dossierParDefaut = (compteId) => path.join(os.homedir(), '.codex-qg', compteId);
export const dossierConfig = (compte) => compte.configDir || path.join(os.homedir(), '.codex');

// Environnement COMPLET et nettoyé du processus Codex : on retire tout OPENAI_*, CODEX_*, ANTHROPIC*, CLAUDE*
// hérités (une OPENAI_API_KEY ferait facturer les images à l'API), on pose CODEX_HOME = dossier du compte,
// et CODEX_API_KEY seulement pour un compte « clé ». Le PATH garde le Node portable en tête.
export function envPour(compte) {
  const env = {};
  for (const [cle, val] of Object.entries(process.env)) {
    if (/^(OPENAI_|CODEX_|ANTHROPIC|CLAUDE)/i.test(cle)) continue;
    env[cle] = val;
  }
  env.CODEX_HOME = dossierConfig(compte);
  if (compte?.cleApi) env.CODEX_API_KEY = compte.cleApi;
  const clePath = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  env[clePath] = plateforme.pathAvecNode(env[clePath]);
  return env;
}

// « Connecté » = CODEX_HOME/auth.json existe (stat seulement). Un compte « clé » est toujours connecté.
export function etatConnexion(compte) {
  if (!compte) return false;
  if (compte.cleApi) return true;
  return plateforme.compteConnecteSelonPlateforme({ configDir: dossierConfig(compte), fournisseur: 'codex' });
}
export const verifierConnexion = async (compte) => etatConnexion(compte);
export const fichierConnexion = (compte) => plateforme.fichierIdentifiantsCodex(dossierConfig(compte));

// Une seule connexion Codex à la fois sur le PC (rappel local sur le port 1455) : verrou de 10 min.
let connexionEnCours = null;
export function ouvrirConnexion(compte, { mode = 'navigateur' } = {}) {
  if (!binairePresent()) throw new Error(t('Codex introuvable : installe-le depuis Réglages › Comptes IA (bouton « Installer Codex ») ou installe le Codex CLI officiel'));
  if (connexionEnCours && connexionEnCours.id !== compte.id && Date.now() - connexionEnCours.t < 10 * 60 * 1000) {
    throw new Error(t('Une connexion Codex est déjà en cours ({nom}) : termine-la d’abord, une seule à la fois sur ce PC', { nom: connexionEnCours.nom }));
  }
  fs.mkdirSync(dossierConfig(compte), { recursive: true });
  connexionEnCours = { id: compte.id, nom: compte.nom, t: Date.now() };
  const script = path.join(RACINE, 'serveur', 'connexion.js');
  plateforme.ouvrirTerminal('Connexion Codex', [plateforme.nodeOuCourant(), script, compte.id, mode === 'code' ? 'login-code' : 'login', '--pause']);
  return compte;
}
export const connexionTerminee = (compteId) => {
  if (connexionEnCours?.id === compteId) connexionEnCours = null;
};

export function deconnecter(compte) {
  return new Promise((resolve) => {
    const cmd = plateforme.codexCommande();
    let p;
    try {
      p = spawn(cmd.exe, [...cmd.args, 'logout'], { env: envPour(compte), stdio: 'ignore', windowsHide: true });
    } catch {
      return resolve(false);
    }
    p.on('exit', () => resolve(!etatConnexion(compte)));
    p.on('error', () => resolve(false));
  });
}

export function capacites(compte = null) {
  const profils = {};
  for (const p of ['lecture', 'lecture+tests', 'verif', 'edition', 'edition+tests', 'ops']) profils[p] = profilGaranti('codex', p).statut;
  return {
    profils,
    modePrudent: false,
    sortieStructuree: 'native',
    reprise: true,
    fork: false,
    injection: 'interruption-reprise',
    imagesEntree: true,
    images: compte?.cleApi ? 'api' : 'abonnement',
    mcp: { http: true, stdio: true, demandeParAppel: false },
    // lot B : boutons sans effet pour Codex (la fiche le dit)
    compaction: false,
    plafondBudget: false,
    sousAgents: false,
    // Codex lance ses commandes lui-même (pas de crochet) : sorties de tests non filtrées
    filtreTests: false,
    modeles: true,
    effort: true,
    pensees: 'blocs',
    cout: compte?.cleApi ? 'jetons' : 'equivalent-api',
    // OpenAI déconseille d'utiliser un auth.json en parallèle : une session à la fois par compte « abonnement ».
    sessionsParCompte: compte?.cleApi ? null : (REGLAGES.codex?.sessionsParCompte ?? 1),
  };
}

export const modeles = () => (chargerEquivalences().modeles?.codex || []).map((m) => ({ ...m, efforts: [...m.efforts] }));

// ---------------------------------------------------------------- sessions

const dansDepotGit = (cwd) => {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true';
  } catch {
    return false;
  }
};
const baseGit = (fichier) => {
  try {
    return execFileSync('git', ['-C', path.dirname(fichier), 'show', `HEAD:./${path.basename(fichier)}`], { encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

// Une session à la fois par compte « abonnement » (sessionsParCompte) : les suivantes attendent leur tour.
const slots = new Map();
async function prendreSlot(compte, signal) {
  const max = capacites(compte).sessionsParCompte;
  if (!max) return () => {};
  const s = slots.get(compte.id) || { actifs: 0, file: [] };
  slots.set(compte.id, s);
  const liberer = () => {
    s.actifs -= 1;
    s.file.shift()?.();
  };
  if (s.actifs >= max) {
    await new Promise((r) => {
      s.file.push(r);
      signal?.addEventListener('abort', () => {
        const i = s.file.indexOf(r);
        if (i >= 0) s.file.splice(i, 1);
        r();
      }, { once: true });
    });
    if (signal?.aborted) return () => {};
  }
  s.actifs += 1;
  return liberer;
}

// Serveurs MCP de la demande (forme .mcp.json : { command, args, env } ou { url, headers }) en config Codex.
function mcpCodex(def) {
  if (!def || typeof def !== 'object') return null;
  if (def.url) return { url: String(def.url), ...(def.headers ? { http_headers: def.headers } : {}) };
  if (def.command) return { command: String(def.command), args: (def.args || []).map(String), ...(def.env ? { env: def.env } : {}) };
  return null;
}

let compteurSessions = 0;
const classerErreur = (message) => {
  const m = String(message || '');
  if (bacASable.ERREUR_BAC_A_SABLE.test(m)) return 'bac_a_sable'; // Windows : préparation en administrateur à faire
  if (/not logged in|unauthori[sz]ed|\b401\b|invalid api key|incorrect api key|authentication|login required|please log ?in/i.test(m)) return 'authentication_failed';
  if (/usage[_ ]limit|rate[_ ]?limit|\b429\b|too many requests|quota exceeded/i.test(m)) return 'rate_limit';
  if (/billing|insufficient[_ ]quota|payment required|\b402\b/i.test(m)) return 'billing_error';
  return null;
};
const reinitDe = (message) => {
  const m = String(message || '').match(/(?:resets?(?:_at)?|try again)[^0-9]{0,20}(\d{10,13})/i);
  if (m) return Number(m[1]);
  const iso = String(message || '').match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/);
  return iso ? Date.parse(iso[0]) / 1000 : null;
};

/**
 * Session Codex, pour tous les rôles. Mêmes arguments que l'adaptateur Claude, plus `demande` :
 *   role (tache, verif, dg, question, utilitaire, ambiance…), lectureSeule (défaut : vrai pour les rôles de
 *   ROLES_LECTURE), profil, cwd, dossiersSup, pieces, consignes (défaut : options.systemPrompt), schema (sortie
 *   structurée, aussi options.outputFormat.schema), outilsQg { definitions } (outils MCP du QG, ceux du DG
 *   compris), mcp { nom: { command, args, env } | { url, headers } } (ignorés en lecture seule), skills, titre.
 * Sortie structurée : --output-schema, puis JSON final vérifié ; invalide → une relance (exec resume) avec
 * les erreurs. Reprise : options.resume (jamais pour un fork : Codex ne sait pas copier une conversation).
 * Sans `demande`, le rôle n'est pas pris en charge (role_non_pris_en_charge).
 */
export async function lancer({ prompt, images = [], options = {}, compte, compteObj, demande = null, surInit, surOutil, surActivite, surImage, surCommande, surModification, surPensee, canal, conso = {} }) {
  const meta = { role: 'autre', ...conso, compte: compte || compteObj?.id };
  const sortie = { result: null, structure: null, sessionId: options.resume || null, init: null, erreur: null, limite: null, exception: null, contexte: null, modeleReel: null, compte: meta.compte, fournisseur: 'codex' };
  if (canal) canal.injecter = async () => false;
  if (!demande) {
    sortie.erreur = 'role_non_pris_en_charge';
    sortie.exception = `Codex ne peut pas encore tenir le rôle « ${meta.role} » (prévu au lot 2)`;
    return sortie;
  }
  const { lectureSeule, profil } = profilDemande(demande);
  const systeme = typeof options.systemPrompt === 'string' ? options.systemPrompt : options.systemPrompt?.append || '';
  demande = { ...demande, profil, consignes: demande.consignes ?? systeme };
  const garantie = profilGaranti('codex', profil);
  if (garantie.statut === 'refuse') {
    sortie.erreur = 'profil_refuse';
    sortie.exception = `profil ${profil} refusé sur Codex : ${garantie.motif}`;
    return sortie;
  }
  // Codex ne sait pas copier une conversation (fork) : reprendre l'original le modifierait pendant qu'il travaille.
  const reprise = options.forkSession ? null : options.resume || null;
  if (options.forkSession) sortie.sessionId = null;
  const cmd = plateforme.codexCommande();
  if (!cmd.present) {
    sortie.erreur = 'binaire_absent';
    sortie.exception = 'Codex introuvable sur ce PC (Réglages › Comptes IA › Installer Codex, ou Codex CLI officiel)';
    return sortie;
  }
  const signal = options.abortController?.signal || null;
  const liberer = await prendreSlot(compteObj, signal);
  if (signal?.aborted) {
    liberer();
    sortie.exception = 'interrompue avant le lancement';
    return sortie;
  }

  const cle = `${Date.now().toString(36)}-${process.pid}-${++compteurSessions}`;
  const cwd = demande.cwd || options.cwd || RACINE;
  const dossiersSup = demande.dossiersSup || [];
  const modele = convertirModele(compteObj, options.model || demande.modele);
  const effort = convertirEffort(compteObj, modele, options.effort || demande.effort || 'medium');
  const env = envPour(compteObj);
  const flux = fluxPensees(surPensee);
  const adresse = adresseMcp();
  let jeton = null;
  if (demande.outilsQg?.definitions?.length && adresse) {
    jeton = creerJetonMcp(demande.outilsQg.definitions);
    env.QG_MCP_JETON = jeton;
  }
  const schema = options.outputFormat?.schema || demande.schema || null;
  let fichierSchema = null;
  const { copies: skillsCopies, dossier: dossierSkills } = copierSkills(demande, cle);
  if (schema) {
    const dir = path.join(RACINE, 'runtime', 'ia', 'schemas');
    fs.mkdirSync(dir, { recursive: true });
    fichierSchema = path.join(dir, `${cle}.json`);
    fs.writeFileSync(fichierSchema, JSON.stringify(schema));
  }
  const table = profilCodex(profil, { cwd, dossiersSup, pieces: demande.pieces || null });
  if (dossierSkills) table.filesystem[dossierSkills.replace(/\\/g, '/')] = 'read';
  const configs = [
    ['approval_policy', 'never'],
    ['cli_auth_credentials_store', 'file'],
    ['model_reasoning_effort', effort],
    ['web_search', ['utilitaire', 'delegation'].includes(demande.role) ? 'disabled' : 'cached'],
    ['default_permissions', 'qg'],
    ['permissions.qg', table],
    ['shell_environment_policy', { inherit: 'all', exclude: EXCLUSIONS_ENV }],
    // Windows : bac à sable élevé une fois préparé (il ferme les secrets en lecture ; l'ordinaire ne sait pas)
    ...(bacASable.etat(env.CODEX_HOME) === 'pret' ? [['windows.sandbox', 'elevated']] : []),
    ...(jeton ? [['mcp_servers.qg', { url: adresse, bearer_token_env_var: 'QG_MCP_JETON', required: true, tool_timeout_sec: 86400 }]] : []),
    ...(lectureSeule ? [] : Object.entries(demande.mcp || {}).filter(([n]) => n !== 'qg' && /^[A-Za-z0-9_-]+$/.test(n)).map(([n, d]) => [`mcp_servers.${n}`, mcpCodex(d)]).filter(([, v]) => v)),
  ];
  const depot = dansDepotGit(cwd);
  const argsPour = (threadId) => {
    const a = ['exec', '--experimental-json', '--model', modele, '--cd', cwd];
    for (const d of dossiersSup) a.push('--add-dir', d);
    if (!depot) a.push('--skip-git-repo-check');
    for (const img of images) if (typeof img === 'string') a.push('--image', img);
    if (fichierSchema) a.push('--output-schema', fichierSchema);
    for (const [k, v] of configs) a.push('-c', `${k}=${tomlInline(v)}`);
    if (threadId) a.push('resume', threadId);
    return a;
  };

  // ---- traduction des événements JSONL en rappels du QG
  const connus = new Map(); // fichier → dernier contenu connu (diffs)
  const vus = new Set(); // identifiants d'éléments déjà traités en « completed »
  let dernierMessage = '';
  let usageTour = null;
  const noterErreur = (message) => {
    if (!message) return;
    sortie.exception = String(message).slice(0, 2000);
    const e = classerErreur(message);
    if (e) sortie.erreur = e;
    if (e === 'bac_a_sable') sortie.exception = t('Codex ne peut pas démarrer sur ce PC : son bac à sable Windows se prépare une fois, en administrateur (Réglages › Comptes IA › « Préparer le bac à sable »). Détail : {detail}', { detail: String(message).slice(-200) }); // la fin dit ce que le bac à sable refuse
    if (e === 'rate_limit') sortie.limite = { resetsAt: reinitDe(message), type: 'codex' };
  };
  const modifPour = (change) => {
    const fichier = path.isAbsolute(change.path) ? change.path : path.join(cwd, change.path);
    let apres = null;
    try {
      apres = fs.readFileSync(fichier, 'utf8');
    } catch {
      /* supprimé, binaire ou illisible */
    }
    const base = connus.has(fichier) ? connus.get(fichier) : change.kind === 'add' ? '' : baseGit(fichier);
    connus.set(fichier, apres ?? '');
    const outil = change.kind === 'add' ? 'Write' : 'Edit';
    surOutil?.(outil, cibleOutil(outil, { file_path: fichier }, cwd));
    if (!surModification) return;
    let mod;
    if (change.kind === 'add' || base === '') {
      mod = modificationDe({ filePath: fichier, type: 'create', content: apres ?? '', structuredPatch: [], originalFile: null }, 'Write', cwd);
    } else {
      const patch = base == null ? null : diffLignes(base, apres ?? '');
      if (patch == null) {
        mod = modificationDe({ filePath: fichier, type: 'update', structuredPatch: [], originalFile: '' }, outil, cwd);
        mod.incomplet = true; // base inconnue (projet sans git) ou fichier trop gros : diff non reconstitué
      } else mod = modificationDe({ filePath: fichier, type: 'update', structuredPatch: patch, originalFile: base }, outil, cwd);
    }
    try {
      surModification(mod);
    } catch (e) {
      console.error('modification', e.message);
    }
  };
  const traiter = (ev) => {
    if (ev.type === 'thread.started') {
      if (ev.thread_id) sortie.sessionId = ev.thread_id;
      if (!sortie.init) {
        sortie.init = { type: 'system', subtype: 'init', session_id: sortie.sessionId, model: modele, tools: [] };
        sortie.modeleReel = modele;
        surInit?.(sortie.init);
      }
      return;
    }
    if (ev.type === 'turn.started') {
      surActivite?.();
      return;
    }
    if (ev.type === 'turn.completed') {
      const u = ev.usage || {};
      const entree = Math.max(0, (u.input_tokens || 0) - (u.cached_input_tokens || 0));
      usageTour = { input_tokens: entree, output_tokens: u.output_tokens || 0, cache_read_input_tokens: u.cached_input_tokens || 0, cache_creation_input_tokens: u.cache_write_input_tokens || 0, raisonnement: u.reasoning_output_tokens || 0 };
      enregistrerAppel(meta, usageTour, modele, true);
      signalerActivite();
      sortie.contexte = (u.input_tokens || 0) + (u.output_tokens || 0);
      return;
    }
    if (ev.type === 'turn.failed') return noterErreur(ev.error?.message || 'turn.failed');
    if (ev.type === 'error') return noterErreur(ev.message || 'error');
    if (!ev.type?.startsWith('item.') || !ev.item) return;
    const it = ev.item;
    const fini = ev.type === 'item.completed';
    surActivite?.();
    signalerActivite();
    if (fini && it.id) {
      if (vus.has(it.id)) return;
      vus.add(it.id);
    }
    switch (it.type) {
      case 'reasoning':
        if (fini && it.text) flux.bloc('reflexion', it.text); // résumé de raisonnement : texte complet d'un coup
        return;
      case 'agent_message':
        if (!fini) return;
        dernierMessage = it.text || '';
        flux.bloc(schema && /^\s*[{[]/.test(dernierMessage) ? 'rapport' : 'redaction', dernierMessage);
        return;
      case 'command_execution':
        if (ev.type === 'item.started') {
          surOutil?.('Bash', cibleOutil('Bash', { command: it.command }, cwd));
          flux.bloc('outil', '', { outil: 'Bash' });
          surCommande?.({ id: it.id, commande: String(it.command || '').slice(0, 4000), description: '', debut: Date.now(), enCours: true });
        } else if (fini) {
          surCommande?.({ id: it.id, sortie: finDe(String(it.aggregated_output || ''), 6000), erreur: it.status === 'failed' || (it.exit_code != null && it.exit_code !== 0), fin: Date.now(), enCours: false });
        }
        return;
      case 'file_change':
        if (fini) for (const c of it.changes || []) modifPour(c);
        return;
      case 'mcp_tool_call': {
        const nomOutil = `mcp__${it.server}__${it.tool}`;
        if (ev.type === 'item.started') {
          surOutil?.(nomOutil, cibleOutil(nomOutil, it.arguments && typeof it.arguments === 'object' ? it.arguments : {}, cwd));
          flux.bloc('outil', '', { outil: nomOutil });
        } else if (fini && surImage) {
          for (const c of it.result?.content || []) if (c?.type === 'image' && c.data) surImage(c.data, c.mimeType || 'image/png', nomOutil);
        }
        return;
      }
      case 'web_search':
        if (ev.type === 'item.started' || (fini && !vus.has(`${it.id}:s`))) surOutil?.('WebSearch', cibleOutil('WebSearch', { query: it.query }, cwd));
        vus.add(`${it.id}:s`);
        return;
      case 'todo_list':
        if (ev.type === 'item.started') surOutil?.('TodoWrite', 'plan de travail');
        return;
      case 'error':
        noterErreur(it.message);
        return;
      default:
        return;
    }
  };

  // ---- boucle de lancement : premier tour, puis reprises (exec resume) pour chaque complément injecté
  let courant = null;
  let complement = null;
  let fini = false;
  if (canal) {
    canal.injecter = async (texte) => {
      if (fini) return false;
      complement = texte;
      courant?.tuer();
      return true;
    };
  }
  let relances = 0;
  let lu = null;
  try {
    let texte = reprise ? prompt : `${consignes(demande, skillsCopies)}\n\n${prompt}`;
    let threadId = reprise;
    for (;;) {
      courant = lancerCodex({ args: argsPour(threadId), env, cwd, prompt: texte, signal, surEvenement: traiter, commande: cmd });
      const r = await courant.fin;
      if (signal?.aborted) {
        sortie.exception = sortie.exception || 'session interrompue';
        break;
      }
      if (complement) {
        // complément en cours de route : on reprend la même conversation avec ce message
        texte = complement;
        complement = null;
        threadId = sortie.sessionId;
        dernierMessage = '';
        sortie.exception = null;
        sortie.erreur = null;
        if (!threadId) texte = `${consignes(demande, skillsCopies)}\n\n${prompt}\n\n${texte}`;
        continue;
      }
      if (r.erreur) noterErreur(`Codex impossible à lancer : ${r.erreur.message}`);
      else if (r.code !== 0 && !sortie.erreur && !sortie.exception) noterErreur(`codex a quitté avec le code ${r.code}${r.stderr ? ' : ' + r.stderr.trim().slice(-600) : ''}`);
      if (schema && !sortie.erreur && !sortie.exception) {
        // sortie structurée vérifiée contre le schéma ; invalide → une relance dans la même conversation
        lu = lireStructure(dernierMessage, schema);
        if (!lu.structure && relances < RELANCES_STRUCTURE && sortie.sessionId) {
          relances += 1;
          texte = consigneRelance(lu.erreurs);
          threadId = sortie.sessionId;
          dernierMessage = '';
          continue;
        }
      }
      break;
    }
    if (!sortie.erreur && !sortie.exception) {
      // toujours invalide après la relance → « pas de sortie structurée » (raisonEchec), comme pour Claude
      const structure = schema ? lu?.structure ?? null : null;
      if (schema && !structure) sortie.erreursStructure = lu?.erreurs || [];
      sortie.relancesStructure = relances;
      sortie.structure = structure;
      sortie.result = { type: 'result', subtype: 'success', is_error: false, result: dernierMessage, structured_output: structure, usage: usageTour, session_id: sortie.sessionId };
    }
  } catch (e) {
    sortie.exception = String(e?.message || e);
  } finally {
    fini = true;
    flux.terminer();
    if (canal) canal.injecter = async () => false;
    revoquerJetonMcp(jeton);
    if (fichierSchema) fs.rmSync(fichierSchema, { force: true });
    if (dossierSkills) fs.rmSync(dossierSkills, { recursive: true, force: true });
    liberer();
  }
  return sortie;
}
