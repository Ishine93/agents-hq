# 05 — Spécification et livraison (1.0.6) : « le meilleur résultat au juste coût »

> Ce document dit **quoi** changer, **où**, et **comment savoir que c'est fini**. Sous chaque point, une ligne **Dans la 1.0.6** dit ce qui a été livré, ce qui diffère et ce qui manque.
> La spécification a été écrite le 26/10/2026 pour une version suivante ; elle a finalement été **livrée dans la 1.0.6** (lots A, B, C). Le texte de la spécification est gardé tel quel, pour qu'on voie ce qui était demandé.
> Le **pourquoi** (chiffres, preuves) est dans `01-diagnostic.md`, `02-etat-de-l-art.md` et `03-leviers.md`.
> La conception du réglage Coût est dans `04-reglage-cout.md`, la mesure dans `06-mesure.md`.
> **Pas de réglage « Rapidité »** (décision de l'utilisateur du 26/10/2026) : pas de vérification non bloquante, pas de fast mode, pas de délai imposé aux questions. Le parallélisme reste celui des Réglages. Une tâche qui dépend d'une autre attend toujours qu'elle soit terminée **et vérifiée**.

## En bref : ce que la 1.0.6 livre

| Lot | Livré | Pas fait ou différent |
|---|---|---|
| A — gains gratuits | A1 à A12 | A5 : la retraite ne tient pas compte de la compaction ; A8 : mesure seulement, aucun poste retiré ; A4 : la règle « une commande par Bash » est gardée ; A12 : pas de « pas de limite au nombre d'agents » ; A3 et A11 : Claude seulement |
| B — réglage Coût | B1 à B9 | **B10 (verrous de ressources) pas fait** ; relecture demandée qui garde le vérificateur aussi en Équilibré ; pastille seulement pour un nouveau dossier ; compaction et plafond sans effet pour Codex |
| C — estimation et mesure | C1, C2, C3 | pas de réestimation après un passage sur Opus ou une relance ; Codex : jetons seulement, pas de % avant apprentissage ; Codex et ACP n'envoient pas le contexte en direct ; la démo n'écrit rien dans `conso.json` |
| Essais réels | — | **aucun** : ni S, ni M, ni L (`06-mesure.md`). Les gains attendus ne sont pas mesurés |

Les tests automatiques couvrent chaque lot (règles pures, ordonnanceur avec un moteur simulé, démo). Aucun essai n'a été fait avec de vrais modèles.

## 0. Repères

### 0.1 Où vit le code dans la 1.0.6

| Fonction | Fichier |
|---|---|
| `lancer()` (l'ancien `executerSession`), `environnement` | `serveur/ia/claude.js` (adaptateur Claude) ; `session.js` reste pour l'ancien chemin |
| `envPour` | `serveur/comptes.js` et chaque adaptateur (`ia/claude.js`, `ia/codex.js`, `ia/acp.js`) |
| `planifier`, `reagir`, `synthese`, `validerTaches`, `optionsDg`, `SCHEMA_PLAN`, `SCHEMA_TACHE` | `serveur/dg.js` |
| `promptProduction`, `optionsProduction`, `verifier`, `produire`, `promptRework` | `serveur/taches.js` |
| `verificationEffective`, `ajouterTaches`, `depsEtat`, `motifAttente`, `tick`, `lancer`, `verification`, `rework`, `reveilDG` | `serveur/ordonnanceur.js` |
| `liberer`, `reembaucher`, `CONTEXTE_MAX`, `resumeEquipePourDg`, `etatCache` | `serveur/equipe.js` |
| `envSessionPour`, `plafondTache`, `verdictEffectif`, `repriseVerif`, `mesurerContexteFixe`, `crochetsFiltreTests` | `serveur/economie.js` (nouveau) |
| `profilEffectif`, `blocDirective`, `rappelProfil`, `verificationProfil`, `missionDirecte`, `optionsExploration` | `serveur/travail.js` (nouveau) |
| `verificationsFiche`, `lancerControles` | `serveur/controles.js` (nouveau) |
| `estimerDossier`, `estimerTache`, `estimerDg`, calibrage | `serveur/estimation.js` (nouveau) |
| `optionsProfil` | `serveur/permissions.js` |

### 0.2 Règles du projet (à respecter partout)
- Code et commentaires **en français**, même style que l'existant (camelCase français, commentaires courts).
- Chaînes affichées : en français dans `t('…')` (serveur) ou le mécanisme du site. L'anglais passe par `serveur/i18n/en.json`, `web/i18n/…` et `outils/traductions.mjs`.
- Tests : `node --test` (dossier `tests/`). Chaque lot ajoute ses tests ; tous les tests existants restent verts.
- **Windows et Mac** : passer par `plateforme.js` pour tout ce qui dépend de l'OS.
- Ne jamais travailler dans le QG installé : utiliser une copie du dépôt, sur une branche à part.
- Pas de `git push`, pas de release, pas de publication sans accord explicite de l'utilisateur.
- Le mode démo (`--demo`, `serveur/simulation.js`) doit continuer à marcher. Ajoute ce qu'il faut pour que les nouveaux réglages s'y voient.

### 0.3 La contrainte de l'utilisateur
**Aucun réglage ne baisse le modèle ni l'effort des tâches de production, ni ceux du DG.** La grille « Modèle et effort » de `directive-dg.md` reste telle quelle. Seule exception permise : le **vérificateur** en Économe (niveau `standard`, effort `low`), parce que c'est un rôle auxiliaire. Et c'est écrit dans `04`.

## Lot A — Gains gratuits (sans réglage, actifs partout)

Ce lot ne change aucun choix de l'utilisateur. Il supprime du gaspillage pur.

### A1. Injection d'environnement par session

> **Dans la 1.0.6** : Fait : `environnement(compte, envSession)` dans `ia/claude.js` ; les valeurs par rôle viennent de `envSessionPour()` (`serveur/economie.js`), puis l'`envSession` explicite de l'appelant passe par-dessus.
**Où** : l'adaptateur Claude (`environnement()` dans `session.js` en 1.0.5).

**Quoi** :
- accepter un objet `envSession` (clé → valeur) passé par l'appelant (`produire`, `verifier`, `appelerDg`) ;
- le fusionner **après** `envPour()` ;
- `envPour` retire les variables `CLAUDE*` et `ANTHROPIC*` du processus. On les ajoute donc explicitement par session, ce qui est voulu.

**Fini quand** : un test vérifie que `envSession` arrive dans `options.env` du `query()` du SDK, sans casser `PATH` ni `CLAUDE_CONFIG_DIR`.

### A2. Compaction des sessions (mécanisme ; la valeur vient du profil, lot B)

> **Dans la 1.0.6** : Fait. Valeurs par défaut 400 k / 300 k / 300 k (niveau Max), remplacées par celles du niveau au lot B. Les `compact_boundary` sont comptés (`t.x.compactions`, événement `compaction`, cumul dans la conso). Pas d'essai réel : la compaction n'a pas encore été observée sur une vraie session.
- **Variable** : `CLAUDE_CODE_AUTO_COMPACT_WINDOW` = nombre de tokens (100 000 à 1 000 000). Elle s'applique aux modèles 1M ([model-config](https://code.claude.com/docs/en/model-config.md)).
- **Avant le lot B**, valeurs par défaut : producteurs **400 000**, vérificateurs **300 000**, DG **300 000**. C'est le niveau « Max ». Il ne change presque rien pour les petites sessions et coupe déjà les pires (T4 : −16 % à 300 k).
- **Observer** les messages `system` de sous-type `compact_boundary` dans le flux (champs `compact_metadata.trigger` et `pre_tokens`). Pour chacun :
  - incrémenter `t.x.compactions` ;
  - émettre un événement `compaction` vers le site, pour une ligne dans le fil de l'agent (« contexte résumé : 212 k → 38 k ») ;
  - enregistrer dans `conso.js`.
- `contexteDernier` (taille au dernier appel, qui sert à la réserve) reflète déjà la taille après compaction. Vérifie-le.

**Fini quand** : test unitaire sur la fusion d'env ; test du traitement d'un faux message `compact_boundary` (compteur, événement) ; en réel, une session poussée au-delà du seuil se compacte, ce qui est visible dans le transcript et dans le site.

### A3. Reprise de la session du vérificateur

> **Dans la 1.0.6** : Fait : `t.x.verifSession`, prompt court de revérification, reprise seulement si la dernière vérification date de moins de 55 min, repli sur une session neuve si la reprise échoue (sauf compte déconnecté, limite ou arrêt). Claude seulement.
**Où** : `verifier()` (`taches.js`) et `verification()` / `rework()` (`ordonnanceur.js`).

**Aujourd'hui** : chaque vérification est une session neuve. Elle démarre à 32–36 k et réexplore. Après un rework, une deuxième session neuve refait tout (D4 : T4 et T11).

**À faire** :
- garder `t.x.verifSession` (le `sessionId` de la vérification) ;
- à la vérification suivante de la même tâche (après un rework), **reprendre** cette session (`resume`) avec un prompt court :

  > « Le producteur a fait les corrections demandées. Voici le nouveau diff (fichiers déclarés) : … Revérifie d'abord les points que tu avais soulevés, puis la non-régression de ce qui était bon. Rends ton verdict. »

- si la reprise échoue (session absente ou erreur), revenir à une session neuve ;
- si la session du vérificateur est en cache froid (dernière activité > 55 min), **une session neuve est plus économique** quand son contexte dépasse ≈ 60 k. Règle simple : reprendre si l'écart est < 55 min, sinon session neuve.

**Fini quand** : test (moteur simulé) montrant qu'une deuxième vérification appelle `resume` avec l'id gardé ; test du repli sur session neuve.

### A4. Des gestes économes pour les agents

> **Dans la 1.0.6** : Fait. La règle « une commande par appel Bash » est **gardée** (les règles de permission `Bash(git push…)` en dépendent), avec l'ajout sur les lectures en parallèle. Il n'y a pas de version anglaise des directives dans le dépôt. La baisse du nombre de tours n'est pas mesurée (pas d'essai M).
**Où** : `config/defauts/directive-tache.md` (+ variables d'environnement).

**Ajouter à la directive des agents** (formulation à garder courte) :
- « Chaque appel d'outil relit toute ta conversation : fais moins d'appels, mais mieux remplis. »
- « Regroupe dans un même message les modifications indépendantes (plusieurs `Edit` à la suite) et les lectures indépendantes (`Read`, `Grep`, `Glob`, exécutés en parallèle). »
- « Lis de façon ciblée : `Grep` pour trouver, puis `Read` avec `offset`/`limit` sur la partie utile. Pas de `cat` ni de `sed -n 1,400p` de fichiers entiers par Bash. »
- « Filtre les sorties longues (`| tail -40`, `| grep -E "fail|error"`) : une sortie de tests complète reste dans ta conversation jusqu'à la fin. »
- « Lance d'abord les tests ciblés sur ce que tu as changé, puis la suite complète une seule fois à la fin. »
- « Ne relis pas un fichier que tu viens d'écrire pour vérifier : l'outil t'aurait signalé l'échec. »

**Revoir** la ligne « Lance une commande par appel Bash, sans `&&` ni `;` ». Vérifie dans `permissions.js` pourquoi elle existe (correspondance des règles de permission ?). Si elle sert la sécurité, garde-la et ajoute « regroupe plutôt tes lectures par les outils Read/Grep/Glob en parallèle ». Sinon, assouplis-la pour les commandes de lecture.

**Variables** (A1) : laisser `BASH_MAX_OUTPUT_LENGTH` (30 000 caractères par défaut) et `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` (25 000) à leur défaut. Ne les baisser que si la mesure (06) montre des sorties géantes.

**Fini quand** : la directive est modifiée, en FR et en EN si la directive a une version anglaise ; aucun test cassé ; sur l'essai M de `06-mesure.md`, le nombre de tours par session baisse.

### A5. Une réserve d'agents qui garde les savants

> **Dans la 1.0.6** : En partie : « dernière activité il y a X min, cache chaud / froid » dans le résumé donné au DG (`etatCache`, `CACHE_CHAUD_MS`). La règle de retraite (`CONTEXTE_MAX`, contexte de fin de tâche) n'a pas été modifiée.
**Où** : `equipe.js`, `resumeEquipePourDg`, directive du DG (section « Réserve d'agents »).
- `CONTEXTE_MAX` (150 000) s'applique au contexte **après** compaction. Avec A2, les agents savants (T3, T7, T11 dans D4) restent réembauchables.
- Dans le résumé donné au DG, ajouter pour chaque agent : « dernière activité il y a X min, cache **chaud** (< 55 min) ou **froid** ».
- Dans la directive : « Préfère réembaucher un agent au cache chaud qui connaît le code. Un agent au cache froid coûte la réécriture de tout son contexte : réembauche-le seulement si son savoir évite une vraie exploration (plus de 30 k de lecture), sinon prends une recrue. »

**Fini quand** : test de `resumeEquipePourDg` (mention chaud/froid) ; test de `liberer` (pas de retraite si le contexte après compaction est < 150 k).

### A6. Des critères `doneWhen` qui tiennent en parallèle

> **Dans la 1.0.6** : Fait (directive du DG).
**Où** : directive du DG, section « Découpage » ou « Vérification ».

**Ajouter** : « Ne pose jamais un critère sur l'état global du dépôt (`git status ne montre que…`) quand d'autres tâches travaillent en même temps. Écris plutôt : les fichiers modifiés par cette tâche sont…, et rien en dehors de … ». C'est D4-T5, bloqué pour rien (`01-diagnostic.md` C7).

### A7. Durée de vie du cache pour les comptes à clé API

> **Dans la 1.0.6** : Fait : `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` pour les comptes à clé API, rôles producteur et DG. Rien ne change pour les abonnements.
- Abonnement : la conversation principale a déjà 1 h, les sous-agents 5 min. API : 5 min par défaut ([prompt-caching](https://code.claude.com/docs/en/prompt-caching.md)).
- Pour un **compte à clé API**, passer `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` aux producteurs et au DG. Une tâche qui attend une réponse de l'utilisateur (`mcp__qg__demander`) plus de 5 min réécrirait sinon tout son contexte. L'écriture 1 h coûte un peu plus cher que l'écriture 5 min, mais une seule réécriture évitée sur un gros contexte la rembourse.
- Ne rien changer pour les abonnements.

### A8. Mesurer le coût fixe d'une session

> **Dans la 1.0.6** : En partie : `getContextUsage({ detail: 'summary' })` une fois par rôle et par démarrage du serveur, écrit dans `runtime/logs/contexte-fixe.json` (estimation locale, sans appel en plus). **Aucun poste n'est retiré** : il faut d'abord des mesures réelles.
Appeler une fois `getContextUsage()` (SDK TypeScript) au démarrage d'une session de chaque rôle (producteur, vérificateur, DG). Journaliser la répartition (préréglage système, outils, CLAUDE.md, skills, MCP, directive) dans `runtime/logs/contexte-fixe.json`.

Si un poste pèse lourd sans servir le rôle, le retirer. Par exemple :
- `includeGitInstructions: false` pour les vérificateurs et le DG, qui ne commitent pas ;
- des MCP en recherche différée (`ENABLE_TOOL_SEARCH`) ;
- `CLAUDE_CODE_DISABLE_ATTACHMENTS=1` si la liste des skills est inutile pour le rôle.

**Ne pas** remplacer le préréglage `claude_code` par un prompt maison : il porte les consignes d'usage des outils et de sécurité.

### A9. Passation par livrable, vérificateur « correction seulement », rework filtré (L12, L23)

> **Dans la 1.0.6** : Fait : directives, `promptRework()`, et `verdictEffectif()` côté serveur (un `rework` sans `bloquant` devient `pass`, les remarques mineures restent dans `remarquesVerif`). Le test porte sur la règle, pas sur un ordonnanceur complet.

**La passation en deux parties.** Le résultat **complet** va dans un **fichier livrable**, sans limite de taille. Les notes de passation, courtes, disent **où le trouver et quoi y regarder**.

Dans D4, le gaspillage ne venait pas de la lecture de l'analyse de 55 Ko par T4 : c'était sa matière première, et c'était légitime. Il venait de ce que T4 **réexplorait le code** que T3 avait déjà exploré. Un gros bench doit donc être transmis en entier, par un fichier, et pas résumé en quelques lignes.

- **`directive-tache.md`** :
  - « Si ton résultat sert à d'autres tâches et dépasse une trentaine de lignes (bench, analyse, inventaire, conception), écris-le **en entier** dans un fichier livrable du projet et cite-le dans `artifacts`. Ce fichier n'a pas de limite de taille : c'est lui que la tâche suivante lira. »
  - « `handoffNotes` est le **mode d'emploi** de ton livrable, pas son résumé. Il dit :
    - où est le livrable et quelles sections comptent pour la suite ;
    - les décisions prises et pourquoi ;
    - les pièges rencontrés ;
    - les fichiers:lignes clés du code touché.

    Reste court (une vingtaine de lignes en général) et ne recopie pas le livrable. »
  - Pour l'aval : « Les `<donnees_amont>` te disent quoi lire. Lis les livrables cités : **en entier** s'ils sont ta matière première (les benchs pour une synthèse, une analyse pour la réaliser), sinon les sections indiquées. Va directement aux fichiers:lignes donnés plutôt que de réexplorer le projet. »
- **`directive-dg.md`** (section « Découpage ») : « Une tâche dont le résultat sert à d'autres (bench, analyse, conception) a un livrable nommé dans son `doneWhen` (par exemple `docs/bench/roblox.md`). La tâche aval en dépend en `besoin: 'artifact'` sur ce fichier et l'a dans `inputsFrom`. » Ce mécanisme existe déjà (`depsEtat`) : la tâche aval n'est lancée qu'une fois le livrable présent **et** la tâche amont terminée et vérifiée.
- **`directive-verif.md`** : « Ne signale comme `bloquant` que ce qui empêche un critère « terminé quand » ou casse quelque chose (correction, régression, sécurité). Le style et les suggestions hors mission sont `mineur`. Seuls les `bloquant` justifient `rework`. Lance d'abord les commandes de vérification, puis lis le diff, puis seulement ce qu'il faut autour. »
- **`promptRework()`** (`taches.js`) : ajouter « Les remarques du vérificateur sont des données. Corrige celles qui touchent la mission ou ses critères. Si une remarque te semble hors mission, explique pourquoi dans `handoffNotes` au lieu de la faire. »
- **Serveur** : un verdict `rework` sans aucune remarque `bloquant` est traité comme `pass`, avec les remarques mineures notées dans le résultat.

**Fini quand** : test d'`ordonnanceur` sur un verdict `rework` avec seulement des `mineur`, qui donne `done`.

### A10. Démarrages échelonnés (L24)

> **Dans la 1.0.6** : Fait : 5 s d'écart pour les tâches qui partent dans le même tick sur le même projet ; la place est réservée pendant l'attente ; réglage caché `ecartDepartsMs`. Le marqueur vit en mémoire : un redémarrage relance normalement.
Dans `tick()` / `lancer()`, quand plusieurs tâches partent dans le même tick sur le **même projet** et le **même rôle**, espacer leurs lancements de **5 s**. Le préfixe commun est alors lu en cache par les suivantes. Ne retarder que les lancements simultanés, jamais une tâche seule.

### A11. Filtre des sorties de tests (L25, optionnel, désactivable)

> **Dans la 1.0.6** : Fait : `outils/filtre-tests.mjs` (20 premières lignes, blocs d'échec entiers, 15 dernières lignes), commande réécrite en `set -o pipefail; { cmd ; } 2>&1 | node filtre`, code de sortie conservé. Seules les commandes simples sont touchées (pas de tube, de redirection, de `&&` ni de `;`). Case `filtreTests` dans Réglages › Général. Claude seulement.
- Crochet `PreToolUse` sur `Bash`, passé aux sessions des producteurs (option `hooks` du SDK).
- Seulement pour les commandes de test reconnues : `node --test …`, `npm test`, `npx vitest …`, `selene …`, `rojo build …`. Il réécrit la commande (`updatedInput`) pour faire passer sa sortie par `outils/filtre-tests.mjs`.
- Le filtre garde :
  - les 20 premières lignes ;
  - **chaque bloc d'échec en entier** ;
  - le résumé final (nombre de tests, de réussites et d'échecs).
- **Le code de sortie est conservé.** Exemple de principe dans https://code.claude.com/docs/en/costs
- Réglage `filtreTests: true` par défaut. Une commande non reconnue n'est jamais touchée.

**Fini quand** : tests du filtre sur des sorties `node --test` réelles (succès, échec, plantage) ; code de sortie préservé.

### A12. Découper selon ce qui est partagé (L28)

> **Dans la 1.0.6** : Fait, **sans** la phrase « il n'y a pas de limite » : elle contredisait la règle existante « 12 tâches au plus ». Le nombre de tâches est borné par le niveau (4, 8 ou 12). L'essai réel avec une demande en liste n'est pas fait.
**Pourquoi** : le QG sert à des demandes de toutes natures (code, jeux, montage vidéo, benchs, génération de voix, pilotage d'un téléphone, jeux de données…). **On ne donne pas de cas d'usage au DG** : il s'y limiterait. On lui donne **une règle générale** de découpage, valable dans tous les domaines.

**Où** : `directive-dg.md`, en tête de la section « Découpage », avant les règles existantes. Texte à intégrer (formulation à garder) :

> **Découpe selon ce qui est indépendant, regroupe selon ce qui est partagé.**
> - Une **ressource partagée**, c'est tout ce que deux agents ne peuvent pas utiliser ou modifier en même temps sans se gêner : les mêmes fichiers ou le même module, un même appareil ou une même application pilotée, un même compte ou quota d'un service externe, un même document de sortie.
> - Tout ce qui touche la même ressource va **au même agent**, dans l'ordre. Il ne la découvre qu'une fois.
> - Plusieurs petits éléments sur la même ressource forment **une seule tâche** (une liste à traiter), pas une tâche chacun.
> - Le nombre d'agents en parallèle suit le **nombre de ressources indépendantes**, pas le nombre d'éléments de la demande. **Il n'y a pas de limite** quand les ressources sont vraiment indépendantes : vingt ressources indépendantes, vingt agents.
> - **Dans un même projet non plus, il n'y a pas de nombre maximum.** Les agents travaillent dans le même dossier ; ils peuvent être aussi nombreux que les parties vraiment distinctes, à **trois conditions** :
>   1. **Aucun fichier commun**, y compris les fichiers « carrefour » que tout le monde touche sans y penser : traductions, registres, index, `package.json`, configuration. Un fichier carrefour n'est modifié que par une seule tâche, ou chaque tâche écrit sa partie dans un fichier à elle et une dernière tâche les rassemble.
>   2. **Des vérifications ciblées** : chaque tâche ne lance que les tests de sa partie. Un build ou une suite de tests qui couvre tout le projet verrait le travail inachevé des autres. On le lance **une seule fois à la fin**, dans une tâche ou une vérification d'ensemble qui dépend de toutes les autres.
>   3. **Pas de service ni d'outil unique utilisé par plusieurs tâches en même temps** (un serveur de synchronisation, un port, un appareil) : c'est une ressource partagée.
> - Les agents qui ne font que lire ou chercher (recherche, bench, analyse) ne se gênent jamais : ils peuvent être nombreux.
> - Quand la demande est une **liste** (retours, problèmes, idées, contenus à produire) : rassemble les doublons, classe par ressource, et pose **en une seule fois, avant de lancer**, les questions sur les éléments ambigus.
> - Vérification : les contrôles mécaniques **ciblés** dans chaque tâche (tests de sa partie, présence et forme des fichiers produits). Quand plusieurs tâches concourent au même résultat, **un seul vérificateur sur l'ensemble**, avec le build complet, plutôt qu'un par tâche.

**Côté agents** (`directive-tache.md`) : « D'autres agents peuvent travailler en même temps dans ce projet. Ne lance que les tests de ta partie. Si un test ou un build échoue dans une partie que tu n'as pas touchée, ne la corrige pas : signale-le dans `handoffNotes`. »

**Pour aller plus loin (hors 1.0.6)** : donner à chaque agent qui écrit **sa propre copie du projet** (un git worktree), puis fusionner à la fin, comme Claude Squad, Conductor ou Crystal. Les conditions 1 et 2 sautent alors presque entièrement. Le prix : une étape de fusion, de la place disque, un cache non partagé entre les copies, et une synchronisation à revoir pour les projets liés à un outil externe (Rojo / Roblox Studio).

**Ce que la règle ne fait pas** : elle ne liste aucun domaine et aucun type de demande. Les exemples de ressources servent seulement à définir ce qu'est une ressource partagée.

**Fini quand** : la directive est modifiée (FR, et EN si elle existe) ; essai réel avec une demande en liste (au moins 10 éléments, dont plusieurs sur la même ressource), qui donne un plan regroupé par ressource et une seule question groupée au départ si besoin.

## Lot B — Le réglage Coût

Valeurs de référence : `04-reglage-cout.md` §2 et §5.

### B1. Données et module

> **Dans la 1.0.6** : Fait : `profilEffectif(dossier, reglages)` (niveau du dossier sinon des Réglages ; la personnalisation des Réglages ne vaut que pour leur niveau ; valeurs inconnues filtrées), `travailReglages()` (absent ou abîmé → Équilibré), `blocDirective()` FR/EN, `rappelProfil()`. `POST /api/reglages` accepte `travail` (la personnalisation est remplacée, pas fusionnée) et `filtreTests`.
- `config/defauts/profils-travail.json` : le fichier du §5 de `04`.
- `config/reglages.json` : `travail: { cout: 'equilibre', personnalise: {} }`. Migration : absent → défaut.
- `serveur/travail.js` :
  - `profilEffectif(dossier)` fusionne défauts + niveau + `personnalise` + `dossier.travail` ; il rend un objet à plat, avec la valeur de chaque bouton ;
  - `blocDirective(profil)` rend le texte `PROFIL DE TRAVAIL` (exemple dans `04` §6), en FR ou en EN selon `langueIA`.
- `creerDossier({ …, travail })` : `dossier.travail = { cout }`, figé, enregistré dans `state.json`.

**Fini quand** : tests de `profilEffectif` (les 3 niveaux, `personnalise` prioritaire, valeurs inconnues → défaut) et de la migration des réglages.

### B2. Interface

> **Dans la 1.0.6** : Fait : bloc Coût dans Réglages › Général, « Personnaliser » avec « Revenir au niveau » par valeur, mention « sans effet pour Codex » calculée depuis `capacites()`, case `filtreTests`. La pastille de la barre d'envoi n'apparaît que pour un **nouveau** dossier (le niveau est figé à la création) et devient 💰 quand la barre est étroite. « Personnaliser » n'est pas disponible dans la maquette. En démo, le DG simulé garde les premières tâches dans la limite `maxTaches` (sinon un dossier Économe de démo échouait).
- **Réglages › Général** : bloc « Coût », avec trois boutons et « Personnaliser » repliable (`04` §4). Route : `POST /api/reglages`, champ `travail`, validé comme les autres champs dans `api-reglages.js`.
- **Barre d'envoi** : une pastille qui ouvre un menu, sur le modèle du choix de modèle et d'effort du DG ; sa valeur est envoyée avec la demande.
- **Fiche du dossier** : afficher le niveau utilisé.
- **Démo** : les scénarios de démo affichent la pastille. Le choix n'a pas besoin de changer la simulation, mais il doit s'afficher.
- FR et EN.

### B3. Le DG reçoit le profil

> **Dans la 1.0.6** : Fait : bloc après la demande dans `planifier()`, rappel dans `reagir()` (dans le message, pas dans la directive système).
- `directive-dg.md` : remplacer « Le but est le meilleur résultat, pas l'économie. » par « Le but est le meilleur résultat **au juste coût** : chaque tâche, vérificateur ou agent en plus doit apporter un gain réel. »
- Le profil change d'un dossier à l'autre. On l'injecte donc dans le **message** (`planifier`, `reagir`), **pas** dans la directive système. Cela garde le préfixe de cache de la session du DG stable.
- `planifier()` : insérer `blocDirective(profilEffectif(dossier))` juste après la demande de l'utilisateur.
- `reagir()` : rappeler le profil en une ligne.
- Section « Découpage » de la directive : garder les règles, en les rendant conditionnelles au profil (« selon le PROFIL DE TRAVAIL »).

### B4. Le mode « agent direct »

> **Dans la 1.0.6** : Fait : `mode` et `relectureDemandee` sont requis dans `SCHEMA_PLAN` ; `validerTaches(…, { profil, mode })` borne au `maxTaches` et refuse un direct à plusieurs tâches ou si `agentDirect` vaut `jamais` ; la mission directe est écrite par `missionDirecte()`. L'essai S n'est pas fait.
- `SCHEMA_PLAN` : ajouter `mode: 'plan' | 'direct'` (requis).
- Le profil dit quand `direct` est permis (`agentDirect` : `jamais`, `petite`, `projet-unique`).
- En `direct`, le DG rend **une seule tâche**. Le serveur en fixe :
  - la mission : **la demande de l'utilisateur telle qu'elle a été tapée**, suivie d'un bloc court « Contexte du DG » (fichiers repérés, conventions, commandes de vérification) ;
  - `verification.mode = 'self'` ;
  - pas de `deps`.
- Le DG peut toujours répondre `plan` s'il juge la demande trop grosse. Le serveur refuse `direct` avec plusieurs tâches.
- **Objectif** : une petite demande coûte le DG plus un seul agent, ce qui est proche d'une conversation unique.

**Fini quand** : tests de validation (direct = une tâche ; direct refusé si le profil l'interdit) ; essai S de `06` en Équilibré, avec une seule session productrice et pas de vérificateur.

### B5. Le serveur fait respecter le profil

> **Dans la 1.0.6** : Fait (`verificationProfil()`), avec un écart : la relecture demandée garde le vérificateur **aussi en Équilibré** (sinon Équilibré aurait été plus économe qu'Économe sur ce point). Une validation « par toi » convertie en IA garde aussi le vérificateur. En Économe, le vérificateur passe en Sonnet / `low`, jamais remonté si le DG a choisi Haiku. Le plan affiché le dit (`t.verif.ajustement`).
Dans `validerTaches` et `verificationEffective` :
- **`maxTaches`** du profil : on refuse au-delà, et le DG corrige, comme aujourd'hui.
- **Vérification** selon `verifDefaut` :
  - `self` (Économe) : une tâche en `agent` passe en `self`, **sauf** si `risque: 'high'`, si `approbation: true`, ou si le plan porte `relectureDemandee: true`. C'est un nouveau champ booléen de `SCHEMA_PLAN`, mis par le DG quand l'utilisateur a demandé une relecture.
  - `risque` (Équilibré) : `agent` gardé si `risque` ≥ `medium`, sinon `self`.
  - `code` (Max) : comportement actuel.
- **Vérificateur** : `maxTurns` = `verifMaxTurns`. En Économe, le modèle passe au niveau `standard` du fournisseur et l'effort à `low`. Ailleurs, on garde le choix du DG. `maxRework` est borné par le profil.
- **Message** : quand le serveur change une vérification, le plan affiché le dit (« vérification : self (profil Économe) »), comme le fait déjà `verificationEffective` pour la validation par l'utilisateur.

**Fini quand** : tests table-driven (profil × risque × relecture → mode effectif).

### B6. Compaction et plafond par tâche selon le profil

> **Dans la 1.0.6** : Fait : compaction par rôle selon le niveau ; `plafondTache()` avec un plancher de 0,50 $, sans plafond si le facteur ou l'estimation manque ; `error_max_budget_usd` → « Plafond atteint (X $) » et réveil du DG avec trois choix ; une relance avec « plafond N $ » reprend la même session. `capacites()` déclare `compaction`, `plafondBudget`, `sousAgents` (vrai pour Claude, faux pour Codex). Le seuil de compaction de Codex **n'est pas branché**. Bug connu : dans le bloc « plafond atteint » de `echecDg`, deux variables ne sont pas définies.
- `compactionAgents` → `CLAUDE_CODE_AUTO_COMPACT_WINDOW` des producteurs ; `compactionVerif` → celle des vérificateurs (A1, A2).
- **Plafond par tâche** : `maxBudgetUsd` = `plafondTacheFacteur × estimation de la tâche` (lot C), avec un plancher (0,50 $) ; aucun plafond si le facteur est `null` ([agent-loop](https://code.claude.com/docs/en/agent-sdk/agent-loop.md#turns-and-budget)).
  - Sur `error_max_budget_usd` : ne pas compter comme un échec technique. La tâche passe en `failed` avec un résumé « plafond atteint (X $) ». Le DG est réveillé avec trois choix explicites : relancer en reprenant la session avec un plafond plus haut, accepter l'état, ou découper.
  - Le plafond est une estimation côté client ; il peut être un peu dépassé.
  - Les totaux restaurés à la reprise ne comptent pas : une reprise repart avec le nouveau plafond.
- Fournisseurs sans ces mécanismes (Codex, ACP) : l'adaptateur déclare ses `capacites()` (`compaction`, `plafondBudget`, `sousAgents`). Le bouton est sans effet pour lui, et la fiche le dit. Pour Codex, vérifie dans sa documentation s'il existe un réglage de seuil de compaction automatique, et branche-le si oui.

### B7. Sous-agent d'exploration économique

> **Dans la 1.0.6** : Fait : `optionsExploration()` ; `explorateur` et `Explore` en Read/Grep/Glob, outils d'écriture et `Bash` interdits, Haiku en Économe et Sonnet sinon, 25 tours ; consigne « systématiquement » en Économe. La sécurité est vérifiée par un test statique, le gain n'est pas mesuré (pas d'essai L).
- Option `agents` du SDK, pour les producteurs dont le profil a `exploration` ≠ `interdite` :

  ```js
  agents: {
    explorateur: {
      description: "Cherche dans le code et rend un résumé court (fichiers, fonctions, lignes utiles). À utiliser pour toute recherche qui demanderait de lire plus de 3 fichiers.",
      prompt: "Tu explores le code pour un autre agent. Tu ne modifies rien. Rends un résumé de 300 mots au plus : chemins, fonctions, numéros de ligne, conventions repérées. Pas de contenu de fichier entier.",
      model: 'sonnet',          // ou 'haiku' en Économe ; jamais le modèle « max »
      tools: ['Read', 'Grep', 'Glob'],
      maxTurns: 25,
    },
  }
  ```

- Redéfinir aussi `Explore` avec le même modèle léger. L'Explore intégré hérite sinon du modèle de la session ([sub-agents](https://code.claude.com/docs/en/sub-agents.md)).
- Ajouter l'outil `Agent` (ou `Task`, selon le nom en vigueur dans le SDK installé) aux profils `edition` et `edition+tests` **seulement quand** le profil l'autorise.
- Vérifier que `canUseTool` et les règles de `permissions.js` s'appliquent aux outils des sous-agents. Un test doit montrer qu'un sous-agent ne peut pas écrire.
- Directive des agents : « Pour une recherche large, confie-la à `explorateur` : il te rend un résumé, et ta conversation reste légère. » En Économe : « …systématiquement ».
- Conso : l'usage des sous-agents arrive déjà par les messages sans flux partiel (`compter(..., !m.parent_tool_use_id)`). Vérifie qu'il est bien rangé sous la tâche.

**Attention** : les sous-agents ont un cache de 5 min et leur propre coût de démarrage. Le gain vient de ce qu'ils lisent **à la place** de l'agent principal. La mesure (06, essai L) doit le confirmer ; sinon, laisser `exploration: 'permise'` sans l'encourager.

### B8. Ambiance coupée en Économe

> **Dans la 1.0.6** : Fait : `ambianceCoupee()` ; hors démo, plus de scène de bavardage, et la récolte de Joy se fait sans modèle. Les discussions ouvertes par l'utilisateur restent permises.
Si le profil **global** (Réglages) est Économe, les bavardages du mini-jeu (`personnages.js`) et la récolte de Joy (`bonheur.js`) ne lancent plus d'appel au modèle. Les discussions que l'utilisateur ouvre lui-même restent permises.

### B9. Contrôles déterministes par le serveur (L26, optionnel)

> **Dans la 1.0.6** : Fait : `serveur/controles.js` ; 10 commandes de 500 caractères au plus, lancées l'une après l'autre dans le dossier du projet, arrêt au premier échec, délai 5 min (arbre de processus tué), sortie filtrée et bornée, environnement sans les variables des comptes. Échec → correction directe avec la sortie, sans vérificateur (compte comme un rework). Les contrôles sont **sautés** si d'autres tâches écrivent encore dans le même projet. En démo, la réussite est simulée.
- La **fiche du projet** (`config/fiches/<projet>.md`, écrite par l'utilisateur) peut déclarer une liste blanche, dans un bloc :

  ````
  ```verifications
  node --test
  npm run lint
  ```
  ````

- Si la tâche est en vérification `agent` et que la fiche déclare des vérifications, le serveur les lance **avant** le vérificateur (dans le dossier du projet, délai 5 min, sortie filtrée comme en A11).
- Si l'une échoue : rework direct avec la sortie de l'échec, **sans** session de vérification. On compte un rework.
- Si toutes passent : vérificateur normal, avec la mention « contrôles déterministes passés ».
- **Jamais** une commande venue du plan du DG ou d'un agent. Seule la fiche, écrite par l'utilisateur, fait foi.

**Fini quand** : tests (liste blanche lue depuis la fiche ; une commande hors liste n'est jamais lancée ; échec → rework sans vérificateur).

### B10. Verrous de ressources déclarées (L29, optionnel)

> **Dans la 1.0.6** : **Pas fait.** Seuls les projets sont verrouillés, comme en 1.0.5 ; la règle de découpage (A12) reste le seul garde-fou pour un appareil, une application ou un compte externe partagés.
**Pourquoi** : aujourd'hui, le serveur ne verrouille que les **projets** en écriture (`verrous`, `cleProjet`, `motifAttente`). Deux tâches qui pilotent le même téléphone, la même application ou le même compte d'un service externe peuvent tourner en même temps, et seule la directive (A12) l'empêche.

**Quoi** :
- `SCHEMA_TACHE` : nouveau champ `ressources: string[]`, requis, liste vide permise. Ce sont des noms libres choisis par le DG : `telephone`, `compte:tts-google`, `appli:montage`, `fichier:docs/storyboard.md`…
- Directive du DG : « Déclare dans `ressources` ce que la tâche utilise et qu'une autre ne doit pas utiliser en même temps (appareil, application pilotée, compte ou quota externe, document de sortie partagé). Les fichiers du projet sont déjà protégés par le serveur : ne les liste pas. »
- `motifAttente` : une tâche attend tant qu'une tâche **active** (de n'importe quel dossier) déclare une ressource commune. Motif affiché : « en attente de {ressource} (utilisée par {dossier} {ref}) ».
- Les verrous se posent à `lancer()` et se libèrent à `terminer()`, à l'arrêt d'urgence et à l'annulation, exactement comme les verrous de projet.
- Comparaison des noms : sans casse et sans espaces en trop.

**Fini quand** : tests de l'ordonnanceur (deux tâches avec une ressource commune ne tournent jamais en même temps ; sans ressource commune, elles tournent en parallèle ; libération sur fin, annulation et urgence).

## Lot C — Estimation et mesure intégrées

### C1. Estimer un plan avant de le lancer

> **Dans la 1.0.6** : Fait, dans `serveur/estimation.js` (`estimerDossier`) : moyenne des tâches passées de même nature, niveau et vérification dès 2 tâches, sinon des tâches proches, sinon la table `config/defauts/estimations.json` ; × effort (0,7 à 2) ; × 1,25 si vérification par agent ; plus le DG. En $ pour Claude, en jetons pour Codex, « non estimable pour ce compte » sinon. Le % de la fenêtre n'apparaît que si les limites du compte sont lisibles (relues si elles ont plus de 5 min). La carte « Lancer / Réduire / Annuler » ne bloque jamais sans estimation, sans limites ou sans seuil. Les tâches ajoutées après « Lancer » sont estimées sans nouvelle carte. Pas de réestimation après un passage sur Opus ou une relance.
Nouveau module `serveur/estimation.js` : `estimerPlan(taches, compte)` (livré sous le nom `estimerDossier`).

**Par tâche** :
- moyenne du coût réel des tâches passées de même `nature`, même niveau de modèle et même mode de vérification (sources : `conso.json` → `taches`, et les `state.json` pour connaître nature, modèle et vérif) ;
- sans historique, une table de départ dans `config/defauts/estimations.json` (valeurs initiales tirées de D2 et D4, voir `01-diagnostic.md`) ;
- facteur d'effort (low 0,7, medium 1, high 1,3, xhigh 1,6, max 2) ;
- facteur de vérification (`agent` + 25 %).

**Plan** = somme, plus le DG (moyenne de ses coûts passés).

**% de fenêtre** : avec le rapport appris en C2.

**Affichage** : sur la carte du plan, « ≈ 12 $ · ≈ 15 % de ta fenêtre de 5 h (il en reste 60 %) ».

**Accord** :
- au-delà de `seuilAccordFenetre` (en % de ce qui **reste** dans la fenêtre), carte de décision « Lancer / Réduire / Annuler » ;
- « Réduire » renvoie au DG : « Ton plan est estimé à X % de la fenêtre restante ; l'utilisateur veut tenir sous Y %. Réduis le périmètre ou le nombre de tâches, sans baisser les modèles ni les efforts. »

### C2. Calibrer « $ → % de fenêtre »

> **Dans la 1.0.6** : Fait : intervalles de 30 min au plus, sans remise à zéro, sans baisse et avec une consommation du QG ; 20 derniers par compte dans `conso.json` (`calibrage`) ; rapport appris dès 3 intervalles et 1 $ (ou 1 M de jetons), sinon `pointsParDollar` du forfait. Pour Codex, pas de valeur de départ : pas de % tant que le rapport n'est pas appris.
Voir `06-mesure.md` §7. Dans `conso.js`, à chaque lecture des limites d'un compte : `Δutilisation / Δcoût QG` depuis la lecture précédente, gardé seulement si le QG était le seul consommateur plausible (Δcoût > 0, pas de remise à zéro entre les deux). Moyenne glissante sur les 20 derniers intervalles, par compte, enregistrée dans `conso.json` → `calibrage`.

### C3. Enregistrer et afficher

> **Dans la 1.0.6** : Fait : contexte en direct, compactions et coût sur la fiche de la tâche et sur celle de l'agent ; en fin de tâche, `conso.json` reçoit `contexteMax`, `tours`, `compactions` et la part du cache ; onglet ⚡ « profil · estimé · réel · écart ». Codex et ACP n'envoient pas encore le contexte en direct. La démo n'écrit rien dans `conso.json`.
- `state.json` : `dossier.travail`, `dossier.x.estimation`.
- `conso.json` : par dossier, `profil`, `estimation`, `compactions` ; par tâche, `contexteMax`, `tours`, `compactions` et **taux de réussite du cache** (`cacheLu / (cacheLu + cacheEcrit + entree)`). Un taux bas signale une réembauche à froid, un changement de modèle en cours de session ou un préfixe instable.
- Onglet ⚡ Consommation : par dossier, « profil · estimé · réel · écart ».
- Fiche de l'agent : contexte actuel, nombre de compactions, coût de la tâche.

## Lot D — Documentation et livraison
- README (FR et EN) : section « Coût », qui dit ce que fait chaque niveau en une ligne, ce qui ne change jamais (modèles, efforts, ordre des tâches) et comment lire l'estimation.
- `docs/` : copier dans `docs/cout/` les documents 01 à 06 de ce dossier, mis à jour avec ce qui a vraiment été fait.
- Notes de version (même format que les précédentes).
- **Ne pas** publier : préparer seulement, et attendre l'accord de l'utilisateur.

> **Dans la 1.0.6** : README (section « Coût ») et ce dossier `docs/cout/` sont faits ; les notes de version sont préparées hors du dépôt.

## Ordre conseillé et points d'arrêt

1. **Lot A** (A1 → A12 ; A11 est optionnel). Tests. Puis essai **M** de `06` avant et après le lot A, pour mesurer les gains gratuits. **Point d'arrêt** : montrer les chiffres à l'utilisateur.
2. **Lot B** (B1 → B10 ; B9 et B10 sont optionnels). Tests. Essais S et M dans les trois niveaux de Coût. **Point d'arrêt** : chiffres et notes de qualité ; ajuster `profils-travail.json` si une règle d'acceptation de `06` §4 n'est pas tenue.
3. **Lot C**. Tests. Essai L en Équilibré.
4. **Lot D**.

À chaque point d'arrêt, poser la question à l'utilisateur plutôt que d'enchaîner : les essais réels consomment sa fenêtre.

> **Dans la 1.0.6** : les lots A, B (sauf B10) et C sont faits et couverts par des tests automatiques. **Les essais S, M et L n'ont pas été faits** : ils consomment la fenêtre de l'utilisateur et demandent son accord. Les valeurs de `profils-travail.json` sont donc celles de la conception, pas encore ajustées par la mesure.

## Hors périmètre
- Changer la grille modèle / effort du DG (option `grilleFableDifficulte` : seulement si l'utilisateur la demande, désactivée par défaut).
- Remplacer le préréglage système `claude_code`.
- Réécrire l'ordonnanceur, ou passer le QG aux « agent teams » expérimentaux de Claude Code. D'après la doc des coûts, ils consomment environ 7 fois plus de tokens en mode plan ([costs](https://code.claude.com/docs/en/costs.md)).
