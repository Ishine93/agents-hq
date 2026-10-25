// Décisions : un agent te pose une question (avis sur des captures, choix entre options) et attend
// ta réponse. Même mécanique que la main levée des permissions, avec une carte plus riche.
import { etat, emettre, changerEtatTache, message } from './bus.js';
import { piecePublique } from './pieces.js';
import { notifier, notificationResolue } from './notifications.js';
import { t } from './i18n.js';

let compteur = 0;
const attentes = new Map(); // id → { resolve, tache, etatAvant, decision }

// brut : la promesse rend l'id de l'option choisie (ou null), pour une question du QG lui-même (pas d'un agent).
export function demanderDecision(tache, { question, options = [], pieces = [], brut = false }, signal) {
  const id = `Q${++compteur}`;
  const decision = {
    id,
    tache: tache.id,
    dossier: tache.dossier,
    question,
    options: options.map((o, i) => ({ id: `O${i + 1}`, libelle: o.libelle, image: o.piece ? piecePublique(o.piece) : null })),
    images: pieces.map(piecePublique),
    t: Date.now(),
  };
  const etatAvant = tache.etat;
  changerEtatTache(tache, 'permission');
  etat.decisions.set(id, decision);
  emettre('decision', { decision }, tache.dossier);
  notifier({
    id,
    type: 'decision',
    titre: t('{ref} a besoin de ton avis', { ref: tache.ref }),
    texte: question,
    dossier: tache.dossier,
    tache: tache.id,
    etage: tache.etage,
    actions: decision.options.length ? decision.options.map((o) => ({ id: o.id, libelle: o.libelle })) : [{ id: 'repondre', libelle: t('Répondre') }],
  });
  message(tache.dossier, 'systeme', t('{ref} te pose une question : {question}', { ref: tache.ref, question }), [tache.etage], decision.images);
  return new Promise((resolve) => {
    attentes.set(id, { resolve, tache, etatAvant, decision, brut });
    signal?.addEventListener('abort', () => resoudreDecision(id, null, null), { once: true });
  });
}

export function resoudreDecision(id, choix, texte) {
  const a = attentes.get(id);
  if (!a) return false;
  attentes.delete(id);
  etat.decisions.delete(id);
  const option = a.decision.options.find((o) => o.id === choix);
  emettre('decision_resolue', { id, choix: option?.id || null, texte: texte || null }, a.tache.dossier);
  notificationResolue(id);
  if (a.tache.etat === 'permission') changerEtatTache(a.tache, a.etatAvant === 'permission' ? 'running' : a.etatAvant);
  const parties = [];
  if (option) parties.push(`L'utilisateur a choisi : ${option.libelle}`);
  if (texte) parties.push(`Il ajoute : ${texte}`);
  // Même réponse, dans la langue de l'interface pour le fil (la version ci-dessus part à l'agent).
  const affichees = [];
  if (option) affichees.push(t("L'utilisateur a choisi : {libelle}", { libelle: option.libelle }));
  if (texte) affichees.push(t('Il ajoute : {texte}', { texte }));
  if (option || texte) message(a.tache.dossier, 'toi', t('Réponse à {ref} : {reponse}', { ref: a.tache.ref, reponse: affichees.join(' — ') }), [a.tache.etage]);
  if (a.brut) {
    a.resolve(option ? option.id : null);
    return true;
  }
  a.resolve(parties.length ? parties.join('\n') : "Pas de réponse de l'utilisateur. Fais le choix le plus prudent et signale-le dans ton résumé.");
  return true;
}

export function abandonnerDecisionsPour(tacheIds) {
  for (const [id, a] of attentes) if (tacheIds.has(a.tache.id)) resoudreDecision(id, null, null);
}
