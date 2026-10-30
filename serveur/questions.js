// Questions « en passant » au DG ou à un agent, sans l'interrompre : une copie de sa conversation
// (fork) répond pendant que l'original continue son travail. La réponse arrive dans le fil.
// Plusieurs IA : Codex et les agents ACP ne savent pas copier une conversation (reprendre l'original le
// modifierait pendant qu'il travaille). Repli : une courte session à part, sur le même compte, répond d'après
// l'activité visible de l'agent (dernières pensées, outils, terminal, mission), avec la mention
// « réponse d'après son activité visible ».
import { RACINE, langueIA, racines, etage as trouverEtage } from './config.js';
import { etat, message } from './bus.js';
import { executerSession, raisonEchec } from './session.js';
import { trouverCompte } from './comptes.js';
import { adaptateurDe } from './ia/fournisseurs.js';
import { modelePour, reglageDg } from './routeur.js';
import { t as tr } from './i18n.js';
import { optionsQuestion } from './taches.js';

const nomTache = (t) => t.prenom || t.ref;

// Claude garde une conversation dans son cache environ une heure après son dernier appel (1.0.11).
const CACHE_CHAUD_MS = 55 * 60 * 1000;

function consigne(texte) {
  return [
    `QUESTION DE L'UTILISATEUR, posée pendant que tu travailles (une copie de ta conversation répond ; ton travail continue sans interruption) :`,
    `« ${texte} »`,
    '',
    `Réponds brièvement et concrètement, en ${langueIA()} : où tu en es, ce que tu fais en ce moment, ce qui reste. N'utilise aucun outil et ne commence aucun travail : réponds seulement.`,
  ].join('\n');
}

async function forker({ session, modele, compte, cwd, conso, texte }) {
  const s = await executerSession({
    prompt: consigne(texte),
    compte,
    conso,
    options: {
      model: modele, effort: 'low', maxTurns: 1, tools: [], permissionMode: 'dontAsk', cwd, settingSources: [],
      mcpServers: {}, strictMcpConfig: true, resume: session, forkSession: true, persistSession: false,
    },
  });
  const texteReponse = typeof s.result?.result === 'string' ? s.result.result.trim() : '';
  return texteReponse || tr('(pas de réponse : {raison})', { raison: raisonEchec(s) || '?' });
}

// Copie de la conversation d'une tâche, avec les réglages exacts de la tâche (relue dans le cache). La réponse
// arrive dans le champ summary de la sortie structurée (texte libre pour une demande directe). null : pas de réponse.
async function forkerTache(t, d, { compte, conso, texte }) {
  const structuree = !t.x.direct;
  const s = await executerSession({
    prompt: [
      consigne(texte),
      ...(structuree ? ['', 'Mets ta réponse dans le champ « summary » de ta sortie structurée, avec status « done » et les autres champs vides.'] : []),
    ].join('\n'),
    compte,
    conso,
    surPensee: () => {}, // même réflexion que la tâche (réglage qui compte pour le cache)
    options: optionsQuestion(t, d, t.x.session),
  });
  const texteReponse = structuree ? s.result?.structured_output?.summary : s.result?.result;
  return typeof texteReponse === 'string' && texteReponse.trim() ? texteReponse.trim() : null;
}

// ---------------------------------------------------------------- repli sans fork (Codex, agents ACP)

/** Le compte sait-il copier une conversation ? (Claude oui ; Codex et les agents ACP non) */
export function saitForker(compteId) {
  try {
    const c = trouverCompte(compteId);
    return !c || adaptateurDe(c).capacites(c)?.fork !== false;
  } catch {
    return true;
  }
}

const court = (v, n) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const fin = (v, n) => {
  const s = String(v ?? '').trim();
  return s.length > n ? `…${s.slice(-n)}` : s;
};
const ilYa = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
};

