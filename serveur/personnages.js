// Mini-jeu des personnages : chaque agent (et le DG, et Joy) a une personnalité et une mémoire.
// On peut discuter avec lui (en personnage) ; les collègues du même étage entendent, réagissent et s'en
// souviennent ; de temps en temps, deux ou trois collègues bavardent entre eux. Tout est séparé du travail :
// aucune tâche, aucune session de travail n'est touchée. Réglable (et coupable) dans Réglages › Équipe.
import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { RACINE, REGLAGES, langueIA, etage as trouverEtage } from './config.js';
import { ambianceCoupee } from './travail.js';
import { etat, emettre, nbClients, fournirMiniJeu } from './bus.js';
import { agentsPublics, personnalisation } from './equipe.js';
import { envPour } from './comptes.js';
import { enregistrerAppel } from './conso.js';
import { executerSession, raisonEchec } from './session.js';
import { choisirAmbiance } from './routeur.js';
import { t } from './i18n.js';

const FICHIER_PERSOS = path.join(RACINE, 'config', 'personnalites.json');
const FICHIER_PERSOS_DEFAUT = path.join(RACINE, 'config', 'defauts', 'personnalites.json');
let FICHIER_MEMOIRES = process.env.QG_MEMOIRES_FICHIER || path.join(RACINE, 'runtime', 'memoires.json');
const MAX_SOUVENIRS = 40;
const MAX_DIALOGUE = 30;
const EN_ATTENTE = new Set(['planned', 'waiting', 'ready', 'queued']);
// Mode démo (ou tests) : répliques toutes prêtes, aucun appel au modèle.
let demo = !!process.env.QG_DEMO_MINIJEU;
// La démo a ses propres souvenirs (dossiers-demo/memoires.json) : elle tourne à côté du vrai QG, qui écrit
// les siens dans runtime/memoires.json ; les deux ne doivent jamais s’écraser.
export function utiliserDemo(v, fichierMemoires = null) {
  demo = !!v;
  if (v && fichierMemoires) {
    FICHIER_MEMOIRES = fichierMemoires;
    memoires = lireJson(FICHIER_MEMOIRES, {});
    chargerIntrigues();
  }
}
const ACTIFS = new Set(['briefing', 'running', 'permission', 'rework', 'verifying']);

// ---------------------------------------------------------------- réglages
export function reglagesMiniJeu() {
  const r = REGLAGES.miniJeu || {};
  return {
    actif: r.actif !== false,
    ecoute: r.ecoute !== false,
    bavardages: r.bavardages !== false,
    // 0 : en direct (en continu) ; 0,5 : toutes les 30 s
    bavardagesMinutes: Number.isFinite(Number(r.bavardagesMinutes)) && Number(r.bavardagesMinutes) >= 0 && r.bavardagesMinutes !== null && r.bavardagesMinutes !== '' ? Number(r.bavardagesMinutes) : 10,
    modeleDiscussion: r.modeleDiscussion || 'sonnet',
    modeleBavardage: r.modeleBavardage || 'haiku',
  };
}

// ---------------------------------------------------------------- personnalités
function lireJson(f, defaut) {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return defaut;
  }
}
// cle : un prénom, ou « @dg » / « @joy »
export function personnalites() {
  const defaut = lireJson(FICHIER_PERSOS_DEFAUT, {}).personnalites || {};
  const perso = lireJson(FICHIER_PERSOS, {}).personnalites || {};
  return { ...defaut, ...perso };
}
export function personnaliteDe(cle) {
  return personnalites()[cle] || '';
}
export function definirPersonnalite(cle, texte) {
  const actuel = lireJson(FICHIER_PERSOS, {});
  actuel.personnalites = actuel.personnalites || {};
  const propre = String(texte ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (propre) actuel.personnalites[cle] = propre;
  else delete actuel.personnalites[cle]; // vide : on revient à la personnalité par défaut
  fs.writeFileSync(FICHIER_PERSOS, JSON.stringify(actuel, null, 2) + '\n');
  publier();
}

// ---------------------------------------------------------------- mémoires
let memoires = lireJson(FICHIER_MEMOIRES, {});
let minuterieSauvegarde = null;
function sauver() {
  clearTimeout(minuterieSauvegarde);
  minuterieSauvegarde = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FICHIER_MEMOIRES), { recursive: true });
      fs.writeFileSync(FICHIER_MEMOIRES + '.tmp', JSON.stringify(memoires, null, 2));
      fs.renameSync(FICHIER_MEMOIRES + '.tmp', FICHIER_MEMOIRES);
    } catch (e) {
      console.error('mémoires', e.message);
    }
  }, 400);
}
const memoire = (cle) => (memoires[cle] = memoires[cle] || { souvenirs: [], relations: {}, dialogue: [] });
let compteur = 0;
function souvenir(cle, texte, source) {
  const m = memoire(cle);
  m.souvenirs.push({ id: `S${Date.now().toString(36)}${(++compteur).toString(36)}`, t: Date.now(), texte: String(texte).slice(0, 300), source });
  if (m.souvenirs.length > MAX_SOUVENIRS) m.souvenirs.splice(0, m.souvenirs.length - MAX_SOUVENIRS);
}
// lien : amitié, attirance, couple, rivalité, brouille… (le dernier dit ; « réconciliation » efface une brouille)
function relation(de, vers, delta, note, lien = '') {
  if (!de || !vers || de === vers) return;
  const r = (memoire(de).relations[vers] = memoire(de).relations[vers] || { affinite: 0, note: '' });
  r.affinite = Math.max(-10, Math.min(10, r.affinite + Math.max(-3, Math.min(3, Math.round(Number(delta) || 0)))));
  if (note) r.note = String(note).slice(0, 160);
  if (lien) r.lien = lien === 'réconciliation' ? 'amitié' : String(lien).slice(0, 30);
  r.t = Date.now();
}

