// Adaptateur Claude : le code de référence du QG (SDK Agent de Claude Code), déplacé ici depuis session.js
// et comptes.js sans changer de comportement. Les sessions tournent en mode « streaming input » : on peut
// leur envoyer un complément en cours de route (interruption puis nouveau message, la conversation garde
// tout son contexte). Le QG ne lit, ne copie ni ne stocke aucun jeton : seul le binaire officiel les voit.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as plateforme from '../plateforme.js';
import { enregistrerAppel, enregistrerCout, enregistrerCompaction, majLimiteEvenement, signalerActivite } from '../conso.js';
import { suiviPensees } from '../pensees.js';
import { cibleOutil, modificationDe, texteResultat, finDe } from './commun.js';
import { t } from '../i18n.js';
import { envSessionPour, mesurerContexteFixe } from '../economie.js';

export const id = 'claude';
export const nom = 'Claude';
export const nomCourt = 'Claude';
export const acces = ['abonnement', 'cle'];
export const connexions = ['navigateur'];
export const FORMAT_CLE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;
export const ERREUR_CLE = 'clé API invalide (elle commence par sk-ant-)';

// Claude Code livré par le SDK, pour la plateforme et le processeur de ce poste.
export const CLAUDE_EXE = plateforme.claudeExe();
export const binaire = () => CLAUDE_EXE;
export const binairePresent = () => fs.existsSync(CLAUDE_EXE);

export const dossierParDefaut = (compteId) => path.join(os.homedir(), '.claude-qg', compteId);
export const dossierConfig = (compte) => compte.configDir || path.join(os.homedir(), '.claude');

// Les sessions héritent sinon des variables de l'app desktop (jeton hôte, proxy, ids de session),
// ce qui les ferait tourner avec l'authentification de l'app au lieu de celle du compte choisi.
// On retire donc tout ce qui commence par CLAUDE ou ANTHROPIC, y compris ANTHROPIC_API_KEY
// (facturation au token) puis on pose uniquement le dossier de config du compte.
export function envPour(compte) {
  const env = {};
  for (const [cle, val] of Object.entries(process.env)) {
    if (/^(CLAUDE|ANTHROPIC)/i.test(cle)) continue;
    env[cle] = val;
  }
  if (compte?.configDir) env.CLAUDE_CONFIG_DIR = compte.configDir;
  // Compte « clé API » : facturé au token par Anthropic, sans connexion par navigateur.
  if (compte?.cleApi) env.ANTHROPIC_API_KEY = compte.cleApi;
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'qg-agents/1.0';
  return env;
}

// Windows : le fichier .credentials.json du dossier de config. Mac : le jeton est dans le trousseau,
// la plateforme interroge « claude auth status » (en cache) quand le fichier n'existe pas.
export function etatConnexion(compte) {
  if (!compte) return false;
  if (compte.cleApi) return true;
  return plateforme.compteConnecteSelonPlateforme({ configDir: dossierConfig(compte), env: envPour(compte) });
}

// Relecture forcée de l'état de connexion (surveillance d'une connexion en cours, sur Mac).
export async function verifierConnexion(compte) {
  if (!compte) return false;
  if (compte.cleApi) return true;
  await plateforme.rafraichirConnexion({ configDir: dossierConfig(compte), env: envPour(compte) });
  return etatConnexion(compte);
}

// Fichier à surveiller (date de modification, jamais le contenu) pendant une connexion en cours.
export const fichierConnexion = (compte) => plateforme.fichierIdentifiants(dossierConfig(compte));

// Ouvre une fenêtre avec la connexion officielle de Claude Code (page de connexion dans le navigateur).
export function ouvrirConnexion(compte) {
  if (!fs.existsSync(CLAUDE_EXE)) throw new Error(t('Claude Code introuvable : relance {script}', { script: plateforme.script('installer') }));
  fs.mkdirSync(dossierConfig(compte), { recursive: true });
  const script = path.join(plateforme.RACINE, 'serveur', 'connexion.js');
  plateforme.ouvrirTerminal('Connexion', [plateforme.nodeOuCourant(), script, compte.id, 'login', '--pause']);
  return compte;
}

export function deconnecter(compte) {
  return new Promise((resolve) => {
    const p = spawn(CLAUDE_EXE, ['auth', 'logout'], { env: envPour(compte), stdio: 'ignore', windowsHide: true });
    p.on('exit', () => {
      plateforme.oublierConnexion(dossierConfig(compte));
      resolve(!etatConnexion(compte));
    });
    p.on('error', () => resolve(false));
  });
}

