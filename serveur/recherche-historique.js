// Recherche dans tout l'historique (1.0.8) : tous les dossiers, archivés compris, et ceux trop anciens pour la liste.
// On cherche dans la demande, le titre, la question et la synthèse du DG, les tâches (titre, résumé) et tout le fil
// de messages du dossier (relu dans son journal events.jsonl, gardé en mémoire tant que le fichier ne change pas).
// Tous les mots doivent y être ; accents et majuscules ne comptent pas (« ecran » trouve « Écran »).
import fs from 'node:fs';
import path from 'node:path';
import { etat, DOSSIERS_DIR, publicDossier, dansLaListe } from './bus.js';

const MAX_DOSSIERS = 40;
const MAX_EXTRAITS = 3;
const AUTOUR = 70; // caractères gardés avant et après le mot trouvé

// Même longueur que le texte d'origine (un caractère pour un) : une position trouvée dans le texte plié vaut aussi
// dans le texte d'origine, pour l'extrait.
function plier(s) {
  let r = '';
  for (let i = 0; i < s.length; i++) r += (s[i].normalize('NFD')[0] || s[i]).toLowerCase()[0] || s[i];
  return r;
}

const caches = new Map(); // dossier → { taille, date, messages }
function messagesDe(id) {
  const f = path.join(DOSSIERS_DIR, id, 'events.jsonl');
  let st;
  try {
    st = fs.statSync(f);
  } catch {
    return [];
  }
  const c = caches.get(id);
  if (c && c.taille === st.size && c.date === st.mtimeMs) return c.messages;
  const messages = [];
  try {
    for (const ligne of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!ligne.includes('"type":"message"')) continue;
      try {
        const m = JSON.parse(ligne).message;
        if (m && typeof m.texte === 'string' && m.texte.trim()) messages.push({ de: m.de, texte: m.texte, t: m.t, plie: plier(m.texte) });
      } catch {
        /* ligne abîmée */
      }
    }
  } catch {
    return [];
  }
  caches.set(id, { taille: st.size, date: st.mtimeMs, messages });
  return messages;
}

function extrait(texte, plie, mots) {
  const i = Math.max(0, Math.min(...mots.map((m) => plie.indexOf(m)).filter((x) => x >= 0)));
  const debut = Math.max(0, i - AUTOUR);
  const fin = Math.min(texte.length, i + AUTOUR * 2);
  return (debut > 0 ? '…' : '') + texte.slice(debut, fin).replace(/\s+/g, ' ').trim() + (fin < texte.length ? '…' : '');
}

/**
 * Dossiers où se trouvent tous les mots de `q`, les plus pertinents d'abord (titre et demande avant le fil),
 * puis les plus récents. Chacun avec jusqu'à 3 extraits : { quoi: 'demande'|'tache'|'message'…, de, texte }.
 */
export function rechercher(q) {
  const mots = [...new Set(plier(String(q || '')).split(/\s+/).filter((m) => m.length >= 2))].slice(0, 8);
  if (!mots.length) return { mots: [], resultats: [], total: 0 };
  const tout = (plie) => mots.every((m) => plie.includes(m));
  const resultats = [];
  for (const d of etat.dossiers.values()) {
    if (d.supprimeLe) continue;
    const morceaux = [
      { quoi: 'titre', texte: d.titre || '', poids: 5 },
      { quoi: 'demande', texte: d.texte || '', poids: 4 },
      { quoi: 'question', texte: d.question || '', poids: 3 },
      { quoi: 'synthese', texte: d.synthese || '', poids: 3 },
    ];
    for (const t of etat.taches.values()) {
      if (t.dossier !== d.id) continue;
      morceaux.push({ quoi: 'tache', de: t.ref, texte: [t.titre, t.resultat?.summary].filter(Boolean).join(' — '), poids: 2 });
    }
    for (const m of messagesDe(d.id)) morceaux.push({ quoi: 'message', de: m.de, texte: m.texte, plie: m.plie, poids: 1 });
    // tous les mots dans le dossier (pas forcément au même endroit), puis les morceaux qui en contiennent
    const plies = morceaux.map((x) => ({ ...x, plie: x.plie || plier(x.texte) }));
    const ensemble = plies.map((x) => x.plie).join('\n');
    if (!tout(ensemble)) continue;
    // un même texte une seule fois (ta demande est aussi ton premier message du fil)
    const vus = new Set();
    const touches = plies.filter((x) => x.texte && mots.some((m) => x.plie.includes(m)) && !vus.has(x.texte.trim()) && vus.add(x.texte.trim()));
    touches.sort((a, b) => mots.filter((m) => b.plie.includes(m)).length - mots.filter((m) => a.plie.includes(m)).length || b.poids - a.poids);
    const score = touches.reduce((s, x) => s + x.poids * mots.filter((m) => x.plie.includes(m)).length, 0);
    resultats.push({
      score,
      dossier: { ...publicDossier(d), dansLaListe: dansLaListe(d.id) },
      extraits: touches.filter((x) => x.quoi !== 'titre').slice(0, MAX_EXTRAITS).map((x) => ({ quoi: x.quoi, de: x.de || null, texte: extrait(x.texte, x.plie, mots) })),
      touches: touches.length,
    });
  }
  resultats.sort((a, b) => b.score - a.score || (b.dossier.creeLe || 0) - (a.dossier.creeLe || 0));
  return { mots, resultats: resultats.slice(0, MAX_DOSSIERS).map(({ score, ...r }) => r), total: resultats.length };
}

/** Pour les tests : oublie les fils déjà lus. */
export const viderCacheRecherche = () => caches.clear();
