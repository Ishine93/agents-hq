// Notifications : cloche (nombre d'actions en attente), menu avec boutons d'action, titre de l'onglet,
// petit son (Web Audio), notifications du navigateur via le service worker (boutons d'action).
import { MAQUETTE } from './flux.js';
import { carteDemandes, RISQUES } from './permis.js';
import { t as tr } from './i18n.js';

const TITRE = 'QG des agents';
const $ = (s) => document.querySelector(s);

// Table de correspondance du protocole (v1.2) : action d'une notification → appel.
export function routeAction(n, a) {
  if (!n || !a) return null;
  switch (n.type) {
    case 'permission':
      return { route: '/api/permissions/' + encodeURIComponent(n.id), corps: { decision: a === 'allow' || a === 'allow_session' ? a : 'deny' } };
    case 'decision':
      if (a === 'repondre') return { ouvrir: 'carte' };
      return { route: '/api/decisions/' + encodeURIComponent(n.id), corps: { choix: a } };
    case 'question':
      return { ouvrir: 'saisie' };
    case 'projet': {
      const dossier = n.projet || n.texte || '';
      if (a === 'ajouter') return { route: '/api/etages/ajouter', corps: { dossier } };
      if (a === 'ignorer') return { route: '/api/etages/ignorer', corps: { dossier } };
      return null;
    }
    case 'validation': {
      const tache = n.tache || String(n.id).replace(/^V-/, '');
      return { route: '/api/taches/' + encodeURIComponent(tache) + '/valider', corps: { decision: a === 'pass' ? 'pass' : 'fail' } };
    }
    default:
      return null;
  }
}

