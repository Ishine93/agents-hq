// Lectures sans jetons sur un compte Codex : `codex app-server` (JSON-RPC sur stdio, expérimental) lancé avec
// l'environnement du compte le temps d'une lecture, comme la découverte de Claude. Méthodes relevées dans le
// bench (docs/multi-ia/bench-openai.md §3, 26/10/2026) : account/read, model/list, account/rateLimits/read.
// Le protocole change d'une version à l'autre : chaque lecture est tolérante (null si elle échoue).
import { spawn } from 'node:child_process';
import * as plateforme from '../plateforme.js';

const DELAI = 20000;

/**
 * Ouvre un app-server, envoie les requêtes données, puis l'arrête.
 * @returns {Promise<Record<string, any>>} résultats par méthode (null si la méthode a échoué)
 */
export function lireAppServer({ env, cwd, methodes, commande = plateforme.codexCommande(), delai = DELAI }) {
  return new Promise((resolve) => {
    const resultats = Object.fromEntries(methodes.map((m) => [m, null]));
    let p;
    try {
      p = spawn(commande.exe, [...commande.args, 'app-server'], { cwd, env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    } catch (e) {
      resolve({ ...resultats, erreur: e.message });
      return;
    }
    let reste = '';
    let id = 0;
    const attentes = new Map();
    let fini = false;
    const terminer = (erreur = null) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      try {
        p.stdin.end();
      } catch {
        /* déjà fermé */
      }
      setTimeout(() => plateforme.tuerArbre(p.pid), 500).unref();
      resolve(erreur ? { ...resultats, erreur } : resultats);
    };
    const envoyer = (method, params = {}) =>
      new Promise((res) => {
        const n = ++id;
        attentes.set(n, res);
        try {
          p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n');
        } catch (e) {
          attentes.delete(n);
          res({ error: { message: e.message } });
        }
      });
    const minuterie = setTimeout(() => terminer('délai dépassé'), delai);
    p.on('error', (e) => terminer(e.message));
    p.on('close', () => terminer(fini ? null : 'app-server fermé'));
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (m) => {
      reste += m;
      let i;
      while ((i = reste.indexOf('\n')) >= 0) {
        const ligne = reste.slice(0, i).trim();
        reste = reste.slice(i + 1);
        if (!ligne) continue;
        try {
          const msg = JSON.parse(ligne);
          if (msg.id != null && attentes.has(msg.id)) {
            const res = attentes.get(msg.id);
            attentes.delete(msg.id);
            res(msg);
          }
        } catch {
          /* ligne qui n'est pas du JSON */
        }
      }
    });
    (async () => {
      const init = await envoyer('initialize', { clientInfo: { name: 'qg-agents', title: 'QG des agents', version: '1.0' } });
      if (init.error) return terminer(`initialize : ${init.error.message || 'refusé'}`);
      try {
        p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }) + '\n');
      } catch {
        /* ignoré */
      }
      for (const m of methodes) {
        const r = await envoyer(m, {});
        resultats[m] = r.error ? null : r.result ?? null;
      }
      terminer();
    })();
  });
}

const minutesEnNom = (mins) => {
  if (!mins) return null;
  if (mins % 1440 === 0) return mins === 1440 ? '24 h' : mins === 10080 ? 'semaine' : `${mins / 1440} jours`;
  if (mins % 60 === 0) return `${mins / 60} h`;
  return `${mins} min`;
};

// Fenêtres d'usage au format du QG (conso.js) : { 'codex:primary': { nom, utilisation, reinit }, … }.
export function fenetresDe(lecture) {
  const r = lecture?.rateLimits || lecture || {};
  const fenetres = {};
  for (const k of ['primary', 'secondary']) {
    const f = r[k];
    if (!f) continue;
    const reinit = f.resetsAt ? (f.resetsAt < 1e12 ? f.resetsAt * 1000 : f.resetsAt) : null;
    fenetres[`codex:${k}`] = { nom: minutesEnNom(f.windowDurationMins) || k, utilisation: f.usedPercent ?? null, reinit };
  }
  return { fenetres, forfait: r.planType || lecture?.planType || null, credits: r.credits ?? null };
}

// Modèles au format du QG, d'après model/list ; sinon null (la liste des équivalences sert de repli).
export function modelesDe(lecture) {
  const liste = lecture?.models || lecture?.data || (Array.isArray(lecture) ? lecture : null);
  if (!Array.isArray(liste) || !liste.length) return null;
  return liste
    .map((m) => ({
      id: m.id || m.model || m.slug,
      nom: m.displayName || m.display_name || m.name || m.id || m.model,
      efforts: (m.supportedReasoningEfforts || m.reasoningEfforts || m.efforts || []).map((e) => (typeof e === 'string' ? e : e.reasoningEffort || e.effort)).filter(Boolean),
    }))
    .filter((m) => m.id);
}
