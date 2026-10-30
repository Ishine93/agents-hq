// Ordonnanceur : seule source de vérité sur l'état des tâches.
// Dépendances, plafonds, verrous d'écriture, passation, vérification, reprises, annulation.
// Le « moteur » (sessions Claude réelles ou simulation) est injecté par index.js.
import fs from 'node:fs';
import path from 'node:path';
import { REGLAGES, RACINE, etage as trouverEtage, etages as tousLesEtages, racines, modeFable } from './config.js';
import { etat, majDossier, changerEtatTache, majTache, message, majDg, emettre, alerte, effacerDossier, cacherDossier, montrerDossier } from './bus.js';
import { canUseToolPour, refuserPour, demander } from './permissions.js';
import { validerTaches, compteDg } from './dg.js';
import { reglageDg, consignesActuelles, consigneTache, sansPrefixe, prefixeModele, choisirProduction, choisirVerif, chargerPriorites, pauseCompte, leverPauseCompte, pauseDe, surPauses, motifPause, viderPauses, enDemo, multiIa, heureReprise, fournisseurDuModele, comptesDisponibles } from './routeur.js';
import { promptProduction, promptRework, compteTache } from './taches.js';
import { ERREURS_FATALES } from './session.js';
import { trouverCompte, chargerComptes, dossierConfig, fournisseur as fournisseurDuCompte, adaptateur as adaptateurDuCompte } from './comptes.js';
import { transfererConversation } from './transfert-conversation.js';
import { sauverPiecesUtilisateur, piecePublique } from './pieces.js';
import { notifier, notificationResolue } from './notifications.js';
import { enregistrerReemploi, surLimitesLues, oublierDossier as oublierDossierConso, quotaFable, lireLimites, limitesDe, annoterConso, donneesConso } from './conso.js';
import { demanderDecision, abandonnerDecisionsPour } from './decisions.js';
import { estimerDossier, resumePublic, texteEstimation, texteCoutFable, demarrerCalibrage, jetonsDe, reserveAtteinte, pointsHorsQg, bilanDossier, texteBilan } from './estimation.js';
import { skillsAttribuables } from './skills.js';
import { recruter, reembaucher, occuper, liberer, agent as agentEquipe, tirerPrenom, libererPrenom } from './equipe.js';
import { t as tr } from './i18n.js';
import { verdictEffectif, repriseVerif } from './economie.js';
import { travailDossier, profilEffectif, verificationProfil, missionDirecte, nomProfil } from './travail.js';
import { verificationsEtage, promptReworkControles, raisonControle } from './controles.js';
import { cheminRegistre, ecrireRegistre, noterParole, evenementRelecture } from './registre.js';

const notifierQuestionDg = (d) =>
  notifier({ id: `QD-${d.id}`, type: 'question', titre: tr('Le DG a une question'), texte: d.question, dossier: d.id, etage: d.etages[0] || 'direction', actions: [{ id: 'repondre', libelle: tr('Répondre') }] });

// Nom lisible d'un compte pour les messages (le compte a pu être retiré entre-temps).
const nomCompte = (id) => {
  const c = trouverCompte(id);
  return c && c.id === id ? c.nom : id || tr('le compte');
};

const ACTIFS = new Set(['briefing', 'running', 'permission', 'verifying', 'rework']);
const TERMINAUX = new Set(['done', 'failed', 'cancelled', 'skipped', 'interrupted']);
const ECHECS = new Set(['failed', 'cancelled', 'skipped', 'interrupted']);

let moteur = null;
let compteurDossiers = 0;
const controleurs = new Map(); // tacheId → AbortController
// projet → ensemble de tâches qui y écrivent. Les tâches d'un même dossier partagent le projet (le DG
// garantit qu'elles ne touchent pas les mêmes fichiers) ; un autre dossier attend que le projet se libère.
const verrous = new Map();
const reveils = new Map(); // dossierId → { evenements, minuterie }
// Réveil du DG en échec (réseau pas encore revenu après une veille du PC, session coupée…) : nouvel essai après
// ces délais, puis une notification te demande de lui écrire. (QG_DELAIS_REVEIL_DG : délais d'essai, en ms)
const DELAIS_REVEIL_DG = (process.env.QG_DELAIS_REVEIL_DG || '60000,300000,900000').split(',').map(Number);
const essaisReveil = new Map(); // dossierId → réveils ratés d'affilée
const dgOccupe = new Set(); // dossiers dont le DG travaille
const canaux = new Map(); // tacheId → { injecter(texte) } tant que sa session productrice tourne
let minuteriePause = null;
// Plusieurs IA (D4) : une limite d'usage ou une déconnexion met en pause le compte concerné, pas tout le QG.
// Les tâches de ce compte attendent ; les autres continuent, de la même IA ou non (deux comptes Claude suffisent,
// 1.0.7). Démo, un seul compte connecté, ou quota.pause « globale » : pause de tout le QG (pauseGlobale).
const minuteriesComptes = new Map(); // compteId → minuterie de levée à la remise à zéro
let minuterieAttente = null;
let pausesVues = new Map(); // compteId → type de sa pause (pour dire pourquoi il reprend)
const pauseParCompte = () => !enDemo() && chargerPriorites().quota?.pause !== 'globale' && (multiIa() || comptesDisponibles().length > 1);
const motifCompte = (id) => {
  const c = trouverCompte(id);
  return motifPause(c && c.id === id ? c : null, pauseDe(id) || { type: 'quota' }, id);
};
const surClaude = (id) => {
  const c = trouverCompte(id);
  return !c || c.id !== id || fournisseurDuCompte(c) === 'claude';
};

export function initialiser(m, dernierId) {
  moteur = m;
  compteurDossiers = dernierId;
}

const tachesDe = (d) => [...etat.taches.values()].filter((t) => t.dossier === d.id);
const tacheRef = (d, ref) => etat.taches.get(`${d.id}-${ref}`);
const numRef = (t) => Number(t.ref.slice(1));
// projet d'une tâche (verrous d'écriture, départs espacés) ; une demande directe travaille dans le dossier choisi à l'envoi
const cleProjet = (t) => (t.x?.direct ? etat.dossiers.get(t.dossier)?.direct?.cwd : trouverEtage(t.etage)?.projet)?.toLowerCase();
const etageDg = (d) => (d.etages.length === 1 ? d.etages[0] : 'direction');

function tableau(d) {
  return tachesDe(d)
    .sort((a, b) => numRef(a) - numRef(b))
    .map((t) => `${t.ref} [${t.etat}] ${t.titre} — étage ${t.etage} — ${t.modele}/${t.effort}${t.resultat ? ` — ${t.resultat.status} : ${t.resultat.summary}` : ''}`)
    .join('\n');
}

// ---------------------------------------------------------------- dossiers

// skills : choisis à l'envoi ([{id, pour: 'dg' | 'tous' | 'demande'}]) ; skillsExclus : skills de partout à ne pas utiliser ici.
// scenario : grand scénario de la démo (simulation), choisi par la démo elle-même
export function creerDossier({ texte, etageAffiche, compte, compteAgents = null, compteImpose = null, dg = null, pieces = [], skills = [], skillsExclus = [], scenario = null, travail = null, departA = null }) {
  const e = trouverEtage(etageAffiche);
  const reglage = reglageDg();
  const d = {
    id: `D${++compteurDossiers}`,
    texte,
    titre: texte.length > 50 ? texte.slice(0, 49) + '…' : texte,
    compte,
    // compte qui exécute les tâches (Réglages › Comptes IA › Agents de la demande) ; null = celui de la demande
    compteAgents: compteAgents && compteAgents !== compte ? compteAgents : null,
    // plusieurs IA : compte choisi sur la demande pour toutes ses tâches (jamais remplacé sans ton accord)
    ...(compteImpose ? { compteImpose } : {}),
    // DG : compte (routeur.choisirDg ; absent : celui de la demande), modèle et effort de Réglages › Priorités › DG,
    // figés à l'envoi
    dg: { ...(dg?.compte ? { compte: dg.compte } : {}), modele: dg?.modele || reglage.modele, effort: dg?.effort || reglage.effort },
    // consignes de l'utilisateur au DG (générale et par type de tâche), figées à l'envoi
    consignes: consignesActuelles(),
    travail: travailDossier(travail?.cout), // coût figé à l'envoi : niveau, ou Personnalisé avec ses valeurs du moment
    etat: 'planification',
    etages: e?.actif && e.projet && e.id !== 'direction' ? [e.id] : [],
    question: null,
    synthese: null,
    creeLe: Date.now(),
    etageAffiche: etageAffiche || 'hall',
    skills,
    skillsExclus,
    x: { dgSession: null, essaisPlan: 0, syntheseEnCours: false, pieces: [], complementsEnAttente: [], ...(scenario ? { scenario } : {}) },
  };
  // départ programmé (1.0.11) : la demande attend son heure, rien n'est consommé d'ici là
  if (departA && departA > Date.now() + 60000) Object.assign(d, { etat: 'programme', departA });
  majDossier(d);
  const jointes = joindre(d, pieces);
  message(d.id, 'toi', texte, d.etages.length ? d.etages : ['hall'], jointes.map(piecePublique));
  if (d.etat === 'programme') {
    message(d.id, 'systeme', tr('Demande programmée : le DG commencera à {heure}.', { heure: quandReprise(d.departA) }));
    armerDepart(d);
  } else planifierDossier(d, {});
  return d;
}

// ---------------------------------------------------------------- départ programmé (1.0.11)
const departs = new Map(); // dossierId → minuterie

function armerDepart(d) {
  clearTimeout(departs.get(d.id));
  const m = setTimeout(() => lancerMaintenant(d), Math.max(0, (d.departA || 0) - Date.now()));
  m.unref?.();
  departs.set(d.id, m);
}

/** Une demande programmée part tout de suite (son heure est venue, ou « Lancer maintenant »). */
export function lancerMaintenant(d) {
  clearTimeout(departs.get(d.id));
  departs.delete(d.id);
  if (d.etat !== 'programme') return false;
  d.etat = 'planification';
  majDossier(d);
  message(d.id, 'systeme', tr('Départ de la demande : le DG commence.'));
  planifierDossier(d, {});
  return true;
}

// ---------------------------------------------------------------- demandes directes (1.0.10)
// L'utilisateur parle à UN agent, sans DG : son texte part tel quel, avec le compte, le modèle et l'effort choisis à
// l'envoi (jamais remplacés). L'agent travaille à l'isoloir ; ses réponses arrivent dans le fil du dossier. Un message
// ajouté au dossier continue la même conversation (une tâche par tour : T1, T2…).
export const ETAGE_DIRECT = 'isoloir';

// Dossier de travail : le projet de l'étage affiché à l'envoi, sinon le seul étage de projet, sinon le premier dossier
// racine, sinon le bac à sable.
function lieuDirect(etageAffiche) {
  const projet = (e) => e && e.actif !== false && e.projet && e.id !== 'direction';
  const projets = tousLesEtages().filter(projet);
  const e = [trouverEtage(etageAffiche)].find(projet) || (projets.length === 1 ? projets[0] : null);
  if (e) return { etage: e.id, cwd: e.projet, dossiersSup: (e.dossiers || []).filter((x) => x !== e.projet) };
  const r = racines()[0];
  if (r) return { etage: null, cwd: r, dossiersSup: [] };
  const bac = projets.find((x) => x.type === 'bac') || null;
  return { etage: bac?.id || null, cwd: bac?.projet || RACINE, dossiersSup: [] };
}

export function creerDossierDirect({ texte, etageAffiche, compte, modele, effort = null, pieces = [], skills = [], skillsExclus = [], travail = null }) {
  const lieu = lieuDirect(etageAffiche);
  const reglage = reglageDg();
  const d = {
    id: `D${++compteurDossiers}`,
    texte,
    titre: texte.length > 50 ? texte.slice(0, 49) + '…' : texte,
    compte,
    compteAgents: null,
    compteImpose: compte, // jamais d'autre compte que celui choisi
    direct: { modele, effort, ...lieu },
    dg: { modele: reglage.modele, effort: reglage.effort }, // (aucun appel au DG : gardé pour l'affichage commun)
    consignes: consignesActuelles(),
    travail: travailDossier(travail?.cout),
    etat: 'en_cours',
    etages: [ETAGE_DIRECT],
    question: null,
    synthese: null,
    creeLe: Date.now(),
    etageAffiche: etageAffiche || 'hall',
    skills,
    skillsExclus,
    x: { dgSession: null, essaisPlan: 0, syntheseEnCours: false, pieces: [], complementsEnAttente: [], modePlan: 'direct-utilisateur' },
  };
  majDossier(d);
  const jointes = joindre(d, pieces);
  message(d.id, 'toi', texte, d.etages, jointes.map(piecePublique));
  ajouterTacheDirecte(d, texte, jointes);
  return d;
}

// Un tour de la conversation : une tâche à l'isoloir, qui reprend la conversation du tour d'avant (même agent si
// possible).
// Gardien du contexte (1.0.10) : réglage du dossier (figé à l'envoi avec son coût) ; registre refait à chaque étape.
const gardienDe = (d) => (d && !d.direct ? profilEffectif(d).gardien || 'non' : 'non');
function majRegistre(d) {
  if (gardienDe(d) !== 'non') ecrireRegistre(d, tachesDe(d));
}

function ajouterTacheDirecte(d, texte, jointes = []) {
  const avant = tachesDe(d).sort((a, b) => numRef(a) - numRef(b));
  const prec = avant[avant.length - 1] || null;
  const agentPrec = prec?.agent ? agentEquipe(prec.agent) : null;
  const ref = `T${avant.length + 1}`;
  const t = {
    id: `${d.id}-${ref}`,
    dossier: d.id,
    ref,
    titre: texte.length > 60 ? texte.slice(0, 59) + '…' : texte,
    etage: ETAGE_DIRECT,
    nature: 'direct',
    modele: d.direct.modele,
    effort: d.direct.effort,
    modeleReel: null,
    effortReel: null,
    etat: 'ready',
    attend: [],
    motifFile: null,
    inputsFrom: [],
    dernierOutil: null,
    derniereActivite: null,
    verif: { mode: 'self', modele: null },
    resultat: null,
    tentative: 1,
    debut: null,
    fin: null,
    sousAgents: 0,
    x: {
      prompt: texte,
      piecesTache: jointes.map((p) => ({ chemin: p.chemin, nom: p.nom })),
      doneWhen: [],
      verification: { mode: 'self' },
      deps: [],
      profil: 'edition',
      justification: null,
      risque: 'low',
      approuvee: true,
      consignes: [],
      session: null,
      sortie: null,
      reprise: null,
      reworks: 0,
      relances: 0,
      gen: 0,
      enAttenteDg: false,
      agentDemande: agentPrec && agentPrec.etat !== 'retire' ? agentPrec.id : '',
      skills: [],
      iaDemandee: null,
      compteDemande: null,
      direct: true,
      resumeDirect: prec?.x.session || null, // la conversation continue même si l'agent d'avant n'est plus là
    },
    skills: [],
    agent: null,
    reembauche: false,
    prenom: agentPrec && agentPrec.etat !== 'retire' ? agentPrec.prenom : tirerPrenom(),
  };
  majTache(t, null);
  emettre('plan', {
    dossier: d.id,
    taches: tachesDe(d).sort((a, b) => numRef(a) - numRef(b)).map((x) => ({ ref: x.ref, titre: x.titre, etage: x.etage, deps: [], modele: x.modele, effort: x.effort, estimation: null })),
    estimation: null,
  }, d.id);
  setImmediate(tick);
  return t;
}

const promptDirect = (t) => {
  const pieces = t.x.piecesTache || [];
  if (!pieces.length) return t.x.prompt;
  return [t.x.prompt, '', "Images jointes par l'utilisateur (lis-les avec Read) :", ...pieces.map((p) => `- ${p.chemin}${p.nom ? ` (${p.nom})` : ''}`)].join('\n');
};