function h(tag, cls, ...enfants) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const c of enfants) if (c !== null && c !== undefined) e.append(c);
  return e;
}
const heure = (t) => {
  const d = new Date(t || Date.now());
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

let icone = null;
function iconeQG() {
  if (icone) return icone;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#15151f';
  g.fillRect(10, 4, 44, 58);
  g.fillStyle = '#2f6fde';
  g.fillRect(14, 8, 36, 50);
  g.fillStyle = '#ffe14d';
  for (let y = 12; y < 46; y += 10) for (let x = 18; x < 46; x += 10) g.fillRect(x, y, 6, 6);
  g.fillStyle = '#15151f';
  g.fillRect(28, 48, 8, 10);
  icone = c.toDataURL('image/png');
  return icone;
}

export class Notifs {
  constructor(store, ui) {
    this.store = store;
    this.ui = ui;
    this.reg = null;
    this.audio = null;
    this.ouvert = false;
    this.enCours = new Set();
  }

  init() {
    this.bouton = $('#btn-cloche');
    this.badge = $('#cloche-nombre');
    this.menu = $('#menu-notifs');
    this.bouton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.basculerMenu();
    });
    document.addEventListener('pointerdown', (e) => {
      if (this.ouvert && !this.menu.contains(e.target) && !this.bouton.contains(e.target)) this.basculerMenu(false);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.ouvert) this.basculerMenu(false);
    });
    // L'audio ne peut démarrer qu'après un geste de l'utilisateur.
    const debloquer = () => {
      try {
        if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
        if (this.audio.state === 'suspended') this.audio.resume();
      } catch {
        this.audio = null;
      }
    };
    window.addEventListener('pointerdown', debloquer, { once: true, capture: true });
    window.addEventListener('keydown', debloquer, { once: true, capture: true });
    // Le panneau navigateur de l'app Claude ne gère pas les service workers : on n'essaie même pas.
    const panneauClaude = / Claude\//.test(navigator.userAgent);
    if ('serviceWorker' in navigator && !panneauClaude && (location.protocol === 'http:' || location.protocol === 'https:')) {
      navigator.serviceWorker
        .register('sw.js', { scope: './' })
        .then((r) => (this.reg = r))
        .catch((e) => console.warn('Service worker indisponible :', e.message));
      navigator.serviceWorker.addEventListener('message', (e) => this.messageSw(e.data || {}));
    }
    document.addEventListener('visibilitychange', () => this.majCloche());
    this.majCloche();
  }

  permission() {
    return 'Notification' in window ? Notification.permission : 'unsupported';
  }

  async activer() {
    if (!('Notification' in window)) {
      this.ui.toast('warn', tr('Ce navigateur ne gère pas les notifications.'));
      return;
    }
    try {
      const p = await Notification.requestPermission();
      if (p === 'granted') this.ui.toast('info', tr('Notifications du navigateur activées.'));
      else this.ui.toast('warn', tr('Notifications refusées par le navigateur.'));
    } catch (e) {
      this.ui.toast('erreur', tr('Notifications : {erreur}', { erreur: e.message }));
    }
    this.rendreMenu();
    this.ui.majReglages();
  }

  basculerMenu(etat) {
    this.ouvert = etat === undefined ? !this.ouvert : etat;
    this.menu.hidden = !this.ouvert;
    this.bouton.setAttribute('aria-expanded', this.ouvert ? 'true' : 'false');
    if (this.ouvert) this.rendreMenu();
  }

  surEvenement(ev) {
    if (ev.type === 'etat') {
      this.majCloche();
      return;
    }
    if (ev.type === 'notification' && ev.notification) {
      const n = ev.notification;
      const actions = (n.actions || []).length > 0;
      if (actions) this.son();
      this.systeme(n);
      this.majCloche();
    } else if (ev.type === 'notification_resolue') {
      this.enCours.delete(ev.id);
      this.fermerSysteme(ev.id);
      this.majCloche();
    }
  }

  majCloche() {
    const n = this.store.notifications.size;
    this.badge.textContent = n ? String(n) : '';
    this.badge.hidden = !n;
    this.bouton.classList.toggle('attente', n > 0);
    this.bouton.title = n ? tr('{n} action(s) en attente', { n }) : tr('Notifications');
    document.title = (n ? '(' + n + ') ' : '') + tr(TITRE);
    if (this.ouvert) this.rendreMenu();
  }

  rendreMenu() {
    const S = this.store;
    const menu = this.menu;
    const perm = this.permission();
    const entete = h('div', 'notifs-entete', h('b', null, tr('Notifications')));
    if (perm === 'default') {
      const b = h('button', 'petit', tr('Activer les notifications'));
      b.type = 'button';
      b.title = tr('Affiche aussi les notifications du navigateur quand le QG n’est pas au premier plan');
      b.addEventListener('click', () => this.activer());
      entete.append(b);
    } else if (perm === 'denied') {
      entete.append(h('span', 'notifs-etat', tr('bloquées par le navigateur')));
    } else if (perm === 'granted') {
      entete.append(h('span', 'notifs-etat ok', tr('navigateur : activées')));
    }
    const enAttente = [...S.notifications.values()].sort((a, b) => (b.t || 0) - (a.t || 0));
    const infos = S.notifsRecentes.filter((n) => !(n.actions || []).length).slice(0, 8);
    const liste = h('div', 'notifs-liste');
    if (!enAttente.length && !infos.length) liste.append(h('div', 'vide', tr('Rien en attente.')));
    if (enAttente.length) liste.append(h('div', 'notifs-groupe', tr('En attente de toi')));
    for (const n of enAttente) liste.append(this.element(n));
    if (infos.length) liste.append(h('div', 'notifs-groupe', tr('Récentes')));
    for (const n of infos) liste.append(this.element(n));
    menu.replaceChildren(entete, liste);
  }

  element(n) {
    const S = this.store;
    // permission en attente : la même carte lisible que dans le site
    const perm = n.type === 'permission' ? S.permissions.get(n.id) : null;
    if (perm) {
      const item = h('div', 'notif type-permission');
      item.append(carteDemandes(S, [perm], {
        menu: true,
        ouverts: this.ui.detailsOuverts,
        voir: () => this.ouvrir(n),
        decider: async (ps, decision) => {
          await this.executer(n, decision);
          return !this.enCours.has(n.id) ? false : true;
        },
      }));
      if (this.enCours.has(n.id)) item.querySelectorAll('button').forEach((b) => (b.disabled = true));
      return item;
    }
    const e = S.etage(n.etage) || (n.tache && S.etage((S.taches.get(n.tache) || {}).etage));
    const corps = h('button', 'notif-corps',
      h('span', 'notif-titre', n.titre || ''),
      n.texte ? h('span', 'notif-texte', n.texte) : null,
      h('span', 'notif-meta', [e ? e.nom : null, n.dossier, heure(n.t)].filter(Boolean).join(' · ')));
    corps.type = 'button';
    corps.title = tr('Aller à l’étage et ouvrir');
    corps.addEventListener('click', () => this.ouvrir(n));
    const item = h('div', 'notif type-' + (n.type || 'info'), corps);
    const actions = n.actions || [];
    if (actions.length) {
      const boutons = h('div', 'notif-actions');
      for (const a of actions) {
        const b = h('button', 'petit ' + (a.id === 'allow' || a.id === 'pass' || a.id === 'ajouter' ? 'ok' : a.id === 'deny' || a.id === 'fail' ? 'danger' : a.id === 'allow_session' ? 'toujours' : ''), a.libelle || a.id);
        b.type = 'button';
        b.disabled = this.enCours.has(n.id);
        b.addEventListener('click', () => this.executer(n, a.id));
        boutons.append(b);
      }
      item.append(boutons);
    }
    return item;
  }

  async executer(n, a) {
    const r = routeAction(n, a);
    if (!r) return this.ouvrir(n);
    if (r.ouvrir) return this.ouvrir(n, r.ouvrir);
    this.enCours.add(n.id);
    this.rendreMenu();
    const ok = await this.ui.action(r.route, r.corps);
    if (!ok) this.enCours.delete(n.id);
    this.rendreMenu();
  }

  // Va à l'étage concerné et ouvre la carte, la saisie ou la fiche.
  ouvrir(n, quoi = null) {
    this.basculerMenu(false);
    const S = this.store;
    const etage = n.etage || (n.tache && (S.taches.get(n.tache) || {}).etage);
    if (etage && S.etage(etage)) this.ui.allerEtage(etage);
    if (n.type === 'decision') this.ui.montrerCarte('q-' + n.id, true);
    else if (n.type === 'permission') this.ui.montrerCarte('p-' + n.id, false);
    else if (n.type === 'question' || quoi === 'saisie') this.ui.modeReponse(n.dossier || String(n.id).replace(/^QD-/, ''));
    else if (n.type === 'validation') this.ui.selectionner(n.tache || String(n.id).replace(/^V-/, ''));
    else if (n.tache) this.ui.selectionner(n.tache);
    else if (n.dossier) this.ui.choisirOnglet('dossiers');
  }

  messageSw(m) {
    if (m.type === 'qg-action' && m.route) {
      this.ui.action(m.route, m.corps);
    } else if (m.type === 'qg-ouvrir') {
      const n = this.store.notifications.get(m.id) || this.store.notifsRecentes.find((x) => x.id === m.id);
      if (n) this.ouvrir(n, m.action === 'repondre' ? (n.type === 'decision' ? 'carte' : 'saisie') : null);
    }
  }

  son() {
    const ctx = this.audio;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    const note = (f, t, d) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + d + 0.02);
    };
    note(880, t0, 0.16);
    note(1318.5, t0 + 0.12, 0.22);
  }

  // Notification système : seulement si l'onglet n'est pas au premier plan (sinon la cloche suffit).
  async systeme(n) {
    if (this.permission() !== 'granted') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    const actions = {};
    const boutons = [];
    // Autoriser, Toujours pour cette tâche, Refuser (autant que le navigateur en affiche)
    const max = Math.max(2, (typeof Notification !== 'undefined' && Notification.maxActions) || 2);
    const ordre = { allow: 0, allow_session: 1, deny: 2 };
    const liste = [...(n.actions || [])].sort((a, b) => (ordre[a.id] ?? 9) - (ordre[b.id] ?? 9));
    for (const a of liste) {
      const r = routeAction(n, a.id);
      if (!r) continue;
      actions[a.id] = r;
      if (boutons.length < max) boutons.push({ action: a.id, title: a.libelle || a.id });
    }
    const data = { id: n.id, type: n.type, mock: MAQUETTE, actions, url: location.pathname + location.search };
    const perm = n.type === 'permission' ? this.store.permissions.get(n.id) : null;
    const risque = perm && RISQUES[perm.risque] ? ' — ' + tr(RISQUES[perm.risque].lib) : '';
    const opts = {
      body: (perm && perm.resume) || n.texte || '',
      tag: n.id,
      data,
      icon: iconeQG(),
      requireInteraction: boutons.length > 0,
      actions: boutons,
    };
    try {
      const reg = this.reg || (navigator.serviceWorker && (await navigator.serviceWorker.getRegistration()));
      if (reg && reg.showNotification) {
        await reg.showNotification((n.titre || tr(TITRE)) + risque + (perm && perm.horsProjet ? ' ' + tr('⚠ hors projet') : ''), opts);
      } else {
        const notif = new Notification(n.titre || tr(TITRE), { body: opts.body, tag: opts.tag, icon: opts.icon });
        notif.onclick = () => {
          window.focus();
          this.ouvrir(n);
          notif.close();
        };
      }
    } catch (e) {
      console.warn('Notification système impossible :', e.message);
    }
  }

  async fermerSysteme(id) {
    try {
      const reg = this.reg || (navigator.serviceWorker && (await navigator.serviceWorker.getRegistration()));
      if (!reg || !reg.getNotifications) return;
      for (const n of await reg.getNotifications({ tag: id })) n.close();
    } catch {
      /* rien */
    }
  }
}