// Ce que l'adaptateur sait faire (voir docs/multi-ia/conception.md §2.2).
export function capacites() {
  return {
    profils: { lecture: 'garanti', 'lecture+tests': 'garanti', verif: 'garanti', edition: 'garanti', 'edition+tests': 'garanti', ops: 'garanti' },
    modePrudent: true,
    sortieStructuree: 'native',
    reprise: true,
    fork: true,
    injection: 'native',
    imagesEntree: true,
    images: null,
    mcp: { http: true, stdio: true, demandeParAppel: true },
    // lot B : seuil de compaction, plafond par tâche (maxBudgetUsd), sous-agents (option agents)
    compaction: true,
    plafondBudget: true,
    sousAgents: true,
    // filtre des sorties de tests (crochet PostToolUse), choix du modèle et de l'effort
    filtreTests: true,
    modeles: true,
    effort: true,
    pensees: 'flux',
    cout: 'equivalent-api',
    sessionsParCompte: null,
  };
}

// ---------------------------------------------------------------- sessions

// envSession : variables propres à la session (compaction, cache…), posées après envPour (lot A1).
export function environnement(compte, envSession = {}) {
  const env = { ...envPour(compte), ...envSession };
  const cle = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  // le Node portable en tête du PATH (séparateur « ; » sur Windows, « : » sur Mac)
  env[cle] = plateforme.pathAvecNode(env[cle]);
  return env;
}

// Windows refuse de lancer un programme dont la ligne de commande dépasse 32 767 caractères (spawn ENAMETOOLONG).
// Le SDK y met les réglages de la session (--settings) : en mode auto, les règles « demander » hors des zones,
// une par dossier ou fichier voisin du chemin vers chaque projet, soit des milliers sous un dossier Documents
// chargé. Ces réglages vont donc dans un fichier, nommé d'après son contenu (les sessions identiques le partagent).
export const DOSSIER_REGLAGES = path.join(plateforme.RACINE, 'runtime', 'ia', 'reglages');
const GARDE_REGLAGES_MS = 7 * 24 * 3600 * 1000;

export function reglagesEnFichier(reglages, dossier = DOSSIER_REGLAGES) {
  if (!reglages || typeof reglages !== 'object') return reglages;
  const texte = JSON.stringify(reglages);
  const fichier = path.join(dossier, `${crypto.createHash('sha256').update(texte).digest('hex').slice(0, 20)}.json`);
  if (fs.existsSync(fichier)) {
    const maintenant = new Date();
    fs.utimesSync(fichier, maintenant, maintenant); // encore servi : le ménage le garde
  } else {
    fs.mkdirSync(dossier, { recursive: true });
    const provisoire = `${fichier}.${process.pid}.tmp`;
    fs.writeFileSync(provisoire, texte);
    fs.renameSync(provisoire, fichier); // jamais lu à moitié écrit par une session voisine
  }
  return fichier;
}

// Ménage au démarrage : les fichiers de réglages qu'aucune session n'a servis depuis une semaine.
export function nettoyerReglages(dossier = DOSSIER_REGLAGES, maintenant = Date.now()) {
  let retires = 0;
  let noms = [];
  try {
    noms = fs.readdirSync(dossier);
  } catch {
    return 0;
  }
  for (const nom of noms) {
    const f = path.join(dossier, nom);
    try {
      if (maintenant - fs.statSync(f).mtimeMs > GARDE_REGLAGES_MS) {
        fs.rmSync(f, { force: true });
        retires += 1;
      }
    } catch {
      /* déjà retiré */
    }
  }
  return retires;
}

function messageUtilisateur(texte, blocsImages = []) {
  const content = blocsImages.length ? [...blocsImages, { type: 'text', text: texte }] : texte;
  return { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null };
}

/**
 * Session Claude Code (corps de l'ancien executerSession, à l'identique).
 * @param compteObj  le compte résolu par session.js (objet) ; `compte` reste son identifiant
 * @param canal  objet facultatif rempli avec `injecter(texte)` tant que la session tourne
 * @param surImage rappel (base64, type, outil) pour chaque image reçue dans le résultat d'un outil
 * @returns {Promise<{result, sessionId, init, erreur, limite, exception}>}
 */