// Message ajouté à une demande directe : pendant le tour, il arrive à l'agent tout de suite si son IA le permet
// (sinon juste après) ; après, il ouvre le tour suivant de la même conversation.
function completerDirect(d, texte, pieces) {
  const jointes = joindre(d, pieces);
  message(d.id, 'toi', texte, d.etages, jointes.map(piecePublique));
  const enCours = tachesDe(d).find((t) => !TERMINAUX.has(t.etat));
  if (enCours) {
    const suite = { texte, pieces: jointes };
    const differer = () => {
      d.x.complementsEnAttente.push(suite);
      message(d.id, 'systeme', tr('{nom} finit sa réponse : ton message part juste après, dans la même conversation.', { nom: enCours.prenom || enCours.ref }), d.etages);
    };
    const canal = ['running', 'permission'].includes(enCours.etat) ? canaux.get(enCours.id) : null;
    if (!canal?.injecter) return differer();
    canal.injecter(promptDirect({ x: { prompt: texte, piecesTache: jointes } })).then(
      (ok) => (ok ? message(d.id, 'systeme', tr('Message transmis en direct à {nom}.', { nom: enCours.prenom || enCours.ref }), d.etages) : differer()),
      () => differer(),
    );
    return;
  }
  d.etat = 'en_cours';
  d.synthese = null;
  majDossier(d);
  ajouterTacheDirecte(d, texte, jointes);
}

// Fin d'un tour : la réponse de l'agent part dans le fil, la tâche se termine (aucun vérificateur).
function finDirect(t, d, r) {
  t.sousAgents = 0;
  if (r.echec) return gererEchec(t, d, r, 'production');
  const texte = r.texte || tr('(pas de réponse écrite)');
  const resume = texte.replace(/\s+/g, ' ').trim();
  t.x.sortie = { status: 'done', summary: resume.length > 280 ? resume.slice(0, 279) + '…' : resume, changedFiles: [], artifacts: [], handoffNotes: '', questionsForDg: [], selfCheck: [] };
  message(d.id, 'agent', texte, d.etages, [], { nom: t.prenom || t.ref, tache: t.id, reponse: true });
  terminer(t, 'done', t.x.sortie);
}

// Enregistre les images envoyées par le site et les ajoute aux pièces du dossier.
function joindre(d, pieces) {
  if (!pieces?.length) return [];
  const sauvees = sauverPiecesUtilisateur(d.id, pieces);
  d.x.pieces.push(...sauvees);
  return sauvees;
}

const promptComplement = (textes) =>
  [
    "COMPLÉMENT DE L'UTILISATEUR (transmis par le DG pendant ta mission) :",
    ...textes.map((x) => `- ${x}`),
    '',
    'Intègre-le à ton travail (reprends ce qui doit l’être), revérifie les critères, puis rends ta sortie structurée complète.',
  ].join('\n');

// Complément de l'utilisateur sur un dossier existant (il avait oublié une info, il précise…).
export function completer(d, texte, pieces = []) {
  if (d.etat === 'annule') throw new Error(tr('Ce dossier est annulé : envoie une nouvelle demande.'));
  if (d.direct) return completerDirect(d, texte, pieces);
  if (d.etat === 'clarification') return repondre(d, texte, pieces);
  const jointes = joindre(d, pieces);
  message(d.id, 'toi', texte, d.etages.length ? d.etages : ['hall'], jointes.map(piecePublique));
  noterParole(d, 'complement', texte);
  majRegistre(d);
  if (d.etat === 'planification') {
    d.x.complementsEnAttente.push({ texte, pieces: jointes });
    message(d.id, 'systeme', tr('Le DG prépare encore son plan : il prendra ce complément en compte dès que le plan sera prêt.'));
    return;
  }
  if (d.etat === 'termine' || d.etat === 'echec') {
    d.etat = 'en_cours';
    d.x.syntheseEnCours = false;
    majDossier(d);
  }
  reveilDG(d, { type: 'utilisateur', texte, pieces: jointes }, 0);
}

async function planifierDossier(d, opts) {
  if (attendreCompteDg(d, () => planifierDossier(d, opts), `${d.id}:plan`)) return;
  dgOccupe.add(d.id);
  majDg({ etat: 'reflechit', dossier: d.id, etage: 'direction', action: 'plan' });
  let r;
  try {
    r = await moteur.planifier(d, opts);
  } catch (e) {
    r = { echec: String(e?.message || e) };
  }
  dgOccupe.delete(d.id);
  majDg({ etat: 'libre', dossier: d.id, action: null });
  if (d.etat === 'annule') return;
  if (r.echec) return echecDg(d, r, () => planifierDossier(d, opts));

  const p = r.sortie;
  if (p.titre) d.titre = p.titre;
  if (p.clarification?.trim()) {
    d.etat = 'clarification';
    d.question = p.clarification.trim();
    majDossier(d);
    majDg({ action: 'question' });
    message(d.id, 'dg', d.question);
    notifierQuestionDg(d);
    return;
  }
  const profil = profilEffectif(d);
  const mode = p.mode === 'direct' ? 'direct' : 'plan';
  d.x.relectureDemandee = p.relectureDemandee === true;
  const erreurs = validerTaches(p.taches, [], { profil, mode });
  // B4 : en direct, la tâche reçoit la demande telle que tapée, se vérifie elle-même et ne dépend de rien
  if (mode === 'direct' && !erreurs.length) {
    const [x] = p.taches;
    x.prompt = missionDirecte(d.texte, x.prompt);
    x.deps = [];
    x.inputsFrom = [];
    x.verification = { ...x.verification, mode: 'self' };
    d.x.modePlan = 'direct';
  }
  // demande qui n'était qu'une création de skill : le DG l'a faite lui-même, pas de tâche, le dossier est fini
  if (!p.taches.length && d.x.skillsCrees?.length && !erreurs.length) {
    d.etat = 'termine';
    d.synthese = p.message || tr('Skill créé.');
    majDossier(d);
    message(d.id, 'dg', d.synthese);
    return;
  }
  if (!p.taches.length) erreurs.push('Le plan est vide.');
  // le plan affiché montre la vérification qui aura vraiment lieu (IA si la validation par toi est coupée)
  for (const x of p.taches) x.verification = verificationEffective(x, d);
  if (erreurs.length) {
    if (d.x.essaisPlan++ < 2) return planifierDossier(d, { erreurs });
    d.etat = 'echec';
    majDossier(d);
    message(d.id, 'dg', tr("Je n'arrive pas à produire un plan valide : {erreurs}", { erreurs: erreurs.join(' ; ') }));
    return;
  }
  d.etat = 'en_cours';
  d.question = null;
  ajouterTaches(d, p.taches);
  message(d.id, 'dg', p.message);
  for (const c of d.x.complementsEnAttente.splice(0)) reveilDG(d, { type: 'utilisateur', ...c }, 0);
  tick();
}

function echecDg(d, r, reessayer) {
  if (ERREURS_FATALES.has(r.erreur)) {
    d.etat = 'echec';
    majDossier(d);
    const nom = nomCompte(compteDg(d));
    alerte('erreur', tr('{nom} non connecté ou problème de facturation : reconnecte-le dans Réglages › Comptes IA', { nom }), d.id);
    message(d.id, 'systeme', tr("Le DG n'a pas pu démarrer ({erreur}). Reconnecte {nom} dans Réglages › Comptes IA puis renvoie ta demande.", { erreur: r.erreur, nom }));
    return;
  }
  if (r.erreur === 'rate_limit' || r.limite) {
    const jusqua = finLimite(r.limite);
    const id = compteDg(d);
    if (pauseParCompte()) {
      // D4 : seul le compte du DG s'arrête ; le DG reprend quand ce compte reprend
      message(d.id, 'systeme', tr("Limite d'usage de {nom} : le DG reprend vers {heure}.", { nom: nomCompte(id), heure: quandReprise(jusqua) }));
      mettreCompteEnPause(id, { type: 'quota', jusqua, raison: tr("Limite d'usage atteinte") });
      relanceDg(d, id, reessayer, jusqua);
      return;
    }
    message(d.id, 'systeme', tr("Limite d'usage atteinte : le DG reprend vers {heure}.", { heure: quandReprise(jusqua) }));
    pauseGlobale(tr("Limite d'usage atteinte"), jusqua, { limite: true, compte: id });
    // Le DG repart à la remise à zéro, ou plus tôt si la pause est levée (forfait changé, « Reprendre »).
    relanceDg(d, null, reessayer, jusqua);
    return;
  }
  d.etat = 'echec';
  majDossier(d);
  message(d.id, 'systeme', tr('Le DG a échoué : {raison}', { raison: r.echec }));
}

// Vérification « par toi » (goût, visuel, gameplay) : seulement si tu l'as demandé dans les réglages.
// Sinon un vérificateur IA s'en charge, avec ses critères : le dossier va de A à Z sans t'attendre.
// Puis le profil de travail du dossier (B5) : self ou agent selon verifDefaut, vérificateur borné.
function verificationEffective(p, d) {
  const v = verificationUtilisateur(p.verification);
  // une validation « par toi » devenue IA reste un vérificateur séparé (goût, visuel : le self ne suffit pas)
  const relecture = d?.x?.relectureDemandee === true || v?.depuisUtilisateur === true;
  // ajustement : texte affiché sur le site, donc dans la langue de l'interface
  return verificationProfil({ ...p, verification: v }, profilEffectif(d), { relecture, langue: REGLAGES.langueInterface === 'en' ? 'en' : 'fr' });
}

function verificationUtilisateur(v) {
  if (v?.mode !== 'user' || REGLAGES.validationUtilisateur === true) return v;
  return {
    ...v,
    mode: 'agent',
    depuisUtilisateur: true,
    modele: v.modele || 'sonnet',
    effort: v.effort || 'medium',
    maxRework: Math.max(1, v.maxRework || 0),
    checks: [...(v.checks || []), "Le résultat correspond à ce qui était demandé (rendu, visuel, gameplay) : juge sur des preuves (fichiers, captures, tests), pas sur l'intention."],
  };
}

function ajouterTaches(d, liste) {
  const nouvelles = [];
  const attribuables = new Set(skillsAttribuables(d));
  for (const p0 of liste) {
    const p = { ...p0, verification: verificationEffective(p0, d), skills: (p0.skills || []).filter((id) => attribuables.has(id)) };
    const t = {
      id: `${d.id}-${p.ref}`,
      dossier: d.id,
      ref: p.ref,
      titre: p.titre.length > 60 ? p.titre.slice(0, 59) + '…' : p.titre,
      etage: p.etage,
      nature: p.nature,
      modele: sansPrefixe(p.modele),
      effort: p.effort,
      modeleReel: null,
      effortReel: null,
      etat: 'planned',
      attend: [],
      motifFile: null,
      inputsFrom: p.inputsFrom,
      dernierOutil: null,
      derniereActivite: null,
      verif: { mode: p.verification.mode, modele: p.verification.modele, ...(p.verification.ajustement ? { ajustement: p.verification.ajustement } : {}) },
      resultat: null,
      tentative: 1,
      debut: null,
      fin: null,
      x: {
        prompt: p.prompt,
        doneWhen: p.doneWhen,
        verification: p.verification,
        deps: p.deps,
        profil: p.etage === 'direction' ? 'lecture' : p.profil,
        justification: p.justification,
        risque: p.risque,
        approuvee: !p.approbation,
        consignes: [],
        session: null,
        sortie: null,
        reprise: null,
        reworks: 0,
        relances: 0,
        gen: 0,
        enAttenteDg: false,
        agentDemande: p.agent || '',
        skills: p.skills,
        // plusieurs IA : IA ou compte demandés par le DG (« fournisseur:modele » vaut une IA demandée)
        iaDemandee: p.ia && p.ia !== 'auto' ? p.ia : prefixeModele(p.modele),
        compteDemande: p.compte || null,
      },
      skills: p.skills, // affichés dans la fiche
      raisonModele: p.justification || null, // pourquoi ce modèle et cet effort (fiche, plan ; 1.0.11)
      agent: null, // id de l'agent qui porte la tâche (réserve : A1, A2…)
      reembauche: false,
      // Prénom affiché dès le plan : celui de l'agent de la réserve demandé, sinon celui de la future recrue.
      prenom: (() => {
        const a = p.agent ? agentEquipe(p.agent) : null;
        return a && a.etat !== 'retire' && a.compte === d.compte ? a.prenom : tirerPrenom();
      })(),
    };
    majTache(t, null);
    nouvelles.push(t);
  }
  const garde = gardeFable(d, nouvelles).catch((e) => console.error('garde Fable', e.message));
  d.etages = [...new Set(tachesDe(d).map((t) => t.etage))];
  // C1 : estimation du plan, et accord demandé au-delà du seuil du profil (jamais bloquant sans estimation)
  const accord = preparerAccord(d, nouvelles, poserEstimation(d));
  annoncerFable(d, nouvelles);
  avertirSansGardeFou(d);
  majDossier(d);
  emettre('plan', {
    dossier: d.id,
    taches: tachesDe(d)
      .sort((a, b) => numRef(a) - numRef(b))
      .map((t) => ({ ref: t.ref, titre: t.titre, etage: t.etage, deps: t.x.deps.map((x) => x.ref), modele: t.modele, effort: t.effort, estimation: t.estimation || null, raisonModele: t.raisonModele || null })),
    estimation: d.estimation || null,
  }, d.id);
  if (accord) accorderCout(d, garde).catch((e) => console.error('accord coût', e.message));
  majRegistre(d);
}

// ---------------------------------------------------------------- garde-fou Fable
// Fable a sa propre limite (semaine). Quand le DG prévoit des tâches sur Fable et qu'il en reste peu,
// on te demande (une seule fois pour tout le plan) s'il faut le garder ou passer sur Opus ; sans réponse,
// elles passent sur Opus au bout de quelques minutes. Fable épuisé : Opus directement. Le reste du plan
// continue pendant ce temps : un dossier n'est jamais bloqué par Fable.
const ATTENTE_FABLE_MS = Number(process.env.QG_ATTENTE_FABLE_MS) || 10 * 60 * 1000; // (réglable pour les tests)
const estFable = (t) => /fable/i.test(t.modele || '');

// Personnalisé sans aucun garde-fou de dépense (1.0.11) : dit une fois, au premier plan du dossier.
function avertirSansGardeFou(d) {
  const p = profilEffectif(d);
  if (p.cout !== 'personnalise' || d.x.averti1011 || p.seuilAccordFenetre != null || p.plafondTacheFacteur != null || p.maxCompactions != null) return;
  d.x.averti1011 = true;
  message(d.id, 'systeme', tr('Profil Personnalisé sans garde-fou de dépense : ni accord avant lancement, ni plafond par tâche, ni limite de compactions. Ce dossier peut consommer beaucoup sans te demander (Réglages › Coût).'));
}

// Au lancement du plan (1.0.11) : les tâches que le DG met sur Fable, sa raison pour chacune, et leur coût comparé à
// Opus. Pour information : le dossier continue (seul le garde-fou, s'il est réglé pour, te demande quelque chose).
function annoncerFable(d, nouvelles) {
  const fable = nouvelles.filter((t) => estFable(t) && !TERMINAUX.has(t.etat));
  if (!fable.length) return;
  const raisons = fable.map((t) => (t.raisonModele ? `${t.ref} : ${t.raisonModele}` : t.ref)).join(' ; ');
  const cout = texteCoutFable(d.estimation);
  message(d.id, 'systeme', tr('Le DG met {n} tâche(s) sur Fable. {raisons}.', { n: fable.length, raisons }) + (cout ? ' ' + cout : ''));
}

function basculerOpus(t, raison) {
  if (!estFable(t)) return;
  t.x.modeleAvant = t.modele;
  t.modele = 'opus';
  majTache(t);
  message(t.dossier, 'systeme', tr('{ref} passe de Fable à Opus : {raison}.', { ref: t.ref, raison }), [t.etage]);
}

