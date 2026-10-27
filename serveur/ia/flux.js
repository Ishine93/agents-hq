// Flux de pensées normalisé, commun à tous les adaptateurs : des blocs (réflexion, rédaction, rapport, outil)
// ouverts, remplis puis fermés. Il alimente suiviPensees (pensees.js), qui produit l'événement `pensee` du site
// (bloc, pos, ajout, fin, extrait…) : le format du site ne dépend donc pas du fournisseur.
// Claude envoie ses blocs en flux (deltas) ; Codex envoie chaque résumé de raisonnement d'un coup (texte
// complet par bloc : debutBloc + ajout(texte) + finBloc).
import { suiviPensees } from '../pensees.js';

const BLOC_PAR_PHASE = {
  reflexion: () => ({ type: 'thinking', thinking: '' }),
  redaction: () => ({ type: 'text', text: '' }),
  rapport: () => ({ type: 'tool_use', name: 'StructuredOutput' }),
  outil: (outil) => ({ type: 'tool_use', name: outil || 'outil' }),
};
const DELTA_PAR_PHASE = {
  reflexion: (texte) => ({ type: 'thinking_delta', thinking: texte }),
  redaction: (texte) => ({ type: 'text_delta', text: texte }),
  rapport: (texte) => ({ type: 'input_json_delta', partial_json: texte }),
  outil: (texte) => ({ type: 'input_json_delta', partial_json: texte }),
};

/**
 * @param surPensee rappel du site (penseeTraduite, ou pensee du bus), ou null (aucune pensée demandée)
 * @returns { debutBloc(phase, { outil }), ajout(texte), finBloc(), bloc(phase, texte), terminer() } ; tout est sans effet si surPensee est null
 */
export function fluxPensees(surPensee, options = {}) {
  if (!surPensee) return { debutBloc() {}, ajout() {}, finBloc() {}, bloc() {}, terminer() {} };
  const suivre = suiviPensees(surPensee, options);
  let phase = null;
  return {
    debutBloc(nouvellePhase, { outil = null } = {}) {
      if (!BLOC_PAR_PHASE[nouvellePhase]) return;
      phase = nouvellePhase;
      suivre({ type: 'content_block_start', content_block: BLOC_PAR_PHASE[phase](outil) });
    },
    ajout(texte) {
      if (!phase || !texte) return;
      suivre({ type: 'content_block_delta', delta: DELTA_PAR_PHASE[phase](String(texte)) });
    },
    finBloc() {
      if (!phase) return;
      suivre({ type: 'content_block_stop' });
      phase = null;
    },
    // Fin de session : clôt un bloc coupé (son dernier envoi porte fin: true), comme suiviPensees().terminer.
    terminer() {
      suivre.terminer();
      phase = null;
    },
    // Un bloc entier d'un coup (Codex : résumé de raisonnement, message de l'agent).
    bloc(nouvellePhase, texte, extra = {}) {
      this.debutBloc(nouvellePhase, extra);
      this.ajout(texte);
      this.finBloc();
    },
  };
}
