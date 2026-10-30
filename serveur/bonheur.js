// Happiness manager (Joy) : blagues, anecdotes et phrases de pause café que le site fait dire aux agents
// qui attendent. Un stock par langue des IA : config/defauts/bonheur-<langue>.json est livré avec le QG,
// ton stock (enrichi par les récoltes, modifié ou importé dans Réglages) vit dans runtime/.
// Récolte (au démarrage si la dernière date de plus de 12 h, puis toutes les 12 h ; aucune en démo), jusqu'aux
// CIBLES, en privilégiant la qualité :
// - anecdotes : en français, la rubrique « Le saviez-vous ? » de Wikipédia (archives annuelles, API MediaWiki,
//   licence CC BY-SA 4.0) ; en anglais, uselessfacts ; ailleurs, uselessfacts réécrit dans la langue, sans ce qui
//   est propre aux États-Unis ou à la langue anglaise. Puis un tri par le modèle léger (Haiku chez Claude).
// - blagues : écrites directement dans la langue par Sonnet (effort moyen), par lots de 30, dans les genres
//   comiques de cette langue, plus celles de JokeAPI ; puis un tri (Sonnet) note chacune, seules les bonnes restent.
// - phrases de pause : écrites par le modèle léger, puis triées (naturelles et cohérentes seulement).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RACINE, REGLAGES, LANGUES_IA } from './config.js';
import { ambianceCoupee } from './travail.js';
import { emettre } from './bus.js';
import { executerSession, raisonEchec } from './session.js';
import { choisirAmbiance } from './routeur.js';
import { ecrireXlsx, lireXlsx, ecrireCsv, lireCsv } from './tableur.js';

const PERIODE_MS = 12 * 3600 * 1000;
// Qualité avant quantité (1.0.11) : ces cibles ne réduisent jamais un stock plus grand.
export const CIBLES = { blagues: 600, faits: 600, ambiance: 400 };
export const TYPES = ['blagues', 'faits', 'ambiance'];
const LOT_BLAGUES = 30;
const NOTE_MIN = 7; // note sur 10 donnée par le tri : en dessous, la blague n'entre pas
// Longueurs qui tiennent dans les bulles du site (police pixel : « Le saviez-vous ? » + 4 lignes, 3 pour une blague).
const MAX = { setup: 110, chute: 100, fait: 110, phrase: 85 };

// ---------------------------------------------------------------- filtres

// \b de JavaScript ignore les lettres accentuées (« con » serait trouvé dans « conçu ») : frontière Unicode.
const FRONTIERE = String.raw`(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))`;
const motifs = (...parts) => new RegExp(parts.join('|').replaceAll(String.raw`\b`, FRONTIERE), 'iu');

// Deuxième filet : JokeAPI (même en « safe ») et les modèles laissent parfois passer des blagues limites.
// Les mots courts sont pris en mot entier (« cul » ne doit pas écarter « calcul »), les racines en préfixe.
const MOTS_INTERDITS = motifs(
  // \bviol… : le mot et ses formes, pas « violon » ni « violet »
  String.raw`djihad|terror|attentat|\bviol(?:s|e|es|é|ée|és|ées|er|eur|eurs|euse|ence|ences|ent|ents|ente|entes|emment)?\b|nazi|hitler|racis|nègre|negre|\barabe|\bjuif|musulman|chrétien|islam|religion|pédo|pedo|suicide|\bmort|\btuer|cancer|handicap|\bgros\b|\bgrosse|blonde|\bfemmes?\b|homo|\bgay|lesbi|\btrans\b|politique|président|guerre|\bbombe|drogue|alcool|\bsexe|sexy|\bcul\b|\bseins?\b|\bbite|merde|putain|\bcon\b|connard|salope|fesse|\bcaca|\bpipi|crotte|zizi|\bslip|culotte|\bpets?\b|prout|vomi`,
  // 1.0.11 : ce que JokeAPI a laissé passer, et le reste du vocabulaire du même rayon
  String.raw`viagra|\bputes?\b|encul|morpion|nichon|\bcocus?\b|\bcocue|bifle|(?<!pique-)\bniqu|branl|couill|\bchattes?\b|pubien|pénis|vagin|testicul|érection|orgasm|préservatif|\bcapotes?\b|partouz|sodom|fellat|\bfoutre\b|salaud|bordel|\bchi(?:er|e|es|ant|ante|ants|antes|é|ée|és|ées)\b|\bpiss|chiott|\bfion\b|\bteub|\bzob\b|pétasse|pou?ffiasse|\bpédés?\b|gouine|tarlouz|bougnoul|youpin|chinetoque|bamboula|\bmoches?\b|gynéco|proctolog`,
  String.raw`\bsex|\bkill|\bdead\b|\bdeath|\bdie[sd]?\b|\bdrugs?\b|\bdrunk|\bbeer\b|religio|\bgod\b|jesus|muslim|\bjews?\b|christian|\bbombs?\b|\bwar\b|\bass\b|\bshit|\bfuck|\bdamn|\bboobs?|penis|porn|\bfat\b|\bwomen\b|\bwife\b|blondes?\b|\bracist|\bgun`,
  String.raw`\bsluts?\b|\bwhores?\b|\bbitch|\bdicks?\b|\bcocks?\b|\bpuss(?:y|ies)\b|condom|\bhorny|nipple|\bnude|\bnaked|\bboner`,
);
// Hors du stock anglais seulement : en anglais, « string » est une blague de programmeur.
const MOTS_INTERDITS_HORS_EN = motifs(String.raw`\bstrings?\b`);
// Dans une blague seulement (neutres dans une anecdote) : origines et religions, cibles habituelles des moqueries.
const MOTS_BLAGUES = motifs(
  String.raw`chinois|japonais|africain|asiatique|\bindiens?\b|\bindiennes?\b|\bsioux|\bbelges?\b|portugais|roumain|\bgitans?\b|tzigane|romanichel|mamadou|babacar|\bdieu|jésus|\bchrist\b|ramadan|\bcurés?\b|prêtre|\bpapes?\b|\bnonnes?\b|bonnes? s(?:œ|oe)urs?|\bmoines?\b|\banges?\b|paradis|\benfer\b|\bdiable|satan|\bève\b|\badam\b`,
  String.raw`chinese|japanese|african|\basian|\bindians?\b|mexican|\birish|\bpolish\b|\bpriests?\b|\bnuns?\b|\bpope\b|\bsatan|\bdevil|heaven|\bhell\b`,
);
// Anecdotes de Wikipédia : la rubrique aime l'histoire, mais Joy ne raconte rien de triste ni de violent.
const SUJETS_LOURDS = motifs(
  String.raw`pendu|pendaison|exécut|guillotin|assassin|meurtr|massacr|génocid|esclav|tortur|bourreau|cadavre|décès|décéd|funér|enterr|inhum|cercueil|sépult|\btombes?\b|tombeau|cimeti|\bcrim|prison|bagne|déport|internement|bataille|armée|militaire|soldat|régiment|combat|tranchée|fusill|\barmes?\b|canon|épidém|\bpeste\b|choléra|maladi|virus|lèpre|tubercul|fascis|communis|dictat|coloni|élection|électeur|député|sénat|ministre|\bpartis?\b|révolution|nucléaire|radioacti|\babus|victime|blessé|\bnoy[éa]|accident|catastroph|naufrag|incendi|explos|\bsang\b|sanglant|poison|empoison|avort|gestapo|occupation|résistan|vichy|shoah|holocaust|pogrom|apartheid|ségrég|émeute|\bgrèves?\b|otage|famine|misère|pauvreté|prostitu|maîtresse|amant|adult|divorc|vierge|virginit|\bnu\b|\bnue\b|\bnus\b|nudi|érot|porno|sexu|cannibal|anthropophag|sacrific|sorcell|démon|diable|satan|exorc|\bdieu|déesse|\bpapes?\b|évêque|cardinal|prêtre|\bcurés?\b|\bmoines?\b|\babbés?\b|religieu|\bsaint(?:e|s|es)?\b(?!-)|bible|coran|talmud|biblique|\bmesses?\b|jésus|christ|apôtre|prophète|mosquée|synagogue|bouddh|hindou|muezzin|imam|rabbin|protestan|catholi|orthodox|hérés|inquisition|croisade|martyr|relique|pèlerin|encyclique|vatican|terroris|ben laden|troisième reich|reich\b|autism|vulve|clitor|aphrodisi|gynécolog|\bpoint g\b`,
);
// « En avril dernier », « à ce jour »… : vrai le jour de la publication, plus forcément aujourd'hui.
const DATE_RELATIVE = motifs(
  String.raw`(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|année|mois|semaine|\ban)\s+derni(?:er|ère)|cette année|l'an dernier|récemment|aujourd'hui|actuellement|à ce jour|depuis peu|ce mois-ci|cette semaine|en cours de|vient d'être|viennent d'être|\bvient de\b|\bfête ses\b`,
);

