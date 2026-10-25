// Questions « en passant » au DG ou à un agent, sans l'interrompre : une copie de sa conversation
// (fork) répond pendant que l'original continue son travail. La réponse arrive dans le fil.
import { REGLAGES, RACINE, langueIA, racines, etage as trouverEtage } from './config.js';
import { etat, message } from './bus.js';
import { executerSession, raisonEchec } from './session.js';
import { t as tr } from './i18n.js';

const nomTache = (t) => t.prenom || t.ref;

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

/** Question à un agent (tâche) ; la réponse arrive dans le fil, marquée { nom, tache, reponse: true }. */
export async function questionTache(t, texte) {
  const d = etat.dossiers.get(t.dossier);
  if (!t.x?.session) throw new Error(tr("{nom} n'a pas encore commencé : il n'y a pas encore de conversation à interroger.", { nom: nomTache(t) }));
  message(d?.id || null, 'toi', tr('À {nom} : {texte}', { nom: nomTache(t), texte }), [t.etage], [], { tache: t.id, question: true });
  const e = trouverEtage(t.etage);
  const rep = await forker({
    session: t.x.session, modele: t.modele, compte: d?.compte, cwd: e?.projet || RACINE, texte,
    conso: { role: 'question', dossier: d?.id, tache: t.id, etage: t.etage },
  });
  message(d?.id || null, 'agent', rep, [t.etage], [], { nom: nomTache(t), tache: t.id, reponse: true });
  return rep;
}

/** Question au DG sur un dossier ; la réponse arrive dans le fil (de: 'dg', reponse: true). */
export async function questionDg(d, texte) {
  if (!d.x?.dgSession) throw new Error(tr("Le DG n'a pas encore commencé ce dossier."));
  message(d.id, 'toi', tr('Au DG : {texte}', { texte }), ['direction'], [], { question: true, cible: 'dg' });
  const rep = await forker({
    session: d.x.dgSession, modele: d.dg?.modele || REGLAGES.dg.modele, compte: d.compte, cwd: racines()[0] || RACINE, texte,
    conso: { role: 'question', dossier: d.id, etage: 'direction' },
  });
  message(d.id, 'dg', rep, ['direction'], [], { reponse: true, cible: 'dg' });
  return rep;
}
