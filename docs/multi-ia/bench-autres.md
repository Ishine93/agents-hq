# Bench des autres IA (hors OpenAI/Codex) pour le QG des agents

Tâche T6, rédigée le 26 octobre 2026. Toutes les sources ont été consultées ce jour-là. Quand une page porte sa propre date, elle est indiquée. Quand elle n'en porte pas, c'est écrit « sans date ».

Règle de lecture : **un fait sans source officielle est marqué « non vérifié »**. Les articles de blogs et forums sont signalés comme secondaires. OpenAI/Codex est couvert par une autre tâche.

## 1. Résumé en 10 lignes

1. **Presque tous les acteurs ont maintenant un agent en ligne de commande avec mode `-p` et sortie JSON en flux** : Grok Build, Cursor, Antigravity (qui remplace Gemini CLI), Copilot CLI, Mistral Vibe, Qwen Code, Kimi Code, OpenCode.
2. **L'ACP (Agent Client Protocol) est le levier principal.** Le registre officiel liste 43 agents (cdn.agentclientprotocol.com, 26/10/2026), dont Grok Build, Cursor, Copilot, Gemini, Antigravity, Mistral Vibe, Qwen Code, Kimi, OpenCode, Goose, Devin, Junie. Un seul client ACP dans le QG ouvrirait tous ces agents.
3. **Gros changement : Gemini CLI est mort pour les abonnés grand public.** Depuis le 18 juin 2026, il ne sert plus Google AI Pro/Ultra ni le gratuit. Il est remplacé par Antigravity CLI (`agy`), qui a un mode headless JSON.
4. **Risque de conditions d'utilisation chez Google.** Une réponse sur le forum officiel (8/10/2026, rôle de l'auteur non confirmé) dit que piloter `agy` depuis un autre agent sous connexion grand public peut déclencher une suspension de compte. Pour le QG, utiliser Gemini par clé API.
5. **Les agents « abonnement » sont utilisables sans clé :** Grok Build (SuperGrok / X Premium+), Cursor (compte Cursor), Copilot CLI (abonnement GitHub Copilot), Mistral Vibe (Pro/Team), Kimi Code (abonnement Kimi). Le droit de les automatiser n'est écrit nulle part de façon explicite, sauf pour Cursor (SDK) et Kimi (clients tiers documentés).
6. **Pour Claude Code sur un autre modèle** (`ANTHROPIC_BASE_URL`) : DeepSeek, Kimi, Z.ai (GLM), Alibaba (Qwen), OpenRouter, Ollama et LM Studio exposent un point d'accès compatible Anthropic. C'est le chemin le moins cher à coder, mais Anthropic dit ne pas le supporter et le code actuel (`envPour`) supprime justement ces variables.
7. **Outils spécialisés (verdict B) :** images et vidéo chez xAI (Imagine, dès 0,02 $ l'image) et Google (Nano Banana, Veo), recherche web sourcée chez Perplexity (Agent API et Search API), Mistral (outil de génération d'images).
8. **Local :** Ollama et LM Studio parlent le format Anthropic et le format OpenAI. Claude Code peut tourner dessus (`ollama launch claude`), avec un contexte d'au moins 64k.
9. **Recommandation :** (1) comptes « fournisseur compatible Anthropic » (petit chantier), (2) un client ACP générique pour les agents complets, (3) des outils spécialisés exposés au QG sous forme de serveurs MCP ou d'appels API.
10. **Inconnues principales :** conditions d'automatisation des abonnements (xAI, Cursor, Copilot, Mistral), variable de dossier de config chez Grok/Cursor/Qwen/Mistral, comportement exact du client ACP côté fichiers et terminal.

## 2. Tableau comparatif

Légende verdict : **A** = intégrable comme agent complet ; **B** = intégrable comme outil spécialisé via API ; **C** = non intégrable. « A (indirect) » = pas d'agent propre, mais Claude Code peut tourner sur leur API.

