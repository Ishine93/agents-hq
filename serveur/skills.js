// Skills du QG : des consignes réutilisables (fichiers SKILL.md, le format de Claude Code), rangées dans
// une bibliothèque (config/skills/, un plugin local « qg »). Chaque skill a un mode :
//  - « toujours » : son contenu est donné d'office (ex. « ne pose que des questions à choix multiples ») ;
//  - « disponible » : seuls son nom et sa description sont visibles, l'IA le charge si elle en a besoin
//    (presque aucun token tant qu'il ne sert pas) ;
//  - « off » : rangé dans la bibliothèque, utilisable seulement si on le choisit pour un dossier.
// Pour qui : le DG, les agents (avec, au besoin, seulement certains étages). En plus, chaque dossier peut en
// choisir à l'envoi, et le DG en donne à chaque tâche de son plan : chaque agent n'a que ce qu'il lui faut.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { RACINE } from './config.js';
import * as plateforme from './plateforme.js';
import { chargerComptes, dossierConfig } from './comptes.js';

// (QG_SKILLS_DOSSIER / QG_SKILLS_REGLAGES : une bibliothèque à part, pour les tests)
export const DOSSIER_SKILLS = process.env.QG_SKILLS_DOSSIER || path.join(RACINE, 'config', 'skills');
const LISTE = path.join(DOSSIER_SKILLS, 'skills');
const FICHIER_REGLAGES = process.env.QG_SKILLS_REGLAGES || path.join(RACINE, 'config', 'skills.json');
const PLUGIN = 'qg';
const MAX_IMPORT = 8 * 1024 * 1024;
// tar capable de lire un zip (bsdtar : System32\tar.exe sur Windows, /usr/bin/tar sur Mac)
const TAR = plateforme.tar();

