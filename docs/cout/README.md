# Coût des dossiers : « le meilleur résultat au juste coût »

Ce dossier explique pourquoi le QG consommait autant avant la 1.0.6, ce qui a été changé dans la 1.0.6, et comment le mesurer. Le diagnostic et l'état de l'art (01 et 02) ont été écrits **avant** la 1.0.6 ; les documents 03 à 06 disent, point par point, ce qui a vraiment été livré.

## Par où commencer

| Pour… | Lire |
|---|---|
| Comprendre **pourquoi le QG consommait autant** | `01-diagnostic.md` |
| Voir **ce que font les autres** et ce que disent les études | `02-etat-de-l-art.md` |
| La **liste des leviers** (effet, risque, preuve, et état dans la 1.0.6) | `03-leviers.md` |
| Le **réglage Coût** (Économe / Équilibré / Max) | `04-reglage-cout.md` |
| **Ce qui est codé, où, et ce qui diffère** de la conception | `05-specification.md` |
| **Mesurer** avant et après sans se mentir | `06-mesure.md` |
| Les **scripts** d'analyse des transcripts | `outils/analyse-sessions.cjs`, `outils/simuler-compaction.cjs` |

## L'essentiel

1. Sur le dossier mesuré avant la 1.0.6 (D4, environ 101 $ en équivalent API, fenêtre de 5 h saturée) : **89 % du coût chez les agents**, 5 % pour le DG, 5 % pour les vérificateurs.
2. **Environ deux tiers du coût, c'est la relecture du contexte** à chaque appel d'outil. La réflexion (l'effort) ne pèse qu'environ un cinquième.
3. **Les sessions ne se compactaient jamais.** Compacter vers 200 k aurait coupé 59 % des jetons relus de la plus grosse tâche (simulation sur le vrai transcript).
4. La 1.0.6 :
   - supprime le gaspillage pur, à tous les niveaux (lot A : compaction, reprise du vérificateur, contexte fixe allégé, critères de fin, filtrage des sorties de tests…) ;
   - ajoute un réglage **Coût** (Économe / Équilibré / Max), dans les Réglages et pour chaque nouveau dossier (lot B) ;
   - transmet le résultat d'une tâche à la suivante par un **livrable complet**, avec des notes courtes qui disent où regarder ;
   - affiche une **estimation** du plan avant le lancement, en $ (ou en jetons pour Codex) et en % de la fenêtre de 5 h (lot C1, C2) ;
   - enregistre ses propres **mesures** : contexte, compactions, estimé contre réel (lot C3).
5. **Aucun réglage ne baisse le modèle ni l'effort** des tâches de production ni du DG. L'ordre des tâches ne change pas non plus : une tâche qui dépend d'une autre attend toujours qu'elle soit vérifiée.
6. Gain attendu sur un dossier comme D4, avec les mêmes modèles et efforts : environ −10 à −20 % en Max, −30 à −45 % en Équilibré, −50 à −65 % en Économe. **Ce n'est pas mesuré** : les essais réels S, M et L de `06-mesure.md` n'ont pas encore été faits.

## Ce qui n'est pas fait dans la 1.0.6

- les essais réels S, M et L (`06-mesure.md`) ;
- B10, les verrous de ressources déclarées (appareil, application, compte externe) entre tâches parallèles : seuls les projets sont verrouillés, comme en 1.0.5 ;
- la compaction et le plafond par tâche pour Codex (sans effet, l'écran le dit) ;
- la grille Fable selon la difficulté (`grilleFableDifficulte`, option non retenue).
