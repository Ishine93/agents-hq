// Lecture de la configuration du QG (dossier config/).
// config/defauts/ : valeurs livrées avec le QG. config/*.json : tes réglages, créés au premier lancement
// à partir des défauts et jamais publiés. Un réglage absent de ton fichier prend la valeur par défaut.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as plateforme from './plateforme.js';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(RACINE, 'config');
const DEFAUTS = path.join(CONFIG, 'defauts');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const lireJson = (...p) => JSON.parse(lire(...p));
// Les défauts (config/defauts/*.json) écrivent leurs chemins à la façon Windows (« \\ » dans le JSON).
// Sur Mac, ces séparateurs deviennent des « / » au moment de la création du fichier personnel.
export const adapterDefauts = (brut, plat = plateforme.PLATEFORME) => (plateforme.estWindows(plat) ? brut : brut.replaceAll('\\\\', '/'));

// Fichiers personnels : créés depuis config/defauts au premier lancement.
const PERSONNELS = ['reglages.json', 'comptes.json', 'etages.json', 'mcp.json', 'ports.json'];

export function ecrireJson(fichier, contenu) {
  const tmp = fichier + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(contenu, null, 2) + '\n');
  fs.renameSync(tmp, fichier);
}

const estObjet = (v) => v && typeof v === 'object' && !Array.isArray(v);
function fusion(base, ajout) {
  const r = { ...base };
  for (const [k, v] of Object.entries(ajout || {})) r[k] = estObjet(v) && estObjet(base?.[k]) ? fusion(base[k], v) : v;
  return r;
}

function assurerConfig() {
  fs.mkdirSync(path.join(CONFIG, 'fiches'), { recursive: true });
  fs.mkdirSync(path.join(RACINE, 'runtime'), { recursive: true });
  const nouveau = !fs.existsSync(path.join(CONFIG, 'reglages.json'));
  for (const f of PERSONNELS) {
    const cible = path.join(CONFIG, f);
    if (fs.existsSync(cible)) continue;
    // Les défauts peuvent citer le dossier du QG ({QG}) et ton dossier personnel ({HOME}).
    const brut = adapterDefauts(fs.readFileSync(path.join(DEFAUTS, f), 'utf8'))
      .replaceAll('{QG}', RACINE.replace(/\\/g, '\\\\'))
      .replaceAll('{HOME}', os.homedir().replace(/\\/g, '\\\\'));
    fs.writeFileSync(cible, brut);
  }
  // Installation d'avant les dossiers racines : la racine était le dossier de la Direction.
  const perso = lireJson('config', 'reglages.json');
  if (!nouveau && !Array.isArray(perso.racines)) {
    const direction = lireJson('config', 'etages.json').etages.find((e) => e.id === 'direction');
    perso.racines = direction?.projet ? [direction.projet] : [];
    perso.onboarding = true;
    ecrireJson(path.join(CONFIG, 'reglages.json'), perso);
  }
  // 1.0.11 : Standard devient le coût par défaut des nouvelles installations ; une installation d'avant qui n'avait
  // jamais choisi garde Équilibré, l'ancien défaut (ses valeurs de Personnalisé restent).
  if (!nouveau && !perso.travail?.cout) {
    perso.travail = { ...(perso.travail || {}), cout: 'equilibre' };
    ecrireJson(path.join(CONFIG, 'reglages.json'), perso);
  }
  ajouterSallesCommunes(path.join(CONFIG, 'etages.json'));
}

// 1.0.2 : salle de pause (agents qui attendent) et salle de repos (agents en réserve) ; 1.0.10 : isoloir (demandes
// directes). Ajoutées juste au-dessus du hall quand elles manquent (installation ou immeuble de la démo plus anciens).
function ajouterSallesCommunes(fichierEtages) {
  const brutEtages = JSON.parse(fs.readFileSync(fichierEtages, 'utf8'));
  const manquants = SALLES_COMMUNES.filter((s) => !brutEtages.etages.some((e) => e.type === s.type));
  if (!manquants.length) return;
  for (const e of brutEtages.etages) if (e.ordre >= 1) e.ordre += manquants.length;
  manquants.forEach((s, i) => brutEtages.etages.push({ ...s, ordre: 1 + i }));
  ecrireJson(fichierEtages, brutEtages);
}

