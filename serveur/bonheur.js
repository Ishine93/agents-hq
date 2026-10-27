// Happiness manager (Joy) : blagues, anecdotes et phrases de pause café que le site fait dire aux agents
// qui attendent. Un stock par langue des IA : config/defauts/bonheur-<langue>.json est livré avec le QG,
// ton stock (enrichi par les récoltes, modifié ou importé dans Réglages) vit dans runtime/.
// Récolte : services gratuits en ligne (JokeAPI, uselessfacts) + quelques appels Haiku (effort bas),
// au plus une fois toutes les 12 h. En démo : aucun appel.
import fs from 'node:fs';
import path from 'node:path';
import { RACINE, REGLAGES, LANGUES_IA } from './config.js';
import { ambianceCoupee } from './travail.js';
import { emettre } from './bus.js';
import { executerSession, raisonEchec } from './session.js';
import { choisirAmbiance } from './routeur.js';
import { ecrireXlsx, lireXlsx, ecrireCsv, lireCsv } from './tableur.js';

const PERIODE_MS = 12 * 3600 * 1000;
// Deuxième filet : le filtre « safe » de JokeAPI laisse parfois passer des blagues limites.
// Les mots courts sont pris en mot entier (« cul » ne doit pas écarter « calcul »), les racines en préfixe.
const MOTS_INTERDITS = new RegExp(
  [
    String.raw`djihad|terror|attentat|\bviol|nazi|hitler|racis|nègre|negre|\barabe|\bjuif|musulman|chrétien|islam|religion|pédo|pedo|suicide|\bmort|\btuer|cancer|handicap|\bgros\b|\bgrosse|blonde|\bfemmes?\b|homo|\bgay|lesbi|\btrans\b|politique|président|guerre|\bbombe|drogue|alcool|\bsexe|sexy|\bcul\b|\bseins?\b|\bbite|merde|putain|\bcon\b|connard|salope|fesse|\bcaca|\bpipi|crotte|zizi|\bslip|culotte|\bpets?\b|prout|vomi`,
    String.raw`\bsex|\bkill|\bdead\b|\bdeath|\bdie[sd]?\b|\bdrugs?\b|\bdrunk|\bbeer\b|religio|\bgod\b|jesus|muslim|\bjews?\b|christian|\bbombs?\b|\bwar\b|\bass\b|\bshit|\bfuck|\bdamn|\bboobs?|penis|porn|\bfat\b|\bwomen\b|\bwife\b|blondes?\b|\bracist|\bgun`,
  ].join('|'),
  'i',
);
export const CIBLES = { blagues: 2400, faits: 800, ambiance: 600 };
export const TYPES = ['blagues', 'faits', 'ambiance'];