// ---------------------------------------------------------------- fichiers
function assurerBibliotheque() {
  fs.mkdirSync(path.join(DOSSIER_SKILLS, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(LISTE, { recursive: true });
  const pj = path.join(DOSSIER_SKILLS, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(pj)) fs.writeFileSync(pj, JSON.stringify({ name: PLUGIN, description: 'Skills du QG des agents', version: '1.0.0' }, null, 2) + '\n');
}

// Nom de skill au format de Claude Code : minuscules, chiffres et tirets.
export function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'skill';
}

// En-tête YAML d'un SKILL.md (name, description, y compris sur plusieurs lignes) et le corps.
export function analyser(texte) {
  const s = String(texte || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = s.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, corps: s.trim() };
  const meta = {};
  const lignes = m[1].split('\n');
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!l) continue;
    let v = l[2].trim();
    if (v === '|' || v === '>' || v === '|-' || v === '>-') {
      const bloc = [];
      while (i + 1 < lignes.length && /^\s+/.test(lignes[i + 1])) bloc.push(lignes[++i].trim());
      v = bloc.join(v.startsWith('|') ? '\n' : ' ');
    }
    meta[l[1]] = v.replace(/^["']|["']$/g, '');
  }
  return { meta, corps: m[2].trim() };
}

function composer(id, description, corps) {
  const d = String(description || '').replace(/\s+/g, ' ').trim().replace(/"/g, "'");
  return `---\nname: ${id}\ndescription: "${d}"\n---\n\n${String(corps || '').trim()}\n`;
}

const cheminSkill = (id) => path.join(LISTE, slug(id), 'SKILL.md');
// Dossier d'un skill (copié vers un dossier lisible pour les fournisseurs qui ne voient pas config/).
export const dossierSkill = (id) => path.join(LISTE, slug(id));
export const idsSkills = () => {
  try {
    return fs.readdirSync(LISTE, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(LISTE, e.name, 'SKILL.md'))).map((e) => e.name).sort();
  } catch {
    return [];
  }
};
export const existe = (id) => fs.existsSync(cheminSkill(id));
export function lireSkill(id) {
  return fs.readFileSync(cheminSkill(id), 'utf8');
}

function idLibre(base) {
  let id = slug(base);
  for (let n = 2; fs.existsSync(path.join(LISTE, id)); n++) id = `${slug(base).slice(0, 44)}-${n}`;
  return id;
}

// ---------------------------------------------------------------- réglages
const REGLAGE_DEFAUT = { mode: 'off', dg: true, agents: true, etages: [] };
function lireReglages() {
  try {
    return JSON.parse(fs.readFileSync(FICHIER_REGLAGES, 'utf8')).skills || {};
  } catch {
    return {};
  }
}
function ecrireReglages(r) {
  fs.writeFileSync(FICHIER_REGLAGES, JSON.stringify({ note: 'Réglage de chaque skill (Réglages › Skills).', skills: r }, null, 2) + '\n');
}
export const reglageDe = (id) => ({ ...REGLAGE_DEFAUT, ...(lireReglages()[id] || {}) });

export function reglerSkill(id, { mode, dg, agents, etages } = {}) {
  if (!existe(id)) throw new Error('skill inconnu');
  const r = lireReglages();
  const actuel = { ...REGLAGE_DEFAUT, ...(r[id] || {}) };
  if (['off', 'dispo', 'toujours'].includes(mode)) actuel.mode = mode;
  if (typeof dg === 'boolean') actuel.dg = dg;
  if (typeof agents === 'boolean') actuel.agents = agents;
  if (Array.isArray(etages)) actuel.etages = [...new Set(etages.map(String))].slice(0, 50);
  r[id] = actuel;
  ecrireReglages(r);
  return actuel;
}

// ---------------------------------------------------------------- bibliothèque
const tokens = (n) => Math.ceil(n / 3.6);
export function listeSkills() {
  const regl = lireReglages();
  return idsSkills().map((id) => {
    const texte = lireSkill(id);
    const { meta, corps } = analyser(texte);
    let fichiers = 0;
    try {
      fichiers = fs.readdirSync(path.join(LISTE, id), { recursive: true }).length - 1;
    } catch {
      /* rien */
    }
    return {
      id,
      description: meta.description || '',
      source: meta['qg-source'] || null,
      tokensCorps: tokens(corps.length),
      tokensDescription: tokens((meta.description || '').length + id.length + 10),
      fichiers,
      reglage: { ...REGLAGE_DEFAUT, ...(regl[id] || {}) },
    };
  });
}

export function creerSkill({ nom, description, instructions }, { source = 'manuel' } = {}) {
  assurerBibliotheque();
  if (!String(description || '').trim()) throw new Error('il faut une description (elle dit quand utiliser le skill)');
  if (!String(instructions || '').trim()) throw new Error('il faut des instructions');
  const id = idLibre(nom || description);
  fs.mkdirSync(path.join(LISTE, id), { recursive: true });
  const texte = composer(id, description, instructions).replace('\n---\n', `\nqg-source: ${source}\n---\n`);
  fs.writeFileSync(cheminSkill(id), texte);
  return id;
}

export function modifierSkill(id, texte) {
  if (!existe(id)) throw new Error('skill inconnu');
  const { meta, corps } = analyser(texte);
  if (!meta.description) throw new Error('il faut une ligne « description: » dans l’en-tête');
  if (!corps) throw new Error('le skill est vide');
  // le nom reste celui du dossier (Claude Code s'en sert pour le retrouver)
  const propre = composer(id, meta.description, corps).replace('\n---\n', meta['qg-source'] ? `\nqg-source: ${meta['qg-source']}\n---\n` : '\n---\n');
  fs.writeFileSync(cheminSkill(id), propre);
}

export function supprimerSkill(id) {
  if (!existe(id)) return;
  fs.rmSync(path.join(LISTE, slug(id)), { recursive: true, force: true });
  const r = lireReglages();
  delete r[id];
  ecrireReglages(r);
}

// Copie un dossier de skill (SKILL.md + ses fichiers) dans la bibliothèque, sous un nom libre.
function copierDossierSkill(src, source) {
  assurerBibliotheque();
  const { meta } = analyser(fs.readFileSync(path.join(src, 'SKILL.md'), 'utf8'));
  const id = idLibre(meta.name || path.basename(src));
  const dest = path.join(LISTE, id);
  fs.cpSync(src, dest, { recursive: true, dereference: false, filter: (s) => !fs.lstatSync(s).isSymbolicLink() });
  // nom aligné sur le dossier, origine notée
  const { meta: m2, corps } = analyser(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8'));
  fs.writeFileSync(path.join(dest, 'SKILL.md'), composer(id, m2.description || '', corps).replace('\n---\n', `\nqg-source: ${source}\n---\n`));
  return id;
}

function chercherSkillMd(dossier, profondeur = 3) {
  const out = [];
  const parcourir = (d, n) => {
    let entrees = [];
    try {
      entrees = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    if (entrees.some((e) => e.isFile() && e.name.toLowerCase() === 'skill.md')) {
      out.push(d);
      return;
    }
    if (n > 0) for (const e of entrees) if (e.isDirectory() && !e.isSymbolicLink()) parcourir(path.join(d, e.name), n - 1);
  };
  parcourir(dossier, profondeur);
  return out;
}

// Import d'un fichier : un SKILL.md (ou .md), ou une archive .skill / .zip (un ou plusieurs skills).
export async function importerFichier(nom, contenu) {
  if (!contenu?.length) throw new Error('fichier vide');
  if (contenu.length > MAX_IMPORT) throw new Error('fichier trop gros (8 Mo au plus)');
  const ext = path.extname(String(nom || '')).toLowerCase();
  if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    const { meta, corps } = analyser(contenu.toString('utf8'));
    if (!meta.description && !corps) throw new Error('ce fichier ne ressemble pas à un skill');
    return [creerSkill({ nom: meta.name || path.basename(nom, ext), description: meta.description || corps.split('\n')[0].slice(0, 200), instructions: corps }, { source: 'import' })];
  }
  if (!['.skill', '.zip'].includes(ext)) throw new Error('formats acceptés : SKILL.md, .md, .skill, .zip');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-import-skill-'));
  try {
    const arch = path.join(tmp, 'archive.zip');
    fs.writeFileSync(arch, contenu);
    const dest = path.join(tmp, 'x');
    fs.mkdirSync(dest);
    await new Promise((ok, ko) => execFile(TAR, ['-xf', arch, '-C', dest], { windowsHide: true, timeout: 60000 }, (e) => (e ? ko(new Error('archive illisible')) : ok())));
    const trouves = chercherSkillMd(dest);
    if (!trouves.length) throw new Error('aucun SKILL.md dans cette archive');
    return trouves.slice(0, 30).map((d) => copierDossierSkill(d, 'import'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Skills déjà installés dans Claude Code (le tien et ceux des comptes du QG), à importer en un clic.
export function skillsClaudeCode() {
  const bases = new Set([path.join(os.homedir(), '.claude', 'skills')]);
  try {
    for (const c of chargerComptes().comptes) bases.add(path.join(dossierConfig(c), 'skills'));
  } catch {
    /* rien */
  }
  const out = [];
  for (const b of bases) {
    for (const d of chercherSkillMd(b, 1)) {
      try {
        const { meta } = analyser(fs.readFileSync(path.join(d, 'SKILL.md'), 'utf8'));
        out.push({ nom: meta.name || path.basename(d), description: meta.description || '', chemin: d });
      } catch {
        /* illisible */
      }
    }
  }
  return out;
}
export function importerClaudeCode(chemin) {
  if (!skillsClaudeCode().some((s) => s.chemin === chemin)) throw new Error('skill introuvable');
  return copierDossierSkill(chemin, 'claude-code');
}

// ---------------------------------------------------------------- pour une session
/**
 * Skills d'une session : `toujours` (contenu donné d'office) et `dispo` (chargés à la demande).
 * role : 'dg' ou 'agent' ; dossier : ses choix à l'envoi (skills, skillsExclus) ; tache : ceux que le DG lui a donnés.
 */
export function skillsSession({ role, dossier = null, tache = null, etage = null }) {
  const ids = new Set(idsSkills());
  const regl = lireReglages();
  const exclus = new Set(dossier?.skillsExclus || []);
  const toujours = new Set();
  const dispo = new Set();
  for (const [id, r0] of Object.entries(regl)) {
    const r = { ...REGLAGE_DEFAUT, ...r0 };
    if (!ids.has(id) || exclus.has(id) || r.mode === 'off') continue;
    if (role === 'dg' ? !r.dg : !r.agents) continue;
    if (role === 'agent' && r.etages.length && !r.etages.includes(etage)) continue;
    (r.mode === 'toujours' ? toujours : dispo).add(id);
  }
  for (const s of dossier?.skills || []) {
    if (!ids.has(s.id)) continue;
    if (s.pour === 'demande') dispo.add(s.id);
    else if (s.pour === 'tous' || (s.pour === 'dg' && role === 'dg')) toujours.add(s.id);
  }
  if (role === 'agent') for (const id of tache?.x?.skills || []) if (ids.has(id)) toujours.add(id);
  for (const id of toujours) dispo.delete(id);
  return { toujours: [...toujours].sort(), dispo: [...dispo].sort() };
}

// Skills que le DG peut donner à une tâche : ceux ouverts aux agents, et ceux choisis pour ce dossier.
export function skillsAttribuables(dossier) {
  const ids = new Set(idsSkills());
  const regl = lireReglages();
  const exclus = new Set(dossier?.skillsExclus || []);
  const out = new Set();
  for (const [id, r0] of Object.entries(regl)) {
    const r = { ...REGLAGE_DEFAUT, ...r0 };
    if (ids.has(id) && !exclus.has(id) && r.mode !== 'off' && r.agents && !(r.mode === 'toujours' && !r.etages.length)) out.add(id);
  }
  for (const s of dossier?.skills || []) if (ids.has(s.id) && s.pour !== 'tous') out.add(s.id);
  return [...out].sort();
}

// Skills propres au projet (.claude/skills du dossier du projet) : gardés visibles quand on filtre.
function skillsProjet(projet) {
  if (!projet) return [];
  return chercherSkillMd(path.join(projet, '.claude', 'skills'), 1).map((d) => {
    try {
      return analyser(fs.readFileSync(path.join(d, 'SKILL.md'), 'utf8')).meta.name || path.basename(d);
    } catch {
      return path.basename(d);
    }
  });
}

/**
 * Options de session : texte à ajouter au prompt système (skills « toujours »), plugin et filtre pour
 * les skills « disponibles ». Sans skill disponible, on ne touche à rien (le projet garde les siens).
 */
export function optionsSkills({ toujours, dispo }, { projet = null } = {}) {
  let append = '';
  if (toujours.length) {
    append = '\n\n## Skills chargés pour toi (à appliquer)\n' + toujours.map((id) => {
      const { meta, corps } = analyser(lireSkill(id));
      return `\n### ${id}${meta.description ? ` — ${meta.description}` : ''}\n${corps}`;
    }).join('\n');
  }
  if (!dispo.length) return { append };
  return {
    append,
    plugins: [{ type: 'local', path: DOSSIER_SKILLS }],
    skills: [...skillsProjet(projet), ...dispo.map((id) => `${PLUGIN}:${id}`)],
  };
}
