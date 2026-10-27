// Pensées en direct : on suit le flux partiel d'une session (réflexion résumée, rédaction, rapport en cours)
// et on envoie au site, au plus toutes les 1,2 s, ce qui s'est ajouté depuis le dernier envoi. Chaque bloc de
// réflexion a son identifiant ; le dernier envoi d'un bloc (forcé à content_block_stop) porte `fin: true`.
// Rien n'est perdu : bout à bout, les `ajout` d'un bloc redonnent son texte exact.

const INTERVALLE = 1200;
const EXTRAIT = 280; // fin du bloc, espaces écrasés : pour les bulles du canvas
let compteurBlocs = 0;

const extraitDe = (texte) => texte.replace(/\s+/g, ' ').trim().slice(-EXTRAIT);

/**
 * @param surPensee rappel ({ phase, outil, extrait, taille, bloc?, debut?, pos?, ajout?, fin? })
 * @returns rappel pour chaque événement de flux, avec `.terminer()` pour vider le bloc en cours en fin de session
 */
export function suiviPensees(surPensee, { intervalle = INTERVALLE } = {}) {
  let bloc = null; // { id, phase, texte, outil, envoye, debut }
  let dernier = 0;
  let minuterie = null;
  const annulerMinuterie = () => {
    if (minuterie) clearTimeout(minuterie);
    minuterie = null;
  };
  const envoyer = (force = false, fin = false) => {
    if (!bloc) return;
    const attente = intervalle - (Date.now() - dernier);
    if (!force && attente > 0) {
      // trop tôt : on enverra le reste à la fin de l'intervalle, même si plus rien n'arrive
      if (!minuterie) {
        minuterie = setTimeout(() => {
          minuterie = null;
          envoyer();
        }, attente);
        minuterie.unref?.();
      }
      return;
    }
    annulerMinuterie();
    dernier = Date.now();
    if (bloc.phase !== 'reflexion') {
      surPensee({ phase: bloc.phase, outil: bloc.outil || null, extrait: '', taille: bloc.texte.length });
      return;
    }
    const ajout = bloc.texte.slice(bloc.envoye);
    if (!force && !ajout) return;
    const pos = bloc.envoye;
    bloc.envoye = bloc.texte.length;
    surPensee({
      phase: 'reflexion', outil: null, extrait: extraitDe(bloc.texte), taille: bloc.texte.length,
      bloc: bloc.id, debut: bloc.debut, pos, ajout, ...(fin ? { fin: true } : {}),
    });
  };
  const fermer = () => {
    if (bloc?.phase === 'reflexion') envoyer(true, true);
    else envoyer(true);
    annulerMinuterie();
    bloc = null;
  };
  const suivre = (ev) => {
    if (ev.type === 'content_block_start') {
      if (bloc) fermer(); // bloc précédent sans « stop » (interruption) : on le clôt sans rien perdre
      const b = ev.content_block || {};
      const phase = b.type === 'thinking' ? 'reflexion' : b.type === 'text' ? 'redaction' : b.type === 'tool_use' ? (b.name === 'StructuredOutput' ? 'rapport' : 'outil') : null;
      bloc = phase ? { id: `R${Date.now().toString(36)}${(++compteurBlocs).toString(36)}`, phase, texte: '', outil: b.name || null, envoye: 0, debut: Date.now() } : null;
      if (bloc?.phase === 'reflexion' && b.thinking) bloc.texte = b.thinking;
      envoyer(true);
    } else if (ev.type === 'content_block_delta' && bloc) {
      const d = ev.delta || {};
      bloc.texte += d.thinking ?? d.text ?? d.partial_json ?? '';
      envoyer();
    } else if (ev.type === 'content_block_stop' && bloc) {
      fermer();
    }
  };
  suivre.terminer = () => {
    if (bloc) fermer();
    annulerMinuterie();
  };
  return suivre;
}

// ---- Mémoire du serveur : texte des derniers blocs de réflexion, par cible, pour l'état initial d'un site
// qui se connecte ou se recharge. Plafonnée par cible et au total.
export const PLAFONDS = { blocs: 10, caracteres: 20000, total: 200000 };

/**
 * Ajoute un événement `pensee` au fil d'une cible (Map cible → [{ bloc, debut, texte, fin, coupe, … }]).
 * `coupe` = nombre de caractères retirés au début du bloc (plafond), pour que `pos` reste une position absolue.
 */
export function noterReflexion(fils, cible, ev, plafonds = PLAFONDS) {
  if (!ev || ev.phase !== 'reflexion' || !ev.bloc) return;
  const liste = fils.get(cible) || [];
  let b = liste.findLast((x) => x.bloc === ev.bloc);
  if (!b) {
    b = { bloc: ev.bloc, debut: ev.debut || ev.t || Date.now(), texte: '', fin: false, coupe: 0, dossier: ev.dossier || null };
    if (ev.verificateur) b.verificateur = true;
    liste.push(b);
  }
  if (ev.ajout) b.texte += ev.ajout;
  if (ev.fin) b.fin = true;
  b.t = ev.t || Date.now();
  // plafond par cible : les blocs les plus anciens partent d'abord ; un bloc seul trop long perd son début
  let total = liste.reduce((s, x) => s + x.texte.length, 0);
  while (liste.length > plafonds.blocs || (liste.length > 1 && total > plafonds.caracteres)) total -= liste.shift().texte.length;
  if (total > plafonds.caracteres) {
    const trop = total - plafonds.caracteres;
    liste[0].texte = liste[0].texte.slice(trop);
    liste[0].coupe += trop;
  }
  // la cible la plus récente passe en dernier ; au-delà du plafond total, les plus anciennes sont oubliées
  fils.delete(cible);
  fils.set(cible, liste);
  let global = 0;
  for (const l of fils.values()) for (const x of l) global += x.texte.length;
  for (const [c, l] of fils) {
    if (global <= plafonds.total || c === cible) break;
    for (const x of l) global -= x.texte.length;
    fils.delete(c);
  }
}
