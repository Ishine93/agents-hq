// Réflexions en direct : reconstitue le texte complet de chaque bloc de réflexion à partir des événements
// `pensee` (bloc, pos, ajout, fin) et de l'état initial (`reflexions`). Sans DOM : testable en Node.
export const MAX_BLOCS = 12;
export const MAX_CARACTERES = 30000;

/** Ajoute un événement `pensee` au fil de sa cible (Map cible → [{ bloc, debut, texte, fin, coupe, … }]). */
export function noterReflexion(fils, cible, p) {
  if (!p || p.phase !== 'reflexion' || !cible) return null;
  const liste = fils.get(cible) || [];
  // ancien format (extrait seul, sans bloc) : un bloc unique qui montre le dernier extrait
  const id = p.bloc || 'ancien';
  let b = null;
  for (let i = liste.length - 1; i >= 0 && !b; i--) if (liste[i].bloc === id) b = liste[i];
  if (!b) {
    b = { bloc: id, debut: p.debut || p.t || Date.now(), texte: '', fin: false, coupe: 0, dossier: p.dossier || null };
    if (p.verificateur) b.verificateur = true;
    liste.push(b);
  }
  if (!p.bloc) b.texte = p.extrait || '';
  else if (p.ajout) {
    const fin = (b.coupe || 0) + b.texte.length; // position absolue de la fin connue
    const pos = typeof p.pos === 'number' ? p.pos : fin;
    if (pos === fin) b.texte += p.ajout;
    else if (pos < fin) b.texte += p.ajout.slice(fin - pos); // déjà reçu (état initial puis flux)
    else {
      // morceau manquant (connexion perdue) : on le signale et on se recale
      b.texte += (b.texte ? ' […] ' : '[…] ') + p.ajout;
      b.coupe = pos + p.ajout.length - b.texte.length;
      b.trou = true;
    }
  }
  if (p.fin) b.fin = true;
  b.t = p.t || Date.now();
  let total = liste.reduce((s, x) => s + x.texte.length, 0);
  while (liste.length > MAX_BLOCS || (liste.length > 1 && total > MAX_CARACTERES)) total -= liste.shift().texte.length;
  fils.set(cible, liste);
  return b;
}

/** Traduction d'un bloc terminé (événement pensee_traduction) : le texte d'origine reste dans `texte`. */
export function noterTraduction(fils, cible, bloc, traduction) {
  const b = (fils.get(cible) || []).find((x) => x.bloc === bloc);
  if (b && traduction && traduction.texte) b.traduction = traduction;
  return b || null;
}

/** État initial : { cible: [blocs] } envoyé par le serveur. */
export function chargerReflexions(fils, objet) {
  for (const [cible, liste] of Object.entries(objet || {})) {
    if (Array.isArray(liste)) fils.set(cible, liste.filter((b) => b && b.bloc).map((b) => ({ ...b, texte: String(b.texte || ''), coupe: b.coupe || 0 })).slice(-MAX_BLOCS));
  }
}
