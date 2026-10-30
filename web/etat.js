// État client : reflète le serveur à partir des événements du protocole (docs/protocole.md).
import { t as tr } from './i18n.js';
import { noterReflexion, noterTraduction, chargerReflexions } from './reflexions.js';

export const TERMINAUX = new Set(['done', 'failed', 'cancelled', 'skipped']);
export const PAS_DEMARREE = new Set(['planned', 'waiting', 'ready', 'queued', 'briefing']);
export const DOSSIER_ACTIF = new Set(['programme', 'planification', 'clarification', 'en_cours']);

const LIBELLES_ETAT = {
  planned: 'planifiée', waiting: 'en attente', ready: 'prête', queued: 'en file', briefing: 'briefing', running: 'au travail',
  permission: 'main levée', verifying: 'vérification', rework: 'corrections', done: 'terminée', failed: 'échec',
  cancelled: 'annulée', skipped: 'sautée', interrupted: 'interrompue',
};
const LIBELLES_DOSSIER = {
  programme: 'programmé', planification: 'planification', clarification: 'question du DG', en_cours: 'en cours', termine: 'terminé', annule: 'annulé', echec: 'échec',
};
export const libelleEtat = (e) => tr(LIBELLES_ETAT[e] || e || '?');
export const libelleDossier = (e) => tr(LIBELLES_DOSSIER[e] || e || '?');
// Moteur d'une image demandée par un agent (délégation) : abonnement ChatGPT ou API Images facturée.
export const libelleMoteurImage = (m) => (m === 'api' ? tr('API Images, facturée') : tr('abonnement ChatGPT'));

export class Etat {
  constructor() {
    this.ecouteurs = [];
    this.reinitialiser();
  }

  reinitialiser() {
    this.seq = -1;
    this.recu = false;
    this.etages = [];
    this.comptes = [];
    this.compteDefaut = null;
    this.dossiers = new Map();
    this.taches = new Map();
    this.permissions = new Map();
    this.messages = [];
    this.dg = { etat: 'libre', dossier: null, etage: 'direction', action: null };
    this.dgDepuis = Date.now();
    this.ordonnanceur = { pause: null };
    this.plans = new Map();
    this.outils = new Map();
    this.verifs = new Map();
    this.passations = [];
    this.journal = [];
    this.alertes = [];
    this.fileDepuis = new Map();
    this.transitions = new Map();
    // v1.1
    this.modeles = {};
    this.mcp = { comptes: {}, etages: {} };
    // v1.2
    this.decisions = new Map();
    this.notifications = new Map();
    this.notifsRecentes = [];
    this.dictee = { disponible: false, appareil: null };
    // v1.3 : réserve d'agents
    this.equipe = new Map();
    // v1.4 : serveurs du sous-sol, terminaux des agents
    this.services = new Map();
    this.journauxServices = new Map(); // id -> lignes (journal complet connu du site)
    this.terminaux = new Map(); // tache -> [commande]
    this.modifications = new Map(); // tache -> [fichier écrit avec son diff] (reçus en direct ou relus à la demande)
    this.actionsService = [];
    // 1.0.11 : image demandée par un agent (outil generer_image) et dernière compaction, par tâche (en direct
    // seulement : un rechargement de la page les oublie, le fil garde l'image et la fiche le nombre de compactions)
    this.delegations = new Map(); // tache -> { statut: en_cours|ok|echec, moteur, compte, chemin, cout, t }
    this.compactions = new Map(); // tache -> { t, declencheur, avant }
    // v1.5 : pensées en direct, happiness manager
    this.pensees = new Map(); // cible ('dg' ou id de tâche) -> dernière pensée
    this.reflexions = new Map(); // cible -> derniers blocs de réflexion complets (web/reflexions.js)
    this.bonheur = { blagues: [], faits: [], ambiance: [], maj: null, source: null };
    // v2 : réglages, personnalisation (prénoms, skins), consommation
    this.reglages = { langueInterface: 'fr', langueIA: 'fr', racines: [], onboarding: true, modeTravail: 'auto' };
    this.personnalisation = { prenoms: [], skins: {} };
    this.conso = null;
    this.miniJeu = { reglages: {}, personnalites: {}, memoires: {} };
    this.skills = [];
  }

  // Dossier supprimé sur le serveur : il disparaît de partout (liste, scènes, tableau, fil, notifications).
  oublierDossier(id) {
    if (!id) return;
    const taches = new Set([...this.taches.values()].filter((t) => t.dossier === id).map((t) => t.id));
    for (const tid of taches) {
      for (const m of [this.taches, this.verifs, this.outils, this.fileDepuis, this.transitions, this.terminaux, this.modifications, this.pensees, this.reflexions, this.delegations, this.compactions]) m.delete(tid);
    }
    for (const [k, p] of this.permissions) if (taches.has(p.tache)) this.permissions.delete(k);
    for (const [k, x] of this.decisions) if (taches.has(x.tache)) this.decisions.delete(k);
    for (const [k, n] of this.notifications) if (n.dossier === id || taches.has(n.tache)) this.notifications.delete(k);
    this.notifsRecentes = this.notifsRecentes.filter((n) => n.dossier !== id && !taches.has(n.tache));
    this.messages = this.messages.filter((m) => m.dossier !== id);
    this.passations = this.passations.filter((p) => !taches.has(p.a));
    this.plans.delete(id);
    this.dossiers.delete(id);
    for (const [etage, d] of Object.entries(this.choixTableaux())) if (d === id) this.choisirTableau(etage, null);
  }

