# 04 — Le réglage **Coût** (Économe / Équilibré / Max)

> Objectif : **le meilleur résultat au juste coût**, réglable par l'utilisateur.
>
> **Livré dans la 1.0.6.** Les valeurs du §2 et du §5 sont celles du fichier livré (`config/defauts/profils-travail.json`). Ce qui diffère de la conception est au §7.
>
> **Contrainte de l'utilisateur, non négociable : le réglage ne baisse jamais le modèle ni l'effort que le DG choisit pour les tâches de production.** On joue sur tout le reste :
> - la longueur des sessions ;
> - le découpage ;
> - la vérification ;
> - le périmètre ;
> - les gestes des agents.
>
> **Décision du 26/10/2026 : pas de réglage « Rapidité ».** Le parallélisme reste réglé comme aujourd'hui (Réglages › Général, `plafondGlobal` et `plafondEtage`). Une tâche qui dépend d'une autre **attend toujours** que celle-ci soit vérifiée : un agent ne doit jamais partir d'un résultat qui n'a pas passé sa vérification. Pas de fast mode, pas de délai imposé aux questions des agents.

## 1. Principes

1. **Les gains gratuits sont actifs partout.** Ce qui économise sans rien coûter en qualité ne dépend pas du réglage (lot A de `05`) :
   - la compaction (au niveau Max par défaut) ;
   - la reprise du vérificateur ;
   - les gestes regroupés ;
   - la lecture ciblée ;
   - la réserve à chaud ;
   - la passation par livrable.
2. **Le niveau Max reprend le comportement actuel, plus les gains gratuits.** Personne ne perd ce qu'il a aujourd'hui.
3. **Défaut : Équilibré.**
4. **Réglage global, modifiable par demande.** On règle le défaut dans Réglages › Général. Une pastille dans la barre d'envoi permet de le changer pour une demande, à côté du choix du modèle et de l'effort du DG qui existe déjà.
5. **Le DG connaît le niveau actif**, avec un bloc `PROFIL DE TRAVAIL` dans son message. Il planifie en conséquence. **Le serveur fait respecter les règles dures** (nombre de tâches, politique de vérification), comme `validerTaches` le fait déjà pour d'autres règles.
6. **Les valeurs vivent dans un fichier, pas dans le code** : `config/defauts/profils-travail.json`. On peut les ajuster sans toucher au code, et un utilisateur avancé peut surcharger un bouton (« Personnaliser »).
7. **Tout est mesurable.** Chaque dossier enregistre son niveau, son coût estimé et son coût réel (`06-mesure.md`).

## 2. Les boutons de chaque niveau

| Bouton | Économe | Équilibré (défaut) | Max |
|---|---|---|---|
| **Compaction des agents** (`CLAUDE_CODE_AUTO_COMPACT_WINDOW`) | 150 k | 200 k | 400 k |
| **Compaction des vérificateurs** | 120 k | 150 k | 300 k |
| **Compaction du DG** | 300 k | 300 k | 300 k |
| **Nombre de tâches max** (`maxTaches`) | 4 | 8 | 12 |
| **Découpage** | une tâche par chantier ; analyse et réalisation du même code **toujours** dans la même tâche ; pas de tâche de revue ni de synthèse sans demande | analyse et réalisation du même code dans la même tâche ; on ne sépare que le travail vraiment parallèle et indépendant | règles actuelles (production / vérification et mesure / dépendant séparées) |
| **Mode « agent direct »** (le DG confie la demande telle quelle à un seul agent) | dès que la demande touche un seul projet | pour une petite demande (un projet, un changement localisé) | jamais (toujours un plan) |
| **Vérification par défaut** | `self` avec des commandes concrètes (tests, build) ; `agent` seulement si `risque: high` ou relecture demandée | `agent` si le code modifié est partagé ou critique (`risque` ≥ medium), sinon `self` | `agent` pour toute tâche qui modifie du code (actuel) |
| **Vérificateur : niveau et tours** | niveau `standard` (Sonnet), effort `low`, 12 tours | modèle choisi par le DG, 20 tours | choisi par le DG, 40 tours (actuel) |
| **Reworks max** | 1 | 1 | 2 |
| **Périmètre** | strict : seulement ce qui est demandé ; une question (« est-ce possible ? ») donne une étude, puis une question à l'utilisateur avant d'implémenter ; aucun à-côté (README, captures, revue) | strict sur les à-côtés ; les compléments évidents du changement restent permis (ses tests, sa doc courte) | le DG peut proposer des améliorations, en tâches « bonus » soumises à approbation |
| **Sous-agent d'exploration léger** (outil `Agent`) | encouragé : toute recherche large dans le code passe par lui | permis | permis |
| **Estimation avant lancement** | affichée ; **demande ton accord** si le plan dépasse 25 % de ce qui reste dans ta fenêtre de 5 h | affichée ; accord si > 60 % | affichée seulement |
| **Plafond par tâche** (`maxBudgetUsd`) | ≈ 3 × l'estimation de la tâche ; au-delà, la tâche s'arrête et le DG décide | ≈ 5 × l'estimation | aucun |
| **Ambiance** (bavardages du mini-jeu, Joy) | coupée | selon les réglages du mini-jeu | selon les réglages du mini-jeu |

