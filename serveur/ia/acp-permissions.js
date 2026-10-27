// Garde-fou du QG pour les agents ACP (docs/multi-ia/conception.md §4) : un agent ACP n'a pas de bac à sable
// imposé par le QG. Le QG décide donc de chaque demande qui passe par lui : demandes de permission
// (session/request_permission), lectures et écritures de fichiers (fs/*), commandes du terminal (terminal/*).
// Fonctions pures (aucun effet) : les tests les appellent directement.
// Ce qui n'est PAS couvert : un agent qui écrit ou lance une commande par ses propres moyens sans rien demander.
// D'où le statut « restreint » de tous les profils sur ACP (profils.js › profilGaranti).
import os from 'node:os';
import path from 'node:path';
import * as plateforme from '../plateforme.js';
import { dossiersSensibles } from './codex-etancheite.js';

const PROFILS_ECRITURE = new Set(['edition', 'edition+tests', 'ops']);

// Sorte d'action ACP (ToolKind) → sorte du QG.
export const SORTES = { read: 'lecture', search: 'lecture', think: 'lecture', edit: 'ecriture', delete: 'ecriture', move: 'ecriture', execute: 'execution', fetch: 'reseau', switch_mode: 'mode', other: 'autre' };
export const sorteDe = (kind) => SORTES[kind] || 'autre';

/**
 * Zones d'une session : { ecriture, lecture, interdits, qg }.
 * - ecriture : dossiers de la tâche, pièces, dossier temporaire (profils qui écrivent, hors lecture seule) ;
 * - lecture : les mêmes, plus les skills copiés (la lecture ailleurs reste permise, comme pour Claude) ;
 * - interdits : réglages et jeton du QG, dossiers de connexion de tous les comptes, identifiants des
 *   fournisseurs, dossiers personnels sensibles (clés, navigateurs, trousseaux, autres agents) ;
 * - qg : le dossier du QG (son code n'est jamais modifiable).
 */
export function zonesAcp({ cwd, dossiersSup = [], pieces = null, skills = null, profil = 'lecture', lectureSeule = false, comptes = [], racine = plateforme.RACINE, home = os.homedir(), env = process.env, tmp = os.tmpdir() } = {}) {
  const ecrit = PROFILS_ECRITURE.has(profil) && !lectureSeule;
  const tache = [cwd, ...dossiersSup, pieces].filter(Boolean);
  return {
    ecriture: ecrit ? [...tache, tmp] : [],
    lecture: [...tache, skills].filter(Boolean),
    interdits: [
      path.join(racine, 'config'),
      path.join(racine, 'runtime', 'jeton.txt'),
      ...comptes.map((c) => c.configDir).filter(Boolean),
      path.join(home, '.claude-qg'),
      path.join(home, '.codex-qg'),
      path.join(home, '.acp-qg'),
      path.join(home, '.claude', '.credentials.json'),
      path.join(home, '.codex', 'auth.json'),
      ...dossiersSensibles({ home, env }),
    ],
    qg: racine,
  };
}

