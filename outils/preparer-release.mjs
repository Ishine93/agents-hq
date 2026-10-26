// Prépare la version publique du QG : copie une LISTE BLANCHE de fichiers dans un dossier de dépôt,
// vérifie qu'aucune donnée personnelle ni secret n'y figure, puis fabrique le zip et son empreinte.
// Usage : node outils/preparer-release.mjs <dossier du dépôt> [--zip <dossier de sortie>] [--motifs <fichier>]
// Rien n'est publié : la publication (git push, release GitHub) se fait à part, après relecture.
// --motifs : fichier texte (hors dépôt) de motifs personnels à chercher en plus, un par ligne.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const QG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (nom) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 ? args[i + 1] : null;
};
const DEPOT = path.resolve(args.find((a) => !a.startsWith('--') && a !== option('zip') && a !== option('motifs')) || path.join(QG, '..', '_QG-release', 'depot'));
const SORTIE_ZIP = option('zip') ? path.resolve(option('zip')) : path.dirname(DEPOT);
const VERSION = JSON.parse(fs.readFileSync(path.join(QG, 'package.json'), 'utf8')).version;

// ---------------------------------------------------------------- liste blanche
const FICHIERS_RACINE = [
  'package.json', 'package-lock.json', 'README.md', 'LICENSE', '.gitignore',
  'lancer.bat', 'lancer-demo.bat', 'installer.bat', 'installer-dictee.bat', 'ajouter-un-compte.bat', 'connecter-un-compte.bat', 'mettre-a-jour.bat',
];
const DOSSIERS = [
  ['serveur', (f) => /\.(js|py)$/.test(f)],
  ['serveur/i18n', (f) => /\.json$/.test(f)],
  ['web', (f) => /\.(js|css|html|png)$/.test(f) && f !== 'mock.js'],
  ['web/i18n', (f) => /\.js$/.test(f)],
  ['config/defauts', () => true],
  ['config/defauts/fiches', () => true],
  ['outils', (f) => /\.(ps1|mjs)$/.test(f)],
  ['docs', (f) => /\.md$/.test(f)],
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
for (const rel of fichiers) {
  const cible = copier(rel, DEPOT);
  if (/\.(png|jpg|ico)$/.test(rel)) continue; // images : pas de texte à contrôler
  const texte = fs.readFileSync(cible, 'utf8');
  for (const [re, quoi] of SECRETS) if (re.test(texte)) problemes.push(`${rel} : ${quoi} (${texte.match(re)[0].slice(0, 40)})`);
  for (const m of personnels) if (texte.toLowerCase().includes(m.toLowerCase())) problemes.push(`${rel} : motif personnel « ${m} »`);
  // Un accent dans un .bat décale la lecture de cmd après chcp 65001 (« 'tle' n'est pas reconnu… »).
  if (rel.endsWith('.bat') && /[^\x00-\x7F]/.test(texte)) problemes.push(`${rel} : caractère non ASCII (interdit dans un .bat)`);
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
// tar de Windows (bsdtar) sait écrire un zip ; celui de Git (GNU) non : on prend celui de System32.
const tarWindows = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
execFileSync(fs.existsSync(tarWindows) ? tarWindows : 'tar', ['-a', '-c', '-f', zip, '-C', temp, 'QG-des-agents'], { stdio: 'inherit' });
fs.rmSync(temp, { recursive: true, force: true });
const empreinte = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
fs.writeFileSync(`${zip}.sha256`, `${empreinte}  ${path.basename(zip)}\n`);
console.log(`Zip : ${zip} (${(fs.statSync(zip).size / 1024).toFixed(0)} ko)`);
console.log(`SHA-256 : ${empreinte}`);