| Fournisseur | Agent CLI / SDK pilotable | JSON en flux | ACP | MCP | Connexion abonnement | Clé API | Isolation multi-comptes | Windows + macOS | Points forts pour le QG | Automatisation permise ? | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **xAI Grok** | Grok Build (`grok -p`) | oui (`streaming-json`) | oui (`grok agent stdio`) | oui | SuperGrok / X Premium+ | `XAI_API_KEY` | `~/.grok` ; variable de dossier non confirmée | Windows (PowerShell) et macOS : oui | Imagine image/vidéo, code, recherche web et X | Non précisé ; clé API = voie sûre | **A** + B (Imagine) |
| **Perplexity** | Pas d'agent de code (page « Perplexity CLI » existe, non lue) | n.a. | non | serveur MCP Perplexity API | non (API) | oui | par clé | n.a. (API web) | Recherche web sourcée, citations, effort réglable | API payante : oui | **B** |
| **Cursor** | `agent` / `cursor-agent` + `@cursor/sdk` | oui | oui (`agent acp`) | oui | compte Cursor | `CURSOR_API_KEY` | par clé API ; variable de dossier non documentée | Windows (PowerShell), macOS : oui | Plusieurs modèles tiers, SDK TypeScript, agents cloud | SDK : usage « dans son propre produit » (forum, secondaire) | **A** |
| **Google Gemini / Antigravity** | Antigravity `agy -p` ; Gemini CLI (clé API / entreprise seulement) | oui (`json`, `stream-json`) | oui (`antigravity-acp`, `gemini` au registre) | oui | Google AI Pro/Ultra pour `agy` | Gemini CLI : oui ; `agy` : clé API non supportée (juin 2026) | `~/.gemini` + trousseau système ; pas de variable documentée | Windows et macOS : oui | Nano Banana (images), Veo (vidéo), recherche Google | **Restreint** : seulement ses propres scripts ; agent tiers sous login grand public déconseillé | **A (restreint)** + B (images) |
| **GitHub Copilot CLI** | `copilot -p` | oui (`--output-format=json`, JSONL) | oui (`copilot --acp`, préversion) | oui | abonnement Copilot | jeton GitHub avec droit « Copilot Requests » | `COPILOT_HOME` | Windows (WinGet), macOS : oui | Modèles multiples, MCP, BYOK | Non précisé | **A** |
| **Mistral** | Vibe CLI (`vibe -p`) | oui (`json`, `streaming`) | oui | non lu | Pro / Team (Vibe) | oui (BYOK) | `~/.vibe` ; `VIBE_HOME` non vérifié | non précisé par la doc lue | Devstral 2 pas cher, outil d'images dans l'API | Non précisé | **A** + B |
| **DeepSeek** | Pas d'agent propre ; guides pour Claude Code, OpenCode | via Claude Code | n.a. | via l'agent | non | oui | par clé | via l'agent | Très bas prix, contexte 1M | API : oui | **A (indirect)** |
| **Qwen Code** | `qwen -p` | oui (`stream-json`) | oui (`qwen serve`, expérimental) | oui | OAuth gratuit **fermé le 15/04/2026** | oui (+ Coding Plan Alibaba) | non documenté | Windows (PowerShell), macOS : oui | Gratuit en local, Apache 2.0 | Libre (Apache 2.0) | **A** |
| **Kimi / Moonshot** | Kimi Code CLI (`kimi -p`) | oui (`stream-json`) | oui (`kimi acp`) | oui | compte Kimi (abonnement) | oui (console Kimi Code, 5 clés max) | `KIMI_CODE_HOME` | Windows (PowerShell), macOS : oui | Point d'accès Anthropic et OpenAI | Clients tiers documentés (Claude Code, OpenCode, Codex) | **A** |
| **OpenRouter** | Pas d'agent ; API | via l'agent | n.a. | n.a. | non | oui | par clé | n.a. | Centaines de modèles, point d'accès Anthropic | Oui | **B** + A (indirect) |
| **Ollama** | `ollama launch claude` | via Claude Code | n.a. | via l'agent | non | clé facultative (cloud) | n.a. (local) | Windows, macOS : oui (installeurs documentés) | Local, gratuit, vie privée | Oui | **A (indirect)** |
| **LM Studio** | serveur `lms` / `llmster` | via Claude Code | n.a. | via l'API | non | jeton local | n.a. (local) | Windows, macOS, Linux : oui | Local, point d'accès Anthropic `/v1/messages` | Oui | **A (indirect)** |
| **OpenCode** (autre acteur) | `opencode run`, `opencode serve`, SDK | oui (`--format json`) | oui (`opencode acp`) | oui | clés par fournisseur | oui | fichier d'auth sous `~/.local/share/opencode` | Windows : oui (Git Bash/WSL) | Un agent pour tous les fournisseurs | Libre | **A** |
| **Z.ai (GLM)** (autre acteur) | pas d'agent propre ; Claude Code configuré | via Claude Code | agent `glm-acp-agent` au registre | via l'agent | Coding Plan | oui | par clé | via l'agent | Point d'accès Anthropic officiel | Plan dédié au code | **A (indirect)** |

## 3. Un fournisseur par section

### 3.1 xAI Grok (« Gorock » dicté par l'utilisateur)

**Verdict : A (agent complet) + B (images, vidéo, recherche).**

- **Agent :** Grok Build, lancé le 25 mai 2026 en bêta. Mode headless `-p`, MCP, ACP, AGENTS.md, plugins, hooks, skills. Connexion avec un abonnement SuperGrok ou X Premium+ (x.ai/news/grok-build-cli, 25/05/2026). Le dépôt `xai-org/grok-build` est en Apache 2.0, sans contribution externe acceptée. Installation PowerShell sous Windows, script bash sous macOS/Linux.
- **Headless :** `-p`, `--output-format plain|json|streaming-json`, `--always-approve`, `--cwd`, `--session-id`, `--resume`, `--continue`, `--model`, `--no-auto-update`. Sessions rangées dans `~/.grok/sessions`. Le schéma des événements JSON et les codes de sortie ne sont pas documentés. (docs.x.ai/build/cli/headless-scripting, sans date.)
- **ACP :** `grok agent stdio`. L'exemple de la doc choisit `XAI_API_KEY` si elle existe, sinon le jeton mis en cache par `grok login`.
- **API :** `grok-4.7` à 2 $ / 6 $ le million de tokens (entrée / sortie, contexte 500k), `grok-build-0.1` à 1 $ / 2 $. Images : `grok-imagine-image` 0,02 $ l'image, `grok-imagine-image-2.0` 0,04 $, `grok-imagine-image-quality` 0,05 $. Vidéo : de 0,02 $ à 0,08 $ la seconde. Recherche web et recherche X sont des outils côté serveur, tarif non listé sur la page lue. (docs.x.ai/developers/models, sans date, consultée le 26/10/2026 ; capture : `captures/xai-tarifs-api.png`.) Le point d'accès OpenAI est `https://api.x.ai/v1`.
- **Compatibilité Anthropic :** un référentiel tiers (developersdigest.tech, secondaire) dit que xAI a déprécié la compatibilité avec le SDK Anthropic. Non confirmé sur la doc xAI. À ne pas utiliser.
- **Isolation multi-comptes :** dossier `~/.grok` ; aucune variable de remplacement trouvée. Pour plusieurs comptes d'abonnement, il faudrait changer le dossier personnel (`USERPROFILE`/`HOME`) du processus : **non vérifié**.
- **Conditions d'utilisation :** aucune page lue n'autorise ou n'interdit le pilotage automatisé sous abonnement. La voie sûre est la clé API facturée au token.
- **Mise en garde (secondaire, non vérifié) :** des sites tiers rapportent que le CLI envoie à xAI le contenu des fichiers lus, y compris `.env`, et un incident d'envoi de dépôt en juillet 2026. À vérifier avant de lui confier des projets privés.

