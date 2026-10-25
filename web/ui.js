// Interface HTML par-dessus le canvas : barre du bas, vue globale, panneau latéral, cartes de permission,
// bandeau de pause, alertes. Tout texte venant du serveur passe par textContent (jamais innerHTML).
import { envoyer, MAQUETTE, rejouerMaquette } from './flux.js';
import { libelleEtat, libelleDossier, TERMINAUX, DOSSIER_ACTIF } from './etat.js';
import { modele } from './sprites.js';
import { Jointes, fichiersImages, vignettes } from './pieces.js';
import { Visionneuse } from './visionneuse.js';
import { Notifs } from './notifs.js';
import { Dictee } from './dictee.js';
import { ConsoleService, rendreTerminal, libelleService } from './consoles.js';
import { PlanDossier } from './plan.js';
import { carteDemandes, grouperPermissions, clePermissions } from './permis.js';
import { etageJoy } from './scenes.js';
import { md } from './markdown.js';
import { Lecteur } from './lecteur.js';
import { Conso } from './conso.js';
import { Parametres } from './parametres.js';
import { Accueil } from './accueil.js';
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
  web: '#3fd36b', python: '#ffd23f', projet: '#7fa7d9',
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
    this.dgChoix = null;
    this.decouvertes = new Set();
    this.mcpEnCours = new Map();
    this.brouillons = new Map(); // texte en cours de saisie dans les cartes de question
    this.cartes = new Map(); // cle -> élément (cartes de permission et de question)
    this.ficheOnglet = 'infos';
    this.sortiesOuvertes = new Set();
    this.historiqueFiches = []; // fiches précédentes (navigation par les références)
    this.detailsOuverts = new Set(); // replis « Détails techniques » ouverts
    this.clePerm = new Map(); // id de permission -> clé de sa carte (pile)
    this.joyVu = null;
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
    $('#btn-urgence').addEventListener('click', () => this.urgence());
    $('#btn-reprendre').addEventListener('click', () => this.action('/api/reprendre'));
    $('#btn-recentrer').addEventListener('click', () => this.moteur.recentrer());
    this.visionneuse = new Visionneuse();
    this.console = new ConsoleService(this.store, this);
    this.plan = new PlanDossier(this.store, this);
    this.lecteur = new Lecteur(this.store);
    this.conso = new Conso(this.store, this);
    this.parametres = new Parametres(this.store, this);
    this.accueil = new Accueil(this.store, this);
    traduireStatique();
    $('#btn-reglages').addEventListener('click', () => this.parametres.ouvrir());
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
    const choixDg = () => {
      this.dgChoix = { modele: $('#dg-modele').value, effort: $('#dg-effort').value };
      this.majReglageDg();
    };
    $('#dg-modele').addEventListener('change', choixDg);
    $('#dg-effort').addEventListener('change', choixDg);
    $('#mode-annuler').addEventListener('click', () => this.annulerMode());
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
      if (av.type === 'tableau') {
        this.plan.ouvrir(av.dossier);
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
      if (!marques.childNodes.length) marques.appendChild(h('span', { class: 'mq gris', title: tr('inactif') }));
      const recent = now - (this.clignote.etages.get(e.id) || 0) < 5000;
      const ligne = h('button', {
        class: 'etage' + (e.id === this.etageId ? ' courant' : '') + (recent ? ' agite' : ''),
        title: tr('Aller à {etage}', { etage: e.nom }),
        on: { click: () => this.allerEtage(e.id) },
      },
      h('span', { class: 'ordre', style: { background: COUL_TYPE[e.type] || '#888' } }, libOrdre(e.ordre)),
      h('span', { class: 'nom' }, e.nom),
      m.dg ? h('span', { class: 'dg', title: tr('le DG est ici') }, tr('DG')) : null,
      etageJoy(S, now) === e.id ? h('span', { class: 'joy', title: tr('Joy, le happiness manager, est ici') }, '😊') : null,
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
  }

  // La page se recharge : enseignes du décor, journal et fenêtres déjà construites passent tous dans la nouvelle langue.
  changerLangue(l) {
    if (l === langueCourante()) return;
    definirLangue(l);
    $('#choix-langue').value = l;
    location.reload();
  }

  // ---------- documents ----------
  ouvrirDocuments() {
    const S = this.store;
    const e = S.etage(this.etageId);
    const cible = e && e.projet ? e : S.etages.find((x) => x.projet && x.actif && x.id !== 'direction') || S.etage('direction');
    if (!cible) return this.toast('info', tr('Aucun étage avec un projet.'));
    this.lecteur.documents(cible.id);
  }

  ouvrirFichier(chemin, etage = null) {
    this.lecteur.dernierEtage = etage || this.lecteur.dernierEtage;
    this.lecteur.ouvrir(chemin, etage);
  }

  // ---------- comptes ----------
  // Menu déroulant : le compte qui reçoit la prochaine demande, et « Ajouter un Claude… ».
  majComptes() {
    const S = this.store;
    const box = $('#comptes');
    if (!this.compte || !S.comptes.some((c) => c.id === this.compte && c.connecte)) {
      const def = S.comptes.find((c) => c.id === S.compteDefaut && c.connecte) || S.comptes.find((c) => c.connecte);
      this.compte = def ? def.id : S.compteDefaut;
    }
    const sel = h('select', { class: 'choix-compte', 'aria-label': tr('Compte Claude de la prochaine demande') },
      S.comptes.map((c) => h('option', { value: c.id, selected: c.id === this.compte ? true : null }, c.nom + (c.connecte ? '' : ' — ' + tr('non connecté')))),
      h('option', { value: '__ajouter' }, '＋ ' + tr('Ajouter un Claude…')),
      h('option', { value: '__gerer' }, '⚙ ' + tr('Gérer les comptes…')));
    const choisi = S.comptes.find((c) => c.id === this.compte);
    sel.title = choisi ? tr('Envoyer avec {nom}', { nom: choisi.nom }) : tr('Aucun compte connecté');
    sel.classList.toggle('off', !(choisi && choisi.connecte));
    sel.addEventListener('change', async () => {
      const v = sel.value;
      if (v === '__ajouter') {
        sel.value = this.compte || '';
        const nom = window.prompt(tr('Nom du nouveau compte (ex. « Claude pro ») :'), tr('Claude {n}', { n: S.comptes.length + 1 }));
        if (nom === null) return;
        try {
          await api('/api/comptes/ajouter', { nom });
          this.toast('info', tr('Compte ajouté : une fenêtre de connexion s’est ouverte, connecte-toi dans ton navigateur.'));
        } catch (e) {
          this.toast('erreur', e.message);
        }
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
      this.majReglageDg();
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

  // Mode de la saisie : nouvelle demande, réponse à une question du DG, complément d'un dossier.
  calculerMode() {
    const S = this.store;
    let m = this.mode;
    if (m && m.dossier && !S.dossiers.has(m.dossier)) m = this.mode = null;
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
    $('#saisie').focus();
  }

  modeCompleter(dossierId) {
    if (!dossierId || !this.store.dossiers.has(dossierId)) return;
    this.mode = { type: 'completer', dossier: dossierId };
    this.majSaisie();
    $('#saisie').focus();
  }

  annulerMode() {
    const m = this.modeEffectif;
    if (m && m.type === 'repondre' && m.auto) this.mode = { type: 'nouveau', ignore: m.dossier };
    else this.mode = null;
    this.majSaisie();
  }

  majSaisie() {
    const S = this.store;
    const m = (this.modeEffectif = this.calculerMode());
    const s = $('#saisie');
    s.placeholder = m && m.type === 'repondre' ? tr('Répondre au DG…') : m && m.type === 'completer' ? tr('Compléter le dossier {dossier}…', { dossier: m.dossier }) : tr('Écrire au DG…');
    s.title = tr('Entrée pour envoyer, Maj+Entrée pour aller à la ligne. Ctrl+V ou glisser-déposer pour joindre des images.');
    const puce = $('#mode-saisie');
    if (m) {
      puce.hidden = false;
      puce.className = 'puce-mode mode-' + m.type;
      $('#mode-texte').textContent = m.type === 'repondre' ? tr('Répondre au DG ({dossier})', { dossier: m.dossier }) : tr('Compléter {dossier}', { dossier: m.dossier });
      $('#mode-annuler').title = m.type === 'repondre' ? tr('Écrire une nouvelle demande à la place') : tr('Revenir à une nouvelle demande');
    } else puce.hidden = true;
    const q = $('#question-dg');
    const d = m && m.type === 'repondre' ? S.dossiers.get(m.dossier) : null;
    if (d && d.question) {
      q.hidden = false;
      remplir(q, h('b', {}, tr('Le DG demande ({dossier}) :', { dossier: d.id }) + ' '), d.question);
    } else q.hidden = true;
    document.body.classList.toggle('clarification', !!(m && m.type === 'repondre'));
    document.body.classList.toggle('complement', !!(m && m.type === 'completer'));
    $('#au-dessus').hidden = puce.hidden && q.hidden && !(this.jointes && this.jointes.liste.length);
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
        const corps = { texte, etageAffiche: this.etageId, compte: this.compte };
        const dg = this.reglageDg();
        if (dg) corps.dg = dg;
        await envoyer('/api/dossiers', avecPieces(corps));
      }
      s.value = '';
      this.jointes.vider();
      if (m && m.type === 'completer') this.mode = null;
      this.ajusterSaisie();
      this.majSaisie();
    } catch (e) {
      this.toast('erreur', tr('Envoi impossible : {erreur}', { erreur: e.message }));
    } finally {
      this.envoiEnCours = false;
      $('#btn-envoyer').disabled = false;
    }
  }

  // ---------- réglage du DG par demande ----------
  reglageDg() {
    const liste = this.store.modeles[this.compte] || [];
    if (!liste.length) return null;
    const m = $('#dg-modele').value;
    const e = $('#dg-effort').value;
    return m ? { modele: m, effort: e || null } : null;
  }

  majReglageDg() {
    const S = this.store;
    const box = $('#reglage-dg');
    const liste = S.modeles[this.compte] || [];
    box.hidden = !liste.length;
    if (!liste.length) return;
    const def = S.dgDefaut || {};
    const voulu = this.dgChoix || def;
    const mod = liste.find((x) => x.id === voulu.modele) || liste.find((x) => x.id === def.modele) || liste[0];
    const efforts = mod.efforts || [];
    const eff = efforts.includes(voulu.effort) ? voulu.effort : efforts.includes(def.effort) ? def.effort : efforts.includes('high') ? 'high' : efforts[efforts.length - 1];
    const selM = $('#dg-modele');
    const selE = $('#dg-effort');
    selM.replaceChildren(...liste.map((x) => h('option', { value: x.id }, x.nom || x.id)));
    selM.value = mod.id;
    selE.replaceChildren(...efforts.map((x) => h('option', { value: x }, x)));
    selE.value = eff || '';
    const parDefaut = mod.id === def.modele && eff === def.effort;
    box.classList.toggle('modifie', !parDefaut);
    const varsDg = { modele: mod.nom || mod.id, effort: eff };
    box.title = parDefaut ? tr('DG de la prochaine demande : {modele} · {effort} (par défaut)', varsDg) : tr('DG de la prochaine demande : {modele} · {effort} (réglé pour cette demande)', varsDg);
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
        h('div', { class: 'msg de-' + m.de },
          h('div', { class: 'entete' },
            h('span', { class: 'auteur' }, { toi: tr('Toi'), dg: tr('DG'), systeme: tr('Système') }[m.de] || m.de),
            m.dossier ? h('span', { class: 'ref' }, m.dossier) : null,
            h('span', { class: 'heure' }, heure(m.t))),
          md(m.texte || '', { classe: 'texte', fichier: (c) => this.ouvrirFichier(c, (m.etages || []).find((x) => x !== 'hall') || null) }),
          m.pieces && m.pieces.length ? vignettes(m.pieces, (p, i) => this.visionneuse.ouvrir(p, i)) : null)),
    );
    if (enBas) box.scrollTop = box.scrollHeight;
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
          d.dg && d.dg.modele ? ' — ' + tr('DG : {modele}', { modele: S.nomModele(d.dg.modele, d.compte) }) + (d.dg.effort ? ' · ' + d.dg.effort : '') : ''),
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
          actif ? h('button', { class: 'petit danger', on: { click: () => this.action('/api/dossiers/' + encodeURIComponent(d.id) + '/annuler', undefined, tr('Annuler le dossier {dossier} et toutes ses tâches ?', { dossier: d.id })) } }, tr('Annuler le dossier')) : null));
    }));
  }

  majJournal() {
    if (this.onglet !== 'journal') return;
    const S = this.store;
    const box = $('#vue-journal');
    const enBas = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const liste = S.journal.slice(-250);
    remplir(box, ...(liste.length ? liste.map((j) =>
      h('div', { class: 'jl j-' + j.type },
        h('span', { class: 'heure' }, heure(j.t, true)),
        h('span', { class: 'texte' }, j.texte))) : [h('div', { class: 'vide' }, tr('Journal vide.'))]));
    if (enBas) box.scrollTop = box.scrollHeight;
  }

  voirTache(id, opts = {}) {
    const t = this.store.taches.get(id);
    if (t && t.etage !== this.etageId) this.allerEtage(t.etage);
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
    if (id === 'dg') return tr('le DG');
    if (id === 'joy') return 'Joy';
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

  // Bloc « Réflexion en direct » : dernier extrait en entier + les 8 précédents.
  blocPensees(cible, actif = true) {
    const S = this.store;
    const p = S.pensees.get(cible);
    // la phase (« rédige son rapport »…) n'a de sens que pendant le travail
    const recent = actif && p && Date.now() - (p.t || 0) < 120000 ? p : null;
    const hist = (S.historiquePensees.get(cible) || []).slice();
    if (!recent && !hist.length) return null;
    let phase = '';
    if (recent) {
      phase = PHASES[recent.phase] ? tr(PHASES[recent.phase]) : recent.phase || '';
      if (recent.phase === 'outil' && recent.outil) phase += ' (' + recent.outil + ')';
      if (recent.taille) phase += ' · ' + tr('{n} car.', { n: fmtN(recent.taille) });
      if (recent.verificateur) phase = tr('vérificateur : {phase}', { phase });
    }
    const extrait = recent && recent.extrait ? recent.extrait : hist.length ? hist[hist.length - 1].extrait : '';
    const anciens = hist.filter((x) => x.extrait !== extrait).slice(-8).reverse();
    return h('div', { class: 'bloc pensees' },
      h('h4', {}, actif ? tr('Réflexion en direct') : tr('Dernières réflexions'), recent ? h('span', { class: 'phase' }, ' — ' + phase + ' · ' + heure(recent.t, true)) : null),
      extrait ? h('p', { class: 'pensee-extrait' }, extrait) : null,
      anciens.length ? h('ul', { class: 'pensees-hist' }, anciens.map((x) => h('li', {}, h('span', { class: 'heure' }, x.t ? heure(x.t, true) : ''), ' ', x.extrait))) : null);
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
        this.toast('info', tr('Récolte terminée : Joy a de quoi faire rire l’équipe.'));
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
        h('span', { class: 'ref joy-badge', style: { background: '#ffd23f' } }, '😊 Joy'),
        h('span', { class: 'titre' }, 'Happiness manager')),
      h('p', { class: 'meta' }, tr('Joy fait le tour des étages pour remonter le moral de ceux qui attendent : une blague, une anecdote, un mot gentil. Jamais quand quelqu’un lève la main.')),
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
      remplir(box,
        this.boutonRetour(),
        h('h3', {}, tr('Le DG')),
        h('dl', {},
          h('dt', {}, tr('État')), h('dd', {}, dg.etat === 'reflechit' ? tr('réfléchit') : tr('libre')),
          h('dt', {}, tr('Action')), h('dd', {}, { plan: tr('affiche son plan'), delta: tr('modifie le plan'), synthese: tr('synthèse'), question: tr('question pour toi') }[dg.action] || '—'),
          h('dt', {}, tr('Étage')), h('dd', {}, S.etage(dg.etage)?.nom || dg.etage || '—'),
          h('dt', {}, tr('Dossier')), h('dd', {}, d ? d.id + ' — ' + (d.titre || d.texte || '') : '—')),
        d && S.plans.has(d.id) ? h('div', { class: 'boutons' }, h('button', { class: 'petit', on: { click: () => this.plan.ouvrir(d.id) } }, tr('Voir le plan'))) : null,
        this.blocPensees('dg', dg.etat === 'reflechit'),
      );
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
      h('button', { class: this.ficheOnglet === 'terminal' ? 'actif' : '', role: 'tab', on: { click: () => { this.ficheOnglet = 'terminal'; this.majFiche(); } } }, tr('Terminal') + (nbCmd ? ' (' + nbCmd + ')' : '') + (enCoursCmd ? ' ⏳' : '')));
    if (this.ficheOnglet === 'terminal') {
      const term = $('#terminal-agent') || h('div', { id: 'terminal-agent', class: 'terminal' });
      const nomT = S.nom(t);
      const entete = h('div', { class: 'fiche-entete', style: { borderColor: modele(t.modele).c } },
        h('span', { class: 'ref', style: { background: modele(t.modele).c } }, nomT),
        h('span', { class: 'titre' }, (nomT !== t.ref ? '— ' + t.ref + ' · ' : '') + (t.titre || '')));
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
    remplir(box,
      this.boutonRetour(),
      h('div', { class: 'fiche-entete', style: { borderColor: M.c } },
        h('span', { class: 'ref', style: { background: M.c } }, nomT),
        h('span', { class: 'titre' }, (nomT !== t.ref ? '— ' + t.ref + ' · ' : '') + (t.titre || ''))),
      sousOnglets,
      h('div', { class: 'meta' }, (S.etage(t.etage)?.nom || t.etage) + ' — ' + tr('dossier {dossier}', { dossier: t.dossier }) + (t.nature ? ' — ' + t.nature : '')),
      h('dl', {},
        h('dt', {}, tr('État')), h('dd', {}, h('span', { class: 'badge t-' + t.etat }, libelleEtat(t.etat)), depuis ? ' ' + tr('depuis {heure}', { heure: heure(depuis.t, true) }) : ''),
        h('dt', {}, tr('Demandé')), h('dd', {}, M.nom + ' · ' + (t.effort || '?')),
        h('dt', {}, tr('Réel')), h('dd', {}, t.modeleReel || t.effortReel ? (t.modeleReel || '?') + ' · ' + (t.effortReel || '?') : '—'),
        t.attend && t.attend.length ? [h('dt', {}, tr('Attend')), h('dd', { class: 'refs' }, this.listeRefs(t.dossier, t.attend))] : null,
        t.inputsFrom && t.inputsFrom.length ? [h('dt', {}, tr('Reçoit de')), h('dd', { class: 'refs' }, this.listeRefs(t.dossier, t.inputsFrom))] : null,
        donne.length ? [h('dt', {}, tr('Donne à')), h('dd', { class: 'refs' }, this.listeRefs(t.dossier, donne))] : null,
        t.motifFile ? [h('dt', {}, tr('File')), h('dd', {}, t.motifFile)] : null,
        h('dt', {}, tr('Vérification')), h('dd', {}, t.verif ? t.verif.mode + (t.verif.modele ? ' (' + t.verif.modele + ')' : '') + (v && v.verdict ? ' — ' + tr('dernier verdict : {verdict}', { verdict: v.verdict }) : '') : '—'),
        h('dt', {}, tr('Tentative')), h('dd', {}, String(t.tentative || 1)),
        dos && dos.dg && dos.dg.modele ? [h('dt', {}, tr('DG du dossier')), h('dd', {}, S.nomModele(dos.dg.modele, dos.compte) + (dos.dg.effort ? ' · ' + dos.dg.effort : ''))] : null,
        t.agent ? [h('dt', {}, tr('Agent')), h('dd', {},
          h('button', { class: 'lien', on: { click: () => this.ouvrirFicheDepuis('ag:' + t.agent) } }, agent && agent.prenom ? agent.prenom + ' (' + t.agent + ')' : t.agent),
          t.reembauche ? (agent && agent.cloneDe ? ' — ' + tr('clone de {nom}', { nom: (orig && orig.prenom) || agent.cloneDe }) : ' — ' + tr('réembauché')) : ' — ' + tr('nouvelle recrue'),
          agent ? ' · ' + tr('{n} mission(s)', { n: agent.missions || 0 }) : '')] : null),
      agent ? this.jaugeContexte(agent) : null,
      this.blocPensees(t.id, ['running', 'rework', 'verifying'].includes(t.etat)),
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

  // ---------- réserve d'agents ----------
  jaugeContexte(a) {
    const c = Math.max(0, a.contexte || 0);
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
        complet && a.depuis ? [h('dt', {}, tr('Depuis')), h('dd', {}, heure(a.depuis, true))] : null),
      a.specialite ? h('p', { class: 'specialite' }, a.specialite) : null,
      a.fichiers && a.fichiers.length ? h('div', { class: 'bloc' }, h('h4', {}, tr('Fichiers connus')), h('ul', { class: 'fichiers' }, a.fichiers.map((f) => h('li', {}, h('code', {}, f))))) : null,
      this.jaugeContexte(a),
      h('div', { class: 'boutons' },
        tache ? h('button', { class: 'petit', on: { click: () => (complet ? this.ouvrirFicheDepuis(tache.id) : this.voirTache(tache.id)) } }, tr('Voir {ref}', { ref: tache.ref })) : null,
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
            if (a.etage !== this.etageId) this.allerEtage(a.etage);
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

  carteDecision(q) {
    const S = this.store;
    const t = S.taches.get(q.tache);
    const occupe = { v: false };
    const avecOptions = !!(q.options && q.options.length);
    const champ = h('textarea', {
      class: 'q-reponse',
      rows: '2',
      maxlength: '4000',
      placeholder: avecOptions ? tr('Précision (facultative)…') : tr('Ta réponse…'),
      'aria-label': tr('Réponse à la question'),
    });
    champ.value = this.brouillons.get(q.id) || '';
    const boutons = [];
    const repondre = async (choix) => {
      if (occupe.v) return;
      const texte = champ.value.trim();
      if (!choix && !texte) {
        champ.focus();
        this.toast('warn', avecOptions ? tr('Choisis une option ou écris une réponse.') : tr('Écris ta réponse.'));
        return;
      }
      occupe.v = true;
      boutons.forEach((b) => (b.disabled = true));
      const corps = {};
      if (choix) corps.choix = choix;
      if (texte) corps.texte = texte;
      const ok = await this.action('/api/decisions/' + encodeURIComponent(q.id), corps);
      if (ok) this.brouillons.delete(q.id);
      else {
        occupe.v = false;
        boutons.forEach((b) => (b.disabled = false));
      }
    };
    champ.addEventListener('input', () => this.brouillons.set(q.id, champ.value));
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        repondre(null);
      }
    });
    const imagesOptions = (q.options || []).filter((o) => o.image).map((o) => ({ ...o.image, legende: o.image.legende || o.libelle }));
    const options = (q.options || []).map((o) => {
      const b = h('button', { class: 'option' + (o.image ? ' illustree' : ''), type: 'button', title: tr('Choisir : {option}', { option: o.libelle || o.id }) },
        o.image ? h('img', { src: o.image.url, alt: '' }) : null,
        h('span', {}, o.libelle || o.id));
      b.addEventListener('click', () => repondre(o.id));
      boutons.push(b);
      if (!o.image) return b;
      const loupe = h('button', { class: 'loupe', type: 'button', title: tr('Voir en grand'), 'aria-label': tr('Voir l’image : {option}', { option: o.libelle || o.id }) }, '⤢');
      loupe.addEventListener('click', (e) => {
        e.stopPropagation();
        this.visionneuse.ouvrir(imagesOptions, Math.max(0, imagesOptions.findIndex((x) => x.url === o.image.url)));
      });
      return h('div', { class: 'option-boite' }, b, loupe);
    });
    const bRep = h('button', { class: 'ok', type: 'button', title: tr('Envoyer la réponse libre (Ctrl+Entrée)') }, tr('Répondre'));
    bRep.addEventListener('click', () => repondre(null));
    boutons.push(bRep);
    return h('div', { class: 'carte-perm carte-question' },
      h('div', { class: 'perm-haut' },
        h('span', { class: 'perm-outil q' }, tr('Question')),
        t ? h('button', { class: 'lien', on: { click: () => this.voirTache(t.id) } }, (S.nom(t) !== t.ref ? S.nom(t) + ' · ' : '') + t.ref + ' · ' + (S.etage(t.etage)?.nom || t.etage)) : null,
        h('span', { class: 'heure' }, heure(q.t))),
      h('div', { class: 'q-texte' }, q.question || ''),
      q.images && q.images.length ? vignettes(q.images, (p, i) => this.visionneuse.ouvrir(p, i), 'q-images') : null,
      options.length ? h('div', { class: 'q-options' + (imagesOptions.length ? ' avec-images' : '') }, options) : null,
      h('div', { class: 'q-libre' }, champ, bRep));
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
    for (const k of [...this.brouillons.keys()]) if (!S.decisions.has(k)) this.brouillons.delete(k);
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
    b.hidden = !p;
    document.body.classList.toggle('en-pause', !!p);
    if (!p) return;
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
    // pensées : jusqu'à une par seconde et par agent ; seule la fiche concernée se met à jour
    if (ev.type === 'pensee') {
      if (this.onglet === 'fiche' && this.ficheOnglet === 'infos' && this.fiche === ev.cible && !this.pointeurDansPanneau) this.majFiche();
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
    if (ev.type === 'comptes') {
      this.majComptes();
      this.majReglageDg();
      this.conso.majBouton();
      this.parametres.maj();
      this.accueil.maj();
      return;
    }
    if (ev.type === 'reglages') {
      this.majLangues();
      this.parametres.maj();
      return;
    }
    if (ev.type === 'personnalisation') {
      this.dir.looks.clear();
      return;
    }
    this.plan.surEvenement(ev);
    if (ev.type === 'etat') {
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
        this.majReglageDg();
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
        if (this.onglet === 'fiche' && this.fiche === ev.tache && this.ficheOnglet === 'terminal') this.majFiche();
        break;
      case 'ordonnanceur':
        this.majPause();
        break;
      case 'dossier':
        this.majSaisie();
        break;
      case 'tache':
        if (ev.tache && this.store.decisionDe(ev.tache.id)) this.majPermissions();
        break;
      default:
    }
    if (ev.type !== 'activite' && ev.type !== 'service_log' && ev.type !== 'commande') {
      this.majImmeuble();
      this.majNav();
      if (this.onglet !== 'fil' && !(this.onglet === 'fiche' && this.ficheOnglet === 'terminal' && ev.type === 'outil')) this.majPanneau();
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
    this.majReglageDg();
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
