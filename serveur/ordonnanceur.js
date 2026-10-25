// Ordonnanceur : seule source de vérité sur l'état des tâches.
// Dépendances, plafonds, verrous d'écriture, passation, vérification, reprises, annulation.
// Le « moteur » (sessions Claude réelles ou simulation) est injecté par index.js.
import fs from 'node:fs';
import path from 'node:path';
import { REGLAGES, etage as trouverEtage } from './config.js';
import { etat, majDossier, changerEtatTache, majTache, message, majDg, emettre, alerte } from './bus.js';
import { canUseToolPour, refuserPour, demander } from './permissions.js';
import { validerTaches } from './dg.js';
import { promptProduction, promptRework } from './taches.js';
import { ERREURS_FATALES } from './session.js';
import { sauverPiecesUtilisateur, piecePublique } from './pieces.js';
import { notifier, notificationResolue } from './notifications.js';
import { enregistrerReemploi } from './conso.js';
import { recruter, reembaucher, occuper, liberer, agent as agentEquipe, tirerPrenom, libererPrenom } from './equipe.js';
import { t as tr } from './i18n.js';

const notifierQuestionDg = (d) =>
  notifier({ id: `QD-${d.id}`, type: 'question', titre: tr('Le DG a une question'), texte: d.question, dossier: d.id, etage: d.etages[0] || 'direction', actions: [{ id: 'repondre', libelle: tr('Répondre') }] });

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
const dgOccupe = new Set(); // dossiers dont le DG travaille
const canaux = new Map(); // tacheId → { injecter(texte) } tant que sa session productrice tourne
let minuteriePause = null;

export function initialiser(m, dernierId) {
  moteur = m;
  compteurDossiers = dernierId;
}

const tachesDe = (d) => [...etat.taches.values()].filter((t) => t.dossier === d.id);
const tacheRef = (d, ref) => etat.taches.get(`${d.id}-${ref}`);
const numRef = (t) => Number(t.ref.slice(1));
const cleProjet = (t) => trouverEtage(t.etage)?.projet?.toLowerCase();
const etageDg = (d) => (d.etages.length === 1 ? d.etages[0] : 'direction');

function tableau(d) {
  return tachesDe(d)
    .sort((a, b) => numRef(a) - numRef(b))
    .map((t) => `${t.ref} [${t.etat}] ${t.titre} — étage ${t.etage} — ${t.modele}/${t.effort}${t.resultat ? ` — ${t.resultat.status} : ${t.resultat.summary}` : ''}`)
    .join('\n');
}

// ---------------------------------------------------------------- dossiers

export function creerDossier({ texte, etageAffiche, compte, dg = null, pieces = [] }) {
  const e = trouverEtage(etageAffiche);
  const d = {
    id: `D${++compteurDossiers}`,
    texte,
    titre: texte.length > 50 ? texte.slice(0, 49) + '…' : texte,
    compte,
    dg: { modele: dg?.modele || REGLAGES.dg.modele, effort: dg?.effort || REGLAGES.dg.effort },
    etat: 'planification',
    etages: e?.actif && e.projet && e.id !== 'direction' ? [e.id] : [],
    question: null,
    synthese: null,
    creeLe: Date.now(),
    etageAffiche: etageAffiche || 'hall',
    x: { dgSession: null, essaisPlan: 0, syntheseEnCours: false, pieces: [], complementsEnAttente: [] },
  };
  majDossier(d);
  const jointes = joindre(d, pieces);
  message(d.id, 'toi', texte, d.etages.length ? d.etages : ['hall'], jointes.map(piecePublique));
  planifierDossier(d, {});
  return d;
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
  if (d.etat === 'clarification') return repondre(d, texte, pieces);
  const jointes = joindre(d, pieces);
  message(d.id, 'toi', texte, d.etages.length ? d.etages : ['hall'], jointes.map(piecePublique));
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
  const erreurs = validerTaches(p.taches, []);
  if (!p.taches.length) erreurs.push('Le plan est vide.');
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
    const c = d.compte === 'claude2' ? 2 : 1;
    alerte('erreur', tr('Compte non connecté ou problème de facturation : lance connexion-compte-{n}.bat', { n: c }), d.id);
    message(d.id, 'systeme', tr("Le DG n'a pas pu démarrer ({erreur}). Connecte le compte avec connexion-compte-{n}.bat puis renvoie ta demande.", { erreur: r.erreur, n: c }));
    return;
  }
  if (r.erreur === 'rate_limit' || r.limite) {
    const jusqua = finLimite(r.limite);
    message(d.id, 'systeme', tr("Limite d'usage atteinte : le DG reprend vers {heure}.", { heure: new Date(jusqua).toLocaleTimeString('fr-FR') }));
    pauseGlobale(tr("Limite d'usage atteinte"), jusqua);
    setTimeout(() => d.etat !== 'annule' && reessayer(), Math.max(0, jusqua - Date.now()) + 30000);
    return;
  }
  d.etat = 'echec';
  majDossier(d);
  message(d.id, 'systeme', tr('Le DG a échoué : {raison}', { raison: r.echec }));
}

