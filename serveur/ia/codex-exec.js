// Lanceur de `codex exec --experimental-json` (calqué sur sdk/typescript/src/exec.ts du dépôt openai/codex,
// 0.164.0, lu le 26/10/2026) : le prompt est écrit sur stdin, la sortie standard est un flux JSON Lines
// (thread.started, turn.started, item.*, turn.completed, turn.failed, error). On pilote le binaire officiel
// nous-mêmes plutôt que par le SDK : on peut ainsi le remplacer par un faux en JavaScript dans les tests et
// ne jamais passer --sandbox (qui ferait ignorer les profils de permissions).
import { spawn } from 'node:child_process';
import * as plateforme from '../plateforme.js';

/**
 * @param {object} p
 * @param {string[]} p.args      arguments après le lanceur (exec --experimental-json …)
 * @param {object} p.env         environnement COMPLET du processus (non hérité)
 * @param {string} p.cwd
 * @param {string} p.prompt      écrit sur stdin
 * @param {AbortSignal} [p.signal]
 * @param {(ev: object) => void} p.surEvenement   un objet par ligne JSON valide
 * @param {(ligne: string) => void} [p.surAutre]   lignes de stdout qui ne sont pas du JSON
 * @returns {{ processus, fin: Promise<{ code, signal, stderr, tue }>, tuer() }}
 */
export function lancerCodex({ args, env, cwd, prompt, signal = null, surEvenement, surAutre = null, commande = plateforme.codexCommande() }) {
  const processus = spawn(commande.exe, [...commande.args, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  let reste = '';
  let tue = false;
  const traiter = (ligne) => {
    const l = ligne.trim();
    if (!l) return;
    let ev = null;
    try {
      ev = JSON.parse(l);
    } catch {
      surAutre?.(l);
      return;
    }
    if (ev && typeof ev === 'object') surEvenement(ev);
  };
  processus.stdout.setEncoding('utf8');
  processus.stdout.on('data', (morceau) => {
    reste += morceau;
    let i;
    while ((i = reste.indexOf('\n')) >= 0) {
      traiter(reste.slice(0, i));
      reste = reste.slice(i + 1);
    }
  });
  processus.stderr.setEncoding('utf8');
  processus.stderr.on('data', (m) => {
    stderr = (stderr + m).slice(-8000);
  });
  const tuer = () => {
    if (tue || processus.exitCode !== null) return;
    tue = true;
    plateforme.tuerArbre(processus.pid);
  };
  if (signal) {
    if (signal.aborted) tuer();
    else signal.addEventListener('abort', tuer, { once: true });
  }
  const fin = new Promise((resolve) => {
    let erreurLancement = null;
    processus.on('error', (e) => {
      erreurLancement = e;
    });
    processus.on('close', (code, sig) => {
      if (reste.trim()) traiter(reste);
      signal?.removeEventListener('abort', tuer);
      resolve({ code, signal: sig, stderr: erreurLancement ? `${erreurLancement.message}\n${stderr}` : stderr, tue, erreur: erreurLancement });
    });
  });
  try {
    processus.stdin.on('error', () => {});
    processus.stdin.end(prompt);
  } catch {
    /* processus déjà parti : la promesse fin le dira */
  }
  return { processus, fin, tuer };
}
