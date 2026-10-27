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
import * as plateforme from './plateforme.js';
import { t } from './i18n.js';

const MEMO = path.join(RACINE, 'runtime', 'detection.json');
const norme = (p) => path.resolve(p).toLowerCase();
export const slug = (nom) => nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet';
// node_modules ; les dossiers système de la plateforme (Windows : $Recycle.Bin, Program Files… ; Mac : Library,
// Applications… seulement sous / ou ~) sont écartés par plateforme.estDossierSysteme.
const IGNORES = new Set(['node_modules']);

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
// Avec { racines: true } (Réglages, configuration guidée), chaque racine est aussi proposée telle quelle
// (`racine: true`), même sans marqueur, pour en faire un étage entier. Jamais pour la notification.
export function listerProjets({ racines: avecRacines = false } = {}) {
  const memo = lireMemo();
  const vus = new Set();
  const liste = [];
  const ajouter = (dir, racine = false) => {
    if (vus.has(norme(dir)) || norme(dir) === norme(RACINE)) return;
    const type = typeDe(dir) || (racine ? 'projet' : null);
    if (!type) return;
    vus.add(norme(dir));
    const e = etageDe(dir);
    liste.push({ dossier: dir, nom: path.basename(dir), type, etage: e ? e.id : null, ignore: memo.ignores.some((d) => norme(d) === norme(dir)), ...(racine ? { racine: true } : {}) });
  };
  for (const r of racinesScan()) {
    if (typeDe(r)) {
      ajouter(r);
      continue;
    }
    if (avecRacines) ajouter(r, true);
    let entrees = [];
    try {
      entrees = fs.readdirSync(r, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entrees) {
      if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name.startsWith('_') || IGNORES.has(ent.name.toLowerCase()) || plateforme.estDossierSysteme(r, ent.name)) continue;
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

function ficheAuto(type, dir, port, autres = []) {
  const claude = fs.existsSync(path.join(dir, 'CLAUDE.md')) ? '\nLire d\'abord : `CLAUDE.md` du projet (chargé automatiquement).' : fs.existsSync(path.join(dir, 'README.md')) ? '\nLire d\'abord : `README.md`.' : '';
  const aussi = autres.length ? `\nAutres dossiers de l'étage : ${autres.map((d) => `\`${d}\``).join(', ')}.` : '';
  const fin = `${aussi}\nFiche créée automatiquement : complète-la dans Réglages › Étages.\n`;
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

// Dossiers d'un étage : existants, sans doublon, ni le QG lui-même ni un lecteur entier, et pas exactement
// les mêmes qu'un autre étage. Le premier est le dossier principal (`projet`, dossier de travail des sessions).
function validerDossiers(liste, sauf = null) {
  const dossiers = [];
  for (const brut of liste) {
    const d = path.resolve(String(brut || '').trim());
    if (!String(brut || '').trim() || !fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new Error(t('dossier introuvable : {dossier}', { dossier: String(brut || '') }));
    if (norme(d) === norme(RACINE)) throw new Error(t('le dossier du QG lui-même ne peut pas être un étage'));
    if (path.parse(d).root === d) throw new Error(t('choisis un dossier, pas un lecteur entier ({dossier})', { dossier: d }));
    if (!dossiers.some((x) => norme(x) === norme(d))) dossiers.push(d);
  }
  if (!dossiers.length) throw new Error(t('dossier requis'));
  const cle = (l) => l.map(norme).sort().join('|');
  const meme = etages().find((e) => e.id !== 'direction' && e.id !== sauf && cle((e.dossiers || [e.projet]).filter(Boolean)) === cle(dossiers));
  if (meme) throw new Error(dossiers.length > 1 ? t('l’étage « {nom} » a déjà exactement ces dossiers', { nom: meme.nom }) : t('ce projet a déjà un étage'));
  return dossiers;
}

// Ajoute un étage (sur ton accord). Il se place juste sous la Direction.
// `dir` : un dossier, ou une liste de dossiers (le premier est le principal). `type` : une clé de TYPES,
// sinon le type détecté du dossier principal, sinon 'projet'.
export function ajouterEtage(dir, { nom = null, type: typeVoulu = null } = {}) {
  const dossiers = validerDossiers(Array.isArray(dir) ? dir : [dir]);
  dir = dossiers[0];
  const type = TYPES[typeVoulu] ? typeVoulu : typeDe(dir) || 'projet';
  const brut = lireEtages();
  const nomEtage = String(nom || path.basename(dir)).trim().slice(0, 40) || path.basename(dir);
  const base = slug(nomEtage);
  let id = base;
  for (let n = 2; brut.etages.some((e) => e.id === id); n++) id = `${base}-${n}`;
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
  if (type === 'roblox' && fs.existsSync(path.join(dir, 'default.project.json'))) {
    try {
      port = attribuerPort(dir).port;
    } catch {
      port = portEnregistre(dir);
    }
  }
  fs.writeFileSync(path.join(RACINE, 'config', 'fiches', `${id}.md`), ficheAuto(type, dir, port, dossiers.slice(1)));
  // même forme que les étages écrits à la main : `dossiers` seulement s'il y en a plusieurs
  const e = { id, nom: nomEtage, type, ordre, projet: dir, ...(dossiers.length > 1 ? { dossiers } : {}), actif: true, fiche: `${id}.md`, mcp };
  brut.etages.splice(direction ? brut.etages.indexOf(direction) + 1 : 0, 0, e);
  ecrireJson(FICHIER_ETAGES, brut);
  ajouterServicesEtage(e);
  publierEtages();
  for (const d of dossiers) notificationResolue(`NP-${slug(path.basename(d))}`);
  message(null, 'systeme', port ? t('Étage « {nom} » ajouté (rojo :{port}).', { nom: nomEtage, port }) : t('Étage « {nom} » ajouté.', { nom: nomEtage }), ['hall', id]);
  return e;
}

// Renommer, activer ou désactiver un étage, modifier sa fiche ou ses dossiers (Réglages › Étages).
export function modifierEtage(id, { nom, actif, fiche, dossiers } = {}) {
  const brut = lireEtages();
  const e = brut.etages.find((x) => x.id === id);
  if (!e) throw new Error(t('étage inconnu'));
  if (dossiers !== undefined) {
    // les salles communes et la Direction (qui suit les dossiers racines) n'ont pas de dossiers à elles
    if (!e.projet || ['direction', 'hall', 'salle-pause', 'salle-repos'].includes(id)) throw new Error(t("cet étage fait partie de l'immeuble"));
    const liste = validerDossiers(Array.isArray(dossiers) ? dossiers : [], id);
    // `dossiers` juste après `projet`, comme dans etages.json
    const cles = Object.keys(e).filter((k) => k !== 'dossiers');
    const copie = { ...e };
    for (const k of Object.keys(e)) delete e[k];
    for (const k of cles) {
      e[k] = k === 'projet' ? liste[0] : copie[k];
      if (k === 'projet' && liste.length > 1) e.dossiers = liste;
    }
  }
  if (nom !== undefined) e.nom = String(nom).trim().slice(0, 40) || e.nom;
  if (actif !== undefined && !['direction', 'hall', 'salle-pause', 'salle-repos'].includes(id)) e.actif = !!actif;
  if (fiche !== undefined) {
    if (!e.fiche) e.fiche = `${id}.md`;
    fs.writeFileSync(path.join(RACINE, 'config', 'fiches', e.fiche), String(fiche).slice(0, 20000));
  }
  ecrireJson(FICHIER_ETAGES, brut);
  if (dossiers !== undefined) ajouterServicesEtage(e);
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
  if (e.projet) marquerSignales((e.dossiers || [e.projet]).filter(Boolean));
  publierEtages();
  return e;
}

export function ignorerProjet(dir) {
  const memo = lireMemo();
  if (!memo.ignores.some((d) => norme(d) === norme(dir))) memo.ignores.push(dir);
  ecrireMemo(memo);
  notificationResolue(`NP-${slug(path.basename(dir))}`);
}
