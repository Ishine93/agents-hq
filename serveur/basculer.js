// Bascule des nouveautés préparées pendant qu'un dossier tournait : à lancer serveur ARRÊTÉ.
// - config/_prochain/*  → config/ (consignes) ;
// - web-next/           → web/ (l'ancien site est gardé dans runtime/web-precedent/).
// Usage : node serveur/basculer.js [--sans-site]   (--sans-site : seulement les consignes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SANS_SITE = process.argv.includes('--sans-site');
const prochain = path.join(RACINE, 'config', '_prochain');
let n = 0;
if (fs.existsSync(prochain)) {
  for (const f of fs.readdirSync(prochain)) {
    fs.copyFileSync(path.join(prochain, f), path.join(RACINE, 'config', f));
    console.log(`config/${f} mis à jour`);
    n++;
  }
  fs.rmSync(prochain, { recursive: true, force: true });
}
const webNext = path.join(RACINE, 'web-next');
if (fs.existsSync(webNext) && !SANS_SITE) {
  const precedent = path.join(RACINE, 'runtime', 'web-precedent');
  fs.rmSync(precedent, { recursive: true, force: true });
  fs.cpSync(path.join(RACINE, 'web'), precedent, { recursive: true });
  fs.rmSync(path.join(RACINE, 'web'), { recursive: true, force: true });
  fs.renameSync(webNext, path.join(RACINE, 'web'));
  console.log('site : web-next/ → web/ (ancien site gardé dans runtime/web-precedent/)');
  n++;
}
console.log(n ? `Bascule terminée : relance ${process.platform === 'win32' ? 'lancer.bat' : 'lancer.command'}.` : 'Rien à basculer.');