/** Entrée à écarter (filtre de mots) ; `type` : blagues, faits ou ambiance. */
export function interdit(type, e, l = langue()) {
  const texte = type === 'blagues' ? `${e?.setup ?? ''} ${e?.chute ?? ''}` : String(e ?? '');
  if (MOTS_INTERDITS.test(texte)) return true;
  if (l !== 'en' && MOTS_INTERDITS_HORS_EN.test(texte)) return true;
  return type === 'blagues' && MOTS_BLAGUES.test(texte);
}

// Le moule anglais traduit, sans jeu de mots : « Pourquoi le frigo ne s'ennuie-t-il jamais ? Parce qu'il a
// toujours quelque chose à garder au frais. » Question en « Pourquoi … -t-il / est-elle … si, toujours, jamais… ? »
// et chute qui explique (« Parce que… », « Il… »). Seulement en français.
const MOULE_PLAT = new RegExp(String.raw`^Pourquoi\s.{2,90}?-(?:t-)?(?:il|elle|ils|elles|on)\s(?:[^?]*\s)?(?:si|aussi|tellement|toujours|jamais|tant|autant|souvent|bien|mieux|autant)\s[^?]*\?\s*$`, 'iu');
const CHUTE_EXPLIQUE = /^(?:Parce qu|Car\s|Il\s|Elle\s|Ils\s|Elles\s|On\s|C'est parce)/iu;
export const blaguePlate = (b) => MOULE_PLAT.test(String(b?.setup ?? '').trim()) && CHUTE_EXPLIQUE.test(String(b?.chute ?? '').trim());
// Forme générale du même moule (toute question « Pourquoi … -t-il … ? » suivie d'une explication), pour le passage
// unique sur ton stock : ces blagues des anciennes récoltes n'ont jamais été notées. Les bonnes du genre (« Parce
// qu'ils s'en fish ! ») sont dans le stock livré, que le passage ne retire pas.
const MOULE_PLAT_LARGE = /^Pourquoi\s.{2,90}?-(?:t-)?(?:il|elle|ils|elles|on)\s[^?]*\?\s*$/iu;
const CHUTE_EXPLIQUE_LARGE = /^(?:Parce qu|Car\s|Il\s|Elle\s|Ils\s|Elles\s|On\s|C'est\s|Tout le monde|Pour\s)/iu;
export const blaguePlateLarge = (b) => MOULE_PLAT_LARGE.test(String(b?.setup ?? '').trim()) && CHUTE_EXPLIQUE_LARGE.test(String(b?.chute ?? '').trim());

// Anecdotes propres aux États-Unis ou à la langue anglaise, dans un stock non anglais (français et autres langues
// des IA) : États, villes, unités impériales, monnaie, sports, présidents, mots anglais.
export const ANECDOTE_US = motifs(
  String.raw`États-Unis|\bUSA\b|\bU\.S\.|améric|Amérique du Nord|\banglais|anglophone|\bAngleterre|britannique|Royaume-Uni|Fahrenheit|°F\b|\bdollars?\b|\bcents?\b|\bquarters?\b|Texas|Californie|Floride|Alaska|Hawa[ïi]|New York|Washington|Ohio|Kentucky|Virginie|Massachusetts|Chicago|Boston|Las Vegas|Hollywood|Oklahoma|Arizona|Nevada|Michigan|Illinois|Minnesota|Wisconsin|Tennessee|Alabama|Louisiane|Pennsylvanie|Caroline du|New Jersey|\bNFL\b|\bNBA\b|baseball|Super Bowl|Thanksgiving|Lincoln|Kennedy|Nixon|Obama|Clinton|Manhattan|Brooklyn`,
  String.raw`\d[\d\s.,]*\s*(?:pouces?|pieds?|miles?|milles?|livres?|onces?|gallons?|yards?|acres?|pulgadas?|pies|millas?|libras?|onzas?|galones|pollici|piedi|miglia|libbre|polegadas?|pés|milhas?|Zoll|Fuß|Meilen|Pfund|Unzen|inch(?:es)?|voet|mijl|pond|cali|stóp|funtów)\b`,
  String.raw`Estados Unidos|EE\.\s?UU|estadounidense|norteamerican|Stati Uniti|statunitens|norte-american|Vereinigten Staaten|US-amerikan|amerikanisch|Verenigde Staten|Amerikaans|Stany Zjednoczone|amerykańsk|inglés|inglesa|inglese|inglês|englisch|\bEngels\b|angielsk|dólares?|dollari|\bDollar|dolarów|centavos?|centów`,
);
// Même idée sur le texte anglais d'uselessfacts, avant de le réécrire dans une autre langue.
const FAIT_US_EN = motifs(
  String.raw`\bU\.?S\.?A?\b|United States|America|American|English|British|Britain|England|\bletters?\b|\bwords?\b|\bspell|dictionary|alphabet|\binch(?:es)?\b|\bfeet\b|\bfoot\b|\bmiles?\b|\bpounds?\b|\bounces?\b|\bgallons?\b|\byards?\b|\bacres?\b|Fahrenheit|\bdollars?\b|\bcents?\b|\bquarters?\b|\bdimes?\b|\bnickels?\b|\bpenn(?:y|ies)\b|\bstates?\b|Texas|California|Florida|Alaska|Hawaii|New York|Washington|Ohio|Kentucky|Virginia|Massachusetts|Chicago|Boston|Las Vegas|Hollywood|\bNFL\b|\bNBA\b|baseball|Super Bowl|Thanksgiving|president|Lincoln|Kennedy|Nixon|Obama|Bush|Clinton`,
);

// ---------------------------------------------------------------- stock

// QG_BONHEUR_LANGUE et QG_BONHEUR_FICHIER : pour une récolte lancée à part (serveur/recolte-massive.js).
const langue = () => process.env.QG_BONHEUR_LANGUE || REGLAGES.langueIA || 'fr';
// Le stock français garde son ancien nom (runtime/bonheur.json).
const fichierStock = (l = langue()) => process.env.QG_BONHEUR_FICHIER || path.join(RACINE, 'runtime', l === 'fr' ? 'bonheur.json' : `bonheur-${l}.json`);
const fichierLivre = (l) => path.join(RACINE, 'config', 'defauts', `bonheur-${l}.json`);
// Stock livré de la langue, sinon celui d'une autre langue (affiché en attendant une récolte dans la bonne langue).
function fichierDefaut(l = langue()) {
  for (const x of [l, 'en', 'fr']) {
    const f = fichierLivre(x);
    if (fs.existsSync(f)) return { f, l: x };
  }
  return null;
}
const lireJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

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
    let c = lireJson(f);
    if (!c) {
      const d = fichierDefaut();
      const livre = d && lireJson(d.f);
      // etranger : stock livré d'une autre langue, montré tel quel mais jamais recopié dans le stock de la langue
      c = livre ? { ...livre, maj: null, source: 'stock livré', etranger: d.l !== langue() } : { blagues: [], faits: [], ambiance: [], maj: null, source: 'vide', nettoye1011: true };
    }
    for (const t of TYPES) c[t] = Array.isArray(c[t]) ? c[t] : [];
    cache = { fichier: f, mtime, contenu: c };
  }
  return cache.contenu;
}