// Contrôles du joueur : tout effacer, ou un souvenir, une relation, un personnage.
export function oublier({ cle = null, souvenir: sid = null, relation: rel = null, tout = false, relations = false } = {}) {
  if (tout) memoires = {};
  else if (relations && !cle) for (const m of Object.values(memoires)) m.relations = {};
  else if (cle && sid) memoire(cle).souvenirs = memoire(cle).souvenirs.filter((s) => s.id !== sid);
  else if (cle && rel) delete memoire(cle).relations[rel];
  else if (cle && relations) memoire(cle).relations = {};
  else if (cle) delete memoires[cle];
  if (tout || relations || (cle && !sid && !rel)) oublierIntrigues({ cle: cle && !relations ? cle : null, tout, relations: relations && !cle });
  sauver();
  publier();
}
export function renommerMemoire(ancien, nouveau) {
  if (!ancien || !nouveau || ancien === nouveau) return;
  if (memoires[ancien]) {
    memoires[nouveau] = memoires[ancien];
    delete memoires[ancien];
  }
  for (const m of Object.values(memoires)) {
    if (m.relations[ancien]) {
      m.relations[nouveau] = m.relations[ancien];
      delete m.relations[ancien];
    }
  }
  const p = lireJson(FICHIER_PERSOS, {});
  renommerIntrigues(ancien, nouveau);
  if (p.personnalites && p.personnalites[ancien]) {
    p.personnalites[nouveau] = p.personnalites[ancien];
    delete p.personnalites[ancien];
    fs.writeFileSync(FICHIER_PERSOS, JSON.stringify(p, null, 2) + '\n');
  }
  sauver();
  publier();
}

export function miniJeuPublic() {
  return { reglages: reglagesMiniJeu(), personnalites: personnalites(), memoires, intrigues };
}
function publier() {
  emettre('mini_jeu', miniJeuPublic());
}
fournirMiniJeu(miniJeuPublic);

// ---------------------------------------------------------------- qui est où
const nomDg = () => personnalisation().noms.dg || t('DG');
const nomJoy = () => personnalisation().noms.joy || 'Joy';
const nomDe = (cle) => (cle === '@dg' ? nomDg() : cle === '@joy' ? nomJoy() : cle);

// Personnages présents : clé, nom, étage où on le voit, ce qu'il fait, tâche ou agent.
export function presents() {
  const out = new Map();
  const pause = trouverEtage('salle-pause') ? 'salle-pause' : null;
  const repos = trouverEtage('salle-repos') ? 'salle-repos' : null;
  const actif = (d) => ['planification', 'clarification', 'en_cours'].includes(etat.dossiers.get(d)?.etat);
  for (const tch of etat.taches.values()) {
    if (!tch.prenom || !actif(tch.dossier)) continue;
    let ou = null;
    let fait = null;
    if (EN_ATTENTE.has(tch.etat)) {
      ou = pause || tch.etage;
      fait = t('attend son tour pour « {titre} »', { titre: tch.titre });
    } else if (ACTIFS.has(tch.etat)) {
      ou = tch.etage;
      fait = t('travaille sur « {titre} »', { titre: tch.titre });
    } else continue;
    out.set(tch.prenom, { cle: tch.prenom, nom: tch.prenom, etage: ou, fait, tache: tch.id, agent: tch.agent || null });
  }
  for (const a of agentsPublics()) {
    if (!a.prenom || out.has(a.prenom) || a.etat !== 'disponible') continue;
    out.set(a.prenom, { cle: a.prenom, nom: a.prenom, etage: repos || a.etage, fait: repos ? t('se repose dans la salle de repos, entre deux missions') : t('attend une mission'), tache: null, agent: a.id });
  }
  out.set('@dg', { cle: '@dg', nom: nomDg(), etage: etat.dg.etage || 'direction', fait: etat.dg.etat === 'reflechit' ? t('prépare un plan') : t('dirige le QG'), tache: null, agent: null });
  return out;
}

// ---------------------------------------------------------------- appel au modèle (sans outils, sans connecteurs)
// Compte du mini-jeu : priorités « ambiance », sinon le compte par défaut s'il est connecté, sinon le premier
// compte connecté (n'importe quelle IA). Sur Claude, le modèle choisi dans les réglages du mini-jeu.
async function appeler(prompt, schema, modele, role) {
  const amb = choisirAmbiance({ modeleClaude: modele, defautDabord: true });
  if (!amb) throw new Error(t('aucun compte IA connecté'));
  if (amb.fournisseur !== 'claude') return appelerAutreIa(amb, prompt, schema, role);
  const compte = amb.c;
  modele = amb.modele;
  const q = query({
    prompt,
    options: {
      model: modele, effort: 'low', maxTurns: 3, tools: [], allowedTools: [], settingSources: [], permissionMode: 'dontAsk',
      strictMcpConfig: true, mcpServers: {}, persistSession: false, cwd: path.join(RACINE, 'runtime'), env: envPour(compte),
      outputFormat: { type: 'json_schema', schema },
    },
  });
  let res = null;
  for await (const m of q) {
    if (m.type === 'result') res = m;
  }
  if (res?.usage) enregistrerAppel({ compte: compte.id, role, etage: 'hall' }, res.usage, modele, true);
  if (!res?.structured_output) throw new Error(res?.subtype || t('pas de réponse'));
  return res.structured_output;
}

