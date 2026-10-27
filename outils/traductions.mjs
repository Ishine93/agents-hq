// Traductions de l'interface : fusionne web/i18n/parts/*.json dans web/i18n/en.js, puis vérifie que
// chaque texte source passé à t() / tr() (site et serveur) a sa traduction.
// Usage : node outils/traductions.mjs [--verifier]   (--verifier : ne réécrit rien)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifierSeul = process.argv.includes('--verifier');

const lireJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const echapper = (s) => s.replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r' })[c] ?? c);

// Textes sources : premier argument littéral de t( / tr( / tn( (guillemets simples ou accents graves sans ${}).
function sources(fichier) {
  const code = fs.readFileSync(fichier, 'utf8');
  const out = new Set();
  for (const m of code.matchAll(/(?<![\w.$])(?:t|tr)\(\s*'((?:[^'\\\n]|\\.)*)'/g)) out.add(echapper(m[1]));
  for (const m of code.matchAll(/(?<![\w.$])(?:t|tr)\(\s*`((?:[^`\\$]|\\.)*)`/g)) out.add(echapper(m[1]));
  for (const m of code.matchAll(/(?<![\w.$])tn\(\s*[^,]+,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g)) {
    out.add(echapper(m[1]));
    out.add(echapper(m[2]));
  }
  return out;
}

function sourcesHtml(fichier) {
  const html = fs.readFileSync(fichier, 'utf8');
  const out = new Set();
  for (const m of html.matchAll(/<\w+[^>]*\sdata-t(?=[\s>])[^>]*>([^<]*)</g)) out.add(m[1]);
  for (const m of html.matchAll(/data-t-(?:title|placeholder|aria)="([^"]*)"/g)) out.add(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  return out;
}

// ---------------------------------------------------------------- site
const dossierParts = path.join(QG, 'web', 'i18n', 'parts');
const cibleWeb = path.join(QG, 'web', 'i18n', 'en.js');
let dico = {};
if (fs.existsSync(dossierParts)) {
  for (const f of fs.readdirSync(dossierParts).filter((x) => x.endsWith('.json')).sort()) {
    const part = lireJson(path.join(dossierParts, f));
    for (const [k, v] of Object.entries(part)) {
      if (typeof v !== 'string') continue;
      if (dico[k] && dico[k] !== v) console.log(`  doublon (${f}) : « ${k} » → garde « ${dico[k]} »`);
      else dico[k] = v;
    }
  }
} else {
  // Pas de morceaux : on part du dictionnaire existant.
  const brut = fs.readFileSync(cibleWeb, 'utf8').replace(/^[\s\S]*?export default/, '').replace(/;\s*$/, '');
  dico = brut.trim() === '{\n}' ? {} : Function(`return (${brut})`)();
}
if (!verifierSeul) {
  const cles = Object.keys(dico).sort((a, b) => a.localeCompare(b, 'fr'));
  const corps = cles.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(dico[k])},`).join('\n');
  fs.writeFileSync(cibleWeb, `// Dictionnaire anglais du site : texte source français → anglais. Fabriqué par outils/traductions.mjs\n// à partir de web/i18n/parts/*.json ; une entrée absente garde le français.\nexport default {\n${corps}\n};\n`);
  console.log(`web/i18n/en.js : ${cles.length} entrées`);
}

const manquantsWeb = new Set();
for (const f of fs.readdirSync(path.join(QG, 'web')).filter((x) => x.endsWith('.js') && x !== 'mock.js')) {
  for (const s of sources(path.join(QG, 'web', f))) if (!(s in dico)) manquantsWeb.add(`${f} : ${s}`);
}
for (const s of sourcesHtml(path.join(QG, 'web', 'index.html'))) if (!(s in dico)) manquantsWeb.add(`index.html : ${s}`);

// ---------------------------------------------------------------- serveur
const dicoServeurF = path.join(QG, 'serveur', 'i18n', 'en.json');
const dicoServeur = fs.existsSync(dicoServeurF) ? lireJson(dicoServeurF) : {};
const manquantsServeur = new Set();
// serveur/*.js et serveur/ia/*.js (adaptateurs de fournisseurs)
const fichiersServeur = [
  ...fs.readdirSync(path.join(QG, 'serveur')).filter((x) => x.endsWith('.js')),
  ...(fs.existsSync(path.join(QG, 'serveur', 'ia')) ? fs.readdirSync(path.join(QG, 'serveur', 'ia')).filter((x) => x.endsWith('.js')).map((x) => `ia/${x}`) : []),
];
for (const f of fichiersServeur) {
  const code = fs.readFileSync(path.join(QG, 'serveur', f), 'utf8');
  if (!/from '\.\.?\/i18n\.js'/.test(code)) continue;
  for (const s of sources(path.join(QG, 'serveur', f))) if (!(s in dicoServeur)) manquantsServeur.add(`${f} : ${s}`);
}

console.log(`Site : ${manquantsWeb.size} texte(s) sans traduction.`);
for (const m of [...manquantsWeb].slice(0, 200)) console.log('  - ' + m);
console.log(`Serveur : ${manquantsServeur.size} texte(s) sans traduction.`);
for (const m of [...manquantsServeur].slice(0, 200)) console.log('  - ' + m);
if (verifierSeul && (manquantsWeb.size || manquantsServeur.size)) process.exit(1);