async function gardeFable(d, taches) {
  const g = REGLAGES.gardeFable || {};
  const mode = modeFable(g);
  const fable = taches.filter(estFable);
  if (!fable.length || mode === 'off') return;
  if (mode === 'jamais') {
    // le DG ne se voit plus proposer Fable ; reste le cas d'un plan fait avant le changement de réglage
    for (const t of fable) if (!TERMINAUX.has(t.etat)) basculerOpus(t, tr('tu as choisi de ne jamais utiliser Fable'));
    return;
  }
  for (const t of fable) t.x.gardeFable = 'attente';
  await null; // l'appelant pose d'abord l'estimation du plan (d.estimation), dont la question donne le coût
  let q = quotaFable(d.compte);
  if (!q || Date.now() - (q.lu || 0) > 5 * 60 * 1000) {
    await lireLimites(d.compte).catch(() => null);
    q = quotaFable(d.compte);
  }
  const liberer = (opus, raison) => {
    for (const t of fable) {
      if (opus && !TERMINAUX.has(t.etat)) basculerOpus(t, raison);
      t.x.gardeFable = 'ok';
    }
    tick();
  };
  // quota inconnu (démo, clé API…) : on ne bloque rien, sauf si tu as demandé à être consulté à chaque fois
  if (!q && mode !== 'toujours') return liberer(false);
  if (q && q.reste <= 0) return liberer(true, tr('Fable est épuisé pour cette semaine'));
  const seuil = g.resteMin ?? 30;
  if (mode === 'seuil' && q.reste >= seuil) return liberer(false);
  const refs = fable.map((t) => t.ref).join(', ');
  const min = ATTENTE_FABLE_MS / 60000;
  const quand = q?.reinit ? new Date(q.reinit).toLocaleString(REGLAGES.langueInterface === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : '—';
  const cout = texteCoutFable(d.estimation);
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), ATTENTE_FABLE_MS);
  const choix = await demanderDecision(fable[0], {
    question: [
      tr('Le DG a prévu {n} tâche(s) sur Fable ({refs}).', { n: fable.length, refs }),
      q ? tr('Il te reste environ {reste} % de ta semaine Fable (remise à zéro {quand}).', { reste: q.reste, quand }) : null,
      cout || null,
      tr('On garde Fable ? Sans réponse dans {min} min, elles passent sur Opus.', { min }),
    ].filter(Boolean).join(' '),
    options: [{ libelle: tr('Garder Fable') }, { libelle: tr('Passer sur Opus') }],
    brut: true,
  }, ctrl.signal);
  clearTimeout(minuterie);
  if (choix === 'O1') return liberer(false);
  if (choix === 'O2') return liberer(true, q ? tr('ton choix (il restait {reste} % de Fable)', { reste: q.reste }) : tr('ton choix'));
  liberer(true, mode === 'seuil' ? tr('pas de réponse, il ne restait que {reste} % de Fable', { reste: q.reste }) : tr('pas de réponse en {min} min', { min }));
}

export function repondre(d, texte, pieces = []) {
  notificationResolue(`QD-${d.id}`);
  if (d.etat !== 'clarification') throw new Error(tr("Le DG n'attend pas de réponse sur ce dossier."));
  const jointes = joindre(d, pieces);
  message(d.id, 'toi', texte, null, jointes.map(piecePublique));
  noterParole(d, 'reponse', d.question ? `${d.question}\n→ ${texte}` : texte);
  d.question = null;
  majRegistre(d);
  if (!tachesDe(d).length) {
    d.etat = 'planification';
    majDossier(d);
    planifierDossier(d, { reponse: texte, pieces: jointes });
  } else {
    d.etat = 'en_cours';
    majDossier(d);
    reveilDG(d, { type: 'utilisateur', texte: `Réponse à ta question : ${texte}`, pieces: jointes }, 0);
  }
}

export function annulerDossier(d) {
  if (['termine', 'annule', 'echec'].includes(d.etat)) return;
  clearTimeout(departs.get(d.id)); // départ programmé (1.0.11)
  departs.delete(d.id);
  d.etat = 'annule';
  notificationResolue(`QD-${d.id}`);
  majDossier(d);
  abandonnerDecisionsPour(new Set(tachesDe(d).map((t) => t.id)));
  for (const t of tachesDe(d)) annulerTache(t, false);
  message(d.id, 'systeme', tr('Dossier annulé.'));
  majDg({ etat: 'libre', dossier: d.id, action: null });
}

// Suppression complète (dossier lancé par erreur…) : on l'arrête s'il tourne encore et il disparaît de l'écran tout
// de suite. Il n'est effacé pour de bon (tâches, plan, messages, journal, pièces jointes) que 30 s plus tard (1.0.8) :
// « Annuler la suppression » le fait revenir d'ici là. Contrairement à l'annulation, il ne reste ensuite aucune trace.
export const DELAI_SUPPRESSION_MS = Number(process.env.QG_DELAI_SUPPRESSION_MS) || 30000; // variable : pour les tests
const suppressions = new Map(); // dossier → minuterie de l'effacement pour de bon

export function supprimerDossier(d, delai = DELAI_SUPPRESSION_MS) {
  if (suppressions.has(d.id)) return { delai: Math.max(0, d.supprimeLe + delai - Date.now()) };
  if (!['termine', 'annule', 'echec'].includes(d.etat)) d.x.arreteParSuppression = true;
  annulerDossier(d);
  const r = reveils.get(d.id);
  if (r) {
    clearTimeout(r.minuterie);
    reveils.delete(d.id);
  }
  for (const t of tachesDe(d)) {
    t.x.gen += 1;
    controleurs.get(t.id)?.abort();
    libererVerrou(t);
    notificationResolue(`V-${t.id}`);
  }
  notificationResolue(`QD-${d.id}`);
  if (etat.dg.dossier === d.id) majDg({ etat: 'libre', dossier: null, action: null });
  cacherDossier(d);
  const minuterie = setTimeout(() => effacerPourDeBon(d.id), delai);
  minuterie.unref?.(); // serveur arrêté avant la fin du délai : reprendreDossiers() finit le travail au prochain lancement
  suppressions.set(d.id, minuterie);
  tick();
  return { delai };
}

/** « Annuler la suppression » : le dossier revient tel qu'il était (arrêté s'il tournait). Faux s'il est déjà effacé. */
export function annulerSuppression(d) {
  const minuterie = suppressions.get(d.id);
  if (!minuterie) return false;
  clearTimeout(minuterie);
  suppressions.delete(d.id);
  montrerDossier(d);
  message(d.id, 'systeme', d.x.arreteParSuppression
    ? tr('Suppression annulée : le dossier est revenu. Il était en cours et a été arrêté : pour reprendre ce travail, envoie une nouvelle demande.')
    : tr('Suppression annulée : le dossier est revenu.'));
  delete d.x.arreteParSuppression;
  return true;
}

function effacerPourDeBon(id) {
  suppressions.delete(id);
  if (!etat.dossiers.get(id)?.supprimeLe) return;
  effacerDossier(id);
  oublierDossierConso(id);
}

// ---------------------------------------------------------------- planification des lancements

function depsEtat(t) {
  const d = etat.dossiers.get(t.dossier);
  const manque = [];
  const bloquePar = [];
  let bloque = null;
  for (const dep of t.x.deps) {
    const amont = tacheRef(d, dep.ref);
    if (!amont) {
      manque.push(dep.ref);
      continue;
    }
    // Amont en échec : la tâche attend (le DG peut relancer l'amont) au lieu d'être sautée tout de suite.
    if (ECHECS.has(amont.etat)) {
      manque.push(dep.ref);
      if (!amont.x.enAttenteDg) bloquePar.push(dep.ref);
      continue;
    }
    if (amont.etat !== 'done') {
      manque.push(dep.ref);
      continue;
    }
    if (dep.besoin === 'artifact') {
      const f = path.join(trouverEtage(amont.etage).projet, dep.artefact);
      let taille = 0;
      try {
        taille = fs.statSync(f).size;
      } catch {
        taille = 0;
      }
      if (!taille) {
        manque.push(dep.ref);
        bloquePar.push(`${dep.ref} (artefact ${dep.artefact} absent)`);
      }
    }
  }
  return { manque, bloque, bloquePar };
}

// Compte qui exécute (ou exécutera) la tâche : celui de son lancement s'il est connu, sinon celui de son dossier.
function idCompteDeTache(u) {
  if (ACTIFS.has(u.etat) && u.compte) return u.compte;
  // compte choisi par le routeur au dernier passage (tâche en file)
  if (u.x?.route?.compte) return u.x.route.compte;
  const d = etat.dossiers.get(u.dossier);
  return d ? compteTache(d) : null;
}

// Une tâche qui attend ta validation n'occupe pas de session : elle ne compte pas dans les plafonds.
const occupeUnePlace = (u) => (ACTIFS.has(u.etat) || departsDifferes.has(u.id)) && !(u.etat === 'verifying' && u.x.verification.mode === 'user');

function motifAttente(t) {
  const actifs = [...etat.taches.values()].filter((u) => occupeUnePlace(u) && u.id !== t.id);
  // 0 (ou moins) = illimité : seules les dépendances et les verrous font attendre.
  if (REGLAGES.plafondGlobal > 0 && actifs.length >= REGLAGES.plafondGlobal) return `plafond atteint (${actifs.length} en cours)`;
  if (REGLAGES.plafondEtage > 0 && actifs.filter((u) => u.etage === t.etage).length >= REGLAGES.plafondEtage) return 'étage plein';
  // Plafond du compte (capacites().sessionsParCompte, ex. Codex abonnement : une session à la fois) : la tâche
  // attend dans la file au lieu de partir et d'attendre dans l'adaptateur.
  const resolus = new Map(); // un seul chargement des comptes par identifiant
  const compteDe = (u) => {
    const id = idCompteDeTache(u) ?? '';
    if (!resolus.has(id)) resolus.set(id, trouverCompte(id || null) || null);
    return resolus.get(id);
  };
  const compte = compteDe(t);
  const max = compte ? adaptateurDuCompte(compte)?.capacites?.(compte)?.sessionsParCompte : null;
  if (max >= 1) {
    const surCompte = actifs.filter((u) => compteDe(u)?.id === compte.id).length;
    if (surCompte >= max) return `${compte.nom} occupé (${surCompte} session${surCompte > 1 ? 's' : ''} en cours)`;
  }
  if (!t.x.profil.startsWith('lecture')) {
    const autres = [...(verrous.get(cleProjet(t)) || [])].map((id) => etat.taches.get(id)).filter((u) => u && u.id !== t.id && u.dossier !== t.dossier);
    if (autres.length) return `${trouverEtage(t.etage)?.nom} occupé par ${autres[0].dossier} (${autres[0].ref})`;
  }
  return null;
}

const ECART_DEPARTS_MS = 5000;
const departsDifferes = new Set(); // en mémoire seulement : un redémarrage relance normalement
let tickEnCours = false;
export function tick() {
  if (tickEnCours || etat.ordonnanceur.pause) return;
  tickEnCours = true;
  try {
    const candidats = [...etat.taches.values()]
      .filter((t) => ['planned', 'waiting', 'ready', 'queued'].includes(t.etat))
      .sort((a, b) => (etat.dossiers.get(a.dossier)?.creeLe ?? 0) - (etat.dossiers.get(b.dossier)?.creeLe ?? 0) || numRef(a) - numRef(b));
    const departs = new Map(); // A10 : départs du même tick sur le même projet
    for (const t of candidats) {
      const d = etat.dossiers.get(t.dossier);
      if (!d || d.etat !== 'en_cours' || departsDifferes.has(t.id)) continue;
      const { manque, bloque, bloquePar } = depsEtat(t);
      if (bloque) {
        terminer(t, 'skipped', { status: 'failed', summary: tr('Sautée : {raison}.', { raison: bloque }) });
        continue;
      }
      t.x.bloquePar = bloquePar;
      if (manque.length) {
        const motif = bloquePar.length ? `bloquée : ${bloquePar.join(', ')} en échec` : null;
        if (t.etat !== 'waiting' || t.attend.join() !== manque.join() || t.motifFile !== motif) changerEtatTache(t, 'waiting', { attend: manque, motifFile: motif });
        continue;
      }
      if (t.x.gardeFable === 'attente') continue;
      if (t.x.accordCout === 'attente') continue; // C1 : plan au-dessus du seuil, ton accord d'abord
      if (estFable(t) && !t.x.direct && modeFable() !== 'off' && (quotaFable(d.compte)?.reste ?? 100) <= 0) basculerOpus(t, tr('Fable est épuisé pour cette semaine'));
      if (!t.x.approuvee) {
        demanderApprobation(t);
        continue;
      }
      // compte de la tâche (routeur) : un compte en pause ou aucun compte apte → la tâche attend dans la file
      if (!router(t, d)) continue;
      const motif = motifAttente(t);
      if (motif) {
        if (t.etat !== 'queued' || t.motifFile !== motif) changerEtatTache(t, 'queued', { attend: [], motifFile: motif });
        continue;
      }
      const n = departs.get(cleProjet(t)) || 0;
      departs.set(cleProjet(t), n + 1);
      const delai = n * (REGLAGES.ecartDepartsMs ?? ECART_DEPARTS_MS);
      if (delai > 0) differerDepart(t, delai);
      else lancer(t);
    }
  } finally {
    tickEnCours = false;
  }
}

// A10 : quand plusieurs tâches partent ensemble sur le même projet, on les espace de 5 s pour que les
// suivantes lisent en cache le préfixe commun. La place est réservée pendant l'attente.
function differerDepart(t, delai) {
  departsDifferes.add(t.id);
  setTimeout(() => {
    departsDifferes.delete(t.id);
    const d = etat.dossiers.get(t.dossier);
    if (!etat.ordonnanceur.pause && d?.etat === 'en_cours' && ['planned', 'waiting', 'ready', 'queued'].includes(t.etat) && router(t, d) && !motifAttente(t)) lancer(t);
    else tick();
  }, delai).unref?.();
}

// ---------------------------------------------------------------- routage (plusieurs IA)

// Nouveau passage dans 30 s tant qu'une tâche attend un compte (filet : aucun événement ne la réveillerait)
function rearmer() {
  if (minuterieAttente) return;
  minuterieAttente = setTimeout(() => {
    minuterieAttente = null;
    tick();
  }, 30000);
  minuterieAttente.unref?.();
}

/**
 * Compte, modèle et effort de la tâche (routeur.choisirProduction), mémorisés dans t.x.route. Faux : la tâche
 * attend (compte en pause, aucun compte apte). Tout Claude sans priorités : le compte de la demande, avec le
 * modèle et l'effort du DG. Pas de bascule automatique, sauf si l'utilisateur l'a permise
 * (quota.bascule « auto », D4).
 */
function router(t, d) {
  if (enDemo()) return true;
  if (t.x.session && !t.x.compteSession) t.x.compteSession = t.compte || null;
  if (t.x.reprise?.phase === 'verification') {
    // vérification en attente : c'est le compte du vérificateur qui compte (routeur.choisirVerif)
    if (!pauseParCompte()) return true;
    const a = choisirVerif(t, d);
    return a.attente ? attendreRoute(t, d, a.attente) : true;
  }
  const r = calculerRoute(t, d);
  // demande directe : le compte, le modèle et l'effort choisis à l'envoi, jamais remplacés (ni bascule proposée)
  if (t.x.direct) {
    if (r.attente) return attendreRoute(t, d, { ...r.attente, proposition: null });
    t.x.route = { ...r.route, compte: r.route.compte || d.compte, modele: t.modele, effort: t.effort, justification: null, repli: false, bascule: null };
    return true;
  }
  if (r.attente) return attendreRoute(t, d, r.attente);
  t.x.route = r.route;
  return true;
}

/** La route que router() poserait maintenant : { route } ou { attente } (aucun effet sur la tâche). */
function calculerRoute(t, d) {
  const a = choisirProduction(t, d);
  if (a.attente) {
    // seulement des comptes Claude : la tâche prend le compte de la demande, même non connecté (l'échec dira de le reconnecter)
    if (a.attente.pause || multiIa() || (a.attente.compteBloque && a.attente.compteBloque !== compteTache(d))) return { attente: a.attente };
    return { route: { compte: compteTache(d), modele: t.modele, effort: t.effort } };
  }
  // seulement des comptes Claude : pas de repli vers un autre compte ; le compte de la demande, sinon le compte par défaut
  if (a.repli && !multiIa()) return { route: { compte: compteTache(d), modele: t.modele, effort: t.effort } };
  // Claude avec un modèle Claude : modèle et effort du DG tels quels
  const tel = (a.fournisseur || 'claude') === 'claude' && (fournisseurDuModele(t.modele) || 'claude') === 'claude';
  return { route: {
    compte: a.compte,
    fournisseur: a.fournisseur || null,
    modele: tel ? t.modele : a.modele,
    effort: tel ? t.effort : a.effort,
    justification: tel ? null : a.justification || null,
    repli: !!a.repli,
    bascule: a.bascule || null,
  } };
}

/**
 * Compte, modèle et effort qui feront la tâche : sa route si elle est déjà posée (t.x.route), sinon celle que
 * router() poserait maintenant (tâche pas encore lancée). Sert à l'estimation et à l'accord de coût (lot C).
 */
function routePrevue(t, d) {
  if (t.x.route?.compte) return t.x.route;
  const base = { compte: compteTache(d), modele: t.modele, effort: t.effort };
  if (enDemo()) return base;
  const r = calculerRoute(t, d);
  return r.route || { ...base, compte: r.attente?.compteBloque || base.compte };
}