// garderMaj : un nettoyage n'est pas une récolte (la date sert aussi à espacer les récoltes de 12 h).
function enregistrer(c, source = null, { garderMaj = false } = {}) {
  const f = fichierStock();
  const { etranger, ...donnees } = c;
  // stock d'une autre langue modifié à la main : c'est ton choix, le passage 1.0.11 n'y touchera pas
  if (etranger) donnees.nettoye1011 = true;
  if (!garderMaj || !donnees.maj) donnees.maj = Date.now();
  if (source) donnees.source = source;
  fs.writeFileSync(f + '.tmp', JSON.stringify(donnees, null, 1));
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
// clé de doublon (le début d'une blague suffit) et empreinte d'une entrée entière (repérer une modification)
const cleDe = (type, e) => cleTexte(type === 'blagues' ? e.setup : e);
/** Clé de la chute d'une blague, si elle fait au moins deux mots (une même chute = la même blague reformulée). */
export const cleChute = (b) => {
  const k = cleTexte(b?.chute ?? '');
  return k.split(' ').length >= 2 ? k : null;
};
export const empreinte = (type, e) => crypto.createHash('sha1').update(cleTexte(type === 'blagues' ? `${e.setup} ${e.chute}` : e)).digest('hex').slice(0, 12);
const listeEmpreintes = (type, liste) => new Set((liste || []).map((e) => empreinte(type, e)));

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
    const cle = cleDe(type, v);
    if (!cle || vus.has(cle)) continue;
    vus.add(cle);
    sortie.push(v);
  }
  return sortie;
}

// Ce que tu ajoutes ou modifies à la main (édition, import) est noté dans `mains` (empreintes) : ni le filtre
// ni les nettoyages n'y touchent.
function noterMains(c, type, avant) {
  const mains = new Set(c.mains?.[type] || []);
  const presentes = listeEmpreintes(type, c[type]);
  for (const k of presentes) if (!avant.has(k)) mains.add(k);
  c.mains = { ...(c.mains || {}), [type]: [...mains].filter((k) => presentes.has(k)) };
}

export function stockComplet() {
  const c = charger();
  return { langue: langue(), maj: c.maj, source: c.source, blagues: c.blagues, faits: c.faits, ambiance: c.ambiance };
}

/** Remplace une ou plusieurs catégories (édition dans le site). */
export function remplacerStock(partiel) {
  const c = { ...charger() };
  for (const t of TYPES) {
    if (!Array.isArray(partiel[t])) continue;
    const avant = listeEmpreintes(t, c[t]);
    c[t] = normaliser(t, partiel[t]);
    noterMains(c, t, avant);
  }
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
    const avantEmpreintes = listeEmpreintes(t, c[t]);
    if (mode === 'remplacer') {
      ajouts[t] = entrees.length;
      c[t] = entrees;
    } else {
      const avant = c[t].length;
      c[t] = normaliser(t, [...c[t], ...entrees]);
      ajouts[t] = c[t].length - avant;
    }
    noterMains(c, t, avantEmpreintes);
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
  // la note garde la mention de source des anecdotes (licence CC BY-SA de Wikipédia)
  return { nom: `${base}.json`, type: 'application/json; charset=utf-8', contenu: Buffer.from(JSON.stringify({ ...(c.note ? { note: c.note } : {}), blagues: c.blagues, faits: c.faits, ambiance: c.ambiance }, null, 1), 'utf8') };
}

// ---------------------------------------------------------------- nettoyage (au démarrage, et une fois en 1.0.11)

// Empreintes des entrées retirées du stock livré en 1.0.11 (blagues plates ou limites, anecdotes américaines ou
// fausses, phrases sans queue ni tête) : reconnues à coup sûr dans ton stock, puisqu'elles venaient du QG.
function retiresLivre(l) {
  const r = lireJson(path.join(RACINE, 'config', 'defauts', 'bonheur-retires.json'))?.[l] || {};
  // stock d'une autre langue que l'anglais créé avant 1.0.11 à partir du stock anglais livré : ce texte anglais part
  const en = l !== 'en' && l !== 'fr' ? lireJson(fichierLivre('en')) : null;
  return Object.fromEntries(TYPES.map((t) => [t, new Set([...(r[t] || []), ...(en ? [...listeEmpreintes(t, en[t])] : [])])]));
}
const stockLivre = (l) => (fs.existsSync(fichierLivre(l)) ? lireJson(fichierLivre(l)) : null);

/**
 * Nettoie un stock (fonction pure) : le filtre de mots à chaque fois ; une seule fois (repère `nettoye1011`) les
 * entrées retirées du stock livré, les blagues du moule plat (français, forme générale), les blagues françaises des
 * anciennes récoltes (Haiku les écrivait sur le moule anglais : seul le stock livré reste, la récolte Sonnet le
 * complète), les anecdotes propres aux États-Unis ou à l'anglais (hors anglais), puis ajoute aux catégories non vides
 * ce qui est nouveau dans le stock livré. Ce que
 * tu as ajouté ou modifié à la main (`mains`) n'est jamais retiré ; ce que contient le stock livré actuel ne l'est
 * pas par le passage unique.
 * → { stock, retires: { blagues, faits, ambiance }, ajoutes: {…}, change }
 */
export function nettoyerStock(stock, { l = langue(), livre = stockLivre(l), retires = retiresLivre(l) } = {}) {
  const c = { ...stock };
  const unique = !c.nettoye1011;
  // blagues françaises des anciennes récoltes : toutes, si le stock livré est là pour les remplacer
  const recoltesFr = l === 'fr' && (livre?.blagues || []).length > 0;
  const compte = { blagues: 0, faits: 0, ambiance: 0 };
  const ajoutes = { blagues: 0, faits: 0, ambiance: 0 };
  for (const t of TYPES) {
    const mains = new Set(c.mains?.[t] || []);
    const gardees = listeEmpreintes(t, livre?.[t]);
    const aRetirer = retires?.[t] instanceof Set ? retires[t] : new Set(retires?.[t] || []);
    c[t] = (c[t] || []).filter((e) => {
      const k = empreinte(t, e);
      if (mains.has(k)) return true;
      let jeter = interdit(t, e, l);
      if (!jeter && unique && !gardees.has(k)) {
        jeter = aRetirer.has(k) || (t === 'blagues' && recoltesFr) || (t === 'blagues' && l === 'fr' && blaguePlateLarge(e)) || (t === 'faits' && l !== 'en' && ANECDOTE_US.test(e));
      }
      if (jeter) compte[t]++;
      return !jeter;
    });
  }
  if (unique) {
    for (const t of TYPES) {
      // une catégorie déjà vide a été vidée exprès : on ne la remplit pas
      if (!(stock[t] || []).length) continue;
      const vus = new Set(c[t].map((e) => cleDe(t, e)));
      for (const e of livre?.[t] || []) {
        const k = cleDe(t, e);
        if (!k || vus.has(k) || interdit(t, e, l)) continue;
        vus.add(k);
        c[t].push(e);
        ajoutes[t]++;
      }
    }
    if (livre?.note) c.note = livre.note;
    c.nettoye1011 = true;
  }
  const change = unique || TYPES.some((t) => compte[t] > 0);
  return { stock: c, retires: compte, ajoutes, change };
}

