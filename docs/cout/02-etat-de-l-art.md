# 02 — État de l'art : comment les autres économisent (et ce que disent les chiffres)

> Recherche faite le 26 octobre 2026, avant la 1.0.6 : pages des projets, documentation officielle de Claude Code et du SDK, billets d'ingénierie, articles de recherche. Les principes du §10 sont ceux que la 1.0.6 applique (voir `03-leviers.md` pour ce qui est livré).
>
> Étiquettes :
> - **[mesuré]** : chiffre publié avec une méthode ;
> - **[doc]** : comportement documenté, sans chiffre ;
> - **[annonce]** : affirmation sans méthode (marketing, témoignage) ;
> - **[non confirmé]** : vu seulement dans un résumé secondaire.
>
> Les tarifs au token ne sont **pas** recopiés ici : ils changent. Les ordres de grandeur du QG viennent du coût que **le SDK calcule lui-même** (`total_cost_usd`). Sur D4, ce calcul est cohérent avec : relecture en cache ≈ 0,1 × le prix d'entrée, écriture en cache 1 h ≈ 2 ×, Fable ≈ 2 × Opus par token.

## 1. Les multi-agents coûtent cher : c'est connu et mesuré

| Constat | Chiffre | Source |
|---|---|---|
| Un agent consomme environ **4 fois** les tokens d'un chat ; un système multi-agents environ **15 fois** | [mesuré] | Anthropic, *How we built our multi-agent research system* — https://www.anthropic.com/engineering/multi-agent-research-system |
| Les « agent teams » de Claude Code consomment environ **7 fois** les tokens d'une session normale (équipiers en mode plan) | [doc] | https://code.claude.com/docs/en/costs |
| Un agent de code consomme environ **1 000 fois** les tokens d'un chat de code ; ce sont les tokens d'**entrée** qui font le coût ; deux exécutions de la même tâche varient jusqu'à **30 fois** ; la précision plafonne à un coût intermédiaire | [mesuré] | *How Do AI Agents Spend Your Money?* — https://arxiv.org/abs/2604.22750 |
| Rapport entrée / sortie d'environ **100 : 1** ; le taux de réussite du cache est « la métrique la plus importante » | [mesuré, praticien] | Manus — https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus |
| Harnais complet (planificateur + générateur + évaluateur) : **6 h et 200 $**, contre 20 min et 9 $ en solo. Mais en solo, la fonction principale ne marchait pas. Dans une autre exécution : planificateur 0,46 $, réalisation 113,85 $, contrôle qualité 10,39 $ (≈ 8 %) | [mesuré] | Anthropic, *Harness design for long-running apps* — https://www.anthropic.com/research/harness-design-long-running-apps |
| Dans ChatDev, la **relecture de code** fait **59 %** des tokens | [mesuré, préliminaire] | *Tokenomics* — https://arxiv.org/abs/2601.14470 |

**Pour le QG :**
- La répartition de D4 est **typique** : 89 % chez les producteurs, ≈ 2/3 de relecture, 5 % pour le DG, 5 % pour les vérificateurs.
- La part du planificateur et du vérificateur est même **plutôt basse**.
- Le levier n'est donc pas le DG : c'est **la taille et la longueur des sessions des agents**.

## 2. Quand le multi-agent vaut le coup, et quand il ne le vaut pas

