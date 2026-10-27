# 06 — Mesurer : avant, après, et sans se mentir

> Une économie qui n'est pas mesurée n'existe pas, et une économie qui dégrade le résultat n'en est pas une.
> Ce document fixe comment on compare la 1.0.5 et la 1.0.6, demande par demande, sur le coût, le temps **et** la qualité.

> **Les essais réels S, M et L ne sont pas faits.** La 1.0.6 a été livrée avec des tests automatiques seulement (règles, ordonnanceur avec un moteur simulé, démo). Aucun essai n'a été lancé avec de vrais modèles : ils consomment la fenêtre de 5 h et demandent l'accord de l'utilisateur. Les gains annoncés dans `03-leviers.md` et `04-reglage-cout.md` §3 sont donc **des estimations**, pas des mesures. Ce document reste le protocole à suivre pour les faire.

## 1. Ce qu'on mesure

| Mesure | Où la lire | Remarque |
|---|---|---|
| Coût en équivalent API ($) | `runtime/conso.json` → `dossiers.<id>.cout` | calculé par le SDK (`total_cost_usd`) |
| Tokens relus / écrits / produits | `conso.json` → `dossiers.<id>.cacheLu`, `.cacheEcrit`, `.sortie` | la relecture est le gros poste (voir `01-diagnostic.md`) |
| Part de la fenêtre de 5 h | `conso.json` → `limites.<compte>.fenetres.five_hour.utilisation`, avant et après | lire juste avant l'envoi et juste après la synthèse ; ne rien lancer d'autre entre les deux |
| Appels, sessions, tours | `outils/analyse-sessions.cjs` sur les transcripts du compte | contexte de départ, contexte max, outils utilisés, fichiers lus par plusieurs sessions |
| Temps mural | `state.json` : `creeLe` du dossier → fin de la synthèse ; `debut`/`fin` de chaque tâche | séparer le temps passé à attendre l'utilisateur (questions, accords) |
| Reworks, relances, échecs | `state.json` → `tentative`, `x.reworks`, états finaux | |
| **Qualité** | tests du projet, verdicts des vérificateurs, **grille humaine** (§4) | indispensable : sans elle, Économe « gagne » toujours |

## 2. Les demandes de référence

On rejoue **les mêmes demandes**, sur **le même état du code**, à chaque fois :
- une branche git remise à zéro entre deux essais ;
- ou une copie fraîche du projet de démonstration.

| Code | Taille | Demande | Projet |
|---|---|---|---|
| **S** | petite | « Dans `src/chemin.js`, `trouverChemin` renvoie un chemin vide quand le départ est égal à l'arrivée ; il doit renvoyer `[depart]`. Corrige et ajoute un test. » | `bac-a-sable/projet-demo` (copie) |
| **M** | moyenne | La demande de D1 : bench de `trouverChemin` sur 3 tailles de grille, résultats dans `bench/resultats.json`, puis tests `node:test` calibrés sur le bench, avec relecture. | `bac-a-sable/projet-demo` (copie) |
| **L** | grande | Une vraie fonctionnalité sur un projet réel, sur plusieurs fichiers, avec une partie analyse. Par exemple, sur une copie du dépôt du QG : « ajoute un export CSV de l'onglet Consommation, avec un test ». | branche dédiée d'une copie du dépôt du QG |

**À ne jamais faire** : mesurer sur le QG installé que tu utilises au quotidien, ou sur un projet en cours de travail.

## 3. Le plan d'essais (minimum raisonnable)

Chaque essai coûte des tokens. On ne fait pas les 3 niveaux × 3 tailles. On fait :

| Essai | S | M | L |
|---|---|---|---|
| 1.0.5 (référence, ≈ niveau Max sans les gains gratuits) | ✔ | ✔ | ✔ |
| 1.0.6 Max | ✔ | ✔ | — |
| 1.0.6 Équilibré | ✔ | ✔ | ✔ |
| 1.0.6 Économe | ✔ | ✔ | — |

Ça fait 11 essais. **État : aucun n'est fait.** Les essais S coûtent quelques dollars, M une dizaine, L plusieurs dizaines. Pour limiter :
- utiliser un compte qui a de la marge, de préférence un compte avec clé API pour lire un coût exact ;
- espacer les essais pour ne pas mélanger les fenêtres de 5 h.

Pour chaque essai, consigner dans `mesures/AAAA-MM-JJ-<code>-<profil>.md` :
- la version ;
- le profil ;
- le compte ;
- l'heure de début et de fin ;
- le coût, les tokens et le % de fenêtre ;
- le nombre de tâches, de sessions, de reworks ;
- le résultat des tests ;
- la note de qualité (§4) ;
- deux lignes de commentaire.

## 4. La grille de qualité (notée par l'utilisateur, de 1 à 5)