// « Bash(git status *) » → expression : le motif entier, * = n'importe quoi.
const motifBash = (regle) => {
  const m = /^Bash\((.*)\)$/.exec(regle);
  if (!m) return null;
  return new RegExp('^' + m[1].split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
};
const commandeSimple = (c) => !/[|;&<>`\n]|\$\(/.test(c);
const normaliser = (c) => String(c || '').trim().replace(/\s+/g, ' ');

/** Écriture permise sur ce chemin ? (zone d'écriture, hors .git, hors interdits, hors code du QG sauf zone plus précise) */
export function ecriturePermise(chemin, zones, plat = plateforme.PLATEFORME) {
  if (!chemin || plateforme.sousChemin(zones.interdits, chemin, plat)) return false;
  const zone = zones.ecriture.filter((z) => plateforme.sousChemin([z], chemin, plat)).sort((a, b) => plateforme.cleChemin(b, plat).length - plateforme.cleChemin(a, plat).length)[0];
  if (!zone) return false;
  if (plateforme.sousChemin([path.join(zone, '.git')], chemin, plat)) return false; // pas de commit, donc pas de push
  // le code du QG reste en lecture, sauf si la zone d'écriture est plus précise que lui
  if (zones.qg && plateforme.sousChemin([zones.qg], chemin, plat) && !plateforme.sousChemin([zones.qg], zone, plat)) return false;
  return true;
}

/**
 * Décision du QG pour une action d'un agent ACP : { decision: 'accord'|'refus'|'demander', motif }.
 * @param a.sorte       lecture, ecriture, execution, reseau, mode, autre (sorteDe(kind))
 * @param a.chemins     chemins absolus touchés (locations, rawInput, fs/*)
 * @param a.commande    commande complète (execute, terminal/create)
 * @param a.cwdCommande dossier de la commande
 * @param a.lectureSeule, a.profil, a.zones (zonesAcp), a.regles (config/defauts/profils.json), a.reglages
 * @param a.outilsQg    noms des outils MCP du QG de la session ; a.titre : titre de l'action
 */
export function decisionAcp({ sorte, chemins = [], commande = null, cwdCommande = null, lectureSeule = false, profil = 'lecture', zones, regles = {}, reglages = {}, outilsQg = [], titre = '', plat = plateforme.PLATEFORME }) {
  const refus = (motif) => ({ decision: 'refus', motif });
  const accord = (motif = null) => ({ decision: 'accord', motif });
  const ecrit = PROFILS_ECRITURE.has(profil) && !lectureSeule;
  const interdit = chemins.find((c) => plateforme.sousChemin(zones.interdits, c, plat));
  if (interdit) return refus(`chemin protégé par le QG : ${interdit}`);
  if (sorte === 'mode') return refus("le QG choisit le mode de l'agent");
  if (sorte === 'lecture') return accord();
  if (sorte === 'reseau') return accord();
  if (sorte === 'ecriture' || (sorte === 'autre' && chemins.length)) {
    if (!ecrit) return refus('lecture seule : aucune écriture');
    if (!chemins.length) return refus('écriture sans chemin connu');
    const hors = chemins.find((c) => !ecriturePermise(c, zones, plat));
    if (!hors) return accord();
    // hors des zones : la même demande que pour Claude (carte du site), jamais .git ni le code du QG
    if (zones.ecriture.some((z) => plateforme.sousChemin([path.join(z, '.git')], hors, plat))) return refus('.git reste en lecture (pas de commit)');
    if (zones.qg && plateforme.sousChemin([zones.qg], hors, plat)) return refus('le code du QG n’est jamais modifiable');
    return { decision: 'demander', motif: `écriture hors des dossiers de la tâche : ${hors}` };
  }
  if (sorte === 'execution') {
    const c = normaliser(commande);
    if (!c) return refus('commande inconnue');
    const refusee = (regles.toujoursRefuse || []).map(motifBash).filter(Boolean).some((re) => re.test(c));
    if (refusee) return refus(`commande toujours refusée : ${c}`);
    if (/\bgit\s+(push|commit)\b/.test(c) && reglages.gitAuto !== true) return refus('git commit et git push restent à toi');
    if (zones.interdits.some((z) => c.toLowerCase().includes(plateforme.cleChemin(z, plat).toLowerCase()) || c.toLowerCase().includes(path.resolve(z).toLowerCase()))) return refus('la commande vise un chemin protégé par le QG');
    if (!ecrit) {
      // lecture seule : seulement les commandes autorisées du profil (lecture+tests, verif), sans enchaînement
      const autorises = (regles.profils?.[profil]?.autorises || []).map(motifBash).filter(Boolean);
      if (autorises.length && commandeSimple(c) && autorises.some((re) => re.test(c))) return accord();
      return refus(`lecture seule : commande non autorisée par le profil ${profil}`);
    }
    if (cwdCommande && !zones.ecriture.some((z) => plateforme.sousChemin([z], cwdCommande, plat))) return refus('commande lancée hors des dossiers de la tâche');
    return accord();
  }
  // autre, sans chemin (outils MCP, etc.) : en lecture seule, seulement les outils du QG de la session
  if (lectureSeule || !ecrit) {
    const t = String(titre || '');
    if (outilsQg.some((n) => new RegExp(`(^|[^A-Za-z0-9_])${n}([^A-Za-z0-9_]|$)`).test(t))) return accord();
    return refus('lecture seule : action inconnue refusée');
  }
  return accord();
}

/** Option de réponse à session/request_permission : allow_once ou reject_once (jamais « toujours »). */
export function optionPour(options = [], accord) {
  const voulu = accord ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always'];
  // jamais allow_always (l'agent ne demanderait plus, le QG ne verrait plus rien) ; reject_always en dernier recours
  const trouve = options.find((o) => o.kind === voulu[0]) || (accord ? null : options.find((o) => o.kind === voulu[1]));
  return trouve ? { outcome: { outcome: 'selected', optionId: trouve.optionId } } : { outcome: { outcome: 'cancelled' } };
}
