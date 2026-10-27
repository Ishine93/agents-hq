# 03 — Catalogue des leviers

> Catalogue écrit le 26/10/2026 pour préparer l'économie de jetons, **livrée dans la 1.0.6**. La dernière colonne du tableau dit ce que la 1.0.6 en a fait ; les écarts sont détaillés à la fin (« Ce qui a changé à la livraison »).
>
> Chaque levier a :
> - un **identifiant** (repris dans `05-specification.md`) ;
> - son **axe** : *gratuit* = actif partout ; *Coût* = dépend du réglage Coût ;
> - son **effet** estimé ;
> - son **risque** pour la qualité ;
> - sa **preuve** ;
> - son **lot**.
>
> Les gains sont estimés sur D4 (`01-diagnostic.md`). Ils **n'ont pas encore été mesurés** sur la 1.0.6 : les essais réels de `06-mesure.md` ne sont pas faits. « Relu » = tokens relus depuis le cache.

## Vue d'ensemble, par priorité

| # | Levier | Axe | Effet coût | Effet temps | Risque qualité | Effort | Lot | Dans la 1.0.6 |
|---|---|---|---|---|---|---|---|---|
| L1 | Compaction des sessions à un seuil réglable | Coût (et gratuit à 400 k) | **très fort** sur les longues tâches (T4 −59 % relu à 200 k) | léger + | faible à ≥ 200 k | faible | A2 / B6 | livré (A1, A2, B6) |
| L2 | Reprise de la session du vérificateur après un rework | gratuit | moyen (une vérif neuve en moins par rework) | + | nul | faible | A3 | livré (A3) |
| L3 | Analyse et réalisation du même code dans une seule tâche | Coût | fort (une exploration en moins) | **+ (un maillon de moins)** | nul à faible | faible (directive) | B3 | livré (B3) |
| L4 | Mode « agent direct » pour les petites demandes | Coût | **très fort sur les petites demandes** (≈ conversation unique) | **++** | faible | moyen | B4 | livré (B4) |
| L5 | Garde-fou de périmètre | Coût | fort sur les grosses demandes | + | nul (c'est ce que veut l'utilisateur) | faible (directive) | B3 | livré (B3) |
| L6 | Vérification proportionnée au risque, appliquée par le serveur | Coût | moyen | + | faible | moyen | B5 | livré (B5), avec un écart |
| L7 | Gestes économes : modifications et lectures regroupées, lectures ciblées, sorties filtrées, tests ciblés | gratuit | moyen à fort (moins de tours) | + | nul | faible (directive) | A4 | livré (A4), avec un écart |
| L8 | Sous-agent d'exploration léger | Coût | moyen (à mesurer) | + (lectures parallèles) | faible | moyen | B7 | livré (B7), non mesuré |
| L9 | Estimation du plan et accord au-delà d'un seuil | Coût | évite les mauvaises surprises | − (une attente) | nul | moyen | C1–C2 | livré (C1, C2) |
| L10 | Plafond par tâche (`maxBudgetUsd`) | Coût | coupe les dérives (×30 de variance) | = | faible (le DG décide ensuite) | faible | B6 | livré (B6 + C1) |
| L11 | Réserve : garder les agents savants, réembaucher à chaud | gratuit | moyen | + | nul | faible | A5 | en partie (A5) |
| L12 | Passation par livrable : le résultat complet dans un fichier, des notes courtes qui disent où regarder | gratuit | moyen (l'aval lit le livrable au lieu de réexplorer) | + | nul | faible (directives) | A9 | livré (A9) |
| L13–L17 | *(retirés : le réglage Rapidité a été abandonné le 26/10/2026)* | — | — | — | — | — | — | — |
| L18 | Ambiance coupée en Économe | Coût | faible | = | nul | faible | B8 | livré (B8) |
| L19 | Critères `doneWhen` robustes au parallélisme | gratuit | faible (évite des blocages et des réveils) | + | nul | faible (directive) | A6 | livré (A6) |
| L20 | Mesure intégrée : profil, estimé, réel, compactions, taux de cache | gratuit | indirect | = | nul | moyen | C3 | livré (C3) |
| L21 | TTL du cache à 1 h pour les comptes à clé API | gratuit | moyen sur les tâches qui attendent | = | nul | faible | A7 | livré (A7) |
| L22 | Coût fixe des sessions mesuré et réduit | gratuit | faible | = | nul | faible | A8 | en partie (A8 : mesure seulement) |
| L23 | Vérificateur « correction seulement » ; le producteur filtre les remarques au rework | gratuit | moyen (moins de reworks inutiles) | + | nul | faible (directives) | A9 | livré (A9) |
| L24 | Démarrages échelonnés pour partager le cache | gratuit | faible (préfixe de 15–24 k lu au lieu d'écrit) | ≈ (+ 5 s) | nul | faible | A10 | livré (A10) |
| L25 | Filtre des sorties de tests par un crochet | gratuit (optionnel) | moyen sur les tâches avec beaucoup de tests | + | faible (garder les échecs entiers) | moyen | A11 | livré (A11) |
| L26 | Contrôles déterministes lancés par le serveur avant le vérificateur | Coût (optionnel) | moyen (un rework sans session de vérif) | + | nul | moyen (sécurité : liste blanche) | B9 | livré (B9) |
| L27 | *(optionnel, touche au modèle)* Fable pour le difficile, pas pour le long | hors niveaux | fort (T4 = 59 % de D4) | = | à évaluer | faible | hors périmètre | non fait (hors périmètre) |
| L28 | Règle générale : découper selon ce qui est indépendant, regrouper selon ce qui est partagé | gratuit | moyen à fort sur les demandes en liste | **++** (parallèle là où c'est indépendant, une question groupée au départ) | nul | faible (directive) | A12 | livré (A12), avec un écart |
| L29 | Verrous de ressources déclarées (appareil, application, compte externe, document) | gratuit (optionnel) | évite les conflits et les reprises | = | nul | moyen | B10 | **non fait** (B10) |

## Détail

### L1 — Compaction réglable
- **Constat** : aucune session ne compacte. Le seuil par défaut des modèles 1M est d'environ 967 k (C1).
- **Action** : `CLAUDE_CODE_AUTO_COMPACT_WINDOW` par session, selon le rôle et le profil :

  | Rôle | Économe | Équilibré | Max |
  |---|---|---|---|
  | Producteurs | 150 k | 200 k | 400 k |
  | Vérificateurs | 120 k | 150 k | 300 k |
  | DG | 300 k | 300 k | 300 k |

- **Preuve** :
  - simulation sur les transcripts de D4 (`01-diagnostic.md` §C1) ;
  - *Complexity Trap* et OpenHands (coût divisé par environ 2 à qualité égale) ;
  - *context rot*.
- **Risque** : perte de détails après le résumé ; l'agent relit parfois un fichier. Faible à 200 k et plus.
- **Ne pas faire** : compacter à 100 k sur des tâches de code. Les trajectoires s'allongent avec les résumés (+13 à 15 %, *Complexity Trap*), donc il faut un seuil assez haut pour que l'agent ait fini de comprendre avant de résumer.

### L2 — Reprendre le vérificateur
- **Constat** : 2 vérifications neuves pour T4 et pour T11 (C3).
- **Action** : `resume` de la session de vérification, avec le nouveau diff et la consigne « revérifie d'abord tes points ». Session neuve si le cache est froid (> 55 min).
- **Preuve** : la reprise lit le contexte en cache au lieu de réexplorer.

### L3 — Une tâche pour analyser et réaliser
- **Constat** : T3 puis T4 (C2) ; directive « Sépare ce qui se mesure de ce qui en dépend ».
- **Action** : directive et bloc profil. On ne sépare que pour des projets différents, des sources de bench indépendantes, ou quand l'analyse doit être **validée par l'utilisateur** avant la réalisation. Dans ce dernier cas, on réembauche le même agent.
- **Preuve** : Cognition (« les écritures sur un seul fil ») ; Google / MIT (le multi-agent perd sur le séquentiel).

### L4 — Agent direct
- **Constat** : une petite demande paie DG + producteur + vérificateur, soit 2 à 4 fois une conversation.
- **Action** : `mode: 'direct'` dans le plan. Une tâche dont la mission est la demande telle quelle, plus le contexte du DG, en vérification `self`.
- **Preuve** : Anthropic (« 1 agent pour une tâche simple ») ; *Building effective agents* (« commencer simple ») ; Claude Code best practices (« pas de plan si le diff tient en une phrase »).

### L5 — Périmètre
- **Constat** : « est-ce possible ? » a donné 2 lots d'implémentation et une revue d'ensemble (C6).
- **Action** :
  - « meilleur résultat au juste coût » ;
  - une question donne une étude, puis une question à l'utilisateur ;
  - pas d'à-côtés sans demande ;
  - en Max, les à-côtés deviennent des tâches « bonus » soumises à approbation.

### L6 — Vérification proportionnée
- **Constat** : 6 vérificateurs pour D4, dont certains sur des tâches localisées (T1 : sonnet vérifié par opus).
- **Action** : politique `self` / `risque` / `code` selon le profil, appliquée par le serveur (B5).
- **Preuve** : *Harness design* (le vérificateur est un surcoût dans les capacités du modèle, utile à leur limite) ; Agent SDK (préférer les contrôles à base de règles).

### L7 — Gestes économes
- **Constat** : 106 `Edit` séparés, des `cat` de fichiers entiers, des sorties de tests entières (C4).
- **Action** : directive des agents (A4).
  - Les outils de lecture s'exécutent en parallèle quand ils sont dans le même message.
  - Edit, Write et Bash s'exécutent l'un après l'autre, mais **plusieurs dans un même message = un seul appel au modèle**.
- **Preuve** : la doc du SDK (exécution parallèle des outils en lecture) ; la doc des coûts (filtrer les sorties).

### L8 — Explorateur léger
- **Action** : option `agents` du SDK, `explorateur` (et `Explore`) en Sonnet ou Haiku, outils en lecture seule, résumé de 300 mots.
- **Attention** :
  - l'Explore intégré hérite du modèle de la session ;
  - les sous-agents ont un cache de 5 min et un coût de démarrage.
- **Preuve** : *Effective context engineering* (résumés de 1 à 2 k) ; oh-my-opencode ; SWE-grep.
- **À mesurer** avant de l'encourager hors d'Économe.

### L9 — Estimation et accord
- **Action** : estimation par l'historique (nature × niveau de modèle × vérification), convertie en % de la fenêtre de 5 h grâce à un rapport appris. Accord au-delà d'un seuil, avec « Réduire » qui renvoie au DG.
- **Preuve** : *How Do AI Agents Spend Your Money?* : les modèles prédisent mal leur propre coût, donc on estime par l'historique et pas par le LLM.

### L10 — Plafond par tâche
- **Action** : `maxBudgetUsd` = facteur × estimation. Sur `error_max_budget_usd`, le DG choisit : relancer avec plus, accepter, ou découper.
- **Preuve** : la variance va jusqu'à 30 fois ; les échecs dépensent plus.

### L11 — Réserve
- **Action** :
  - la retraite se décide sur le contexte **après** compaction ;
  - le DG voit « cache chaud / froid » ;
  - on réembauche à chaud ;
  - le clone (fork) partage le cache de son parent.

### L12 — Passation par livrable
- **Le principe** : la passation a deux parties.
  1. **Le livrable** : le résultat **complet** dans un fichier (bench, analyse, conception), **sans limite de taille**. C'est lui que la tâche suivante lit, en entier si c'est sa matière première (les benchs pour une synthèse).
  2. **Les notes de passation** (`handoffNotes`) : le **mode d'emploi** du livrable. Elles disent où il est, quelles sections comptent, les décisions et leurs raisons, les pièges, et les fichiers:lignes clés du code touché. Courtes, sans recopier le livrable.
- **Pourquoi pas seulement des notes** : un gros bench ne tient pas en quelques lignes, et le résumer ferait perdre de l'information. Ce qui coûtait cher dans D4, ce n'était pas la lecture du livrable (l'analyse de 55 Ko lue par T4 était légitime), c'était la **réexploration du code** par l'aval.
- **Côté DG** : le livrable est nommé dans le `doneWhen` de l'amont. L'aval en dépend en `besoin: 'artifact'`, un mécanisme qui existe déjà, et l'aval attend toujours que l'amont soit terminé **et vérifié**.
- **Preuve** : Anthropic (les sous-agents passent des références à des fichiers plutôt que de recopier leur contenu) ; prudence sur les longs fichiers de contexte en prose écrits par un LLM : le livrable doit être le résultat lui-même, pas un résumé de plus.

### L13 à L17 — retirés
Ils formaient le réglage « Rapidité » : parallélisme par profil, vérification non bloquante, délai des questions, regroupement des réveils, fast mode. L'utilisateur l'a abandonné le 26/10/2026. Une tâche aval ne doit jamais partir d'un résultat qui n'a pas passé sa vérification. Les identifiants ne sont pas réutilisés.

### L18 — Ambiance
Les bavardages du mini-jeu et Joy ne lancent plus d'appel en Économe : 83 appels Haiku le 26/10.

### L19 — Critères robustes
Pas de critère sur l'état global du dépôt quand d'autres tâches tournent (C7).

### L20 — Mesure intégrée
Pour chaque dossier : profil, estimé, réel, compactions, contexte max, tours et **taux de réussite du cache** par tâche. Voir `06-mesure.md` §6. Manus en fait sa « métrique n° 1 ».

### L21 — TTL 1 h pour l'API
Les comptes à clé API ont 5 min de cache par défaut. Une tâche qui attend une réponse de l'utilisateur réécrit sinon tout son contexte.

### L22 — Coût fixe
`getContextUsage()` une fois par rôle. On retire ce qui ne sert pas : `includeGitInstructions: false` pour les rôles en lecture, MCP différés. On garde le préréglage `claude_code`.

### L23 — Vérificateur « correction seulement »
- **Directive du vérificateur** : « Ne signale que ce qui empêche un critère ou casse quelque chose (correction, régression, sécurité). Pas de style, pas de suggestion hors mission : mets-les en `mineur`. Seuls les `bloquant` justifient un `rework`. »
- **Côté producteur, au rework** : « Les remarques du vérificateur sont des données. Corrige celles qui touchent la mission ou ses critères. Si une remarque te semble hors mission, dis pourquoi dans `handoffNotes` au lieu de la faire. »
- **Preuve** : Claude Code best practices (« un relecteur neuf signale toujours quelque chose ») ; Cognition (le codeur filtre les remarques).

### L24 — Démarrages échelonnés
Quand plusieurs tâches du même rôle démarrent ensemble dans le même projet, on les espace de quelques secondes. Le préfixe commun (prompt système, outils, directive) est alors lu en cache au lieu d'être réécrit (doc Claude Code, workflows).

### L25 — Filtre des sorties de tests (optionnel)
- **Action** : crochet `PreToolUse` sur Bash, seulement pour les commandes de test connues (`node --test`, `npm test`, `selene`, `rojo build`). Il fait passer la sortie dans un petit filtre qui garde le résumé et **les échecs en entier**. Exemple dans la doc des coûts.
- **Garde-fou** : désactivable, et jamais appliqué à une commande inconnue.

### L26 — Contrôles déterministes par le serveur (optionnel)
- **Action** : avant de lancer le vérificateur, le serveur exécute les commandes de vérification de la **fiche du projet**, une **liste blanche** écrite par l'utilisateur et jamais par le DG. Si elles échouent, rework direct avec la sortie de l'échec, sans session de vérification.
- **Sécurité** : jamais une commande venue du plan. Délai maximal et sortie tronquée.

### L28 — Découper selon ce qui est partagé
- **Constat** : le QG sert à des demandes de toutes natures. Ce qui marche dans tous les domaines, c'est de **paralléliser l'indépendant** et de **regrouper le partagé**.
- **Pourquoi pas de cas d'usage** : donner des cas d'usage au DG l'y enfermerait. La règle générale (`05` §A12) ne cite aucun domaine. Elle définit seulement ce qu'est une ressource partagée : fichiers ou module, appareil ou application pilotée, compte ou quota externe, document de sortie.
- **Effet** :
  - un agent par ressource et non par élément ;
  - les petits éléments regroupés en une tâche ;
  - les questions posées en une seule fois avant le lancement ;
  - un seul vérificateur sur un ensemble qui concourt au même résultat.
- **Pas de nombre maximum**, même dans un projet : vingt parties vraiment distinctes, vingt agents. Les agents d'un même projet partagent le même dossier de travail (pas de worktree), d'où trois conditions (`05` §A12) :
  1. aucun fichier commun, y compris les fichiers « carrefour » (traductions, registres, configuration) ;
  2. des tests ciblés par tâche, avec le build complet une seule fois à la fin ;
  3. aucun service ni outil unique utilisé par deux tâches à la fois.

  Les agents qui ne font que lire peuvent être nombreux. Le « 3 à 5 » des sources ci-dessous décrit des équipes **sans ces précautions**, sur un même code.
- **Preuve** :
  - Cognition : les écritures sur un seul fil, les lectures en parallèle ;
  - le compilateur C d'Anthropic : 16 agents utiles sur des tests indépendants, sans gain sur une tâche monolithique ;
  - Cursor et la doc Claude Code : 3 à 5 écrivains sur un même code partagé, un propriétaire par fichier. C'est une prudence pour des équipes qui partagent tout, pas une loi ;
  - le système de recherche d'Anthropic : plus de dix sous-agents en lecture sur les demandes complexes ;
  - MAST : les échecs viennent surtout de la conception et du désalignement entre agents.
- **À savoir** : plus d'agents en parallèle ne consomme pas plus de tokens au total, mais vide la fenêtre de 5 h plus vite. Le plafond de parallélisme des Réglages reste là pour ça.

### L29 — Verrous de ressources déclarées (optionnel)
- **Constat** : le serveur ne verrouille que les projets. Deux tâches qui pilotent le même appareil, la même application ou le même compte externe peuvent tourner en même temps.
- **Action** : champ `ressources` dans le plan. Le serveur sérialise les tâches qui partagent une ressource déclarée, sur le modèle des verrous de projet (`05` §B10).

### L27 — Fable pour le difficile (hors niveaux)
La grille actuelle (« tâche très longue → fable / high ») place la session la plus longue sur le modèle le plus cher par token. **Hors périmètre de la 1.0.6** (et non fait), sauf si l'utilisateur le demande, puisqu'il veut garder la main sur les modèles. À noter seulement : c'est le plus gros poste de D4.

## Ce qui a changé à la livraison (1.0.6)

- **L1** : le seuil passe par `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (`serveur/economie.js`, `envSessionPour`), avec les valeurs du tableau ci-dessus selon le niveau du dossier. Les compactions sont comptées (`compact_boundary`) et affichées. Pour Codex, le seuil n'est **pas branché** : le bouton est indiqué « sans effet pour Codex ».
- **L2** : reprise seulement si la dernière vérification date de moins de 55 min ; sinon, ou si la reprise échoue, session neuve.
- **L6** : une relecture demandée par l'utilisateur garde le vérificateur **aussi en Équilibré** (la spec ne le disait que pour Économe ; sinon Équilibré aurait été plus économe qu'Économe sur ce point). Une approbation, un risque élevé ou une validation « par toi » convertie en IA gardent aussi le vérificateur à tous les niveaux.
- **L7** : la règle « une commande par appel Bash » est **gardée** : les règles de permission (`Bash(git push…)`) en dépendent. La directive ajoute « regroupe tes lectures par Read/Grep/Glob en parallèle ».
- **L8** : explorateur et `Explore` en lecture seule (Read, Grep, Glob), Haiku en Économe et Sonnet sinon, 25 tours. Aucun essai réel : le gain n'est pas mesuré.
- **L10** : plafond = facteur du niveau × estimation de la tâche (lot C), avec un plancher de 0,50 $ ; pas de plafond sans estimation. En cas de dépassement, la tâche s'arrête sur « Plafond atteint » et le DG a trois choix : relancer avec plus, accepter, découper.
- **L11** : seul l'affichage « cache chaud / froid » au DG est fait. La règle de retraite (150 k de contexte en fin de tâche) n'a pas changé ; avec la compaction, ce contexte retombe plus souvent sous le seuil, mais ce n'est pas mesuré.
- **L22** : `getContextUsage` (résumé) une fois par rôle et par démarrage, écrit dans `runtime/logs/contexte-fixe.json`. **Aucun poste n'est retiré** : il faut d'abord des mesures réelles.
- **L23** : en plus des directives, le serveur transforme un `rework` sans aucun point `bloquant` en `pass` (les remarques mineures restent visibles).
- **L25** : filtre `outils/filtre-tests.mjs` (20 premières lignes, blocs d'échec entiers, 15 dernières), code de sortie conservé, commandes simples seulement (pas de tube, de redirection, de `&&` ni de `;`). Réglage `filtreTests` (case dans Réglages › Général). Claude seulement : pas d'équivalent pour Codex.
- **L26** : bloc ` ```verifications ` de la fiche du projet, 10 commandes au plus, délai de 5 min, arrêt au premier échec. Les contrôles sont sautés si d'autres tâches écrivent encore dans le même projet.
- **L28** : la phrase « il n'y a pas de limite au nombre d'agents » n'a **pas** été reprise : elle contredisait la règle existante « 12 tâches au plus » (le maximum par niveau est 4, 8 ou 12).
- **L29** (verrous de ressources, B10) : **pas fait**. Seuls les projets sont verrouillés, comme en 1.0.5.
