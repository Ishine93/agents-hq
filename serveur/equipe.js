// Réserve d'agents : un agent qui a fini sa tâche n'est pas renvoyé. Sa conversation Claude Code
// reste sur disque ; le DG peut le réembaucher pour une tâche qui touche le même code (reprise de
// session, avec tout son contexte), ou le cloner (fork) s'il est déjà occupé.
// Un agent est lié à un compte (sa conversation vit dans le dossier de config de ce compte) et à un étage.
import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from './config.js';
import { emettre, etat, majTache } from './bus.js';
import { t as tr } from './i18n.js';

const FICHIER = path.join(RACINE, 'runtime', 'equipe.json');
export const CONTEXTE_MAX = 150000; // au-delà, l'agent part à la retraite (trop chargé pour bien travailler)
const INACTIVITE_MAX_MS = 14 * 24 * 3600 * 1000;

let equipe = { compteur: 0, agents: {} };
let fichierActif = FICHIER;

// Prénoms des agents (plus vivant que T1, T2…) et skins : config/personnalisation.json (Réglages › Équipe),
// sinon config/defauts/personnalisation.json. Un prénom n'est jamais porté par deux agents actifs à la fois.
const PERSO = path.join(RACINE, 'config', 'personnalisation.json');
const PERSO_DEFAUT = path.join(RACINE, 'config', 'defauts', 'personnalisation.json');
const COULEUR = /^#[0-9a-f]{6}$/i;

export function personnalisation() {
  const defaut = JSON.parse(fs.readFileSync(PERSO_DEFAUT, 'utf8'));
  let p = {};
  try {
    p = JSON.parse(fs.readFileSync(PERSO, 'utf8'));
  } catch {
    p = {};
  }
  const prenoms = Array.isArray(p.prenoms) && p.prenoms.length ? p.prenoms : defaut.prenoms;
  return { prenoms, skins: { ...(p.skins || {}) }, noms: { dg: p.noms?.dg || '', joy: p.noms?.joy || '' } };
}

const nomPropre = (x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);

function ecrirePersonnalisation(actuel) {
  fs.writeFileSync(PERSO, JSON.stringify(actuel, null, 2) + '\n');
  emettre('personnalisation', { personnalisation: actuel });
  return actuel;
}

export function modifierPersonnalisation({ prenoms, skins, noms } = {}) {
  const actuel = personnalisation();
  if (Array.isArray(prenoms)) {
    const propres = [...new Set(prenoms.map(nomPropre).filter(Boolean))];
    if (!propres.length) throw new Error(tr('il faut au moins un prénom'));
    actuel.prenoms = propres;
  }
  if (noms && typeof noms === 'object') {
    for (const k of ['dg', 'joy']) if (typeof noms[k] === 'string') actuel.noms[k] = nomPropre(noms[k]);
  }
  if (skins && typeof skins === 'object') {
    actuel.skins = {};
    for (const [nom, sk] of Object.entries(skins)) {
      if (!sk || typeof sk !== 'object') continue;
      const propre = {};
      for (const k of ['peau', 'cheveux', 'pantalon', 'chemise']) if (COULEUR.test(sk[k] || '')) propre[k] = sk[k];
      if (Number.isInteger(sk.coiffure) && sk.coiffure >= 0 && sk.coiffure < 6) propre.coiffure = sk.coiffure;
      if (typeof sk.lunettes === 'boolean') propre.lunettes = sk.lunettes;
      if (Object.keys(propre).length) actuel.skins[String(nom).slice(0, 24)] = propre;
    }
  }
  return ecrirePersonnalisation(actuel);
}

