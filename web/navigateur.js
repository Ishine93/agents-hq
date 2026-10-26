// Navigateur du QG, dans une fenêtre flottante (déplaçable, redimensionnable ; réduite, le son continue).
// Deux modes, au choix dans sa barre :
// - Simple : les pages qui l'acceptent s'affichent dedans (vidéos et directs YouTube, Twitch, Kick par leur
//   lecteur officiel) ; les autres s'ouvrent dans une fenêtre de ton navigateur, avec ta session.
// - Complet : un vrai navigateur, tous les sites dedans (Google, Docs, Reddit, X…), recherche Google, avec
//   sa propre session (on s'y connecte une fois, c'est gardé). Dans la fenêtre application du QG, c'est un
//   <webview> ; dans un navigateur ordinaire (Brave, Chrome…), les pages tournent dans le moteur du QG et
//   s'affichent ici (nav-distant.js). Il faut le navigateur intégré (≈ 100 Mo, installé une fois).
import { h, api } from './modale.js';
import { t as tr } from './i18n.js';
import { Fenetre } from './fenetres.js';
import { NavDistant } from './nav-distant.js';

const CLE = 'qg.navigateur';
const CLE_MODE = 'qg.navigateur.mode';
const RACCOURCIS = [
  { nom: 'Google', url: 'https://www.google.com' },
  { nom: 'YouTube', url: 'https://www.youtube.com' },
  { nom: 'Twitch', url: 'https://www.twitch.tv' },
  { nom: 'Kick', url: 'https://kick.com' },
  { nom: 'Reddit', url: 'https://www.reddit.com' },
  { nom: 'X', url: 'https://x.com' },
];
// fenêtre application du QG (Electron) : le mode complet y est un <webview>
const dansApp = () => !!(window.qgApp && window.qgApp.navigateurComplet);

function lire(cle) {
  try {
    return localStorage.getItem(cle) || '';
  } catch {
    return '';
  }
}
function ecrire(cle, v) {
  try {
    localStorage.setItem(cle, v);
  } catch {
    /* navigation privée */
  }
}
function derniere() {
  const v = lire(CLE);
  // ancien format (JSON avec l'adresse et la taille de la fenêtre)
  if (v.startsWith('{')) {
    try {
      return JSON.parse(v).url || '';
    } catch {
      return '';
    }
  }
  return v;
}
const retenir = (url) => /^https?:/i.test(url || '') && ecrire(CLE, url);
// adresse tapée → URL (une recherche Google si ce n'est pas une adresse)
function normaliser(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(v)) return 'https://' + v;
  return 'https://www.google.com/search?q=' + encodeURIComponent(v);
}

