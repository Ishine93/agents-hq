// Prépare la version publique du QG : copie une LISTE BLANCHE de fichiers dans un dossier de dépôt,
// vérifie qu'aucune donnée personnelle ni secret n'y figure, puis fabrique le zip et son empreinte.
// Usage : node outils/preparer-release.mjs [<dossier du dépôt>] [--zip <dossier de sortie>] [--motifs <fichier>]
// Sans dossier du dépôt : ../release/depot (rangement QG\dev + QG\release), sinon l'ancien ../_QG-release/depot.
// Rien n'est publié : la publication (git push, release GitHub) se fait à part, après relecture.
// --motifs : fichier texte (hors dépôt) de motifs personnels à chercher en plus, un par ligne.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const QG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (nom) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 ? args[i + 1] : null;
};
const depotParDefaut = () => {
  const range = path.join(QG, '..', 'release', 'depot');
  const ancien = path.join(QG, '..', '_QG-release', 'depot');
  return fs.existsSync(range) || !fs.existsSync(ancien) ? range : ancien;
};
const DEPOT = path.resolve(args.find((a) => !a.startsWith('--') && a !== option('zip') && a !== option('motifs')) || depotParDefaut());
const SORTIE_ZIP = option('zip') ? path.resolve(option('zip')) : path.dirname(DEPOT);
const VERSION = JSON.parse(fs.readFileSync(path.join(QG, 'package.json'), 'utf8')).version;

// ---------------------------------------------------------------- liste blanche
const FICHIERS_RACINE = [
  'package.json', 'package-lock.json', 'README.md', 'LICENSE', '.gitignore', '.gitattributes',
  'lancer.bat', 'lancer-demo.bat', 'installer.bat', 'installer-dictee.bat', 'ajouter-un-compte.bat', 'connecter-un-compte.bat', 'mettre-a-jour.bat',
  // Mac (une seule archive pour Windows et Mac : voir docs/portage-mac/analyse.md, §3.4)
  'lancer.command', 'lancer-demo.command', 'installer.command', 'ajouter-un-compte.command', 'connecter-un-compte.command', 'mettre-a-jour.command',
];
// Scripts Mac : exécutables dans le zip (droits Unix 0755), fins de ligne LF, pas de BOM.
const EXECUTABLE = (rel) => /\.(command|sh)$/.test(rel);
const DOSSIERS = [
  ['serveur', (f) => /\.(js|py)$/.test(f)],
  ['serveur/i18n', (f) => /\.json$/.test(f)],
  // adaptateurs d'IA (Claude, Codex, ACP) : sans eux, le serveur ne démarre pas
  ['serveur/ia', (f) => /\.js$/.test(f)],
  ['web', (f) => /\.(js|css|html|png)$/.test(f) && f !== 'mock.js'],
  ['web/i18n', (f) => /\.js$/.test(f)],
  ['config/defauts', () => true],
  ['config/defauts/fiches', () => true],
  ['outils', (f) => /\.(ps1|mjs|sh)$/.test(f)],
  // notes de version (1.0.7) : lues par le site (numéro de version en haut à gauche)
  ['notes', (f) => /^\d+\.\d+\.\d+\.md$/.test(f)],
  ['docs', (f) => /\.md$/.test(f)],
  ['docs/cout', (f) => /\.md$/.test(f)],
  ['docs/cout/outils', (f) => /\.cjs$/.test(f)],
  ['docs/multi-ia', (f) => /\.md$/.test(f)],
  ['docs/portage-mac', (f) => /\.md$/.test(f)],
  // fenêtre « application » (Electron, installé à la demande dans runtime/navigateur)
  ['app', (f) => /\.(cjs|json|ico)$/.test(f)],
  // images du README
  ['docs/images', (f) => /\.(png|jpg)$/.test(f)],
];
const DEMO = ['bac-a-sable/projet-demo/README.md', 'bac-a-sable/projet-demo/package.json', 'bac-a-sable/projet-demo/src/chemin.js'];

