# Bench OpenAI : Codex, ChatGPT et GPT Image

Rédigé le 26 octobre 2026. Bench documentaire, aucun code modifié, rien n'a été exécuté contre un compte OpenAI : tout ce qui suit vient de pages officielles, du dépôt GitHub `openai/codex` et du registre npm, lus aujourd'hui. Les sources non officielles sont signalées comme telles.

> Les docs Codex ont déménagé : `developers.openai.com/codex/*` renvoie un 308 vers `learn.chatgpt.com/docs/*`. Les pages officielles ne portent aucune date de publication ; je date donc avec les versions et dates du dépôt GitHub et de npm, qui sont datées.

## Résumé (verdict)

1. **Agent complet via abonnement ChatGPT : oui, techniquement intégrable.** `@openai/codex-sdk` (0.164.0, 23 oct. 2026) pilote le binaire officiel `codex exec --experimental-json` : flux d'événements JSONL, sortie structurée (`outputSchema`), reprise de thread, interruption (`AbortSignal`), choix du modèle, du sandbox et de l'approbation.
2. **Plusieurs comptes sur un PC : un dossier `CODEX_HOME` par compte**, exactement comme `CLAUDE_CONFIG_DIR` aujourd'hui. Connexion par navigateur (`codex login`) ou par code d'appareil (`codex login --device-auth`, bêta). Forcer `cli_auth_credentials_store="file"` pour que le jeton reste dans `CODEX_HOME/auth.json`.
3. **Outils de l'agent** : édition de fichiers, commandes, recherche web, client MCP (stdio et HTTP). Les profils lecture / édition / édition+tests correspondent à `sandbox_mode` `read-only` / `workspace-write`. **`codex mcp-server` n'existe plus** (supprimé du dépôt le 5 sept. 2026) : le QG ne peut pas appeler Codex comme un outil MCP.
4. **Limites lisibles par programme** via `codex app-server` (`account/rateLimits/read` : pourcentage utilisé, durée de fenêtre, heure de remise à zéro, crédits, type de forfait). Le SDK seul ne donne que les jetons par tour.
5. **Réserve principale : les conditions d'utilisation.** OpenAI recommande la clé API pour l'automatisation ; la connexion ChatGPT en automatisation est qualifiée d'« avancée », pour machines de confiance. Un employé d'OpenAI a dit publiquement (30 mars 2026) vouloir que l'abonnement serve « partout », mais je n'ai pas pu lire les conditions d'utilisation elles-mêmes (page bloquée). Faire tourner en rotation plusieurs comptes pour contourner les limites est à proscrire.
6. **Génération d'images : oui depuis Codex avec une simple connexion ChatGPT**, sans clé API, via l'outil intégré `image_gen` (compétence `$imagegen`). Elle consomme les limites Codex 3 à 5 fois plus vite qu'un tour sans image et se retire ensuite sur les crédits.
7. **Mais pas de contrôle fin avec l'abonnement** : pas de choix de taille, de qualité ni de masque ; les fichiers atterrissent dans `CODEX_HOME/generated_images/` ; le SDK TypeScript n'a pas de type d'élément « image » dans ses événements (à tester).
8. **Pour des images de production et reproductibles : l'API Images** (`gpt-image-2.5-sunburst` / `-flare`, facturée au jeton, vérification d'organisation possiblement requise) derrière un petit outil MCP du QG. Pour un essai sans clé API : sous-tâche `codex exec` qui génère puis copie le fichier.
9. **Intégrable comme agent complet : oui. Comme outil d'image : oui, de deux façons** (abonnement via sous-tâche Codex, ou API via outil MCP). Recommandation : SDK Codex direct pour la v1, `codex app-server` pour la connexion et les limites, ACP en option pour d'autres fournisseurs.
10. **Standard d'intégration** : l'Agent Client Protocol (ACP) a un adaptateur Codex officiel, `@agentclientprotocol/codex-acp` 2.3.0 (26 oct. 2026), qui s'appuie sur l'App Server de Codex ; il existe aussi `claude-agent-acp` dans la même organisation.

---

## 1. Codex CLI et Codex SDK (installation, mode non interactif, reprise, interruption)