export async function lancer({ prompt, images = [], options, compte, compteObj = null, surInit, surOutil, surActivite, surImage, surCommande, surModification, surPensee, surCompaction, surContexte, surSousAgents, canal, conso = {}, envSession = null, compaction = null }) {
  const surFlux = surPensee ? suiviPensees(surPensee) : null;
  const file = [];
  let reveil = null;
  let fini = false;
  let interruptions = 0; // résultats de tours interrompus à ignorer
  let q = null;

  async function* entree() {
    yield messageUtilisateur(prompt, images);
    while (!fini) {
      if (file.length) {
        yield messageUtilisateur(file.shift());
        continue;
      }
      await new Promise((r) => (reveil = r));
      reveil = null;
    }
  }
  const terminerEntree = () => {
    fini = true;
    reveil?.();
  };

  if (canal) {
    // Complément en cours de route : on interrompt le tour courant, puis on envoie le message.
    canal.injecter = async (texte) => {
      if (fini || !q) return false;
      interruptions += 1;
      file.push(texte);
      try {
        await q.interrupt();
      } catch {
        interruptions -= 1; // rien à interrompre : le message passera au tour suivant
      }
      reveil?.();
      return true;
    };
  }

  q = query({
    prompt: entree(),
    options: {
      // Réflexion résumée (lisible) et flux partiel : nécessaires pour les pensées en direct.
      ...(surPensee ? { includePartialMessages: true, thinking: { type: 'adaptive', display: 'summarized' } } : {}),
      ...options,
      ...(options.settings ? { settings: reglagesEnFichier(options.settings) } : {}),
      env: environnement(compteObj, { ...envSessionPour(conso.role, compteObj, { compaction }), ...(envSession || {}) }),
    },
  });
  const outilsParId = new Map();
  const sousAgents = new Set(); // outils Agent en cours (1.0.10 : sous-agents visibles à l'étage)
  const meta = { role: 'autre', ...conso, compte: compte || compteObj?.id };
  // Consommation. Le message assistant n'a que l'usage du début de l'appel (quelques tokens écrits) ;
  // l'usage final arrive dans le flux (message_delta) et, pour tout le tour, dans le message result.
  // On garde le maximum vu pour chaque appel et on n'enregistre que l'écart ; au result, on complète
  // ce qui manque au tour (sessions sans flux partiel).
  const CHAMPS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
  const appelsVus = new Map();
  let tour = {};
  let appelCourant = null;
  let modeleCourant = null;
  let contexteDernier = 0;
  let coutVu = 0;
  const compter = (id, u, modele, principal = true) => {
    if (!id || !u) return;
    const avant = appelsVus.get(id);
    const max = {};
    const delta = {};
    for (const k of CHAMPS) {
      max[k] = Math.max(avant?.[k] || 0, u[k] || 0);
      delta[k] = max[k] - (avant?.[k] || 0);
      tour[k] = (tour[k] || 0) + delta[k];
    }
    appelsVus.set(id, max);
    if (modele && principal) modeleCourant = modele;
    if (principal) {
      contexteDernier = CHAMPS.reduce((s, k) => s + max[k], 0);
      surContexte?.(contexteDernier); // lot C3 : contexte actuel sur la fiche de la tâche
    }
    enregistrerAppel(meta, delta, modele || modeleCourant, !avant);
    signalerActivite();
  };
  const sortie = { result: null, sessionId: options.resume || null, init: null, erreur: null, limite: null, exception: null, compte: meta.compte, fournisseur: 'claude' };
  try {
    for await (const m of q) {
      if (m.session_id && !sortie.sessionId) sortie.sessionId = m.session_id;
      if (m.type === 'stream_event') {
        const ev = m.event || {};
        if (!m.parent_tool_use_id) {
          if (ev.type === 'message_start' && ev.message) {
            appelCourant = ev.message.id;
            compter(appelCourant, ev.message.usage, ev.message.model);
          } else if (ev.type === 'message_delta' && ev.usage) compter(appelCourant, ev.usage, null);
        }
        if (!m.parent_tool_use_id) surFlux?.(ev); // le flux d'un sous-agent couperait les blocs de l'agent
        continue;
      }
      if (m.type === 'system' && m.subtype === 'init') {
        sortie.init = m;
        sortie.sessionId = m.session_id;
        surInit?.(m);
        mesurerContexteFixe(q, conso.role, m.model);
      } else if (m.type === 'system' && m.subtype === 'compact_boundary') {
        // contexte résumé automatiquement (CLAUDE_CODE_AUTO_COMPACT_WINDOW, lot A2)
        const avant = m.compact_metadata?.pre_tokens || 0;
        sortie.compactions = (sortie.compactions || 0) + 1;
        enregistrerCompaction(avant);
        surCompaction?.({ declencheur: m.compact_metadata?.trigger || 'auto', avant });
      } else if (m.type === 'assistant') {
        if (m.error) sortie.erreur = m.error;
        // Les sous-agents d'un agent (outil Task) n'ont pas de flux partiel : leur usage vient d'ici.
        compter(m.message?.id, m.message?.usage, m.message?.model, !m.parent_tool_use_id);
        if (m.parent_tool_use_id) continue;
        surActivite?.();
        for (const b of m.message?.content || []) {
          if (b.type === 'tool_use') {
            outilsParId.set(b.id, b.name);
            if (surSousAgents && (b.name === 'Agent' || b.name === 'Task')) {
              sousAgents.add(b.id);
              surSousAgents(sousAgents.size);
            }
            surOutil?.(b.name, cibleOutil(b.name, b.input, options.cwd));
            if (b.name === 'Bash') surCommande?.({ id: b.id, commande: String(b.input?.command || '').slice(0, 4000), description: b.input?.description || '', debut: Date.now(), enCours: true });
          }
        }
      } else if (m.type === 'user' && !m.parent_tool_use_id) {
        // Edit / Write / MultiEdit : le résultat structuré porte le diff exact (structuredPatch)
        const r = m.tool_use_result;
        if (surModification && r && typeof r === 'object' && Array.isArray(r.structuredPatch) && r.filePath && !r.staged) {
          const res = (Array.isArray(m.message?.content) ? m.message.content : []).find((b) => b?.type === 'tool_result');
          try {
            surModification(modificationDe(r, outilsParId.get(res?.tool_use_id) || 'Edit', options.cwd));
          } catch (e) {
            console.error('modification', e.message);
          }
        }
        for (const b of Array.isArray(m.message?.content) ? m.message.content : []) {
          if (b?.type !== 'tool_result') continue;
          if (sousAgents.delete(b.tool_use_id)) surSousAgents?.(sousAgents.size);
          if (outilsParId.get(b.tool_use_id) === 'Bash') {
            surCommande?.({ id: b.tool_use_id, sortie: finDe(texteResultat(b.content), 6000), erreur: !!b.is_error, fin: Date.now(), enCours: false });
          }
          if (!surImage || !Array.isArray(b.content)) continue;
          for (const c of b.content) {
            if (c?.type === 'image' && c.source?.type === 'base64') surImage(c.source.data, c.source.media_type, outilsParId.get(b.tool_use_id) || 'outil');
          }
        }
      } else if (m.type === 'rate_limit_event') {
        if (m.rate_limit_info?.status === 'rejected') sortie.limite = m.rate_limit_info;
        majLimiteEvenement(meta.compte, m.rate_limit_info);
      } else if (m.type === 'result') {
        // total_cost_usd est cumulé sur la session : on n'ajoute que l'écart.
        if (typeof m.total_cost_usd === 'number') {
          enregistrerCout(meta, m.total_cost_usd >= coutVu ? m.total_cost_usd - coutVu : m.total_cost_usd);
          coutVu = m.total_cost_usd;
        }
        // m.usage = total du tour (tous ses appels) : ce qui n'a pas encore été vu est ajouté maintenant.
        if (m.usage) {
          const manque = {};
          let reste = 0;
          for (const k of CHAMPS) {
            manque[k] = Math.max(0, (m.usage[k] || 0) - (tour[k] || 0));
            reste += manque[k];
          }
          if (reste) enregistrerAppel(meta, manque, modeleCourant, false);
        }
        tour = {};
        if (interruptions > 0) {
          interruptions -= 1; // fin du tour interrompu : le complément arrive au tour suivant
          continue;
        }
        sortie.result = m;
        // Taille du contexte au dernier appel (sert à décider si un agent de la réserve est trop chargé).
        // m.usage additionne tous les appels du tour : il surestimait le contexte.
        sortie.contexte = contexteDernier;
        if (!file.length) terminerEntree();
      }
    }
  } catch (e) {
    sortie.exception = String(e?.message || e);
    if (/not logged in|\/login/i.test(sortie.exception)) sortie.erreur = 'authentication_failed';
    if (/rate.?limit|usage limit/i.test(sortie.exception)) sortie.erreur = sortie.erreur || 'rate_limit';
  } finally {
    surFlux?.terminer(); // bloc coupé par une interruption : son reste part quand même
    terminerEntree();
    if (canal) canal.injecter = async () => false;
  }
  return sortie;
}
