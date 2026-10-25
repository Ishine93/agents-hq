// Registre des ports Rojo (config/ports.json) : un port par jeu, jamais deux jeux sur le même.
import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from './config.js';

const FICHIER = path.join(RACINE, 'config', 'ports.json');
const norme = (p) => path.resolve(p).toLowerCase();

function lire() {
  return JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
}

function ecrire(reg) {
  const tmp = FICHIER + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 2) + '\n');
  fs.renameSync(tmp, FICHIER);
}

export function portEnregistre(projet) {
  const reg = lire();
  const cle = Object.keys(reg.jeux).find((k) => norme(k) === norme(projet));
  return cle ? reg.jeux[cle].port : null;
}

export function portsUtilises() {
  return new Set(Object.values(lire().jeux).map((j) => j.port));
}

function servePortDuProjet(projet) {
  try {
    return Number(JSON.parse(fs.readFileSync(path.join(projet, 'default.project.json'), 'utf8')).servePort) || null;
  } catch {
    return null;
  }
}

// Écrit (ou remplace) "servePort" dans default.project.json en touchant le moins possible au fichier.
function ecrireServePort(projet, port) {
  const f = path.join(projet, 'default.project.json');
  let texte = fs.readFileSync(f, 'utf8');
  if (/"servePort"\s*:\s*\d+/.test(texte)) texte = texte.replace(/"servePort"\s*:\s*\d+/, `"servePort": ${port}`);
  else texte = texte.replace(/^(\s*)"name"\s*:\s*("[^"]*")\s*,/m, (m, indent, nom) => `${indent}"name": ${nom},\n${indent}"servePort": ${port},`);
  JSON.parse(texte); // garde-fou : on n'écrit jamais un JSON cassé
  fs.writeFileSync(f, texte);
}

/**
 * Nouveau jeu : garde son servePort s'il est libre, sinon lui attribue le prochain port libre
 * et l'écrit dans son default.project.json. Renvoie { port, change }.
 */
export function attribuerPort(projet) {
  const deja = portEnregistre(projet);
  if (deja) return { port: deja, change: false };
  const reg = lire();
  const pris = portsUtilises();
  const actuel = servePortDuProjet(projet);
  let port = actuel;
  let change = false;
  if (!actuel || pris.has(actuel)) {
    port = reg.base;
    while (pris.has(port)) port += 1;
    ecrireServePort(projet, port);
    change = true;
  }
  reg.jeux[projet] = { port, source: 'projet', attribueLe: new Date().toISOString().slice(0, 10) };
  ecrire(reg);
  return { port, change, ancien: actuel };
}