| Critère | 1 | 3 | 5 |
|---|---|---|---|
| **Fait ce qui est demandé** | à côté ou incomplet | l'essentiel, avec des manques | tout, exactement |
| **Juste** | casse quelque chose | marche, avec des défauts | marche, tests verts, rien de cassé |
| **Propre** | à refaire | acceptable | conforme aux conventions du projet |
| **Pas de dérive** | beaucoup de choses non demandées | quelques à-côtés | rien d'inutile |
| **Compte rendu** | flou | utilisable | clair : ce qui est fait, ce qui reste, quoi vérifier |

**Règle d'acceptation de la 1.0.6** (à vérifier, puisque les essais ne sont pas faits) :
- **Équilibré** obtient au moins la même note que la référence sur S et M (à 1 point près sur un seul critère), pour un coût d'au moins **30 % inférieur** sur M et L.
- **Économe** peut perdre au plus 1 point au total sur S et M, pour un coût d'au moins **50 % inférieur**.
- **Max** garde la même note que la référence, pour un coût au moins **10 % inférieur** (les gains gratuits).

Si une règle n'est pas tenue, on ajuste les valeurs de `config/defauts/profils-travail.json` (seuils de compaction, politique de vérification), **pas** les modèles.

## 5. Les outils fournis

Les deux scripts sont dans `docs/cout/outils/`. Ils tournent avec le Node portable du QG (`runtime/node/` dans le dossier du QG) ou avec n'importe quel Node récent.

```bash
# Toutes les sessions d'un compte depuis une date : tours, contexte de départ et max, tokens relus,
# sortie, outils, puis la liste des fichiers lus par plusieurs sessions (exploration en double).
# <dossier du compte> : le dossier de configuration du compte Claude utilisé par le QG.
node docs/cout/outils/analyse-sessions.cjs --depuis 2026-10-26T19:00 "<dossier du compte>/projects/<projet>"

# Rejoue la courbe de contexte d'une session avec une compaction simulée à plusieurs seuils.
node docs/cout/outils/simuler-compaction.cjs "<transcript>.jsonl" 150000,200000,250000,300000 40000
```

Le titre de chaque session (`QG D4 T4 — …`, `QG D4 — DG`, `… — vérification`) permet de relier un transcript à une tâche.

## 6. Ce que la 1.0.6 enregistre d'elle-même

Pour que la mesure ne dépende plus de scripts externes (lot C3, livré) :
- dans `state.json` : `dossier.travail = { cout }` (figé à la création), l'estimation du dossier et celle de chaque tâche, et les mesures de chaque tâche ;
- dans `conso.json`, par dossier : `profil`, `estimation` et `compactions` (événements `compact_boundary` vus dans le flux) ;
- par tâche, en fin de tâche : `contexteMax`, `tours`, `compactions` et la part du cache ;
- sur la fiche de la tâche et sur celle de l'agent : le contexte en direct (« contexte 120 k (max 180 k) »), le nombre de compactions, l'estimation et le coût ;
- dans l'onglet ⚡ Consommation : une ligne par dossier « profil · estimé · réel · écart », et les mesures par tâche ;
- dans `runtime/logs/contexte-fixe.json` : le coût fixe d'une session de chaque rôle (A8), une fois par démarrage du serveur.

Limites : Codex et les agents ACP n'envoient pas encore le contexte en direct ; la démo n'écrit rien dans `conso.json`.

## 7. Calibrer « $ équivalent API → % de la fenêtre de 5 h »

L'utilisateur raisonne en « % de ma fenêtre de 5 h ». Le QG connaît le coût de chaque appel et lit les limites toutes les 5 minutes (`conso.js`). Il peut donc **apprendre le rapport** compte par compte :
1. entre deux lectures des limites, on note le coût dépensé par le QG sur ce compte et la variation de `five_hour.utilisation` ;
2. on garde une moyenne glissante de « points de fenêtre par dollar », seulement sur les intervalles où le QG était seul à consommer.

Ordre de grandeur observé le 26/10 sur un abonnement Max : la fenêtre est passée à 100 % pour environ 100 à 105 $ d'équivalent API, en comptant D3 et D4. C'est une seule observation, à confirmer.

Ce rapport sert à l'estimation avant lancement (`04-reglage-cout.md` §4) et à l'affichage.

**Dans la 1.0.6** (lot C2) : le QG garde les intervalles de 30 min au plus, sans remise à zéro de la fenêtre, sans baisse de l'utilisation et avec une consommation du QG ; il conserve les 20 derniers par compte dans `conso.json` (`calibrage`). Le rapport appris sert dès 3 intervalles et 1 $ dépensé (ou 1 M de jetons pour Codex) ; avant, le QG prend la valeur de départ du forfait (`pointsParDollar`), et pour Codex il n'affiche pas de %. Le rapport appris de chaque compte est visible dans l'onglet ⚡.
