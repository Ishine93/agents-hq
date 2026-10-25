// Mini-jeu des personnages : chaque agent (et le DG, et Joy) a une personnalité et une mémoire.
// On peut discuter avec lui (en personnage) ; les collègues du même étage entendent, réagissent et s'en
// souviennent ; de temps en temps, deux ou trois collègues bavardent entre eux. Tout est séparé du travail :
// aucune tâche, aucune session de travail n'est touchée. Réglable (et coupable) dans Réglages › Équipe.
import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { RACINE, REGLAGES, langueIA, etage as trouverEtage } from './config.js';
import { etat, emettre, nbClients, fournirMiniJeu } from './bus.js';
import { agentsPublics, personnalisation } from './equipe.js';
import { chargerComptes, compteConnecte, envPour, trouverCompte } from './comptes.js';
import { enregistrerAppel } from './conso.js';
import { t } from './i18n.js';

const FICHIER_PERSOS = path.join(RACINE, 'config', 'personnalites.json');
const FICHIER_PERSOS_DEFAUT = path.join(RACINE, 'config', 'defauts', 'personnalites.json');
const FICHIER_MEMOIRES = process.env.QG_MEMOIRES_FICHIER || path.join(RACINE, 'runtime', 'memoires.json');
const MAX_SOUVENIRS = 40;
const MAX_DIALOGUE = 30;
const EN_ATTENTE = new Set(['planned', 'waiting', 'ready', 'queued']);
// Mode démo (ou tests) : répliques toutes prêtes, aucun appel au modèle.
let demo = !!process.env.QG_DEMO_MINIJEU;
export const utiliserDemo = (v) => (demo = !!v);
const ACTIFS = new Set(['briefing', 'running', 'permission', 'rework', 'verifying']);

// ---------------------------------------------------------------- réglages
export function reglagesMiniJeu() {
  const r = REGLAGES.miniJeu || {};
  return {
    actif: r.actif !== false,
    ecoute: r.ecoute !== false,
    bavardages: r.bavardages !== false,
    bavardagesMinutes: Number(r.bavardagesMinutes) > 0 ? Number(r.bavardagesMinutes) : 10,
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
function relation(de, vers, delta, note) {
  if (!de || !vers || de === vers) return;
  const r = (memoire(de).relations[vers] = memoire(de).relations[vers] || { affinite: 0, note: '' });
  r.affinite = Math.max(-10, Math.min(10, r.affinite + Math.max(-3, Math.min(3, Math.round(Number(delta) || 0)))));
  if (note) r.note = String(note).slice(0, 160);
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
  if (p.personnalites && p.personnalites[ancien]) {
    p.personnalites[nouveau] = p.personnalites[ancien];
    delete p.personnalites[ancien];
    fs.writeFileSync(FICHIER_PERSOS, JSON.stringify(p, null, 2) + '\n');
  }
  sauver();
  publier();
}

export function miniJeuPublic() {
  return { reglages: reglagesMiniJeu(), personnalites: personnalites(), memoires };
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
function compteMiniJeu() {
  const { defaut, comptes } = chargerComptes();
  const c = trouverCompte(defaut);
  if (compteConnecte(c)) return c;
  return comptes.find((x) => compteConnecte(x)) || null;
}

async function appeler(prompt, schema, modele, role) {
  const compte = compteMiniJeu();
  if (!compte) throw new Error(t('aucun compte Claude connecté'));
  const q = query({
    prompt,
    options: {
      model: modele, effort: 'low', maxTurns: 2, tools: [], allowedTools: [], settingSources: [], permissionMode: 'dontAsk',
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
  return Object.entries(r).filter(([k]) => !noms || noms.has(k)).map(([k, v]) => `${nomDe(k)} (${v.affinite > 0 ? '+' : ''}${v.affinite}${v.note ? ' : ' + v.note : ''})`).join(' ; ');
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
const SCHEMA_BAVARDAGE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lignes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { nom: { type: 'string' }, texte: { type: 'string' } }, required: ['nom', 'texte'] }, description: '3 à 5 répliques courtes, chacune d’un des personnages' },
    souvenirs: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { nom: { type: 'string' }, texte: { type: 'string' } }, required: ['nom', 'texte'] } },
    relations: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { de: { type: 'string' }, vers: { type: 'string' }, delta: { type: 'integer' }, note: { type: 'string' } }, required: ['de', 'vers', 'delta', 'note'] } },
  },
  required: ['lignes', 'souvenirs', 'relations'],
};

