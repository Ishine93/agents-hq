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

### Ajouts v1.5 (prénoms, pensées en direct, recherche visuelle, happiness manager)
- **Prénoms** : `Tache.prenom` (attribué dès le plan, ex. « Léa ») et `Agent.prenom`. Un agent réembauché garde le sien ; un clone s'appelle « Léa bis ». Les refs T1, T2… restent pour le plan.
- **Pensées en direct**, événement `pensee` :
  ```json
  {"cible":"D3-T2"|"dg","dossier":"D3","phase":"reflexion|redaction|rapport|outil","outil":"WebSearch"|null,
   "extrait":"…derniers 280 caractères de la réflexion résumée (phase reflexion seulement)…","taille":3400,"verificateur":true?,"t":…}
  ```
  Au plus une par seconde et par cible. `redaction` = l'agent écrit sa réponse ; `rapport` = il rédige sa sortie structurée ; `taille` = caractères écrits jusqu'ici. `etat.pensees` donne la dernière pensée de chaque cible (moins de 2 minutes).
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
- **Réglages** : `etat.reglages` = `{langueInterface, langueIA, utilisateur, racines, racinesValides, modeTravail: "auto"|"prudent", onboarding, plafondGlobal, plafondEtage, recolteAuto, rojoPortsAuto, dg: {modele, effort}, qg, version, claudeCodeLocal}`. Événement `reglages` `{reglages}` à chaque changement. `onboarding: false` → le site ouvre la configuration guidée.
- **Comptes** : `Compte` gagne `abonnement`, `email`, `dossier`, `partage` (connexion partagée avec Claude Code installé sur le PC). Événement `comptes` `{comptes, compteDefaut}`.
- **Personnalisation** : `etat.personnalisation` = `{prenoms: [...], skins: {"Léa": {peau, cheveux, coiffure, pantalon, lunettes}, "@dg": {..., chemise}, "@joy": {...}}}` ; événement `personnalisation`.
- **Consommation** : `etat.conso` = `{jour, aujourdhui: {total, comptes, modeles, etages, roles}, semaine: [{jour, ...}], mois, dossiers: {D3: agg}, limites: {claude1: {maj, abonnement, fenetres: {five_hour: {utilisation, reinit}, seven_day, seven_day_opus, …}}}, reemplois: {nombre, contexte}}` avec `agg = {entree, sortie, cacheLu, cacheEcrit, cout, appels}` (coût = équivalent API en dollars). Événement `conso` (au plus 1 par seconde).
- **Résultat de tâche** : `Tache.resultat` gagne `notes`, `fichiers` (chemins modifiés) et `artefacts` (`[{chemin, nature}]`).

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| GET | `/api/reglages` | — | `{reglages, comptes, compteDefaut, etages, personnalisation, typesProjet}` |
| POST | `/api/reglages` | champs à changer (voir `reglages`) | `reglages` |
| POST | `/api/racines` | `{racines: [chemin]}` | `{racines, projets}` |
| POST | `/api/choisir-dossier` | `{titre}` | `{chemin}` (fenêtre Windows de choix de dossier) |
| GET | `/api/projets` | — | `{projets: [{dossier, nom, type, etage, ignore}], racines}` |
| POST | `/api/etages/ajouter` | `{dossier, nom?}` | Etage |
| POST | `/api/etages/ajouter-lot` | `{projets: [{dossier, nom}]}` | `{faits, erreurs}` |
| POST | `/api/etages/:id/modifier` | `{nom?, actif?, fiche?}` | `{etage, etages}` |
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
| POST | `/api/dictee/installer` | — | ouvre l'installation de la dictée |
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