/**
 * Vérificateur de la tâche (routeur.choisirVerif), mémorisé dans t.x.routeVerif. Seulement des comptes Claude
 * connectés : le premier compte de la liste « verif » qui est connecté, sinon le compte qui a fait la tâche (jamais
 * de repli vers un autre compte), avec le modèle et l'effort de la fiche. null : aucun compte ne peut vérifier
 * maintenant (compte en pause…) ; la vérification attend dans la file.
 */
function routerVerif(t, d) {
  const v = t.x.verification;
  if (enDemo()) return (t.x.routeVerif = { compte: compteTache(d), modele: v.modele, effort: v.effort });
  if (!multiIa()) {
    const c = choisirVerif(t, d);
    const compte = c.compte && !c.repli && !c.attente ? c.compte : t.compte || compteTache(d);
    // ce compte est en pause (pause d'un seul compte) : la vérification attend sa reprise
    if (pauseParCompte() && pauseDe(compte)) {
      libererVerrou(t);
      t.x.reprise = { phase: 'verification' };
      attendreRoute(t, d, c.attente?.pause ? c.attente : { motif: motifCompte(compte), compteBloque: compte, pause: pauseDe(compte), proposition: null });
      return null;
    }
    return (t.x.routeVerif = { compte, modele: v.modele, effort: v.effort });
  }
  const a = choisirVerif(t, d);
  if (a.attente) {
    libererVerrou(t);
    t.x.reprise = { phase: 'verification' };
    attendreRoute(t, d, a.attente);
    return null;
  }
  const tel = (a.fournisseur || 'claude') === 'claude' && (fournisseurDuModele(v.modele) || 'claude') === 'claude';
  t.x.routeVerif = {
    compte: a.compte,
    fournisseur: a.fournisseur || null,
    modele: tel ? v.modele : a.modele,
    effort: tel ? v.effort : a.effort,
    justification: tel ? null : a.justification || null,
    croise: !!a.croise,
    repli: !!a.repli,
    bascule: a.bascule || null,
  };
  // multi-IA : le compte du vérificateur sur la fiche de la tâche (badge du site)
  t.verif = { ...(t.verif || {}), compte: a.compte };
  return t.x.routeVerif;
}

function attendreRoute(t, d, a) {
  if (t.etat !== 'queued' || t.motifFile !== a.motif) changerEtatTache(t, 'queued', { attend: [], motifFile: a.motif });
  const bascule = chargerPriorites().quota?.bascule || 'demander';
  if (a.pause && a.proposition?.compte && bascule === 'auto') basculerSeul(d, a);
  else if (a.pause && a.proposition?.compte && bascule === 'demander') proposerBascule(t, d, a);
  rearmer();
  return false;
}

// D4 : un compte est en pause et un autre compte libre peut prendre ses tâches. Selon quota.bascule (Réglages ›
// Priorités) : « demander » (défaut), une carte « Attendre / Passer sur {compte} » par dossier et par compte en
// pause ; « auto », le dossier y passe tout seul ; « jamais », il attend. La bascule vaut pour ce dossier
// seulement et tombe quand le compte reprend.
const cartesBascule = new Map(); // `${dossier}:${compte}` → { ctrl, tache }
const cartesVues = new Set(); // une seule carte par dossier et par pause (pas de nouvelle carte après « Attendre »)
const basculesSeules = new Set(); // `${compte}|${dossier}|${vers}` : une seule fois par compte de remplacement et par pause

// « auto » : sans carte. Un compte de remplacement qui ne sait pas faire une autre tâche du dossier peut céder la
// place à un autre, mais chacun n'est pris qu'une fois par pause (pas d'aller-retour entre deux comptes).
function basculerSeul(d, a) {
  const cle = `${a.compteBloque}|${d.id}|${a.proposition.compte}`;
  if (basculesSeules.has(cle) || ['termine', 'annule', 'echec'].includes(d.etat)) return;
  basculesSeules.add(cle);
  const nom = nomCompte(a.compteBloque);
  const autre = a.proposition.nom || nomCompte(a.proposition.compte);
  const motif = a.motif.charAt(0).toUpperCase() + a.motif.slice(1);
  d.x = d.x || {};
  d.x.bascules = { ...(d.x.bascules || {}), [a.compteBloque]: a.proposition.compte };
  majDossier(d);
  message(d.id, 'systeme', tr('{motif}. Les tâches de ce dossier prévues sur {nom} passent toutes seules sur {autre} jusqu’à sa reprise (Réglages › Priorités › Autre compte libre).', { motif, nom, autre }));
  // on est dans le tick : la tâche repart au suivant
  setImmediate(tick);
}

function proposerBascule(t, d, a) {
  const cle = `${d.id}:${a.compteBloque}`;
  if (cartesVues.has(cle)) return;
  cartesVues.add(cle);
  const ctrl = new AbortController();
  cartesBascule.set(cle, { ctrl, tache: t.id });
  const nom = nomCompte(a.compteBloque);
  const autre = a.proposition.nom || nomCompte(a.proposition.compte);
  const quota = a.pause.type !== 'connexion';
  const motif = a.motif.charAt(0).toUpperCase() + a.motif.slice(1);
  const question = [
    tr('{motif}. Les tâches de ce dossier prévues sur {nom} attendent. Tu peux attendre ou les passer sur {autre}.', { motif, nom, autre }),
    quota ? tr("Attention : changer de compte pour contourner une limite peut être contraire aux conditions d'utilisation du fournisseur (OpenAI le déconseille).") : '',
    tr('Les agents changent de conversation : le contexte de la réserve est perdu.'),
  ].filter(Boolean).join(' ');
  const attendre = quota ? (a.pause.jusqua ? tr('Attendre la remise à zéro ({heure})', { heure: heureReprise(a.pause.jusqua) }) : tr('Attendre la remise à zéro')) : tr('Attendre la reconnexion');
  const choix = demanderDecision(t, { question, options: [{ libelle: attendre }, { libelle: tr('Passer ces tâches sur {compte}', { compte: autre }) }], brut: true }, ctrl.signal);
  // la carte n'occupe pas de place : la tâche reste dans la file
  changerEtatTache(t, 'queued', { attend: [], motifFile: a.motif });
  choix.then((r) => {
    if (cartesBascule.get(cle)?.ctrl === ctrl) cartesBascule.delete(cle);
    if (r === 'O1') message(d.id, 'systeme', tr('Les tâches prévues sur {nom} attendent sa reprise.', { nom }));
    if (r !== 'O2' || !pauseDe(a.compteBloque) || ['termine', 'annule', 'echec'].includes(d.etat)) return;
    d.x = d.x || {};
    d.x.bascules = { ...(d.x.bascules || {}), [a.compteBloque]: a.proposition.compte };
    majDossier(d);
    message(d.id, 'systeme', tr('Les tâches de ce dossier prévues sur {nom} passent sur {autre}, à ta demande, jusqu’à la reprise de {nom}.', { nom, autre }));
    tick();
  });
}

// Le compte reprend (ou la tâche de la carte est annulée) : la carte se ferme, la bascule acceptée tombe.
function fermerCartes(compte, { tache = null } = {}) {
  for (const [cle, c] of [...cartesBascule]) {
    if (tache ? c.tache !== tache : !cle.endsWith(`:${compte}`)) continue;
    cartesBascule.delete(cle);
    cartesVues.delete(cle);
    c.ctrl.abort();
  }
  if (tache) return;
  for (const cle of [...cartesVues]) if (cle.endsWith(`:${compte}`)) cartesVues.delete(cle);
  for (const cle of [...basculesSeules]) if (cle.startsWith(`${compte}|`)) basculesSeules.delete(cle);
  for (const d of etat.dossiers.values()) {
    if (!d.x?.bascules?.[compte]) continue;
    delete d.x.bascules[compte];
    majDossier(d);
  }
}

function demanderApprobation(t) {
  if (t.x.approbationEnCours) return;
  t.x.approbationEnCours = true;
  demander(t, 'Lancement', { __resume: tr('Lancer {ref} « {titre} » ({modele}/{effort}) ?', { ref: t.ref, titre: t.titre, modele: t.modele, effort: t.effort }) }).then((decision) => {
    t.x.approbationEnCours = false;
    if (decision === 'allow') {
      t.x.approuvee = true;
      tick();
    } else {
      terminer(t, 'cancelled', { status: 'failed', summary: tr('Lancement refusé par toi.') });
    }
  });
}

// ---------------------------------------------------------------- exécution

function lancer(t) {
  const d = etat.dossiers.get(t.dossier);
  if (!t.x.profil.startsWith('lecture')) {
    const cle = cleProjet(t);
    if (!verrous.has(cle)) verrous.set(cle, new Set());
    verrous.get(cle).add(t.id);
  }
  t.debut = t.debut || Date.now();
  let reprise = t.x.reprise;
  t.x.reprise = null;
  if (reprise?.phase === 'verification') {
    verification(t, d);
    return;
  }
  // la tâche change de compte (compte retiré, bascule acceptée) : entre deux comptes Claude, sa conversation la
  // suit (copiée dans le dossier du nouveau compte) ; sinon, nouvelle conversation
  const route = t.x.route;
  const idRoute = route?.compte ? trouverCompte(route.compte)?.id || route.compte : null;
  let conversationSuivie = false;
  if (idRoute && t.x.compteSession && idRoute !== t.x.compteSession && (reprise?.resume || t.x.session)) {
    const sessionId = reprise?.resume || t.x.session;
    if (suivreConversation(sessionId, t.x.compteSession, idRoute)) {
      conversationSuivie = true;
      t.x.compteSession = idRoute;
      message(d.id, 'systeme', tr('{ref} passe sur {compte} avec sa conversation : il reprend là où il s’était arrêté.', { ref: t.ref, compte: nomCompte(route.compte) }), [t.etage]);
    } else {
      message(d.id, 'systeme', tr('{ref} passe sur {compte} : nouvelle conversation (le contexte de la précédente est perdu).', { ref: t.ref, compte: nomCompte(route.compte) }), [t.etage]);
      reprise = null; // mission reprise depuis le début, dans une conversation neuve
      t.x.session = null;
      t.x.compteSession = null;
      t.x.agentDemande = '';
    }
  }
  // Qui fait la tâche : un agent de la réserve réembauché (ou cloné), sinon une nouvelle recrue.
  let resumeAgent = null;
  let fork = false;
  if (!t.agent) {
    const r = t.x.agentDemande ? reembaucher(t.x.agentDemande, t, d) : null;
    if (t.x.agentDemande && !r && !t.x.direct) message(d.id, 'systeme', tr("{agent} n'est pas réembauchable pour {ref} : nouvelle recrue.", { agent: t.x.agentDemande, ref: t.ref }), [t.etage]);
    if (r) {
      t.agent = r.agent.id;
      t.reembauche = true;
      enregistrerReemploi(r.agent.contexte);
      resumeAgent = r.resume;
      fork = r.fork;
    } else {
      t.agent = recruter(t, d).id;
    }
  } else {
    // l'agent suit sa tâche sur son nouveau compte (avec sa conversation si elle a été copiée)
    const ag = agentEquipe(t.agent);
    if (ag && t.x.route?.compte && ag.compte !== t.x.route.compte) Object.assign(ag, { compte: t.x.route.compte, session: conversationSuivie ? ag.session : null });
    occuper(t.agent, t);
  }
  const amonts = t.inputsFrom.map((ref) => [ref, tacheRef(d, ref)]).filter(([, u]) => u?.x.sortie);
  changerEtatTache(t, reprise?.phase === 'rework' ? 'rework' : 'briefing', { attend: [], motifFile: null });
  if (amonts.length && !reprise) emettre('passation', { de: amonts.map(([, u]) => u.id), a: t.id }, d.id);
  let prompt = reprise ? reprise.prompt : t.x.direct ? promptDirect(t) : promptProduction(t, amonts.map(([r, u]) => [r, u.x.sortie]), d.x.pieces || [], consigneTache(t, d), gardienDe(d) !== 'non' ? cheminRegistre(d.id) : null);
  if (t.x.direct && !reprise && !resumeAgent && t.x.resumeDirect) resumeAgent = t.x.resumeDirect;
  if (resumeAgent && !reprise && !t.x.direct) {
    prompt = `NOUVELLE MISSION, confiée par le DG. Tu as déjà travaillé sur ce projet : ton contexte passé reste valable, mais cette mission est indépendante de la précédente.\n\n${prompt}`;
  }
  executerProduction(t, d, prompt, reprise?.resume || resumeAgent, { fork: fork && !reprise });
}

/**
 * Copie la conversation `sessionId` du compte `de` vers le compte `vers` : seulement entre deux comptes Claude
 * encore présents dans la liste (un compte retiré n'a plus de dossier connu). Vrai si elle est prête sur `vers`.
 */
export function suivreConversation(sessionId, de, vers) {
  const { comptes } = chargerComptes();
  const source = comptes.find((c) => c.id === de);
  const cible = comptes.find((c) => c.id === vers);
  if (!source || !cible || fournisseurDuCompte(source) !== 'claude' || fournisseurDuCompte(cible) !== 'claude') return false;
  const r = transfererConversation({ sessionId, de: dossierConfig(source), vers: dossierConfig(cible) });
  if (!r.ok) console.warn(`[QG] conversation ${sessionId} non copiée de ${de} vers ${vers} : ${r.raison}`);
  return r.ok;
}

async function executerProduction(t, d, prompt, resume, { fork = false } = {}) {
  const gen = t.x.gen;
  const ctrl = new AbortController();
  controleurs.set(t.id, ctrl);
  const canal = {};
  canaux.set(t.id, canal);
  // compte IA et fournisseur qui exécutent la tâche (badge dans le site)
  const idRoute = t.x.route?.compte || compteTache(d);
  const compteExec = trouverCompte(idRoute);
  t.compte = compteExec?.id || idRoute || null;
  t.fournisseur = compteExec ? fournisseurDuCompte(compteExec) : null;
  // pourquoi ce compte et ce modèle (fiche de la tâche) : seulement quand le routeur a changé quelque chose
  const r0 = t.x.route;
  if (r0?.justification || r0?.repli || r0?.bascule) t.routage = { justification: r0.justification || null, repli: !!r0.repli, bascule: r0.bascule || null };
  else delete t.routage;
  let r;
  try {
    // appel de méthode (pas détachée) : le moteur de la démo se sert de this
    r = await moteur[t.x.direct ? 'produireDirect' : 'produire'](t, d, {
      prompt,
      resume,
      fork,
      canal,
      abortController: ctrl,
      canUseTool: canUseToolPour(t),
      surInit: (init) => {
        if (t.x.gen !== gen) return;
        t.x.session = init.session_id || t.x.session;
        if (init.session_id) t.x.compteSession = t.compte;
        changerEtatTache(t, t.etat === 'rework' ? 'rework' : 'running', { modeleReel: init.model || null, effortReel: t.x.route ? t.x.route.effort : t.effort, derniereActivite: Date.now() });
      },
      surOutil: (nom, cible) => {
        if (t.x.gen !== gen) return;
        t.dernierOutil = { nom, cible };
        t.derniereActivite = Date.now();
        emettre('outil', { tache: t.id, nom, cible }, d.id);
      },
      surActivite: () => {
        if (t.x.gen !== gen) return;
        t.derniereActivite = Date.now();
        emettre('activite', { tache: t.id }, d.id);
      },
      surCompaction: ({ declencheur, avant }) => {
        if (t.x.gen !== gen) return;
        t.x.compactions = (t.x.compactions || 0) + 1;
        emettre('compaction', { tache: t.id, declencheur, avant }, d.id);
        publierMesures(t);
        // garde-fou (1.0.7) : trop de compactions dans la même tâche, elle s'arrête (suite à la fin de la session)
        const max = profilEffectif(d).maxCompactions;
        // (demande directe : pas de DG pour redécouper, l'agent continue comme dans Claude Code)
        if (max >= 1 && t.x.compactions >= max && !t.x.arretCompactions && !t.x.direct) {
          t.x.arretCompactions = t.x.compactions;
          message(d.id, 'systeme', tr('{ref} : {n} compactions de contexte dans la même tâche, le garde-fou l’arrête. Le DG va la redécouper.', { ref: t.ref, n: t.x.compactions }), [t.etage]);
          ctrl.abort();
        }
      },
      surContexte: (n) => {
        if (t.x.gen !== gen) return;
        mesurerContexte(t, n);
      },
      // sous-agents lancés par l'agent (outil Agent) : ils apparaissent aux postes libres de son étage
      surSousAgents: (n) => {
        if (t.x.gen !== gen) return;
        t.sousAgents = n;
        emettre('sousagents', { tache: t.id, n }, d.id);
      },
    });
  } catch (e) {
    r = { echec: String(e?.message || e) };
  }
  controleurs.delete(t.id);
  canaux.delete(t.id);
  if (t.x.gen !== gen || TERMINAUX.has(t.etat)) return; // annulée ou arrêt d'urgence entre-temps
  if (r.sessionId) {
    t.x.session = r.sessionId;
    t.x.compteSession = r.compte || t.compte;
  }
  if (r.contexte != null) t.x.contexte = r.contexte;
  // ce que l'agent a écarté sans échouer (agent ACP : serveur MCP ignoré, modèle ou effort refusé…) : dit dans le fil
  if (r.avertissements?.length) message(d.id, 'systeme', tr('{nom} ({ref}) : {avertissements}.', { nom: t.prenom || t.ref, ref: t.ref, avertissements: r.avertissements.slice(0, 5).join(' ; ') }), [t.etage]);
  if (t.x.arretSilence) return relancerApresSilence(t, d);
  if (t.x.arretCompactions) return arretCompactions(t, d, r);
  if (t.x.direct) return finDirect(t, d, r);
  if (r.echec) return gererEchec(t, d, r, t.etat === 'rework' ? 'rework' : 'production');
  t.x.sortie = r.sortie;
  if (await roundComplement(t, d)) return;
  if (r.sortie.status !== 'done') {
    const q = r.sortie.questionsForDg?.length ? ` Questions : ${r.sortie.questionsForDg.join(' | ')}` : '';
    terminer(t, 'failed', r.sortie);
    reveilDG(d, `${t.ref} a rendu « ${r.sortie.status} » : ${r.sortie.summary}${q}`);
    return;
  }
  await verification(t, d);
}

