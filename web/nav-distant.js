// Navigateur complet quand le QG est affiché dans un navigateur ordinaire (Brave, Chrome, Edge…) : la page
// tourne dans le moteur du QG (Electron, hors écran, app/moteur.cjs) ; on affiche ses images dans un
// <canvas> et on lui renvoie la souris et le clavier. Ses connexions (Google, Docs…) sont les siennes,
// gardées d'un lancement à l'autre ; le presse-papiers est celui de Windows (Ctrl+C / Ctrl+V marchent).
import { h, api } from './modale.js';

const SPECIALES = {
  Enter: ['Enter', '\r'], Backspace: ['Backspace'], Tab: ['Tab'], Escape: ['Escape'], Delete: ['Delete'], Insert: ['Insert'],
  ArrowLeft: ['Left'], ArrowRight: ['Right'], ArrowUp: ['Up'], ArrowDown: ['Down'], Home: ['Home'], End: ['End'],
  PageUp: ['PageUp'], PageDown: ['PageDown'], ' ': ['Space', ' '],
};
for (let i = 1; i <= 12; i++) SPECIALES['F' + i] = ['F' + i];
const EDITION = { c: 'copy', v: 'paste', x: 'cut', a: 'selectAll', z: 'undo', y: 'redo' };
const BOUTONS = ['left', 'middle', 'right'];

function modifs(e, sansAltGr = false) {
  const m = [];
  if (e.shiftKey) m.push('shift');
  if (!sansAltGr) {
    if (e.ctrlKey) m.push('control');
    if (e.altKey) m.push('alt');
  }
  if (e.metaKey) m.push('meta');
  if (e.buttons & 1) m.push('leftbuttondown');
  if (e.buttons & 2) m.push('rightbuttondown');
  if (e.buttons & 4) m.push('middlebuttondown');
  return m;
}

export class NavDistant {
  // surEtat(etat) : adresse, titre, retour/suivant, chargement, onglets ; surInfo(message, action?) : état
  // de la connexion (démarrage, installation à faire, perdue) ; raccourci(nom) : Ctrl+L, F5…
  constructor({ surEtat, surInfo, raccourci }) {
    this.surEtat = surEtat;
    this.surInfo = surInfo;
    this.raccourci = raccourci;
    this.ws = null;
    this.l = 0;
    this.h = 0;
    this.visible = true;
    this.enDecodage = false;
    this.prochaine = null;
    this.dernierClic = { t: 0, x: 0, y: 0, b: -1, n: 0 };
    this.canvas = h('canvas', { class: 'nav-flux' });
    // le clavier passe par une zone de saisie invisible : touches, mais aussi texte composé (dictée
    // Windows, clavier asiatique, emoji…) qui n'arrive pas en touches
    this.saisie = h('textarea', { class: 'nav-saisie', 'aria-label': 'clavier', autocomplete: 'off', spellcheck: 'false' });
    this.ctx = this.canvas.getContext('2d');
    this.brancherSouris();
    this.brancherClavier();
    this.obs = new ResizeObserver(() => this.mesurer());
  }