// Codex, agent ACP : session courte de rôle utilitaire, lecture seule, sans outils ni recherche web.
async function appelerAutreIa(amb, prompt, schema, role) {
  const cwd = path.join(RACINE, 'runtime');
  const s = await executerSession({
    prompt,
    compte: amb.compte,
    conso: { role, etage: 'hall' },
    options: {
      ...(amb.modele ? { model: amb.modele } : {}), effort: 'low', maxTurns: 3, tools: [], settingSources: [], permissionMode: 'dontAsk',
      strictMcpConfig: true, mcpServers: {}, persistSession: false, cwd, outputFormat: { type: 'json_schema', schema },
    },
    demande: { role: 'utilitaire', profil: 'lecture', cwd, consignes: '', schema, titre: 'QG mini-jeu' },
  });
  const raison = raisonEchec(s);
  if (raison) throw new Error(raison);
  return s.result.structured_output;
}

const SCHEMA_DISCUSSION = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reponse: { type: 'string', description: 'Ta réplique, en personnage (1 à 3 phrases courtes)' },
    souvenir: { type: 'string', description: 'Ce que tu retiens de cet échange (une phrase), ou chaîne vide' },
    relations: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { nom: { type: 'string' }, delta: { type: 'integer' }, note: { type: 'string' } }, required: ['nom', 'delta', 'note'] }, description: 'Ce qui change dans ce que tu penses de quelqu’un (delta de -3 à 3), souvent rien' },
    reactions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { nom: { type: 'string' }, texte: { type: 'string' }, delta: { type: 'integer' } }, required: ['nom', 'texte', 'delta'] }, description: 'Au plus une réaction d’un collègue présent qui a entendu (sinon liste vide)' },
    personnalite: { type: 'string', description: 'Seulement si ta personnalité n’était pas définie : celle que tu t’inventes (une ou deux phrases), sinon chaîne vide' },
  },
  required: ['reponse', 'souvenir', 'relations', 'reactions', 'personnalite'],
};

function ficheRelations(cle, noms) {
  const r = memoire(cle).relations;
  return Object.entries(r).filter(([k]) => !noms || noms.has(k)).map(([k, v]) => `${nomDe(k)} (${v.affinite > 0 ? '+' : ''}${v.affinite}${v.lien ? ', ' + v.lien : ''}${v.note ? ' : ' + v.note : ''})`).join(' ; ');
}

function contexteCommun(cle, ici) {
  const p = presents();
  const moi = p.get(cle);
  const voisins = [...p.values()].filter((x) => x.cle !== cle && moi && x.etage === moi.etage);
  const nomEtage = (id) => trouverEtage(id)?.nom || id;
  const util = REGLAGES.utilisateur || t('le patron');
  return {
    moi,
    voisins,
    texte: [
      `Tu joues ${nomDe(cle)}, un personnage du « QG des agents » : un immeuble de bureaux en pixel art où une équipe d'agents IA travaille pour ${util} sur ses projets. C'est un petit jeu de rôle, sans aucun effet sur le travail.`,
      `Réponds en ${langueIA()}, en personnage, avec naturel et humour, en tutoyant ; jamais de « en tant qu'IA ». Tu peux avoir des préférences, des amitiés, des agacements et des petits secrets, mais reste bienveillant au fond. N'invente rien sur le vrai travail en cours : dis seulement ce que tu fais.`,
      `Ta personnalité : ${personnaliteDe(cle) || "pas encore définie : invente-t'en une cohérente avec ton prénom et donne-la dans le champ personnalite."}`,
      moi ? `En ce moment, tu ${moi.fait}, à l'étage « ${nomEtage(moi.etage)} ».` : `En ce moment, tu n'es pas au bureau (pas de mission).`,
      voisins.length ? `Dans la même pièce que toi : ${voisins.map((v) => `${v.nom} (${personnaliteDe(v.cle).slice(0, 90) || 'personnalité inconnue'})`).join(' ; ')}.` : 'Personne d’autre dans la pièce.',
      Object.keys(memoire(cle).relations).length ? `Ce que tu penses de tes collègues : ${ficheRelations(cle)}.` : '',
      memoire(cle).souvenirs.length ? `Tes souvenirs récents :\n${memoire(cle).souvenirs.slice(-12).map((s) => '- ' + s.texte).join('\n')}` : '',
      ici || '',
    ].filter(Boolean).join('\n'),
  };
}

