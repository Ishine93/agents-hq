# 01 — Diagnostic : où partent les tokens et le temps dans le QG 1.0.5

> Analyse du 26 octobre 2026, faite **avant** la 1.0.6 et sans rien modifier au QG. Source : le vrai dossier D4 (« retours 1.0.5 ») exécuté sur une copie de travail du QG 1.0.5.
> Ce diagnostic est le point de départ de l'économie de jetons livrée dans la **1.0.6**. Ce que la 1.0.6 a fait de chaque constat est résumé au §6 ; le détail est dans `03-leviers.md` et `05-specification.md`.
> Les chiffres en dollars sont l'**équivalent API** calculé par le SDK (`total_cost_usd`), tel que `serveur/conso.js` l'enregistre dans `runtime/conso.json`. Avec un abonnement, on ne paie pas ces dollars, mais ils suivent de près ce qui remplit la fenêtre de 5 h.

## 1. Méthode

| Source | Ce qu'on y lit |
|---|---|
| `runtime/conso.json` (dans le dossier du QG) | tokens et coût par jour, rôle (`dg`, `tache`, `verif`, `minijeu`, `bonheur`), modèle, étage, dossier et tâche ; limites du forfait |
| `dossiers/D1…D4/state.json` | plans du DG : modèle, effort, vérification, profil, tentatives, reworks, durées |
| `dossiers/D4/events.jsonl` | fil du dossier : demande, compléments, messages du DG, réponses aux questions |
| `<dossier du compte Claude du QG>/projects/…/*.jsonl` | transcripts des sessions Claude Code : usage de **chaque appel** (contexte, cache, sortie) et chaque outil utilisé |
| Code : `serveur/dg.js`, `ordonnanceur.js`, `taches.js`, `session.js`, `equipe.js`, `config/defauts/*.md`, `reglages.json` | comment le DG planifie, lance, vérifie, réembauche |

Le script `outils/analyse-sessions.cjs` (dans ce dossier) refait l'analyse des transcripts. Voir `06-mesure.md`.

## 2. Les chiffres de D4

**La demande** : cinq chantiers en un seul message, plus un complément :
1. la fenêtre « Choisir un dossier » au premier plan ;
2. créer des étages librement ;
3. le portage Mac ;
4. les comptes multi-IA (« j'aimerais savoir déjà dans un premier temps si c'est possible ») ;
5. une question sur un log.

Le complément portait sur la réflexion en direct.

**Le plan du DG** : 10 tâches au départ, 11 avec le complément.

**Le résultat** :
- 101 $ en équivalent API ;
- 688 appels au modèle ;
- **la fenêtre de 5 h à 100 %** un peu plus de 2 h après l'envoi (le 26/10, avec la semaine à 59 %) ;
- 3 tâches pas finies au moment de l'analyse : T8 interrompue, T9 et T10 en attente.

### 2.1 Par rôle

| Rôle | Coût | Part |
|---|---|---|
| Agents producteurs | 90,2 $ | **89 %** |
| Vérificateurs | 5,5 $ | 5 % |
| DG (opus / xhigh) : plan, 5 réveils, questions | 5,3 $ | 5 % |

**Le DG n'est pas le problème.** L'orchestration elle-même coûte peu.

### 2.2 Par tâche (le coût d'une tâche inclut ses vérifications)

| Tâche | Modèle / effort | Vérif | Coût | Part |
|---|---|---|---|---|
| T4 Portage macOS | **fable / high** | agent (opus), 1 rework → 2 vérifs | **59,4 $** | **59 %** |
| T11 Réflexion en direct (complément) | opus / medium | agent (sonnet), 1 rework → 2 vérifs | 15,1 $ | 15 % |
| T7 Conception comptes IA | opus / high | agent (sonnet) | 5,4 $ | 5 % |
| T3 Analyse du portage macOS | opus / high | self | 4,8 $ | 5 % |
| T8 Lot 1 comptes IA (interrompue par la limite) | fable / high | agent (opus) | 4,4 $ | 4 % |
| T2 Étages libres | opus / medium | agent (sonnet) | 2,9 $ | 3 % |
| T6 Bench autres IA | sonnet / high | self | 1,5 $ | 2 % |
| T5 Bench OpenAI | sonnet / high | self | 1,3 $ | 1 % |
| T1 Fenêtre au premier plan | sonnet / high | agent (opus) | 0,7 $ | 1 % |