export class Navigateur {
  constructor(ui) {
    this.ui = ui;
    this.historique = [];
    this.position = -1;
    this.vue = null; // <webview> (fenêtre application)
    this.distant = null; // moteur du QG (navigateur ordinaire)
    this.etatDistant = null;
    const m = lire(CLE_MODE);
    this.mode = m === 'simple' || m === 'complet' ? m : dansApp() ? 'complet' : 'simple';
    this.adresse = h('input', { class: 'nav-adresse', type: 'text', spellcheck: 'false', placeholder: tr('Adresse ou recherche Google'),
      on: { keydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); this.aller(this.adresse.value); } }, focus: () => this.adresse.select() } });
    this.bPrec = h('button', { class: 'fen-b', type: 'button', title: tr('Précédent'), on: { click: () => this.deplacer(-1) } }, '◀');
    this.bSuiv = h('button', { class: 'fen-b', type: 'button', title: tr('Suivant'), on: { click: () => this.deplacer(1) } }, '▶');
    this.bRecharger = h('button', { class: 'fen-b', type: 'button', title: tr('Recharger'), on: { click: () => this.recharger() } }, '⟳');
    this.bFenetre = h('button', { class: 'fen-b', type: 'button', title: tr('Ouvrir dans une fenêtre de ton navigateur, avec ta session'), on: { click: () => this.fenetreExterne() } }, '⧉');
    this.bChat = h('button', { class: 'fen-b', type: 'button', hidden: true, title: tr('Afficher le chat'), on: { click: () => this.basculerChat() } }, '💬');
    this.bSimple = h('button', { class: 'nav-mode', type: 'button', title: tr('Mode simple : vidéos et directs ici, les autres sites dans une fenêtre de ton navigateur (avec tes comptes)'), on: { click: () => this.choisirMode('simple') } }, tr('Simple'));
    this.bComplet = h('button', { class: 'nav-mode', type: 'button', title: tr('Mode complet : tous les sites ici (Google, Docs…), avec la session du QG (tu t’y connectes une fois)'), on: { click: () => this.choisirMode('complet') } }, tr('Complet'));
    this.barre = h('div', { class: 'nav-barre' }, this.bPrec, this.bSuiv, this.bRecharger, this.adresse, this.bChat, this.bFenetre, h('div', { class: 'nav-modes' }, this.bSimple, this.bComplet));
    this.raccourcis = h('div', { class: 'nav-raccourcis' }, RACCOURCIS.map((r) => h('button', { class: 'nav-raccourci', type: 'button', on: { click: () => this.aller(r.url, { fenetreSiRefus: true }) } }, r.nom)));
    this.onglets = h('div', { class: 'nav-onglets', hidden: true });
    this.bandeau = h('div', { class: 'nav-bandeau', hidden: true });
    this.cadre = h('div', { class: 'nav-cadre' });
    this.chat = h('div', { class: 'nav-chat', hidden: true });
    this.fen = new Fenetre({ cle: 'navigateur', titre: '🌐 ' + tr('Navigateur'), classe: 'fen-navigateur', largeur: 820, hauteur: 520, min: [380, 220], coin: 'bas-gauche', zoomable: false, surFermer: () => this.vider() });
    this.fen.corps.append(this.barre, this.raccourcis, this.onglets, this.bandeau, h('div', { class: 'nav-corps' }, this.cadre, this.chat));
    document.getElementById('btn-navigateur')?.addEventListener('click', () => this.basculer());
    document.addEventListener('visibilitychange', () => this.distant?.mesurer(true));
    this.majModes();
    this.accueil();
  }

  get flux() {
    return this.mode === 'complet' && !dansApp();
  }

  basculer() {
    if (this.fen.ouvert && !this.fen.el.classList.contains('reduite')) this.fen.fermer();
    else this.ouvrir();
  }

  ouvrir(url = null) {
    this.fen.ouvrir();
    this.majBandeau();
    if (url) this.aller(url);
    else if (this.position < 0 && !this.vue && !this.distant?.ws && derniere()) this.aller(derniere());
    else this.adresse.focus({ preventScroll: true });
  }

  // fermeture : on coupe tout (le son d'une vidéo s'arrête)
  vider() {
    this.arreterAffichage();
    this.accueil();
  }

  arreterAffichage() {
    this.cadre.replaceChildren();
    this.chat.replaceChildren();
    this.chat.hidden = true;
    this.bChat.hidden = true;
    this.vue = null;
    this.distant?.fermer(true);
    this.etatDistant = null;
    this.etatConnexion = null;
    this.onglets.hidden = true;
    this.actuel = null;
    this.position = -1;
    this.historique = [];
    this.fen.definirTitre('🌐 ' + tr('Navigateur'));
  }

  // ---------- les deux modes
  choisirMode(m) {
    if (m === this.mode) return;
    const url = normaliser(this.adresse.value) || derniere();
    this.arreterAffichage();
    this.mode = m;
    ecrire(CLE_MODE, m);
    this.majModes();
    this.majBandeau();
    if (url && this.fen.ouvert) this.aller(url);
    else this.accueil();
  }

  majModes() {
    this.bSimple.classList.toggle('actif', this.mode === 'simple');
    this.bComplet.classList.toggle('actif', this.mode === 'complet');
    this.bFenetre.hidden = this.mode === 'complet' || dansApp();
  }

  // Bandeau : installation du navigateur intégré, démarrage ou connexion perdue (mode complet hors app).
  majBandeau() {
    if (!this.flux) {
      this.bandeau.hidden = true;
      return;
    }
    const inst = this.ui.store.navigateurApp && this.ui.store.navigateurApp.installation;
    const c = this.etatConnexion;
    let contenu = null;
    if (inst && inst.etat === 'en_cours') contenu = [h('span', {}, '⏳ ' + inst.texte)];
    else if (c && c.etat === 'absent') {
      contenu = [
        h('span', {}, tr('Le mode complet a besoin du navigateur intégré du QG (≈ 100 Mo, installé une fois). Ta session y est propre au QG : tu te connectes une fois à tes sites, c’est gardé.')),
        h('button', { class: 'petit ok', type: 'button', on: { click: () => this.installer() } }, tr('Installer le navigateur intégré')),
        inst && inst.etat === 'erreur' ? h('span', { class: 'erreur' }, inst.texte) : null,
      ];
    } else if (c && c.etat === 'demarrage') contenu = [h('span', {}, '⏳ ' + tr('Démarrage du navigateur…'))];
    else if (c && (c.etat === 'perdue' || c.etat === 'erreur')) {
      contenu = [
        h('span', { class: 'erreur' }, c.etat === 'perdue' ? tr('Connexion au navigateur perdue.') : c.texte),
        h('button', { class: 'petit ok', type: 'button', on: { click: () => this.aller(this.adresse.value || derniere() || 'https://www.google.com') } }, tr('Reconnecter')),
      ];
    }
    this.bandeau.hidden = !contenu;
    if (contenu) this.bandeau.replaceChildren(...contenu.filter(Boolean));
  }

  async installer() {
    try {
      await api('/api/navigateur/app/installer', {});
    } catch (e) {
      this.ui.toast('erreur', e.message);
    }
  }

  surEvenement(ev) {
    if (ev.type === 'navigateur_app') {
      this.ui.store.navigateurApp = ev;
      if (ev.installation && ev.installation.etat === 'ok') {
        this.ui.toast('info', ev.installation.texte);
        // on attendait l'installation pour afficher la page : on y va
        if (this.flux && this.etatConnexion?.etat === 'absent' && this.fen.ouvert) this.aller(this.adresse.value || derniere() || 'https://www.google.com');
      }
      if (ev.installation && ev.installation.etat === 'erreur') this.ui.toast('erreur', ev.installation.texte);
      if (this.fen.ouvert) this.majBandeau();
    }
  }

  accueil() {
    this.cadre.replaceChildren(h('div', { class: 'nav-info' },
      h('h4', {}, tr('Navigateur du QG')),
      this.mode === 'complet'
        ? h('p', {}, tr('Mode complet : tape une adresse ou une recherche Google. Tous les sites s’affichent ici. Tu te connectes une fois à tes comptes (Google, Docs…) : c’est gardé d’un lancement à l’autre, dans une session propre au QG.'))
        : h('p', {}, tr('Mode simple : colle le lien d’une vidéo YouTube, d’une chaîne Twitch ou Kick, elle se joue ici, même fenêtre réduite. Les autres sites s’ouvrent dans une fenêtre de ton navigateur, avec tes comptes connectés. Pour tout afficher ici : mode Complet.'))));
    this.majBoutons();
  }

  // fenetreSiRefus : un raccourci vers un site qui refuse d'être intégré ouvre tout de suite sa fenêtre
  async aller(saisie, { historiser = true, fenetreSiRefus = false } = {}) {
    if (this.mode === 'complet') return dansApp() ? this.allerApp(saisie) : this.allerDistant(saisie);
    const s = String(saisie || '').trim();
    if (!s) return;
    let r;
    try {
      r = await api('/api/navigateur/ouvrir?url=' + encodeURIComponent(s));
    } catch (e) {
      this.ui.toast('erreur', e.message);
      return;
    }
    if (this.mode !== 'simple') return;
    if (historiser) {
      this.historique = this.historique.slice(0, this.position + 1);
      this.historique.push(r.url);
      this.position = this.historique.length - 1;
    }
    this.adresse.value = r.url;
    retenir(r.url);
    this.afficher(r);
    this.majBoutons();
    if (fenetreSiRefus && !r.integrable) this.fenetreExterne();
  }

  // ---- mode complet dans la fenêtre application : un <webview>, historique et adresse suivis en direct
  allerApp(saisie) {
    const url = normaliser(saisie);
    if (!url) return;
    retenir(url);
    if (!this.vue) {
      const v = document.createElement('webview');
      v.className = 'nav-vue';
      v.setAttribute('allowpopups', '');
      v.setAttribute('partition', 'persist:qg-navigateur');
      const suivre = (e) => {
        if (e.isMainFrame === false) return;
        this.adresse.value = e.url;
        retenir(e.url);
        this.majBoutons();
      };
      v.addEventListener('did-navigate', suivre);
      v.addEventListener('did-navigate-in-page', suivre);
      v.addEventListener('page-title-updated', (e) => this.fen.definirTitre('🌐 ' + e.title));
      v.addEventListener('did-fail-load', (e) => {
        if (e.isMainFrame && e.errorCode !== -3) this.ui.toast('erreur', tr('Page injoignable ({raison}).', { raison: e.errorDescription || e.errorCode }));
      });
      v.src = url;
      this.vue = v;
      this.cadre.replaceChildren(v);
    } else {
      this.vue.loadURL(url);
    }
    this.adresse.value = url;
  }

  // ---- mode complet dans un navigateur ordinaire : les pages tournent dans le moteur du QG
  allerDistant(saisie) {
    const url = normaliser(saisie);
    if (!url) return;
    retenir(url);
    this.adresse.value = url;
    if (!this.distant) {
      this.distant = new NavDistant({
        surEtat: (m) => this.surEtatDistant(m),
        surInfo: (etat, texte) => this.surInfoDistant(etat, texte),
        raccourci: (nom) => {
          if (nom === 'adresse') this.adresse.focus();
          else if (nom === 'recharger') this.recharger();
          else this.deplacer(nom === 'retour' ? -1 : 1);
        },
      });
    }
    if (this.distant.ws && this.distant.ws.readyState === 1) {
      this.distant.aller(url);
      return;
    }
    this.distant.attacher(this.cadre);
    this.distant.connecter(url);
  }

  surInfoDistant(etat, texte) {
    if (etat === 'page') {
      this.ui.toast('erreur', tr('Page injoignable ({raison}).', { raison: texte }));
      return;
    }
    this.etatConnexion = etat === 'pret' ? null : { etat, texte };
    if (etat === 'absent') this.accueil();
    this.majBandeau();
  }

  surEtatDistant(m) {
    this.etatDistant = m;
    const url = m.url === 'about:blank' ? '' : m.url;
    if (document.activeElement !== this.adresse) this.adresse.value = url;
    retenir(url);
    this.fen.definirTitre('🌐 ' + (m.titre || tr('Navigateur')));
    this.bRecharger.textContent = m.charge ? '✕' : '⟳';
    this.bRecharger.title = m.charge ? tr('Arrêter') : tr('Recharger');
    // fenêtres ouvertes par les sites (connexion Google…) : des onglets
    this.onglets.hidden = !(m.onglets && m.onglets.length > 1);
    if (!this.onglets.hidden) {
      this.onglets.replaceChildren(...m.onglets.map((o) => h('div', { class: 'nav-onglet' + (o.id === m.actif ? ' actif' : ''), on: { click: () => this.distant.envoyer({ t: 'onglet', id: o.id }) } },
        h('span', {}, o.titre || '…'),
        h('button', { class: 'nav-onglet-x', type: 'button', title: tr('Fermer'), on: { click: (e) => { e.stopPropagation(); this.distant.envoyer({ t: 'fermerOnglet', id: o.id }); } } }, '✕'))));
    }
    this.majBoutons();
  }

  afficher(r) {
    this.actuel = r;
    this.chat.replaceChildren();
    this.chat.hidden = true;
    this.bChat.hidden = !r.chat;
    if (r.integrable && r.affiche) {
      this.cadre.replaceChildren(h('iframe', { class: 'nav-iframe', src: r.affiche, allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin', title: r.site || r.url }));
      return;
    }
    let site = r.url;
    try {
      site = new URL(r.url).hostname.replace(/^www\./, '');
    } catch {
      /* adresse brute */
    }
    this.cadre.replaceChildren(h('div', { class: 'nav-info' },
      h('h4', {}, site),
      h('p', {}, r.erreur ? tr('Le site ne répond pas ({raison}).', { raison: r.erreur }) : tr('Ce site refuse de s’afficher à l’intérieur d’une autre page.')),
      h('p', {}, tr('Ouvre-le dans une fenêtre de ton navigateur habituel (tu y gardes tes comptes connectés), ou affiche-le ici en mode complet (session propre au QG : tu t’y connectes une fois).')),
      h('div', { class: 'nav-choix' },
        dansApp() ? null : h('button', { class: 'petit', type: 'button', on: { click: () => this.fenetreExterne() } }, tr('Ouvrir dans une fenêtre (avec ta session)')),
        h('button', { class: 'petit ok', type: 'button', on: { click: () => this.choisirMode('complet') } }, tr('Afficher ici (mode complet)')))));
  }

  basculerChat() {
    if (!this.actuel || !this.actuel.chat) return;
    if (this.chat.hidden) {
      this.chat.replaceChildren(h('iframe', { class: 'nav-iframe', src: this.actuel.chat, title: tr('Chat') }));
      this.chat.hidden = false;
    } else {
      this.chat.replaceChildren();
      this.chat.hidden = true;
    }
  }

  deplacer(sens) {
    if (this.vue) {
      if (sens < 0 && this.vue.canGoBack()) this.vue.goBack();
      if (sens > 0 && this.vue.canGoForward()) this.vue.goForward();
      return;
    }
    if (this.flux) return this.distant?.envoyer({ t: sens < 0 ? 'retour' : 'suivant' });
    const i = this.position + sens;
    if (i < 0 || i >= this.historique.length) return;
    this.position = i;
    this.aller(this.historique[i], { historiser: false });
  }

  recharger() {
    if (this.vue) this.vue.reload();
    else if (this.flux) this.distant?.envoyer({ t: this.etatDistant?.charge ? 'stop' : 'recharger' });
    else if (this.actuel) this.afficher(this.actuel);
  }

  async fenetreExterne() {
    const u = (this.actuel && this.actuel.url) || this.adresse.value;
    if (!String(u || '').trim()) return;
    try {
      await api('/api/navigateur/fenetre', { url: u });
    } catch (e) {
      this.ui.toast('erreur', e.message);
    }
  }

  majBoutons() {
    if (this.vue) {
      try {
        this.bPrec.disabled = !this.vue.canGoBack();
        this.bSuiv.disabled = !this.vue.canGoForward();
      } catch {
        /* vue pas encore prête */
      }
      return;
    }
    if (this.flux) {
      this.bPrec.disabled = !this.etatDistant?.retour;
      this.bSuiv.disabled = !this.etatDistant?.suivant;
      return;
    }
    this.bPrec.disabled = this.position <= 0;
    this.bSuiv.disabled = this.position < 0 || this.position >= this.historique.length - 1;
  }
}