// Étages communs (sans projet) : le DG n'y envoie jamais de tâche, la scène y place les agents.
const SALLES_COMMUNES = [
  { id: 'salle-repos', nom: 'Salle de repos', type: 'repos', projet: null, actif: true, note: 'Les agents en réserve y dorment, prêts à être réembauchés.' },
  { id: 'salle-pause', nom: 'Salle de pause', type: 'pause', projet: null, actif: true, note: 'Les agents qui attendent leur tour y jouent (billard, baby-foot, télé).' },
  { id: 'isoloir', nom: 'Isoloir', type: 'isoloir', projet: null, actif: true, note: 'Demandes directes (1.0.10) : un agent seul, sans DG, comme dans Claude Code ou Codex.' },
];
assurerConfig();

function chargerReglages() {
  return fusion(lireJson('config', 'defauts', 'reglages.json'), lireJson('config', 'reglages.json'));
}

// Objet partagé : modifierReglages() le met à jour sur place, les modules qui l'ont importé voient le changement.
export const REGLAGES = chargerReglages();

/**
 * Garde-fou Fable (1.0.11) : 'off' (rien), 'seuil' (te demander sous le seuil de sa semaine), 'toujours' (te demander à
 * chaque plan qui en prévoit), 'jamais' (Fable n'est plus proposé au DG pour les tâches ; le modèle du DG ne change pas).
 * Réglages d'avant : actif false = 'off', sinon 'seuil'.
 */
export const MODES_FABLE = ['off', 'seuil', 'toujours', 'jamais'];
export function modeFable(g = REGLAGES.gardeFable || {}) {
  if (MODES_FABLE.includes(g.mode)) return g.mode;
  return g.actif === false ? 'off' : 'seuil';
}

export function modifierReglages(patch) {
  const fichier = path.join(CONFIG, 'reglages.json');
  ecrireJson(fichier, fusion(lireJson('config', 'reglages.json'), patch));
  const frais = chargerReglages();
  for (const k of Object.keys(REGLAGES)) if (!(k in frais)) delete REGLAGES[k];
  Object.assign(REGLAGES, frais);
  return REGLAGES;
}

// Dossiers racines : là où vivent tes projets (un étage par projet). Les agents y écrivent librement ;
// écrire ailleurs leur demande ton accord.
export function racines() {
  return (REGLAGES.racines || []).filter((r) => {
    try {
      return fs.statSync(r).isDirectory();
    } catch {
      return false;
    }
  });
}

export let FICHIER_ETAGES = path.join(CONFIG, 'etages.json');
let societeDemo = null;

// Démo : un immeuble fictif à elle (dossiers-demo/etages.json, copié de config/defauts/etages-demo.json),
// pour ne jamais toucher à tes étages ni à tes projets. Ses « projets » sont des dossiers vides de
// dossiers-demo/societe (un fichier Rojo pour les jeux Roblox : leurs serveurs, simulés, vont au sous-sol).
export function utiliserImmeubleDemo(dossierDemo, { neuf = false } = {}) {
  societeDemo = path.join(dossierDemo, 'societe');
  FICHIER_ETAGES = path.join(dossierDemo, 'etages.json');
  if (neuf || !fs.existsSync(FICHIER_ETAGES)) {
    fs.mkdirSync(dossierDemo, { recursive: true });
    const brut = adapterDefauts(fs.readFileSync(path.join(DEFAUTS, 'etages-demo.json'), 'utf8')).replaceAll('{DEMO}', societeDemo.replace(/\\/g, '\\\\'));
    fs.writeFileSync(FICHIER_ETAGES, brut);
  }
  ajouterSallesCommunes(FICHIER_ETAGES);
  for (const e of JSON.parse(fs.readFileSync(FICHIER_ETAGES, 'utf8')).etages) {
    if (!e.projet) continue;
    fs.mkdirSync(e.projet, { recursive: true });
    const rojo = path.join(e.projet, 'default.project.json');
    if (e.type === 'roblox' && e.portRojo && !fs.existsSync(rojo)) fs.writeFileSync(rojo, JSON.stringify({ name: e.id, servePort: e.portRojo, tree: { $className: 'DataModel' } }, null, 2));
  }
}

export function etages() {
  const liste = JSON.parse(fs.readFileSync(FICHIER_ETAGES, 'utf8')).etages;
  if (societeDemo) return liste;
  // La Direction (bureau du DG) couvre toutes les racines.
  const r = racines();
  for (const e of liste) {
    if (e.id !== 'direction') continue;
    e.projet = r[0] || path.join(RACINE, 'bac-a-sable');
    e.dossiers = r.length ? r : [e.projet];
  }
  return liste;
}

