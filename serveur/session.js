// Lance une session Claude Code via le SDK Agent et traduit son flux en rappels simples.
// Les sessions tournent en mode « streaming input » : on peut leur envoyer un complément en cours
// de route (interruption puis nouveau message, la conversation garde tout son contexte).
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { NODE_DIR } from './config.js';
import { trouverCompte, envPour } from './comptes.js';
import { enregistrerAppel, enregistrerCout, majLimiteEvenement, signalerActivite } from './conso.js';

const tronquer = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

export function cibleOutil(nom, input = {}, cwd = '') {
  const rel = (p) => {
    if (!p) return '';
    const r = cwd ? path.relative(cwd, p) : p;
    return r.startsWith('..') ? path.basename(p) : r.replace(/\\/g, '/');
  };
  if (['Read', 'Edit', 'Write', 'NotebookEdit'].includes(nom)) return tronquer(rel(input.file_path || input.notebook_path), 48);
  if (nom === 'Bash') return tronquer(input.command, 48);
  if (nom === 'Grep' || nom === 'Glob') return tronquer(input.pattern, 48);
  if (nom === 'WebFetch') {
    try {
      return new URL(input.url).host;
    } catch {
      return tronquer(input.url, 48);
    }
  }
  if (nom === 'WebSearch') return tronquer(input.query, 48);
  if (nom === 'TodoWrite') return 'plan de travail';
  if (nom === 'StructuredOutput') return 'rapport final';
  if (nom === 'mcp__qg__montrer') return tronquer(input.legende || 'images', 48);
  if (nom === 'mcp__qg__demander') return tronquer(input.question, 48);
  if (nom.startsWith('mcp__')) return tronquer(nom.split('__').slice(2).join(' '), 48);
  return '';
}

function environnement(compteId) {
  const env = envPour(trouverCompte(compteId));
  const cle = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  env[cle] = `${NODE_DIR};${env[cle] || ''}`;
  return env;
}

function messageUtilisateur(texte, blocsImages = []) {
  const content = blocsImages.length ? [...blocsImages, { type: 'text', text: texte }] : texte;
  return { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null };
}

// Erreurs qui doivent tout arrêter plutôt que réessayer.
export const ERREURS_FATALES = new Set(['authentication_failed', 'billing_error']);

/**
 * @param canal  objet facultatif rempli avec `injecter(texte)` tant que la session tourne
 * @param surImage rappel (base64, type, outil) pour chaque image reçue dans le résultat d'un outil
 * @returns {Promise<{result, sessionId, init, erreur, limite, exception}>}
 */
const texteResultat = (contenu) =>
  typeof contenu === 'string' ? contenu : Array.isArray(contenu) ? contenu.filter((c) => c?.type === 'text').map((c) => c.text).join('\n') : '';
const finDe = (s, n) => (s.length > n ? '…' + s.slice(-n) : s);

// Pensées en direct : on suit le flux partiel (réflexion résumée, rédaction, rapport en cours) et on
// en envoie un extrait au plus toutes les 1,2 s, pour que le site montre ce que fait l'agent pendant
// un long bloc (sinon rien ne s'écrit avant la fin du bloc).
function suiviPensees(surPensee) {
  let bloc = null; // { phase, texte, outil }
  let dernier = 0;
  const envoyer = (force = false) => {
    if (!bloc || (!force && Date.now() - dernier < 1200)) return;
    dernier = Date.now();
    const extrait = bloc.phase === 'reflexion' ? bloc.texte.replace(/\s+/g, ' ').trim().slice(-280) : '';
    surPensee({ phase: bloc.phase, outil: bloc.outil || null, extrait, taille: bloc.texte.length });
  };
  return (ev) => {
    if (ev.type === 'content_block_start') {
      const b = ev.content_block || {};
      const phase = b.type === 'thinking' ? 'reflexion' : b.type === 'text' ? 'redaction' : b.type === 'tool_use' ? (b.name === 'StructuredOutput' ? 'rapport' : 'outil') : null;
      bloc = phase ? { phase, texte: '', outil: b.name || null } : null;
      envoyer(true);
    } else if (ev.type === 'content_block_delta' && bloc) {
      const d = ev.delta || {};
      bloc.texte += d.thinking ?? d.text ?? d.partial_json ?? '';
      envoyer();
    } else if (ev.type === 'content_block_stop' && bloc) {
      envoyer(true);
      bloc = null;
    }
  };
}

