// Détection des projets dans tes dossiers racines (toutes les minutes) :
// - tout nouveau projet sans étage déclenche une notification « Ajouter l'étage ? » ;
// - un nouveau jeu Rojo peut recevoir tout de suite un port Rojo unique (réglage rojoPortsAuto).
// Un étage n'est jamais ajouté sans ton accord.
import fs from 'node:fs';
import path from 'node:path';
import { RACINE, REGLAGES, etages, racines, FICHIER_ETAGES, ecrireJson } from './config.js';
import { attribuerPort, portEnregistre } from './ports.js';
import { notifier, notificationResolue } from './notifications.js';
import { message, emettre, etagesPublics } from './bus.js';
import { ajouterServicesEtage } from './services.js';
import { t } from './i18n.js';

const MEMO = path.join(RACINE, 'runtime', 'detection.json');
const norme = (p) => path.resolve(p).toLowerCase();
export const slug = (nom) => nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet';
const IGNORES = new Set(['node_modules', '$recycle.bin', 'system volume information', 'windows', 'program files', 'program files (x86)', 'programdata']);

// Racines de test (QG_DEV_RACINE) ou réglages.
const racinesScan = () => (process.env.QG_DEV_RACINE ? [process.env.QG_DEV_RACINE] : racines());

function lireMemo() {
  try {
    return JSON.parse(fs.readFileSync(MEMO, 'utf8'));
  } catch {
    return { signales: [], ignores: [] };
  }
}
const ecrireMemo = (m) => fs.writeFileSync(MEMO, JSON.stringify(m, null, 2));

const etageDe = (dir) => etages().find((e) => e.id !== 'direction' && (e.dossiers || [e.projet]).filter(Boolean).some((d) => norme(d) === norme(dir))) || null;

export const TYPES = {
  roblox: 'Jeu Roblox (Rojo)', unreal: 'Projet Unreal', unity: 'Projet Unity', godot: 'Projet Godot', comfyui: 'ComfyUI',
  web: 'Projet web / Node', python: 'Projet Python', projet: 'Projet',
};