// ---------------------------------------------------------------- contrôles
// Motifs interdits partout : secrets et identifiants.
const SECRETS = [
  [/sk-ant-[A-Za-z0-9_-]{10,}/, 'clé API Anthropic'],
  [/gh[opsu]_[A-Za-z0-9]{20,}/, 'jeton GitHub'],
  // (motif assemblé en morceaux pour que ce fichier ne se signale pas lui-même)
  [new RegExp(['"access', 'Token"|"refresh', 'Token"|oauth', 'Account'].join('')), 'jeton de connexion'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée'],
  [/[A-Za-z0-9._%+-]+@(?:gmail|outlook|hotmail|yahoo|proton)\.[a-z]{2,}/i, 'adresse e-mail'],
  [/C:\\\\?Users\\\\?(?!\*|Public)[A-Za-z0-9_.-]+/i, 'dossier personnel Windows'],
  // (sauf « * », Shared, et les exemples à une lettre des commentaires et de la doc : /Users/x/Dev)
  [/\/Users\/(?!\*|Shared\b|\{|[A-Za-z]\b)[A-Za-z0-9._-]+/, 'dossier personnel Mac'],
];
const personnels = [];
if (option('motifs')) {
  for (const l of fs.readFileSync(path.resolve(option('motifs')), 'utf8').split(/\r?\n/)) if (l.trim()) personnels.push(l.trim());
}

const lignesCrlf = (s) => s.replace(/\r?\n/g, '\r\n');

function copier(rel, dest) {
  const src = path.join(QG, rel);
  const cible = path.join(dest, rel);
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  let contenu = fs.readFileSync(src);
  // .bat en CRLF ; .ps1 en UTF-8 avec BOM et CRLF (sinon Windows PowerShell 5.1 lit les accents de travers).
  if (rel.endsWith('.bat')) contenu = Buffer.from(lignesCrlf(contenu.toString('utf8')), 'utf8');
  if (rel.endsWith('.ps1')) contenu = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lignesCrlf(contenu.toString('utf8').replace(/^\ufeff/, '')), 'utf8')]);
  // .sh et .command : LF, sans BOM (bash de macOS : \u00ab bad interpreter: /bin/bash^M \u00bb sinon).
  if (EXECUTABLE(rel)) contenu = Buffer.from(contenu.toString('utf8').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n'), 'utf8');
  fs.writeFileSync(cible, contenu);
  return cible;
}

function lister() {
  const liste = [...FICHIERS_RACINE, ...DEMO];
  for (const [dossier, garder] of DOSSIERS) {
    const abs = path.join(QG, dossier);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs, { withFileTypes: true })) if (f.isFile() && garder(f.name)) liste.push(`${dossier}/${f.name}`);
  }
  return liste;
}

// ---------------------------------------------------------------- copie
if (fs.existsSync(DEPOT)) {
  // On garde .git ; tout le reste est remplacé (un fichier retiré du QG disparaît du dépôt).
  for (const f of fs.readdirSync(DEPOT)) if (f !== '.git') fs.rmSync(path.join(DEPOT, f), { recursive: true, force: true });
} else fs.mkdirSync(DEPOT, { recursive: true });

const fichiers = lister();
const manquants = fichiers.filter((f) => !fs.existsSync(path.join(QG, f)));
if (manquants.length) {
  console.error('Fichiers manquants :', manquants.join(', '));
  process.exit(1);
}
const problemes = [];
// Les dossiers de la liste blanche ne sont pas parcourus en profondeur : un import relatif vers un fichier
// non copié (nouveau sous-dossier) donnerait un QG qui ne démarre pas.
const copies = new Set([...fichiers, 'web/mock.js']); // mock.js : absent exprès, chargé seulement en simulation
for (const rel of fichiers.filter((f) => /^(serveur|web)\/.*\.m?js$/.test(f))) {
  const texte = fs.readFileSync(path.join(QG, rel), 'utf8');
  for (const m of texte.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
    const cible = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
    if (!copies.has(cible)) problemes.push(`${rel} : importe ${m[1]}, absent de la liste blanche`);
  }
}
for (const rel of fichiers) {
  const cible = copier(rel, DEPOT);
  if (/\.(png|jpg|ico)$/.test(rel)) continue; // images : pas de texte à contrôler
  const texte = fs.readFileSync(cible, 'utf8');
  for (const [re, quoi] of SECRETS) if (re.test(texte)) problemes.push(`${rel} : ${quoi} (${texte.match(re)[0].slice(0, 40)})`);
  for (const m of personnels) if (texte.toLowerCase().includes(m.toLowerCase())) problemes.push(`${rel} : motif personnel « ${m} »`);
  // Un accent dans un .bat décale la lecture de cmd après chcp 65001 (« 'tle' n'est pas reconnu… »).
  if (rel.endsWith('.bat') && /[^\x00-\x7F]/.test(texte)) problemes.push(`${rel} : caractère non ASCII (interdit dans un .bat)`);
  // Les scripts Mac doivent partir en LF (un CRLF casse le shebang) ; les .command restent en ASCII comme les .bat.
  if (EXECUTABLE(rel) && texte.includes('\r')) problemes.push(`${rel} : retour chariot (CR) dans un script Mac`);
  if (rel.endsWith('.command') && /[^\x00-\x7F]/.test(texte)) problemes.push(`${rel} : caractère non ASCII (interdit dans un .command)`);
}
fs.mkdirSync(path.join(DEPOT, 'config', 'fiches'), { recursive: true });
fs.writeFileSync(path.join(DEPOT, 'config', 'fiches', '.gitkeep'), '');

