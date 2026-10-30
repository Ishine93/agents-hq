// Mode avancé du réglage Coût (1.0.10) : tout le profil de travail et les consignes au DG dans un seul texte, à la
// manière d'un AGENTS.md. En tête, entre deux lignes « --- », une ligne « clé: valeur » par réglage ; ensuite, en
// Markdown, la consigne générale au DG et une consigne par type de tâche. Ce texte n'est pas un fichier du disque :
// il est fabriqué depuis les réglages à chaque ouverture et relu à l'enregistrement (une seule source : les réglages).
// Rien ici ne touche au modèle ni à l'effort du DG ou des tâches.
import { REGLAGES } from './config.js';
import { profilsTravail, travailReglages, ENUMS, NOMBRES, PEUT_ETRE_NUL, NIVEAUX, COUTS, PERSONNALISE, NIVEAU_DEFAUT } from './travail.js';
import { chargerPriorites, consignesActuelles, TYPES } from './routeur.js';

export const MAX_CONSIGNE_DG = 2000;
export const MAX_CONSIGNE_TYPE = 1000;

// Bornes des nombres, les mêmes que dans la fenêtre (web/cout.js).
const BORNES = {
  compactionAgents: [50000, 1000000], compactionVerif: [50000, 1000000], compactionDg: [50000, 1000000],
  maxCompactions: [1, 50], maxTaches: [1, 30], verifMaxTurns: [1, 200], maxRework: [0, 5],
  seuilAccordFenetre: [1, 100], plafondTacheFacteur: [1, 100],
};
const DECIMAUX = new Set(['plafondTacheFacteur']);

// Une phrase par réglage, en commentaire à droite de sa valeur.
const AIDE = {
  fr: {
    cout: 'pour les nouvelles demandes',
    base: 'niveau dont partent les valeurs de « personnalise »',
    compactionAgents: 'mémoire d’un agent avant qu’il se résume, en tokens ; null = celle de Claude Code',
    compactionVerif: 'la même chose pour un vérificateur',
    compactionDg: 'la même chose pour le DG',
    maxCompactions: 'au-delà, la tâche s’arrête et le DG la redécoupe ; null = aucune limite',
    maxTaches: 'tâches au plus dans le plan d’une demande',
    decoupage: 'chantier = une tâche par chantier ; parallele = seulement le travail indépendant à part ; actuel = étude, code et mesure séparés ; libre = au choix du DG',
    agentDirect: 'quand le DG confie tout à un seul agent, sans plan ; libre = quand c’est le plus simple',
    verifDefaut: 'qui relit : self = l’agent lui-même avec des commandes ; risque = un vérificateur si le code est sensible ; code = un vérificateur pour tout code ; libre = au choix du DG',
    verifNiveau: 'null = le modèle choisi par le DG ; standard = le niveau standard de la même IA',
    verifEffort: 'null = l’effort choisi par le DG',
    verifMaxTurns: 'tours au plus d’un vérificateur',
    maxRework: 'corrections au plus après un refus du vérificateur',
    perimetre: 'strict = seulement la demande ; complements = ses tests et sa doc courte ; bonus = propositions en plus, à ton accord',
    exploration: 'petit assistant de recherche des agents (Claude) ; autonome = sous-agents, arrière-plan et workflows de Claude Code',
    seuilAccordFenetre: 'accord demandé si l’estimation dépasse ce % de ta fenêtre de 5 h ; null = jamais',
    plafondTacheFacteur: 'limite de dépense d’une tâche, en × son estimation ; null = aucune',
    ambiance: 'null = selon le mini-jeu ; false = bavardages et Joy coupés',
    gardien: 'non = rien ; registre = un registre du dossier lu par les agents ; relecture = en plus, le DG relit chaque rapport',
  },
  en: {
    cout: 'for new requests',
    base: 'level the “personnalise” values start from',
    compactionAgents: 'how much an agent remembers before it summarizes, in tokens; null = Claude Code’s own',
    compactionVerif: 'the same for a verifier',
    compactionDg: 'the same for the director',
    maxCompactions: 'beyond this, the task stops and the director splits it; null = no limit',
    maxTaches: 'at most this many tasks in a request’s plan',
    decoupage: 'chantier = one task per workstream; parallele = only independent work apart; actuel = study, code and measurement apart; libre = the director decides',
    agentDirect: 'when the director gives everything to a single agent, with no plan; libre = when it is simplest',
    verifDefaut: 'who reviews: self = the agent itself with commands; risque = a verifier for sensitive code; code = a verifier for all code; libre = the director decides',
    verifNiveau: 'null = the model the director chose; standard = the standard level of the same AI',
    verifEffort: 'null = the effort the director chose',
    verifMaxTurns: 'at most this many verifier turns',
    maxRework: 'at most this many fixes after a verifier rejects',
    perimetre: 'strict = only the request; complements = its tests and short doc; bonus = extra proposals, with your approval',
    exploration: 'small search assistant for agents (Claude); autonome = Claude Code sub-agents, background commands and workflows',
    seuilAccordFenetre: 'approval asked when the estimate exceeds this % of your 5-hour window; null = never',
    plafondTacheFacteur: 'spending limit of a task, in × its estimate; null = none',
    ambiance: 'null = per the mini-game; false = chatter and Joy off',
    gardien: 'non = nothing; registre = a request log read by the agents; relecture = also, the director rereads every report',
  },
};

