// Lecture de la configuration du QG (dossier config/).
// config/defauts/ : valeurs livrées avec le QG. config/*.json : tes réglages, créés au premier lancement
// à partir des défauts et jamais publiés. Un réglage absent de ton fichier prend la valeur par défaut.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(RACINE, 'config');
const DEFAUTS = path.join(CONFIG, 'defauts');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const lireJson = (...p) => JSON.parse(lire(...p));
export const NODE_DIR = path.join(RACINE, 'runtime', 'node');

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
    const brut = fs.readFileSync(path.join(DEFAUTS, f), 'utf8')
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
}
assurerConfig();

function chargerReglages() {
  return fusion(lireJson('config', 'defauts', 'reglages.json'), lireJson('config', 'reglages.json'));
}

// Objet partagé : modifierReglages() le met à jour sur place, les modules qui l'ont importé voient le changement.
export const REGLAGES = chargerReglages();

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

export const FICHIER_ETAGES = path.join(CONFIG, 'etages.json');

export function etages() {
  const liste = lireJson('config', 'etages.json').etages;
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

// Les directives citent les racines, le dossier du QG, ton prénom et la langue de travail.
export function directive(nom) {
  const r = racines();
  const texte = lire('config', 'defauts', `directive-${nom}.md`)
    .replaceAll('{RACINES}', r.length ? r.join(', ') : '(aucun dossier racine choisi)')
    .replaceAll('{QG}', RACINE)
    .replaceAll('{UTILISATEUR}', REGLAGES.utilisateur ? `L'utilisateur, ${REGLAGES.utilisateur},` : "L'utilisateur")
    .replaceAll('{LANGUE}', langueIA());
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

const normaliser = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');

// Un chemin est-il sous un des dossiers donnés ?
export function sous(dossiers, chemin) {
  if (!chemin) return false;
  const cible = normaliser(chemin);
  return dossiers.filter(Boolean).some((d) => {
    const base = normaliser(d);
    return cible === base || cible.startsWith(base + '/');
  });
}

// Un chemin est-il dans un des dossiers de l'étage ?
export function dansEtage(e, chemin) {
  if (!e) return false;
  return sous(e.dossiers || [e.projet], chemin);
}

// Chemin Windows → forme des règles de permission de Claude Code (D:\Dev → //d/Dev).
export function cheminRegle(p) {
  const abs = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
  const m = abs.match(/^([A-Za-z]):(.*)$/);
  return m ? `//${m[1].toLowerCase()}${m[2]}` : abs;
}
