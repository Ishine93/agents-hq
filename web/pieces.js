// Images jointes côté site : coller (Ctrl+V), glisser-déposer, bouton 📎 ; contrôle (10 images,
// 15 Mo chacune, png/jpg/webp/gif), conversion base64 et vignettes au-dessus de la saisie.
// Rendu des vignettes des messages et des cartes de question (clic = visionneuse).
import { t } from './i18n.js';

export const TYPES_OK = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_PIECES = 10;
export const MAX_OCTETS = 15 * 1024 * 1024;
const PAR_EXTENSION = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

function typeDe(f) {
  if (TYPES_OK.includes(f.type)) return f.type;
  const ext = String(f.name || '').split('.').pop().toLowerCase();
  return PAR_EXTENSION[ext] || f.type || '';
}

function lireDataUrl(f) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error(t('lecture impossible')));
    r.readAsDataURL(f);
  });
}

const tailleLisible = (o) => (o > 1024 * 1024 ? t('{n} Mo', { n: (o / 1024 / 1024).toFixed(1) }) : t('{n} Ko', { n: Math.max(1, Math.round(o / 1024)) }));

export class Jointes {
  constructor(conteneur, { surErreur, surChangement, surOuvrir } = {}) {
    this.conteneur = conteneur;
    this.liste = [];
    this.n = 0;
    this.surErreur = surErreur || (() => {});
    this.surChangement = surChangement || (() => {});
    this.surOuvrir = surOuvrir || (() => {});
  }

  async ajouter(fichiers) {
    const liste = [...(fichiers || [])];
    for (const f of liste) {
      if (this.liste.length >= MAX_PIECES) {
        this.surErreur(t('{n} images au plus par message.', { n: MAX_PIECES }));
        break;
      }
      const type = typeDe(f);
      if (!TYPES_OK.includes(type)) {
        this.surErreur(t('« {nom} » n’est pas une image png, jpg, webp ou gif.', { nom: f.name || t('fichier') }));
        continue;
      }
      if (f.size > MAX_OCTETS) {
        this.surErreur(t('« {nom} » pèse {taille} : 15 Mo au plus.', { nom: f.name || t('image'), taille: tailleLisible(f.size) }));
        continue;
      }
      let url;
      try {
        url = await lireDataUrl(f);
      } catch (e) {
        this.surErreur(t('Lecture impossible : {erreur}', { erreur: e.message }));
        continue;
      }
      const ext = type.split('/')[1].replace('jpeg', 'jpg');
      const nom = f.name && f.name !== 'image.png' ? f.name : 'collage-' + new Date().toISOString().slice(11, 19).replace(/:/g, '') + '.' + ext;
      this.liste.push({ id: 'j' + ++this.n, nom, type, taille: f.size, url, base64: url.replace(/^data:[^,]*,/, '') });
    }
    this.rendre();
  }

  retirer(id) {
    this.liste = this.liste.filter((p) => p.id !== id);
    this.rendre();
  }

  vider() {
    this.liste = [];
    this.rendre();
  }

  pourEnvoi() {
    return this.liste.map((p) => ({ nom: p.nom, type: p.type, base64: p.base64 }));
  }

  rendre() {
    const box = this.conteneur;
    box.replaceChildren();
    box.hidden = !this.liste.length;
    this.liste.forEach((p, i) => {
      const fig = document.createElement('div');
      fig.className = 'jointe';
      fig.title = p.nom + ' — ' + tailleLisible(p.taille);
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = p.nom;
      img.addEventListener('click', () => this.surOuvrir(this.liste.map((x) => ({ url: x.url, nom: x.nom, origine: 'toi' })), i));
      const x = document.createElement('button');
      x.className = 'retirer';
      x.type = 'button';
      x.title = t('Retirer cette image');
      x.setAttribute('aria-label', t('Retirer {nom}', { nom: p.nom }));
      x.textContent = '×';
      x.addEventListener('click', () => this.retirer(p.id));
      fig.append(img, x);
      box.appendChild(fig);
    });
    this.surChangement(this.liste.length);
  }
}

// Images d'un presse-papiers ou d'un glisser-déposer.
export function fichiersImages(transfert) {
  if (!transfert) return [];
  const res = [];
  if (transfert.items && transfert.items.length) {
    for (const it of transfert.items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) res.push(f);
      }
    }
  }
  if (!res.length && transfert.files) res.push(...transfert.files);
  return res;
}

// Vignettes cliquables pour une liste de pièces ({url, nom, legende, origine}).
export function vignettes(pieces, ouvrir, classe = '') {
  const box = document.createElement('div');
  box.className = 'vignettes ' + classe;
  (pieces || []).forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vignette ' + (p.origine === 'agent' ? 'de-agent' : 'de-toi');
    b.title = [p.legende, p.nom].filter(Boolean).join(' — ') || t('Image');
    const img = document.createElement('img');
    img.src = p.url;
    img.alt = p.legende || p.nom || t('image');
    img.loading = 'lazy';
    img.addEventListener('error', () => b.classList.add('cassee'));
    b.appendChild(img);
    if (p.origine === 'agent') {
      const badge = document.createElement('span');
      badge.className = 'origine';
      badge.textContent = /capture/i.test(p.nom || '') ? t('capture') : t('agent');
      b.appendChild(badge);
    }
    b.addEventListener('click', () => ouvrir(pieces, i));
    box.appendChild(b);
  });
  return box;
}
