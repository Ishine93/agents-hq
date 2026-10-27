// Notes de version (1.0.7) : notes/<version>.md, livrées avec le QG, s'ouvrent depuis le numéro de version en haut
// à gauche du site. Après une mise à jour, le site les montre une fois, de la version d'avant à celle-ci.
// runtime/version-vue.txt : la dernière version dont l'utilisateur a vu les notes.
import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from './config.js';

const DOSSIER = path.join(RACINE, 'notes');
// QG_VERSION_VUE_FICHIER : pour les tests
const fichierVu = () => process.env.QG_VERSION_VUE_FICHIER || path.join(RACINE, 'runtime', 'version-vue.txt');
const FORME = /^\d+\.\d+\.\d+$/;
// (un éditeur Windows peut avoir ajouté un BOM en tête du fichier : on l'ignore)
const versionActuelle = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8').replace(/^﻿/, '')).version;
  } catch {
    return null;
  }
};

export function comparerVersions(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  return 0;
}

/** Les notes livrées, de la plus récente à la plus ancienne : [{ version, texte }]. */
export function listeNotes(dossier = DOSSIER) {
  let fichiers = [];
  try {
    fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith('.md') && FORME.test(f.slice(0, -3)));
  } catch {
    return [];
  }
  return fichiers
    .map((f) => ({ version: f.slice(0, -3), texte: fs.readFileSync(path.join(dossier, f), 'utf8') }))
    .sort((a, b) => comparerVersions(b.version, a.version));
}

/**
 * Versions dont il faut montrer les notes au lancement, de la plus récente à la plus ancienne. vu : la dernière
 * version vue (null : jamais notée). Sans trace, un QG déjà utilisé vient d'être mis à jour depuis une version qui ne
 * notait rien (1.0.6 ou avant) : on montre les notes de la version actuelle ; une nouvelle installation, rien.
 */
export function aMontrer({ actuelle, vu, dejaUtilise, versions }) {
  if (!actuelle) return [];
  if (!vu) return dejaUtilise && versions.includes(actuelle) ? [actuelle] : [];
  if (comparerVersions(actuelle, vu) <= 0) return [];
  return versions.filter((v) => comparerVersions(v, vu) > 0 && comparerVersions(v, actuelle) <= 0);
}

const lireVu = () => {
  try {
    const v = fs.readFileSync(fichierVu(), 'utf8').trim();
    return FORME.test(v) ? v : null;
  } catch {
    return null;
  }
};

function noterVu(version) {
  try {
    fs.mkdirSync(path.dirname(fichierVu()), { recursive: true });
    fs.writeFileSync(fichierVu(), String(version));
  } catch {
    /* rien : les notes se remontreront au prochain lancement */
  }
}

function dossiersExistants() {
  try {
    return fs.readdirSync(path.join(RACINE, 'dossiers')).some((f) => /^D\d+$/.test(f));
  } catch {
    return false;
  }
}

let aMontrerAuLancement = [];

/**
 * Au démarrage du serveur, avant que le QG n'écrive quoi que ce soit : ce que le site montrera une fois.
 * En démo, en replay ou dans une copie de travail (dev), rien ne s'ouvre tout seul.
 */
export function preparerNotes({ silencieux = false } = {}) {
  const actuelle = versionActuelle();
  const vu = lireVu();
  const dejaUtilise = fs.existsSync(path.join(RACINE, 'runtime', 'conso.json')) || dossiersExistants();
  aMontrerAuLancement = silencieux ? [] : aMontrer({ actuelle, vu, dejaUtilise, versions: listeNotes().map((n) => n.version) });
  // nouvelle installation : rien à montrer, la version est notée tout de suite
  if (!silencieux && !vu && !dejaUtilise && actuelle) noterVu(actuelle);
  return aMontrerAuLancement;
}

/** Pour le site : toutes les notes, et celles à montrer tout de suite (vidé dès qu'elles sont vues). */
export function notesPubliques() {
  return { actuelle: versionActuelle(), versions: listeNotes(), aMontrer: aMontrerAuLancement };
}

export function marquerVues() {
  aMontrerAuLancement = [];
  const actuelle = versionActuelle();
  if (actuelle) noterVu(actuelle);
}
