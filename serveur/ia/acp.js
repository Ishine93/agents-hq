// Adaptateur générique ACP (Agent Client Protocol v1, agentclientprotocol.com) : Grok, Cursor, Copilot,
// Gemini, Mistral Vibe, Qwen, Kimi, OpenCode, Goose… (config/defauts/agents-acp.json, docs/multi-ia/bench-autres.md)
// ou un agent ACP personnalisé (commande donnée à l'ajout du compte).
// Le QG est le client : il lance l'agent, lui parle en JSON-RPC 2.0 sur stdio (ia/acp-rpc.js, écrit à la main),
// lui donne les outils du QG par MCP (HTTP, ou stdio par ia/mcp-pont.js), et répond à TOUTES ses demandes :
// permissions, lecture et écriture de fichiers, terminal (ia/acp-permissions.js décide). Aucun bac à sable n'est
// imposé par le QG : tous les profils sont « restreints », ops est refusé (profils.js › profilGaranti).
// Le QG ne lit, ne copie ni ne stocke aucun jeton : la connexion se constate par la présence d'un fichier.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { RACINE, REGLAGES, profils as reglesProfils } from '../config.js';
import * as plateforme from '../plateforme.js';
import { chargerComptes, dossierConfig as dossierDuCompte } from '../comptes.js';
import { enregistrerAppel, enregistrerCout, signalerActivite } from '../conso.js';
import { creerJetonMcp, revoquerJetonMcp, adresseMcp } from '../mcp-http.js';
import { estCommandeTest } from '../economie.js';
import { filtrer } from '../../outils/filtre-tests.mjs';
import { fluxPensees } from './flux.js';
import { connecterAgent, ErreurRpc, METHODE_INCONNUE } from './acp-rpc.js';
import { zonesAcp, decisionAcp, optionPour, sorteDe } from './acp-permissions.js';
import { profilGaranti, PROFILS, EXCLUSIONS_ENV } from './profils.js';
import { cibleOutil, modificationDe, diffLignes, finDe, profilDemande, consignesQg, copierSkills } from './commun.js';
export { ROLES_LECTURE, PROFILS_LECTURE, profilDemande } from './commun.js';
import { niveauDe, chargerEquivalences } from './fournisseurs.js';
import { lireStructure, consigneRelance, outilSoumission, RELANCES_STRUCTURE } from './schema.js';
import { t } from '../i18n.js';
import { lanceurInstalle, scriptNode } from './installation-acp.js';

export const id = 'acp';
export const nom = 'Autres agents (ACP)';
export const nomCourt = 'Agent ACP';
export const acces = ['cle', 'abonnement'];
export const connexions = ['terminal'];
export const FORMAT_CLE = /^\S{16,}$/;
export const ERREUR_CLE = 'clé API invalide (16 caractères au moins, sans espace)';
export const AGENT_PERSONNALISE = 'personnalise';
const PONT_MCP = path.join(RACINE, 'serveur', 'ia', 'mcp-pont.js');
const CACHE_DECOUVERTE = path.join(RACINE, 'runtime', 'decouverte');
const ORDRE_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const VAR_VALIDE = /^[A-Z][A-Z0-9_]{1,63}$/;

// ---------------------------------------------------------------- catalogue des agents

let catalogueLu = null;
export function catalogue() {
  if (!catalogueLu) {
    try {
      catalogueLu = JSON.parse(fs.readFileSync(path.join(RACINE, 'config', 'defauts', 'agents-acp.json'), 'utf8')).agents || {};
    } catch {
      catalogueLu = {};
    }
  }
  return catalogueLu;
}

/** Agent d'un compte : entrée du catalogue, agent personnalisé (compte.commande), ou null. */
export function agentDe(compte) {
  if (!compte) return null;
  const a = compte.agent && compte.agent !== AGENT_PERSONNALISE ? catalogue()[compte.agent] : null;
  if (a) return { id: compte.agent, ...a };
  if (Array.isArray(compte.commande) && compte.commande.length && compte.commande.every((x) => typeof x === 'string' && x)) {
    return {
      id: AGENT_PERSONNALISE,
      nom: compte.nom || 'Agent ACP',
      nomCourt: 'Agent ACP',
      commande: compte.commande,
      acces: ['cle', 'abonnement'],
      varCle: VAR_VALIDE.test(compte.varCle || '') ? compte.varCle : null,
      niveaux: {},
      personnalise: true,
    };
  }
  return null;
}

/** Normalise le choix fait à l'ajout d'un compte : { agent, commande?, varCle? } ou une erreur. */
export function agentPourAjout({ agent, commande = null, varCle = null } = {}, cleApi = null) {
  if (agent && agent !== AGENT_PERSONNALISE) {
    const a = catalogue()[agent];
    if (!a) throw new Error(t('agent ACP inconnu : {agent}', { agent }));
    if (cleApi && !a.acces.includes('cle')) throw new Error(t('{nom} ne prend pas de clé API : connecte-toi avec ton abonnement', { nom: a.nomCourt }));
    if (!cleApi && !a.acces.includes('abonnement')) throw new Error(t('{nom} demande une clé API', { nom: a.nomCourt }));
    return { agent };
  }
  const argv = Array.isArray(commande) ? commande.map((x) => String(x).trim()).filter(Boolean) : String(commande || '').trim().split(/\s+/).filter(Boolean);
  if (!argv.length) throw new Error(t('commande de l’agent ACP vide'));
  if (argv.length > 20 || argv.some((x) => x.length > 400)) throw new Error(t('commande de l’agent ACP trop longue'));
  const v = varCle ? String(varCle).trim().toUpperCase() : null;
  if (cleApi && (!v || !VAR_VALIDE.test(v))) throw new Error(t('variable de la clé invalide (lettres majuscules, chiffres et _)'));
  return { agent: AGENT_PERSONNALISE, commande: argv, ...(v ? { varCle: v } : {}) };
}

/** Préfixe de l'identifiant d'un nouveau compte : grok1, cursor1… ou acp1 pour un agent personnalisé. */
export const prefixeId = ({ agent } = {}) => (agent && agent !== AGENT_PERSONNALISE && catalogue()[agent] ? agent : 'acp');
export const nomParDefaut = ({ agent } = {}) => catalogue()[agent]?.nomCourt || nomCourt;

// Où est l'agent ? 1. installé par le QG (runtime/acp/<agent>, lancé par le Node du QG) ; 2. dans le PATH ;
// 3. dans les dossiers où son installateur officiel le range (installer.dossiers) : le PATH du QG date de
// son lancement, une installation faite depuis ne s'y voit qu'au prochain lancement.
export function trouverCommande(agent, { env = process.env, plat = plateforme.PLATEFORME } = {}) {
  const inst = agent.installer || {};
  if (!env.QG_ACP_BIN && inst.npm && agent.id) {
    const f = lanceurInstalle(agent.id, inst.npm);
    const reste = agent.commande.slice(1).map(String);
    if (f && scriptNode(f)) return { exe: plateforme.nodeOuCourant(plat), args: [f, ...reste], present: true, parQg: true };
    if (f) {
      let reel = f;
      try {
        reel = fs.realpathSync(f);
      } catch {
        /* lien cassé : le chemin tel quel */
      }
      return { exe: reel, args: reste, present: true, parQg: true };
    }
  }
  const c = plateforme.acpCommande(agent.commande, plat, { env });
  if (c.present || env.QG_ACP_BIN) return c;
  const extra = (inst.dossiers?.[plateforme.nom(plat)] || []).map((d) => plateforme.developperChemin(d, { env })).filter(Boolean);
  if (!extra.length) return c;
  const cle = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const sep = plateforme.estWindows(plat) ? ';' : ':';
  return plateforme.acpCommande(agent.commande, plat, { env: { ...env, [cle]: [env[cle] || '', ...extra].filter(Boolean).join(sep) } });
}

