// Machine à états des avatars : traduit l'état du serveur (tâches, DG, ordonnanceur…) en scènes.
// Le principe : à chaque instant on calcule « où chaque avatar devrait être » (catégorie + place),
// et on ne lance un déplacement que quand cette cible change. Changer d'étage reconstruit tout à plat.
import { construireCarte, praticable } from './carte.js';
import { chercherChemin } from './chemins.js';
import {
  apparence, spriteAvatar, ombre, ampoules, etiquette, bulle, bullePoints, marque, iconeOutil, estOutilMachine,
  modele, EFFORTS, AVATAR_AX, AVATAR_AY, poly, projeteur, nuance, bullePensee, pancarte, hacher, teteDormeur, TETE_AX, TETE_AY, lettreZ,
} from './sprites.js';
import { phraseOutil, phrase, liste as listePhrases, sujet, enumerer, blaguesSecours, faitsSecours } from './phrases.js';
import { t as tr, langueCourante } from './i18n.js';
import {
  versArt, coinTuile, construireCouche, spriteMeuble, animerMeuble, spriteCloison, spriteAscenseur, spriteHorloge, spriteTableau,
  ledsService, animerJeu, spriteTele, spriteCouverture, oreiller, voileNuit, programmeTele, resteProgrammeTele,
} from './decor.js';
import { TERMINAUX } from './etat.js';

const VITESSE = 2.3; // cases par seconde
const SILENCE = 20000;
const SILENCE_LONG = 5 * 60 * 1000;
const COUL_RESULTAT = { done: '#3ddc5a', blocked: '#ff9a1f', failed: '#ff3b3b' };
const JAUNE = '#f2c14e';
// Clé d'une place : sa case, plus l'étage du lit superposé (deux dormeurs sur la même case, un en haut, un en bas).
const cle = (s) => s.x + ',' + s.y + (s.niveau ? '/' + s.niveau : '');

// Salle de pause : liste de phrases (phrases.js) de chaque activité.
const SORTE_JEU = {
  billard: 'jeuBillard', babyfoot: 'jeuBabyfoot', tele: 'jeuTele', arcade: 'jeuArcade', pingpong: 'jeuPingpong',
  pouf: 'jeuPouf', cafe: 'jeuCafe', regarde: 'jeuRegarde',
};
// Ce qu'on dit en arrivant à une place (rien sur une place debout improvisée).
const ARRIVEE_JEU = { tele: 'arriveeTele', cafe: 'jeuCafe', regarde: 'jeuRegarde', billard: 'arriveeJeu', babyfoot: 'arriveeJeu', pingpong: 'arriveeJeu', arcade: 'arriveeJeu', pouf: 'arriveeJeu' };
// Durée d'une activité en salle de pause avant d'avoir envie d'autre chose (une visite est plus courte).
const dureeEnvie = (visite = false) => (visite ? 20000 + Math.random() * 20000 : 35000 + Math.random() * 55000);
const JOY_VISITE = [20000, 30000]; // salle de pause : Joy passe voir un joueur, puis un autre

// ---------- où voit-on qui ? ----------
// Une tâche qui n'a pas démarré attend dans la salle de pause ; un agent en réserve dort dans la salle de repos.
// Sans ces étages (serveur qui ne les publie pas), tout le monde reste sur l'étage de son projet.
const EN_ATTENTE = new Set(['planned', 'waiting', 'ready', 'queued']);
export function etageDeType(S, type) {
  return (S.etages || []).find((e) => e && e.type === type) || null;
}
// Étage où apparaît l'avatar d'une tâche (null : nulle part).
export function etageVisibleTache(S, t) {
  if (!t) return null;
  if (EN_ATTENTE.has(t.etat)) {
    const p = etageDeType(S, 'pause');
    if (p) return S.dossierActif(t.dossier) ? p.id : null;
  }
  return t.etage;
}
// Étage où apparaît un agent de l'équipe : son poste quand il travaille, la salle de repos quand il est en réserve.
export function etageVisibleAgent(S, a) {
  if (!a || a.etat === 'retire') return null;
  const repos = etageDeType(S, 'repos');
  const t = a.tache ? S.taches.get(a.tache) : null;
  if (t && !TERMINAUX.has(t.etat) && t.agent === a.id) return etageVisibleTache(S, t);
  // par prudence : une tâche en cours portée par cet agent prime sur un état « disponible » pas encore reçu
  for (const u of S.taches.values()) {
    if (u.agent === a.id && !TERMINAUX.has(u.etat) && !EN_ATTENTE.has(u.etat) && S.dossierActif(u.dossier)) return etageVisibleTache(S, u);
  }
  return repos ? repos.id : a.etage;
}