let dernierBavardage = Date.now();
export async function bavarder({ force = false } = {}) {
  const mj = reglagesMiniJeu();
  if (!force && (!mj.actif || !mj.bavardages || nbClients() === 0 || Date.now() - dernierBavardage < mj.bavardagesMinutes * 60000)) return null;
  dernierBavardage = Date.now();
  // un étage où au moins deux personnages sont ensemble, de préférence la salle de pause
  const parEtage = new Map();
  for (const p of presents().values()) {
    if (p.cle.startsWith('@') || p.etage === 'salle-repos') continue; // on ne bavarde pas en dormant
    if (!parEtage.has(p.etage)) parEtage.set(p.etage, []);
    parEtage.get(p.etage).push(p);
  }
  const groupes = [...parEtage.entries()].filter(([, l]) => l.length >= 2).sort((a, b) => (b[0] === 'salle-pause') - (a[0] === 'salle-pause') || b[1].length - a[1].length);
  if (!groupes.length) return null;
  const [etageId, liste] = groupes[0];
  const qui = liste.sort(() => Math.random() - 0.5).slice(0, liste.length > 2 && Math.random() < 0.4 ? 3 : 2);
  const util = REGLAGES.utilisateur || t('le patron');
  const fiches = qui.map((p) => [
    `${p.nom} : ${personnaliteDe(p.cle) || 'personnalité à inventer'}`,
    `  en ce moment : ${p.fait}`,
    Object.keys(memoire(p.cle).relations).length ? `  ce qu'il/elle pense des autres : ${ficheRelations(p.cle)}` : '',
    memoire(p.cle).souvenirs.length ? `  souvenirs : ${memoire(p.cle).souvenirs.slice(-5).map((s) => s.texte).join(' / ')}` : '',
  ].filter(Boolean).join('\n')).join('\n');
  const prompt = `Écris une petite scène de bavardage au « QG des agents » (immeuble de bureaux en pixel art où des agents IA travaillent pour ${util}), entre ces collègues réunis à l'étage « ${trouverEtage(etageId)?.nom || etageId} » :\n${fiches}\n\nEn ${langueIA()}, 3 à 5 répliques très courtes (une bulle chacune), naturelles, drôles ou touchantes, fidèles à leurs personnalités, leurs relations et leurs souvenirs (amitiés, petites rivalités, amourettes possibles, mais rien de méchant). Pas de détails inventés sur le vrai travail. Indique ce que chacun retient et ce qui change entre eux (souvent rien).`;
  let r;
  try {
    r = demo
      ? { lignes: [{ nom: qui[0].nom, texte: t('Tu as vu le nouveau tableau blanc ?') }, { nom: qui[1].nom, texte: t('Oui, le DG l’a encore rempli de flèches…') }], souvenirs: [], relations: [] }
      : await appeler(prompt, SCHEMA_BAVARDAGE, mj.modeleBavardage, 'minijeu');
  } catch (e) {
    console.error('bavardage', e.message);
    return null;
  }
  const parNom = new Map(qui.map((p) => [p.nom.toLowerCase(), p]));
  const lignes = (r.lignes || []).map((l) => ({ p: parNom.get(String(l.nom).toLowerCase()), texte: String(l.texte || '').slice(0, 200) })).filter((l) => l.p && l.texte).slice(0, 6);
  if (!lignes.length) return null;
  for (const s of r.souvenirs || []) {
    const p = parNom.get(String(s.nom).toLowerCase());
    if (p && s.texte) souvenir(p.cle, s.texte, 'bavardage');
  }
  for (const rel of r.relations || []) {
    const de = parNom.get(String(rel.de).toLowerCase());
    const vers = parNom.get(String(rel.vers).toLowerCase());
    if (de && vers) relation(de.cle, vers.cle, rel.delta, rel.note);
  }
  sauver();
  publier();
  const ev = { etage: etageId, lignes: lignes.map((l) => ({ cle: l.p.cle, nom: l.p.nom, tache: l.p.tache, agent: l.p.agent, texte: l.texte })) };
  emettre('bavardage', ev);
  return ev;
}

export function demarrerBavardages() {
  setInterval(() => bavarder().catch(() => null), 60000).unref();
}
