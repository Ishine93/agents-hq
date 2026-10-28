// Une tâche change de compte Claude (limite d'usage, bascule acceptée, compte retiré) : sa conversation la suit.
// Claude Code range chaque conversation dans <dossier du compte>/projects/<dossier du projet>/<id>.jsonl, avec
// parfois un dossier <id>/ à côté (sous-agents, gros résultats d'outils). On la retrouve par son identifiant,
// sans recalculer le nom du dossier du projet (Claude Code le calcule, et le même projet donne le même nom sur
// les deux comptes), puis on la COPIE dans le dossier du nouveau compte : l'original reste en place. La session
// reprend ensuite avec le même identifiant, sur le nouveau compte. Le contenu n'est jamais lu (taille et copie).
import fs from 'node:fs';
import path from 'node:path';
import { memeChemin } from './plateforme.js';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const taille = (f) => {
  try {
    const s = fs.statSync(f);
    return s.isFile() ? s.size : -1;
  } catch {
    return -1;
  }
};

/** Tous les exemplaires de la conversation dans un dossier de compte : [{ projet, fichier, octets }]. */
export function exemplaires(dossierCompte, sessionId) {
  const racine = path.join(dossierCompte, 'projects');
  let projets = [];
  try {
    projets = fs.readdirSync(racine, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  return projets
    .map((projet) => ({ projet, fichier: path.join(racine, projet, `${sessionId}.jsonl`) }))
    .map((x) => ({ ...x, octets: taille(x.fichier) }))
    .filter((x) => x.octets >= 0);
}

/**
 * Copie la conversation `sessionId` du dossier de compte `de` vers `vers`.
 * Rend { ok: true, octets, deja } ou { ok: false, raison }.
 * - plusieurs exemplaires à la source : le plus gros (un essai raté peut laisser un petit fichier) ;
 * - déjà à destination, aussi gros ou plus : gardé tel quel ;
 * - à destination mais plus petit : mis de côté (<id>.jsonl.avant-<date>), puis remplacé ;
 * - copie dans un fichier temporaire, taille vérifiée, puis renommage : jamais de fichier à moitié copié.
 */
export function transfererConversation({ sessionId, de, vers, maintenant = Date.now() }) {
  if (!ID.test(String(sessionId || ''))) return { ok: false, raison: 'identifiant de conversation inattendu' };
  if (!de || !vers) return { ok: false, raison: 'dossier de compte inconnu' };
  if (memeChemin(path.resolve(de), path.resolve(vers))) return { ok: true, octets: 0, deja: true };
  const sources = exemplaires(de, sessionId).sort((a, b) => b.octets - a.octets);
  if (!sources.length) return { ok: false, raison: 'conversation introuvable dans le dossier du compte' };
  const src = sources[0];
  const dossierCible = path.join(vers, 'projects', src.projet);
  const cible = path.join(dossierCible, `${sessionId}.jsonl`);
  try {
    fs.mkdirSync(dossierCible, { recursive: true });
    const existant = taille(cible);
    if (existant >= src.octets) {
      copierAnnexes(src, dossierCible, sessionId);
      return { ok: true, octets: existant, deja: true };
    }
    if (existant >= 0) fs.renameSync(cible, `${cible}.avant-${maintenant}`);
    const tmp = `${cible}.copie-${process.pid}`;
    fs.copyFileSync(src.fichier, tmp);
    if (taille(tmp) !== src.octets) {
      fs.rmSync(tmp, { force: true });
      return { ok: false, raison: 'copie incomplète' };
    }
    fs.renameSync(tmp, cible);
    copierAnnexes(src, dossierCible, sessionId);
    return { ok: true, octets: src.octets, deja: false };
  } catch (e) {
    return { ok: false, raison: String(e?.message || e) };
  }
}

// Dossier <id>/ à côté de la conversation : copié sans rien écraser de ce qui existe déjà à destination.
function copierAnnexes(src, dossierCible, sessionId) {
  const annexes = path.join(path.dirname(src.fichier), sessionId);
  try {
    if (!fs.statSync(annexes).isDirectory()) return;
  } catch {
    return;
  }
  fs.cpSync(annexes, path.join(dossierCible, sessionId), { recursive: true, force: false, errorOnExist: false });
}