// Renomme un personnage partout et tout de suite : liste, skin, agents de la réserve (et leurs clones
// « X bis »), tâches en cours. « @dg » et « @joy » renomment le DG et Joy.
export function renommerPersonnage(ancien, nouveau) {
  const actuel = personnalisation();
  const n = nomPropre(nouveau);
  // DG et Joy : un nom vide les ramène à leur nom par défaut.
  if (ancien === '@dg' || ancien === '@joy') {
    actuel.noms[ancien.slice(1)] = n;
    return ecrirePersonnalisation(actuel);
  }
  if (!n) throw new Error(tr('nom vide'));
  if (ancien === n) return actuel;
  if (actuel.prenoms.includes(n)) throw new Error(tr('« {nom} » existe déjà dans l’équipe', { nom: n }));
  const i = actuel.prenoms.indexOf(ancien);
  if (i >= 0) actuel.prenoms[i] = n;
  else actuel.prenoms.push(n);
  if (actuel.skins[ancien]) {
    actuel.skins[n] = actuel.skins[ancien];
    delete actuel.skins[ancien];
  }
  const traduire = (p) => (p === ancien ? n : p === `${ancien} bis` ? `${n} bis` : p);
  for (const a of Object.values(equipe.agents)) {
    const p = traduire(a.prenom);
    if (p !== a.prenom) {
      a.prenom = p;
      publier(a);
    }
  }
  for (const t of etat.taches.values()) {
    const p = traduire(t.prenom);
    if (p !== t.prenom) majTache(Object.assign(t, { prenom: p }));
  }
  if (reserves.delete(ancien)) reserves.add(n);
  return ecrirePersonnalisation(actuel);
}

const reserves = new Set(); // prénoms promis à des tâches pas encore lancées

export function tirerPrenom() {
  const pris = new Set([
    ...reserves,
    ...Object.values(equipe.agents).filter((a) => a.etat !== 'retire').map((a) => a.prenom),
    // prénoms déjà portés par des tâches du serveur (y compris celles rechargées après un redémarrage)
    ...[...etat.taches.values()].filter((t) => !['done', 'failed', 'cancelled', 'skipped'].includes(t.etat)).map((t) => t.prenom),
  ]);
  const PRENOMS = personnalisation().prenoms;
  // Au hasard parmi les prénoms libres de la liste (Réglages › Équipe).
  const libres = PRENOMS.filter((p) => !pris.has(p));
  const libre = libres.length ? libres[Math.floor(Math.random() * libres.length)] : null;
  const prenom = libre || `${PRENOMS[equipe.compteur % PRENOMS.length]} ${Math.floor(equipe.compteur / PRENOMS.length) + 2}`;
  reserves.add(prenom);
  return prenom;
}

export const libererPrenom = (prenom) => reserves.delete(prenom);

export function chargerEquipe(nomFichier = null) {
  if (nomFichier) fichierActif = path.join(RACINE, 'runtime', nomFichier);
  try {
    equipe = JSON.parse(fs.readFileSync(fichierActif, 'utf8'));
  } catch {
    equipe = { compteur: 0, agents: {} };
  }
  // Au redémarrage, personne n'est plus « occupé » : les sessions sont mortes avec l'ancien serveur.
  const maintenant = Date.now();
  for (const a of Object.values(equipe.agents)) {
    if (!a.prenom) a.prenom = personnalisation().prenoms[(Number(a.id.slice(1)) - 1) % personnalisation().prenoms.length]; // agents d'avant les prénoms
    // Un agent occupé au moment de l'arrêt n'est pas renvoyé : sa tâche reprend au démarrage et le réoccupe.
    if (a.etat === 'occupe') a.etat = 'disponible';
    a.tache = null;
    if (a.etat === 'disponible' && maintenant - a.depuis > INACTIVITE_MAX_MS) a.etat = 'retire';
  }
  sauver();
}

function sauver() {
  fs.mkdirSync(path.dirname(fichierActif), { recursive: true });
  const tmp = fichierActif + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(equipe, null, 2));
  fs.renameSync(tmp, fichierActif);
}

const publicAgent = ({ session, ...a }) => a;
const publier = (a) => {
  sauver();
  emettre('agent', { agent: publicAgent(a) }, null);
};

export const agentsPublics = () => Object.values(equipe.agents).filter((a) => a.etat !== 'retire').map(publicAgent);
export const agent = (id) => equipe.agents[id] || null;

// Agents réembauchables pour un compte (pour le DG).
export function disponiblesPour(compte) {
  return Object.values(equipe.agents).filter((a) => a.compte === compte && a.etat !== 'retire' && a.session);
}