Sources : x.ai/news/grok-build-cli (25/05/2026) ; github.com/xai-org/grok-build (sans date) ; docs.x.ai/build/cli/headless-scripting (sans date) ; docs.x.ai/developers/models (sans date) ; docs.x.ai (sans date).

### 3.2 Perplexity

**Verdict : B (recherche web sourcée).**

- **Produits :** Orchestrator API (modèles ouverts, point d'accès compatible OpenAI), Agent API (réponses ancrées sur le web avec citations, accès à des modèles d'OpenAI, Anthropic, Google, xAI), Search API, Embeddings, Decisions (docs.perplexity.ai/docs/getting-started/overview, sans date).
- **Fin de Sonar :** « Sonar Chat Completions support ended on September 27, 2026 ». Les requêtes synchrones et en flux sont reformulées en requêtes Agent API, déploiement progressif ; les requêtes asynchrones ne sont plus supportées (docs.perplexity.ai/docs/agent-api/migrate-from-sonar/overview.md, sans date).
- **Agent API :** `POST https://api.perplexity.ai/v1/agent`, champ `input`, réponse typée avec `search_results`, niveaux d'effort `fast` à `xhigh`. Compatible « Open Responses » ; la page ne dit pas « compatible OpenAI ».
- **Tarifs :** Search API 5 $ les 1 000 requêtes (1 $ en recherche rapide). Agent API : tokens au tarif du modèle, plus outils : recherche web 2,50 $ les 1 000, recherche d'images 2,50 $, lecture d'URL 0,0005 $ l'appel (docs.perplexity.ai/docs/getting-started/pricing, sans date ; capture : `captures/perplexity-tarifs-api.png`).
- **Pas d'agent de code :** pas d'édition de fichiers ni de commandes. Une page « Perplexity CLI » et un « Perplexity API MCP » apparaissent dans le menu de la doc ; **non lus**, donc non évalués.
- **Authentification :** clé API uniquement (rien sur un usage de l'abonnement grand public). Isolation : une clé par compte.
- **Usage dans le QG :** outil « recherche web » pour les agents (via MCP Perplexity ou appel direct), avec citations.

### 3.3 Cursor

**Verdict : A.**

- **CLI :** installation PowerShell sous Windows, script bash sous macOS/Linux/WSL. Modes agent, plan, ask (cursor.com/docs/cli/overview, sans date).
- **Headless :** `-p` ; sans `--force` l'agent propose seulement ; `--force` ou `--yolo` modifie les fichiers. `--output-format text|json|stream-json`, `--stream-partial-output`. Authentification de script par `CURSOR_API_KEY` (cursor.com/docs/cli/headless, sans date). Un fil du forum Cursor (début 2026, secondaire) signale un blocage de `agent -p` dans certaines installations.
- **ACP :** `agent acp`, JSON-RPC sur stdio, authentification `cursor_login` ou `CURSOR_API_KEY`/`--api-key`, serveurs MCP de `.cursor/mcp.json` supportés (pas ceux du tableau de bord d'équipe). Besoin de répondre aux demandes de permission sinon l'outil bloque (cursor.com/docs/cli/acp, sans date).
- **SDK :** `@cursor/sdk` (Node 22.13+), agent local ou cloud, `run.stream()` pour les événements, MCP en ligne. Les clés d'utilisateur facturent le plan de l'utilisateur ; les clés de compte de service facturent l'équipe (cursor.com/docs/sdk/typescript, sans date). Le format des arguments d'outils n'est pas garanti stable.
- **Tarifs :** la page consultée décrit des plans « historiques » Pro/Pro+/Ultra et des plans d'équipe à 30, 100 ou 200 $ par siège et par mois ; prix API par million de tokens : Grok 4.7 2 $/6 $, Claude Opus 5 5 $/25 $, Claude Sonnet 5.5 2 $/10 $, Composer 2.5 0,50 $/2,50 $ (cursor.com/docs/account/pricing, sans date, mentionne une promotion « jusqu'au 21 novembre 2026 »).
- **Isolation :** par clé API. Pas de variable de dossier de configuration documentée (cursor.com/docs/cli/reference/authentication, sans date).
- **Conditions :** un message d'un membre de l'équipe Cursor sur le forum (secondaire) dit que l'usage du moteur comme brique d'un produit est prévu par le SDK, sans revente ni partage de compte. **À confirmer dans les conditions officielles.**
- **Registre ACP :** `cursor` version 2026.10.22 (26/10/2026).

### 3.4 Google : Gemini CLI, Antigravity CLI, API Gemini (images)

**Verdict : A restreint (Antigravity CLI, usage perso ou par API) + B (images/vidéo via API Gemini).**

- **Fait majeur :** le 19 mai 2026, Google a annoncé Antigravity CLI (binaire `agy` écrit en Go) comme successeur de Gemini CLI. Depuis le **18 juin 2026**, Gemini CLI ne sert plus les abonnés Google AI Pro/Ultra ni Gemini Code Assist gratuit pour particuliers. Les clients entreprise et les clés API Gemini payantes gardent Gemini CLI (developers.googleblog.com, 19/05/2026 ; capture : `captures/google-gemini-cli-vers-antigravity.png`). Le dépôt Gemini CLI reste Apache 2.0.
- **Antigravity headless :** `agy -p` (alias `--print`, `--prompt`), `--output-format text|json|stream-json`, `--json-schema`, `--continue`, `--conversation`, `--input-format stream-json` (processus gardé ouvert), `--model`, `--effort`, `--dangerously-skip-permissions`, `--print-timeout` (5 min par défaut). Sans session déjà ouverte, l'exécution échoue avec « authentication required » au lieu de bloquer. Les outils qui demandent une approbation sont refusés sans bloquer (code 0) (antigravity.google/docs/cli/headless, sans date ; capture : `captures/antigravity-cli-headless.png`).
- **Authentification :** OAuth Google ou projet Google Cloud, jetons dans le trousseau du système. Une demande de clé API (issue GitHub, ouverte le 21/05/2026) a reçu la réponse « Gemini API Key is not supported currently » (29/06/2026) puis a été fermée comme « completed » le 21/09/2026 sans explication : **statut incertain**. Plusieurs sources secondaires parlent de `GEMINI_API_KEY` ou `ANTIGRAVITY_API_KEY` : non confirmé.
- **ACP :** `antigravity-acp` (1.4.3) et `gemini` (0.65.0) sont au registre ACP.
- **Plateformes :** installation PowerShell sous Windows, bac à sable AppContainer (Windows), `sandbox-exec` (macOS) (aq.dev, secondaire).
- **Conditions d'utilisation, point critique :** sur le forum officiel Google AI Developers, un fil du 7/10/2026, avec réponse du 8/10/2026 (auteur « chunduriv », rôle **non confirmé** comme employé Google), cite la section 6 des conditions : interdit d'utiliser un logiciel tiers pour accéder à Antigravity. Le mode `agy -p` est documenté « pour vos propres scripts locaux et pipelines CI ». Orchestrer `agy` depuis un agent tiers sous connexion grand public n'est pas supporté et « peut déclencher une application automatique des conditions et une suspension de compte ». Pour les agents tiers, la réponse renvoie vers une clé Google AI Studio ou Gemini Enterprise. De nombreux fils rapportent des suspensions (403) après usage d'outils tiers (secondaire). **Conséquence pour le QG :** ne pas faire passer un compte Google AI Pro par le QG ; passer par clé API.
- **API Gemini, images :** Nano Banana 2.1 1K 0,0336 $ l'image, Nano Banana 2 1K 0,067 $, Nano Banana Pro 0,134 $ (1K/2K) et 0,24 $ (4K). Remises de 50 % en mode lot. L'ancien Nano Banana (`gemini-2.5-flash-image`) est **arrêté le 2 octobre 2026**. Recherche Google intégrée : 5 000 requêtes gratuites par mois, puis 14 $ les 1 000. Les modèles d'image ne sont pas disponibles en niveau gratuit. Imagen n'apparaît plus sur la page. Tarif Veo non listé sur la page (ai.google.dev/gemini-api/docs/pricing, sans date, consultée le 26/10/2026).
- **Isolation :** `~/.gemini` plus trousseau ; aucune variable de remplacement documentée (aq.dev, secondaire).

### 3.5 GitHub Copilot CLI

**Verdict : A.**

- **Installation :** WinGet (`winget install GitHub.Copilot`, PowerShell 6+), Homebrew sous macOS, ou npm (Node 22+). Abonnement Copilot actif requis, désactivable par l'organisation (docs.github.com, « Install Copilot CLI », sans date).
- **Programmatique :** `-p`, `-s` (réponse seule), `--output-format=json` (JSONL, une ligne par objet), `--allow-all` / `--yolo`, `--allow-tool`, `--deny-tool`, `--no-ask-user`, `--model`, `COPILOT_MODEL` (docs.github.com, « CLI programmatic reference », sans date). Le format JSON est confirmé par cette page.
- **Authentification :** commande `/login`, ou jeton fin « Copilot Requests » dans `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` ou `GITHUB_TOKEN` (dans cet ordre). **Isolation : `COPILOT_HOME`** (défaut `~/.copilot`).
- **ACP :** `copilot --acp --stdio` ou `--port`. **Préversion publique, susceptible de changer** (docs.github.com, « ACP server », sans date). BYOK possible via `COPILOT_PROVIDER_*`, sans connexion GitHub.
- **Facturation :** requêtes « premium » (CLI inclus) ; au-delà du quota, 0,04 $ la requête si le dépassement est activé (docs.github.com, secondaire pour le détail : page de conditions de télémétrie). Un fil de discussion communautaire dit que le CLI consomme toujours des requêtes premium : non officiel.
- **Conditions :** rien trouvé sur le pilotage par un tiers. **Inconnue.**

### 3.6 Mistral

**Verdict : A (Vibe CLI) + B (outil d'images dans l'API).**

- **Vibe 2.0 :** annoncé le 27/01/2026, agent de terminal basé sur Devstral 2, sous-agents, skills. Inclus dans les formules Pro et Team de Le Chat, ou clé API (BYOK). Au-delà du quota, facturation aux tarifs API. Devstral 2 : 0,40 $ / 2,00 $ le million de tokens ; Devstral 2 Small : 0,10 $ / 0,30 $ (mistral.ai/fr/news/mistral-vibe-2-0, 27/01/2026). Le prix Pro (14,99 $ par mois) vient de sources secondaires dans la recherche ; non repris de la page officielle.
- **Mode programmatique :** `--prompt` / `-p`, `--prompt-file`, `--max-turns`, `--max-tokens`, `--time-limit`, `--output text|json|streaming`, `--output-dir`, codes de sortie 0 à 3. « Nobody can answer an approval prompt, so Vibe denies any tool call that needs one » : il faut `--auto-approve` ou `--yolo` (docs.mistral.ai/vibe/code/cli/work-with-cli, sans date). `--max-price` est indicatif, pas un plafond.
- **ACP :** `mistral-vibe` version 3.0.1 au registre (26/10/2026).
- **API :** point d'accès `/v1/chat/completions` avec outils, dont un **outil de génération d'images** et une bibliothèque de documents ; cache de prompt facturé 10 % (docs.mistral.ai/api, sans date).
- **Non vérifié :** si l'abonnement Le Chat Pro alimente bien `vibe -p` en connexion navigateur (une note de version 2.11.1, secondaire, dit que la connexion navigateur est activée par défaut) ; variable `VIBE_HOME` ; plateformes officielles ; MCP.

### 3.7 DeepSeek

**Verdict : A (indirect, via Claude Code) ; pas d'agent propre.**

- **API compatible Anthropic :** `https://api.deepseek.com/anthropic`. Les noms commençant par `claude-opus` pointent vers `deepseek-v4-pro`, `claude-sonnet` / `claude-haiku` vers `deepseek-flash`, les noms ne commençant pas par `claude` donnent une erreur 400. Pris en charge : outils, `tool_choice`, images, `thinking`, flux. **Ignorés** : `cache_control`, `citations`, `top_k`, `budget_tokens`. **Non pris en charge** : `mcp_servers`, blocs `document`, `search_result`, `redacted_thinking` (api-docs.deepseek.com/guides/anthropic_api, sans date, © 2026).
- **Guides officiels :** Claude Code, Codex, OpenCode, OpenClaw, Hermes… (api-docs.deepseek.com/guides/coding_agents, sans date). Aucun agent DeepSeek officiel n'est cité.
- **Tarifs :** `deepseek-flash` (V4.1-Flash-1017) 0,15 $ entrée (cache raté) / 0,60 $ sortie en heures creuses, le double en heures pleines ; `deepseek-v4-pro` (V4-Pro-0813) 0,66 $ / 1,98 $ en heures creuses. Contexte 1M, sortie max 384K. Recherche et lecture web : 0,75 $ les 1 000 requêtes, gratuites via Claude Code ou Codex jusqu'au 1er novembre 2026 (api-docs.deepseek.com/quick_start/pricing, sans date ; capture : `captures/deepseek-tarifs-api.png`).
- **Anciens noms retirés :** `deepseek-v4-flash` et `deepseek-v4-flash-vision-exp` sont redirigés vers V4.1-Flash.
- **Authentification :** clé API uniquement. Isolation par clé.

### 3.8 Qwen Code (Alibaba)

**Verdict : A.**

- **CLI :** Apache 2.0. Installation PowerShell sous Windows. `qwen -p` ; `--output-format text|json|stream-json`, `--include-partial-messages`, `--approval-mode plan|default|auto-edit|auto|yolo`, budgets `--max-wall-time`, `--max-tool-calls`, `--max-session-turns` (codes de sortie 55 et 53), `--continue`, `--resume` (qwenlm.github.io/qwen-code-docs/en/users/features/headless/, sans date). MCP intégré, ACP via `qwen serve` (expérimental) (github.com/QwenLM/qwen-code, sans date).
- **Authentification :** l'OAuth gratuit a été **fermé le 15 avril 2026** (sources secondaires : inventivehq, rywalker ; le README consulté ne le mentionne pas, et certaines pages tierces sont périmées). Restent : clé API (OpenAI, Anthropic, Gemini, Qwen), Coding Plan Alibaba, modèles locaux via Ollama/vLLM.
- **Compatibilité Anthropic (pour Claude Code) :** points d'accès `…/apps/anthropic` côté Alibaba (Coding Plan : `coding-intl.dashscope.aliyuncs.com/apps/anthropic` ; clé de région obligatoire) (help.aliyun.com/en/model-studio/claude-code et coding-plan-faq, sans date ; les modèles cités varient entre qwen3.6, 3.7 et 3.8, à revérifier).
- **Isolation :** non documentée (`~/.qwen/settings.json`). `QWEN_HOME` : non confirmé.

### 3.9 Kimi / Moonshot

**Verdict : A.**

- **Kimi Code :** abonnement Kimi qui inclut une application de bureau (macOS, Windows, Linux), un CLI (réécrit en Node.js, l'ancienne version Python n'est plus maintenue) et une extension VS Code. Les clients officiels se connectent avec le compte Kimi, sans clé. Pour les outils tiers : API compatible OpenAI et Anthropic, jusqu'à 5 clés dans la console Kimi Code. **Falsifier l'identifiant User-Agent d'un client peut entraîner la suspension des avantages de l'abonnement** (kimi.com/code/docs/en/, sans date). Claude Code, OpenCode et Codex sont cités comme clients supportés.
- **Commande :** `kimi -p`, `--output-format text|stream-json` (seulement avec `--prompt`), `--yolo` (demande seulement pour les actions risquées), `--auto` (jamais de question), `KIMI_CODE_HOME` (défaut `~/.kimi-code`), `kimi acp` pour ACP, `kimi mcp add|list|remove|auth` (kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command, sans date ; dépôt MoonshotAI/kimi-cli archivé, Apache 2.0).
- **Pour Claude Code :** `ANTHROPIC_BASE_URL=https://api.moonshot.ai/anthropic`, `ANTHROPIC_AUTH_TOKEN`, modèle `kimi-k3[1m]`, tous les alias de niveau à renseigner (sinon échecs silencieux dans les sous-agents), supprimer `ANTHROPIC_API_KEY` (platform.kimi.ai/docs/guide/claude-code-kimi, sans date). L'identifiant de modèle varie dans la page (`kimi-k3.1-pro` dans l'exemple curl) : à vérifier pour le compte.
- **ACP :** `kimi` 1.52.0 au registre.

