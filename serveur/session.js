// Façade des sessions d'agent : choisit l'adaptateur du compte (serveur/ia/) et lui passe la demande.
// Les appelants (taches.js, dg.js, questions.js…) gardent la même fonction executerSession et les mêmes
// rappels ; le code Claude d'origine vit dans serveur/ia/claude.js, à l'identique.
import { trouverCompte } from './comptes.js';
import { adaptateurDe } from './ia/fournisseurs.js';
import { tronquer } from './ia/commun.js';

export { cibleOutil, modificationDe } from './ia/commun.js';

// Erreurs qui doivent tout arrêter plutôt que réessayer.
export const ERREURS_FATALES = new Set(['authentication_failed', 'billing_error', 'profil_refuse', 'role_non_pris_en_charge', 'binaire_absent', 'bac_a_sable']);

/**
 * @param compte identifiant du compte (sinon le compte par défaut)
 * @param demande description neutre de la tâche (profil, cwd, consignes, schéma, outils du QG…) : nécessaire aux
 *                fournisseurs autres que Claude ; Claude s'en passe (ses options SDK sont dans `options`)
 * @param canal  objet facultatif rempli avec `injecter(texte)` tant que la session tourne
 * @param surImage rappel (base64, type, outil) pour chaque image reçue dans le résultat d'un outil
 * @returns {Promise<{result, sessionId, init, erreur, limite, exception, contexte, compte, fournisseur}>}
 */
export async function executerSession(args) {
  const compteObj = trouverCompte(args.compte);
  return adaptateurDe(compteObj).lancer({ ...args, compteObj });
}

// Raison lisible d'un échec de session.
export function raisonEchec(s) {
  // refus d'un fournisseur (profil, rôle, binaire) : la raison lisible est dans l'exception
  if (s.erreur && s.exception && ['profil_refuse', 'role_non_pris_en_charge', 'binaire_absent', 'bac_a_sable'].includes(s.erreur)) return tronquer(s.exception, 400);
  if (s.erreur) return s.erreur;
  if (s.exception) return tronquer(s.exception, 200);
  if (!s.result) return 'session sans résultat';
  if (s.result.subtype !== 'success') return `${s.result.subtype}${s.result.errors?.length ? ' : ' + tronquer(s.result.errors.join(' ; '), 160) : ''}`;
  if (s.result.structured_output == null) return 'pas de sortie structurée';
  return null;
}
