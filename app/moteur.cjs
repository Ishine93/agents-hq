// Moteur du navigateur « complet » quand le QG est affiché dans un navigateur ordinaire (Brave, Chrome,
// Edge, Firefox…), qui refuse d'afficher la plupart des sites dans une autre page : ici, les pages tournent
// hors écran (Electron), avec la même session que la fenêtre application (on s'y connecte une fois, c'est
// gardé) ; leurs images partent vers la fenêtre « Navigateur » du QG, et les clics et touches reviennent.
// Lancé par le serveur du QG : electron <app> --qg-moteur=PORT:CLÉ:PORT_DU_QG (127.0.0.1 seulement).
const { BrowserWindow } = require('electron');
const http = require('node:http');
const crypto = require('node:crypto');

const PARTITION = 'persist:qg-navigateur';
const IMAGES_PAR_SECONDE = 30;
const moteurs = new Map(); // port → Moteur
const charger = (wc, url) => wc.loadURL(url).catch(() => {}); // page interrompue ou injoignable : déjà signalé

function normaliser(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  if (/^(https?:|about:)/i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(v)) return 'https://' + v;
  return 'https://www.google.com/search?q=' + encodeURIComponent(v);
}

// ---------- WebSocket minimal (le site du QG s'y connecte directement)
function accepter(req, socket, surMessage, surFin) {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  let tampon = Buffer.alloc(0);
  let morceaux = [];
  socket.on('data', (d) => {
    tampon = Buffer.concat([tampon, d]);
    while (tampon.length >= 2) {
      const fin = tampon[0] & 0x80;
      const op = tampon[0] & 0x0f;
      const masque = tampon[1] & 0x80;
      let long = tampon[1] & 0x7f;
      let pos = 2;
      if (long === 126) {
        if (tampon.length < 4) return;
        long = tampon.readUInt16BE(2);
        pos = 4;
      } else if (long === 127) {
        if (tampon.length < 10) return;
        long = Number(tampon.readBigUInt64BE(2));
        pos = 10;
      }
      if (tampon.length < pos + (masque ? 4 : 0) + long) return;
      const cle = masque ? tampon.subarray(pos, pos + 4) : null;
      pos += masque ? 4 : 0;
      const donnees = Buffer.from(tampon.subarray(pos, pos + long));
      if (cle) for (let i = 0; i < donnees.length; i++) donnees[i] ^= cle[i % 4];
      tampon = tampon.subarray(pos + long);
      if (op === 8) return socket.end();
      if (op === 9) {
        envoyerTrame(socket, 0xa, donnees);
        continue;
      }
      if (op === 0 || op === 1 || op === 2) {
        morceaux.push(donnees);
        if (!fin) continue;
        const message = Buffer.concat(morceaux).toString('utf8');
        morceaux = [];
        try {
          surMessage(JSON.parse(message));
        } catch {
          /* message illisible : ignoré */
        }
      }
    }
  });
  socket.on('close', surFin);
  socket.on('error', () => socket.destroy());
}
function envoyerTrame(socket, op, donnees) {
  if (socket.destroyed) return;
  const n = donnees.length;
  const tete = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  if (n >= 126 && n < 65536) {
    tete[0] = 0x80 | op;
    tete[1] = 126;
    tete.writeUInt16BE(n, 2);
  } else if (n >= 65536) {
    tete[0] = 0x80 | op;
    tete[1] = 127;
    tete.writeBigUInt64BE(BigInt(n), 2);
  }
  socket.write(Buffer.concat([tete, donnees]));
}
const envoyerJson = (socket, objet) => envoyerTrame(socket, 1, Buffer.from(JSON.stringify(objet)));