// Dernières réflexions visibles d'une cible ('dg' ou id de tâche), les plus récentes à la fin.
function reflexions(cible, { dossier = null, verificateur = false } = {}) {
  const blocs = (etat.reflexions.get(cible) || []).filter((b) => (!dossier || !b.dossier || b.dossier === dossier) && !!b.verificateur === verificateur);
  return blocs.slice(-3).map((b) => fin(b.texte, 900)).filter(Boolean);
}

/** Ce que le site montre d'une tâche, en texte (pour le repli sans fork). */
export function activiteTache(t) {
  const l = [`Agent : ${nomTache(t)} (${t.ref}), étage ${t.etage}, état ${t.etat}${t.derniereActivite ? `, dernière activité il y a ${ilYa(t.derniereActivite)}` : ''}.`];
  l.push(`Mission : ${t.titre}`);
  if (t.x?.prompt) l.push(`Consigne de la mission (début) : ${court(t.x.prompt, 1200)}`);
  if (t.x?.doneWhen) l.push(`Terminé quand : ${court(t.x.doneWhen, 300)}`);
  const r = reflexions(t.id);
  if (r.length) l.push('Dernières réflexions :', ...r.map((x) => `- ${x}`));
  if (t.dernierOutil?.nom) l.push(`Dernier outil : ${t.dernierOutil.nom}${t.dernierOutil.cible ? ` (${court(t.dernierOutil.cible, 160)})` : ''}`);
  const cmds = (etat.terminaux.get(t.id) || []).slice(-5);
  if (cmds.length) {
    l.push('Terminal (dernières commandes) :');
    for (const c of cmds) l.push(`$ ${court(c.commande, 300)}${c.enCours ? ' (en cours)' : c.erreur ? ' (échec)' : ''}${c.sortie ? `\n${fin(c.sortie, 400)}` : ''}`);
  }
  const mods = [...new Set((etat.modifications.get(t.id) || []).map((m) => m.fichier).filter(Boolean))].slice(-8);
  if (mods.length) l.push(`Fichiers modifiés : ${mods.join(', ')}`);
  if (t.x?.sortie?.summary) l.push(`Dernier compte rendu : ${court(t.x.sortie.summary, 600)}`);
  return l.join('\n');
}

/** Ce que le site montre du DG sur un dossier, en texte (pour le repli sans fork). */
export function activiteDg(d) {
  const l = [`Demande de l'utilisateur : ${court(d.texte, 1500)}`, `État du dossier : ${d.etat}.`];
  if (etat.dg?.dossier === d.id && etat.dg.action) l.push(`Action en cours du DG : ${court(etat.dg.action, 200)}`);
  const taches = [...etat.taches.values()].filter((t) => t.dossier === d.id);
  if (taches.length) l.push('Tâches du plan :', ...taches.map((t) => `- ${t.ref} « ${t.titre} » (${t.etage}) : ${t.etat}`));
  const r = reflexions('dg', { dossier: d.id });
  if (r.length) l.push('Dernières réflexions du DG :', ...r.map((x) => `- ${x}`));
  if (d.question?.texte) l.push(`Question posée à l'utilisateur : ${court(d.question.texte, 300)}`);
  return l.join('\n');
}

function consigneRepli(texte, qui, activite) {
  return [
    `Tu réponds à la place de ${qui}, qui travaille en ce moment et ne peut pas être interrompu. Tu n'as pas sa conversation : seulement ce que le QG voit de son activité, ci-dessous.`,
    '',
    'ACTIVITÉ VISIBLE :',
    '<<<',
    activite,
    '>>>',
    '',
    `QUESTION DE L'UTILISATEUR : « ${texte} »`,
    '',
    `Réponds brièvement et concrètement, en ${langueIA()}, d'après cette activité seulement : où il en est, ce qu'il fait, ce qui reste. Si l'activité ne permet pas de répondre, dis-le simplement. N'utilise aucun outil.`,
  ].join('\n');
}

