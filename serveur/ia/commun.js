// Fonctions communes aux adaptateurs de fournisseurs : libellé de la cible d'un outil (bulle du site) et
// diff d'une écriture de fichier (code déplacé tel quel depuis session.js, comportement inchangé).
import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from '../plateforme.js';

export const tronquer = (s, n) => {
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

export const texteResultat = (contenu) =>
  typeof contenu === 'string' ? contenu : Array.isArray(contenu) ? contenu.filter((c) => c?.type === 'text').map((c) => c.text).join('\n') : '';
export const finDe = (s, n) => (s.length > n ? '…' + s.slice(-n) : s);

// Diff d'un outil d'écriture (Edit, Write…) pour le site : fichier, lignes ajoutées et supprimées, et les
// morceaux du diff (lignes préfixées « + », « - » ou « » ; tronqués pour que le flux reste léger).
const MAX_LIGNES_DIFF = 400;
let compteurModifs = 0;
export function modificationDe(r, outil, cwd) {
  let ajouts = 0;
  let suppressions = 0;
  let gardees = 0;
  const morceaux = [];
  const garder = (lignes) => {
    const l = lignes.slice(0, Math.max(0, MAX_LIGNES_DIFF - gardees)).map((x) => (x.length > 300 ? x.slice(0, 300) + '…' : x));
    gardees += l.length;
    return l;
  };
  for (const h of r.structuredPatch) {
    for (const l of h.lines) {
      if (l.startsWith('+')) ajouts++;
      else if (l.startsWith('-')) suppressions++;
    }
    if (gardees < MAX_LIGNES_DIFF) {
      const lignes = garder(h.lines);
      morceaux.push({ ancien: h.oldStart, nouveau: h.newStart, lignes, tronque: lignes.length < h.lines.length });
    }
  }
  // fichier créé : pas de patch, tout le contenu est un ajout
  if (!r.structuredPatch.length && r.type === 'create' && typeof r.content === 'string') {
    const tout = r.content.split('\n');
    if (tout.length && tout[tout.length - 1] === '') tout.pop();
    ajouts = tout.length;
    const lignes = garder(tout.map((l) => '+' + l));
    morceaux.push({ ancien: 0, nouveau: 1, lignes, tronque: lignes.length < tout.length });
  }
  const rel = cwd ? path.relative(cwd, r.filePath) : r.filePath;
  return {
    id: `C${Date.now().toString(36)}${(++compteurModifs).toString(36)}`,
    fichier: r.filePath,
    rel: !rel || rel.startsWith('..') || path.isAbsolute(rel) ? r.filePath : rel.replace(/\\/g, '/'),
    outil,
    type: r.type === 'create' || (r.originalFile === null && !r.structuredPatch.length) ? 'create' : 'update',
    ajouts,
    suppressions,
    morceaux,
    tronque: gardees >= MAX_LIGNES_DIFF,
    t: Date.now(),
  };
}

/**
 * Diff ligne à ligne entre deux textes (plus longue sous-séquence commune), en morceaux de la forme
 * `structuredPatch` (oldStart, newStart, lines « + », « - », « »). Sert aux fournisseurs qui n'envoient
 * que le nom des fichiers modifiés (Codex). Au-delà de `max` lignes, le diff est jugé trop gros : null.
 */
export function diffLignes(avant, apres, { max = 3000 } = {}) {
  const a = String(avant ?? '').split('\n');
  const b = String(apres ?? '').split('\n');
  if (a.length && a[a.length - 1] === '') a.pop();
  if (b.length && b[b.length - 1] === '') b.pop();
  if (a.length > max || b.length > max) return null;
  // préfixe et suffixe communs : réduit le tableau de la LCS
  let debut = 0;
  while (debut < a.length && debut < b.length && a[debut] === b[debut]) debut++;
  let finA = a.length;
  let finB = b.length;
  while (finA > debut && finB > debut && a[finA - 1] === b[finB - 1]) {
    finA--;
    finB--;
  }
  const xa = a.slice(debut, finA);
  const xb = b.slice(debut, finB);
  const n = xa.length;
  const m = xb.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = xa[i] === xb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; // { type: ' ' | '-' | '+', ligne, ia, ib }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (xa[i] === xb[j]) ops.push({ t: ' ', l: xa[i] }), i++, j++;
    else if (L[i + 1][j] >= L[i][j + 1]) ops.push({ t: '-', l: xa[i] }), i++;
    else ops.push({ t: '+', l: xb[j] }), j++;
  }
  while (i < n) ops.push({ t: '-', l: xa[i++] });
  while (j < m) ops.push({ t: '+', l: xb[j++] });
  if (!ops.some((o) => o.t !== ' ')) return [];
  // un seul morceau : la zone changée, avec 2 lignes de contexte de chaque côté
  const avantCtx = a.slice(Math.max(0, debut - 2), debut).map((l) => ' ' + l);
  const apresCtx = a.slice(finA, Math.min(a.length, finA + 2)).map((l) => ' ' + l);
  const start = debut - avantCtx.length + 1;
  return [{ oldStart: start, newStart: start, lines: [...avantCtx, ...ops.map((o) => o.t + o.l), ...apresCtx] }];
}