// ---------------------------------------------------------------- discuter avec un personnage
const enCours = new Set();
export async function discuter(cle, texte) {
  const mj = reglagesMiniJeu();
  if (!mj.actif) throw new Error(t('Le mini-jeu est coupé dans les Réglages.'));
  if (enCours.has(cle)) throw new Error(t('{nom} est encore en train de te répondre.', { nom: nomDe(cle) }));
  const message = String(texte || '').trim().slice(0, 1000);
  if (!message) throw new Error(t('message vide'));
  const util = REGLAGES.utilisateur || t('Toi');
  enCours.add(cle);
  const m = memoire(cle);
  m.dialogue.push({ t: Date.now(), de: 'toi', texte: message });
  const { moi, voisins, texte: contexte } = contexteCommun(cle);
  emettre('discussion', { cle, nom: nomDe(cle), de: 'toi', texte: message, tache: moi?.tache || null, agent: moi?.agent || null });
  try {
    const histoire = m.dialogue.slice(-12, -1).map((x) => `${x.de === 'toi' ? util : nomDe(x.de === 'perso' ? cle : x.de)} : ${x.texte}`).join('\n');
    const prompt = `${contexte}\n\n${histoire ? `Votre conversation récente :\n${histoire}\n\n` : ''}${util} te dit maintenant : « ${message} »\n${mj.ecoute && voisins.length ? `Les collègues présents entendent : l'un d'eux peut réagir (champ reactions), s'il a une vraie raison (on parle de lui, ça le touche, ça l'amuse).` : 'Personne ne peut réagir (champ reactions vide).'}\nRéponds dans le format demandé.`;
    let r;
    if (demo) r = reponseSimulee(cle, message, voisins);
    else r = await appeler(prompt, SCHEMA_DISCUSSION, mj.modeleDiscussion, 'minijeu');
    const reponse = String(r.reponse || '…').slice(0, 600);
    m.dialogue.push({ t: Date.now(), de: 'perso', texte: reponse });
    if (m.dialogue.length > MAX_DIALOGUE) m.dialogue.splice(0, m.dialogue.length - MAX_DIALOGUE);
    if (r.souvenir) souvenir(cle, r.souvenir, 'discussion');
    if (r.personnalite && !personnaliteDe(cle)) definirPersonnalite(cle, r.personnalite);
    const cles = new Map([...presents().values()].map((p) => [p.nom.toLowerCase(), p.cle]));
    for (const rel of r.relations || []) relation(cle, cles.get(String(rel.nom).toLowerCase()) || rel.nom, rel.delta, rel.note);
    emettre('discussion', { cle, nom: nomDe(cle), de: 'perso', texte: reponse, tache: moi?.tache || null, agent: moi?.agent || null });
    // collègues de la pièce : ils ont entendu (souvenir), l'un d'eux réagit peut-être
    if (mj.ecoute) {
      for (const v of voisins) souvenir(v.cle, `J'ai entendu ${util} dire à ${nomDe(cle)} : « ${message.slice(0, 90)} » ; ${nomDe(cle)} a répondu : « ${reponse.slice(0, 90)} »`, 'entendu');
      for (const re of (r.reactions || []).slice(0, 1)) {
        const v = voisins.find((x) => x.nom.toLowerCase() === String(re.nom).toLowerCase());
        if (!v || !re.texte) continue;
        relation(v.cle, cle, re.delta, '');
        const txt = String(re.texte).slice(0, 300);
        m.dialogue.push({ t: Date.now(), de: v.cle, texte: txt });
        emettre('discussion', { cle, nom: v.nom, de: 'reaction', auteur: v.cle, texte: txt, tache: v.tache, agent: v.agent });
      }
    }
    sauver();
    publier();
    return { reponse };
  } catch (e) {
    m.dialogue.pop();
    emettre('discussion', { cle, nom: nomDe(cle), de: 'erreur', texte: t('Pas de réponse ({raison}).', { raison: e.message }) });
    throw e;
  } finally {
    enCours.delete(cle);
  }
}

// Démo (sans compte) : des répliques toutes prêtes, pour voir le mini-jeu sans dépenser de tokens.
function reponseSimulee(cle, message, voisins) {
  const r = [
    t('Ça va bien, merci ! Je suis concentré, mais une petite pause me fait du bien.'),
    t('Haha, tu me poses de ces questions… Disons que je m’entends bien avec tout le monde. Presque.'),
    t('Franchement ? Le café du QG mériterait une refonte complète.'),
  ];
  const v = voisins[0];
  return {
    reponse: r[(message.length + cle.length) % r.length],
    souvenir: t('On m’a demandé : « {m} »', { m: message.slice(0, 60) }),
    relations: [],
    reactions: v ? [{ nom: v.nom, texte: t('J’ai tout entendu, hein !'), delta: 0 }] : [],
    personnalite: '',
  };
}

// ---------------------------------------------------------------- bavardages entre collègues
// Façon télé-réalité : des scènes de 6 à 10 répliques où l'on parle de la pluie et du beau temps, puis des
// autres ; des rumeurs circulent (qui les a lancées, qui les connaît, la personne visée finit par les
// apprendre), des liens se font et se défont (amitié, attirance, couple, rivalité, brouille…) et des
// histoires se suivent d'une scène à l'autre. Plusieurs scènes peuvent se jouer en même temps (A et B
// pendant que D et E), au rythme choisi, ou « en direct » : en continu.
const MAX_RUMEURS = 30;
const MAX_HISTOIRES = 8;
const MAX_SCENES = 3; // scènes en même temps, au plus
export const LIENS = ['', 'amitié', 'complicité', 'attirance', 'couple', 'rivalité', 'conflit', 'brouille', 'réconciliation', 'méfiance'];