// Repasse le nettoyage sur ton stock (au démarrage, à chaque changement de langue des IA).
function assainir() {
  const c = charger();
  if (c.etranger || !fs.existsSync(fichierStock())) return null; // stock livré seul : déjà propre
  const r = nettoyerStock(c);
  if (!r.change) return r;
  enregistrer(r.stock, null, { garderMaj: true });
  const n = (o) => `${o.blagues} blagues, ${o.faits} anecdotes, ${o.ambiance} phrases`;
  console.log(`Joy : stock nettoyé (retirées : ${n(r.retires)} ; ajoutées du stock livré : ${n(r.ajoutes)})`);
  return r;
}

// ---------------------------------------------------------------- anecdotes de Wikipédia (« Le saviez-vous ? »)

export const SOURCE_WIKIPEDIA =
  'Anecdotes : rubrique « Le saviez-vous ? » de Wikipédia en français (https://fr.wikipedia.org/wiki/Wikipédia:Le_saviez-vous_%3F), texte des contributeurs de Wikipédia sous licence CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.fr).';
const AGENT = 'QG-des-agents/1.0 (https://github.com/Ishine93/agents-hq)';
// Archives annuelles de la rubrique (2005 à l'an dernier) : wikicode d'une page par l'API MediaWiki, sans clé.
export const urlArchivesWiki = (annee) =>
  `https://fr.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&page=${encodeURIComponent(`Wikipédia:Le saviez-vous ?/Archives/${annee}`)}`;
const anneesWiki = () => Array.from({ length: new Date().getFullYear() - 2005 }, (_, i) => 2005 + i);

const MOIS = 'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre';
const milliers = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
// 0.20 → 0,20 ; 38000 → 38 000 (les nombres à quatre chiffres, souvent des années, restent tels quels)
const nombreFr = (s) => {
  const t = String(s ?? '').trim().replace(/(\d)\.(\d)/g, '$1,$2');
  return /^\d{5,}$/.test(t) ? milliers(t) : t;
};
const romainOuRang = (n) => n.replace(/^[ivxlc]+/, (r) => r.toUpperCase());

// Modèles de la rubrique → texte ; null pour un modèle inconnu (l'anecdote est alors écartée, par prudence).
function modeleWiki(nom, params) {
  const n = nom.trim().toLowerCase();
  const pos = params.filter((x) => !/^\s*[\w-]+\s*=/.test(x)).map((x) => x.trim());
  const nomme = (k) => (params.find((x) => new RegExp(`^\\s*${k}\\s*=`).test(x)) || '').replace(/^[^=]*=/, '').trim();
  switch (n) {
    case 'lang': case 'langue':
      return nomme('texte') || (pos.length >= 2 ? pos[pos.length - 1] : null);
    case 'anglais': case 'allemand': case 'latin': case 'italien': case 'espagnol': case 'japonais': case 'grec': case 'russe':
    case 'nobr': case 'lnobr': case 'nowrap': case 'noble': case 'noble-': case 'souverain': case 'souverain2': case 'souverain3':
    case 'souverain-': case 'monarque': case 'nobr romains': case 'lnobr rom': case 'touche': case 'abréviation discrète': case 'abr':
      return pos[0] ?? '';
    case "page h'":
      return pos[pos.length - 1] ?? '';
    case 'citation': case 'citation étrangère': case 'guil': case 'guillemets':
      return `« ${pos[pos.length - 1] ?? ''} »`;
    case 'incise':
      return `— ${pos[0] ?? ''} —`;
    case 'nombre': case 'unité': case 'nb': case 'dunité': {
      if (pos.length !== params.length || !pos.length) return null; // « à= », « et= »… : fourchettes, on laisse
      const [v, ...unites] = pos;
      return [nombreFr(v), ...unites.map((u) => (u === '2' ? '²' : u === '3' ? '³' : ` ${u}`))].join('');
    }
    case 'température':
      return `${nombreFr(pos[0])} °C`;
    case 'date': case 'date-':
      return pos.slice(0, 3).map((x, i) => (i === 0 && pos.length >= 3 && x === '1' ? '1er' : x)).join(' ');
    case 's': case 'siècle':
      return `${pos[0]}${pos[1] || (pos[0] === 'I' ? 'er' : 'e')} siècle`;
    case 's-': case 's mini-':
      return `${pos[0]}${pos[1] || (pos[0] === 'I' ? 'er' : 'e')}`;
    case 's2': case 's2-':
      return `${pos[0]}e-${pos[1]}e${n === 's2' ? ' siècles' : ''}`;
    case '-s':
      return `${pos[0]}${pos[0] === 'I' ? 'er' : 'e'} siècle av. J.-C.`;
    case 'numéro': case 'n°':
      return `n° ${pos[0] ?? ''}`.trim();
    case 'numéros':
      return `nos ${pos[0] ?? ''}`.trim();
    case 'av jc': case 'av j-c':
      return 'av. J.-C.';
    case 'heure':
      return pos[1] ? `${pos[0]} h ${pos[1]}` : `${pos[0]} h`;
    case 'mme': case 'm.': case 'mlle': case 'dr': case 'me':
      return { mme: 'Mme', 'm.': 'M.', mlle: 'Mlle', dr: 'Dr', me: 'Me' }[n] + (pos[0] ? ` ${pos[0]}` : '');
    case 'uss':
      return `USS ${pos[0] ?? ''}`;
    case "'":
      return '’';
    case 'clear': case 'clr':
      return '';
    default:
      break;
  }
  // {{1er}}, {{XIXe siècle}}, {{2e|édition}}, {{Ve|République}}, {{formatnum:4000}}, {{1er janvier}}…
  if (pos.length === 1 && params.length === 1 && /^(\d+|[ivxlc]+)(e|er|re)$/.test(n)) return `${romainOuRang(n)} ${pos[0]}`;
  if (params.length) return null;
  const courts = { '1er': '1er', '1re': '1re', ier: 'Ier', ire: 'Ire', er: 'er', re: 're', e: 'e', 'mm.': 'MM.', 'etc.': 'etc.' };
  if (courts[n]) return courts[n];
  if (/^\d+(e|er|re)$/.test(n) || /^[ivxlc]+(e|er|re)?( siècle)?$/.test(n)) return romainOuRang(n);
  if (new RegExp(`^1er (${MOIS})$`).test(n)) return n;
  if (/^formatnum:\s*\d+$/.test(n)) return milliers(n.replace(/\D/g, ''));
  return null;
}

// Remplace les modèles, du plus intérieur au plus extérieur ; null si l'un d'eux est inconnu.
function remplacerModeles(s) {
  for (let i = 0; i < 20 && s.includes('{{'); i++) {
    let inconnu = false;
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_, corps) => {
      // les | des liens internes ne séparent pas les paramètres
      const parts = corps.replace(/\[\[[^\]]*\]\]/g, (l) => l.replace(/\|/g, '\u0001')).split('|').map((x) => x.replace(/\u0001/g, '|'));
      const r = modeleWiki(parts[0], parts.slice(1));
      if (r == null) inconnu = true;
      return r ?? '';
    });
    if (inconnu) return null;
  }
  return s.includes('{{') || s.includes('}}') ? null : s;
}