// conso : { dossier, tache, etage, role } pour ranger les tokens consommés (consommation en temps réel).
export async function executerSession({ prompt, images = [], options, compte, surInit, surOutil, surActivite, surImage, surCommande, surPensee, canal, conso = {} }) {
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
      env: environnement(compte),
    },
  });
  const outilsParId = new Map();
  const meta = { role: 'autre', ...conso, compte: compte || trouverCompte(null)?.id };
  // Un appel au modèle arrive en plusieurs messages (un par bloc), dont l'usage grandit : on ne compte que l'écart.
  const appelsVus = new Map();
  let coutVu = 0;
  const sortie = { result: null, sessionId: options.resume || null, init: null, erreur: null, limite: null, exception: null };
  try {
    for await (const m of q) {
      if (m.session_id && !sortie.sessionId) sortie.sessionId = m.session_id;
      if (m.type === 'stream_event') {
        surFlux?.(m.event || {});
        continue;
      }
      if (m.type === 'system' && m.subtype === 'init') {
        sortie.init = m;
        sortie.sessionId = m.session_id;
        surInit?.(m);
      } else if (m.type === 'assistant') {
        if (m.error) sortie.erreur = m.error;
        const idAppel = m.message?.id;
        if (idAppel && m.message.usage) {
          const avant = appelsVus.get(idAppel) || {};
          const u = m.message.usage;
          const max = {};
          const delta = {};
          for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
            max[k] = Math.max(avant[k] || 0, u[k] || 0);
            delta[k] = max[k] - (avant[k] || 0);
          }
          appelsVus.set(idAppel, max);
          enregistrerAppel(meta, delta, m.message.model, !avant.input_tokens && !avant.output_tokens);
          signalerActivite();
        }
        if (m.parent_tool_use_id) continue;
        surActivite?.();
        for (const b of m.message?.content || []) {
          if (b.type === 'tool_use') {
            outilsParId.set(b.id, b.name);
            surOutil?.(b.name, cibleOutil(b.name, b.input, options.cwd));
            if (b.name === 'Bash') surCommande?.({ id: b.id, commande: String(b.input?.command || '').slice(0, 4000), description: b.input?.description || '', debut: Date.now(), enCours: true });
          }
        }
      } else if (m.type === 'user' && !m.parent_tool_use_id) {
        for (const b of Array.isArray(m.message?.content) ? m.message.content : []) {
          if (b?.type !== 'tool_result') continue;
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
        if (interruptions > 0) {
          interruptions -= 1; // fin du tour interrompu : le complément arrive au tour suivant
          continue;
        }
        sortie.result = m;
        // Taille du contexte au dernier tour (sert à décider si un agent de la réserve est trop chargé).
        const u = m.usage || {};
        sortie.contexte = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0);
        if (!file.length) terminerEntree();
      }
    }
  } catch (e) {
    sortie.exception = String(e?.message || e);
    if (/not logged in|\/login/i.test(sortie.exception)) sortie.erreur = 'authentication_failed';
    if (/rate.?limit|usage limit/i.test(sortie.exception)) sortie.erreur = sortie.erreur || 'rate_limit';
  } finally {
    terminerEntree();
    if (canal) canal.injecter = async () => false;
  }
  return sortie;
}

// Raison lisible d'un échec de session.
export function raisonEchec(s) {
  if (s.erreur) return s.erreur;
  if (s.exception) return tronquer(s.exception, 200);
  if (!s.result) return 'session sans résultat';
  if (s.result.subtype !== 'success') return `${s.result.subtype}${s.result.errors?.length ? ' : ' + tronquer(s.result.errors.join(' ; '), 160) : ''}`;
  if (s.result.structured_output == null) return 'pas de sortie structurée';
  return null;
}