// QG_BONHEUR_LANGUE et QG_BONHEUR_FICHIER : pour une récolte lancée à part (serveur/recolte-massive.js).
const langue = () => process.env.QG_BONHEUR_LANGUE || REGLAGES.langueIA || 'fr';
// Le stock français garde son ancien nom (runtime/bonheur.json).
const fichierStock = (l = langue()) => process.env.QG_BONHEUR_FICHIER || path.join(RACINE, 'runtime', l === 'fr' ? 'bonheur.json' : `bonheur-${l}.json`);
function fichierDefaut(l = langue()) {
  for (const x of [l, 'en', 'fr']) {
    const f = path.join(RACINE, 'config', 'defauts', `bonheur-${x}.json`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

let cache = { fichier: null, mtime: 0, contenu: null };

function charger() {
  const f = fichierStock();
  let mtime = 0;
  try {
    mtime = fs.statSync(f).mtimeMs;
  } catch {
    mtime = 0;
  }
  // Relu dès que le fichier change (récolte lancée dans un autre processus, langue changée…).
  if (cache.fichier !== f || mtime > cache.mtime || !cache.contenu) {
    let c = null;
    try {
      c = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      const d = fichierDefaut();
      c = d ? { ...JSON.parse(fs.readFileSync(d, 'utf8')), maj: null, source: 'stock livré' } : { blagues: [], faits: [], ambiance: [], maj: null, source: 'vide' };
    }
    for (const t of TYPES) c[t] = Array.isArray(c[t]) ? c[t] : [];
    cache = { fichier: f, mtime, contenu: c };
  }
  return cache.contenu;
}

function enregistrer(c, source = null) {
  const f = fichierStock();
  c.maj = Date.now();
  if (source) c.source = source;
  fs.writeFileSync(f + '.tmp', JSON.stringify(c, null, 1));
  fs.renameSync(f + '.tmp', f);
  cache = { fichier: null, mtime: 0, contenu: null };
  emettre('bonheur', { bonheur: bonheurPublic() });
}

function echantillon(liste, n) {
  const copie = [...(liste || [])];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie.slice(0, n);
}

// Le site reçoit un échantillon tiré au hasard (le stock complet peut compter des milliers d'entrées).
export function bonheurPublic(n = 150) {
  const c = charger();
  return {
    maj: c.maj,
    source: c.source,
    langue: langue(),
    total: { blagues: c.blagues.length, faits: c.faits.length, ambiance: c.ambiance.length },
    blagues: echantillon(c.blagues, n),
    faits: echantillon(c.faits, Math.ceil(n / 2)),
    ambiance: echantillon(c.ambiance, Math.ceil(n / 2)),
  };
}

// ---------------------------------------------------------------- édition, import, export (Réglages)

const cleTexte = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const propre = (s, n = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function normaliser(type, liste) {
  const vus = new Set();
  const sortie = [];
  for (const e of liste || []) {
    let v;
    if (type === 'blagues') {
      const setup = propre(e?.setup ?? e?.question ?? (Array.isArray(e) ? e[0] : ''));
      const chute = propre(e?.chute ?? e?.reponse ?? e?.delivery ?? (Array.isArray(e) ? e[1] : ''));
      if (!setup) continue;
      v = { setup, chute };
    } else {
      v = propre(typeof e === 'string' ? e : e?.texte ?? e?.text ?? (Array.isArray(e) ? e[0] : ''));
      if (!v) continue;
    }
    const cle = cleTexte(type === 'blagues' ? v.setup : v);
    if (!cle || vus.has(cle)) continue;
    vus.add(cle);
    sortie.push(v);
  }
  return sortie;
}

export function stockComplet() {
  const c = charger();
  return { langue: langue(), maj: c.maj, source: c.source, blagues: c.blagues, faits: c.faits, ambiance: c.ambiance };
}

/** Remplace une ou plusieurs catégories (édition dans le site). */
export function remplacerStock(partiel) {
  const c = { ...charger() };
  for (const t of TYPES) if (Array.isArray(partiel[t])) c[t] = normaliser(t, partiel[t]);
  enregistrer(c, 'modifié à la main');
  return { blagues: c.blagues.length, faits: c.faits.length, ambiance: c.ambiance.length };
}

/** Import : « fusion » ajoute ce qui est nouveau, « remplacer » remplace les catégories présentes dans le fichier. */
export function importerStock(donnees, mode = 'fusion') {
  const c = { ...charger() };
  const ajouts = {};
  for (const t of TYPES) {
    const entrees = normaliser(t, donnees[t]);
    if (!entrees.length) continue;
    if (mode === 'remplacer') {
      ajouts[t] = entrees.length;
      c[t] = entrees;
    } else {
      const avant = c[t].length;
      c[t] = normaliser(t, [...c[t], ...entrees]);
      ajouts[t] = c[t].length - avant;
    }
  }
  enregistrer(c, 'importé');
  return { ajouts, total: { blagues: c.blagues.length, faits: c.faits.length, ambiance: c.ambiance.length } };
}

const FEUILLES = { blagues: 'Blagues', faits: 'Anecdotes', ambiance: 'Pause café' };

/** Lit un fichier importé : .json, .csv (colonnes type ; texte ; chute) ou .xlsx (une feuille par catégorie). */
export function analyserImport(buf, nom = '') {
  const ext = path.extname(nom).toLowerCase();
  const r = { blagues: [], faits: [], ambiance: [] };
  const typeDe = (s) => {
    const k = cleTexte(s);
    if (/blague|joke/.test(k)) return 'blagues';
    if (/anecdote|fait|fact/.test(k)) return 'faits';
    if (/pause|ambiance|phrase|chat|cafe/.test(k)) return 'ambiance';
    return null;
  };
  const enTete = (l) => /^(question|setup|texte|text|phrase|type)$/.test(cleTexte(l[0] || ''));
  if (ext === '.xlsx' || (buf[0] === 0x50 && buf[1] === 0x4b)) {
    for (const f of lireXlsx(buf)) {
      const t = typeDe(f.nom);
      if (!t) continue;
      const lignes = f.lignes.filter((l, i) => !(i === 0 && enTete(l)));
      r[t].push(...lignes.map((l) => (t === 'blagues' ? { setup: l[0], chute: l[1] } : l[0])));
    }
    return r;
  }
  const texte = buf.toString('utf8').replace(/^﻿/, '');
  if (ext === '.json' || /^\s*[[{]/.test(texte)) {
    const j = JSON.parse(texte);
    if (Array.isArray(j)) r.blagues = j;
    else for (const t of TYPES) r[t] = j[t] || j[FEUILLES[t]] || [];
    return r;
  }
  for (const l of lireCsv(texte)) {
    const t = typeDe(l[0] || '');
    if (!t) continue;
    r[t].push(t === 'blagues' ? { setup: l[1], chute: l[2] } : l[1]);
  }
  return r;
}

export function exporter(format = 'json') {
  const c = charger();
  const base = `blagues-qg-${langue()}`;
  if (format === 'xlsx') {
    return {
      nom: `${base}.xlsx`,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contenu: ecrireXlsx([
        { nom: FEUILLES.blagues, colonnes: [{ titre: 'Question', largeur: 70 }, { titre: 'Chute', largeur: 60 }], lignes: c.blagues.map((b) => [b.setup, b.chute]) },
        { nom: FEUILLES.faits, colonnes: [{ titre: 'Texte', largeur: 120 }], lignes: c.faits.map((f) => [f]) },
        { nom: FEUILLES.ambiance, colonnes: [{ titre: 'Phrase', largeur: 100 }], lignes: c.ambiance.map((a) => [a]) },
      ]),
    };
  }
  if (format === 'csv') {
    const lignes = [['type', 'texte', 'chute'], ...c.blagues.map((b) => ['blague', b.setup, b.chute]), ...c.faits.map((f) => ['anecdote', f, '']), ...c.ambiance.map((a) => ['pause', a, ''])];
    return { nom: `${base}.csv`, type: 'text/csv; charset=utf-8', contenu: Buffer.from(ecrireCsv(lignes), 'utf8') };
  }
  return { nom: `${base}.json`, type: 'application/json; charset=utf-8', contenu: Buffer.from(JSON.stringify({ blagues: c.blagues, faits: c.faits, ambiance: c.ambiance }, null, 1), 'utf8') };
}

// ---------------------------------------------------------------- récolte

const THEMES = [
  'la vie de développeur (bugs, builds, compilations, deadlines)', 'les jeux vidéo et leur création', 'le bureau et les réunions',
  'les animaux', 'les jeux de mots sur la nourriture', 'les sciences et l’espace', 'l’intelligence artificielle et les robots', 'le sport',
  'la musique', 'la météo et les saisons', 'l’école et les profs', 'les super-héros et les monstres gentils', 'les métiers', 'la cuisine',
  'les jeux vidéo rétro', 'la mer et les pirates', 'les voyages', 'les fruits et légumes', 'le café et le thé', 'les ordinateurs et Internet',
];
const LANGUES_JOKEAPI = ['cs', 'de', 'en', 'es', 'fr', 'pt'];
const LANGUES_FAITS = ['en', 'de'];

// amb : compte et modèle de l'ambiance (routeur.choisirAmbiance) ; sur Claude, Haiku comme en 1.0.5.
async function appelHaiku(amb, prompt, schema) {
  const cwd = path.join(RACINE, 'runtime');
  const s = await executerSession({
    prompt,
    compte: amb.compte,
    conso: { role: 'bonheur', etage: 'hall' },
    options: {
      ...(amb.modele ? { model: amb.modele } : {}), effort: 'low', maxTurns: 3, tools: [], settingSources: [], mcpServers: {}, strictMcpConfig: true,
      permissionMode: 'dontAsk', cwd, outputFormat: { type: 'json_schema', schema }, persistSession: false,
    },
    // autres IA (Claude s'en passe) : rôle utilitaire, lecture seule, sans recherche web
    demande: { role: 'utilitaire', profil: 'lecture', cwd, consignes: '', schema, titre: 'QG Joy' },
  });
  return raisonEchec(s) ? null : s.result.structured_output;
}

// Récolte « normale » (au démarrage, toutes les 12 h, ou bouton du site) : complète le stock vers les
// CIBLES sans jamais le réduire ; quelques appels Haiku au plus (aucun en démo).
export async function recolter({ sansModele = false } = {}) {
  return recolterMassif({ maxAppels: sansModele ? 0 : 6, journal: () => {} });
}

/** Complète le stock jusqu'aux CIBLES. Reprend où il en était (le fichier est enrichi à chaque lot). */
export async function recolterMassif({ maxAppels = 40, journal = console.log } = {}) {
  const l = langue();
  const nomLangue = LANGUES_IA[l] || l;
  // compte de l'ambiance : priorités « ambiance », sinon le premier compte connecté (n'importe quelle IA)
  const compte = choisirAmbiance({ modeleClaude: 'haiku', defautDabord: false });
  const c = { ...charger() };
  // Le filtre peut s'être durci depuis la dernière récolte : on le repasse sur tout le stock.
  const ok = (e) => !MOTS_INTERDITS.test(typeof e === 'string' ? e : `${e.setup} ${e.chute}`);
  for (const t of TYPES) c[t] = c[t].filter(ok);
  const vus = { blagues: new Set(c.blagues.map((j) => cleTexte(j.setup))), faits: new Set(c.faits.map(cleTexte)), ambiance: new Set(c.ambiance.map(cleTexte)) };
  const ajouter = (type, elements) => {
    let n = 0;
    for (const e of elements || []) {
      const texte = type === 'blagues' ? `${e.setup} ${e.chute}` : e;
      const cle = cleTexte(type === 'blagues' ? e.setup : e);
      if (!cle || vus[type].has(cle) || MOTS_INTERDITS.test(texte)) continue;
      vus[type].add(cle);
      c[type].push(e);
      n++;
    }
    return n;
  };
  const sauver = () => enregistrer(c, 'récolte (en ligne + Haiku)');
  const sur = (u) => fetch(u, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'QG-des-agents/1.0' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  // 1. Blagues de JokeAPI dans la langue (le stock y est limité : on s'arrête quand plus rien de neuf n'arrive).
  if (LANGUES_JOKEAPI.includes(l)) {
    let vides = 0;
    for (let i = 0; i < 40 && vides < 4 && c.blagues.length < CIBLES.blagues; i++) {
      const r = await sur(`https://v2.jokeapi.dev/joke/Any?lang=${l}&safe-mode&blacklistFlags=nsfw,religious,political,racist,sexist,explicit&type=twopart&amount=10`);
      const n = ajouter('blagues', (r?.jokes || []).filter((j) => j.setup && j.delivery).map((j) => ({ setup: j.setup, chute: j.delivery })));
      vides = n ? 0 : vides + 1;
    }
    journal(`JokeAPI : ${c.blagues.length} blagues au total`);
    sauver();
  }
  if (!compte || maxAppels <= 0) return c;

  let appels = 0;
  // 2. Anecdotes : faits récupérés en ligne, traduits et triés par Haiku par lots de 60.
  const SCHEMA_FAITS = { type: 'object', additionalProperties: false, properties: { faits: { type: 'array', items: { type: 'string' } } }, required: ['faits'] };
  const langueFaits = LANGUES_FAITS.includes(l) ? l : 'en';
  while (c.faits.length < CIBLES.faits && appels < maxAppels) {
    const bruts = (await Promise.all(Array.from({ length: 60 }, () => sur(`https://uselessfacts.jsph.pl/api/v2/facts/random?language=${langueFaits}`)))).filter(Boolean).map((f) => f.text);
    appels++;
    const r = await appelHaiku(compte, `Réécris en ${nomLangue}, en une phrase claire chacune, les anecdotes amusantes ET vraies ci-dessous. Écarte celles qui sont fausses, vulgaires, morbides, politiques ou religieuses.\n${JSON.stringify([...new Set(bruts)])}`, SCHEMA_FAITS);
    journal(`anecdotes : +${ajouter('faits', r?.faits)} → ${c.faits.length}`);
    sauver();
  }
  // 3. Phrases de pause café.
  const SCHEMA_AMB = { type: 'object', additionalProperties: false, properties: { phrases: { type: 'array', items: { type: 'string' } } }, required: ['phrases'] };
  while (c.ambiance.length < CIBLES.ambiance && appels < maxAppels) {
    appels++;
    const theme = THEMES[appels % THEMES.length];
    const r = await appelHaiku(compte, `Écris 120 petites phrases différentes qu'échangent des collègues d'un studio (jeux vidéo, logiciels, création) en pause café (thème du lot : ${theme} ; mais aussi météo, week-end, café). Langue : ${nomLangue}. Courtes (moins de 90 caractères), naturelles, bon enfant, sans rien de vulgaire ni de politique.`, SCHEMA_AMB);
    journal(`phrases de pause : +${ajouter('ambiance', r?.phrases)} → ${c.ambiance.length}`);
    sauver();
  }
  // 4. Blagues écrites par Haiku, par lots de 120 sur des thèmes variés.
  const SCHEMA_BLAGUES = { type: 'array', items: { type: 'object', additionalProperties: false, properties: { setup: { type: 'string' }, chute: { type: 'string' } }, required: ['setup', 'chute'] } };
  while (c.blagues.length < CIBLES.blagues && appels < maxAppels) {
    appels++;
    const theme = THEMES[appels % THEMES.length];
    const deja = c.blagues.slice(-40).map((j) => j.setup);
    const r = await appelHaiku(
      compte,
      `Écris 120 blagues courtes en ${nomLangue}, format question / chute, sur le thème : ${theme}. Bon enfant, drôles, jeux de mots bienvenus, jamais vulgaires, politiques, religieuses, morbides ni blessantes. Toutes différentes, et différentes de celles-ci : ${JSON.stringify(deja)}`,
      { type: 'object', additionalProperties: false, properties: { blagues: SCHEMA_BLAGUES }, required: ['blagues'] },
    );
    journal(`blagues (${theme}) : +${ajouter('blagues', r?.blagues)} → ${c.blagues.length}`);
    sauver();
  }
  journal(`terminé : ${c.blagues.length} blagues, ${c.faits.length} anecdotes, ${c.ambiance.length} phrases (${appels} appels Haiku)`);
  return c;
}

// Au démarrage : récolte en arrière-plan si la dernière date de plus de 12 h, puis toutes les 12 h
// (désactivable : Réglages › Happiness manager).
export function demarrerBonheur({ demo = false } = {}) {
  bonheurPublic();
  if (demo) return;
  const lancer = () => (REGLAGES.recolteAuto === false ? null : recolter({ sansModele: ambianceCoupee() }).catch((e) => console.error('bonheur', e.message)));
  const c = charger();
  if (!c.maj || Date.now() - c.maj > PERIODE_MS) setTimeout(lancer, 20000).unref();
  setInterval(lancer, PERIODE_MS).unref();
}

// Langue des IA changée : le site reçoit le stock de la nouvelle langue.
export function langueChangee() {
  cache = { fichier: null, mtime: 0, contenu: null };
  emettre('bonheur', { bonheur: bonheurPublic() });
}
