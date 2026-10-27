// Délégation d'images (lot 2, décisions D2 et D3 ; docs/multi-ia/conception.md §7) : l'outil `generer_image`
// du QG, pour les agents de tous les fournisseurs. Tout est coupé par défaut (Réglages › Priorités › Délégation).
// - Moteur B (abonnement ChatGPT) : sous-session Codex dans runtime/delegations/<id>/, en lecture seule, qui
//   appelle son outil image_gen ; le QG repère le nouveau fichier de CODEX_HOME/generated_images/ (liste de
//   fichiers, rien d'autre n'y est lu) et le copie vers `chemin`. Une génération à la fois par compte, 5 min.
// - Moteur A (API Images, clé facturée) : serveur/ia/images-api.js, 2 min, coût d'après l'usage renvoyé.
// Garde-fous : accord (carte de décision), limite par demande et par étage, plafond mensuel de l'API (accord
// au-delà), chemin dans les zones de l'étage. Journal : runtime/delegations.jsonl ; image dans le fil ; conso
// au rôle `delegation`, sur le compte qui a produit l'image. La clé d'un compte ne sort jamais du serveur.
import fs from 'node:fs';
import path from 'node:path';
import { RACINE, etage as trouverEtage, dansEtage, definirLigneImages } from './config.js';
import { chargerPriorites, choisirImage } from './routeur.js';
import { trouverCompte } from './comptes.js';
import { executerSession, raisonEchec } from './session.js';
import { demanderDecision } from './decisions.js';
import { message, emettre, majDossier } from './bus.js';
import { copierImage, piecePublique } from './pieces.js';
import { enregistrerAppel, enregistrerCout } from './conso.js';
import { genererParApi, coutUsage, coutAuPire, FORMATS } from './ia/images-api.js';
import { dossierConfig } from './ia/codex.js';
import { t as tr } from './i18n.js';

export const NOM_OUTIL = 'mcp__qg__generer_image';
const fichierJournal = () => process.env.QG_DELEGATIONS_FICHIER || path.join(RACINE, 'runtime', 'delegations.jsonl');
const DELAI_ABONNEMENT_MS = 5 * 60 * 1000;
const reglages = () => chargerPriorites().delegation.images;

/** L'outil est proposé seulement si la délégation est active, et seulement aux profils qui écrivent. */
export const imagesActives = (profil = '') => reglages().actif === true && !String(profil || '').startsWith('lecture');

// Ligne de la directive des agents (marqueur {IMAGES}) : absente tant que la délégation est coupée.
definirLigneImages(() =>
  reglages().actif === true
    ? "- Pour créer une image du projet (sprite, icône, illustration), utilise `mcp__qg__generer_image` si cet outil t'est proposé : décris l'image et donne le fichier de sortie dans le projet. Elle est comptée et peut demander l'accord de l'utilisateur."
    : '',
);

const texte = (s) => ({ content: [{ type: 'text', text: s }] });
const indisponible = (motif) => texte(tr("Génération d'image indisponible : {motif}. Décris l'image attendue dans ton rapport.", { motif }));
const dollars = (x) => `${(Math.round(x * 100) / 100).toFixed(2)} $`;
const moisDe = (ms) => new Date(ms).toISOString().slice(0, 7);

function journaliser(ligne) {
  try {
    fs.mkdirSync(path.dirname(fichierJournal()), { recursive: true });
    fs.appendFileSync(fichierJournal(), JSON.stringify({ t: Date.now(), ...ligne }) + '\n');
  } catch {
    /* journal indisponible : la génération n'en dépend pas */
  }
}