// Garde-fou des compactions (1.0.7, Coût › Compactions max par tâche) : la tâche relisait, résumait et relisait sans
// avancer, ou elle était trop grosse pour un seul agent. Elle s'arrête et le DG la redécoupe tout seul, sans attendre
// l'utilisateur (dossiers lancés sans personne devant l'écran).
function arretCompactions(t, d, r) {
  libererVerrou(t);
  const n = t.x.arretCompactions;
  delete t.x.arretCompactions;
  terminer(t, 'failed', { ...(r.sortie || {}), status: 'failed', summary: tr('Arrêtée par le garde-fou après {n} compactions de contexte', { n }) });
  reveilDG(d, `${t.ref} a été arrêtée par le garde-fou : ${n} compactions de contexte dans la même tâche (limite du réglage Coût). Elle tournait en rond (lire, résumer, relire) ou elle était trop grosse pour un seul agent. Ne la relance pas telle quelle : découpe ce qu'il reste à faire en tâches plus petites et plus précises, en t'appuyant sur ce qu'elle a déjà fait (fichiers modifiés, résumé), ou accepte l'état actuel s'il suffit.`);
}

// ---------------------------------------------------------------- agent sans signe de vie (1.0.8)
// Une session qui ne donne plus aucun signe (ni message, ni outil) depuis longtemps est bloquée : commande qui
// attend une saisie, serveur qui ne rend pas la main, réseau coupé. Le chien de garde l'arrête et la reprend dans
// la même conversation, deux fois au plus ; la troisième, la tâche échoue et le DG décide de la suite.
// Une commande de Claude Code dure au plus 10 minutes : 30 minutes de silence ne sont jamais du travail normal.
const silenceMaxMs = () => (Number(REGLAGES.silenceMaxMinutes) > 0 ? Number(REGLAGES.silenceMaxMinutes) : 30) * 60000;
const MAX_SILENCES = 2;
// session → dernier moment où elle n'avait pas à parler : vue pour la première fois, ou en attente de ta réponse
const reperesSilence = new WeakMap();

/** Appelé chaque minute (index.js) : arrête les sessions de production muettes depuis trop longtemps. */
export function surveillerSilences(maintenant = Date.now()) {
  if (enDemo()) return 0;
  let n = 0;
  for (const [id, ctrl] of controleurs) {
    const t = etat.taches.get(id);
    if (!t || ctrl.signal.aborted) continue;
    // une autorisation qui attend ta réponse n'est pas un silence : le compte repart quand tu as répondu
    if (!reperesSilence.has(ctrl) || !['running', 'rework'].includes(t.etat)) {
      reperesSilence.set(ctrl, maintenant);
      continue;
    }
    if (t.x.arretSilence) continue;
    const depuis = Math.max(t.derniereActivite || 0, reperesSilence.get(ctrl));
    if (maintenant - depuis < silenceMaxMs()) continue;
    t.x.arretSilence = Math.round((maintenant - depuis) / 60000);
    message(t.dossier, 'systeme', tr('{ref} ne donne plus signe de vie depuis {n} min : le chien de garde arrête sa session et la reprend.', { ref: t.ref, n: t.x.arretSilence }), [t.etage]);
    ctrl.abort();
    n++;
  }
  return n;
}

function relancerApresSilence(t, d) {
  libererVerrou(t);
  const minutes = t.x.arretSilence;
  delete t.x.arretSilence;
  t.x.silences = (t.x.silences || 0) + 1;
  if (t.x.silences > MAX_SILENCES || !t.x.session) {
    terminer(t, 'failed', { status: 'failed', summary: tr('Arrêtée par le chien de garde : plus de signe de vie ({n} fois)', { n: t.x.silences }) });
    reveilDG(d, `${t.ref} a été arrêtée par le chien de garde : sa session ne donnait plus aucun signe de vie (${t.x.silences} fois, plus de ${minutes} min chaque fois). Une commande bloquait sans doute (serveur qui ne rend pas la main, attente d'une saisie, réseau). Regarde ce qu'elle a déjà fait, puis relance-la avec une consigne qui évite ce blocage (délai maximum, commande en arrière-plan), découpe-la, ou accepte l'état actuel.`);
    return;
  }
  t.x.reprise = {
    phase: t.etat === 'rework' ? 'rework' : 'production',
    resume: t.x.session,
    prompt: `Ta session ne donnait plus aucun signe de vie depuis ${minutes} minutes : le QG l'a arrêtée, puis la reprend ici. Vérifie où tu en étais (fichiers modifiés, commandes lancées). Si une commande bloquait (serveur qui ne rend pas la main, attente d'une saisie au clavier, réseau), ne la relance pas telle quelle : mets-lui un délai maximum, ou lance-la en arrière-plan. Termine la mission, puis rends ta sortie structurée complète.`,
  };
  changerEtatTache(t, 'ready', { motifFile: null });
  tick();
}

// Un complément est arrivé alors que la session ne pouvait plus le recevoir (fin de tour, vérification) :
// on reprend la même conversation avec ce complément avant de considérer la tâche finie.
async function roundComplement(t, d) {
  if (!t.x.aTransmettre?.length) return false;
  const textes = t.x.aTransmettre.splice(0);
  changerEtatTache(t, 'rework', { motifFile: null });
  await executerProduction(t, d, promptComplement(textes), t.x.session);
  return true;
}

// Consigne de l'utilisateur adressée directement à un agent (fiche de l'agent), sans passer par le DG.
export async function consigneDirecte(t, texte) {
  const d = etat.dossiers.get(t.dossier);
  if (!d) return;
  message(d.id, 'toi', tr('Consigne pour {nom} : {texte}', { nom: t.prenom || t.ref, texte }), [t.etage], [], { tache: t.id });
  await informer(d, t, texte);
}

// Transmet un complément de l'utilisateur à une tâche, quel que soit son état.
async function informer(d, t, texte) {
  t.x.consignes.push(texte); // pour tout lancement ou relance futur
  if (['planned', 'waiting', 'ready', 'queued'].includes(t.etat)) {
    message(d.id, 'systeme', tr('{ref} recevra ce complément dans sa mission.', { ref: t.ref }), [t.etage]);
    return;
  }
  if (['briefing', 'running', 'permission', 'rework'].includes(t.etat)) {
    const ok = await canaux.get(t.id)?.injecter?.(promptComplement([texte]));
    if (ok) {
      message(d.id, 'systeme', tr('Complément transmis en direct à {ref}.', { ref: t.ref }), [t.etage]);
      return;
    }
    (t.x.aTransmettre = t.x.aTransmettre || []).push(texte);
    message(d.id, 'systeme', tr('{ref} recevra ce complément dès la fin de son tour.', { ref: t.ref }), [t.etage]);
    return;
  }
  if (t.etat === 'verifying') {
    (t.x.aTransmettre = t.x.aTransmettre || []).push(texte);
    message(d.id, 'systeme', tr('{ref} est en vérification : le complément sera intégré juste après.', { ref: t.ref }), [t.etage]);
    return;
  }
  // Tâche finie (ou en échec) : on reprend sa conversation avec le complément.
  Object.assign(t.x, { reworks: 0, relances: 0, enAttenteDg: false, aTransmettre: [] });
  t.x.reprise = t.x.session ? { phase: 'production', resume: t.x.session, prompt: promptComplement([texte]) } : null;
  t.x.gen += 1;
  t.tentative += 1;
  changerEtatTache(t, 'ready', { resultat: null, fin: null });
  message(d.id, 'systeme', tr('{ref} est reprise pour intégrer le complément.', { ref: t.ref }), [t.etage]);
}

async function verification(t, d) {
  // tâche planifiée avant que tu coupes la validation par toi : elle passe aussi à un vérificateur IA
  if (t.x.verification?.mode === 'user' && REGLAGES.validationUtilisateur !== true) {
    t.x.verification = verificationUtilisateur(t.x.verification);
    t.verif = { mode: t.x.verification.mode, modele: t.x.verification.modele };
  }
  const v = t.x.verification;
  const sortie = t.x.sortie;
  if (v.mode === 'none') return terminer(t, 'done', sortie);
  if (v.mode === 'self') {
    const ko = sortie.selfCheck.filter((c) => !c.ok);
    if (!ko.length) return terminer(t, 'done', sortie);
    if (t.x.reworks < v.maxRework) return rework(t, d, { issues: ko.map((c) => ({ gravite: 'bloquant', detail: `Critère non rempli : ${c.critere} (${c.preuve})`, fichier: '' })) });
    terminer(t, 'failed', { ...sortie, status: 'failed', summary: tr('Critères non remplis : {criteres}', { criteres: ko.map((c) => c.critere).join(' ; ') }) });
    reveilDG(d, `${t.ref} : critères non remplis après corrections.`);
    return;
  }
  changerEtatTache(t, 'verifying');
  if (v.mode === 'user') {
    emettre('verification', { tache: t.id, phase: 'debut', verificateur: { modele: 'toi' }, verdict: null }, d.id);
    message(d.id, 'systeme', tr("{ref} « {titre} » attend ta validation (fiche de l'agent).", { ref: t.ref, titre: t.titre }), [t.etage]);
    notifier({ id: `V-${t.id}`, type: 'validation', titre: tr('{ref} attend ta validation', { ref: t.ref }), texte: t.titre, dossier: d.id, tache: t.id, etage: t.etage, actions: [{ id: 'pass', libelle: tr('Valider') }, { id: 'fail', libelle: tr('Refuser') }] });
    return;
  }
  // B9 : contrôles déterministes de la fiche du projet, lancés par le serveur avant le vérificateur
  const rv = routerVerif(t, d);
  if (!rv) return;
  const ctl = await controlesDeterministes(t, d);
  if (ctl?.abandon) return;
  if (ctl && !ctl.ok) return echecControles(t, d, ctl.echec);
  emettre('verification', { tache: t.id, phase: 'debut', verificateur: { modele: rv.modele, compte: rv.compte }, verdict: null }, d.id);
  const gen = t.x.gen;
  const ctrl = new AbortController();
  controleurs.set(t.id, ctrl);
  let r;
  try {
    // A3 : après un rework, on reprend la session du vérificateur si son cache est encore chaud (< 55 min)
    // jamais la session d'un autre compte (vérificateur passé sur un autre compte entre-temps)
    const reprise = !t.x.compteVerif || t.x.compteVerif === rv.compte ? repriseVerif(t.x) : null;
    r = await moteur.verifier(t, d, sortie, {
      abortController: ctrl,
      resume: reprise,
      surActivite: () => {
        t.derniereActivite = Date.now();
        emettre('activite', { tache: t.id }, d.id);
      },
    });
  } catch (e) {
    r = { echec: String(e?.message || e) };
  }
  controleurs.delete(t.id);
  if (t.x.gen !== gen || TERMINAUX.has(t.etat)) return;
  if (r.echec) return gererEchec(t, d, r, 'verification');
  if (r.sessionId) {
    t.x.verifSession = r.sessionId;
    t.x.compteVerif = rv.compte;
  }
  t.x.verifFin = Date.now();
  const verdict = verdictEffectif(r.verdict);
  t.x.dernierVerdict = verdict;
  emettre('verification', { tache: t.id, phase: 'fin', verificateur: { modele: rv.modele, compte: rv.compte }, verdict: verdict.verdict }, d.id);
  if (verdict.verdict === 'pass') {
    if (await roundComplement(t, d)) return;
    // remarques mineures d'un rework sans bloquant : notées dans le résultat (A9)
    if (verdict.reworkSansBloquant) return terminer(t, 'done', { ...sortie, remarquesVerif: verdict.issues || [] });
    return terminer(t, 'done', sortie);
  }
  if (verdict.verdict === 'rework' && t.x.reworks < v.maxRework) return rework(t, d, verdict);
  terminer(t, 'failed', { ...sortie, status: 'failed', summary: tr('Rejet du vérificateur : {raison}', { raison: verdict.issues.map((i) => i.detail).join(' ; ') || verdict.preuve }) });
  reveilDG(d, `${t.ref} rejetée par le vérificateur (${verdict.verdict}) : ${verdict.issues.map((i) => `[${i.gravite}] ${i.detail}`).join(' ; ')}`);
}

async function rework(t, d, verdict, prompt = promptRework(verdict)) {
  t.x.reworks += 1;
  if (pauseParCompte() && t.compte && pauseDe(t.compte)) {
    // compte en pause entre-temps (D4) : la reprise attend qu'il reprenne
    libererVerrou(t);
    t.x.reprise = t.x.session ? { phase: 'rework', resume: t.x.session, prompt } : null;
    changerEtatTache(t, 'queued', { motifFile: motifCompte(t.compte) });
    setImmediate(tick);
    return;
  }
  changerEtatTache(t, 'rework');
  await executerProduction(t, d, prompt, t.x.session);
}

// B9 : d'autres tâches écrivent-elles encore dans le même projet ? Leur travail inachevé ferait échouer
// une suite qui couvre tout le projet : on laisse alors le vérificateur seul juger.
function autresEcrivent(t) {
  return [...(verrous.get(cleProjet(t)) || [])]
    .map((id) => etat.taches.get(id))
    .some((u) => u && u.id !== t.id && ['briefing', 'running', 'permission', 'rework'].includes(u.etat));
}

// Lance les commandes de la fiche (jamais celles du plan ni d'un agent). null : rien à lancer.
async function controlesDeterministes(t, d) {
  t.x.controles = null;
  const e = trouverEtage(t.etage);
  const commandes = e?.projet ? verificationsEtage(e) : [];
  if (!commandes.length || typeof moteur.controler !== 'function') return null;
  if (autresEcrivent(t)) {
    message(d.id, 'systeme', tr("{ref} : contrôles du projet sautés, d'autres agents y travaillent encore ; le vérificateur juge seul.", { ref: t.ref }), [t.etage]);
    return null;
  }
  const gen = t.x.gen;
  const ctrl = new AbortController();
  controleurs.set(t.id, ctrl);
  let r;
  try {
    r = await moteur.controler(t, d, commandes, { cwd: e.projet, signal: ctrl.signal });
  } catch (err) {
    r = { ok: false, resultats: [], echec: { commande: commandes[0], ok: false, code: null, duree: 0, sortie: String(err?.message || err) } };
  }
  controleurs.delete(t.id);
  if (t.x.gen !== gen || TERMINAUX.has(t.etat)) return { abandon: true };
  t.x.controles = { ok: r.ok, date: Date.now(), resultats: r.resultats.map(({ commande, code, duree, delaiDepasse }) => ({ commande, code, duree, delaiDepasse: !!delaiDepasse })) };
  t.verif = { ...t.verif, controles: r.ok ? 'passes' : 'echec' };
  majTache(t, t.etat);
  if (r.ok) message(d.id, 'systeme', tr('{ref} : contrôles du projet passés ({n}/{n}), place au vérificateur.', { ref: t.ref, n: r.resultats.length }), [t.etage]);
  return r;
}