### 3.10 OpenRouter

**Verdict : B (accès à de nombreux modèles par une clé) + A (indirect, via le SDK Claude).**

- **API :** compatible OpenAI sur `https://openrouter.ai/api/v1`, « des centaines de modèles » (openrouter.ai/docs/quickstart, sans date). Génération d'images, plugin de recherche web, commission : non couverts par la page lue.
- **Avec le SDK Claude Agent :** `ANTHROPIC_BASE_URL=https://openrouter.ai/api`, `ANTHROPIC_AUTH_TOKEN` = clé OpenRouter, `ANTHROPIC_API_KEY` vide « obligatoirement » (openrouter.ai/docs/guides/community/anthropic-agent-sdk, sans date). Le choix du modèle passe par `ANTHROPIC_DEFAULT_*_MODEL`. La page d'intégration Claude Code précise que « Claude Code n'est garanti qu'avec le fournisseur Anthropic de premier rang » et peut mal fonctionner avec les autres modèles (openrouter.ai/docs/guides/coding-agents/claude-code-integration, sans date).
- **Isolation :** une clé par compte.

### 3.11 Modèles locaux : Ollama et LM Studio

**Verdict : A (indirect) ; zéro coût, vie privée, qualité dépendante du matériel.**

- **Ollama :** point d'accès compatible Anthropic. `ollama launch claude --model <nom> --yes -- -p "…"` lance Claude Code dessus. Manuel : `ANTHROPIC_AUTH_TOKEN=ollama`, `ANTHROPIC_API_KEY=""`, `ANTHROPIC_BASE_URL=http://localhost:11434`. Modèles locaux avec **au moins 64k de contexte** ; les modèles cloud doivent supporter les outils. Fonctions : édition de fichiers, commandes, sous-agents, vision ; WebSearch hébergé « pas entièrement supporté » en connexion cloud directe (docs.ollama.com/integrations/claude-code, sans date). Compatibilité OpenAI sur `http://localhost:11434/v1/` : `chat/completions`, `responses` (sans état), embeddings ; pas de `tool_choice` (docs.ollama.com/api/openai-compatibility, sans date).
- **LM Studio :** `POST /v1/messages` (format Anthropic), `ANTHROPIC_BASE_URL=http://localhost:1234`, jeton si l'authentification est activée (lmstudio.ai/docs/developer/anthropic-compat, sans date). Mode sans interface : démon `llmster` (installateur PowerShell sous Windows), `lms daemon up`, chargement de modèle à la demande (lmstudio.ai/docs/developer/core/headless, sans date).