/** Total des images par l'API (dollars) du mois en cours, d'après le journal. */
export function totalApiDuMois(maintenant = Date.now()) {
  let lignes = [];
  try {
    lignes = fs.readFileSync(fichierJournal(), 'utf8').split('\n').filter(Boolean);
  } catch {
    return 0;
  }
  const mois = moisDe(maintenant);
  let total = 0;
  for (const l of lignes) {
    try {
      const x = JSON.parse(l);
      if (x.moteur === 'api' && x.statut === 'ok' && moisDe(x.t) === mois) total += x.cout || 0;
    } catch {
      /* ligne abîmée */
    }
  }
  return Math.round(total * 10000) / 10000;
}

// Limite par demande (dossier) et par étage : réglage de l'étage s'il existe (null = illimitée), sinon défaut.
function limiteEtage(im, etageId) {
  return Object.prototype.hasOwnProperty.call(im.limites.etages, etageId) ? im.limites.etages[etageId] : im.limites.defaut;
}

// Fichier de sortie : relatif au projet, sans « .. », dans les zones de l'étage, extension d'image connue.
function cheminSortie(e, chemin) {
  if (typeof chemin !== 'string' || !chemin.trim()) throw new Error(tr('chemin de sortie manquant'));
  if (chemin.split(/[\\/]/).includes('..')) throw new Error(tr('chemin refusé (« .. ») : {chemin}', { chemin }));
  const absolu = path.resolve(e.projet, chemin);
  if (!dansEtage(e, absolu)) throw new Error(tr('chemin hors du projet : {chemin}', { chemin }));
  if (!FORMATS[path.extname(absolu).toLowerCase()]) throw new Error(tr('extension non prise en charge (png, jpg, webp) : {chemin}', { chemin }));
  return absolu;
}

function referencesDe(e, refs = []) {
  return refs.map((r) => {
    const absolu = path.resolve(e.projet, r);
    if (String(r).split(/[\\/]/).includes('..') || !dansEtage(e, absolu) || !fs.existsSync(absolu)) throw new Error(tr('référence introuvable ou hors du projet : {chemin}', { chemin: r }));
    return absolu;
  });
}

async function accord(t, question, signal) {
  const r = await demanderDecision(t, { question, options: [{ libelle: tr('Autoriser') }, { libelle: tr('Refuser') }], brut: true }, signal);
  return r === 'O1';
}

// ---------------------------------------------------------------- moteur B (abonnement)

const filesParCompte = new Map(); // compte → promesse de la génération en cours (une à la fois)

function imagesDe(dir, prof = 0) {
  const r = [];
  let entrees = [];
  try {
    entrees = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return r;
  }
  for (const x of entrees) {
    const p = path.join(dir, x.name);
    if (x.isDirectory() && prof < 2) r.push(...imagesDe(p, prof + 1));
    else if (x.isFile() && FORMATS[path.extname(x.name).toLowerCase()]) r.push(p);
  }
  return r;
}

const SCHEMA_B = { type: 'object', properties: { fait: { type: 'boolean' }, remarque: { type: 'string' } }, required: ['fait', 'remarque'], additionalProperties: false };