const fichierIntrigues = () => path.join(path.dirname(FICHIER_MEMOIRES), 'intrigues.json');
let intrigues = { rumeurs: [], histoires: [] };
function chargerIntrigues() {
  const x = lireJson(fichierIntrigues(), {});
  intrigues = { rumeurs: Array.isArray(x.rumeurs) ? x.rumeurs : [], histoires: Array.isArray(x.histoires) ? x.histoires : [] };
}
chargerIntrigues();
function sauverIntrigues() {
  try {
    fs.mkdirSync(path.dirname(fichierIntrigues()), { recursive: true });
    fs.writeFileSync(fichierIntrigues() + '.tmp', JSON.stringify(intrigues, null, 2));
    fs.renameSync(fichierIntrigues() + '.tmp', fichierIntrigues());
  } catch (e) {
    console.error('intrigues', e.message);
  }
}
// Oubli, renommage : les rumeurs et les histoires suivent la mémoire.
function oublierIntrigues({ cle = null, tout = false, relations = false }) {
  if (tout) intrigues = { rumeurs: [], histoires: [] };
  else if (relations && !cle) intrigues.histoires = [];
  else if (cle) {
    intrigues.rumeurs = intrigues.rumeurs.filter((r) => r.par !== cle && r.sujet !== cle).map((r) => ({ ...r, connaisseurs: r.connaisseurs.filter((c) => c !== cle) }));
    intrigues.histoires = intrigues.histoires.filter((h) => !h.qui.includes(cle));
  }
  sauverIntrigues();
}
function renommerIntrigues(ancien, nouveau) {
  const r = (c) => (c === ancien ? nouveau : c);
  for (const x of intrigues.rumeurs) {
    x.par = r(x.par);
    x.sujet = r(x.sujet);
    x.connaisseurs = x.connaisseurs.map(r);
  }
  for (const h of intrigues.histoires) h.qui = h.qui.map(r);
  sauverIntrigues();
}

const SCHEMA_BAVARDAGE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lignes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { nom: { type: 'string' }, texte: { type: 'string' } }, required: ['nom', 'texte'] }, description: '6 à 10 répliques courtes qui s’enchaînent, chacune d’un des personnages de la scène' },
    temoin: { type: 'object', additionalProperties: false, properties: { nom: { type: 'string' }, texte: { type: 'string' } }, required: ['nom', 'texte'], description: 'Un collègue à portée d’oreille qui intervient à la fin (nom et texte vides si personne)' },
    souvenirs: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { nom: { type: 'string' }, texte: { type: 'string' } }, required: ['nom', 'texte'] } },
    relations: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { de: { type: 'string' }, vers: { type: 'string' }, delta: { type: 'integer' }, lien: { type: 'string', enum: LIENS }, note: { type: 'string' } }, required: ['de', 'vers', 'delta', 'lien', 'note'] } },
    rumeurs: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { par: { type: 'string' }, sujet: { type: 'string' }, texte: { type: 'string' } }, required: ['par', 'sujet', 'texte'] }, description: 'Rumeurs lancées dans la scène (sur un collègue, souvent absent)' },
    revelations: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { par: { type: 'string' }, a: { type: 'string' }, sujet: { type: 'string' } }, required: ['par', 'a', 'sujet'] }, description: 'Rumeurs connues répétées à quelqu’un dans la scène' },
    histoire: { type: 'object', additionalProperties: false, properties: { titre: { type: 'string' }, resume: { type: 'string' } }, required: ['titre', 'resume'], description: 'L’histoire que la scène fait avancer (titre court, résumé d’une phrase), ou vide' },
  },
  required: ['lignes', 'temoin', 'souvenirs', 'relations', 'rumeurs', 'revelations', 'histoire'],
};

const scenes = new Map(); // id → { qui: Set, etage, fin }
let numScene = 0;
function occupes() {
  const out = new Set();
  const now = Date.now();
  for (const [id, sc] of scenes) {
    if (sc.fin && sc.fin < now) scenes.delete(id);
    else for (const c of sc.qui) out.add(c);
  }
  return out;
}

// Personnages qu'on connaît (présents ou passés), pour parler des absents.
const connus = () => [...new Set([...presents().values()].map((p) => p.cle).concat(Object.keys(memoires)))].filter((c) => !c.startsWith('@'));

// Qui bavarde : de préférence des personnages qu'une histoire en cours relie (pour la suite), sinon un
// groupe au hasard, la salle de pause d'abord. Jamais quelqu'un déjà pris dans une autre scène.
function choisirScene() {
  const pris = occupes();
  const parEtage = new Map();
  for (const p of presents().values()) {
    if (p.cle.startsWith('@') || p.etage === 'salle-repos') continue; // on ne bavarde pas en dormant
    if (!parEtage.has(p.etage)) parEtage.set(p.etage, []);
    parEtage.get(p.etage).push(p);
  }
  const libres = [...parEtage.entries()].map(([e, l]) => [e, l.filter((p) => !pris.has(p.cle))]).filter(([, l]) => l.length >= 2);
  if (!libres.length) return null;
  const melanger = (l) => l.slice().sort(() => Math.random() - 0.5);
  if (Math.random() < 0.6) {
    for (const h of intrigues.histoires.slice().reverse()) {
      for (const [e, l] of libres) {
        const ici = l.filter((p) => h.qui.includes(p.cle));
        if (ici.length >= 2) return { etage: e, qui: melanger(ici).slice(0, 3), tous: parEtage.get(e) };
      }
    }
  }
  libres.sort((a, b) => (b[0] === 'salle-pause') - (a[0] === 'salle-pause') || b[1].length - a[1].length);
  const [e, l] = Math.random() < 0.7 ? libres[0] : libres[Math.floor(Math.random() * libres.length)];
  const n = l.length >= 5 && Math.random() < 0.25 ? 4 : l.length >= 3 && Math.random() < 0.4 ? 3 : 2;
  return { etage: e, qui: melanger(l).slice(0, n), tous: parEtage.get(e) };
}