export function etage(id) {
  return etages().find((e) => e.id === id) || null;
}

export function etagesActifs() {
  return etages().filter((e) => e.actif && e.projet);
}

// Fichiers livrés avec le QG (identiques pour tout le monde) : profils de permissions, directives, services.
export function profils() {
  return lireJson('config', 'defauts', 'profils.json');
}

// Noms de langue pour les consignes des IA.
export const LANGUES_IA = {
  fr: 'français', en: 'English', es: 'español', de: 'Deutsch', it: 'italiano', pt: 'português', nl: 'Nederlands', pl: 'polski',
};
export const langueIA = () => LANGUES_IA[REGLAGES.langueIA] || REGLAGES.langueIA || 'français';

// Ligne de la délégation d'images ({IMAGES}) : fournie par delegation.js, vide tant que la délégation est coupée.
let ligneImages = () => '';
export const definirLigneImages = (f) => {
  ligneImages = f;
};

// Les directives citent les racines, le dossier du QG, ton prénom et la langue de travail.
export function directive(nom) {
  const r = racines();
  const texte = lire('config', 'defauts', `directive-${nom}.md`)
    .replaceAll('{RACINES}', r.length ? r.join(', ') : '(aucun dossier racine choisi)')
    .replaceAll('{QG}', RACINE)
    .replaceAll('{UTILISATEUR}', REGLAGES.utilisateur ? `L'utilisateur, ${REGLAGES.utilisateur},` : "L'utilisateur")
    .replaceAll('{LANGUE}', langueIA())
    // ligne « Système : … » sur Mac ; sous Windows, la ligne disparaît (consignes inchangées)
    .replace(/\{SYSTEME\}\r?\n?/g, plateforme.consigneSysteme() ? plateforme.consigneSysteme() + '\n' : '')
    .replace(/\{IMAGES\}\r?\n?/g, () => (ligneImages() ? ligneImages() + '\n' : ''))
    .replaceAll(
      '{GIT}',
      REGLAGES.gitAuto === true
        ? "- Git : l'utilisateur autorise les opérations git sans demander (pull, commit, branche, merge, push), quand la mission le demande. Fais des commits clairs et ne pousse que ce que la mission a produit."
        : "- Git : pas de git push (ni de publication) sans accord de l'utilisateur.",
    )
    .replaceAll(
      '{VALIDATION_USER}',
      REGLAGES.validationUtilisateur === true
        ? "- `user` : l'utilisateur valide lui-même (goût, gameplay, visuel)."
        : "- `user` : désactivé, l'utilisateur veut que ses dossiers aillent de A à Z sans l'attendre. Pour le goût, le visuel ou le gameplay, choisis `agent` avec des checks concrets (captures d'écran, playtest automatisé, conventions du projet).",
    );
  return texte;
}

export function fiche(e) {
  if (!e?.fiche) return '';
  for (const dossier of [['config', 'fiches'], ['config', 'defauts', 'fiches']]) {
    try {
      return lire(...dossier, e.fiche).replaceAll('{QG}', RACINE).trim();
    } catch {
      /* fiche suivante */
    }
  }
  return '';
}

// Serveurs MCP autorisés pour un étage : ceux du .mcp.json du projet, filtrés par la liste blanche
// de etages.json. Les sessions sont lancées en strictMcpConfig : les connecteurs claude.ai du compte
// (Drive, Microsoft 365, Calendar…) et les MCP utilisateur ne leur sont jamais donnés.
export function mcpEtage(e) {
  if (!e?.projet || !e.mcp?.length) return {};
  try {
    const brut = JSON.parse(fs.readFileSync(path.join(e.projet, '.mcp.json'), 'utf8')).mcpServers || {};
    return Object.fromEntries(Object.entries(brut).filter(([nom]) => e.mcp.includes(nom)));
  } catch {
    return {};
  }
}

// Un chemin est-il sous un des dossiers donnés ? (comparaison selon la plateforme : plateforme.cleChemin)
export function sous(dossiers, chemin) {
  return plateforme.sousChemin(dossiers, chemin);
}

// Un chemin est-il dans un des dossiers de l'étage ?
export function dansEtage(e, chemin) {
  if (!e) return false;
  return sous(e.dossiers || [e.projet], chemin);
}

// Chemin → forme des règles de permission de Claude Code (Windows : D:\Dev → //d/Dev ; Mac : /Users/x → //Users/x).
export function cheminRegle(p) {
  return plateforme.cheminRegle(p);
}