### 3.12 Autres acteurs à surveiller (octobre 2026)

Le registre ACP du 26/10/2026 liste aussi : **OpenCode** (v1.19, deux variantes), **Goose**, **Devin**, **Junie** (JetBrains), **Factory Droid**, **Kilo**, **Amp**, **Cline**, **Auggie** (Augment), **Kiro** (page « agents »), **Poolside**, **GLM Agent**, **MiniMax Code**, **Qoder**, **CodeBuddy**, **Codex** et **Claude Agent** (adaptateurs).

- **OpenCode :** `opencode run --format json`, `opencode serve` (API HTTP, mot de passe de base), `opencode acp`, SDK. Fournisseurs de la liste Models.dev, clés rangées dans `~/.local/share/opencode/auth.json` (opencode.ai/docs/cli/, sans date). **Verdict A** : un seul agent permet d'utiliser tous les fournisseurs par clé API.
- **Z.ai (GLM) :** `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`, `ANTHROPIC_AUTH_TOKEN` (docs.z.ai, résultats de recherche, sans date). **Verdict A (indirect)**.
- **Goose, Devin, Junie, Droid, Kilo, Amp :** présents au registre ACP (versions au 26/10/2026). Leur doc de pilotage n'a **pas été lue** (une page Goose a renvoyé 404). Non évalués.
- **Perplexity « Computer » / CLI, Windsurf, Kiro, Warp :** non étudiés (voir Inconnues).