// Recherche gardée 30 s (le site redemande la liste des comptes souvent) ; oublierCommandes() la refait
// (bouton « Vérifier à nouveau », fin d'une installation).
const commandesVues = new Map();
export function commandeAgent(agent) {
  if (!agent?.commande?.length) return { exe: '', args: [], present: false };
  const cle = JSON.stringify([agent.id || '', agent.commande, process.env.QG_ACP_BIN || '', process.env.PATH || process.env.Path || '']);
  const vu = commandesVues.get(cle);
  if (vu && Date.now() - vu.t < 30000) return vu.c;
  const c = trouverCommande(agent);
  if (commandesVues.size > 200) commandesVues.clear();
  commandesVues.set(cle, { t: Date.now(), c });
  return c;
}
export const oublierCommandes = () => commandesVues.clear();
export const commande = (compte) => commandeAgent(agentDe(compte));
export function binairePresent(compte = null) {
  if (compte) return commande(compte).present;
  return Object.entries(catalogue()).some(([cle, a]) => commandeAgent({ id: cle, ...a }).present);
}

// Pour le site : agents connus, présents ou non sur ce PC ; disponible = il existe pour ce système.
const SYSTEME = plateforme.nom();
export const cataloguePublic = () =>
  Object.entries(catalogue()).map(([cle, a]) => ({
    id: cle,
    nom: a.nom,
    nomCourt: a.nomCourt,
    acces: a.acces,
    present: commandeAgent({ id: cle, ...a }).present,
    disponible: !a.installer?.systemes || a.installer.systemes.includes(SYSTEME),
    installation: typeof a.installation === 'string' ? a.installation : a.installation?.[SYSTEME] || '',
    connexion: a.connexion?.consigne || '',
    aVerifier: (a.aVerifier || []).length,
  }));

// ---------------------------------------------------------------- dossier, environnement, connexion

/**
 * Dossier de connexion d'un nouveau compte : ~/.acp-qg/<id> quand l'agent peut y être déplacé (varDossier),
 * pour un compte « clé » ou un agent personnalisé ; sinon le dossier de l'agent lui-même (~/.grok…), ce qui
 * limite à un compte « abonnement » par PC pour cet agent (doublon refusé par comptes.js).
 */
export function dossierParDefaut(compteId, { agent = null, acces: type = 'abonnement' } = {}) {
  const a = agent && agent !== AGENT_PERSONNALISE ? catalogue()[agent] : null;
  if (!a || a.varDossier || type === 'cle' || !a.dossierAgent) return path.join(os.homedir(), '.acp-qg', compteId);
  return path.join(os.homedir(), a.dossierAgent);
}
export const dossierConfig = (compte) => compte?.configDir || dossierParDefaut(compte?.id || 'acp', { agent: compte?.agent, acces: compte?.cleApi ? 'cle' : 'abonnement' });

// Environnement COMPLET et nettoyé : ni ANTHROPIC*, CLAUDE*, OPENAI_*, CODEX_*, ni les clés des autres agents
// du catalogue, ni les variables retirées par l'agent (GH_TOKEN…). La clé du compte va dans sa variable, le
// dossier du compte dans la variable de dossier de l'agent. Le PATH garde le Node portable en tête.
export function envPour(compte) {
  const agent = agentDe(compte);
  const retirer = new Set([...Object.values(catalogue()).map((a) => a.varCle).filter(Boolean), ...(agent?.retirerEnv || []), ...(agent?.varCle ? [agent.varCle] : [])].map((v) => v.toUpperCase()));
  const env = {};
  for (const [cle, val] of Object.entries(process.env)) {
    if (/^(ANTHROPIC|CLAUDE|OPENAI_|CODEX_)/i.test(cle) || retirer.has(cle.toUpperCase())) continue;
    env[cle] = val;
  }
  if (agent?.varDossier) env[agent.varDossier] = dossierConfig(compte);
  if (compte?.cleApi && agent?.varCle) env[agent.varCle] = compte.cleApi;
  const clePath = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  env[clePath] = plateforme.pathAvecNode(env[clePath]);
  return env;
}

// « Connecté » : compte « clé » ; agent personnalisé présent ; fichier de connexion présent (stat) ; sinon
// dossier de configuration non vide (liste des noms, aucun contenu lu).
export function etatConnexion(compte) {
  if (!compte) return false;
  if (compte.cleApi) return true;
  const agent = agentDe(compte);
  if (!agent) return false;
  if (agent.personnalise) return commandeAgent(agent).present;
  const dossier = dossierConfig(compte);
  if (agent.fichierConnexion) return fs.existsSync(path.join(dossier, agent.fichierConnexion));
  try {
    return fs.readdirSync(dossier).length > 0;
  } catch {
    return false;
  }
}
export const verifierConnexion = async (compte) => etatConnexion(compte);
export function fichierConnexion(compte) {
  const agent = agentDe(compte);
  const dossier = dossierConfig(compte);
  return agent?.fichierConnexion ? path.join(dossier, agent.fichierConnexion) : dossier;
}

/** Commande de connexion dans l'agent (connexion.js) : { exe, args, consigne } ou null. */
export function commandeConnexion(compte) {
  const agent = agentDe(compte);
  if (!agent?.connexion) return null;
  const c = plateforme.acpCommande([agent.commande[0], ...(agent.connexion.args || [])]);
  return { ...c, consigne: agent.connexion.consigne || '' };
}

export function ouvrirConnexion(compte) {
  const agent = agentDe(compte);
  if (!agent) throw new Error(t('agent ACP inconnu : {agent}', { agent: compte?.agent || '?' }));
  if (!commandeAgent(agent).present) throw new Error(t('{nom} introuvable sur ce PC : {installation}', { nom: agent.nomCourt, installation: agent.installation ? t(agent.installation) : t('installe l’agent puis recommence') }));
  if (compte.cleApi || agent.personnalise || !agent.connexion) return compte;
  if (agent.varDossier) fs.mkdirSync(dossierConfig(compte), { recursive: true });
  const script = path.join(RACINE, 'serveur', 'connexion.js');
  plateforme.ouvrirTerminal(`Connexion ${agent.nomCourt}`, [plateforme.nodeOuCourant(), script, compte.id, 'login', '--pause']);
  return compte;
}
export const connexionTerminee = () => {};
// La déconnexion se fait dans l'agent lui-même (le QG ne touche pas à ses fichiers de connexion).
export const deconnecter = async () => false;

// ---------------------------------------------------------------- capacités, modèles, efforts