function ajouterTaches(d, liste) {
  for (const p of liste) {
    const t = {
      id: `${d.id}-${p.ref}`,
      dossier: d.id,
      ref: p.ref,
      titre: p.titre.length > 60 ? p.titre.slice(0, 59) + '…' : p.titre,
      etage: p.etage,
      nature: p.nature,
      modele: p.modele,
      effort: p.effort,
      modeleReel: null,
      effortReel: null,
      etat: 'planned',
      attend: [],
      motifFile: null,
      inputsFrom: p.inputsFrom,
      dernierOutil: null,
      derniereActivite: null,
      verif: { mode: p.verification.mode, modele: p.verification.modele },
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
      },
      agent: null, // id de l'agent qui porte la tâche (réserve : A1, A2…)
      reembauche: false,
      // Prénom affiché dès le plan : celui de l'agent de la réserve demandé, sinon celui de la future recrue.
      prenom: (() => {
        const a = p.agent ? agentEquipe(p.agent) : null;
        return a && a.etat !== 'retire' && a.compte === d.compte ? a.prenom : tirerPrenom();
      })(),
    };
    majTache(t, null);
  }
  d.etages = [...new Set(tachesDe(d).map((t) => t.etage))];
  majDossier(d);
  emettre('plan', {
    dossier: d.id,
    taches: tachesDe(d)
      .sort((a, b) => numRef(a) - numRef(b))
      .map((t) => ({ ref: t.ref, titre: t.titre, etage: t.etage, deps: t.x.deps.map((x) => x.ref), modele: t.modele, effort: t.effort })),
  }, d.id);
}

