# QG des agents

**Un immeuble d'agents Claude qui travaillent pour toi, en pixel art.**
Tu écris une demande au DG (le directeur) ; il la découpe en tâches, choisit pour chacune le bon modèle (Opus, Sonnet, Haiku, Fable) et le bon niveau de réflexion, puis des agents travaillent en parallèle, un étage par projet. Tu les regardes réfléchir, tu réponds à leurs questions, tu valides ce qui doit l'être.

*English below.*

---

## Ce qu'il faut
- **Windows 10 ou 11, 64 bits.**
- **Un abonnement Claude** (Pro, Max, Team ou Enterprise) — ou une clé API Anthropic.
- Une connexion Internet. L'installation télécharge ce qu'il faut (≈ 250 Mo), tout reste dans le dossier du QG.
- Conseillé : **Git pour Windows** (l'installation propose de l'installer). Les agents s'en servent pour lancer des commandes.
- Facultatif : une **carte NVIDIA** pour la dictée locale rapide.

## Installer
1. Télécharge `QG-des-agents-<version>.zip` dans **[Releases](../../releases)**.
2. Avant d'extraire : clic droit sur le zip › **Propriétés** › coche **Débloquer** › OK (sinon Windows peut bloquer les fichiers .bat venus d'Internet).
3. Extrais-le dans un dossier simple, par exemple `C:\QG-des-agents` (évite OneDrive et les chemins très longs).
4. Double-clic sur **`installer.bat`**. Il installe Node.js en version portable (dans `runtime\node`), Claude Code (l'outil officiel d'Anthropic, via le SDK) et vérifie Git. Chaque téléchargement est vérifié par son empreinte SHA-256.
5. Le QG s'ouvre dans ton navigateur et une **configuration guidée** t'accompagne :
   - langue de l'interface et langue des IA ;
   - connexion à ton compte Claude (une petite fenêtre puis ton navigateur : le QG ne voit jamais ton mot de passe ni ton jeton) ;
   - choix de tes dossiers de projets (ex. `D:\Dev`, `D:\IA`) : chaque projet trouvé peut devenir un étage ;
   - mode de travail des agents ;
   - dictée et notifications.

Ensuite, pour lancer le QG : **`lancer.bat`** (ou le raccourci du bureau). Laisse sa fenêtre ouverte : la fermer arrête le QG.

## Au quotidien
- **Écrire une demande** : en bas de l'écran, Entrée pour envoyer. Joins des captures (📎, Ctrl+V ou glisser-déposer), dicte avec 🎤 (Alt+M). Choisis le compte qui travaille (menu déroulant) et, si tu veux, le modèle et l'effort du DG pour cette demande.
- **Se déplacer** : ◀ ▶ ou Page précédente / suivante ; la colonne de gauche montre tout l'immeuble.
- **Suivre un agent** : clique sur lui pour sa fiche, sa réflexion en direct et son terminal.
- **Répondre** : la cloche 🔔 liste ce qui t'attend (autorisations, questions à choix, validations, nouveaux projets).
- **Choisir où va ton message** : le menu à côté d'« Envoyer » propose « Nouveau dossier », « Ajouter au dossier D3 » ou « Répondre au DG ». Un ajout est transmis aux agents, même s'ils travaillent déjà.
- **Parler à un agent sans le couper** : dans sa fiche, « Demander où il en est » (une copie de sa conversation te répond, son travail continue) ou « Nouvelle consigne » (elle lui arrive en direct).
- **Salle de pause et salle de repos** : les agents qui attendent leur tour jouent en salle de pause (billard, baby-foot, télé) ; ceux qui ont fini dorment en salle de repos, prêts à être réembauchés avec tout leur contexte.
- **📄 Documents** : les fichiers `.md` produits par les agents, mis en forme (titres, gras, tableaux…), du plus récent au plus ancien. Les fichiers cités dans les messages s'ouvrent d'un clic.
- **⚡ Consommation** : tokens du jour, limites de ton forfait (fenêtre de 5 h, semaine, par modèle), détail par compte, modèle, étage et dossier, et les tokens économisés grâce au cache.
- **Arrêt d'urgence** : coupe tout, tout de suite.
- **Panneau de droite** : élargis-le en tirant son bord gauche ; agrandis la zone de saisie en tirant son bord haut ; A− / A+ pour la taille du texte.