const TEXTES = {
  fr: {
    entete: [
      '# QG des agents : profil de travail et consignes (mode avancé du réglage Coût).',
      '# Change une valeur, puis « Enregistrer ». Une ligne retirée reprend la valeur du niveau « base ».',
      '# Les lignes qui commencent par # sont des commentaires. Ce fichier ne change jamais le modèle',
      '# ni l’effort du DG et des tâches.',
    ],
    valeurs: '# Valeurs de « personnalise » (elles servent quand cout vaut personnalise) :',
    dg: '# Consignes au DG',
    dgAide: `<!-- Méthode, style, choix des IA : le DG les lit avant chaque plan. ${MAX_CONSIGNE_DG} caractères au plus. -->`,
    types: '# Consignes par type de tâche',
    typesAide: `<!-- Recopiées dans la mission de chaque tâche du type (code, recherche, redaction, image ; defaut pour les autres). ${MAX_CONSIGNE_TYPE} caractères au plus chacune. -->`,
  },
  en: {
    entete: [
      '# Agents HQ: work profile and instructions (advanced mode of the Cost setting).',
      '# Change a value, then “Save”. A removed line takes the value of the “base” level.',
      '# Lines starting with # are comments. This file never changes the model',
      '# or the effort of the director and the tasks.',
    ],
    valeurs: '# “personnalise” values (used when cout is personnalise):',
    dg: '# Instructions for the director',
    dgAide: `<!-- Method, style, choice of AIs: the director reads them before every plan. At most ${MAX_CONSIGNE_DG} characters. -->`,
    types: '# Instructions per task type',
    typesAide: `<!-- Copied into the mission of every task of the type (code, recherche = research, redaction = writing, image; defaut for the others). At most ${MAX_CONSIGNE_TYPE} characters each. -->`,
  },
};

const langueFichier = (langue) => (langue === 'fr' ? 'fr' : 'en');
const cles = () => Object.keys(profilsTravail().cout[NIVEAU_DEFAUT]);
const ecrire = (v) => (v === null ? 'null' : String(v));
const permis = (cle) => (cle in ENUMS ? ENUMS[cle].map(ecrire).join(' | ') : BORNES[cle] ? `${BORNES[cle][0]} à ${BORNES[cle][1]}${PEUT_ETRE_NUL.has(cle) ? ' ou null' : ''}` : '');

function ligne(cle, v, aide, langue) {
  const p = permis(cle).replace(' à ', langue === 'fr' ? ' à ' : ' to ').replace(' ou null', langue === 'fr' ? ' ou null' : ' or null');
  const gauche = `${cle}: ${ecrire(v)}`;
  return `${gauche.padEnd(32)}# ${p ? `${p} — ` : ''}${aide}`;
}