class Moteur {
  constructor(port, cle, portQg) {
    this.port = port;
    this.cle = cle;
    this.portQg = portQg;
    this.clients = new Set();
    this.onglets = []; // { id, win, titre }
    this.actif = null;
    this.l = 1024;
    this.h = 640;
    this.dpr = 1;
    this.visible = true;
    this.image = null;
    this.minuterie = null;
    this.dernierEnvoi = 0;
    this.n = 0;
    this.echecsQg = 0;
    this.serveur = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/etat' && u.searchParams.get('cle') === this.cle) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, onglets: this.onglets.length }));
      }
      res.writeHead(404);
      res.end();
    });
    this.serveur.on('upgrade', (req, socket) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      const origine = req.headers.origin || '';
      if (u.pathname !== '/flux' || u.searchParams.get('cle') !== this.cle || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origine)) {
        socket.destroy();
        return;
      }
      this.clients.add(socket);
      this.visible = true; // nouvelle fenêtre du QG : elle dira si elle est cachée
      accepter(req, socket, (m) => this.message(m), () => {
        this.clients.delete(socket);
        this.peindre();
      });
      this.peindre();
      this.envoyerEtat();
    });
    this.serveur.listen(port, '127.0.0.1');
    // le QG s'est arrêté : le moteur s'arrête aussi (la fenêtre application, elle, reste ouverte)
    this.veille = setInterval(() => {
      http.get({ host: '127.0.0.1', port: this.portQg, path: '/', timeout: 4000 }, (r) => {
        r.resume();
        this.echecsQg = 0;
      }).on('error', () => {
        this.echecsQg += 1;
        if (this.echecsQg >= 2) this.arreter();
      });
    }, 15000);
  }

  get onglet() {
    return this.onglets.find((o) => o.id === this.actif) || this.onglets[0] || null;
  }

  // ---------- onglets : la page principale, plus les fenêtres ouvertes par les sites (connexion Google…)
  options() {
    return { show: false, width: this.l, height: this.h, backgroundColor: '#ffffff', webPreferences: { offscreen: { deviceScaleFactor: this.dpr }, partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } };
  }
  ajouterOnglet(win, url = null) {
    const o = { id: 'o' + ++this.n, win, titre: '' };
    const wc = win.webContents;
    wc.setFrameRate(IMAGES_PAR_SECONDE);
    wc.on('paint', (_e, _zone, image) => {
      if (o.id !== this.actif || image.isEmpty()) return; // première peinture, avant la page : rien à montrer
      this.image = image;
      this.programmer();
    });
    const maj = () => this.envoyerEtat();
    wc.on('did-navigate', maj);
    wc.on('did-navigate-in-page', maj);
    wc.on('did-start-loading', maj);
    wc.on('did-stop-loading', maj);
    wc.on('page-title-updated', (_e, titre) => {
      o.titre = titre;
      maj();
    });
    wc.on('cursor-changed', (_e, type) => {
      if (o.id === this.actif) for (const c of this.clients) envoyerJson(c, { t: 'curseur', c: type });
    });
    wc.on('did-fail-load', (_e, code, description, adresse, principal) => {
      if (principal && code !== -3) for (const c of this.clients) envoyerJson(c, { t: 'erreur', texte: description || String(code), url: adresse });
    });
    wc.on('render-process-gone', () => setTimeout(() => !wc.isDestroyed() && wc.reload(), 500));
    wc.setWindowOpenHandler(({ url: lien, disposition }) => {
      if (!/^https?:/i.test(lien)) return { action: 'deny' };
      // vraie fenêtre (connexion, paiement…) : un onglet de plus, qui garde le lien avec la page qui l'a ouverte
      if (disposition === 'new-window') return { action: 'allow', overrideBrowserWindowOptions: this.options() };
      charger(wc, lien);
      return { action: 'deny' };
    });
    wc.on('did-create-window', (fenetre) => {
      const nouvel = this.ajouterOnglet(fenetre);
      this.activer(nouvel.id);
    });
    win.on('closed', () => {
      this.onglets = this.onglets.filter((x) => x !== o);
      if (this.actif === o.id) this.actif = this.onglets.length ? this.onglets[this.onglets.length - 1].id : null;
      if (!this.onglets.length && !this.arrete) this.ajouterOnglet(new BrowserWindow(this.options()), 'about:blank');
      this.peindre();
      this.envoyerEtat();
    });
    this.onglets.push(o);
    if (!this.actif) this.actif = o.id;
    if (url) charger(wc, url);
    return o;
  }
  activer(id) {
    if (!this.onglets.some((o) => o.id === id)) return;
    this.actif = id;
    this.peindre();
    this.envoyerEtat();
  }

  // ---------- images : la dernière peinture de l'onglet affiché, 30 par seconde au plus
  peindre() {
    const actif = this.clients.size > 0 && this.visible;
    for (const o of this.onglets) {
      if (o.win.isDestroyed()) continue;
      const wc = o.win.webContents;
      if (actif && o.id === this.actif) {
        wc.startPainting();
        wc.invalidate();
      } else wc.stopPainting();
    }
  }
  programmer() {
    if (this.minuterie || !this.clients.size || !this.visible) return;
    const delai = Math.max(0, 1000 / IMAGES_PAR_SECONDE - (Date.now() - this.dernierEnvoi));
    this.minuterie = setTimeout(() => this.envoyerImage(), delai);
  }
  envoyerImage() {
    this.minuterie = null;
    const image = this.image;
    if (!image) return;
    // un client lent (onglet en arrière-plan) : on saute des images plutôt que d'en accumuler
    if ([...this.clients].every((c) => c.writableLength > 4e6)) {
      this.minuterie = setTimeout(() => this.envoyerImage(), 60);
      return;
    }
    this.image = null;
    const jpeg = image.toJPEG(80);
    if (!jpeg.length) return;
    for (const c of this.clients) if (c.writableLength <= 4e6) envoyerTrame(c, 2, jpeg);
    this.dernierEnvoi = Date.now();
  }

  envoyerEtat() {
    const o = this.onglet;
    if (!o) return;
    const wc = o.win.webContents;
    const h = wc.navigationHistory;
    const etat = {
      t: 'etat',
      url: wc.getURL(),
      titre: o.titre || wc.getTitle(),
      retour: h ? h.canGoBack() : wc.canGoBack(),
      suivant: h ? h.canGoForward() : wc.canGoForward(),
      charge: wc.isLoading(),
      onglets: this.onglets.map((x) => ({ id: x.id, titre: x.titre || x.win.webContents.getTitle() || x.win.webContents.getURL() })),
      actif: this.actif,
    };
    for (const c of this.clients) envoyerJson(c, etat);
  }

  // ---------- ce qui vient du QG
  message(m) {
    if (m.t === 'taille') {
      this.l = Math.max(200, Math.min(3840, Math.round(m.l) || 1024));
      this.h = Math.max(150, Math.min(2160, Math.round(m.h) || 640));
      // netteté : la page est rendue à la densité de l'écran du QG (fixée à la création des onglets)
      if (!this.onglets.length) this.dpr = Math.max(1, Math.min(3, Number(m.dpr) || 1));
      for (const o of this.onglets) o.win.setContentSize(this.l, this.h);
      if (!this.onglets.length) this.ajouterOnglet(new BrowserWindow(this.options()), m.url ? normaliser(m.url) : 'about:blank');
      else if (m.url && /^(about:blank)?$/.test(this.onglet.win.webContents.getURL())) {
        // fenêtre du navigateur rouverte dans le QG : on reprend la dernière page
        charger(this.onglet.win.webContents, normaliser(m.url));
      }
      this.peindre();
      return;
    }
    const o = this.onglet;
    if (!o) return;
    const wc = o.win.webContents;
    const h = wc.navigationHistory;
    switch (m.t) {
      case 'aller': {
        const u = normaliser(m.url);
        if (u) charger(wc, u);
        break;
      }
      case 'retour':
        if (h ? h.canGoBack() : wc.canGoBack()) h ? h.goBack() : wc.goBack();
        break;
      case 'suivant':
        if (h ? h.canGoForward() : wc.canGoForward()) h ? h.goForward() : wc.goForward();
        break;
      case 'recharger':
        wc.reload();
        break;
      case 'stop':
        wc.stop();
        break;
      case 'onglet':
        this.activer(m.id);
        break;
      case 'fermerOnglet': {
        const x = this.onglets.find((y) => y.id === m.id);
        if (x && this.onglets.length > 1) x.win.close();
        break;
      }
      case 'visible':
        this.visible = !!m.v;
        this.peindre();
        break;
      case 'fermer':
        // fenêtre du navigateur fermée dans le QG : plus de son, plus de fenêtres annexes (la session reste)
        for (const x of this.onglets.slice(1)) x.win.close();
        if (this.onglets[0]) charger(this.onglets[0].win.webContents, 'about:blank');
        break;
      case 'focus':
        wc.focus();
        break;
      case 'edition':
        if (['copy', 'paste', 'cut', 'selectAll', 'undo', 'redo'].includes(m.a)) wc[m.a]();
        break;
      case 'souris': {
        const base = { x: Math.round(m.x), y: Math.round(m.y), modifiers: m.m || [] };
        if (m.e === 'move') wc.sendInputEvent({ type: 'mouseMove', ...base });
        else if (m.e === 'down') {
          wc.focus();
          wc.sendInputEvent({ type: 'mouseDown', button: m.b || 'left', clickCount: m.n || 1, ...base });
        } else if (m.e === 'up') wc.sendInputEvent({ type: 'mouseUp', button: m.b || 'left', clickCount: m.n || 1, ...base });
        else if (m.e === 'wheel') wc.sendInputEvent({ type: 'mouseWheel', deltaX: m.dx || 0, deltaY: m.dy || 0, canScroll: true, ...base });
        else if (m.e === 'leave') wc.sendInputEvent({ type: 'mouseLeave', ...base });
        break;
      }
      case 'touche': {
        const mods = m.m || [];
        if (m.e === 'down') {
          wc.sendInputEvent({ type: 'keyDown', keyCode: m.code, modifiers: mods });
          if (m.texte) wc.sendInputEvent({ type: 'char', keyCode: m.texte, modifiers: mods });
        } else wc.sendInputEvent({ type: 'keyUp', keyCode: m.code, modifiers: mods });
        break;
      }
      case 'texte':
        if (m.s) wc.insertText(String(m.s));
        break;
      default:
    }
  }

  arreter() {
    if (this.arrete) return;
    this.arrete = true;
    clearInterval(this.veille);
    for (const c of this.clients) c.destroy();
    this.serveur.close();
    for (const o of this.onglets) if (!o.win.isDestroyed()) o.win.destroy();
    moteurs.delete(this.port);
    this.surArret?.();
  }
}

// port:clé:port du QG
function lireArgument(argv) {
  const a = argv.find((x) => x.startsWith('--qg-moteur='));
  if (!a) return null;
  const [port, cle, portQg] = a.slice('--qg-moteur='.length).split(':');
  if (!Number(port) || !cle || !Number(portQg)) return null;
  return { port: Number(port), cle, portQg: Number(portQg) };
}

function demarrerMoteur({ port, cle, portQg }, surArret) {
  if (moteurs.has(port)) return moteurs.get(port);
  const m = new Moteur(port, cle, portQg);
  m.surArret = surArret;
  moteurs.set(port, m);
  return m;
}

module.exports = { lireArgument, demarrerMoteur, moteursActifs: () => moteurs.size };