### 2.3 Les tokens : la relecture écrase tout

Sur la journée du 26/10 :
- **94,9 millions** de tokens relus depuis le cache (`cache_read`) ;
- 2,6 millions écrits en cache ;
- **0,97 million** produits en sortie (réflexion + texte + code).

Sur D4 seul : 94,3 M relus, 0,65 M produits.

**Pourquoi** : à chaque appel d'outil (lire un fichier, lancer une commande, faire une modification), l'agent renvoie **toute** sa conversation au modèle. Le cache la rend moins chère, mais elle est facturée et comptée à chaque fois. Le coût d'une session suit donc à peu près :

```
coût ≈ Σ sur les tours (taille du contexte × prix du token relu)  +  sortie × prix du token produit  +  écritures en cache
```

Il grandit comme **(nombre de tours) × (taille moyenne du contexte)**, donc à peu près comme le carré de la longueur de la session.

Une estimation faite sur les tarifs publics donne, pour D4 : **environ deux tiers du coût viennent de la relecture du contexte** et environ un cinquième de la sortie. La part de la réflexion (l'effort) est donc **minoritaire**. On peut garder les modèles et les efforts et gagner beaucoup en travaillant sur la relecture.

### 2.4 Session par session (transcripts)

| Session | Modèle | Tours | Contexte au départ | Contexte max | Tokens relus | Sortie | Outils principaux |
|---|---|---|---|---|---|---|---|
| T4 production | fable | **175** | 24 k | **324 k** | **41,3 M** | 132 k | Edit 106, Bash 48, Write 16 |
| T11 production | opus | 133 | 17 k | 226 k | 18,8 M | 86 k | Bash 107, Edit 12 |
| T3 production (analyse) | opus | 65 | 15 k | 234 k | 8,0 M | 63 k | Bash 57, WebSearch 13 |
| T7 production | opus | 30 | 18 k | 270 k | 4,7 M | 106 k | Bash 18, Read 14 |
| T2 production | opus | 53 | 17 k | 131 k | 4,4 M | 38 k | Bash 40, Edit 19 |
| T8 production (coupée) | fable | 32 | 22 k | 162 k | 3,4 M | 6 k | Bash 27 |
| T4 vérification n° 1 | opus | 34 | **36 k** | 148 k | 3,4 M | 18 k | Grep 19, Read 18, Bash 17 |
| T5 production | sonnet | 37 | 15 k | 125 k | 2,6 M | 38 k | WebFetch 32, Bash 46 |
| T6 production | sonnet | 34 | 15 k | 142 k | 2,6 M | 39 k | WebFetch 57, WebSearch 26 |
| T4 vérification n° 2 | opus | 27 | **35 k** | 139 k | 2,4 M | 19 k | Bash 22, Read 19, Grep 17 |
| DG de D4 | opus | 19 | 17 k | 91 k | 0,8 M | 56 k | Grep 11, Read 7, Glob 6 |
| T1 production | sonnet | 19 | 15 k | 46 k | 0,7 M | 19 k | Bash 13, Edit 5 |
| autres vérifications (T1, T2, T7, T11 ×2) | sonnet / opus | 4 à 10 | 16 à 36 k | 23 à 67 k | 0,1 à 0,4 M | 4 à 7 k | Read, Grep |

**Aucune session n'a été compactée** : on ne trouve aucun `compact_boundary` dans les transcripts.

## 3. Les constats

### C1. Les sessions ne se compactent jamais (cause n° 1)
Opus 5.5, Sonnet 5.5, Haiku 5.5 et Fable 5.1 ont **un contexte natif d'un million de tokens**. La compaction automatique de Claude Code ne se déclenche qu'autour de **~967 k** ([model-config](https://code.claude.com/docs/en/model-config.md)). Une session d'agent peut donc grossir jusqu'à 300 k et plus, et relire tout ce contexte à chaque tour.

Exemple de T4 : 175 tours à 236 k de contexte en moyenne, soit 41 M de tokens relus pour une seule tâche.

> Levier : `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (de 100 000 à 1 000 000, pris en compte sur les modèles 1M). On peut le passer par session via `options.env` du SDK. Voir `03-leviers.md`, L1.

**« Mais si ça tient dans un million, à quoi bon compacter ? »** Le million de tokens évite que l'agent plante, il ne rend pas les relectures gratuites. Chaque geste relit tout le contexte : à 300 k, corriger une virgule relit 300 k tokens. Compacter remplace la conversation par un résumé d'environ 30 à 40 k, puis le travail continue.

Simulation sur les vrais transcripts (`outils/simuler-compaction.cjs`) : on rejoue la courbe du contexte, appel par appel ; au-delà du seuil, le contexte retombe à 40 k puis regrossit au même rythme.

| Tâche (contexte max, appels) | 150 k | 200 k | 250 k | 300 k |
|---|---|---|---|---|
| T4 portage Mac, fable (324 k, 175) | −61 % | **−59 %** | −44 % | −16 % |
| T11 réflexion en direct, opus (226 k, 133) | −40 % | −20 % | 0 | 0 |
| T3 analyse Mac, opus (234 k, 65) | −31 % | −9 % | 0 | 0 |
| T7 conception multi-IA, opus (270 k, 30) | −40 % | −21 % | −21 % | 0 |
| T6 bench autres IA, sonnet (142 k, 34) | 0 | 0 | 0 | 0 |

Ce que ça montre :
- **Le gain dépend du nombre de gestes faits après que le contexte est devenu gros**, pas de la taille maximale. T4 a fait des dizaines d'`Edit` au-dessus de 200 k : gain énorme. T3 a atteint 234 k presque à la fin : gain faible.
- **La simulation est optimiste.** Après une compaction, l'agent relit parfois un fichier qu'il a « oublié », et le résumé lui-même coûte un appel. Le gain réel sera plus bas, mais l'ordre de grandeur tient.
- **Le risque qualité est faible à 200 k et plus.** L'agent a déjà beaucoup produit, et le résumé garde les décisions et les fichiers touchés. À l'inverse, la précision des modèles baisse quand le contexte devient très long (voir `02-etat-de-l-art.md`). Un contexte plus court peut aussi aider.
- **Un bonus pour la réserve.** Un agent compacté reste sous le seuil de retraite (`CONTEXTE_MAX = 150000`), donc il reste réembauchable (C9).

D'où un seuil **réglable, branché sur le réglage Coût** : Économe 150 k, Équilibré 200 k, Max 400 k (ou désactivé). Voir `04-reglage-cout.md`.

### C2. Le même code est exploré quatre fois
Pour le portage Mac :
1. **T3** (analyse, opus) explore le code et monte à 234 k de contexte.
2. Son agent est **mis à la retraite** (`CONTEXTE_MAX = 150000` dans `serveur/equipe.js`), donc il n'est plus réembauchable.
3. **T4** (fable) repart de zéro, relit l'analyse de 55 Ko puis le code, et monte à 324 k.
4. **Deux vérificateurs neufs** relisent chacun le code : 148 k et 139 k.

La directive du DG impose ce découpage : « Sépare la production et la vérification. Sépare ce qui se mesure (bench, inventaire, diagnostic) de ce qui en dépend » (`directive-dg.md`, section Découpage).

### C3. Chaque vérification est une session neuve, même après un rework
`verifier()` (`serveur/taches.js`) lance toujours une session sans `resume`. Après un rework, une **nouvelle** session refait toute l'exploration. Le vérificateur démarre déjà à 32–36 k de contexte, parce qu'il reçoit :
- la mission complète ;
- la sortie JSON du producteur ;
- le diff git (tronqué à 40 000 caractères).

Les vérificateurs ont `maxTurns: 40`.

Sur D4 : 2 reworks pour 6 tâches vérifiées par un agent. **Les vérifications ont trouvé de vrais défauts**, donc elles servent, mais elles coûtent cher pour ce qu'elles relisent.

### C4. Des agents qui font un appel par geste
- T4 a fait **106 `Edit` séparés**. Chacun est un appel complet, qui relit environ 240 k de contexte.
- Les agents lisent beaucoup par `Bash` (`cat`, `sed -n`, `head -c 6000`, `cat -n` de fichiers entiers), parfois plusieurs fichiers d'un coup. Ces sorties restent dans le contexte jusqu'à la fin de la session.
- La directive des agents dit : « Lance une commande par appel Bash, sans `&&` ni `;` ». Les agents ne la respectent pas toujours, mais elle va dans le sens de plus de tours.

### C5. La directive du DG met la qualité avant le coût, explicitement
`directive-dg.md`, section « Modèle et effort » : « **Le but est le meilleur résultat, pas l'économie.** » La grille associe « Tâche très longue ou très dure à mener seule » à `fable / high`. C'est **la combinaison la plus chère possible** : la session la plus longue (tours × contexte) sur le modèle au prix par token le plus élevé. T4 seul pèse 59 % du dossier.

### C6. Le périmètre grossit dès le plan
L'utilisateur avait écrit, pour le multi-IA : « j'aimerais savoir **déjà dans un premier temps si c'est possible** ». Le premier plan (10 tâches) prévoyait déjà :
- 2 benchs ;
- une conception ;
- **2 lots d'implémentation** (T8 en Fable, T9) ;
- **une revue d'ensemble** (T10).

L'utilisateur a ensuite répondu aux questions de T7 en choisissant l'option longue, donc une partie était voulue. Mais l'implémentation était planifiée avant toute réponse. La directive pousse aussi aux à-côtés : « Demande des sources datées et des captures des meilleurs exemples » pour les benchs, les contrôles finaux, les README.

### C7. Des critères mal calibrés coûtent des réveils
T5 a rendu `blocked` sur un critère que le DG avait mal posé (« `git status` ne doit montrer que `docs/multi-ia/` », alors que d'autres tâches modifiaient le projet en parallèle). Il a fallu un réveil du DG pour « accepter », puis une correction envoyée à 3 autres tâches.

### C8. Un coût fixe à chaque nouvelle session
Contexte au premier appel :
- producteurs : **15–24 k** (préréglage `claude_code` + outils + directive + mission + données amont) ;
- vérificateurs : **32–36 k**.

Avec 19 sessions pour D4, ce coût d'entrée se paie 19 fois, en écriture de cache, avant le moindre travail utile.

### C9. La réserve d'agents marche mal avec les grosses sessions
- Un agent dont le contexte dépasse 150 k est **mis à la retraite**. Or les agents les plus utiles (ceux qui ont exploré le plus) sont justement ceux qui dépassent : T3 (236 k), T7 (274 k), T11 (230 k), T4 (329 k). Aucun n'était réembauchable.
- Un agent repris longtemps après sa dernière activité retrouve un cache expiré. Avec un abonnement, la conversation principale a un cache d'une heure ; l'API et les sous-agents ont 5 minutes ([prompt-caching](https://code.claude.com/docs/en/prompt-caching.md#which-ttl-each-request-gets)). Passé ce délai, sa conversation entière est **réécrite en cache** au premier appel, au prix de l'écriture : environ 1,25 à 2 fois le prix d'entrée, contre environ 0,1 fois pour une lecture. Réembaucher un agent de 150 k plus d'une heure après coûte donc 10 à 20 fois plus cher que s'il était « chaud ».

### C10. Les agents n'ont pas de sous-agents d'exploration
Les profils (`config/defauts/profils.json`) n'incluent pas l'outil `Agent`/`Task`. Un agent ne peut donc pas confier une recherche dans le code à un sous-agent qui lui rendrait un résumé : tout ce qu'il lit reste dans son propre contexte.

Attention : l'Explore intégré de Claude Code **hérite du modèle de la session**, donc Opus dans une session Opus. Pour qu'il soit économique, le QG doit le définir lui-même avec l'option `agents` du SDK (par exemple `Explore` avec `model: 'haiku'` ou `'sonnet'`) ([sub-agents](https://code.claude.com/docs/en/sub-agents.md)).

### C11. Des appels en arrière-plan qui ne servent pas le travail
Dans le QG installé (`config/reglages.json`), les bavardages du mini-jeu tournent toutes les 10 min (`bavardagesMinutes: 10`). Ça a fait :
- le 26/10 : **83 appels Haiku et 293 k tokens de sortie** (rôle `minijeu`) ;
- le 25/10 : 130 appels du rôle `bonheur`, qui tourne toutes les 12 h.

C'est peu à côté de 100 $, mais rien ne le justifie quand on veut économiser.

### C12. Le parallélisme illimité brûle la fenêtre de 5 h
Avec `plafondGlobal: 0` et `plafondEtage: 0`, jusqu'à 6 agents tournaient en même temps. Ça ne change pas le total de tokens, mais ça **concentre** la dépense : la fenêtre de 5 h sature en un peu plus de 2 h, puis tout le QG se met en pause. Le temps « gagné » en parallèle est reperdu en attente.

### C13. Le temps : une chaîne en série
Pour un sujet comme le portage Mac, la chaîne est :
1. DG (xhigh, repérage) ;
2. T3 analyse (15 min) ;
3. T4 réalisation (37 min) ;
4. vérification ;
5. rework ;
6. nouvelle vérification ;
7. réveil du DG ;
8. synthèse.

Chaque maillon refait du repérage. Dans D2 (10 jeux), les tâches de rédaction ont pris environ **2 h chacune** (opus / high, gros documents), puis leur vérification.

## 4. Ce qui n'est PAS le problème

- **Le DG** : 5 %. On peut garder `opus / xhigh`.
- **L'effort de réflexion** : la sortie (réflexion comprise) ne fait qu'environ un cinquième du coût. Baisser l'effort ferait peu gagner et risquerait la qualité.
- **Le modèle**, sauf un cas : la grille « longue → Fable » (C5).

## 5. Ce qu'une conversation unique aurait coûté

D4 était **une demande énorme** (cinq chantiers, dont un portage Mac complet). Même en conversation unique, elle n'aurait pas tenu dans 20 à 40 % d'une fenêtre de 5 h.

Ce qui est propre au workflow (DG, vérifications, exploration en double, reworks, vérifications refaites) pèse **environ 20 à 30 %** de D4. Le reste vient des longues sessions sans compaction. Elles existeraient aussi dans une conversation unique, mais le QG les **multiplie** par le nombre d'agents, puisque chacun reconstruit son propre gros contexte.

Pour une **petite** demande, en revanche, le surcoût relatif du workflow est bien plus fort. Il faut payer :
- le DG avec son repérage ;
- un agent qui redécouvre le projet (15–24 k au départ, plus l'exploration) ;
- un vérificateur qui relit (32–36 k au départ, plus l'exploration).

Là où une conversation ferait tout d'une traite, ça donne facilement **2 à 4 fois** son coût. C'est l'impression de l'utilisateur, et elle est fondée pour les demandes petites et moyennes.

## 6. Ce qu'il fallait retenir, et ce que la 1.0.6 en a fait

1. **Faire compacter les agents** (C1). C'est le levier n° 1, et il ne touche ni au modèle ni à l'effort.
   → **Fait** : seuil de compaction par rôle et par niveau (150 / 200 / 400 k pour les agents), compactions comptées et affichées. Pas branché pour Codex.
2. **Ne plus explorer plusieurs fois le même code** (C2, C3, C9) : fusionner analyse et réalisation, reprendre la session du vérificateur, garder les agents savants.
   → **Fait en grande partie** : directive de découpage selon le niveau, reprise du vérificateur après un rework (moins de 55 min), passation par livrable, « cache chaud / froid » montré au DG. La règle de retraite à 150 k n'a pas changé.
3. **Proportionner le workflow à la demande** (C5, C6, C8) : une petite demande doit coûter presque autant qu'une conversation unique. Un mode « agent direct » ou une tâche unique par chantier.
   → **Fait** : mode « agent direct », nombre de tâches borné par niveau, vérification proportionnée et appliquée par le serveur, périmètre selon le niveau. Le coût fixe des sessions (C8) est mesuré, pas encore réduit.
4. **Rendre les agents plus économes dans leurs gestes** (C4, C10) : regrouper les modifications, lire de façon ciblée, déléguer la recherche à un sous-agent léger.
   → **Fait** : directives des gestes, filtre des sorties de tests, sous-agent d'exploration en lecture seule (Haiku en Économe, Sonnet sinon).
5. **Laisser l'utilisateur choisir** : un réglage **Coût** (Économe / Équilibré / Max). Voir `04-reglage-cout.md`. Il n'y a pas de réglage « Rapidité » (décision du 26/10/2026) : le temps baisse avec des sessions et des chaînes plus courtes, sans jamais lancer une tâche avant que son amont soit vérifié.
   → **Fait**, avec une estimation avant le lancement et des mesures par tâche. L'ambiance (C11) est coupée en Économe ; le parallélisme (C12) reste réglé par les plafonds de Réglages › Général.

**Ce qui n'est pas fait** : les verrous de ressources déclarées (appareil, application, compte externe) et **les essais réels** qui mesureraient le gain sur un dossier comme D4 (`06-mesure.md`). Les chiffres de ce diagnostic restent ceux de la 1.0.5.