/** Le texte du mode avancé. travail : { cout, base, personnalise } ; consignes : { generale, types }. */
export function fabriquerFichier({ travail = travailReglages(), consignes = consignesActuelles(), langue = REGLAGES.langueInterface || 'fr' } = {}) {
  const L = langueFichier(langue);
  const T = TEXTES[L];
  const A = AIDE[L];
  const base = NIVEAUX.includes(travail.base) ? travail.base : NIVEAU_DEFAUT;
  const valeurs = { ...profilsTravail().cout[base], ...(travail.personnalise || {}) };
  const lignes = [
    '---',
    ...T.entete,
    '',
    `${`cout: ${travail.cout}`.padEnd(32)}# ${COUTS.join(' | ')} — ${A.cout}`,
    `${`base: ${base}`.padEnd(32)}# ${NIVEAUX.join(' | ')} — ${A.base}`,
    '',
    T.valeurs,
    ...cles().map((k) => ligne(k, valeurs[k], A[k] || '', L)),
    '---',
    '',
    T.dg,
    T.dgAide,
    '',
    ...(consignes.generale ? [consignes.generale, ''] : []),
    T.types,
    T.typesAide,
  ];
  for (const ty of TYPES) lignes.push('', `## ${ty}`, ...(consignes.types?.[ty] ? [consignes.types[ty]] : []));
  return lignes.join('\n') + '\n';
}

/** Le texte avec les valeurs d'origine (Standard, sans valeur changée) ; les consignes restent celles du moment. */
export const fichierParDefaut = (opts = {}) => fabriquerFichier({ ...opts, travail: { cout: NIVEAU_DEFAUT, base: NIVEAU_DEFAUT, personnalise: {} } });

