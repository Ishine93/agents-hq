// Interface HTML par-dessus le canvas : barre du bas, vue globale, panneau latéral, cartes de permission,
// bandeau de pause, alertes. Tout texte venant du serveur passe par textContent (jamais innerHTML).
import { envoyer, MAQUETTE, rejouerMaquette } from './flux.js';
import { libelleEtat, libelleDossier, TERMINAUX, DOSSIER_ACTIF, PAS_DEMARREE } from './etat.js';
import { modele } from './sprites.js';
import { Jointes, fichiersImages, vignettes } from './pieces.js';
import { Visionneuse } from './visionneuse.js';
import { Notifs } from './notifs.js';
import { Dictee } from './dictee.js';
import { ConsoleService, rendreTerminal, libelleService } from './consoles.js';
import { PlanDossier } from './plan.js';
import { rendreModifications, chargerModifications, EcranRetro, compteLignes } from './code.js';
import { Navigateur } from './navigateur.js';
import { Fenetre } from './fenetres.js';
import { Discussions } from './discussion.js';
import { brancherDemandes } from './demandes.js';
import { ChoixSkills } from './skills.js';
import { carteDemandes, grouperPermissions, clePermissions } from './permis.js';
import { etageJoy, etageVisibleTache, etageVisibleAgent } from './scenes.js';
import { md } from './markdown.js';
import { script as scriptPlateforme } from './plateforme.js';
import { FilPensees } from './fil-pensees.js';
import { Lecteur } from './lecteur.js';
import { Conso } from './conso.js';
import { Parametres } from './parametres.js';
import { NotesVersion } from './notes.js';
import { Accueil } from './accueil.js';
import { COUTS, PERSONNALISE, nomNiveau, nomTravail, phraseNiveau, travailDe, sansCapacite } from './cout.js';
import { texteEstimation, montant, texteMesures } from './estimation.js';
import { brancherRedimensionnement } from './redim.js';
import { modaleOuverte, api } from './modale.js';
import { t as tr, definirLangue, langueCourante, locale, traduireStatique, LANGUES_INTERFACE, LANGUES_IA } from './i18n.js';

const CONTEXTE_MAX = 150000;

function h(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'style') Object.assign(e.style, v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of enfants.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return e;
}
const $ = (s) => document.querySelector(s);
// Remplace le contenu d'une zone, sauf si rien n'a changé : le panneau se redessine à chaque
// événement (outil, activité…), et remplacer des boutons identiques faisait rater des clics.
const remplir = (box, ...enfants) => {
  const tmp = document.createElement('div');
  tmp.append(...enfants.flat().filter((c) => c !== null && c !== undefined && c !== false));
  if (tmp.innerHTML === box.innerHTML) return;
  box.replaceChildren(...tmp.childNodes);
};
const heure = (t, sec = false) => {
  const d = new Date(t || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + (sec ? ':' + p(d.getSeconds()) : '');
};
const libOrdre = (o) => (o === 0 ? tr('RC') : String(o));
const parRef = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true });
const fmtN = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const PHASES = { reflexion: 'réfléchit', redaction: 'rédige sa réponse', rapport: 'rédige son rapport', outil: 'utilise un outil' };
const COUL_TYPE = {
  roblox: '#e3342f', unreal: '#3df2ff', atelier3d: '#f06a2a', etudes: '#c99a5e', serveur: '#5c626a',
  direction: '#c9a227', hall: '#2f6fde', bac: '#f5c400', unity: '#9aa4b5', godot: '#478cbf', comfyui: '#b07cff',
  web: '#3fd36b', python: '#ffd23f', projet: '#7fa7d9', pause: '#19b39b', repos: '#f27fb8',
};
// Étages sans projet où le bouton « Documents » montre quand même ceux d'un autre étage (vues d'ensemble).
const DOCS_AILLEURS = new Set(['hall', 'direction']);
// Une question sans réponse au bout de ce délai n'est plus « en cours » (la copie de conversation a échoué).
const QUESTION_DELAI = 5 * 60 * 1000;
const court = (s, n = 40) => {
  const x = String(s || '').split('\n')[0].trim();
  return x.length > n ? x.slice(0, n - 1).trimEnd() + '…' : x;
};
const ICONE_OUTIL = (nom) => {
  const n = String(nom || '');
  const b = n.toLowerCase();
  if (b.startsWith('mcp__')) return /roblox|studio/.test(b) ? 'Studio' : /unreal/.test(b) ? 'Unreal' : 'MCP';
  return n;
};

export class Interface {
  constructor(store, directeur, moteur) {
    this.store = store;
    this.dir = directeur;
    this.moteur = moteur;
    this.etageId = null;
    this.compte = null;
    this.suivre = false;
    this.dernierImportant = null;
    this.onglet = 'fil';
    this.fiche = null;
    this.dossiersOuverts = new Set();
    this.clignote = { haut: 0, bas: 0, etages: new Map() };
    this.alertesVues = new Set();
    this.statut = '';
    this.envoiEnCours = false;
    this.mode = null; // { type: 'completer' | 'repondre' | 'nouveau', dossier }
    this.modeEffectif = null;
    this.coutChoix = null; // coût choisi pour la prochaine demande (pastille : un niveau ou Personnalisé) ; null = celui des réglages
    this.decouvertes = new Set();
    this.mcpEnCours = new Map();
    this.brouillons = new Map(); // texte en cours de saisie dans les cartes de question
    this.cartes = new Map(); // cle -> élément (cartes de permission et de question)
    this.ficheOnglet = 'infos';
    this.sortiesOuvertes = new Set();
    this.historiqueFiches = []; // fiches précédentes (navigation par les références)
    this.detailsOuverts = new Set(); // replis « Détails techniques » ouverts
    this.clePerm = new Map(); // id de permission -> clé de sa carte (pile)
    this.choixDecisions = new Map(); // id de question -> option choisie (pas encore envoyée)
    this.joyVu = null;
    this.dialogue = null; // { cle: id de tâche | 'dg', type: 'question' | 'consigne' } : saisie ouverte dans la fiche
    this.composeurs = new Map(); // `${cle}|${type}` -> { el, champ, aide, bEnvoyer } (gardés : la saisie survit aux mises à jour)
    this.zonesFiche = null;
    this.filPensees = new FilPensees(); // fil des réflexions de la fiche ouverte (mis à jour sans être redessiné)
    this.signatureCibles = '';
  }

  // ---------- noms du DG et de Joy (modifiables dans Réglages › Équipe) ----------
  // Nom choisi par l'utilisateur, ou null si le DG s'appelle encore « DG ».
  dgPerso() {
    const n = this.store.nomDg();
    return n && n !== tr('DG') ? n : null;
  }

  // « le DG » / « Le DG » dans une phrase, ou son nom s'il en a un.
  leDg(majuscule = false) {
    return this.dgPerso() || (majuscule ? tr('Le DG') : tr('le DG'));
  }

  // « Personnaliser » : Réglages › Équipe, ouverts sur ce personnage ('@dg', '@joy' ou le prénom de l'agent),
  // et « Discuter » : le mini-jeu, une discussion pour rire (sans effet sur son travail).
  boutonPerso(id, nom, titre = null) {
    const perso = h('button', {
      class: 'petit perso',
      type: 'button',
      title: titre || (nom ? tr('Changer le nom et l’apparence de {nom}', { nom }) : tr('Changer le nom et l’apparence')),
      on: { click: () => this.parametres.ouvrir('equipe', id || undefined) },
    }, '🎨 ' + tr('Personnaliser'));
    const mj = this.store.miniJeu && this.store.miniJeu.reglages;
    if (!id || (mj && mj.actif === false)) return perso;
    return [perso, h('button', {
      class: 'petit perso',
      type: 'button',
      title: tr('Discuter avec {nom} (mini-jeu : ses collègues dans la pièce entendent ; aucun effet sur son travail)', { nom: nom || id }),
      on: { click: () => this.discussions.ouvrir(id) },
    }, '🗨 ' + tr('Discuter'))];
  }

  // Avatar d'un personnage sur l'étage affiché (pour ses bulles de discussion et de bavardage).
  avatarPerso(ev) {
    const d = this.dir;
    if (ev.cle === '@dg' && ev.de !== 'reaction') return d.avatars.has('dg') ? 'dg' : null;
    if (ev.cle === '@joy' && ev.de !== 'reaction') return d.avatars.has('joy') ? 'joy' : null;
    if (ev.tache && d.avatars.has(ev.tache)) return ev.tache;
    if (ev.agent) for (const [id, a] of d.avatars) if (a.agentId === ev.agent && a.type !== 'fantome') return id;
    return null;
  }

  // Réplique du mini-jeu en bulle au-dessus du personnage, le temps de la lire.
  bullePerso(ev) {
    const id = this.avatarPerso(ev);
    if (!id) return;
    const duree = Math.min(9000, 2600 + String(ev.texte || '').length * 45) * this.dir.mult();
    this.dir.dire(id, { texte: ev.texte, max: 160, lignes: 4 }, duree, { phrase: true, force: true, parle: true });
  }

  // Bavardage écrit par l'IA : les répliques en bulles, l'une après l'autre, sur l'étage affiché.
  jouerBavardage(ev) {
    if (!ev.lignes || ev.etage !== this.dir.etageId) return;
    const m = this.dir.mult();
    let decal = 0;
    for (const l of ev.lignes) {
      const id = this.avatarPerso(l);
      const duree = Math.min(8000, 2400 + String(l.texte).length * 40) * m;
      if (id) setTimeout(() => this.dir.dire(id, { texte: l.texte, max: 150, lignes: 3 }, duree, { phrase: true, force: true, parle: true }), decal);
      decal += duree * 0.8;
    }
    // pas de bavardage tout prêt par-dessus
    this.dir.prochainBavardage = Date.now() + decal + 6000;
  }