function couleurResultat(t) {
  if (t.resultat && COUL_RESULTAT[t.resultat.status]) return COUL_RESULTAT[t.resultat.status];
  return t.etat === 'failed' ? COUL_RESULTAT.failed : COUL_RESULTAT.done;
}
function cibleCourte(c) {
  if (!c) return '';
  const url = String(c).match(/^[a-z]+:\/\/(?:www\.)?([^/?#]+)/i);
  if (url) return url[1].length > 22 ? url[1].slice(0, 21) + '…' : url[1];
  let s = String(c).replace(/\\/g, '/');
  if (s.includes('/') && !s.includes(' ')) s = s.split('/').filter(Boolean).pop() || s;
  return s.length > 22 ? s.slice(0, 21) + '…' : s;
}
// Visage d'un agent : la graine de son apparence (localStorage, pour qu'une recrue garde la tête qu'elle avait
// avant son lancement, même après un rechargement).
const CLE_VISAGES = 'qg-visages';
function chargerVisages() {
  try {
    return JSON.parse(localStorage.getItem(CLE_VISAGES) || '{}') || {};
  } catch {
    return {};
  }
}
const COUL_SERVICE = { actif: '#3ddc5a', demarrage: '#ffb02e', erreur: '#ff3b3b', externe: '#7fa7d9', arrete: '#646c88' };

// v1.5 : phrases, pensées, bavardages, happiness manager
const PHRASE_DELAI = 6000; // au plus une phrase toutes les 6 s par avatar
const PENSEE_VIE = 15000; // une pensée sans nouvelles depuis 15 s disparaît
const MAX_BULLES_PIECE = 3;
const JOY_ENTRE_BLAGUES = 20000;

function fmtNombre(n) {
  return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
// Début de la dernière phrase de la réflexion (≈ 50 caractères) : la bulle se renouvelle à chaque nouvelle idée.
function extraitCourt(s, n = 52) {
  const x = String(s || '').replace(/\s+/g, ' ').trim();
  if (!x) return '';
  const phrases = x.split(/(?<=[.!?…])\s+/).filter(Boolean);
  let d = phrases[phrases.length - 1] || x;
  if (d.length < 14 && phrases.length > 1) d = phrases[phrases.length - 2];
  if (d.length <= n) return d;
  const coupe = d.slice(0, n);
  const i = coupe.lastIndexOf(' ');
  return (i > 30 ? coupe.slice(0, i) : coupe).replace(/[,;:\s]+$/, '') + '…';
}
const estBloquee = (t) => !!t && t.etat === 'queued' && /^bloqu/i.test(String(t.motifFile || '').trim());
function refBloquante(t) {
  const m = String(t.motifFile || '').match(/\b(T\d+)\b/);
  return m ? m[1] : null;
}
function dirVers(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'se' : 'nw';
  return dy >= 0 ? 'sw' : 'ne';
}
const etape = (x, y, dir) => ({ x, y, dir });
// Tournée de Joy quand personne ne se repose sur l'étage (repli si la carte n'en propose pas).
const JOY_TOUR = [etape(3, 5, 'se'), etape(8, 4, 'sw'), etape(13, 4, 'sw'), etape(7, 10, 'ne'), etape(4, 10, 'ne'), etape(6, 3, 'nw')];

// Étage de Joy, le happiness manager : choisi pour tout l'immeuble (même réponse pour chaque vue).
// Joy fait le tour des étages où il y a du monde (au travail, en attente en salle de pause…), au prorata :
// plus d'agents, plus de chances d'y aller et plus longtemps. Le DG compte peu : Joy passe le voir
// rarement, le temps d'une blague. Jamais au sous-sol ni dans la salle de repos : on n'y réveille personne.
const JOY_SEJOUR = { min: 15000, parPersonne: 5000, max: 45000, dg: 12000 };
const JOY_POIDS_DG = 0.35;
const ACTIFS_JOY = new Set(['briefing', 'running', 'rework', 'verifying']);
let cacheJoy = { etage: null, jusqua: 0 };
let joyForcee = null;
// Débogage : impose l'étage de Joy (null pour revenir au choix automatique).
export function forcerEtageJoy(id) {
  joyForcee = id || null;
}
// Combien de personnes Joy trouverait sur chaque étage (le DG pour un tiers de personne).
function mondeParEtage(S, etages) {
  const monde = new Map(etages.map((e) => [e.id, 0]));
  const ajouter = (id, n) => {
    if (monde.has(id)) monde.set(id, monde.get(id) + n);
  };
  for (const t of S.taches.values()) {
    if (!S.dossierActif(t.dossier)) continue;
    // une tâche qui attend ta permission : on ne la dérange pas
    if (ACTIFS_JOY.has(t.etat) || EN_ATTENTE.has(t.etat)) ajouter(etageVisibleTache(S, t), 1);
  }
  if (S.dg && S.dg.etage) ajouter(S.dg.etage, JOY_POIDS_DG);
  return monde;
}
export function etageJoy(S, now = Date.now()) {
  const etages = (S.etages || []).filter((e) => e && e.id && e.type !== 'serveur' && e.type !== 'repos');
  if (!etages.length) return null;
  if (joyForcee && etages.some((e) => e.id === joyForcee)) return joyForcee;
  const monde = mondeParEtage(S, etages);
  const cands = etages.filter((e) => monde.get(e.id) > 0);
  const ici = cacheJoy.etage && etages.some((e) => e.id === cacheJoy.etage);
  // on reste jusqu'à la fin du séjour, sauf si l'étage s'est vidé alors qu'il y a du monde ailleurs
  if (ici && now < cacheJoy.jusqua && (monde.get(cacheJoy.etage) > 0 || !cands.length)) return cacheJoy.etage;
  let choix;
  if (cands.length) {
    // tirage au prorata du monde, en changeant d'étage quand on a le choix
    const pool = cands.length > 1 ? cands.filter((e) => e.id !== cacheJoy.etage) : cands;
    const total = pool.reduce((n, e) => n + monde.get(e.id), 0);
    let r = Math.random() * total;
    choix = pool[pool.length - 1];
    for (const e of pool) {
      r -= monde.get(e.id);
      if (r < 0) {
        choix = e;
        break;
      }
    }
  } else {
    // personne nulle part : la salle de pause, sinon un étage au hasard
    choix = etages.find((e) => e.type === 'pause') || etages[Math.floor(Math.random() * etages.length)];
  }
  const n = monde.get(choix.id) || 0;
  const duree = n < 1 && n > 0 ? JOY_SEJOUR.dg : Math.min(JOY_SEJOUR.max, JOY_SEJOUR.min + Math.floor(n) * JOY_SEJOUR.parPersonne);
  cacheJoy = { etage: choix.id, jusqua: now + duree * (0.85 + Math.random() * 0.3) };
  return choix.id;
}

// Décale vers le haut les bulles qui se chevauchent (coordonnées « effectives » : à zoom < 1,
// les surcouches gardent leur taille écran, donc occupent f = 1/zoom fois plus de place dans l'art).
function eviter(items, fixes, f) {
  const occ = fixes.slice();
  const touche = (x0, y0, w, h) => occ.find((o) => x0 < o.x1 - 0.5 && x0 + w > o.x0 + 0.5 && y0 < o.y1 - 0.5 && y0 + h > o.y0 + 0.5);
  items.sort((a, b) => b.y + b.img.height - (a.y + a.img.height));
  for (const it of items) {
    const w = it.img.width * f;
    const h = it.img.height * f;
    let x0 = it.ax + (it.x - it.ax) * f;
    let y0 = it.ay + (it.y - it.ay) * f;
    const lim = Math.max(24 * f, w * 0.45);
    for (let n = 0; n < 12; n++) {
      const r = touche(x0, y0, w, h);
      if (!r) break;
      // d'abord un petit pas de côté (la bulle reste près de la tête), sinon au-dessus
      const pas = [r.x1 + 1 - x0, r.x0 - 1 - (x0 + w)].filter((d) => Math.abs(d) <= lim).sort((a, b) => Math.abs(a) - Math.abs(b));
      const d = pas.find((dx) => !touche(x0 + dx, y0, w, h));
      if (d !== undefined) {
        x0 += d;
        break;
      }
      y0 = r.y0 - h - 1;
    }
    it.x = it.ax + (x0 - it.ax) / f;
    it.y = it.ay + (y0 - it.ay) / f;
    occ.push({ x0, y0, x1: x0 + w, y1: y0 + h });
  }
}

function famille(m) {
  const s = String(m || '').toLowerCase();
  for (const f of ['haiku', 'sonnet', 'opus', 'fable']) if (s.includes(f)) return f;
  return null;
}

export class Directeur {
  constructor(store) {
    this.store = store;
    this.etageId = null;
    this.carte = null;
    this.couche = null;
    this.avatars = new Map();
    this.resa = new Map();
    this.postes = new Map();
    this.depots = new Set();
    this.partis = new Set();
    this.bulles = new Map();
    this.machine = new Map();
    this.reunions = [];
    this.nReunion = 0;
    this.glissements = [];
    this.syn = null;
    this.tableau = { dossier: null, visibles: 0, prochain: 0 };
    this.dgPlanJusqua = 0;
    this.dgVuBriefing = 0;
    this.asc = { ouverture: 0, jusqua: 0, sens: 0, sensJusqua: 0 };
    this.prochaineResolution = 0;
    this.selection = null;
    this.survol = null;
    this.visages = chargerVisages();
    this.looks = new Map();
    this.effets = [];
    this.descentes = new Map(); // tache -> { service, action, t0, fin } (agent parti au sous-sol)
    this.flashBaie = new Map();
    this.boitesServices = [];
    this.boiteTableau = null;
    // v1.5
    this.dernierePhrase = new Map(); // avatar -> instant de sa dernière phrase
    this.recuPensee = new Map(); // cible -> réception locale de la dernière pensée
    this.programme = []; // répliques à venir : { t, fn }
    this.prochainBavardage = 0;
    this.bavardageJusqua = new Map(); // pièce -> fin du bavardage en cours
    this.joyActe = null; // { fin, chute }
    this.joyProchain = 0;
    this.joyDerniere = 0;
    this.joyDites = new Set();
    this.faitsDits = new Set();
    store.ecouter((ev) => this.surEvenement(ev));
  }

  // ---------- identité des agents ----------
  sauverVisages() {
    try {
      localStorage.setItem(CLE_VISAGES, JSON.stringify(this.visages));
    } catch {
      /* stockage indisponible */
    }
  }

  graineAgent(id, prof = 0) {
    if (!id) return null;
    if (this.visages[id]) return this.visages[id];
    const a = this.store.equipe.get(id);
    if (a && a.cloneDe && prof < 6) return this.graineAgent(a.cloneDe, prof + 1);
    return id;
  }

  noterRecrue(agentId, tacheId) {
    if (!agentId || !tacheId || this.visages[agentId]) return;
    const a = this.store.equipe.get(agentId);
    if (a && a.cloneDe) return;
    this.visages[agentId] = tacheId;
    this.sauverVisages();
  }

  lookDe(av) {
    const S = this.store;
    let graine;
    let mod;
    let prenom = null;
    if (av.type === 'reserve') {
      const a = S.equipe.get(av.agentId);
      graine = this.graineAgent(av.agentId);
      mod = a ? a.modele : null;
      prenom = a ? a.prenom : null;
    } else if (av.type === 'agent' || av.type === 'visiteur') {
      const t = S.taches.get(av.tacheId);
      if (!t) return av.look || apparence(av.id, null, 'agent');
      graine = t.agent ? this.graineAgent(t.agent) : t.id;
      mod = t.modele;
      prenom = S.nom(t);
    } else if (av.type === 'dg' || av.type === 'joy') {
      return this.lookSpecial(av.type);
    } else return av.look;
    // skin choisi pour ce prénom (« Léa bis », le clone, garde celui de Léa)
    const skin = prenom ? S.personnalisation?.skins?.[prenom] || S.personnalisation?.skins?.[String(prenom).replace(/ bis$/, '')] || null : null;
    const k = graine + '|' + mod + '|' + (skin ? JSON.stringify(skin) : '');
    let L = this.looks.get(k);
    if (!L) {
      L = apparence(graine, mod, 'agent', skin);
      this.looks.set(k, L);
    }
    return L;
  }

  lookSpecial(type) {
    const skin = this.store.personnalisation?.skins?.['@' + type] || null;
    const k = '@' + type + '|' + (skin ? JSON.stringify(skin) : '');
    let L = this.looks.get(k);
    if (!L) {
      L = apparence(type, null, type, skin);
      this.looks.set(k, L);
    }
    return L;
  }

  // Avatar qui incarne un agent sur cet étage (réserve ou tâche en cours).
  avatarAgent(agentId) {
    if (!agentId) return null;
    for (const av of this.avatars.values()) if (av.agentId === agentId && av.type !== 'fantome' && !av.supprimer) return av;
    return null;
  }

  // Un visiteur de réunion tient-il déjà le rôle de cet agent sur l'étage ?
  represente(agentId) {
    if (!agentId) return false;
    for (const av of this.avatars.values()) if (av.agentRep === agentId && !av.supprimer && av.cat !== 'depart') return true;
    return false;
  }

  derniereTache(agentId) {
    let best = null;
    for (const t of this.store.taches.values()) {
      if (t.agent !== agentId) continue;
      if (!best || (t.fin || t.debut || 0) > (best.fin || best.debut || 0)) best = t;
    }
    return best;
  }

  // Un avatar provisoire s'efface (petit nuage) quand un agent de la réserve prend sa place.
  enFantome(av) {
    av.look = this.lookDe(av);
    this.avatars.delete(av.id);
    this.liberer(av);
    av.id = 'fan:' + av.id + ':' + Date.now();
    av.type = 'fantome';
    av.cat = 'depart';
    av.cle = 'fantome';
    av.chemin = [];
    av.fondu = -1;
    av.agentId = null;
    this.avatars.set(av.id, av);
    this.effets.push({ type: 'pouf', gx: av.gx, gy: av.gy, t0: Date.now() });
  }

  versAgent(av) {
    const t = this.store.taches.get(av.tacheId);
    const id = 'ag:' + (t && t.agent);
    if (!t || !t.agent || this.avatars.has(id)) {
      this.partir(av, false);
      return;
    }
    this.avatars.delete(av.id);
    this.liberer(av);
    if (this.selection === av.tacheId) this.selection = id;
    av.id = id;
    av.type = 'reserve';
    av.agentId = t.agent;
    av.tacheId = null;
    av.cat = null;
    av.cle = null;
    av.porteDossier = null;
    this.avatars.set(id, av);
  }

  versTache(av, tacheId) {
    const S = this.store;
    const t = S.taches.get(tacheId);
    const existant = this.avatars.get(tacheId);
    if (existant && existant !== av) this.enFantome(existant);
    this.avatars.delete(av.id);
    this.liberer(av);
    if (this.selection === av.id) this.selection = tacheId;
    av.id = tacheId;
    av.type = 'agent';
    av.tacheId = tacheId;
    av.cat = null;
    av.cle = null;
    this.avatars.set(tacheId, av);
    if (t && t.reembauche) this.dire(tacheId, { icone: 'dossier', texte: phrase('reembauche', tacheId) }, 5500, { phrase: true, force: true, parle: true });
  }

  // ---------- paroles ----------
  // Multiplicateur de durée des bulles (Réglages) : 1 = durées d'origine. Toutes les durées d'affichage
  // et les enchaînements de répliques passent par lui, pour laisser le temps de lire.
  mult() {
    const m = this.store.dureeBulles ? Number(this.store.dureeBulles()) : 1;
    return m > 0 ? m : 1;
  }

  // Bulle de parole temporaire. `phrase` : au plus une toutes les 6 s par avatar (sauf `force`).
  dire(id, opts, duree = 3800, { phrase: estPhrase = false, force = false, tier = 70, parle = false } = {}) {
    const now = Date.now();
    const m = this.mult();
    if (estPhrase && !force && now - (this.dernierePhrase.get(id) || 0) < PHRASE_DELAI * m) return false;
    if (estPhrase) this.dernierePhrase.set(id, now);
    this.bulles.set(id, { opts, jusqua: now + duree * m, t0: now, tier, parle });
    return true;
  }

  programmer(t, fn) {
    this.programme.push({ t, fn });
  }

  parleEncore(id, now) {
    const b = this.bulles.get(id);
    return !!b && now < b.jusqua;
  }

  zoneDe(av) {
    const c = this.carte;
    const x = Math.max(0, Math.min(c.W - 1, Math.floor(av.gx)));
    const y = Math.max(0, Math.min(c.H - 1, Math.floor(av.gy)));
    return c.zones[y][x];
  }

  // Prénom d'une tâche citée par sa ref (ou son id) dans une autre tâche.
  nomDe(t, r) {
    const S = this.store;
    const x = S.taches.get(r);
    return x ? S.nom(x) : S.nomRef(t.dossier, r);
  }

  // Avatars au repos (attente en salle de pause, réserve au salon), groupés par pièce.
  // Les dormeurs de la salle de repos n'en font pas partie : on ne bavarde pas en dormant.
  oisifs() {
    const S = this.store;
    const groupes = new Map();
    for (const av of this.avatars.values()) {
      if (!av.arrive || av.alpha < 0.9 || av.supprimer || av.chemin.length) continue;
      let ok = false;
      if (av.type === 'reserve') ok = av.cat === 'reserve';
      else if (av.type === 'agent' && (av.cat === 'pause' || av.cat === 'jeu')) {
        const t = S.taches.get(av.tacheId);
        ok = !!t && !estBloquee(t) && t.etat !== 'permission';
      }
      if (!ok) continue;
      const z = this.zoneDe(av);
      if (!groupes.has(z)) groupes.set(z, []);
      groupes.get(z).push(av);
    }
    return groupes;
  }

  mainLevee() {
    const S = this.store;
    for (const t of S.taches.values()) if (t.etage === this.etageId && t.etat === 'permission' && S.dossierActif(t.dossier)) return true;
    return false;
  }

  // Bavardages : deux ou trois répliques entre agents au repos dans la même pièce.
  majBavardages(now) {
    if (now < this.prochainBavardage) return;
    if (this.joyActe && now < this.joyActe.fin) return; // on écoute Joy
    const m = this.mult();
    const salle = this.estPause();
    // dans la salle de pause, il y a du monde : on y bavarde plus souvent
    this.prochainBavardage = now + (salle ? 4000 + Math.random() * 5000 : 7000 + Math.random() * 7000) * m;
    const S = this.store;
    const j = this.avatars.get('joy');
    const zoneJoy = j && j.cat === 'joy' ? this.zoneDe(j) : null;
    for (const [zone, avs] of this.oisifs()) {
      if (zone === zoneJoy || (this.bavardageJusqua.get(zone) || 0) > now) continue;
      const libres = avs.filter((a) => !this.parleEncore(a.id, now) && now - (this.dernierePhrase.get(a.id) || 0) > PHRASE_DELAI * m);
      if (libres.length < 2) continue;
      libres.sort(() => Math.random() - 0.5);
      const [a, b, c] = libres;
      const amb = (Array.isArray(S.bonheur && S.bonheur.ambiance) ? S.bonheur.ambiance : []).filter((x) => typeof x === 'string' && x.trim());
      // en salle de pause, une fois sur deux on parle du jeu en cours
      const jeu = salle && a.spot && SORTE_JEU[a.spot.activite] && Math.random() < 0.5 ? this.phrasesJeu(a.spot.activite, now) : [];
      const lignes = jeu.length ? jeu : amb.length ? amb : listePhrases('ambiance');
      const rep = listePhrases('reponsesBavardage');
      const i2 = Math.floor(Math.random() * rep.length);
      const i3 = (i2 + 1 + Math.floor(Math.random() * (rep.length - 1))) % rep.length;
      const ida = a.id;
      const idb = b.id;
      this.dire(ida, { texte: lignes[Math.floor(Math.random() * lignes.length)], max: 130, lignes: 3 }, 3200, { phrase: true, force: true, parle: true });
      this.programmer(now + 3000 * m, () => this.dire(idb, { texte: rep[i2] }, 2800, { phrase: true, force: true, parle: true }));
      let fin = now + 6000 * m;
      if (Math.random() < 0.6) {
        const idc = (c || a).id;
        this.programmer(now + 6200 * m, () => this.dire(idc, { texte: rep[i3] }, 2800, { phrase: true, force: true, parle: true }));
        fin = now + 9000 * m;
      }
      this.bavardageJusqua.set(zone, fin + 5000);
      break;
    }
  }

  // Salle de pause : de temps en temps, un joueur commente sa partie (« Gamelle ! », « Joli coup ! »).
  majJeux(now) {
    if (!this.estPause() || now < (this.prochainCri || 0)) return;
    const m = this.mult();
    this.prochainCri = now + (2500 + Math.random() * 3500) * m;
    if (this.joyActe && now < this.joyActe.fin) return;
    const joueurs = [...this.avatars.values()].filter((a) => a.type === 'agent' && a.cat === 'jeu' && a.arrive && !a.chemin.length && a.alpha > 0.9
      && a.spot && SORTE_JEU[a.spot.activite] && !this.parleEncore(a.id, now) && now - (this.dernierePhrase.get(a.id) || 0) > PHRASE_DELAI * m);
    if (!joueurs.length) return;
    const a = joueurs[Math.floor(Math.random() * joueurs.length)];
    const t = this.store.taches.get(a.tacheId);
    if (!t || estBloquee(t)) return;
    const l = this.phrasesJeu(a.spot.activite, now);
    if (l.length) this.dire(a.id, { texte: l[Math.floor(Math.random() * l.length)] }, 2600, { phrase: true, parle: true });
  }

  // Phrases d'une activité de la salle de pause. Devant la télé, elles suivent le programme à l'écran
  // (foot ou dessin animé) ; juste avant le changement de programme, une phrase qui va avec les deux.
  phrasesJeu(activite, now) {
    if (activite !== 'tele') return listePhrases(SORTE_JEU[activite]);
    if (resteProgrammeTele(now) < 3500 * this.mult() + 800 || Math.random() < 0.25) return listePhrases('jeuTele');
    return listePhrases(programmeTele(now) === 'foot' ? 'jeuTeleFoot' : 'jeuTeleDessin');
  }

  // ---------- salle de pause : chacun change d'activité de temps en temps ----------
  // Sans ça, chacun gardait sa première place jusqu'à son tour et la salle paraissait figée. Une « envie »
  // dure de 35 à 90 s ; ensuite l'agent va ailleurs : rejoindre quelqu'un qui joue seul, discuter avec un
  // joueur sans jouer, regarder la télé, prendre un café, l'arcade, les poufs, regarder une partie…
  placePause(av, now) {
    const jeu = this.carte.spots.jeu || [];
    const e = av.envie;
    if (e && this.resa.get(cle(e.spot)) === av.id) {
      // on ne part pas en pleine marche, en pleine phrase, ni pendant une blague de Joy
      const occupe = !av.arrive || av.chemin.length || this.parleEncore(av.id, now) || (this.joyActe && now < this.joyActe.fin);
      if (this._instant || now < e.jusqua || occupe) return e.spot;
      const n = this.nouvelleEnvie(av);
      if (n) {
        av.envie = { ...n, jusqua: now + dureeEnvie(!!n.visite) };
        return n.spot;
      }
      e.jusqua = now + 12000; // rien d'autre de libre : on réessaie un peu plus tard
      return e.spot;
    }
    // première place (ou place perdue) : la première libre, en formant d'abord des duos
    const s = this.reserver(av, jeu, [9.5, 6.5]);
    // première envie décalée d'un agent à l'autre : tout le monde ne se lève pas en même temps
    av.envie = { spot: s, jusqua: now + (e ? dureeEnvie() : 15000 + Math.random() * 45000) };
    return s;
  }

  nouvelleEnvie(av) {
    const jeu = this.carte.spots.jeu || [];
    const ici = av.envie && av.envie.spot;
    const ailleurs = (s) => !ici || cle(s) !== cle(ici);
    const libres = jeu.filter((s) => ailleurs(s) && this.libre(s, av));
    const auHasard = (l) => l[Math.floor(Math.random() * l.length)];
    // un autre agent installé à sa place de jeu (arrivé, pas en train de marcher)
    const installe = (s) => {
      const o = this.resa.get(cle(s));
      const a = o && o !== av.id ? this.avatars.get(o) : null;
      return a && a.type === 'agent' && a.cat === 'jeu' && a.arrive && !a.chemin.length ? a : null;
    };
    const choix = [];
    // 1. rejoindre quelqu'un qui joue seul : la place libre de la table la plus loin de lui (en face)
    const tables = new Map();
    for (const s of jeu) {
      if (!s.table) continue;
      if (!tables.has(s.table)) tables.set(s.table, { joueurs: [], libres: [], centre: s.centre });
      const tb = tables.get(s.table);
      const a = installe(s);
      if (a) tb.joueurs.push(a);
      else if (ailleurs(s) && this.libre(s, av)) tb.libres.push(s);
    }
    for (const tb of tables.values()) {
      if (tb.joueurs.length === 1 && tb.libres.length) {
        const j = tb.joueurs[0];
        const face = tb.libres.slice().sort((a, b) => Math.hypot(b.x - j.gx, b.y - j.gy) - Math.hypot(a.x - j.gx, a.y - j.gy))[0];
        choix.push({ poids: 4, spot: face, rejoint: j.id });
      } else if (!tb.joueurs.length && tb.libres.length >= 2) {
        // une table vide : on s'y installe en attendant qu'on vienne jouer avec nous
        choix.push({ poids: 1, spot: tb.libres[0] });
      } else if (tb.joueurs.length >= 2) {
        // 2. regarder une partie à deux, à une place de spectateur
        const spect = libres.filter((s) => s.activite === 'regarde' && s.centre && tb.centre && s.centre[0] === tb.centre[0] && s.centre[1] === tb.centre[1]);
        if (spect.length) choix.push({ poids: 1.5, spot: auHasard(spect) });
      }
    }
    // 3. discuter avec un joueur sans jouer : debout à côté de lui
    const joueurs = [...this.avatars.values()].filter((a) => a !== av && a.type === 'agent' && a.cat === 'jeu' && a.arrive && !a.chemin.length && a.spot && a.spot.table);
    if (joueurs.length) choix.push({ poids: 3, visite: auHasard(joueurs) });
    // 4. la télé ; 5. café, arcade, poufs
    const par = (act) => libres.filter((s) => s.activite === act);
    if (par('tele').length && !(ici && ici.activite === 'tele')) choix.push({ poids: 3, spot: auHasard(par('tele')) });
    for (const act of ['cafe', 'arcade', 'pouf']) if (par(act).length && !(ici && ici.activite === act)) choix.push({ poids: 1.2, spot: auHasard(par(act)) });
    if (!choix.length) return null;
    let r = Math.random() * choix.reduce((n, c) => n + c.poids, 0);
    let c = choix[choix.length - 1];
    for (const x of choix) {
      r -= x.poids;
      if (r < 0) {
        c = x;
        break;
      }
    }
    let spot = c.spot;
    if (c.visite) {
      const j = c.visite;
      spot = this.deboutLibre(av, [j.gx, j.gy], { rayon: 1.8 }) || this.deboutLibre(av, [j.gx, j.gy], { rayon: 3 });
    }
    if (!spot) return null;
    this.resa.set(cle(spot), av.id);
    return { spot, rejoint: c.rejoint || null, visite: c.visite ? c.visite.id : null };
  }

  // ---------- Joy, le happiness manager ----------
  groupePrefere() {
    let best = null;
    const salle = this.estPause();
    for (const [zone, avs] of this.oisifs()) {
      if (!salle && !['pause', 'lobby', 'open'].includes(zone)) continue;
      const score = avs.length + (zone === 'pause' ? 0.5 : 0);
      if (!best || score > best.score) best = { zone, avs, score };
    }
    if (!best) return null;
    const cx = best.avs.reduce((n, a) => n + a.gx, 0) / best.avs.length;
    const cy = best.avs.reduce((n, a) => n + a.gy, 0) / best.avs.length;
    return { zone: best.zone, avs: best.avs, centre: [cx, cy] };
  }

  cibleJoy(av, now) {
    const sp = this.carte.spots;
    if (etageJoy(this.store, now) !== this.etageId) return { cat: 'depart' };
    // pendant une blague, elle ne bouge pas
    if (this.joyActe && now < this.joyActe.fin && av.spot && av.cat === 'joy') return { cat: 'joy', spot: av.spot, cle: av.cle, centre: av.centre };
    // elle passe voir une personne, puis une autre : joueurs, agents à leur poste, et parfois le DG
    const p = this.personneVueParJoy(now);
    if (p) {
      const centre = [p.gx, p.gy];
      if (p.id === 'dg') {
        // devant le bureau du DG, comme un visiteur
        const v = (sp.visiteurDG || []).find((x) => this.libre(x, av));
        if (v) {
          this.resa.set(cle(v), av.id);
          return { cat: 'joy', spot: v, cle: 'joy:' + cle(v), centre };
        }
      }
      // debout, sur une case libre près d'elle (jamais sur un siège ni à la place de quelqu'un)
      const sp0 = this.deboutLibre(av, centre, { rayon: 3, garder: 1.6 });
      if (sp0) return { cat: 'joy', spot: sp0, cle: 'joy:' + cle(sp0), centre };
    }
    const g = this.groupePrefere();
    if (g) {
      const sp0 = this.deboutLibre(av, g.centre, { rayon: 4.5, garder: 2.5 });
      if (sp0) return { cat: 'joy', spot: sp0, cle: 'joy:' + cle(sp0), centre: g.centre };
    }
    // tournée : un arrêt toutes les 15 s
    const arrets = sp.tourJoy && sp.tourJoy.length ? sp.tourJoy : JOY_TOUR;
    const i = Math.floor(now / 15000) % arrets.length;
    const tour = [...arrets.slice(i), ...arrets.slice(0, i)];
    for (const x of tour) {
      if (!this.libre(x, av)) continue;
      this.resa.set(cle(x), av.id);
      return { cat: 'joy', spot: x, cle: 'joy:' + cle(x), centre: null };
    }
    const repli = this.deboutLibre(av, [tour[0].x + 0.5, tour[0].y + 0.5]);
    if (repli) return { cat: 'joy', spot: repli, cle: 'joy:' + cle(repli), centre: null };
    return { cat: 'joy', spot: av.spot || tour[0], cle: av.cle || 'joy:' + cle(tour[0]), centre: null };
  }

  // Agents au travail à leur poste (pas ceux qui attendent ta permission : on ne les dérange pas).
  auTravail() {
    const S = this.store;
    return [...this.avatars.values()].filter((a) => a.type === 'agent' && a.arrive && a.alpha > 0.9 && !a.chemin.length
      && (a.cat === 'poste' || a.cat === 'machine') && (S.taches.get(a.tacheId) || {}).etat !== 'permission');
  }

  // Le DG, s'il est à son bureau sur cet étage.
  dgPourJoy() {
    const dg = this.avatars.get('dg');
    return dg && dg.arrive && dg.alpha > 0.9 && !dg.chemin.length && this.store.dg.etage === this.etageId ? dg : null;
  }

  // Personne que Joy est en train de voir : la même pendant 20 à 30 s, puis une autre. Le DG de temps en
  // temps seulement (ou s'il est seul), le temps d'une blague.
  personneVueParJoy(now) {
    const gens = [...this.oisifs().values()].flat();
    for (const a of this.auTravail()) if (!gens.includes(a)) gens.push(a);
    const dg = this.dgPourJoy();
    const tous = dg ? [...gens, dg] : gens;
    if (!tous.length) return null;
    const v = this.joyVisite;
    const actuel = v && tous.find((a) => a.id === v.id);
    if (actuel && now < v.jusqua) return actuel;
    let choix;
    if (dg && (!gens.length || (Math.random() < 0.15 && (!v || v.id !== 'dg')))) choix = dg;
    else {
      const autres = gens.filter((a) => !v || a.id !== v.id);
      const pool = autres.length ? autres : gens;
      choix = pool[Math.floor(Math.random() * pool.length)];
    }
    const duree = choix === dg ? 14000 : JOY_VISITE[0] + Math.random() * (JOY_VISITE[1] - JOY_VISITE[0]);
    this.joyVisite = { id: choix.id, jusqua: now + duree };
    // nouvelle personne : la blague vient vite (le temps d'arriver)
    this.joyProchain = Math.min(this.joyProchain, now + 3000);
    return choix;
  }

  publicJoy(j, large = false) {
    const z = this.zoneDe(j);
    const dist = (a) => Math.hypot(a.gx - j.gx, a.gy - j.gy);
    // salle de pause : tous les joueurs à portée de voix, quel que soit leur coin
    const g = this.estPause() ? [...this.oisifs().values()].flat() : this.oisifs().get(z) || [];
    const proches = g.filter((a) => dist(a) < 5);
    // et les collègues au travail juste à côté, et le DG si elle est devant son bureau
    for (const a of this.auTravail()) if (dist(a) < 3.5 && !proches.includes(a)) proches.push(a);
    const dg = this.dgPourJoy();
    if (dg && dist(dg) < 3.5) proches.push(dg);
    proches.sort((a, b) => dist(a) - dist(b));
    if (proches.length || !large) return proches;
    // à la demande : les collègues les plus proches, même au travail
    return [...this.avatars.values()]
      .filter((a) => (a.type === 'agent' || a.type === 'reserve') && a.alpha > 0.9 && Math.hypot(a.gx - j.gx, a.gy - j.gy) < 8)
      .sort((a, b) => Math.hypot(a.gx - j.gx, a.gy - j.gy) - Math.hypot(b.gx - j.gx, b.gy - j.gy));
  }

  majJoy(now) {
    const j = this.avatars.get('joy');
    if (!j || j.cat !== 'joy' || !j.arrive || j.chemin.length) return;
    if (this.joyActe && now < this.joyActe.fin) return;
    this.joyActe = null;
    if (now < this.joyProchain) return;
    if (this.publicJoy(j).length && !this.mainLevee() && now - this.joyDerniere > JOY_ENTRE_BLAGUES) {
      this.raconter(false);
      return;
    }
    this.dire('joy', { icone: 'sourire', texte: phrase('joyPassage', now) }, 3000, { phrase: true, parle: true, tier: 80 });
    this.joyProchain = now + (15000 + Math.random() * 8000) * this.mult();
  }

  // Joy raconte une blague (ou une anecdote) ; les collègues réagissent. Renvoie { ok, raison }.
  raconter(demande = false, sorte = null) {
    const S = this.store;
    const now = Date.now();
    const m = this.mult();
    const nomJoy = S.nomJoy ? S.nomJoy() : 'Joy';
    const j = this.avatars.get('joy');
    if (!j || j.alpha < 0.5 || j.cat === 'depart') return { ok: false, raison: tr('{nom} est sur un autre étage.', { nom: nomJoy }) };
    if (this.mainLevee()) return { ok: false, raison: tr('Pas maintenant : quelqu’un lève la main.') };
    if (this.joyActe && now < this.joyActe.fin) return { ok: false, raison: tr('{nom} est déjà en train de raconter.', { nom: nomJoy }) };
    const B = S.bonheur || {};
    const blagues = (Array.isArray(B.blagues) ? B.blagues : []).filter((b) => b && typeof b.setup === 'string' && typeof b.chute === 'string');
    const faits = (Array.isArray(B.faits) ? B.faits : []).filter((x) => typeof x === 'string' && x.trim());
    const lb = blagues.length ? blagues : blaguesSecours();
    const lf = faits.length ? faits : faitsSecours();
    const fait = sorte ? sorte === 'fait' : !demande && Math.random() < 0.3;
    const reacteurs = this.publicJoy(j, demande).slice(0, 2).map((a) => a.id);
    this.reactions = { liste: listePhrases(fait ? 'reactionsFait' : 'reactionsBlague'), debut: Math.floor(Math.random() * 100), rire: Math.random() < 0.4 };
    const choisir = (n, dits) => {
      if (dits.size >= n) dits.clear();
      const restes = [...Array(n).keys()].filter((i) => !dits.has(i));
      const i = restes[Math.floor(Math.random() * restes.length)];
      dits.add(i);
      return i;
    };
    const opts = { phrase: true, force: true, parle: true, tier: 80 };
    let fin;
    // les durées (et donc tout l'enchaînement) suivent le réglage « durée des bulles »
    if (fait) {
      const f = lf[choisir(lf.length, this.faitsDits)];
      const d = Math.min(7500, 3200 + f.length * 35);
      this.dire('joy', { icone: 'sourire', texte: tr('Le saviez-vous ? {fait}', { fait: f }), max: 160, lignes: 4 }, d, opts);
      reacteurs.forEach((id, i) => this.programmer(now + (2600 + i * 900) * m, () => this.reagir(id, 'fait', i)));
      this.joyActe = { fin: now + d * m, chute: 0 };
      fin = now + d * m;
    } else {
      const b = lb[choisir(lb.length, this.joyDites)];
      const d1 = Math.min(5200, 2400 + b.setup.length * 30);
      const tChute = now + (d1 + 2000) * m; // la chute arrive après 2 s de suspense
      this.dire('joy', { icone: 'sourire', texte: b.setup, max: 160, lignes: 3 }, d1 + 2000, opts);
      this.programmer(tChute, () => this.dire('joy', { icone: 'fete', texte: b.chute, max: 160, lignes: 3 }, 4200, opts));
      reacteurs.forEach((id, i) => this.programmer(tChute + (1100 + i * 800) * m, () => this.reagir(id, 'blague', i)));
      this.joyActe = { fin: tChute + 4200 * m, chute: tChute };
      fin = tChute + 4200 * m;
    }
    this.joyDerniere = now;
    this.joyProchain = fin + JOY_ENTRE_BLAGUES;
    return { ok: true };
  }

  reagir(id, sorte, i) {
    const R = this.reactions || { liste: listePhrases(sorte === 'blague' ? 'reactionsBlague' : 'reactionsFait'), debut: 0, rire: false };
    const texte = R.liste[(R.debut + i) % R.liste.length];
    let opts;
    if (sorte === 'blague' && i === 0 && R.rire) opts = { icone: 'rire' }; // 😂 tout court
    else opts = sorte === 'blague' ? { icone: 'rire', texte } : { texte };
    this.dire(id, opts, 2400, { phrase: true, force: true, parle: true });
  }

  // ---------- étages partagés ----------
  estPause() {
    return !!this.carte && this.carte.type === 'pause';
  }
  estRepos() {
    return !!this.carte && this.carte.type === 'repos';
  }

  // Place debout libre (ni siège, ni place réservée par quelqu'un d'autre) près d'un point de la grille :
  // pour ceux qui n'ont plus de chaise, de lit ou de place de jeu. `garder` : l'avatar garde sa case
  // actuelle tant qu'elle est à moins de cette distance du point.
  deboutLibre(av, centre, { rayon = 6, garder = 0 } = {}) {
    const c = this.carte;
    const [cx, cy] = centre;
    if (av.spot && av.spot.dyn && this.resa.get(cle(av.spot)) === av.id) {
      const d = Math.hypot(av.spot.x + 0.5 - cx, av.spot.y + 0.5 - cy);
      if (d <= (garder || rayon)) return av.spot;
    }
    const app = c.spots.ascenseur.tuile;
    const prises = this.casesPrises();
    let best = null;
    for (let y = 0; y < c.H; y++) {
      for (let x = 0; x < c.W; x++) {
        if (!praticable(c, x, y) || (x === app.x && y === app.y)) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > rayon || d < 0.6) continue;
        const k = x + ',' + y;
        if (prises.has(k)) continue;
        const o = this.resa.get(k);
        if (o && o !== av.id && this.avatars.has(o)) continue;
        // une case réservée à une place connue (jeu, pause…) passe après les autres
        const score = d + (this.carte.casesPlaces && this.carte.casesPlaces.has(k) ? 3 : 0);
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    if (!best) return null;
    const s = { x: best.x, y: best.y, dir: dirVers(cx - (best.x + 0.5), cy - (best.y + 0.5)), dyn: true };
    this.resa.set(cle(s), av.id);
    return s;
  }

  // Cases où un autre avatar se tient déjà (ou va se tenir), en plus des réservations.
  casesPrises() {
    const out = new Set();
    for (const r of this.reunions) for (const s of r.sieges.values()) out.add(s.x + ',' + s.y);
    if (this.syn) for (const s of this.syn.participants.values()) out.add(s.x + ',' + s.y);
    return out;
  }

  // ---------- sous-sol : baies des services ----------
  estSousSol() {
    return !!(this.carte && this.carte.emplacementsServices && this.carte.emplacementsServices.length);
  }

  servicesSousSol() {
    const S = this.store;
    return [...S.services.values()].sort((a, b) => ((S.etage(b.etage) || {}).ordre || 0) - ((S.etage(a.etage) || {}).ordre || 0) || String(a.id).localeCompare(String(b.id)));
  }

  emplacementService(id) {
    if (!this.estSousSol()) return null;
    const i = this.servicesSousSol().findIndex((x) => x.id === id);
    return i >= 0 ? this.carte.emplacementsServices[i] || null : null;
  }

  // ---------- changement d'étage ----------
  setEtage(id) {
    const S = this.store;
    const etage = S.etage(id) || { id, nom: id, type: 'hall', ordre: 0 };
    this.etageId = id;
    this.etage = etage;
    this.carte = construireCarte(etage.decor || etage.type); // décor choisi (Réglages › Étages), sinon celui du type
    this.couche = construireCouche(this.carte, etage);
    // cases des places connues : les places « debout » improvisées les évitent si possible
    const sp = this.carte.spots;
    this.carte.casesPlaces = new Set();
    for (const l of [sp.arrivee, sp.equipe, sp.pause, sp.jeu, sp.lits, sp.fileDG, sp.visiteurDG, sp.reunion && sp.reunion.debout, sp.machine && sp.machine.file]) {
      for (const p of l || []) this.carte.casesPlaces.add(p.x + ',' + p.y);
    }
    this.prochainCri = Date.now() + 3000;
    this.avatars.clear();
    this.resa.clear();
    this.reunions = [];
    this.glissements = [];
    this.bulles.clear();
    this.effets = [];
    this.syn = null;
    this.programme = [];
    this.bavardageJusqua.clear();
    this.joyActe = null;
    this.joyProchain = Date.now() + 4000;
    const plan = this.planAffiche();
    this.tableau = { dossier: plan ? plan.dossier : null, visibles: plan ? plan.taches.length : 0, prochain: 0 };
    this.dgPlanJusqua = 0;
    const now = Date.now();
    for (const t of S.taches.values()) {
      if (t.etage === id && (t.etat === 'done' || t.etat === 'failed')) this.depots.add(t.id);
    }
    for (const p of S.passations) {
      const a = S.taches.get(p.a);
      if (a && a.etage === id && now - p.t < 12000) this.creerReunion(p, true);
    }
    this.resoudre(true);
  }

  ouvrirAscenseur(sens = 0) {
    const now = Date.now();
    this.asc.jusqua = now + 1700;
    this.asc.sens = sens;
    this.asc.sensJusqua = now + 1700;
  }

  // ---------- événements ----------
  surEvenement(ev) {
    if (!this.etageId) return;
    const S = this.store;
    const now = Date.now();
    switch (ev.type) {
      case 'outil': {
        const t = S.taches.get(ev.tache);
        if (estOutilMachine(ev.nom)) this.machine.set(ev.tache, now);
        if (t && t.etage === this.etageId) {
          // une vraie phrase si l'agent n'a rien dit depuis 6 s, sinon la petite bulle d'outil
          const ic = iconeOutil(ev.nom);
          // capture et image du web : assez rares pour mériter toujours leur phrase
          const marquant = /^mcp__qg__(capturer_page|telecharger_image)$/i.test(String(ev.nom || ''));
          const ok = this.dire(ev.tache, { icone: ic, texte: phraseOutil(ev.nom, ev.cible, ev.tache + '|' + (ev.seq || now)), max: 128 }, marquant ? 4500 : 3800, { phrase: true, force: marquant });
          if (!ok) this.dire(ev.tache, { icone: ic, texte: cibleCourte(ev.cible) || ev.nom }, 3000, { tier: 65 });
        }
        break;
      }
      case 'pensee':
        if (ev.cible) this.recuPensee.set(ev.cible, now);
        return;
      case 'bonheur':
        return;
      case 'activite':
        break;
      case 'agent': {
        const ag = ev.agent;
        // un clone est d'abord publié comme une recrue, puis avec cloneDe : il prend la tête de l'original
        if (ag && ag.cloneDe && this.visages[ag.id]) {
          delete this.visages[ag.id];
          this.sauverVisages();
        }
        if (ag && ag.tache && !ag.cloneDe && !ag.missions) {
          const t = S.taches.get(ag.tache);
          if (!t || !t.reembauche) this.noterRecrue(ag.id, ag.tache);
        }
        break;
      }
      case 'service_action': {
        const t = S.taches.get(ev.tache);
        this.descentes.set(ev.tache, { service: ev.service, action: ev.action, t0: now, fin: now + 14000 });
        if (t && t.etage === this.etageId) {
          const type = String(ev.service || '').split(':').pop() || tr('le serveur');
          this.dire(ev.tache, { icone: 'engrenage', texte: ev.action === 'arreter' ? tr('Je descends éteindre {service}', { service: type }) : tr('Je descends allumer {service}', { service: type }) }, 6000, { phrase: true, force: true });
        }
        break;
      }
      case 'service':
        if (ev.service) this.flashBaie.set(ev.service.id, now);
        break;
      case 'tache': {
        const t = ev.tache;
        const a = ev.transition ? ev.transition.a : t.etat;
        if (t.agent && !t.reembauche) this.noterRecrue(t.agent, t.id);
        // en salle de pause, celui dont le tour arrive le dit en partant
        if (this.estPause() && a === 'briefing' && this.avatars.has(t.id)) {
          this.dire(t.id, { texte: phrase('briefingAgent', t.id + '|pause') }, 2800, { phrase: true, force: true, parle: true });
        }
        if (t.etage === this.etageId || etageVisibleTache(S, t) === this.etageId) {
          const g = t.id + '|' + a + '|' + (t.tentative || 0);
          const de = ev.transition ? ev.transition.de : null;
          const fort = { phrase: true, force: true };
          if (a === 'briefing' && t.etage === this.etageId) this.dgVuBriefing = now;
          if (a !== 'done' && a !== 'failed') this.depots.delete(t.id);
          if (ev.transition && a !== de) {
            if (a === 'rework') this.dire(t.id, { icone: 'crayon', texte: phrase('rework', g) }, 5000, fort);
            else if (a === 'briefing') this.scenetteBriefing(t);
            else if (a === 'done') {
              const reserve = t.resultat && t.resultat.status === 'blocked';
              this.dire(t.id, { icone: reserve ? 'attente' : 'fete', texte: phrase(reserve ? 'bloque' : 'fini', g) }, 4200, fort);
            } else if (a === 'failed') this.dire(t.id, { texte: phrase('echec', g) }, 4500, fort);
            else if (a === 'waiting') {
              const noms = (t.attend || []).map((r) => this.nomDe(t, r));
              this.dire(t.id, { icone: 'cafe', texte: noms.length ? phrase('attente', g, { p: enumerer(noms.slice(0, 2)) }) : phrase('attenteSans', g) }, 4500, { phrase: true, parle: true });
            } else if (a === 'running' && de === 'permission') this.dire(t.id, { icone: 'page', texte: tr('Merci !') }, 2000, fort);
          }
        }
        break;
      }
      case 'plan': {
        const p = S.plans.get(ev.dossier);
        const affiche = this.planAffiche();
        if (p && affiche && affiche.dossier === ev.dossier) {
          this.tableau = { dossier: ev.dossier, visibles: 0, prochain: now + 500 };
          if (S.dg.etage === this.etageId) this.dgPlanJusqua = now + 2600 + p.taches.length * 380;
        }
        break;
      }
      case 'passation': {
        const a = S.taches.get(ev.a);
        if (a && a.etage === this.etageId) this.creerReunion({ de: ev.de || [], a: ev.a }, false);
        break;
      }
      case 'verification': {
        if (ev.phase === 'fin') {
          const m = ev.verdict === 'pass' ? 'ok' : 'ko';
          for (const id of ['insp:' + ev.tache, ev.tache]) {
            const av = this.avatars.get(id);
            if (av) av.marqueTemp = { nom: m, jusqua: now + 3200 };
          }
          if (this.avatars.has('insp:' + ev.tache)) {
            this.dire('insp:' + ev.tache, { icone: m === 'ok' ? 'presse' : 'crayon', texte: phrase(m === 'ok' ? 'verifOk' : 'verifKo', ev.tache + now) }, 3000, { phrase: true, force: true });
          }
        }
        break;
      }
      case 'etat':
        return;
      default:
    }
    this.prochaineResolution = 0;
  }

  scenetteBriefing(t) {
    const S = this.store;
    const now = Date.now();
    const g = t.id + '|brief';
    const m = this.mult();
    // le DG apparaît à la résolution suivante : on lui laisse un instant
    this.programmer(now + 500, () => {
      const dg = this.avatars.get('dg');
      if (dg) this.dire('dg', { icone: 'dossier', texte: phrase('briefingDg', g, { p: S.nom(t), t: sujet(t.titre) }), max: 140, lignes: 2 }, 3400, { phrase: true, force: true, parle: true });
    });
    this.programmer(now + 500 + 3100 * m, () => {
      const av = this.avatarDeTache(t.id);
      if (av) this.dire(av.id, { texte: phrase('briefingAgent', g) }, 2800, { phrase: true, force: true, parle: true });
    });
  }

  // ---------- plans au tableau ----------
  // Plan du tableau blanc : celui que tu as choisi en cliquant dessus, sinon le plus récent qui concerne
  // l'étage, sans les dossiers annulés (un dossier arrêté avant de démarrer ne prend plus la place).
  planAffiche() {
    const S = this.store;
    const choisi = S.tableauChoisi(this.etageId);
    if (choisi && S.plans.has(choisi)) return S.plans.get(choisi);
    let best = null;
    let dernier = null;
    for (const p of S.plans.values()) {
      const d = S.dossiers.get(p.dossier);
      if (!d || d.etat === 'annule') continue;
      if (!dernier || p.t > dernier.t) dernier = p;
      if (!p.taches.some((t) => t.etage === this.etageId)) continue;
      if (!best || p.t > best.t) best = p;
    }
    if (!best && (this.etage?.type === 'direction' || S.dg.etage === this.etageId)) best = dernier;
    return best;
  }

  // ---------- présence du DG ----------
  dgPresent(now) {
    const S = this.store;
    if (S.dg.etage === this.etageId) return true;
    for (const t of S.taches.values()) {
      if (t.etage === this.etageId && t.etat === 'briefing') {
        this.dgVuBriefing = now;
        return true;
      }
    }
    return now - this.dgVuBriefing < 6000;
  }

  // ---------- réunions (passation) ----------
  // Sièges de la salle de réunion : une place par personne, jamais deux sur la même chaise, même quand
  // plusieurs passations (et la synthèse) se tiennent en même temps. Un agent qui porte plusieurs des
  // tâches n'occupe qu'une place. S'il n'y a plus de chaise, on reste debout autour de la table.
  placerReunion(ids, ordres, prises) {
    const S = this.store;
    const sp = this.carte.spots.reunion;
    const sieges = new Map();
    const vus = new Set();
    const prendre = (liste) => {
      for (const s of liste || []) {
        if (prises.has(cle(s))) continue;
        prises.add(cle(s));
        return s;
      }
      return null;
    };
    ids.forEach((tid, i) => {
      const t = S.taches.get(tid);
      const qui = t && t.agent ? 'ag:' + t.agent : 't:' + tid;
      if (vus.has(qui)) return;
      vus.add(qui);
      const s = prendre(ordres(i)) || prendre(sp.debout);
      if (s) sieges.set(tid, s);
    });
    return sieges;
  }

  // Places déjà occupées par les autres réunions (et la synthèse) de l'étage.
  siegesPris(sauf = null) {
    const pris = new Set();
    for (const r of this.reunions) if (r !== sauf) for (const s of r.sieges.values()) pris.add(cle(s));
    if (this.syn && this.syn !== sauf) for (const s of this.syn.participants.values()) pris.add(cle(s));
    return pris;
  }

  // Visiteur venu d'un autre étage (ou de la salle de repos) pour une réunion ; un par personne.
  inviter(tid, instant, n) {
    const S = this.store;
    const t = S.taches.get(tid);
    if (!t) return false;
    if (this.avatars.has(tid) && t.etage === this.etageId) return false;
    if (t.agent && this.avatarAgent(t.agent)) return false;
    if (t.agent && [...this.avatars.values()].some((a) => a.agentRep === t.agent && !a.supprimer)) return false;
    const vid = 'vis:' + tid;
    if (this.avatars.has(vid)) return false;
    const av = this.nouvelAvatar(vid, 'visiteur', tid, instant);
    av.agentRep = t.agent || null;
    if (!instant) this.differer(av, n * 900);
    this.avatars.set(vid, av);
    return true;
  }

  creerReunion(p, instant) {
    const now = Date.now();
    if (this.reunions.some((r) => r.a === p.a)) return;
    const sp = this.carte.spots.reunion;
    const de = (p.de || []).slice();
    const r = { id: 'R' + ++this.nReunion, a: p.a, de, sieges: new Map(), debut: now, phase: 'rassemblement', tPhase: now, glisse: [] };
    // celui qui reçoit côté sud, les amonts côté nord ; ensuite n'importe quelle chaise libre, puis debout
    r.sieges = this.placerReunion([p.a, ...de], (i) => (i === 0 ? [...sp.sud, ...sp.est, ...sp.nord] : [...sp.nord, ...sp.est, ...sp.sud]), this.siegesPris(r));
    this.reunions.push(r);
    let n = 0;
    for (const d of de) if (r.sieges.has(d) && this.inviter(d, instant, n)) n++;
  }
  reunionDe(tid) {
    return this.reunions.find((r) => r.a === tid || r.de.includes(tid)) || null;
  }
  avatarDeTache(tid) {
    const t = this.store.taches.get(tid);
    const direct = this.avatars.get(tid) || this.avatars.get('vis:' + tid) || (t && t.agent ? this.avatars.get('ag:' + t.agent) : null);
    if (direct) return direct;
    if (!t || !t.agent) return null;
    // même agent, autre tâche (ou visiteur qui le représente)
    for (const av of this.avatars.values()) if (!av.supprimer && av.type !== 'fantome' && (av.agentId === t.agent || av.agentRep === t.agent)) return av;
    return null;
  }

  syntheseActive() {
    const S = this.store;
    const dg = S.dg;
    if (!(dg.action === 'synthese' && dg.etage === this.etageId && dg.dossier)) {
      this.syn = null;
      return null;
    }
    if (this.syn && this.syn.dossier === dg.dossier) return this.syn;
    const sp = this.carte.spots.reunion;
    const taches = [...S.taches.values()].filter((t) => t.dossier === dg.dossier && t.etat !== 'cancelled' && t.etat !== 'skipped');
    this.syn = null;
    const participants = this.placerReunion(taches.map((t) => t.id), () => [...sp.nord, ...sp.sud, ...sp.est], this.siegesPris(null));
    this.syn = { dossier: dg.dossier, participants };
    let n = 0;
    for (const t of taches) if (participants.has(t.id) && this.inviter(t.id, this._instant, n)) n++;
    return this.syn;
  }

  // ---------- avatars ----------
  nouvelAvatar(id, type, tacheId, instant) {
    const S = this.store;
    const t = tacheId ? S.taches.get(tacheId) : null;
    let look;
    if (type === 'dg' || type === 'joy') look = this.lookSpecial(type);
    else if (type === 'inspecteur') {
      const v = S.verifs.get(tacheId);
      const m = (v && v.verificateur && v.verificateur.modele) || (t && t.verif && t.verif.modele) || 'opus';
      look = apparence('insp' + tacheId, m, 'inspecteur');
    } else look = apparence(tacheId, t ? t.modele : null, 'agent');
    const a = this.carte.spots.ascenseur.apparition;
    const av = {
      id, type, tacheId, look, gx: a.gx, gy: a.gy, dir: 'se', chemin: [], cat: null, cle: null, spot: null,
      arrive: !!instant, alpha: instant ? 1 : 0, fondu: instant ? 0 : 1, versAsc: false, porteDossier: null,
      anim: null, marqueTemp: null, supprimer: false, phase: Math.floor(Math.random() * 10000), pas: 0, minuteur: null,
    };
    if (!instant) this.asc.jusqua = Math.max(this.asc.jusqua, Date.now() + 1500);
    return av;
  }

  // Fait patienter un avatar dans l'ascenseur avant son apparition (arrivées échelonnées).
  differer(av, ms) {
    if (ms <= 0) return;
    av.retard = Date.now() + ms;
    av.alpha = 0;
    av.fondu = 0;
  }

  // Réserve la première place libre de la liste (en gardant la sienne si on l'a déjà). Quand tout est pris,
  // on reste debout sur une case libre voisine : jamais deux avatars sur la même place.
  reserver(av, liste, centre = null) {
    if (av.spot) {
      const k = cle(av.spot);
      if (this.resa.get(k) === av.id && liste.some((s) => cle(s) === k)) return liste.find((s) => cle(s) === k);
    }
    for (const s of liste) {
      const k = cle(s);
      const o = this.resa.get(k);
      if (!o || o === av.id || !this.avatars.has(o)) {
        this.resa.set(k, av.id);
        return s;
      }
    }
    const der = liste[liste.length - 1];
    const c = centre || (der ? [der.x + 0.5, der.y + 0.5] : [av.gx, av.gy]);
    return this.deboutLibre(av, c, { rayon: 8 }) || this.deboutLibre(av, c, { rayon: 30 }) || der;
  }
  liberer(av) {
    if (av.spot) {
      const k = cle(av.spot);
      if (this.resa.get(k) === av.id) this.resa.delete(k);
    }
  }
  libre(spot, av) {
    const o = this.resa.get(cle(spot));
    return !o || o === av.id || !this.avatars.has(o);
  }

  posteDe(t, av) {
    const postes = this.carte.spots.postes;
    const c = this.postes.get(t.id);
    let p = c && postes.find((x) => x.cle === c);
    if (p && this.libre(p.chaise, av)) return p;
    const prefFerme = t.modele === 'opus' || t.modele === 'fable';
    const libres = postes.filter((x) => this.libre(x.chaise, av));
    libres.sort((a, b) => (prefFerme ? (b.ferme ? 1 : 0) - (a.ferme ? 1 : 0) : (a.ferme ? 1 : 0) - (b.ferme ? 1 : 0)));
    p = libres[0];
    if (!p) {
      // tous les postes sont pris : il travaille debout, près de l'îlot (sa place à lui, pas la chaise d'un autre)
      const ilot = postes.find((x) => !x.ferme) || postes[0];
      const centre = ilot ? [ilot.bureau.x + 1, ilot.bureau.y + 0.5] : [av.gx, av.gy];
      const s = this.deboutLibre(av, centre, { rayon: 7 }) || this.deboutLibre(av, centre, { rayon: 30 });
      if (s) return { cle: 'debout:' + cle(s), chaise: s, bureau: null, insp: null, ferme: false, debout: true };
      p = postes[0];
      if (!p) return { cle: 'ici', chaise: { x: Math.floor(av.gx), y: Math.floor(av.gy), dir: av.dir }, bureau: null, insp: null, ferme: false, debout: true };
    }
    this.postes.set(t.id, p.cle);
    return p;
  }

  utiliseMachine(t, av, now) {
    let dernier = this.machine.get(t.id) || 0;
    if (!dernier && t.dernierOutil && estOutilMachine(t.dernierOutil.nom)) dernier = t.derniereActivite || now;
    return now - dernier < 30000 && this.libre(this.carte.spots.machine.chaise, av);
  }

  fileMachine(t) {
    return /studio|unreal|editeur|éditeur|rendu|station|occup/i.test(t.motifFile || '');
  }

  categorieAgent(t, av, now) {
    const S = this.store;
    const e = t.etat;
    const pause = !!S.ordonnanceur.pause;
    const ag = t.agent ? S.equipe.get(t.agent) : null;
    // v1.3 : l'agent qui a fini rejoint la réserve ; elle dort dans la salle de repos quand l'immeuble en a une
    // (il quitte alors l'étage), sinon il reste au salon de l'étage. Il part aussi s'il passe à la retraite.
    const apres = () => (ag ? (ag.etat === 'retire' || etageVisibleAgent(S, ag) !== this.etageId ? 'depart' : 'reserve') : null);
    const repos = !!etageDeType(S, 'repos');
    if (e === 'cancelled' || e === 'skipped') return apres() || 'depart';
    if (e === 'done' || e === 'failed') {
      if (!this.depots.has(t.id)) return 'depot';
      // attendu à une passation : il patiente sur place, sauf s'il va dormir (on viendra le chercher)
      if (e === 'done' && S.attenduEnReunion(t) && !(repos && ag)) return 'pause';
      const r = apres();
      if (r) return r;
      if (e === 'failed') return S.dossierActif(t.dossier) ? (pause ? 'pause' : 'poste') : 'depart';
      return 'depart';
    }
    if (pause) return 'pause';
    switch (e) {
      case 'planned':
      case 'ready':
        return 'arrivee';
      case 'waiting':
        return 'pause';
      case 'queued':
        // bloquée (amont en échec) : elle patiente en salle de pause plutôt que dans la file
        if (estBloquee(t)) return 'pause';
        return this.fileMachine(t) ? 'fileMachine' : 'file';
      case 'briefing':
        return 'visiteur';
      case 'running':
      case 'permission':
      case 'rework':
      case 'verifying':
      case 'interrupted':
        return av && this.utiliseMachine(t, av, now) ? 'machine' : 'poste';
      default:
        return 'arrivee';
    }
  }

  // Un agent en réserve est-il attendu à une réunion (passation récente, synthèse) ? Il quitte alors son lit.
  reunionAilleursAgent(agentId, now) {
    const S = this.store;
    for (const p of S.passations) {
      if (now - p.t > 15000) continue;
      for (const d of p.de) {
        const td = S.taches.get(d);
        if (td && td.agent === agentId) return true;
      }
    }
    const dg = S.dg;
    if (dg.action === 'synthese' && dg.dossier && dg.etage !== this.etageId) {
      for (const t of S.taches.values()) if (t.dossier === dg.dossier && t.agent === agentId && t.etat !== 'cancelled' && t.etat !== 'skipped') return true;
    }
    return false;
  }

  reunionAilleurs(tid, now) {
    const S = this.store;
    for (const p of S.passations) {
      if (now - p.t > 15000) continue;
      if (!p.de.includes(tid)) continue;
      const a = S.taches.get(p.a);
      if (a && a.etage !== this.etageId) return true;
    }
    return false;
  }

  cible(av, files, now) {
    const S = this.store;
    const sp = this.carte.spots;
    if (av.type === 'dg') {
      if (!this.dgPresent(now)) return { cat: 'depart' };
      const dg = S.dg;
      if (dg.action === 'synthese' && dg.etage === this.etageId) return { cat: 'dg', spot: sp.reunion.tete, cle: 'dg:tete' };
      if (now < this.dgPlanJusqua) return { cat: 'dg', spot: sp.dg.tableau, cle: 'dg:tableau' };
      return { cat: 'dg', spot: sp.dg.siege, cle: 'dg:siege' };
    }
    if (av.type === 'joy') return this.cibleJoy(av, now);
    if (av.type === 'reserve') {
      const a = S.equipe.get(av.agentId);
      if (!a || a.etat === 'retire') return { cat: 'depart' };
      if (this.estRepos()) {
        // salle de repos : un lit chacun ; réembauché, il se lève et part travailler
        if (etageVisibleAgent(S, a) !== this.etageId) return { cat: 'depart' };
        if (this.reunionAilleursAgent(a.id, now)) return { cat: 'depart' };
        const s = this.reserver(av, sp.lits || [], [8, 3.5]);
        return { cat: 'dodo', spot: s, cle: 'dodo:' + cle(s) };
      }
      if (etageVisibleAgent(S, a) !== this.etageId) return { cat: 'depart' };
      if (a.etat === 'occupe' && a.tache) {
        const ta = S.taches.get(a.tache);
        if (ta && ta.etage === this.etageId && !TERMINAUX.has(ta.etat)) return { cat: 'versTache', tache: ta.id };
      }
      for (const r of this.reunions) {
        for (const d of r.de) {
          const td = S.taches.get(d);
          if (td && td.agent === av.agentId && r.sieges.get(d)) return { cat: 'reunion', spot: r.sieges.get(d), cle: 'reu:' + r.id };
        }
      }
      const syn = this.syntheseActive();
      if (syn) {
        for (const [tid, siege] of syn.participants) {
          const td = S.taches.get(tid);
          if (td && td.agent === av.agentId) return { cat: 'reunion', spot: siege, cle: 'syn:' + syn.dossier };
        }
      }
      const s = this.reserver(av, sp.equipe);
      return { cat: 'reserve', spot: s, cle: 'eq:' + cle(s) };
    }
    const t = S.taches.get(av.tacheId);
    if (!t) return { cat: 'depart' };
    if (av.type === 'visiteur' && String(av.id).startsWith('srv:')) {
      const d = this.descentes.get(t.id);
      const e = d && this.emplacementService(d.service);
      if (!d || !e || now > d.t0 + 11000) return { cat: 'depart' };
      return { cat: 'baie', spot: e.devant, cle: 'baie:' + d.service };
    }
    if (av.type === 'visiteur') {
      const r = this.reunionDe(t.id);
      if (r && r.sieges.get(t.id)) return { cat: 'reunion', spot: r.sieges.get(t.id), cle: 'reu:' + r.id };
      const syn = this.syntheseActive();
      if (syn && syn.participants.get(t.id)) return { cat: 'reunion', spot: syn.participants.get(t.id), cle: 'syn:' + syn.dossier };
      return { cat: 'depart' };
    }
    if (av.type === 'inspecteur') {
      const v = S.verifs.get(t.id);
      const actif = t.etat === 'verifying' && (!v || v.phase === 'debut');
      const prod = this.avatars.get(t.id);
      if (!actif || !prod) {
        if (av.marqueTemp && now < av.marqueTemp.jusqua && av.spot) return { cat: av.cat, spot: av.spot, cle: av.cle };
        return { cat: 'depart' };
      }
      if (prod.cat === 'machine') return { cat: 'insp', spot: sp.machine.insp, cle: 'insp:machine' };
      if (prod.cat === 'pause') {
        const s = this.reserver(av, sp.pause);
        return { cat: 'pause', spot: s, cle: 'pause:' + cle(s) };
      }
      const p = this.posteDe(t, prod);
      if (!p.insp) {
        // producteur debout (plus de poste libre) : l'inspecteur se tient à côté de lui
        const s = this.deboutLibre(av, [prod.gx, prod.gy], { rayon: 3 }) || this.deboutLibre(av, [prod.gx, prod.gy], { rayon: 30 });
        if (s) return { cat: 'insp', spot: s, cle: 'insp:' + cle(s) };
        return { cat: 'depart' };
      }
      return { cat: 'insp', spot: p.insp, cle: 'insp:' + p.cle };
    }
    // agent
    if (etageVisibleTache(S, t) !== this.etageId) return { cat: 'depart' };
    if (this.estPause()) {
      // salle de pause : une place de jeu chacun (billard, baby-foot, canapé…), debout s'il n'y en a plus,
      // et de temps en temps on change d'activité (placePause)
      const s = this.placePause(av, now);
      return { cat: 'jeu', spot: s, cle: 'jeu:' + cle(s) };
    }
    const desc = this.descentes.get(t.id);
    if (desc && now < desc.fin) return { cat: 'depart' };
    const r = this.reunionDe(t.id);
    if (r && r.sieges.get(t.id)) return { cat: 'reunion', spot: r.sieges.get(t.id), cle: 'reu:' + r.id };
    const syn = this.syntheseActive();
    if (syn && syn.participants.get(t.id)) return { cat: 'reunion', spot: syn.participants.get(t.id), cle: 'syn:' + syn.dossier };
    if (this.reunionAilleurs(t.id, now)) return { cat: 'depart' };
    const cat = this.categorieAgent(t, av, now);
    switch (cat) {
      case 'depart':
        return { cat };
      case 'reserve':
        return { cat: 'versAgent' };
      case 'arrivee': {
        const s = this.reserver(av, sp.arrivee);
        return { cat, spot: s, cle: 'arr:' + cle(s) };
      }
      case 'pause': {
        const s = this.reserver(av, sp.pause);
        return { cat, spot: s, cle: 'pause:' + cle(s) };
      }
      case 'file':
      case 'fileMachine': {
        const liste = cat === 'file' ? files.dg : files.machine;
        const places = cat === 'file' ? sp.fileDG : sp.machine.file;
        const i = Math.max(0, liste.indexOf(av));
        const s = places[Math.min(i, places.length - 1)];
        return { cat, spot: s, cle: cat + ':' + i };
      }
      case 'visiteur':
      case 'depot': {
        const s = this.reserver(av, sp.visiteurDG);
        return { cat, spot: s, cle: cat + ':' + cle(s) };
      }
      case 'machine': {
        const m = sp.machine;
        this.resa.set(cle(m.chaise), av.id);
        return { cat, spot: m.chaise, cle: 'machine' };
      }
      default: {
        const p = this.posteDe(t, av);
        this.resa.set(cle(p.chaise), av.id);
        return { cat: 'poste', spot: p.chaise, cle: 'poste:' + p.cle, poste: p };
      }
    }
  }

  resoudre(instant = false) {
    const S = this.store;
    const now = Date.now();
    this._instant = instant;
    // arrivées échelonnées : pas tout le monde dans l'ascenseur au même instant
    let nArrivees = 0;
    const echelonner = (av) => {
      if (!instant) this.differer(av, nArrivees++ * 700);
    };
    // 1. agents présents (une tâche = un avatar ; l'agent qui la porte garde sa tête)
    for (const t of S.taches.values()) {
      if (etageVisibleTache(S, t) !== this.etageId) continue;
      if (this.estPause()) {
        // salle de pause : un avatar par tâche qui attend son tour
        if (!this.avatars.has(t.id)) {
          const nv = this.nouvelAvatar(t.id, 'agent', t.id, instant);
          nv.agentId = t.agent || null;
          echelonner(nv);
          this.avatars.set(t.id, nv);
        }
        continue;
      }
      const desc = this.descentes.get(t.id);
      if (desc && now < desc.fin) continue;
      let av = this.avatars.get(t.id);
      if (av && t.agent && av.agentId !== t.agent) {
        const ag = S.equipe.get(t.agent);
        const source = t.reembauche ? this.avatarAgent(t.agent) : null;
        const origine = t.reembauche && ag && ag.cloneDe ? this.avatarAgent(ag.cloneDe) : null;
        if (!av.agentId && t.reembauche && (source || origine) && !instant) {
          this.enFantome(av);
          av = null;
        } else {
          av.agentId = t.agent;
          continue;
        }
      }
      if (av) continue;
      // déjà représenté par un visiteur de réunion : pas de second avatar sur la même chaise
      if (this.avatars.has('vis:' + t.id)) continue;
      if (this.partis.has(t.id) && t.etat === 'done') continue;
      if (t.agent && this.avatarAgent(t.agent)) continue; // la réserve le rejoindra (versTache)
      if (t.agent && t.reembauche && !instant && !TERMINAUX.has(t.etat)) {
        const ag = S.equipe.get(t.agent);
        const origine = ag && ag.cloneDe ? this.avatarAgent(ag.cloneDe) : null;
        if (origine) {
          // clone : un double apparaît à côté de l'original
          const c = this.nouvelAvatar(t.id, 'agent', t.id, true);
          c.agentId = t.agent;
          c.gx = origine.gx + 0.42;
          c.gy = origine.gy + 0.08;
          c.alpha = 0;
          c.fondu = 1;
          c.etiquetteTemp = { source: ag.cloneDe, jusqua: now + 9000 };
          this.avatars.set(t.id, c);
          this.effets.push({ type: 'copie', gx: c.gx, gy: c.gy, t0: now });
          this.effets.push({ type: 'copie', gx: origine.gx, gy: origine.gy, t0: now });
          this.dire(t.id, { icone: 'dossier', texte: phrase('reembauche', t.id) }, 5500, { phrase: true, force: true, parle: true });
          continue;
        }
      }
      let cat = this.categorieAgent(t, null, now);
      if (this.reunionDe(t.id)) cat = 'reunion';
      if (this.syntheseActive() && this.syn.participants.has(t.id)) cat = 'reunion';
      if (cat === 'depart' || cat === 'reserve') continue;
      const nv = this.nouvelAvatar(t.id, 'agent', t.id, instant);
      nv.agentId = t.agent || null;
      this.avatars.set(t.id, nv);
      // un agent réembauché qui sort de la salle de repos : il le dit en arrivant
      if (!instant && t.reembauche && !TERMINAUX.has(t.etat) && etageDeType(S, 'repos')) {
        this.dire(t.id, { icone: 'dossier', texte: phrase('reembauche', t.id) }, 5500, { phrase: true, force: true, parle: true });
      }
    }
    // 1b. réserve : les agents disponibles (salle de repos, ou salon de leur étage sans salle de repos)
    const repos = this.estRepos();
    for (const a of S.equipe.values()) {
      if (this.avatarAgent(a.id) || this.represente(a.id)) continue;
      if (repos) {
        if (etageVisibleAgent(S, a) !== this.etageId || this.reunionAilleursAgent(a.id, now)) continue;
      } else if (a.etat !== 'disponible' || etageVisibleAgent(S, a) !== this.etageId) continue;
      const av = this.nouvelAvatar('ag:' + a.id, 'reserve', null, instant);
      av.agentId = a.id;
      if (repos) echelonner(av);
      this.avatars.set(av.id, av);
    }
    // 1c. sous-sol : l'agent qui vient allumer ou éteindre une baie
    if (this.estSousSol()) {
      for (const [tid, d] of this.descentes) {
        if (now > d.t0 + 11000 || this.avatars.has('srv:' + tid) || !S.taches.get(tid) || !this.emplacementService(d.service)) continue;
        if (instant && now > d.t0 + 8000) continue;
        const av = this.nouvelAvatar('srv:' + tid, 'visiteur', tid, instant);
        if (!instant) this.differer(av, Math.max(0, d.t0 + 2600 - now));
        this.avatars.set(av.id, av);
      }
    }
    for (const [tid, d] of this.descentes) if (now > d.fin + 2000) this.descentes.delete(tid);
    // 2. inspecteurs
    for (const t of S.taches.values()) {
      if (t.etage !== this.etageId || t.etat !== 'verifying') continue;
      const v = S.verifs.get(t.id);
      // une validation qui t'attend n'a pas de vérificateur IA à côté de l'agent (sa bulle dit qu'il t'attend)
      const parToi = (v && v.verificateur && v.verificateur.modele === 'toi') || (t.verif && t.verif.mode === 'user');
      const parAgent = !parToi && (v ? v.phase === 'debut' : t.verif && t.verif.mode === 'agent');
      if (!parAgent || !this.avatars.has(t.id) || this.avatars.has('insp:' + t.id)) continue;
      this.avatars.set('insp:' + t.id, this.nouvelAvatar('insp:' + t.id, 'inspecteur', t.id, instant));
    }
    // 3. DG
    if (this.dgPresent(now) && !this.avatars.has('dg')) {
      const dg = this.nouvelAvatar('dg', 'dg', null, instant || S.dg.etage !== this.etageId);
      dg.visite = S.dg.etage !== this.etageId;
      if (S.dg.etage !== this.etageId && !instant) {
        const s = this.carte.spots.dg.siege;
        dg.gx = s.x + 0.5;
        dg.gy = s.y + 0.5;
        dg.alpha = 0;
        dg.fondu = 1;
        dg.arrive = true;
      }
      this.avatars.set('dg', dg);
    }
    const dgAv = this.avatars.get('dg');
    if (dgAv && S.dg.etage === this.etageId) dgAv.visite = false;
    // 3b. Joy, si c'est son étage
    if (etageJoy(S, now) === this.etageId && !this.avatars.has('joy')) this.avatars.set('joy', this.nouvelAvatar('joy', 'joy', null, instant));
    // 4. synthèse (crée les visiteurs)
    this.syntheseActive();
    // 5. files d'attente ordonnées
    const files = { dg: [], machine: [] };
    for (const av of this.avatars.values()) {
      if (av.type !== 'agent') continue;
      const t = S.taches.get(av.tacheId);
      if (t && t.etat === 'queued' && !estBloquee(t) && !S.ordonnanceur.pause) (this.fileMachine(t) ? files.machine : files.dg).push(av);
    }
    const ordre = (a, b) => (S.fileDepuis.get(a.tacheId) || 0) - (S.fileDepuis.get(b.tacheId) || 0);
    files.dg.sort(ordre);
    files.machine.sort(ordre);
    // 6. cibles
    const conversions = [];
    for (const av of this.avatars.values()) {
      if (av.supprimer || av.type === 'fantome') continue;
      const v = this.cible(av, files, now);
      if (v.cat === 'versAgent' || v.cat === 'versTache') conversions.push([av, v]);
      else if (v.cat === 'depart') {
        if (av.cat !== 'depart') this.partir(av, instant);
      } else if (v.cle !== av.cle) {
        this.deplacer(av, v, instant);
      }
    }
    for (const [av, v] of conversions) {
      if (v.cat === 'versAgent') this.versAgent(av);
      else this.versTache(av, v.tache);
      const v2 = this.cible(av, files, now);
      if (v2.cat === 'depart') this.partir(av, instant);
      else if (v2.cat !== 'versAgent' && v2.cat !== 'versTache' && v2.cle !== av.cle) this.deplacer(av, v2, instant);
    }
    this._instant = false;
  }

  tuileDe(av) {
    return { x: Math.max(0, Math.min(this.carte.W - 1, Math.floor(av.gx))), y: Math.max(0, Math.min(this.carte.H - 1, Math.floor(av.gy))) };
  }

  deplacer(av, v, instant) {
    const ancienne = av.cat;
    if (av.spot && (!v.spot || cle(av.spot) !== cle(v.spot))) this.liberer(av);
    av.cat = v.cat;
    av.cle = v.cle;
    av.spot = v.spot;
    av.centre = v.centre || null;
    av.versAsc = false;
    if (av.alpha < 1) av.fondu = 1;
    if (instant) {
      av.gx = v.spot.x + 0.5;
      av.gy = v.spot.y + 0.5;
      av.dir = v.spot.dir;
      av.chemin = [];
      av.arrive = true;
      av.alpha = 1;
      av.fondu = 0;
      if (av.cat === 'depot') {
        const t = this.store.taches.get(av.tacheId);
        if (t) this.depots.add(t.id);
      }
      return;
    }
    if (av.type === 'agent') {
      const t = this.store.taches.get(av.tacheId);
      if (v.cat === 'depot' && t) av.porteDossier = couleurResultat(t);
      else if (ancienne === 'visiteur' && (v.cat === 'poste' || v.cat === 'machine')) av.porteDossier = JAUNE;
      else if (v.cat !== 'poste' && v.cat !== 'machine') av.porteDossier = null;
    }
    const dep = av.chemin.length ? av.chemin[0] : this.tuileDe(av);
    const chemin = chercherChemin(this.carte, dep, v.spot);
    const centre = Math.abs(av.gx - (dep.x + 0.5)) < 0.01 && Math.abs(av.gy - (dep.y + 0.5)) < 0.01;
    av.chemin = centre && !av.chemin.length ? chemin : [dep, ...chemin];
    av.arrive = false;
    if (!av.chemin.length) this.arriver(av);
  }

  partir(av, instant) {
    this.liberer(av);
    // réveillé pour une nouvelle mission (ou une réunion) : il se lève en le disant
    if (!instant && av.cat === 'dodo' && av.arrive && av.alpha > 0.5) {
      this.dire(av.id, { icone: 'cafe', texte: phrase('reveil', av.id + '|' + Date.now()) }, 3000, { phrase: true, force: true, parle: true });
    }
    av.cat = 'depart';
    av.cle = 'depart';
    av.spot = null;
    if (instant || av.alpha === 0) {
      this.retirer(av);
      return;
    }
    if (av.type === 'dg' && av.visite) {
      // le DG « disparaît » de son bureau d'étage quand il n'y dispatche plus
      av.fondu = -1;
      return;
    }
    const tuile = this.carte.spots.ascenseur.tuile;
    const dep = av.chemin.length ? av.chemin[0] : this.tuileDe(av);
    const chemin = chercherChemin(this.carte, dep, tuile);
    av.chemin = [dep, ...chemin];
    av.arrive = false;
  }

  retirer(av) {
    av.supprimer = true;
    this.liberer(av);
    const t = av.tacheId ? this.store.taches.get(av.tacheId) : null;
    if (av.type === 'agent' && t && (t.etat === 'done' || t.etat === 'cancelled' || t.etat === 'skipped' || t.etat === 'failed')) {
      this.partis.add(t.id);
    }
  }

  arriver(av) {
    const now = Date.now();
    av.arrive = true;
    if (av.cat === 'depart') {
      av.versAsc = true;
      this.asc.jusqua = Math.max(this.asc.jusqua, now + 1400);
      return;
    }
    if (av.spot) av.dir = av.spot.dir;
    if (av.cat === 'depot') {
      av.anim = { bras: 'dossier', jusqua: now + 900 };
      av.minuteur = {
        t: now + 900,
        fn: () => {
          av.porteDossier = null;
          this.depots.add(av.tacheId);
          this.prochaineResolution = 0;
        },
      };
    } else if (av.cat === 'poste' || av.cat === 'machine') {
      av.porteDossier = null;
    } else if (av.cat === 'baie') {
      const d = this.descentes.get(av.tacheId);
      av.anim = { bras: 'lever', jusqua: now + 1800 };
      if (d) {
        this.flashBaie.set(d.service, now + 400);
        this.dire(av.id, { icone: 'engrenage', texte: d.action === 'arreter' ? tr('J’éteins !') : tr('J’allume !') }, 2200, { phrase: true, force: true });
      }
    } else if (av.cat === 'dodo' && av.spot && av.spot.couche) {
      if (Math.random() < 0.5) this.dire(av.id, { texte: phrase('coucher', av.id + '|' + now) }, 2600, { phrase: true, parle: true });
    } else if (av.cat === 'jeu') {
      const e = av.envie;
      const autre = e && (e.rejoint || e.visite) ? this.avatars.get(e.rejoint || e.visite) : null;
      if (autre && autre.arrive && !this.parleEncore(autre.id, now)) {
        // venu jouer avec quelqu'un, ou discuter avec un joueur : il le dit, l'autre répond
        if (e.visite) av.dir = dirVers(autre.gx - av.gx, autre.gy - av.gy);
        // celui qu'on rejoint reste pour la partie (ou le temps de la discussion) au lieu de partir aussitôt
        if (autre.envie) autre.envie.jusqua = Math.max(autre.envie.jusqua, now + (e.rejoint ? dureeEnvie() : 15000));
        const [question, reponse] = e.rejoint ? ['rejoindreJeu', 'accepterJeu'] : ['visiteJoueur', 'reponseVisite'];
        this.dire(av.id, { texte: phrase(question, av.id + '|' + now) }, 2800, { phrase: true, force: true, parle: true });
        this.programmer(now + 2600 * this.mult(), () => this.dire(autre.id, { texte: phrase(reponse, autre.id + '|' + now) }, 2800, { phrase: true, force: true, parle: true }));
        e.rejoint = e.visite = null;
      } else if (ARRIVEE_JEU[av.spot && av.spot.activite] && Math.random() < 0.45) {
        this.dire(av.id, { icone: 'sourire', texte: phrase(ARRIVEE_JEU[av.spot.activite], av.id + '|' + now) }, 3000, { phrase: true, parle: true });
      }
    } else if (av.type === 'inspecteur' && av.cat === 'insp') {
      this.dire(av.id, { icone: 'loupe', texte: phrase('verifDebut', av.id) }, 3000, { phrase: true });
    } else if (av.type === 'joy') {
      if (av.centre) {
        av.dir = dirVers(av.centre[0] - av.gx, av.centre[1] - av.gy);
        // arrivée près d'un groupe : une blague peu après (si la dernière est assez loin)
        if (now - this.joyDerniere > JOY_ENTRE_BLAGUES) this.joyProchain = Math.min(this.joyProchain, now + 2500);
      }
    }
  }

  // ---------- boucle ----------
  maj(now, dt) {
    if (!this.carte) return;
    if (now >= this.prochaineResolution) {
      this.resoudre(false);
      this.prochaineResolution = now + 500;
    }
    this.majReunions(now);
    if (this.programme.length) {
      const dus = this.programme.filter((x) => now >= x.t);
      if (dus.length) {
        this.programme = this.programme.filter((x) => now < x.t);
        for (const x of dus) x.fn();
      }
    }
    this.majBavardages(now);
    this.majJeux(now);
    this.majJoy(now);
    for (const [id, b] of this.bulles) if (now > b.jusqua + 1000) this.bulles.delete(id);
    this.glissements = this.glissements.filter((g) => now - g.t0 < g.duree);
    for (const av of this.avatars.values()) {
      if (av.retard) {
        if (now < av.retard) continue;
        av.retard = 0;
        av.fondu = 1;
        this.asc.jusqua = Math.max(this.asc.jusqua, now + 1400);
      }
      if (av.minuteur && now >= av.minuteur.t) {
        const f = av.minuteur.fn;
        av.minuteur = null;
        f();
      }
      if (av.fondu) {
        av.alpha += (av.fondu * dt) / 420;
        if (av.alpha >= 1) {
          av.alpha = 1;
          av.fondu = 0;
        }
        if (av.alpha <= 0) {
          av.alpha = 0;
          av.fondu = 0;
          if (av.cat === 'depart') this.retirer(av);
        }
      }
      if (av.versAsc) {
        const a = this.carte.spots.ascenseur.apparition;
        const dx = a.gx - av.gx;
        const dy = a.gy - av.gy;
        const d = Math.hypot(dx, dy);
        const step = (VITESSE * dt) / 1000;
        av.dir = 'nw';
        if (d <= step) {
          av.gx = a.gx;
          av.gy = a.gy;
          av.versAsc = false;
          av.fondu = -1;
        } else {
          av.gx += (dx / d) * step;
          av.gy += (dy / d) * step;
          av.pas += step;
        }
        continue;
      }
      let reste = (VITESSE * dt) / 1000;
      while (av.chemin.length && reste > 0) {
        const n = av.chemin[0];
        const tx = n.x + 0.5;
        const ty = n.y + 0.5;
        const dx = tx - av.gx;
        const dy = ty - av.gy;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > Math.abs(dy)) av.dir = dx > 0 ? 'se' : 'nw';
        else if (Math.abs(dy) > 0.001) av.dir = dy > 0 ? 'sw' : 'ne';
        if (d <= reste) {
          av.gx = tx;
          av.gy = ty;
          av.pas += d;
          reste -= d;
          av.chemin.shift();
          if (!av.chemin.length) this.arriver(av);
        } else {
          av.gx += (dx / d) * reste;
          av.gy += (dy / d) * reste;
          av.pas += reste;
          reste = 0;
        }
      }
    }
    for (const [id, av] of this.avatars) if (av.supprimer) this.avatars.delete(id);
    // ascenseur
    const cibleAsc = now < this.asc.jusqua ? 1 : 0;
    this.asc.ouverture += Math.sign(cibleAsc - this.asc.ouverture) * Math.min(Math.abs(cibleAsc - this.asc.ouverture), dt / 450);
    if (now > this.asc.sensJusqua) this.asc.sens = 0;
    // tableau qui se remplit
    const plan = this.planAffiche();
    if (plan && this.tableau.dossier !== plan.dossier) this.tableau = { dossier: plan.dossier, visibles: plan.taches.length, prochain: 0 };
    if (plan && this.tableau.prochain && now >= this.tableau.prochain) {
      if (this.tableau.visibles < plan.taches.length) {
        this.tableau.visibles++;
        this.tableau.prochain = now + 380;
      } else this.tableau.prochain = 0;
    }
  }

  majReunions(now) {
    const S = this.store;
    const m = this.mult(); // chaque remise de dossier dure plus longtemps si les bulles aussi
    for (const r of this.reunions) {
      const ids = [r.a, ...r.de];
      const avs = ids.map((id) => this.avatarDeTache(id)).filter(Boolean);
      if (r.phase === 'rassemblement') {
        const prets = avs.length > 0 && avs.every((av) => av.arrive && av.cat === 'reunion');
        if (prets || now - r.debut > 15000) {
          r.phase = 'remise';
          r.tPhase = now;
        }
      } else if (r.phase === 'remise') {
        const pas = 2700 * m;
        const k = Math.floor((now - r.tPhase) / pas);
        if (k >= r.de.length) {
          r.phase = 'fin';
          r.tPhase = now;
          continue;
        }
        const local = (now - r.tPhase) % pas;
        const up = this.avatarDeTache(r.de[k]);
        const down = this.avatarDeTache(r.a);
        const tu = S.taches.get(r.de[k]);
        const ta = S.taches.get(r.a);
        const coul = tu ? couleurResultat(tu) : COUL_RESULTAT.done;
        if (local < 1000 * m) {
          if (up) {
            up.anim = { bras: 'dossier', jusqua: now + 120, couleur: coul };
            up.porteDossier = coul;
            this.bulles.set(up.id, { opts: { icone: 'dossier', texte: (tu ? S.nom(tu) : '') + ' → ' + (ta ? S.nom(ta) : '') }, jusqua: now + 2200 * m, t0: now, tier: 70 });
          }
        } else if (local < 2000 * m) {
          if (up) up.porteDossier = null;
          if (!r.glisse[k] && up && down) {
            r.glisse[k] = true;
            this.glissements.push({ de: { x: up.gx, y: up.gy }, a: { x: down.gx, y: down.gy }, t0: now, duree: 1000, couleur: coul });
          }
        } else if (down) {
          down.anim = { bras: 'dossier', jusqua: now + 120 };
          down.porteDossier = null;
          this.bulles.set(down.id, { opts: { icone: 'page', texte: tr('Merci !') }, jusqua: now + 1500 * m, t0: now, tier: 70 });
        }
      }
    }
    const avant = this.reunions.length;
    this.reunions = this.reunions.filter((r) => !(r.phase === 'fin' && now - r.tPhase > 700));
    if (this.reunions.length !== avant) this.prochaineResolution = 0;
  }

  // ---------- rendu ----------
  visuel(av, now) {
    const S = this.store;
    const t = av.tacheId ? S.taches.get(av.tacheId) : null;
    const marche = av.chemin.length > 0 || av.versAsc;
    const v = { dir: av.dir, posture: 'debout', bras: 'repos', frame: 0, bouche: false, triste: false, gris: false, ruban: false, yeuxFermes: false, dossierCouleur: null };
    if (marche) {
      v.posture = 'marche';
      v.frame = Math.floor(av.pas * 4.4) % 4;
    } else if (av.arrive && av.spot && av.spot.assis) v.posture = 'assis';
    const parle = () => (v.bouche = Math.floor((now + av.phase) / 260) % 2 === 1);
    if (av.anim && now < av.anim.jusqua) {
      v.bras = av.anim.bras;
      v.dossierCouleur = av.anim.couleur || av.porteDossier || JAUNE;
    } else if (marche) {
      if (av.porteDossier) {
        v.bras = 'dossier';
        v.dossierCouleur = av.porteDossier;
      }
    } else if (av.type === 'inspecteur') {
      v.bras = 'clip';
    } else if (av.type === 'reserve' && av.cat === 'dodo') {
      // salle de repos : couché dans son lit, les yeux fermés (debout et somnolent s'il n'y a plus de lit)
      v.yeuxFermes = true;
      if (av.arrive && av.spot && av.spot.couche) v.posture = 'couche';
      else if (av.arrive && (now + av.phase) % 9000 < 1200) v.bouche = true; // bâillement
    } else if (av.type === 'reserve') {
      // en réserve : on lit ou on boit un café
      const cyc = (now + av.phase) % 9000;
      if (av.cat === 'reunion') {
        if (Math.floor((now + av.phase) / 2200) % 3 === 0) parle();
      } else if (av.spot && (av.spot.assis || av.spot.lire)) {
        v.bras = cyc < 6500 ? 'lire' : 'boire';
        v.frame = Math.floor((now + av.phase) / 900) % 2;
        v.dossierCouleur = ['#2f6fde', '#e3342f', '#3aa655', '#9b5de5'][av.phase % 4];
      } else if (cyc < 3000) {
        v.bras = 'boire';
        v.frame = Math.floor((now + av.phase) / 900) % 2;
      }
    } else if (av.type === 'joy') {
      if (!marche && av.arrive && av.centre) v.dir = dirVers(av.centre[0] - av.gx, av.centre[1] - av.gy);
      // bras levés au moment de la chute
      if (this.joyActe && this.joyActe.chute && now >= this.joyActe.chute && now < this.joyActe.chute + 1600) {
        v.bras = 'lever';
        v.frame = Math.floor(now / 300) % 2;
      }
    } else if (av.type === 'dg') {
      const dg = S.dg;
      if (av.cle === 'dg:tableau') {
        v.bras = 'lever';
        v.frame = Math.floor(now / 300) % 2;
      } else if (dg.action === 'delta' && av.cle === 'dg:siege') v.bras = 'tel';
      else if (av.cle === 'dg:tete') parle();
      else if ([...this.avatars.values()].some((a) => a.type === 'agent' && a.cat === 'visiteur' && a.arrive)) {
        v.bras = 'dossier';
        v.dossierCouleur = JAUNE;
      }
    } else if (t) {
      if (av.cat === 'jeu') {
        if (av.arrive) this.visuelJeu(av, v, now, parle);
      } else if (av.cat === 'poste' || av.cat === 'machine') {
        if (t.etat === 'running' || t.etat === 'rework') {
          v.bras = 'taper';
          v.frame = Math.floor((now + av.phase) / 170) % 2;
        } else if (t.etat === 'permission') v.bras = 'lever';
        else if (t.etat === 'failed') v.triste = true;
        else if (t.etat === 'interrupted') v.yeuxFermes = true;
      } else if (av.cat === 'pause') {
        const cyc = (now + av.phase) % 6500;
        if ((av.spot && av.spot.cafe) || (!v.posture.startsWith('assis') && cyc < 2000)) {
          v.bras = 'boire';
          v.frame = Math.floor((now + av.phase) / 900) % 2;
        }
      } else if (av.cat === 'reunion' || av.cat === 'visiteur') {
        if (Math.floor((now + av.phase) / 2200) % 3 === 0) parle();
      }
    }
    if (t && av.type === 'agent') {
      v.gris = t.etat === 'cancelled' || t.etat === 'skipped';
      v.ruban = v.gris;
    }
    if (!marche && av.porteDossier && v.bras === 'repos') {
      v.bras = 'dossier';
      v.dossierCouleur = av.porteDossier;
    }
    const tb = this.bulles.get(av.id);
    if (tb && tb.parle && now < tb.jusqua) parle();
    return v;
  }

  // Salle de pause : la pose selon le jeu (queue de billard, mains sur les barres du baby-foot, manette…).
  visuelJeu(av, v, now, parle) {
    const s = av.spot || {};
    const ph = now + av.phase;
    v.centre = s.centre || null;
    switch (s.activite) {
      case 'billard': {
        // chacun son tour : il vise, recule la queue, frappe ; sinon il attend appuyé sur sa queue
        v.accessoire = 'queue';
        const cyc = ph % 7000;
        if (cyc < 2600) {
          v.bras = 'taper';
          v.frame = 0;
          v.vise = true;
          v.coup = cyc > 2000 ? Math.min(1, (cyc - 2000) / 200) : 0;
        }
        break;
      }
      case 'babyfoot':
        v.bras = 'taper';
        v.frame = Math.floor(ph / 140) % 2;
        break;
      case 'arcade':
        v.bras = 'taper';
        v.frame = Math.floor(ph / 110) % 2;
        break;
      case 'pingpong':
        v.accessoire = 'raquette';
        v.bras = Math.floor(ph / 700) % 2 ? 'lever' : 'repos';
        break;
      case 'tele': {
        const cyc = ph % 11000;
        if (cyc < 2600) {
          v.bras = 'boire';
          v.frame = Math.floor(ph / 900) % 2;
        } else if (cyc > 9200) parle(); // éclat de rire devant l'écran
        break;
      }
      case 'pouf': {
        const cyc = ph % 12000;
        if (cyc < 6000) {
          v.bras = 'lire';
          v.frame = Math.floor(ph / 900) % 2;
          v.dossierCouleur = ['#c45b5b', '#2f6fde', '#3aa655', '#9b5de5'][av.phase % 4];
        } else if (cyc < 8500) {
          v.bras = 'boire';
          v.frame = Math.floor(ph / 900) % 2;
        }
        break;
      }
      case 'cafe':
        v.bras = 'boire';
        v.frame = Math.floor(ph / 900) % 2;
        break;
      default:
        // spectateurs et places improvisées : un café de temps en temps
        if (ph % 8000 < 2500) {
          v.bras = 'boire';
          v.frame = Math.floor(ph / 900) % 2;
        }
    }
  }

  // Accessoire tenu en main (queue de billard, raquette) : dessiné devant l'avatar, ou derrière s'il nous tourne le dos.
  accessoire(v, fx, fy, now) {
    const sd = v.dir === 'se' || v.dir === 'ne' ? 1 : -1; // côté de la main droite à l'écran
    const dos = v.dir === 'ne' || v.dir === 'nw';
    if (v.accessoire === 'queue') {
      if (!v.vise) {
        // il attend son tour, appuyé sur sa queue
        const x = fx + sd * 9;
        return {
          derriere: false,
          dessiner: (g) => {
            trait(g, x, fy - 2, x + sd * 2, fy - 54, '#c89a5a', 2);
            trait(g, x, fy - 2, x, fy - 12, '#3a2414', 2);
            g.fillStyle = '#5b8fd6';
            g.fillRect(x + sd * 2, fy - 56, 2, 2);
          },
        };
      }
      // il vise la table : la queue recule doucement puis part d'un coup
      const [cx, cy] = v.centre ? versArt(v.centre[0], v.centre[1]) : [fx + sd * 40, fy];
      const hx = fx + sd * 5;
      const hy = fy - 27;
      let dx = cx - hx;
      let dy = cy - 24 - hy;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const recul = v.coup ? -6 + 14 * v.coup : -3 - 3 * (0.5 + 0.5 * Math.sin(now / 160));
      const bx = hx + dx * (22 + recul);
      const by = hy + dy * (22 + recul);
      const qx = hx - dx * (20 - recul);
      const qy = hy - dy * (20 - recul) + 3;
      return {
        derriere: dos,
        dessiner: (g) => {
          trait(g, qx, qy, bx, by, '#c89a5a', 2);
          trait(g, qx, qy, qx + (bx - qx) * 0.25, qy + (by - qy) * 0.25, '#3a2414', 2);
          g.fillStyle = '#5b8fd6';
          g.fillRect(Math.round(bx), Math.round(by), 2, 2);
        },
      };
    }
    if (v.accessoire === 'raquette') {
      const leve = v.bras === 'lever';
      const x = Math.round(fx + sd * (leve ? 7 : 9));
      const y = Math.round(fy - (leve ? 59 : 22));
      return {
        derriere: dos && !leve,
        dessiner: (g) => {
          g.fillStyle = '#15151f';
          g.fillRect(x - 3, y - 4, 7, 7);
          g.fillStyle = '#e3342f';
          g.fillRect(x - 2, y - 3, 5, 5);
          g.fillStyle = '#8b5a2b';
          g.fillRect(x, y + 3, 1, 3);
        },
      };
    }
    return null;
  }

  // Candidat bulle d'un avatar : { tier, sorte: 'bulle'|'pensee'|'points', opts, t0 }.
  // Paliers : 100 main levée / question, 90 bloqué, 80 Joy, 70 paroles, 60 à valider, 50 pensées, 30 états, 10 silence.
  bulleDe(av, t, now) {
    const temp = this.bulles.get(av.id);
    let parole = null;
    if (temp && now < temp.jusqua) parole = { tier: temp.tier || 70, sorte: 'bulle', opts: temp.opts || { icone: temp.icone, texte: temp.texte }, t0: temp.t0 || 0 };
    let best = null;
    for (const c of [parole, this.bulleEtat(av, t, now), this.penseeDe(av, t, now)]) if (c && (!best || c.tier > best.tier)) best = c;
    return best;
  }

  bulleEtat(av, t, now) {
    const S = this.store;
    const B = (tier, opts) => ({ tier, sorte: 'bulle', opts });
    if (av.type === 'dg') {
      const dg = S.dg;
      if (dg.action === 'question') return B(100, { texte: tr('une question pour toi'), couleur: '#c45f00' });
      if (av.cle === 'dg:tete') return B(30, { icone: 'dossier', texte: tr('synthèse') });
      if (av.cle === 'dg:tableau') return B(30, { texte: tr('voici le plan') });
      if (dg.action === 'delta') return B(30, { icone: 'telephone', texte: tr('je modifie le plan') });
      if (dg.etat === 'reflechit' && dg.etage === this.etageId) return { tier: 10, sorte: 'points' };
      return null;
    }
    if (av.type === 'reserve' && av.cat === 'dodo' && av.arrive && !av.chemin.length) {
      // « Z z z » de temps en temps (plus longtemps quand les bulles durent plus)
      const d = 3500 * this.mult();
      return (now + av.phase * 7) % (9000 + d) < d ? B(20, { texte: 'Z z z', fond: '#dfe6ff', couleur: '#2a2e66' }) : null;
    }
    if (av.type === 'reserve' || av.type === 'fantome' || av.type === 'joy') return null;
    if (av.type === 'inspecteur') {
      const v = t ? S.verifs.get(t.id) : null;
      const actif = t && t.etat === 'verifying' && (!v || v.phase === 'debut');
      return av.arrive && av.cat === 'insp' && actif ? B(30, { icone: 'presse', texte: tr('je vérifie') }) : null;
    }
    if (!t) return null;
    if (S.ordonnanceur.pause && av.cat === 'pause') return B(20, { icone: 'horloge', texte: tr('pause') });
    if (av.cat === 'reunion') return null;
    // salle de pause : la pancarte « En attente » dit qui attend quoi ; seul un blocage mérite sa bulle
    if (av.cat === 'jeu' && !estBloquee(t)) return null;
    switch (t.etat) {
      case 'waiting': {
        if (this.zoneDe(av) === 'pause') return null; // la pancarte « En attente » s'en charge
        const noms = (t.attend || []).map((r) => this.nomDe(t, r));
        return B(30, { icone: 'attente', texte: tr("j'attends {noms}…", { noms: noms.length ? enumerer(noms) : '' }) });
      }
      case 'queued': {
        if (estBloquee(t)) {
          const r = refBloquante(t);
          return B(90, { icone: 'attente', texte: r ? tr('Je suis bloqué : {ref} a échoué', { ref: r }) : tr('Je suis bloqué'), fond: '#ffc27a', couleur: '#4a2200' });
        }
        return B(30, { texte: t.motifFile || tr("file d'attente") });
      }
      case 'briefing':
        return av.arrive ? B(30, { icone: 'dossier', texte: t.titre }) : null;
      case 'interrupted':
        return B(30, { texte: tr('interrompue') });
      case 'permission': {
        const q = S.decisionDe(t.id);
        if (q) return B(100, { icone: 'presse', texte: q.question || tr('ton avis ?') });
        let p = null;
        for (const x of S.permissions.values()) if (x.tache === t.id) p = x;
        return B(100, { icone: p ? iconeOutil(p.outil) : 'engrenage', texte: tr('autoriser ?') });
      }
      case 'verifying':
        if (t.verif && t.verif.mode === 'user') return B(60, { icone: 'presse', texte: tr('à valider') });
        return null;
      case 'done':
        if (av.cat === 'pause') {
          const u = S.attenduEnReunion(t);
          return u ? B(30, { icone: 'dossier', texte: tr('réunion avec {nom}', { nom: S.nom(u) }) }) : null;
        }
        return null;
      case 'running':
      case 'rework': {
        const silence = now - (t.derniereActivite || t.debut || now);
        if ((av.cat === 'poste' || av.cat === 'machine') && av.arrive && silence > SILENCE) return { tier: 10, sorte: 'points' };
        return null;
      }
      default:
        return null;
    }
  }

  // Pensée en direct (nuage) : réflexion, rédaction ou rapport ; s'efface après 15 s sans nouvelles.
  penseeDe(av, t, now) {
    const S = this.store;
    let cible = null;
    let verif = false;
    if (av.type === 'dg') {
      if (S.dg.etage === this.etageId && S.dg.etat === 'reflechit') cible = 'dg';
    } else if (av.type === 'inspecteur' && t && t.etat === 'verifying' && av.arrive) {
      cible = t.id;
      verif = true;
    } else if (av.type === 'agent' && t && (t.etat === 'running' || t.etat === 'rework') && (av.cat === 'poste' || av.cat === 'machine') && av.arrive) cible = t.id;
    if (!cible) return null;
    const p = S.pensees.get(cible);
    if (!p || !!p.verificateur !== verif) return null;
    const recu = this.recuPensee.get(cible) || p.t || 0;
    if (now - recu > PENSEE_VIE * this.mult()) return null;
    const P = (opts) => ({ tier: 50, sorte: 'pensee', opts, t0: recu });
    if (p.phase === 'reflexion') {
      const x = extraitCourt(p.extrait);
      return x ? P({ texte: x, max: 120, lignes: 2 }) : null;
    }
    if (p.phase === 'redaction') return P({ icone: 'crayon', texte: tr('rédige…') + (p.taille ? ' ' + tr('{n} car.', { n: fmtNombre(p.taille) }) : '') });
    if (p.phase === 'rapport') return P({ icone: 'presse', texte: tr('rédige son rapport…') });
    return null;
  }

  // Au plus 3 bulles par pièce : les plus importantes d'abord ; dans un palier trop peuplé, les paroles
  // les plus récentes gagnent et les autres (pensées, états) tournent toutes les 4 s.
  arbitrer(cands, now, reserve) {
    const parZone = new Map();
    for (const c of cands) {
      if (!parZone.has(c.zone)) parZone.set(c.zone, []);
      parZone.get(c.zone).push(c);
    }
    const out = [];
    const tranche = Math.floor(now / (4000 * this.mult()));
    for (const [zone, liste] of parZone) {
      let places = MAX_BULLES_PIECE - (reserve[zone] || 0);
      const paliers = [...new Set(liste.map((c) => c.b.tier))].sort((a, b) => b - a);
      for (const tier of paliers) {
        if (places <= 0) break;
        const g = liste.filter((c) => c.b.tier === tier);
        if (g.length <= places) {
          out.push(...g);
          places -= g.length;
          continue;
        }
        if (tier >= 60 && tier < 90) {
          g.sort((a, b) => (b.b.t0 || 0) - (a.b.t0 || 0));
          out.push(...g.slice(0, places));
        } else {
          g.sort((a, b) => (a.av.id < b.av.id ? -1 : 1));
          const d = (tranche * places) % g.length;
          for (let i = 0; i < places; i++) out.push(g[(d + i) % g.length]);
        }
        places = 0;
      }
    }
    return out;
  }

  marqueDe(av, t, now) {
    if (av.marqueTemp && now < av.marqueTemp.jusqua) return av.marqueTemp.nom;
    if (av.type === 'reserve') {
      const tl = this.derniereTache(av.agentId);
      return tl && tl.etat === 'failed' && this.store.dossierActif(tl.dossier) && av.arrive ? 'nuage' : null;
    }
    if (!t || av.type !== 'agent') return null;
    // Main levée : « ? » quand l'agent pose une question, « ! » pour une autorisation.
    if (t.etat === 'permission') return this.store.decisionDe(t.id) ? '?o' : '!';
    if (t.etat === 'failed' && av.cat === 'poste' && av.arrive) return 'nuage';
    if (t.etat === 'running' && now - (t.derniereActivite || t.debut || now) > SILENCE_LONG) return '?o';
    return null;
  }

  etiquetteDe(av, t) {
    const S = this.store;
    const sel = (t && this.selection === t.id) || (this.survol && this.survol === av.id) || (av.agentId && this.selection === 'ag:' + av.agentId);
    // noms lus à chaque image : un renommage (Réglages › Équipe) se voit tout de suite
    if (av.type === 'dg') return { texte: S.nomDg ? S.nomDg() : tr('DG'), couleur: '#e02a36' };
    if (av.type === 'joy') {
      const nj = S.nomJoy ? S.nomJoy() : 'Joy';
      return { texte: sel ? nj + ' · happiness manager' : nj, couleur: '#ffd23f' };
    }
    if (av.type === 'fantome') return null;
    if (av.type === 'reserve') {
      const a = S.equipe.get(av.agentId);
      if (!a) return null;
      // salle de repos : le prénom seul (les missions au survol), pour ne pas encombrer le dortoir
      if (av.cat === 'dodo' && !sel) return { texte: a.prenom || a.id, couleur: modele(a.modele).c };
      const n = a.missions || 0;
      const pluriel = langueCourante() === 'fr' ? n > 1 : n !== 1;
      return { texte: tr(pluriel ? '{nom} · {n} missions' : '{nom} · {n} mission', { nom: a.prenom || a.id, n }), couleur: modele(a.modele).c, large: true };
    }
    if (av.etiquetteTemp && Date.now() < av.etiquetteTemp.jusqua && t) {
      const orig = av.etiquetteTemp.source ? S.equipe.get(av.etiquetteTemp.source) : null;
      const texte = av.etiquetteTemp.source ? tr('clone de {nom}', { nom: (orig && orig.prenom) || av.etiquetteTemp.source }) : av.etiquetteTemp.texte;
      return { texte, couleur: modele(t.modele).c };
    }
    if (!t) return null;
    if (av.type === 'inspecteur') {
      const v = S.verifs.get(t.id);
      const m = (v && v.verificateur && v.verificateur.modele) || (t.verif && t.verif.modele);
      return { texte: tr('vérif {nom}', { nom: S.nom(t) }), couleur: modele(m).c };
    }
    const nom = S.nom(t);
    // le prénom seul ; la ref et le titre au survol ou à la sélection
    // plusieurs IA : le compte qui fait la tâche, à la sélection (badge « pas encore qualifié » compris)
    if (sel) return { texte: (nom !== t.ref ? nom + ' · ' : '') + t.ref + ' ' + (t.titre || '') + (S.multiIa && t.compte ? ' — ' + S.libelleCompte(t.compte) : ''), couleur: modele(t.modele).c };
    return { texte: nom, couleur: modele(t.modele).c };
  }

  dessinables(now, zoom = 1) {
    const S = this.store;
    const monde = [];
    const dessus = [];
    if (!this.carte) return { monde, dessus };
    const carte = this.carte;
    // petites animations du décor (machines, jeux, voyants), ralenties en graphismes Léger
    const td = now * (this.vitesseDecor || 1);
    const typeTheme = carte.type;
    // --- surcouches murales ---
    const plan = carte.tableau ? this.planAffiche() : null;
    let tab = null;
    this.boiteTableau = null;
    // postes de travail cliquables : le vieil écran montre le code de l'agent assis là (vide sinon)
    this.boitesOrdis = [];
    for (const p of carte.spots.postes || []) {
      if (!p.bureau) continue;
      const [cx, cy] = versArt(p.bureau.x + 0.5, p.bureau.y + 0.5);
      let occupant = null;
      for (const a of this.avatars.values()) if (a.type === 'agent' && a.cat === 'poste' && a.cle === 'poste:' + p.cle) occupant = a;
      this.boitesOrdis.push({ x0: cx - 22, x1: cx + 22, y0: cy - 44, y1: cy + 4, tacheId: occupant ? occupant.tacheId : null });
    }
    if (carte.tableau) {
      const etats = {};
      if (plan) for (const pt of plan.taches) etats[pt.ref] = (S.tacheParRef(plan.dossier, pt.ref) || {}).etat || 'planned';
      tab = spriteTableau(carte, plan, etats, plan ? Math.min(this.tableau.visibles, plan.taches.length) : 0);
      monde.push({ k: -1000, img: tab.c, x: tab.x, y: tab.y });
      // le tableau blanc est cliquable : il ouvre le grand « Plan du dossier »
      this.boiteTableau = { x0: tab.x, y0: tab.y, x1: tab.x + tab.c.width, y1: tab.y + tab.c.height, dossier: plan ? plan.dossier : null };
    }
    // salle de pause : la télé du salon
    if (carte.tele) {
      const tv = spriteTele(carte, now);
      monde.push({ k: -1000, img: tv.c, x: tv.x, y: tv.y });
    }
    const lib = this.etage ? (this.etage.ordre === 0 ? tr('RC') : String(this.etage.ordre)) : '';
    const asc = spriteAscenseur(carte, this.asc.ouverture, lib, this.asc.sens);
    monde.push({ k: -1000, img: asc.c, x: asc.x, y: asc.y });
    const pause = S.ordonnanceur.pause;
    const horl = spriteHorloge(carte, new Date(), !!pause);
    monde.push({ k: -1000, img: horl.c, x: horl.x, y: horl.y });
    if (pause) {
      const j = pause.jusqua ? new Date(pause.jusqua) : null;
      const txt = j ? tr('reprise {heure}', { heure: String(j.getHours()).padStart(2, '0') + ':' + String(j.getMinutes()).padStart(2, '0') + ':' + String(j.getSeconds()).padStart(2, '0') }) : tr('pause');
      const b = bulle({ icone: 'horloge', texte: txt, fond: '#fff4d6' });
      dessus.push({ k: 9999, img: b, x: Math.round(horl.x + 10 - b.width / 2), y: horl.y - b.height - 2, ax: horl.x + 10, ay: horl.y });
    }
    // --- état du décor ---
    const dgAv = this.avatars.get('dg');
    const lampe = !!dgAv && S.dg.etat === 'reflechit' && S.dg.etage === this.etageId;
    const decroche = !!dgAv && S.dg.action === 'delta' && dgAv.cle === 'dg:siege' && dgAv.arrive;
    const depots = [];
    for (const t of S.taches.values()) {
      if (t.etage !== this.etageId || !this.depots.has(t.id)) continue;
      if (!S.dossierActif(t.dossier)) continue;
      if (t.etat === 'done' || t.etat === 'failed') depots.push(couleurResultat(t));
    }
    const dossiersPostes = new Map();
    for (const av of this.avatars.values()) {
      if (av.type !== 'agent' || !av.arrive) continue;
      const t = S.taches.get(av.tacheId);
      if (!t || !['running', 'rework', 'permission', 'verifying'].includes(t.etat)) continue;
      if (av.cat === 'poste') {
        const p = carte.spots.postes.find((x) => cle(x.chaise) === cle(av.spot));
        if (p) dossiersPostes.set(cle(p.bureau), JAUNE);
      } else if (av.cat === 'machine') dossiersPostes.set(cle(carte.spots.machine.bureau) + 'm', JAUNE);
    }
    const premierBureauDG = carte.bureauDG[0] || { x: -1, y: -1 };
    // joueurs arrivés autour de chaque table de jeu (la balle ne bouge que si l'on joue)
    const joueurs = {};
    if (this.estPause()) {
      for (const av of this.avatars.values()) {
        if (av.cat === 'jeu' && av.arrive && !av.chemin.length && av.spot && av.spot.table) joueurs[av.spot.table] = (joueurs[av.spot.table] || 0) + 1;
      }
    }
    // --- mobilier ---
    for (const it of carte.meubles) {
      const etat = it.type === 'bureau_dg' ? { lampe: it.lampe ? lampe : false, decroche: it.telephone ? decroche : false } : {};
      const s = spriteMeuble(it, typeTheme, etat);
      const [tx, ty] = coinTuile(it.x, it.y);
      // un meuble de plusieurs cases se trie sur sa case la plus en avant
      const k = it.x + it.y + (it.w || 1) + (it.h || 1) - 1 - 0.02;
      const extra = [];
      if (['baie', 'imprimante3d', 'machine_cafe', 'poste_machine', 'arcade', 'jukebox'].includes(it.type)) extra.push((g) => animerMeuble(g, it, tx, ty, td));
      if (it.jeu) {
        const n = joueurs[it.jeu] || 0;
        extra.push((g) => animerJeu(g, it, tx, ty, td, it.jeu === 'billard' ? n >= 1 : n >= 2));
      }
      if (it.type === 'bureau_dg' && it.x === premierBureauDG.x && it.y === premierBureauDG.y && depots.length) {
        extra.push((g) => pileDossiers(g, tx, ty, depots));
      }
      if (it.type === 'bureau' && dossiersPostes.has(it.x + ',' + it.y)) {
        extra.push((g) => dossierPlat(g, tx, ty, it.cote === 'n' ? 0.12 : 0.55, JAUNE));
      }
      monde.push({ k, img: s.c, x: tx + s.dx, y: ty + s.dy, extra });
      // lits superposés : l'étage du haut, puis les montants avant et l'échelle (les dormeurs se glissent entre)
      if (s.haut) monde.push({ k: k + 0.01, img: s.haut.c, x: tx + s.haut.dx, y: ty + s.haut.dy });
      if (s.devant) monde.push({ k: k + 0.02, img: s.devant.c, x: tx + s.devant.dx, y: ty + s.devant.dy });
      if (s.avant) monde.push({ k: k + 0.04, img: s.avant.c, x: tx + s.avant.dx, y: ty + s.avant.dy });
    }
    // --- baies des services (sous-sol) ---
    this.boitesServices = [];
    if (this.estSousSol()) {
      const liste = this.servicesSousSol();
      carte.emplacementsServices.forEach((e, i) => {
        const sv = liste[i] || null;
        const s = spriteMeuble({ type: 'baie_service', x: e.x, y: e.y }, typeTheme, {});
        const [tx, ty] = coinTuile(e.x, e.y);
        const fl = sv ? this.flashBaie.get(sv.id) : 0;
        const flash = fl && now - fl < 700 && now >= fl ? 1 - (now - fl) / 700 : 0;
        monde.push({ k: e.x + e.y + 1 - 0.02, img: s.c, x: tx + s.dx, y: ty + s.dy, extra: [(g) => ledsService(g, tx, ty, td, sv ? sv.etat : null, flash)] });
        if (!sv) return;
        const nomEtage = (S.etage(sv.etage) || {}).nom || sv.etage;
        const lab = etiquette(nomEtage + ' · ' + sv.type + (sv.port ? ' :' + sv.port : ''), COUL_SERVICE[sv.etat] || '#646c88', 150);
        const [cx, cy] = versArt(e.x + 0.5, e.y + 0.5);
        // étiquettes en quinconce : deux baies voisines ne se chevauchent pas
        const yLab = cy - 16 - 66 - 14 - (i % 2) * 15;
        dessus.push({ k: -500 + i, img: lab, x: Math.round(cx - lab.width / 2), y: yLab, ax: cx, ay: yLab + 12 });
        if (sv.etat === 'externe' || sv.etat === 'erreur') {
          const lab2 = etiquette(sv.etat === 'externe' ? tr('hors QG') : tr('erreur'), sv.etat === 'externe' ? '#7fa7d9' : '#ff3b3b', 60);
          dessus.push({ k: -499 + i, img: lab2, x: Math.round(cx + lab.width / 2 + 2), y: yLab, ax: cx, ay: yLab + 12 });
        }
        this.boitesServices.push({ id: sv.id, x0: cx - 26, x1: cx + 26, y0: yLab, y1: cy + 14 });
      });
    }
    for (const c of carte.cloisons) {
      const s = spriteCloison(c.cote, typeTheme);
      const [tx, ty] = coinTuile(c.x, c.y);
      monde.push({ k: c.x + c.y + 1.5, img: s.c, x: tx + s.dx, y: ty + s.dy });
    }
    // --- avatars ---
    const f = zoom > 0 && zoom < 1 ? 1 / zoom : 1;
    const candidats = [];
    const etiquettes = [];
    const ordre = [...this.avatars.values()].sort((a, b) => a.gx + a.gy - (b.gx + b.gy));
    for (const av of ordre) {
      if (av.alpha <= 0.01) continue;
      const t = av.tacheId ? S.taches.get(av.tacheId) : null;
      const v = this.visuel(av, now);
      const L = this.lookDe(av);
      const [fx, fy] = versArt(av.gx, av.gy);
      let k = av.gx + av.gy;
      const sel = this.selection && (this.selection === av.tacheId || this.selection === av.id || (av.agentId && this.selection === 'ag:' + av.agentId && av.type === 'reserve')) && av.type !== 'inspecteur';
      const surv = this.survol === av.id;
      const grand = av.type === 'dg' ? 4 : av.type === 'joy' ? 5 : 0;
      let haut = fy - 49 - grand + (v.posture === 'assis' ? 8 : 0);
      let boite = null;
      if (v.posture === 'couche') {
        // dans son lit : la tête sur l'oreiller, la couverture remontée (entre les deux étages d'un lit superposé)
        const ch = av.spot.couche;
        const o = oreiller(ch);
        const [hx, hy0] = versArt(o.gx, o.gy);
        const hy = hy0 - o.z;
        const [bx, by] = coinTuile(ch.ox, ch.oy);
        const souffle = Math.floor((now + av.phase) / 1600) % 2;
        const couv = spriteCouverture(ch, nuance(L.chemise, 0.12), souffle);
        const tete = teteDormeur(L, ch.axe === 'x' ? 'se' : 'sw');
        k = av.spot.x + av.spot.y + 1 - 0.02 + (ch.niveau === 2 ? 0.015 : 0.005);
        monde.push({
          k,
          alpha: av.alpha,
          draw: (g) => {
            g.drawImage(tete, hx - TETE_AX, hy - TETE_AY + 4);
            g.drawImage(couv.c, bx + couv.dx, by + couv.dy);
            if (sel || surv) selectionAuSol(g, fx, fy, sel ? '#ffe14d' : 'rgba(255,255,255,0.7)', now);
          },
        });
        haut = hy - 22;
        boite = { x0: hx - 14, y0: hy - 24, x1: hx + 14, y1: hy + 8 };
        // petits « z » qui s'envolent
        const u = ((now + av.phase) % 3000) / 3000;
        for (let i = 0; i < 2; i++) {
          const w = (u + i * 0.5) % 1;
          const z = lettreZ(i === 1);
          dessus.push({ k: k + 0.001, img: z, x: Math.round(hx + 6 + w * 10), y: Math.round(hy - 24 - w * 16), alpha: av.alpha * (1 - w) });
        }
      } else {
        const spr = spriteAvatar(L, v);
        const acc = v.accessoire ? this.accessoire(v, fx, fy, now) : null;
        monde.push({
          k,
          alpha: av.alpha,
          draw: (g) => {
            if (sel || surv) selectionAuSol(g, fx, fy, sel ? '#ffe14d' : 'rgba(255,255,255,0.7)', now);
            g.drawImage(ombre(), fx - 11, fy - 4);
            if (acc && acc.derriere) acc.dessiner(g);
            g.drawImage(spr, fx - AVATAR_AX, fy - AVATAR_AY);
            if (acc && !acc.derriere) acc.dessiner(g);
          },
        });
      }
      // repères au-dessus (au-dessus de la tête, même couchée)
      const ax = boite ? Math.round((boite.x0 + boite.x1) / 2) : fx;
      if (v.bras === 'lever') haut = Math.min(haut, fy - 57 - grand + (v.posture === 'assis' ? 8 : 0));
      const items = [];
      let y = haut - 2;
      if (av.type === 'agent' || av.type === 'visiteur') {
        if (t) {
          const n = EFFORTS[t.effort] || 0;
          if (n) {
            const a = ampoules(n);
            y -= a.height;
            items.push({ img: a, x: Math.round(ax - a.width / 2), y });
            y -= 1;
          }
        }
      }
      const mq = this.marqueDe(av, t, now);
      if (mq === 'nuage') {
        const n = marque('nuage');
        const q = marque('?');
        y -= n.height;
        items.push({ img: n, x: Math.round(ax - n.width / 2), y });
        items.push({ img: q, x: Math.round(ax - q.width / 2), y: y - q.height + 6 });
        y -= q.height - 4;
      } else if (mq) {
        const m = marque(mq);
        const rebond = mq === '!' || mq === '?o' ? Math.round(Math.abs(Math.sin(now / 180)) * -3) : 0;
        const teteY = boite ? haut + 2 : fy - 49 - grand + (v.posture === 'assis' ? 8 : 0);
        items.push({ img: m, x: Math.round(ax + 10), y: teteY + rebond });
      }
      for (const it of items) dessus.push({ k, img: it.img, x: it.x, y: it.y, alpha: av.alpha, ax, ay: haut });
      const b = this.bulleDe(av, t, now);
      if (b) {
        if (sel || surv) b.tier += 50; // l'avatar regardé garde toujours sa bulle
        candidats.push({ av, b, zone: this.zoneDe(av), fx: ax, y, haut, k });
      }
      const et = this.etiquetteDe(av, t);
      if (et) etiquettes.push({ av, et, fx, fy, k, prio: sel || surv ? 1 : 0 });
      av._boite = boite || { x0: fx - 12, y0: haut - 2, x1: fx + 12, y1: fy + 3 };
    }
    // --- pancarte « En attente » (salle de pause) et légende du tableau quand le DG écrit ---
    const fixes = [];
    const fixe = (img, x, y, ax, ay, kk) => {
      dessus.push({ k: kk, img, x, y, ax, ay });
      fixes.push({ x0: ax + (x - ax) * f, y0: ay + (y - ay) * f, x1: ax + (x - ax + img.width) * f, y1: ay + (y - ay + img.height) * f });
    };
    const reserve = {};
    const attente = [];
    for (const av of this.avatars.values()) {
      if (av.type !== 'agent' || av.alpha < 0.3) continue;
      const t = S.taches.get(av.tacheId);
      if (!t) continue;
      if (av.cat === 'jeu') {
        // salle de pause : qui attend qui, et pourquoi certains sont encore en file
        if (t.etat === 'waiting') {
          const noms = (t.attend || []).map((r) => this.nomDe(t, r));
          attente.push(tr('{nom} attend {noms}…', { nom: S.nom(t), noms: noms.length ? enumerer(noms) : '' }));
        } else if (t.etat === 'queued' && !estBloquee(t)) {
          attente.push(tr('{nom} : {motif}', { nom: S.nom(t), motif: t.motifFile || tr("file d'attente") }));
        }
        continue;
      }
      if (av.cat !== 'pause' || t.etat !== 'waiting' || this.zoneDe(av) !== 'pause') continue;
      const noms = (t.attend || []).map((r) => this.nomDe(t, r));
      attente.push(tr('{nom} attend {noms}…', { nom: S.nom(t), noms: noms.length ? enumerer(noms) : '' }));
    }
    if (attente.length) {
      attente.sort();
      const lignes = attente.length > 5 ? [...attente.slice(0, 4), tr('+ {n} autres', { n: attente.length - 4 })] : attente;
      const img = pancarte(tr('En attente'), lignes, { icone: 'attente' });
      // accrochée en haut du mur de la salle de pause : au-dessus des têtes, loin des bulles
      const pc = carte.pancarte || { gx: 0, gy: 9.8 };
      const [cx, cy] = versArt(pc.gx, pc.gy);
      const ay = cy - 76;
      fixe(img, Math.round(cx - img.width / 2), ay - img.height, cx, ay, 60);
    }
    const pdg = S.pensees.get('dg');
    const recuDg = this.recuPensee.get('dg') || (pdg && pdg.t) || 0;
    if (tab && pdg && dgAv && S.dg.etage === this.etageId && S.dg.etat === 'reflechit' && now - recuDg < PENSEE_VIE * this.mult() && (pdg.phase === 'reflexion' || pdg.phase === 'redaction')) {
      const synth = S.dg.action === 'synthese';
      // le nom du DG peut être personnalisé : « Marc rédige la synthèse… » au lieu de « Le DG… »
      const nom = S.nomDg ? S.nomDg() : tr('DG');
      const perso = nom !== tr('DG');
      let base;
      if (pdg.phase === 'redaction') {
        if (synth) base = perso ? tr('{nom} rédige la synthèse…', { nom }) : tr('Le DG rédige la synthèse…');
        else base = perso ? tr('{nom} rédige le plan…', { nom }) : tr('Le DG rédige le plan…');
      } else if (synth) base = perso ? tr('{nom} prépare la synthèse…', { nom }) : tr('Le DG prépare la synthèse…');
      else if (S.dg.action === 'delta') base = perso ? tr('{nom} revoit le plan…', { nom }) : tr('Le DG revoit le plan…');
      else base = perso ? tr('{nom} réfléchit au plan…', { nom }) : tr('Le DG réfléchit au plan…');
      const txt = base + (pdg.taille ? ' ' + tr('({n} car.)', { n: fmtNombre(pdg.taille) }) : '');
      const img = bulle({ icone: 'crayon', texte: txt, fond: '#fff4d6', max: 190, lignes: 1 });
      const cx = Math.round(tab.x + tab.c.width / 2);
      const ay = tab.y + 6;
      fixe(img, Math.round(cx - img.width / 2), ay - img.height, cx, ay, 59);
    }
    // salle de repos : pénombre et halo des lampes, par-dessus tout le décor (les bulles et les noms restent nets)
    if (carte.nuit) monde.push({ k: 9990, draw: (g) => voileNuit(g, carte) });
    // --- bulles : arbitrage par pièce, puis anti-chevauchement ---
    const placees = [];
    for (const c of this.arbitrer(candidats, now, reserve)) {
      const img = c.b.sorte === 'points' ? bullePoints(1 + (Math.floor(now / 350) % 3)) : c.b.sorte === 'pensee' ? bullePensee(c.b.opts) : bulle(c.b.opts);
      const dx = c.b.sorte === 'pensee' ? 6 : 0; // les petites bulles du nuage partent de la tête
      placees.push({ img, ax: c.fx, ay: c.haut, x: Math.round(c.fx - img.width / 2) + dx, y: c.y - img.height, k: c.k, alpha: c.av.alpha });
    }
    eviter(placees, fixes, f);
    for (const p of placees) dessus.push({ k: p.k, img: p.img, x: Math.round(p.x), y: Math.round(p.y), alpha: p.alpha, ax: p.ax, ay: p.ay });
    // --- étiquettes : décalées vers le bas si elles se chevauchent, masquées si trop serrées (visibles au survol) ---
    const occ = [];
    etiquettes.sort((a, b) => b.prio - a.prio || a.fy - b.fy);
    for (const e of etiquettes) {
      const img = etiquette(e.et.texte, e.et.couleur, e.prio ? 150 : e.et.large ? 110 : 70);
      const w = img.width * f;
      const h = img.height * f;
      const x0 = e.fx - (img.width / 2) * f;
      let y0 = e.fy + 3 * f;
      let ok = false;
      for (let n = 0; n < 3; n++) {
        const r = occ.find((o) => x0 < o.x1 && x0 + w > o.x0 && y0 < o.y1 && y0 + h > o.y0);
        if (!r) {
          ok = true;
          break;
        }
        y0 = r.y1 + 1;
      }
      if (!ok && !e.prio) continue;
      occ.push({ x0, y0, x1: x0 + w, y1: y0 + h });
      dessus.push({ k: e.k - 1000, img, x: Math.round(e.fx - img.width / 2), y: Math.round(e.fy + (y0 - e.fy) / f), alpha: e.av.alpha, ax: e.fx, ay: e.fy });
    }
    // --- effets : copie (clone), nuage (avatar provisoire remplacé) ---
    this.effets = this.effets.filter((e) => now - e.t0 < 1000);
    for (const e of this.effets) {
      const [x, y] = versArt(e.gx, e.gy);
      const u = (now - e.t0) / 1000;
      dessus.push({ k: e.gx + e.gy + 0.6, draw: (g) => (e.type === 'copie' ? effetCopie(g, x, y, u) : effetPouf(g, x, y, u)) });
    }
    // --- dossiers qui glissent sur la table ---
    for (const gl of this.glissements) {
      const u = Math.min(1, (now - gl.t0) / gl.duree);
      const gx = gl.de.x + (gl.a.x - gl.de.x) * u;
      const gy = gl.de.y + (gl.a.y - gl.de.y) * u;
      const [x, y] = versArt(gx, gy);
      dessus.push({ k: gx + gy + 0.5, draw: (g) => dossierVolant(g, x, y - 26 - Math.round(Math.sin(u * Math.PI) * 6), gl.couleur) });
    }
    // --- dossiers sur la table pendant la synthèse ---
    if (this.syn) {
      const cols = [];
      for (const id of this.syn.participants.keys()) {
        const t = S.taches.get(id);
        if (t && (t.etat === 'done' || t.etat === 'failed')) cols.push(couleurResultat(t));
      }
      const tb = carte.spots.reunion.table;
      const [tx, ty] = coinTuile(tb.x1, tb.y0);
      monde.push({ k: tb.x1 + tb.y0 + 1.01, draw: (g) => pileDossiers(g, tx, ty, cols, 24) });
    }
    return { monde, dessus };
  }

  trouver(ax, ay) {
    const liste = [...this.avatars.values()].filter((a) => a._boite && a.alpha > 0.3 && a.type !== 'fantome').sort((a, b) => b.gx + b.gy - (a.gx + a.gy));
    for (const av of liste) {
      const b = av._boite;
      if (ax >= b.x0 && ax <= b.x1 && ay >= b.y0 && ay <= b.y1) return av;
    }
    for (const b of this.boitesServices) {
      if (ax >= b.x0 && ax <= b.x1 && ay >= b.y0 && ay <= b.y1) return { type: 'service', serviceId: b.id };
    }
    for (const b of this.boitesOrdis || []) {
      if (ax >= b.x0 && ax <= b.x1 && ay >= b.y0 && ay <= b.y1) return { type: 'ordi', id: 'ordi', tacheId: b.tacheId };
    }
    const tb = this.boiteTableau;
    if (tb && ax >= tb.x0 && ax <= tb.x1 && ay >= tb.y0 && ay <= tb.y1) return { type: 'tableau', id: 'tableau', dossier: tb.dossier, etage: this.etageId };
    return null;
  }
}

// ---------- petits dessins ----------
// Trait pixel (pas à pas) d'épaisseur `ep`.
function trait(g, x0, y0, x1, y1, col, ep = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  g.fillStyle = col;
  for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), ep, ep);
}

function selectionAuSol(g, fx, fy, col, now) {
  // contour d'un losange au sol (sans effacer ce qui est dessous)
  const A = 26 + (Math.floor(now / 250) % 2) * 2;
  const top = fy - A / 2;
  g.fillStyle = col;
  for (let r = 0; r < A - 1; r++) {
    const w = r < A / 2 ? 2 * (r + 1) : 2 * A - 2 - 2 * r;
    g.fillRect(fx - w, top + r, 2, 1);
    g.fillRect(fx + w - 2, top + r, 2, 1);
  }
}

// Étincelles de copie (clone) autour d'un avatar.
function effetCopie(g, x, y, u) {
  const cols = ['#ffffff', '#7ff6ff', '#c4dcff'];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + u * 3;
    const r = 6 + u * 22;
    g.fillStyle = cols[i % 3];
    g.globalAlpha = Math.max(0, 1 - u);
    g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 26 + Math.sin(a) * r * 0.8), 2, 2);
  }
  g.globalAlpha = Math.max(0, 0.5 - u);
  g.fillStyle = '#ffffff';
  g.fillRect(x - 12, y - 52, 24, 52);
  g.globalAlpha = 1;
}