## 4. Stratégies d'intégration génériques

### 4.1 ACP (Agent Client Protocol)

- **Quoi :** protocole ouvert (Apache 2.0) lancé par Zed, repris par JetBrains. Le client lance l'agent comme sous-processus, échange en JSON-RPC sur stdin/stdout, avec sessions, mises à jour en flux, demandes de permission, et accès fichiers/terminal fournis par le client. Version stable 1. SDK officiels : TypeScript (`@agentclientprotocol/sdk`), Python, Rust, Kotlin, Java (github.com/agentclientprotocol/agent-client-protocol, sans date).
- **Registre :** Zed l'a annoncé le 28/01/2026 (zed.dev/blog/acp-registry) ; le fichier du registre au 26/10/2026 compte **43 agents** avec leur mode de lancement (`npx`, binaire ou `uvx`). La page « agents » en compte 48.
- **Agents qui le parlent et qui nous intéressent :** Grok Build (`grok agent stdio`), Cursor (`agent acp`), Copilot (`copilot --acp`, préversion), Antigravity et Gemini, Mistral Vibe, Qwen Code, Kimi (`kimi acp`), OpenCode (`opencode acp`), Goose, Devin, Junie, Droid. Le registre inclut aussi un adaptateur Claude (`claude-acp` 0.97.0) : on pourrait en théorie passer **tout** par ACP, Claude compris, mais le SDK actuel offre déjà ce qu'il faut.
- **Gain :** un seul code d'intégration pour une douzaine d'agents. Chaque compte devient « commande + variables d'environnement + méthode d'authentification ».
- **Limites :**
  - Les demandes de permission doivent recevoir une réponse, sinon l'outil reste bloqué (Cursor le dit explicitement).
  - Le QG devra convertir les événements ACP vers son propre format d'événements (outils, texte, coûts). **Les coûts et les compteurs de tokens ne sont pas garantis par le protocole : non vérifié.**
  - Copilot et Qwen marquent leur support comme préversion ou expérimental.
  - Les fonctions spécifiques de chaque agent (Cursor : `cursor/ask_question`, `cursor/create_plan`) passent par des extensions non standard.
  - Ce que le client doit implémenter (lecture/écriture de fichiers côté client, terminal) n'a pas été lu en détail : **inconnue**.