// ---------------------------------------------------------------- demandes (adaptateurs autres que Claude)

// Rôles en lecture seule par défaut (DG, vérificateur, questions, utilitaires, Joy) et profils qui ne
// donnent aucune écriture : une demande en lecture seule ne reçoit jamais un autre profil.
export const ROLES_LECTURE = ['dg', 'verif', 'question', 'utilitaire', 'ambiance', 'traduction'];
export const PROFILS_LECTURE = ['lecture', 'lecture+tests', 'verif'];
export function profilDemande(demande) {
  const lectureSeule = demande.lectureSeule ?? ROLES_LECTURE.includes(demande.role);
  const profil = demande.profil || 'lecture';
  return { lectureSeule, profil: lectureSeule && !PROFILS_LECTURE.includes(profil) ? 'lecture' : profil };
}

// Consignes en tête du premier message (pas de préréglage système chez Codex ni chez les agents ACP).
// Agents ACP (opts) : noms réels des outils MCP de la session, schéma écrit en clair (aucune option de schéma
// dans le protocole) et outil rendre_resultat quand le serveur MCP du QG est joignable.
export function consignesQg(demande, skillsCopies, { outils = null, soumission = false, schemaEnClair = false } = {}) {
  const lignes = ['[CONSIGNES DU QG — à respecter pendant toute la session]', demande.consignes || ''];
  if (skillsCopies.length) {
    lignes.push('', 'Skills disponibles (lis SKILL.md si l’un d’eux sert ta mission) :', ...skillsCopies.map((s) => `- ${s.id}${s.description ? ` — ${s.description}` : ''} : ${s.chemin}`));
  }
  if (outils?.length) lignes.push('', `Outils du QG (serveur MCP « qg ») : ${outils.join(', ')}.`);
  else if (demande.outilsQg) lignes.push('', `Les outils du QG (montrer, demander, services, service_demarrer, service_journaux, service_arreter, capturer_page, telecharger_image${demande.outilsQg.definitions?.some((o) => o.nom === 'generer_image') ? ', generer_image' : ''}) sont ceux du serveur MCP « qg ».`);
  if (demande.schema && soumission) lignes.push('', 'Rends ta réponse finale structurée en appelant une fois l’outil rendre_resultat du serveur MCP « qg » ; s’il signale des erreurs, corrige et rappelle-le. S’il est indisponible, ta réponse finale doit être uniquement le JSON de la sortie (schéma ci-dessous), sans texte autour.');
  else if (demande.schema) lignes.push('', 'Ta réponse finale doit être uniquement le JSON de la sortie structurée demandée (schéma fourni), sans texte autour.');
  if (demande.schema && schemaEnClair) lignes.push(`Schéma JSON de la sortie : ${JSON.stringify(demande.schema)}`);
  lignes.push('[FIN DES CONSIGNES]');
  return lignes.join('\n');
}

// Les skills « disponibles » vivent dans config/skills, interdit aux agents (deny sur config) : copie lisible.
export function copierSkills(demande, cle) {
  const liste = demande.skills?.dispo || [];
  if (!liste.length) return { copies: [], dossier: null };
  const dossier = path.join(RACINE, 'runtime', 'ia', 'skills', cle);
  const copies = [];
  for (const s of liste) {
    try {
      const cible = path.join(dossier, s.id);
      fs.cpSync(s.chemin, cible, { recursive: true });
      copies.push({ id: s.id, description: s.description || '', chemin: cible });
    } catch (e) {
      console.error('skill', s.id, e.message);
    }
  }
  return { copies, dossier };
}
