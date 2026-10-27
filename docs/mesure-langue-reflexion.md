# Mesure : langue de la réflexion résumée (tâche T11, 26/10/2026)

Question : avec `thinking: { type: 'adaptive', display: 'summarized' }`, une consigne de langue suffit-elle pour que la réflexion affichée dans « Réflexion en direct » soit dans la langue des IA (`REGLAGES.langueIA`) ?

## Protocole
- Script ponctuel (supprimé ensuite) : `query()` du SDK `@anthropic-ai/claude-agent-sdk` 0.3.310, compte `claude1`, `effort: 'low'`, `maxTurns: 1`, aucun outil, dossier temporaire, `includePartialMessages: true`.
- Prompt système : preset `claude_code` + une directive courte reprenant la consigne **déjà en place** dans `config/defauts/directive-tache.md` (« tu réponds en français […] Réfléchis dans cette langue aussi : l'utilisateur suit ta réflexion en direct »). C'est la formulation neutre « sans renfort ».
- « Avec renfort » : en plus, un paragraphe en toute fin du prompt système qui demande d'écrire la réflexion en français du premier au dernier mot, même quand le code est en anglais, et un rappel d'une ligne à la fin du message.
- Question : trouver le bug d'une fonction JavaScript `median()` (code en anglais, consigne en français).
- Langue détectée par comptage de mots-outils français et anglais.

## Résultats
| Modèle | Consigne | Réflexion | Réponse | Début de la réflexion reçue |
|---|---|---|---|---|
| haiku | sans renfort | anglais (321 car.) | français | « I spot the bug: sorting without a numeric comparator defaults to lexicographic order… » |
| haiku | avec renfort | anglais (311 car.) | français | « I see the bug: the default sort compares values as strings, not numbers… » |
| sonnet | sans renfort | pas de réflexion (effort bas) | français | — |
| sonnet | avec renfort | — | — | requête refusée par l'API : « Sonnet 5.5's safeguards flagged this message […] Details: `[reasoning_extraction]` » (Request ID req_011CgRPyv9e4kgvZMM7oj2Jm) |

## Conclusions
- La consigne actuelle (neutre, en début de directive) ne suffit pas : la réflexion résumée de Haiku sort en anglais alors que la réponse sort en français.
- La consigne renforcée ne change rien sur Haiku. Sur Sonnet, elle fait refuser la requête par les protections de l'API. Ce risque est inacceptable pour les vraies sessions : le renforcement **n'a pas été déployé**, et les directives de `config/defauts` restent telles quelles (elles citent déjà `{LANGUE}`).
- Le SDK n'offre aucune option de langue de la réflexion. Seul `display` existe (`summarized`, `omitted`).
- La seule voie fiable pour lire la réflexion dans la langue choisie est une traduction des blocs à l'affichage. Proposée à l'utilisateur, qui a choisi « oui, coupée par défaut » : c'est le réglage `traduireReflexion` (Réglages › Général, serveur/traduction-pensees.js). Un essai réel (Haiku, un bloc anglais de 2 phrases) a rendu une traduction française correcte, et le texte d'origine reste consultable.