// Nouvelle recrue : créée au lancement d'une tâche, pour que son avatar garde la même identité.
export function recruter(t, d, prenom = null) {
  const id = `A${++equipe.compteur}`;
  const nom = prenom || t.prenom || tirerPrenom();
  reserves.delete(nom);
  const a = {
    id,
    prenom: nom,
    etage: t.etage,
    compte: d.compte,
    modele: t.modele,
    effort: t.effort,
    titre: t.titre,
    specialite: '',
    fichiers: [],
    missions: 0,
    contexte: 0,
    etat: 'occupe',
    tache: t.id,
    session: null,
    depuis: Date.now(),
  };
  equipe.agents[id] = a;
  publier(a);
  return a;
}

// Réembauche : renvoie l'agent et s'il faut cloner sa conversation (déjà occupé ailleurs).
export function reembaucher(id, t, d) {
  const a = equipe.agents[id];
  if (!a || a.etat === 'retire' || !a.session || a.compte !== d.compte || a.etage !== t.etage) return null;
  if (a.etat === 'occupe') {
    // Clone : une copie de sa conversation part sur la nouvelle tâche, l'original continue.
    if (t.prenom && t.prenom !== a.prenom) reserves.delete(t.prenom);
    const clone = recruter(t, d, `${a.prenom} bis`);
    Object.assign(clone, { titre: t.titre, specialite: a.specialite, fichiers: [...a.fichiers], contexte: a.contexte, cloneDe: a.id });
    publier(clone);
    return { agent: clone, resume: a.session, fork: true };
  }
  if (t.prenom && t.prenom !== a.prenom) reserves.delete(t.prenom);
  Object.assign(a, { etat: 'occupe', tache: t.id, titre: t.titre, modele: t.modele, effort: t.effort, depuis: Date.now() });
  publier(a);
  return { agent: a, resume: a.session, fork: false };
}

// Relance d'une tâche qui avait déjà son agent (reprise après échec, complément…).
export function occuper(id, t) {
  const a = equipe.agents[id];
  if (!a) return;
  Object.assign(a, { etat: 'occupe', tache: t.id, modele: t.modele, effort: t.effort, depuis: Date.now() });
  publier(a);
}

// Fin de tâche : l'agent retourne à la réserve (ou part à la retraite s'il est trop chargé).
export function liberer(id, { session = null, sortie = null, contexte = null, reussi = false } = {}) {
  const a = equipe.agents[id];
  if (!a) return;
  if (session) a.session = session;
  if (contexte != null) a.contexte = contexte;
  if (reussi && sortie) {
    a.missions += 1;
    a.specialite = String(sortie.summary || '').slice(0, 280);
    a.fichiers = [...new Set([...(sortie.changedFiles || []), ...a.fichiers])].slice(0, 8);
  }
  a.tache = null;
  a.depuis = Date.now();
  // Une recrue qui n'a jamais réussi de mission n'apporte rien : on ne la garde pas.
  a.etat = !a.session || (!reussi && a.missions === 0) || a.contexte > CONTEXTE_MAX ? 'retire' : 'disponible';
  publier(a);
}

export function retirer(id) {
  const a = equipe.agents[id];
  if (!a || a.etat === 'occupe') return false;
  a.etat = 'retire';
  publier(a);
  return true;
}

// Résumé pour le DG.
export function resumeEquipePourDg(compte) {
  const liste = disponiblesPour(compte);
  if (!liste.length) return 'Aucun agent en réserve pour ce compte.';
  return liste
    .map(
      (a) =>
        `- ${a.id} « ${a.prenom || '?'} » (étage ${a.etage}, ${a.modele}/${a.effort}, ${a.missions} mission(s), contexte ~${Math.round(a.contexte / 1000)}k tokens${a.etat === 'occupe' ? ', occupé : sera cloné' : ''}) — dernière mission « ${a.titre} » : ${a.specialite || '—'}${a.fichiers.length ? ` Fichiers : ${a.fichiers.join(', ')}` : ''}`,
    )
    .join('\n');
}