### Ce qui ne bouge jamais, quel que soit le niveau
- Le **modèle** et l'**effort** des tâches de production : choix du DG, selon la grille actuelle.
- Le modèle et l'effort du **DG** (Réglages › Général, ou choix par demande).
- **L'ordre des tâches** : une tâche qui a besoin du résultat d'une autre attend qu'il soit **terminé et vérifié**.
- Le parallélisme : le réglage actuel.
- Les règles de sécurité, les profils de permissions, l'approbation des actions à risque.

> **Option non retenue par défaut** (elle touche au modèle) : « Fable pour le *difficile*, pas pour le *long* ». Dans D4, la grille actuelle a mis la session la plus longue sur le modèle le plus cher : 59 % du dossier. On pourrait l'activer à part (`grilleFableDifficulte: true`), mais ce n'est **pas** dans les niveaux, et ce n'est **pas implémenté** dans la 1.0.6.

## 3. Effet attendu (ordre de grandeur, **pas encore mesuré**)

Estimation faite avant la livraison, pour un dossier comme D4, par rapport à la **1.0.5**, avec la même demande, les mêmes modèles et les mêmes efforts. **Aucun de ces chiffres n'a été vérifié** : les essais réels de `06-mesure.md` ne sont pas faits.


| Niveau | Tokens relus | Coût total | D'où vient le gain |
|---|---|---|---|
| Max | −15 à −25 % | −10 à −20 % | gains gratuits : compaction à 400 k, reprise du vérificateur, gestes regroupés |
| Équilibré | −40 à −55 % | −30 à −45 % | + compaction à 200 k, analyse et réalisation fusionnées, vérification proportionnée |
| Économe | −55 à −70 % | −50 à −65 % | + compaction à 150 k, 4 tâches max, `self` par défaut, périmètre strict, agent direct |

Pour une **petite demande** (un projet, un changement) en Économe ou Équilibré, le mode agent direct doit ramener le coût **près de celui d'une conversation unique** : le DG (≈ 0,5–1 $ en équivalent API) plus un seul agent, sans vérificateur séparé.