export function repondre(d, texte, pieces = []) {
  notificationResolue(`QD-${d.id}`);
  if (d.etat !== 'clarification') throw new Error(tr("Le DG n'attend pas de réponse sur ce dossier."));
  const jointes = joindre(d, pieces);
  message(d.id, 'toi', texte, null, jointes.map(piecePublique));
  d.question = null;
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
  d.etat = 'annule';
  notificationResolue(`QD-${d.id}`);
  majDossier(d);
  for (const t of tachesDe(d)) annulerTache(t, false);
  message(d.id, 'systeme', tr('Dossier annulé.'));
  majDg({ etat: 'libre', dossier: d.id, action: null });
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

// Une tâche qui attend ta validation n'occupe pas de session : elle ne compte pas dans les plafonds.
const occupeUnePlace = (u) => ACTIFS.has(u.etat) && !(u.etat === 'verifying' && u.x.verification.mode === 'user');

function motifAttente(t) {
  const actifs = [...etat.taches.values()].filter((u) => occupeUnePlace(u) && u.id !== t.id);
  // 0 (ou moins) = illimité : seules les dépendances et les verrous font attendre.
  if (REGLAGES.plafondGlobal > 0 && actifs.length >= REGLAGES.plafondGlobal) return `plafond atteint (${actifs.length} en cours)`;
  if (REGLAGES.plafondEtage > 0 && actifs.filter((u) => u.etage === t.etage).length >= REGLAGES.plafondEtage) return 'étage plein';
  if (!t.x.profil.startsWith('lecture')) {
    const autres = [...(verrous.get(cleProjet(t)) || [])].map((id) => etat.taches.get(id)).filter((u) => u && u.id !== t.id && u.dossier !== t.dossier);
    if (autres.length) return `${trouverEtage(t.etage)?.nom} occupé par ${autres[0].dossier} (${autres[0].ref})`;
  }
  return null;
}

let tickEnCours = false;
export function tick() {
  if (tickEnCours || etat.ordonnanceur.pause) return;
  tickEnCours = true;
  try {
    const candidats = [...etat.taches.values()]
      .filter((t) => ['planned', 'waiting', 'ready', 'queued'].includes(t.etat))
      .sort((a, b) => (etat.dossiers.get(a.dossier)?.creeLe ?? 0) - (etat.dossiers.get(b.dossier)?.creeLe ?? 0) || numRef(a) - numRef(b));
    for (const t of candidats) {
      const d = etat.dossiers.get(t.dossier);
      if (!d || d.etat !== 'en_cours') continue;
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
      if (!t.x.approuvee) {
        demanderApprobation(t);
        continue;
      }
      const motif = motifAttente(t);
      if (motif) {
        if (t.etat !== 'queued' || t.motifFile !== motif) changerEtatTache(t, 'queued', { attend: [], motifFile: motif });
        continue;
      }
      lancer(t);
    }
  } finally {
    tickEnCours = false;
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
  const reprise = t.x.reprise;
  t.x.reprise = null;
  if (reprise?.phase === 'verification') {
    verification(t, d);
    return;
  }
  // Qui fait la tâche : un agent de la réserve réembauché (ou cloné), sinon une nouvelle recrue.
  let resumeAgent = null;
  let fork = false;
  if (!t.agent) {
    const r = t.x.agentDemande ? reembaucher(t.x.agentDemande, t, d) : null;
    if (t.x.agentDemande && !r) message(d.id, 'systeme', tr("{agent} n'est pas réembauchable pour {ref} : nouvelle recrue.", { agent: t.x.agentDemande, ref: t.ref }), [t.etage]);
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
    occuper(t.agent, t);
  }
  const amonts = t.inputsFrom.map((ref) => [ref, tacheRef(d, ref)]).filter(([, u]) => u?.x.sortie);
  changerEtatTache(t, reprise?.phase === 'rework' ? 'rework' : 'briefing', { attend: [], motifFile: null });
  if (amonts.length && !reprise) emettre('passation', { de: amonts.map(([, u]) => u.id), a: t.id }, d.id);
  let prompt = reprise ? reprise.prompt : promptProduction(t, amonts.map(([r, u]) => [r, u.x.sortie]), d.x.pieces || []);
  if (resumeAgent && !reprise) {
    prompt = `NOUVELLE MISSION, confiée par le DG. Tu as déjà travaillé sur ce projet : ton contexte passé reste valable, mais cette mission est indépendante de la précédente.\n\n${prompt}`;
  }
  executerProduction(t, d, prompt, reprise?.resume || resumeAgent, { fork: fork && !reprise });
}

async function executerProduction(t, d, prompt, resume, { fork = false } = {}) {
  const gen = t.x.gen;
  const ctrl = new AbortController();
  controleurs.set(t.id, ctrl);
  const canal = {};
  canaux.set(t.id, canal);
  let r;
  try {
    r = await moteur.produire(t, d, {
      prompt,
      resume,
      fork,
      canal,
      abortController: ctrl,
      canUseTool: canUseToolPour(t),
      surInit: (init) => {
        if (t.x.gen !== gen) return;
        t.x.session = init.session_id || t.x.session;
        changerEtatTache(t, t.etat === 'rework' ? 'rework' : 'running', { modeleReel: init.model || null, effortReel: t.effort, derniereActivite: Date.now() });
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
    });
  } catch (e) {
    r = { echec: String(e?.message || e) };
  }
  controleurs.delete(t.id);
  canaux.delete(t.id);
  if (t.x.gen !== gen || TERMINAUX.has(t.etat)) return; // annulée ou arrêt d'urgence entre-temps
  if (r.sessionId) t.x.session = r.sessionId;
  if (r.contexte != null) t.x.contexte = r.contexte;
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
  emettre('verification', { tache: t.id, phase: 'debut', verificateur: { modele: v.modele }, verdict: null }, d.id);
  const gen = t.x.gen;
  const ctrl = new AbortController();
  controleurs.set(t.id, ctrl);
  let r;
  try {
    r = await moteur.verifier(t, d, sortie, {
      abortController: ctrl,
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
  const verdict = r.verdict;
  t.x.dernierVerdict = verdict;
  emettre('verification', { tache: t.id, phase: 'fin', verificateur: { modele: v.modele }, verdict: verdict.verdict }, d.id);
  if (verdict.verdict === 'pass') {
    if (await roundComplement(t, d)) return;
    return terminer(t, 'done', sortie);
  }
  if (verdict.verdict === 'rework' && t.x.reworks < v.maxRework) return rework(t, d, verdict);
  terminer(t, 'failed', { ...sortie, status: 'failed', summary: tr('Rejet du vérificateur : {raison}', { raison: verdict.issues.map((i) => i.detail).join(' ; ') || verdict.preuve }) });
  reveilDG(d, `${t.ref} rejetée par le vérificateur (${verdict.verdict}) : ${verdict.issues.map((i) => `[${i.gravite}] ${i.detail}`).join(' ; ')}`);
}

async function rework(t, d, verdict) {
  t.x.reworks += 1;
  changerEtatTache(t, 'rework');
  await executerProduction(t, d, promptRework(verdict), t.x.session);
}

function finLimite(limite) {
  const r = limite?.resetsAt;
  if (!r) return Date.now() + 15 * 60 * 1000;
  return r < 1e12 ? r * 1000 : r;
}

function gererEchec(t, d, r, phase) {
  libererVerrou(t);
  if (ERREURS_FATALES.has(r.erreur)) {
    const c = d.compte === 'claude2' ? 2 : 1;
    pauseGlobale(tr('Compte {n} non connecté ou problème de facturation', { n: c }), null);
    alerte('erreur', tr('Lance connexion-compte-{n}.bat puis clique sur Reprendre.', { n: c }), d.id);
    t.x.reprise = repriseDe(t, phase, r.echec);
    changerEtatTache(t, 'queued', { motifFile: 'compte à vérifier' });
    return;
  }
  if (r.erreur === 'rate_limit' || r.limite) {
    pauseGlobale(tr("Limite d'usage atteinte"), finLimite(r.limite));
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
    prompt: `Ta session précédente s'est interrompue (${raison}). Reprends là où tu t'étais arrêté, termine la mission, puis rends ta sortie structurée complète.`,
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
  if (etatFinal === 'failed') t.x.enAttenteDg = true;
  // L'agent n'est pas renvoyé : il retourne à la réserve de son étage (sauf s'il n'a rien réussi).
  // En échec, il attend la décision du DG (qui peut le relancer) : on le libère après le plan_delta.
  if (t.agent && etatFinal !== 'failed') liberer(t.agent, { session: t.x.session, sortie: t.x.sortie, contexte: t.x.contexte ?? null, reussi: etatFinal === 'done' });
  if (!t.agent && t.prenom) libererPrenom(t.prenom); // jamais lancée : le prénom promis se libère
  changerEtatTache(t, etatFinal, { attend: [], motifFile: null });
  const d = etat.dossiers.get(t.dossier);
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
  terminer(t, 'cancelled', { status: 'failed', summary: tr('Annulée.') });
  if (notifier) message(t.dossier, 'systeme', tr('{ref} annulée.', { ref: t.ref }), [t.etage]);
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
  if (res.echec) {
    message(d.id, 'systeme', tr("Le DG n'a pas pu décider ({raison}) : les tâches en échec restent en échec.", { raison: res.echec }));
  } else {
    appliquerDelta(d, res.sortie);
  }
  for (const t of tachesDe(d)) {
    t.x.enAttenteDg = false;
    // Échec que le DG n'a pas relancé : l'agent quitte son poste (réserve ou retraite).
    if (t.etat === 'failed' && t.agent && agentEquipe(t.agent)?.tache === t.id) liberer(t.agent, { session: t.x.session, contexte: t.x.contexte ?? null, reussi: false });
  }
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
      if (op.modele) t.modele = op.modele;
      if (op.effort) t.effort = op.effort;
      Object.assign(t.x, { sortie: null, session: null, reprise: null, reworks: 0, relances: 0, enAttenteDg: false });
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
    const erreurs = validerTaches(delta.nouvellesTaches, tachesDe(d).map((t) => t.ref));
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
  d.synthese = res.sortie?.message || `${tr('Synthèse indisponible ({raison}).', { raison: res.echec })}\n${tableau(d)}`;
  message(d.id, 'dg', d.synthese, d.etages);
  const faites = taches.filter((t) => t.etat === 'done').length;
  d.etat = faites ? 'termine' : 'echec';
  notifier({ type: 'info', titre: tr(faites ? 'Dossier {id} terminé' : 'Dossier {id} en échec', { id: d.id }), texte: d.titre, dossier: d.id });
  majDossier(d);
}

// ---------------------------------------------------------------- reprise après redémarrage

// Appelé une fois au démarrage : les dossiers non terminés repartent (voir chargerHistorique).
export function reprendreDossiers() {
  for (const d of etat.dossiers.values()) {
    if (!d.x?.repriseApresRedemarrage) continue;
    d.x.repriseApresRedemarrage = false;
    d.x.pieces = d.x.pieces || [];
    d.x.complementsEnAttente = d.x.complementsEnAttente || [];
    const taches = tachesDe(d);
    for (const t of taches) {
      if (!t.prenom && !TERMINAUX.has(t.etat)) t.prenom = (t.agent && agentEquipe(t.agent)?.prenom) || tirerPrenom();
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
    majDossier(d);
  }
  tick();
  // Arrêt tombé pendant la synthèse finale (tout était fini) : on la relance.
  setImmediate(() => {
    for (const d of etat.dossiers.values()) if (d.etat === 'en_cours') verifierFinDossier(d);
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

export function pauseGlobale(raison, jusqua) {
  if (raison !== tr("Arrêt d'urgence")) notifier({ type: 'info', titre: tr('QG en pause'), texte: jusqua ? tr('{raison} — reprise vers {heure}', { raison, heure: new Date(jusqua).toLocaleTimeString('fr-FR') }) : raison });
  etat.ordonnanceur = { pause: { raison, jusqua } };
  emettre('ordonnanceur', { ordonnanceur: etat.ordonnanceur });
  clearTimeout(minuteriePause);
  if (jusqua) minuteriePause = setTimeout(() => reprendre(), Math.max(0, jusqua - Date.now()) + 30000);
}

export function reprendre() {
  clearTimeout(minuteriePause);
  etat.ordonnanceur = { pause: null };
  emettre('ordonnanceur', { ordonnanceur: etat.ordonnanceur });
  tick();
}

// Arrêt d'urgence : tout s'arrête ; les tâches en cours repartiront (reprise de session) sur « Reprendre ».
export function urgence() {
  pauseGlobale(tr("Arrêt d'urgence"), null);
  const actives = [...etat.taches.values()].filter(occupeUnePlace);
  refuserPour(new Set(actives.map((t) => t.id)));
  for (const t of actives) {
    const phase = t.etat === 'verifying' ? 'verification' : t.etat === 'rework' ? 'rework' : 'production';
    t.x.gen += 1;
    controleurs.get(t.id)?.abort();
    libererVerrou(t);
    t.x.reprise = repriseDe(t, phase, "arrêt d'urgence");
    changerEtatTache(t, 'queued', { motifFile: "arrêt d'urgence" });
  }
}

export const etatInterne = { verrous, dgOccupe, reveils };