const rumeursDe = (cle) => intrigues.rumeurs.filter((r) => r.connaisseurs.includes(cle));

function promptScene(choix, temoins) {
  const util = REGLAGES.utilisateur || t('le patron');
  const dans = new Set(choix.qui.map((p) => p.cle));
  const fiches = choix.qui.map((p) => [
    `${p.nom} : ${personnaliteDe(p.cle) || 'personnalité à inventer'}`,
    `  en ce moment : ${p.fait}`,
    Object.keys(memoire(p.cle).relations).length ? `  ce qu'il/elle pense des autres : ${ficheRelations(p.cle)}` : '',
    memoire(p.cle).souvenirs.length ? `  souvenirs : ${memoire(p.cle).souvenirs.slice(-5).map((s) => s.texte).join(' / ')}` : '',
    rumeursDe(p.cle).length ? `  rumeurs qu'il/elle connaît : ${rumeursDe(p.cle).slice(-4).map((r) => `« ${r.texte} » (sur ${nomDe(r.sujet)}, lancée par ${nomDe(r.par)})`).join(' ; ')}` : '',
  ].filter(Boolean).join('\n')).join('\n');
  const absents = connus().filter((c) => !dans.has(c) && !temoins.some((x) => x.cle === c)).slice(0, 10);
  const histoires = intrigues.histoires.filter((h) => h.qui.some((c) => dans.has(c) || temoins.some((x) => x.cle === c))).slice(-4);
  return [
    `Écris une scène de bavardage au « QG des agents » (immeuble de bureaux en pixel art où des agents IA travaillent pour ${util}), façon télé-réalité (Secret Story, L'île de la tentation), à l'étage « ${trouverEtage(choix.etage)?.nom || choix.etage} ».`,
    `Personnages de la scène :\n${fiches}`,
    temoins.length ? `À portée d'oreille (ils entendent tout ; au plus un peut intervenir à la fin, champ temoin) : ${temoins.map((x) => x.nom).join(', ')}.` : 'Personne d’autre n’entend (champ temoin vide).',
    absents.length ? `Collègues absents dont on peut parler : ${absents.map((c) => `${nomDe(c)}${personnaliteDe(c) ? ` (${personnaliteDe(c).slice(0, 70)})` : ''}`).join(' ; ')}.` : '',
    `N'invente aucun autre collègue : les rumeurs et les potins portent sur les personnes citées ici (présentes, à portée d'oreille ou absentes), le DG (${nomDg()}), ${nomJoy()} ou ${util}.`,
    histoires.length ? `Histoires en cours :\n${histoires.map((h) => `- ${h.titre} : ${h.resume} (${h.qui.map(nomDe).join(', ')})`).join('\n')}` : '',
    `En ${langueIA()}, 6 à 10 répliques très courtes (une bulle chacune, 20 mots au plus) qui s'enchaînent vraiment : on se répond, on rebondit, on taquine. Ça part souvent de la pluie et du beau temps, puis ça glisse : potins et rumeurs sur un collègue absent, confidences, jalousie, complicité, flirt, petite dispute ou réconciliation. Fais avancer une histoire en cours qui les concerne, sinon lances-en une. Si quelqu'un connaît une rumeur sur une personne présente, il peut la lui répéter (et c'est le drame). Fidèle aux personnalités, relations et souvenirs. Drôle et léger : pas d'insulte, rien de sexuel, pas de méchanceté gratuite, rien d'inventé sur le vrai travail.`,
    `Indique ce que chacun retient, ce qui change entre eux (delta de -3 à 3 et le lien qui en résulte, souvent rien), les rumeurs lancées, les rumeurs répétées à quelqu'un, et l'histoire que la scène fait avancer.`,
  ].filter(Boolean).join('\n\n');
}