// Retire [[Fichier:…]] et [[Image:…]] (leur légende peut contenir des liens).
function sansFichiers(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (/^\[\[\s*(Fichier|Image|File)\s*:/i.test(s.slice(i, i + 14))) {
      let prof = 0;
      let j = i;
      for (; j < s.length; j++) {
        if (s.startsWith('[[', j)) {
          prof++;
          j++;
        } else if (s.startsWith(']]', j)) {
          prof--;
          j++;
          if (prof === 0) break;
        }
      }
      i = j + 1;
    } else out += s[i++];
  }
  return out;
}

// « (photo) », « (portrait) »… renvoient à l'image de la page d'accueil, absente de la bulle.
const RENVOI_IMAGE = /\s*\((?:en )?(?:photo|photographie|portrait|illustration|image|dessin|carte|gravure|tableau|affiche|maquette|peinture|sculpture|statue|logo|schéma|vidéo|buste|fresque|plan|timbre|croquis|caricature|couverture|vue|ci-contre|ci-dessus|grille|capture d'écran|extrait)\b[^()]{0,30}\)/giu;

/** Texte propre d'une ligne d'anecdote (wikicode) ; null si elle ne se nettoie pas proprement. */
export function texteAnecdote(ligne) {
  let s = String(ligne).replace(/^\*\s*/, '').replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  if (/<sup>\s*[\d−-]|\{\{\s*exp\s*\|/i.test(s)) return null; // puissances (2⁵⁷…) : illisibles une fois aplaties
  s = sansFichiers(s);
  s = remplacerModeles(s);
  if (s == null) return null;
  s = s.replace(/\s*'{2,3}\s*\([^()']{1,40}\)\s*'{2,3}/g, '').replace(/\(\s*'{2,3}([^()']{1,40})'{2,3}\s*\)/g, '($1)');
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[:?(?:[a-z]{1,4}:)?([^\]]*)\]\]/g, '$1');
  s = s.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1');
  s = s.replace(/(?<!')''''(?!')/g, "’'''").replace(/'{2,}/g, ''); // '''' : une apostrophe puis du gras
  s = s.replace(/<sup>([^<]*)<\/sup>/gi, '$1').replace(/<br\s*\/?>/gi, ' ').replace(/<\/?(small|span|abbr|i|b|em|strong|sub|nowiki)[^>]*>/gi, '');
  s = s.replace(/&nbsp;|&#160;|&thinsp;|&#8239;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  s = s.replace(RENVOI_IMAGE, '');
  s = s.replace(/[   ]/g, ' ').replace(/’/g, "'").replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  if (!s || /[[\]{}|<>=]|https?:|__/.test(s)) return null;
  if (!/^[A-ZÀ-ÖØ-Þ«"0-9]/u.test(s)) return null;
  if (!/[.!»)]$/.test(s)) s += '.';
  const n = (re) => (s.match(re) || []).length;
  if (n(/«/g) !== n(/»/g) || n(/\(/g) !== n(/\)/g)) return null;
  return s;
}

/** Anecdotes d'une page d'archives « Le saviez-vous ? » (wikicode) : une par ligne « * … ». */
export function anecdotesWikipedia(wikitext) {
  const out = [];
  for (const l of String(wikitext || '').split('\n')) {
    if (!/^\*(?![*:#])/.test(l)) continue;
    const t = texteAnecdote(l);
    if (t) out.push(t);
  }
  return out;
}

// La police des bulles ne connaît que l'alphabet latin (ゴジラ, Безымянный… deviendraient des « ? »).
const HORS_LATIN = /[^\p{Script=Latin}\p{Script=Common}\p{M}]/u;
// Une anecdote de Wikipédia que Joy peut raconter : courte, gaie, encore vraie, lisible dans une bulle.
export const anecdoteRacontable = (f) =>
  f.length >= 35 && f.length <= MAX.fait && !HORS_LATIN.test(f) && !SUJETS_LOURDS.test(f) && !DATE_RELATIVE.test(f) && !interdit('faits', f, 'fr');

/**
 * Source des anecdotes d'une langue des IA :
 * - fr : Wikipédia « Le saviez-vous ? », écrit en français (le modèle trie, il ne réécrit pas) ;
 * - en : uselessfacts en anglais ;
 * - de : uselessfacts en allemand, sans ce qui est propre aux États-Unis ou à l'anglais ;
 * - autres : uselessfacts en anglais réécrit dans la langue par le modèle, mêmes exclusions.
 */
export function sourceAnecdotes(l) {
  if (l === 'fr') return { nom: 'wikipedia', langue: 'fr', reecrire: false, sansUS: true };
  if (l === 'en') return { nom: 'uselessfacts', langue: 'en', reecrire: false, sansUS: false };
  if (l === 'de') return { nom: 'uselessfacts', langue: 'de', reecrire: true, sansUS: true };
  return { nom: 'uselessfacts', langue: 'en', reecrire: true, sansUS: true };
}

// ---------------------------------------------------------------- récolte

const THEMES = [
  'la vie de développeur (bugs, builds, compilations, deadlines)', 'les jeux vidéo et leur création', 'le bureau et les réunions',
  'les animaux', 'la nourriture', 'les sciences et l’espace', 'l’intelligence artificielle et les robots', 'le sport',
  'la musique', 'la météo et les saisons', 'l’école et les profs', 'les super-héros et les monstres gentils', 'les métiers', 'la cuisine',
  'les jeux vidéo rétro', 'la mer et les pirates', 'les voyages', 'les fruits et légumes', 'le café et le thé', 'les ordinateurs et Internet',
];
const LANGUES_JOKEAPI = ['cs', 'de', 'en', 'es', 'fr', 'pt'];

// Genres comiques de chaque langue : des blagues écrites dans la langue, jamais traduites.
const GENRES = {
  fr: [
    '« Quel est le comble pour un… ? » (la chute retourne une expression liée au métier : « Quel est le comble pour un électricien ? Ne pas être au courant. »)',
    '« Monsieur et Madame … ont un fils / une fille. Comment s’appelle-t-il ? » (prénom + nom font une phrase : « Monsieur et Madame Térieur ont deux fils : Alain et Alex. »)',
    'Toto à l’école ou chez lui, qui prend tout au pied de la lettre',
    'devinettes « Qu’est-ce qui… ? », « Que dit un … à un … ? », « Comment appelle-t-on… ? » avec un vrai jeu de mots (homophonie, double sens, expression prise au pied de la lettre)',
    'blagues de Carambar : très courtes, un calembour à la fin',
  ],
  en: ['knock-knock jokes', '« What do you call a… ? » with a pun', 'dad jokes and one-liners with wordplay', '« Why did the… ? » only when the answer is a real pun'],
  es: ['« ¿Cuál es el colmo de un… ? »', '« ¿Qué le dice un … a otro … ? »', '« Van dos y se cae el del medio » y otros chistes de juegos de palabras', 'chistes de Jaimito en el colegio', '« Había una vez… » con un retruécano'],
  de: ['Flachwitze (« Was ist … ? » mit Wortspiel)', '« Treffen sich zwei … »', 'Fritzchen-Witze in der Schule', 'Teekesselchen-Witze (Doppeldeutigkeiten)'],
  it: ['« Qual è il colmo per un… ? »', 'barzellette di Pierino a scuola', '« Cosa fa un … ? » con un gioco di parole', 'indovinelli con doppio senso'],
  pt: ['« Qual é o cúmulo do… ? »', '« O que é, o que é? »', 'piadas do Joãozinho na escola', 'trocadilhos curtos'],
  nl: ['« Wat is het toppunt van … ? »', 'moppen van Jantje op school', 'raadsels met een woordgrap (« Het is groen en … »)', 'korte woordgrappen'],
  pl: ['« Jaki jest szczyt … ? »', 'suchary (krótkie kalambury)', 'dowcipy o Jasiu w szkole', '« Przychodzi baba do lekarza… »'],
};
const genresDe = (l) => GENRES[l] || GENRES.en;

// Repères du tri : sans eux, Sonnet « exigeant » ne donne jamais 7, même aux classiques du stock livré (essai réel du
// 30/10/2026 : 6 au plus, donc aucune blague retenue). Les autres langues prennent les repères anglais.
const REPERES = {
  fr: {
    bonnes: ['Quel est le comble pour un fleuriste ? — Envoyer ses clients sur les roses.', 'Monsieur et Madame Gator ont un fils. Comment s’appelle-t-il ? — Ali.', 'Comment les abeilles communiquent-elles entre elles ? — Par e-miel.'],
    plates: ['Comment appelle-t-on un boss de fin qui part en vacances ? — Un boss en congé, il a fini le niveau.', 'Que dit un programmeur à son code qui ne marche pas ? — « Tu ne perds rien pour attendre, je te débogue ! »'],
  },
  en: {
    bonnes: ['I’m reading a book about anti-gravity. — It’s impossible to put down.', 'Why don’t skeletons fight each other? — They don’t have the guts.', 'What do you call a fake noodle? — An impasta.'],
    plates: ['Why did the developer go on vacation? — Because he finished his sprint.', 'What does a gamer say to a slow computer? — Please load faster, I want to play.'],
  },
};
const reperesDe = (l) => REPERES[l] || REPERES.en;

/** Typographie française d'une blague venue d'ailleurs (JokeAPI) : espace avant ? ! ; :, points de suspension. */
export const typoFr = (s) => String(s ?? '').replace(/\.{2,}/g, '…').replace(/([^\s?!;:])([?!;:]+)(?=\s|$|["»)])/g, '$1 $2');

// Prompts (exportés pour les tests).
export function promptBlagues(l, theme, deja = [], modeles = []) {
  const nom = LANGUES_IA[l] || l;
  const exemples = l === 'fr' ? ' Exemple de ce qu’il ne faut pas faire : « Pourquoi le frigo ne s’ennuie-t-il jamais ? Parce qu’il a toujours quelque chose à garder au frais. »' : '';
  return [
    `Écris ${LOT_BLAGUES} blagues courtes en ${nom}, écrites directement dans cette langue pour des locuteurs natifs (pas des blagues traduites d'une autre langue). Public : des collègues d'un studio de jeux vidéo et de logiciels.`,
    `Genres qui font rire dans cette langue, à varier : ${genresDe(l).join(' ; ')}.`,
    `Thème : un tiers du lot environ sur ${theme} ; le reste sur la vie de tous les jours (animaux, métiers, nourriture, école, famille), où les jeux de mots viennent plus naturellement.`,
    ...(modeles.length ? [`Le niveau attendu, ce sont ces blagues (n'en recopie aucune) : ${modeles.map((b) => `${b.setup} — ${b.chute}`).join(' ; ')}`] : []),
    `Règles : chaque blague a une vraie chute (jeu de mots, double sens ou retournement) ; jamais le moule « Pourquoi X est-il si Y ? Parce qu'il… » qui explique sans faire rire.${exemples} Mieux vaut une blague sûre qu'une blague forcée : si le jeu de mots ne tient pas tout seul, ne l'écris pas. Bon enfant : rien de vulgaire, de sexuel, de politique, de religieux, de morbide ni de moqueur envers un groupe (origine, physique, handicap, femmes…). Question de ${MAX.setup - 10} caractères au plus, chute de ${MAX.chute - 10} au plus.`,
    `Toutes différentes, et différentes de celles-ci : ${JSON.stringify(deja)}`,
  ].join('\n');
}

export function promptTriBlagues(l, lot) {
  const nom = LANGUES_IA[l] || l;
  return [
    `Tu es un humoriste exigeant dont la langue maternelle est le ${nom}. Voici des blagues candidates pour des collègues d'un studio de jeux vidéo. Note chacune :`,
    '- n : son numéro ;',
    '- drole : de 0 à 10, fait-elle vraiment sourire un locuteur natif ? (3 : plate, 5 : passable, 7 : bonne, 9 : excellente) ;',
    "- chute : true seulement si la chute est un vrai jeu de mots, un double sens ou un retournement (false si elle explique platement, si c'est une traduction qui ne marche que dans une autre langue, ou si elle tombe à plat) ;",
    "- ok : false si elle est vulgaire, sexuelle, politique, religieuse, morbide, moqueuse envers un groupe (origine, physique, handicap, femmes…), fausse dans la langue, ou si elle n'a pas de sens.",
    'Sois exigeant : une blague moyenne ne passe pas. Mais un classique qui fait sourire vaut au moins 7.',
    `Repères, notés 7 : ${reperesDe(l).bonnes.join(' ; ')}`,
    `Repères, notés 3 : ${reperesDe(l).plates.join(' ; ')}`,
    'Blagues (numéro. question || chute) :',
    ...lot.map((b, i) => `${i}. ${b.setup} || ${b.chute}`),
  ].join('\n');
}

export function promptPhrases(l, theme) {
  const nom = LANGUES_IA[l] || l;
  return `Écris 40 phrases que des collègues d'un studio (jeux vidéo, logiciels, création) se disent vraiment à la machine à café, en ${nom}, écrites directement dans cette langue. Thème du lot : ${theme} ; mais aussi la météo, le week-end, le café, le travail du jour. Chaque phrase est naturelle (quelqu'un la dirait telle quelle), cohérente (une seule idée, aucune contradiction ni image absurde : pas « Le vent a renversé mon vélo ce matin, journée parfaite »), et un collègue peut y répondre « Carrément ! » ou « Ah bon ? ». Moins de ${MAX.phrase - 5} caractères, bon enfant, rien de vulgaire, de politique ni de triste.`;
}

export function promptTriPhrases(l, lot) {
  const nom = LANGUES_IA[l] || l;
  return [
    `Voici des phrases qu'on prête à des collègues en pause café (${nom}). Garde seulement celles qui sont naturelles (quelqu'un les dirait vraiment ainsi), cohérentes (aucune contradiction ni image absurde, par exemple « Le vent a renversé mon vélo ce matin, journée parfaite »), correctes dans la langue et bon enfant. Rends les numéros de celles qui restent.`,
    ...lot.map((p, i) => `${i}. ${p}`),
  ].join('\n');
}

export function promptFaits(l, src, lot) {
  const nom = LANGUES_IA[l] || l;
  if (src.nom === 'wikipedia') {
    return `Voici des anecdotes de la rubrique « Le saviez-vous ? » de Wikipédia. Joy, la responsable du bonheur d'un studio, en raconte une de temps en temps à des collègues qui attendent. Garde celles qui les amuseraient ou les étonneraient : compréhensibles seules (sans image ni contexte), sans rien de triste, de violent, de politique ni de religieux, et pas trop pointues (une personne, un lieu ou une œuvre que presque personne ne connaît, sans rien d'étonnant). Recopie à l'identique celles que tu gardes, sans rien changer.\n${JSON.stringify(lot)}`;
  }
  const sansUS = src.sansUS ? ` Écarte aussi toutes celles qui sont propres aux États-Unis ou à la langue anglaise (États américains, unités impériales, pièces et billets, orthographe ou mots anglais…) : elles ne parlent pas à un lecteur ${nom}.` : '';
  return `Réécris en ${nom}, directement dans cette langue et en une phrase claire chacune (moins de ${MAX.fait} caractères), les anecdotes amusantes ET vraies ci-dessous. Écarte celles qui sont fausses ou douteuses, vulgaires, morbides, politiques ou religieuses.${sansUS}\n${JSON.stringify(lot)}`;
}

const SCHEMA_FAITS = { type: 'object', additionalProperties: false, properties: { faits: { type: 'array', items: { type: 'string' } } }, required: ['faits'] };
const SCHEMA_PHRASES = { type: 'object', additionalProperties: false, properties: { phrases: { type: 'array', items: { type: 'string' } } }, required: ['phrases'] };
const SCHEMA_GARDER = { type: 'object', additionalProperties: false, properties: { garder: { type: 'array', items: { type: 'integer' } } }, required: ['garder'] };
const SCHEMA_BLAGUES = {
  type: 'object', additionalProperties: false, required: ['blagues'],
  properties: { blagues: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { setup: { type: 'string' }, chute: { type: 'string' } }, required: ['setup', 'chute'] } } },
};
const SCHEMA_NOTES = {
  type: 'object', additionalProperties: false, required: ['notes'],
  properties: {
    notes: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, properties: { n: { type: 'integer' }, drole: { type: 'integer' }, chute: { type: 'boolean' }, ok: { type: 'boolean' } }, required: ['n', 'drole', 'chute', 'ok'] },
    },
  },
};

/** Blagues retenues par le tri : sans souci, avec une vraie chute, et notées NOTE_MIN ou plus. */
export function retenirBlagues(lot, notes) {
  const vus = new Set();
  const out = [];
  for (const x of notes || []) {
    const b = lot[x?.n];
    if (!b || vus.has(x.n) || !x.ok || !x.chute || !(Number(x.drole) >= NOTE_MIN)) continue;
    vus.add(x.n);
    out.push(b);
  }
  return out;
}

// Les anecdotes de Wikipédia gardées par le tri, retrouvées dans le lot (le texte sourcé reste celui de Wikipédia).
function retrouver(textes, lot) {
  const parCle = new Map(lot.map((f) => [cleTexte(f), f]));
  const out = [];
  for (const t of textes || []) {
    const k = cleTexte(t);
    const f = parCle.get(k) || lot.find((x) => cleTexte(x).startsWith(k.slice(0, 40)) && k.length >= 30);
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

// amb : compte et modèle de l'ambiance (routeur.choisirAmbiance). executer : executerSession, remplaçable (tests).
async function appelModele(amb, prompt, schema, { effort = 'low', executer = executerSession } = {}) {
  const cwd = path.join(RACINE, 'runtime');
  const s = await executer({
    prompt,
    compte: amb.compte,
    conso: { role: 'bonheur', etage: 'hall' },
    options: {
      ...(amb.modele ? { model: amb.modele } : {}), effort, maxTurns: 3, tools: [], settingSources: [], mcpServers: {}, strictMcpConfig: true,
      permissionMode: 'dontAsk', cwd, outputFormat: { type: 'json_schema', schema }, persistSession: false,
    },
    // autres IA (Claude s'en passe) : rôle utilitaire, lecture seule, sans recherche web
    demande: { role: 'utilitaire', profil: 'lecture', cwd, consignes: '', schema, titre: 'QG Joy' },
  });
  return raisonEchec(s) ? null : s.result.structured_output;
}

// Récolte « normale » (au démarrage, toutes les 12 h, ou bouton du site) : complète le stock vers les
// CIBLES sans jamais le réduire ; quelques appels au plus (aucun en démo).
export async function recolter({ sansModele = false } = {}) {
  return recolterMassif({ maxAppels: sansModele ? 0 : 6, journal: () => {} });
}

const MAX_ECARTES = 4000;

/**
 * Complète le stock jusqu'aux CIBLES. Reprend où il en était (le fichier est enrichi à chaque lot).
 * Appels au plus : maxAppels ; un tiers au plus pour les anecdotes, un tiers pour les phrases, le reste aux blagues.
 * choisir / executer : routeur.choisirAmbiance et session.executerSession, remplaçables dans les tests.
 */
export async function recolterMassif({ maxAppels = 40, journal = console.log, choisir = choisirAmbiance, executer = executerSession } = {}) {
  const l = langue();
  const nomLangue = LANGUES_IA[l] || l;
  // compte de l'ambiance : priorités « ambiance », sinon le premier compte connecté (n'importe quelle IA)
  const leger = maxAppels > 0 ? choisir({ modeleClaude: 'haiku', defautDabord: false }) : null; // anecdotes, phrases
  const fort = maxAppels > 0 ? choisir({ modeleClaude: 'sonnet', defautDabord: false }) : null; // blagues
  const base = charger();
  // stock livré d'une autre langue : jamais recopié dans le stock de cette langue
  let c = base.etranger ? { blagues: [], faits: [], ambiance: [], nettoye1011: true } : { ...base };
  // le filtre peut s'être durci depuis la dernière récolte : on le repasse sur tout le stock
  c = nettoyerStock(c, { l }).stock;
  c.ecartes = { blagues: [...(c.ecartes?.blagues || [])], faits: [...(c.ecartes?.faits || [])] };
  const vus = { blagues: new Set(c.blagues.map((j) => cleTexte(j.setup))), faits: new Set(c.faits.map(cleTexte)), ambiance: new Set(c.ambiance.map(cleTexte)) };
  const chutes = new Set(c.blagues.map(cleChute).filter(Boolean));
  const ecartes = { blagues: new Set(c.ecartes.blagues), faits: new Set(c.ecartes.faits) };
  const neuf = (type, e) => {
    const cle = cleDe(type, e);
    if (type === 'blagues' && chutes.has(cleChute(e))) return false; // la même blague, reformulée
    return !!cle && !vus[type].has(cle) && !ecartes[type]?.has(empreinte(type, e)) && !interdit(type, e, l);
  };
  const ajouter = (type, elements) => {
    let n = 0;
    for (const e of elements || []) {
      if (!neuf(type, e)) continue;
      vus[type].add(cleDe(type, e));
      if (type === 'blagues' && cleChute(e)) chutes.add(cleChute(e));
      c[type].push(e);
      n++;
    }
    return n;
  };
  // ce que le tri a refusé n'est plus reproposé (JokeAPI et Wikipédia redonnent souvent les mêmes)
  const ecarter = (type, refuses) => {
    for (const e of refuses) ecartes[type].add(empreinte(type, e));
    c.ecartes[type] = [...ecartes[type]].slice(-MAX_ECARTES);
  };
  const sauver = () => enregistrer(c, 'récolte (en ligne + IA)');
  const sur = (u) => fetch(u, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': AGENT } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let appels = 0;
  const budget = { faits: Math.ceil(maxAppels / 3), ambiance: Math.ceil(maxAppels / 3) };
  const appeler = (amb, prompt, schema, effort) => {
    appels++;
    return appelModele(amb, prompt, schema, { effort, executer });
  };

  // 1. Anecdotes.
  const src = sourceAnecdotes(l);
  if (c.faits.length < CIBLES.faits && (leger || src.nom === 'wikipedia')) {
    const annees = echantillon(anneesWiki(), 40);
    let pages = 0;
    let vides = 0;
    let utilises = 0;
    while (c.faits.length < CIBLES.faits && pages < 8 && vides < 3) {
      if (leger && utilises >= budget.faits) break;
      let bruts = [];
      if (src.nom === 'wikipedia') {
        const annee = annees[pages % annees.length];
        pages++;
        const r = await sur(urlArchivesWiki(annee));
        bruts = anecdotesWikipedia(r?.parse?.wikitext).filter(anecdoteRacontable);
      } else {
        pages++;
        bruts = (await Promise.all(Array.from({ length: 60 }, () => sur(`https://uselessfacts.jsph.pl/api/v2/facts/random?language=${src.langue}`)))).filter(Boolean).map((f) => propre(f.text));
        if (src.sansUS) bruts = bruts.filter((f) => !FAIT_US_EN.test(f) && !ANECDOTE_US.test(f));
      }
      bruts = [...new Set(bruts)].filter((f) => f && neuf('faits', f));
      if (!bruts.length) {
        vides++;
        continue;
      }
      vides = 0;
      let gardes;
      if (leger) {
        utilises++;
        const lot = echantillon(bruts, 60);
        const r = await appeler(leger, promptFaits(l, src, lot), SCHEMA_FAITS, 'low');
        if (src.nom === 'wikipedia') {
          gardes = retrouver(r?.faits, lot);
          if (r) ecarter('faits', lot.filter((f) => !gardes.includes(f)));
        } else gardes = (r?.faits || []).map((f) => propre(f)).filter((f) => f.length <= MAX.fait + 30 && !(src.sansUS && ANECDOTE_US.test(f)));
      } else {
        // sans modèle (ambiance coupée) : les anecdotes de Wikipédia passent les filtres seuls, 40 par page
        gardes = echantillon(bruts, 40);
        if (pages >= 2) vides = 3;
      }
      journal(`anecdotes (${src.nom}) : +${ajouter('faits', gardes)} → ${c.faits.length}`);
      if (gardes.length && src.nom === 'wikipedia') c.note = c.note && c.note.includes('Wikipédia') ? c.note : [c.note, SOURCE_WIKIPEDIA].filter(Boolean).join(' ');
      sauver();
    }
  }
  if (!leger && !fort) return c;

  // 2. Phrases de pause café : écrites, puis triées (naturelles et cohérentes) ; deux appels par lot.
  let utilises = 0;
  while (leger && c.ambiance.length < CIBLES.ambiance && utilises + 2 <= budget.ambiance && appels + 2 <= maxAppels) {
    utilises += 2;
    const theme = THEMES[(appels + c.ambiance.length) % THEMES.length];
    const r = await appeler(leger, promptPhrases(l, theme), SCHEMA_PHRASES, 'low');
    const lot = [...new Set((r?.phrases || []).map((p) => propre(p)))].filter((p) => p.length >= 8 && p.length <= MAX.phrase && neuf('ambiance', p));
    if (!lot.length) continue;
    const t = await appeler(leger, promptTriPhrases(l, lot), SCHEMA_GARDER, 'low');
    const gardees = [...new Set(t?.garder || [])].map((i) => lot[i]).filter(Boolean);
    journal(`phrases de pause (${theme}) : +${ajouter('ambiance', gardees)} → ${c.ambiance.length}`);
    sauver();
  }

  // 3. Blagues : JokeAPI dans la langue, puis lots écrits par Sonnet ; chaque lot passe au tri (Sonnet).
  const file = [];
  if (fort && c.blagues.length < CIBLES.blagues && appels < maxAppels && LANGUES_JOKEAPI.includes(l)) {
    let vides = 0;
    for (let i = 0; i < 12 && vides < 3 && file.length < 3 * LOT_BLAGUES; i++) {
      const r = await sur(`https://v2.jokeapi.dev/joke/Any?lang=${l}&safe-mode&blacklistFlags=nsfw,religious,political,racist,sexist,explicit&type=twopart&amount=10`);
      const neuves = (r?.jokes || [])
        .filter((j) => j.setup && j.delivery)
        .map((j) => ({ setup: propre(j.setup), chute: propre(j.delivery) }))
        .map((b) => (l === 'fr' ? { setup: typoFr(b.setup), chute: typoFr(b.chute) } : b))
        .filter((b) => b.setup.length <= MAX.setup && b.chute.length <= MAX.chute && neuf('blagues', b) && !(l === 'fr' && blaguePlate(b)) && !file.some((x) => cleDe('blagues', x) === cleDe('blagues', b)));
      file.push(...neuves);
      vides = neuves.length ? 0 : vides + 1;
    }
    journal(`JokeAPI : ${file.length} blagues à trier`);
  }
  let vides = 0;
  while (fort && c.blagues.length < CIBLES.blagues && appels < maxAppels && vides < 3) {
    let lot;
    let theme = 'JokeAPI';
    if (file.length) lot = file.splice(0, LOT_BLAGUES);
    else {
      if (appels + 2 > maxAppels) break;
      theme = THEMES[(appels + c.blagues.length) % THEMES.length];
      const ech = echantillon(c.blagues, 30);
      // les blagues déjà là : à ne pas refaire, et les premières comme modèles du niveau attendu
      const r = await appeler(fort, promptBlagues(l, theme, ech.map((j) => j.setup), ech.slice(0, 8)), SCHEMA_BLAGUES, 'medium');
      const vusLot = new Set();
      lot = (r?.blagues || [])
        .map((b) => ({ setup: propre(b?.setup), chute: propre(b?.chute) }))
        .filter((b) => b.setup && b.chute && b.setup.length <= MAX.setup && b.chute.length <= MAX.chute && neuf('blagues', b) && !(l === 'fr' && blaguePlate(b)))
        .filter((b) => !vusLot.has(cleDe('blagues', b)) && vusLot.add(cleDe('blagues', b)));
    }
    if (!lot.length) {
      vides++;
      continue;
    }
    vides = 0;
    const t = await appeler(fort, promptTriBlagues(l, lot), SCHEMA_NOTES, 'medium');
    if (!t) continue;
    const bonnes = retenirBlagues(lot, t.notes);
    ecarter('blagues', lot.filter((b) => !bonnes.includes(b)));
    journal(`blagues (${theme}) : ${bonnes.length}/${lot.length} retenues → +${ajouter('blagues', bonnes)} → ${c.blagues.length}`);
    sauver();
  }
  journal(`terminé : ${c.blagues.length} blagues, ${c.faits.length} anecdotes, ${c.ambiance.length} phrases (${appels} appels au modèle)`);
  return c;
}

// Au démarrage : nettoyage du stock (filtre, et une fois le passage 1.0.11), puis récolte en arrière-plan si la
// dernière date de plus de 12 h, et toutes les 12 h (désactivable : Réglages › Happiness manager).
export function demarrerBonheur({ demo = false } = {}) {
  if (!demo) {
    try {
      assainir();
    } catch (e) {
      console.error('bonheur (nettoyage)', e.message);
    }
  }
  bonheurPublic();
  if (demo) return;
  const lancer = () => (REGLAGES.recolteAuto === false ? null : recolter({ sansModele: ambianceCoupee() }).catch((e) => console.error('bonheur', e.message)));
  const c = charger();
  if (!c.maj || Date.now() - c.maj > PERIODE_MS) setTimeout(lancer, 20000).unref();
  setInterval(lancer, PERIODE_MS).unref();
}

// Langue des IA changée : le stock de la nouvelle langue est nettoyé, puis envoyé au site.
export function langueChangee() {
  cache = { fichier: null, mtime: 0, contenu: null };
  try {
    assainir();
  } catch (e) {
    console.error('bonheur (nettoyage)', e.message);
  }
  emettre('bonheur', { bonheur: bonheurPublic() });
}