// Un contrôle a échoué : correction directe avec sa sortie, sans session de vérification (un rework compté).
function echecControles(t, d, echec) {
  const v = t.x.verification;
  const raison = raisonControle(echec, REGLAGES.langueInterface === 'en');
  if (t.x.reworks < v.maxRework) {
    message(d.id, 'systeme', tr('{ref} : le contrôle « {commande} » a échoué ({raison}) : correction, sans vérificateur.', { ref: t.ref, commande: echec.commande, raison }), [t.etage]);
    return rework(t, d, null, promptReworkControles(echec));
  }
  terminer(t, 'failed', { ...t.x.sortie, status: 'failed', summary: tr('Contrôle du projet échoué : {commande} ({raison})', { commande: echec.commande, raison }) });
  reveilDG(d, `${t.ref} : le contrôle déterministe de la fiche du projet « ${echec.commande} » échoue encore après corrections (${raisonControle(echec)}). Extrait :
${(echec.sortie || '').slice(-1500)}`);
}

function finLimite(limite) {
  const r = limite?.resetsAt;
  if (!r) return Date.now() + 15 * 60 * 1000;
  return r < 1e12 ? r * 1000 : r;
}

function gererEchec(t, d, r, phase) {
  libererVerrou(t);
  if (r.plafondAtteint) {
    // B6 : plafond de la tâche atteint — pas un échec technique ; le DG choisit la suite
    const montant = typeof r.plafondAtteint === 'number' ? r.plafondAtteint.toFixed(2) : '?';
    t.x.reprise = repriseDe(t, phase, r.echec);
    if (r.sessionId) t.x.sessionPlafond = r.sessionId;
    terminer(t, 'failed', { status: 'failed', summary: tr('Plafond atteint ({montant} $)', { montant }) });
    reveilDG(d, `${t.ref} a atteint son plafond de coût (${montant} $). Trois choix : relancer en reprenant sa session avec un plafond plus haut (op relancer, consigne « plafond N $ »), accepter l'état actuel (op accepter), ou découper le reste en nouvelles tâches.`);
    return;
  }
  // compte qui a échoué : celui de la session (vérificateur sur un autre compte, tâche routée), sinon la base
  const idCompte = r.compte || (phase === 'verification' ? t.x.routeVerif?.compte : null) || t.compte || compteTache(d);
  const parCompte = pauseParCompte();
  if (r.erreur === 'authentication_failed' || r.erreur === 'billing_error') {
    const nom = nomCompte(r.compte || compteTache(d));
    if (parCompte) {
      // D4 : seul ce compte s'arrête ; ses tâches attendent la reconnexion, les autres continuent
      mettreCompteEnPause(idCompte, { type: 'connexion', raison: tr('{nom} non connecté ou problème de facturation', { nom }) });
      alerte('erreur', tr('Reconnecte {nom} dans Réglages › Comptes IA.', { nom }), d.id);
      t.x.reprise = repriseDe(t, phase, r.echec);
      changerEtatTache(t, 'queued', { motifFile: motifCompte(idCompte) });
      setImmediate(tick);
      return;
    }
    pauseGlobale(tr('{nom} non connecté ou problème de facturation', { nom }), null);
    alerte('erreur', tr('Reconnecte {nom} (Réglages › Comptes IA) puis clique sur Reprendre.', { nom }), d.id);
    t.x.reprise = repriseDe(t, phase, r.echec);
    changerEtatTache(t, 'queued', { motifFile: 'compte à vérifier' });
    return;
  }
  if (ERREURS_FATALES.has(r.erreur)) {
    // profil refusé par le fournisseur, rôle non pris en charge, binaire absent : inutile de réessayer
    terminer(t, 'failed', { status: 'failed', summary: tr('Impossible sur ce compte : {raison}', { raison: r.echec }) });
    reveilDG(d, `${t.ref} ne peut pas tourner sur ${nomCompte(r.compte || compteTache(d))} : ${r.echec}`);
    return;
  }
  if ((r.erreur === 'rate_limit' || r.limite) && estFable(t) && modeFable() !== 'off' && (!parCompte || surClaude(idCompte))) {
    // limite de Fable (sa fenêtre à lui) : on relit les limites ; si c'est bien Fable qui est épuisé, la
    // tâche repart sur Opus, dans sa propre conversation, sans mettre le QG en pause
    const cl = parCompte ? idCompte : d.compte;
    lireLimites(cl).catch(() => null).finally(() => {
      const q = quotaFable(cl);
      if (q && q.reste <= 0) {
        basculerOpus(t, tr('Fable est épuisé pour cette semaine'));
        t.x.reprise = repriseDe(t, phase, "limite d'usage de Fable");
        changerEtatTache(t, 'ready', { motifFile: null });
        tick();
      } else if (parCompte) {
        mettreCompteEnPause(cl, { type: 'quota', jusqua: finLimite(r.limite), raison: tr("Limite d'usage atteinte") });
        t.x.reprise = repriseDe(t, phase, "limite d'usage");
        changerEtatTache(t, 'queued', { motifFile: motifCompte(cl) });
        setImmediate(tick);
      } else {
        pauseGlobale(tr("Limite d'usage atteinte"), finLimite(r.limite), { limite: true, compte: d.compte });
        t.x.reprise = repriseDe(t, phase, "limite d'usage");
        changerEtatTache(t, 'queued', { motifFile: "limite d'usage" });
      }
    });
    return;
  }
  if (r.erreur === 'rate_limit' || r.limite) {
    if (parCompte) {
      mettreCompteEnPause(idCompte, { type: 'quota', jusqua: finLimite(r.limite), raison: tr("Limite d'usage atteinte") });
      t.x.reprise = repriseDe(t, phase, "limite d'usage");
      changerEtatTache(t, 'queued', { motifFile: motifCompte(idCompte) });
      setImmediate(tick);
      return;
    }
    pauseGlobale(tr("Limite d'usage atteinte"), finLimite(r.limite), { limite: true, compte: d.compte });
    t.x.reprise = repriseDe(t, phase, "limite d'usage");
    changerEtatTache(t, 'queued', { motifFile: "limite d'usage" });
    return;
  }
  if (t.x.relances < 1) {
    t.x.relances += 1;
    t.tentative += 1;
    message(d.id, 'systeme', tr('{ref} : incident ({raison}), nouvel essai.', { ref: t.ref, raison: r.echec }), [t.etage]);
    t.x.reprise = repriseDe(t, phase, r.echec);
    changerEtatTache(t, 'ready', { motifFile: null });
    tick();
    return;
  }
  terminer(t, 'failed', { status: 'failed', summary: tr('Échec technique : {raison}', { raison: r.echec }) });
  reveilDG(d, `${t.ref} a échoué deux fois pour une raison technique : ${r.echec}`);
}

function repriseDe(t, phase, raison) {
  if (phase === 'verification') return { phase: 'verification' };
  if (!t.x.session) return null; // rien à reprendre : relance à neuf
  return {
    phase,
    resume: t.x.session,
    prompt: t.x.direct
      ? `Ta session précédente s'est interrompue (${raison}). Reprends là où tu t'étais arrêté et termine ta réponse.`
      : `Ta session précédente s'est interrompue (${raison}). Reprends là où tu t'étais arrêté, termine la mission, puis rends ta sortie structurée complète.`,
  };
}

function libererVerrou(t) {
  const cle = cleProjet(t);
  const ens = verrous.get(cle);
  if (!ens) return;
  ens.delete(t.id);
  if (!ens.size) verrous.delete(cle);
}

function terminer(t, etatFinal, sortie) {
  libererVerrou(t);
  t.fin = Date.now();
  // Le site montre aussi les fichiers produits (les .md s'ouvrent dans le visionneur).
  t.resultat = sortie
    ? {
        status: sortie.status,
        summary: sortie.summary,
        notes: sortie.handoffNotes || '',
        fichiers: (sortie.changedFiles || []).slice(0, 40),
        artefacts: (sortie.artifacts || []).slice(0, 20).map((a) => ({ chemin: a.path, nature: a.kind })),
      }
    : t.resultat;
  const direct = !!t.x.direct;
  if (etatFinal === 'failed' && !direct) t.x.enAttenteDg = true;
  // L'agent n'est pas renvoyé : il retourne à la réserve de son étage (sauf s'il n'a rien réussi).
  // En échec, il attend la décision du DG (qui peut le relancer) : on le libère après le plan_delta. Une demande
  // directe n'a pas de DG : son agent est libéré tout de suite.
  if (t.agent && (etatFinal !== 'failed' || direct)) liberer(t.agent, { session: t.x.session, sortie: t.x.sortie, contexte: t.x.contexte ?? null, reussi: etatFinal === 'done' });
  if (!t.agent && t.prenom) libererPrenom(t.prenom); // jamais lancée : le prénom promis se libère
  mesuresDeFin(t);
  changerEtatTache(t, etatFinal, { attend: [], motifFile: null });
  const d = etat.dossiers.get(t.dossier);
  if (d && !direct) {
    majRegistre(d);
    // gardien « relecture » : le DG relit le rapport complet et corrige la suite si le travail dérive
    if (etatFinal === 'done' && t.resultat && gardienDe(d) === 'relecture' && d.etat === 'en_cours') reveilDG(d, evenementRelecture(t, cheminRegistre(d.id)));
  }
  setImmediate(() => {
    tick();
    if (d) verifierFinDossier(d);
  });
}

export function annulerTache(t, notifier = true) {
  if (TERMINAUX.has(t.etat)) return;
  t.x.gen += 1;
  controleurs.get(t.id)?.abort();
  refuserPour(new Set([t.id]));
  fermerCartes(null, { tache: t.id });
  terminer(t, 'cancelled', { status: 'failed', summary: tr('Annulée.') });
  if (notifier) message(t.dossier, 'systeme', tr('{ref} annulée.', { ref: t.ref }), [t.etage]);
}

// Validation par toi coupée (réglage, ou au démarrage) : les tâches qui attendaient ta validation
// passent à un vérificateur IA au lieu de bloquer le dossier.
export function confierValidationsEnAttente() {
  if (REGLAGES.validationUtilisateur === true) return;
  for (const t of etat.taches.values()) {
    if (t.etat !== 'verifying' || t.x.verification?.mode !== 'user') continue;
    const d = etat.dossiers.get(t.dossier);
    if (!d || d.etat === 'annule') continue;
    notificationResolue(`V-${t.id}`);
    message(d.id, 'systeme', tr('{ref} : la vérification est confiée à une IA (la validation par toi est coupée dans les Réglages).', { ref: t.ref }), [t.etage]);
    verification(t, d).catch((e) => console.error('vérification', t.id, e?.message || e));
  }
}

export function validerUtilisateur(t, decision) {
  notificationResolue(`V-${t.id}`);
  if (t.etat !== 'verifying' || t.x.verification.mode !== 'user') throw new Error(tr("Cette tâche n'attend pas ta validation."));
  const d = etat.dossiers.get(t.dossier);
  emettre('verification', { tache: t.id, phase: 'fin', verificateur: { modele: 'toi' }, verdict: decision === 'pass' ? 'pass' : 'fail' }, d.id);
  if (decision === 'pass') {
    if (t.x.aTransmettre?.length) return void roundComplement(t, d);
    return terminer(t, 'done', t.x.sortie);
  }
  terminer(t, 'failed', { ...t.x.sortie, status: 'failed', summary: tr('Refusée par toi.') });
  reveilDG(d, `${t.ref} refusée par l'utilisateur lors de la validation.`);
}

// ---------------------------------------------------------------- DG : réveils et plan_delta

// evenement : texte (donnée produite par un agent ou le serveur) ou
// { type: 'utilisateur', texte, pieces } (instruction de l'utilisateur : complément, réponse).
function reveilDG(d, evenement, delai = REGLAGES.attenteDeltaMs) {
  if (d.etat === 'annule') return;
  if (d.direct) {
    const t = tachesDe(d).sort((a, b) => numRef(b) - numRef(a))[0];
    if (t?.etat === 'failed') message(d.id, 'systeme', tr('{nom} s’est arrêté : {raison}. Écris-lui de nouveau dans ce dossier pour reprendre.', { nom: t.prenom || t.ref, raison: t.resultat?.summary || '?' }), d.etages);
    return;
  }
  const r = reveils.get(d.id) || { evenements: [], minuterie: null };
  r.evenements.push(evenement);
  reveils.set(d.id, r);
  clearTimeout(r.minuterie);
  r.minuterie = setTimeout(() => lancerReveil(d), delai);
}

async function lancerReveil(d) {
  if (dgOccupe.has(d.id)) {
    const r = reveils.get(d.id);
    if (r) r.minuterie = setTimeout(() => lancerReveil(d), 2000);
    return;
  }
  const r = reveils.get(d.id);
  if (!r) return;
  // compte du DG en pause (D4) : les événements attendent qu'il reprenne
  if (attendreCompteDg(d, () => lancerReveil(d), `${d.id}:reveil`)) return;
  reveils.delete(d.id);
  dgOccupe.add(d.id);
  majDg({ etat: 'reflechit', dossier: d.id, etage: etageDg(d), action: 'delta' });
  let res;
  try {
    const donnees = r.evenements.filter((e) => typeof e === 'string');
    const complements = r.evenements.filter((e) => typeof e === 'object');
    res = await moteur.reagir(d, donnees, complements, tableau(d));
  } catch (e) {
    res = { echec: String(e?.message || e) };
  }
  dgOccupe.delete(d.id);
  majDg({ etat: 'libre', dossier: d.id, action: null });
  if (d.etat === 'annule') return;
  if (res.echec && (res.erreur === 'rate_limit' || res.limite) && pauseParCompte()) {
    // limite du compte du DG : les événements sont gardés et repartent quand le compte reprend
    mettreCompteEnPause(compteDg(d), { type: 'quota', jusqua: finLimite(res.limite), raison: tr("Limite d'usage atteinte") });
    const suite = reveils.get(d.id);
    reveils.set(d.id, { evenements: [...r.evenements, ...(suite?.evenements || [])], minuterie: suite?.minuterie ?? null });
    attendreCompteDg(d, () => lancerReveil(d), `${d.id}:reveil`);
    return;
  }
  if (res.echec) {
    const essais = (essaisReveil.get(d.id) || 0) + 1;
    if (essais <= DELAIS_REVEIL_DG.length) {
      // les événements sont gardés (avec ceux arrivés entre-temps) : le DG les recevra au prochain essai
      essaisReveil.set(d.id, essais);
      const delai = DELAIS_REVEIL_DG[essais - 1];
      message(d.id, 'systeme', tr("Le DG n'a pas pu décider ({raison}) : nouvel essai dans {min} min.", { raison: res.echec, min: Math.max(1, Math.round(delai / 60000)) }));
      const suite = reveils.get(d.id);
      clearTimeout(suite?.minuterie);
      const prochain = { evenements: [...r.evenements, ...(suite?.evenements || [])], minuterie: null };
      reveils.set(d.id, prochain);
      prochain.minuterie = setTimeout(() => lancerReveil(d), delai);
      return;
    }
    essaisReveil.delete(d.id);
    message(d.id, 'systeme', tr("Le DG n'a pas pu décider ({raison}) : les tâches en échec restent en échec. Écris-lui (par exemple « reprends ») pour qu'il réessaie.", { raison: res.echec }));
    notifier({ id: `RD-${d.id}`, type: 'question', titre: tr('Le DG est bloqué sur le dossier {id}', { id: d.id }), texte: tr('Écris-lui pour qu’il reprenne.'), dossier: d.id, etage: etageDg(d) || 'direction' });
  } else {
    essaisReveil.delete(d.id);
    appliquerDelta(d, res.sortie);
  }
  for (const t of tachesDe(d)) {
    t.x.enAttenteDg = false;
    // Échec que le DG n'a pas relancé : l'agent quitte son poste (réserve ou retraite).
    if (t.etat === 'failed' && t.agent && agentEquipe(t.agent)?.tache === t.id) liberer(t.agent, { session: t.x.session, contexte: t.x.contexte ?? null, reussi: false });
  }
  // C1 : le DG a revu son plan après « Réduire » : nouvelle estimation, nouvelle demande si besoin
  if (d.x.accordCout === 'reduire' && d.etat === 'en_cours') accorderCout(d).catch((e) => console.error('accord coût', e.message));
  tick();
  verifierFinDossier(d);
}