  // ---------- connexion
  async connecter(urlInitiale) {
    this.fermer(false);
    this.voulue = true;
    this.urlInitiale = urlInitiale;
    let r;
    try {
      r = await api('/api/navigateur/moteur');
      if (!r.port) {
        if (!r.installee) return this.surInfo('absent');
        this.surInfo('demarrage');
        r = await api('/api/navigateur/moteur', {});
      }
    } catch (e) {
      return this.surInfo('erreur', e.message);
    }
    if (!this.voulue) return;
    const ws = new WebSocket(`ws://127.0.0.1:${r.port}/flux?cle=${encodeURIComponent(r.cle)}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.surInfo('pret');
      this.l = 0;
      this.visible = true;
      this.mesurer(true);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return this.image(ev.data);
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.t === 'etat') this.surEtat(m);
      else if (m.t === 'curseur') this.canvas.style.cursor = m.c === 'none' ? 'none' : m.c || 'default';
      else if (m.t === 'erreur') this.surInfo('page', m.texte);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.voulue) this.surInfo('perdue');
    };
  }

  attacher(parent) {
    parent.replaceChildren(this.canvas, this.saisie);
    this.obs.disconnect();
    this.obs.observe(parent);
  }

  // fermer(true) : la fenêtre du navigateur se ferme, le moteur coupe le son (la session reste)
  fermer(couperSon = true) {
    this.voulue = false;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      if (couperSon && ws.readyState === 1) ws.send(JSON.stringify({ t: 'fermer' }));
      ws.close();
    }
  }

  envoyer(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  aller(url) {
    this.envoyer({ t: 'aller', url });
  }

  // fenêtre réduite, onglet du QG caché : plus d'images (le son continue)
  montrer(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.envoyer({ t: 'visible', v });
  }

  mesurer(force = false) {
    const p = this.canvas.parentElement;
    if (!p) return;
    const l = Math.round(p.clientWidth);
    const hauteur = Math.round(p.clientHeight);
    if (l < 60 || hauteur < 40) return this.montrer(false);
    this.montrer(!document.hidden);
    if (!force && l === this.l && hauteur === this.h) return;
    this.l = l;
    this.h = hauteur;
    clearTimeout(this.minuterieTaille);
    this.minuterieTaille = setTimeout(() => {
      if (!this.ws || this.ws.readyState !== 1) return; // à l'ouverture, on remesure
      this.envoyer({ t: 'taille', l, h: hauteur, dpr: window.devicePixelRatio || 1, url: this.urlInitiale || null });
      this.urlInitiale = null;
    }, force ? 0 : 120);
  }

  // ---------- images (JPEG) : on garde la plus récente, une seule en décodage à la fois
  image(donnees) {
    if (this.enDecodage) {
      this.prochaine = donnees;
      return;
    }
    this.enDecodage = true;
    createImageBitmap(new Blob([donnees], { type: 'image/jpeg' }))
      .then((bmp) => {
        if (this.canvas.width !== bmp.width || this.canvas.height !== bmp.height) {
          this.canvas.width = bmp.width;
          this.canvas.height = bmp.height;
        }
        this.ctx.drawImage(bmp, 0, 0);
        bmp.close();
      })
      .catch(() => {})
      .finally(() => {
        this.enDecodage = false;
        const suite = this.prochaine;
        this.prochaine = null;
        if (suite) this.image(suite);
      });
  }

  // ---------- souris
  position(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * (this.l || r.width)) / (r.width || 1), y: ((e.clientY - r.top) * (this.h || r.height)) / (r.height || 1) };
  }
  brancherSouris() {
    const c = this.canvas;
    let deplacement = null;
    c.addEventListener('pointerdown', (e) => {
      this.saisie.focus({ preventScroll: true });
      c.setPointerCapture(e.pointerId);
      const p = this.position(e);
      const d = this.dernierClic;
      const proche = Date.now() - d.t < 450 && d.b === e.button && Math.abs(d.x - p.x) < 5 && Math.abs(d.y - p.y) < 5;
      this.dernierClic = { t: Date.now(), x: p.x, y: p.y, b: e.button, n: proche ? Math.min(3, d.n + 1) : 1 };
      this.envoyer({ t: 'souris', e: 'down', ...p, b: BOUTONS[e.button] || 'left', n: this.dernierClic.n, m: modifs(e) });
      e.preventDefault();
    });
    c.addEventListener('pointerup', (e) => {
      this.envoyer({ t: 'souris', e: 'up', ...this.position(e), b: BOUTONS[e.button] || 'left', n: this.dernierClic.n, m: modifs(e) });
    });
    c.addEventListener('pointermove', (e) => {
      // au plus une position par image
      const premier = !deplacement;
      deplacement = { ...this.position(e), m: modifs(e) };
      if (premier) {
        requestAnimationFrame(() => {
          if (deplacement) this.envoyer({ t: 'souris', e: 'move', ...deplacement });
          deplacement = null;
        });
      }
    });
    c.addEventListener('pointerleave', (e) => {
      if (!e.buttons) this.envoyer({ t: 'souris', e: 'leave', ...this.position(e) });
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1;
      this.envoyer({ t: 'souris', e: 'wheel', ...this.position(e), dx: -e.deltaX * f, dy: -e.deltaY * f, m: modifs(e) });
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- clavier : les touches vont à la page, pas aux raccourcis du QG
  brancherClavier() {
    const c = this.saisie;
    c.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const altGr = !!(e.getModifierState && e.getModifierState('AltGraph'));
      const ctrl = (e.ctrlKey || e.metaKey) && !altGr;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (ctrl && !e.altKey) {
        if (k === 'l') return e.preventDefault(), this.raccourci('adresse');
        if (k === 'r') return e.preventDefault(), this.raccourci('recharger');
        if (EDITION[k]) {
          e.preventDefault();
          return this.envoyer({ t: 'edition', a: k === 'z' && e.shiftKey ? 'redo' : EDITION[k] });
        }
      }
      if (e.key === 'F5') return e.preventDefault(), this.raccourci('recharger');
      if (e.altKey && !altGr && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return e.preventDefault(), this.raccourci(e.key === 'ArrowLeft' ? 'retour' : 'suivant');
      const sp = SPECIALES[e.key];
      if (sp) {
        e.preventDefault();
        return this.envoyer({ t: 'touche', e: 'down', code: sp[0], texte: !ctrl && !e.altKey ? sp[1] : undefined, m: modifs(e) });
      }
      if (e.isComposing || e.keyCode === 229) return; // composition en cours : le texte arrive par « input »
      if (e.key.length !== 1) return; // Shift, Ctrl, touche morte (^ ¨ : le caractère composé arrive ensuite)…
      e.preventDefault();
      if (ctrl || (e.altKey && !altGr)) return this.envoyer({ t: 'touche', e: 'down', code: e.shiftKey ? e.key.toUpperCase() : k, m: modifs(e) });
      // caractère tapé (AltGr compris : @, €, ~…)
      this.envoyer({ t: 'touche', e: 'down', code: e.key, texte: e.key, m: modifs(e, altGr) });
    });
    c.addEventListener('keyup', (e) => {
      e.stopPropagation();
      const sp = SPECIALES[e.key];
      if (sp) return this.envoyer({ t: 'touche', e: 'up', code: sp[0], m: modifs(e) });
      if (e.key.length === 1) this.envoyer({ t: 'touche', e: 'up', code: e.key, m: modifs(e) });
    });
    // texte arrivé sans touche (dictée, composition, collage par menu) : inséré tel quel dans la page
    c.addEventListener('input', (e) => {
      if (e.isComposing) return;
      if (c.value) this.envoyer({ t: 'texte', s: c.value });
      c.value = '';
    });
    c.addEventListener('compositionend', () => {
      if (c.value) this.envoyer({ t: 'texte', s: c.value });
      c.value = '';
    });
  }
}