// Ce que la dernière session ou la découverte a appris de l'agent : compte → { modeles, efforts, modes, reprise… }
const connus = new Map();
function retenir(compteId, infos) {
  connus.set(compteId, { ...(connus.get(compteId) || {}), ...infos });
}
function infosDe(compte) {
  if (!compte) return {};
  if (connus.has(compte.id)) return connus.get(compte.id);
  try {
    const d = JSON.parse(fs.readFileSync(path.join(CACHE_DECOUVERTE, `${compte.id}.json`), 'utf8'));
    if (d?.fournisseur === 'acp') return { modeles: d.modeles || [], efforts: d.efforts || [], modes: d.modes || [], reprise: d.reprise, images: d.images, mcpHttp: d.mcpHttp };
  } catch {
    /* pas encore découvert */
  }
  return {};
}

export function capacites(compte = null) {
  const profils = {};
  for (const p of PROFILS) profils[p] = profilGaranti('acp', p).statut;
  const i = infosDe(compte);
  const si = (v) => (v === undefined ? 'si-agent' : !!v);
  return {
    profils,
    modePrudent: false,
    sortieStructuree: 'outil-mcp|json-relance',
    reprise: si(i.reprise),
    fork: false,
    injection: 'annulation-reprise',
    imagesEntree: si(i.images),
    images: null,
    mcp: { http: si(i.mcpHttp), stdio: true, demandeParAppel: false },
    compaction: false,
    plafondBudget: false,
    sousAgents: false,
    filtreTests: true,
    modeles: i.modeles?.length ? true : 'si-agent',
    effort: i.efforts?.length ? true : 'si-agent',
    pensees: 'flux',
    cout: 'si-agent',
    qualification: 'non-faite',
    agent: agentDe(compte)?.id || null,
    sessionsParCompte: REGLAGES.acp?.sessionsParCompte ?? null,
  };
}

export function modeles(compte) {
  const agent = agentDe(compte);
  const i = infosDe(compte);
  return (i.modeles || []).map((m) => ({ id: m.id, nom: m.nom || m.id, niveau: agent?.niveaux?.[m.id] || m.niveau || null, efforts: [...(m.efforts?.length ? m.efforts : i.efforts || [])] }));
}

/**
 * Modèle de l'agent pour un modèle demandé (alias Claude, modèle Codex…) : le même s'il est proposé, sinon le
 * moins cher des modèles de niveau égal ou supérieur ; null (modèle par défaut de l'agent) si aucun niveau n'est
 * connu. Jamais un niveau en dessous.
 */
export function convertirModele(compte, modele) {
  if (!modele) return null;
  const liste = modeles(compte);
  if (liste.some((m) => m.id === modele)) return modele;
  const ordre = chargerEquivalences().niveaux || ['eco', 'standard', 'fort', 'max'];
  const voulu = ordre.indexOf(niveauDe(modele));
  const candidats = liste.filter((m) => m.niveau && ordre.indexOf(m.niveau) >= voulu).sort((a, b) => ordre.indexOf(a.niveau) - ordre.indexOf(b.niveau));
  return candidats[0]?.id || null;
}

/** Effort de l'agent : le même, sinon le plus proche au-dessus, sinon le plus haut ; null si inconnu. */
export function convertirEffort(compte, modele, effort) {
  if (!effort) return null;
  const m = modeles(compte).find((x) => x.id === modele);
  const efforts = m?.efforts?.length ? m.efforts : infosDe(compte).efforts || [];
  if (!efforts.length) return null;
  const exact = efforts.find((e) => e.toLowerCase() === String(effort).toLowerCase());
  if (exact) return exact;
  const rang = (e) => ORDRE_EFFORTS.indexOf(String(e).toLowerCase());
  if (rang(effort) < 0) return null; // effort inconnu : défaut de l'agent, jamais un niveau deviné plus bas
  const connusIci = efforts.filter((e) => rang(e) >= 0).sort((a, b) => rang(a) - rang(b));
  if (!connusIci.length) return null;
  return connusIci.find((e) => rang(e) > rang(effort)) || connusIci[connusIci.length - 1];
}

// ---------------------------------------------------------------- protocole : session, modes, options

const DANGEREUX = /yolo|bypass|dangerous|skip|auto|accept|full|unsafe|trust|allow[-_ ]?all/i;
const aplatir = (options = []) => options.flatMap((o) => (Array.isArray(o?.options) ? aplatir(o.options) : o && o.value != null ? [{ id: String(o.value), nom: o.name || String(o.value) }] : []));

/** Lit la réponse de session/new (ou session/load) : modèles, efforts, modes, valeurs courantes, options. */
export function lireSession(r = {}) {
  const opts = Array.isArray(r?.configOptions) ? r.configOptions : [];
  const optModele = opts.find((o) => o?.category === 'model');
  const optEffort = opts.find((o) => o?.category === 'thought_level');
  const optMode = opts.find((o) => o?.category === 'mode');
  const modeles = optModele ? aplatir(optModele.options) : (r?.models?.availableModels || []).map((m) => ({ id: String(m.modelId), nom: m.name || String(m.modelId) }));
  const modes = optMode ? aplatir(optMode.options) : (r?.modes?.availableModes || []).map((m) => ({ id: String(m.id), nom: m.name || String(m.id) }));
  return {
    modeles,
    efforts: optEffort ? aplatir(optEffort.options).map((e) => e.id) : [],
    modes,
    modeleCourant: optModele?.currentValue ?? r?.models?.currentModelId ?? null,
    effortCourant: optEffort?.currentValue ?? null,
    modeCourant: optMode?.currentValue ?? r?.modes?.currentModeId ?? null,
    options: { modele: optModele?.id || null, effort: optEffort?.id || null, mode: optMode?.id || null },
  };
}

/** Mode à choisir : celui du catalogue, sinon par le nom ; jamais un mode qui saute les demandes. null = garder. */
export function choisirMode({ modes = [], agent = null, lectureSeule = false }) {
  const voulu = agent?.modes?.[lectureSeule ? 'lecture' : 'ecriture'];
  if (voulu && modes.some((m) => m.id === voulu)) return voulu;
  const re = lectureSeule ? /^(ask|read|read-?only|plan|chat)$/i : /^(default|agent|code|edit|normal)/i;
  return modes.find((m) => re.test(m.id) && !DANGEREUX.test(m.id))?.id || null;
}
export const modeDangereux = (modeId) => !!modeId && DANGEREUX.test(modeId);

const erreurAuth = (e) => e?.code === -32000 || /auth|login|log in|unauthori[sz]ed|\b401\b|credential/i.test(String(e?.message || ''));

// session/new, avec une seule tentative d'authentification si l'agent la demande.
async function nouvelleSession(rpc, init, { compte, agent, cwd, mcpServers }) {
  const params = { cwd, mcpServers };
  try {
    return await rpc.demander('session/new', params, { delaiMs: 120000 });
  } catch (e) {
    if (!erreurAuth(e) || e.fermeture || e.delai) throw e;
    const methodes = (init?.authMethods || []).map((m) => m.id);
    const methode = compte?.cleApi ? methodes.find((m) => /api[-_ ]?key|key/i.test(m)) : agent?.authMethod && methodes.includes(agent.authMethod) ? agent.authMethod : null;
    if (!methode) throw Object.assign(e, { auth: true });
    await rpc.demander('authenticate', { methodId: methode }, { delaiMs: 60000 });
    return rpc.demander('session/new', params, { delaiMs: 120000 });
  }
}