**Le temps baisse aussi, sans réglage dédié**, grâce à :
- des sessions plus courtes ;
- une chaîne plus courte (analyse et réalisation dans la même tâche, plus d'aller-retour analyse → réalisation) ;
- moins de reworks à re-vérifier ;
- l'agent direct pour les petites demandes, qui supprime la vérification séparée.

## 4. Interface

**Réglages › Général › « Coût »** : trois boutons, chacun avec une phrase.
- Économe : « le minimum qui donne un bon résultat ».
- Équilibré : « le juste coût » (défaut).
- Max : « qualité d'abord, sans regarder la dépense ».

**« Personnaliser »** (repliable) : la liste des boutons du §2 avec leur valeur actuelle. Chacun peut être surchargé, et un bouton « revenir au niveau » le remet à la valeur du niveau.

**Barre d'envoi** : une pastille (« Équilibré », ou 💰 quand la barre est étroite) qui ouvre un petit menu, comme le choix du modèle et de l'effort du DG. Le choix vaut pour cette demande, revient au niveau des Réglages après l'envoi, et s'affiche sur la fiche du dossier (« Coût : niveau »).

**Plan du DG** : la carte du plan affiche le coût estimé, en $ équivalent API (en jetons pour Codex) et en **% de ta fenêtre de 5 h**, par exemple « ≈ 12 $ · ≈ 15 % de ta fenêtre de 5 h (il en reste 60 %) ». Le % n'apparaît que si les limites du compte sont lisibles ; sinon « non estimable pour ce compte ». En Économe et en Équilibré, au-delà du seuil, la carte demande « Lancer / Réduire / Annuler ». « Réduire » renvoie au DG la consigne de tenir dans le seuil **sans baisser les modèles ni les efforts** ; le plan est réestimé et la carte revient si besoin. Sans estimation, sans limites ou sans seuil, rien ne bloque.

**Fiche de la tâche** : Estimation, Mesures (contexte en direct, compactions), ajustement de la vérification (par exemple « vérification : self (profil Économe) ») et état des contrôles du projet.

**⚡ Consommation** : par dossier, « profil · estimé · réel · écart », les mesures par tâche, et le rapport appris entre $ (ou jetons) et % de la fenêtre pour chaque compte.

## 5. Données

`config/defauts/profils-travail.json` (livré) :

```json
{
  "version": 1,
  "cout": {
    "econome":   { "compactionAgents": 150000, "compactionVerif": 120000, "compactionDg": 300000, "maxTaches": 4,  "decoupage": "chantier",  "agentDirect": "projet-unique", "verifDefaut": "self",   "verifNiveau": "standard", "verifEffort": "low", "verifMaxTurns": 12, "maxRework": 1, "perimetre": "strict",      "exploration": "encouragee", "seuilAccordFenetre": 25,   "plafondTacheFacteur": 3,    "ambiance": false },
    "equilibre": { "compactionAgents": 200000, "compactionVerif": 150000, "compactionDg": 300000, "maxTaches": 8,  "decoupage": "parallele", "agentDirect": "petite",        "verifDefaut": "risque", "verifNiveau": null,       "verifEffort": null,  "verifMaxTurns": 20, "maxRework": 1, "perimetre": "complements", "exploration": "permise",    "seuilAccordFenetre": 60,   "plafondTacheFacteur": 5,    "ambiance": null },
    "max":       { "compactionAgents": 400000, "compactionVerif": 300000, "compactionDg": 300000, "maxTaches": 12, "decoupage": "actuel",    "agentDirect": "jamais",        "verifDefaut": "code",   "verifNiveau": null,       "verifEffort": null,  "verifMaxTurns": 40, "maxRework": 2, "perimetre": "bonus",       "exploration": "permise",    "seuilAccordFenetre": null, "plafondTacheFacteur": null, "ambiance": null }
  }
}
```

`null` veut dire « garder la valeur actuelle ou le choix du DG ».

`config/reglages.json` (utilisateur) :

```json
"travail": { "cout": "equilibre", "personnalise": {} }
```

Pour un dossier : `dossier.travail = { cout }`, choisi à l'envoi, et figé dans `state.json` pour la mesure.

Module `serveur/travail.js` :
- `profilEffectif(dossier, reglages)` prend le niveau du dossier, sinon celui des Réglages ; la personnalisation des Réglages ne s'applique qu'au niveau choisi dans les Réglages ; les valeurs inconnues sont filtrées ; un réglage absent ou abîmé donne Équilibré ;
- `blocDirective(profil)` produit le texte `PROFIL DE TRAVAIL` pour le DG ;
- `verificationProfil(tache, profil)` applique la politique de vérification ; `optionsExploration()` ajoute le sous-agent d'exploration.

L'estimation est dans `serveur/estimation.js` (`estimerDossier`, `estimerTache`, `estimerDg`), avec la table de départ `config/defauts/estimations.json` (`05-specification.md`, C1).

## 6. Le bloc `PROFIL DE TRAVAIL` donné au DG (exemple : Équilibré)

```
PROFIL DE TRAVAIL (choisi par l'utilisateur pour cette demande) : Coût = Équilibré.
- But : le meilleur résultat au juste coût. Chaque tâche, vérificateur ou agent en plus doit apporter un gain réel.
- 8 tâches au plus. L'analyse et la réalisation d'un même code vont dans la même tâche : l'agent qui explore garde son contexte pour implémenter. Ne sépare que le travail vraiment parallèle et indépendant (projets différents, sources de bench différentes).
- Petite demande (un projet, un changement localisé) : rends une seule tâche en mode "direct" (la demande de l'utilisateur, plus le contexte utile), sans vérificateur séparé.
- Vérification : "agent" si la tâche modifie du code partagé ou critique (risque medium ou high) ; sinon "self" avec des commandes concrètes.
- Périmètre : fais ce qui est demandé. Les compléments évidents du changement (ses tests, sa doc courte) sont permis ; pas de revue d'ensemble, de README ou de captures en plus sans demande. Une question (« est-ce possible ? ») appelle une étude, puis une question à l'utilisateur avant toute implémentation.
- Passation : une tâche dont le résultat sert à d'autres l'écrit en entier dans un fichier livrable ; ses notes de passation disent où le trouver et quoi y regarder.
- Modèle et effort : ta grille habituelle, inchangée.
```

Le bloc réel est écrit par `blocDirective()` (`serveur/travail.js`), en français ou en anglais selon la langue des IA. Il est placé juste après la demande dans le message du DG ; à chaque réveil, le DG reçoit un rappel court (`rappelProfil()`), dans le message et non dans la directive système, pour garder stable le préfixe en cache.

## 7. Ce qui diffère de la conception dans la 1.0.6

- **Relecture demandée** : elle garde le vérificateur **aussi en Équilibré**, pas seulement en Économe. Une approbation, un risque élevé, ou une validation « par toi » convertie en vérification par IA le gardent aussi, à tous les niveaux.
- **Vérificateur en Économe** : Sonnet, effort `low`, 12 tours ; jamais remonté si le DG a choisi Haiku.
- **Pastille de la barre d'envoi** : affichée seulement pour un **nouveau** dossier. Quand on ajoute une demande à un dossier existant, son niveau est déjà figé.
- **Changer de niveau dans les Réglages** garde la personnalisation enregistrée ; elle s'applique alors au nouveau niveau.
- **« Personnaliser »** n'est pas disponible dans la maquette (`?mock`).
- **Démo** : le DG simulé garde les premières tâches dans la limite `maxTaches` du niveau (sinon un dossier Économe de démo échouait).
- **Codex** : la compaction et le plafond par tâche sont **sans effet** (l'écran le dit) ; l'estimation est en jetons, sans % de la fenêtre tant que le rapport n'est pas appris.
- **Pas de réestimation** après un passage sur Opus ou une relance de tâche.
- **`grilleFableDifficulte`** n'est pas implémenté.
- Les gains du §3 **ne sont pas mesurés**.