### 4.2 API compatibles Anthropic (faire tourner le SDK Claude actuel sur un autre modèle)

Principe : le QG lance déjà `claude.exe` avec une liste de variables (`serveur/comptes.js`, fonction `envPour`). Il suffit de poser `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` et les variables de modèle.

| Fournisseur | URL de base (source officielle) | Remarques |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/anthropic` | pas de `mcp_servers`, `cache_control` ignoré ; noms de modèles `claude-*` convertis |
| Kimi (Moonshot) | `https://api.moonshot.ai/anthropic` | modèle `kimi-k3[1m]`, tous les alias à fixer |
| Z.ai (GLM) | `https://api.z.ai/api/anthropic` | jeton dans `ANTHROPIC_AUTH_TOKEN` |
| Alibaba (Qwen) | `…/apps/anthropic` (région à respecter) | clé de plan et de région distinctes |
| OpenRouter | `https://openrouter.ai/api` | `ANTHROPIC_API_KEY` vide ; « guarantee » seulement avec Anthropic |
| Ollama | `http://localhost:11434` | contexte ≥ 64k, WebSearch hébergé limité |
| LM Studio | `http://localhost:1234` | `/v1/messages` |
| xAI | `https://api.x.ai/` | compatibilité Anthropic **dépréciée** (source secondaire) |

**Limites de l'approche :**
1. **Anthropic ne la supporte pas.** La doc Claude Code (code.claude.com/docs/en/llm-gateway, sans date) dit : Anthropic « doesn't support routing Claude Code to non-Claude models through any gateway ». Chaque nouvelle version de Claude Code peut casser un fournisseur tiers.
2. **Fonctions Anthropic non transmises :** `cache_control` ignoré (coût plus élevé), `citations`, blocs `document`, `mcp_servers` côté API (DeepSeek). Les outils MCP locaux de Claude Code sont exécutés par le client ; **non vérifié** qu'ils fonctionnent identiquement sur tous les fournisseurs. Les fonctions hébergées (WebSearch, WebFetch) dépendent du fournisseur (Kimi : indisponibles selon un tutoriel secondaire).
3. **Qualité :** les prompts et l'usage des outils sont réglés pour Claude. Variable selon les modèles (OpenRouter le dit lui-même).
4. **Code existant :** `envPour` supprime tout ce qui commence par `ANTHROPIC` ou `CLAUDE`, puis ne repose que `CLAUDE_CONFIG_DIR` et éventuellement `ANTHROPIC_API_KEY`. Il faudrait un type de compte « fournisseur » qui pose ses propres variables, et un `ANTHROPIC_API_KEY` vidé. Les réglages de `settings.json` surchargent les variables du terminal (Kimi et OpenRouter le notent) : chaque compte garde son propre `CLAUDE_CONFIG_DIR`, donc c'est déjà isolé.
5. **Pas de connexion par abonnement :** ce sont des clés payantes au token (ou des forfaits dédiés : Kimi Code, Z.ai Coding Plan, Alibaba Coding Plan).

### 4.3 API compatibles OpenAI