- **Il vaut le coup pour le travail parallèle et à forte valeur.** Exemple : la recherche, où 3 à 5 sous-agents en parallèle réduisent le temps de **jusqu'à 90 %** [mesuré, Anthropic]. Anthropic note que le code a « moins de tâches vraiment parallélisables » que la recherche.
- **Il perd sur le travail séquentiel.** Google et MIT : tous les variants multi-agents perdent **39 à 70 %** sur la planification séquentielle. Des agents indépendants **amplifient les erreurs 17 fois**, contre 4 fois avec un orchestrateur central. Et le surcoût grandit avec le nombre d'outils, l'exemple cité étant un agent de code à plus de 16 outils [mesuré] — https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/ , https://arxiv.org/abs/2512.08296
- **À budget de réflexion égal, un agent seul égale ou bat** les systèmes multi-agents en raisonnement multi-étapes. Ce n'est pas du code, mais la leçon s'applique : beaucoup de « gains » viennent juste de plus de calcul [mesuré] — https://arxiv.org/abs/2604.02460
- **Cognition**, *Don't Build Multi-Agents* (juin 2025) : des agents qui se partagent un même travail sans partager le contexte prennent des décisions incompatibles. Leur suite, *Multi-Agents: What's Actually Working* (2026), conclut :
  - **les écritures restent sur un seul fil, les lectures se parallélisent** ;
  - les sous-agents en lecture seule et le relecteur à contexte propre marchent ;
  - les essaims d'écrivains parallèles sont « surtout une distraction ».

  https://cognition.com/blog/dont-build-multi-agents , https://cognition.com/blog/multi-agents-working
- **Le compilateur C d'Anthropic** (16 agents, ≈ 20 000 $) : le parallélisme a marché sur des tests en échec indépendants, mais **n'a rien apporté** sur une tâche monolithique [mesuré] — https://www.anthropic.com/research/building-c-compiler
- **Cursor** : une coordination à plat par verrous s'effondre (« 20 agents ralentissent au débit de 2 ou 3 ») ; une hiérarchie planificateur → ouvriers → juge marche [non confirmé en source primaire] — https://cursor.com/blog/scaling-agents
- **Anthropic**, *Building effective agents* : commencer simple. Les agents échangent du coût et de la latence contre de la performance, et un **workflow fixe** coûte moins cher qu'un agent libre quand les étapes sont connues [doc] — https://www.anthropic.com/engineering/building-effective-agents

**Pour le QG :**
- Paralléliser **ce qui est indépendant** : des projets différents, des sources de bench différentes, des lectures.
- Garder **dans une même session** l'analyse et la réalisation d'un même code.
- Proposer un mode **agent direct** pour les petites demandes.
- Le DG reste un orchestrateur central, ce qui est la bonne forme. Il doit juste **dimensionner** le nombre d'agents à la demande. C'est ce que fait Anthropic : des règles dans le prompt du planificateur (« 1 agent pour une tâche simple, plus seulement si c'est complexe »).

## 3. Le contexte : compacter, masquer, condenser

| Technique | Chiffre | Source |
|---|---|---|
| **Masquage des vieilles sorties d'outils** (on garde les 10 dernières) : coût **divisé par 2**, taux de réussite inchangé ou meilleur (53,4 % → 54,8 %). Le résumé par LLM fait presque pareil (0,64 $, 53,8 %) mais **allonge les trajectoires de 13 à 15 %**. L'hybride masquage puis résumé est encore 7 à 11 % moins cher | [mesuré, NeurIPS 2025] | *The Complexity Trap* — https://arxiv.org/abs/2508.21433 |
| **Condensation OpenHands** : coût par tour jusqu'à **2 fois** plus bas, croissance **linéaire** au lieu de quadratique ; 54 % contre 53 % résolus | [mesuré, éditeur, petit échantillon] | https://openhands.dev/blog/openhands-context-condensensation-for-more-efficient-ai-agents |
| **Élagage de trajectoire** : AgentDiet −40 à −60 % de tokens d'entrée, −21 à −36 % de coût, performance égale ; SWE-Pruner −23 à −54 % | [mesuré] | https://arxiv.org/abs/2509.23586 , https://arxiv.org/abs/2601.16746 |
| **Édition de contexte + outil mémoire** (API Anthropic) : **−84 %** de tokens sur une évaluation de 100 tours ; +29 % à +39 % de performance en recherche agentique | [mesuré, éditeur] | https://claude.com/blog/context-management |
| **« Context rot »** : les 18 modèles testés se dégradent quand l'entrée s'allonge ; un prompt ciblé d'environ 300 tokens bat le prompt complet de 113 k | [mesuré] | https://www.trychroma.com/research/context-rot |
| Anthropic, *Effective context engineering* : compaction, **effacement des résultats d'outils** (« l'une des formes les plus sûres et légères »), prise de notes ; la performance baisse **progressivement** avec la longueur, sans falaise | [doc] | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents |

**Ce que Claude Code permet aujourd'hui** (doc officielle) :
- **`CLAUDE_CODE_AUTO_COMPACT_WINDOW`** : seuil de compaction automatique, de 100 000 à 1 000 000 tokens. Il s'applique aux modèles 1M. **Sans lui, un modèle 1M ne compacte que vers ~967 k.** On peut le passer par session (`options.env` du SDK) ; `autoCompactWindow` existe aussi pour les sous-agents — https://code.claude.com/docs/en/model-config
- `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (1 à 100, en pourcentage de cette fenêtre) ; `DISABLE_AUTO_COMPACT=1` ; `/compact` manuel par le SDK (`query({ prompt: '/compact', options: { continue: true, maxTurns: 1 } })`) ; observation du message `compact_boundary` (`pre_tokens`) — https://code.claude.com/docs/en/agent-sdk/slash-commands
- Pour avoir une **fenêtre de 200 k par session** au lieu de 1M : `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`.
- L'**effacement des résultats d'outils** propre à Claude Code n'a **pas** de réglage documenté. L'équivalent API (`context-editing`, avec `trigger`, `keep`, `clear_at_least`) n'est pas exposé tel quel dans Claude Code [non documenté].

**Pour le QG :**
- La compaction vers **150–250 k** est le levier le mieux étayé, et il est disponible tout de suite.
- Le seuil se **règle par profil** ; « The Complexity Trap » montre qu'il faut le réajuster selon l'outil.
- On compense l'absence d'effacement des sorties d'outils en **filtrant les sorties à la source** (§5).

## 4. Le cache : la clé de la relecture

D'après la doc de Claude Code ([prompt-caching](https://code.claude.com/docs/en/prompt-caching.md), [settings](https://code.claude.com/docs/en/settings-reference.md)) :
- **Durée de vie** :
  - abonnement : 1 h pour la conversation principale, 5 min pour les sous-agents ;
  - clé API : 5 min ;
  - réglable avec `CLAUDE_CODE_PROMPT_CACHE_TTL` / `promptCacheTtl` et `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL` (`5m` ou `1h`), ou `ENABLE_PROMPT_CACHING_1H=1` ;
  - chaque lecture remet le compteur à zéro.
- **Ce qui casse le cache** : changer de modèle, d'outils ou (sur la plupart des modèles) d'effort au cours d'une session. Le fast mode a son propre cache.
- **Un fork partage le cache de son parent.** Des agents qui démarrent avec le même préfixe ont intérêt à démarrer **à environ 5 s d'écart** pour que les suivants lisent le cache du premier (c'est ce que font les workflows de Claude Code).
- Le cache est propre à la machine et au dossier : des agents dans des worktrees différents ne le partagent pas.
- Une session reprise garde le prompt système de sa première requête : changer l'`append` ne casse pas son préfixe.

**Pour le QG :**
- Réembaucher un agent au **cache chaud** (< 1 h sur abonnement) coûte peu. Au cache **froid**, il faut réécrire tout son contexte, ce qui coûte 10 à 20 fois une relecture.
- **Le clone (fork) d'un agent chaud est bon marché.**
- Pour un compte à clé API, passer à 1 h pour les tâches qui attendent l'utilisateur.
- Échelonner de quelques secondes les lancements simultanés sur un même projet.
- Mesurer le **taux de réussite du cache** par session : `cacheLu / (cacheLu + cacheÉcrit + entrée)`.

## 5. Explorer une fois, transmettre l'essentiel

- **Sous-agents qui rendent un résumé** : ils explorent avec des dizaines de milliers de tokens et ne rendent que **1 000 à 2 000 tokens** [doc, Anthropic *Effective context engineering*].
  - Dans Claude Code, l'**Explore intégré hérite du modèle de la session** : Opus dans une session Opus. Pour l'avoir économique, il faut le redéfinir (option `agents` du SDK, `model: 'haiku'` ou `'sonnet'`) — https://code.claude.com/docs/en/sub-agents
  - L'option `agents` du SDK accepte `model`, `tools`, `maxTurns`, `effort` — https://code.claude.com/docs/en/agent-sdk/subagents
- **Cognition, SWE-grep** : plus de **60 %** du premier tour sert à retrouver du contexte ; une recherche parallèle prend 4 tours au lieu de 10 à 20 [mesuré] — https://cognition.com/blog/swe-grep
- **Carte du dépôt (Aider)** : tree-sitter + classement par graphe, coupée à environ **1 000 tokens** (`--map-tokens`) [doc]. Le duo **architecte / éditeur** (modèles différents) fait mieux que le solo : 80,5 % contre 77,4 % [mesuré, 2024] — https://aider.chat/2023/10/22/repomap.html , https://aider.chat/2024/09/26/architect.html
- **Roo Code** (archivé en mai 2026) : l'orchestrateur n'a **aucun outil de fichier** ; une sous-tâche ne reçoit qu'un message et ne rend **que son résumé** (`attempt_completion`) [doc].
- **Anthropic** (système de recherche) : les sous-agents passent des **références à des fichiers** plutôt que de recopier leur contenu à travers le chef.
- **Prudence** : une étude de février 2026 trouverait que des fichiers de contexte écrits par un LLM n'améliorent pas la réussite et coûtent **plus de 20 %** de plus [non confirmé] — https://arxiv.org/abs/2602.11988. La passation doit donc transmettre **le résultat lui-même** (un fichier livrable, aussi gros que nécessaire), plus des notes courtes qui disent où regarder (fichier:ligne, décisions). Pas un résumé en prose de plus.
- **Filtrer les sorties d'outils** : la doc des coûts de Claude Code montre un crochet (hook) `PreToolUse` qui fait passer la sortie des tests dans un filtre et la ramène de **dizaines de milliers de tokens à quelques centaines** [doc] — https://code.claude.com/docs/en/costs
  - Plafonds existants : `BASH_MAX_OUTPUT_LENGTH` (30 000 caractères par défaut), `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` (25 000), `MAX_MCP_OUTPUT_TOKENS` (25 000).
  - Le « shunt » de Spotify (un crochet bloque les lectures de fichiers entiers de plus de 350 lignes et les confie à un lecteur bon marché) : −82 à −94 % de tokens « chers », mais 10 à 30 s de latence par délégation, et un bug subtil raté [mesuré, très étroit].
- **Les outils MCP différés** (`ENABLE_TOOL_SEARCH`) : 50 outils pèsent 10 à 20 k tokens ; Anthropic mesure −85 % sur la définition des outils [doc] — https://code.claude.com/docs/en/agent-sdk/tool-search

**Pour le QG :**
- Fusionner analyse et réalisation, c'est explorer **une fois**.
- Quand il faut deux agents, l'amont transmet un **livrable complet** dans un fichier, plus des notes qui disent où regarder. L'aval lit le livrable au lieu de réexplorer le code.
- Ajouter un **sous-agent d'exploration léger**.
- **Filtrer** les sorties de tests.

## 6. La vérification : utile, à condition d'être ciblée

- La relecture par un agent à **contexte propre** marche : Devin Review trouve environ 2 bugs par PR, dont environ 58 % graves [mesuré, Cognition].
  - Le relecteur ne voit que le diff.
  - **Le codeur filtre les remarques à la lumière de l'intention de l'utilisateur.**
- **Un relecteur neuf « signalera généralement quelque chose »** même quand le travail est bon : il faut lui demander de ne signaler que les problèmes de **correction** [doc, Claude Code best practices] — https://code.claude.com/docs/en/best-practices
- **Commencer par les contrôles déterministes** (tests, types, lint). Le « LLM juge » n'est « généralement pas une méthode très robuste », et il est lent [doc, Anthropic Agent SDK] — https://claude.com/blog/building-agents-with-the-claude-agent-sdk
  - Le compilateur C : un vérificateur quasi parfait (les tests) a été essentiel ; des tests qui impriment peu et mettent « ERROR » et la raison sur une ligne.
- L'**autocorrection sans retour extérieur** n'aide pas, et parfois nuit [mesuré] — https://arxiv.org/abs/2310.01798
- L'évaluateur est un **surcoût pour une tâche dans les capacités du modèle**, et **utile à la limite de ses capacités** [mesuré, Anthropic *Harness design*].
- **MAST** (1 600 traces, 7 frameworks) : les échecs viennent surtout de la **conception du système** (≈ 44 %) et du **désalignement entre agents** (≈ 32 %), puis de la vérification (≈ 24 %, avec des vérificateurs « superficiels »). Mieux spécifier les rôles de ChatDev a apporté +9,4 points [mesuré ; répartition recalculée, non confirmée] — https://arxiv.org/abs/2503.13657
- Aucune étude contrôlée trouvée qui isole l'apport d'un vérificateur LLM indépendant pour des agents de code.

**Pour le QG :**
- Garder le vérificateur, mais :
  - **conditionnel** au risque et à la difficulté ;
  - **précédé des contrôles déterministes** ;
  - avec la consigne « **correction seulement** » ;
  - **une seule boucle** de rework ;
  - **repris** plutôt que relancé.
- Au rework, le producteur **filtre** les remarques par rapport à la mission.
- Soigner les **critères d'acceptation** du plan rapporte plus qu'ajouter des agents (MAST).

## 7. Modèles et effort (pour information : la contrainte de l'utilisateur les garde)

- **Un meilleur modèle bat un plus gros budget de tokens** : passer à Sonnet 4 a battu le doublement du budget de Sonnet 3.7 [mesuré, Anthropic recherche].
- **Effort** :
  - Opus 4.5 en `medium` égalait Sonnet 4.5 sur SWE-bench Verified avec 76 % de tokens de sortie en moins ;
  - pour Opus 5.5, `medium` égalerait Opus 5 en `high` avec 20 à 25 % de sortie en moins (citation client) ;
  - la doc prévient que `max` peut « trop réfléchir ».

  https://www.anthropic.com/news/claude-opus-4-5 , https://www.anthropic.com/news/claude-opus-5-5
- **Surréflexion** : choisir la solution qui réfléchit le moins sur SWE-bench Verified donnerait environ **+30 % de performance et −43 % de coût** [mesuré] — https://arxiv.org/abs/2502.08235. HAL (ICLR 2026) : plus d'effort a **baissé** la précision dans la plupart des exécutions [non confirmé] — https://arxiv.org/abs/2510.11977
- **Routage** : FrugalGPT, RouteLLM (−35 à −85 % de coût à 95 % de la qualité de GPT-4). Il faut router **par session ou par sous-agent**, jamais par tour, puisque changer de modèle reconstruit le cache — https://arxiv.org/abs/2305.05176 , https://lmsys.org/blog/2024-07-01-routellm/
- **Escalade plutôt que paiement d'avance** : oh-my-opencode n'appelle son modèle fort qu'après 2 échecs. L'« advisor » d'Anthropic (Sonnet conseillé par Opus) : +2,7 points sur SWE-bench Multilingual pour 11,9 % de coût en moins, mais seulement par API et expérimental [mesuré, éditeur] — https://claude.com/blog/the-advisor-strategy

**Pour le QG** : rien à changer d'office, puisque l'utilisateur veut garder ses modèles et ses efforts. Deux pistes sont **notées pour plus tard**, et seulement s'il le demande :
- la grille « Fable pour le *difficile*, pas pour le *long* » ;
- des essais de producteurs en `medium` sur les tâches d'implémentation au périmètre clair. La grille actuelle le fait déjà pour certaines.

## 8. Budgets et arrêts

- Le SDK a **`maxBudgetUsd`** (`error_max_budget_usd`, avec `total_cost_usd` et `session_id` toujours fournis) et `maxTurns` (`error_max_turns`). Le plafond est une estimation côté client et peut être un peu dépassé — https://code.claude.com/docs/en/agent-sdk/agent-loop.md#turns-and-budget
- **Les exécutions qui échouent dépensent plus** : 33 à 440 % de tokens d'entrée en plus sur la réparation multi-morceaux (« ne pas échouer vite ») [mesuré] — https://arxiv.org/abs/2511.11012
- Addy Osmani suggère un budget par agent avec une pause à 85 % et 8 itérations au plus [suggestion, non mesurée].
- *AI Agents That Matter* : toujours **publier le coût à côté de la qualité**. Une stratégie simple à 2,45 $ a battu une stratégie complexe à 134,50 $ [mesuré] — https://arxiv.org/abs/2407.01502

**Pour le QG** : un plafond par tâche, proportionnel à l'estimation, dans les profils Économe et Équilibré. À l'arrêt, c'est le DG qui décide, avec trois choix clairs. On mesure toujours le coût **avec** la qualité (`06-mesure.md`).

## 9. Les orchestrateurs du marché

| Projet | Ce qu'il fait | Ce qui concerne le coût et le temps | Preuve |
|---|---|---|---|
| **Claude Code** : sous-agents, agent teams, workflows dynamiques, advisor | Les équipiers sont des sessions séparées qui ne reçoivent que leur prompt de lancement. Les workflows sont un script JS dont les résultats intermédiaires restent hors de tout contexte | `model`, `effort`, `maxTurns`, `autoCompactWindow` par sous-agent ; démarrages échelonnés de 5 s pour partager le cache ; un fork réutilise le cache du parent ; teams ≈ 7 × de tokens ; conseil : Sonnet pour les équipiers, 3 à 5 équipiers | [doc] |
| **Ruflo** (ex claude-flow), github.com/ruvnet/claude-flow | Essaim, routeur, mémoire vectorielle autour de Claude Code (MCP) | Les économies de 60–75 % n'apparaissent que dans des billets tiers | [annonce] |
| **Claude Squad**, **ccmanager**, **Conductor** (code fermé), **Vibe Kanban** (en fin de vie), **Crystal** (remplacé par Nimbalyst) | Multiplexeurs : une branche ou un worktree et un terminal par agent, une interface de relecture | Isolation et vitesse ; aucune économie de tokens documentée. ccmanager : un juge Haiku pour approuver automatiquement | [doc] |
| **opencode**, opencode.ai/docs | Sous-agents General et Explore en sessions filles | `model` par agent, `steps` plafonne les itérations, `compaction.auto` (activé par défaut), `compaction.prune` (efface les vieilles sorties d'outils), `small_model` pour les tâches annexes | [doc] |
| **oh-my-opencode** | Orchestrateur « Sisyphus » qui délègue par catégorie | Explore et Librarian sur des modèles rapides et bon marché, en arrière-plan ; le modèle fort « Oracle » seulement après 2 échecs | [doc communautaire] |
| **Roo Code** (archivé) | Orchestrateur « Boomerang » sans outils de fichier | Une sous-tâche reçoit un message et ne rend qu'un résumé ; condensation du contexte | [doc] |
| **Cline** | Compaction automatique | La compaction réutilise le cache, donc coûte à peu près un appel d'outil ; `new_task` passe la main à une tâche fraîche | [doc] |
| **Kilo Code** | Orchestrateur abandonné au profit de sous-agents `task` (explore, general) en avant-plan ou en arrière-plan | — | [doc] |
| **OpenHands** | Condenseur : garde les N premiers et les derniers événements, résume le milieu | Coût par tour jusqu'à 2 × plus bas, croissance linéaire | [mesuré, éditeur] |
| **Aider** | Carte du dépôt (≈ 1 k tokens) ; architecte / éditeur | +3 à +5 points pour le duo | [mesuré, 2024] |
| **SWE-agent** / **mini-swe-agent** | Processeurs d'historique (`last_n_observations`) ; mini-swe-agent : 100 lignes, bash seul, historique linéaire | Attention, l'élision « casse le cache » (d'où le `polling`, qui regroupe les coupures) ; >74 % SWE-bench Verified annoncé | [doc] / [annonce] |
| **MetaGPT**, **ChatDev** | Rôles avec procédures, documents structurés plutôt que du chat ; ChatDev 2 : workflows YAML en graphe | Pas de chiffres de coût dans les pages lues | — |
| **CrewAI**, **LangGraph**, **AutoGen** | Frameworks généralistes | Aucune fonction de coût décrite | — |
| **oh-my-claudecode** | Boucle plan → prd → exec → verify → fix | « −30 à 50 % de tokens » sans méthode | [annonce] |
| **Bernstein** | « Un appel LLM, puis du Python » pour ordonnancer ; un « janitor » lance tests, lint et types avant la fusion | 400 $ par mois, en témoignage | [annonce] |

**À ne pas copier :**
- l'essaim avec consensus ou mémoire apprenante (Ruflo) ;
- les agent teams pour du travail séquentiel (≈ 7 × de tokens) ;
- les écrivains parallèles sur les mêmes fichiers ;
- tout « −30 à −75 % » sans méthode.

**Ce que le QG fait déjà bien :**
- l'orchestration est dans le code (l'ordonnanceur), pas dans un contexte de LLM ;
- le DG est central, avec des plans structurés et validés par le serveur ;
- des verrous d'écriture empêchent deux dossiers d'écrire dans le même projet ;
- les vérificateurs ont un contexte propre et reçoivent le diff ;
- la réserve d'agents réutilise un contexte.

**Il lui manque l'hygiène du contexte et la proportionnalité.**

## 10. Les dix principes retenus pour le QG

1. **Paralléliser tout ce qui est indépendant** (lectures, et écritures sur des fichiers distincts avec des tests ciblés) ; **sérialiser ce qui touche une ressource partagée** (fichier commun, build complet, appareil, compte externe).
2. **Le coût = taille du contexte × nombre de tours.** Compacter vers 150–250 k, filtrer les sorties à la source.
3. **Soigner le cache** : le mesurer ; ne jamais changer de modèle, d'outils ou d'effort au cours d'une session ; réembaucher à chaud ; échelonner les démarrages ; 1 h pour les comptes à clé API qui attendent.
4. **Explorer une fois** : une seule session pour analyser et réaliser ; un sous-agent d'exploration léger qui rend un résumé ; une passation par livrable complet, avec des notes qui disent où regarder.
5. **Garder les grosses sorties hors du contexte** : tests filtrés, MCP différés.
6. **Dimensionner le workflow à la demande** : agent direct pour les petites demandes, peu de tâches bien calibrées pour les autres.
7. **Vérifier juste** : d'abord le déterministe ; un vérificateur seulement si le risque le justifie, avec la consigne « correction seulement », une boucle, et une reprise plutôt qu'une relance.
8. **Des spécifications et des critères précis** plutôt que plus d'agents.
9. **Un budget et un arrêt par tâche**, puis une décision du DG.
10. **Mesurer coût et qualité ensemble**, et retirer un rouage à la fois quand le modèle change.

## 11. Ce qui reste à confirmer
- Les chiffres exacts des tarifs 5.x : les sources secondaires se contredisent. On se fie au coût calculé par le SDK.
- Un réglage d'effacement des résultats d'outils propre à Claude Code : non documenté au 26/10/2026.
- L'équivalent de `CLAUDE_CODE_AUTO_COMPACT_WINDOW` pour Codex : pas branché dans la 1.0.6 (le réglage est indiqué « sans effet pour Codex »).
- La valeur réelle de la compaction, du sous-agent d'exploration et des autres leviers sur le QG : **pas encore mesurée**. Les essais réels S, M et L de `06-mesure.md` n'ont pas été faits.
