// Filtre des sorties de tests (1.0.6, A11) : l'agent ne relit que l'utile.
// Garde les 20 premières lignes, chaque bloc d'échec en entier et le résumé final.
// Le code de sortie reste celui de la commande de test (set -o pipefail dans la commande réécrite).
// Usage : <commande de test> 2>&1 | node outils/filtre-tests.mjs
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const TETE = 20;
const QUEUE = 15;
const SEUIL = 60; // sortie courte : rendue telle quelle

// Début d'un bloc d'échec (TAP, reporter spec de node, vitest, selene, rojo, erreurs génériques)
const ECHEC = /^\s*(not ok\b|✖|×|❯.*FAIL|FAIL\b|error(\[|:|\s)|Error:|\S+Error\b|AssertionError|panicked|thread '.*' panicked)/i;

export function filtrer(texte) {
  const lignes = texte.replace(/\r\n/g, '\n').split('\n');
  if (lignes.length <= SEUIL) return texte;
  const garder = new Set();
  for (let i = 0; i < Math.min(TETE, lignes.length); i++) garder.add(i);
  for (let i = Math.max(0, lignes.length - QUEUE); i < lignes.length; i++) garder.add(i);
  for (let i = 0; i < lignes.length; i++) {
    if (!ECHEC.test(lignes[i])) continue;
    // le bloc : la ligne d'échec et tout ce qui est plus indenté qu'elle (YAML TAP, pile d'appels, diff)
    const retrait = lignes[i].match(/^\s*/)[0].length;
    garder.add(i);
    let j = i + 1;
    while (j < lignes.length && (lignes[j].trim() === '' || lignes[j].match(/^\s*/)[0].length > retrait || /^\s*(at |---|\.\.\.|[+-] |expected|actual|received)/i.test(lignes[j]))) {
      garder.add(j);
      j++;
    }
    i = j - 1;
  }
  const sortie = [];
  let saut = 0;
  for (let i = 0; i < lignes.length; i++) {
    if (garder.has(i)) {
      if (saut) sortie.push(`… (${saut} lignes sans échec omises par le filtre du QG)`);
      saut = 0;
      sortie.push(lignes[i]);
    } else saut++;
  }
  if (saut) sortie.push(`… (${saut} lignes omises)`);
  return sortie.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const entree = fs.readFileSync(0, 'utf8');
  process.stdout.write(filtrer(entree));
}