// Valeur écrite dans le fichier → valeur du réglage, ou { erreur }.
function lireValeur(cle, brut, fr) {
  const s = brut.trim().replace(/^["']|["']$/g, '');
  if (cle in ENUMS) {
    const v = ENUMS[cle].find((x) => ecrire(x).toLowerCase() === s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    if (v !== undefined) return { v };
    return { erreur: fr ? `valeur inconnue « ${s} » (permis : ${permis(cle)})` : `unknown value “${s}” (allowed: ${permis(cle)})` };
  }
  if (!NOMBRES.includes(cle)) return { erreur: fr ? 'réglage inconnu' : 'unknown setting' };
  if (/^(null|aucun|aucune|none|vide)$/i.test(s)) {
    if (PEUT_ETRE_NUL.has(cle)) return { v: null };
    return { erreur: fr ? 'un nombre est attendu (null n’est pas permis ici)' : 'a number is expected (null is not allowed here)' };
  }
  const m = s.replace(/[\s_]/g, '').match(/^(\d+(?:[.,]\d+)?)(k)?$/i);
  if (!m) return { erreur: fr ? `nombre attendu, pas « ${s} »` : `number expected, not “${s}”` };
  let n = Number(m[1].replace(',', '.')) * (m[2] ? 1000 : 1);
  if (!DECIMAUX.has(cle)) {
    if (!m[2] && !Number.isInteger(n)) return { erreur: fr ? 'nombre entier attendu' : 'whole number expected' };
    n = Math.round(n);
  }
  const [min, max] = BORNES[cle] || [0, Infinity];
  if (n < min || n > max) return { erreur: fr ? `entre ${min} et ${max}` : `between ${min} and ${max}` };
  return { v: n };
}

const TITRE_DG = /^#\s+(consignes?\s+(au|du)\s+dg|instructions?\s+(for|to)\s+the\s+director|director\s+instructions?)\s*$/i;
const TITRE_TYPES = /^#\s+(consignes?\s+par\s+type(\s+de\s+t[aâ]che)?|instructions?\s+per\s+task\s+type)\s*$/i;
const ALIAS_TYPE = { code: 'code', recherche: 'recherche', research: 'recherche', redaction: 'redaction', 'rédaction': 'redaction', writing: 'redaction', image: 'image', images: 'image', defaut: 'defaut', 'défaut': 'defaut', default: 'defaut' };
const TITRE_TYPE = /^##\s+(?:(?:consignes?|instructions?)\s*:\s*)?([^\s#]+)\s*$/i;

/**
 * Relit le texte. Rend { erreurs: [{ ligne, message }], travail, consignes, changes } ; avec une erreur, rien
 * n'est à enregistrer. travail : { cout, base, personnalise } (seulement les valeurs qui diffèrent de la base).
 */
export function lireFichier(texte, langue = REGLAGES.langueInterface || 'fr') {
  const fr = langueFichier(langue) === 'fr';
  const erreurs = [];
  const err = (n, message) => erreurs.push({ ligne: n, message });
  const lignes = String(texte ?? '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lignes.length && !lignes[i].trim()) i++;
  if (lignes[i]?.trim() !== '---') {
    err(i + 1, fr ? 'le fichier doit commencer par une ligne « --- » (début des réglages)' : 'the file must start with a “---” line (start of the settings)');
    return { erreurs };
  }
  const fin = lignes.findIndex((l, j) => j > i && l.trim() === '---');
  if (fin < 0) {
    err(i + 1, fr ? 'il manque la ligne « --- » qui ferme les réglages' : 'the “---” line that closes the settings is missing');
    return { erreurs };
  }
  // ---- en-tête : clé: valeur
  const vus = new Map();
  const connues = new Set(['cout', 'base', ...cles()]);
  for (let j = i + 1; j < fin; j++) {
    const brut = lignes[j].replace(/\s+#.*$/, '').trim();
    if (!brut || brut.startsWith('#')) continue;
    const m = brut.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!m) {
      err(j + 1, fr ? `ligne illisible « ${brut} » (forme attendue : nom: valeur)` : `unreadable line “${brut}” (expected: name: value)`);
      continue;
    }
    const cle = m[1];
    if (!connues.has(cle)) {
      err(j + 1, fr ? `réglage inconnu « ${cle} »` : `unknown setting “${cle}”`);
      continue;
    }
    if (vus.has(cle)) {
      err(j + 1, fr ? `« ${cle} » est déjà réglé ligne ${vus.get(cle).ligne}` : `“${cle}” is already set on line ${vus.get(cle).ligne}`);
      continue;
    }
    let r;
    if (cle === 'cout' || cle === 'base') {
      const liste = cle === 'cout' ? COUTS : NIVEAUX;
      const s = m[2].trim().replace(/^["']|["']$/g, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      r = liste.includes(s) ? { v: s } : { erreur: fr ? `valeur inconnue « ${m[2].trim()} » (permis : ${liste.join(' | ')})` : `unknown value “${m[2].trim()}” (allowed: ${liste.join(' | ')})` };
    } else r = lireValeur(cle, m[2], fr);
    if (r.erreur) err(j + 1, `${cle} : ${r.erreur}`);
    else vus.set(cle, { v: r.v, ligne: j + 1 });
  }
  const cout = vus.get('cout')?.v ?? NIVEAU_DEFAUT;
  const base = vus.get('base')?.v ?? (NIVEAUX.includes(cout) ? cout : NIVEAU_DEFAUT);
  const ref = profilsTravail().cout[base];
  const personnalise = {};
  for (const k of cles()) if (vus.has(k) && vus.get(k).v !== ref[k]) personnalise[k] = vus.get(k).v;

  // ---- consignes : # Consignes au DG, puis ## <type>
  let section = null; // 'dg' | 'types' | un type
  const textes = { dg: [], ...Object.fromEntries(TYPES.map((ty) => [ty, []])) };
  const debut = new Map();
  let dansCommentaire = false;
  for (let j = fin + 1; j < lignes.length; j++) {
    let l = lignes[j];
    // commentaires HTML (les aides du fichier) : retirés, même sur plusieurs lignes
    if (dansCommentaire) {
      const f = l.indexOf('-->');
      if (f < 0) continue;
      l = l.slice(f + 3);
      dansCommentaire = false;
    }
    l = l.replace(/<!--[\s\S]*?-->/g, '');
    const o = l.indexOf('<!--');
    if (o >= 0) {
      l = l.slice(0, o);
      dansCommentaire = true;
    }
    const s = l.trim();
    if (TITRE_DG.test(s)) {
      if (debut.has('dg')) err(j + 1, fr ? `la section des consignes au DG est déjà ouverte ligne ${debut.get('dg')}` : `the director section is already open on line ${debut.get('dg')}`);
      section = 'dg';
      debut.set('dg', j + 1);
      continue;
    }
    if (TITRE_TYPES.test(s)) {
      section = 'types';
      continue;
    }
    const mt = s.match(TITRE_TYPE);
    if (mt && (section === 'types' || section === 'ignoree' || TYPES.includes(section))) {
      const ty = ALIAS_TYPE[mt[1].toLowerCase()];
      if (!ty) {
        err(j + 1, fr ? `type de tâche inconnu « ${mt[1]} » (permis : ${TYPES.join(', ')})` : `unknown task type “${mt[1]}” (allowed: ${TYPES.join(', ')})`);
        section = 'ignoree'; // son texte est ignoré : une seule erreur, pas une par ligne
        continue;
      }
      if (debut.has(ty)) err(j + 1, fr ? `la section « ${ty} » est déjà ouverte ligne ${debut.get(ty)}` : `the “${ty}” section is already open on line ${debut.get(ty)}`);
      section = ty;
      debut.set(ty, j + 1);
      continue;
    }
    if (section === 'dg' || TYPES.includes(section)) textes[section].push(l.replace(/\s+$/, ''));
    else if (s && section !== 'ignoree') err(j + 1, fr ? `texte en dehors d’une section (mets-le sous « # Consignes au DG » ou sous « ## code », « ## recherche »…)` : 'text outside a section (put it under “# Instructions for the director” or under “## code”, “## recherche”…)');
  }
  const propre = (l) => l.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const consignes = { generale: propre(textes.dg), types: {} };
  if (consignes.generale.length > MAX_CONSIGNE_DG) err(debut.get('dg') || fin + 1, fr ? `consignes au DG trop longues : ${consignes.generale.length} caractères (${MAX_CONSIGNE_DG} au plus)` : `director instructions too long: ${consignes.generale.length} characters (at most ${MAX_CONSIGNE_DG})`);
  for (const ty of TYPES) {
    const c = propre(textes[ty]);
    if (c.length > MAX_CONSIGNE_TYPE) err(debut.get(ty), fr ? `consigne « ${ty} » trop longue : ${c.length} caractères (${MAX_CONSIGNE_TYPE} au plus)` : `“${ty}” instruction too long: ${c.length} characters (at most ${MAX_CONSIGNE_TYPE})`);
    if (c) consignes.types[ty] = c;
  }
  erreurs.sort((a, b) => a.ligne - b.ligne);
  return { erreurs, travail: { cout, base, personnalise }, consignes };
}

/** Patch de config/priorites.json pour ces consignes (une consigne absente est vidée). */
export function patchConsignes(consignes) {
  return { consigneDg: consignes.generale || '', types: Object.fromEntries(TYPES.map((ty) => [ty, { consigne: consignes.types?.[ty] || '' }])) };
}

/** Ce qui change par rapport aux réglages du moment (pour le message de confirmation). */
export function resumeChangements(lu, actuel = { travail: travailReglages(), consignes: consignesActuelles(chargerPriorites()) }) {
  const n = { reglages: 0, consignes: 0 };
  const a = actuel.travail;
  if (lu.travail.cout !== a.cout) n.reglages++;
  if (lu.travail.base !== a.base) n.reglages++;
  for (const k of new Set([...Object.keys(a.personnalise), ...Object.keys(lu.travail.personnalise)])) if (a.personnalise[k] !== lu.travail.personnalise[k]) n.reglages++;
  if ((lu.consignes.generale || '') !== (actuel.consignes.generale || '')) n.consignes++;
  for (const ty of TYPES) if ((lu.consignes.types[ty] || '') !== (actuel.consignes.types?.[ty] || '')) n.consignes++;
  return n;
}

export { PERSONNALISE };