  // Tableau blanc de chaque étage : le dossier choisi en cliquant dessus (rien = automatique).
  // Gardé dans ce navigateur seulement (une préférence d'affichage).
  choixTableaux() {
    try {
      return JSON.parse(localStorage.getItem('qg.tableaux') || '{}') || {};
    } catch {
      return {};
    }
  }
  tableauChoisi(etage) {
    const s = this.tableauxSession;
    const d = s && etage in s ? s[etage] : this.choixTableaux()[etage];
    return d && this.dossiers.has(d) ? d : null;
  }
  choisirTableau(etage, dossier) {
    const c = this.choixTableaux();
    if (dossier) c[etage] = dossier;
    else delete c[etage];
    try {
      localStorage.setItem('qg.tableaux', JSON.stringify(c));
    } catch {
      /* navigation privée : le choix ne dure que le temps de la page */
    }
    this.tableauxSession = { ...(this.tableauxSession || {}), [etage]: dossier || null };
  }

  // Noms du DG et de Joy, modifiables dans Réglages › Équipe (en direct).
  nomDg() {
    return (this.personnalisation && this.personnalisation.noms && this.personnalisation.noms.dg) || tr('DG');
  }

  nomJoy() {
    return (this.personnalisation && this.personnalisation.noms && this.personnalisation.noms.joy) || 'Joy';
  }

  // Durée d'affichage des bulles (Réglages › Happiness manager) : 1 = normale.
  dureeBulles() {
    const v = Number(this.reglages && this.reglages.dureeBulles);
    return v > 0 ? v : 1;
  }

  // Prénom d'une tâche (ou de son agent), avec la ref en secours.
  nom(t) {
    if (!t) return '?';
    if (t.prenom) return t.prenom;
    const a = t.agent ? this.equipe.get(t.agent) : null;
    return (a && a.prenom) || t.ref || t.id;
  }

  nomRef(dossier, ref) {
    const t = this.tacheParRef(dossier, ref);
    return t ? this.nom(t) : ref;
  }

  noterPensee(p) {
    if (!p || !p.cible) return;
    this.pensees.set(p.cible, p); // dernier état (phase, extrait court pour les bulles)
    if (p.phase === 'reflexion' && (p.bloc || p.extrait)) noterReflexion(this.reflexions, p.cible, p);
  }

  ecouter(fn) {
    this.ecouteurs.push(fn);
  }

  etage(id) {
    return this.etages.find((e) => e.id === id) || null;
  }

  tacheParRef(dossier, ref) {
    for (const t of this.taches.values()) if (t.dossier === dossier && t.ref === ref) return t;
    return null;
  }

  tachesEtage(id) {
    return [...this.taches.values()].filter((t) => t.etage === id);
  }

  dossierEnClarification() {
    let best = null;
    for (const d of this.dossiers.values()) {
      if (d.etat === 'clarification' && (!best || (d.creeLe || 0) > (best.creeLe || 0))) best = d;
    }
    return best;
  }

  // Question en attente posée par l'agent d'une tâche (main levée « ? »).
  decisionDe(tacheId) {
    for (const d of this.decisions.values()) if (d.tache === tacheId) return d;
    return null;
  }

