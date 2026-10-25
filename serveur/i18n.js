// Traduction des textes du serveur affichés sur le site (langue de l'interface).
// La clé est le texte français ; i18n/en.json donne l'anglais. {nom} est remplacé par vars.nom.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGLAGES } from './config.js';

let EN = null;
function anglais() {
  if (!EN) {
    try {
      EN = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'i18n', 'en.json'), 'utf8'));
    } catch {
      EN = {};
    }
  }
  return EN;
}

export function t(source, vars = null) {
  let texte = (REGLAGES.langueInterface === 'en' && anglais()[source]) || source;
  if (vars) texte = texte.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
  return texte;
}