// Petit nuage qui se dissipe.
function effetPouf(g, x, y, u) {
  g.globalAlpha = Math.max(0, 0.9 - u);
  g.fillStyle = '#e8ecf6';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = 4 + u * 14;
    const t = 5 - Math.round(u * 3);
    g.fillRect(Math.round(x + Math.cos(a) * r) - 2, Math.round(y - 22 + Math.sin(a) * r * 0.7) - 2, t, t);
  }
  g.globalAlpha = 1;
}

function pileDossiers(g, tx, ty, couleurs, z0 = 26.5) {
  const P = projeteur(tx + 32, ty);
  couleurs.slice(-7).forEach((c, i) => {
    const z = z0 + i * 1.6;
    const d = (i % 2) * 0.03;
    poly(g, [P(0.28 + d, 0.36, z), P(0.72 + d, 0.36, z), P(0.72 + d, 0.74, z), P(0.28 + d, 0.74, z)], c);
    poly(g, [P(0.28 + d, 0.74, z), P(0.72 + d, 0.74, z), P(0.72 + d, 0.74, z - 1.2), P(0.28 + d, 0.74, z - 1.2)], nuance(c, -0.35));
    poly(g, [P(0.32 + d, 0.4, z + 0.3), P(0.66 + d, 0.4, z + 0.3), P(0.66 + d, 0.46, z + 0.3), P(0.32 + d, 0.46, z + 0.3)], '#ffffff');
  });
}

function dossierPlat(g, tx, ty, y0, col) {
  const P = projeteur(tx + 32, ty);
  poly(g, [P(0.56, y0, 24.6), P(0.84, y0, 24.6), P(0.84, y0 + 0.26, 24.6), P(0.56, y0 + 0.26, 24.6)], col);
  poly(g, [P(0.6, y0 + 0.03, 24.9), P(0.8, y0 + 0.03, 24.9), P(0.8, y0 + 0.08, 24.9), P(0.6, y0 + 0.08, 24.9)], '#ffffff');
}

function dossierVolant(g, x, y, col) {
  g.fillStyle = '#15151f';
  g.fillRect(x - 6, y - 5, 12, 10);
  g.fillStyle = col;
  g.fillRect(x - 5, y - 4, 10, 8);
  g.fillStyle = '#ffffff';
  g.fillRect(x - 4, y - 5, 7, 1);
  g.fillStyle = nuance(col, -0.3);
  g.fillRect(x - 5, y + 3, 10, 1);
}