async function moteurAbonnement({ compte, description, absolu, t, d, signal }) {
  const avant = filesParCompte.get(compte) || Promise.resolve();
  let liberer;
  const tour = new Promise((ok) => (liberer = ok));
  filesParCompte.set(compte, avant.then(() => tour));
  await avant;
  const id = `${d.id}-${t.ref}-${Date.now().toString(36)}`;
  const dir = path.join(RACINE, 'runtime', 'delegations', id);
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), DELAI_ABONNEMENT_MS);
  const surAbandon = () => ctrl.abort();
  signal?.addEventListener('abort', surAbandon, { once: true });
  try {
    fs.mkdirSync(dir, { recursive: true });
    const generees = path.join(dossierConfig(trouverCompte(compte)), 'generated_images');
    const deja = new Set(imagesDe(generees));
    const s = await executerSession({
      prompt: `Utilise l'outil de génération d'images ($imagegen) pour : ${description}`,
      compte,
      conso: { role: 'delegation', dossier: d.id, tache: t.id, etage: t.etage },
      options: { abortController: ctrl, cwd: dir, persistSession: false },
      demande: { role: 'delegation', profil: 'lecture', cwd: dir, consignes: '', schema: SCHEMA_B, titre: `QG ${d.id} ${t.ref} — image` },
    });
    const nouvelles = imagesDe(generees).filter((f) => !deja.has(f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (!nouvelles.length) {
      if (s.limite) throw new Error(tr('quota ChatGPT épuisé ({nom})', { nom: trouverCompte(compte)?.nom || compte }));
      throw new Error(raisonEchec(s) || tr('aucune image générée'));
    }
    fs.mkdirSync(path.dirname(absolu), { recursive: true });
    fs.copyFileSync(nouvelles[0], absolu);
    return { cout: 0 };
  } finally {
    clearTimeout(minuterie);
    signal?.removeEventListener('abort', surAbandon);
    fs.rmSync(dir, { recursive: true, force: true });
    liberer();
  }
}

// ---------------------------------------------------------------- moteur A (API)

async function moteurApi({ compte, description, absolu, taille, qualite, fondTransparent, references, t, d, signal }) {
  const c = trouverCompte(compte);
  const r = await genererParApi({ cle: c?.cleApi, description, taille, qualite, fondTransparent, references, format: FORMATS[path.extname(absolu).toLowerCase()], signal });
  fs.mkdirSync(path.dirname(absolu), { recursive: true });
  fs.writeFileSync(absolu, r.octets);
  const cout = coutUsage(r.usage, r.modele);
  const meta = { role: 'delegation', compte, dossier: d.id, tache: t.id, etage: t.etage };
  enregistrerAppel(meta, { input_tokens: r.usage?.input_tokens || 0, output_tokens: r.usage?.output_tokens || 0 }, r.modele);
  enregistrerCout(meta, cout);
  return { cout };
}

// ---------------------------------------------------------------- outil

/** Appel de `generer_image` par l'agent de la tâche t (dossier d). Rend un résultat d'outil MCP. */
export async function genererImage(t, d, args = {}, { signal = null } = {}) {
  const im = reglages();
  if (!im.actif) return indisponible(tr('délégation désactivée'));
  const { description = '', chemin, taille = 'auto', qualite = 'auto', fondTransparent = false, references = [] } = args;
  const e = trouverEtage(t.etage);
  const base = { dossier: d.id, tache: t.id, prenom: t.prenom || null, description: String(description).slice(0, 500), chemin, taille, qualite };
  let absolu;
  let refs;
  try {
    if (!e?.projet) throw new Error(tr('étage sans projet'));
    absolu = cheminSortie(e, chemin);
    refs = referencesDe(e, references);
  } catch (err) {
    journaliser({ ...base, compte: null, moteur: null, cout: 0, statut: 'refuse', accord: 'sans', motif: err.message });
    return texte(tr('Image refusée : {motif}', { motif: err.message }));
  }

  // limite par demande et par étage (réservée avant la génération, rendue en cas d'échec)
  d.x = d.x || {};
  const compteur = (d.x.images ||= {})[t.etage] ||= { faites: 0, enPlus: 0 };
  const lim = limiteEtage(im, t.etage);
  if (lim !== null && compteur.faites >= lim + compteur.enPlus) {
    const nom = e.nom || t.etage;
    const plus = im.accord && (await accord(t, tr('{prenom} a atteint la limite de {n} images pour cette demande sur {etage}. Autoriser {n} images de plus pour cette demande ?', { prenom: t.prenom || t.ref, n: lim, etage: nom }), signal));
    if (!plus) {
      journaliser({ ...base, compte: null, moteur: null, cout: 0, statut: 'limite', accord: im.accord ? 'refuse' : 'sans' });
      return texte(tr("Image refusée : limite de {n} images atteinte pour cette demande sur {etage}. Décris l'image attendue dans ton rapport.", { n: lim, etage: nom }));
    }
    compteur.enPlus += lim;
  }
  compteur.faites++;
  majDossier(d);
  const rendre = () => {
    compteur.faites = Math.max(0, compteur.faites - 1);
    majDossier(d);
  };

  const precise = taille !== 'auto' || qualite !== 'auto' || fondTransparent === true || refs.length > 0;
  const ch = choisirImage({ precise });
  if (ch.indisponible) {
    rendre();
    journaliser({ ...base, compte: null, moteur: null, cout: 0, statut: 'indisponible', accord: 'sans', motif: ch.indisponible });
    return indisponible(ch.indisponible);
  }
  const nomCompte = trouverCompte(ch.compte)?.nom || ch.compte;
  const estimation = ch.moteur === 'api' ? coutAuPire({ description, taille, qualite, references: refs }) : 0;
  const plafond = im.api.plafondMensuelUsd;
  const total = ch.moteur === 'api' ? totalApiDuMois() : 0;
  const depasse = ch.moteur === 'api' && (plafond === null || total + estimation > plafond);
  let statutAccord = 'sans';
  if (im.accord || depasse) {
    const moteur = ch.moteur === 'api' ? tr('API Images, facturée') : tr('abonnement ChatGPT');
    const cout = ch.moteur === 'api' ? tr('coût estimé au plus {cout}', { cout: dollars(estimation) }) : tr("inclus dans l'abonnement");
    let question = tr('{prenom} veut générer une image : « {description} » ({moteur}, {compte}, {cout}).', { prenom: t.prenom || t.ref, description: base.description, moteur, compte: nomCompte, cout });
    if (depasse) {
      question += ' ' + (plafond === null
        ? tr("Aucun plafond mensuel n'est fixé pour l'API Images : ton accord est demandé à chaque image.")
        : tr("Le plafond mensuel de l'API Images ({plafond}) serait dépassé : déjà {total} ce mois-ci.", { plafond: dollars(plafond), total: dollars(total) }));
    }
    if (!(await accord(t, question, signal))) {
      rendre();
      journaliser({ ...base, compte: ch.compte, moteur: ch.moteur, cout: 0, statut: 'refuse', accord: 'refuse' });
      return texte(tr("Image refusée par l'utilisateur. Décris l'image attendue dans ton rapport."));
    }
    statutAccord = 'accorde';
  }

  emettre('delegation', { tache: t.id, moteur: ch.moteur, compte: ch.compte, statut: 'en_cours', chemin }, d.id);
  try {
    const args2 = { compte: ch.compte, description: String(description), absolu, taille, qualite, fondTransparent, references: refs, t, d, signal };
    const { cout } = ch.moteur === 'api' ? await moteurApi(args2) : await moteurAbonnement(args2);
    journaliser({ ...base, compte: ch.compte, moteur: ch.moteur, cout, statut: 'ok', accord: statutAccord });
    emettre('delegation', { tache: t.id, moteur: ch.moteur, compte: ch.compte, statut: 'ok', chemin, cout }, d.id);
    const piece = copierImage(d.id, t.etage, absolu, e.projet);
    message(d.id, 'systeme', tr('{ref} a généré une image ({compte}) : {description}', { ref: t.ref, compte: nomCompte, description: base.description }), [t.etage], [{ ...piecePublique(piece), legende: base.description }]);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ chemin, moteur: ch.moteur, compte: nomCompte, cout }) },
        { type: 'image', data: fs.readFileSync(absolu).toString('base64'), mimeType: piece.type },
      ],
    };
  } catch (err) {
    rendre();
    journaliser({ ...base, compte: ch.compte, moteur: ch.moteur, cout: 0, statut: 'echec', accord: statutAccord, motif: err.message });
    emettre('delegation', { tache: t.id, moteur: ch.moteur, compte: ch.compte, statut: 'echec', chemin }, d.id);
    return indisponible(err.message);
  }
}