## Réglages (⚙, en haut à droite)
Tout se règle dans le site, sans toucher aux fichiers :
- **Général** : langues, ton prénom, mode de travail (autonome ou prudent), modèle et effort du DG par défaut, parallélisme.
- **Comptes Claude** : autant de comptes que tu veux (perso, pro…), renommables ; connexion, déconnexion, compte par défaut. Aussi possible avec `ajouter-un-compte.bat`.
- **Dossiers et étages** : tes dossiers racines, les projets détectés, les étages (renommer, activer, fiche du projet pour le DG).
- **Connecteurs MCP** : les connecteurs de ton compte claude.ai (Notion, Drive…) et les MCP de tes projets, coupés par défaut ; « Sur demande » ou « Auto » un par un.
- **Équipe et skins** : tous les personnages en image ; nom (modifiable en direct, même au travail) et apparence de chacun, du DG et de Joy ; ajout et retrait de personnages.
- **Git** (dans Général) : laisser les agents faire pull, commit, merge et push sans demander, si tu le souhaites.
- **Happiness manager** : les blagues et anecdotes que Joy raconte aux agents qui attendent ; export et import en **Excel**, CSV ou JSON, édition directe.
- **Dictée et notifications** : installation de la dictée locale (Whisper, gratuite, sur ton PC).

## Sécurité et confidentialité
- Le QG tourne **sur ton PC uniquement** (`127.0.0.1`), protégé par un jeton local. Aucune télémétrie, rien n'est envoyé ailleurs qu'à Claude.
- Les agents utilisent **Claude Code**, avec ta connexion. En mode autonome (recommandé), ils lisent partout et écrivent librement **dans tes dossiers racines** ; écrire ailleurs leur demande ton accord.
- **Toujours interdit** sans toi : `git push`, publication (npm, Rojo), arrêt du PC, registre Windows, modification du QG lui-même, lecture de tes identifiants Claude.
- Tes réglages (`config\*.json`), l'historique (`dossiers\`) et les données de travail (`runtime\`) restent sur ton PC et ne sont jamais publiés.
- Le QG pilote Claude Code avec **ton propre compte** : respecte les conditions d'utilisation d'Anthropic. Pour un usage intensif ou partagé, une clé API (facturée au token) est l'option prévue par Anthropic.

## Mettre à jour, désinstaller
- **Mettre à jour** : ferme le QG, puis double-clic sur `mettre-a-jour.bat` (télécharge la dernière version, vérifie son empreinte, garde tes réglages).
- **Désinstaller** : supprime le dossier du QG. Les connexions des comptes sont dans `%USERPROFILE%\.claude-qg` (supprime-le aussi si tu veux).

## Dépannage
- **« Windows a protégé votre ordinateur »** : clique « Informations complémentaires » › « Exécuter quand même », ou débloque le zip avant d'extraire (voir Installer).
- **Le site ne s'ouvre pas** : ouvre le lien affiché dans la fenêtre du QG. Si le port 4747 est pris, change `"port"` dans `config\reglages.json`.
- **Un compte « non connecté »** : Réglages › Comptes › Se connecter.
- **Les agents ne lancent aucune commande** : installe Git pour Windows (https://git-scm.com/download/win) puis relance le QG.
- **Essayer sans rien consommer** : `lancer-demo.bat` lance une simulation complète, sans aucune session Claude.

## Pour les curieux
| Dossier | Contenu |
|---|---|
| `serveur/` | serveur Node.js (ordonnanceur, DG, sessions Claude Code via le SDK Agent) |
| `web/` | le site (canvas isométrique, aucun framework) |
| `config/defauts/` | réglages par défaut, consignes du DG et des agents, profils de permissions |
| `config/` | tes réglages (créés au premier lancement) |
| `docs/protocole.md` | contrat entre le serveur et le site |
| `outils/` | installation, mise à jour, préparation des versions |

---

## English

**Agents' HQ: an office building of Claude agents working for you, in pixel art.** You write a request to the CEO; it splits it into tasks, picks the right model and effort for each, and agents work in parallel, one floor per project. You watch them think, answer their questions and approve what needs approval.

**Requirements**: Windows 10/11 64-bit, a Claude subscription (Pro, Max, Team or Enterprise) or an Anthropic API key, Internet. Git for Windows recommended.

**Install**: download the zip from Releases, right-click › Properties › *Unblock*, extract to a simple folder (e.g. `C:\QG-des-agents`), double-click `installer.bat`. The HQ opens in your browser with a guided setup (switch the interface language to English in the first step, or with the 🌐 menu at the top left). Afterwards, start it with `lancer.bat`.

Everything is configured in the app (⚙ Settings): accounts, project folders and floors, MCP connectors, agent names and skins, the happiness manager's jokes (Excel import/export), dictation. Runs locally only (`127.0.0.1`), no telemetry. The agents run Claude Code with your own account: follow Anthropic's terms of use.

## Licence
[PolyForm Noncommercial 1.0.0](LICENSE) : gratuit pour un usage personnel, associatif, éducatif ou de recherche, modifications comprises. **Pas d'usage commercial** (vente, revente, service payant, usage en entreprise) sans l'accord de l'auteur.

*English: free for personal and other noncommercial use, including changes; no commercial use without the author's permission. See [LICENSE](LICENSE).*