// Démo (sans compte) : des scènes toutes prêtes, avec rumeurs et liens, pour voir le jeu sans tokens.
function sceneSimulee(qui) {
  const [A, B] = qui;
  const absents = connus().filter((c) => !qui.some((p) => p.cle === c));
  const X = absents.length ? absents[Math.floor(Math.random() * absents.length)] : null;
  const scenes = [
    () => ({
      lignes: [[A, t('Il fait un temps de chien dehors, non ?')], [B, t('Parfait pour rester au chaud avec un café.')], [A, X ? t('Tu as vu {x} ce matin ? Trois cafés avant 9 h.', { x: nomDe(X) }) : t('Le café est encore tombé en panne.')], [B, t('Non ! Il paraît que c’est pour tenir le rythme du DG.')], [A, t('Ou pour impressionner quelqu’un…')], [B, t('Tais-toi, tu vas faire des jaloux.')], [A, t('Moi ? Jamais. Enfin… peut-être.')]],
      rumeur: X ? { par: A.cle, sujet: X, texte: t('{x} boit trois cafés avant 9 h pour impressionner quelqu’un', { x: nomDe(X) }) } : null,
      relations: [[A, B, 1, 'complicité', t('on se raconte tout')]],
      histoire: { titre: t('Les cafés du matin'), resume: t('{a} et {b} se demandent pour qui on fait tant d’efforts.', { a: A.nom, b: B.nom }) },
    }),
    () => ({
      lignes: [[A, t('Tu as dormi ? Tu as une tête de lundi.')], [B, t('Merci, toi aussi tu es radieux.')], [A, t('Je plaisante ! Tu as bonne mine, en vrai.')], [B, t('…Tu dis ça à tout le monde.')], [A, t('Non. Juste à toi.')], [B, t('Bon. On en reparle à la pause ?')], [A, t('Avec plaisir.')]],
      relations: [[A, B, 2, 'attirance', t('il y a quelque chose')], [B, A, 1, 'attirance', t('troublé(e)')]],
      histoire: { titre: t('{a} et {b}, plus que collègues ?', { a: A.nom, b: B.nom }), resume: t('Un compliment de trop, un rendez-vous à la pause.') },
    }),
    () => ({
      lignes: [[A, t('C’est toi qui as fini mes biscuits ?')], [B, t('Quels biscuits ?')], [A, t('Ceux avec mon prénom écrit dessus.')], [B, t('Ah. Ceux-là. Ils étaient très bons.')], [A, t('Incroyable. On ne peut faire confiance à personne ici.')], [B, t('Je t’en rachète demain, promis.')], [A, t('Double ration. Et des excuses publiques.')]],
      relations: [[A, B, -1, 'rivalité', t('a mangé mes biscuits')]],
      histoire: { titre: t('L’affaire des biscuits'), resume: t('{b} a mangé les biscuits de {a}, la guerre est déclarée.', { a: A.nom, b: B.nom }) },
    }),
    () => ({
      lignes: [[A, t('Tu sais ce qu’on raconte sur toi ?')], [B, t('Non… dis-moi.')], [A, t('Que tu chantes sous la douche du QG.')], [B, t('Il n’y a pas de douche au QG !')], [A, t('Justement. C’est ça le mystère.')], [B, t('Qui a lancé ça ?')], [A, t('Je ne balance pas…')]],
      rumeur: { par: X || A.cle, sujet: B.cle, texte: t('{b} chanterait sous la douche du QG', { b: B.nom }) },
      revelation: true,
      relations: [],
      histoire: { titre: t('La rumeur de la douche'), resume: t('{b} découvre ce qu’on dit dans son dos.', { b: B.nom }) },
    }),
  ];
  const sc = scenes[Math.floor(Math.random() * scenes.length)]();
  return {
    lignes: sc.lignes.map(([p, texte]) => ({ nom: p.nom, texte })),
    temoin: { nom: '', texte: '' },
    souvenirs: [{ nom: B.nom, texte: sc.histoire.resume }],
    relations: sc.relations.map(([de, vers, delta, lien, note]) => ({ de: de.nom, vers: vers.nom, delta, lien, note })),
    rumeurs: sc.rumeur ? [{ par: nomDe(sc.rumeur.par), sujet: nomDe(sc.rumeur.sujet), texte: sc.rumeur.texte }] : [],
    revelations: sc.revelation ? [{ par: A.nom, a: B.nom, sujet: B.nom }] : [],
    histoire: sc.histoire,
  };
}