- **Qui :** xAI (`https://api.x.ai/v1`), DeepSeek (`https://api.deepseek.com`), Mistral (`/v1/chat/completions`), OpenRouter (`/api/v1`), Ollama (`/v1/`), LM Studio, Kimi, Perplexity (Orchestrator API, et Open Responses pour l'Agent API).
- **Intérêt :** idéal pour les **outils spécialisés** (B) : images, recherche web, vidéo, transcription, sans agent. Un seul client HTTP.
- **Limite :** ce n'est pas un agent. Il faudrait écrire soi-même la boucle d'outils (lecture/édition de fichiers, commandes, MCP) : gros chantier et moins bon que les agents existants. À éviter pour les agents complets.

### 4.4 Recommandation

Ordre conseillé, du plus rentable au plus lourd :

1. **Étape 1 : comptes « fournisseur compatible Anthropic ».** Ajouter à `comptes.json` un type de compte avec `baseUrl`, `jeton`, table des modèles (opus/sonnet/haiku/sous-agent) et préréglages DeepSeek, Kimi, Z.ai, OpenRouter, Ollama. Ça donne rapidement des agents économiques avec la même interface, les mêmes outils et les mêmes sessions. À présenter comme « non supporté par Anthropic, qualité variable ».
2. **Étape 2 : client ACP générique.** Un module qui lance une commande (`grok agent stdio`, `agent acp`, `copilot --acp`, `kimi acp`, `opencode acp`, `vibe` ACP, `qwen serve`…), négocie la session, convertit les événements et relaie les permissions à l'interface existante. Chaque compte = commande + variables d'environnement (`COPILOT_HOME`, `KIMI_CODE_HOME`, clé API…). C'est la seule voie propre pour **Grok, Cursor, Copilot, Mistral, Antigravity** avec leur connexion d'abonnement.
3. **Étape 3 : spécialistes.** Exposer aux agents des outils (serveurs MCP ou appels API) : images/vidéo via xAI Imagine ou API Gemini, recherche sourcée via Perplexity, génération d'images Mistral. Utiliser des clés API : c'est la voie permise.
4. **Pour les abonnements grand public, prudence :** ne brancher en abonnement que ce dont l'éditeur documente le pilotage (Cursor SDK, Kimi Code avec clients tiers, Copilot par jeton). Éviter Google AI Pro via `agy` (suspensions rapportées). Pour xAI, Mistral, rester sur clé API tant que les conditions ne sont pas confirmées.
5. **Windows :** tous les CLI cités ont un installateur PowerShell ou npm, sauf mention contraire. Tester chaque commande depuis le serveur Node sur Windows (chemin, `.cmd` versus binaire, `shell: false`).

## 5. Inconnues

- **Conditions d'utilisation de l'automatisation sous abonnement** : xAI (SuperGrok), Cursor (hors SDK), GitHub Copilot, Mistral (Le Chat Pro). Aucune page des conditions n'a été lue. Seul Google a une réponse (informelle) et Kimi une règle sur le User-Agent.
- **Rôle de l'auteur de la réponse Google du 8/10/2026** : non confirmé comme employé Google ; le texte des conditions (section 6) n'a pas été lu.
- **Variable de remplacement du dossier de configuration** : non confirmée pour Grok Build (`~/.grok`), Cursor, Qwen Code, Mistral Vibe (`VIBE_HOME`), Antigravity (`~/.gemini`).
- **Statut réel de la clé API pour `agy`** : refus (29/06/2026) puis issue fermée « completed » (21/09/2026) sans explication.
- **Schéma des événements JSON** de Grok Build, Cursor, Copilot, Mistral, Kimi, Antigravity : non lu en détail. Le QG devra les capturer par essais.
- **Coûts remontés par chaque agent** (utile à l'affichage du QG) : Cursor ne donne que les tokens en headless (forum, secondaire). Les autres : non vérifié.
- **Client ACP** : ce que le client doit fournir (fichiers, terminal), compatibilité Windows de chaque adaptateur, stabilité de la version 2 du schéma.
- **Plateformes** : Mistral Vibe et Qwen Code (support complet Windows), Kimi Code (Windows CLI), non précisés par les pages lues.
- **Perplexity :** « Perplexity CLI », « Perplexity Computer MCP » : non lus. Perplexity propose-t-il des modèles d'images ? Non vérifié.
- **Non étudiés :** Goose, Devin, Junie, Factory Droid, Kilo, Amp, Windsurf, Warp, MiniMax, Amazon Kiro, Meta (Muse), Black Forest Labs, Midjourney, Runway, ElevenLabs. Les spécialistes image/vidéo hors Google et xAI (par exemple Black Forest Labs) restent à évaluer.
- **Prix de l'abonnement Mistral Pro (14,99 $)** et formules SuperGrok (30 $) : issus de sources secondaires dans la recherche, non vérifiés sur page officielle.
- **Tarifs Veo, recherche xAI :** non listés sur les pages lues.
- **Hallucinations possibles** : certaines pages de recherche web étaient générées ou tierces (par exemple chiffres DeepSeek de juin à septembre 2026) ; seules les pages officielles citées plus haut ont été retenues.

## 6. Captures

Rangées dans `docs/multi-ia/captures/` :

- `xai-tarifs-api.png` : modèles et tarifs xAI (Grok 4.7, Voice, Imagine).
- `google-gemini-cli-vers-antigravity.png` : annonce Google du 19/05/2026.
- `antigravity-cli-headless.png` : doc du mode headless d'Antigravity CLI.
- `deepseek-tarifs-api.png` : modèles, URL OpenAI et Anthropic, fonctions.
- `perplexity-tarifs-api.png` : tarifs de l'API Perplexity.

La capture de la doc Cursor (`cursor.com/docs/cli/headless`) a échoué (erreur du navigateur isolé). Les captures ont été produites avec Edge en mode sans interface, car les fichiers de l'outil `capturer_page` ne sont pas copiables vers le dossier du projet.