const versionQg = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')).version || '0';
  } catch {
    return '0';
  }
};
const parametresInit = () => ({
  protocolVersion: 1,
  clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  clientInfo: { name: 'qg-agents', title: 'QG des agents', version: versionQg() },
});

// ---------------------------------------------------------------- découverte (sans message, sans tokens)

/** initialize + session/new, sans aucun message : modèles, efforts, modes, reprise, images. */
export async function decouvrir(compte, { cwd = path.join(RACINE, 'runtime') } = {}) {
  const agent = agentDe(compte);
  const cmd = commandeAgent(agent);
  const resultat = { compte: compte.id, date: Date.now(), fournisseur: 'acp', agent: agent?.id || null, abonnement: compte.cleApi ? 'API' : null, email: null, organisation: null, modeles: [], efforts: [], modes: [], reprise: false, images: false, mcpHttp: false, mcp: [], erreur: null };
  if (!cmd.present) {
    resultat.erreur = 'binaire absent';
    return resultat;
  }
  fs.mkdirSync(cwd, { recursive: true });
  const rpc = connecterAgent({
    commande: cmd,
    env: envPour(compte),
    cwd,
    surRequete: async (method) => {
      if (method === 'session/request_permission') return { outcome: { outcome: 'cancelled' } };
      throw new ErreurRpc(METHODE_INCONNUE, 'découverte : aucune action');
    },
  });
  try {
    const init = await rpc.demander('initialize', parametresInit(), { delaiMs: 30000 });
    const caps = init?.agentCapabilities || {};
    resultat.reprise = !!caps.loadSession;
    resultat.images = !!caps.promptCapabilities?.image;
    resultat.mcpHttp = !!caps.mcpCapabilities?.http;
    const s = lireSession(await nouvelleSession(rpc, init, { compte, agent, cwd, mcpServers: [] }));
    resultat.modeles = s.modeles.map((m) => ({ ...m, niveau: agent?.niveaux?.[m.id] || null, efforts: s.efforts }));
    resultat.efforts = s.efforts;
    resultat.modes = s.modes;
    retenir(compte.id, { modeles: resultat.modeles, efforts: s.efforts, modes: s.modes, reprise: resultat.reprise, images: resultat.images, mcpHttp: resultat.mcpHttp });
  } catch (e) {
    resultat.erreur = String(e?.message || e).slice(0, 600);
  } finally {
    rpc.tuer();
    await Promise.race([rpc.fin, new Promise((r) => setTimeout(r, 3000).unref())]);
  }
  return resultat;
}

// ---------------------------------------------------------------- sessions

