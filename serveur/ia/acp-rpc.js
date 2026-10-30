// Transport ACP (Agent Client Protocol, v1) écrit à la main : JSON-RPC 2.0, un message JSON par ligne sur
// stdin/stdout du processus de l'agent (agentclientprotocol.com, « Transports › stdio »). Aucune dépendance.
// Le client (le QG) envoie des requêtes (initialize, session/new, session/prompt…) et des notifications
// (session/cancel) ; l'agent envoie des notifications (session/update) et des requêtes au client
// (session/request_permission, fs/*, terminal/*), auxquelles surRequete répond.
import { spawn } from 'node:child_process';
import * as plateforme from '../plateforme.js';
import { t } from '../i18n.js';

export class ErreurRpc extends Error {
  constructor(code, message, data = undefined) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
export const METHODE_INCONNUE = -32601;
export const ERREUR_INTERNE = -32603;

/**
 * Lance l'agent et ouvre la connexion.
 * @param p.commande   { exe, args } (args complets, mode ACP compris)
 * @param p.env        environnement COMPLET du processus (non hérité)
 * @param p.surRequete (method, params) => Promise<résultat> ; une exception devient une erreur JSON-RPC
 * @param p.surNotification (method, params) => void
 * @returns { processus, demander(method, params, { delaiMs }), notifier(method, params), fin, tuer(), fermer() }
 *   fin : Promise<{ code, signal, stderr, erreur }> à la fermeture du processus.
 */
export function connecterAgent({ commande, env, cwd, surRequete = async () => { throw new ErreurRpc(METHODE_INCONNUE, 'méthode inconnue'); }, surNotification = () => {}, surAutre = null }) {
  const processus = spawn(commande.exe, commande.args || [], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const enAttente = new Map(); // id → { resolve, reject, minuteur }
  let prochainId = 0;
  let stderr = '';
  let reste = '';
  let ferme = false;
  let tue = false;

  const ecrire = (msg) => {
    if (ferme || !processus.stdin.writable) return false;
    try {
      processus.stdin.write(JSON.stringify(msg) + '\n');
      return true;
    } catch {
      return false;
    }
  };
  const repondre = async (msg) => {
    try {
      const resultat = await surRequete(msg.method, msg.params || {});
      ecrire({ jsonrpc: '2.0', id: msg.id, result: resultat === undefined ? null : resultat });
    } catch (e) {
      const code = Number.isInteger(e?.code) ? e.code : ERREUR_INTERNE;
      ecrire({ jsonrpc: '2.0', id: msg.id, error: { code, message: String(e?.message || e).slice(0, 2000), ...(e?.data !== undefined ? { data: e.data } : {}) } });
    }
  };
  const traiter = (ligne) => {
    const l = ligne.trim();
    if (!l) return;
    let msg;
    try {
      msg = JSON.parse(l);
    } catch {
      surAutre?.(l);
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.method && msg.id !== undefined && msg.id !== null) return void repondre(msg);
    if (msg.method) {
      try {
        surNotification(msg.method, msg.params || {});
      } catch (e) {
        console.error('acp notification', msg.method, e.message);
      }
      return;
    }
    if (msg.id === undefined || !enAttente.has(msg.id)) return;
    const a = enAttente.get(msg.id);
    enAttente.delete(msg.id);
    clearTimeout(a.minuteur);
    if (msg.error) a.reject(new ErreurRpc(msg.error.code, msg.error.message || 'erreur', msg.error.data));
    else a.resolve(msg.result);
  };

  processus.stdout.setEncoding('utf8');
  processus.stdout.on('data', (morceau) => {
    reste += morceau;
    let i;
    while ((i = reste.indexOf('\n')) >= 0) {
      const ligne = reste.slice(0, i);
      reste = reste.slice(i + 1);
      traiter(ligne);
    }
  });
  processus.stderr.setEncoding('utf8');
  processus.stderr.on('data', (m) => {
    stderr = (stderr + m).slice(-8000);
  });
  processus.stdin.on('error', () => {});

  const fin = new Promise((resolve) => {
    let erreurLancement = null;
    processus.on('error', (e) => {
      erreurLancement = e;
    });
    processus.on('close', (code, sig) => {
      if (reste.trim()) traiter(reste);
      ferme = true;
      // message montré dans le site (échec de la tâche) : traduit ; la fin de stderr reste telle quelle
      const raison = new ErreurRpc(ERREUR_INTERNE, erreurLancement ? t('agent impossible à lancer : {erreur}', { erreur: erreurLancement.message }) : t(`l'agent s'est arrêté (code {code})`, { code }) + (stderr.trim() ? ' : ' + stderr.trim().slice(-600) : ''));
      raison.fermeture = true;
      for (const [, a] of enAttente) {
        clearTimeout(a.minuteur);
        a.reject(raison);
      }
      enAttente.clear();
      resolve({ code, signal: sig, stderr, erreur: erreurLancement, tue });
    });
  });

  const demander = (method, params = {}, { delaiMs = 0 } = {}) =>
    new Promise((resolve, reject) => {
      if (ferme) return reject(Object.assign(new ErreurRpc(ERREUR_INTERNE, t(`l'agent est arrêté`)), { fermeture: true }));
      const id = ++prochainId;
      const minuteur = delaiMs > 0 ? setTimeout(() => {
        enAttente.delete(id);
        reject(Object.assign(new ErreurRpc(ERREUR_INTERNE, t(`pas de réponse de l'agent à {methode} après {n} s`, { methode: method, n: Math.round(delaiMs / 1000) })), { delai: true }));
      }, delaiMs) : null;
      enAttente.set(id, { resolve, reject, minuteur });
      if (!ecrire({ jsonrpc: '2.0', id, method, params })) {
        clearTimeout(minuteur);
        enAttente.delete(id);
        reject(Object.assign(new ErreurRpc(ERREUR_INTERNE, t(`l'agent est arrêté`)), { fermeture: true }));
      }
    });
  const notifier = (method, params = {}) => ecrire({ jsonrpc: '2.0', method, params });
  const tuer = () => {
    if (tue || processus.exitCode !== null) return;
    tue = true;
    plateforme.tuerArbre(processus.pid);
  };
  // Fin propre : stdin fermé (l'agent doit s'arrêter), puis arrêt forcé après le délai.
  const fermer = async (delaiMs = 3000) => {
    try {
      processus.stdin.end();
    } catch {}
    const minuteur = setTimeout(tuer, delaiMs);
    const r = await fin;
    clearTimeout(minuteur);
    return r;
  };
  return { processus, demander, notifier, fin, tuer, fermer, get ferme() { return ferme; } };
}