// Une scène : choix des personnages, écriture (modèle, ou toute prête en démo), mémoire, rumeurs, histoires.
export async function bavarder({ force = false } = {}) {
  const mj = reglagesMiniJeu();
  if (!force && (!mj.actif || !mj.bavardages || nbClients() === 0 || (!demo && ambianceCoupee()))) return null;
  const choix = choisirScene();
  if (!choix) return null;
  const dejaPris = occupes(); // ceux qui jouent déjà une autre scène ne font pas les témoins
  const id = ++numScene;
  scenes.set(id, { qui: new Set(choix.qui.map((p) => p.cle)), etage: choix.etage, fin: 0 });
  try {
    const temoins = mj.ecoute ? choix.tous.filter((p) => !choix.qui.includes(p) && !dejaPris.has(p.cle)) : [];
    const r = demo ? sceneSimulee(choix.qui) : await appeler(promptScene(choix, temoins), SCHEMA_BAVARDAGE, mj.modeleBavardage, 'minijeu');
    const cles = new Map();
    for (const c of connus()) cles.set(c.toLowerCase(), c);
    for (const p of [...presents().values(), ...choix.qui]) cles.set(p.nom.toLowerCase(), p.cle);
    cles.set(nomJoy().toLowerCase(), '@joy');
    const cleDe = (nom) => cles.get(String(nom || '').trim().toLowerCase()) || null;
    const parNom = new Map(choix.qui.map((p) => [p.nom.toLowerCase(), p]));
    const lignes = (r.lignes || []).map((l) => ({ p: parNom.get(String(l.nom).toLowerCase()), texte: String(l.texte || '').slice(0, 200) })).filter((l) => l.p && l.texte).slice(0, 12);
    if (!lignes.length) return null;
    const temoin = r.temoin && r.temoin.texte ? temoins.find((p) => p.nom.toLowerCase() === String(r.temoin.nom).toLowerCase()) : null;
    if (temoin) lignes.push({ p: temoin, texte: String(r.temoin.texte).slice(0, 200) });
    for (const s of r.souvenirs || []) {
      const c = cleDe(s.nom);
      if (c && s.texte) souvenir(c, s.texte, 'bavardage');
    }
    for (const rel of r.relations || []) {
      const de = cleDe(rel.de);
      const vers = cleDe(rel.vers);
      if (de && vers) relation(de, vers, rel.delta, rel.note, rel.lien);
    }
    // rumeurs : connues de toute la pièce ; la personne visée, si elle est là, l'a entendue
    const piece = new Set([...choix.qui, ...temoins].map((p) => p.cle));
    for (const ru of r.rumeurs || []) {
      const par = cleDe(ru.par);
      const sujet = cleDe(ru.sujet);
      if (!par || !sujet || !ru.texte) continue;
      intrigues.rumeurs.push({ id: `R${Date.now().toString(36)}${(++compteur).toString(36)}`, t: Date.now(), par, sujet, texte: String(ru.texte).slice(0, 200), connaisseurs: [...piece] });
      if (piece.has(sujet) && sujet !== par) {
        souvenir(sujet, t('J’ai entendu {par} raconter sur moi : « {texte} »', { par: nomDe(par), texte: String(ru.texte).slice(0, 120) }), 'entendu');
        relation(sujet, par, -2, t('raconte des choses sur moi'), 'méfiance');
      }
    }
    // rumeurs répétées : la personne mise au courant ; si c'est la personne visée, elle en veut à qui l'a lancée
    for (const rv of r.revelations || []) {
      const a = cleDe(rv.a);
      const sujet = cleDe(rv.sujet);
      if (!a || !sujet) continue;
      for (const ru of intrigues.rumeurs.filter((x) => x.sujet === sujet)) {
        if (!ru.connaisseurs.includes(a)) ru.connaisseurs.push(a);
        if (a === sujet && ru.par !== a) {
          souvenir(a, t('{qui} m’a répété ce que {par} raconte sur moi : « {texte} »', { qui: nomDe(cleDe(rv.par) || rv.par), par: nomDe(ru.par), texte: ru.texte.slice(0, 120) }), 'bavardage');
          relation(a, ru.par, -2, t('raconte des choses sur moi'), 'méfiance');
        }
      }
    }
    if (intrigues.rumeurs.length > MAX_RUMEURS) intrigues.rumeurs.splice(0, intrigues.rumeurs.length - MAX_RUMEURS);
    // l'histoire en cours (même titre : on la poursuit)
    const h = r.histoire;
    if (h && h.titre && h.titre.trim()) {
      const titre = h.titre.trim().slice(0, 80);
      const qui = choix.qui.map((p) => p.cle);
      const ex = intrigues.histoires.find((x) => x.titre.toLowerCase() === titre.toLowerCase());
      if (ex) {
        ex.resume = String(h.resume || ex.resume).slice(0, 240);
        ex.qui = [...new Set([...ex.qui, ...qui])];
        ex.t = Date.now();
        ex.episodes = (ex.episodes || 1) + 1;
        intrigues.histoires = [...intrigues.histoires.filter((x) => x !== ex), ex];
      } else intrigues.histoires.push({ titre, resume: String(h.resume || '').slice(0, 240), qui, t: Date.now(), episodes: 1 });
      if (intrigues.histoires.length > MAX_HISTOIRES) intrigues.histoires.splice(0, intrigues.histoires.length - MAX_HISTOIRES);
    }
    // les autres de la pièce ont entendu
    if (mj.ecoute) {
      const extrait = lignes.slice(0, 2).map((l) => `${l.p.nom} : « ${l.texte.slice(0, 70)} »`).join(' ');
      for (const v of temoins) if (v !== temoin) souvenir(v.cle, t('J’ai entendu {noms} papoter. {extrait}', { noms: choix.qui.map((p) => p.nom).join(' & '), extrait }), 'entendu');
    }
    sauver();
    sauverIntrigues();
    publier();
    // la scène se joue dans le site : ses personnages restent pris jusqu'à la fin
    const duree = lignes.reduce((n, l) => n + Math.min(8000, 2400 + l.texte.length * 40) * 0.8, 6000);
    scenes.get(id).fin = Date.now() + duree;
    const ev = { etage: choix.etage, scene: id, lignes: lignes.map((l) => ({ cle: l.p.cle, nom: l.p.nom, tache: l.p.tache, agent: l.p.agent, texte: l.texte, temoin: l.p === temoin || undefined })) };
    emettre('bavardage', ev);
    return ev;
  } catch (e) {
    console.error('bavardage', e.message);
    return null;
  } finally {
    const sc = scenes.get(id);
    if (sc && !sc.fin) scenes.delete(id);
  }
}

// Rythme : une scène toutes les N minutes (0,5 = 30 s), ou « en direct » (0) : dès qu'une scène se
// termine, une autre commence, jusqu'à 3 en même temps. Seulement quand le QG est ouvert.
let derniereScene = Date.now();
let prochainDirect = 0;
export function demarrerBavardages() {
  setInterval(() => {
    const mj = reglagesMiniJeu();
    if (!mj.actif || !mj.bavardages || nbClients() === 0) return;
    const now = Date.now();
    occupes();
    if (scenes.size >= MAX_SCENES) return;
    // démo : au moins une scène par minute, pour voir le jeu vivre
    const minutes = demo && mj.bavardagesMinutes > 1 ? 1 : mj.bavardagesMinutes;
    if (minutes === 0) {
      if (now < prochainDirect) return;
      prochainDirect = now + 6000 + Math.random() * 6000;
    } else if (now - derniereScene < minutes * 60000) return;
    derniereScene = now;
    bavarder().catch(() => null);
  }, 5000).unref();
}
