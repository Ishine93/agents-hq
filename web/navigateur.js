// Navigateur du QG, dans une fenêtre flottante (déplaçable, redimensionnable, zoomable ; réduite, le son
// continue). Dans la fenêtre application du QG, c'est un vrai navigateur : tous les sites s'affichent
// (Google, Reddit, X, YouTube…), avec une session gardée (on s'y connecte une fois). Dans un navigateur
// ordinaire, seules les pages qui l'acceptent s'affichent dedans (vidéos et directs YouTube, Twitch, Kick
// par leur lecteur officiel) ; les autres s'ouvrent dans une fenêtre de ton navigateur, avec ta session.
import { h, api } from './modale.js';
import { t as tr } from './i18n.js';
import { Fenetre } from './fenetres.js';

const CLE = 'qg.navigateur';
const RACCOURCIS = [
  { nom: 'Google', url: 'https://www.google.com' },
  { nom: 'YouTube', url: 'https://www.youtube.com' },
  { nom: 'Twitch', url: 'https://www.twitch.tv' },
  { nom: 'Kick', url: 'https://kick.com' },
  { nom: 'Reddit', url: 'https://www.reddit.com' },
  { nom: 'X', url: 'https://x.com' },
];
const complet = () => !!(window.qgApp && window.qgApp.navigateurComplet);

