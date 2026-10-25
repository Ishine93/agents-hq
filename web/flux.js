// Client du serveur : flux SSE (GET /api/flux) et actions POST. En mode maquette (?mock), tout est simulé.
import { t } from './i18n.js';

export const MAQUETTE = new URLSearchParams(location.search).has('mock');

let maquette = null;

export async function demarrerFlux(surEvenement, surStatut) {
  if (MAQUETTE) {
    maquette = await import('./mock.js');
    surStatut('maquette');
    maquette.demarrer(surEvenement);
    return;
  }
  let es = null;
  let relance = null;
  const ouvrir = () => {
    clearTimeout(relance);
    es = new EventSource('/api/flux');
    es.onopen = () => surStatut('connecte');
    es.onmessage = (e) => {
      let ev;
      try {
        ev = JSON.parse(e.data);
      } catch (err) {
        console.warn('Événement illisible', err);
        return;
      }
      surEvenement(ev);
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        surStatut('deconnecte');
        relance = setTimeout(ouvrir, 3000);
      } else {
        surStatut('reconnexion');
      }
    };
  };
  ouvrir();
}

export async function envoyer(route, corps) {
  if (MAQUETTE) {
    if (!maquette) maquette = await import('./mock.js');
    return maquette.post(route, corps);
  }
  const opts = { method: 'POST', credentials: 'same-origin', headers: {} };
  if (corps !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(corps);
  }
  const r = await fetch(route, opts);
  let data = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  if (!r.ok) throw new Error((data && data.erreur) || t('Erreur HTTP {status}', { status: r.status }));
  return data;
}

// Lecture (GET) d'une ressource de l'API.
export async function recuperer(route) {
  if (MAQUETTE) {
    if (!maquette) maquette = await import('./mock.js');
    return maquette.get(route);
  }
  const r = await fetch(route, { credentials: 'same-origin' });
  let data = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  if (!r.ok) throw new Error((data && data.erreur) || t('Erreur HTTP {status}', { status: r.status }));
  return data;
}

// Corps binaire (dictée : audio/webm).
export async function envoyerBinaire(route, donnees, type) {
  if (MAQUETTE) {
    if (!maquette) maquette = await import('./mock.js');
    return maquette.postBinaire(route, donnees, type);
  }
  const r = await fetch(route, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': type }, body: donnees });
  let data = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  if (!r.ok) throw new Error((data && data.erreur) || t('Erreur HTTP {status}', { status: r.status }));
  return data;
}

export async function rejouerMaquette() {
  if (!maquette) maquette = await import('./mock.js');
  maquette.rejouer();
}