async function repli({ modele, compte, cwd, conso, texte, qui, activite }) {
  const c = trouverCompte(compte);
  const m = c ? modelePour(c, modele, 'low') : { modele, effort: 'low' };
  const s = await executerSession({
    prompt: consigneRepli(texte, qui, activite),
    compte,
    conso,
    options: {
      ...(m.modele ? { model: m.modele } : {}), effort: m.effort || 'low', maxTurns: 1, tools: [], permissionMode: 'dontAsk', cwd,
      settingSources: [], mcpServers: {}, strictMcpConfig: true, persistSession: false,
    },
    demande: { role: 'question', profil: 'lecture', cwd, consignes: '', schema: null, titre: `QG question ${conso.dossier || ''}`.trim() },
  });
  const texteReponse = typeof s.result?.result === 'string' ? s.result.result.trim() : '';
  if (!texteReponse) return { texte: tr('(pas de réponse : {raison})', { raison: raisonEchec(s) || '?' }), repli: true };
  return { texte: `${texteReponse}\n\n${tr("(réponse d'après son activité visible)")}`, repli: true };
}

/** Question à un agent (tâche) ; la réponse arrive dans le fil, marquée { nom, tache, reponse: true }. */
export async function questionTache(t, texte) {
  const d = etat.dossiers.get(t.dossier);
  if (!t.x?.session) throw new Error(tr("{nom} n'a pas encore commencé : il n'y a pas encore de conversation à interroger.", { nom: nomTache(t) }));
  message(d?.id || null, 'toi', tr('À {nom} : {texte}', { nom: nomTache(t), texte }), [t.etage], [], { tache: t.id, question: true });
  const e = trouverEtage(t.etage);
  // la conversation vit sur le compte qui l'a commencée
  const compte = t.x.compteSession || t.compte || d?.compte;
  const cwd = e?.projet || RACINE;
  const conso = { role: 'question', dossier: d?.id, tache: t.id, etage: t.etage };
  let rep = null;
  let marque = {};
  // La copie de sa conversation tant qu'elle est dans le cache de Claude. Plus vieille, elle serait réécrite entière
  // (environ 5 $ pour un agent Fable) : l'agent répond alors d'après son activité visible, presque gratuitement.
  const chaud = Date.now() - (t.derniereActivite || 0) < CACHE_CHAUD_MS;
  if (saitForker(compte) && chaud && d) rep = await forkerTache(t, d, { compte, conso, texte }).catch(() => null);
  if (!rep) {
    const r = await repli({ modele: t.modele, compte, cwd, conso, texte, qui: `l'agent ${nomTache(t)}`, activite: activiteTache(t) });
    rep = r.texte;
    marque = { activiteVisible: true };
  }
  message(d?.id || null, 'agent', rep, [t.etage], [], { nom: nomTache(t), tache: t.id, reponse: true, ...marque });
  return rep;
}

/** Question au DG sur un dossier ; la réponse arrive dans le fil (de: 'dg', reponse: true). */
export async function questionDg(d, texte) {
  if (!d.x?.dgSession) throw new Error(tr("Le DG n'a pas encore commencé ce dossier."));
  message(d.id, 'toi', tr('Au DG : {texte}', { texte }), ['direction'], [], { question: true, cible: 'dg' });
  // la conversation du DG vit sur le compte qui l'a commencée (compte du DG, sinon celui de la demande)
  const compte = d.x.dgCompte || d.dg?.compte || d.compte;
  const modele = d.dg?.modele || reglageDg().modele;
  const cwd = racines()[0] || RACINE;
  const conso = { role: 'question', dossier: d.id, etage: 'direction' };
  let rep;
  let marque = {};
  if (saitForker(compte)) rep = await forker({ session: d.x.dgSession, modele, compte, cwd, texte, conso });
  else {
    const r = await repli({ modele, compte, cwd, conso, texte, qui: 'le DG', activite: activiteDg(d) });
    rep = r.texte;
    marque = { activiteVisible: true };
  }
  message(d.id, 'dg', rep, ['direction'], [], { reponse: true, cible: 'dg', ...marque });
  return rep;
}