function derniere() {
  try {
    const v = localStorage.getItem(CLE) || '';
    // ancien format (JSON avec l'adresse et la taille de la fenêtre)
    if (v.startsWith('{')) return JSON.parse(v).url || '';
    return v;
  } catch {
    return '';
  }
}
function retenir(url) {
  try {
    localStorage.setItem(CLE, url);
  } catch {
    /* navigation privée */
  }
}
// adresse tapée → URL (une recherche si ce n'est pas une adresse)
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
    this.adresse = h('input', { class: 'nav-adresse', type: 'text', spellcheck: 'false', placeholder: tr('Adresse ou recherche'),
      on: { keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); this.aller(this.adresse.value); } }, focus: () => this.adresse.select() } });
    this.bPrec = h('button', { class: 'fen-b', type: 'button', title: tr('Précédent'), on: { click: () => this.deplacer(-1) } }, '◀');
    this.bSuiv = h('button', { class: 'fen-b', type: 'button', title: tr('Suivant'), on: { click: () => this.deplacer(1) } }, '▶');
    const bRecharger = h('button', { class: 'fen-b', type: 'button', title: tr('Recharger'), on: { click: () => this.recharger() } }, '⟳');
    this.bFenetre = h('button', { class: 'fen-b', type: 'button', title: tr('Ouvrir dans une fenêtre de ton navigateur, avec ta session'), on: { click: () => this.fenetreExterne() } }, '⧉');
    this.bChat = h('button', { class: 'fen-b', type: 'button', hidden: true, title: tr('Afficher le chat'), on: { click: () => this.basculerChat() } }, '💬');
    this.barre = h('div', { class: 'nav-barre' }, this.bPrec, this.bSuiv, bRecharger, this.adresse, this.bChat, this.bFenetre);
    this.raccourcis = h('div', { class: 'nav-raccourcis' }, RACCOURCIS.map((r) => h('button', { class: 'nav-raccourci', type: 'button', on: { click: () => this.aller(r.url, { fenetreSiRefus: true }) } }, r.nom)));
    this.bandeau = h('div', { class: 'nav-bandeau', hidden: true });
    this.cadre = h('div', { class: 'nav-cadre' });
    this.chat = h('div', { class: 'nav-chat', hidden: true });
    this.fen = new Fenetre({ cle: 'navigateur', titre: '🌐 ' + tr('Navigateur'), classe: 'fen-navigateur', largeur: 820, hauteur: 520, min: [380, 220], coin: 'bas-gauche', zoomable: false, surFermer: () => this.vider() });
    this.fen.corps.append(this.barre, this.raccourcis, this.bandeau, h('div', { class: 'nav-corps' }, this.cadre, this.chat));
    document.getElementById('btn-navigateur')?.addEventListener('click', () => this.basculer());
    this.accueil();
  }

  basculer() {
    if (this.fen.ouvert && !this.fen.el.classList.contains('reduite')) this.fen.fermer();
    else this.ouvrir();
  }

  ouvrir(url = null) {
    this.fen.ouvrir();
    this.majBandeau();
    if (url) this.aller(url);
    else if (this.position < 0 && derniere()) this.aller(derniere());
    else this.adresse.focus({ preventScroll: true });
  }

  // fermeture : on coupe tout (le son d'une vidéo s'arrête)
  vider() {
    this.cadre.replaceChildren();
    this.chat.replaceChildren();
    this.chat.hidden = true;
    this.vue = null;
    this.position = -1;
    this.historique = [];
    this.accueil();
  }

  // Bandeau : dans un navigateur ordinaire, proposer le navigateur complet (fenêtre application du QG).
  majBandeau() {
    const R = this.ui.store.reglages || {};
    if (complet()) {
      this.bandeau.hidden = true;
      this.bFenetre.hidden = true;
      return;
    }
    const inst = this.ui.store.navigateurApp && this.ui.store.navigateurApp.installation;
    this.bandeau.hidden = false;
    if (inst && inst.etat === 'en_cours') {
      this.bandeau.replaceChildren(h('span', {}, '⏳ ' + inst.texte));
      return;
    }
    this.bandeau.replaceChildren(
      h('span', {}, R.navigateurApp
        ? tr('Pour afficher tous les sites ici (Google, Reddit, X…), ouvre le QG dans sa fenêtre application.')
        : tr('Ici, seules les vidéos et les pages qui l’acceptent s’affichent. Pour TOUS les sites (Google, Reddit, X…), installe le navigateur complet (≈ 100 Mo, une fois).')),
      R.navigateurApp
        ? h('button', { class: 'petit ok', type: 'button', on: { click: () => this.ouvrirApp() } }, tr('Ouvrir le QG en application'))
        : h('button', { class: 'petit ok', type: 'button', on: { click: () => this.installer() } }, tr('Installer le navigateur complet')),
      inst && inst.etat === 'erreur' ? h('span', { class: 'erreur' }, inst.texte) : null);
  }

  async installer() {
    try {
      await api('/api/navigateur/app/installer', {});
    } catch (e) {
      this.ui.toast('erreur', e.message);
    }
  }

  async ouvrirApp() {
    try {
      await api('/api/navigateur/app/ouvrir', {});
      this.ui.toast('info', tr('Le QG s’ouvre dans sa fenêtre application. Tu peux fermer cet onglet.'));
    } catch (e) {
      this.ui.toast('erreur', e.message);
    }
  }

  surEvenement(ev) {
    if (ev.type === 'navigateur_app') {
      this.ui.store.navigateurApp = ev;
      if (ev.installation && ev.installation.etat === 'ok') this.ui.toast('info', ev.installation.texte);
      if (ev.installation && ev.installation.etat === 'erreur') this.ui.toast('erreur', ev.installation.texte);
      if (this.fen.ouvert) this.majBandeau();
    } else if (ev.type === 'reglages' && this.fen.ouvert) this.majBandeau();
  }

  accueil() {
    this.cadre.replaceChildren(h('div', { class: 'nav-info' },
      h('h4', {}, tr('Navigateur du QG')),
      complet()
        ? h('p', {}, tr('Tape une adresse ou une recherche. Tous les sites s’affichent ici ; tes connexions sont gardées d’un lancement à l’autre.'))
        : h('p', {}, tr('Colle le lien d’une vidéo YouTube, d’une chaîne Twitch ou Kick : elle se joue ici, même fenêtre réduite. Les autres sites s’ouvrent dans une fenêtre de ton navigateur, avec tes comptes connectés.'))));
    this.majBoutons();
  }

  // fenetreSiRefus : un raccourci vers un site qui refuse d'être intégré ouvre tout de suite sa fenêtre
  async aller(saisie, { historiser = true, fenetreSiRefus = false } = {}) {
    if (complet()) return this.allerComplet(saisie);
    const s = String(saisie || '').trim();
    if (!s) return;
    let r;
    try {
      r = await api('/api/navigateur/ouvrir?url=' + encodeURIComponent(s));
    } catch (e) {
      this.ui.toast('erreur', e.message);
      return;
    }
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

  // ---- fenêtre application : un <webview>, vrai navigateur, historique et adresse suivis en direct
  allerComplet(saisie) {
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
      h('p', {}, tr('Ouvre-le dans une fenêtre de ton navigateur habituel (tu y gardes tes comptes connectés), ou installe le navigateur complet pour l’avoir ici.')),
      h('button', { class: 'petit ok', type: 'button', on: { click: () => this.fenetreExterne() } }, tr('Ouvrir dans une fenêtre (avec ta session)'))));
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
    const i = this.position + sens;
    if (i < 0 || i >= this.historique.length) return;
    this.position = i;
    this.aller(this.historique[i], { historiser: false });
  }

  recharger() {
    if (this.vue) this.vue.reload();
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
    this.bPrec.disabled = this.position <= 0;
    this.bSuiv.disabled = this.position < 0 || this.position >= this.historique.length - 1;
  }
}
