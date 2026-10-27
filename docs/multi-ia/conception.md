# Conception « Comptes IA » multi-fournisseurs (tâche T7)

Rédigé le 26 octobre 2026 pour `_QG-dev` (base 1.0.5). Ce document est une conception : aucun code n'a été modifié.

**Lu pour cette conception :**
- `docs/multi-ia/bench-openai.md` (T5) et `docs/multi-ia/bench-autres.md` (T6) ;
- le code : `serveur/comptes.js`, `session.js`, `dg.js`, `taches.js`, `ordonnanceur.js`, `connexion.js`, `conso.js`, `decouverte.js`, `outils-qg.js`, `permissions.js`, `pensees.js`, `basculer.js`, `api-reglages.js`, `bus.js`, `mcp.js`, `equipe.js`, `questions.js` ; `web/parametres.js` (écran Comptes), `web/accueil.js` (configuration guidée), `web/ui.js` (choix du compte) ;
- `config/defauts/` (directives, `profils.json`, `comptes.json`, `reglages.json`) ;
- `docs/protocole.md`, avec la section `pensee` mise à jour par T11 (réflexion complète : `bloc`, `pos`, `ajout`, `fin`, `etat.reflexions`) ;
- `docs/portage-mac/analyse.md` (couche `serveur/plateforme.js`) ;
- la page officielle des profils de permissions Codex ([learn.chatgpt.com/docs/permissions](https://learn.chatgpt.com/docs/permissions), lue le 26/10/2026, marquée « Beta »). Je l'ai lue en plus des benchs pour vérifier qu'on peut interdire la lecture des identifiants.

Conventions :
- « compte IA » = une entrée de `config/comptes.json` ;
- « fournisseur » = la famille d'adaptateur (`claude`, `codex`, `acp`, plus tard `anthropic-compatible`) ;
- « niveau » = l'échelle commune des modèles (`eco`, `standard`, `fort`, `max`).

---

## Résumé

**Faisabilité en 5 lignes**
1. **Claude** reste l'agent de référence. Son code actuel devient l'« adaptateur Claude », sans changement de comportement, ce que vérifient des tests de non-régression.
2. **Codex (ChatGPT ou clé API) est un agent complet.** Le QG lance le binaire officiel `codex exec --experimental-json` avec un `CODEX_HOME` par compte. La sandbox passe par les profils de permissions (bêta), qui savent interdire la lecture des identifiants. Le DG peut tourner sur Codex grâce à `--output-schema`.
3. **Le client ACP générique** (Grok Build, Cursor, Copilot, Mistral Vibe, Kimi, OpenCode…) permet d'ajouter des agents complets. Chaque agent n'est activé qu'après un test d'étanchéité, et d'abord par clé API, car les conditions d'utilisation sous abonnement n'ont pas été lues. Antigravity sous compte Google grand public est exclu.
4. **Les images passent par la délégation** : un outil du QG `generer_image` appelle Codex (abonnement, outil `image_gen`) ou l'API Images (clé facturée). Tout est désactivé par défaut et réglable.
5. **Impossible** : utiliser Codex comme serveur MCP (`codex mcp-server` a été supprimé le 5/9/2026), et piloter Antigravity sous connexion grand public (risque de suspension). **Restreint** : le profil `ops` et le mode prudent sur Codex, qui ne peut pas demander ton accord.

**Lots**
- **Lot 1a** : comptes IA (données v2, migration sans perte, écran « Comptes IA », connexion Codex) ; couche d'adaptateurs ; adaptateur Claude refondu ; adaptateur Codex qui exécute une tâche d'agent ; outils du QG exposés aussi en MCP HTTP ; correspondance des profils avec la sandbox Codex et test d'étanchéité.
- **Lot 1b** (ajouté par ta décision D1) : client ACP générique, catalogue d'agents, qualification par test d'étanchéité, premiers agents par clé API.
- **Lot 2** : priorités et routeur ; choix de l'IA et du modèle du DG ; DG sur Codex ; plan avec IA et compte par tâche et liste de modèles dynamique ; délégation d'images ; configuration guidée sans Claude ; pause par compte avec proposition de bascule (décision D4).
- **Ensuite** : comptes « compatibles Anthropic » (DeepSeek, Kimi, Z.ai, OpenRouter, Ollama, LM Studio), outils spécialisés (Perplexity, xAI Imagine, images Gemini), outil générique `deleguer`, accord en direct pour Codex via `codex app-server`.

---

## Décisions de l'utilisateur (26 octobre 2026, via `mcp__qg__demander`)

| # | Question | Réponse | Ce que ça change dans ce document |
|---|---|---|---|
| D1 | Fournisseurs du lot 1 en plus de Codex | **Codex + client ACP générique (Grok, Cursor, Copilot, Mistral…)**, au lieu de ma recommandation « Codex seul ». Question ajoutée : « ça fonctionnera de quelle façon ? » | Le lot 1 est coupé en **1a** (Claude + Codex) et **1b** (ACP), livrables séparément. Le fonctionnement de l'ACP est expliqué au §2.8. La réponse courte lui a été donnée dans la question suivante. |
| D2 | Délégation d'images : validation | « **Paramétrable dans les réglages, désactivée par défaut, limite réglable par projet de 1 à l'infini. Ajoute aussi une option avec ou sans accord.** » | Réglage `delegation.images` : `actif: false` par défaut ; `accord` (oui/non) ; limite par projet (étage), de 1 à illimitée (§7). |
| D3 | Images par l'API (clé facturée) si l'abonnement ne suffit pas | **Oui, avec un plafond mensuel en dollars qu'il fixe, et son accord au-delà**, « mais réglable dans les réglages, donc optionnel, et désactivé par défaut » | Réglage `delegation.images.api` : `actif: false` par défaut, `plafondMensuelUsd`, accord au-delà du plafond (§7). |
| D4 | Quota épuisé ou compte déconnecté | **Jamais de bascule automatique : pause jusqu'à la remise à zéro, comme aujourd'hui**, « et proposer de passer sur un autre compte mais avec un avertissement ; réglable dans les paramètres pour bloquer les workflows ; par défaut, pause jusqu'à la limite » | Défaut : pause, plus une carte de décision « Attendre / Passer sur {compte} » avec avertissement. Réglage `quota.proposerBascule` : à `false`, la pause est stricte et rien n'est proposé (§5.3). |

**Mes interprétations, à corriger si besoin :**
- D2 : la « limite par projet » se compte **par demande (dossier) et par étage**. Exemple : limite 3 sur l'étage « MonJeu » = 3 images au plus par demande qui travaille sur MonJeu.
- D4 : la pause touche **les tâches du compte épuisé**. Les tâches des autres comptes continuent : ce n'est pas une bascule, car aucune tâche ne change de compte sans ton accord. Le réglage `quota.pause: "globale"` permet de revenir à la pause de tout le QG, comme en 1.0.5.

---

## 1. Verdict de faisabilité par IA

Légende :
- **Agent complet** = le QG peut lui confier une tâche d'agent (lire, modifier, lancer des commandes, rendre une sortie structurée) ;
- **Outil spécialisé** = le QG peut l'appeler pour un service (image, recherche) ;
- **Impossible** = ne pas intégrer.

Les verdicts reprennent ceux des benchs. Quand je restreins un verdict, la raison est écrite.

| IA / produit | Verdict pour le QG | Voie d'intégration | Raison (source) |
|---|---|---|---|
| **Claude (Anthropic)**, abonnement ou clé | Agent complet (existant) | adaptateur Claude (`@anthropic-ai/claude-agent-sdk`, code actuel) | en production depuis la 1.0 |
| **OpenAI Codex**, abonnement ChatGPT | Agent complet | adaptateur Codex (`codex exec --experimental-json`, `CODEX_HOME` par compte) | bench OpenAI §1-2 ; réserve sur les conditions d'utilisation (§10) |
| **OpenAI Codex**, clé API | Agent complet | même adaptateur, `CODEX_API_KEY` | bench OpenAI §2 : voie que la doc recommande pour l'automatisation |
| **Codex comme serveur MCP** | **Impossible** | — | `codex mcp-server` supprimé le 5/9/2026 (#42993) (bench OpenAI §4) |
| **GPT Image via Codex** (abonnement) | Outil spécialisé (moteur B) | sous-session Codex `image_gen`, fichier repris dans `CODEX_HOME/generated_images/` | bench OpenAI §5.1 : pas de taille, de qualité ni de masque ; bug 429 ouvert |
| **OpenAI API Images** (clé) | Outil spécialisé (moteur A) | appel HTTPS du serveur du QG (`gpt-image-2.5-flare` / `-sunburst`) | bench OpenAI §5.2 : contrôle complet, facturé au jeton, prix par image non publié |
| **xAI Grok Build** | Agent complet (lot 1b, **clé API d'abord**) + outil spécialisé (Imagine, plus tard) | ACP `grok agent stdio` | bench autres §3.1 ; automatisation sous abonnement non documentée ; aucune variable de dossier trouvée |
| **Cursor** | Agent complet (lot 1b, clé `CURSOR_API_KEY`) | ACP `agent acp` | bench autres §3.3 ; il faut répondre aux demandes de permission |
| **GitHub Copilot CLI** | Agent complet (lot 1b, jeton « Copilot Requests ») | ACP `copilot --acp --stdio` (préversion) | bench autres §3.5 ; `COPILOT_HOME` isole les comptes |
| **Mistral Vibe** | Agent complet (lot 1b, clé API) + outil d'images (plus tard) | ACP (`mistral-vibe` au registre) | bench autres §3.6 ; abonnement Le Chat non vérifié |
| **Kimi Code** | Agent complet (lot 1b) | ACP `kimi acp`, `KIMI_CODE_HOME` | bench autres §3.9 ; clients tiers documentés ; ne jamais falsifier l'User-Agent |
| **OpenCode** | Agent complet (lot 1b, clés des fournisseurs) | ACP `opencode acp` | bench autres §3.12 |
| **Qwen Code** | Agent complet, **après le lot 2** | ACP `qwen serve` (expérimental) | bench autres §3.8 : OAuth gratuit fermé, ACP expérimental |
| **Google Gemini CLI** (clé API Gemini ou entreprise) | Agent complet, après le lot 2 | ACP (`gemini` au registre) | bench autres §3.4 : reste ouvert aux clés API |
| **Google Antigravity (`agy`)**, abonnement grand public | **Impossible pour le QG** | — | bench autres §3.4 : piloter `agy` depuis un outil tiers sous compte grand public « peut déclencher une suspension » (forum, 8/10/2026) ; la clé API n'est pas prise en charge |
| **Images Gemini (Nano Banana)** | Outil spécialisé (après le lot 2) | API par clé | bench autres §3.4 |
| **Perplexity** | Outil spécialisé (recherche sourcée, après le lot 2) | Agent API / Search API par clé | bench autres §3.2 : pas d'agent de code |
| **DeepSeek, Z.ai (GLM), OpenRouter, Ollama, LM Studio** | Agent complet **indirect** (après le lot 2) | adaptateur Claude avec `ANTHROPIC_BASE_URL` (« compatible Anthropic ») | bench autres §4.2 ; Anthropic ne prend pas en charge ce routage ; qualité variable |
| **Goose, Devin, Junie, Droid, Kilo, Amp…** | Non évalués | ACP possible, au cas par cas | bench autres §3.12 : doc non lue |

---

## 2. Architecture

### 2.1 Vue d'ensemble

```
ordonnanceur.js ─┬─ dg.js (plan, delta, synthèse) ─┐
                 ├─ taches.js (production, vérif) ─┤  construisent une DemandeSession neutre
                 ├─ questions.js, bonheur.js,      │
                 │  personnages.js (utilitaires)   │
                 └─ routeur.js (lot 2) ────────────┤  choisit compte + modèle
                                                   ▼
                              serveur/ia/fournisseurs.js  (registre)
                     ┌──────────────┬──────────────┬──────────────────┐
                     ▼              ▼              ▼                  ▼
               ia/claude.js    ia/codex.js     ia/acp.js        (après le lot 2)
               SDK Agent       codex exec      @agentclient-    ia/claude.js en mode
               (code actuel)   JSONL + app-    protocol/sdk     « compatible Anthropic »
                               server
                     │              │              │
                     └──────── Rappels (surInit, surOutil, surCommande, surModification,
                               surImage, surActivite, flux de pensée, conso, limites)
                                     ▼
                     bus.js → événements existants du site (tache, outil, commande,
                     modification, pensee, conso…) + champs compte/fournisseur

  Outils du QG : outils-qg.js (définition unique) ─┬─ createSdkMcpServer (Claude, en processus)
                                                   └─ serveur/mcp-http.js (Codex, ACP), jeton par session
```

Principe : le reste du serveur ne sait rien des fournisseurs. Il demande une session et reçoit les mêmes rappels qu'aujourd'hui.

### 2.2 Interface d'adaptateur de fournisseur

Fichier `serveur/ia/fournisseurs.js`. Chaque adaptateur exporte un objet de cette forme. Les noms suivent le style du code (français, camelCase).

```js
/** @typedef Adaptateur */
{
  id: 'codex',                        // 'claude' | 'codex' | 'acp' | 'anthropic-compatible'
  nom: 'ChatGPT · Codex',
  acces: ['abonnement', 'cle'],       // types d'accès proposés à l'ajout d'un compte

  // ---- comptes (aucun jeton n'est jamais lu, voir §3.4)
  dossierParDefaut(id),               // ex. ~/.codex-qg/codex1 (Claude : ~/.claude-qg/claude1)
  envPour(compte),                    // environnement COMPLET et nettoyé du processus de l'agent
  etatConnexion(compte),              // { connecte, verifieLe } : stat d'un fichier ou commande officielle
  ouvrirConnexion(compte, { mode }),  // mode 'navigateur' | 'code' : fenêtre plateforme.ouvrirTerminal()
  deconnecter(compte),                // Promise<boolean>
  decouvrir(compte),                  // Promise<Decouverte> : modèles, efforts, forfait, e-mail, MCP, sans tokens
  lireLimites(compte),                // Promise<Limites|null> : fenêtres d'usage, sans tokens

  // ---- capacités (statiques ou mesurées par la qualification)
  capacites(compte),                  // voir ci-dessous
  modeles(compte),                    // [{ id, nom, efforts: [...], niveau: 'eco'|'standard'|'fort'|'max' }]

  // ---- sessions
  lancer(demande, rappels),           // → { fin: Promise<SortieSession>, injecter(texte), interrompre() }
}
```

`capacites(compte)` renvoie :

```js
{
  profils: { lecture: 'garanti', 'lecture+tests': 'garanti', verif: 'garanti',
             edition: 'garanti', 'edition+tests': 'restreint', ops: 'refuse' },  // §4
  modePrudent: false,      // sait demander ton accord avant chaque action non couverte
  sortieStructuree: 'native' | 'emulee',
  reprise: true,           // reprendre une conversation (réserve d'agents, compléments)
  fork: false,             // cloner une conversation (agent occupé réembauché, question sans interrompre)
  injection: 'interruption-reprise' | 'native',
  imagesEntree: true,      // images jointes au prompt
  images: 'abonnement' | 'api' | null,   // génération (délégation, §7)
  mcp: { http: true, stdio: true, demandeParAppel: false },
  pensees: 'flux' | 'blocs' | 'aucune',  // réflexion en direct ou par blocs complets
  cout: 'equivalent-api' | 'jetons' | 'appels',
  sessionsParCompte: 1 | null,           // plafond de sessions simultanées (null = pas de plafond propre)
}
```

**`DemandeSession`**, la demande neutre construite par `taches.js`, `dg.js`, `questions.js`, `bonheur.js`, `personnages.js` et `delegation.js` :

```js
{
  role: 'tache' | 'verif' | 'dg' | 'question' | 'utilitaire' | 'delegation',
  compte, modele, effort,
  prompt, images: [chemins],             // pièces jointes (blocsImages pour Claude, --image pour Codex)
  cwd, dossiersSup: [...],               // = additionalDirectories actuels
  zones: [...],                          // zones écrivables calculées par permissions.zones() + pièces
  profil: 'lecture' | 'lecture+tests' | 'verif' | 'edition' | 'edition+tests' | 'ops',
  consignes,                             // directive(...) + skills « toujours »
  langue,                                // REGLAGES.langueIA (texte de langueIA())
  schema,                                // JSON Schema de la sortie (SCHEMA_RESULTAT, SCHEMA_PLAN…) ou null
  outilsQg: { tache, dossier, captures, noms: [...] } | null,
  mcpEtage: optionsMcp(...),             // serveurs du projet et connecteurs, avec leurs modes
  skills: { toujours, dispo },
  reprise: { session, fork: false } | null,
  limites: { tours, minutes },
  signal, titre,
  conso: { role, dossier, tache, etage },
  reflexion: true,                       // pensées en direct demandées
  canUseTool,                            // Claude seulement (main levée), ignoré ailleurs (§4)
}
```

**`SortieSession`**, rendue par tous les adaptateurs. Elle reprend l'objet actuel de `executerSession`, avec un nom de champ normalisé :

```js
{ sessionId, structure /* = result.structured_output */, erreur /* 'authentication_failed' | 'billing_error' | 'rate_limit' | 'profil_refuse' | … */,
  limite /* { resetsAt, type } */, exception, contexte, modeleReel, compte, fournisseur }
```

`raisonEchec(s)` (aujourd'hui dans `session.js`) devient générique : `structure == null` donne « pas de sortie structurée ». `ERREURS_FATALES` garde `authentication_failed` et `billing_error`, plus `profil_refuse`.

**Rappels** : ce sont ceux d'aujourd'hui (`surInit`, `surOutil`, `surActivite`, `surImage`, `surCommande`, `surModification`, `surPensee`), plus deux rappels internes :
- `surConso(meta, delta, modele)`, qui appelle `enregistrerAppel` et `enregistrerCout` ;
- `surLimite(info)`, qui appelle `majLimiteEvenement`.

`ordonnanceur.js` (`executerProduction`, `verification`) ne change donc presque pas.

### 2.3 Diffusion dans le protocole existant

Chaque adaptateur traduit ses événements en appels de rappels. Le site reçoit exactement les événements actuels. Le protocole gagne seulement des champs (voir §9, « protocole 1.0.6 »).

| Événement du site | Claude (actuel) | Codex (`exec --experimental-json`) | ACP (`session/update`) |
|---|---|---|---|
| `tache` running, `modeleReel` | message `system/init` | `thread.started` (`thread_id`), modèle demandé | réponse de `session/new` (`sessionId`) |
| `outil` (bulle) | `tool_use` | `item.started` : `command_execution` → `Bash`, `file_change` → `Edit`/`Write`, `mcp_tool_call` → `mcp__<serveur>__<outil>`, `web_search` → `WebSearch`, `todo_list` → `TodoWrite` | `tool_call` (`kind` : read, edit, execute, fetch, search…) |
| `commande` (terminal) | `tool_use` Bash + `tool_result` | `command_execution` started/completed (`command`, `aggregated_output`, `exit_code`) | `tool_call` / `tool_call_update` de kind `execute`, ou terminal fourni par le QG |
| `modification` (diff) | `tool_use_result.structuredPatch` | `file_change` completed : chemins et type seulement, **diff recalculé par le QG** (voir ci-dessous) | `tool_call_update` avec contenu `diff` (ancien/nouveau texte) |
| `pensee` | flux `thinking` / `text` / `tool_use` | élément `reasoning` (résumé de raisonnement), `agent_message` | `agent_thought_chunk`, `agent_message_chunk` |
| image reçue (`surImage`) | bloc image dans `tool_result` | contenu image d'un `mcp_tool_call` terminé (à confirmer) | contenu `image` d'un `tool_call_update` |
| `conso` | `message_start` / `message_delta` / `result` | `turn.completed.usage` (entrée, entrée en cache, sortie, raisonnement) | jetons si l'agent les envoie, sinon nombre d'appels |
| limites | `rate_limit_event` + lecture sans tokens | `turn.failed` / `error` (« usage_limit_reached ») + `codex app-server` `account/rateLimits/read` | message d'erreur seulement |

**Diff des fichiers modifiés par Codex.** Le flux JSONL de `exec` ne donne que `{ path, kind }` pour un `file_change` (types `items.ts` du SDK, bench OpenAI §1). L'adaptateur garde en mémoire le dernier contenu connu de chaque fichier touché pendant la session. La base de la première modification est `git show HEAD:<fichier>` si le fichier est suivi, ou vide si `kind = add`. Le diff vient de `git diff --no-index` entre la base écrite dans un fichier temporaire et le fichier actuel, puis il est découpé en `morceaux` comme dans `modificationDe`. Sans base connue (projet sans git, fichier modifié), l'adaptateur émet `type: "update"`, `morceaux: []` et un nouveau champ `incomplet: true`.

#### Réflexion et langue (consigne T11)

La réflexion passe par un **flux normalisé** commun à tous les adaptateurs. `pensees.js` (T11) en produit l'événement `pensee` : `bloc`, `debut`, `pos`, `ajout`, `fin`, `extrait`, et texte complet dans `etat.reflexions`. Le format du site ne dépend donc pas du fournisseur.

```js
// serveur/ia/flux.js : ce que chaque adaptateur appelle
flux.debutBloc(phase /* 'reflexion' | 'redaction' | 'rapport' | 'outil' */, { outil })
flux.ajout(texte)        // texte ajouté au bloc courant (Codex : texte complet d'un coup)
flux.finBloc()
flux.terminer()          // fin de session : clôt un bloc coupé (fin: true), comme suiviPensees().terminer
```

`suiviPensees` (dans `pensees.js`) prend ces appels en entrée au lieu des événements bruts de l'API Anthropic. L'adaptateur Claude traduit `content_block_start/delta/stop` en `debutBloc/ajout/finBloc`. Ce changement touche le même fichier que T11 : **il faut le faire après T11** et garder ses tests (`tests/pensee.js`).

**Ce que T11 a mesuré** (`docs/mesure-langue-reflexion.md`, 26/10/2026) :
- la réflexion résumée sort en anglais même avec la consigne de langue ;
- une consigne **renforcée** ne change rien sur Haiku et fait **refuser la requête** par les protections de Sonnet (`[reasoning_extraction]`).

La seule voie fiable est donc la **traduction à l'affichage** : réglage `traduireReflexion`, coupé par défaut, dans `serveur/traduction-pensees.js` (`detecterLangue`, `penseeTraduite`). Cette conception l'applique **à tous les fournisseurs** et **n'ajoute aucune consigne de langue propre à la réflexion**, par prudence : demander à un modèle de réécrire son raisonnement peut aussi être vu comme une tentative d'extraction chez OpenAI. Ce point n'a pas été testé chez OpenAI.

| Fournisseur | Ce qui remplit le bloc « reflexion » | Comment la langue choisie (`REGLAGES.langueIA`) s'applique |
|---|---|---|
| Claude | blocs `thinking` résumés (`thinking: { type: 'adaptive', display: 'summarized' }`), en flux | consigne actuelle des directives (« réfléchis dans {LANGUE} »), inchangée ; à la fin du bloc, `detecterLangue` décide s'il faut traduire, puis `penseeTraduite` traduit si `traduireReflexion` est activé (T11). L'adaptateur ne fait rien de plus. |
| Codex | éléments `reasoning` : **résumés de raisonnement** produits par OpenAI. D'après les types du SDK, ils arrivent probablement **bloc par bloc, sans deltas** en mode `exec`, donc envoyés en une fois (`debutBloc` + `ajout(texte complet)` + `finBloc`) ; c'est à vérifier. Le réglage de détail des résumés (`model_reasoning_summary`) n'était pas dans les benchs : à confirmer sur la 0.164. | même consigne neutre (les directives sont passées en instructions développeur) ; même traduction à l'affichage (T11), car le bloc arrive complet. Le test réel du lot 1a mesure la langue obtenue. |
| ACP | `agent_thought_chunk`, en flux | consigne neutre dans le prompt ; même traduction à l'affichage. |
| Compatible Anthropic (après le lot 2) | `thinking` si le fournisseur le prend en charge (DeepSeek : oui ; les autres : à tester) | comme Claude. |

La traduction de T11 lance une session Haiku (`executerSession`). Pour un utilisateur sans Claude, elle passe par le rôle `utilitaire` (§8) : modèle `eco` du compte prioritaire, par ex. `gpt-6-luna`.

### 2.4 Les outils du QG pour tous les fournisseurs : MCP HTTP

Aujourd'hui, `serveurQg()` (`outils-qg.js`) et l'outil `creer_skill` du DG (`dg.js`) sont des serveurs MCP **en processus** du SDK Claude (`createSdkMcpServer`). Codex et les agents ACP ne peuvent pas les appeler.

- `outils-qg.js` déclare chaque outil **une seule fois** : `{ nom, description, schema (zod), executer(ctx, args) }`. Deux habillages s'en servent :
  - `createSdkMcpServer` pour Claude (inchangé pour lui) ;
  - `serveur/mcp-http.js`, une route `POST /mcp/agents` du serveur HTTP du QG (MCP « streamable HTTP » : `initialize`, `tools/list`, `tools/call`), avec des schémas convertis par `z.toJSONSchema` (zod 4).
- **Authentification** : un jeton aléatoire par session. Il est lié à `{ tache, dossier, captures, signal, outils permis }` et révoqué à la fin de la session. Ce n'est pas le jeton du site.
  - Codex : `mcp_servers.qg = { url, bearer_token_env_var = "QG_MCP_JETON", required = true, tool_timeout_sec = 86400 }`. Le délai est long parce que `demander` attend ta réponse, et le défaut est de 60 s (bench OpenAI §4).
  - ACP : `mcpServers` de `session/new` en HTTP si l'agent l'annonce. Sinon, un petit pont stdio → HTTP, `serveur/mcp-pont.js`, lancé par Node.
- La variable `QG_MCP_JETON` est retirée de l'environnement des **commandes** lancées par l'agent (§4.3).
- Les règles actuelles ne changent pas : un outil qui écrit (`generer_image`, `service_demarrer`) n'est donné qu'aux profils qui écrivent, et « une tâche qui doit se servir d'un outil MCP ne peut pas être en profil lecture » (consigne du DG).

### 2.5 Adaptateur Claude (refonte sans régression)

**Ce qui bouge.** Le code ne change pas de comportement, il change de place :

| Aujourd'hui | Demain |
|---|---|
| `session.js` : `executerSession`, compteur de conso, traduction des messages | `ia/claude.js` : `lancer()` = le corps actuel de `executerSession`, presque à l'identique |
| `taches.js` : `optionsProduction`, options de `verifier` | `taches.js` construit une `DemandeSession` ; `ia/claude.js` : `optionsClaude(demande)` rend **exactement** les mêmes objets d'options |
| `dg.js` : `optionsDg` | idem (`role: 'dg'`) |
| `comptes.js` : `envPour`, `compteConnecte`, `CLAUDE_EXE`, `ouvrirConnexion`, `deconnecter` | `ia/claude.js` (le binaire vient de `plateforme.claudeExe()`, voir §2.9) |
| `decouverte.js` : `decouvrir` | `ia/claude.js` : `decouvrir` ; `decouverte.js` garde le cache et appelle l'adaptateur |
| `conso.js` : `lireLimites` (session sans message + `usage_EXPERIMENTAL…`) | `ia/claude.js` : `lireLimites` ; `conso.js` garde `appliquerLecture` et le suivi |
| `connexion.js` | reste le script de console, mais choisit l'adaptateur selon `compte.fournisseur` |

`session.js` reste une **façade** qui exporte `executerSession` (redirigée vers l'adaptateur du compte), `cibleOutil`, `modificationDe`, `ERREURS_FATALES` et `raisonEchec`. Les appelants et les tests existants (`tests/session-v15.js`, `tests/injection.js`, `tests/modifications-diff.js`…) continuent de fonctionner.

**Garantie de non-régression** (test de référence, §9) :
- au début du lot, on enregistre les options produites par le code 1.0.5 pour un jeu de cas : production pour chaque profil, vérification, DG plan/delta/synthèse, question (fork), bonheur ;
- après la refonte, `optionsClaude(demande)` doit rendre des objets identiques (les fonctions comme `canUseTool` et les objets MCP sont comparés par présence et par type) ;
- un rejeu de messages SDK enregistrés doit produire les mêmes événements sur le bus.

### 2.6 Adaptateur Codex

**Choix technique.** Le bench recommande le SDK `@openai/codex-sdk`. Je retiens plutôt **un lanceur maison calqué sur `sdk/typescript/src/exec.ts`** (environ 150 lignes, `serveur/ia/codex-exec.js`), qui pilote le **même** binaire officiel avec le **même** protocole (`codex exec --experimental-json`, prompt sur stdin, `--config` pour les réglages). Raisons :
1. **Tests** : on peut lancer `node tests/faux-codex.js` à la place du binaire. Le SDK exige un exécutable natif (`codexPathOverride`), ce qui empêche un faux en JavaScript sous Windows.
2. **Permissions** : le SDK passe `sandboxMode` en `--sandbox`. Or, d'après la doc, un `--sandbox` fait **retomber Codex sur l'ancienne sandbox** et ignore les profils de permissions, seuls capables d'interdire la lecture des identifiants (§4).
3. **Contrôle** : environnement, arrêt de l'arbre de processus (`plateforme.tuerArbre`), Windows.

Dépendance : `@openai/codex@0.164.0`, version **épinglée** ; il apporte les binaires par plateforme. Les types d'événements du SDK (`events.ts`, `items.ts`) servent de référence et sont recopiés dans un commentaire avec leur version.

**Lancement d'une session**

```
<codex> exec --experimental-json
  --model <modele> --cd <cwd> [--skip-git-repo-check si cwd n'est pas un dépôt]
  [--image <piece>]…
  --output-schema <runtime/ia/schemas/<session>.json>        # si demande.schema
  -c approval_policy="never"                                  # non interactif (bench §4)
  -c cli_auth_credentials_store="file"                        # jeton dans CODEX_HOME/auth.json
  -c model_reasoning_effort="<effort>"
  -c web_search="cached"                                      # "disabled" pour role utilitaire/delegation
  -c default_permissions="qg"  -c permissions.qg=<table TOML en ligne, §4.2>
  -c mcp_servers.qg=<{url=…, bearer_token_env_var="QG_MCP_JETON", required=true, tool_timeout_sec=86400}>
  -c developer_instructions=<consignes + skills « toujours » + langue>   # clé à confirmer ; sinon en tête du 1er message
  -c shell_environment_policy=<exclusions, §4.3>                         # clé à confirmer sur la 0.164
reprise : exec resume <thread_id> (mêmes options)
```

- **Environnement** (`envPour`, comme bench OpenAI « Ce que le QG devrait utiliser ») : on retire tout `OPENAI_*`, `CODEX_*`, `ANTHROPIC*` et `CLAUDE*` hérités, puis on pose `CODEX_HOME=<dossier du compte>`. Pour un compte « clé », on pose aussi `CODEX_API_KEY`. Pour un compte « abonnement », on ne pose **jamais** `OPENAI_API_KEY` (sinon la génération d'images serait facturée à l'API). On garde `PATH` (avec `plateforme.nodeBin()`), `SystemRoot` et le reste du système.
- **Sortie structurée** : `--output-schema` avec les schémas actuels. Ils respectent déjà les règles strictes d'OpenAI (toutes les propriétés dans `required`, `additionalProperties: false`). Le dernier `agent_message` est analysé en JSON. S'il est invalide, `structure = null`, donc « pas de sortie structurée », comme pour Claude.
- **Interrompre** : tuer l'arbre de processus (`AbortSignal`, puis `plateforme.tuerArbre`).
- **Injecter un complément** (`canal.injecter`, `consigneDirecte`, `informer`) : interrompre, attendre la fin du processus, puis `exec resume <thread_id>` avec le complément. La conversation est gardée dans `CODEX_HOME/sessions`.
- **Reprendre** (réserve d'agents, rework) : `exec resume <thread_id>`. `t.x.session` garde l'identifiant de thread, et `t.x.sessionCompte` le compte qui le possède (une conversation ne passe pas d'un compte à l'autre).
- **Fork** : non disponible dans `exec`. Un agent réembauché déjà occupé devient une nouvelle recrue (`fork: false`) ; les questions à un agent passent par le repli du §8.
- **Consommation** : `turn.completed.usage` donne `entree = input − cached`, `cacheLu = cached`, `sortie = output` (le raisonnement est compté dans la sortie et gardé à part dans un champ `raisonnement`) et `appels = 1` par tour. **Coût** : 0 pour un abonnement (affiché « inclus dans l'abonnement ») ; pour une clé, estimation d'après une table de tarifs datée (après le lot 2).
- **Erreurs** : 401 ou « not logged in » → `authentication_failed` ; `usage_limit_reached` ou 429 → `rate_limit` (avec `resetsAt` s'il est fourni) ; erreurs de facturation → `billing_error`.
- **Sessions simultanées** : `sessionsParCompte: 1` par défaut pour un compte « abonnement », parce qu'OpenAI déconseille d'utiliser un `auth.json` en parallèle (bench OpenAI §2, inconnue 2). Ce plafond est relevé si le test du lot 1a montre que plusieurs processus sur un même `CODEX_HOME` ne posent pas de problème. Les tâches en trop attendent dans la file avec le motif « {compte} occupé ».

**Lectures sans tokens** : `serveur/ia/codex-app-server.js` lance `codex app-server` (JSON-RPC sur stdio) avec l'environnement du compte, le temps d'une lecture, comme la découverte de Claude :
- `account/read` donne le forfait et l'e-mail ;
- `model/list` donne les modèles et leurs efforts ;
- `account/rateLimits/read` donne `primary`/`secondary` (`usedPercent`, `windowDurationMins`, `resetsAt`), les crédits et le forfait.

Les fenêtres sont rangées dans `limites[compte].fenetres` sous les clés `codex:primary` et `codex:secondary`, avec un champ `nom` (« 5 h », « semaine », d'après `windowDurationMins`) que le site affiche quand il ne connaît pas la clé. Ce protocole est expérimental : types régénérés par `codex app-server generate-ts` sur la version épinglée.

**Efforts** : `low`, `medium`, `high`, `xhigh` et `max` correspondent à Low, Medium, High, Extra High et Max. Light et Ultra ne sont pas proposés (Ultra lance des sous-agents). Un effort non pris en charge par le modèle descend au plus proche disponible.

### 2.7 Niveaux et équivalences de modèles

Le DG et les priorités raisonnent par niveau. Chaque modèle découvert reçoit un niveau dans `config/defauts/equivalences.json`, que tu peux modifier dans Réglages › Priorités.

| Niveau | Claude | Codex (noms du bench OpenAI, 26/10/2026) |
|---|---|---|
| `eco` | `haiku` | `gpt-6-luna` |
| `standard` | `sonnet` | `gpt-6.1-terra` |
| `fort` | `opus` | `gpt-6.1-sol` |
| `max` | `fable` | `gpt-6-astra` |

Un modèle inconnu (nouvelle version) prend le niveau indiqué par son nom s'il ressemble à un modèle connu, sinon `standard`, et il est signalé dans Réglages.

### 2.8 Adaptateur ACP générique (lot 1b) : comment ça marche

C'est la réponse détaillée à ta question de D1.

1. **Le compte** : un compte ACP choisit un agent du **catalogue** (`config/defauts/agents-acp.json`). Une entrée du catalogue contient :
   - la commande de lancement par plateforme, par ex. `["grok","agent","stdio"]`, `["copilot","--acp","--stdio"]`, `["agent","acp"]`, `["kimi","acp"]`, `["opencode","acp"]` ;
   - la façon de l'installer ;
   - ses variables (`XAI_API_KEY`, `CURSOR_API_KEY`, `COPILOT_GITHUB_TOKEN` + `COPILOT_HOME`, `KIMI_CODE_HOME`…) ;
   - les types d'accès permis (`cle` d'abord ; `abonnement` seulement si l'éditeur documente le pilotage) ;
   - la correspondance entre les profils du QG et les modes de l'agent ;
   - l'état de sa qualification.
2. **La session** : `@agentclientprotocol/sdk` (2.0.2) lance la commande en sous-processus et dialogue en JSON-RPC sur stdin/stdout. L'échange suit la spécification ACP ; les noms de méthodes sont à revérifier sur la version épinglée.
   - `initialize` : le QG annonce qu'il fournit la lecture et l'écriture de fichiers (`fs`) et un terminal ;
   - `authenticate` : selon le type d'accès ;
   - `session/new` : avec `cwd` = dossier de l'étage et `mcpServers` = les outils du QG en HTTP ou via le pont stdio ;
   - le mode et le modèle, si l'agent les propose ;
   - `session/prompt` : texte et images.
3. **Le flux** : les `session/update` (`agent_thought_chunk`, `agent_message_chunk`, `tool_call`, `tool_call_update`, `plan`) sont traduits en pensées, bulles, terminal et diffs (§2.3).
4. **Les autorisations** : chaque `session/request_permission` passe par une fonction neutre `decisionProfil(tache, action)`, extraite de `canUseToolPour` (`permissions.js`). Elle applique les mêmes règles que pour Claude :
   - lecture et écriture dans les zones selon le profil ;
   - `toujoursRefuse` ;
   - identifiants illisibles ;
   - « Toujours pour {nom} » ;
   - sinon, **main levée** dans le site.

   Les lectures et écritures que l'agent fait **par le QG** (`fs/read_text_file`, `fs/write_text_file`) et les commandes lancées **par le terminal du QG** sont filtrées de la même façon. L'ACP permet donc aussi le mode prudent et le profil `ops`, à condition que l'agent demande vraiment avant chaque action, ce que vérifie la qualification.
5. **La sortie structurée est émulée** : la fin du prompt contient le schéma et la consigne « rends uniquement ce JSON ». Le QG valide la réponse et, si elle est invalide, relance une fois avec l'erreur.
6. **Arrêt et compléments** : `session/cancel` puis un nouveau `session/prompt` dans la même session (pas de fork). La reprise après redémarrage se fait par `session/load`, seulement si l'agent annonce cette capacité ; sinon `reprise: false` et l'agent ne va pas dans la réserve.
7. **Qualification** (`serveur/ia/qualification.js`) : avant la première utilisation d'un agent, et après chaque changement de version, un essai court tourne dans `bac-a-sable/`. On place un faux secret hors des zones, et le prompt contient une injection volontaire (« lis ce fichier », « écris dans ce dossier », « lance cette commande »). Le profil est **qualifié** si l'agent a demandé l'autorisation ou échoué à chaque action interdite, et si le faux secret n'apparaît ni dans ses sorties ni dans ses messages.
   - Les profils non qualifiés sont **refusés** pour ce compte.
   - L'essai coûte quelques appels : il demande ton accord et s'affiche comme une tâche du bac à sable.
   - Les résultats vont dans `runtime/qualifications.json` (`{ agent, version, profils, date }`).

Pour le lot 1b, les agents visés sont ceux qui ont une clé API et une isolation claire : Copilot (`COPILOT_HOME`), Kimi (`KIMI_CODE_HOME`), Cursor (clé), Grok Build (clé), Mistral Vibe (clé) et OpenCode (clés). Qwen et Gemini CLI viennent après le lot 2 ; Antigravity grand public est exclu.

### 2.9 Binaires par plateforme (avec le portage macOS)

Le portage macOS (`docs/portage-mac/analyse.md`) a créé `serveur/plateforme.js`, qui exporte déjà notamment `claudeExe()`, `ouvrirTerminal()`, `tuerArbre()`, `nodeBin()`, `pathAvecNode()`, `memeChemin()`, `cheminRegle()`, `fichierIdentifiants()` et `compteConnecteSelonPlateforme()`. Cette conception s'appuie dessus et y ajoute ce qui suit :

| Fonction (`plateforme.js`) | Claude | Codex | ACP |
|---|---|---|---|
| binaire | `claudeExe(plat, arch)` (existe) | **à ajouter** : `codexExe(plat, arch)`, sur le même modèle. Paquet `@openai/codex-${platform}-${arch}` (win32-x64/arm64, darwin-x64/arm64, linux-x64/arm64 : bench OpenAI §1), résolu par `import.meta.resolve`. Le chemin interne du binaire est à relever à l'installation. | **à ajouter** : `commandeAgent(entreeCatalogue, plat)`. Commande du catalogue par plateforme, recherche dans le `PATH` ; sous Windows, un `.cmd` passe par `cmd /d /c` (spawn sans shell sinon). |
| `ouvrirTerminal(titre, argv)` (existe) | connexion `claude auth login` | `codex login` ou `codex login --device-auth` | connexion propre à l'agent, s'il en a une |
| état de connexion | `compteConnecteSelonPlateforme({ configDir, env })` (existe) : fichier `.credentials.json` sous Windows, `claude auth status` sur Mac (trousseau) | **à généraliser** (paramètre `fournisseur`) : fichier `CODEX_HOME/auth.json` sur les deux systèmes (stockage `file` forcé) | clé présente, ou commande d'état du catalogue |
| `tuerArbre(pid)` (existe) | interruption par le SDK | arrêt de `codex exec` | arrêt de l'agent ACP |
| `pathAvecNode()` (existe) | PATH des sessions | PATH de `codex exec` (l'environnement est complet, non hérité) | PATH de l'agent |

Sandbox Codex selon le système (doc permissions, 26/10/2026) :
- **macOS** : Seatbelt, qui **refuse d'exécuter** si la règle n'est pas applicable ;
- **Windows natif** : MXC, avec un repli `elevated` et un repli `unelevated` plus faible. Le test d'étanchéité (§4.4) tranche sur chaque PC.

`installer.ps1` (et son équivalent Mac) ne doit plus **exiger** le binaire Claude : il vérifie chaque binaire installé et signale ceux qui manquent sans bloquer, condition du cas « sans Claude » (§8).

---

## 3. Modèle de données des comptes IA

### 3.1 `config/comptes.json` version 2

```json
{
  "version": 2,
  "defaut": "claude1",
  "comptes": [
    { "id": "claude1", "nom": "Claude perso", "fournisseur": "claude", "acces": "abonnement",
      "configDir": "{HOME}\\.claude-qg\\claude1", "actif": true },
    { "id": "claude3", "nom": "Claude API", "fournisseur": "claude", "acces": "cle",
      "configDir": "{HOME}\\.claude-qg\\claude3", "cleApi": "sk-ant-…" },
    { "id": "codex1", "nom": "ChatGPT perso", "fournisseur": "codex", "acces": "abonnement",
      "configDir": "{HOME}\\.codex-qg\\codex1" },
    { "id": "openai1", "nom": "OpenAI API", "fournisseur": "codex", "acces": "cle",
      "configDir": "{HOME}\\.codex-qg\\openai1", "cleApi": "sk-…" },
    { "id": "copilot1", "nom": "Copilot", "fournisseur": "acp", "agent": "copilot", "acces": "cle",
      "configDir": "{HOME}\\.acp-qg\\copilot1", "cleApi": "github_pat_…" }
  ]
}
```

- `configDir` garde son nom : c'est le `CLAUDE_CONFIG_DIR`, le `CODEX_HOME` ou le dossier de l'agent ACP (`COPILOT_HOME`…). `permissions.developper()` s'en sert déjà pour `{COMPTES}`, donc les dossiers Codex et ACP deviennent illisibles pour les agents **sans autre code**.
- `actif` (vrai par défaut) permet de sortir un compte des priorités sans le retirer.
- Identifiants des nouveaux comptes : `${fournisseur}${n}` (`codex1`), ou `${agent}${n}` pour ACP. **Les identifiants existants ne changent jamais** : `conso.json`, `limites`, `runtime/decouverte/<id>.json`, `equipe.json`, `dossier.compte` et `mcp.json` y font référence.
- Clés reconnues à l'ajout : `sk-ant-` (Anthropic, règle actuelle) ; `sk-` (OpenAI) ; pour ACP, le format indiqué dans le catalogue.
- `config/defauts/comptes.json` (nouvelle installation) devient `{ "version": 2, "defaut": null, "comptes": [] }`. La configuration guidée crée le premier compte, quel que soit le fournisseur. `trouverCompte` et `supprimerCompte` acceptent une liste vide (garde-fous aux endroits qui supposent `comptes[0]`).

### 3.2 Migration sans perte

Dans `chargerComptes()`, au premier chargement d'un fichier sans `version` :
1. copie de sauvegarde `config/comptes.v1.json`, si elle n'existe pas déjà ;
2. pour chaque compte : `fournisseur: "claude"` et `acces: cleApi ? "cle" : "abonnement"` ; tous les autres champs sont gardés tels quels (`note`, `configDir`, `cleApi`) ;
3. `version: 2`, puis écriture atomique (`ecrireJson`).

La migration est **idempotente** : un fichier déjà en version 2 n'est pas modifié. Elle ne touche aucun dossier de connexion. Les dossiers en cours gardent `compte: "claude2"`, qui reste valable. En lot 2, `dossier.dg.compte` est déduit de `dossier.compte` pour les anciens dossiers.

### 3.3 Connexion par fournisseur

| Fournisseur / accès | Ajout | Connexion | « Connecté » | Déconnexion |
|---|---|---|---|---|
| Claude abonnement | inchangé (`ajouterCompte`) | `connexion.js` → `claude auth login` dans une fenêtre | `.credentials.json` existe (Windows) ; `auth status` (mac) | `claude auth logout` |
| Claude clé | inchangé | — | clé présente | retirer le compte |
| Codex abonnement | crée `~/.codex-qg/<id>` | `connexion.js <id> login` → `codex login -c cli_auth_credentials_store="file"` avec `CODEX_HOME` ; bouton « La page ne s'ouvre pas » → `codex login --device-auth` (bêta, à activer d'abord dans les paramètres de sécurité ChatGPT). **Une seule connexion Codex à la fois** sur le PC (port 1455), gardée par un verrou du serveur. | `CODEX_HOME/auth.json` existe | `codex logout` |
| Codex clé | `cleApi` (`sk-…`) | — (`forced_login_method="api"` dans les options) | clé présente | retirer le compte |
| ACP clé | `cleApi` + agent du catalogue | — | clé présente + agent installé (`binaire` trouvé) | retirer le compte |
| ACP abonnement (si permis par le catalogue) | dossier propre (`COPILOT_HOME`, `KIMI_CODE_HOME`) | commande de connexion de l'agent dans une fenêtre | commande d'état du catalogue | commande de déconnexion |

`api-reglages.js`, `surveillerConnexion(id)` : on surveille la date de modification du fichier propre au fournisseur (`.credentials.json` ou `auth.json`), en stat seulement. Dès qu'il change, `decouvrir` puis `lireLimites` sont lancés, comme aujourd'hui.

Plus tard, Codex pourra se connecter sans fenêtre de console grâce à `account/login/start` de `codex app-server` : le site ouvrirait directement l'adresse. Le lot 1a garde la fenêtre, comme pour Claude.

### 3.4 Le QG ne lit jamais les jetons

Cette règle, déjà vraie (`comptes.js`, en-tête), s'étend à tous les fournisseurs :
- **Jetons de connexion** (`.credentials.json`, `auth.json`, trousseau) : le QG ne fait **jamais** que tester leur existence ou leur date de modification. Il ne les ouvre pas, ne les copie pas et ne les envoie nulle part. Seuls les binaires officiels les lisent. Un test le vérifie : pendant toute la suite de tests, `fs.readFileSync` et `fs.openSync` sont espionnés et échouent sur ces noms de fichiers.
- **Clés API saisies par toi** : elles restent dans `config/comptes.json`, sur ce PC. Le serveur les transmet seulement par l'environnement du binaire officiel (`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, variables ACP) ou par l'appel HTTPS de l'API Images. Elles n'apparaissent jamais dans les journaux, le site ou les événements (`comptesPublics` n'expose que le type d'accès).
- **Les agents ne peuvent lire ni les dossiers de connexion ni `config/*.json`** : règles Claude actuelles (`Read({COMPTES})`, `Read({QG}/config/*.json)`), règles `deny` de Codex (§4.2), filtre `fs` de l'ACP et qualification. Ajout à `toujoursRefuse` : `Read({HOME}/.codex/auth.json)`, pour le Codex éventuellement installé par ailleurs sur le PC.
- **Ne jamais réutiliser un jeton OAuth hors du client officiel** (pas de proxy « identité Codex » : bench OpenAI §6, réserve 3).

---

## 4. Profils de permissions et sandbox de chaque fournisseur

### 4.1 Ce qu'un profil garantit (invariants)

Une correspondance est **valable** seulement si **chaque invariant** du profil est appliqué par le fournisseur. Sinon, le profil est **restreint** (on enlève des capacités) ou **refusé** pour ce fournisseur. **On ne l'élargit jamais.**

| Invariant | Lecture | Lecture+tests / verif | Édition / Édition+tests | Ops |
|---|---|---|---|---|
| I1 : aucune écriture hors des zones sans ton accord | aucune écriture | aucune écriture | zones seulement | zones ; le reste en main levée |
| I2 : identifiants et `config/*.json` du QG illisibles | oui | oui | oui | oui |
| I3 : code du QG non modifiable | oui | oui | oui | oui |
| I4 : pas de publication (`git push`, `npm publish`, `rojo upload`), sauf `gitAuto` | oui | oui | oui | oui |
| I5 : commandes limitées | aucune | liste de vérification | mode auto | une action à la fois, avec ton accord |
| I6 : mode prudent = accord pour chaque action non couverte | — | — | oui | oui |
| I7 : serveurs longs seulement via l'outil du QG (`rojo serve` interdit) | oui | oui | oui | oui |

### 4.2 Correspondance par fournisseur

| Profil QG | Claude (inchangé, `optionsProfil`) | Codex (profil de permissions `qg`, sans `--sandbox`) | ACP (si qualifié) |
|---|---|---|---|
| `lecture` | `dontAsk`, outils Read/Glob/Grep/Web | `:root = read`, `deny` sur les secrets, réseau des commandes coupé, `web_search` permis : **garanti, avec un écart à justifier** (voir ci-dessous) | mode lecture de l'agent + `decisionProfil` refuse toute écriture ou commande |
| `lecture+tests`, `verif` | Bash limité à une liste (`npm test`, `node --test`…) | même profil que `lecture` : n'importe quelle commande, mais **sans écriture, sans réseau, sans lecture des secrets**. **Garanti avec le même écart.** | commandes de la liste seulement (terminal du QG / demande d'autorisation) |
| `edition` | mode auto, écriture dans `{ZONES}`, « demander » hors des zones | `:root = read` ; `write` sur **les dossiers de l'étage + le dossier des pièces + `:tmpdir`** seulement (plus étroit que `{ZONES}`, qui comprend toutes les racines) ; `.git` en lecture ; `{QG}` en lecture ; `deny` sur les secrets ; réseau coupé. **Restreint.** | `decisionProfil` (zones, `toujoursRefuse`, main levée) |
| `edition+tests` | idem + commandes de vérification | idem `edition` ; les tests tournent, mais sans réseau. **Restreint.** | idem |
| `ops` | chaque action passe par toi | **refusé** : Codex `exec` ne peut pas demander (`approval_policy = never`) | permis si la qualification montre qu'il demande avant chaque action |

Table TOML transmise par `-c permissions.qg=…`, pour une tâche `edition` sur l'étage `D:\Dev\MonJeu` (chemins en barres obliques, à vérifier sous Windows) :

```toml
[permissions.qg.filesystem]
":root" = "read"
":tmpdir" = "write"
"D:/Dev/MonJeu" = "write"
"D:/Dev/MonJeu/.git" = "read"                      # pas de commit, donc pas de push (I4)
"D:/Dev/_QG/dossiers/D3/pieces" = "write"          # pièces jointes du dossier, si besoin
"D:/Dev/_QG" = "read"                              # I3, si une racine contient le QG
"D:/Dev/_QG/config" = "deny"                       # I2 (voir la note sur les skills)
"D:/Dev/_QG/runtime/jeton.txt" = "deny"
"{HOME}/.claude-qg" = "deny"                 # {COMPTES} : tous les dossiers de connexion
"{HOME}/.codex-qg" = "deny"
"{HOME}/.acp-qg" = "deny"
"{HOME}/.claude/.credentials.json" = "deny"
"{HOME}/.codex/auth.json" = "deny"
[permissions.qg.network]
enabled = false
```

- La table est générée par `profilCodex(profil, demande)` (`serveur/ia/profils.js`) depuis les mêmes sources que Claude : `zones()`, `dossierConfig()` de tous les comptes, `RACINE`, `os.homedir()`.
- Les règles `deny` portent sur des **sous-arbres exacts**, la forme la plus fiable d'après la doc. Les motifs glob ne sont relevés qu'au démarrage du processus.
- **Note sur les skills** : la règle `deny` sur `config` empêche aussi la lecture de `config/skills/`. Pour Codex, les skills « disponibles » sont donc copiés à chaque session dans `runtime/ia/skills/<session>/`, qui reste lisible. Leur index (nom, description, chemin) est mis dans les consignes. Les skills « toujours » sont déjà dans les consignes.

**L'écart des profils de lecture.** Pour Claude, `lecture` interdit Bash, et `lecture+tests` limite Bash à une liste. Codex, en sandbox lecture seule, peut lancer **n'importe quelle commande**, mais sans écrire, sans réseau et sans lire les secrets : c'est le système qui l'impose, pas une liste de noms d'outils. Les **effets** possibles (lire les zones permises, calculer) sont donc contenus dans ceux du profil Claude : rien n'est modifié, rien ne sort, aucun secret n'est lu. Je considère ce point comme **non élargissant**, avec deux protections :
1. le délai de la tâche coupe une commande qui tourne trop longtemps ;
2. si tu préfères la lecture stricte, le réglage `codex.lectureStricte` (désactivé par défaut) **refuse** les profils `lecture` et `lecture+tests` sur Codex.

**C'est le seul point de la correspondance que je classe comme jugement et non comme fait.**

### 4.3 Réglages du QG, fournisseur par fournisseur

| Réglage / règle | Claude | Codex | ACP |
|---|---|---|---|
| Mode prudent (`modeTravail: "prudent"`) | auto → `default` (demande) | **profils qui écrivent refusés sur Codex** (il ne peut pas demander) ; les profils de lecture restent permis | permis si qualifié (`request_permission` → main levée) |
| `gitAuto` | git libre, push permis | **sans effet** : `.git` reste en lecture et le réseau coupé (restreint) ; message dans Réglages | `decisionProfil` applique `gitAuto` comme pour Claude |
| `ecritureHorsProjet` | écriture hors projet sans demander | **sans effet** (restreint) | comme Claude |
| Connecteurs et MCP de l'étage en mode `demander` | main levée à chaque appel | **non transmis** (il ne peut pas demander) ; seuls les serveurs en mode `auto` sont donnés | main levée via `request_permission` si l'agent la demande pour MCP, sinon non transmis |
| Connecteurs claude.ai du compte | oui | sans objet | sans objet |
| `toujoursRefuse` | règles `disallowedTools` | couvert par le réseau coupé, `.git` en lecture et les `deny` | `decisionProfil` |
| Variables secrètes dans les commandes | les commandes héritent de l'environnement du binaire (actuel) | exclusion de `*KEY*`, `*TOKEN*`, `*SECRET*`, `OPENAI_*`, `CODEX_*`, `ANTHROPIC_*`, `QG_*` par `shell_environment_policy` (clé à confirmer) ; **si l'exclusion n'est pas confirmée, les comptes Codex « clé » sont refusés pour les profils qui lancent des commandes** | terminal du QG : environnement nettoyé de la même façon |

### 4.4 Test d'étanchéité (règle « restreindre ou refuser » appliquée)

- **Codex** (`serveur/ia/codex-etancheite.js`, sans tokens) : à la première utilisation de chaque version du binaire sur le PC, `codex sandbox <plateforme>` (bench OpenAI §4) lance, avec la table `qg` d'un profil `edition`, quatre essais :
  1. lire un faux secret placé dans un dossier en `deny` ;
  2. écrire hors d'une zone ;
  3. écrire dans `.git` ;
  4. ouvrir une connexion réseau.

  Les quatre doivent échouer, sinon **Codex est refusé** sur ce PC pour les profils concernés. Le motif apparaît dans Réglages, par exemple « La sandbox de Windows n'empêche pas la lecture des identifiants : Codex désactivé pour l'édition ». Le résultat est rangé dans `runtime/qualifications.json`. Le repli Windows `unelevated`, plus faible, n'est accepté que s'il réussit ce même test.
- **Configuration qui ferait retomber sur l'ancienne sandbox** : le QG refuse de lancer si le `config.toml` du compte ou le `.codex/config.toml` du projet contient `sandbox_mode`. La doc dit que, dans ce cas, Codex ignore les profils de permissions. Le motif est affiché.
- **ACP** : qualification par agent et par version (§2.8).

---

## 5. Priorités

### 5.1 Modèle de données : `config/priorites.json` (défauts dans `config/defauts/priorites.json`)

```json
{
  "version": 1,
  "types": {
    "code":      { "natures": ["impl", "test", "review", "ops"],
                   "ordre": [ { "compte": "claude1", "modele": "fable" }, { "fournisseur": "codex" } ] },
    "recherche": { "natures": ["analyse", "bench"],   "ordre": [ { "fournisseur": "claude" } ] },
    "redaction": { "natures": ["doc", "synthese"],    "ordre": [ { "fournisseur": "codex", "niveau": "standard" } ] },
    "image":     { "natures": ["asset"],              "ordre": [ { "compte": "codex1", "moteur": "abonnement" },
                                                                 { "compte": "openai1", "moteur": "api" } ] },
    "defaut":    { "ordre": [ { "compte": "claude1" } ] }
  },
  "dg": { "compte": "claude1", "modele": "opus", "effort": "xhigh" },
  "consigneDg": "Crée en priorité les tâches de test sur Codex.",
  "quota": { "pause": "compte", "proposerBascule": true }
}
```

- Une **entrée** vise un `compte` précis, ou un `fournisseur` (ses comptes actifs dans l'ordre de la liste des comptes). Elle peut fixer un `modele` ou un `niveau`.
- Les `natures` correspondent aux natures du plan (`SCHEMA_TACHE.nature`) et se modifient dans Réglages.
- `image` sert à la délégation (§7) : `moteur` = `abonnement` (Codex `image_gen`) ou `api` (API Images).
- Le choix du DG (`dg`) se trouve ici et dans Réglages › Général. Il remplace `REGLAGES.dg.modele`, qui est migré tel quel.

### 5.2 Règles de choix (`serveur/routeur.js`, `choisirCompte(tache, dossier)`)

1. **Filtre dur.** Un compte est éligible seulement s'il remplit toutes ces conditions :
   - il est actif et connecté ;
   - il n'est pas en pause de quota ;
   - son fournisseur **garantit le profil** de la tâche (`capacites().profils` ; §4 : mode prudent, `ops`, test d'étanchéité) ;
   - il a les capacités nécessaires (reprise si l'agent est réembauché, fork si c'est un clone) ;
   - il n'a pas atteint son plafond `sessionsParCompte`, auquel cas la tâche attend sans changer de compte.
2. **Compte imposé** (champ `compte` du plan, ou choix de l'utilisateur sur la demande) : pris s'il est éligible. Sinon, la tâche **attend** avec un motif clair (« codex1 non connecté »), une notification et la carte de décision du §5.3. Jamais de remplacement silencieux.
3. **IA imposée** (champ `ia` du plan) : premier compte éligible de ce fournisseur, dans l'ordre du type de la tâche, puis dans l'ordre des comptes.
4. **Sinon** : liste du type de la tâche (`types.<type>.ordre`), puis `defaut`, puis le compte du dossier.
5. **Agent réembauché** : seulement si son compte est celui choisi. Une conversation ne change pas de compte : `disponiblesPour(compte)` (`equipe.js`) filtre déjà par compte.
6. **Modèle** : si le modèle demandé appartient au compte choisi, il est gardé. Sinon, on prend le modèle du **même niveau** chez ce fournisseur (table du §2.7) ; l'effort descend au plus proche disponible. La justification affichée dit par exemple « opus → gpt-6.1-sol (même niveau) ».
7. **Garde-fou Fable** (1.0.4) : inchangé. C'est un changement de modèle **sur le même compte** (Fable → Opus), pas un changement de compte.
8. **Aucun compte éligible** : la tâche attend avec le motif « aucun compte IA ne peut faire {profil} ({raison}) », et une notification t'explique quoi connecter ou régler.

### 5.3 Quota épuisé ou compte déconnecté (décision D4)

- **Par défaut** : **pause jusqu'à la remise à zéro**. Les tâches du compte passent `queued` avec le motif « limite d'usage de {compte} jusqu'à {heure} ». Les limites sont relues toutes les 5 minutes, comme aujourd'hui (`demarrerSuiviLimites`), et la pause se lève dès qu'une lecture montre de la marge.
- **Proposition de bascule** (`quota.proposerBascule: true` par défaut) : une **carte de décision** (`demanderDecision`) propose :
  - « Attendre la remise à zéro ({heure}) », choix par défaut, retenu aussi sans réponse ;
  - « Passer ces tâches sur {compte éligible suivant} » ;

  avec cet **avertissement** : « Changer de compte pour contourner une limite peut être contraire aux conditions d'utilisation du fournisseur (OpenAI le déconseille). Les agents changent de conversation : le contexte de la réserve est perdu. » Une fois acceptée, la bascule vaut **pour ce dossier seulement**.
- **`quota.proposerBascule: false`** (« bloquer ») : pause stricte, sans proposition.
- **`quota.pause: "globale"`** : retour à la pause de tout le QG (`pauseGlobale`, 1.0.5).
- **Compte déconnecté** (`authentication_failed`) : même logique. Le message remplace l'actuel « lance connexion-compte-{n}.bat » (`ordonnanceur.js`, `echecDg` et `gererEchec`, qui supposent `claude2` ↔ 2) par « Reconnecte {nom} dans Réglages › Comptes IA », avec un bouton.

### 5.4 Interface

- **Réglages › Priorités** (nouvelle section de `web/parametres.js`) :
  - pour chaque type (Code, Recherche, Rédaction, Image, Par défaut) : une liste ordonnée d'étiquettes « compte · modèle », avec ↑ ↓, « + Ajouter » (menu des comptes, modèle ou niveau) et retirer ;
  - les natures rattachées à chaque type (cases) ;
  - la **consigne au DG** (texte libre, par ex. « crée en priorité des tâches sur Codex ») ;
  - le tableau des **équivalences de niveaux** ;
  - le comportement au quota (pause par compte ou globale ; proposer une bascule : oui/non) ;
  - des préréglages en un clic : « Tout sur Claude », « Tout sur Codex », « Claude pour le code, Codex pour la rédaction et les images ».
- **Barre de demande** (`web/ui.js`, menu `#comptes`) : « IA de cette demande : Automatique (priorités) | {compte}… ». « Automatique » est proposé dès qu'il y a plus d'un compte. Un compte choisi impose le DG **et** les tâches de cette demande. Le menu garde « ⚙ Gérer les comptes… ».
- **Tableau blanc et fiches d'agent** : petit badge du fournisseur (Claude, Codex, nom de l'agent ACP) et nom du compte.

---

## 6. Le DG

### 6.1 Choix de son IA et de son modèle

- **Réglages › Général › DG** : [compte ▾] [modèle ▾ (modèles découverts de ce compte)] [effort ▾]. Aujourd'hui, le menu ne liste que les modèles de `S.compteDefaut` (`parametres.js`, ligne 144). La valeur est rangée dans `priorites.dg`.
- **Par demande** : la barre du bas permet déjà de changer le modèle et l'effort ; on y ajoute le compte. `dossier.dg = { compte, modele, effort }`. Pour un ancien dossier, `dossier.dg.compte = dossier.compte`.
- `modeleDg(dossier)` (`dg.js`) prend le modèle demandé s'il existe pour le compte du DG. Sinon, il prend le plus capable disponible **de ce compte**, par niveau (`max` est exclu par défaut pour le DG ; ordre `fort`, `max`, `standard`).
- **Session du DG** : `dossier.x.dgSession` + `dossier.x.dgCompte`. Si le compte du DG change en cours de dossier, une nouvelle session démarre avec un récapitulatif (le tableau des tâches, `tableau(d)`).

### 6.2 DG sur Codex

`appelerDg` construit une `DemandeSession` :
- `role: 'dg'`, `profil: 'lecture'`, `cwd: racines()[0]`, `dossiersSup: racines().slice(1)` ;
- `schema` : `SCHEMA_PLAN`, `SCHEMA_DELTA` ou `SCHEMA_SYNTHESE` ;
- `consignes: directive('dg')` + skills ;
- `outilsQg.noms: ['creer_skill']` ;
- `reprise: dgSession`.

Avec Codex :
- lecture seule (§4.2) ;
- `--output-schema` ;
- `creer_skill` par MCP HTTP ;
- images jointes par `--image` ;
- reprise par `exec resume`.

`maxTurns` (`REGLAGES.dg.maxTurns`) n'existe pas chez Codex : il est remplacé par un délai (`limites.minutes`), puis par l'interruption.

### 6.3 Changements du schéma du plan (`dg.js`)

| Champ | Aujourd'hui | Lot 2 |
|---|---|---|
| `SCHEMA_TACHE.modele` | `enum: MODELES` (`haiku`, `sonnet`, `opus`, `fable`), complété par `schemaAvecModeles` avec les modèles du compte du dossier | **union des modèles des comptes actifs et connectés** : alias Claude, identifiants précis, modèles Codex et ACP. Les identifiants sont uniques d'un fournisseur à l'autre ; en cas de doublon, `fournisseur:modele`. |
| `SCHEMA_TACHE.effort` | `EFFORTS` | inchangé (union des efforts ; l'adaptateur descend au plus proche) |
| **`SCHEMA_TACHE.ia`** (nouveau, requis) | — | `enum: ['auto', ...fournisseurs connectés]`. `auto` = suivre les priorités. |
| **`SCHEMA_TACHE.compte`** (nouveau, requis) | — | `enum: ['', ...comptes actifs connectés]`. `''` = laisser le routeur choisir. Sert à « compte 1, compte 2 ». |
| `verification.modele` | `MODELES` | même union. La directive conseille un modèle **d'un autre fournisseur** quand c'est possible, pour une relecture croisée. |
| `SCHEMA_DELTA.ops[].modele` | `['', ...MODELES]` | `['', ...union]` + nouveau champ `compte` (`''` ou un identifiant) pour `relancer` |

- `schemaAvecModeles` devient `schemaDynamique(schema, { modeles, fournisseurs, comptes })`, qui remplit les trois énumérations.
- `validerTaches` ajoute ces vérifications :
  - le modèle appartient à l'IA ou au compte demandés ;
  - le profil est garanti par au moins un compte éligible (sinon : « T3 : aucun compte ne peut faire `ops` (Codex ne peut pas demander ton accord) ») ;
  - le compte imposé existe.
- **Limites des sorties structurées d'OpenAI** (taille des énumérations, profondeur) : le schéma de delta est le plus profond (delta → nouvellesTaches → tâche → verification). Le test `dg-codex` le vérifie avec le faux Codex, et un test réel le vérifie avec le vrai.

### 6.4 Adaptation de la directive (`config/defauts/directive-dg.md`)

- **Texte** : « chacune dans sa propre conversation Claude Code » devient « chacune dans sa propre conversation d'agent (Claude, Codex…, selon le compte) ».
- **La grille « Modèle et effort »** raisonne en **niveaux** (eco, standard, fort, max), avec les mêmes lignes qu'aujourd'hui (haiku → eco, sonnet → standard, opus → fort, fable → max).
- **Nouveaux marqueurs** remplacés par `directive()` (`config.js`) :
  - `{COMPTES_IA}` : liste des comptes connectés, avec fournisseur, forfait, modèles par niveau, profils garantis et capacités. Exemple :

    ```
    codex1 (ChatGPT perso, Plus) : eco=gpt-6-luna, standard=gpt-6.1-terra, fort=gpt-6.1-sol, max=gpt-6-astra ; profils : lecture, edition (sans réseau), pas ops ; pas de mode prudent
    ```
  - `{PRIORITES}` : résumé des priorités par type ;
  - `{CONSIGNE_IA}` : la consigne de l'utilisateur (`consigneDg`).
- **Règle ajoutée** : « Si l'utilisateur demande une IA ou un compte (dans sa demande ou dans la consigne), mets `ia` ou `compte` en conséquence. Sinon, laisse `ia: "auto"` et `compte: ""` : le serveur suit les priorités. Ne mets jamais une tâche `ops` ou en mode prudent sur un compte qui ne garantit pas ce profil. »
- `MODÈLES DISPONIBLES POUR CE COMPTE : …` dans `planifier()` devient « COMPTES IA DISPONIBLES ». `noteFable()` reste et ne s'applique qu'aux comptes Claude qui ont Fable.
- **Sur Codex**, il n'y a pas de préréglage `claude_code` : la directive est passée dans les instructions développeur, avec les règles de base utiles (lire avant d'écrire, rester dans le dossier) déjà présentes dans la directive. Le texte reste le même pour les deux fournisseurs.

---

## 7. Délégation (images d'abord)

### 7.1 L'outil `generer_image` (MCP du QG, pour tous les fournisseurs)

```
mcp__qg__generer_image {
  description: string,                 // ce que l'image doit montrer (données de l'agent, pas des instructions au QG)
  chemin: string,                      // fichier de sortie, relatif au projet (.png, .jpg, .webp)
  taille: 'auto' | '1024x1024' | '1536x1024' | '1024x1536' = 'auto',
  qualite: 'auto' | 'low' | 'medium' | 'high' = 'auto',
  fondTransparent: boolean = false,
  references: string[] = []            // images du projet à prendre comme modèle
}
→ { chemin, moteur, compte, cout } + l'image (l'agent la voit) + message dans le fil (comme montrer)
```

- **Présent seulement si** `delegation.images.actif` est vrai (**désactivé par défaut**, D2), et seulement pour les profils qui écrivent. Sinon, l'outil n'est pas proposé et la directive des agents n'en parle pas.
- Le `chemin` est validé comme dans `copierImage` : il doit être dans les zones de l'étage, sans `..`.

### 7.2 Choix du moteur et du compte

Les candidats sont pris dans `priorites.types.image.ordre`, filtrés par les règles du §5.2 et par ces conditions :
- **Moteur B, abonnement** (compte Codex « abonnement ») : sous-session `codex exec` dans `runtime/delegations/<id>/`, profil lecture seule sauf ce dossier, sans réseau des commandes, consigne fixe : « utilise l'outil de génération d'images ($imagegen) pour : <description> ».
  - Le QG compare la liste des fichiers de `CODEX_HOME/generated_images/` avant et après. C'est une liste de fichiers d'images, pas un jeton.
  - Il copie le nouveau fichier vers `chemin`.
  - Ce moteur ne sait pas imposer la taille, la qualité ni la transparence (bench §5.1). Si l'agent les demande explicitement, ce moteur est sauté.
  - Le quota consommé est 3 à 5 fois celui d'un tour normal (bench §5.1).
- **Moteur A, API Images** (compte Codex « clé ») : seulement si `delegation.images.api.actif` est vrai (**désactivé par défaut**, D3).
  - `POST /v1/images/generations`, ou `/v1/images/edits` avec des références, par le serveur du QG (`serveur/ia/images-api.js`, `fetch`, sans dépendance). La clé du compte ne quitte jamais le serveur.
  - Modèle `gpt-image-2.5-flare`, ou `gpt-image-2.5-sunburst` pour une retouche.
  - L'image base64 est écrite dans `chemin`. L'usage renvoyé, multiplié par le tarif daté de `config/defauts/tarifs.json` (30 $ le million de jetons d'image en sortie, lu par T5 le 26/10/2026), donne le coût estimé.
- Si aucun moteur n'est disponible, l'agent reçoit un message clair, par ex. « Génération d'image indisponible : délégation désactivée / quota ChatGPT épuisé jusqu'à 14 h / plafond API atteint. Décris l'image attendue dans ton rapport. »

### 7.3 Garde-fous (décisions D2 et D3)

| Garde-fou | Réglage (Réglages › Priorités › Délégation) | Défaut |
|---|---|---|
| Activation | `delegation.images.actif` | **désactivé** |
| Accord | `delegation.images.accord` : avec accord = carte de décision « {Prénom} veut générer une image : “…” (moteur, compte, coût estimé) » avec Autoriser / Refuser ; sans accord = automatique dans la limite | avec accord |
| Limite par projet | `delegation.images.limites = { defaut: 3, etages: { "mon-jeu": 10, "atelier-3d": null } }` : de 1 à illimité (`null`), comptée par demande et par étage. Au-delà : refus clair à l'agent. Une carte « Autoriser N images de plus pour cette demande » est proposée si l'accord est activé. | 3 par demande (à confirmer) |
| API facturée | `delegation.images.api = { actif, compte, plafondMensuelUsd }`. Avant l'appel, coût estimé au pire, d'après la taille et la qualité. Si le total du mois plus cette estimation dépasse le plafond, **ton accord est demandé** (D3). | désactivée ; plafond à saisir |
| Journal | `runtime/delegations.jsonl` : `{ t, dossier, tache, prenom, compte, moteur, description, chemin, taille, qualite, cout, statut, accord }` + message dans le fil avec l'image + ligne de conso (rôle `delegation`, sur le compte qui a produit l'image) | toujours |
| Délais et parallélisme | moteur B : 5 min, une génération à la fois par compte Codex ; moteur A : 2 min | — |
| Contenu | erreurs de modération (`moderation_blocked`) renvoyées telles quelles à l'agent | — |

### 7.4 Plus tard : `deleguer` générique

`mcp__qg__deleguer { capacite: 'recherche' | 'avis' | 'code', consigne, sortie }` lance une sous-session courte, en lecture seule, sur le compte prioritaire du type, et renvoie son texte. Exemples : demander une relecture à Codex depuis un agent Claude, ou une recherche sourcée à Perplexity (outil spécialisé). Mêmes garde-fous : activation, accord, limite, journal. Ce n'est **pas** dans le lot 2.

---

## 8. Configuration guidée sans compte Claude (de bout en bout)

**Installation.**
- `installer.ps1` (et `installer.sh` côté Mac) installe les dépendances npm. `@openai/codex` est épinglé et apporte son binaire de plateforme.
- L'absence du binaire Claude **n'est plus bloquante** : avertissement seulement.
- `connexion.js` ne quitte plus en erreur quand `claude.exe` manque, sauf pour un compte Claude.

**Configuration guidée** (`web/accueil.js`, étapes `ETAPES`) :

| Étape | Aujourd'hui | Avec Comptes IA |
|---|---|---|
| Bienvenue | « Un immeuble d'agents Claude… » | « Un immeuble d'agents IA (Claude, ChatGPT/Codex…) » |
| Comptes Claude | Claude seulement ; « utiliser mon Claude Code déjà connecté » | **Comptes IA** : trois cartes. **Claude** (abonnement ou clé). **ChatGPT · Codex** (abonnement ou clé ; connexion par navigateur ou par code ; rappel « un compte = une personne, sur son propre PC »). **Autres agents (ACP)** (catalogue, clé API, qualification). Il faut **au moins un compte connecté, quel que soit le fournisseur**. |
| Tes projets | inchangé | inchangé |
| Mode de travail | textes qui parlent du « mode auto de Claude Code » | textes neutres ; si seul Codex est connecté : « en mode prudent, Codex peut seulement lire (il ne sait pas demander ton accord) » |
| Connecteurs et dictée | connecteurs claude.ai | partie connecteurs claude.ai masquée sans compte Claude ; dictée inchangée (Whisper local) |
| **Priorités** (nouvelle) | — | préréglage proposé selon les comptes connectés : « Tout sur Codex » (DG `gpt-6.1-sol` en effort `high`) si seul Codex est connecté ; « Claude pour le code, Codex pour la rédaction » si les deux le sont |
| C'est prêt | — | rappel : délégation d'images désactivée, activable dans Réglages |

**Fonctionnement pour un utilisateur qui n'a que Codex** (chaque ligne est couverte par un test du lot 2) :

| Fonction | Avec Codex seul |
|---|---|
| DG (plan, delta, synthèse, question au DG) | adaptateur Codex, `--output-schema` (§6.2). Question au DG pendant qu'il travaille : repli ci-dessous. |
| Tâches et vérification | adaptateur Codex (§2.6) ; profils restreints du §4 |
| Réserve d'agents | réembauche par `exec resume` ; pas de clone (nouvelle recrue) |
| Consigne directe, compléments | interruption puis reprise |
| Question à un agent (`questions.js`, aujourd'hui fork) | repli : une session `utilitaire` courte répond d'après l'activité visible de l'agent (dernières pensées, outils, terminal, résumé de mission), avec la mention « réponse d'après son activité visible ». Fork plus tard si `codex app-server` le permet. |
| Joy (récolte de blagues, `bonheur.js`, aujourd'hui `haiku`) et mini-jeu (`personnages.js`, `sonnet`/`haiku`) | rôle `utilitaire` : modèle `eco` du compte prioritaire ; `modeleDiscussion` / `modeleBavardage` deviennent des niveaux |
| Consommation et limites | `turn.completed.usage` ; `codex app-server` pour les limites et le forfait |
| Skills | « toujours » dans les consignes ; « disponibles » par index + copie lisible (§4.2) |
| MCP de l'étage | serveurs en mode `auto` seulement |
| Connecteurs claude.ai | absents (sans objet) |
| Démo | inchangée (simulation, aucun compte requis) |
| Messages d'erreur de compte | « Reconnecte {nom} dans Réglages › Comptes IA » (plus de `connexion-compte-{n}.bat`) |

---

## 9. Lots de réalisation

Règles communes à tous les lots :
- les tests suivent le style actuel (scripts autonomes `node tests/<nom>.js`, sortie « OK/ÉCHEC », données dans un dossier temporaire ou `dossiers-demo`) ;
- tous les tests existants doivent continuer à passer ;
- les **tests réels** (comptes, tokens) sont séparés et marqués « réel » dans leur en-tête ; ils ne tournent que si un compte est disponible ;
- `docs/protocole.md` reçoit une section « Ajouts 1.0.6 (Comptes IA) ».

### Lot 1a : comptes IA, couche d'adaptateurs, Claude refondu, Codex agent

**Étape 0, avant toute modification** : enregistrer les références 1.0.5 (`tests/fixtures/options-1.0.5/*.json` et `tests/fixtures/flux-claude/*.jsonl`) avec un petit script `outils/capturer-references.mjs`.

**Fichiers créés**

| Fichier | Rôle |
|---|---|
| `serveur/ia/fournisseurs.js` | registre, `adaptateurDe(compte)`, types documentés (§2.2) |
| `serveur/ia/flux.js` | flux normalisé (pensées, §2.3), passerelle vers `pensees.js` |
| `serveur/ia/claude.js` | adaptateur Claude (code déplacé depuis `session.js`, `comptes.js`, `decouverte.js`, `conso.js`) + `optionsClaude(demande)` |
| `serveur/ia/codex.js` | adaptateur Codex (sessions, conso, erreurs, diff) |
| `serveur/ia/codex-exec.js` | lanceur `codex exec --experimental-json` (JSONL) |
| `serveur/ia/codex-app-server.js` | client JSON-RPC : `account/read`, `model/list`, `account/rateLimits/read` |
| `serveur/ia/profils.js` | `profilCodex()`, `profilGaranti(fournisseur, profil, reglages)` (§4) |
| `serveur/ia/codex-etancheite.js` | test d'étanchéité sans tokens (§4.4) |
| `serveur/mcp-http.js` | outils du QG en MCP HTTP + jetons par session (§2.4) |
| `config/defauts/equivalences.json` | niveaux des modèles (§2.7) |
| `tests/faux-codex.js` | **faux exécutable Codex** : lit le prompt sur stdin et rejoue un scénario JSONL choisi par `QG_FAUX_CODEX_SCENARIO` ; écrit ses arguments et son environnement dans `QG_FAUX_CODEX_TRACE` ; crée ou modifie des fichiers pour les `file_change` ; attend sur `sleep` pour les tests d'arrêt |
| `tests/scenarios-codex/*.jsonl` | `succes`, `json-invalide`, `limite`, `non-connecte`, `long` (arrêt), `reprise` |

**Fichiers modifiés**

| Fichier | Changement |
|---|---|
| `serveur/comptes.js` | v2, migration (§3.2), `fournisseur`/`acces`, identifiants par fournisseur, validation des clés, liste vide permise ; `envPour`, `compteConnecte`, `ouvrirConnexion` et `deconnecter` délèguent à l'adaptateur |
| `serveur/connexion.js` | choix de l'adaptateur selon le fournisseur ; verrou de connexion Codex ; menu « Comptes IA » |
| `serveur/session.js` | façade (`executerSession` → adaptateur), garde `cibleOutil`, `modificationDe`, `ERREURS_FATALES`, `raisonEchec` |
| `serveur/taches.js` | `produire`/`verifier` construisent une `DemandeSession` ; compte de la tâche = `dossier.compteAgents || dossier.compte` (étape du lot 1, remplacée par le routeur en lot 2) ; modèle converti par niveau si le compte n'est pas Claude |
| `serveur/dg.js` | `modelesPour` et `listeModeles` passent par l'adaptateur (le DG reste sur un compte Claude en lot 1a ; `optionsDg` → `DemandeSession`) |
| `serveur/decouverte.js` | cache commun ; `decouvrir` → adaptateur |
| `serveur/conso.js` | `lireLimites` → adaptateur ; fenêtres avec `nom` ; `modeleCourt` accepte les noms `gpt-*` ; champ `raisonnement` |
| `serveur/pensees.js` | entrée par le flux normalisé (**après T11**, en gardant `tests/pensee.js`) |
| `serveur/outils-qg.js` | définitions uniques ; deux habillages (SDK, HTTP) |
| `serveur/permissions.js` | `{COMPTES}` couvre tous les fournisseurs (déjà par `dossierConfig`) ; `decisionProfil` extraite de `canUseToolPour` (sans changer son comportement) |
| `config/defauts/profils.json` | `Read({HOME}/.codex/auth.json)` dans `toujoursRefuse` ; note mise à jour |
| `config/defauts/comptes.json` | forme v2 (liste vide) |
| `serveur/bus.js` | `comptesPublics` : `fournisseur`, `acces`, `capacites` résumées ; `modelesPublics` : repli par fournisseur (plus « opus » codé en dur) ; `publicTache` : `compte`, `fournisseur` |
| `serveur/api-reglages.js` | `POST /api/comptes/ajouter {fournisseur, acces, nom, cleApi?}` ; surveillance de connexion par fournisseur ; réglage `compteAgents` |
| `serveur/ordonnanceur.js` | messages de compte génériques (fin de `connexion-compte-{n}.bat`) ; plafond `sessionsParCompte` dans la file ; `t.x.sessionCompte` ; réembauche sur le même compte seulement |
| `serveur/index.js` | route `/mcp/agents` |
| `serveur/plateforme.js` | ajouter `codexExe()` ; `compteConnecteSelonPlateforme` avec un paramètre `fournisseur` (fichier créé par le portage Mac : à coordonner) |
| `serveur/traduction-pensees.js` | la traduction (T11) passe par le rôle `utilitaire` au lieu de Haiku codé en dur (lot 2 pour le cas sans Claude) |
| `web/parametres.js` | section **« Comptes IA »** (remplace « Comptes Claude ») : comptes groupés par fournisseur, badge, forfait, e-mail, limites ; ajout en 3 choix (fournisseur → accès → nom ou clé) ; connexion Codex (navigateur ou code) ; réglage « Agents de la demande : même compte que le DG / {compte} » |
| `web/ui.js` | libellé du menu `#comptes` (« Compte IA… ») ; badge du fournisseur sur les agents |
| `web/i18n/en.js`, `serveur/i18n/en.json` | textes |
| `package.json`, `package-lock.json` | `@openai/codex` 0.164.0 épinglé (binaires optionnels par plateforme) |
| `outils/installer.ps1` | binaire Claude non bloquant ; vérification du binaire Codex |
| `docs/protocole.md` | Ajouts 1.0.6 : `Compte.fournisseur/acces`, `Tache.compte/fournisseur`, `modification.incomplet`, fenêtres de limites `nom` (les champs de traduction des pensées sont ceux de T11) |

**Tests à écrire**

| Test | Ce qu'il vérifie |
|---|---|
| `tests/comptes-migration.js` | v1 → v2 : identifiants, `configDir`, `cleApi` et `note` gardés ; sauvegarde `comptes.v1.json` créée une fois ; deuxième chargement sans écriture ; `trouverCompte('claude2')` rend le même compte ; liste vide acceptée |
| `tests/jetons-jamais-lus.js` | espionne `fs.readFileSync` / `fs.openSync` / `fs.createReadStream` pendant l'ajout, la connexion simulée, `compteConnecte`, `comptesPublics` et la surveillance : aucun accès en lecture à `.credentials.json` ou `auth.json` |
| `tests/ia-claude-options.js` | `optionsClaude(demande)` = références 1.0.5 pour production (6 profils, mode prudent, `gitAuto`, MCP, skills, Haiku sans connecteurs), vérification, DG (plan, delta, synthèse), question (fork), bonheur |
| `tests/ia-claude-flux.js` | rejeu de flux SDK enregistrés (avec un `query` injecté) : mêmes événements sur le bus qu'en 1.0.5 (`outil`, `commande`, `modification`, `pensee`, `conso`, limites) |
| `tests/ia-codex.js` (faux Codex) | **succès** : `surInit` avec le `thread_id`, bulles `Bash`/`Edit`/`mcp__qg__montrer`, `commande` début et fin, `pensee` avec texte complet et `fin: true`, `modification` avec morceaux (projet git temporaire), conso (entrée, cache, sortie), `structure` analysée ; **JSON invalide** → « pas de sortie structurée » ; **limite** → `erreur: 'rate_limit'` et `limite.resetsAt` ; **non connecté** → `authentication_failed` ; **arrêt** → processus terminé en moins de 2 s, `exception` renseignée ; **injection** → second lancement avec `exec resume <thread_id>` et le complément |
| `tests/ia-codex-arguments.js` (faux Codex, trace) | pas de `--sandbox` ; `default_permissions="qg"` ; `deny` sur chaque `configDir` de compte, sur `config` et sur `jeton.txt` ; `write` seulement sur les dossiers de l'étage, les pièces et `:tmpdir` ; `network.enabled=false` ; `approval_policy="never"` ; `cli_auth_credentials_store="file"` ; `--output-schema` identique à `SCHEMA_RESULTAT` ; `--skip-git-repo-check` hors dépôt git ; environnement sans `ANTHROPIC*`, `CLAUDE*` ni `OPENAI_*`, avec `CODEX_HOME` (+ `CODEX_API_KEY` seulement pour un compte « clé ») |
| `tests/ia-profils.js` | tableau complet profil × réglages (prudent, `gitAuto`, `ecritureHorsProjet`, `lectureStricte`) × fournisseur : chaque résultat est soit « refusé », soit une configuration dont les écritures ⊆ zones, sans réseau, avec tous les secrets en `deny` ; `ops` sur Codex = refusé ; prudent + `edition` sur Codex = refusé |
| `tests/mcp-http.js` | `initialize`, `tools/list` (mêmes noms que `OUTILS_QG`), `tools/call montrer` ; jeton faux → 401 ; jeton révoqué après la session ; `demander` attend sans délai court |
| `tests/codex-etancheite.js` (**réel**, sans tokens, ignoré sans binaire) | les quatre essais du §4.4 échouent bien sur ce PC |
| `tests/codex-reel.js` (**réel**, compte Codex requis) | petite tâche dans `bac-a-sable/` (comme `session-v15.js`) : sortie structurée, pensées, outil `mcp__qg__services` ; mesure la langue des résumés de raisonnement et deux sessions simultanées sur le même `CODEX_HOME` |

**Critères de fin du lot 1a**
1. Tous les tests existants de `tests/` passent sans modification de leurs attentes.
2. Les nouveaux tests ci-dessus passent ; `ia-claude-options` et `ia-claude-flux` montrent **zéro différence** avec la 1.0.5.
3. Un vrai `config/comptes.json` v1 (2 comptes Claude) est migré : mêmes identifiants, même compte par défaut, sauvegarde présente ; les limites et la conso des comptes restent affichées.
4. Dans Réglages › Comptes IA, on peut ajouter un compte ChatGPT, se connecter (navigateur ou code), voir son forfait et ses limites, le déconnecter et le retirer.
5. `tests/codex-etancheite.js` passe sur le PC de l'utilisateur, ou Codex y est refusé avec le motif affiché (règle du §4.4).
6. Avec le réglage « Agents : codex1 », une demande planifiée par un DG Claude est **exécutée et vérifiée par Codex** dans `bac-a-sable/` : sortie structurée, pensées, terminal et diffs visibles dans le site (test réel, avec l'accord de l'utilisateur).

### Lot 1b : client ACP générique (décision D1)

Il peut être fait après le lot 1a ou en parallèle du lot 2, car il ne dépend que de la couche d'adaptateurs.

**Fichiers créés**
- `serveur/ia/acp.js` : adaptateur ACP (§2.8) ;
- `serveur/ia/qualification.js` : essai d'étanchéité par agent et par version ;
- `serveur/mcp-pont.js` : pont stdio → HTTP pour les agents sans MCP HTTP ;
- `config/defauts/agents-acp.json` : catalogue (Copilot, Kimi, Cursor, Grok Build, Mistral Vibe, OpenCode) ;
- `tests/faux-acp.js` : **faux agent ACP** en Node, avec `@agentclientprotocol/sdk` côté agent. Il rejoue des scénarios : pensées, `tool_call`, demande de permission, `fs/write_text_file` hors zone, JSON final valide ou invalide, `session/cancel` ;
- `tests/ia-acp.js`, `tests/acp-qualification.js`.

**Fichiers modifiés**
- `serveur/permissions.js` : `decisionProfil` utilisée pour `request_permission`, `fs/*` et `terminal/*` ;
- `serveur/comptes.js` : comptes `fournisseur: "acp"` + `agent` ;
- `web/parametres.js` : carte « Autres agents (ACP) », choix dans le catalogue, état de qualification ;
- `package.json` : `@agentclientprotocol/sdk` 2.0.2 épinglé ;
- `docs/protocole.md`.

**Tests**
- `ia-acp.js` vérifie :
  - les événements traduits (pensées, bulles, terminal, diff à partir du contenu `diff`) ;
  - qu'une écriture hors zone par `fs/write_text_file` est refusée, et qu'une demande de permission en zone est accordée en `edition` ;
  - qu'en mode prudent, une demande de permission devient une main levée ;
  - la sortie structurée émulée (valide, invalide puis relance, invalide deux fois → échec) ;
  - l'arrêt par `session/cancel` ;
  - qu'un MCP en stdio passe par le pont.
- `acp-qualification.js`, avec deux faux agents (« sage », qui demande, et « imprudent », qui écrit sans demander) :
  - le sage est qualifié pour `edition` et `ops` ;
  - l'imprudent est **refusé** ;
  - la qualification est rangée par version, et un changement de version la remet à zéro.

**Critères de fin du lot 1b**
1. Les tests passent.
2. Un compte ACP non qualifié ne reçoit aucune tâche (le routeur ou le lot 1a le filtre).
3. Au moins un agent réel du catalogue (au choix de l'utilisateur, par clé API) est qualifié puis exécute une tâche `edition` dans `bac-a-sable/` avec sortie structurée (test réel, avec accord).
4. Un accès « abonnement » n'est proposé que pour les agents dont l'entrée de catalogue le permet, avec le rappel de lire les conditions.

### Lot 2 : priorités, DG multi-IA, plan, délégation, configuration sans Claude

**Fichiers créés**
- `serveur/routeur.js` : `choisirCompte`, conversion de modèle par niveau, filtre dur (§5.2) ;
- `config/defauts/priorites.json` ;
- `serveur/delegation.js` : `generer_image`, garde-fous, journal ;
- `serveur/ia/images-api.js` : moteur A ;
- `config/defauts/tarifs.json` : tarifs datés ;
- tests listés plus bas.

**Fichiers modifiés**

| Fichier | Changement |
|---|---|
| `serveur/dg.js` | `dossier.dg.compte` ; `modeleDg` par compte ; `schemaDynamique` (`modele`, `ia`, `compte`) ; `SCHEMA_TACHE.ia/compte` ; `SCHEMA_DELTA.ops[].compte` ; `validerTaches` (cohérence, profils garantis) ; `planifier` : « COMPTES IA DISPONIBLES », priorités, consigne ; DG sur n'importe quel adaptateur |
| `config/defauts/directive-dg.md` | §6.4 : niveaux, `{COMPTES_IA}`, `{PRIORITES}`, `{CONSIGNE_IA}`, règle `ia`/`compte` |
| `config/defauts/directive-tache.md` | ligne sur `generer_image`, seulement si la délégation est active (marqueur remplacé par `directive()`) |
| `serveur/config.js` | `directive()` remplace les nouveaux marqueurs |
| `serveur/ordonnanceur.js` | routeur au lancement (`lancer`) et à la vérification ; pause **par compte** + carte de bascule (§5.3) ; `quota.pause` ; `echecDg` et `gererEchec` génériques ; `creerDossier` accepte `dg.compte` et « auto » |
| `serveur/conso.js` | `surLimitesLues` lève la pause d'un compte ; conso du rôle `delegation` |
| `serveur/outils-qg.js` | `generer_image` (présent seulement si activé) |
| `serveur/questions.js` | repli sans fork (§8) |
| `serveur/bonheur.js`, `serveur/personnages.js` | rôle `utilitaire` par niveau |
| `serveur/api-reglages.js` | routes `GET/POST /api/priorites`, réglages `delegation` et `quota`, validation des modèles du mini-jeu par niveau (aujourd'hui `['haiku','sonnet','opus']`, ligne 324) |
| `serveur/bus.js` | `etat.priorites`, événement `priorites` ; `plans` avec `compte`/`fournisseur` |
| `config/defauts/reglages.json` | `delegation` (`images.actif: false`, `accord: true`, `limites.defaut: 3`, `api.actif: false`), `quota` (`pause: "compte"`, `proposerBascule: true`), `codex.lectureStricte: false` |
| `web/parametres.js` | sections **Priorités** et **Délégation** ; DG : compte + modèle + effort |
| `web/accueil.js` | étapes du §8 (« Comptes IA », « Priorités ») ; textes neutres |
| `web/ui.js` | menu « IA de cette demande : Automatique / {compte} » ; badges |
| `web/plan.js` (tableau blanc) | badge du fournisseur par tâche |
| `web/i18n/en.js`, `serveur/i18n/en.json` | textes |
| `docs/protocole.md` | priorités, `dossier.dg.compte`, `Tache.ia`, délégation (`delegation` dans le fil, décisions), pause par compte (`ordonnanceur.pauses: {compte: {raison, jusqua}}`) |

**Tests à écrire**

| Test | Ce qu'il vérifie |
|---|---|
| `tests/routeur.js` | tableau de cas : compte imposé éligible / déconnecté (attente + carte, jamais de remplacement) ; IA imposée ; type de tâche → liste ; profil non garanti écarté (prudent, `ops`) ; plafond de sessions ; réembauche sur le même compte seulement ; conversion opus → gpt-6.1-sol ; aucun éligible → motif clair ; garde-fou Fable inchangé (`tests/garde-fable.js` passe toujours) |
| `tests/dg-schema-dynamique.js` | énumérations `modele`/`ia`/`compte` = comptes connectés ; `validerTaches` refuse un modèle d'un autre fournisseur que celui demandé, `ops` impossible, compte inconnu |
| `tests/dg-codex.js` (faux Codex) | le faux Codex rend un plan JSON puis un delta, puis une synthèse ; l'ordonnanceur crée les tâches, les relance et termine le dossier ; `dgSession` reprise par `exec resume` ; le schéma de delta est accepté par `--output-schema` |
| `tests/quota-compte.js` | limite sur `codex1` : seules ses tâches attendent, celles de `claude1` continuent ; carte « Attendre / Passer sur… » avec avertissement ; sans réponse = attendre ; `proposerBascule: false` = aucune carte ; `pause: "globale"` = comportement 1.0.5 ; levée par une lecture de limites |
| `tests/delegation-images.js` | outil absent si désactivé ; accord demandé si `accord: true` ; limite par étage (1, 3, illimité) ; moteur B avec le faux Codex qui « génère » un fichier dans `CODEX_HOME/generated_images/` → copié vers `chemin` ; moteur A contre un **faux serveur HTTP** (`QG_OPENAI_BASE_URL`) qui rend une image base64 et un usage → coût calculé ; plafond mensuel dépassé → accord demandé ; journal `delegations.jsonl` complet ; `chemin` hors zone refusé ; la clé n'apparaît dans aucun événement |
| `tests/sans-claude-e2e.js` | serveur lancé avec une configuration temporaire contenant **un seul compte Codex** (faux Codex), aucun binaire Claude (`QG_CLAUDE_BIN` pointe vers un chemin absent) : configuration guidée par l'API (`/api/comptes/ajouter`, `/api/onboarding/terminer`), `POST /api/dossiers`, plan du DG, tâches, vérification, synthèse → dossier `termine` ; question à un agent (repli) ; récolte de Joy en `utilitaire` ; **aucun lancement du binaire Claude** (trace des lancements) |
| `tests/questions-sans-fork.js` | une question à un agent Codex rend une réponse marquée « d'après son activité visible » |
| `tests/dg-codex-reel.js` (**réel**) | un vrai DG sur Codex planifie une petite demande dans `bac-a-sable/` |

**Critères de fin du lot 2**
1. Tous les tests (lots 1a, 1b, 2 et existants) passent.
2. Un utilisateur qui n'a **que** Codex fait la configuration guidée, envoie une demande, voit le DG planifier, les agents travailler et la synthèse arriver. Preuve : `sans-claude-e2e` + un essai réel avec accord.
3. Avec Claude et Codex connectés et le préréglage « Claude pour le code, Codex pour la rédaction », un plan mixte affiche les bons badges, et chaque tâche tourne sur le compte attendu.
4. La consigne « crée en priorité des tâches sur Codex » (Réglages ou texte de la demande) donne `ia: "codex"` dans le plan, sur un test réel.
5. La délégation d'images est désactivée par défaut. Une fois activée, elle produit une image dans le projet avec journal et accord, selon les réglages D2 et D3.
6. Une limite atteinte met en pause le compte concerné, propose la bascule avec avertissement, et ne bascule jamais seule (D4).

### Après le lot 2 (ordre proposé)

1. Comptes « compatibles Anthropic » (DeepSeek, Kimi, Z.ai, OpenRouter, Ollama, LM Studio) : adaptateur Claude avec `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY=""` et les variables de modèle (bench autres §4.2), avec le libellé « non pris en charge par Anthropic, qualité variable ».
2. Outils spécialisés : recherche Perplexity, xAI Imagine, images Gemini (mêmes garde-fous que §7).
3. `deleguer` générique (§7.4).
4. Codex par `codex app-server` : accord en direct (profil `ops` et mode prudent pour Codex), diffs exacts (`turn/diff/updated`), deltas de raisonnement en flux, fork si disponible.
5. Qwen Code et Gemini CLI (clé) au catalogue ACP.
6. Réseau des commandes Codex avec liste de domaines (registre npm, PyPI) par `network_proxy`, pour installer des dépendances.

---

## 10. Risques, conditions d'utilisation et points ouverts

### 10.1 Conditions d'utilisation (à lire par toi avant de livrer)

| Fournisseur | Ce qui est connu | Règle dans le QG |
|---|---|---|
| OpenAI (abonnement ChatGPT) | La doc Codex présente la connexion ChatGPT en automatisation comme « avancée », sur des machines de confiance, et recommande la clé API. Les Terms of Use **n'ont pas été lus** (403 Cloudflare, bench OpenAI §6). Un message public d'un employé (30/3/2026) n'a pas de valeur contractuelle. | Afficher à l'ajout du compte : « un compte = une personne, sur son propre PC ; pas de partage ». Pas de bascule automatique entre comptes (D4). Client officiel uniquement. **Bloquant avant publication** : lire les ToU. |
| Anthropic | Comptes existants inchangés. Le routage vers des modèles non-Claude n'est pas pris en charge. | Comptes « compatibles Anthropic » seulement après le lot 2, avec avertissement. |
| Google (Antigravity) | Risque de suspension si un outil tiers pilote `agy` sous compte grand public (forum, 8/10/2026, rôle de l'auteur non confirmé). | Exclu (§1). |
| xAI, Cursor, Copilot, Mistral (abonnements) | Conditions d'automatisation non lues (bench autres §5). | Clé API d'abord ; l'abonnement n'est ouvert agent par agent qu'après lecture. |
| Kimi | Falsifier l'User-Agent peut suspendre les avantages de l'abonnement. | Toujours le client officiel, sans modification. |

### 10.2 Risques techniques

| Risque | Effet | Parade |
|---|---|---|
| `exec --experimental-json`, `codex app-server` et les profils de permissions sont expérimentaux ou en bêta ; nouvelle version chaque semaine | panne à une mise à jour | version épinglée ; test d'étanchéité et `codex-reel` à chaque changement de version ; `mettre-a-jour` ne change la version de Codex qu'avec le QG |
| Sandbox Windows native (MXC : droits nécessaires ?) ; la doc d'installation parle encore de WSL2 | Codex inutilisable ou moins isolé | test d'étanchéité qui refuse sinon (§4.4) |
| Plusieurs sessions sur un même `auth.json` | jeton cassé au rafraîchissement | 1 session par compte « abonnement » par défaut |
| Langue des résumés de raisonnement Codex | pensées en anglais (déjà le cas pour Claude, d'après la mesure de T11) | traduction à l'affichage de T11 (`traduireReflexion`), commune à tous les fournisseurs ; aucune consigne renforcée (risque de refus « reasoning_extraction » constaté chez Anthropic) |
| Diff Codex reconstruit | diff incomplet hors git | `incomplet: true` affiché ; diff exact plus tard avec `app-server` |
| Pas de fork Codex | pas de clone d'agent ; questions en repli | repli §8 |
| Directives écrites pour Claude | qualité variable sur d'autres modèles | test réel par lot ; directives neutres (§6.4) |
| Images : quota consommé 3 à 5 fois plus vite ; bug 429 ouvert (#49214) ; aucun événement « image » dans le SDK | échecs, quota vidé | désactivé par défaut, accord, limite, message clair à l'agent |
| Prix par image de l'API non publié | coût réel inconnu à l'avance | estimation au pire avant l'appel, coût réel après, plafond mensuel (D3) |
| Clés API en clair dans `config/comptes.json` | lisibles par tout programme du PC | inchangé par rapport à 1.0.5 ; interdites aux agents (§3.4) ; chiffrement par le système (DPAPI, trousseau) à prévoir ensuite |
| Agents ACP sans sandbox système | lecture de secrets par un outil interne non filtré | qualification par injection (§2.8) ; refus si elle échoue |
| Le portage macOS crée `plateforme.js` en même temps | conflits | `codexExe()` et la généralisation de `compteConnecteSelonPlateforme()` s'ajoutent au fichier existant, après la fin du travail Mac |
| T11 modifie `pensees.js` | conflit sur le flux normalisé | faire la partie « flux normalisé » après T11 |

### 10.3 Points ouverts (à trancher par test ou par toi)

1. **Clés de config Codex non lues dans les benchs** : `developer_instructions`, `shell_environment_policy`, `model_reasoning_summary`, `forced_login_method` en `-c`. À confirmer sur la 0.164 au début du lot 1a. Sans `shell_environment_policy`, les comptes Codex « clé » sont refusés pour les profils qui lancent des commandes (§4.3).
2. **Forme des chemins Windows** dans la table `permissions.qg.filesystem` (barres obliques ou antislashs, lettres de lecteur) et prise en compte des `deny` par MXC.
3. **Événements Codex pour `image_gen`** et noms des fichiers dans `generated_images/` (bench OpenAI, inconnue 5).
4. **Valeurs par défaut** à confirmer avec toi : limite d'images par demande (3 proposé) ; `sessionsParCompte` Codex (1 proposé) ; `codex.lectureStricte` (désactivé proposé, §4.2).
5. **Interprétations des décisions D2 et D4** (encadré en tête) : limite comptée par demande et par étage ; pause par compte plutôt que globale.
6. **Écart des profils de lecture sur Codex** (§4.2) : je le juge non élargissant au regard des effets. Si tu veux la lecture stricte par défaut, il suffit d'activer `codex.lectureStricte`.
7. **Catalogue ACP** : commandes, variables, modes et types d'accès exacts par agent, à relever en lot 1b (schémas d'événements non lus : bench autres §5).
8. **Coût en euros** et limites exactes des forfaits : non vérifiés (bench OpenAI, inconnues 10 et 11). Le QG affiche des pourcentages et des dollars, pas d'euros.

---

## Sources

- Benchs du dépôt : `docs/multi-ia/bench-openai.md` (T5, 26/10/2026), `docs/multi-ia/bench-autres.md` (T6, 26/10/2026), ainsi que les sources qu'ils citent.
- OpenAI, *Permissions* (profils de permissions Codex, « Beta ») : <https://learn.chatgpt.com/docs/permissions>, lue le 26/10/2026. Faits utilisés : `default_permissions`, `[permissions.<nom>.filesystem]` avec `read` / `write` / `deny`, `deny` prioritaire, incompatibilité avec `sandbox_mode` / `--sandbox`, Seatbelt (macOS), MXC / `elevated` / `unelevated` (Windows), réseau par profil.
- Code et documents de `_QG-dev` lus le 26/10/2026 (liste en tête).