  // Nom lisible d'un modèle (« Opus 5.5 ») d'après la liste du compte.
  nomModele(id, compte = null) {
    if (!id) return '';
    const listes = compte && this.modeles[compte] ? [this.modeles[compte]] : Object.values(this.modeles);
    for (const l of listes) {
      const m = (l || []).find((x) => x.id === id);
      if (m) return m.nom;
    }
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  // Plusieurs IA : un compte autre que Claude est présent ? Sinon le site ne parle que de Claude (pas de choix d'IA).
  get multiIa() {
    return (this.comptes || []).some((c) => (c.fournisseur || 'claude') !== 'claude');
  }

  // « Codex perso · ChatGPT · Codex » : nom du compte et de son IA (agent ACP : son nom court).
  libelleCompte(id) {
    const c = (this.comptes || []).find((x) => x.id === id);
    if (!c) return id || '';
    const f = (this.fournisseurs || []).find((x) => x.id === (c.fournisseur || 'claude'));
    const agent = c.fournisseur === 'acp' ? (this.agentsAcp || []).find((a) => a.id === c.agent) : null;
    const ia = agent ? agent.nomCourt : f ? f.nom : c.fournisseur || 'Claude';
    return c.nom + ' · ' + ia + (c.qualification === 'non-faite' ? ' · ' + tr('pas encore qualifié') : '');
  }

  agentsEtage(id) {
    return [...this.equipe.values()].filter((a) => a.etage === id && a.etat !== 'retire');
  }

  // Étage « Sous-sol serveurs » (type serveur).
  sousSol() {
    return this.etages.find((e) => e.type === 'serveur') || null;
  }

  servicesEtage(id) {
    return [...this.services.values()].filter((s) => s.etage === id);
  }

  dossierActif(id) {
    const d = this.dossiers.get(id);
    return !!d && DOSSIER_ACTIF.has(d.etat);
  }

  // Une autre tâche cite-t-elle `t` dans inputsFrom sans avoir encore démarré (ni eu sa passation) ?
  attenduEnReunion(t) {
    for (const u of this.taches.values()) {
      if (u.dossier !== t.dossier || u.id === t.id) continue;
      if (!(u.inputsFrom || []).includes(t.ref)) continue;
      if (!PAS_DEMARREE.has(u.etat)) continue;
      if (this.passations.some((p) => p.a === u.id)) continue;
      return u;
    }
    return null;
  }

  // Marqueurs de la vue globale pour un étage.
  marqueurs(id) {
    const m = { enCours: 0, attente: 0, main: false, verif: false, echec: false, dg: this.dg.etage === id };
    for (const t of this.taches.values()) {
      if (t.etage !== id) continue;
      const actif = this.dossierActif(t.dossier);
      if (t.etat === 'running' || t.etat === 'rework' || t.etat === 'briefing') m.enCours++;
      if (t.etat === 'permission') {
        m.main = true;
        m.enCours++;
      }
      if (t.etat === 'verifying') {
        m.verif = true;
        m.enCours++;
      }
      if (['waiting', 'queued', 'planned', 'ready'].includes(t.etat)) m.attente++;
      if (t.etat === 'failed' && actif) m.echec = true;
    }
    for (const p of this.permissions.values()) {
      const t = this.taches.get(p.tache);
      if (t && t.etage === id) m.main = true;
    }
    if (this.dg.etage === id && (this.dg.action === 'question' || this.dossierEnClarification())) m.main = true;
    for (const d of this.decisions.values()) {
      const t = this.taches.get(d.tache);
      if (t && t.etage === id) m.main = true;
    }
    return m;
  }

  // Étages concernés par un événement (pour le clignotement des flèches et « suivre l'action »).
  etagesDe(ev) {
    const res = new Set();
    const parTache = (id) => {
      const t = this.taches.get(id);
      if (t) res.add(t.etage);
    };
    switch (ev.type) {
      case 'tache':
        if (ev.tache) res.add(ev.tache.etage);
        break;
      case 'plan':
        (ev.taches || []).forEach((t) => res.add(t.etage));
        break;
      case 'dg':
        if (ev.dg && ev.dg.etage) res.add(ev.dg.etage);
        break;
      case 'passation':
        parTache(ev.a);
        (ev.de || []).forEach(parTache);
        break;
      case 'verification':
      case 'modification':
      case 'delegation':
      case 'compaction':
        parTache(ev.tache);
        break;
      case 'permission':
        if (ev.permission) parTache(ev.permission.tache);
        break;
      case 'dossier':
        (ev.dossier && ev.dossier.etages ? ev.dossier.etages : []).forEach((e) => res.add(e));
        break;
      case 'decision':
        if (ev.decision) parTache(ev.decision.tache);
        break;
      case 'agent':
        if (ev.agent && ev.agent.etage) res.add(ev.agent.etage);
        break;
      case 'service':
        if (ev.service) {
          if (ev.service.etage) res.add(ev.service.etage);
          const ss = this.sousSol();
          if (ss) res.add(ss.id);
        }
        break;
      case 'service_action': {
        parTache(ev.tache);
        const ss = this.sousSol();
        if (ss) res.add(ss.id);
        break;
      }
      case 'notification':
        if (ev.notification) {
          if (ev.notification.etage) res.add(ev.notification.etage);
          else if (ev.notification.tache) parTache(ev.notification.tache);
        }
        break;
      default:
    }
    return [...res].filter(Boolean);
  }

  // Service lié à un étage de jeu (le premier, en pratique rojo).
  serviceDe(etageId) {
    for (const sv of this.services.values()) if (sv.etage === etageId) return sv;
    return null;
  }

  // Événement « fort » : main levée, échec, question du DG.
  estImportant(ev) {
    if (ev.type === 'permission' || ev.type === 'decision') return true;
    if (ev.type === 'tache' && ev.tache && ev.tache.etat === 'failed' && ev.transition && ev.transition.a === 'failed') return true;
    if (ev.type === 'dg' && ev.dg && ev.dg.action === 'question') return true;
    if (ev.type === 'dossier' && ev.dossier && ev.dossier.etat === 'clarification') return true;
    if (ev.type === 'verification' && ev.phase === 'fin' && ev.verdict && ev.verdict !== 'pass') return true;
    return false;
  }

  appliquer(ev) {
    if (!ev || typeof ev !== 'object' || !ev.type) return;
    if (ev.type !== 'etat' && typeof ev.seq === 'number' && ev.seq <= this.seq) return;
    if (typeof ev.seq === 'number') this.seq = ev.seq;
    const t = ev.t || Date.now();
    switch (ev.type) {
      case 'etat':
        this.chargerEtat(ev);
        break;
      case 'dossier':
        // archivé (1.0.7) ou supprimé depuis moins de 30 s (1.0.8) : il quitte l'écran, mais reste sur le disque
        if (ev.dossier && (ev.dossier.archive || ev.dossier.supprimeLe)) this.oublierDossier(ev.dossier.id);
        else if (ev.dossier && ev.dossier.id) this.dossiers.set(ev.dossier.id, ev.dossier);
        break;
      case 'dossier_supprime':
        this.oublierDossier(ev.dossier);
        break;
      case 'tache': {
        const ta = ev.tache;
        if (!ta || !ta.id) break;
        const avant = this.taches.get(ta.id);
        this.taches.set(ta.id, { ...ta });
        const de = ev.transition ? ev.transition.de : avant ? avant.etat : null;
        if (ta.etat === 'queued' && de !== 'queued') this.fileDepuis.set(ta.id, t);
        if (!avant || avant.etat !== ta.etat) this.transitions.set(ta.id, { de, a: ta.etat, t });
        break;
      }
      case 'plan':
        this.plans.set(ev.dossier, { dossier: ev.dossier, taches: ev.taches || [], estimation: ev.estimation || null, t });
        break;
      case 'dg':
        if (ev.dg) {
          this.dg = { etat: 'libre', dossier: null, etage: this.dg.etage, action: null, ...ev.dg };
          this.dgDepuis = t;
        }
        break;
      case 'sousagents': {
        // sous-agents lancés par un agent (outil Agent, 1.0.10) : ils apparaissent aux postes libres de son étage
        const ta = this.taches.get(ev.tache);
        if (ta) ta.sousAgents = ev.n;
        break;
      }
      case 'outil': {
        const liste = this.outils.get(ev.tache) || [];
        liste.push({ nom: ev.nom, cible: ev.cible, t });
        if (liste.length > 12) liste.shift();
        this.outils.set(ev.tache, liste);
        const ta = this.taches.get(ev.tache);
        if (ta) {
          ta.dernierOutil = { nom: ev.nom, cible: ev.cible };
          ta.derniereActivite = t;
        }
        break;
      }
      case 'activite': {
        const ta = this.taches.get(ev.tache);
        if (ta) ta.derniereActivite = t;
        break;
      }
      case 'mesures': {
        // lot C3 : contexte actuel, compactions et coût d'une tâche en cours (fiche de la tâche et de l'agent)
        const ta = this.taches.get(ev.tache);
        if (ta) ta.mesures = ev.mesures || null;
        break;
      }
      case 'compaction':
        // la conversation de l'agent a été résumée (contexte plein) : l'heure et la taille d'avant, sur sa fiche
        if (ev.tache) this.compactions.set(ev.tache, { t, declencheur: ev.declencheur || 'auto', avant: ev.avant || 0 });
        break;
      case 'delegation':
        // image demandée par l'agent (en cours, faite, ratée) : sur sa fiche ; l'image faite arrive aussi dans le fil
        if (ev.tache) this.delegations.set(ev.tache, { statut: ev.statut, moteur: ev.moteur || null, compte: ev.compte || null, chemin: ev.chemin || '', cout: ev.cout ?? null, t });
        break;
      // sans état ici : l'interface s'en sert (ui.js › surEvenement)
      case 'priorites': // Réglages › Priorités changés (ici ou dans un autre onglet)
      case 'maj': // nouvelle version trouvée par le serveur (il regarde toutes les 3 h)
        break;
      // ignoré exprès : une ligne de npm par événement pendant l'installation d'un agent ; Réglages › Comptes IA
      // relit déjà les prérequis toutes les 4 s, et l'événement `comptes` de la fin redessine la page
      case 'prerequis':
        return;
      case 'passation':
        this.passations.push({ de: ev.de || [], a: ev.a, t });
        if (this.passations.length > 50) this.passations.shift();
        break;
      case 'verification':
        if (ev.phase === 'debut') {
          this.verifs.set(ev.tache, { phase: 'debut', verificateur: ev.verificateur || null, verdict: null, t, tFin: null });
        } else {
          const v = this.verifs.get(ev.tache) || { verificateur: ev.verificateur || null, t };
          this.verifs.set(ev.tache, { ...v, phase: 'fin', verdict: ev.verdict || null, tFin: t, verificateur: ev.verificateur || v.verificateur });
        }
        break;
      case 'permission':
        if (ev.permission && ev.permission.id) this.permissions.set(ev.permission.id, ev.permission);
        break;
      case 'permission_resolue':
        this.permissions.delete(ev.id);
        break;
      case 'message':
        if (ev.message) {
          this.messages.push(ev.message);
          if (this.messages.length > 500) this.messages.shift();
        }
        break;
      case 'ordonnanceur':
        this.ordonnanceur = ev.ordonnanceur || { pause: null };
        break;
      case 'alerte':
        this.alertes.push({ niveau: ev.niveau || 'info', texte: ev.texte || '', t, id: ev.seq != null ? ev.seq : t });
        if (this.alertes.length > 20) this.alertes.shift();
        break;
      case 'decision':
        if (ev.decision && ev.decision.id) this.decisions.set(ev.decision.id, ev.decision);
        break;
      case 'decision_resolue':
        this.decisions.delete(ev.id);
        break;
      case 'notification': {
        const n = ev.notification;
        if (!n || !n.id) break;
        if ((n.actions || []).length) this.notifications.set(n.id, n);
        this.notifsRecentes = [n, ...this.notifsRecentes.filter((x) => x.id !== n.id)].slice(0, 30);
        break;
      }
      case 'notification_resolue':
        this.notifications.delete(ev.id);
        this.notifsRecentes = this.notifsRecentes.map((x) => (x.id === ev.id ? { ...x, resolue: true } : x));
        break;
      case 'mcp':
        if (ev.mcp) this.mcp = ev.mcp;
        if (ev.modeles) this.modeles = ev.modeles;
        break;
      case 'agent':
        if (ev.agent && ev.agent.id) this.equipe.set(ev.agent.id, ev.agent);
        break;
      case 'etages':
        if (Array.isArray(ev.etages)) this.etages = ev.etages.slice();
        break;
      case 'comptes':
        if (Array.isArray(ev.comptes)) this.comptes = ev.comptes;
        if (ev.compteDefaut) this.compteDefaut = ev.compteDefaut;
        if (Array.isArray(ev.fournisseurs)) this.fournisseurs = ev.fournisseurs;
        if ('compteAgents' in ev) this.compteAgents = ev.compteAgents || null;
        if (ev.installationCodex) this.installationCodex = ev.installationCodex;
        if (Array.isArray(ev.agentsAcp)) this.agentsAcp = ev.agentsAcp;
        break;
      case 'codex-installation':
        this.installationCodex = { etat: ev.etat, version: ev.version, lignes: ev.lignes || [], erreur: ev.erreur || null, present: !!ev.present };
        break;
      case 'reglages':
        if (ev.reglages) this.reglages = { ...this.reglages, ...ev.reglages };
        break;
      case 'personnalisation':
        if (ev.personnalisation) this.personnalisation = ev.personnalisation;
        break;
      case 'conso':
        if (ev.conso) this.conso = ev.conso;
        break;
      case 'pensee':
        this.noterPensee({ ...ev, t: ev.t || t });
        break;
      case 'pensee_traduction':
        if (ev.cible) noterTraduction(this.reflexions, ev.cible, ev.bloc, ev.traduction);
        break;
      case 'bonheur':
        if (ev.bonheur) this.bonheur = { blagues: [], faits: [], ambiance: [], ...ev.bonheur };
        break;
      case 'service':
        if (ev.service && ev.service.id) {
          const avant = this.services.get(ev.service.id);
          this.services.set(ev.service.id, ev.service);
          if (avant && avant.etat !== 'demarrage' && ev.service.etat === 'demarrage') {
            // nouveau lancement : le journal repart de zéro, ses lignes arrivent par service_log
            this.journauxServices.set(ev.service.id, []);
          } else if (!this.journauxServices.has(ev.service.id)) {
            this.journauxServices.set(ev.service.id, [...(ev.service.dernieresLignes || [])]);
          }
        }
        break;
      case 'service_log': {
        const l = this.journauxServices.get(ev.id) || [];
        l.push(...(ev.lignes || []));
        if (l.length > 600) l.splice(0, l.length - 600);
        this.journauxServices.set(ev.id, l);
        break;
      }
      case 'service_action':
        this.actionsService.push({ tache: ev.tache, service: ev.service, action: ev.action, t });
        if (this.actionsService.length > 30) this.actionsService.shift();
        break;
      case 'commande': {
        if (!ev.tache || !ev.commande) break;
        const liste = this.terminaux.get(ev.tache) || [];
        const i = liste.findIndex((c) => c.id === ev.commande.id);
        if (i >= 0) liste[i] = { ...liste[i], ...ev.commande };
        else liste.push(ev.commande);
        if (liste.length > 40) liste.splice(0, liste.length - 40);
        this.terminaux.set(ev.tache, liste);
        break;
      }
      case 'navigateur_app':
        this.navigateurApp = ev;
        break;
      case 'skills':
        if (Array.isArray(ev.skills)) this.skills = ev.skills;
        break;
      // mini-jeu des personnages : réglages, personnalités, mémoires ; répliques en direct
      case 'mini_jeu':
        this.miniJeu = { reglages: ev.reglages, personnalites: ev.personnalites, memoires: ev.memoires, intrigues: ev.intrigues || { rumeurs: [], histoires: [] } };
        break;
      case 'discussion': {
        const m = this.miniJeu && this.miniJeu.memoires ? (this.miniJeu.memoires[ev.cle] = this.miniJeu.memoires[ev.cle] || { souvenirs: [], relations: {}, dialogue: [] }) : null;
        if (m && ev.de !== 'erreur') m.dialogue.push({ t, de: ev.de === 'toi' ? 'toi' : ev.de === 'perso' ? 'perso' : ev.auteur, texte: ev.texte });
        break;
      }
      case 'bavardage':
        break;
      case 'modification': {
        if (!ev.tache || !ev.modification) break;
        const liste = this.modifications.get(ev.tache) || [];
        if (!liste.some((x) => x.id === ev.modification.id)) liste.push(ev.modification);
        if (liste.length > 60) liste.splice(0, liste.length - 60);
        this.modifications.set(ev.tache, liste);
        break;
      }
      default:
        return;
    }
    const resume = this.resumer(ev);
    if (resume) {
      // une ligne du journal sur du code écrit garde de quoi ouvrir son diff
      const lien = ev.type === 'modification' ? { tache: ev.tache, modif: ev.modification.id, ajouts: ev.modification.ajouts, suppressions: ev.modification.suppressions } : {};
      this.journal.push({ t, texte: resume, etages: this.etagesDe(ev), type: ev.type, ...lien });
      if (this.journal.length > 400) this.journal.shift();
    }
    for (const fn of this.ecouteurs) {
      try {
        fn(ev, this);
      } catch (e) {
        console.error(e);
      }
    }
  }

  chargerEtat(ev) {
    const garderOutils = this.outils;
    this.reinitialiser();
    this.outils = garderOutils;
    this.recu = true;
    this.seq = typeof ev.seq === 'number' ? ev.seq : -1;
    this.etages = Array.isArray(ev.etages) ? ev.etages.slice() : [];
    this.comptes = Array.isArray(ev.comptes) ? ev.comptes : [];
    this.compteDefaut = ev.compteDefaut || (this.comptes[0] && this.comptes[0].id) || null;
    this.fournisseurs = Array.isArray(ev.fournisseurs) ? ev.fournisseurs : [];
    this.compteAgents = ev.compteAgents || null;
    this.installationCodex = ev.installationCodex || null;
    this.agentsAcp = Array.isArray(ev.agentsAcp) ? ev.agentsAcp : [];
    for (const d of ev.dossiers || []) this.dossiers.set(d.id, d);
    for (const t of ev.taches || []) {
      this.taches.set(t.id, { ...t });
      if (t.etat === 'queued') this.fileDepuis.set(t.id, 0);
    }
    for (const p of ev.permissions || []) this.permissions.set(p.id, p);
    this.messages = Array.isArray(ev.messages) ? ev.messages.slice(-500) : [];
    if (ev.dg) this.dg = { etat: 'libre', dossier: null, etage: 'direction', action: null, ...ev.dg };
    this.ordonnanceur = ev.ordonnanceur || { pause: null };
    this.modeles = ev.modeles && typeof ev.modeles === 'object' ? ev.modeles : {};
    this.mcp = ev.mcp && typeof ev.mcp === 'object' ? { comptes: {}, etages: {}, ...ev.mcp } : { comptes: {}, etages: {} };
    for (const d of ev.decisions || []) this.decisions.set(d.id, d);
    for (const n of ev.notifications || []) this.notifications.set(n.id, n);
    this.notifsRecentes = [...this.notifications.values()].sort((a, b) => (b.t || 0) - (a.t || 0));
    this.dictee = ev.dictee && typeof ev.dictee === 'object' ? ev.dictee : { disponible: false, appareil: null };
    for (const a of ev.equipe || []) this.equipe.set(a.id, a);
    for (const sv of ev.services || []) {
      this.services.set(sv.id, sv);
      this.journauxServices.set(sv.id, [...(sv.dernieresLignes || [])]);
    }
    for (const [tache, liste] of Object.entries(ev.terminaux || {})) if (Array.isArray(liste)) this.terminaux.set(tache, liste.slice(-40));
    chargerReflexions(this.reflexions, ev.reflexions);
    // dernier état (sans `ajout` : le texte complet vient de `reflexions` ; un ancien serveur n'envoie que l'extrait)
    for (const [cible, p] of Object.entries(ev.pensees || {})) if (p) this.noterPensee({ cible, ...p });
    if (ev.bonheur && typeof ev.bonheur === 'object') this.bonheur = { blagues: [], faits: [], ambiance: [], ...ev.bonheur };
    if (ev.reglages && typeof ev.reglages === 'object') this.reglages = { ...this.reglages, ...ev.reglages };
    if (ev.personnalisation && typeof ev.personnalisation === 'object') this.personnalisation = ev.personnalisation;
    if (ev.conso && typeof ev.conso === 'object') this.conso = ev.conso;
    if (ev.miniJeu && typeof ev.miniJeu === 'object') this.miniJeu = ev.miniJeu;
    if (Array.isArray(ev.skills)) this.skills = ev.skills;
    // v1.2 : `plans` donne les vraies dépendances par dossier.
    if (ev.plans && typeof ev.plans === 'object') {
      for (const [dossier, taches] of Object.entries(ev.plans)) {
        if (!Array.isArray(taches) || !taches.length) continue;
        this.plans.set(dossier, { dossier, taches, t: (this.dossiers.get(dossier) || {}).creeLe || 0 });
      }
    }
    // Repli (serveur v1) : plans reconstitués depuis les tâches, dépendances approximées.
    const parDossier = new Map();
    for (const t of this.taches.values()) {
      if (this.plans.has(t.dossier)) continue;
      if (!parDossier.has(t.dossier)) parDossier.set(t.dossier, []);
      parDossier.get(t.dossier).push(t);
    }
    for (const [dossier, liste] of parDossier) {
      liste.sort((a, b) => (parseInt(String(a.ref).replace(/\D/g, ''), 10) || 0) - (parseInt(String(b.ref).replace(/\D/g, ''), 10) || 0));
      this.plans.set(dossier, {
        dossier,
        reconstitue: true,
        t: (this.dossiers.get(dossier) || {}).creeLe || 0,
        taches: liste.map((t) => ({
          ref: t.ref, titre: t.titre, etage: t.etage, modele: t.modele, effort: t.effort,
          deps: [...new Set([...(t.inputsFrom || []), ...(t.attend || [])])],
        })),
      });
    }
  }

  resumer(ev) {
    const ref = (id) => {
      const t = this.taches.get(id);
      if (!t) return id;
      const n = this.nom(t);
      return (n !== t.ref ? n + ' · ' : '') + t.ref + ' (' + (this.etage(t.etage)?.nom || t.etage) + ')';
    };
    switch (ev.type) {
      case 'etat':
        return tr('État complet reçu : {taches} tâche(s), {dossiers} dossier(s)', { taches: (ev.taches || []).length, dossiers: (ev.dossiers || []).length });
      case 'dossier':
        if (ev.dossier.archive) return tr('Dossier {id} archivé', { id: ev.dossier.id });
        if (ev.dossier.supprimeLe) return tr('Dossier {id} supprimé (30 s pour annuler)', { id: ev.dossier.id });
        return tr('Dossier {id} : {etat}', { id: ev.dossier.id, etat: libelleDossier(ev.dossier.etat) }) + (ev.dossier.titre ? ' — ' + ev.dossier.titre : '');
      case 'dossier_supprime':
        return tr('Dossier {id} supprimé', { id: ev.dossier });
      case 'bavardage':
        return tr('{noms} bavardent', { noms: [...new Set((ev.lignes || []).map((l) => l.nom))].join(' & ') });
      case 'modification': {
        const m = ev.modification;
        return tr('{tache} a {action} {fichier}', { tache: ref(ev.tache), action: m.type === 'create' ? tr('créé') : tr('modifié'), fichier: m.rel });
      }
      case 'tache': {
        const tra = ev.transition || {};
        return tra.de
          ? tr('{tache} : {de} → {a}', { tache: ref(ev.tache.id), de: libelleEtat(tra.de), a: libelleEtat(ev.tache.etat) })
          : tr('{tache} : {a}', { tache: ref(ev.tache.id), a: libelleEtat(ev.tache.etat) });
      }
      case 'plan':
        return tr('Plan du dossier {dossier} : {n} tâche(s)', { dossier: ev.dossier, n: (ev.taches || []).length });
      case 'dg': {
        const d = ev.dg || {};
        const act = { plan: 'affiche son plan', delta: 'modifie le plan', synthese: 'rédige la synthèse', question: 'te pose une question' }[d.action];
        return (d.etat === 'reflechit' ? tr('DG réfléchit') : tr('DG libre')) + (act ? ', ' + tr(act) : '') + (d.etage ? ' — ' + (this.etage(d.etage)?.nom || d.etage) : '');
      }
      case 'outil':
        return ref(ev.tache) + ' · ' + ev.nom + (ev.cible ? ' ' + ev.cible : '');
      case 'passation':
        return tr('Passation {de} → {a}', { de: (ev.de || []).map((d) => this.nom(this.taches.get(d)) || d).join(', '), a: this.nom(this.taches.get(ev.a)) || ev.a });
      case 'verification':
        return ev.phase === 'debut'
          ? tr('Vérification {tache} : début', { tache: ref(ev.tache) }) + (ev.verificateur ? ' (' + ev.verificateur.modele + ')' : '')
          : tr('Vérification {tache} : {verdict}', { tache: ref(ev.tache), verdict: ev.verdict || tr('fin') });
      case 'permission':
        return tr('{tache} demande {outil} : {resume}', { tache: ref(ev.permission.tache), outil: ev.permission.outil, resume: ev.permission.resume });
      case 'permission_resolue':
        return ev.decision === 'allow' ? tr('Permission {id} : autorisée', { id: ev.id }) : tr('Permission {id} : refusée', { id: ev.id });
      case 'ordonnanceur':
        if (ev.ordonnanceur && ev.ordonnanceur.pause) return tr('Pause : {raison}', { raison: ev.ordonnanceur.pause.raison || '' });
        // multi-IA (D4) : comptes en pause, le reste du QG continue
        if (ev.ordonnanceur && ev.ordonnanceur.pauses && Object.keys(ev.ordonnanceur.pauses).length) return tr('Comptes en pause : {comptes}', { comptes: Object.keys(ev.ordonnanceur.pauses).join(', ') });
        return tr('Reprise de l’ordonnanceur');
      case 'alerte':
        return tr('Alerte {niveau} : {texte}', { niveau: ev.niveau, texte: ev.texte });
      case 'decision':
        return tr('{tache} te pose une question : {question}', { tache: ref(ev.decision.tache), question: ev.decision.question });
      case 'decision_resolue':
        if (ev.choix) return tr('Question {id} : réponse {choix}', { id: ev.id, choix: ev.choix });
        return ev.texte ? tr('Question {id} : réponse libre', { id: ev.id }) : tr('Question {id} : sans réponse', { id: ev.id });
      case 'notification':
        return tr('Notification : {titre}', { titre: ev.notification.titre || '' });
      case 'mcp':
        return tr('Connecteurs MCP mis à jour');
      case 'etages':
        return tr('Immeuble mis à jour : {n} étages', { n: (ev.etages || []).length });
      case 'bonheur':
        return tr('Nouvelle récolte du happiness manager : {blagues} blagues, {faits} anecdotes', {
          blagues: ((ev.bonheur && ev.bonheur.blagues) || []).length,
          faits: ((ev.bonheur && ev.bonheur.faits) || []).length,
        });
      case 'pensee':
      case 'pensee_traduction':
        return null;
      case 'agent': {
        const a = ev.agent;
        const lib = { disponible: tr('en réserve'), occupe: tr('au travail') + (a.tache ? ' (' + (this.taches.get(a.tache)?.ref || a.tache) + ')' : ''), retire: tr('à la retraite') }[a.etat] || a.etat;
        const qui = a.prenom ? a.prenom + ' (' + a.id + ')' : a.id;
        return a.cloneDe
          ? tr('Agent {agent}, clone de {source} : {etat}', { agent: qui, source: a.cloneDe, etat: lib })
          : tr('Agent {agent} : {etat}', { agent: qui, etat: lib });
      }
      case 'service':
        return tr('Serveur {nom} ({etage}) : {etat}', { nom: ev.service.nom || ev.service.id, etage: this.etage(ev.service.etage)?.nom || ev.service.etage, etat: ev.service.etat }) + (ev.service.erreur ? ' — ' + ev.service.erreur : '');
      case 'service_action':
        return ev.action === 'arreter'
          ? tr('{tache} descend au sous-sol éteindre {service}', { tache: ref(ev.tache), service: ev.service })
          : tr('{tache} descend au sous-sol allumer {service}', { tache: ref(ev.tache), service: ev.service });
      case 'commande':
        return ev.commande.enCours ? ref(ev.tache) + ' $ ' + String(ev.commande.commande || '').slice(0, 120) : null;
      case 'compaction':
        return tr('{tache} : conversation résumée pour faire de la place ({n} k tokens avant)', { tache: ref(ev.tache), n: Math.round((ev.avant || 0) / 1000) });
      case 'delegation': {
        const fichier = ev.chemin || tr('image');
        if (ev.statut === 'en_cours') return tr('{tache} crée une image ({moteur}) : {fichier}', { tache: ref(ev.tache), moteur: libelleMoteurImage(ev.moteur), fichier });
        if (ev.statut === 'ok') return tr('{tache} : image créée ({fichier})', { tache: ref(ev.tache), fichier });
        return tr('{tache} : image pas créée ({fichier})', { tache: ref(ev.tache), fichier });
      }
      case 'priorites':
        return tr('Réglages › Priorités mis à jour');
      case 'maj':
      case 'service_log':
      case 'notification_resolue':
      case 'message':
        return null;
      default:
        return null;
    }
  }
}