**Versions (vérifiées le 26 oct. 2026)**
- `@openai/codex` : `latest` = **0.164.0**, publié le 23 oct. 2026 ; une alpha 0.165.0-alpha.1 existe. Source : registre npm (`npm view @openai/codex`) et [GitHub Releases rust-v0.164.0](https://github.com/openai/codex/releases/tag/rust-v0.164.0) (23 oct. 2026). Cadence : plusieurs alphas par jour, une version stable par semaine environ.
- `@openai/codex-sdk` : `latest` = **0.164.0** (npm, modifié le 23 oct. 2026), exige Node ≥ 18 et dépend de `@openai/codex` à la même version exacte.

**Installation**
- npm : `npm install -g @openai/codex`. Le paquet principal a des dépendances optionnelles par plateforme : `@openai/codex-win32-x64`, `-win32-arm64`, `-darwin-x64`, `-darwin-arm64`, `-linux-x64`, `-linux-arm64` (npm, 26 oct. 2026). Le SDK sait retrouver ce binaire (table `PLATFORM_PACKAGE_BY_TARGET` dans `sdk/typescript/src/exec.ts`, dépôt `openai/codex`, branche main, 26 oct. 2026). Le binaire est donc livré par npm : même logique que `claude.exe` dans `node_modules` aujourd'hui.
- Installeurs autonomes : macOS/Linux `curl -fsSL https://chatgpt.com/codex/install.sh | sh` ; Windows `powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"` ; Homebrew `brew install --cask codex` ([README du dépôt](https://github.com/openai/codex), lu le 26 oct. 2026).
- Surprise : `docs/install.md` du dépôt annonce encore « Windows 11 via WSL2 » comme prérequis, alors que le README propose un installeur PowerShell et que les paquets `win32-x64` existent. La doc du bac à sable décrit un mode natif Windows (MXC préféré, puis `elevated` / `unelevated`) et le WSL2 ([page sécurité et approbations](https://learn.chatgpt.com/docs/agent-approvals-security), lue le 26 oct. 2026). **À tester sur ce PC** avant de promettre Windows natif.

**Mode non interactif : `codex exec`** ([doc](https://learn.chatgpt.com/docs/non-interactive-mode), lue le 26 oct. 2026)
- `codex exec "tâche"` : la progression va sur stderr, seul le message final sur stdout. Le prompt peut venir de stdin (`codex exec -`).
- `--json` : stdout devient un flux JSON Lines avec les événements `thread.started`, `turn.started`, `turn.completed` (avec `usage`), `turn.failed`, `item.*` et `error`. Éléments : message de l'agent, raisonnement, commande exécutée, modification de fichier, appel d'outil MCP, recherche web, mise à jour de plan.
- Sortie structurée : `--output-schema schema.json` (JSON Schema) ; `-o fichier` / `--output-last-message` écrit le message final.
- Le SDK utilise en réalité `codex exec --experimental-json` et ajoute des `--config clé=valeur` ([exec.ts](https://github.com/openai/codex/blob/main/sdk/typescript/src/exec.ts), 26 oct. 2026). Ses types d'événements (`events.ts`) : `thread.started` (avec `thread_id`), `turn.started`, `turn.completed` (jetons : entrée, entrée en cache, écriture en cache, sortie, raisonnement), `turn.failed`, `item.started|updated|completed`, `error`. Types d'éléments (`items.ts`) : `command_execution`, `file_change`, `mcp_tool_call`, `agent_message`, `reasoning`, `web_search`, `todo_list`, `error`. **Aucun type d'élément pour une image générée** (voir §5).
- Dépôt Git obligatoire par défaut ; contournement `--skip-git-repo-check` (option `skipGitRepoCheck` du SDK).
- `--full-auto` n'est plus pris en charge : remplacé par `--sandbox workspace-write` ou `--approve-for-me`.

**SDK TypeScript** ([README](https://github.com/openai/codex/blob/main/sdk/typescript/README.md) et [doc officielle](https://learn.chatgpt.com/docs/codex-sdk), lus le 26 oct. 2026)
```ts
import { Codex } from "@openai/codex-sdk";
const codex = new Codex({ env: { /* environnement complet, non hérité */ }, config: {...} });
const thread = codex.startThread({ workingDirectory, model, sandboxMode, approvalPolicy, modelReasoningEffort, webSearchMode, skipGitRepoCheck });
const { events } = await thread.runStreamed(prompt, { outputSchema, signal });
```
- Options du client : `codexPathOverride`, `baseUrl`, `apiKey` (injecté en `CODEX_API_KEY`), `config` (aplati en `--config`), `configOverrides` (TOML brut), `env` (quand il est fourni, **le SDK n'hérite pas de `process.env`**) — `codexOptions.ts`.
- `run()` met les événements en tampon ; `runStreamed()` renvoie un générateur asynchrone. Un appel `run()` de plus sur le même `Thread` continue la conversation.
- Images en entrée : `{ type: "local_image", path }`.

**Reprise de session**
- SDK : `codex.resumeThread(threadId)` ; les threads sont sauvegardés dans `~/.codex/sessions` (donc `CODEX_HOME/sessions`).
- CLI : `codex exec resume --last "prompt"` ou `codex exec resume <SESSION_ID>`.
- La version 0.164.0 corrige la reprise des historiques compressés et restaure les réglages sauvegardés du thread (notes de version du 23 oct. 2026).

**Interruption**
- SDK : `turnOptions.signal` (`AbortSignal`) est transmis à `child_process.spawn` : l'abandon tue le processus `codex`.
- Via `codex app-server` : requête `turn/interrupt` (le tour se termine avec le statut `interrupted`) — d'après le README de l'app-server (copies tierces) et la présence du code dans `codex-rs/app-server` (dépôt, 26 oct. 2026).
- La page officielle de `codex exec` ne parle pas d'interruption.

## 2. Authentification et isolement de plusieurs comptes

Source principale : [page Authentication](https://learn.chatgpt.com/docs/auth) (lue le 26 oct. 2026, sans date), complétée par [Maintain Codex account auth in CI/CD](https://learn.chatgpt.com/docs/auth/ci-cd-auth) (lue le 26 oct. 2026).

- **Deux modes** : « Sign in with ChatGPT » (abonnement) et clé API (facturation à l'usage au tarif API, sans les fonctions qui dépendent de l'espace de travail ChatGPT ni du cloud). Codex cloud exige la connexion ChatGPT.
- **Stockage** : `auth.json` dans `CODEX_HOME` (par défaut `~/.codex`). Réglage `cli_auth_credentials_store` : `file`, `keyring`, `auto` (trousseau du système si disponible, sinon fichier) ou `ephemeral`. La doc décrit `auth.json` comme un fichier en clair à traiter comme un mot de passe.
- **Isolement multi-comptes** : un `CODEX_HOME` distinct par compte, le fichier `auth.json` étant à l'intérieur. La doc officielle ne parle pas du multi-comptes ; l'usage de `CODEX_HOME` pour cela est confirmé par des outils tiers (par exemple [codex-profiles, forum OpenAI](https://community.openai.com/t/codex-profiles-switch-codex-accounts-without-copying-auth-json/1380415)) et par le SDK, qui dit qu'on peut surcharger sans toucher à `CODEX_HOME` (README). **Piège à vérifier** : avec `auto` ou `keyring`, rien ne dit que le trousseau distingue deux `CODEX_HOME` → imposer `file` (`-c cli_auth_credentials_store="file"` ou `config` du SDK).
- **Connexion** :
  - `codex login` : navigateur, rappel local sur le port **1455** par défaut. Deux connexions simultanées sur le même PC se disputeraient ce port (à tester) : les sérialiser dans le QG.
  - `codex login --device-auth` : code d'appareil, **bêta**, à activer d'abord dans les paramètres de sécurité ChatGPT (ou dans les permissions de l'espace de travail pour les admins).
  - Repli sans navigateur : se connecter ailleurs puis copier `auth.json`, ou rediriger le port 1455 par SSH.
  - `codex login status` donne le mode actif, `codex logout` efface les identifiants.
- **Contrôles possibles** : `forced_login_method` (`"chatgpt"` ou `"api"`), `forced_chatgpt_workspace_id`.
- **Rafraîchissement** : Codex rafraîchit le jeton quand `last_refresh` a plus d'environ 8 jours ou après un 401, et réécrit `auth.json`. Ne pas réinjecter l'original à chaque lancement. **Un `auth.json` ne doit pas être utilisé en parallèle par plusieurs jobs ou machines** (page CI/CD) : le QG doit donc sérialiser ou limiter à une session à la fois par compte, ou vérifier ce qui se passe avec plusieurs processus sur la même machine (inconnue, voir plus bas).
- **Clé API** : `CODEX_API_KEY` (une exécution) fonctionne avec `codex exec`, `codex review` et le SDK ; la doc avertit de ne pas l'exposer à du code du dépôt.
- Détection « connecté » côté QG : analogue de `compteConnecte` = présence de `CODEX_HOME/auth.json` (si `file`), ou `codex login status`.

## 3. Modèles, réglages, limites d'usage et lecture par programme

Source : [Pricing](https://learn.chatgpt.com/docs/pricing) (lue et capturée le 26 oct. 2026) et [Models](https://learn.chatgpt.com/docs/models) (lue le 26 oct. 2026).

**Capture** : la page des tarifs est affichée à l'écran lors de ce bench. Je n'ai pas pu la copier dans `docs/multi-ia/captures/` (l'écriture depuis le dossier temporaire des captures a été refusée), donc **aucun fichier image n'est rangé dans le dépôt**. Les chiffres ci-dessous viennent du texte de la page.

**Modèles actuels** (aucun « codex » dans les noms) :

| Modèle | Identifiant | Remarque officielle |
|---|---|---|
| GPT-6 Astra | `gpt-6-astra` | le plus capable ; certains forfaits payants n'ont pas son niveau Extra High |
| GPT-6.1 Sol | `gpt-6.1-sol` | proche d'Astra, moins cher ; modèle de l'exemple de config |
| GPT-6.1 Terra | `gpt-6.1-terra` | rapide ; exige Codex CLI ≥ 0.159.0 |
| GPT-6 Luna | `gpt-6-luna` | le plus économe ; seul modèle des forfaits Free et Go |

- Retraits : `gpt-5.4` / `gpt-5.4-mini` (31 août 2026), `gpt-5.3-codex-spark` (14 sept. 2026), `gpt-5.5` (14 oct. 2026) pour la connexion ChatGPT ; les sessions par clé API ne sont pas touchées. La page des tarifs contient aussi une mention « GPT-5.6 Sol » incohérente avec le reste (faute de la page ou ancien nom) : ne pas s'y fier.
- **Niveaux de raisonnement** : Light/Low, Medium, High, Extra High ; Max (plus de temps de raisonnement) ; Ultra (sous-agents ; pas pour Luna). Les niveaux ne se correspondent pas exactement d'une génération à l'autre. Réglage : `-m <modèle>` (`codex exec -m gpt-6.1-sol`), `model = "..."` dans `config.toml`, et côté SDK `modelReasoningEffort` (= `--config model_reasoning_effort`).
- **Forfaits** (page des tarifs, 26 oct. 2026) : Free 0 $ et Go 8 $ (GPT-6 Luna, application de bureau) ; **Plus 20 $** ; **Pro à partir de 100 $** (paliers 100 / 200 / 500 $ par mois, « pas de limite sur cinq heures actuellement », mode Ultrafast sur le palier 500 $) ; Business 20 $ par utilisateur et par mois (facturé annuellement) ou 25 $ au mois ; Enterprise/Edu sur devis ; clé API au tarif API.
- **Limites Plus et Business standard** (messages locaux par 5 heures, estimations) : Astra 5–45, Sol 6.1 15–160, Terra 35–285, Sol 6 15–150, Luna 350–3 000. Des limites hebdomadaires peuvent s'ajouter. Crédits supplémentaires achetables. Mode rapide : 2,5 fois l'usage inclus ; Ultrafast : 8 fois.
- **Lecture des limites** : manuellement via le tableau de bord d'usage et `/status` en session interactive (FAQ de la page des tarifs). **Par programme** : le protocole de `codex app-server` expose `account/rateLimits/read` et la notification `account/rateLimits/updated`. Le schéma TypeScript généré (`RateLimitSnapshot`, `RateLimitWindow`, dépôt `openai/codex`, 26 oct. 2026) contient : `primary` et `secondary` (`usedPercent`, `windowDurationMins`, `resetsAt`), `credits`, `planType`, `rateLimitReachedType`, `limitId`, `limitName`. Le SDK ne lit que les jetons par tour (`turn.completed.usage`). La liste des modèles disponibles pour le compte vient de la méthode `model/list` du même serveur.
- Le README de l'app-server est protocolaire et change à chaque version ; régénérer les types avec `codex app-server generate-ts` sur la version installée (indiqué par des copies tierces ; à confirmer en local).

## 4. Outils de l'agent, sandbox, approbations, MCP, recherche web

Sources : [Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security), [MCP](https://learn.chatgpt.com/docs/extend/mcp), [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) (lues le 26 oct. 2026, sans date).

**Outils intégrés** : lecture/édition de fichiers (patchs), exécution de commandes, recherche web, lecture d'images (`view_image`), génération d'images, plan.

**Sandbox** (`sandbox_mode`, `--sandbox`) :
- `read-only` : lit et exécute dans le bac à sable en lecture seule. Défaut de `codex exec`.
- `workspace-write` : édite et exécute dans l'espace de travail ; **réseau coupé** sauf `[sandbox_workspace_write] network_access = true` ; `.git`, `.agents`, `.codex` et `.aws` restent en lecture seule même dans l'espace inscriptible (l'agent ne peut donc pas committer).
- `danger-full-access` (alias `--yolo`) : aucun bac à sable, déconseillé.

**Approbations** (`approval_policy`) : `on-request`, `never`, `granular` (table de catégories) ; `untrusted` est retiré et peut empêcher le démarrage si on le laisse en config. `approvals_reviewer = "auto_review"` envoie les demandes à un agent relecteur. En non interactif, il faut `never` (le SDK passe `approval_policy` en `--config`). `--approve-for-me` existe aussi.

**Correspondance avec les profils du QG** (proposition, à valider par un essai) :

| Profil QG | Réglage Codex |
|---|---|
| Lecture | `sandboxMode: "read-only"`, `approvalPolicy: "never"` |
| Édition | `sandboxMode: "workspace-write"`, `approvalPolicy: "never"` |
| Édition + tests | idem Édition ; les tests locaux passent, mais le réseau reste coupé (activer `network_access` seulement si nécessaire) |

Des profils de permissions nommés existent aussi (`default_permissions`, `[permissions.<nom>]` avec `extends = ":workspace"`, domaines réseau autorisés/refusés), testables avec `codex sandbox <plateforme> --permissions-profile <nom>`.

**Windows** : bac à sable natif « MXC » (`[features] prefer_mxc = true`), anciens modes `elevated` / `unelevated`, ou WSL2 (WSL1 non pris en charge depuis la 0.115). Impact à tester : le mode natif demande peut-être des droits.

**Recherche web** : `web_search = "cached"` (défaut, index géré par OpenAI), `"live"` (= `--search`, défaut sous `--yolo`), `"indexed"`, `"disabled"` ; SDK `webSearchMode`.

**MCP — Codex comme client** (pour recevoir les outils du QG)
- `config.toml` (`~/.codex/config.toml` donc `CODEX_HOME/config.toml`, ou `.codex/config.toml` du projet dans un projet de confiance), table `[mcp_servers.<nom>]`.
- Serveur stdio : `command`, `args`, `env`, `env_vars`, `cwd`. Serveur HTTP en flux : `url`, `bearer_token_env_var`, `http_headers`, `env_http_headers`, `auth` (`oauth` par défaut ou `chatgpt`).
- Options : `startup_timeout_sec` (10 par défaut), `tool_timeout_sec` (60), `enabled`, `required` (si vrai, `codex exec` échoue quand le serveur ne démarre pas), `enabled_tools`, `disabled_tools`, `default_tools_approval_mode` (`auto`, `prompt`, `writes`, `approve`), approbation par outil.
- Commandes : `codex mcp add <nom> --env K=V -- <commande>`, `codex mcp list`, `codex mcp login <nom>`.
- **Pour le QG** : le plus simple est de passer le serveur MCP du QG par le SDK (`config: { mcp_servers: { qg: { url, bearer_token_env_var } } }`) sans écrire dans le `config.toml` de l'utilisateur ; les surcharges `--config` ne modifient pas les fichiers de config (README du SDK).
- Point d'attention : des tickets ouverts d'octobre 2026 signalent des fuites de serveurs MCP stdio par thread dans l'app-server (par exemple [#56335](https://github.com/openai/codex/issues/56335), 23 oct. 2026) : privilégier HTTP, ou tuer le processus à la fin de la session.

**MCP — Codex comme serveur (`codex mcp-server`) : SUPPRIMÉ**
- La commande et la crate `codex-mcp-server` ont été retirées par le commit « Remove the deprecated `codex mcp-server` command (#42993) », daté du **5 sept. 2026** ([historique de `codex-rs/mcp-server`](https://github.com/openai/codex/commits/main/codex-rs/mcp-server)). `codex-rs/cli/src/main.rs` ne contient plus la sous-commande. Les anciens tutoriels qui la mentionnent sont périmés pour la 0.164.0. Pour exposer Codex à un autre agent, il reste le SDK, `codex exec`, `codex app-server` ou ACP.

## 5. Génération d'images

**5.1 Depuis Codex avec une connexion ChatGPT : oui.**
- Source officielle du dépôt : [compétence `imagegen`](https://github.com/openai/skills/blob/main/skills/.system/imagegen/SKILL.md) (`openai/skills`, lue le 26 oct. 2026). Deux modes : **outil intégré `image_gen` (par défaut, « ne nécessite pas `OPENAI_API_KEY` »)** et un mode CLI de repli (`scripts/image_gen.py`, « requiert `OPENAI_API_KEY` », à n'utiliser que sur demande explicite de l'utilisateur).
- Quota : « La génération d'images compte dans les mêmes limites d'usage générales que les messages locaux et les conversations cloud » et « utilise les limites incluses 3 à 5 fois plus vite en moyenne que des tours similaires sans génération d'image » ; une fois les limites atteintes, elle puise dans les crédits ([FAQ de la page Pricing](https://learn.chatgpt.com/docs/pricing), lue le 26 oct. 2026 ; la citation en français est ma traduction).
- Forfaits : la page Pricing indique pour **Free** que la génération d'image « n'est pas disponible ». Le site tiers [codexusage.dev](https://www.codexusage.dev/image-generation) (non officiel, mis à jour le 3-4 oct. 2026) dit au contraire que Images 2.5 est disponible à tous les niveaux : **désaccord à trancher** ; l'intérêt du QG concerne Plus, Pro et Business, où c'est inclus.
- Modèle : Images 2.5, sorti le **8 sept. 2026** selon le site tiers ci-dessus ; côté API, snapshot `gpt-image-2.5-flare-2026-09-08` (page modèle OpenAI, lue le 26 oct. 2026). Aucun sélecteur de modèle documenté dans Codex.
- Fichiers : enregistrés sous `$CODEX_HOME/generated_images/` (donc **dans le dossier du compte** : le QG devra les repérer et les copier ; la compétence recommande de copier le résultat dans le projet).
- **Retouche** : l'outil intégré ne retouche que des images déjà visibles dans la conversation (images jointes ou générées plus tôt) ; pour un fichier local, on le charge d'abord avec `view_image` ; les masques et paramètres explicites (`input_fidelity`, format, taille) sont réservés au mode CLI à clé API (SKILL.md).
- Limites constatées : un appel par image et pas de parallélisme dans un même agent (message d'un utilisateur sur X, source non officielle) ; ticket ouvert [#49214](https://github.com/openai/codex/issues/49214) (ouvert le 29 sept. 2026, confirmé le 20 oct. 2026) : erreur 429 `usage_limit_reached` sur `image_gen` alors qu'il restait du quota (Plus, Windows) ; ticket [#36434](https://github.com/openai/codex/issues/36434) : outil `image_gen` parfois absent de l'application de bureau ; pas d'image générée avec Amazon Bedrock ; l'activité d'images peut ne pas apparaître dans l'usage affiché (aide OpenAI citée par codexusage.dev, à confirmer).
- **Inconnue importante** : le SDK TypeScript (0.164.0) n'a pas de type d'élément pour une image générée. Il faut tester ce que `codex exec --json` émet pour un appel `image_gen` (et récupérer le fichier dans `generated_images/` par différence de dossier).

**5.2 Via l'API Images (clé API facturée)**
- Page officielle : [guide Image generation](https://developers.openai.com/api/docs/guides/image-generation) (lue le 26 oct. 2026, sans date). Modèles documentés : **`gpt-image-2.5-sunburst`** (précision d'édition) et **`gpt-image-2.5-flare`** (génération rapide du quotidien). Deux voies : API Images (`/v1/images/generations`, `/v1/images/edits`) ou outil `image_generation` de l'API Responses (édition multi-tours, identifiants de fichiers).
- Tailles recommandées 1024×1024, 1536×1024, 1024×1536 ; tailles libres si largeur et hauteur multiples de 16, rapport entre 1:3 et 3:1, aucun côté au-delà de 3840 px. Qualités : `low`, `medium`, `high`, `xhigh`, `max`, `auto` (défaut). Formats `png` (défaut), `jpeg`, `webp` (compression 0–100) ; fond transparent avec `background: "transparent"` en png/webp.
- Retouche : une ou plusieurs images de référence (data URL base64 ou File ID) ; masque PNG avec canal alpha, même taille et même format que l'image, moins de 50 Mo ; le masque guide seulement (pas de forme exacte garantie). Modération `auto` ou `low` ; erreur `moderation_blocked`.
- Prérequis : la page indique qu'une **vérification d'organisation API** peut être nécessaire.
- **Prix** ([page Pricing API](https://developers.openai.com/api/docs/pricing), lue le 26 oct. 2026), par million de jetons, tarif standard : `gpt-image-2.5-sunburst` et `-flare` entrée texte 5,00 $, entrée image 8,00 $, **sortie image 30,00 $** ; Batch moitié moins (sortie image 15,00 $). `gpt-image-2` : mêmes tarifs. `gpt-image-1.5` : sortie image 32,00 $. `gpt-image-1-mini` : 2,00 / 2,50 / 8,00 $. **Le prix par image n'est pas publié** pour les modèles 2.5 (le calculateur ne les couvre pas) : je ne donne donc pas de chiffre par image. Surcoût de 10 % pour le traitement régional.
- Limites de débit par défaut de `gpt-image-2.5-flare` (page modèle, lue le 26 oct. 2026) : Build 250 000 jetons/min et 20 images/min ; Launch 3 000 000 et 150 ; Grow 8 000 000 et 250. Points d'accès pris en charge : génération, retouche, batch (pas Responses en tant que modèle principal).
- Si une clé `OPENAI_API_KEY` est présente dans l'environnement de Codex, des sources tierces disent que la génération passe en facturation API : raison de plus pour que `envPour` retire toute variable `OPENAI_*` / `CODEX_*` non voulue.

**5.3 Comment un agent Claude du QG obtiendrait-il une image ?**

| Option | Principe | Avantages | Inconvénients |
|---|---|---|---|
| A. Outil MCP du QG « generer_image » | le serveur du QG appelle l'API Images avec une clé API du compte OpenAI configuré | contrôle total (taille, qualité, masque, format, fond transparent) ; coût mesurable ; parallélisable ; fichier écrit où on veut ; usage officiel et sans zone grise | clé API + facturation au jeton ; vérification d'organisation possible ; prix par image non publié |
| B. Outil MCP du QG « generer_image » qui lance une sous-tâche Codex (`codex exec` + `$imagegen`) avec un compte ChatGPT | l'agent Claude appelle l'outil, le QG lance Codex dans le dossier du compte, récupère le fichier dans `generated_images/` et le renvoie | pas de clé API ; l'abonnement paie ; Images 2.5 incluse | quota Codex consommé 3–5 fois plus vite ; pas de choix de taille/qualité/masque ; non déterministe (l'agent décide) ; fichier à retrouver ; bug 429 ouvert ; une image à la fois |
| C. Codex en serveur MCP | — | — | **impossible** : `codex mcp-server` a été supprimé le 5 sept. 2026 |

**Recommandation** : implémenter l'interface « outil d'image » une seule fois côté QG (même nom d'outil, mêmes paramètres : prompt, taille, images de référence, destination) avec deux moteurs interchangeables : B pour démarrer avec un abonnement, A dès qu'un compte à clé API existe ou qu'il faut du contrôle. Le message de refus de B (quota) doit être clair pour l'agent.

## 6. Conditions d'utilisation : piloter Codex par programme avec un abonnement personnel

**Ce que je peux affirmer (sources lues)**
- La doc officielle propose elle-même l'authentification ChatGPT en automatisation, à titre « avancé » : « destinée aux équipes d'entreprise sur des exécuteurs de confiance, ou aux utilisateurs qui ont besoin des limites de débit ChatGPT/Codex plutôt que de l'usage par clé API ; les clés API sont le choix recommandé par défaut » ; « ne pas l'utiliser pour des dépôts publics ou open source » ([Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), lue le 26 oct. 2026). La page CI/CD ajoute : « La bonne façon d'authentifier une automatisation est une clé API », à n'utiliser avec ChatGPT que sur une infrastructure privée de confiance, **un `auth.json` par exécuteur, jamais partagé en parallèle** ([CI/CD auth](https://learn.chatgpt.com/docs/auth/ci-cd-auth), lue le 26 oct. 2026). Citations traduites par moi.
- Le SDK officiel lui-même pilote le binaire officiel : [`@openai/codex-sdk`](https://github.com/openai/codex/tree/main/sdk/typescript) est publié par OpenAI. Un QG qui l'utilise avec le compte ChatGPT de l'utilisateur lance le client officiel, sans réutiliser le jeton à l'extérieur.
- Un employé d'OpenAI, Romain Huet, a écrit le 30 mars 2026 : « We want people to be able to use Codex, and their ChatGPT subscription, wherever they like! », en incluant explicitement les outils tiers ([tweet](https://twitter.com/romainhuet/status/2038699202834841962), relayé par [Simon Willison, 23 avril 2026](https://simonwillison.net/2026/Apr/23/gpt-5-5/)). C'est un message public, pas une clause contractuelle.
- Les conditions applicables à la connexion ChatGPT sont celles de ChatGPT (aide OpenAI « Use Codex with a ChatGPT plan », citée par une recherche web du 26 oct. 2026, page elle-même inaccessible en lecture directe, erreur 403).

**Ce que je n'ai pas pu vérifier**
- Le texte des [Terms of Use](https://openai.com/policies/row-terms-of-use/) est protégé par Cloudflare (403 et page de vérification lors de ma capture du 26 oct. 2026). Les extraits de recherche indiquent que la liste « What you cannot do » interdit d'extraire automatiquement ou par programme des données ou des sorties (« Automatically or programmatically extract data or Output ») et, dans les versions récentes, de contourner les limites de débit. **Je n'ai pas lu le texte en vigueur : à faire lire par l'utilisateur ou à retrouver avant de publier la fonction.**

**Réserves à appliquer**
1. Un compte ChatGPT = une personne réelle, utilisé depuis son propre PC. Ne pas mettre en commun des comptes ni les faire tourner pour contourner les limites : zone grise signalée par les commentateurs et non couverte par le message public d'OpenAI.
2. Ne jamais copier un `auth.json` d'une machine à l'autre (OpenAI le déconseille) ; le QG ne doit pas lire ni stocker de jeton (il respecte déjà ce principe pour Claude).
3. Utiliser le client officiel (SDK ou `codex exec`), pas un jeton OAuth rejoué dans un autre client ou un proxy. C'est exactement la zone grise des outils tiers d'images « via l'identité Codex » (le site GPTImage MCP lui-même la qualifie de zone grise) : **éviter** pour l'outil d'image.
4. Pour une automatisation lourde ou partagée : proposer la clé API (`CODEX_API_KEY`), comme pour les comptes Claude à `cleApi`.
5. Le point d'entrée utilisé par le SDK (`codex exec --experimental-json`) est marqué expérimental dans son nom : le format peut changer entre versions → épingler la version de `@openai/codex-sdk`.

## 7. Protocoles d'intégration standard (ACP et autres)

- **Agent Client Protocol (ACP)** : protocole JSON-RPC sur stdio entre un client (éditeur, ou ici le QG) et un agent de code. Organisation GitHub [agentclientprotocol](https://github.com/agentclientprotocol) (activité du 26 oct. 2026) : spécification, SDK TypeScript (`@agentclientprotocol/sdk` **2.0.2**, npm, 23 oct. 2026), Rust, Python, Java, Kotlin, registre d'agents, et deux adaptateurs : `codex-acp` et `claude-agent-acp`.
- **Adaptateur Codex** : [`@agentclientprotocol/codex-acp`](https://github.com/agentclientprotocol/codex-acp), version **2.3.0 publiée le 26 oct. 2026** (GitHub Releases) ; dépôt précédent `zed-industries/codex-acp` **archivé** (dernière activité 22 juil. 2026). Il lance l'App Server de Codex et traduit les requêtes ACP. Prise en charge déclarée (README, 26 oct. 2026) : connexion ChatGPT, clé API ou passerelle personnalisée ; modèle, niveau de raisonnement, mode rapide, approbation et sandbox ; texte, contexte, images, liens ; commandes, modifications de fichiers, demandes de permission, appels MCP, sortie de terminal, raisonnement, plan, recherche web, **génération d'images**, usage des jetons ; serveurs MCP fournis par le client (stdio et HTTP) ; sous-agents ; commandes `/status`, `/mcp`, `/review`, `/compact`, `/logout`, etc.
- Variables de l'adaptateur : `CODEX_API_KEY` (prioritaire) / `OPENAI_API_KEY`, `CODEX_PATH` (autre binaire), `CODEX_CONFIG` (JSON fusionné dans la config de session), `MODEL_PROVIDER`, `INITIAL_AGENT_MODE` (`read-only`, `workspace-write`, `agent`, `agent-full-access`), `NO_BROWSER`, `APP_SERVER_LOGS`. Le paquet embarque un `@openai/codex` compatible. Lancement : `npx -y @agentclientprotocol/codex-acp`.
- **Intérêt pour un QG multi-fournisseurs** : un seul client ACP pourrait parler à Codex et à Claude (`claude-agent-acp`), donc une seule boucle d'événements. **Coût** : le QG a déjà des événements Claude via `@anthropic-ai/claude-agent-sdk` (permissions, outils MCP internes, profils) ; passer par ACP pour Claude serait une réécriture. Pour la v1, le SDK Codex direct donne plus de contrôle (`outputSchema`, `env`, `signal`, `config`) avec moins de couches. ACP devient pertinent quand un troisième fournisseur arrive (Gemini, etc.) : à garder comme architecture cible, pas comme première étape.
- **`codex app-server`** (protocole JSON-RPC sur stdio, marqué expérimental dans le CLI) : c'est ce que ACP et les applications officielles utilisent ; il donne ce que le SDK ne donne pas (connexion par code `account/login/start`, `account/read`, `account/rateLimits/read`, `model/list`, `turn/interrupt`). Source : `codex-rs/cli/src/main.rs` (sous-commande `app-server` « experimental ») et schéma `app-server-protocol`, dépôt `openai/codex`, 26 oct. 2026.

---

## Ce que le QG devrait utiliser

| Besoin | Paquet / commande | Variables d'environnement et réglages |
|---|---|---|
| Moteur d'agent | npm `@openai/codex-sdk@0.164.0` (dépend de `@openai/codex@0.164.0`, binaire `@openai/codex-win32-x64` sur Windows x64) | `new Codex({ env: <env nettoyé>, config: {...} })` |
| Environnement d'un compte (équivalent de `envPour`) | — | retirer toute variable `OPENAI_*` et `CODEX_*` héritée ; poser **`CODEX_HOME=<dossier du compte>`** (par exemple `%USERPROFILE%\.codex-qg\openai1`) ; ne poser `CODEX_API_KEY` que pour un compte « clé API » ; le SDK n'hérite pas de `process.env` quand `env` est fourni → recopier `PATH`, `SystemRoot`, etc. |
| Stockage du jeton | réglage de config | `cli_auth_credentials_store = "file"` (`config` du SDK ou `-c`) pour garder `auth.json` dans `CODEX_HOME` |
| Connexion (équivalent de `ouvrirConnexion`) | `codex login` (navigateur, port 1455) ou `codex login --device-auth` (bêta) | `CODEX_HOME` du compte ; un seul `codex login` à la fois sur le PC |
| Déconnexion / état | `codex logout` / `codex login status` | `CODEX_HOME` du compte ; « connecté » = présence de `CODEX_HOME/auth.json` |
| Lancer une tâche | `thread = codex.startThread({ workingDirectory, model, sandboxMode, approvalPolicy: "never", modelReasoningEffort, webSearchMode, skipGitRepoCheck })` puis `thread.runStreamed(prompt, { outputSchema, signal })` | `workingDirectory` = dossier du projet ; `skipGitRepoCheck: true` si le projet n'est pas un dépôt Git |
| Profils | `sandboxMode` | lecture = `read-only` ; édition et édition+tests = `workspace-write` (réseau coupé par défaut, `.git` protégé) |
| Reprise | `codex.resumeThread(threadId)` ou `codex exec resume <id>` | même `CODEX_HOME` (les sessions sont dans `CODEX_HOME/sessions`) |
| Arrêt | `AbortController.signal` passé à `run`/`runStreamed` | — |
| Outils du QG | serveur MCP HTTP du QG déclaré par `config: { mcp_servers: { qg: { url, bearer_token_env_var } } }` ; `required: true` conseillé | `bearer_token_env_var` + jeton propre à la session dans `env` |
| Limites d'usage et modèles | `codex app-server` (stdio) : `account/rateLimits/read`, `model/list`, `account/login/start` | `CODEX_HOME` du compte ; régénérer les types avec `generate-ts` sur la version installée |
| Image, moteur A | API Images, `gpt-image-2.5-flare` (rapide) ou `-sunburst` (retouche précise) ; paquet npm `openai` | clé API OpenAI stockée comme `cleApi` du compte, jamais lisible par les agents |
| Image, moteur B | sous-tâche `codex exec` demandant `$imagegen`, puis copie du fichier depuis `CODEX_HOME/generated_images/` | `CODEX_HOME` du compte ChatGPT ; **ne pas** poser `OPENAI_API_KEY` (sinon facturation API) |
| Option multi-fournisseurs | `@agentclientprotocol/codex-acp@2.3.0` et `@agentclientprotocol/sdk@2.0.2` | `CODEX_PATH`, `CODEX_CONFIG`, `INITIAL_AGENT_MODE`, `NO_BROWSER=1` |

## Inconnues (à tester avant de s'engager)

1. **Windows natif** : `docs/install.md` dit WSL2, le README et npm offrent du natif. Tester `codex exec` avec le binaire `win32-x64` et le bac à sable MXC sur ce PC (droits d'administrateur nécessaires ?).
2. **Plusieurs processus sur le même `CODEX_HOME`** : deux tâches en parallèle sur le même compte peuvent entrer en conflit au rafraîchissement du jeton (OpenAI conseille de sérialiser). Ce qui se passe réellement sur une seule machine n'est pas documenté.
3. **Trousseau** : avec `cli_auth_credentials_store = "auto"` (valeur par défaut présumée, non confirmée), deux `CODEX_HOME` peuvent-ils entrer en collision dans le trousseau Windows ? Vérifié seulement par précaution : forcer `file`.
4. **Port 1455** : comportement de deux `codex login` simultanés ; la connexion par code d'appareil est en bêta et doit être activée côté ChatGPT.
5. **Événements d'image** : ce que `codex exec --json` émet pour `image_gen` (le SDK n'a pas de type pour ça) et nom des fichiers dans `generated_images/`.
6. **Quota d'image** : consommation réelle en pourcentage de la fenêtre de 5 h pour Plus et Pro 100 $ ; bug 429 ouvert ; Free : désaccord entre la page Pricing et un site tiers.
7. **Prix par image des modèles 2.5** : non publié ; seul le tarif au jeton est documenté. Vérification d'organisation API : conditions exactes non lues.
8. **Conditions d'utilisation** : texte en vigueur non lu (403 Cloudflare). Seules la doc Codex, le message public d'OpenAI et des extraits tiers sont sourcés.
9. **Stabilité** : `--experimental-json`, `codex app-server` et le mode code d'appareil sont expérimentaux ou bêta ; versions publiées plusieurs fois par semaine. Épingler les versions et prévoir un test de fumée à chaque mise à jour.
10. **Coût en euros** : les prix de la page sont en dollars (Pro à partir de 100 $) ; l'utilisateur parle de « ~100 € » : écart de devise non vérifié.
11. **Limites d'usage exactes par forfait** : les plages « messages par 5 heures » sont des estimations ; le Pro n'a « pas de limite sur cinq heures actuellement » mais des limites hebdomadaires peuvent s'appliquer (non détaillées).
12. **Variables ajoutées par OpenAI** : pas d'équivalent documenté de `CLAUDE_AGENT_SDK_CLIENT_APP` ; je n'ai trouvé aucun en-tête d'identification d'application dans le SDK Codex.

## Sources principales (consultées le 26 oct. 2026)

- Docs Codex (redirigées depuis `developers.openai.com/codex/*`) : [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [SDK](https://learn.chatgpt.com/docs/codex-sdk), [Authentication](https://learn.chatgpt.com/docs/auth), [CI/CD auth](https://learn.chatgpt.com/docs/auth/ci-cd-auth), [Pricing](https://learn.chatgpt.com/docs/pricing), [Models](https://learn.chatgpt.com/docs/models), [MCP](https://learn.chatgpt.com/docs/extend/mcp), [Approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security), [CLI](https://learn.chatgpt.com/docs/cli).
- Dépôt `openai/codex` : [README](https://github.com/openai/codex), [SDK TypeScript](https://github.com/openai/codex/tree/main/sdk/typescript), [release 0.164.0 (23 oct. 2026)](https://github.com/openai/codex/releases/tag/rust-v0.164.0), commit de suppression de `codex mcp-server` (5 sept. 2026, #42993), issues [#49214](https://github.com/openai/codex/issues/49214), [#36434](https://github.com/openai/codex/issues/36434), [#56335](https://github.com/openai/codex/issues/56335).
- [openai/skills : compétence imagegen](https://github.com/openai/skills/blob/main/skills/.system/imagegen/SKILL.md).
- API : [Image generation guide](https://developers.openai.com/api/docs/guides/image-generation), [Pricing](https://developers.openai.com/api/docs/pricing), [gpt-image-2.5-flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare).
- ACP : [agentclientprotocol/codex-acp](https://github.com/agentclientprotocol/codex-acp) (v2.3.0, 26 oct. 2026), [organisation](https://github.com/agentclientprotocol).
- Non officielles (signalées) : [codexusage.dev](https://www.codexusage.dev/image-generation) (3-4 oct. 2026), [codex-profiles](https://community.openai.com/t/codex-profiles-switch-codex-accounts-without-copying-auth-json/1380415), [Simon Willison, 23 avril 2026](https://simonwillison.net/2026/Apr/23/gpt-5-5/).
- Registre npm : `npm view @openai/codex`, `@openai/codex-sdk`, `@agentclientprotocol/sdk` (26 oct. 2026).