export function typeDe(dir) {
  const a = (f) => fs.existsSync(path.join(dir, f));
  let fichiers = [];
  try {
    fichiers = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const bas = fichiers.map((f) => f.toLowerCase());
  if (a('default.project.json')) return 'roblox';
  if (bas.some((f) => f.endsWith('.uproject'))) return 'unreal';
  if (a('Assets') && a('ProjectSettings')) return 'unity';
  if (a('project.godot')) return 'godot';
  if (/comfyui/i.test(path.basename(dir)) || (a('comfy') && a('main.py'))) return 'comfyui';
  if (a('package.json')) return 'web';
  if (a('pyproject.toml') || a('requirements.txt') || a('setup.py')) return 'python';
  if (a('.git') || a('CLAUDE.md') || a('Cargo.toml') || a('go.mod') || a('CMakeLists.txt') || bas.some((f) => f.endsWith('.sln'))) return 'projet';
  return null;
}

// Tous les projets trouvés dans les racines : la racine elle-même si c'est un projet, sinon ses sous-dossiers.
export function listerProjets() {
  const memo = lireMemo();
  const vus = new Set();
  const liste = [];
  const ajouter = (dir) => {
    if (vus.has(norme(dir)) || norme(dir) === norme(RACINE)) return;
    const type = typeDe(dir);
    if (!type) return;
    vus.add(norme(dir));
    const e = etageDe(dir);
    liste.push({ dossier: dir, nom: path.basename(dir), type, etage: e ? e.id : null, ignore: memo.ignores.some((d) => norme(d) === norme(dir)) });
  };
  for (const r of racinesScan()) {
    if (typeDe(r)) {
      ajouter(r);
      continue;
    }
    let entrees = [];
    try {
      entrees = fs.readdirSync(r, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entrees) {
      if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name.startsWith('_') || IGNORES.has(ent.name.toLowerCase())) continue;
      ajouter(path.join(r, ent.name));
    }
  }
  return liste;
}

export function scanner() {
  const memo = lireMemo();
  for (const p of listerProjets()) {
    let port = null;
    if (p.type === 'roblox' && (p.etage || REGLAGES.rojoPortsAuto)) {
      try {
        const r = attribuerPort(p.dossier);
        port = r.port;
        if (r.change) {
          message(null, 'systeme', r.ancien ? t('Nouveau jeu {nom} : port Rojo {port} attribué (il était sur {ancien}, déjà pris par un autre jeu), écrit dans son default.project.json.', { nom: p.nom, port: r.port, ancien: r.ancien }) : t('Nouveau jeu {nom} : port Rojo {port} attribué, écrit dans son default.project.json.', { nom: p.nom, port: r.port }), ['hall']);
        }
      } catch (e) {
        console.error('port', p.nom, e.message);
      }
    }
    const deja = [...memo.signales, ...memo.ignores].some((d) => norme(d) === norme(p.dossier));
    if (p.etage || deja) continue;
    memo.signales.push(p.dossier);
    ecrireMemo(memo);
    notifier({
      id: `NP-${slug(p.nom)}`,
      type: 'projet',
      titre: t('Nouveau projet détecté : {nom}', { nom: p.nom }),
      texte: port ? t('{type} (port Rojo {port}). Lui créer un étage ?', { type: t(TYPES[p.type]), port }) : t('{type}. Lui créer un étage ?', { type: t(TYPES[p.type]) }),
      actions: [{ id: 'ajouter', libelle: t("Ajouter l'étage") }, { id: 'ignorer', libelle: t('Ignorer') }],
      projet: p.dossier,
    });
  }
}

// Projets déjà présentés (ex. pendant la configuration) : pas de notification pour eux.
export function marquerSignales(dossiers) {
  const memo = lireMemo();
  for (const d of dossiers) if (![...memo.signales, ...memo.ignores].some((x) => norme(x) === norme(d))) memo.signales.push(d);
  ecrireMemo(memo);
}

export function demarrerDetection() {
  scanner();
  setInterval(scanner, 60000).unref();
}

function ficheAuto(type, dir, port) {
  const claude = fs.existsSync(path.join(dir, 'CLAUDE.md')) ? '\nLire d\'abord : `CLAUDE.md` du projet (chargé automatiquement).' : fs.existsSync(path.join(dir, 'README.md')) ? '\nLire d\'abord : `README.md`.' : '';
  const fin = '\nFiche créée automatiquement : complète-la dans Réglages › Étages.\n';
  if (type === 'roblox') {
    return `Jeu Roblox (Rojo). Code Luau dans \`src/\`, projet \`default.project.json\`${port ? `, port Rojo ${port}` : ''}.${claude}\nVérifications : \`rojo build -o build/verif.rbxl\`, \`selene src\`, \`stylua --check src\`.${fin}`;
  }
  if (type === 'unreal') return `Projet Unreal Engine (\`${dir}\`).${claude}\nIgnorer : \`Binaries/\`, \`Intermediate/\`, \`Saved/\`, \`DerivedDataCache/\`.${fin}`;
  if (type === 'unity') return `Projet Unity (\`${dir}\`).${claude}\nIgnorer : \`Library/\`, \`Temp/\`, \`Logs/\`, \`obj/\`.${fin}`;
  if (type === 'comfyui') return `Installation ComfyUI (\`${dir}\`).${claude}\nNe pas toucher aux modèles (\`models/\`) sans demande. Ignorer : \`output/\`, \`temp/\`.${fin}`;
  return `${TYPES[type] || 'Projet'} (\`${dir}\`).${claude}${fin}`;
}

const lireEtages = () => JSON.parse(fs.readFileSync(FICHIER_ETAGES, 'utf8'));
function publierEtages() {
  emettre('etages', { etages: etagesPublics() });
}

// Ajoute l'étage d'un projet (sur ton accord). Il se place juste sous la Direction.
export function ajouterEtage(dir, { nom = null } = {}) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(t('dossier introuvable'));
  const type = typeDe(dir) || 'projet';
  if (etageDe(dir)) throw new Error(t('ce projet a déjà un étage'));
  const brut = lireEtages();
  const nomEtage = String(nom || path.basename(dir)).trim().slice(0, 40) || path.basename(dir);
  let id = slug(nomEtage);
  while (brut.etages.some((e) => e.id === id)) id += '-2';
  const direction = brut.etages.find((e) => e.id === 'direction');
  const ordre = direction ? direction.ordre : Math.max(0, ...brut.etages.map((e) => e.ordre)) + 1;
  if (direction) direction.ordre = ordre + 1;
  let mcp = [];
  try {
    mcp = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8')).mcpServers || {});
  } catch {
    mcp = [];
  }
  let port = null;
  if (type === 'roblox') {
    try {
      port = attribuerPort(dir).port;
    } catch {
      port = portEnregistre(dir);
    }
  }
  fs.writeFileSync(path.join(RACINE, 'config', 'fiches', `${id}.md`), ficheAuto(type, dir, port));
  const e = { id, nom: nomEtage, type, ordre, projet: dir, actif: true, fiche: `${id}.md`, mcp };
  brut.etages.splice(direction ? brut.etages.indexOf(direction) + 1 : 0, 0, e);
  ecrireJson(FICHIER_ETAGES, brut);
  ajouterServicesEtage(e);
  publierEtages();
  notificationResolue(`NP-${slug(path.basename(dir))}`);
  message(null, 'systeme', port ? t('Étage « {nom} » ajouté (rojo :{port}).', { nom: nomEtage, port }) : t('Étage « {nom} » ajouté.', { nom: nomEtage }), ['hall', id]);
  return e;
}

// Renommer, activer ou désactiver un étage, ou modifier sa fiche (Réglages › Étages).
export function modifierEtage(id, { nom, actif, fiche } = {}) {
  const brut = lireEtages();
  const e = brut.etages.find((x) => x.id === id);
  if (!e) throw new Error(t('étage inconnu'));
  if (nom !== undefined) e.nom = String(nom).trim().slice(0, 40) || e.nom;
  if (actif !== undefined && !['direction', 'hall', 'salle-pause', 'salle-repos'].includes(id)) e.actif = !!actif;
  if (fiche !== undefined) {
    if (!e.fiche) e.fiche = `${id}.md`;
    fs.writeFileSync(path.join(RACINE, 'config', 'fiches', e.fiche), String(fiche).slice(0, 20000));
  }
  ecrireJson(FICHIER_ETAGES, brut);
  publierEtages();
  return e;
}

// Retire un étage de l'immeuble (le projet n'est pas touché).
export function retirerEtage(id) {
  if (['direction', 'hall', 'salle-pause', 'salle-repos'].includes(id)) throw new Error(t("cet étage fait partie de l'immeuble"));
  const brut = lireEtages();
  const i = brut.etages.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(t('étage inconnu'));
  const [e] = brut.etages.splice(i, 1);
  ecrireJson(FICHIER_ETAGES, brut);
  if (e.projet) marquerSignales([e.projet]);
  publierEtages();
  return e;
}

export function ignorerProjet(dir) {
  const memo = lireMemo();
  if (!memo.ignores.some((d) => norme(d) === norme(dir))) memo.ignores.push(dir);
  ecrireMemo(memo);
  notificationResolue(`NP-${slug(path.basename(dir))}`);
}