console.log(`${fichiers.length} fichiers copiés dans ${DEPOT}`);
if (problemes.length) {
  console.error('\nDONNÉES À RETIRER AVANT PUBLICATION :');
  for (const p of problemes) console.error('  - ' + p);
  process.exit(2);
}
console.log('Contrôle : aucun secret ni motif personnel trouvé.');

// ---------------------------------------------------------------- zip
if (args.includes('--sans-zip')) process.exit(0);
const nom = `QG-des-agents-${VERSION}`;
const temp = path.join(SORTIE_ZIP, `.${nom}`);
fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });
fs.cpSync(DEPOT, path.join(temp, 'QG-des-agents'), { recursive: true, filter: (s) => !s.split(path.sep).includes('.git') });
const zip = path.join(SORTIE_ZIP, `${nom}.zip`);
fs.rmSync(zip, { force: true });
// Une seule archive pour Windows et Mac, écrite ici en Node (zlib) : les droits Unix sont posés dans les
// attributs externes (0755 pour .command et .sh, 0644 sinon), ce que l'Utilitaire d'archive, ditto et unzip
// appliquent à l'extraction. Le tar de Windows n'écrit pas ces droits.
fs.writeFileSync(zip, fabriquerZip(temp));
fs.rmSync(temp, { recursive: true, force: true });
const empreinte = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
fs.writeFileSync(`${zip}.sha256`, `${empreinte}  ${path.basename(zip)}\n`);
console.log(`Zip : ${zip} (${(fs.statSync(zip).size / 1024).toFixed(0)} ko)`);
console.log(`SHA-256 : ${empreinte}`);

// ---------------------------------------------------------------- zip (format PKZIP, deflate, droits Unix)
function fabriquerZip(dossier) {
  const fichiers = [];
  const parcourir = (d, rel) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(d, f.name);
      const r = rel ? `${rel}/${f.name}` : f.name;
      if (f.isDirectory()) parcourir(abs, r);
      else fichiers.push({ rel: r, abs });
    }
  };
  parcourir(dossier, '');
  const maintenant = new Date();
  const dosTemps = (maintenant.getHours() << 11) | (maintenant.getMinutes() << 5) | (maintenant.getSeconds() >> 1);
  const dosDate = ((maintenant.getFullYear() - 1980) << 9) | ((maintenant.getMonth() + 1) << 5) | maintenant.getDate();
  const locaux = [];
  const central = [];
  let decalage = 0;
  for (const { rel, abs } of fichiers) {
    const donnees = fs.readFileSync(abs);
    const comprime = zlib.deflateRawSync(donnees, { level: 9 });
    const nomOctets = Buffer.from(rel, 'utf8');
    const crc = zlib.crc32(donnees);
    const mode = EXECUTABLE(rel) ? 0o100755 : 0o100644;
    const enTete = Buffer.alloc(30);
    enTete.writeUInt32LE(0x04034b50, 0);
    enTete.writeUInt16LE(20, 4); // version requise : 2.0 (deflate)
    enTete.writeUInt16LE(0x0800, 6); // noms en UTF-8
    enTete.writeUInt16LE(8, 8); // deflate
    enTete.writeUInt16LE(dosTemps, 10);
    enTete.writeUInt16LE(dosDate, 12);
    enTete.writeUInt32LE(crc, 14);
    enTete.writeUInt32LE(comprime.length, 18);
    enTete.writeUInt32LE(donnees.length, 22);
    enTete.writeUInt16LE(nomOctets.length, 26);
    enTete.writeUInt16LE(0, 28);
    locaux.push(enTete, nomOctets, comprime);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE((3 << 8) | 20, 4); // « fait par » : Unix (3), version 2.0 → les attributs externes portent les droits
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dosTemps, 12);
    c.writeUInt16LE(dosDate, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comprime.length, 20);
    c.writeUInt32LE(donnees.length, 24);
    c.writeUInt16LE(nomOctets.length, 28);
    c.writeUInt16LE(0, 30); // extra
    c.writeUInt16LE(0, 32); // commentaire
    c.writeUInt16LE(0, 34); // disque
    c.writeUInt16LE(0, 36); // attributs internes
    c.writeUInt32LE((mode << 16) >>> 0, 38); // attributs externes : droits Unix dans les 16 bits hauts
    c.writeUInt32LE(decalage, 42);
    central.push(c, nomOctets);
    decalage += enTete.length + nomOctets.length + comprime.length;
  }
  const tailleCentral = central.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(decalage, 16);
  fin.writeUInt16LE(0, 20);
  return Buffer.concat([...locaux, ...central, fin]);
}