// Une tâche relancée « réveille » celles qui avaient été sautées à cause d'elle (et leurs suites).
function reveillerSautees(d, ref) {
  const aReveiller = new Set([ref]);
  let change = true;
  while (change) {
    change = false;
    for (const t of tachesDe(d)) {
      if (t.etat === 'skipped' && !aReveiller.has(t.ref) && t.x.deps.some((x) => aReveiller.has(x.ref))) {
        aReveiller.add(t.ref);
        change = true;
      }
    }
  }
  for (const t of tachesDe(d)) {
    if (t.etat === 'skipped' && aReveiller.has(t.ref)) changerEtatTache(t, 'planned', { resultat: null, fin: null });
  }
}

function appliquerDelta(d, delta) {
  if (delta.message?.trim()) message(d.id, 'dg', delta.message.trim());
  for (const op of delta.ops) {
    if (op.op === 'annuler' && !op.ref) {
      annulerDossier(d);
      return;
    }
    const t = tacheRef(d, op.ref);
    if (!t) continue;
    if (op.op === 'accepter' && t.etat === 'failed') {
      changerEtatTache(t, 'done', { resultat: { status: 'done', summary: tr('{resume} (accepté par le DG)', { resume: t.resultat?.summary || '' }).trim() } });
    } else if (op.op === 'relancer' && TERMINAUX.has(t.etat)) {
      if (op.consigne?.trim()) t.x.consignes.push(op.consigne.trim());
      if (op.modele) {
        t.modele = sansPrefixe(op.modele);
        if (prefixeModele(op.modele)) t.x.iaDemandee = prefixeModele(op.modele);
      }
      if (op.effort) t.effort = op.effort;
      // plusieurs IA : un autre compte reprend la tâche (conversation neuve, voir ci-dessous)
      if (op.compte) t.x.compteDemande = op.compte;
      // B6 : « plafond N $ » après un dépassement → même session reprise, plafond relevé
      const plafond = /plafond\s+(\d+(?:[.,]\d+)?)\s*\$/i.exec(op.consigne || '');
      const reprise = plafond && t.x.sessionPlafond ? t.x.reprise : null;
      if (plafond) t.x.plafondUsd = Number(plafond[1].replace(',', '.'));
      Object.assign(t.x, { sortie: null, session: null, reprise, reworks: 0, relances: 0, enAttenteDg: false, sessionPlafond: null });
      t.x.gen += 1;
      t.tentative += 1;
      d.x.blocageSignale = false;
      changerEtatTache(t, 'ready', { resultat: null, fin: null, modeleReel: null, effortReel: null });
      reveillerSautees(d, t.ref);
    } else if (op.op === 'informer' && op.consigne?.trim()) {
      informer(d, t, op.consigne.trim());
    } else if (op.op === 'retirer' || op.op === 'annuler') {
      annulerTache(t);
    }
  }
  if (delta.nouvellesTaches?.length) {
    const erreurs = validerTaches(delta.nouvellesTaches, tachesDe(d).map((t) => t.ref), { profil: profilEffectif(d) });
    if (erreurs.length) message(d.id, 'systeme', tr('Nouvelles tâches du DG refusées : {erreurs}', { erreurs: erreurs.join(' ; ') }));
    else ajouterTaches(d, delta.nouvellesTaches);
  }
  if (delta.question?.trim()) {
    d.etat = 'clarification';
    d.question = delta.question.trim();
    majDossier(d);
    message(d.id, 'dg', d.question);
    notifierQuestionDg(d);
  }
}

async function verifierFinDossier(d) {
  if (d.etat !== 'en_cours' || d.x.syntheseEnCours) return;
  const taches = tachesDe(d);
  if (d.direct) {
    if (!taches.length || !taches.every((t) => TERMINAUX.has(t.etat))) return;
    // message arrivé pendant le tour : le tour suivant part tout de suite, dans la même conversation
    const suite = d.x.complementsEnAttente.shift();
    if (suite) {
      ajouterTacheDirecte(d, suite.texte, suite.pieces);
      return;
    }
    const der = taches.sort((a, b) => numRef(b) - numRef(a))[0];
    d.etat = der.etat === 'done' ? 'termine' : 'echec';
    d.synthese = der.etat === 'done' ? der.resultat?.summary || null : null;
    notifier({ type: 'info', titre: tr(der.etat === 'done' ? '{nom} a répondu ({id})' : '{nom} s’est arrêté ({id})', { nom: der.prenom || der.ref, id: d.id }), texte: d.titre, dossier: d.id, telephone: 'fin' });
    majDossier(d);
    return;
  }
  // Blocage : plus rien n'avance et tout ce qui reste attend des tâches en échec. On prévient le DG une
  // fois (il peut relancer l'amont) ; s'il ne relance rien, on saute les tâches bloquées.
  const restantes = taches.filter((t) => !TERMINAUX.has(t.etat));
  if (restantes.length && restantes.every((t) => t.etat === 'waiting' && t.x.bloquePar?.length) && !dgOccupe.has(d.id) && !reveils.has(d.id)) {
    if (!d.x.blocageSignale) {
      d.x.blocageSignale = true;
      const amonts = [...new Set(restantes.flatMap((t) => t.x.bloquePar))];
      reveilDG(d, `BLOCAGE : ${restantes.map((t) => t.ref).join(', ')} attendent des tâches en échec (${amonts.join(', ')}). Relance les tâches en échec si c'est réparable (op relancer), sinon retire les tâches bloquées.`, 0);
      return;
    }
    for (const t of restantes) terminer(t, 'skipped', { status: 'failed', summary: tr('Sautée : {taches} en échec.', { taches: t.x.bloquePar.join(', ') }) });
    return;
  }
  if (!taches.length || !taches.every((t) => TERMINAUX.has(t.etat) && !t.x.enAttenteDg)) return;
  if (dgOccupe.has(d.id) || reveils.has(d.id)) return;
  if (attendreCompteDg(d, () => verifierFinDossier(d), `${d.id}:synthese`)) return;
  d.x.syntheseEnCours = true;
  dgOccupe.add(d.id);
  majDg({ etat: 'reflechit', dossier: d.id, etage: 'direction', action: 'synthese' });
  let res;
  try {
    res = await moteur.synthese(d, tableau(d));
  } catch (e) {
    res = { echec: String(e?.message || e) };
  }
  dgOccupe.delete(d.id);
  majDg({ etat: 'libre', dossier: d.id, action: null });
  if (res.echec && (res.erreur === 'rate_limit' || res.limite) && pauseParCompte() && d.etat === 'en_cours') {
    // limite du compte du DG : la synthèse attend qu'il reprenne
    mettreCompteEnPause(compteDg(d), { type: 'quota', jusqua: finLimite(res.limite), raison: tr("Limite d'usage atteinte") });
    d.x.syntheseEnCours = false;
    attendreCompteDg(d, () => verifierFinDossier(d), `${d.id}:synthese`);
    return;
  }
  d.synthese = res.sortie?.message || `${tr('Synthèse indisponible ({raison}).', { raison: res.echec })}\n${tableau(d)}`;
  message(d.id, 'dg', d.synthese, d.etages);
  annoncerBilan(d, taches);
  const faites = taches.filter((t) => t.etat === 'done').length;
  d.etat = faites ? 'termine' : 'echec';
  notifier({ type: 'info', titre: tr(faites ? 'Dossier {id} terminé' : 'Dossier {id} en échec', { id: d.id }), texte: d.titre, dossier: d.id, telephone: 'fin' });
  majDossier(d);
}

// Bilan de fin (1.0.11) : ce que le dossier a coûté, en $ et en fenêtres de 5 h, et la part de Fable comparée à Opus.
function annoncerBilan(d, taches) {
  let texte = '';
  try {
    texte = texteBilan(bilanDossier(d, taches));
  } catch (e) {
    console.error('bilan', d.id, e.message);
  }
  if (texte) message(d.id, 'systeme', texte, d.etages);
}

