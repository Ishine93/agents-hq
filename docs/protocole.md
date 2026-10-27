# Protocole serveur ↔ site (v1)

Le serveur écoute sur `http://127.0.0.1:4747`. Tout passe par JSON en UTF-8.

## Authentification locale
- `lancer.bat` ouvre `http://127.0.0.1:4747/?jeton=<jeton>` ; le serveur répond en posant le cookie `qg_jeton` (HttpOnly, SameSite=Strict) puis redirige vers `/`.
- Toutes les routes `/api/*` exigent ce cookie (ou l'en-tête `X-QG-Jeton`). Le site n'a rien à gérer : le navigateur envoie le cookie tout seul (`fetch(url, {credentials: 'same-origin'})`, `new EventSource('/api/flux')`).
- En mode maquette (`?mock` dans l'URL), le site n'appelle pas le serveur : `web/mock.js` simule le flux.

## Flux d'événements : `GET /api/flux` (Server-Sent Events)
Chaque événement SSE est `data: <json>\n\n`. Tous les objets ont `seq` (entier croissant), `t` (epoch ms) et `type`.
Le premier événement reçu est toujours un `etat` complet ; ensuite, des événements incrémentaux. À la reconnexion, le serveur renvoie un `etat` complet.

### Objets

**Etage**
```json
{"id":"mon-jeu","nom":"MonJeu","type":"roblox","ordre":2,"projet":"D:\\Projets\\MonJeu","actif":true,"dossiers":["D:\\Projets\\MonJeu"]}
```
`type` ∈ `direction`, `roblox`, `unreal`, `unity`, `godot`, `comfyui`, `web`, `python`, `projet`, `atelier3d`, `etudes`, `serveur`, `hall`, `bac`.
`ordre` : position verticale (−1 = sous-sol, 0 = hall, la Direction a le plus grand).

**Compte**
```json
{"id":"claude1","nom":"Claude 1","connecte":true}
```

**Dossier** (une demande)
```json
{"id":"D3","texte":"…ta demande…","titre":"Bench + tests du pathfinding","compte":"claude1",
 "etat":"planification","etages":["mon-jeu"],"question":null,"synthese":null,"creeLe":1792883915290}
```
`etat` ∈ `planification`, `clarification` (le DG attend ta réponse : `question` est rempli), `en_cours`, `termine`, `annule`, `echec`.

**Tache**
```json
{"id":"D3-T2","dossier":"D3","ref":"T2","titre":"Tests calibrés sur le bench","etage":"mon-jeu",
 "nature":"test","modele":"sonnet","effort":"medium","modeleReel":null,"effortReel":null,
 "etat":"waiting","attend":["T1"],"motifFile":null,"inputsFrom":["T1"],
 "dernierOutil":null,"derniereActivite":null,"verif":{"mode":"agent","modele":"opus"},
 "resultat":null,"tentative":1,"debut":null,"fin":null}
```
- `modele` ∈ `haiku`, `sonnet`, `opus`, `fable` ; `effort` ∈ `low`, `medium`, `high`, `xhigh`, `max`.
- `etat` ∈
  - `planned` : vient d'être planifiée ;
  - `waiting` : attend des dépendances (`attend` = refs manquantes) ;
  - `ready` : prête ;
  - `queued` : file d'attente (`motifFile` : texte court, ex. « plafond atteint », « MonJeu occupé par T3 ») ;
  - `briefing` : reçoit sa mission du DG ;
  - `running` : au travail ;
  - `permission` : main levée ;
  - `verifying` : vérification en cours ;
  - `rework` : corrections après un rejet ;
  - `done`, `failed`, `cancelled`, `skipped`, `interrupted`.
- `dernierOutil` : `{"nom":"Edit","cible":"src/Shop.luau"}` ; `derniereActivite` : epoch ms du dernier message de l'agent (le site affiche « … » après 20 s de silence pendant `running`).
- `resultat` : `{"status":"done|blocked|failed","summary":"…"}` une fois terminée.

**Permission**
```json
{"id":"P7","tache":"D3-T2","outil":"Bash","resume":"npm install lodash","t":1792883915290}
```

**Message** (fil de discussion)
```json
{"id":"M12","dossier":"D3","etages":["mon-jeu"],"de":"dg","texte":"J'ai découpé ta demande en 4 tâches.","t":1792883915290}
```
`de` ∈ `toi`, `dg`, `systeme`. Le hall affiche tous les messages ; un étage affiche ceux dont `etages` le contient.

### Événements

| type | champs | rôle |
|---|---|---|
| `etat` | `etages[]`, `comptes[]`, `compteDefaut`, `dossiers[]`, `taches[]`, `permissions[]`, `messages[]`, `dg`, `ordonnanceur` | état complet |
| `dossier` | `dossier` | création ou mise à jour (objet complet) |
| `tache` | `tache`, `transition: {de, a}` | création ou mise à jour (objet complet) |
| `plan` | `dossier`, `taches: [{ref, titre, etage, deps: [refs], modele, effort}]` | le DG affiche son plan au tableau blanc |
| `dg` | `dg: {etat: "libre"\|"reflechit", dossier, etage, action}` | `action` ∈ `plan`, `delta`, `synthese`, `question`, `null` |
| `outil` | `tache`, `nom`, `cible` | bulle d'outil au-dessus de l'agent |
| `activite` | `tache` | l'agent vient d'écrire (efface la bulle « … ») |
| `passation` | `de: [idsTache]`, `a: idTache` | scène de réunion : les amonts tendent un dossier à l'aval |
| `verification` | `tache`, `phase: "debut"\|"fin"`, `verificateur: {modele}`, `verdict: "pass"\|"rework"\|"fail"\|null` | inspecteur au poste du producteur |
| `permission` | `permission` | main levée + carte dans le site |
| `permission_resolue` | `id`, `decision: "allow"\|"deny"` | retire la carte |
| `message` | `message` | nouveau message dans le fil |
| `ordonnanceur` | `ordonnanceur: {pause: null \| {raison, jusqua}}` | pause globale (limite d'usage, arrêt d'urgence) |
| `alerte` | `niveau: "info"\|"warn"\|"erreur"`, `texte` | bandeau |

`dg` dans `etat` : `{"etat":"libre","dossier":null,"etage":"direction","action":null}`.

### Ajouts v1.1 (réglages du DG et MCP)
`etat` contient aussi :
- `modeles` : modèles proposables par compte, `{"claude1": [{"id":"opus","nom":"Opus 5.5","efforts":["low","medium","high","xhigh","max"]}, …], "claude2": […]}` ;
- `dgDefaut` : `{"modele":"opus","effort":"xhigh"}` ;
- `mcp` : `{"comptes": {"claude2": {"decouverte": 1792883915290, "serveurs": [{"nom":"claude.ai Notion","statut":"connected","source":"claudeai","outils":18,"mode":"demander","perso":true}]}}, "etages": {"mon-jeu": [{"nom":"Roblox_Studio","mode":"demander"}]}}`. `mode` ∈ `off`, `demander` (chaque appel lève la main), `auto`.

Chaque **Dossier** a un champ `dg: {modele, effort}`.

Nouvel événement : `mcp` avec `mcp` et `modeles` (même forme que dans `etat`), envoyé après une découverte ou un changement de mode.

### Ajouts v1.2 (images, questions des agents, compléments, notifications, dictée)

**Piece** (image) : `{"id":"lx2-3-capture.png","nom":"capture.png","type":"image/png","legende":null,"origine":"toi|agent","url":"/api/pieces/D3/lx2-3-capture.png"}`. L'`url` se charge directement dans un `<img>` (le cookie suffit).

**Message** : nouveau champ `pieces: [Piece]` (images jointes par toi, montrées par un agent via `mcp__qg__montrer`, ou captures reçues automatiquement par un agent depuis un outil comme Roblox Studio).

**Decision** (un agent te pose une question et attend ta réponse ; sa tâche passe en `permission`, main levée) :
```json
{"id":"Q1","tache":"D3-T4","dossier":"D3","question":"Quelle variante préfères-tu ?",
 "options":[{"id":"O1","libelle":"Vagues fixes","image":Piece|null}, …],
 "images":[Piece], "t":1792883915290}
```
`options` vide = réponse libre.

**Notification** (tout ce qui a besoin de toi, ou une info importante) :
```json
{"id":"P7","type":"permission|decision|question|validation|info","titre":"T3 demande une autorisation",
 "texte":"Bash : npm install …","dossier":"D3","tache":"D3-T3","etage":"mon-jeu",
 "actions":[{"id":"allow","libelle":"Autoriser"},{"id":"deny","libelle":"Refuser"}],"t":…}
```
Correspondance des actions :

| type | `id` de la notification | action → appel |
|---|---|---|
| permission | id de la permission (`P7`) | `allow`/`deny` → `POST /api/permissions/P7 {decision}` |
| decision | id de la question (`Q1`) | `O1`…`On` → `POST /api/decisions/Q1 {choix}` ; `repondre` → ouvrir la carte (réponse libre) |
| question | `QD-<dossier>` | `repondre` → mettre la saisie en mode réponse au DG |
| validation | `V-<tache>` | `pass`/`fail` → `POST /api/taches/<tache>/valider {decision}` |
| info | `N<n>` | aucune (fin de dossier, pause) |

Une notification avec actions reste en attente jusqu'à `notification_resolue`. Quand aucun onglet n'est ouvert, le serveur affiche lui-même une notification Windows qui ouvre le site.

`etat` contient aussi `decisions: [Decision]`, `notifications: [Notification]` (en attente), `dictee: {disponible, appareil}` et `plans: {"D3": [{ref, titre, etage, deps, modele, effort}]}` (mêmes données que l'événement `plan`, pour reconstruire le tableau blanc à la reconnexion).

Nouveaux événements :

| type | champs |
|---|---|
| `decision` | `decision` |
| `decision_resolue` | `id`, `choix`, `texte` |
| `notification` | `notification` |
| `notification_resolue` | `id` |

Nouvelles routes :

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/api/dossiers` | + `pieces: [{nom, type, base64}]` (10 images, 15 Mo chacune) | `{id}` |
| POST | `/api/dossiers/:id/completer` | `{texte, pieces?}` | `{ok}` : complément sur un dossier existant (en cours, terminé, ou en planification) ; le DG le transmet aux agents, même déjà lancés |
| POST | `/api/dossiers/:id/repondre` | + `pieces?` | `{ok}` |
| POST | `/api/decisions/:id` | `{choix?: "O2", texte?: "…"}` | `{ok}` |
| GET | `/api/pieces/:dossier/:fichier` | — | l'image |
| POST | `/api/dictee` | audio brut (corps binaire, `Content-Type: audio/webm` ou `audio/wav`…) | `{texte, duree, calcul, appareil}` : transcription locale Whisper large-v3 |
| GET | `/api/dictee` | — | `{disponible, appareil, erreur}` |

### Ajouts v1.3 (réserve d'agents)
Un agent qui a fini n'est plus renvoyé. Il reste en **réserve** sur son étage, avec sa conversation Claude intacte. Le DG peut le **réembaucher** pour une tâche qui touche le même code ; s'il est déjà occupé, le serveur le **clone** (copie de sa conversation).

**Agent**
```json
{"id":"A3","etage":"mon-jeu","compte":"claude1","modele":"sonnet","effort":"medium",
 "titre":"Tests calibrés sur le bench","specialite":"résumé de sa dernière mission",
 "fichiers":["test/chemin.test.js"],"missions":2,"contexte":48000,
 "etat":"disponible|occupe|retire","tache":"D3-T2"|null,"depuis":1792883915290,"cloneDe":"A1"?}
```
`contexte` est en tokens. Au-delà de 150 000, le serveur met l'agent à la retraite (`retire`) : un agent retraité n'est plus affiché.

- `etat.equipe` : liste des agents non retraités.
- Événement `agent` : `{agent}` (création ou mise à jour ; `etat: "retire"` = il part).
- **Tache** : nouveaux champs `agent` (id de l'agent qui porte la tâche, attribué au lancement) et `reembauche` (vrai si c'est un agent de la réserve, ou son clone).
- Route : `POST /api/equipe/:id/retirer` (mettre un agent disponible à la retraite).

### Ajouts v1.4 (serveurs du sous-sol, terminal des agents)
**Service** : un serveur long (ex. `rojo serve`) que le QG lance et surveille. Il survit à la fin de la tâche de l'agent qui l'a démarré.
```json
{"id":"mon-jeu:rojo","etage":"mon-jeu","type":"rojo","nom":"Rojo serve","commande":"rojo serve","port":34872,
 "etat":"arrete|demarrage|actif|erreur|externe","pid":1234|null,"depuis":…,"par":"T3"|"toi"|null,"erreur":null,
 "externe":{"pid":10488,"port":34873}|null,"dernieresLignes":["Rojo server listening:", "…"]}
```
- `externe` : le port est déjà en écoute par un programme lancé hors du QG (on ne peut pas l'arrêter d'ici).
- Plusieurs jeux peuvent partager un port (34872) : un seul tourne à la fois, et le serveur refuse le conflit avec une explication.
- `etat.services` : tous les services possibles, même arrêtés (un par jeu Roblox).
- Événements :
  - `service` `{service}` : changement d'état ;
  - `service_log` `{id, lignes: [...]}` : nouvelles lignes du journal, envoyées par lots ;
  - `service_action` `{tache, service, action: "demarrer"|"arreter"}` : un agent va au sous-sol allumer ou éteindre la baie (scène : ascenseur, baie, retour à son étage).
- Routes :
  - `GET /api/services` ;
  - `GET /api/services/:id/journaux` (id encodé, ex. `mon-jeu%3Arojo`) → `{lignes}` (400 dernières) ;
  - `POST /api/services/demarrer {etage, type}` → service, ou `{erreur}` en 409 (conflit de port) ;
  - `POST /api/services/arreter {etage, type}`.

**Ports Rojo** : un port unique par jeu (registre `config/ports.json`). Le QG lance toujours `rojo serve --port <port>`.

**Nouveaux projets** : toutes les minutes, le serveur regarde les dossiers racines (Réglages).
- Si `rojoPortsAuto` est vrai, un nouveau jeu Rojo reçoit aussitôt le prochain port libre, écrit dans son `default.project.json` ; un message `systeme` le signale.
- Tout nouveau projet (Rojo, Unreal, Unity, Godot, ComfyUI, web, Python, dépôt git…) sans étage déclenche une notification `type: "projet"` avec `projet` (chemin) et les actions `ajouter` → `POST /api/etages/ajouter {dossier: projet}` et `ignorer` → `POST /api/etages/ignorer {dossier: projet}`.
- Quand un étage est ajouté, l'événement `etages` `{etages: [Etage]}` donne la nouvelle liste complète : reconstruis l'immeuble et la vue globale. Le nouvel étage se place juste sous la Direction.
- La notification ne propose que des projets détectés, jamais les dossiers racines eux-mêmes. `GET /api/projets` et `POST /api/racines` (Réglages, configuration guidée) ajoutent chaque racine sans marqueur, avec `racine: true` et `type: "projet"`, pour en faire un étage entier.
- **Étage libre** (« ＋ Nouvel étage ») : `POST /api/etages/ajouter {dossiers: [chemin, …], nom?, type?}`. Le premier dossier est le principal (`projet`, dossier de travail des sessions) ; avec plusieurs dossiers, l'étage porte aussi `dossiers` (même forme qu'un étage écrit à la main) et les autres vont en `additionalDirectories` et dans les zones d'écriture. `type` : une clé de `typesProjet`, sinon le type détecté du dossier principal, sinon `projet`. Refus (409) : dossier introuvable, dossier du QG lui-même, lecteur entier, ou exactement les mêmes dossiers qu'un étage existant. L'id vient du nom (`slug`, suffixe `-2`, `-3`… si pris) ; la fiche `config/fiches/<id>.md` est écrite automatiquement. `{dossier, nom}` reste accepté.
- `POST /api/etages/:id/modifier {dossiers: [...]}` remplace les dossiers d'un étage (mêmes règles ; le premier devient `projet`). Refusé pour la Direction et les salles communes.

### Ajouts v1.5 (prénoms, pensées en direct, recherche visuelle, happiness manager)
- **Prénoms** : `Tache.prenom` (attribué dès le plan, ex. « Léa ») et `Agent.prenom`. Un agent réembauché garde le sien ; un clone s'appelle « Léa bis ». Les refs T1, T2… restent pour le plan.
- **Pensées en direct**, événement `pensee` :
  ```json
  {"cible":"D3-T2"|"dg","dossier":"D3","phase":"reflexion|redaction|rapport|outil","outil":"WebSearch"|null,
   "extrait":"…derniers 280 caractères de la réflexion résumée (phase reflexion seulement)…","taille":3400,"verificateur":true?,"t":…}
  ```
  Au plus une par seconde et par cible. `redaction` = l'agent écrit sa réponse ; `rapport` = il rédige sa sortie structurée ; `taille` = caractères écrits jusqu'ici. `etat.pensees` donne la dernière pensée de chaque cible (moins de 2 minutes).
- **Réflexion complète** (après la v1.0.5, champs ajoutés à `pensee` en phase `reflexion`, compatibles avec les consommateurs existants) :
  ```json
  {"cible":"D3-T2","dossier":"D3","phase":"reflexion","outil":null,"extrait":"…fin du bloc, ≤ 280 car., espaces écrasés…","taille":3400,
   "bloc":"Rmvpnlunx1","debut":1793043167613,"pos":3120,"ajout":"…texte exact ajouté depuis l'envoi précédent…","fin":true?,"verificateur":true?,"t":…}
  ```
  Un bloc de réflexion = un bloc `thinking` du modèle (réflexion résumée par l'API). Le serveur envoie, au plus toutes les 1,2 s, le texte ajouté depuis l'envoi précédent (`ajout`, avec ses espaces et retours à la ligne) et sa position absolue dans le bloc (`pos`) ; le premier envoi d'un bloc a lieu dès son début (`pos: 0`, `ajout` éventuellement vide), le dernier est forcé à la fin du bloc et porte `fin: true` (aussi pour un bloc coupé par une interruption ou la fin de la session). Bout à bout, les `ajout` d'un bloc redonnent son texte exact. Côté site : si `pos` est inférieur à la longueur connue, la partie déjà reçue est ignorée ; s'il est supérieur, il manque un morceau (`[…]`). `extrait` reste pour les bulles du canvas. Un événement sans `bloc` (ancien serveur, ancien journal) ne porte que l'extrait.
  État initial : `etat.reflexions` = `{ cible: [ {bloc, debut, texte, fin, coupe, dossier, verificateur?, t} ] }`, texte complet des derniers blocs de chaque cible (au plus 10 blocs et 20 000 caractères par cible, 200 000 au total ; `coupe` = caractères retirés au début d'un bloc trop long, pour que `pos` reste absolu). Les entrées de `etat.pensees` n'ont plus `ajout` ni `pos`. Les blocs d'une tâche disparaissent avec son dossier.
- **Traduction des réflexions** (réglage `traduireReflexion`, booléen, `false` par défaut, `POST /api/reglages`) : la réflexion résumée sort souvent en anglais (voir docs/mesure-langue-reflexion.md). Quand le réglage est actif, chaque bloc terminé (`fin`) d'une vraie session (DG, agent, vérificateur ; jamais en démo) dont la langue détectée diffère de `langueIA` est traduit par Haiku, un bloc à la fois (au plus 30 en attente). Événement `pensee_traduction` : `{"cible":"D3-T2","dossier":"D3","bloc":"Rmvpnlunx1","traduction":{"texte":"…","langue":"fr","source":"en"}}`. Le bloc garde son `texte` d'origine et gagne `traduction`, aussi dans `etat.reflexions`. Le site montre la traduction, avec « Voir l'original ». Consommation rangée sous le rôle `traduction`.
- **Nouveaux outils** (bulles) : `WebSearch`, `WebFetch`, `mcp__qg__capturer_page` (capture d'une page web), `mcp__qg__telecharger_image` (image du web). Les images obtenues arrivent dans le fil (message `systeme` avec `pieces`, origine agent).
- **Tâche bloquée** : `motifFile` peut valoir « bloquée : T1 en échec ». La tâche attend que le DG relance l'amont, au lieu d'être sautée.
- **Permissions lisibles** : l'objet Permission devient
  ```json
  {"id":"P7","tache":"D2-T5","outil":"Glob","resume":"Chercher des fichiers : les éléments JeuA, JeuB, JeuC et 7 autres (dans tous les sous-dossiers)",
   "technique":"{\"pattern\":\"{JeuA,…}*/**\"}","risque":"lecture|modification|execution|reseau|suppression","horsProjet":false,"peutToujours":true,"t":…}
  ```
  `resume` est la phrase en français clair. `technique` est le détail brut, à mettre dans un repli « Détails techniques ». `peutToujours` signifie que la décision `allow_session` (« Toujours pour cette tâche ») est possible : `POST /api/permissions/:id {decision: "allow" | "allow_session" | "deny"}`. La notification de permission propose alors l'action `allow_session`.
- **Happiness manager**, `etat.bonheur` :
  ```json
  {"maj":…,"source":"en ligne + Haiku","blagues":[{"setup":"…","chute":"…"}],"faits":["…"],"ambiance":["Ce café a un goût de vendredi.", "…"]}
  ```
  Événement `bonheur` `{bonheur}` après une récolte (toutes les 12 h). `POST /api/bonheur/recolter` en lance une.

**Terminal d'un agent** : chaque commande Bash, avec sa sortie.
- Événement `commande` : `{tache, commande: {id, commande, description, debut, enCours: true}}` au lancement, puis le même `id` avec `{sortie, erreur, fin, enCours: false}` (sortie : les 6000 derniers caractères).
- `etat.terminaux` : `{"D3-T2": [commande, …]}` (40 dernières par tâche).

## Actions du site
| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/api/dossiers` | `{texte, etageAffiche, compte, dg?: {modele, effort}}` | `{id}` |
| GET | `/api/mcp` | — | objet `mcp` |
| POST | `/api/mcp/decouvrir` | `{compte}` | objet `mcp` (relit les connecteurs du compte, sans tokens, ~15 s) |
| POST | `/api/mcp` | `{cible: "compte"\|"etage", id, nom, mode}` | objet `mcp` |
| POST | `/api/dossiers/:id/repondre` | `{texte}` | `{ok}` (réponse à une question du DG) |
| POST | `/api/dossiers/:id/annuler` | — | `{ok}` |
| POST | `/api/taches/:id/annuler` | — | `{ok}` |
| POST | `/api/taches/:id/valider` | `{decision: "pass"\|"fail"}` | `{ok}` (vérification en mode `user`) |
| POST | `/api/permissions/:id` | `{decision: "allow"\|"deny"}` | `{ok}` |
| POST | `/api/urgence` | — | `{ok}` (arrêt d'urgence : tout s'arrête) |
| POST | `/api/reprendre` | — | `{ok}` (lève la pause) |
| GET | `/api/etat` | — | objet `etat` |

Erreurs : statut HTTP 4xx/5xx avec `{erreur: "texte"}`.

## Ajouts v2 (version partageable)
- **Réglages** : `etat.reglages` = `{langueInterface, langueIA, utilisateur, racines, racinesValides, modeTravail: "auto"|"prudent", onboarding, plafondGlobal, plafondEtage, recolteAuto, rojoPortsAuto, dg: {modele, effort}, qg, version, claudeCodeLocal, plateforme}`. `plateforme` = `{nom: "windows"|"mac"|"linux", scripts: {lancer, installer, ajouterCompte, mettreAJour, demo}, dicteeLocale, raccourciDictee, dossierComptes}` : noms des scripts de la plateforme du serveur (`lancer.bat` / `lancer.command`), dictée locale installable ou non, raccourci de dictée (`Alt+M` / `⌥M`). Événement `reglages` `{reglages}` à chaque changement. `onboarding: false` → le site ouvre la configuration guidée.
- **Comptes** : `Compte` gagne `abonnement`, `email`, `dossier`, `partage` (connexion partagée avec Claude Code installé sur le PC). Événement `comptes` `{comptes, compteDefaut}`.
- **Personnalisation** : `etat.personnalisation` = `{prenoms: [...], skins: {"Léa": {peau, cheveux, coiffure, pantalon, lunettes}, "@dg": {..., chemise}, "@joy": {...}}}` ; événement `personnalisation`.
- **Consommation** : `etat.conso` = `{jour, aujourdhui: {total, comptes, modeles, etages, roles}, semaine: [{jour, ...}], mois, dossiers: {D3: agg}, limites: {claude1: {maj, abonnement, fenetres: {five_hour: {utilisation, reinit}, seven_day, seven_day_opus, …}}}, reemplois: {nombre, contexte}}` avec `agg = {entree, sortie, cacheLu, cacheEcrit, cout, appels}` (coût = équivalent API en dollars). Événement `conso` (au plus 1 par seconde).
- **Résultat de tâche** : `Tache.resultat` gagne `notes`, `fichiers` (chemins modifiés) et `artefacts` (`[{chemin, nature}]`).

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| GET | `/api/reglages` | — | `{reglages, comptes, compteDefaut, etages, personnalisation, typesProjet}` |
| POST | `/api/reglages` | champs à changer (voir `reglages`) | `reglages` |
| POST | `/api/racines` | `{racines: [chemin]}` | `{racines, projets}` |
| POST | `/api/choisir-dossier` | `{titre}` | `{chemin}` (fenêtre de choix de dossier du système : Windows, ou « choose folder » sur Mac ; `null` si annulé ou plateforme sans sélecteur) |
| GET | `/api/projets` | — | `{projets: [{dossier, nom, type, etage, ignore, racine?}], racines}` (`racine: true` : un dossier racine proposé tel quel, même sans marqueur de projet) |
| POST | `/api/etages/ajouter` | `{dossier, nom?}` ou `{dossiers: [chemin], nom?, type?}` | Etage |
| POST | `/api/etages/ajouter-lot` | `{projets: [{dossier, nom} | {dossiers, nom, type?}]}` | `{faits, erreurs}` |
| POST | `/api/etages/:id/modifier` | `{nom?, actif?, fiche?, dossiers?}` | `{etage, etages}` |
| POST | `/api/etages/:id/retirer` | — | `{etage, etages}` |
| GET | `/api/etages/:id/fiche` | — | `{fiche}` |
| GET | `/api/etages/:id/markdown` | — | `{fichiers: [{chemin, relatif, taille, modifie}]}` (les .md de l'étage, plus récents d'abord) |
| GET | `/api/fichier?chemin=…&etage=…` | — | `{chemin, nom, ext, taille, modifie, contenu}` (lecture seule, dossiers de l'utilisateur seulement) |
| POST | `/api/comptes/ajouter` | `{nom, partage?}` | `{compte}` (ouvre la fenêtre de connexion) |
| POST | `/api/comptes/:id/connecter\|deconnecter\|modifier\|supprimer\|limites` | `{nom?, defaut?}` | `{comptes, compteDefaut}` |
| GET/POST | `/api/personnalisation` | `{prenoms?, skins?}` | personnalisation |
| GET | `/api/bonheur/stock` | — | `{langue, blagues, faits, ambiance}` (stock complet) |
| POST | `/api/bonheur/stock` | `{blagues?, faits?, ambiance?}` | totaux |
| GET | `/api/bonheur/export?format=json\|xlsx\|csv` | — | fichier |
| POST | `/api/bonheur/import?mode=fusion\|remplacer&nom=fichier.xlsx` | corps brut du fichier | `{ajouts, total}` |
| GET | `/api/conso`, `/api/conso/:dossier` | — | consommation, détail par tâche |
| POST | `/api/conso/limites` | — | relit les limites du forfait de chaque compte (sans tokens) |
| POST | `/api/dictee/installer` | — | ouvre l'installation de la dictée (Windows seulement : 409 avec un message clair sur Mac, voir `reglages.plateforme.dicteeLocale`) |
| POST | `/api/onboarding/terminer` | — | `reglages` |

## Ajouts 1.0.2
- **Salles communes** : deux étages sans projet, `{"id":"salle-pause","type":"pause"}` (les agents dont la tâche attend y jouent) et `{"id":"salle-repos","type":"repos"}` (les agents de la réserve y dorment). Le DG n'y envoie jamais de tâche ; ils ne se retirent ni ne se désactivent.
- **Réglages** : `reglages.gitAuto` (booléen : les profils qui écrivent peuvent faire toutes les commandes git, `git push` n'est plus interdit) et `reglages.dureeBulles` (multiplicateur de durée des bulles, 1 = normal).
- **Personnalisation** : `personnalisation.noms = {dg, joy}` (vide = nom par défaut). Les nouvelles recrues tirent un prénom **au hasard** parmi les prénoms libres de la liste.
- **Messages** : un message peut porter des champs en plus. Question de l'utilisateur à un agent : `{de: "toi", question: true, tache}` (au DG : `cible: "dg"`). Réponse : `{de: "agent", nom, tache, reponse: true}` (du DG : `{de: "dg", reponse: true, cible: "dg"}`). Consigne directe : `{de: "toi", tache}`.

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/api/taches/:id/question` | `{texte}` | `{ok}` tout de suite ; une copie (fork) de la conversation de l'agent répond, sans l'interrompre, par un message dans le fil. 409 si l'agent n'a pas encore commencé (ou en démo) |
| POST | `/api/dossiers/:id/question-dg` | `{texte}` | idem pour le DG du dossier |
| POST | `/api/taches/:id/consigne` | `{texte}` | `{ok}` : consigne transmise en direct à l'agent (ou à sa prochaine reprise, selon son état) |
| POST | `/api/equipe/renommer` | `{ancien, nouveau}` (`ancien` = un prénom, `@dg` ou `@joy`) | personnalisation ; renomme aussi, tout de suite, les agents de la réserve et les tâches en cours qui portent ce nom |

## Ajouts 1.0.3
- **Limites du forfait** : `limites[compte] = {maj, essai, erreur?, abonnement, disponible, fenetres, extra?}`. `maj` = dernière lecture **réussie**, `essai` = dernière tentative ; `erreur` présent si la dernière tentative a raté (les fenêtres gardées sont alors celles de `maj`). Une fenêtre mise à jour entre deux lectures par un événement de session porte `lu` (heure de l'événement) et `statut` (`allowed`, `allowed_warning`, `rejected`). `utilisation` est toujours en pourcentage (0-100) : la lecture répond en pourcentage, les événements en fraction (convertie).
- **Pause sur limite d'usage** : `ordonnanceur.pause = {raison, jusqua, limite: true, compte}`. Levée toute seule dès qu'une lecture réussie du compte ne montre plus de fenêtre à 100 % (forfait changé, remise à zéro) ; les limites sont relues toutes les 5 min pendant cette pause.
- **Forfait changé** : si la lecture des limites donne un autre forfait que la découverte en cache, la découverte (modèles, connecteurs) est refaite.
- **Validation par l'utilisateur** : `reglages.validationUtilisateur` (défaut `false`). Coupé, une vérification `user` prévue par le DG devient `agent` (même modèle, au moins une correction possible, un critère « correspond à la demande » en plus) : à la planification, juste avant la vérification, et pour les tâches qui attendaient déjà (au démarrage et quand on coupe le réglage). La directive du DG lui dit alors de ne pas utiliser `user`.

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/api/dossiers/:id/supprimer` | — | `{ok}` : arrête le dossier s'il tourne, puis l'efface complètement (tâches, plan, messages, notifications, demandes, journal et pièces jointes sur le disque). Événement `dossier_supprime` `{dossier}` ; plus aucun événement de ce dossier ensuite. 404 s'il n'existe pas |

- **Tableau blanc** : sans choix, il affiche le plan le plus récent qui concerne l'étage, sans les dossiers annulés. Le choix fait depuis la vue du plan (clic sur le tableau) est gardé par le navigateur (`localStorage` `qg.tableaux` = `{etage: dossier}`).

## Ajouts 1.0.4
- **Code écrit par les agents** : chaque Edit / Write remonte avec son diff exact. Événement `modification` `{tache, modification: {id, fichier, rel, outil, type: "create"|"update", ajouts, suppressions, morceaux: [{ancien, nouveau, lignes: ["+…", "-…", " …"], tronque}], t}}` (400 lignes au plus). La tâche porte `lignes = {ajouts, suppressions, fichiers}`. `GET /api/taches/:id/modifications` → `{modifications}` (60 dernières ; relues dans le journal du dossier après un redémarrage).
- **Navigateur** : `GET /api/navigateur/ouvrir?url=` → `{url, integrable, affiche, chat?, site?}` (vidéos et directs YouTube, Twitch, Kick par leur lecteur officiel ; sinon on lit les en-têtes X-Frame-Options / CSP du site). `POST /api/navigateur/fenetre {url}` : ouvre le site dans une fenêtre application du navigateur par défaut (Chrome, Edge, Brave… avec le profil de l'utilisateur). Navigateur complet (Electron, installé à la demande dans `runtime/navigateur`) : `GET /api/navigateur/app` → `{installee, version, installation}`, `POST /api/navigateur/app/installer`, `POST /api/navigateur/app/ouvrir` ; événement `navigateur_app`. La fenêtre application (`app/main.cjs`) affiche tous les sites dans un `<webview>` (session `persist:qg-navigateur`). Réglage `ouvrirEnApp`.
- **Mini-jeu des personnages** : personnalités dans `config/personnalites.json` (défauts dans `config/defauts/personnalites.json`, clés = prénom, `@dg`, `@joy`), mémoires dans `runtime/memoires.json` (`souvenirs`, `relations` −10…+10, `dialogue`). Routes `POST /api/personnages/discuter {cle, texte}` (réponse par le flux), `/personnalite {cle, texte}`, `/oublier {cle?, souvenir?, relation?, relations?, tout?}`, `/bavarder`. Événements `discussion` `{cle, nom, de: "toi"|"perso"|"reaction"|"erreur", texte, tache, agent}`, `bavardage` `{etage, lignes}`, `mini_jeu` `{reglages, personnalites, memoires}` (aussi dans l'état complet : `miniJeu`). Réglage `miniJeu = {actif, ecoute, bavardages, bavardagesMinutes, modeleDiscussion, modeleBavardage}`. Aucun effet sur les tâches.
- **Garde-fou Fable** : `reglages.gardeFable = {actif, resteMin}`. Quand un plan contient des tâches Fable et qu'il reste moins de `resteMin` % de la semaine Fable, une décision (une par plan) propose « Garder Fable » / « Passer sur Opus » ; sans réponse en 10 min, Opus. Fable épuisé : Opus directement, et une tâche Fable qui tombe sur la limite repart sur Opus sans pause globale. Le DG voit le quota Fable restant dans sa demande de plan.
- **Autorisations** : écriture dans le dossier temporaire du système sans demande ; « Toujours pour {nom} » toujours proposé, retenu pour la même sorte d'action (fichiers, même commande, même site) jusqu'à la fin de la tâche ; réglage `ecritureHorsProjet` (coupé par défaut).
- **Divers** : `reglages.entreeEnvoie` (Entrée envoie dans les champs secondaires) ; prénoms de secours vraiment uniques (« Sacha 2 », « Sacha 3 »…).

## Ajouts 1.0.5
- **Skills** : bibliothèque dans `config/skills/` (plugin local `qg` : `.claude-plugin/plugin.json`, `skills/<id>/SKILL.md` + ses fichiers), réglages dans `config/skills.json` : `{skills: {<id>: {mode: "off"|"dispo"|"toujours", dg, agents, etages: []}}}`. Une session reçoit ses skills « toujours » dans son prompt système (section « Skills chargés pour toi ») et ses skills « disponibles » par l'option SDK `plugins` + le filtre `skills` (`qg:<id>`, plus les skills du projet) : seuls leur nom et leur description sont dans le contexte, le contenu est chargé par l'outil Skill s'il sert.
- **Qui reçoit quoi** : partout (mode + DG / agents + étages), le dossier (`dossier.skills = [{id, pour: "dg"|"tous"|"demande"}]`, `dossier.skillsExclus`), la tâche (champ `skills` de chaque tâche du plan, choisi par le DG parmi les skills attribuables, appliqué d'office à l'agent ; `tache.skills` public).
- **Routes** : `GET /api/skills` → `{skills, claudeCode}` ; `GET /api/skills/:id` → `{id, texte}` ; `POST /api/skills/creer {nom, description, instructions}`, `/:id/modifier {texte}`, `/:id/regler {mode?, dg?, agents?, etages?}`, `/:id/supprimer`, `/importer?nom=` (corps brut : SKILL.md, .md, .skill, .zip), `/importer-claude {chemin}`. `POST /api/dossiers` accepte `skills` et `skillsExclus`. Événement `skills` `{skills}` ; l'état complet porte `skills`.
- **DG** : outil `mcp__qg__creer_skill {nom, description, instructions, activer: "non"|"partout"|"ce_dossier", mode, pour}` ; une demande qui n'était qu'une création de skill finit sans tâche (le dossier passe à `termine`).
- **Navigateur, deux modes** (choix retenu dans le site, `localStorage qg.navigateur.mode`) : *simple* (lecteurs intégrés, autres sites dans une fenêtre du navigateur habituel) et *complet* (tous les sites dans la fenêtre du QG). Dans la fenêtre application : un `<webview>`. Dans un navigateur ordinaire : le moteur du QG (`app/moteur.cjs`, Electron hors écran, session `persist:qg-navigateur` partagée avec la fenêtre application). `GET /api/navigateur/moteur` → `{installee, port?, cle?}` ; `POST /api/navigateur/moteur` le démarre (`--qg-moteur=PORT:CLÉ:PORT_DU_QG`) et rend `{port, cle}`. Le site s'y connecte en WebSocket `ws://127.0.0.1:PORT/flux?cle=…` : images JPEG (trames binaires) et `{t:"etat", url, titre, retour, suivant, charge, onglets, actif}`, `{t:"curseur"}`, `{t:"erreur"}` ; il envoie `taille {l,h,dpr,url?}`, `aller`, `retour`, `suivant`, `recharger`, `stop`, `souris {e, x, y, b, n, dx, dy, m}`, `touche {e, code, texte?, m}`, `texte {s}`, `edition {a}`, `onglet`, `fermerOnglet`, `visible`, `focus`, `fermer`. Le moteur s'arrête avec le QG. Recherche par défaut : Google.
- **Démo** : `POST /api/demo/lancer` (QG réel) ouvre `lancer-demo.bat --port <port+1> --neuve --spectacle` dans une nouvelle fenêtre (ou remet devant la démo déjà ouverte) ; `POST /api/demo/quitter` (démo) l'arrête. `reglages.demo` dit au site qu'il est dans la démo (badge « DÉMO »). La démo a son immeuble (`config/defauts/etages-demo.json` → `dossiers-demo/etages.json`, projets vides dans `dossiers-demo/societe`), ses souvenirs (`dossiers-demo/memoires.json`) et des serveurs du sous-sol simulés ; `--neuve` repart de zéro, `--spectacle` envoie seul les grands scénarios (`serveur/scenarios-demo.js`). `creerDossier` accepte `scenario`.
- **Icône** : `app/icone.ico` (raccourci du bureau, fenêtre application), `web/icone.png` (onglet) ; `outils/fabriquer-icone.ps1` les refait depuis une image. Au lancement, le QG pose l'icône sur le raccourci « QG des agents » du bureau s'il pointe vers son `lancer.bat` (une fois par icône, `runtime/raccourci-icone.txt`).
- **Direction** : plan propre (`carteDirection` dans `web/carte.js`) : accueil, bureau du DG (baies, tableau blanc x 7-10, salon), assistants, salle du conseil, salon-bar, îlot de 4 postes.
- **Joy** : étage choisi au prorata du monde présent (tâches actives ou en attente, le DG pour un tiers), séjour de 15 à 45 s selon le monde ; sur l'étage, il passe voir chacun à tour de rôle, au travail compris, et parfois le DG.

## Ajouts 1.0.6 (plusieurs IA, lot 2)
- **Priorités** (`config/priorites.json`, valeurs par défaut dans `config/defauts/priorites.json`) : `{types: {code|recherche|redaction|image: {natures, ordre}, defaut: {ordre}}, roles: {verif: {ordre}, ambiance: {ordre}}, dg: {compte, modele, effort}, consigneDg, quota: {pause: "compte"|"globale", proposerBascule}, delegation: {images: {actif, accord, limites: {defaut, etages: {<id>: n|null}}, api: {actif, compte, plafondMensuelUsd}}}}`. Une entrée d'`ordre` vise `{compte}` ou `{fournisseur}` (ses comptes dans l'ordre), avec `modele` ou `niveau` facultatif : jamais plus bas que ce que le DG a demandé. Listes vides : le compte de la demande, comme en 1.0.5. Aucune bascule automatique : un compte en pause n'est jamais remplacé sans l'accord de l'utilisateur. Un compte jamais qualifié passe après les comptes qualifiés quand il y a le choix, mais un rôle n'est jamais laissé sans IA quand un compte connecté existe.
- **Routes** : `GET /api/priorites` → `{priorites, prereglages: [{id, libelle}], apercu, pauses, natures, types}` (`apercu` : `{dg, types: {<type>: ligne|null}, verif, ambiance, images|null}`, une ligne étant `{compte, attente, repli}`, plus `moteur` pour les images) ; `POST /api/priorites` prend un morceau de priorités ou `{prereglage: id}` et rend la même chose (400 si le préréglage est inconnu). `POST /api/reprendre {compte?}` : avec `compte`, lève la seule pause de ce compte ; sans, lève tout comme avant. La pause « à reconnecter » d'un compte est levée à sa reconnexion.
- **Champs publics** : `dossier.dg.compte` (compte du DG, choisi parmi les comptes connectés ; le DG ne propose que des comptes et des modèles réellement disponibles) ; `tache.compte` (compte qui fait la tâche), `tache.routage {justification, repli, bascule}` (bascule : compte d'origine quand l'utilisateur a accepté de passer sur un autre), `tache.verif.compte` (compte du vérificateur) ; `comptes[].qualification` pour les agents ACP (`"non-faite"` : pas encore essayé par le QG, badge « pas encore qualifié »). `ordonnanceur.pauses` : `{<compte>: {raison, jusqua, type}}` (pause par compte, mémoire seulement ; `quota.pause: "globale"` garde la pause de tout le QG).
- **Événements** : `priorites` (même corps que `GET /api/priorites`) ; `delegation {tache, moteur: "abonnement"|"api", compte, statut: "en_cours"|"ok"|…, chemin, cout?}` (rattaché au dossier) ; `ordonnanceur` porte `pauses`.
- **Cartes de décision** : bascule D4 quand un compte est en pause et qu'un autre compte libre peut prendre ses tâches (`quota.proposerBascule`) : « Attendre la remise à zéro (ou la reconnexion) » ou « Passer ces tâches sur {compte} », avec l'avertissement sur les conditions d'utilisation (limite de quota) et la perte du contexte de la réserve ; une carte par dossier et par compte, jamais de bascule sans réponse. Délégation d'images : « Autoriser » / « Refuser » pour chaque image (`accord`), au-delà de la limite par demande, et pour l'API Images au-delà du plafond mensuel (ou sans plafond).
- **Outil des agents** `mcp__qg__generer_image {description, chemin, taille?, qualite?, fondTransparent?, references?}` : proposé seulement si `delegation.images.actif` (coupée par défaut) et à un profil qui écrit, quel que soit le fournisseur de l'agent. Moteur abonnement (sous-session Codex en lecture seule) ou API Images (compte Codex à clé API, facturé, coût d'après `config/defauts/tarifs.json`). Journal `runtime/delegations.jsonl`, image montrée dans le fil, conso au rôle `delegation`.
- **Questions et ambiance** : une question d'agent passe par le compte de sa tâche (repli sans fork de session pour Codex et ACP) ; Joy et le mini-jeu tournent sur le compte choisi par `roles.ambiance`, sur n'importe quelle IA.