  init() {
    // Pendant un clic dans le panneau, on suspend ses mises à jour (voir majPanneau).
    $('#panneau').addEventListener('pointerdown', () => (this.pointeurDansPanneau = true));
    const relacher = () => {
      if (!this.pointeurDansPanneau) return;
      setTimeout(() => {
        this.pointeurDansPanneau = false;
        if (this.panneauEnRetard) {
          this.panneauEnRetard = false;
          this.majPanneau();
        }
      }, 60);
    };
    window.addEventListener('pointerup', relacher);
    window.addEventListener('pointercancel', relacher);
    // onglets du panneau
    document.querySelectorAll('#onglets button').forEach((b) => {
      b.addEventListener('click', () => this.choisirOnglet(b.dataset.onglet));
    });
    $('#btn-panneau').addEventListener('click', () => this.basculerPanneau());
    $('#btn-immeuble').addEventListener('click', () => this.basculerImmeuble());
    $('#etage-haut').addEventListener('click', () => this.etageVoisin(+1));
    $('#etage-bas').addEventListener('click', () => this.etageVoisin(-1));
    $('#btn-suivre').addEventListener('click', () => this.basculerSuivre());
    $('#btn-envoyer').addEventListener('click', () => this.envoyerSaisie());
    $('#btn-reglages-envoi').addEventListener('click', () => this.parametres.ouvrir('priorites'));
    $('#btn-urgence').addEventListener('click', () => this.urgence());
    $('#btn-fermer').addEventListener('click', () => this.fermerQg());
    $('#btn-version').addEventListener('click', () => this.notesVersion.ouvrir());
    $('#btn-reprendre').addEventListener('click', () => this.action('/api/reprendre'));
    $('#btn-recentrer').addEventListener('click', () => this.moteur.recentrer());
    this.visionneuse = new Visionneuse();
    this.console = new ConsoleService(this.store, this);
    this.plan = new PlanDossier(this.store, this);
    this.ecran = new EcranRetro(this.store, this);
    this.navigateur = new Navigateur(this);
    this.discussions = new Discussions(this);
    this.majPoigneeDemandes = brancherDemandes();
    this.choixSkills = new ChoixSkills(this);
    this.modifsOuvertes = new Set();
    this.lecteur = new Lecteur(this.store);
    this.conso = new Conso(this.store, this);
    this.parametres = new Parametres(this.store, this);
    this.notesVersion = new NotesVersion(this);
    this.accueil = new Accueil(this.store, this);
    traduireStatique();
    $('#btn-reglages').addEventListener('click', () => this.parametres.ouvrir());
    $('#btn-nouvel-etage').addEventListener('click', () => this.parametres.formulaireEtage());
    $('#btn-documents').addEventListener('click', () => this.ouvrirDocuments());
    this.brancherLangues();
    brancherRedimensionnement(() => this.majMarges());
    this.jointes = new Jointes($('#jointes'), {
      surErreur: (m) => this.toast('warn', m),
      surChangement: () => this.majSaisie(),
      surOuvrir: (p, i) => this.visionneuse.ouvrir(p, i),
    });
    $('#btn-joindre').addEventListener('click', () => $('#fichier-joindre').click());
    $('#fichier-joindre').addEventListener('change', (e) => {
      this.jointes.ajouter(e.target.files);
      e.target.value = '';
    });
    document.addEventListener('paste', (e) => {
      if (this.visionneuse.ouverte) return;
      const f = fichiersImages(e.clipboardData).filter((x) => /^image\//.test(x.type));
      if (!f.length) return;
      e.preventDefault();
      this.jointes.ajouter(f);
      $('#saisie').focus();
    });
    this.brancherDepot();
    this.notifs = new Notifs(this.store, this);
    this.notifs.init();
    this.dictee = new Dictee(this.store, {
      bouton: $('#btn-dictee'),
      saisie: $('#saisie'),
      surTexte: (t) => this.insererTexte(t),
      surErreur: (m) => this.toast('warn', m),
    });
    $('#cout-demande').addEventListener('change', () => {
      this.coutChoix = $('#cout-demande').value;
      this.majReglageCout();
    });
    $('#cible-saisie').addEventListener('change', () => this.choisirCible($('#cible-saisie').value));
    const saisie = $('#saisie');
    saisie.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.envoyerSaisie();
      }
    });
    saisie.addEventListener('input', () => this.ajusterSaisie());
    window.addEventListener('keydown', (e) => {
      if (modaleOuverte()) return;
      if (e.key === 'PageUp') {
        e.preventDefault();
        this.etageVoisin(+1);
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        this.etageVoisin(-1);
      } else if (e.key === 'Escape' && !this.visionneuse.ouverte && !this.console.ouverte && !this.plan.ouvert && !modaleOuverte()) {
        this.selectionner(null);
      }
    });
    if (MAQUETTE) {
      const b = $('#btn-rejouer');
      b.hidden = false;
      b.addEventListener('click', () => rejouerMaquette());
      document.body.classList.add('maquette');
    }
    this.moteur.onClic = (av) => {
      if (!av) {
        this.selectionner(null);
        return;
      }
      if (av.type === 'service') {
        this.console.ouvrir(av.serviceId);
        return;
      }
      if (av.type === 'ordi') {
        // le code de l'agent assis à ce poste (écran vide si personne n'y est)
        this.ecran.ouvrir({ tacheId: av.tacheId });
        return;
      }
      if (av.type === 'tableau') {
        // depuis le tableau d'un étage : la vue du plan permet aussi de choisir le dossier qu'il affiche
        this.plan.ouvrir(av.dossier, { etage: this.dir.etageId });
        return;
      }
      if (av.type === 'joy') {
        this.selectionner('joy');
        return;
      }
      if (av.type === 'reserve') {
        this.selectionner('ag:' + av.agentId);
        return;
      }
      this.selectionner(av.type === 'dg' ? 'dg' : av.tacheId);
    };
    const ro = new ResizeObserver(() => this.majMarges());
    ro.observe($('#panneau'));
    ro.observe($('#immeuble'));
    ro.observe($('#barre'));
    ro.observe($('#haut'));
    setInterval(() => this.tic(), 1000);
    this.majMarges();
  }

  majMarges() {
    const panneau = $('#panneau');
    const imm = $('#immeuble');
    const d = panneau.classList.contains('replie') ? 0 : panneau.getBoundingClientRect().width + 12;
    const g = imm.getBoundingClientRect().width + 12;
    this.moteur.setMarges({ gauche: g, droite: d, bas: $('#barre').getBoundingClientRect().height + 8, haut: $('#haut').getBoundingClientRect().height + 4 });
  }

  basculerPanneau() {
    const p = $('#panneau');
    p.classList.toggle('replie');
    $('#btn-panneau').textContent = p.classList.contains('replie') ? '‹' : '›';
    $('#btn-panneau').dataset.tTitle = p.classList.contains('replie') ? 'Ouvrir le panneau' : 'Replier le panneau';
    $('#btn-panneau').title = tr($('#btn-panneau').dataset.tTitle);
    this.majMarges();
  }
  basculerImmeuble() {
    const p = $('#immeuble');
    p.classList.toggle('replie');
    this.majMarges();
  }

  // ---------- statut ----------
  setStatut(s) {
    this.statut = s;
    const el = $('#statut');
    const txt = { maquette: tr('maquette'), connecte: tr('connecté'), reconnexion: tr('reconnexion…'), deconnecte: tr('déconnecté') }[s] || s;
    el.textContent = txt;
    el.className = 'statut ' + s;
  }

  // ---------- étages ----------
  etagesTries() {
    return [...this.store.etages].sort((a, b) => b.ordre - a.ordre);
  }

  allerEtage(id, opts = {}) {
    const S = this.store;
    const cible = S.etage(id);
    if (!cible) return;
    if (id === this.etageId && !opts.force) return;
    const avant = S.etage(this.etageId);
    const sens = avant && !opts.force ? Math.sign(cible.ordre - avant.ordre) : 0;
    this.etageId = id;
    try {
      sessionStorage.setItem('qg-etage', id);
    } catch {
      /* stockage indisponible */
    }
    this.moteur.changerEtage(() => this.dir.setEtage(id), sens);
    this.clignote.etages.delete(id);
    const restant = [...this.clignote.etages.entries()];
    this.clignote.haut = 0;
    this.clignote.bas = 0;
    for (const [eid, t] of restant) {
      const e = S.etage(eid);
      if (e) this.marquerAilleurs(e, t);
    }
    this.majNav();
    this.majImmeuble();
    this.majFil();
  }

  etageVoisin(sens) {
    const liste = this.etagesTries().slice().reverse();
    const i = liste.findIndex((e) => e.id === this.etageId);
    const j = Math.max(0, Math.min(liste.length - 1, i + sens));
    if (liste[j]) this.allerEtage(liste[j].id);
  }

  marquerAilleurs(etage, t) {
    const cour = this.store.etage(this.etageId);
    if (!cour || etage.id === cour.id) return;
    if (etage.ordre > cour.ordre) this.clignote.haut = Math.max(this.clignote.haut, t);
    else this.clignote.bas = Math.max(this.clignote.bas, t);
  }

  majNav() {
    const e = this.store.etage(this.etageId);
    $('#etage-nom').textContent = e ? e.nom : '—';
    $('#etage-ordre').textContent = e ? libOrdre(e.ordre) : '';
    $('#etage-ordre').style.background = e ? COUL_TYPE[e.type] || '#888' : '#888';
    const liste = this.etagesTries();
    const i = liste.findIndex((x) => x.id === this.etageId);
    $('#etage-haut').disabled = i <= 0;
    $('#etage-bas').disabled = i < 0 || i >= liste.length - 1;
    this.majBoutonDocuments(e);
    const now = Date.now();
    $('#etage-haut').classList.toggle('clignote', now - this.clignote.haut < 5000);
    $('#etage-bas').classList.toggle('clignote', now - this.clignote.bas < 5000);
  }

  // ---------- vue globale ----------
  majImmeuble() {
    const S = this.store;
    const coupe = $('#coupe');
    remplir(coupe);
    const now = Date.now();
    for (const e of this.etagesTries()) {
      const m = S.marqueurs(e.id);
      const marques = h('div', { class: 'marques' });
      if (m.main) marques.appendChild(h('span', { class: 'mq orange', title: tr('main levée ou question') }, '!'));
      if (m.echec) marques.appendChild(h('span', { class: 'mq rouge', title: tr('échec à traiter') }, '✕'));
      if (m.verif) marques.appendChild(h('span', { class: 'mq violet', title: tr('vérification en cours') }, '✓'));
      if (m.enCours) marques.appendChild(h('span', { class: 'mq vert', title: tr('{n} tâche(s) en cours', { n: m.enCours }) }, String(m.enCours)));
      if (m.attente) marques.appendChild(h('span', { class: 'mq bleu', title: tr('{n} tâche(s) en attente ou en file', { n: m.attente }) }, String(m.attente)));
      const sv = S.serviceDe(e.id);
      if (sv && (sv.etat === 'actif' || sv.etat === 'erreur' || sv.etat === 'demarrage')) {
        const b = h('span', { class: 'mq serveur s-' + sv.etat, title: tr('{service} — ouvrir la console', { service: libelleService(sv) }), role: 'button', tabindex: '0' }, 'srv');
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.console.ouvrir(sv.id);
        });
        marques.appendChild(b);
      }
      if (e.type === 'serveur') {
        const actifs = [...S.services.values()].filter((x) => x.etat === 'actif').length;
        const erreurs = [...S.services.values()].filter((x) => x.etat === 'erreur').length;
        if (actifs) marques.appendChild(h('span', { class: 'mq serveur s-actif', title: tr('{n} serveur(s) en marche', { n: actifs }) }, String(actifs)));
        if (erreurs) marques.appendChild(h('span', { class: 'mq serveur s-erreur', title: tr('{n} serveur(s) en erreur', { n: erreurs }) }, '!'));
      }
      if (e.type === 'repos') {
        // salle de repos : les agents en réserve y dorment
        const dodo = [...S.equipe.values()].filter((a) => a.etat === 'disponible').length;
        if (dodo) marques.appendChild(h('span', { class: 'mq repos', title: tr('{n} agent(s) en réserve, prêts à être réembauchés', { n: dodo }) }, 'z' + dodo));
      }
      if (!marques.childNodes.length) marques.appendChild(h('span', { class: 'mq gris', title: e.projet ? tr('inactif') : tr('salle commune, sans projet') }));
      const recent = now - (this.clignote.etages.get(e.id) || 0) < 5000;
      const nomDg = this.dgPerso();
      const ligne = h('button', {
        class: 'etage' + (e.id === this.etageId ? ' courant' : '') + (recent ? ' agite' : ''),
        title: tr('Aller à {etage}', { etage: e.nom }),
        on: { click: () => this.allerEtage(e.id) },
      },
      h('span', { class: 'ordre', style: { background: COUL_TYPE[e.type] || '#888' } }, libOrdre(e.ordre)),
      h('span', { class: 'nom' }, e.nom),
      m.dg ? h('span', { class: 'dg', title: nomDg ? tr('{nom}, le DG, est ici', { nom: nomDg }) : tr('le DG est ici') }, S.nomDg()) : null,
      etageJoy(S, now) === e.id ? h('span', { class: 'joy', title: tr('{nom}, le happiness manager, est ici', { nom: S.nomJoy() }) }, '😊') : null,
      marques);
      coupe.appendChild(ligne);
    }
    // cabine d'ascenseur
    const lignes = [...coupe.children];
    const i = this.etagesTries().findIndex((x) => x.id === this.etageId);
    const cab = $('#cabine');
    if (i >= 0 && lignes[i]) {
      cab.style.top = lignes[i].offsetTop + 'px';
      cab.style.height = lignes[i].offsetHeight + 'px';
      cab.hidden = false;
    } else cab.hidden = true;
  }

  // ---------- langues ----------
  brancherLangues() {
    const selUI = $('#choix-langue');
    const selIA = $('#choix-langue-ia');
    selUI.replaceChildren(...LANGUES_INTERFACE.map((l) => h('option', { value: l.id }, l.id.toUpperCase() + ' · ' + l.nom)));
    selIA.replaceChildren(...LANGUES_IA.map((l) => h('option', { value: l.id }, l.id.toUpperCase() + ' · ' + l.nom)));
    selUI.value = langueCourante();
    selUI.addEventListener('change', async () => {
      const l = selUI.value;
      if (!MAQUETTE) await api('/api/reglages', { langueInterface: l }).catch((e) => this.toast('erreur', e.message));
      this.changerLangue(l);
    });
    selIA.addEventListener('change', async () => {
      if (MAQUETTE) return;
      try {
        await api('/api/reglages', { langueIA: selIA.value });
        this.toast('info', tr('Les agents travailleront désormais dans cette langue.'));
      } catch (e) {
        this.toast('erreur', e.message);
      }
    });
  }

  majLangues() {
    const R = this.store.reglages || {};
    if (R.langueInterface && R.langueInterface !== langueCourante() && !MAQUETTE) this.changerLangue(R.langueInterface);
    $('#choix-langue').value = langueCourante();
    if (R.langueIA) $('#choix-langue-ia').value = R.langueIA;
    // démo : bien visible, pour ne pas la confondre avec le vrai QG ouvert à côté
    const badge = $('#badge-demo');
    if (badge) badge.hidden = !R.demo;
    // numéro de version : ouvre les notes de version
    const bVersion = $('#btn-version');
    if (bVersion && R.version) {
      bVersion.textContent = 'v' + R.version;
      bVersion.hidden = false;
    }
    document.title = R.demo ? tr('QG des agents — démo') : tr('QG des agents');
  }

  // La page se recharge : enseignes du décor, journal et fenêtres déjà construites passent tous dans la nouvelle langue.
  changerLangue(l) {
    if (l === langueCourante()) return;
    definirLangue(l);
    $('#choix-langue').value = l;
    location.reload();
  }

  // Une fois par chargement : une version plus récente est-elle publiée ? (rien en maquette)
  async verifierMaj() {
    if (MAQUETTE) return;
    try {
      const m = await api('/api/maj');
      this.parametres.majInfo = m;
      if (m.disponible && !m.dev) this.toast('info', tr('Mise à jour {version} disponible : Réglages › À propos.', { version: m.derniere }));
    } catch {
      /* hors ligne : on ne dit rien */
    }
  }

  // ---------- documents ----------
  // Étage dont le bouton « Documents » montre les fichiers : l'étage affiché s'il a un projet ; depuis le
  // hall ou la Direction, le premier étage de projet ; ailleurs (salles communes, sous-sol…), aucun.
  etageDocuments(e = this.store.etage(this.etageId)) {
    const S = this.store;
    if (e && e.projet) return e;
    if (e && !DOCS_AILLEURS.has(e.type) && !DOCS_AILLEURS.has(e.id)) return null;
    const projets = S.etages.filter((x) => x.projet && x.actif !== false);
    return projets.find((x) => x.id !== 'direction') || projets[0] || null;
  }

  majBoutonDocuments(e) {
    const b = $('#btn-documents');
    const cible = this.etageDocuments(e);
    const titre = !cible
      ? tr('Pas de documents ici : {etage} n’a pas de projet.', { etage: e ? e.nom : '—' })
      : cible === e ? tr('Les fichiers .md de cet étage, mis en forme') : tr('Les fichiers .md de {etage} (cet étage n’a pas de projet)', { etage: cible.nom });
    if (b.title !== titre) b.title = titre;
    b.classList.toggle('inactif', !cible);
    b.setAttribute('aria-disabled', cible ? 'false' : 'true');
  }

  ouvrirDocuments() {
    const e = this.store.etage(this.etageId);
    const cible = this.etageDocuments(e);
    if (!cible) {
      this.toast('info', e && !e.projet ? tr('Pas de documents ici : {etage} n’a pas de projet.', { etage: e.nom }) : tr('Aucun étage avec un projet.'));
      return;
    }
    this.lecteur.documents(cible.id);
  }

  ouvrirFichier(chemin, etage = null) {
    this.lecteur.dernierEtage = etage || this.lecteur.dernierEtage;
    this.lecteur.ouvrir(chemin, etage);
  }

  // ---------- comptes ----------
  // Menu déroulant : le compte de la prochaine demande, « Ajouter un compte IA… » et « Gérer les comptes… ».
  majComptes() {
    const S = this.store;
    const box = $('#comptes');
    if (!this.compte || !S.comptes.some((c) => c.id === this.compte && c.connecte)) {
      const def = S.comptes.find((c) => c.id === S.compteDefaut && c.connecte) || S.comptes.find((c) => c.connecte);
      this.compte = def ? def.id : S.compteDefaut;
    }
    const sel = h('select', { class: 'choix-compte', 'aria-label': tr('Compte IA de la prochaine demande') },
      S.comptes.map((c) => h('option', { value: c.id, selected: c.id === this.compte ? true : null }, c.nom + (c.fournisseur && c.fournisseur !== 'claude' ? ' · ' + c.fournisseur : '') + (c.connecte ? '' : ' — ' + tr('non connecté')))),
      h('option', { value: '__ajouter' }, '＋ ' + tr('Ajouter un compte IA…')),
      h('option', { value: '__gerer' }, '⚙ ' + tr('Gérer les comptes…')));
    const choisi = S.comptes.find((c) => c.id === this.compte);
    sel.title = choisi ? tr('Envoyer avec {nom}', { nom: choisi.nom }) : tr('Aucun compte connecté');
    sel.classList.toggle('off', !(choisi && choisi.connecte));
    sel.addEventListener('change', async () => {
      const v = sel.value;
      if (v === '__ajouter') {
        // choix du fournisseur et du type d'accès : dans Réglages › Comptes IA
        sel.value = this.compte || '';
        this.parametres.ouvrir('comptes');
        return;
      }
      if (v === '__gerer') {
        sel.value = this.compte || '';
        this.parametres.ouvrir('comptes');
        return;
      }
      const c = S.comptes.find((x) => x.id === v);
      if (c && !c.connecte) {
        sel.value = this.compte || '';
        if (window.confirm(tr('{nom} n’est pas connecté. Ouvrir la connexion maintenant ?', { nom: c.nom }))) {
          api('/api/comptes/' + c.id + '/connecter', {}).then(() => this.toast('info', tr('Une fenêtre de connexion s’est ouverte.')), (e) => this.toast('erreur', e.message));
        }
        return;
      }
      this.compte = v;
      this.majComptes();
      this.majReglageCout();
      this.conso.majBouton();
    });
    box.replaceChildren(sel);
  }

  // ---------- saisie ----------
  ajusterSaisie() {
    const s = $('#saisie');
    s.style.height = 'auto';
    s.style.height = Math.min(76, s.scrollHeight + 4) + 'px';
  }

  insererTexte(t) {
    const s = $('#saisie');
    const avant = s.value;
    s.value = avant + (avant && !/\s$/.test(avant) ? ' ' : '') + t;
    s.focus();
    s.setSelectionRange(s.value.length, s.value.length);
    this.ajusterSaisie();
    this.toast('info', tr('Dictée ajoutée à la saisie : relis avant d’envoyer.'));
  }

  // Glisser-déposer d'images sur toute la page.
  brancherDepot() {
    const voile = $('#depot');
    let profondeur = 0;
    const avecFichiers = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    window.addEventListener('dragenter', (e) => {
      if (!avecFichiers(e)) return;
      e.preventDefault();
      profondeur++;
      voile.hidden = false;
    });
    window.addEventListener('dragover', (e) => {
      if (!avecFichiers(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', (e) => {
      if (!avecFichiers(e)) return;
      profondeur = Math.max(0, profondeur - 1);
      if (!profondeur) voile.hidden = true;
    });
    window.addEventListener('drop', (e) => {
      if (!avecFichiers(e)) return;
      e.preventDefault();
      profondeur = 0;
      voile.hidden = true;
      this.jointes.ajouter(fichiersImages(e.dataTransfer));
      $('#saisie').focus();
    });
  }

  // Destination de la saisie (menu à côté d'« Envoyer ») : nouveau dossier, réponse à une question du DG,
  // complément d'un dossier existant. null = nouveau dossier.
  calculerMode() {
    const S = this.store;
    let m = this.mode;
    if (m && m.dossier && !S.dossiers.has(m.dossier)) m = this.mode = null;
    if (m && m.type === 'completer' && S.dossiers.get(m.dossier).etat === 'annule') m = this.mode = null;
    const clar = S.dossierEnClarification();
    if (m && m.type === 'repondre' && (S.dossiers.get(m.dossier) || {}).etat !== 'clarification') m = this.mode = null;
    if (m && m.type === 'nouveau' && (!clar || clar.id !== m.ignore)) m = this.mode = null;
    if (m && m.type === 'nouveau') return null;
    if (m && m.type === 'completer') {
      // la réponse à une question du DG reste sur /repondre
      if ((S.dossiers.get(m.dossier) || {}).etat === 'clarification') return { type: 'repondre', dossier: m.dossier };
      return m;
    }
    if (m) return m;
    if (clar) return { type: 'repondre', dossier: clar.id, auto: true };
    return null;
  }

  modeReponse(dossierId) {
    if (!dossierId || !this.store.dossiers.has(dossierId)) return;
    this.mode = { type: 'repondre', dossier: dossierId };
    this.majSaisie();
    this.signalerCible();
  }

  modeCompleter(dossierId) {
    if (!dossierId || !this.store.dossiers.has(dossierId)) return;
    this.mode = { type: 'completer', dossier: dossierId };
    this.majSaisie();
    this.signalerCible();
  }

  // Le menu de destination clignote et la saisie prend le focus (après un clic sur « Compléter », « Répondre »…).
  signalerCible() {
    const sel = $('#cible-saisie');
    sel.classList.remove('eclair');
    void sel.offsetWidth;
    sel.classList.add('eclair');
    $('#saisie').focus();
  }

  // Choix dans le menu de destination : 'nouveau', 'repondre:D3' ou 'completer:D3'.
  choisirCible(v) {
    const S = this.store;
    if (!v || v === 'nouveau') {
      const clar = S.dossierEnClarification();
      // « Nouveau dossier » alors que le DG attend une réponse : on ne rebascule pas tout seul sur la réponse.
      this.mode = clar ? { type: 'nouveau', ignore: clar.id } : null;
    } else {
      const [type, id] = v.split(':');
      this.mode = S.dossiers.has(id) ? { type, dossier: id } : null;
    }
    this.majSaisie();
    $('#saisie').focus();
  }

  valeurCible(m) {
    return m ? m.type + ':' + m.dossier : 'nouveau';
  }

  // Menu « où va le message » : nouveau dossier, réponse au DG, puis chaque dossier (actifs d'abord, puis finis).
  majCibles(m) {
    const S = this.store;
    const sel = $('#cible-saisie');
    const ds = [...S.dossiers.values()].filter((d) => d.etat !== 'annule').sort((a, b) => (b.creeLe || 0) - (a.creeLe || 0));
    const nomDg = this.dgPerso();
    const repondre = ds.filter((d) => d.etat === 'clarification');
    const actifs = ds.filter((d) => DOSSIER_ACTIF.has(d.etat) && d.etat !== 'clarification');
    const finis = ds.filter((d) => !DOSSIER_ACTIF.has(d.etat));
    const ajout = (d) => ({ v: 'completer:' + d.id, l: tr('Ajouter au dossier {dossier} · {titre}', { dossier: d.id, titre: court(d.titre || d.texte, 38) }) });
    const groupes = [
      { options: [{ v: 'nouveau', l: tr('Nouveau dossier') }] },
      repondre.length ? { label: nomDg ? tr('{nom} attend ta réponse', { nom: nomDg }) : tr('Le DG attend ta réponse'), options: repondre.map((d) => ({ v: 'repondre:' + d.id, l: nomDg ? tr('Répondre à {nom} ({dossier})', { nom: nomDg, dossier: d.id }) : tr('Répondre au DG ({dossier})', { dossier: d.id }) })) } : null,
      actifs.length ? { label: tr('Dossiers en cours'), options: actifs.map(ajout) } : null,
      finis.length ? { label: tr('Dossiers terminés'), options: finis.map(ajout) } : null,
    ].filter(Boolean);
    const valeur = this.valeurCible(m);
    // On ne reconstruit le menu que s'il change : le refaire pendant qu'il est déroulé le refermerait.
    const signature = JSON.stringify(groupes);
    if (signature !== this.signatureCibles) {
      this.signatureCibles = signature;
      sel.replaceChildren(...groupes.map((g) => {
        const opts = g.options.map((o) => h('option', { value: o.v }, o.l));
        return g.label ? h('optgroup', { label: g.label }, opts) : opts;
      }).flat());
    }
    if (sel.value !== valeur) sel.value = valeur;
    sel.className = 'cible-saisie cible-' + (m ? m.type : 'nouveau');
    const d = m ? S.dossiers.get(m.dossier) : null;
    sel.title = !m
      ? tr('Le message ouvre un nouveau dossier : {nom} le découpe en tâches.', { nom: this.leDg() })
      : m.type === 'repondre'
        ? nomDg
          ? tr('Le message répond à la question de {nom} sur le dossier {dossier}.', { nom: nomDg, dossier: m.dossier })
          : tr('Le message répond à la question du DG sur le dossier {dossier}.', { dossier: m.dossier })
        : tr('Le message s’ajoute au dossier {dossier} ({titre}) : {nom} le transmet aux agents, même déjà lancés.', { dossier: m.dossier, titre: court(d && (d.titre || d.texte), 60), nom: this.leDg() });
  }

  majSaisie() {
    const S = this.store;
    const m = (this.modeEffectif = this.calculerMode());
    const s = $('#saisie');
    const nomDg = this.dgPerso();
    s.placeholder = m && m.type === 'repondre'
      ? nomDg ? tr('Répondre à {nom}…', { nom: nomDg }) : tr('Répondre au DG…')
      : m && m.type === 'completer'
        ? tr('Compléter le dossier {dossier}…', { dossier: m.dossier })
        : nomDg ? tr('Écrire à {nom}…', { nom: nomDg }) : tr('Écrire au DG…');
    s.title = tr('Entrée pour envoyer, Maj+Entrée pour aller à la ligne. Ctrl+V ou glisser-déposer pour joindre des images.');
    this.majCibles(m);
    const q = $('#question-dg');
    const d = m && m.type === 'repondre' ? S.dossiers.get(m.dossier) : null;
    if (d && d.question) {
      q.hidden = false;
      remplir(q, h('b', {}, tr('{nom} demande ({dossier}) :', { nom: this.leDg(true), dossier: d.id }) + ' '), d.question);
    } else q.hidden = true;
    document.body.classList.toggle('clarification', !!(m && m.type === 'repondre'));
    document.body.classList.toggle('complement', !!(m && m.type === 'completer'));
    // Le coût et les skills ne servent qu'à un nouveau dossier.
    $('#btn-skills').hidden = !!m;
    $('#reglage-cout').hidden = !!m;
    $('#au-dessus').hidden = q.hidden && !(this.jointes && this.jointes.liste.length);
  }

  async envoyerSaisie() {
    const s = $('#saisie');
    let texte = s.value.trim();
    const pieces = this.jointes.pourEnvoi();
    if (!texte && pieces.length) texte = tr('(voir les images jointes)');
    if (!texte || this.envoiEnCours) return;
    const m = this.calculerMode();
    this.envoiEnCours = true;
    $('#btn-envoyer').disabled = true;
    const avecPieces = (o) => (pieces.length ? { ...o, pieces } : o);
    try {
      if (m && m.type === 'repondre') await envoyer('/api/dossiers/' + encodeURIComponent(m.dossier) + '/repondre', avecPieces({ texte }));
      else if (m && m.type === 'completer') await envoyer('/api/dossiers/' + encodeURIComponent(m.dossier) + '/completer', avecPieces({ texte }));
      else {
        const corps = { texte, etageAffiche: this.etageId, compte: this.compte, ...this.choixSkills.pourEnvoi() };
        corps.travail = { cout: this.coutDemande() };
        await envoyer('/api/dossiers', avecPieces(corps));
        this.choixSkills.vider(); // les skills choisis valent pour ce dossier-là
        this.coutChoix = null; // le niveau choisi vaut pour cette demande-là
        this.majReglageCout();
      }
      s.value = '';
      this.jointes.vider();
      if (m && m.type === 'completer') {
        // complément envoyé : le prochain message repart sur un nouveau dossier
        this.mode = null;
        this.toast('info', tr('Ajouté au dossier {dossier}. Le prochain message ouvrira un nouveau dossier.', { dossier: m.dossier }));
      }
      this.ajusterSaisie();
      this.majSaisie();
    } catch (e) {
      this.toast('erreur', tr('Envoi impossible : {erreur}', { erreur: e.message }));
    } finally {
      this.envoiEnCours = false;
      $('#btn-envoyer').disabled = false;
    }
  }

  // ---------- coût de la demande (pastille, 1.0.6 B2 ; Personnalisé en 1.0.7) ----------
  coutDemande() {
    return COUTS.includes(this.coutChoix) ? this.coutChoix : travailDe(this.store.reglages).cout;
  }

  // Phrase d'un choix de la pastille ; Personnalisé : sa base et le nombre de valeurs changées dans les Réglages.
  phraseCout(n) {
    if (n !== PERSONNALISE) return phraseNiveau(n);
    const { base, personnalise } = travailDe(this.store.reglages);
    const nb = Object.keys(personnalise).length;
    return tr('tes valeurs des Réglages, à partir de {niveau}', { niveau: nomNiveau(base) }) + (nb ? ', ' + tr('{n} valeur(s) changée(s)', { n: nb }) : '');
  }

  majReglageCout() {
    const box = $('#reglage-cout');
    box.hidden = !!this.calculerMode();
    const def = travailDe(this.store.reglages).cout;
    const choix = this.coutDemande();
    const sel = $('#cout-demande');
    sel.replaceChildren(...COUTS.map((n) => h('option', { value: n, title: this.phraseCout(n) }, nomNiveau(n))));
    sel.value = choix;
    box.classList.toggle('modifie', choix !== def);
    const vars = { niveau: nomNiveau(choix), phrase: this.phraseCout(choix) };
    box.title = choix === def ? tr('Coût de la prochaine demande : {niveau}, {phrase} (par défaut)', vars) : tr('Coût de la prochaine demande : {niveau}, {phrase} (choisi pour cette demande)', vars);
  }

  // Coût d'un dossier (niveau, ou Personnalisé avec sa base et ses valeurs figées à l'envoi), avec ce qui est
  // sans effet pour le fournisseur qui exécute ses tâches (Codex).
  texteCoutDossier(d) {
    const S = this.store;
    const c = S.comptes.find((x) => x.id === (d.compteAgents || d.compte));
    const sans = c ? sansCapacite(S, 'compaction', [c]) : [];
    const nb = d.travail.cout === PERSONNALISE && d.travail.personnalise ? Object.keys(d.travail.personnalise).length : 0;
    const phrase = d.travail.cout === PERSONNALISE ? tr('{n} valeur(s) changée(s)', { n: nb }) : phraseNiveau(d.travail.cout);
    return nomTravail(d.travail) + ' — ' + phrase + (sans.length ? ' (' + tr('compaction, plafond par tâche et sous-agent d’exploration sans effet pour {fournisseurs}', { fournisseurs: sans.join(', ') }) + ')' : '');
  }

  async action(route, corps, confirmer) {
    if (confirmer && !window.confirm(confirmer)) return false;
    try {
      await envoyer(route, corps);
      return true;
    } catch (e) {
      this.toast('erreur', e.message);
      return false;
    }
  }

  urgence() {
    this.action('/api/urgence', undefined, tr('Arrêt d’urgence : stopper toutes les sessions en cours ?'));
  }

  // Bouton « Fermer » (1.0.7) : le serveur enregistre l'état, arrête les agents et se ferme avec sa fenêtre de lancement ;
  // la fenêtre application se ferme aussi, un onglet de navigateur garde le message « Le QG est fermé ».
  async fermerQg() {
    if (MAQUETTE) return this.toast('info', tr('Mode maquette : aucune requête n’est envoyée au serveur.'));
    const demo = !!this.store.reglages?.demo;
    const question = demo
      ? tr('Fermer la démo ? Les agents simulés s’arrêtent, puis le serveur de la démo et sa fenêtre se ferment.')
      : tr('Fermer le QG ? Les agents s’arrêtent, puis le serveur et sa fenêtre se ferment. Les dossiers en cours reprendront au prochain lancement.');
    const ok = await this.action('/api/quitter', undefined, question);
    if (!ok) return;
    document.body.replaceChildren(h('div', { class: 'demo-fin' }, h('div', {},
      h('p', {}, demo ? tr('La démo est fermée. Tu peux fermer cet onglet.') : tr('Le QG est fermé. Tu peux fermer cet onglet.')),
      h('p', { class: 'meta' }, demo
        ? tr('Pour la relancer, double-clique sur {script} dans le dossier du QG.', { script: scriptPlateforme(this.store, 'demo') })
        : tr('Pour le rouvrir, double-clique sur {script} dans le dossier du QG.', { script: scriptPlateforme(this.store, 'lancer') })))));
    setTimeout(() => window.close(), 400);
  }

  basculerSuivre() {
    this.suivre = !this.suivre;
    $('#btn-suivre').classList.toggle('actif', this.suivre);
    $('#btn-suivre').setAttribute('aria-pressed', this.suivre ? 'true' : 'false');
    if (this.suivre && this.dernierImportant) this.allerEtage(this.dernierImportant);
  }

  // ---------- panneau ----------
  choisirOnglet(o) {
    this.onglet = o;
    document.querySelectorAll('#onglets button').forEach((b) => b.classList.toggle('actif', b.dataset.onglet === o));
    document.querySelectorAll('.vue').forEach((v) => (v.hidden = v.id !== 'vue-' + o));
    if ($('#panneau').classList.contains('replie')) this.basculerPanneau();
    this.majPanneau();
  }

  majPanneau() {
    // Bouton enfoncé dans le panneau : on attend le relâchement pour ne pas lui retirer le bouton sous le doigt.
    if (this.pointeurDansPanneau) {
      this.panneauEnRetard = true;
      return;
    }
    if (this.onglet === 'fil') this.majFil();
    else if (this.onglet === 'dossiers') this.majDossiers();
    else if (this.onglet === 'journal') this.majJournal();
    else if (this.onglet === 'fiche') this.majFiche();
    else if (this.onglet === 'reglages') this.majReglages();
    else if (this.onglet === 'equipe') this.majEquipe();
  }

  majFil() {
    if (this.onglet !== 'fil') return;
    const S = this.store;
    const box = $('#vue-fil');
    const enBas = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const tout = this.etageId === 'hall' || !this.etageId;
    const msgs = S.messages.filter((m) => tout || (m.etages || []).includes(this.etageId));
    const e = S.etage(this.etageId);
    const sv = this.etageId ? S.serviceDe(this.etageId) : null;
    remplir(box,
      h('div', { class: 'filtre' }, tout ? tr('Fil global (tous les étages)') : tr('Fil filtré : {etage}', { etage: e ? e.nom : '' })),
      sv ? h('button', { class: 'raccourci-service s-' + sv.etat, title: tr('Ouvrir la console du serveur'), on: { click: () => this.console.ouvrir(sv.id) } }, '▣ ' + libelleService(sv)) : null,
      ...(msgs.length ? [] : [h('div', { class: 'vide' }, tout ? tr('Aucun message pour l’instant.') : tr('Aucun message pour cet étage. Le fil complet est dans le Hall.'))]),
      ...msgs.map((m) =>
        h('div', { class: 'msg de-' + m.de + (m.reponse ? ' reponse' : '') + (m.question ? ' question' : '') },
          h('div', { class: 'entete' },
            h('span', { class: 'auteur' }, this.auteurMessage(m)),
            m.reponse ? h('span', { class: 'etiquette-msg' }, tr('réponse')) : m.question ? h('span', { class: 'etiquette-msg' }, tr('question')) : null,
            m.tache ? this.lienTacheMsg(m.tache) : m.cible === 'dg' && m.de !== 'dg' ? h('button', { class: 'lien ref-tache', type: 'button', title: this.dgPerso() ? tr('Ouvrir la fiche de {nom}', { nom: this.dgPerso() }) : tr('Ouvrir la fiche du DG'), on: { click: () => this.selectionner('dg') } }, S.nomDg()) : null,
            m.dossier ? h('span', { class: 'ref' }, m.dossier) : null,
            h('span', { class: 'heure' }, heure(m.t))),
          md(m.texte || '', { classe: 'texte', fichier: (c) => this.ouvrirFichier(c, (m.etages || []).find((x) => x !== 'hall') || null) }),
          m.pieces && m.pieces.length ? vignettes(m.pieces, (p, i) => this.visionneuse.ouvrir(p, i)) : null)),
    );
    if (enBas) box.scrollTop = box.scrollHeight;
  }

  auteurMessage(m) {
    if (m.de === 'toi') return tr('Toi');
    if (m.de === 'dg') return this.store.nomDg();
    if (m.de === 'systeme') return tr('Système');
    if (m.de === 'agent') {
      const t = m.tache ? this.store.taches.get(m.tache) : null;
      return m.nom || (t ? this.store.nom(t) : tr('Agent'));
    }
    return m.de;
  }

  // Référence « Léa · T2 » d'un message vers la fiche de sa tâche (et son étage).
  lienTacheMsg(id) {
    const S = this.store;
    const t = S.taches.get(id);
    if (!t) return h('span', { class: 'ref' }, String(id).replace(/^D\d+-/, ''));
    const nom = S.nom(t);
    return h('button', {
      class: 'lien ref-tache e-' + t.etat,
      type: 'button',
      title: tr('Ouvrir la fiche de {ref}', { ref: t.ref }) + (t.titre ? ' — ' + t.titre : ''),
      on: { click: () => this.voirTache(t.id) },
    }, nom !== t.ref ? nom + ' · ' + t.ref : t.ref);
  }

  majDossiers() {
    if (this.onglet !== 'dossiers') return;
    const S = this.store;
    const box = $('#vue-dossiers');
    const liste = [...S.dossiers.values()].sort((a, b) => (b.creeLe || 0) - (a.creeLe || 0));
    if (!liste.length) {
      remplir(box, h('div', { class: 'vide' }, tr('Aucun dossier pour l’instant. Écris au DG en bas de l’écran.')));
      return;
    }
    remplir(box, ...liste.map((d) => {
      const taches = [...S.taches.values()].filter((t) => t.dossier === d.id).sort((a, b) => String(a.ref).localeCompare(String(b.ref), 'fr', { numeric: true }));
      const faites = taches.filter((t) => TERMINAUX.has(t.etat)).length;
      const ouvert = this.dossiersOuverts.has(d.id) || DOSSIER_ACTIF.has(d.etat);
      const actif = DOSSIER_ACTIF.has(d.etat);
      return h('div', { class: 'dossier etat-' + d.etat },
        h('div', { class: 'ligne', on: { click: () => { if (this.dossiersOuverts.has(d.id)) this.dossiersOuverts.delete(d.id); else this.dossiersOuverts.add(d.id); this.majDossiers(); } } },
          h('span', { class: 'ref' }, d.id),
          h('span', { class: 'titre' }, d.titre || d.texte || ''),
          h('span', { class: 'badge d-' + d.etat }, libelleDossier(d.etat))),
        h('div', { class: 'meta' },
          (d.etages || []).map((x) => S.etage(x)?.nom || x).join(' · ') || '—',
          taches.length ? ' — ' + tr('{faites}/{total} tâche(s)', { faites, total: taches.length }) : '',
          d.compte ? ' — ' + (S.comptes.find((c) => c.id === d.compte)?.nom || d.compte) : '',
          d.dg && d.dg.modele ? ' — ' + tr('DG : {modele}', { modele: S.nomModele(d.dg.modele, d.dg.compte || d.compte) }) + (d.dg.effort ? ' · ' + d.dg.effort : '') : '',
          d.travail && d.travail.cout ? ' — ' + tr('Coût : {niveau}', { niveau: nomTravail(d.travail) }) : '',
          d.skills && d.skills.length ? ' — 🧩 ' + d.skills.map((x) => x.id).join(', ') : ''),
        ouvert && d.question ? h('div', { class: 'question' }, h('b', {}, tr('Question :') + ' '), md(d.question, { fichier: (c) => this.ouvrirFichier(c) })) : null,
        ouvert && d.synthese ? md(d.synthese, { classe: 'synthese', fichier: (c) => this.ouvrirFichier(c, (d.etages || [])[0] || null) }) : null,
        ouvert ? h('div', { class: 'taches' }, taches.map((t) =>
          h('button', { class: 'tache', on: { click: () => this.voirTache(t.id) } },
            h('span', { class: 'puce', style: { background: modele(t.modele).c } }),
            h('span', { class: 'ref' }, S.nom(t) !== t.ref ? S.nom(t) + ' · ' + t.ref : t.ref),
            h('span', { class: 'titre' }, t.titre || ''),
            h('span', { class: 'badge t-' + t.etat }, libelleEtat(t.etat))))) : null,
        h('div', { class: 'boutons' },
          S.plans.has(d.id) ? h('button', { class: 'petit', title: tr('Le plan du DG en grand, avec les dépendances'), on: { click: () => this.plan.ouvrir(d.id) } }, tr('Voir le plan')) : null,
          d.etat !== 'annule' ? h('button', { class: 'petit', title: tr('Ajouter un complément (texte, images) à ce dossier'), on: { click: () => this.modeCompleter(d.id) } }, d.etat === 'clarification' ? tr('Répondre') : tr('Compléter')) : null,
          actif ? h('button', { class: 'petit danger', on: { click: () => this.action('/api/dossiers/' + encodeURIComponent(d.id) + '/annuler', undefined, tr('Annuler le dossier {dossier} et toutes ses tâches ?', { dossier: d.id })) } }, tr('Annuler le dossier')) : null,
          // dossier clos : rangé dans Réglages › Dossiers archivés, rien n'est effacé (1.0.7, à la main seulement)
          ['termine', 'annule', 'echec'].includes(d.etat) ? h('button', { class: 'petit', title: tr('Ranger ce dossier dans Réglages › Dossiers archivés : il quitte cette liste, rien n’est effacé'), on: { click: () => this.action('/api/dossiers/' + encodeURIComponent(d.id) + '/archiver') } }, tr('Archiver')) : null,
          // suppression complète (dossier lancé par erreur…) : il ne reste aucune trace
          h('button', { class: 'petit danger', title: tr('Effacer complètement ce dossier (lancé par erreur…)'), on: { click: () => this.action('/api/dossiers/' + encodeURIComponent(d.id) + '/supprimer', undefined,
            (actif ? tr('Le dossier {dossier} est en cours : il sera d’abord arrêté.', { dossier: d.id }) + '\n\n' : '')
            + tr('Supprimer complètement le dossier {dossier} ? Ses tâches, son plan, ses messages, son journal et ses pièces jointes disparaissent pour de bon. Les fichiers déjà modifiés dans tes projets ne sont pas touchés.', { dossier: d.id })) } }, tr('Supprimer'))));
    }));
  }

  majJournal() {
    if (this.onglet !== 'journal') return;
    const S = this.store;
    const box = $('#vue-journal');
    const enBas = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const liste = S.journal.slice(-250);
    remplir(box, ...(liste.length ? liste.map((j) =>
      h('div', { class: 'jl j-' + j.type, title: j.modif ? tr('Voir le code écrit') : null, on: j.modif ? { click: () => this.voirCode(j.tache, j.modif) } : null },
        h('span', { class: 'heure' }, heure(j.t, true)),
        h('span', { class: 'texte' }, j.texte),
        j.modif ? compteLignes(j.ajouts, j.suppressions) : null)) : [h('div', { class: 'vide' }, tr('Journal vide.'))]));
    if (enBas) box.scrollTop = box.scrollHeight;
  }

  // Terminal d'un agent dans une fenêtre flottante (une par agent), mis à jour en direct.
  ouvrirTerminal(tacheId) {
    const S = this.store;
    this.terminauxFlottants = this.terminauxFlottants || new Map();
    let f = this.terminauxFlottants.get(tacheId);
    if (!f) {
      const t = S.taches.get(tacheId);
      f = new Fenetre({ cle: 'terminal', titre: '⌨ ' + tr('Terminal — {nom}', { nom: t ? S.nom(t) + ' · ' + t.ref : tacheId }), classe: 'fen-terminal', largeur: 640, hauteur: 380, coin: 'haut-droite',
        surFermer: () => {
          this.terminauxFlottants.delete(tacheId);
          f.el.remove();
        } });
      f.term = h('div', { class: 'terminal' });
      f.corps.append(f.term);
      // plusieurs terminaux : chacun un peu décalé pour qu'on les voie tous
      const n = this.terminauxFlottants.size;
      if (n) f.el.style.top = f.el.offsetTop + n * 28 + 'px';
      this.terminauxFlottants.set(tacheId, f);
    }
    f.ouvrir();
    this.majTerminalFlottant(tacheId);
  }

  majTerminalFlottant(tacheId) {
    const f = this.terminauxFlottants && this.terminauxFlottants.get(tacheId);
    if (f) rendreTerminal(f.term, this.store, tacheId, this.sortiesOuvertes);
  }

  // Fiche de la tâche, onglet « Code », sur cette modification dépliée.
  voirCode(tacheId, modifId) {
    if (!this.store.taches.has(tacheId)) return;
    this.voirTache(tacheId);
    this.ficheOnglet = 'code';
    if (modifId) {
      this.modifsOuvertes.add(modifId);
      this.modifsOuvertes.delete('ferme:' + modifId);
    }
    this.majFiche();
  }

  voirTache(id, opts = {}) {
    const t = this.store.taches.get(id);
    // une tâche qui attend se voit en salle de pause, pas sur l'étage de son projet
    const ou = t ? etageVisibleTache(this.store, t) || t.etage : null;
    if (ou && ou !== this.etageId) this.allerEtage(ou);
    this.selectionner(id, opts);
  }

  selectionner(id, { garderHistorique = false } = {}) {
    if (!garderHistorique) this.historiqueFiches = [];
    this.dir.selection = id;
    if (id) {
      if (id !== this.fiche) this.ficheOnglet = 'infos';
      this.fiche = id;
      this.choisirOnglet('fiche');
    }
  }

  // Ouvre une autre fiche depuis une référence, en gardant le chemin pour « ← retour ».
  ouvrirFicheDepuis(id) {
    if (this.fiche && this.fiche !== id) this.historiqueFiches.push(this.fiche);
    if (this.historiqueFiches.length > 30) this.historiqueFiches.shift();
    const t = this.store.taches.get(id);
    if (t) this.voirTache(id, { garderHistorique: true });
    else this.selectionner(id, { garderHistorique: true });
  }

  retourFiche() {
    const prec = this.historiqueFiches.pop();
    if (!prec) return;
    if (this.store.taches.has(prec)) this.voirTache(prec, { garderHistorique: true });
    else this.selectionner(prec, { garderHistorique: true });
  }

  nomFiche(id) {
    const S = this.store;
    if (id === 'dg') return this.leDg();
    if (id === 'joy') return S.nomJoy();
    if (String(id).startsWith('ag:')) {
      const a = S.equipe.get(id.slice(3));
      return a ? a.prenom || a.id : id.slice(3);
    }
    const t = S.taches.get(id);
    return t ? (S.nom(t) !== t.ref ? S.nom(t) + ' · ' + t.ref : t.ref) : id;
  }

  boutonRetour() {
    const prec = this.historiqueFiches[this.historiqueFiches.length - 1];
    if (!prec) return null;
    return h('button', { class: 'lien retour-fiche', title: tr('Revenir à la fiche précédente'), on: { click: () => this.retourFiche() } }, tr('← retour ({nom})', { nom: this.nomFiche(prec) }));
  }

  // Référence cliquable « Léa · T2 » vers la fiche de la tâche (et son étage).
  lienRef(dossier, ref) {
    const S = this.store;
    const x = S.tacheParRef(dossier, ref) || S.taches.get(ref);
    if (!x) return h('span', { class: 'ref-tache inconnue' }, ref);
    const nom = S.nom(x);
    return h('button', {
      class: 'lien ref-tache e-' + x.etat,
      title: tr('Ouvrir la fiche de {ref}', { ref: x.ref }) + (x.titre ? ' — ' + x.titre : '') + ' (' + libelleEtat(x.etat) + ')',
      on: { click: () => this.ouvrirFicheDepuis(x.id) },
    }, nom !== x.ref ? nom + ' · ' + x.ref : x.ref);
  }

  listeRefs(dossier, refs) {
    const out = [];
    refs.forEach((r, i) => {
      if (i) out.push(', ');
      out.push(this.lienRef(dossier, r));
    });
    return out;
  }

  // Tâches du même dossier qui dépendent de celle-ci (deps du plan) ou reçoivent ses résultats (inputsFrom).
  donneA(t) {
    const S = this.store;
    const refs = new Set();
    const plan = S.plans.get(t.dossier);
    for (const pt of plan ? plan.taches : []) if (pt.ref !== t.ref && (pt.deps || []).includes(t.ref)) refs.add(pt.ref);
    for (const x of S.taches.values()) {
      if (x.dossier !== t.dossier || x.id === t.id) continue;
      const ins = x.inputsFrom || [];
      if (ins.includes(t.ref) || ins.includes(t.id)) refs.add(x.ref);
    }
    return [...refs].sort(parRef);
  }

  // Bloc « Réflexion en direct » : fil des blocs de réflexion complets, avec les actions faites entre deux.
  blocPensees(cible, actif = true) {
    const S = this.store;
    const p = S.pensees.get(cible);
    // la phase (« rédige son rapport »…) n'a de sens que pendant le travail
    const recent = actif && p && Date.now() - (p.t || 0) < 120000 ? p : null;
    let phase = '';
    if (recent) {
      phase = PHASES[recent.phase] ? tr(PHASES[recent.phase]) : recent.phase || '';
      if (recent.phase === 'outil' && recent.outil) phase += ' (' + recent.outil + ')';
      if (recent.taille) phase += ' · ' + tr('{n} car.', { n: fmtN(recent.taille) });
      if (recent.verificateur) phase = tr('vérificateur : {phase}', { phase });
      phase += ' · ' + heure(recent.t, true);
    }
    const outils = cible === 'dg' ? [] : (S.outils.get(cible) || []).map((o) => ({ ...o, nom: ICONE_OUTIL(o.nom) }));
    return this.filPensees.maj({ cible, blocs: S.reflexions.get(cible) || [], outils, titre: actif ? tr('Réflexion en direct') : tr('Dernières réflexions'), phase });
  }

  // Zone des pensées de la fiche : le fil reste le même nœud (défilement et blocs ouverts conservés).
  majPensees(z, cible, actif) {
    const el = this.blocPensees(cible, actif);
    if (!el) z.pensees.replaceChildren();
    else if (el.parentNode !== z.pensees) {
      z.pensees.replaceChildren(el);
      this.filPensees.restaurer();
    }
  }

  ficheJoy(box) {
    const S = this.store;
    const B = S.bonheur || {};
    const n = (k) => (Array.isArray(B[k]) ? B[k].length : 0);
    const ej = etageJoy(S);
    const bBlague = h('button', { class: 'petit ok', type: 'button' }, tr('Raconte une blague'));
    const bRecolte = h('button', { class: 'petit', type: 'button', title: tr('Le happiness manager va chercher de nouvelles blagues et anecdotes') }, tr('Nouvelle récolte'));
    bBlague.addEventListener('click', () => {
      if (ej && ej !== this.etageId) {
        this.allerEtage(ej);
        setTimeout(() => {
          const r = this.dir.raconter(true);
          if (!r.ok) this.toast('info', r.raison);
        }, 1600);
        return;
      }
      const r = this.dir.raconter(true);
      if (!r.ok) this.toast('info', r.raison);
    });
    bRecolte.addEventListener('click', async () => {
      bRecolte.disabled = true;
      bRecolte.textContent = tr('Récolte en cours…');
      try {
        await envoyer('/api/bonheur/recolter', {});
        this.toast('info', tr('Récolte terminée : {nom} a de quoi faire rire l’équipe.', { nom: S.nomJoy() }));
      } catch (e) {
        this.toast('erreur', tr('Récolte : {erreur}', { erreur: e.message }));
      } finally {
        bRecolte.disabled = false;
        bRecolte.textContent = tr('Nouvelle récolte');
      }
    });
    const maj = B.maj ? new Date(B.maj).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : tr('pas encore');
    remplir(box,
      this.boutonRetour(),
      h('div', { class: 'fiche-entete', style: { borderColor: '#ffd23f' } },
        h('span', { class: 'ref joy-badge', style: { background: '#ffd23f' } }, '😊 ' + S.nomJoy()),
        h('span', { class: 'titre' }, 'Happiness manager'),
        this.boutonPerso('@joy', S.nomJoy())),
      h('p', { class: 'meta' }, tr('{nom} fait le tour des étages pour remonter le moral de ceux qui attendent : une blague, une anecdote, un mot gentil. Jamais quand quelqu’un lève la main.', { nom: S.nomJoy() })),
      h('dl', {},
        h('dt', {}, tr('Étage')), h('dd', {}, ej ? S.etage(ej)?.nom || ej : '—'),
        h('dt', {}, tr('Réserve')), h('dd', {}, tr('{blagues} blagues · {faits} anecdotes · {ambiance} phrases d’ambiance', { blagues: n('blagues'), faits: n('faits'), ambiance: n('ambiance') })),
        h('dt', {}, tr('Récolte')), h('dd', {}, maj + (B.source ? ' (' + B.source + ')' : ''))),
      h('div', { class: 'boutons' }, bBlague, bRecolte));
  }

  majFiche() {
    if (this.onglet !== 'fiche') return;
    const S = this.store;
    const box = $('#vue-fiche');
    if (!this.fiche) {
      remplir(box, h('div', { class: 'vide' }, tr('Clique sur un avatar pour voir sa fiche.')));
      return;
    }
    if (this.fiche === 'joy') {
      this.ficheJoy(box);
      return;
    }
    if (this.fiche === 'dg') {
      const dg = S.dg;
      const d = dg.dossier ? S.dossiers.get(dg.dossier) : null;
      const z = this.zones(box);
      remplir(z.haut,
        this.boutonRetour(),
        h('div', { class: 'fiche-entete', style: { borderColor: COUL_TYPE.direction } },
          h('span', { class: 'ref', style: { background: COUL_TYPE.direction } }, S.nomDg()),
          h('span', { class: 'titre' }, tr('Directeur général')),
          this.boutonPerso('@dg', this.dgPerso(), this.dgPerso() ? null : tr('Changer le nom et l’apparence du DG'))),
        h('dl', {},
          h('dt', {}, tr('État')), h('dd', {}, dg.etat === 'reflechit' ? tr('réfléchit') : tr('libre')),
          h('dt', {}, tr('Action')), h('dd', {}, { plan: tr('affiche son plan'), delta: tr('modifie le plan'), synthese: tr('synthèse'), question: tr('question pour toi') }[dg.action] || '—'),
          h('dt', {}, tr('Étage')), h('dd', {}, S.etage(dg.etage)?.nom || dg.etage || '—'),
          h('dt', {}, tr('Dossier')), h('dd', {}, d ? d.id + ' — ' + (d.titre || d.texte || '') : '—')),
        d && S.plans.has(d.id) ? h('div', { class: 'boutons' }, h('button', { class: 'petit', on: { click: () => this.plan.ouvrir(d.id) } }, tr('Voir le plan'))) : null);
      this.majDialogue(z.dialogue, this.dialogueDg());
      this.majPensees(z, 'dg', dg.etat === 'reflechit');
      remplir(z.bas);
      return;
    }
    if (String(this.fiche).startsWith('ag:')) {
      const a = S.equipe.get(this.fiche.slice(3));
      if (!a || a.etat === 'retire') {
        remplir(box, h('div', { class: 'vide' }, tr('Cet agent est parti à la retraite.')));
        return;
      }
      remplir(box, this.boutonRetour(), this.carteAgent(a, true));
      return;
    }
    const t = S.taches.get(this.fiche);
    if (!t) {
      remplir(box, h('div', { class: 'vide' }, tr('Cette tâche n’existe plus.')));
      return;
    }
    const nbCmd = (S.terminaux.get(t.id) || []).length;
    const enCoursCmd = (S.terminaux.get(t.id) || []).some((c) => c.enCours);
    const sousOnglets = h('div', { class: 'sous-onglets', role: 'tablist' },
      h('button', { class: this.ficheOnglet === 'infos' ? 'actif' : '', role: 'tab', on: { click: () => { this.ficheOnglet = 'infos'; this.majFiche(); } } }, tr('Infos')),
      h('button', { class: this.ficheOnglet === 'code' ? 'actif' : '', role: 'tab', on: { click: () => { this.ficheOnglet = 'code'; this.majFiche(); } } }, tr('Code'), t.lignes ? [' ', compteLignes(t.lignes.ajouts, t.lignes.suppressions)] : null),
      h('button', { class: this.ficheOnglet === 'terminal' ? 'actif' : '', role: 'tab', on: { click: () => { this.ficheOnglet = 'terminal'; this.majFiche(); } } }, tr('Terminal') + (nbCmd ? ' (' + nbCmd + ')' : '') + (enCoursCmd ? ' ⏳' : '')));
    if (this.ficheOnglet === 'code') {
      const nomT = S.nom(t);
      const entete = h('div', { class: 'fiche-entete', style: { borderColor: modele(t.modele).c } },
        h('span', { class: 'ref', style: { background: modele(t.modele).c } }, nomT),
        h('span', { class: 'titre' }, (nomT !== t.ref ? '— ' + t.ref + ' · ' : '') + (t.titre || '')),
        h('button', { class: 'petit', type: 'button', title: tr('Voir son code s’écrire sur le vieil écran'), on: { click: () => this.ecran.ouvrir({ tacheId: t.id }) } }, '🖥 ' + tr('Écran')));
      const zoneCode = h('div', { class: 'code-agent' });
      remplir(box, this.boutonRetour(), entete, sousOnglets, zoneCode);
      const basculer = (id, ouvert) => {
        if (ouvert) {
          this.modifsOuvertes.delete(id);
          this.modifsOuvertes.add('ferme:' + id);
        } else {
          this.modifsOuvertes.add(id);
          this.modifsOuvertes.delete('ferme:' + id);
        }
        this.majFiche();
      };
      rendreModifications(zoneCode, S, t, this.modifsOuvertes, basculer);
      // historique d'avant l'ouverture de la page (ou d'avant un redémarrage) : relu une fois au serveur
      chargerModifications(S, t.id).then((nouveau) => {
        if (nouveau && this.fiche === t.id && this.ficheOnglet === 'code') this.majFiche();
      });
      return;
    }
    if (this.ficheOnglet === 'terminal') {
      const term = $('#terminal-agent') || h('div', { id: 'terminal-agent', class: 'terminal' });
      const nomT = S.nom(t);
      const entete = h('div', { class: 'fiche-entete', style: { borderColor: modele(t.modele).c } },
        h('span', { class: 'ref', style: { background: modele(t.modele).c } }, nomT),
        h('span', { class: 'titre' }, (nomT !== t.ref ? '— ' + t.ref + ' · ' : '') + (t.titre || '')),
        h('button', { class: 'petit', type: 'button', title: tr('Ouvrir ce terminal dans une fenêtre que tu peux placer où tu veux'), on: { click: () => this.ouvrirTerminal(t.id) } }, '⧉ ' + tr('Fenêtre')));
      remplir(box, this.boutonRetour(), entete, sousOnglets, term);
      rendreTerminal(term, S, t.id, this.sortiesOuvertes);
      return;
    }
    const M = modele(t.modele);
    const outils = S.outils.get(t.id) || (t.dernierOutil ? [{ ...t.dernierOutil, t: t.derniereActivite }] : []);
    const perms = [...S.permissions.values()].filter((p) => p.tache === t.id);
    const v = S.verifs.get(t.id);
    const actions = [];
    if (t.verif && t.verif.mode === 'user' && t.etat === 'verifying') {
      actions.push(h('button', { class: 'petit ok', on: { click: () => this.action('/api/taches/' + encodeURIComponent(t.id) + '/valider', { decision: 'pass' }) } }, tr('Valider')));
      actions.push(h('button', { class: 'petit danger', on: { click: () => this.action('/api/taches/' + encodeURIComponent(t.id) + '/valider', { decision: 'fail' }) } }, tr('Rejeter')));
    }
    if (!TERMINAUX.has(t.etat)) {
      actions.push(h('button', { class: 'petit danger', on: { click: () => this.action('/api/taches/' + encodeURIComponent(t.id) + '/annuler', undefined, tr('Annuler la tâche {ref} ?', { ref: t.ref })) } }, tr('Annuler la tâche')));
    }
    const depuis = S.transitions.get(t.id);
    const dos = S.dossiers.get(t.dossier);
    const q = S.decisionDe(t.id);
    if (dos && dos.etat !== 'annule') actions.unshift(h('button', { class: 'petit', title: tr('Ajouter un complément au dossier {dossier}', { dossier: t.dossier }), on: { click: () => this.modeCompleter(t.dossier) } }, tr('Ajouter au dossier')));
    if (S.plans.has(t.dossier)) actions.unshift(h('button', { class: 'petit', title: tr('Le plan du dossier en grand'), on: { click: () => this.plan.ouvrir(t.dossier) } }, tr('Voir le plan')));
    const agent = t.agent ? S.equipe.get(t.agent) : null;
    const nomT = S.nom(t);
    const donne = this.donneA(t);
    const orig = agent && agent.cloneDe ? S.equipe.get(agent.cloneDe) : null;
    const prenom = nomT !== t.ref ? nomT : null;
    // Quatre zones : la saisie « Demander / Nouvelle consigne » n'est jamais redessinée, pour garder le texte
    // et le focus pendant que la fiche se met à jour ; le fil des pensées n'est que complété.
    const z = this.zones(box);
    remplir(z.haut,
      this.boutonRetour(),
      h('div', { class: 'fiche-entete', style: { borderColor: M.c } },
        h('span', { class: 'ref', style: { background: M.c } }, nomT),
        h('span', { class: 'titre' }, (nomT !== t.ref ? '— ' + t.ref + ' · ' : '') + (t.titre || '')),
        this.boutonPerso(prenom, prenom)),
      sousOnglets,
      h('div', { class: 'meta' }, (S.etage(t.etage)?.nom || t.etage) + ' — ' + tr('dossier {dossier}', { dossier: t.dossier }) + (t.nature ? ' — ' + t.nature : '')),
      h('dl', {},
        h('dt', {}, tr('État')), h('dd', {}, h('span', { class: 'badge t-' + t.etat }, libelleEtat(t.etat)), depuis ? ' ' + tr('depuis {heure}', { heure: heure(depuis.t, true) }) : ''),
        h('dt', {}, tr('Demandé')), h('dd', {}, M.nom + ' · ' + (t.effort || '?')),
        h('dt', {}, tr('Réel')), h('dd', {}, t.modeleReel || t.effortReel ? (t.modeleReel || '?') + ' · ' + (t.effortReel || '?') : '—'),
        // plusieurs IA : compte qui fait la tâche, et pourquoi s'il n'est pas celui attendu
        S.multiIa && t.compte ? [h('dt', {}, tr('IA')), h('dd', {}, S.libelleCompte(t.compte),
          t.routage && t.routage.bascule ? h('div', { class: 'meta' }, tr('à la place de {compte}, avec ton accord', { compte: S.libelleCompte(t.routage.bascule) })) : null,
          t.routage && t.routage.repli ? h('div', { class: 'meta' }, tr('repli : aucun compte des priorités ne pouvait la faire')) : null,
          t.routage && t.routage.justification ? h('div', { class: 'meta' }, t.routage.justification) : null)] : null,
        t.attend && t.attend.length ? [h('dt', {}, tr('Attend')), h('dd', { class: 'refs' }, this.listeRefs(t.dossier, t.attend))] : null,
        t.inputsFrom && t.inputsFrom.length ? [h('dt', {}, tr('Reçoit de')), h('dd', { class: 'refs' }, this.listeRefs(t.dossier, t.inputsFrom))] : null,
        donne.length ? [h('dt', {}, tr('Donne à')), h('dd', { class: 'refs' }, this.listeRefs(t.dossier, donne))] : null,
        t.motifFile ? [h('dt', {}, tr('File')), h('dd', {}, t.motifFile)] : null,
        h('dt', {}, tr('Vérification')), h('dd', {}, t.verif ? t.verif.mode + (t.verif.modele ? ' (' + t.verif.modele + ')' : '') + (S.multiIa && t.verif.compte ? ' — ' + S.libelleCompte(t.verif.compte) : '') + (v && v.verdict ? ' — ' + tr('dernier verdict : {verdict}', { verdict: v.verdict }) : '') : '—',
          t.verif && t.verif.ajustement ? h('div', { class: 'meta' }, t.verif.ajustement) : null,
          t.verif && t.verif.controles ? h('div', { class: 'meta' }, t.verif.controles === 'passes' ? tr('Contrôles du projet passés') : tr('Contrôles du projet en échec')) : null),
        h('dt', {}, tr('Tentative')), h('dd', {}, String(t.tentative || 1)),
        t.skills && t.skills.length ? [h('dt', {}, tr('Skills')), h('dd', {}, t.skills.join(', '))] : null,
        t.lignes ? [h('dt', {}, tr('Code')), h('dd', {},
          h('button', { class: 'lien', on: { click: () => { this.ficheOnglet = 'code'; this.majFiche(); } } }, compteLignes(t.lignes.ajouts, t.lignes.suppressions)),
          ' ' + tr('dans {n} fichier(s)', { n: t.lignes.fichiers || 0 }))] : null,
        dos && dos.dg && dos.dg.modele ? [h('dt', {}, tr('DG du dossier')), h('dd', {}, S.nomModele(dos.dg.modele, dos.dg.compte || dos.compte) + (dos.dg.effort ? ' · ' + dos.dg.effort : '') + (S.multiIa ? ' — ' + S.libelleCompte(dos.dg.compte || dos.compte) : ''))] : null,
        dos && dos.travail && dos.travail.cout ? [h('dt', {}, tr('Coût du dossier')), h('dd', {}, this.texteCoutDossier(dos))] : null,
        // lot C : estimation (tâche, plan) et mesures de la session (contexte, compactions, coût)
        t.estimation ? [h('dt', {}, tr('Estimation')), h('dd', {}, '≈ ' + montant(t.estimation.valeur, t.estimation.unite))] : null,
        t.mesures ? [h('dt', {}, tr('Mesures')), h('dd', {}, texteMesures(t.mesures))] : null,
        dos && dos.estimation ? [h('dt', {}, tr('Plan estimé')), h('dd', {}, texteEstimation(dos.estimation))] : null,
        t.agent ? [h('dt', {}, tr('Agent')), h('dd', {},
          h('button', { class: 'lien', on: { click: () => this.ouvrirFicheDepuis('ag:' + t.agent) } }, agent && agent.prenom ? agent.prenom + ' (' + t.agent + ')' : t.agent),
          t.reembauche ? (agent && agent.cloneDe ? ' — ' + tr('clone de {nom}', { nom: (orig && orig.prenom) || agent.cloneDe }) : ' — ' + tr('réembauché')) : ' — ' + tr('nouvelle recrue'),
          agent ? ' · ' + tr('{n} mission(s)', { n: agent.missions || 0 }) : '')] : null),
      agent ? this.jaugeContexte(agent, ['running', 'rework', 'verifying'].includes(t.etat) ? t.mesures?.contexte : null) : null);
    this.majDialogue(z.dialogue, this.dialogueTache(t));
    this.majPensees(z, t.id, ['running', 'rework', 'verifying'].includes(t.etat));
    remplir(z.bas,
      q ? h('div', { class: 'bloc question-agent' }, h('h4', {}, tr('Question en attente')), h('p', {}, q.question || ''),
        h('button', { class: 'petit', on: { click: () => this.montrerCarte('q-' + q.id, true) } }, tr('Répondre'))) : null,
      perms.length ? h('div', { class: 'bloc' }, h('h4', {}, perms.length > 1 ? tr('Permissions demandées') : tr('Permission demandée')), grouperPermissions(perms).map((g) => this.cartePermission(g, true))) : null,
      h('div', { class: 'bloc' }, h('h4', {}, tr('Derniers outils')),
        outils.length ? h('ul', { class: 'outils' }, outils.slice(-8).reverse().map((o) =>
          h('li', {}, h('span', { class: 'heure' }, o.t ? heure(o.t, true) : ''), h('b', {}, ICONE_OUTIL(o.nom)), ' ', o.cible || ''))) : h('div', { class: 'vide' }, tr('Aucun outil pour l’instant.'))),
      t.resultat ? this.blocResultat(t) : null,
      actions.length ? h('div', { class: 'boutons' }, actions) : null,
    );
  }

  // Dossier supprimé ou archivé : la fiche ouverte d'une de ses tâches se ferme ; fil, demandes et cloche se mettent à jour.
  retirerDossier(id) {
    if (this.fiche && String(this.fiche).startsWith(id + '-')) this.selectionner(null);
    this.dossiersOuverts.delete(id);
    this.majSaisie();
    this.majFil();
    this.majPermissions();
    this.notifs.majCloche();
    if (this.notifs.ouvert) this.notifs.rendreMenu();
  }

  // Résultat d'une tâche : résumé et notes mis en forme, fichiers produits (les .md s'ouvrent dans le visionneur).
  blocResultat(t) {
    const r = t.resultat;
    const ouvrir = (c) => this.ouvrirFichier(c, t.etage);
    const fichiers = [...new Set([...(r.artefacts || []).map((a) => a.chemin), ...(r.fichiers || [])])];
    const lisible = (f) => /\.(md|markdown|txt|json|csv|log|ya?ml|toml|lua|luau|js|mjs|ts|py|html|css)$/i.test(f);
    return h('div', { class: 'bloc resultat r-' + r.status },
      h('h4', {}, tr('Résultat : {statut}', { statut: r.status })),
      md(r.summary || '', { fichier: ouvrir }),
      r.notes ? h('details', { class: 'notes-passation' }, h('summary', {}, tr('Notes de passation')), md(r.notes, { fichier: ouvrir })) : null,
      fichiers.length ? h('div', { class: 'fichiers-produits' },
        h('h5', {}, tr('Fichiers ({n})', { n: fichiers.length })),
        h('ul', {}, fichiers.map((f) => h('li', {},
          lisible(f)
            ? h('button', { class: 'md-fichier code', type: 'button', title: tr('Ouvrir {f}', { f }), on: { click: () => ouvrir(f) } }, f)
            : h('code', {}, f))))) : null);
  }

  // ---------- parler à un agent ou au DG sans l'interrompre ----------
  // Fiche en zones persistantes : haut et bas sont redessinés (remplir), le dialogue garde sa saisie,
  // le fil des pensées est mis à jour sur place.
  zones(box) {
    let z = this.zonesFiche;
    if (!z || box.children.length !== 4 || box.children[0] !== z.haut || box.children[1] !== z.dialogue || box.children[2] !== z.pensees || box.children[3] !== z.bas) {
      z = this.zonesFiche = { haut: h('div', { class: 'fiche-zone' }), dialogue: h('div', { class: 'fiche-dialogue' }), pensees: h('div', { class: 'fiche-zone' }), bas: h('div', { class: 'fiche-zone' }) };
      box.replaceChildren(z.haut, z.dialogue, z.pensees, z.bas);
    }
    return z;
  }

  // Dossier sur lequel on interroge le DG : celui qu'il traite, sinon le plus récent.
  dossierDg() {
    const S = this.store;
    const d = S.dg && S.dg.dossier ? S.dossiers.get(S.dg.dossier) : null;
    if (d) return d;
    const ds = [...S.dossiers.values()].sort((a, b) => (b.creeLe || 0) - (a.creeLe || 0));
    return ds.find((x) => x.etat !== 'annule') || ds[0] || null;
  }

  dialogueTache(t) {
    const S = this.store;
    const nom = S.nom(t);
    const dos = S.dossiers.get(t.dossier);
    const pasCommencee = PAS_DEMARREE.has(t.etat);
    const fermee = ['cancelled', 'skipped'].includes(t.etat) || !dos || dos.etat === 'annule';
    let aideConsigne = tr('Transmise en direct si possible, sinon dès la fin de son tour. Elle peut changer son travail.');
    if (['planned', 'waiting', 'ready', 'queued'].includes(t.etat)) aideConsigne = tr('{nom} n’a pas encore commencé : la consigne sera ajoutée à sa mission.', { nom });
    else if (t.etat === 'verifying') aideConsigne = tr('{nom} est en vérification : la consigne sera intégrée juste après.', { nom });
    else if (TERMINAUX.has(t.etat) || t.etat === 'interrupted') aideConsigne = tr('Tâche finie : {nom} la reprend pour intégrer la consigne.', { nom });
    return {
      cle: t.id,
      nom,
      question: {
        ok: !pasCommencee,
        raison: tr('{nom} n’a pas encore commencé : rien à lui demander pour l’instant.', { nom }),
        titre: tr('Demander à {nom} où il en est, sans l’interrompre', { nom }),
        entete: tr('Question à {nom}', { nom }),
        aide: tr('{nom} continue son travail : une copie de sa conversation te répond, ici et dans le fil.', { nom }),
        placeholder: tr('Ta question à {nom}…', { nom }),
      },
      consigne: {
        ok: !fermee,
        raison: tr('Cette tâche est fermée : ajoute plutôt un complément au dossier.'),
        titre: tr('Donner une nouvelle consigne à {nom} : elle peut changer son travail', { nom }),
        entete: tr('Nouvelle consigne pour {nom}', { nom }),
        aide: aideConsigne,
        placeholder: tr('Ce que {nom} doit faire autrement ou en plus…', { nom }),
      },
      echanges: S.messages.filter((m) => m.tache === t.id && (m.question || m.reponse || m.de === 'toi')),
    };
  }

  dialogueDg() {
    const S = this.store;
    const d = this.dossierDg();
    const perso = this.dgPerso(); // « à Max » / « au DG » : phrases distinctes pour la grammaire
    const nom = this.leDg(true);
    const vars = { nom, dossier: d ? d.id : '—', titre: d ? court(d.titre || d.texte, 40) : '' };
    const sansDossier = tr('Aucun dossier pour l’instant : écris d’abord une demande en bas de l’écran.');
    return {
      cle: 'dg',
      nom,
      question: {
        ok: !!d,
        raison: sansDossier,
        titre: perso ? tr('Demander à {nom} où il en est, sans l’interrompre', { nom: perso }) : tr('Demander au DG où il en est, sans l’interrompre'),
        entete: perso ? tr('Question à {nom} (dossier {dossier})', { ...vars, nom: perso }) : tr('Question au DG (dossier {dossier})', vars),
        aide: tr('{nom} continue son travail : une copie de sa conversation sur le dossier {dossier} te répond, ici et dans le fil.', vars),
        placeholder: perso ? tr('Ta question à {nom}…', { nom: perso }) : tr('Ta question au DG…'),
      },
      consigne: {
        ok: !!d && d.etat !== 'annule',
        raison: d ? tr('Le dossier {dossier} est annulé : écris une nouvelle demande.', vars) : sansDossier,
        titre: tr('Ajouter une consigne au dossier {dossier} : {nom} la transmet aux agents', { ...vars, nom: this.leDg() }),
        entete: tr('Nouvelle consigne pour le dossier {dossier} · {titre}', vars),
        aide: tr('{nom} l’ajoute au dossier {dossier} et la transmet aux agents concernés, même déjà lancés.', vars),
        placeholder: tr('Ce qui doit changer ou s’ajouter dans le dossier {dossier}…', vars),
      },
      echanges: S.messages.filter((m) => m.cible === 'dg'),
    };
  }

  cfgDialogue(cle) {
    if (cle === 'dg') return this.dialogueDg();
    const t = this.store.taches.get(cle);
    return t ? this.dialogueTache(t) : null;
  }

  ouvrirDialogue(cle, type) {
    const cfg = this.cfgDialogue(cle);
    if (!cfg) return;
    if (this.dialogue && this.dialogue.cle === cle && this.dialogue.type === type) {
      this.dialogue = null;
      this.majFiche();
      return;
    }
    if (!cfg[type].ok) {
      this.toast('info', cfg[type].raison);
      return;
    }
    this.dialogue = { cle, type };
    this.majFiche();
    const c = this.composeurs.get(cle + '|' + type);
    if (c) c.champ.focus();
  }

  // Petite saisie (question ou consigne) : créée une fois par cible et gardée, pour ne jamais perdre le texte.
  composeur(cle, type) {
    const k = cle + '|' + type;
    if (this.composeurs.has(k)) return this.composeurs.get(k);
    const champ = h('textarea', { class: 'q-reponse dlg-champ', rows: '3', maxlength: '4000' });
    const entete = h('div', { class: 'dlg-entete' });
    const aide = h('small', { class: 'dlg-aide' });
    const bEnvoyer = h('button', { class: 'petit ok', type: 'button', title: tr('Envoyer (Ctrl+Entrée)'), disabled: true }, tr('Envoyer'));
    const bAnnuler = h('button', { class: 'petit', type: 'button', title: tr('Fermer sans envoyer (Échap)') }, tr('Annuler'));
    const el = h('div', { class: 'dlg-composeur dlg-' + type }, entete, champ, h('div', { class: 'dlg-pied' }, aide, bAnnuler, bEnvoyer));
    const c = { el, champ, entete, aide, bEnvoyer, occupe: false };
    const maj = () => (bEnvoyer.disabled = c.occupe || !champ.value.trim());
    const fermer = () => {
      if (this.dialogue && this.dialogue.cle === cle && this.dialogue.type === type) this.dialogue = null;
      this.majFiche();
    };
    const go = async () => {
      const texte = champ.value.trim();
      if (!texte || c.occupe) return;
      c.occupe = true;
      maj();
      bEnvoyer.textContent = tr('Envoi…');
      try {
        await this.envoyerDialogue(cle, type, texte);
        champ.value = '';
        fermer();
      } catch (e) {
        // 409 : pas encore de conversation, mode démo… le texte reste pour réessayer
        this.toast('warn', e.message);
      } finally {
        c.occupe = false;
        bEnvoyer.textContent = tr('Envoyer');
        maj();
      }
    };
    champ.addEventListener('input', maj);
    champ.addEventListener('keydown', (e) => {
      if (this.toucheEnvoi(e)) {
        e.preventDefault();
        go();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        fermer();
      }
    });
    bEnvoyer.addEventListener('click', go);
    bAnnuler.addEventListener('click', fermer);
    this.composeurs.set(k, c);
    return c;
  }

// Touche d'envoi d'un champ de texte : Ctrl+Entrée toujours ; Entrée seule si l'option « Entrée pour
  // envoyer » est cochée (Réglages › Général), Maj+Entrée faisant alors un retour à la ligne.
  toucheEnvoi(e) {
    if (e.key !== 'Enter' || e.isComposing) return false;
    if (e.ctrlKey || e.metaKey) return true;
    return !e.shiftKey && !!(this.store.reglages && this.store.reglages.entreeEnvoie);
  }

  async envoyerDialogue(cle, type, texte) {
    const S = this.store;
    if (cle === 'dg') {
      const d = this.dossierDg();
      if (!d) throw new Error(tr('Aucun dossier pour l’instant : écris d’abord une demande en bas de l’écran.'));
      const route = '/api/dossiers/' + encodeURIComponent(d.id) + (type === 'question' ? '/question-dg' : '/completer');
      await envoyer(route, { texte });
      this.toast('info', type === 'question'
        ? this.dgPerso()
          ? tr('Question envoyée : la réponse de {nom} arrivera ici et dans le fil.', { nom: this.dgPerso() })
          : tr('Question envoyée : la réponse du DG arrivera ici et dans le fil.')
        : tr('Consigne ajoutée au dossier {dossier}.', { dossier: d.id }));
      return;
    }
    const t = S.taches.get(cle);
    const nom = t ? S.nom(t) : cle;
    await envoyer('/api/taches/' + encodeURIComponent(cle) + '/' + type, { texte });
    this.toast('info', type === 'question'
      ? tr('Question envoyée : la réponse de {nom} arrivera ici et dans le fil.', { nom })
      : tr('Consigne envoyée à {nom}.', { nom }));
  }

  majDialogue(zone, cfg) {
    let p = zone.parties;
    if (!p) {
      p = zone.parties = { boutons: h('div', { class: 'boutons dlg-boutons' }), saisie: h('div', { class: 'dlg-saisie' }), echanges: h('div', { class: 'dlg-echanges' }) };
      zone.replaceChildren(p.boutons, p.saisie, p.echanges);
    }
    let ouvert = this.dialogue && this.dialogue.cle === cfg.cle ? this.dialogue.type : null;
    if (ouvert && !cfg[ouvert].ok) ouvert = this.dialogue = null;
    const bouton = (type, libelle) => {
      const c = cfg[type];
      return h('button', {
        class: 'petit dlg-bouton' + (ouvert === type ? ' actif' : '') + (c.ok ? '' : ' inactif'),
        type: 'button',
        title: c.ok ? c.titre : c.raison,
        'aria-expanded': ouvert === type ? 'true' : 'false',
        'aria-disabled': c.ok ? null : 'true',
        on: { click: () => this.ouvrirDialogue(cfg.cle, type) },
      }, libelle);
    };
    remplir(p.boutons, bouton('question', '💬 ' + tr('Demander où il en est')), bouton('consigne', '✎ ' + tr('Nouvelle consigne')));
    if (ouvert) {
      const c = this.composeur(cfg.cle, ouvert);
      const x = cfg[ouvert];
      if (c.entete.textContent !== x.entete) c.entete.textContent = x.entete;
      if (c.aide.textContent !== x.aide) c.aide.textContent = x.aide;
      if (c.champ.placeholder !== x.placeholder) c.champ.placeholder = x.placeholder;
      c.champ.setAttribute('aria-label', x.entete);
      if (p.saisie.firstChild !== c.el) p.saisie.replaceChildren(c.el);
    } else if (p.saisie.firstChild) p.saisie.replaceChildren();
    remplir(p.echanges, this.blocEchanges(cfg.echanges));
  }

  // Bloc « Questions » : tes questions (et consignes) et les réponses, avec « réponse en cours… » en attendant.
  blocEchanges(msgs) {
    if (!msgs.length) return null;
    const enAttente = [];
    for (const m of msgs) {
      if (m.reponse) enAttente.shift();
      else if (m.question) enAttente.push(m);
    }
    const now = Date.now();
    const consignes = msgs.some((m) => m.de === 'toi' && !m.question);
    const derniers = msgs.slice(-12);
    return h('div', { class: 'bloc echanges' },
      h('h4', {}, consignes ? tr('Questions et consignes') : tr('Questions')),
      msgs.length > derniers.length ? h('div', { class: 'meta' }, tr('{n} message(s) plus ancien(s) dans le fil', { n: msgs.length - derniers.length })) : null,
      derniers.map((m) => h('div', { class: 'echange de-' + m.de + (m.reponse ? ' reponse' : '') },
        h('div', { class: 'entete' },
          h('span', { class: 'auteur' }, this.auteurMessage(m)),
          m.de === 'toi' ? h('span', { class: 'etiquette-msg' }, m.question ? tr('question') : tr('consigne')) : null,
          h('span', { class: 'heure' }, heure(m.t))),
        md(m.texte || '', { classe: 'texte', fichier: (c) => this.ouvrirFichier(c, (m.etages || []).find((x) => x !== 'hall') || null) }))),
      enAttente.map((q) => (now - (q.t || now) < QUESTION_DELAI
        ? h('div', { class: 'echange patiente', role: 'status' }, h('span', { class: 'points', 'aria-hidden': 'true' }), tr('réponse en cours…'))
        : h('div', { class: 'echange sans-reponse' }, tr('pas de réponse à la question de {heure} (voir les alertes)', { heure: heure(q.t) })))));
  }

  // ---------- réserve d'agents ----------
  // enDirect : contexte de la session en cours (mesures de la tâche), plus à jour que celui gardé par l'agent
  jaugeContexte(a, enDirect = null) {
    const c = Math.max(0, enDirect || a.contexte || 0);
    const r = Math.min(1, c / CONTEXTE_MAX);
    return h('div', { class: 'jauge-boite', title: tr('Contexte de la conversation : au-delà de 150 000 tokens, l’agent part à la retraite') },
      h('div', { class: 'jauge-lib' }, tr('Contexte : {n} k / {max} k tokens', { n: Math.round(c / 1000), max: CONTEXTE_MAX / 1000 })),
      h('div', { class: 'jauge' }, h('div', { class: 'jauge-barre' + (r > 0.8 ? ' haut' : r > 0.5 ? ' moyen' : ''), style: { width: Math.round(r * 100) + '%' } })));
  }

  carteAgent(a, complet = false) {
    const S = this.store;
    const M = modele(a.modele);
    const e = S.etage(a.etage);
    const tache = a.tache ? S.taches.get(a.tache) : null;
    const compte = S.comptes.find((c) => c.id === a.compte);
    const etat = a.etat === 'occupe' ? (tache ? tr('au travail sur {ref}', { ref: tache.ref }) : tr('au travail')) : a.etat === 'disponible' ? tr('en réserve') : a.etat;
    const n = a.missions || 0;
    const orig = a.cloneDe ? S.equipe.get(a.cloneDe) : null;
    const corps = h('div', { class: 'agent-carte' + (complet ? ' complet' : '') + ' a-' + a.etat },
      h('div', { class: 'fiche-entete', style: { borderColor: M.c } },
        h('span', { class: 'ref', style: { background: M.c } }, a.prenom || a.id),
        h('span', { class: 'titre' }, M.nom + (a.effort ? ' · ' + a.effort : '')),
        h('span', { class: 'badge ' + (a.etat === 'occupe' ? 't-running' : 't-done') }, etat)),
      h('dl', {},
        a.prenom ? [h('dt', {}, tr('Identifiant')), h('dd', {}, a.id)] : null,
        h('dt', {}, tr('Étage')), h('dd', {}, e ? e.nom : a.etage || '—'),
        h('dt', {}, tr('Compte')), h('dd', {}, compte ? compte.nom : a.compte || '—'),
        h('dt', {}, tr('Missions')), h('dd', {}, String(n)),
        a.cloneDe ? [h('dt', {}, tr('Clone de')), h('dd', {}, orig && orig.prenom ? orig.prenom + ' (' + a.cloneDe + ')' : a.cloneDe)] : null,
        h('dt', {}, tr('Dernière')), h('dd', {}, a.titre || '—'),
        tache && tache.mesures ? [h('dt', {}, tr('Mission en cours')), h('dd', {}, texteMesures(tache.mesures))] : null,
        complet && a.depuis ? [h('dt', {}, tr('Depuis')), h('dd', {}, heure(a.depuis, true))] : null),
      a.specialite ? h('p', { class: 'specialite' }, a.specialite) : null,
      a.fichiers && a.fichiers.length ? h('div', { class: 'bloc' }, h('h4', {}, tr('Fichiers connus')), h('ul', { class: 'fichiers' }, a.fichiers.map((f) => h('li', {}, h('code', {}, f))))) : null,
      this.jaugeContexte(a, tache && tache.agent === a.id && ['running', 'rework', 'verifying'].includes(tache.etat) ? tache.mesures?.contexte : null),
      h('div', { class: 'boutons' },
        tache ? h('button', { class: 'petit', on: { click: () => (complet ? this.ouvrirFicheDepuis(tache.id) : this.voirTache(tache.id)) } }, tr('Voir {ref}', { ref: tache.ref })) : null,
        this.boutonPerso(a.prenom || null, a.prenom || null),
        a.etat === 'disponible' ? h('button', { class: 'petit danger', title: tr('L’agent quitte la réserve : sa conversation ne sera plus reprise'), on: { click: () => this.action('/api/equipe/' + encodeURIComponent(a.id) + '/retirer', undefined, tr('Mettre {nom} à la retraite ? Il ne pourra plus être réembauché.', { nom: a.prenom || a.id })) } }, tr('Mettre à la retraite')) : null));
    return corps;
  }

  majEquipe() {
    if (this.onglet !== 'equipe') return;
    const S = this.store;
    const box = $('#vue-equipe');
    const agents = [...S.equipe.values()].filter((a) => a.etat !== 'retire');
    if (!agents.length) {
      remplir(box, h('div', { class: 'vide' }, tr('Personne en réserve pour l’instant : les agents qui terminent une tâche restent ici, prêts à être réembauchés.')));
      return;
    }
    const groupes = [];
    for (const e of this.etagesTries()) {
      const liste = agents.filter((a) => a.etage === e.id).sort((a, b) => (a.etat === b.etat ? String(a.id).localeCompare(String(b.id), 'fr', { numeric: true }) : a.etat === 'occupe' ? -1 : 1));
      if (!liste.length) continue;
      const dispo = liste.filter((a) => a.etat === 'disponible').length;
      groupes.push(h('div', { class: 'equipe-etage' },
        h('button', { class: 'equipe-titre', on: { click: () => this.allerEtage(e.id) } }, e.nom, h('span', { class: 'meta' }, ' — ' + tr('{dispo} en réserve, {occupes} au travail', { dispo, occupes: liste.length - dispo }))),
        liste.map((a) => {
          const c = this.carteAgent(a, false);
          c.addEventListener('click', (ev) => {
            if (ev.target.closest('button')) return;
            // un agent en réserve dort en salle de repos : on va là où on le voit
            const ou = etageVisibleAgent(this.store, a) || a.etage;
            if (ou !== this.etageId) this.allerEtage(ou);
            this.selectionner(a.etat === 'occupe' && a.tache ? a.tache : 'ag:' + a.id);
          });
          return c;
        })));
    }
    remplir(box, ...groupes);
  }

  // ---------- permissions ----------
  cartePermission(p, compacte = false) {
    const g = Array.isArray(p) ? p : [p];
    return carteDemandes(this.store, g, {
      compacte,
      ouverts: this.detailsOuverts,
      voir: (id) => this.voirTache(id),
      decider: (ps, decision) => this.deciderPermissions(ps, decision),
    });
  }

  // Réponse à une ou plusieurs demandes (pile « Tout autoriser »).
  async deciderPermissions(ps, decision) {
    let ok = true;
    for (const x of ps) {
      if (!this.store.permissions.has(x.id)) continue;
      ok = (await this.action('/api/permissions/' + encodeURIComponent(x.id), { decision })) && ok;
    }
    return ok;
  }

  // Carte de question d'un agent : cliquer une option la sélectionne seulement (rien ne part),
  // cliquer son image l'ouvre en grand, « Envoyer » envoie l'option choisie et/ou le texte libre.
  carteDecision(q) {
    const S = this.store;
    const t = S.taches.get(q.tache);
    let occupe = false;
    const avecOptions = !!(q.options && q.options.length);
    const champ = h('textarea', {
      class: 'q-reponse',
      rows: '2',
      maxlength: '4000',
      placeholder: avecOptions ? tr('Précision (facultative)…') : tr('Ta réponse…'),
      'aria-label': avecOptions ? tr('Précision facultative') : tr('Réponse à la question'),
    });
    champ.value = this.brouillons.get(q.id) || '';
    const valide = (id) => (q.options || []).some((o) => o.id === id);
    let choix = valide(this.choixDecisions.get(q.id)) ? this.choixDecisions.get(q.id) : null;
    const etatChoix = h('span', { class: 'q-etat', 'aria-live': 'polite' });
    const bEnvoyer = h('button', { class: 'ok q-envoyer', type: 'button', title: tr('Envoyer ta réponse (Ctrl+Entrée dans le texte)') }, tr('Envoyer'));
    const boutonsOptions = [];
    const libelle = (id) => {
      const o = (q.options || []).find((x) => x.id === id);
      return o ? o.libelle || o.id : '';
    };
    const maj = () => {
      const texte = champ.value.trim();
      for (const { b, carte, o } of boutonsOptions) {
        const oui = o.id === choix;
        b.setAttribute('aria-checked', oui ? 'true' : 'false');
        b.classList.toggle('choisie', oui);
        if (carte) carte.classList.toggle('choisie', oui);
        b.disabled = occupe;
      }
      bEnvoyer.disabled = occupe || (!choix && !texte);
      champ.readOnly = occupe;
      etatChoix.textContent = choix
        ? tr('Ton choix : {option}', { option: libelle(choix) }) + (texte ? ' ' + tr('+ ta précision') : '')
        : avecOptions ? (texte ? tr('Réponse libre, sans option') : tr('Choisis une option, puis Envoyer.')) : '';
      etatChoix.classList.toggle('vide', !choix);
    };
    const choisir = (id) => {
      if (occupe) return;
      choix = choix === id ? null : id; // un second clic retire le choix
      if (choix) this.choixDecisions.set(q.id, choix);
      else this.choixDecisions.delete(q.id);
      maj();
    };
    const envoyerReponse = async () => {
      if (occupe) return;
      const texte = champ.value.trim();
      if (!choix && !texte) {
        champ.focus();
        this.toast('warn', avecOptions ? tr('Choisis une option ou écris une réponse.') : tr('Écris ta réponse.'));
        return;
      }
      occupe = true;
      maj();
      const corps = {};
      if (choix) corps.choix = choix;
      if (texte) corps.texte = texte;
      const ok = await this.action('/api/decisions/' + encodeURIComponent(q.id), corps);
      if (ok) {
        this.brouillons.delete(q.id);
        this.choixDecisions.delete(q.id);
      } else {
        occupe = false;
        maj();
      }
    };
    champ.addEventListener('input', () => {
      this.brouillons.set(q.id, champ.value);
      maj();
    });
    champ.addEventListener('keydown', (e) => {
      if (this.toucheEnvoi(e)) {
        e.preventDefault();
        envoyerReponse();
      }
    });
    bEnvoyer.addEventListener('click', envoyerReponse);
    const imagesOptions = (q.options || []).filter((o) => o.image).map((o) => ({ ...o.image, legende: o.image.legende || o.libelle }));
    const options = (q.options || []).map((o) => {
      const nom = o.libelle || o.id;
      const b = h('button', { class: 'option', type: 'button', role: 'radio', 'aria-checked': 'false', title: tr('Choisir : {option}', { option: nom }) },
        h('span', { class: 'coche', 'aria-hidden': 'true' }),
        h('span', { class: 'option-lib' }, nom));
      b.addEventListener('click', () => choisir(o.id));
      if (!o.image) {
        boutonsOptions.push({ b, o, carte: null });
        return b;
      }
      // Option illustrée : l'image entière ouvre la visionneuse, le libellé (ou le cadre) sélectionne.
      const img = h('img', { src: o.image.url, alt: tr('Image de l’option {option}', { option: nom }), loading: 'lazy' });
      const bImage = h('button', { class: 'option-image', type: 'button', title: tr('Voir en grand : {option}', { option: nom }) }, img, h('span', { class: 'option-zoom', 'aria-hidden': 'true' }, '⤢'));
      img.addEventListener('error', () => bImage.classList.add('cassee'));
      bImage.addEventListener('click', (e) => {
        e.stopPropagation();
        this.visionneuse.ouvrir(imagesOptions, Math.max(0, imagesOptions.findIndex((x) => x.url === o.image.url)));
      });
      const carte = h('div', { class: 'option-carte' }, bImage, b);
      carte.addEventListener('click', (e) => {
        if (e.target === carte) choisir(o.id);
      });
      boutonsOptions.push({ b, o, carte });
      return carte;
    });
    maj();
    return h('div', { class: 'carte-perm carte-question' },
      h('div', { class: 'perm-haut' },
        h('span', { class: 'perm-outil q' }, tr('Question')),
        t ? h('button', { class: 'lien', on: { click: () => this.voirTache(t.id) } }, (S.nom(t) !== t.ref ? S.nom(t) + ' · ' : '') + t.ref + ' · ' + (S.etage(t.etage)?.nom || t.etage)) : null,
        h('span', { class: 'heure' }, heure(q.t))),
      h('div', { class: 'q-texte', id: 'q-texte-' + q.id }, q.question || ''),
      q.images && q.images.length ? vignettes(q.images, (p, i) => this.visionneuse.ouvrir(p, i), 'q-images') : null,
      options.length ? h('div', { class: 'q-options' + (imagesOptions.length ? ' avec-images' : ''), role: 'radiogroup', 'aria-labelledby': 'q-texte-' + q.id }, options) : null,
      h('div', { class: 'q-libre' }, champ),
      h('div', { class: 'q-pied' }, etatChoix, bEnvoyer));
  }

  // Pile des cartes d'action (permissions et questions), mise à jour sans perdre la saisie en cours.
  majPermissions() {
    const S = this.store;
    const box = $('#cartes-permission');
    // demandes d'une même tâche et d'un même risque : une seule carte « ×n »
    this.clePerm.clear();
    const piles = grouperPermissions([...S.permissions.values()]).map((g) => {
      const cle = clePermissions(g);
      for (const x of g) this.clePerm.set(x.id, cle);
      return { cle, t: g[0].t || 0, faire: () => this.cartePermission(g) };
    });
    const voulues = [
      ...piles,
      ...[...S.decisions.values()].map((q) => ({ cle: 'q-' + q.id, t: q.t || 0, faire: () => this.carteDecision(q) })),
    ].sort((a, b) => a.t - b.t);
    const garder = new Set(voulues.map((v) => v.cle));
    for (const [cle, el] of this.cartes) {
      if (!garder.has(cle)) {
        el.remove();
        this.cartes.delete(cle);
      }
    }
    for (const v of voulues) {
      if (!this.cartes.has(v.cle)) {
        const el = v.faire();
        el.dataset.cle = v.cle;
        this.cartes.set(v.cle, el);
      }
    }
    voulues.forEach((v, i) => {
      const el = this.cartes.get(v.cle);
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
    });
    this.majPoigneeDemandes(voulues.length);
    for (const k of [...this.brouillons.keys()]) if (!S.decisions.has(k)) this.brouillons.delete(k);
    for (const k of [...this.choixDecisions.keys()]) if (!S.decisions.has(k)) this.choixDecisions.delete(k);
  }

  // Fait apparaître une carte (depuis une notification ou la fiche) et la met en évidence.
  montrerCarte(cle, focus) {
    this.majPermissions();
    if (!this.cartes.has(cle) && cle.startsWith('p-') && this.clePerm.has(cle.slice(2))) cle = this.clePerm.get(cle.slice(2));
    const el = this.cartes.get(cle);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.classList.remove('eclair');
    void el.offsetWidth;
    el.classList.add('eclair');
    if (focus) {
      const c = el.querySelector('textarea');
      if (c) c.focus();
    }
  }

  // ---------- réglages (MCP) ----------
  majReglages() {
    if (this.parametres.ouvert && this.parametres.section === 'mcp') this.parametres.rendre();
  }

  async decouvrirMcp(compte) {
    this.decouvertes.add(compte);
    this.majReglages();
    try {
      const r = await envoyer('/api/mcp/decouvrir', { compte });
      if (r && r.comptes) this.store.mcp = { comptes: {}, etages: {}, ...r };
    } catch (e) {
      this.toast('erreur', tr('Relecture des connecteurs : {erreur}', { erreur: e.message }));
    } finally {
      this.decouvertes.delete(compte);
      this.majReglages();
    }
  }

  async changerModeMcp(cible, id, nom, mode) {
    const cle = cible + '|' + id + '|' + nom;
    this.mcpEnCours.set(cle, mode);
    this.majReglages();
    try {
      const r = await envoyer('/api/mcp', { cible, id, nom, mode });
      if (r && r.comptes) this.store.mcp = { comptes: {}, etages: {}, ...r };
    } catch (e) {
      this.toast('erreur', tr('MCP : {erreur}', { erreur: e.message }));
    } finally {
      this.mcpEnCours.delete(cle);
      this.majReglages();
    }
  }

  // ---------- pause, alertes ----------
  majPause() {
    const p = this.store.ordonnanceur && this.store.ordonnanceur.pause;
    const b = $('#bandeau-pause');
    // multi-IA (D4) : un compte en pause ne met pas le QG en pause ; le bandeau le dit, « Reprendre » le relance
    const parCompte = Object.entries((this.store.ordonnanceur && this.store.ordonnanceur.pauses) || {});
    b.hidden = !p && !parCompte.length;
    document.body.classList.toggle('en-pause', !!p);
    if (!p) {
      if (!parCompte.length) return;
      const nom = (id) => ((this.store.comptes || []).find((c) => c.id === id) || { nom: id }).nom;
      $('#pause-texte').textContent = parCompte.map(([id, x]) => tr('{compte} en pause : {raison}', { compte: nom(id), raison: x.raison || '' }) + (x.jusqua ? ' — ' + tr('reprise à {heure}', { heure: heure(x.jusqua, true) }) : '')).join(' · ');
      return;
    }
    let txt = tr('Pause : {raison}', { raison: p.raison || tr('ordonnanceur en pause') });
    if (p.jusqua) {
      const reste = Math.max(0, Math.round((p.jusqua - Date.now()) / 1000));
      txt += ' — ' + tr('reprise à {heure} (dans {s} s)', { heure: heure(p.jusqua, true), s: reste });
    }
    $('#pause-texte').textContent = txt;
  }

  toast(niveau, texte) {
    const box = $('#alertes');
    const fermer = h('button', { class: 'fermer', title: tr('Fermer'), 'aria-label': tr('Fermer') }, '×');
    const el = h('div', { class: 'alerte a-' + niveau, role: niveau === 'erreur' ? 'alert' : 'status' }, h('span', {}, texte), fermer);
    fermer.addEventListener('click', () => el.remove());
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    if (niveau !== 'erreur') setTimeout(() => el.remove(), niveau === 'warn' ? 10000 : 6000);
  }

  // ---------- événements ----------
  surEvenement(ev) {
    const S = this.store;
    const now = Date.now();
    // pensées : jusqu'à une par seconde et par agent ; seul le fil de la fiche concernée se met à jour
    if (ev.type === 'pensee' || ev.type === 'pensee_traduction') {
      const z = this.zonesFiche;
      if (this.onglet === 'fiche' && this.fiche === ev.cible && z && z.pensees.isConnected) {
        const t = ev.cible === 'dg' ? null : S.taches.get(ev.cible);
        this.majPensees(z, ev.cible, ev.cible === 'dg' ? S.dg.etat === 'reflechit' : !!t && ['running', 'rework', 'verifying'].includes(t.etat));
      }
      return;
    }
    if (ev.type === 'bonheur') {
      if (this.onglet === 'fiche' && this.fiche === 'joy') this.majFiche();
      if (this.onglet === 'journal') this.majJournal();
      return;
    }
    if (ev.type === 'conso') {
      this.conso.maj();
      return;
    }
    if (ev.type === 'codex-installation') {
      this.parametres.maj();
      this.accueil.maj();
      return;
    }
    if (ev.type === 'comptes') {
      this.majComptes();
      this.majReglageCout();
      this.conso.majBouton();
      this.parametres.maj();
      this.accueil.maj();
      return;
    }
    if (ev.type === 'reglages') {
      this.majLangues();
      this.majReglageCout();
      this.parametres.maj();
      return;
    }
    if (ev.type === 'personnalisation') {
      this.dir.looks.clear();
      // noms du DG, de Joy ou des agents changés : tout ce qui les affiche suit
      this.majImmeuble();
      this.majSaisie();
      this.majPanneau();
      return;
    }
    this.plan.surEvenement(ev);
    this.ecran.surEvenement(ev);
    this.navigateur.surEvenement(ev);
    this.discussions.surEvenement(ev);
    if (ev.type === 'discussion' && (ev.de === 'perso' || ev.de === 'reaction')) this.bullePerso(ev);
    if (ev.type === 'bavardage') this.jouerBavardage(ev);
    if (ev.type === 'modification' && this.onglet === 'fiche' && this.fiche === ev.tache && this.ficheOnglet === 'code') this.majFiche();
    if (ev.type === 'etat') {
      // Le QG revient dans une nouvelle version (mise à jour) : on recharge la page pour avoir le nouveau site.
      const version = S.reglages && S.reglages.version;
      if (this.versionPage && version && version !== this.versionPage) {
        location.reload();
        return;
      }
      if (version && !this.versionPage) {
        this.versionPage = version;
        this.verifierMaj();
        this.notesVersion.verifier(); // après une mise à jour : ses notes, une fois
      }
      this.majLangues();
      this.majTout();
      this.notifs.surEvenement(ev);
      this.console.surEvenement(ev);
      this.conso.maj();
      // Premier lancement : configuration guidée.
      if (!MAQUETTE && S.reglages && S.reglages.onboarding === false && !this.accueil.ouvert) this.accueil.ouvrir();
      return;
    }
    if (ev.type === 'notification' || ev.type === 'notification_resolue') this.notifs.surEvenement(ev);
    if (ev.type === 'alerte') {
      this.toast(ev.niveau || 'info', ev.texte || '');
    }
    if (ev.type !== 'outil' && ev.type !== 'activite' && ev.type !== 'message') {
      for (const id of S.etagesDe(ev)) {
        if (id === this.etageId) continue;
        const e = S.etage(id);
        if (!e) continue;
        this.clignote.etages.set(id, now);
        this.marquerAilleurs(e, now);
      }
    }
    if (S.estImportant(ev)) {
      const ids = S.etagesDe(ev);
      if (ids.length) {
        this.dernierImportant = ids[0];
        if (this.suivre && ids[0] !== this.etageId) this.allerEtage(ids[0]);
      }
    }
    switch (ev.type) {
      case 'message':
        this.majFil();
        break;
      case 'permission':
      case 'permission_resolue':
      case 'decision':
      case 'decision_resolue':
        this.majPermissions();
        break;
      case 'mcp':
        this.majReglageCout();
        this.majReglages();
        break;
      case 'etages':
        this.surEtages();
        this.parametres.maj();
        break;
      case 'service':
      case 'service_log':
        this.console.surEvenement(ev);
        if (ev.type === 'service' && this.onglet === 'fil') this.majFil();
        break;
      case 'commande':
        if (this.terminauxFlottants && this.terminauxFlottants.has(ev.tache)) this.majTerminalFlottant(ev.tache);
        if (this.onglet === 'fiche' && this.fiche === ev.tache && this.ficheOnglet === 'terminal') this.majFiche();
        break;
      case 'ordonnanceur':
        this.majPause();
        break;
      case 'dossier':
        if (ev.dossier && ev.dossier.archive) {
          this.retirerDossier(ev.dossier.id);
          this.parametres.listeArchives = null; // Réglages › Dossiers archivés relit la liste
          this.parametres.maj();
        } else {
          // ressorti depuis un autre onglet : Réglages › Dossiers archivés relit la liste
          if (this.parametres.listeArchives?.some((d) => d.id === ev.dossier?.id)) {
            this.parametres.listeArchives = null;
            this.parametres.maj();
          }
          this.majSaisie();
        }
        break;
      case 'dossier_supprime':
        this.retirerDossier(ev.dossier);
        break;
      case 'tache':
        if (ev.tache && this.store.decisionDe(ev.tache.id)) this.majPermissions();
        break;
      default:
    }
    if (ev.type !== 'activite' && ev.type !== 'service_log' && ev.type !== 'commande') {
      this.majImmeuble();
      this.majNav();
      if (this.onglet !== 'fil' && !(this.onglet === 'fiche' && ['terminal', 'code'].includes(this.ficheOnglet) && (ev.type === 'outil' || ev.type === 'modification'))) this.majPanneau();
    }
  }

  // Liste des étages changée à chaud (nouveau projet ajouté) : on garde l'étage affiché s'il existe encore.
  surEtages() {
    const S = this.store;
    const cour = S.etage(this.etageId);
    if (!cour) {
      const id = S.etage('hall') ? 'hall' : S.etages[0] && S.etages[0].id;
      this.etageId = null;
      if (id) this.allerEtage(id, { force: true });
    } else {
      const avant = this.dir.etage || {};
      if (avant.nom !== cour.nom || avant.type !== cour.type || avant.ordre !== cour.ordre) {
        this.moteur.changerEtage(() => this.dir.setEtage(this.etageId), 0);
      }
    }
    this.majImmeuble();
    this.majNav();
    this.majPanneau();
  }

  majTout() {
    const S = this.store;
    if (!this.etageId || !S.etage(this.etageId)) {
      let id = null;
      try {
        id = sessionStorage.getItem('qg-etage');
      } catch {
        id = null;
      }
      if (!S.etage(id)) {
        // En maquette, on ouvre sur la Direction pour voir le DG réfléchir puis afficher son plan.
        const pref = MAQUETTE ? ['direction', 'hall'] : ['hall', 'direction'];
        id = pref.find((x) => S.etage(x)) || (S.etages[0] && S.etages[0].id);
      }
      if (id) {
        this.etageId = id;
        this.moteur.changerEtage(() => this.dir.setEtage(id), 0);
      }
    } else {
      this.moteur.changerEtage(() => this.dir.setEtage(this.etageId), 0);
    }
    this.majComptes();
    this.majReglageCout();
    this.dictee.maj();
    this.cartes.forEach((el) => el.remove());
    this.cartes.clear();
    this.majSaisie();
    this.majNav();
    this.majImmeuble();
    this.majPermissions();
    this.majPause();
    this.majPanneau();
  }

  tic() {
    this.majPause();
    this.majNav();
    // Joy change d'étage : la vue globale suit
    const ej = etageJoy(this.store);
    if (ej !== this.joyVu) {
      this.joyVu = ej;
      this.majImmeuble();
      if (this.onglet === 'fiche' && this.fiche === 'joy') this.majFiche();
    }
    // fin du clignotement des lignes de l'immeuble
    const now = Date.now();
    let changer = false;
    for (const [id, t] of this.clignote.etages) {
      if (now - t > 5000) {
        this.clignote.etages.delete(id);
        changer = true;
      }
    }
    if (changer) this.majImmeuble();
  }
}