let compteurSessions = 0;
const classerErreur = (message) => {
  const m = String(message || '');
  if (/not logged in|unauthori[sz]ed|\b401\b|invalid api key|incorrect api key|authentication|auth[_ ]required|login required|please log ?in/i.test(m)) return 'authentication_failed';
  if (/usage[_ ]limit|rate[_ ]?limit|\b429\b|too many requests|quota exceeded/i.test(m)) return 'rate_limit';
  if (/billing|insufficient[_ ]quota|payment required|\b402\b|credits? exhausted/i.test(m)) return 'billing_error';
  return null;
};
const texteDe = (c) => (c?.type === 'text' ? String(c.text || '') : '');
const OUTIL_PAR_SORTE = { read: 'Read', search: 'Grep', edit: 'Edit', delete: 'Edit', move: 'Edit', execute: 'Bash', fetch: 'WebFetch', think: 'Réflexion', switch_mode: 'Mode' };
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const SHELLS = /^(bash|sh|zsh|dash|fish|cmd|powershell|pwsh)(\.exe)?$/i;
const motifEnv = (m) => new RegExp('^' + m.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
// calculé au premier usage : profils.js peut ne pas être évalué encore (cycle comptes ↔ fournisseurs ↔ acp)
let exclus = null;
const exclu = (nomVar) => (exclus ||= EXCLUSIONS_ENV.map(motifEnv)).some((re) => re.test(nomVar));

/** Commande lisible et comparable aux règles du QG : le script d'un shell (-c), sinon binaire (nom court) + arguments. */
export function commandeVisee(command, args = []) {
  const a = (args || []).map(String);
  const base = path.basename(String(command || ''));
  if (SHELLS.test(base) && a.length >= 2 && /^(-c|-lc|-ic|\/c|-command)$/i.test(a[a.length - 2])) return a[a.length - 1];
  if (!a.length) return String(command || '');
  const court = path.isAbsolute(String(command)) ? base.replace(/\.(exe|cmd|bat|com)$/i, '') : String(command);
  return [court, ...a].map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ');
}

/**
 * Session ACP, pour tous les rôles. Mêmes arguments que l'adaptateur Codex (`demande` : role, lectureSeule,
 * profil, cwd, dossiersSup, pieces, consignes, schema, outilsQg, mcp, skills, titre, canUseTool).
 * Sortie structurée : outil MCP `rendre_resultat` du QG (vérifié contre le schéma), sinon JSON du dernier
 * message ; invalide → une relance dans la même session avec les erreurs.
 * Reprise : options.resume par session/load si l'agent la propose (jamais pour un fork) ; sinon nouvelle
 * session (avertissement). Complément injecté : session/cancel puis nouveau message dans la même session.
 */
export async function lancer({ prompt, images = [], options = {}, compte, compteObj, demande = null, surInit, surOutil, surActivite, surImage, surCommande, surModification, surPensee, canal, conso = {} }) {
  const meta = { role: 'autre', ...conso, compte: compte || compteObj?.id };
  const sortie = { result: null, structure: null, sessionId: options.resume || null, init: null, erreur: null, limite: null, exception: null, contexte: null, modeleReel: null, compte: meta.compte, fournisseur: 'acp', refus: [], avertissements: [] };
  if (canal) canal.injecter = async () => false;
  if (!demande) {
    sortie.erreur = 'role_non_pris_en_charge';
    sortie.exception = t('un agent ACP ne peut pas tenir le rôle « {role} » sans demande', { role: meta.role });
    return sortie;
  }
  const { lectureSeule, profil } = profilDemande(demande);
  const systeme = typeof options.systemPrompt === 'string' ? options.systemPrompt : options.systemPrompt?.append || '';
  demande = { ...demande, profil, consignes: demande.consignes ?? systeme };
  const garantie = profilGaranti('acp', profil);
  if (garantie.statut === 'refuse') {
    sortie.erreur = 'profil_refuse';
    sortie.exception = t('profil {profil} refusé sur un agent ACP : {motif}', { profil, motif: garantie.motif });
    return sortie;
  }
  const agent = agentDe(compteObj);
  const cmd = commandeAgent(agent);
  if (!agent || !cmd.present) {
    sortie.erreur = 'binaire_absent';
    sortie.exception = agent ? t('{nom} introuvable sur ce PC ({installation})', { nom: agent.nomCourt, installation: agent.installation ? t(agent.installation) : t('installe l’agent') }) : t('agent ACP inconnu pour ce compte');
    return sortie;
  }
  const signal = options.abortController?.signal || null;
  if (signal?.aborted) {
    sortie.exception = t('interrompue avant le lancement');
    return sortie;
  }
  const reprise = options.forkSession ? null : options.resume || null;
  if (options.forkSession) sortie.sessionId = null;

  const cle = `${Date.now().toString(36)}-${process.pid}-${++compteurSessions}`;
  const cwd = path.resolve(demande.cwd || options.cwd || RACINE);
  const resoudre = (p) => path.resolve(cwd, String(p));
  const env = envPour(compteObj);
  const flux = fluxPensees(surPensee);
  const schema = options.outputFormat?.schema || demande.schema || null;
  const { copies: skillsCopies, dossier: dossierSkills } = copierSkills(demande, cle);
  const zones = zonesAcp({ cwd, dossiersSup: demande.dossiersSup || [], pieces: demande.pieces || null, skills: dossierSkills, profil, lectureSeule, comptes: chargerComptes().comptes.map((c) => ({ ...c, configDir: dossierDuCompte(c) })) });
  const regles = reglesProfils();
  const canUseTool = lectureSeule ? null : demande.canUseTool || options.canUseTool || null;
  const filtreActif = (demande.filtreTests ?? REGLAGES.filtreTests) !== false;

  // outils du QG (ceux du DG compris) + outil de sortie structurée, par MCP
  let soumis;
  const definitions = [...(demande.outilsQg?.definitions || [])];
  if (schema) definitions.push(outilSoumission(schema, (v) => (soumis = v)));
  const outilsQg = definitions.map((d) => d.nom);
  const adresse = adresseMcp();
  const jeton = definitions.length && adresse ? creerJetonMcp(definitions) : null;

  // ---- état de la session
  const appels = new Map(); // toolCallId → appel fusionné (tool_call + tool_call_update)
  const terminaux = new Map();
  const ecritsParQg = new Map(); // fichier → contenu écrit par fs/write_text_file (pas de diff en double)
  const horsZoneAccordes = new Set();
  const enAttente = new Set(); // demandes de permission en cours : réponse « cancelled » à l'annulation
  let sessionId = null;
  let rejeu = false;
  let dernierMessage = '';
  let phase = null;
  let usageTour = null;
  let coutConnu = 0;
  let planVu = false;
  let complement = null;
  let fini = false;
  let compteurTerminaux = 0;
  let minuteurArret = null;
  let annulationPrompt = new AbortController();

  const noterErreur = (message) => {
    if (!message) return;
    sortie.exception = String(message).slice(0, 2000);
    const e = classerErreur(message);
    if (e) sortie.erreur = e;
    if (e === 'rate_limit') sortie.limite = { resetsAt: null, type: agent.id };
  };
  const noterRefus = (sorte, motif, cible) => {
    sortie.refus.push({ sorte, motif: String(motif || 'refusé'), cible: String(cible || '').slice(0, 400), t: Date.now() });
    if (sortie.refus.length > 50) sortie.refus.shift();
  };
  const changerPhase = (p, extra = {}) => {
    if (phase === p) return;
    flux.finBloc();
    phase = p;
    flux.debutBloc(p, extra);
  };
  const fermerPhase = () => {
    flux.finBloc();
    phase = null;
  };

  // ---- diffs
  const emettreModif = (fichier, avant, apres, outil) => {
    if (!surModification) return;
    let mod;
    if (avant == null || avant === '') mod = modificationDe({ filePath: fichier, type: 'create', content: apres ?? '', structuredPatch: [], originalFile: null }, 'Write', cwd);
    else {
      const patch = diffLignes(avant, apres ?? '');
      if (patch == null) {
        mod = modificationDe({ filePath: fichier, type: 'update', structuredPatch: [], originalFile: '' }, outil, cwd);
        mod.incomplet = true;
      } else mod = modificationDe({ filePath: fichier, type: 'update', structuredPatch: patch, originalFile: avant }, outil, cwd);
    }
    try {
      surModification(mod);
    } catch (e) {
      console.error('modification', e.message);
    }
  };

  // ---- traduction des appels d'outils de l'agent
  const nomOutil = (appel) => {
    const titre = String(appel.title || '');
    const qg = outilsQg.find((n) => new RegExp(`(^|[^A-Za-z0-9_])${n}([^A-Za-z0-9_]|$)`).test(titre));
    if (qg) return `mcp__qg__${qg}`;
    return OUTIL_PAR_SORTE[appel.kind] || 'Outil';
  };
  const entreeOutil = (appel) => {
    const ri = appel.rawInput && typeof appel.rawInput === 'object' ? appel.rawInput : {};
    const chemin = cheminsDe(appel)[0];
    return { ...ri, file_path: chemin, command: commandeDeAppel(appel), pattern: ri.pattern || ri.query || appel.title, url: ri.url, query: ri.query };
  };
  const cheminsDe = (appel) => {
    const l = new Set();
    const ajouter = (p) => {
      if (typeof p === 'string' && p.trim()) l.add(resoudre(p.trim()));
    };
    for (const loc of appel.locations || []) ajouter(loc?.path);
    for (const c of appel.content || []) if (c?.type === 'diff') ajouter(c.path);
    const ri = appel.rawInput && typeof appel.rawInput === 'object' ? appel.rawInput : {};
    for (const k of ['path', 'file_path', 'filePath', 'abs_path', 'absolute_path', 'notebook_path', 'old_path', 'new_path', 'destination']) ajouter(ri[k]);
    if (Array.isArray(ri.paths)) ri.paths.forEach(ajouter);
    return [...l];
  };
  const commandeDeAppel = (appel) => {
    const ri = appel.rawInput && typeof appel.rawInput === 'object' ? appel.rawInput : {};
    const c = ri.command ?? ri.cmd;
    if (Array.isArray(c)) return commandeVisee(c[0], c.slice(1));
    if (typeof c === 'string' && c.trim()) return Array.isArray(ri.args) ? commandeVisee(c, ri.args) : c.trim();
    return String(appel.title || '').replace(/`/g, '').trim();
  };
  const fusionner = (maj) => {
    const idAppel = maj.toolCallId || `anonyme-${appels.size}`;
    const avant = appels.get(idAppel) || { toolCallId: idAppel, content: [], locations: [], emis: false, diffsEmis: false };
    const apres = { ...avant };
    for (const k of ['title', 'kind', 'status', 'rawInput', 'rawOutput']) if (maj[k] !== undefined && maj[k] !== null) apres[k] = maj[k];
    if (Array.isArray(maj.content)) apres.content = maj.content;
    if (Array.isArray(maj.locations)) apres.locations = maj.locations;
    appels.set(idAppel, apres);
    return apres;
  };
  const surAppel = (appel) => {
    if (!appel.emis && (appel.title || appel.kind)) {
      appel.emis = true;
      const n = nomOutil(appel);
      surOutil?.(n, cibleOutil(n, entreeOutil(appel), cwd));
      changerPhase('outil', { outil: n });
      fermerPhase();
    }
    if (appel.status === 'completed' && !appel.diffsEmis) {
      appel.diffsEmis = true;
      for (const c of appel.content || []) {
        if (c?.type === 'diff' && c.path) {
          const fichier = resoudre(c.path);
          if (ecritsParQg.has(fichier) && ecritsParQg.get(fichier) === (c.newText ?? '')) continue;
          emettreModif(fichier, c.oldText ?? null, c.newText ?? '', c.oldText == null || c.oldText === '' ? 'Write' : 'Edit');
        } else if (c?.type === 'content' && c.content?.type === 'image' && c.content.data && surImage) {
          surImage(c.content.data, c.content.mimeType || 'image/png', nomOutil(appel));
        }
      }
    }
  };

  const surNotification = (method, params) => {
    if (method !== 'session/update' || rejeu) return;
    if (params.sessionId && sessionId && params.sessionId !== sessionId) return;
    const u = params.update || {};
    surActivite?.();
    signalerActivite();
    switch (u.sessionUpdate) {
      case 'agent_thought_chunk': {
        const tx = texteDe(u.content);
        if (!tx) return;
        changerPhase('reflexion');
        flux.ajout(tx);
        return;
      }
      case 'agent_message_chunk': {
        const tx = texteDe(u.content);
        if (!tx) return;
        if (phase !== 'redaction' && phase !== 'rapport') changerPhase(schema && /^\s*(```(json)?\s*)?[{[]/.test(dernierMessage + tx) && !dernierMessage.trim() ? 'rapport' : 'redaction');
        dernierMessage += tx;
        flux.ajout(tx);
        return;
      }
      case 'tool_call':
      case 'tool_call_update':
        surAppel(fusionner(u));
        return;
      case 'plan':
        if (!planVu) surOutil?.('TodoWrite', cibleOutil('TodoWrite', {}, cwd));
        planVu = true;
        return;
      case 'usage_update': {
        if (Number.isFinite(u.used)) sortie.contexte = u.used;
        const montant = Number(u.cost?.amount);
        if (Number.isFinite(montant) && String(u.cost?.currency || '').toUpperCase() === 'USD') {
          enregistrerCout(meta, montant - coutConnu);
          coutConnu = Math.max(coutConnu, montant);
        }
        return;
      }
      default:
        return;
    }
  };

  // ---- demandes de l'agent au QG
  const decider = (a) => decisionAcp({ lectureSeule, profil, zones, regles, reglages: REGLAGES, outilsQg, ...a });
  // Écriture hors des dossiers de la tâche : la même carte que pour Claude (canUseTool), jamais en lecture seule.
  const mainLevee = async (chemin) => {
    if (!canUseTool || !chemin) return false;
    if (horsZoneAccordes.has(chemin)) return true;
    const outil = fs.existsSync(chemin) ? 'Edit' : 'Write';
    const entree = outil === 'Edit' ? { file_path: chemin, old_string: '', new_string: '' } : { file_path: chemin, content: '' };
    const sig = annulationPrompt.signal;
    let r;
    try {
      r = await Promise.race([
        canUseTool(outil, entree, { signal: sig, suggestions: [], blockedPath: chemin }),
        new Promise((res) => sig.addEventListener('abort', () => res({ behavior: 'deny', message: 'annulé' }), { once: true })),
      ]);
    } catch {
      r = null;
    }
    if (r?.behavior === 'allow') horsZoneAccordes.add(chemin);
    return r?.behavior === 'allow';
  };
  const accordPour = async (d, chemins) => {
    if (d.decision === 'accord') return true;
    if (d.decision !== 'demander') return false;
    for (const c of chemins) {
      if (decider({ sorte: 'ecriture', chemins: [c] }).decision === 'accord') continue;
      if (!(await mainLevee(c))) return false;
    }
    return true;
  };

  async function permission(params) {
    const appel = fusionner(params.toolCall || {});
    surAppel(appel);
    if (annulationPrompt.signal.aborted || signal?.aborted) return { outcome: { outcome: 'cancelled' } };
    const sorte = sorteDe(appel.kind);
    const chemins = cheminsDe(appel);
    const ri = appel.rawInput && typeof appel.rawInput === 'object' ? appel.rawInput : {};
    const commandeTexte = sorte === 'execution' ? commandeDeAppel(appel) : null;
    const d = decider({ sorte, chemins, commande: commandeTexte, cwdCommande: sorte === 'execution' ? (ri.cwd ? resoudre(ri.cwd) : cwd) : null, titre: appel.title || '' });
    const jeton = { annuler: null };
    const attente = new Promise((res) => (jeton.annuler = () => res('annule')));
    enAttente.add(jeton);
    let accord;
    try {
      const r = await Promise.race([accordPour(d, chemins), attente]);
      if (r === 'annule') return { outcome: { outcome: 'cancelled' } };
      accord = r;
    } finally {
      enAttente.delete(jeton);
    }
    if (!accord) noterRefus(sorte, d.motif || 'refusé', commandeTexte || chemins[0] || appel.title);
    return optionPour(params.options || [], accord);
  }

  function lireFichier(params) {
    const chemin = resoudre(params.path);
    const d = decider({ sorte: 'lecture', chemins: [chemin] });
    if (d.decision !== 'accord') {
      noterRefus('lecture', d.motif, chemin);
      throw new ErreurRpc(-32000, `refusé par le QG : ${d.motif}`);
    }
    let contenu;
    try {
      contenu = fs.readFileSync(chemin, 'utf8');
    } catch (e) {
      throw new ErreurRpc(-32002, `fichier illisible : ${e.code || e.message}`);
    }
    if (params.line || params.limit) {
      const lignes = contenu.split('\n');
      const debut = Math.max(0, (Number(params.line) || 1) - 1);
      contenu = lignes.slice(debut, params.limit ? debut + Number(params.limit) : undefined).join('\n');
    }
    return { content: contenu };
  }

  async function ecrireFichier(params) {
    const chemin = resoudre(params.path);
    const d = decider({ sorte: 'ecriture', chemins: [chemin] });
    if (!(await accordPour(d, [chemin]))) {
      noterRefus('ecriture', d.motif || 'refusé', chemin);
      throw new ErreurRpc(-32000, `refusé par le QG : ${d.motif || 'écriture refusée'}`);
    }
    let avant = null;
    try {
      avant = fs.readFileSync(chemin, 'utf8');
    } catch {
      /* nouveau fichier */
    }
    const contenu = String(params.content ?? '');
    fs.mkdirSync(path.dirname(chemin), { recursive: true });
    fs.writeFileSync(chemin, contenu);
    ecritsParQg.set(chemin, contenu);
    const outil = avant == null ? 'Write' : 'Edit';
    surOutil?.(outil, cibleOutil(outil, { file_path: chemin }, cwd));
    emettreModif(chemin, avant, contenu, outil);
    return null;
  }

  // ---- terminal du QG : seule voie des commandes demandées par l'agent
  const envTerminal = (demandes = []) => {
    const e = {};
    for (const [k, v] of Object.entries(env)) if (!exclu(k)) e[k] = v;
    for (const v of Array.isArray(demandes) ? demandes : []) if (v?.name && !exclu(v.name)) e[v.name] = String(v.value ?? '');
    return e;
  };
  function creerTerminal(params) {
    const commandeTexte = commandeVisee(params.command, params.args || []);
    const cwdC = params.cwd ? resoudre(params.cwd) : cwd;
    const exe = String(params.command || '');
    const d = decider({ sorte: 'execution', commande: commandeTexte, cwdCommande: cwdC, chemins: path.isAbsolute(exe) ? [exe] : [] });
    if (d.decision !== 'accord') {
      noterRefus('execution', d.motif, commandeTexte);
      throw new ErreurRpc(-32000, `refusé par le QG : ${d.motif}`);
    }
    const idT = `T${++compteurTerminaux}`;
    const limite = Math.max(1000, Number(params.outputByteLimit) || 1_000_000);
    const tm = { id: idT, sortie: '', tronque: false, etat: null, proc: null, test: filtreActif && estCommandeTest(commandeTexte) };
    const ajouter = (m) => {
      tm.sortie += m;
      if (Buffer.byteLength(tm.sortie) > limite) {
        tm.sortie = tm.sortie.slice(-Math.floor(limite / 2));
        tm.tronque = true;
      }
    };
    const envC = envTerminal(params.env);
    const demarrer = (avecShell) => {
      const a = (params.args || []).map(String);
      const p = avecShell
        ? spawn(a.length ? [exe, ...a].map((x) => (/[\s"]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x)).join(' ') : exe, { cwd: cwdC, env: envC, shell: true, windowsHide: true })
        : spawn(exe, a, { cwd: cwdC, env: envC, windowsHide: true });
      p.stdout?.setEncoding('utf8');
      p.stderr?.setEncoding('utf8');
      p.stdout?.on('data', ajouter);
      p.stderr?.on('data', ajouter);
      return p;
    };
    tm.fin = new Promise((resolve) => {
      const brancher = (p, essaiShell) => {
        tm.proc = p;
        p.on('error', (e) => {
          if (!essaiShell && e.code === 'ENOENT' && plateforme.estWindows()) return brancher(demarrer(true), true);
          ajouter(`\n${e.message}\n`);
          tm.etat = { exitCode: 127, signal: null };
          resolve(tm.etat);
        });
        p.on('close', (code, sig) => {
          if (tm.etat) return;
          tm.etat = { exitCode: code, signal: sig || null };
          resolve(tm.etat);
        });
      };
      brancher(demarrer(!(params.args || []).length), !(params.args || []).length);
    });
    terminaux.set(idT, tm);
    surOutil?.('Bash', cibleOutil('Bash', { command: commandeTexte }, cwd));
    surCommande?.({ id: idT, commande: commandeTexte.slice(0, 4000), description: '', debut: Date.now(), enCours: true });
    tm.fin.then((r) => surCommande?.({ id: idT, sortie: finDe(tm.sortie, 6000), erreur: r.exitCode !== 0, fin: Date.now(), enCours: false }));
    return { terminalId: idT };
  }
  const terminal = (params) => {
    const tm = terminaux.get(params.terminalId);
    if (!tm) throw new ErreurRpc(-32602, `terminal inconnu : ${params.terminalId}`);
    return tm;
  };
  const sortieTerminal = (tm) => (tm.test && tm.etat ? filtrer(tm.sortie) : tm.sortie);
  const tuerTerminal = (tm) => {
    if (!tm.etat && tm.proc?.pid) plateforme.tuerArbre(tm.proc.pid);
  };

  const surRequete = async (method, params) => {
    surActivite?.();
    switch (method) {
      case 'session/request_permission':
        return permission(params);
      case 'fs/read_text_file':
        return lireFichier(params);
      case 'fs/write_text_file':
        return ecrireFichier(params);
      case 'terminal/create':
        return creerTerminal(params);
      case 'terminal/output': {
        const tm = terminal(params);
        return { output: sortieTerminal(tm), truncated: tm.tronque, ...(tm.etat ? { exitStatus: tm.etat } : {}) };
      }
      case 'terminal/wait_for_exit':
        return terminal(params).fin;
      case 'terminal/kill':
        tuerTerminal(terminal(params));
        return null;
      case 'terminal/release': {
        const tm = terminal(params);
        tuerTerminal(tm);
        terminaux.delete(params.terminalId);
        return null;
      }
      default:
        throw new ErreurRpc(METHODE_INCONNUE, `méthode non prise en charge par le QG : ${method}`);
    }
  };

  // ---- message envoyé à l'agent
  const blocsImages = (caps) => {
    if (!images?.length) return { blocs: [], note: '' };
    if (!caps.promptCapabilities?.image) return { blocs: [], note: `\n\n(${images.length} image(s) jointe(s) non transmise(s) : cet agent ne prend pas les images.)` };
    const blocs = [];
    for (const img of images) {
      try {
        if (typeof img === 'string') {
          const mime = MIME[path.extname(img).toLowerCase()];
          if (mime) blocs.push({ type: 'image', data: fs.readFileSync(img).toString('base64'), mimeType: mime });
        } else if (img?.source?.data) blocs.push({ type: 'image', data: img.source.data, mimeType: img.source.media_type || 'image/png' });
        else if (img?.data) blocs.push({ type: 'image', data: img.data, mimeType: img.mimeType || 'image/png' });
      } catch (e) {
        console.error('image', e.message);
      }
    }
    return { blocs, note: '' };
  };

  const rpc = connecterAgent({ commande: cmd, env, cwd, surRequete, surNotification });
  const annulerEnCours = () => {
    annulationPrompt.abort();
    for (const j of enAttente) j.annuler();
    if (sessionId) rpc.notifier('session/cancel', { sessionId });
  };
  const surAbort = () => {
    annulerEnCours();
    minuteurArret = setTimeout(() => rpc.tuer(), 3000);
    minuteurArret.unref?.();
  };
  signal?.addEventListener('abort', surAbort, { once: true });
  if (canal) {
    canal.injecter = async (texte) => {
      if (fini || !sessionId) return false;
      complement = complement ? `${complement}\n\n${texte}` : texte;
      annulerEnCours();
      return true;
    };
  }

  let relances = 0;
  let lu = null;
  try {
    const init = await rpc.demander('initialize', parametresInit(), { delaiMs: 60000 });
    if (Number(init?.protocolVersion) !== 1) throw new Error(t('version ACP non prise en charge : {version}', { version: init?.protocolVersion }));
    const caps = init?.agentCapabilities || {};
    retenir(compteObj.id, { reprise: !!caps.loadSession, images: !!caps.promptCapabilities?.image, mcpHttp: !!caps.mcpCapabilities?.http });

    // serveurs MCP : le QG (HTTP si l'agent sait, sinon pont stdio), puis ceux de la demande (hors lecture seule)
    const mcpServers = [];
    if (jeton) {
      mcpServers.push(caps.mcpCapabilities?.http
        ? { type: 'http', name: 'qg', url: adresse, headers: [{ name: 'Authorization', value: `Bearer ${jeton}` }] }
        : { name: 'qg', command: plateforme.nodeOuCourant(), args: [PONT_MCP, adresse], env: [{ name: 'QG_MCP_JETON', value: jeton }] });
    }
    if (!lectureSeule) {
      for (const [n, def] of Object.entries(demande.mcp || {})) {
        if (n === 'qg' || !/^[A-Za-z0-9_-]+$/.test(n) || !def || typeof def !== 'object') continue;
        if (def.url && caps.mcpCapabilities?.http) mcpServers.push({ type: 'http', name: n, url: String(def.url), headers: Object.entries(def.headers || {}).map(([name, value]) => ({ name, value: String(value) })) });
        else if (def.command) mcpServers.push({ name: n, command: String(def.command), args: (def.args || []).map(String), env: Object.entries(def.env || {}).map(([name, value]) => ({ name, value: String(value) })) });
        else sortie.avertissements.push(t(`serveur MCP {nom} ignoré : l'agent ne prend pas le MCP HTTP`, { nom: n }));
      }
    }

    // session : reprise (session/load, historique rejoué sans rien afficher) ou nouvelle
    let infos = null;
    let reprisReussie = false;
    if (reprise && caps.loadSession) {
      rejeu = true;
      try {
        infos = (await rpc.demander('session/load', { sessionId: reprise, cwd, mcpServers }, { delaiMs: 120000 })) || {};
        sessionId = reprise;
        reprisReussie = true;
      } catch (e) {
        if (e.fermeture) throw e;
        sortie.avertissements.push(t('reprise impossible ({raison}) : nouvelle session', { raison: String(e.message).slice(0, 200) }));
      } finally {
        rejeu = false;
      }
    } else if (reprise) sortie.avertissements.push(t(`reprise non proposée par l'agent : nouvelle session`));
    if (!sessionId) {
      infos = await nouvelleSession(rpc, init, { compte: compteObj, agent, cwd, mcpServers });
      sessionId = infos?.sessionId;
      if (!sessionId) throw new Error(t(`l'agent n'a pas donné d'identifiant de session`));
    }
    sortie.sessionId = sessionId;
    const s = lireSession(infos);
    if (s.modeles.length || s.efforts.length) retenir(compteObj.id, { modeles: s.modeles.map((m) => ({ ...m, niveau: agent.niveaux?.[m.id] || null, efforts: s.efforts })), efforts: s.efforts, modes: s.modes });

    // mode : jamais un mode qui saute les demandes du QG
    const mode = choisirMode({ modes: s.modes, agent, lectureSeule });
    if (mode && mode !== s.modeCourant) {
      try {
        if (s.options.mode) await rpc.demander('session/set_config_option', { sessionId, configId: s.options.mode, value: mode }, { delaiMs: 30000 });
        else await rpc.demander('session/set_mode', { sessionId, modeId: mode }, { delaiMs: 30000 });
        s.modeCourant = mode;
      } catch (e) {
        if (e.fermeture) throw e;
        sortie.avertissements.push(t(`mode {mode} refusé par l'agent`, { mode }));
      }
    }
    if (modeDangereux(s.modeCourant)) {
      sortie.erreur = 'profil_refuse';
      throw new Error(t(`mode « {mode} » de l'agent : il agirait sans demander, le QG refuse`, { mode: s.modeCourant }));
    }

    // modèle et effort choisis par le QG (jamais en dessous de la demande ; inconnu → défaut de l'agent)
    const modele = convertirModele(compteObj, options.model || demande.modele);
    if (modele && modele !== s.modeleCourant) {
      try {
        if (s.options.modele) await rpc.demander('session/set_config_option', { sessionId, configId: s.options.modele, value: modele }, { delaiMs: 30000 });
        else await rpc.demander('session/set_model', { sessionId, modelId: modele }, { delaiMs: 30000 });
        s.modeleCourant = modele;
      } catch (e) {
        if (e.fermeture) throw e;
        sortie.avertissements.push(t(`modèle {modele} refusé par l'agent`, { modele }));
      }
    }
    const effort = s.options.effort ? convertirEffort(compteObj, s.modeleCourant || modele, options.effort || demande.effort || null) : null;
    if (effort && effort !== s.effortCourant) {
      try {
        await rpc.demander('session/set_config_option', { sessionId, configId: s.options.effort, value: effort }, { delaiMs: 30000 });
      } catch (e) {
        if (e.fermeture) throw e;
        sortie.avertissements.push(t(`effort {effort} refusé par l'agent`, { effort }));
      }
    }
    sortie.modeleReel = s.modeleCourant || null;
    sortie.init = { type: 'system', subtype: 'init', session_id: sessionId, model: sortie.modeleReel || agent.id, tools: [] };
    surInit?.(sortie.init);

    // tours : message, puis compléments injectés, puis relance de la sortie structurée
    const img = blocsImages(caps);
    const avecConsignes = consignesQg({ ...demande, schema }, skillsCopies, { outils: jeton ? outilsQg : null, soumission: !!(jeton && schema), schemaEnClair: true });
    let texte = reprisReussie ? prompt : `${avecConsignes}\n\n${prompt}`;
    let premier = true;
    for (;;) {
      dernierMessage = '';
      annulationPrompt = new AbortController();
      const contenu = [{ type: 'text', text: premier ? texte + img.note : texte }, ...(premier ? img.blocs : [])];
      premier = false;
      let r;
      try {
        r = await rpc.demander('session/prompt', { sessionId, prompt: contenu });
      } catch (e) {
        fermerPhase();
        if (signal?.aborted) {
          sortie.exception = t('session interrompue');
          break;
        }
        throw e;
      }
      fermerPhase();
      const u = r?.usage;
      if (u) {
        const n = (x) => Number(x) || 0;
        usageTour = {
          input_tokens: n(u.inputTokens ?? u.input_tokens),
          output_tokens: n(u.outputTokens ?? u.output_tokens) + n(u.thoughtTokens ?? u.thought_tokens),
          cache_read_input_tokens: n(u.cachedReadTokens ?? u.cached_read_tokens),
          cache_creation_input_tokens: n(u.cachedWriteTokens ?? u.cached_write_tokens),
        };
        enregistrerAppel(meta, usageTour, sortie.modeleReel || agent.id, true);
        signalerActivite();
        if (!sortie.contexte) sortie.contexte = n(u.totalTokens ?? u.total_tokens) || null;
      }
      if (signal?.aborted) {
        sortie.exception = t('session interrompue');
        break;
      }
      if (complement) {
        texte = complement;
        complement = null;
        continue;
      }
      const raison = r?.stopReason;
      if (raison === 'refusal') {
        noterErreur(t(`l'agent a refusé de continuer`));
        break;
      }
      if (raison === 'max_tokens' || raison === 'max_turn_requests') {
        noterErreur(t(`l'agent s'est arrêté avant la fin ({raison})`, { raison }));
        break;
      }
      if (raison === 'cancelled') {
        noterErreur(t(`l'agent a annulé le tour`));
        break;
      }
      if (schema) {
        lu = soumis !== undefined ? { structure: soumis, erreurs: [] } : lireStructure(dernierMessage, schema);
        if (!lu.structure && relances < RELANCES_STRUCTURE) {
          relances += 1;
          texte = consigneRelance(lu.erreurs);
          continue;
        }
      }
      break;
    }
    if (!sortie.erreur && !sortie.exception) {
      const structure = schema ? lu?.structure ?? null : null;
      if (schema && !structure) sortie.erreursStructure = lu?.erreurs || [];
      sortie.relancesStructure = relances;
      sortie.structure = structure;
      sortie.result = { type: 'result', subtype: 'success', is_error: false, result: dernierMessage, structured_output: structure, usage: usageTour, session_id: sessionId };
    }
  } catch (e) {
    if (signal?.aborted) sortie.exception = t('session interrompue');
    else {
      noterErreur(String(e?.message || e));
      if (e?.auth) sortie.erreur = 'authentication_failed';
    }
  } finally {
    fini = true;
    clearTimeout(minuteurArret);
    signal?.removeEventListener?.('abort', surAbort);
    for (const j of enAttente) j.annuler();
    for (const tm of terminaux.values()) tuerTerminal(tm);
    flux.terminer();
    if (canal) canal.injecter = async () => false;
    await rpc.fermer(3000);
    revoquerJetonMcp(jeton);
    if (dossierSkills) fs.rmSync(dossierSkills, { recursive: true, force: true });
  }
  if (!sortie.avertissements.length) delete sortie.avertissements;
  return sortie;
}