// ---------------------------------------------------------------- lot C : estimation du plan, accord, mesures
// Le calcul est dans estimation.js. Ici : où le résultat est rangé (tâches, dossier, conso.json) et la carte
// « Lancer / Réduire / Annuler » quand le plan dépasse le seuil du profil (seuilAccordFenetre, en % de ce
// qui reste de la fenêtre de 5 h du compte des agents). Sans estimation, sans % ou sans seuil (Max), rien
// n'attend. « Réduire » renvoie au DG sans jamais baisser les modèles ni les efforts.
const AGE_MAX_LIMITES_MS = 5 * 60 * 1000;
// Compte des agents : celui que prennent la plupart des tâches du plan (route posée, sinon prévue par le
// routeur) ; à égalité ou sans tâche, le compte de la demande. Plusieurs IA : ce n'est pas forcément Claude.
const idCompteDe = (id) => trouverCompte(id)?.id || id || null;
function compteAgents(d, routeDe = (t) => routePrevue(t, d)) {
  const base = idCompteDe(compteTache(d));
  const n = new Map([[base, 0]]);
  for (const t of tachesDe(d)) {
    if (t.etat === 'cancelled' || t.etat === 'skipped') continue;
    const c = idCompteDe(routeDe(t).compte) || base;
    n.set(c, (n.get(c) || 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1])[0][0];
}
const seuilAccord = (d) => {
  const s = profilEffectif(d).seuilAccordFenetre;
  return typeof s === 'number' && Number.isFinite(s) ? s : null;
};
// La démo (simulation) fournit ses propres limites et n'écrit rien dans conso.json (partagé avec le vrai QG).
const simule = () => typeof moteur?.limites === 'function';
const lectureLimites = (compte) => (simule() ? moteur.limites(compte) : limitesDe(compte)) || null;
const lectureFraiche = (l) => simule() || Date.now() - Math.max(l?.maj || 0, l?.essai || 0) <= AGE_MAX_LIMITES_MS;
const annoter = (...a) => {
  if (!moteur?.simulation) annoterConso(...a);
};

/** Estime le plan (tâches non annulées) et range le résultat : t.x.estimation (B6), t.estimation, d.estimation. */
function poserEstimation(d, limites) {
  const taches = tachesDe(d).filter((t) => t.etat !== 'cancelled' && t.etat !== 'skipped');
  const routes = new Map(taches.map((t) => [t.ref, routePrevue(t, d)]));
  const routeDe = (t) => routes.get(t.ref) || routePrevue(t, d);
  const compte = compteAgents(d, routeDe);
  let est;
  try {
    est = estimerDossier(d, taches, { compte, routeDe, limites: limites !== undefined ? limites : lectureLimites(compte) });
  } catch (e) {
    console.error('estimation', d.id, e.message);
    return null;
  }
  const pub = resumePublic(est);
  for (const t of taches) {
    // unité de la tâche : celle du compte qui la fera (une tâche Codex d'un plan Claude reste en jetons)
    const a = est.autres?.[t.ref];
    const u = a ? a.unite : est.unite;
    const v = a ? a.valeur : est.parTache[t.ref];
    t.x.estimation = v == null ? null : { [u]: v }; // plafondTache (B6) lit estimation.usd
    t.estimation = v == null ? null : { unite: u, valeur: a ? pub.autres[t.ref].valeur : pub.parTache[t.ref] };
  }
  d.estimation = { ...pub, profil: profilEffectif(d).cout, seuil: seuilAccord(d) };
  annoter('dossiers', d.id, {
    profil: d.estimation.profil,
    estimation: { unite: pub.unite, total: pub.total, taches: pub.taches, dg: pub.dg, pct: pub.pct, pctDuReste: pub.pctDuReste, fenetre: pub.fenetre, calibre: pub.calibre, le: pub.le },
  });
  return est;
}

/** Les nouvelles tâches doivent-elles attendre ton accord ? true : accorderCout() pose la question. */
function preparerAccord(d, nouvelles, est) {
  const retenir = () => {
    for (const t of nouvelles) if (!TERMINAUX.has(t.etat)) t.x.accordCout = 'attente';
  };
  if (d.x.accordCout === 'attente' || d.x.accordCout === 'reduire') {
    retenir(); // la demande en cours (ou le plan revu après « Réduire ») les couvre
    return false;
  }
  if (d.x.accordCout) return false; // plan déjà accepté : les tâches ajoutées ensuite sont estimées sans nouvelle carte
  const seuil = seuilAccord(d);
  const l = lectureLimites(compteAgents(d));
  if (seuil == null || !est?.estimable || !l || (lectureFraiche(l) && !(est.pctDuReste > seuil))) {
    d.x.accordCout = 'ok';
    return false;
  }
  // au-dessus du seuil, ou lecture trop ancienne pour trancher : accorderCout() relit puis décide
  d.x.accordCout = 'attente';
  retenir();
  return true;
}

function libererAccord(d) {
  d.x.accordCout = 'ok';
  for (const t of tachesDe(d)) if (t.x.accordCout === 'attente') t.x.accordCout = 'ok';
  majDossier(d);
  tick();
}

// Message au DG (en français, comme ses autres réveils).
const MESSAGE_REDUIRE = (pct, seuil) =>
  `Ton plan est estimé à ${pct} % de la fenêtre restante ; l'utilisateur veut tenir sous ${seuil} %. Réduis le périmètre ou le nombre de tâches, sans baisser les modèles ni les efforts. Aucune tâche n'a démarré : retire celles qui peuvent attendre (op « retirer ») ou regroupe-les (nouvellesTaches) ; le QG réestime ensuite le plan.`;

async function accorderCout(d, garde = null) {
  if (garde) await garde; // la garde Fable peut passer des tâches sur Opus : on estime après elle
  if (d.etat !== 'en_cours') return;
  d.x.accordCout = 'attente';
  for (const t of tachesDe(d)) if (!TERMINAUX.has(t.etat) && t.x.accordCout !== 'ok') t.x.accordCout = 'attente';
  const compte = compteAgents(d);
  let l = lectureLimites(compte);
  if (l && !lectureFraiche(l)) {
    // relecture seulement si une lecture existe déjà (le suivi des limites tourne pour ce compte)
    await lireLimites(compte).catch(() => null);
    l = limitesDe(compte) || l;
  }
  if (d.etat !== 'en_cours') return;
  const est = poserEstimation(d, l);
  majDossier(d);
  const seuil = seuilAccord(d);
  if (seuil == null || !est || est.pctDuReste == null || !(est.pctDuReste > seuil)) return libererAccord(d);
  const porteur = tachesDe(d)
    .sort((a, b) => numRef(a) - numRef(b))
    .find((t) => ['planned', 'waiting', 'ready', 'queued'].includes(t.etat) && t.x.gardeFable !== 'attente');
  if (!porteur) return libererAccord(d);
  const part = est.pctDuReste === Infinity ? '100+' : String(Math.round(est.pctDuReste));
  const choix = await demanderDecision(porteur, {
    question: tr('Ce plan est estimé à {estimation}, soit {part} % de ce qui reste de ta fenêtre. Au-delà de {seuil} %, le profil {profil} demande ton accord. « Réduire » demande au DG un plan plus court, sans baisser les modèles ni les efforts.', {
      estimation: texteEstimation(est),
      part,
      seuil,
      profil: nomProfil(profilEffectif(d), REGLAGES.langueInterface === 'en' ? 'en' : 'fr'),
    }),
    options: [{ libelle: tr('Lancer') }, { libelle: tr('Réduire') }, { libelle: tr('Annuler') }],
    brut: true,
  });
  if (d.etat !== 'en_cours') return;
  if (choix === 'O1') return libererAccord(d);
  if (choix === 'O3') return annulerDossier(d);
  if (choix === 'O2') {
    d.x.accordCout = 'reduire';
    majDossier(d);
    reveilDG(d, MESSAGE_REDUIRE(part, seuil), 0);
    return;
  }
  // pas de choix (réponse en texte seul, tâche porteuse partie) : la question est reposée
  if (tachesDe(d).some((t) => t.x.accordCout === 'attente' && !TERMINAUX.has(t.etat))) return accorderCout(d);
  return libererAccord(d);
}

// Mesures d'une tâche pour sa fiche (contexte actuel, compactions, coût) : diffusées, pas journalisées.
const ECART_MESURES_MS = 10000;
function publierMesures(t) {
  const c = donneesConso().taches?.[t.id];
  t.mesures = {
    contexte: t.x.contexteActuel ?? t.x.contexte ?? null,
    contexteMax: t.x.contexteMax ?? null,
    compactions: t.x.compactions || 0,
    cout: c?.cout ? Math.round(c.cout * 100) / 100 : null,
    jetons: c ? jetonsDe(c) : null,
  };
  t.x.mesuresLe = Date.now();
  emettre('mesures', { tache: t.id, mesures: t.mesures });
}

function mesurerContexte(t, n) {
  if (!(n > 0)) return;
  t.x.contexteActuel = n;
  t.x.contexteMax = Math.max(t.x.contexteMax || 0, n);
  if (Date.now() - (t.x.mesuresLe || 0) >= ECART_MESURES_MS) publierMesures(t);
}

// C3 : fin de tâche -> conso.json (contexteMax, tours, compactions, part du cache) et compactions du dossier.
function mesuresDeFin(t) {
  const conso = donneesConso();
  const c = conso.taches?.[t.id];
  if (!c && !t.x.contexteMax && !t.x.compactions) return;
  if (c) {
    const lu = c.cacheLu || 0;
    const base = lu + (c.cacheEcrit || 0) + (c.entree || 0);
    annoter('taches', t.id, {
      contexteMax: t.x.contexteMax ?? t.x.contexte ?? null,
      tours: c.appels || 0,
      compactions: t.x.compactions || 0,
      cache: base > 0 ? Math.round((lu / base) * 1000) / 1000 : null,
    });
  }
  publierMesures(t);
  const d = etat.dossiers.get(t.dossier);
  if (d && conso.dossiers?.[d.id]) annoter('dossiers', d.id, { compactions: tachesDe(d).reduce((s, x) => s + (x.x.compactions || 0), 0) });
}

// ---------------------------------------------------------------- reprise après redémarrage

// Appelé une fois au démarrage : les dossiers non terminés repartent (voir chargerHistorique).
export function reprendreDossiers() {
  // supprimés juste avant l'arrêt du serveur, pendant les 30 s où on pouvait encore changer d'avis : effacés maintenant
  for (const d of [...etat.dossiers.values()]) if (d.supprimeLe) effacerPourDeBon(d.id);
  for (const d of etat.dossiers.values()) {
    if (!d.x?.repriseApresRedemarrage) continue;
    d.x.repriseApresRedemarrage = false;
    d.x.pieces = d.x.pieces || [];
    d.x.complementsEnAttente = d.x.complementsEnAttente || [];
    const taches = tachesDe(d);
    for (const t of taches) {
      if (!t.prenom && !TERMINAUX.has(t.etat)) t.prenom = (t.agent && agentEquipe(t.agent)?.prenom) || tirerPrenom();
    }
    // La garde Fable (carte « Garder Fable / Passer sur Opus » et son délai) s'est perdue avec le redémarrage :
    // sans ça, ses tâches resteraient « attente » pour toujours. On lève la marque et on refait la garde.
    const enGarde = taches.filter((t) => t.x.gardeFable === 'attente');
    for (const t of enGarde) t.x.gardeFable = null;
    const aGarder = enGarde.filter((t) => !TERMINAUX.has(t.etat));
    const garde = aGarder.length ? gardeFable(d, aGarder).catch((e) => console.error('garde Fable', e.message)) : null;
    if (d.etat === 'programme') {
      armerDepart(d); // heure passée pendant l'arrêt du serveur : il part tout de suite
      continue;
    }
    if (d.etat === 'planification') {
      message(d.id, 'systeme', tr('Le serveur a redémarré pendant la planification : le DG reprend son plan.'));
      planifierDossier(d, {});
      continue;
    }
    if (d.etat === 'clarification') {
      notifierQuestionDg(d);
      continue;
    }
    const reprises = taches.filter((t) => t.x.reprise).length;
    message(d.id, 'systeme', tr('Reprise après redémarrage du serveur : {n} tâche(s) reprennent dans leur propre conversation, les autres suivent leur cours.', { n: reprises }));
    // Échecs que le DG n'avait pas encore traités : on le réveille pour qu'il décide.
    for (const t of taches) {
      if (t.etat === 'failed' && t.x.enAttenteDg) reveilDG(d, `${t.ref} a échoué juste avant le redémarrage : ${t.resultat?.summary || 'raison inconnue'}`, 0);
    }
    // C1 : la carte « Lancer / Réduire / Annuler » s'est perdue avec le redémarrage : on la repose
    if (d.etat === 'en_cours' && (['attente', 'reduire'].includes(d.x.accordCout) || taches.some((t) => t.x.accordCout === 'attente'))) accorderCout(d, garde).catch((e) => console.error('accord coût', e.message));
    majDossier(d);
  }
  tick();
  // Arrêt tombé pendant la synthèse finale (tout était fini) : on la relance.
  setImmediate(() => {
    for (const d of etat.dossiers.values()) if (d.etat === 'en_cours') verifierFinDossier(d);
    confierValidationsEnAttente();
  });
}

// Arrêt du serveur : on coupe proprement les sessions en cours (sinon elles continuent seules en arrière-plan).
export function arreterSessions() {
  // On change la « génération » des tâches actives avant d'interrompre : leurs sessions coupées ne
  // modifient plus l'état enregistré (elles reprendront telles quelles au prochain démarrage).
  for (const t of etat.taches.values()) if (ACTIFS.has(t.etat)) t.x.gen += 1;
  for (const ctrl of controleurs.values()) {
    try {
      ctrl.abort();
    } catch {
      /* rien */
    }
  }
}

// ---------------------------------------------------------------- pause, urgence

// Heure de reprise : l'heure seule si c'est aujourd'hui, sinon le jour aussi (limite de la semaine).
function quandReprise(ms) {
  const d = new Date(ms);
  const loc = REGLAGES.langueInterface === 'en' ? 'en-GB' : 'fr-FR';
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString(loc, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

// Relances du DG en attente de la fin d'une limite d'usage (elles partent aussi quand la pause est levée).
const relancesDg = new Set();
const REPRISE_SANS_HEURE_MS = 15 * 60000; // limite sans heure de remise à zéro connue : nouvel essai après 15 min

// Relance du DG après une limite : à la remise à zéro (pause globale) ou quand son compte reprend (D4).
function relanceDg(d, compte, reessayer, jusqua, cle = null) {
  if (cle && [...relancesDg].some((r) => r.cle === cle)) return;
  let minuterie = null;
  const relance = () => {
    if (!relancesDg.delete(relance)) return;
    clearTimeout(minuterie);
    if (d.etat !== 'annule') reessayer();
  };
  Object.assign(relance, { compte, cle });
  if (!compte) minuterie = setTimeout(relance, Math.max(0, (jusqua || 0) - Date.now()) + 30000);
  relancesDg.add(relance);
}

// Le DG attend que son compte reprenne (jamais de bascule du DG : sa conversation vit sur ce compte).
function attendreCompteDg(d, reessayer, cle) {
  const id = compteDg(d);
  if (!id || !pauseDe(id) || !pauseParCompte()) return false;
  if (![...relancesDg].some((r) => r.cle === cle)) {
    message(d.id, 'systeme', tr('Le DG attend : {motif}.', { motif: motifCompte(id) }));
    relanceDg(d, id, reessayer, null, cle);
  }
  return true;
}

/** D4 : met un compte en pause (type 'quota' ou 'connexion') ; levée à la remise à zéro, au retour de marge, ou sur « Reprendre ». */
function mettreCompteEnPause(id, { type, jusqua = null, raison = '' }) {
  if (!id) return;
  const nouveau = !pauseDe(id);
  pauseCompte(id, { type, jusqua, raison });
  clearTimeout(minuteriesComptes.get(id));
  minuteriesComptes.delete(id);
  const delai = jusqua ? Math.max(0, jusqua - Date.now()) + 30000 : type === 'quota' ? REPRISE_SANS_HEURE_MS : 0;
  if (delai) {
    const m = setTimeout(() => {
      minuteriesComptes.delete(id);
      leverPauseCompte(id);
    }, delai);
    m.unref?.();
    minuteriesComptes.set(id, m);
  }
  if (nouveau) notifier({ type: 'info', titre: tr('{nom} en pause', { nom: nomCompte(id) }), texte: motifCompte(id), telephone: 'pause' });
}

// Un compte reprend : le DG qui l'attendait repart ; ses tâches repartent au prochain passage. Après une limite
// d'usage ou la réserve de ta fenêtre, une notification le dit, avec l'heure (1.0.11).
function compteRepris(id, type = null) {
  if ((type === 'quota' || type === 'reserve') && aDuTravail()) notifier({ type: 'info', titre: tr('{nom} reprend', { nom: nomCompte(id) }), texte: tr('Le travail repart à {heure}.', { heure: quandReprise(Date.now()) }), telephone: 'pause' });
  fermerCartes(id);
  clearTimeout(minuteriesComptes.get(id));
  minuteriesComptes.delete(id);
  for (const relance of [...relancesDg]) if (relance.compte === id) relance();
}

surPauses((pauses) => {
  etat.ordonnanceur = { ...etat.ordonnanceur, pauses };
  emettre('ordonnanceur', { ordonnanceur: etat.ordonnanceur });
  const levees = [...pausesVues].filter(([id]) => !(id in pauses));
  pausesVues = new Map(Object.entries(pauses).map(([id, p]) => [id, p.type]));
  // différé : une levée peut survenir pendant un passage de l'ordonnanceur (pauseDe)
  if (levees.length)
    setImmediate(() => {
      for (const [id, type] of levees) compteRepris(id, type);
      tick();
    });
});

/** Reprend un seul compte (bouton « Reprendre » de sa pause). */
export const reprendreCompte = (id) => leverPauseCompte(id);

/** extra : { limite: true, compte } pour une pause due à une limite d'usage (levée dès que le compte a de la marge). */
export function pauseGlobale(raison, jusqua, extra = {}) {
  if (raison !== tr("Arrêt d'urgence")) notifier({ type: 'info', titre: tr('QG en pause'), texte: jusqua ? tr('{raison} — reprise vers {heure}', { raison, heure: quandReprise(jusqua) }) : raison, telephone: 'pause' });
  etat.ordonnanceur = { ...etat.ordonnanceur, pause: { raison, jusqua, ...extra } };
  emettre('ordonnanceur', { ordonnanceur: etat.ordonnanceur });
  clearTimeout(minuteriePause);
  if (jusqua) minuteriePause = setTimeout(() => reprendre({ comptes: false }), Math.max(0, jusqua - Date.now()) + 30000);
}

// « Reprendre » : lève aussi les pauses des comptes (comptes: false pour la seule pause globale). Après une limite
// d'usage ou la réserve de ta fenêtre, une notification dit que le travail repart, avec l'heure (1.0.11).
export function reprendre({ comptes = true } = {}) {
  const p = etat.ordonnanceur.pause;
  if (p && (p.limite || p.reserve) && aDuTravail()) notifier({ type: 'info', titre: tr('QG relancé'), texte: tr('Le travail repart à {heure}.', { heure: quandReprise(Date.now()) }), telephone: 'pause' });
  clearTimeout(minuteriePause);
  if (comptes) viderPauses();
  etat.ordonnanceur = { ...etat.ordonnanceur, pause: null };
  emettre('ordonnanceur', { ordonnanceur: etat.ordonnanceur });
  for (const relance of [...relancesDg]) if (!relance.compte || !pauseDe(relance.compte)) relance();
  tick();
}

// Limites relues (conso.js) : si le compte qui a mis le QG en pause a de nouveau de la marge (forfait
// changé, fenêtre remise à zéro plus tôt), on reprend sans attendre l'heure annoncée.
// Même chose pour un compte en pause (D4).
function limitesRelues(compteId, l) {
  verifierReserve(compteId, l);
  surveillerHorsQg(compteId, l);
  const fenetres = Object.values(l.fenetres || {}).filter((f) => f.utilisation != null);
  const marge = fenetres.length > 0 && !fenetres.some((f) => f.utilisation >= 100);
  if (marge && pauseDe(compteId)?.type === 'quota') leverPauseCompte(compteId);
  const p = etat.ordonnanceur.pause;
  if (!p?.limite || (p.compte && p.compte !== compteId) || !marge) return;
  reprendre({ comptes: false }); // (la notification « QG relancé » part de reprendre)
}
surLimitesLues(limitesRelues);
demarrerCalibrage(); // C2 : chaque lecture des limites affine le rapport $ -> % de fenêtre du compte

// Du travail en cours ou en attente (sinon, inutile de prévenir que le travail repart).
const aDuTravail = () => [...etat.dossiers.values()].some((d) => d.etat === 'en_cours');

// ---------------------------------------------------------------- réserve de fenêtre (1.0.11)
// Tu gardes pour toi une part de ta fenêtre de 5 h aux heures choisies (Réglages › Général, ex. 30 % de 9 h à 18 h en
// semaine). Atteinte : les tâches de ce compte s'interrompent proprement (elles reprendront où elles en étaient, comme
// après un arrêt d'urgence) et rien de neuf ne part, jusqu'à la fin de la plage ou la remise à zéro de la fenêtre.
function enReserve(compteId) {
  if (pauseParCompte()) return pauseDe(compteId)?.type === 'reserve';
  const p = etat.ordonnanceur.pause;
  return !!(p?.reserve && (!p.compte || p.compte === compteId));
}

function verifierReserve(compteId, l, now = Date.now()) {
  if (enDemo()) return;
  const r = reserveAtteinte(l, REGLAGES.reserveFenetre, now);
  const deja = enReserve(compteId);
  if (r && !deja) {
    const raison = tr('Réserve de ta fenêtre atteinte : {pct} % gardés pour toi jusqu’à {heure}', { pct: r.pct, heure: quandReprise(r.jusqua) });
    suspendreTaches((t) => !pauseParCompte() || (t.compte || t.x.route?.compte) === compteId, tr('réserve de ta fenêtre'));
    if (pauseParCompte()) mettreCompteEnPause(compteId, { type: 'reserve', jusqua: r.jusqua, raison });
    else pauseGlobale(raison, r.jusqua, { reserve: true, compte: compteId });
  } else if (!r && deja) {
    if (pauseParCompte()) leverPauseCompte(compteId);
    else reprendre({ comptes: false });
  }
}

// ---------------------------------------------------------------- usage hors du QG (1.0.11)
// Ta fenêtre de 5 h se remplit aussi quand tu utilises Claude ailleurs (un autre appareil, un collègue sur un compte
// d'équipe) : les estimations du QG ne le voient pas. Une notification par fenêtre, quand le QG a du travail en cours.
const SEUIL_HORS_QG = 8; // points de la fenêtre
const horsQg = new Map(); // compteId → { reinit, points, depuis, prevenu }

function surveillerHorsQg(compteId, l, now = Date.now()) {
  if (enDemo()) return;
  const n = pointsHorsQg(compteId, l, now);
  const reinit = l?.fenetres?.five_hour?.reinit || null;
  let s = horsQg.get(compteId);
  if (!s || (reinit && s.reinit && Math.abs(reinit - s.reinit) > 10 * 60000)) {
    s = { reinit, points: 0, depuis: now, prevenu: false };
    horsQg.set(compteId, s);
  }
  s.reinit = reinit || s.reinit;
  if (!(n > 0)) return;
  s.points += n;
  if (s.prevenu || s.points < SEUIL_HORS_QG || !aDuTravail()) return;
  s.prevenu = true;
  notifier({
    type: 'info',
    titre: tr('Ta fenêtre se remplit aussi hors du QG'),
    texte: tr('{nom} : environ {n} points de ta fenêtre de 5 h utilisés ailleurs depuis {heure} (Claude sur un autre appareil, ou un collègue sur un compte d’équipe). Les estimations du QG ne les comptent pas : tes dossiers peuvent attendre la remise à zéro plus tôt que prévu.', { nom: nomCompte(compteId), n: Math.round(s.points), heure: quandReprise(s.depuis) }),
  });
}

// Arrêt d'urgence : tout s'arrête ; les tâches en cours repartiront (reprise de session) sur « Reprendre ».
export function urgence() {
  pauseGlobale(tr("Arrêt d'urgence"), null);
  suspendreTaches(() => true, "arrêt d'urgence");
}

// Interrompt proprement les tâches en cours choisies : elles repartent de leur conversation à la reprise.
function suspendreTaches(filtre, motif) {
  const actives = [...etat.taches.values()].filter((t) => occupeUnePlace(t) && filtre(t));
  refuserPour(new Set(actives.map((t) => t.id)));
  for (const t of actives) {
    const phase = t.etat === 'verifying' ? 'verification' : t.etat === 'rework' ? 'rework' : 'production';
    t.x.gen += 1;
    controleurs.get(t.id)?.abort();
    libererVerrou(t);
    t.x.reprise = repriseDe(t, phase, motif);
    changerEtatTache(t, 'queued', { motifFile: motif });
  }
  return actives.length;
}

export const etatInterne = { verrous, dgOccupe, reveils, relancesDg, minuteriesComptes };
