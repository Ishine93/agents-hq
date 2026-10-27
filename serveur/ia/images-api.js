// Moteur A de la délégation d'images (docs/multi-ia/conception.md §7.2, décision D3) : API Images d'OpenAI,
// appelée par le serveur du QG avec fetch (aucune dépendance). La clé du compte reste dans le serveur : elle
// n'apparaît dans aucun événement, message, journal ni erreur (elle est masquée si l'API la renvoie).
// QG_OPENAI_BASE_URL remplace https://api.openai.com (tests : faux serveur HTTP local).
import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from '../config.js';

export const MODELE_GENERATION = 'gpt-image-2.5-flare';
export const MODELE_RETOUCHE = 'gpt-image-2.5-sunburst';
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export const FORMATS = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' };
const base = () => (process.env.QG_OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '');
const masquer = (s, cle) => (cle ? String(s).split(cle).join('***') : String(s)).slice(0, 400);

let tarifs = null;
export function chargerTarifs() {
  if (!tarifs) tarifs = JSON.parse(fs.readFileSync(path.join(RACINE, 'config', 'defauts', 'tarifs.json'), 'utf8'));
  return tarifs;
}

/**
 * Une image : POST /v1/images/generations, ou /v1/images/edits (multipart) avec des références.
 * @returns {Promise<{ octets: Buffer, usage: object|null, modele: string }>}
 * Erreur : message de l'API tel quel (modération : « moderation_blocked : … »), jamais la clé. Délai : 2 min.
 */
export async function genererParApi({ cle, description, taille = 'auto', qualite = 'auto', fondTransparent = false, references = [], format = 'png', signal = null, delaiMs = 120000 }) {
  const retouche = references.length > 0;
  const modele = retouche ? MODELE_RETOUCHE : MODELE_GENERATION;
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(new Error('délai dépassé (2 min)')), delaiMs);
  const surAbandon = () => ctrl.abort(new Error('interrompue'));
  signal?.addEventListener('abort', surAbandon, { once: true });
  try {
    const champs = { model: modele, prompt: description, n: 1, size: taille, quality: qualite, output_format: format, ...(fondTransparent ? { background: 'transparent' } : {}) };
    const entetes = { authorization: `Bearer ${cle}` };
    let corps;
    if (retouche) {
      corps = new FormData();
      for (const [k, v] of Object.entries(champs)) corps.append(k, String(v));
      for (const r of references) corps.append('image[]', new Blob([fs.readFileSync(r)], { type: TYPES[path.extname(r).toLowerCase()] || 'image/png' }), path.basename(r));
    } else {
      corps = JSON.stringify(champs);
      entetes['content-type'] = 'application/json';
    }
    const rep = await fetch(`${base()}/v1/images/${retouche ? 'edits' : 'generations'}`, { method: 'POST', headers: entetes, body: corps, signal: ctrl.signal });
    const json = await rep.json().catch(() => null);
    if (!rep.ok) {
      const e = json?.error || {};
      throw new Error(`${e.code || `HTTP ${rep.status}`}${e.message ? ` : ${e.message}` : ''}`);
    }
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("réponse de l'API sans image");
    return { octets: Buffer.from(b64, 'base64'), usage: json.usage || null, modele };
  } catch (e) {
    throw new Error(masquer(ctrl.signal.aborted ? ctrl.signal.reason?.message || 'interrompue' : e.message, cle));
  } finally {
    clearTimeout(minuterie);
    signal?.removeEventListener('abort', surAbandon);
  }
}

const arrondi = (x) => Math.round(x * 10000) / 10000;

/** Coût réel (dollars) d'après l'usage renvoyé par l'API et le tarif daté. */
export function coutUsage(usage, modele, t = chargerTarifs()) {
  const p = t.images[modele] || t.images[MODELE_GENERATION];
  const det = usage?.input_tokens_details || {};
  const entreeImage = det.image_tokens || 0;
  const entreeTexte = det.text_tokens ?? Math.max(0, (usage?.input_tokens || 0) - entreeImage);
  return arrondi((entreeTexte * p.entreeTexte + entreeImage * p.entreeImage + (usage?.output_tokens || 0) * p.sortieImage) / 1e6);
}

/** Coût estimé au pire avant l'appel (taille et qualité « auto » : le cas le plus cher). */
export function coutAuPire({ description = '', taille = 'auto', qualite = 'auto', references = [] }, t = chargerTarifs()) {
  const p = t.images[references.length ? MODELE_RETOUCHE : MODELE_GENERATION];
  const table = t.jetonsSortieAuPire[qualite === 'auto' ? 'high' : qualite] || t.jetonsSortieAuPire.high;
  const sortie = taille === 'auto' || !table[taille] ? Math.max(...Object.values(table)) : table[taille];
  const entreeImage = references.length * (t.jetonsEntreeParReference || 0);
  const entreeTexte = Math.ceil(String(description).length / 2);
  return arrondi((entreeTexte * p.entreeTexte + entreeImage * p.entreeImage + sortie * p.sortieImage) / 1e6);
}
