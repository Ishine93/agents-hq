// Fenêtre « Réglages » : tout se règle ici, sans toucher aux fichiers.
// Général (langues, prénom, mode de travail, coût, parallélisme), comptes IA, priorités (DG, consignes, comptes par tâche), dossiers et étages, connecteurs MCP,
// équipe (prénoms, skins), happiness manager (édition, import, export), dictée et notifications.
import { h, ouvrirModale, api } from './modale.js';
import { t, LANGUES_INTERFACE, LANGUES_IA, locale, langueCourante } from './i18n.js';
import { skinsDe, familleDe } from './plans/index.js';
import { rendreMcp } from './reglages.js';
import { apparence, spriteAvatar, modele, PALETTE_PEAUX, PALETTE_CHEVEUX, PALETTE_PANTALONS } from './sprites.js';
import { TERMINAUX, libelleEtat, libelleDossier } from './etat.js';
import { md } from './markdown.js';
import { sectionSkills } from './skills.js';
import { sectionPriorites, badgeQualification } from './priorites.js';
import { script as scriptPlateforme, infos as infosPlateforme, dicteeSysteme } from './plateforme.js';
import { NIVEAUX, COUTS, PERSONNALISE, NIVEAU_DEFAUT, nomNiveau, nomTravail, phraseNiveau, travailDe, sansCapacite, CAPACITES_COUT, boutonsCout, texteValeur } from './cout.js';
import { bulle, ligneI, titreI, choixAide, valeurAide, exempleAide } from './aide.js';
import { ouvrirRapport } from './rapport.js';
import { blocGraphismes } from './graphismes.js';

const SECTIONS = [
  ['general', 'Général'],
  ['comptes', 'Comptes IA'],
  ['priorites', 'Priorités'],
  ['dossiers', 'Dossiers et étages'],
  ['archives', 'Dossiers archivés'],
  ['mcp', 'Connecteurs MCP'],
  ['equipe', 'Équipe et skins'],
  ['skills', 'Skills'],
  ['bonheur', 'Happiness manager'],
  ['dictee', 'Dictée et notifications'],
  ['apropos', 'À propos'],
];
export const TYPES_PROJET = {
  roblox: 'Jeu Roblox', unreal: 'Unreal', unity: 'Unity', godot: 'Godot', comfyui: 'ComfyUI', web: 'Web / Node', python: 'Python',
  projet: 'Projet', direction: 'Direction', bac: 'Bac à sable', hall: 'Hall', serveur: 'Serveurs', atelier3d: 'Atelier 3D', etudes: 'Études',
};
// Types qu'on peut choisir pour un nouvel étage (TYPES de serveur/detection.js).
const TYPES_CHOIX = ['projet', 'web', 'python', 'roblox', 'unreal', 'unity', 'godot', 'comfyui'];
// Décors au choix d'un étage de projet (1.0.9) ; vide = celui de son type.
const DECORS = { etudes: 'Bureau d’études', atelier3d: 'Atelier 3D', unreal: 'Studio de rendu', roblox: 'Blocs Roblox', bac: 'Chantier' };
const COIFFURES = 6;
export const DEPOT_GITHUB = 'https://github.com/Ishine93/agents-hq';
// Liens entre personnages (mini-jeu) : de quoi suivre les histoires d’un coup d’œil.
const LIEN_ICONES = { amitié: '🤝', complicité: '😉', attirance: '💘', couple: '💕', rivalité: '⚔️', conflit: '💢', brouille: '🙅', méfiance: '🤨' };

const champ = (attrs) => h('input', { class: 'champ', ...attrs });
const ligne = (lib, ...contenu) => h('div', { class: 'param-ligne' }, h('label', { class: 'param-lib' }, lib), h('div', { class: 'param-val' }, ...contenu));

export class Parametres {
  constructor(store, ui) {
    this.store = store;
    this.ui = ui;
    this.m = null;
    this.section = 'general';
    this.projets = null;
    this.stock = null;
    this.ongletBonheur = 'blagues';
    this.pageBonheur = 0;
    this.filtreBonheur = '';
    this.modifsBonheur = false;
    this.skinOuvert = null;
    this.enregistrerSkins = null;
    this.listeArchives = null; // Réglages › Dossiers archivés : lue à chaque visite de la section
  }

  get ouvert() {
    return !!this.m;
  }

  // focus : personnage à ouvrir dans la section Équipe ('@dg', '@joy' ou un prénom).
  ouvrir(section = null, focus = null) {
    if (section) this.section = section;
    if (this.section === 'archives') this.listeArchives = null;
    if (focus) {
      this.skinOuvert = focus;
      this.defiler = true;
    }
    if (!this.m) {
      this.m = ouvrirModale({
        titre: t('Réglages'),
        classe: 'parametres',
        surFermer: () => {
          this.m = null;
          this.stock = null;
        },
      });
      this.nav = h('nav', { class: 'param-nav' });
      this.contenu = h('div', { class: 'param-contenu' });
      this.m.corps.append(this.nav, this.contenu);
    }
    this.rendre();
  }

  aller(section) {
    if (this.section === 'bonheur' && this.modifsBonheur && !window.confirm(t('Des modifications des blagues ne sont pas enregistrées. Les abandonner ?'))) return;
    this.modifsBonheur = false;
    this.section = section;
    if (section === 'archives') this.listeArchives = null;
    this.rendre();
  }

  // Appelé à chaque événement utile du serveur : on ne redessine pas sous les doigts de quelqu'un qui tape.
  maj() {
    if (!this.m) return;
    const actif = document.activeElement;
    if (actif && this.m.boite.contains(actif) && /^(INPUT|TEXTAREA|SELECT)$/.test(actif.tagName)) {
      this.enRetard = true;
      return;
    }
    if (this.section === 'bonheur' || this.section === 'equipe' || this.section === 'skills') return; // éditeurs locaux : pas de redessin automatique
    this.rendre();
  }

  rendre() {
    if (!this.m) return;
    this.enRetard = false;
    this.m.titre(t('Réglages'));
    this.nav.replaceChildren(...SECTIONS.map(([id, lib]) => h('button', { type: 'button', class: id === this.section ? 'actif' : '', on: { click: () => this.aller(id) } }, t(lib))));
    const haut = this.contenu.scrollTop;
    const fn = { general: this.general, comptes: this.comptes, priorites: this.priorites, dossiers: this.dossiers, archives: this.dossiersArchives, mcp: this.mcp, equipe: this.equipe, skills: this.skills, bonheur: this.bonheur, dictee: this.dictee, apropos: this.apropos }[this.section];
    this.contenu.replaceChildren(h('h3', {}, t(SECTIONS.find((s) => s[0] === this.section)[1])), ...[].concat(fn.call(this)).filter(Boolean));
    this.contenu.scrollTop = haut;
    if (this.defiler) {
      this.defiler = false;
      this.contenu.querySelector('.param-skin.ouvert')?.scrollIntoView({ block: 'center' });
    }
  }

  async poster(route, corps, ok = null) {
    try {
      const r = await api(route, corps);
      if (ok) this.ui.toast('info', ok);
      return r;
    } catch (e) {
      this.ui.toast('erreur', e.message);
      return null;
    }
  }

  async reglage(patch, ok = null) {
    const r = await this.poster('/api/reglages', patch, ok);
    if (r) this.store.reglages = { ...this.store.reglages, ...r };
    return r;
  }

  // ---------------------------------------------------------------- général
  general() {
    const R = this.store.reglages;
    const S = this.store;
    const selLangue = h('select', { class: 'champ', on: { change: async (e) => { await this.reglage({ langueInterface: e.target.value }); this.ui.changerLangue(e.target.value); } } },
      LANGUES_INTERFACE.map((l) => h('option', { value: l.id, selected: l.id === R.langueInterface ? true : null }, l.nom)));
    const selIA = h('select', { class: 'champ', on: { change: (e) => this.reglage({ langueIA: e.target.value }, t('Les agents travailleront désormais dans cette langue.')) } },
      LANGUES_IA.map((l) => h('option', { value: l.id, selected: l.id === R.langueIA ? true : null }, l.nom)));
    const prenom = champ({ value: R.utilisateur || '', maxlength: '40', placeholder: t('ex. Camille') });
    prenom.addEventListener('change', () => this.reglage({ utilisateur: prenom.value }, t('Prénom enregistré.')));
    const mode = (id, titre, texte) => h('label', { class: 'param-choix' + (R.modeTravail === id ? ' choisi' : '') },
      h('input', { type: 'radio', name: 'mode-travail', value: id, checked: R.modeTravail === id, on: { change: () => this.reglage({ modeTravail: id }).then(() => this.rendre()) } }),
      h('span', {}, h('b', {}, titre), h('br'), h('small', {}, texte)));
    const plafond = (cle) => {
      const c = champ({ type: 'number', min: '0', max: '64', value: String(R[cle] ?? 0), style: { width: '80px' } });
      c.addEventListener('change', () => this.reglage({ [cle]: Math.max(0, Math.min(64, parseInt(c.value, 10) || 0)) }, t('Enregistré.')));
      return c;
    };
    const rojo = h('input', { type: 'checkbox', checked: !!R.rojoPortsAuto, on: { change: (e) => this.reglage({ rojoPortsAuto: e.target.checked }) } });
    return [
      ligneI('gen-langue', t('Langue de l’interface'), [
        t('La langue des menus, des boutons et des messages du QG.'),
        exempleAide(t('tu choisis English : tout l’écran passe en anglais ; les agents, eux, écrivent dans la langue des IA, réglée juste en dessous.')),
      ], selLangue),
      ligneI('gen-langue-ia', t('Langue des IA'), [
        t('Le DG et les agents réfléchissent, écrivent et te répondent dans cette langue.'),
        exempleAide(t('écran en français et IA en anglais : les menus restent en français, mais les réponses, les rapports et les commentaires du code arrivent en anglais.')),
      ], selIA),
      ligneI('gen-traduire', t('Traduire les réflexions'), [
        t('Chaque bloc terminé est traduit avec un modèle économique : Haiku, sur le compte de la demande si c’est un compte Claude ; sinon le modèle léger du compte de l’ambiance (Réglages › Priorités). Le texte d’origine reste visible d’un clic. Coût estimé : 1 000 à 3 000 tokens par bloc.'),
        exempleAide(t('tes IA parlent français et un agent réfléchit en anglais : une fois son bloc de réflexion terminé, il s’affiche en français.')),
      ],
        h('label', { class: 'param-case' },
          h('input', { type: 'checkbox', checked: !!R.traduireReflexion, on: { change: (e) => {
            this.reglage({ traduireReflexion: e.target.checked }, e.target.checked ? t('Les réflexions terminées seront traduites dans la langue des IA.') : t('Les réflexions restent dans leur langue d’origine.'));
          } } }),
          ' ', t('Traduire dans la langue des IA les blocs de réflexion écrits dans une autre langue (souvent l’anglais).'))),
      ligneI('gen-prenom', t('Ton prénom'), [t('Facultatif : le DG s’adresse à toi par ton prénom.')], prenom),
      ...titreI('gen-mode', t('Mode de travail des agents'), [
        t('Ce que les agents ont le droit de faire seuls, sans te demander.'),
        exempleAide(t('un projet précieux, ou tu découvres le QG : Prudent, tu vois chaque commande avant qu’elle parte. Tu veux que ça avance pendant que tu fais autre chose : Autonome.')),
      ]),
      mode('auto', t('Autonome (recommandé)'), t('Les agents lisent partout et écrivent librement dans tes dossiers racines. Écrire ailleurs, publier ou envoyer quelque chose demande ton accord. Les commandes sont jugées par le mode auto de Claude Code pour Claude, par le bac à sable pour Codex, par le QG pour les autres agents.')),
      mode('prudent', t('Prudent'), t('Toute action qui n’est pas une simple lecture ou une écriture dans tes dossiers lève la main : tu valides chaque commande. Plus sûr, plus lent. Seul Claude sait travailler ainsi : Codex et les autres agents ne prennent pas les tâches qui écrivent.')),
      ...this.blocCout(),
      ...titreI('gen-parallele', t('Parallélisme'), [
        t('Combien de tâches avancent en même temps. Plus il y en a, plus ça va vite, mais l’usage de tes comptes monte plus vite aussi.'),
      ]),
      ligneI('gen-plafond-global', t('Tâches en même temps (total)'), [
        t('Le nombre maximum de tâches qui tournent en même temps, tous étages réunis.'),
        valeurAide('0', t('sans limite : seules les dépendances entre tâches comptent.')),
        valeurAide('3', t('jamais plus de 3 tâches à la fois.')),
      ], plafond('plafondGlobal')),
      ligneI('gen-plafond-etage', t('Tâches en même temps (par étage)'), [
        t('Le même maximum, mais pour chaque étage (chaque projet) séparément.'),
        valeurAide('0', t('sans limite : seules les dépendances entre tâches comptent.')),
        exempleAide(t('total 4 et par étage 2 : deux projets avancent chacun avec deux tâches à la fois.')),
      ], plafond('plafondEtage')),
      h('h4', {}, t('Divers')),
      ligneI('gen-rojo', t('Ports Rojo automatiques'), [
        t('Pour les jeux Roblox seulement. Rojo relie les fichiers d’un jeu à Roblox Studio par un numéro de port ; deux jeux ouverts sur le même port se mélangent.'),
        exempleAide(t('deux jeux Roblox ouverts en même temps : chacun a son port, et chaque Roblox Studio reçoit le bon jeu.')),
      ], h('label', { class: 'param-case' }, rojo, ' ', t('Donner un port Rojo unique à chaque nouveau jeu Roblox détecté (écrit dans son default.project.json).'))),
      h('h4', {}, t('Saisie')),
      ligneI('gen-entree', t('Entrée pour envoyer'), [t('Décoché : Ctrl+Entrée envoie, Entrée va à la ligne. Le message principal au DG part toujours avec Entrée.')],
        h('label', { class: 'param-case' },
          h('input', { type: 'checkbox', checked: !!R.entreeEnvoie, on: { change: (e) => this.reglage({ entreeEnvoie: e.target.checked }, e.target.checked ? t('Entrée envoie (Maj+Entrée : retour à la ligne).') : t('Ctrl+Entrée envoie.')) } }),
          ' ', t('Envoyer avec Entrée dans les précisions, réponses, questions, consignes et discussions (Maj+Entrée pour aller à la ligne).'))),
      ...blocGraphismes(),
      h('h4', {}, t('Navigateur')),
      R.navigateurApp
        ? ligneI('gen-fenetre-app', t('Fenêtre application'), [t('Décoché : le QG s’ouvre dans ton navigateur (Chrome, Edge, Firefox…) ; les vidéos et directs se jouent dans le QG, les autres sites s’ouvrent à côté, dans ce navigateur, où tu es déjà connecté.')],
          h('label', { class: 'param-case' },
            h('input', { type: 'checkbox', checked: R.ouvrirEnApp !== false, on: { change: (e) => this.reglage({ ouvrirEnApp: e.target.checked }, e.target.checked ? t('Le QG s’ouvrira dans sa fenêtre application.') : t('Le QG s’ouvrira dans ton navigateur.')) } }),
            ' ', t('Ouvrir le QG dans sa propre fenêtre, avec le navigateur complet (tous les sites dedans ; tu t’y connectes une fois, tes connexions sont gardées)')))
        : ligneI('gen-navigateur', t('Navigateur complet'), [t('Pour afficher TOUS les sites dans le navigateur du QG (Google, Reddit, X…) : le QG s’ouvre alors dans sa propre fenêtre. ≈ 100 Mo, une fois.')],
          h('button', { class: 'petit', type: 'button', on: { click: () => this.poster('/api/navigateur/app/installer', {}, t('Installation lancée (≈ 100 Mo).')) } }, t('Installer le navigateur complet'))),
      h('h4', {}, t('Autorisations')),
      ligneI('gen-hors-projet', t('Hors des projets'), [
        t('Décoché (conseillé) : chaque écriture hors projet te demande ton accord, avec « Toujours pour cet agent » pour ne plus être dérangé jusqu’à la fin de sa tâche. Le dossier temporaire du système est toujours libre (brouillons des agents).'),
        t('Avec Claude. Codex n’écrit jamais hors des dossiers de son étage, coché ou non : il ne peut pas te demander ton accord. Un agent ACP (Grok, Cursor…) te demande l’accord comme Claude.'),
        exempleAide(t('un agent veut ranger un fichier dans tes Documents, hors du dossier du projet : coché, il le fait ; décoché, il te demande d’abord.')),
      ],
        h('label', { class: 'param-case' },
          h('input', { type: 'checkbox', checked: !!R.ecritureHorsProjet, on: { change: (e) => {
            if (e.target.checked && !window.confirm(t('Les agents pourront créer et modifier des fichiers en dehors des dossiers de tes projets sans te demander. Activer ?'))) {
              e.target.checked = false;
              return;
            }
            this.reglage({ ecritureHorsProjet: e.target.checked }, e.target.checked ? t('Écriture hors des projets autorisée.') : t('L’écriture hors des projets redemande ton accord.'));
          } } }),
          ' ', t('Toujours autoriser la création et la modification de fichiers en dehors des dossiers des projets'))),
      h('h4', {}, t('Garde-fou Fable')),
      ligneI('gen-fable', t('Quota Fable'), [t('Fable a sa propre limite de la semaine. En dessous du seuil, le QG te demande (une fois par plan) s’il faut garder Fable ou passer sur Opus ; sans réponse en 10 min, Opus. Fable épuisé : Opus directement. Le reste du dossier continue pendant ce temps.')],
        h('label', { class: 'param-case' },
          h('input', { type: 'checkbox', checked: !(R.gardeFable && R.gardeFable.actif === false), on: { change: (e) => this.reglage({ gardeFable: { actif: e.target.checked } }, e.target.checked ? t('Garde-fou Fable activé.') : t('Garde-fou Fable coupé.')) } }),
          ' ', t('Avant de lancer des tâches sur Fable, vérifier ce qu’il reste de sa semaine'),
          ' ', h('select', { class: 'champ', on: { change: (e) => this.reglage({ gardeFable: { resteMin: Number(e.target.value) } }, t('Seuil enregistré.')) } },
            [10, 20, 30, 50, 75].map((n) => h('option', { value: String(n), selected: ((R.gardeFable && R.gardeFable.resteMin) ?? 30) === n ? true : null }, t('demander sous {n} % restants', { n })))))),
      h('h4', {}, t('Vérification')),
      ligneI('gen-validation', t('Validation par toi'), [
        t('Décoché : un vérificateur IA relit ces tâches à ta place et le dossier continue sans t’attendre (y compris les tâches qui attendaient déjà ta validation). Le QG te demande toujours ton accord avant de publier, d’envoyer, de supprimer ou d’acheter.'),
        exempleAide(t('une tâche « couleurs du menu » : coché, elle attend que tu regardes le résultat ; décoché, une IA la relit et le dossier continue.')),
      ],
        h('label', { class: 'param-case' },
          h('input', { type: 'checkbox', checked: !!R.validationUtilisateur, on: { change: (e) => {
            this.reglage({ validationUtilisateur: e.target.checked }, e.target.checked ? t('Le DG pourra te demander de valider certaines tâches.') : t('Une IA vérifie tout : tes dossiers vont de A à Z sans t’attendre.'));
          } } }),
          ' ', t('Me demander de valider moi-même certaines tâches (goût, visuel, gameplay).'))),
      h('h4', {}, t('Git')),
      ligneI('gen-git', t('Git sans demander'), [
        t('Pratique si tu travailles avec Git et que tu relis l’historique ; sinon, laisse décoché : un git push te sera toujours demandé. S’applique aux prochaines tâches.'),
        t('Avec Claude. Codex ne fait jamais de commit ni de push, coché ou non : son dossier .git reste en lecture seule. Un agent ACP fait commit et push seulement si c’est coché ; décoché, ils lui sont refusés.'),
      ],
        h('label', { class: 'param-case' },
          h('input', { type: 'checkbox', checked: !!R.gitAuto, on: { change: (e) => {
            if (e.target.checked && !window.confirm(t('Les agents pourront faire pull, commit, branche, merge et push sans te demander, quand leur mission le demande. Activer ?'))) {
              e.target.checked = false;
              return;
            }
            this.reglage({ gitAuto: e.target.checked }, e.target.checked ? t('Git autorisé sans demande.') : t('Git push redemande ton accord.'));
          } } }),
          ' ', t('Autoriser les agents à faire toutes les opérations git (pull, commit, branche, merge, push) sans te demander.'))),
      h('div', { class: 'boutons' }, h('button', { class: 'petit', type: 'button', on: { click: () => { this.m.fermer(); this.ui.accueil.ouvrir(true); } } }, t('Relancer la configuration guidée'))),
    ];
  }

  // ---------------------------------------------------------------- coût (1.0.6, B2 ; Personnalisé en 1.0.7)
  // Choix des nouvelles demandes (aussi réglable demande par demande, en bas de l'écran) : un des trois niveaux,
  // ou Personnalisé, tes valeurs à partir d'un niveau (base). Choisir un niveau garde les valeurs de Personnalisé.
  // POST /api/reglages, champ travail : ce qui manque garde sa valeur côté serveur.
  blocCout() {
    const S = this.store;
    const R = S.reglages;
    const { cout, base, personnalise } = travailDe(R);
    const niveaux = R.niveauxTravail || null;
    const valeursBase = (niveaux && niveaux[base]) || null;
    const enregistrer = (travail, ok) => this.reglage({ travail }, ok).then(() => {
      if (this.avance && this.avance.texte === this.avance.origine) this.avance = null;
      this.rendre();
    });
    const nb = Object.keys(personnalise).length;
    const aPartir = t('à partir de {niveau}', { niveau: nomNiveau(base) }) + (nb ? ' · ' + t('{n} valeur(s) changée(s)', { n: nb }) : '');
    const cartes = h('div', { class: 'param-niveaux', role: 'radiogroup', 'aria-label': t('Coût') }, COUTS.map((n) =>
      h('button', {
        type: 'button', role: 'radio', class: 'param-niveau' + (n === cout ? ' choisi' : ''), 'aria-checked': n === cout ? 'true' : 'false',
        on: { click: () => { if (n !== cout) enregistrer({ cout: n }, t('Coût des nouvelles demandes : {niveau}.', { niveau: nomTravail({ cout: n, base }) })); } },
      }, h('b', {}, nomNiveau(n)), n === NIVEAU_DEFAUT ? h('span', { class: 'meta' }, ' ' + t('(défaut)')) : null,
      h('small', {}, n === PERSONNALISE ? aPartir : phraseNiveau(n)))));
    // fournisseurs sans compaction, plafond par tâche ni sous-agent (Codex) : ces boutons sont sans effet pour eux
    const sans = [...new Set(CAPACITES_COUT.flatMap((c) => sansCapacite(S, c)))];
    const repartir = ligneI('cout-repartir', t('Repartir de'), [
      t('Remplace toutes les valeurs de Personnalisé par celles d’un niveau, puis change ce que tu veux à partir de là.'),
      t('Tes valeurs changées sont alors effacées ; le QG te demande d’abord confirmation.'),
      t('Si un autre niveau est choisi plus haut, les nouvelles demandes passent alors en Personnalisé.'),
      exempleAide(t('tu veux « Max, mais sans vérificateur pour les petites tâches » : clique sur Max ici, puis règle « Vérification par défaut ».')),
    ], ...NIVEAUX.map((n) => h('button', {
      type: 'button', class: 'petit' + (n === base ? ' choisi' : ''), 'aria-pressed': n === base ? 'true' : 'false',
      on: { click: () => {
        if (nb && !window.confirm(t('Remplacer tes {n} valeur(s) changée(s) par les valeurs de {niveau} ?', { n: nb, niveau: nomNiveau(n) }))) return;
        enregistrer({ cout: PERSONNALISE, base: n, personnalise: {} }, cout === PERSONNALISE
          ? t('Personnalisé repart de {niveau}.', { niveau: nomNiveau(n) })
          : t('Personnalisé repart de {niveau} : les nouvelles demandes passent en Personnalisé.', { niveau: nomNiveau(n) }));
      } },
    }, nomNiveau(n))));
    const ouvert = this.persoCoutOuvert ?? cout === PERSONNALISE;
    const perso = h('details', { class: 'param-cout-perso', open: ouvert ? true : null, on: { toggle: (e) => { this.persoCoutOuvert = e.target.open; } } },
      h('summary', {}, t('Valeurs de Personnalisé') + ' — ' + aPartir),
      h('small', { class: 'meta' }, cout === PERSONNALISE
        ? t('Les nouvelles demandes partent avec ces valeurs. Une valeur changée est enregistrée tout de suite.')
        : t('Tu es sur {niveau} : ces valeurs restent gardées pour plus tard. Changer une valeur ici passe les nouvelles demandes en Personnalisé.', { niveau: nomNiveau(cout) })),
      repartir,
      ...(valeursBase ? boutonsCout().map((b) => this.ligneCout(b, valeursBase[b.cle], personnalise, cout, base, niveaux, enregistrer)) : [h('div', { class: 'vide' }, t('Valeurs des niveaux indisponibles.'))]));
    return [
      ...titreI('cout', t('Coût'), [
        t('Règle combien de travail le QG met dans une demande : nombre de tâches, relectures par un autre agent, mémoire des agents, à-côtés. Le modèle et l’effort que le DG choisit pour chaque tâche ne changent jamais, ni ceux du DG. Seule exception : le vérificateur (l’agent qui relit une tâche) peut passer au niveau standard et à un effort plus bas, en Économe ou selon tes valeurs de Personnalisé.'),
        choixAide(nomNiveau('econome'), t('Le minimum qui donne un bon résultat.'),
          t('Le moins de tokens : ta fenêtre de 5 h dure plus longtemps.'),
          t('Moins de tâches en même temps, moins de relectures par un autre agent, et l’ambiance du mini-jeu coupée.')),
        choixAide(nomNiveau('equilibre'), t('Le juste coût : ce qui est utile, sans plus. C’est le choix par défaut.'),
          t('Un bon résultat pour une dépense raisonnable.'),
          t('Sur une demande très délicate, Max relit davantage.')),
        choixAide(nomNiveau('max'), t('La qualité d’abord : plus de tâches, un vérificateur pour tout code modifié, une grande mémoire.'),
          t('Le plus soigné et le plus sûr.'),
          t('Le plus cher : une grosse demande peut prendre une bonne part de ta fenêtre.')),
        choixAide(nomNiveau(PERSONNALISE), t('Tes propres valeurs, réglées une par une à partir d’un des trois niveaux.'),
          t('Exactement le réglage que tu veux.'),
          t('À toi de juger l’effet de chaque valeur : chacune a son « i ».')),
        t('Ce choix vaut pour les nouvelles demandes. Tu peux aussi le changer demande par demande, dans la barre en bas de l’écran, à côté d’Envoyer. Une demande envoyée garde ses valeurs jusqu’au bout, même si tu changes ce réglage ensuite.'),
        t('Choisir un niveau n’efface pas tes valeurs de Personnalisé : tu les retrouves en revenant sur Personnalisé.'),
        exempleAide(t('tu es en Équilibré et tu prépares une grosse refonte délicate : choisis Max en bas de l’écran pour cette seule demande ; les suivantes repartent en Équilibré.')),
      ]),
      cartes,
      h('small', { class: 'meta' }, t('Pour les nouvelles demandes ; modifiable aussi demande par demande, en bas de l’écran. Le modèle et l’effort des agents et du DG ne changent jamais.')),
      sans.length ? h('div', { class: 'meta' }, t('Avec {fournisseurs}, la compaction, le plafond par tâche et le sous-agent d’exploration sont sans effet ; le reste s’applique.', { fournisseurs: sans.join(', ') })) : null,
      perso,
      ...this.blocAvance(),
      ligneI('cout-filtre-tests', t('Sorties de tests'), [
        t('Quand un agent lance les tests d’un projet (node --test, npm test, vitest…), la sortie peut faire des milliers de lignes. L’agent lit tout, et chaque ligne lue coûte des tokens.'),
        t('Coché, le QG ne lui montre que les 20 premières lignes, chaque test en échec en entier et les 15 dernières lignes (le résumé). Une sortie de moins de 60 lignes reste entière. Le code de sortie ne change pas : un test qui échoue reste un échec.'),
        choixAide(t('Coché (conseillé)'), t('sorties raccourcies.'), t('Beaucoup moins de tokens sur les gros projets.'), t('Les lignes des tests réussis ne sont pas lues.')),
        choixAide(t('Décoché'), t('l’agent lit la sortie complète.'), t('Rien n’est caché.'), t('Une longue sortie de tests peut coûter cher.')),
        t('Vaut pour les prochaines tâches, avec Claude et les agents comme Gemini ou Cursor. Codex lance ses commandes lui-même : ses sorties restent entières.'),
        exempleAide(t('un projet de 900 tests dont 2 échouent : l’agent lit une cinquantaine de lignes au lieu de plus de 900.')),
      ],
      h('label', { class: 'param-case' },
        h('input', { type: 'checkbox', checked: R.filtreTests !== false, on: { change: (e) => {
          this.reglage({ filtreTests: e.target.checked }, e.target.checked ? t('Les sorties de tests des agents seront raccourcies.') : t('Les agents liront les sorties de tests en entier.'));
        } } }),
        ' ', t('Raccourcir les sorties des commandes de test des agents (node --test, npm test, vitest…)'))),
    ];
  }

  // ---------------------------------------------------------------- Coût › mode avancé (1.0.10)
  // Le réglage Coût et les consignes au DG dans un seul texte, comme un AGENTS.md, pour qui préfère régler en texte.
  // Le serveur fabrique le texte depuis les réglages et le relit à l'enregistrement : une ligne fausse, rien ne change.
  // this.avance : { texte (brouillon), origine (texte enregistré), erreurs, lu (heure du chargement) }.
  blocAvance() {
    let actif = false;
    try {
      actif = localStorage.getItem('qg-cout-avance') === '1';
    } catch {
      /* stockage indisponible : bascule coupée */
    }
    const aide = [
      t('Pour qui préfère régler en texte, comme dans un fichier AGENTS.md ou CLAUDE.md : tout le réglage Coût (les valeurs de Personnalisé) et tes consignes au DG (Réglages › Priorités), dans un seul fichier modifiable ici.'),
      t('En haut, entre les deux lignes « --- », une ligne par réglage : nom: valeur. À droite, après le #, les valeurs permises et à quoi sert le réglage. En dessous, tes consignes en texte libre : sous « # Consignes au DG », puis sous « ## code », « ## recherche »…'),
      choixAide(t('Enregistrer'), t('le QG relit tout le fichier. Si une ligne est fausse, rien n’est enregistré et il te dit laquelle.')),
      choixAide(t('Annuler mes modifications'), t('reprend le texte enregistré.')),
      choixAide(t('Réinitialiser'), t('remet dans le texte les valeurs d’origine (Équilibré), sans toucher à tes consignes. Rien ne change tant que tu n’as pas cliqué sur Enregistrer.')),
      t('C’est le même réglage que les cartes et les valeurs au-dessus : changer l’un change l’autre. Le modèle et l’effort du DG et des tâches n’y sont pas : ce fichier ne peut pas les baisser.'),
      t('Ce fichier règle le QG lui-même. Les fichiers AGENTS.md ou CLAUDE.md de tes projets restent dans tes projets : les agents qui y travaillent les lisent d’eux-mêmes (Claude lit CLAUDE.md, Codex lit AGENTS.md).'),
      exempleAide(t('remplace « maxTaches: 8 » par « maxTaches: 4 », écris « ajoute un test pour chaque correction » sous « ## code », puis clique sur Enregistrer.')),
    ];
    const bascule = ligneI('cout-avance', t('Mode avancé'), aide,
      h('label', { class: 'param-case' },
        h('input', { type: 'checkbox', checked: (this.avanceForce ?? actif) ? true : null, on: { change: (e) => {
          try {
            localStorage.setItem('qg-cout-avance', e.target.checked ? '1' : '0');
          } catch {
            /* stockage indisponible : la bascule vaut pour cette fenêtre */
          }
          this.avanceForce = e.target.checked;
          this.rendre();
        } } }),
        ' ', t('Régler le coût et les consignes en texte (fichier agents.md)')));
    if (!(this.avanceForce ?? actif)) return [bascule];
    const a = this.avance;
    // chargement, puis rechargement discret quand rien n'est en cours d'écriture (réglage changé ailleurs)
    if (!a || (a.texte === a.origine && Date.now() - a.lu > 3000)) this.chargerAvance();
    if (!a) return [bascule, h('div', { class: 'vide' }, t('Chargement…'))];
    const etat = h('span', { class: 'meta' }, a.texte === a.origine ? '' : t('modifié, pas encore enregistré'));
    const zone = h('textarea', {
      class: 'champ cout-fichier', spellcheck: 'false', wrap: 'off', rows: '30', 'aria-label': t('Fichier agents.md du QG'),
      on: { input: (e) => {
        a.texte = e.target.value;
        etat.textContent = a.texte === a.origine ? '' : t('modifié, pas encore enregistré');
      } },
    });
    zone.value = a.texte;
    this.zoneAvance = zone;
    const allerLigne = (n) => {
      const lignes = zone.value.split('\n');
      const debut = lignes.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
      zone.focus();
      zone.setSelectionRange(debut, debut + (lignes[n - 1] || '').length);
      zone.scrollTop = Math.max(0, (n - 4) * (parseFloat(getComputedStyle(zone).lineHeight) || 18));
    };
    const erreurs = a.erreurs && a.erreurs.length
      ? h('ul', { class: 'cout-fichier-erreurs', role: 'alert' }, a.erreurs.map((e) => h('li', {},
        h('button', { type: 'button', class: 'lien', on: { click: () => allerLigne(e.ligne) } }, t('Ligne {n}', { n: e.ligne })), ' : ', e.message)))
      : null;
    const enregistrer = async (bouton) => {
      bouton.disabled = true;
      try {
        const r = await fetch('/api/travail/fichier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: a.texte }) });
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          a.erreurs = (j && j.erreurs) || [];
          this.ui.toast('warn', (j && j.erreur) || 'HTTP ' + r.status);
        } else {
          this.avance = { texte: j.texte, origine: j.texte, erreurs: [], lu: Date.now() };
          if (j.reglages) this.store.reglages = { ...this.store.reglages, ...j.reglages };
          const n = j.changes || {};
          this.ui.toast('info', n.reglages || n.consignes
            ? t('Enregistré : {r} réglage(s) et {c} consigne(s) changés. Vaut pour les nouvelles demandes.', { r: n.reglages || 0, c: n.consignes || 0 })
            : t('Enregistré : rien n’a changé.'));
        }
      } catch (e) {
        this.ui.toast('erreur', e.message);
      }
      this.rendre();
    };
    const modifie = a.texte !== a.origine;
    return [
      bascule,
      h('div', { class: 'cout-fichier-bloc' },
        zone,
        erreurs,
        h('div', { class: 'boutons' },
          h('button', { type: 'button', class: 'petit ok', on: { click: (e) => enregistrer(e.currentTarget) } }, t('Enregistrer')),
          h('button', { type: 'button', class: 'petit', disabled: modifie ? null : true, on: { click: () => {
            this.avance = { ...a, texte: a.origine, erreurs: [] };
            this.rendre();
          } } }, t('Annuler mes modifications')),
          h('button', { type: 'button', class: 'petit', on: { click: async () => {
            try {
              const j = await api('/api/travail/fichier?defaut=1');
              this.avance = { ...a, texte: j.texte, erreurs: [] };
              this.ui.toast('info', t('Valeurs d’origine remises dans le texte. Clique sur Enregistrer pour les garder.'));
              this.rendre();
            } catch (e) {
              this.ui.toast('erreur', e.message);
            }
          } } }, t('Réinitialiser')),
          etat)),
    ];
  }

  async chargerAvance() {
    if (this.avanceEnCours) return;
    this.avanceEnCours = true;
    try {
      const j = await api('/api/travail/fichier');
      const a = this.avance;
      // un brouillon commencé entre-temps n'est jamais écrasé
      if (a && a.texte !== a.origine) return;
      this.avance = { texte: j.texte, origine: j.texte, erreurs: a ? a.erreurs : [], lu: Date.now() };
      if (!a) this.rendre();
      else if (a.origine !== j.texte && this.zoneAvance && this.zoneAvance.isConnected && document.activeElement !== this.zoneAvance) this.zoneAvance.value = j.texte;
    } catch (e) {
      this.ui.toast('erreur', e.message);
    } finally {
      this.avanceEnCours = false;
    }
  }

  // Une ligne de Personnalisé : contrôle, badge et « Revenir à {base} », « sans effet pour », bulle « i »
  // (à quoi sert la valeur, ce que fait chaque choix, valeurs des trois niveaux, exemple).
  ligneCout(b, valeurBase, perso, cout, base, niveaux, enregistrer) {
    const change = Object.prototype.hasOwnProperty.call(perso, b.cle);
    const v = change ? perso[b.cle] : valeurBase;
    const poser = (nv) => {
      const p = { ...perso };
      if (nv === valeurBase) delete p[b.cle];
      else p[b.cle] = nv;
      return enregistrer({ cout: PERSONNALISE, base, personnalise: p },
        cout === PERSONNALISE ? t('Enregistré.') : t('Enregistré : les nouvelles demandes passent en Personnalisé.'));
    };
    let ctl;
    let unite = null;
    if (b.choix) {
      ctl = h('select', { class: 'champ', 'aria-label': b.lib, on: { change: (e) => poser(JSON.parse(e.target.value)) } },
        b.choix.map(([x, lib]) => h('option', { value: JSON.stringify(x), selected: x === v ? true : null }, lib)));
    } else {
      const k = b.type === 'k' ? 1000 : 1;
      const min = b.min ?? (b.type === 'pourcent' || b.type === 'facteur' ? 1 : 0);
      const max = b.max ?? (b.type === 'pourcent' ? 100 : null);
      const afficher = (x) => (x == null ? '' : String(x / k));
      ctl = champ({ type: 'number', min: String(min), max: max != null ? String(max) : null, step: b.type === 'facteur' ? '0.5' : '1', value: afficher(v), placeholder: b.nul || null, 'aria-label': b.lib, style: { width: '110px' } });
      ctl.addEventListener('change', () => {
        const brut = ctl.value.trim();
        if (!brut && b.nul) return poser(null);
        const n = Number(brut);
        if (!brut || !Number.isFinite(n) || n < min || (max != null && n > max)) {
          this.ui.toast('warn', max != null ? t('Valeur invalide : entre {min} et {max}.', { min, max }) : t('Valeur invalide : {min} au moins.', { min }));
          ctl.value = afficher(v);
          return;
        }
        poser(b.type === 'facteur' ? n : Math.round(n * k));
      });
      unite = { k: t('k tokens'), pourcent: t('% de ta fenêtre de 5 h'), facteur: t('× l’estimation de la tâche') }[b.type] || null;
    }
    const sans = b.capacite ? sansCapacite(this.store, b.capacite) : [];
    const desNiveaux = niveaux ? NIVEAUX.filter((n) => niveaux[n]).map((n) => nomNiveau(n) + ' : ' + texteValeur(b, niveaux[n][b.cle])).join(' · ') : '';
    const aide = [
      b.quoi,
      ...(b.choix || []).map(([, lib, quoi, plus, moins]) => choixAide(lib, quoi, plus, moins)),
      ...(b.valeurs || []).map(([x, effet]) => valeurAide(x, effet)),
      b.note || null,
      desNiveaux ? [t('Valeurs des niveaux :'), desNiveaux + '.'] : null,
      sans.length ? t('Sans effet avec {fournisseurs} : cette IA ne sait pas le faire.', { fournisseurs: sans.join(', ') }) : null,
      b.exemple ? exempleAide(b.exemple) : null,
    ];
    return ligneI('cout-' + b.cle, b.lib, aide, ctl, unite ? h('span', { class: 'meta' }, unite) : null,
      change ? h('span', { class: 'badge perso' }, t('personnalisé')) : null,
      change ? h('button', { class: 'petit', type: 'button', on: { click: () => poser(valeurBase) } }, t('Revenir à {niveau}', { niveau: nomNiveau(base) })) : null,
      sans.length ? h('span', { class: 'badge st-gris' }, t('sans effet pour {fournisseurs}', { fournisseurs: sans.join(', ') })) : null,
      change ? h('small', { class: 'meta' }, t('Niveau {niveau} : {valeur}.', { niveau: nomNiveau(base), valeur: texteValeur(b, valeurBase) })) : null);
  }

  // ---------------------------------------------------------------- comptes IA
  // Comptes groupés par fournisseur (Claude, ChatGPT · Codex, autres agents ACP) : connexion, déconnexion,
  // renommage, compte par défaut ; ajout en trois choix (fournisseur → accès → nom ou clé ; pour un agent ACP,
  // l'agent ou sa commande) ; compte qui exécute les tâches.
  // accueil : configuration guidée du premier lancement (comptes et ajout seulement) ; apres : la redessine.
  comptes({ accueil = false, apres = null } = {}) {
    const S = this.store;
    const R = S.reglages;
    const fournisseurs = S.fournisseurs && S.fournisseurs.length ? S.fournisseurs : [{ id: 'claude', nom: 'Claude', acces: ['abonnement', 'cle'], connexions: ['navigateur'], present: true }];
    const nomFournisseur = (id) => (fournisseurs.find((f) => f.id === id) || { nom: id }).nom;
    const agentsAcp = S.agentsAcp || [];
    const AIDE_FOURNISSEUR = {
      claude: t('Claude, d’Anthropic : par abonnement (Pro, Max, Team ou Enterprise) ou par clé API facturée à l’usage. Il sait tout faire dans le QG, y compris le mode prudent et le profil ops.'),
      codex: t('ChatGPT · Codex, d’OpenAI : par abonnement ChatGPT ou par clé API. Il code et relit, mais ne prend jamais le profil ops ni le mode prudent : il ne peut pas demander ton accord action par action.'),
      acp: t('Agents ACP (Grok, Cursor, Gemini…) : les agents d’autres fournisseurs, branchés par le protocole ACP. Le QG répond à chacune de leurs demandes ; profil ops et mode prudent refusés. Pas encore qualifiés par le QG : à essayer d’abord sur un petit projet.'),
    };
    // bouton occupé pendant l'envoi : pas de double clic, et on voit que ça travaille
    const occuper = async (bouton, travail) => {
      bouton.disabled = true;
      bouton.classList.add('occupe');
      try {
        return await travail();
      } finally {
        bouton.disabled = false;
        bouton.classList.remove('occupe');
      }
    };
    const majDepuis = (r) => {
      if (r && r.comptes) {
        S.comptes = r.comptes;
        S.compteDefaut = r.compteDefaut;
        if (r.fournisseurs) S.fournisseurs = r.fournisseurs;
        if (r.agentsAcp) S.agentsAcp = r.agentsAcp;
        if ('compteAgents' in r) S.compteAgents = r.compteAgents;
        this.rendre();
        if (apres) apres();
        this.ui.majComptes();
      }
    };
    const ligneCompte = (c) => {
      const nom = champ({ value: c.nom, maxlength: '40', 'aria-label': t('Nom du compte') });
      nom.addEventListener('change', () => this.poster('/api/comptes/' + c.id + '/modifier', { nom: nom.value }, t('Compte renommé.')));
      const action = (lib, route, opts = {}) => h('button', {
        class: 'petit' + (opts.danger ? ' danger' : '') + (opts.ok1 ? ' ok' : ''), type: 'button', title: opts.titre || null,
        on: {
          click: async (e) => {
            if (opts.confirmer && !window.confirm(opts.confirmer)) return;
            majDepuis(await occuper(e.currentTarget, () => this.poster('/api/comptes/' + c.id + '/' + route, opts.corps || {}, opts.ok || null)));
          },
        },
      }, lib);
      const codex = c.fournisseur === 'codex';
      const acp = c.fournisseur === 'acp';
      const agentAcp = acp ? agentsAcp.find((a) => a.id === c.agent) : null;
      const cle = c.type === 'api';
      const profils = c.capacites && c.capacites.profils ? c.capacites.profils : null;
      const refuses = profils ? Object.keys(profils).filter((p) => profils[p] === 'refuse') : [];
      const b = bulle('compte-' + c.id, [
        cle ? t('Compte par clé API : chaque token est facturé par le fournisseur. Rien à connecter, la clé suffit.')
          : acp && !agentAcp ? null
            : acp ? t('Se connecter : ouvre la connexion de l’agent dans une fenêtre de terminal ; suis ses étapes.')
              : t('Se connecter, Reconnecter : ouvre la connexion officielle dans ton navigateur. Le QG ne voit jamais ton mot de passe ni ton jeton.'),
        codex && !cle ? t('Par code d’appareil : si la page de connexion ne s’ouvre pas, tu saisis un code sur la page ChatGPT (à activer dans les paramètres de sécurité ChatGPT).') : null,
        codex && c.bacASable ? t('Préparer le bac à sable : Codex lance les commandes de ses agents dans un espace isolé. Sur Windows, pour qu’il ne puisse jamais lire tes fichiers de connexion ni tes réglages, cet espace se prépare une fois, en administrateur : Windows te demande ton accord, une fenêtre travaille quelques secondes puis se ferme. Sans cette préparation, les tâches Codex ne démarrent pas.') : null,
        c.connecte && !cle && !acp ? t('Déconnecter : ferme la connexion de ce compte sur ce PC. Une tâche qui en a encore besoin attend que tu le reconnectes : ce compte se met en pause, ou tout le QG (selon Réglages › Priorités › Limite d’usage).') : null,
        c.id !== S.compteDefaut ? t('Par défaut : ce compte est choisi d’avance en bas de l’écran pour tes nouvelles demandes.') : t('Ce compte est celui par défaut : il est choisi d’avance en bas de l’écran pour tes nouvelles demandes.'),
        c.connecte && !acp ? t('Lire les limites : relit ce qu’il reste de ton forfait, sans dépenser de tokens.') : null,
        t('Retirer : enlève le compte de la liste ; son dossier de connexion reste sur le disque.'),
        acp ? null : exempleAide(t('ta limite de la semaine approche : « Lire les limites » te montre ce qu’il reste, puis « Par défaut » sur un autre compte envoie là-bas tes prochaines demandes.')),
      ], { titre: c.nom });
      return h('div', { class: 'param-compte' + (c.connecte ? ' connecte' : '') },
        h('div', { class: 'param-compte-tete' },
          nom,
          h('span', { class: 'badge st-gris' }, acp ? (agentAcp ? agentAcp.nomCourt : t('agent ACP personnalisé')) : nomFournisseur(c.fournisseur || 'claude')),
          h('span', { class: 'badge ' + (c.connecte ? 'st-ok' : 'st-ko') }, c.connecte ? t('connecté') : t('non connecté')),
          badgeQualification(c),
          c.id === S.compteDefaut ? h('span', { class: 'badge perso' }, t('par défaut')) : null,
          c.id === S.compteAgents ? h('span', { class: 'badge perso' }, t('agents')) : null,
          b.bouton),
        b.panneau,
        h('div', { class: 'meta' }, [cle ? t('clé API') : t('abonnement'), c.abonnement, c.email, c.partage ? t('partagé avec Claude Code sur ce PC') : null].filter(Boolean).join(' · ')),
        h('div', { class: 'meta' }, h('code', {}, c.dossier || '')),
        codex && refuses.length ? h('div', { class: 'meta' }, t('Profils refusés sur ce compte : {profils} (Codex ne peut pas demander ton accord action par action).', { profils: refuses.join(', ') })) : null,
        codex && c.bacASable === 'a-preparer' ? h('div', { class: 'meta st-ko' }, t('Bac à sable à préparer : sans lui, les tâches Codex ne démarrent pas sur ce PC (bouton « Préparer le bac à sable »).')) : null,
        codex && c.bacASable === 'pret' ? h('div', { class: 'meta' }, t('Bac à sable de Codex prêt.')) : null,
        acp ? h('div', { class: 'meta' }, t('Agent ACP : le QG répond à chacune de ses demandes (fichiers, commandes, permissions) ; profil ops et mode prudent refusés. Pas encore qualifié par le QG : à essayer d’abord sur un petit projet.')) : null,
        h('div', { class: 'boutons' },
          cle || (acp && !agentAcp) ? null : action(c.connecte ? t('Reconnecter') : t('Se connecter'), 'connecter', { ok: acp ? t('Une fenêtre de connexion s’est ouverte : suis les étapes de l’agent.') : t('Une fenêtre de connexion s’est ouverte : suis les étapes dans ton navigateur.'), titre: acp ? t('Ouvre la connexion de l’agent dans une fenêtre de terminal') : codex ? t('Ouvre la connexion officielle de Codex (navigateur)') : t('Ouvre la connexion officielle de Claude Code (navigateur)'), ok1: !c.connecte }),
          codex && c.bacASable === 'a-preparer' ? action(t('Préparer le bac à sable'), 'bac-a-sable', { ok: t('Windows te demande ton accord : clique sur « Oui ». Une fenêtre fait la préparation, puis se ferme.'), titre: t('Préparation unique du bac à sable de Codex, en administrateur'), ok1: true }) : null,
          codex && !cle ? action(t('Par code d’appareil'), 'connecter', { corps: { mode: 'code' }, ok: t('Une fenêtre s’est ouverte : saisis le code affiché sur la page ChatGPT.'), titre: t('Si la page de connexion ne s’ouvre pas : connexion par code (à activer dans les paramètres de sécurité ChatGPT)') }) : null,
          c.connecte && !cle && !acp ? action(t('Déconnecter'), 'deconnecter', { confirmer: t('Déconnecter {nom} ? Les tâches qui en ont encore besoin attendront que tu le reconnectes.', { nom: c.nom }) }) : null,
          c.id !== S.compteDefaut ? action(t('Par défaut'), 'modifier', { corps: { defaut: true }, titre: t('Compte choisi par défaut pour les nouvelles demandes') }) : null,
          c.connecte && !acp ? action(t('Lire les limites'), 'limites', { titre: t('Relit les limites du forfait (sans tokens)') }) : null,
          action(t('Retirer'), 'supprimer', { danger: true, confirmer: t('Retirer {nom} de la liste ? Son dossier de connexion reste sur le disque.', { nom: c.nom }) })));
    };
    const groupes = fournisseurs.map((f) => {
      const liste = S.comptes.filter((c) => (c.fournisseur || 'claude') === f.id);
      if (!liste.length) return null;
      return h('div', { class: 'param-groupe' }, ...(AIDE_FOURNISSEUR[f.id] ? titreI('fournisseur-' + f.id, f.nom, AIDE_FOURNISSEUR[f.id]) : [h('h4', {}, f.nom)]), ...liste.map(ligneCompte));
    });
    // ---- ajout : fournisseur → accès → nom (ou clé)
    const selF = h('select', { class: 'champ', 'aria-label': t('Fournisseur') }, fournisseurs.map((f) => h('option', { value: f.id, selected: f.id === this.ajoutFournisseur ? true : null }, f.nom + (f.present ? '' : ' — ' + t('non installé')))));
    const selAcces = h('select', { class: 'champ', 'aria-label': t('Type d’accès') });
    // agent ACP : un agent connu (Grok, Cursor…) ou une commande personnalisée ; un agent qui n'existe pas pour
    // ce système est grisé
    const selAgent = h('select', { class: 'champ', 'aria-label': t('Agent') },
      ...agentsAcp.map((a) => h('option', {
        value: a.id,
        selected: a.id === this.ajoutAgent && a.disponible !== false ? true : null,
        disabled: a.disponible === false ? true : null,
      }, a.nom + (a.disponible === false ? ' — ' + t('pas sur ce système') : a.present ? '' : ' — ' + t('non installé')))),
      h('option', { value: 'personnalise', selected: this.ajoutAgent === 'personnalise' ? true : null }, t('autre agent ACP (commande)')));
    const commandeAcp = champ({ placeholder: t('commande ACP, ex. mon-agent --acp'), maxlength: '400', 'aria-label': t('Commande de l’agent') });
    const varCleAcp = champ({ placeholder: t('variable de la clé, ex. MON_AGENT_API_KEY'), maxlength: '64', 'aria-label': t('Variable de la clé') });
    const nouveau = champ({ placeholder: t('Nom du compte (ex. perso, pro)'), maxlength: '40' });
    const cle = champ({ type: 'password', placeholder: 'sk-…', autocomplete: 'off', 'aria-label': t('Clé API') });
    const aide = h('div', { class: 'param-ajout-aide' });
    const boutons = h('div', { class: 'param-ajout' });
    // ---- prérequis (1.0.8) : ce qu'il faut sur ce PC avant d'ajouter le compte, et comment l'obtenir.
    // « Ajouter » reste grisé tant qu'une étape bloquante manque ; après une installation, le QG revérifie
    // tout seul toutes les 4 s pendant 10 min.
    const zonePrerequis = h('div', { class: 'param-prerequis' });
    const blocage = h('small', { class: 'meta st-ko', hidden: true }, t('Termine d’abord les étapes marquées ✗ ci-dessus : le bouton « Ajouter » se débloque tout seul.'));
    let pret = true;
    const cleChoix = () => selF.value + ':' + (selF.value === 'acp' ? selAgent.value : '');
    const majBoutonsAjout = () => {
      for (const b of boutons.querySelectorAll('button')) {
        b.disabled = !pret;
        b.title = pret ? '' : t('Il manque encore quelque chose sur ce PC : voir « Avant d’ajouter ce compte »');
      }
      blocage.hidden = pret;
    };
    const boutonAction = (a) => h('button', {
      class: 'petit' + (a.type === 'installer' || a.type === 'terminal' ? ' ok' : ''), type: 'button',
      title: a.type === 'copier' ? a.valeur : a.type === 'lien' ? a.valeur : null,
      on: { click: async (ev) => {
        if (a.type === 'copier') {
          try {
            await navigator.clipboard.writeText(a.valeur);
            this.ui.toast('info', t('Commande copiée : colle-la dans un terminal, puis Entrée.'));
          } catch {
            window.prompt(t('Copie cette commande :'), a.valeur);
          }
          return;
        }
        if (a.type === 'lien') {
          window.open(a.valeur, '_blank', 'noopener');
          return;
        }
        const r = await occuper(ev.currentTarget, () => this.poster('/api/prerequis/agir', { type: a.type, valeur: a.valeur }));
        if (!r) return;
        if (r.message) this.ui.toast('info', r.message);
        this.finSurveillance = Date.now() + 10 * 60 * 1000;
        surveiller();
        chargerPrerequis(true);
      } },
    }, a.libelle);
    const ligneEtape = (e) => h('div', { class: 'param-prerequis-etape ' + (e.ok ? 'ok' : e.enCours ? 'encours' : e.bloquant ? 'ko' : 'conseil') },
      h('div', {},
        h('span', { class: 'param-prerequis-etat', 'aria-hidden': 'true' }, e.ok ? '✓' : e.enCours ? '⏳' : e.bloquant ? '✗' : '!'), ' ',
        h('b', {}, e.titre),
        !e.ok && !e.bloquant ? h('small', { class: 'meta' }, ' — ' + t('conseillé, pas obligatoire')) : null),
      h('small', { class: 'meta' }, e.detail),
      e.note ? h('small', { class: 'meta' }, e.note) : null,
      e.enCours && e.lignes && e.lignes.length ? h('small', { class: 'meta' }, e.lignes[e.lignes.length - 1]) : null,
      e.actions && e.actions.length ? h('div', { class: 'boutons' }, ...e.actions.map(boutonAction)) : null);
    const dessinerPrerequis = (r) => {
      if (!r || r.cle !== cleChoix()) return;
      // rien de changé depuis la dernière vérification : la liste reste telle quelle (pas de clignotement)
      if (zonePrerequis.childNodes.length && this.prerequis && JSON.stringify(this.prerequis) === JSON.stringify(r)) return;
      this.prerequis = r; // gardé pour le prochain dessin
      const avant = pret;
      pret = !!r.pret;
      majBoutonsAjout();
      if (pret && !avant && r.agent) {
        const a = agentsAcp.find((x) => x.id === r.agent);
        if (a) a.present = true;
      }
      if (!r.etapes || !r.etapes.length) {
        zonePrerequis.replaceChildren();
        return;
      }
      const b = bulle('comptes-prerequis', [
        t('Ce qu’il faut sur ce PC pour que cette IA travaille. ✓ : prêt. ✗ : il manque quelque chose, et le bouton à côté l’installe ou t’explique comment faire. ! : conseillé, mais pas obligatoire.'),
        t('Rien ne s’installe sans ton clic. Quand c’est possible, le QG installe lui-même, dans son propre dossier : rien ne change ailleurs sur ce PC. Sinon, une fenêtre s’ouvre avec l’installateur officiel : suis ses étapes, puis reviens ici ; le QG vérifie tout seul.'),
        t('« Copier la commande » : pour l’installer toi-même dans un terminal. « Page officielle » : le site de l’éditeur. « Vérifier à nouveau » : refait la vérification tout de suite.'),
        exempleAide(t('Gemini n’est pas installé : « Installer Gemini » l’installe dans le dossier du QG, la ligne passe à ✓, puis « Ajouter » se débloque.')),
      ], { titre: t('Avant d’ajouter ce compte') });
      zonePrerequis.replaceChildren(...[
        h('div', { class: 'param-prerequis-tete' }, h('b', {}, pret ? '✓ ' + t('Tout ce qu’il faut est sur ce PC') : t('Avant d’ajouter ce compte')), b.bouton),
        b.panneau,
        ...r.etapes.map(ligneEtape),
        pret ? null : h('div', { class: 'boutons' }, h('button', { class: 'petit', type: 'button', on: { click: (ev) => occuper(ev.currentTarget, () => chargerPrerequis(true)) } }, t('Vérifier à nouveau'))),
      ].filter(Boolean)); // replaceChildren écrirait « null » en texte
    };
    const chargerPrerequis = async (reverifier = false) => {
      const cle = cleChoix();
      const f = selF.value;
      const ag = f === 'acp' ? selAgent.value : '';
      try {
        const r = reverifier
          ? await api('/api/prerequis/verifier', { fournisseur: f, agent: ag || null })
          : await api('/api/prerequis?fournisseur=' + encodeURIComponent(f) + (ag ? '&agent=' + encodeURIComponent(ag) : ''));
        dessinerPrerequis({ ...r, cle });
      } catch {
        /* hors ligne ou maquette : la liste reste telle quelle */
      }
    };
    const surveiller = () => {
      clearInterval(this.minuteriePrerequis);
      this.minuteriePrerequis = setInterval(() => {
        if (!zonePrerequis.isConnected || pret || Date.now() > (this.finSurveillance || 0)) {
          clearInterval(this.minuteriePrerequis);
          return;
        }
        chargerPrerequis(true);
      }, 4000);
    };
    const manque = (champVide, message) => {
      this.ui.toast('erreur', message);
      champVide.focus();
    };
    const ajouter = async (bouton, opts = {}) => {
      const f = selF.value;
      const acces = selAcces.value;
      const corps = { fournisseur: f, nom: nouveau.value, ...opts };
      if (f === 'acp') {
        corps.agent = selAgent.value;
        if (selAgent.value === 'personnalise') {
          if (!commandeAcp.value.trim()) return manque(commandeAcp, t('Écris d’abord la commande qui lance l’agent en mode ACP.'));
          corps.commande = commandeAcp.value.trim();
          if (varCleAcp.value.trim()) corps.varCle = varCleAcp.value.trim();
        }
      }
      if (acces === 'cle') {
        if (!cle.value.trim()) return manque(cle, t('Colle d’abord la clé API dans la case prévue.'));
        corps.cleApi = cle.value.trim();
      }
      const r = await occuper(bouton, () => this.poster('/api/comptes/ajouter', corps, null));
      if (!r) return;
      if (r.avertissement) this.ui.toast('erreur', r.avertissement);
      else this.ui.toast('info', r.connexion ? t('Compte ajouté : une fenêtre de connexion s’est ouverte, suis les étapes dans ton navigateur.') : t('Compte ajouté.'));
      nouveau.value = '';
      cle.value = '';
      commandeAcp.value = '';
    };
    const rafraichirAjout = () => {
      const f = fournisseurs.find((x) => x.id === selF.value) || fournisseurs[0];
      this.ajoutFournisseur = f.id;
      const accesActuel = selAcces.value || this.ajoutAcces;
      const acp = f.id === 'acp';
      const agent = acp ? agentsAcp.find((a) => a.id === selAgent.value) || null : null;
      if (acp) this.ajoutAgent = selAgent.value;
      const perso = acp && selAgent.value === 'personnalise';
      selAgent.style.display = acp ? '' : 'none';
      commandeAcp.style.display = perso ? '' : 'none';
      selAcces.replaceChildren(...(agent ? agent.acces : f.acces).map((a) => h('option', { value: a, selected: a === accesActuel ? true : null }, a === 'cle' ? t('clé API (facturée à l’usage)') : t('abonnement'))));
      const parCle = selAcces.value === 'cle';
      this.ajoutAcces = selAcces.value;
      cle.style.display = parCle ? '' : 'none';
      varCleAcp.style.display = perso && parCle ? '' : 'none';
      cle.placeholder = f.id === 'claude' ? 'sk-ant-…' : acp ? t('clé API de l’agent') : 'sk-…';
      const dejaPartage = S.comptes.some((c) => c.partage);
      boutons.replaceChildren(...[
        h('button', { class: 'petit ok', type: 'button', on: { click: (e) => ajouter(e.currentTarget) } }, parCle ? t('Ajouter') : t('Ajouter et se connecter')),
        !parCle && f.connexions && f.connexions.includes('code') ? h('button', { class: 'petit', type: 'button', on: { click: (e) => ajouter(e.currentTarget, { mode: 'code' }) } }, t('Ajouter et se connecter par code')) : null,
        !parCle && f.id === 'claude' && R.claudeCodeLocal && !dejaPartage ? h('button', { class: 'petit', type: 'button', on: { click: (e) => ajouter(e.currentTarget, { partage: true }) } }, t('Utiliser le compte Claude Code déjà connecté sur ce PC')) : null,
      ].filter(Boolean));
      // liste des prérequis : la dernière connue tout de suite (même choix), puis la vraie
      const connue = this.prerequis && this.prerequis.cle === cleChoix() ? this.prerequis : null;
      if (connue) dessinerPrerequis(connue);
      else {
        pret = true;
        zonePrerequis.replaceChildren();
        majBoutonsAjout();
      }
      chargerPrerequis();
      if ((this.finSurveillance || 0) > Date.now()) surveiller();
      const texteAide = (avertissement, texte) => aide.replaceChildren(...[
        avertissement ? h('small', { class: 'meta st-ko' }, avertissement) : null,
        h('small', { class: 'meta' }, texte),
      ].filter(Boolean)); // replaceChildren écrirait « null » en texte
      if (acp) {
        texteAide(null,
          (perso ? t('Agent qui parle le protocole ACP (agentclientprotocol.com) : donne la commande qui le lance en mode ACP.') + ' '
            : agent && !parCle && agent.connexion ? t(agent.connexion) + ' ' : '')
          + (parCle ? t('La clé reste sur ce PC, dans config\\comptes.json ; seul cet agent la reçoit, les autres agents ne peuvent pas la lire.') : t('La connexion se fait dans l’agent lui-même ; le QG ne voit jamais ton jeton.')) + ' '
          + t('Le QG répond à chacune des demandes de l’agent (fichiers, commandes, permissions) et refuse le profil ops et le mode prudent.'));
      } else if (f.id === 'codex') {
        texteAide(null, parCle
          ? t('Clé API OpenAI (platform.openai.com), facturée à l’usage. La clé reste sur ce PC, dans config\\comptes.json ; les agents ne peuvent pas la lire.')
          : t('Abonnement ChatGPT (Plus, Pro, Business…). Un compte = une personne, sur son propre PC : pas de partage ni de rotation de comptes. La connexion se fait dans une fenêtre puis sur la page ChatGPT ; le jeton reste dans le dossier du compte, jamais lu par le QG.'));
      } else {
        texteAide(null, parCle
          ? t('Facturée au token par Anthropic (console.anthropic.com). La clé reste sur ce PC, dans config\\comptes.json ; les agents ne peuvent pas la lire.')
          : t('Abonnement Claude (Pro, Max, Team ou Enterprise). La connexion se fait dans une petite fenêtre puis dans ton navigateur : le QG ne voit jamais ton mot de passe ni ton jeton.'));
      }
    };
    selF.addEventListener('change', rafraichirAjout);
    selAgent.addEventListener('change', rafraichirAjout);
    selAcces.addEventListener('change', rafraichirAjout);
    rafraichirAjout();
    const intro = [
      ...titreI('comptes-intro', t('Tes comptes'), [
        t('Chaque compte est une connexion séparée à un fournisseur d’IA (Claude, ChatGPT · Codex, Grok, Cursor et d’autres agents ACP), avec son propre dossier de connexion : le QG ne voit jamais ton mot de passe ni ton jeton. Le compte par défaut est choisi d’avance en bas de l’écran pour tes demandes ; le DG et les tâches peuvent tourner sur d’autres comptes (Réglages › Priorités).'),
        exempleAide(t('un compte Claude « perso » pour tes projets à toi, et un compte ChatGPT · Codex « pro » pour le code du travail.')),
      ]),
      S.comptes.length ? null : h('p', { class: 'meta' }, t('Aucun compte pour l’instant : ajoute le premier juste en dessous.')),
    ];
    const ajout = [
      ...titreI('comptes-ajout', t('Ajouter un compte'), [
        t('Choisis le fournisseur, le type d’accès, puis donne un nom au compte. Avec un abonnement, la connexion s’ouvre ensuite : une page de ton navigateur pour Claude et ChatGPT · Codex, une fenêtre de terminal pour les autres agents. Tu t’y connectes avec ton compte chez ce fournisseur.'),
        t('S’il manque quelque chose sur ce PC (le programme de l’IA, git…), la liste « Avant d’ajouter ce compte » te le montre et te propose de l’installer.'),
        exempleAide(t('Claude, abonnement, « perso » : ton compte Claude personnel, connecté une fois pour toutes.')),
      ]),
      ligneI('comptes-ajout-fournisseur', t('1. Fournisseur'), [
        t('L’entreprise dont l’IA travaillera pour toi.'),
        ...fournisseurs.map((f) => (AIDE_FOURNISSEUR[f.id] ? choixAide(f.nom, AIDE_FOURNISSEUR[f.id]) : null)),
      ], selF, selAgent, commandeAcp),
      ligneI('comptes-ajout-acces', t('2. Type d’accès'), [
        choixAide(t('abonnement'), t('ton forfait mensuel (Claude Pro ou Max, ChatGPT Plus…) : le QG utilise ses limites, sans frais en plus.')),
        choixAide(t('clé API (facturée à l’usage)'), t('chaque token est facturé par le fournisseur, en plus de tout abonnement. La clé reste sur ce PC.')),
      ], selAcces, cle, varCleAcp),
      ligneI('comptes-ajout-nom', t('3. Nom du compte'), [t('Un nom pour t’y retrouver, comme « perso » ou « pro ». Il apparaît en bas de l’écran et dans Réglages › Priorités. Laissé vide, le QG en choisit un.')], nouveau),
      zonePrerequis,
      boutons,
      blocage,
      aide,
    ];
    if (accueil) return [...intro, ...groupes, ...ajout];
    // ---- compte qui exécute les tâches
    const selAgents = h('select', { class: 'champ', 'aria-label': t('Agents de la demande') },
      h('option', { value: '', selected: !S.compteAgents ? true : null }, t('même compte que la demande')),
      ...S.comptes.map((c) => h('option', { value: c.id, selected: c.id === S.compteAgents ? true : null }, c.nom + ' (' + nomFournisseur(c.fournisseur || 'claude') + ')' + (c.connecte ? '' : ' — ' + t('non connecté')))));
    selAgents.addEventListener('change', async () => {
      const r = await this.reglage({ compteAgents: selAgents.value || null }, t('Réglage enregistré : s’applique aux prochaines demandes.'));
      if (r) S.compteAgents = selAgents.value || null;
      this.rendre();
    });
    const strict = h('input', { type: 'checkbox', checked: R.codex && R.codex.lectureStricte ? true : null, on: { change: (e) => this.reglage({ codex: { lectureStricte: e.target.checked } }) } });
    return [
      ...intro,
      ...groupes,
      ...ajout,
      h('h4', {}, t('Agents de la demande')),
      ligneI('comptes-agents', t('Les tâches sont exécutées par'), [
        t('Les agents et vérificateurs des prochaines demandes tournent sur ce compte-ci au lieu du compte de la demande. Le DG garde le sien (Réglages › Priorités › DG). Avec Codex : profils lecture, édition et édition+tests (jamais ops ni mode prudent), écriture limitée aux dossiers de la tâche, réseau coupé.'),
        exempleAide(t('tu demandes sur ton compte Claude et tu choisis ici ton compte ChatGPT · Codex : les tâches se font sur Codex, le DG reste sur le compte prévu dans Priorités.')),
      ], selAgents),
      S.comptes.some((c) => c.fournisseur === 'codex')
        ? ligneI('comptes-codex-strict', t('Lecture stricte (Codex)'), [
          choixAide(t('Coché'), t('Codex ne prend plus non plus les tâches de lecture.')),
          choixAide(t('Décoché'), t('Codex prend aussi les tâches de lecture, dans un bac à sable où il ne peut rien écrire ni envoyer.')),
        ], h('label', { class: 'param-case' }, strict, ' ', t('Lecture stricte pour Codex : refuser aussi les profils de lecture (en sandbox lecture seule, Codex peut lancer des commandes sans rien écrire ni envoyer).')))
        : null,
      h('p', { class: 'meta' }, t('Tu peux aussi double-cliquer sur {script} dans le dossier du QG.', { script: scriptPlateforme(this.store, 'ajouterCompte') })),
    ];
  }

  // ---------------------------------------------------------------- dossiers et étages
  dossiers() {
    const S = this.store;
    const R = S.reglages;
    const racines = R.racines || [];
    const majRacines = async (liste) => {
      const r = await this.poster('/api/racines', { racines: liste });
      if (r) {
        this.store.reglages = { ...this.store.reglages, racines: r.racines, racinesValides: r.racines };
        this.projets = r.projets;
        this.rendre();
      }
    };
    const manuel = champ({ placeholder: t('ou colle un chemin, ex. D:\\Projets') });
    const ajouterRacine = async (chemin) => chemin && majRacines([...racines, chemin]);
    if (!this.projets) {
      api('/api/projets').then((r) => {
        this.projets = r.projets;
        if (this.section === 'dossiers') this.rendre();
      }).catch(() => null);
    }
    // le hall aussi (1.0.10) : il n'a pas de projet, mais son décor se choisit ici
    const etages = [...S.etages].sort((a, b) => b.ordre - a.ordre);
    const libres = (this.projets || []).filter((p) => !p.etage && !p.ignore);
    return [
      ...titreI('dossiers-racines', t('Dossiers racines'), [
        t('Tes dossiers racines contiennent tes projets : chaque projet peut devenir un étage. Les agents écrivent librement dans ces dossiers ; écrire ailleurs leur demande ton accord.'),
        exempleAide(t('D:\\Dev pour tes jeux et D:\\IA pour ComfyUI : chaque projet trouvé dedans peut devenir un étage.')),
      ]),
      racines.length
        ? h('ul', { class: 'param-liste' }, racines.map((r) => h('li', {},
          h('code', {}, r),
          (R.racinesValides || []).includes(r) ? null : h('span', { class: 'badge st-ko' }, t('introuvable')),
          h('button', { class: 'petit danger', type: 'button', on: { click: () => window.confirm(t('Retirer {r} des dossiers racines ?', { r })) && majRacines(racines.filter((x) => x !== r)) } }, t('Retirer')))))
        : h('div', { class: 'vide' }, t('Aucun dossier racine : ajoute le dossier où sont tes projets.')),
      h('div', { class: 'param-ajout' },
        h('button', { class: 'petit ok', type: 'button', on: { click: async (ev) => { const b = ev.currentTarget; if (b.disabled) return; const txt = b.textContent; b.disabled = true; b.textContent = t('Fenêtre ouverte…'); let r = null; try { r = await this.poster('/api/choisir-dossier', { titre: t('Choisis un dossier qui contient tes projets') }); } finally { b.disabled = false; b.textContent = txt; } if (r && r.chemin) ajouterRacine(r.chemin); } } }, t('Choisir un dossier…')),
        manuel,
        h('button', { class: 'petit', type: 'button', on: { click: () => ajouterRacine(manuel.value.trim()) } }, t('Ajouter'))),
      ...titreI('dossiers-etages', t('Étages'), [
        t('Un étage = un projet de l’immeuble, avec ses agents. « en service » décoché : le DG ne s’en sert plus, mais rien n’est effacé.'),
        t('Fiche du projet : ce que le DG sait du projet avant de planifier. Documents .md : les fichiers .md écrits par les agents. Dossiers… : les dossiers ouverts aux agents de cet étage ; le premier est leur dossier de travail.'),
        t('Décor : l’apparence de l’étage dans l’immeuble, au choix. Il change tout de suite et ne touche ni au type du projet ni aux outils des agents.'),
        t('Chaque étage a plusieurs décors, la Direction, les salles communes, le hall et l’isoloir compris : un autre plan, d’autres meubles, parfois très farfelus. Les agents y trouvent toujours leurs places (postes, réunion, pause…).'),
        exempleAide(t('un jeu dont le code est dans D:\\Dev\\Jeu et les images dans D:\\Art\\Jeu : un seul étage, avec ces deux dossiers.')),
      ]),
      h('div', { class: 'param-ajout' },
        h('button', { class: 'petit ok', type: 'button', title: t('Un étage à toi : un nom, un type et un ou plusieurs dossiers, même sans projet détecté'), on: { click: () => this.formulaireEtage() } }, '＋ ' + t('Nouvel étage'))),
      h('div', { class: 'param-etages' }, etages.map((e) => this.ligneEtage(e))),
      ...titreI('dossiers-libres', t('Projets détectés sans étage'), [
        t('Les projets trouvés dans tes dossiers racines qui n’ont pas encore d’étage. Un projet = un dossier avec .git, package.json, un projet Roblox, Unreal, Unity, Godot, Python…'),
        t('« Ignorer » le retire de cette liste ; « Ajouter l’étage » en fait un étage.'),
      ]),
      !this.projets ? h('div', { class: 'vide' }, t('Recherche…'))
        : libres.length
          ? h('ul', { class: 'param-liste' }, libres.map((p) => h('li', {},
            h('span', { class: 'badge' }, p.racine ? t('Dossier entier') : t(TYPES_PROJET[p.type] || p.type)), ' ', h('b', {}, p.nom), ' ', h('code', { class: 'meta' }, p.dossier),
            h('button', { class: 'petit ok', type: 'button', on: { click: async () => { if (await this.poster('/api/etages/ajouter', { dossier: p.dossier }, t('Étage ajouté.'))) { this.projets = null; this.rendre(); } } } }, p.racine ? t('Utiliser ce dossier entier comme étage') : t('Ajouter l’étage')),
            h('button', { class: 'petit', type: 'button', on: { click: async () => { if (await this.poster('/api/etages/ignorer', { dossier: p.dossier })) { this.projets = null; this.rendre(); } } } }, t('Ignorer')))))
          : h('div', { class: 'vide' }, t('Tous les projets détectés ont un étage.')),
      h('div', { class: 'boutons' },
        h('button', { class: 'petit', type: 'button', on: { click: async (ev) => { const b = ev.currentTarget; if (b.disabled) return; const txt = b.textContent; b.disabled = true; b.textContent = t('Fenêtre ouverte…'); let r = null; try { r = await this.poster('/api/choisir-dossier', { titre: t('Choisis le dossier d’un projet') }); } finally { b.disabled = false; b.textContent = txt; } if (r && r.chemin && (await this.poster('/api/etages/ajouter', { dossier: r.chemin }, t('Étage ajouté.')))) { this.projets = null; this.rendre(); } } } }, t('Ajouter un autre dossier comme étage…')),
        h('button', { class: 'petit', type: 'button', on: { click: () => { this.projets = null; this.rendre(); } } }, t('Relancer la détection'))),
    ];
  }

  ligneEtage(e) {
    const nom = champ({ value: e.nom, maxlength: '40', 'aria-label': t('Nom de l’étage') });
    nom.addEventListener('change', () => this.poster('/api/etages/' + encodeURIComponent(e.id) + '/modifier', { nom: nom.value }, t('Étage renommé.')));
    // Étages qui font partie de l'immeuble : ni désactivables ni retirables.
    const fixe = ['direction', 'salle-pause', 'salle-repos', 'hall', 'isoloir'].includes(e.id);
    const actif = h('input', { type: 'checkbox', checked: e.actif, disabled: fixe ? true : null, on: { change: (ev) => this.poster('/api/etages/' + encodeURIComponent(e.id) + '/modifier', { actif: ev.target.checked }) } });
    // décors : les thèmes d'origine d'un étage de projet (1.0.9), puis les décors au choix de sa famille (1.0.10)
    const en = langueCourante() === 'en';
    const projet = familleDe(e.type) === 'bureau';
    const choix = [
      ...(projet && e.projet && !fixe ? Object.entries(DECORS).map(([k, lib]) => ({ k, lib: t(lib), aide: null })) : []),
      ...skinsDe(e.type).map((sk) => ({ k: sk.id, lib: en ? sk.nomEn : sk.nom, aide: en ? sk.descriptionEn : sk.description })),
    ];
    const decor = choix.length ? h('select', { class: 'champ', 'aria-label': t('Décor'), title: t('Apparence de l’étage, sans changer son type'), on: { change: (ev) => this.poster('/api/etages/' + encodeURIComponent(e.id) + '/modifier', { decor: ev.target.value }, t('Décor changé.')) } },
      h('option', { value: '', selected: e.decor ? null : true }, projet ? t('Décor : celui du type') : t('Décor : par défaut')),
      ...choix.map((c) => h('option', { value: c.k, title: c.aide, selected: e.decor === c.k ? true : null }, t('Décor : {decor}', { decor: c.lib })))) : null;
    return h('div', { class: 'param-etage' + (e.actif ? '' : ' inactif') },
      h('div', { class: 'param-etage-tete' },
        nom,
        h('span', { class: 'badge' }, e.libelleType || t(TYPES_PROJET[e.type] || e.type)),
        decor,
        // le hall n'est jamais un lieu de travail du DG : pas de case « en service »
        e.id === 'hall' ? null : h('label', { class: 'param-case', title: t('Un étage inactif n’existe plus pour le DG') }, actif, ' ', t('en service'))),
      h('div', { class: 'meta' }, h('code', {}, (e.dossiers || [e.projet]).filter(Boolean).join(' + ') || '—')),
      h('div', { class: 'boutons' },
        e.projet ? h('button', { class: 'petit', type: 'button', on: { click: () => this.editerFiche(e) } }, t('Fiche du projet')) : null,
        e.projet ? h('button', { class: 'petit', type: 'button', on: { click: () => this.ui.lecteur.documents(e.id) } }, t('Documents .md')) : null,
        e.projet && !fixe ? h('button', { class: 'petit', type: 'button', title: t('Ajouter ou retirer des dossiers de cet étage'), on: { click: () => this.formulaireEtage(e) } }, t('Dossiers…')) : null,
        fixe ? null : h('button', { class: 'petit danger', type: 'button', on: { click: async () => { if (window.confirm(t('Retirer l’étage {nom} ? Le projet lui-même n’est pas touché.', { nom: e.nom })) && (await this.poster('/api/etages/' + encodeURIComponent(e.id) + '/retirer', {}))) { this.projets = null; this.rendre(); } } } }, t('Retirer'))));
  }

  // « ＋ Nouvel étage » (sans `e`) : nom, type et un ou plusieurs dossiers, même sans projet détecté.
  // Avec `e` : ajouter ou retirer des dossiers d'un étage existant. Le premier dossier est le principal
  // (dossier de travail des agents) ; les autres leur sont ouverts aussi.
  formulaireEtage(e = null) {
    const dossiers = e ? [...(e.dossiers || [e.projet])].filter(Boolean) : [];
    const m = ouvrirModale({ titre: e ? t('Dossiers — {nom}', { nom: e.nom }) : t('Nouvel étage'), classe: 'nouvel-etage' });
    const nom = champ({ placeholder: t('Nom de l’étage (ex. Dev)'), maxlength: '40', 'aria-label': t('Nom de l’étage') });
    // Type : une suggestion de la liste, ou ton propre type (« Mod Minecraft ») ; vide = type détecté, sinon Projet
    const type = champ({ list: 'types-etage', maxlength: '40', placeholder: t('Automatique (type détecté, sinon Projet)'), 'aria-label': t('Type') });
    const suggestions = h('datalist', { id: 'types-etage' }, TYPES_CHOIX.map((k) => h('option', { value: t(TYPES_PROJET[k]) })));
    const typeChoisi = () => {
      const brut = type.value.replace(/\s+/g, ' ').trim();
      const cle = TYPES_CHOIX.find((k) => [k, TYPES_PROJET[k], t(TYPES_PROJET[k])].some((v) => v.toLowerCase() === brut.toLowerCase()));
      return { type: cle || null, libelleType: cle ? null : brut || null };
    };
    const liste = h('ul', { class: 'param-liste' });
    const manuel = champ({ placeholder: t('ou colle un chemin, ex. D:\\Projets') });
    const dessiner = () => liste.replaceChildren(...(dossiers.length
      ? dossiers.map((d, i) => h('li', {},
        h('code', {}, d),
        i === 0 ? h('span', { class: 'badge perso', title: t('Dossier de travail des agents') }, t('principal')) : null,
        dossiers.length > 1 ? h('button', { class: 'petit danger', type: 'button', on: { click: () => { dossiers.splice(i, 1); dessiner(); } } }, t('Retirer')) : null))
      : [h('div', { class: 'vide' }, t('Aucun dossier pour l’instant.'))]));
    const ajouter = (chemin) => {
      chemin = String(chemin || '').trim();
      if (!chemin || dossiers.some((d) => d.toLowerCase() === chemin.toLowerCase())) return;
      dossiers.push(chemin);
      if (!e && !nom.value.trim()) nom.value = chemin.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
      dessiner();
    };
    dessiner();
    const valider = async (ev) => {
      if (manuel.value.trim()) ajouter(manuel.value);
      manuel.value = '';
      if (!dossiers.length) return this.ui.toast('erreur', t('Ajoute au moins un dossier.'));
      const b = ev.currentTarget;
      b.disabled = true;
      const r = e
        ? await this.poster('/api/etages/' + encodeURIComponent(e.id) + '/modifier', { dossiers }, t('Dossiers de l’étage enregistrés.'))
        : await this.poster('/api/etages/ajouter', { dossiers, nom: nom.value.trim() || null, ...typeChoisi() }, t('Étage ajouté.'));
      b.disabled = false;
      if (!r) return;
      m.fermer();
      this.projets = null;
      if (this.m) this.rendre();
    };
    // append() écrirait « null » : sans le nom ni le type quand on modifie un étage
    m.corps.append(...[
      h('p', { class: 'meta' }, e
        ? t('Le premier dossier est le dossier de travail des agents ; ils écrivent aussi librement dans les autres.')
        : t('Un étage peut couvrir un dossier entier (même sans projet reconnu) ou plusieurs dossiers. Le premier est le dossier de travail des agents ; ils écrivent aussi librement dans les autres. Une fiche est créée automatiquement.')),
      e ? null : ligne(t('Nom'), nom),
      e ? null : ligne(t('Type'), type, suggestions, h('small', { class: 'meta' }, t('Choisis dans la liste ou écris le tien (ex. Mod Minecraft). Le décor et les outils de l’étage suivent le type détecté.'))),
      h('h4', {}, t('Dossiers')),
      liste,
      h('div', { class: 'param-ajout' },
        h('button', { class: 'petit', type: 'button', on: { click: async (ev) => { const b = ev.currentTarget; if (b.disabled) return; const txt = b.textContent; b.disabled = true; b.textContent = t('Fenêtre ouverte…'); let r = null; try { r = await this.poster('/api/choisir-dossier', { titre: t('Choisis un dossier pour cet étage') }); } finally { b.disabled = false; b.textContent = txt; } if (r && r.chemin) ajouter(r.chemin); } } }, t('Choisir un dossier…')),
        manuel,
        h('button', { class: 'petit', type: 'button', on: { click: () => { ajouter(manuel.value); manuel.value = ''; } } }, t('Ajouter'))),
      h('div', { class: 'boutons' },
        h('button', { class: 'petit ok', type: 'button', on: { click: valider } }, e ? t('Enregistrer') : t('Créer l’étage')),
        h('button', { class: 'petit', type: 'button', on: { click: () => m.fermer() } }, t('Annuler'))),
    ].filter(Boolean));
    (e ? manuel : nom).focus();
  }

  async editerFiche(e) {
    let texte = '';
    try {
      texte = (await api('/api/etages/' + encodeURIComponent(e.id) + '/fiche')).fiche || '';
    } catch (err) {
      this.ui.toast('erreur', err.message);
      return;
    }
    const m = ouvrirModale({ titre: t('Fiche — {nom}', { nom: e.nom }), classe: 'fiche-projet' });
    const zone = h('textarea', { class: 'champ zone', rows: '16' });
    zone.value = texte;
    m.corps.append(
      h('p', { class: 'meta' }, t('Ce que le DG sait de ce projet avant de planifier : à quoi il sert, où est le code, comment vérifier, ce qu’il ne faut pas toucher. Markdown accepté.')),
      zone,
      h('div', { class: 'boutons' },
        h('button', { class: 'petit ok', type: 'button', on: { click: async () => { if (await this.poster('/api/etages/' + encodeURIComponent(e.id) + '/modifier', { fiche: zone.value }, t('Fiche enregistrée.'))) m.fermer(); } } }, t('Enregistrer')),
        h('button', { class: 'petit', type: 'button', on: { click: () => m.fermer() } }, t('Annuler'))));
    zone.focus();
  }

  // ---------------------------------------------------------------- dossiers archivés (1.0.7)
  // Les dossiers rangés à la main (bouton « Archiver » de l'onglet Dossiers), lus à part avec leurs tâches :
  // chaque tâche rouvre sa fiche en lecture seule, « Ressortir » remet le dossier dans l'onglet Dossiers.
  dossiersArchives() {
    const S = this.store;
    if (this.listeArchives === null && !this.archivesEnLecture) {
      this.archivesEnLecture = true;
      api('/api/dossiers/archives')
        .then((r) => (this.listeArchives = r.dossiers || []))
        .catch((e) => {
          this.listeArchives = [];
          this.ui.toast('erreur', e.message);
        })
        .finally(() => {
          this.archivesEnLecture = false;
          if (this.section === 'archives') this.rendre();
        });
    }
    const date = (x) => new Date(x).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
    const liste = this.listeArchives || [];
    const carte = (d) => h('div', { class: 'dossier etat-' + d.etat + ' archive' },
      h('div', { class: 'ligne' },
        h('span', { class: 'ref' }, d.id),
        h('span', { class: 'titre' }, d.titre || d.texte || ''),
        h('span', { class: 'badge d-' + d.etat }, libelleDossier(d.etat))),
      h('div', { class: 'meta' }, [
        (d.etages || []).map((x) => S.etage(x)?.nom || x).join(' · '),
        d.creeLe ? t('demandé le {date}', { date: date(d.creeLe) }) : null,
        t('archivé le {date}', { date: date(d.archive) }),
      ].filter(Boolean).join(' — ')),
      d.taches.length
        ? h('div', { class: 'taches' }, d.taches.map((x) => h('button', { class: 'tache', type: 'button', title: t('Revoir la fiche de {ref}', { ref: x.ref }), on: { click: () => this.ficheArchivee(d, x) } },
          h('span', { class: 'puce', style: { background: modele(x.modele).c } }),
          h('span', { class: 'ref' }, S.nom(x) !== x.ref ? S.nom(x) + ' · ' + x.ref : x.ref),
          h('span', { class: 'titre' }, x.titre || ''),
          h('span', { class: 'badge t-' + x.etat }, libelleEtat(x.etat)))))
        : h('div', { class: 'meta' }, t('Aucune tâche dans ce dossier.')),
      d.synthese ? h('details', {}, h('summary', {}, t('Synthèse du DG')), md(d.synthese, { classe: 'synthese', fichier: (c) => this.ui.ouvrirFichier(c, (d.etages || [])[0] || null) })) : null,
      h('div', { class: 'boutons' },
        h('button', { class: 'petit ok', type: 'button', title: t('Remettre ce dossier dans l’onglet Dossiers'), on: { click: (e) => this.ressortir(d, e.currentTarget) } }, t('Ressortir'))));
    return [
      ...titreI('archives', t('Tes dossiers rangés'), [
        t('Dans l’onglet Dossiers, « Archiver » range un dossier terminé, annulé ou en échec : il quitte la liste, les fiches et le fil, mais rien n’est effacé.'),
        t('Ici, clique sur une tâche (T1, T2…) pour revoir sa fiche, et sur « Ressortir » pour remettre le dossier dans l’onglet Dossiers. Rien ne s’archive tout seul.'),
        exempleAide(t('ton jeu est fini depuis un mois : archive son dossier pour garder une liste courte ; le jour où tu veux relire ce qu’a fait T3, il est ici.')),
      ]),
      this.listeArchives === null
        ? h('div', { class: 'vide' }, t('Lecture des archives…'))
        : liste.length
          ? h('div', { class: 'param-archives' }, liste.map(carte))
          : h('div', { class: 'vide' }, t('Aucun dossier archivé pour l’instant.')),
    ];
  }

  async ressortir(d, bouton) {
    bouton.disabled = true;
    const r = await this.poster('/api/dossiers/' + encodeURIComponent(d.id) + '/ressortir', {}, t('Le dossier {dossier} est de retour dans l’onglet Dossiers.', { dossier: d.id }));
    bouton.disabled = false;
    if (!r) return;
    this.listeArchives = null;
    this.rendre();
  }

  // Fiche d'une tâche archivée, en lecture seule : les informations de l'onglet Infos de sa fiche et son résultat.
  ficheArchivee(d, x) {
    const S = this.store;
    const m = ouvrirModale({ titre: t('Tâche {nom} (archivée)', { nom: S.nom(x) !== x.ref ? S.nom(x) + ' · ' + x.id : x.id }), classe: 'fiche-archivee' });
    const heure = (v) => new Date(v).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    m.corps.append(
      h('h4', {}, x.titre || x.ref),
      h('div', { class: 'meta' }, (S.etage(x.etage)?.nom || x.etage) + ' — ' + t('dossier {dossier}', { dossier: d.id }) + (x.nature ? ' — ' + x.nature : '')),
      h('dl', {},
        h('dt', {}, t('État')), h('dd', {}, h('span', { class: 'badge t-' + x.etat }, libelleEtat(x.etat))),
        h('dt', {}, t('Demandé')), h('dd', {}, S.nomModele(x.modele, x.compte || d.compte) + ' · ' + (x.effort || '?')),
        h('dt', {}, t('Réel')), h('dd', {}, x.modeleReel || x.effortReel ? (x.modeleReel || '?') + ' · ' + (x.effortReel || '?') : '—'),
        x.compte ? [h('dt', {}, t('IA')), h('dd', {}, S.libelleCompte(x.compte))] : null,
        x.inputsFrom && x.inputsFrom.length ? [h('dt', {}, t('Reçoit de')), h('dd', {}, x.inputsFrom.join(', '))] : null,
        h('dt', {}, t('Vérification')), h('dd', {}, x.verif ? x.verif.mode + (x.verif.modele ? ' (' + x.verif.modele + ')' : '') : '—'),
        h('dt', {}, t('Tentative')), h('dd', {}, String(x.tentative || 1)),
        x.skills && x.skills.length ? [h('dt', {}, t('Skills')), h('dd', {}, x.skills.join(', '))] : null,
        x.lignes ? [h('dt', {}, t('Code')), h('dd', {}, '+' + (x.lignes.ajouts || 0) + ' −' + (x.lignes.suppressions || 0) + ' ' + t('dans {n} fichier(s)', { n: x.lignes.fichiers || 0 }))] : null,
        x.debut ? [h('dt', {}, t('Début')), h('dd', {}, heure(x.debut))] : null,
        x.fin ? [h('dt', {}, t('Fin')), h('dd', {}, heure(x.fin))] : null,
        x.agent ? [h('dt', {}, t('Agent')), h('dd', {}, S.equipe.get(x.agent)?.prenom ? S.equipe.get(x.agent).prenom + ' (' + x.agent + ')' : x.agent)] : null),
      x.resultat ? this.ui.blocResultat(x) : h('div', { class: 'vide' }, t('Pas de résultat enregistré pour cette tâche.')),
      h('div', { class: 'boutons' }, h('button', { class: 'petit', type: 'button', on: { click: () => m.fermer() } }, t('Fermer'))));
  }

  // ---------------------------------------------------------------- MCP
  mcp() {
    const box = h('div', { class: 'param-mcp' });
    rendreMcp(box, this.ui);
    return [box];
  }

  // ---------------------------------------------------------------- équipe et skins
  // Grille de tous les personnages : un clic ouvre son nom (modifiable en direct, même au travail) et son apparence.
  equipe() {
    const S = this.store;
    const P = S.personnalisation || { prenoms: [], skins: {}, noms: {} };
    const skins = { ...(P.skins || {}) };
    const sauverSkins = () => {
      clearTimeout(this.enregistrerSkins);
      this.enregistrerSkins = setTimeout(async () => {
        const r = await this.poster('/api/personnalisation', { skins });
        if (r) this.store.personnalisation = r;
      }, 500);
    };
    // Qui est au travail en ce moment (badge sur sa carte).
    const occupes = new Set([...S.taches.values()].filter((x) => !TERMINAUX.has(x.etat)).map((x) => S.nom(x)));
    const persos = [['@dg', S.nomDg()], ['@joy', S.nomJoy()], ...(P.prenoms || []).map((p) => [p, p])];
    const grille = h('div', { class: 'param-skins' });
    const changer = (sauver = true) => {
      if (sauver) sauverSkins();
      rendreGrille();
    };
    const rendreGrille = () => grille.replaceChildren(...persos.map(([id, lib]) => this.carteSkin(id, lib, skins, changer, occupes.has(id))), this.carteAjout(P));
    rendreGrille();
    return [
      this.blocMiniJeu(),
      ...titreI('equipe-grille', t('Ton équipe'), [
        t('Clique sur un personnage pour changer son nom et son apparence. Un nouveau nom s’applique tout de suite, même à un agent au travail. Les nouvelles recrues prennent un prénom au hasard parmi ceux de cette liste.'),
        t('La couleur de chemise des agents indique leur modèle (Opus, Sonnet…) : elle ne change que pour le DG et Joy.'),
        exempleAide(t('renomme « Recrue 1 » en « Léon » : il s’appelle Léon tout de suite, même au milieu d’une tâche.')),
      ]),
      grille,
    ];
  }

  // Mini-jeu des personnages : discussions, collègues qui entendent, bavardages écrits par l'IA.
  // Tout se coupe et se règle ici (ça consomme des tokens) ; sans effet sur le travail des agents.
  blocMiniJeu() {
    const S = this.store;
    const mj = (S.miniJeu && S.miniJeu.reglages) || {};
    const regler = async (k, v, ok) => {
      await this.reglage({ miniJeu: { [k]: v } }, ok);
      setTimeout(() => this.rendre(), 150);
    };
    const caseMj = (k, libelle) => h('label', { class: 'param-case' },
      h('input', { type: 'checkbox', checked: mj[k] !== false, on: { change: (e) => regler(k, e.target.checked) } }), ' ', libelle);
    const frequence = h('select', { class: 'champ', disabled: mj.bavardages === false ? true : null, on: { change: (e) => regler('bavardagesMinutes', Number(e.target.value)) } },
      [0, 0.5, 1, 2, 5, 10, 15, 30, 60, 120].map((n) => h('option', { value: String(n), selected: Number(mj.bavardagesMinutes ?? 10) === n ? true : null },
        n === 0 ? t('en direct (en continu)') : n === 0.5 ? t('toutes les 30 s') : n === 1 ? t('toutes les minutes') : n < 60 ? t('toutes les {n} min', { n }) : n === 60 ? t('toutes les heures') : t('toutes les 2 h'))));
    // niveau Claude ; un compte d'une autre IA prend son modèle du même niveau
    const modele = (k, defaut) => h('select', { class: 'champ', title: t('Sur un compte d’une autre IA (Codex…), le modèle du même niveau.'), on: { change: (e) => regler(k, e.target.value) } },
      [['haiku', 'Haiku (' + t('le moins cher') + ')'], ['sonnet', 'Sonnet'], ['opus', 'Opus (' + t('le plus cher') + ')']].map(([v, l]) => h('option', { value: v, selected: (mj[k] || defaut) === v ? true : null }, l)));
    const bBavard = bulle('minijeu-bavardages', [t('Façon télé-réalité : potins, rumeurs qui circulent (et finissent par revenir aux oreilles de l’intéressé), amitiés, amourettes, brouilles, histoires qui se suivent. Plusieurs scènes peuvent se jouer en même temps. Seulement quand le QG est ouvert et que deux collègues au moins sont au même étage ; sinon, les bavardages tout prêts (gratuits) continuent.')], { titre: t('Bavardages écrits par l’IA entre collègues') });
    return h('div', { class: 'bloc param-minijeu' },
      ...titreI('minijeu', '🎭 ' + t('Mini-jeu des personnages'), [
        t('Discute avec un agent, le DG ou Joy (bouton « Discuter » de sa fiche) : chacun a sa personnalité et sa mémoire, ses collègues présents entendent et réagissent, des amitiés et des rivalités naissent. Juste pour le plaisir : aucun effet sur le travail. Chaque réplique consomme un peu de ton forfait.'),
        exempleAide(t('ouvre la fiche de Joy, clique sur « Discuter » et demande-lui sa blague préférée : les collègues présents l’entendent et s’en souviendront.')),
      ]),
      caseMj('actif', t('Activer le mini-jeu')),
      mj.actif === false ? null : [
        caseMj('ecoute', t('Les collègues présents dans la pièce entendent les discussions')),
        h('div', { class: 'param-ligne' }, caseMj('bavardages', t('Bavardages écrits par l’IA entre collègues')), h('div', { class: 'param-val' }, frequence, bBavard.bouton), bBavard.panneau),
        Number(mj.bavardagesMinutes) <= 0.5 && mj.bavardages !== false ? h('small', { class: 'meta attention' }, t('En direct ou toutes les 30 s, les scènes s’enchaînent (jusqu’à 3 en même temps) : quelques milliers de tokens par scène avec Haiku, à surveiller dans ⚡ Consommation.')) : null,
        h('div', { class: 'param-ligne' }, h('span', {}, t('Modèle des discussions')), modele('modeleDiscussion', 'sonnet'), h('span', {}, t('Modèle des bavardages')), modele('modeleBavardage', 'haiku')),
        h('div', { class: 'boutons' },
          h('button', { class: 'petit', type: 'button', on: { click: async () => {
            const r = await this.poster('/api/personnages/bavarder', {});
            if (r) this.ui.toast('info', t('{noms} bavardent (regarde leur étage).', { noms: [...new Set(r.lignes.map((l) => l.nom))].join(' & ') }));
          } } }, '💬 ' + t('Faire bavarder maintenant')),
          h('button', { class: 'petit', type: 'button', on: { click: async () => {
            if (!window.confirm(t('Remettre à zéro ce que tous les personnages pensent les uns des autres ?'))) return;
            await this.poster('/api/personnages/oublier', { relations: true }, t('Relations remises à zéro.'));
            this.rendre();
          } } }, t('Réinitialiser toutes les relations')),
          h('button', { class: 'petit danger', type: 'button', on: { click: async () => {
            if (!window.confirm(t('Effacer la mémoire de tous les personnages (souvenirs, relations, discussions) ? Leurs personnalités sont gardées.'))) return;
            await this.poster('/api/personnages/oublier', { tout: true }, t('Mémoires effacées.'));
            this.rendre();
          } } }, t('Effacer toutes les mémoires'))),
        this.blocIntrigues(),
      ]);
  }

  // Les intrigues du QG (mini-jeu) : histoires en cours et rumeurs qui circulent.
  blocIntrigues() {
    const S = this.store;
    const I = (S.miniJeu && S.miniJeu.intrigues) || { rumeurs: [], histoires: [] };
    const nomDe = (k) => (k === '@dg' ? S.nomDg() : k === '@joy' ? S.nomJoy() : k);
    if (!I.histoires.length && !I.rumeurs.length) return h('p', { class: 'meta' }, '📺 ' + t('Pas encore d’intrigue : elles naîtront des bavardages.'));
    return h('details', { class: 'param-intrigues', open: true },
      h('summary', {}, '📺 ' + t('Les intrigues du QG : {h} histoire(s), {r} rumeur(s)', { h: I.histoires.length, r: I.rumeurs.length })),
      I.histoires.length ? h('ul', { class: 'mem-souvenirs' }, I.histoires.slice().reverse().map((x) => h('li', {},
        h('b', {}, x.titre), ' — ', x.resume, ' ', h('span', { class: 'meta' }, '(' + x.qui.map(nomDe).join(', ') + (x.episodes > 1 ? ' · ' + t('{n} épisodes', { n: x.episodes }) : '') + ')')))) : null,
      I.rumeurs.length ? h('ul', { class: 'mem-souvenirs' }, I.rumeurs.slice(-8).reverse().map((x) => h('li', {},
        '🗣 « ', x.texte, ' » ', h('span', { class: 'meta' }, t('lancée par {par}, connue de {n} personne(s)', { par: nomDe(x.par), n: x.connaisseurs.length }) + ' · ' + (x.connaisseurs.includes(x.sujet) ? t('{qui} est au courant', { qui: nomDe(x.sujet) }) : t('{qui} ne sait pas encore', { qui: nomDe(x.sujet) })))))) : null);
  }

  // Personnalité et mémoire d'un personnage, dans sa carte (mini-jeu).
  blocPersonnage(id, lib) {
    const S = this.store;
    const mj = S.miniJeu || {};
    if (mj.reglages && mj.reglages.actif === false) return null;
    const perso = (mj.personnalites || {})[id] || '';
    const mem = (mj.memoires || {})[id] || { souvenirs: [], relations: {}, dialogue: [] };
    const nomDe = (k) => (k === '@dg' ? S.nomDg() : k === '@joy' ? S.nomJoy() : k);
    const champ = h('textarea', { class: 'champ', rows: '3', maxlength: '600', placeholder: t('Vide : {nom} s’invente un caractère à sa première discussion.', { nom: lib }) });
    champ.value = perso;
    champ.addEventListener('change', async () => {
      await this.poster('/api/personnages/personnalite', { cle: id, texte: champ.value }, t('Personnalité enregistrée.'));
    });
    const oublier = async (corps, ok) => {
      await this.poster('/api/personnages/oublier', { cle: id, ...corps }, ok);
      this.rendre();
    };
    const relations = Object.entries(mem.relations || {});
    return h('div', { class: 'param-perso' },
      h('small', {}, t('Personnalité (mini-jeu)')), champ,
      h('div', { class: 'boutons' },
        h('button', { class: 'petit', type: 'button', on: { click: () => this.ui.discussions.ouvrir(id) } }, '🗨 ' + t('Discuter')),
        h('button', { class: 'petit', type: 'button', title: t('Revenir à la personnalité de départ'), on: { click: async () => {
          await this.poster('/api/personnages/personnalite', { cle: id, texte: '' }, t('Personnalité de départ remise.'));
          setTimeout(() => this.rendre(), 150);
        } } }, t('Personnalité de départ'))),
      h('details', { class: 'param-memoire', open: relations.length || mem.souvenirs.length ? true : null },
        h('summary', {}, t('Mémoire : {s} souvenir(s), {r} relation(s), {d} réplique(s)', { s: mem.souvenirs.length, r: relations.length, d: mem.dialogue.length })),
        relations.length ? h('ul', { class: 'mem-relations' }, relations.map(([k, r]) => h('li', {},
          h('span', { class: 'mem-affinite ' + (r.affinite > 0 ? 'plus' : r.affinite < 0 ? 'moins' : '') }, (r.affinite > 0 ? '+' : '') + r.affinite),
          ' ', h('b', {}, nomDe(k)), r.lien ? h('span', { class: 'mem-lien' }, ' ' + (LIEN_ICONES[r.lien] || '') + ' ' + t(r.lien)) : null, r.note ? ' — ' + r.note : '',
          h('button', { class: 'mem-x', type: 'button', title: t('Oublier ce que {nom} pense de {autre}', { nom: lib, autre: nomDe(k) }), on: { click: () => oublier({ relation: k }) } }, '×')))) : null,
        mem.souvenirs.length ? h('ul', { class: 'mem-souvenirs' }, mem.souvenirs.slice().reverse().map((x) => h('li', {},
          h('span', { class: 'mem-source' }, x.source === 'entendu' ? '👂' : x.source === 'bavardage' ? '💬' : '🗨'), ' ', x.texte,
          h('button', { class: 'mem-x', type: 'button', title: t('Oublier ce souvenir'), on: { click: () => oublier({ souvenir: x.id }) } }, '×')))) : h('div', { class: 'meta' }, t('Aucun souvenir pour l’instant.')),
        h('div', { class: 'boutons' },
          relations.length ? h('button', { class: 'petit', type: 'button', on: { click: () => oublier({ relations: true }, t('Relations de {nom} remises à zéro.', { nom: lib })) } }, t('Remettre ses relations à zéro')) : null,
          h('button', { class: 'petit danger', type: 'button', on: { click: () => {
            if (window.confirm(t('Effacer toute la mémoire de {nom} (souvenirs, relations, discussions) ?', { nom: lib }))) oublier({}, t('Mémoire de {nom} effacée.', { nom: lib }));
          } } }, t('Effacer sa mémoire')))));
  }

  async renommer(ancien, nouveau) {
    const n = String(nouveau || '').trim();
    // DG et Joy acceptent un nom vide (retour au nom par défaut) ; un agent doit garder un nom.
    if ((!n && !ancien.startsWith('@')) || n === ancien) return;
    const r = await this.poster('/api/equipe/renommer', { ancien, nouveau: n }, t('Nom changé.'));
    if (!r) return;
    this.store.personnalisation = r;
    if (!ancien.startsWith('@')) this.skinOuvert = n;
    this.rendre();
  }

  carteAjout(P) {
    return h('button', {
      class: 'param-skin param-skin-ajout', type: 'button', title: t('Ajouter un personnage à l’équipe'),
      on: {
        click: async () => {
          let n = 1;
          while ((P.prenoms || []).includes(t('Recrue {n}', { n }))) n++;
          const nom = t('Recrue {n}', { n });
          const r = await this.poster('/api/personnalisation', { prenoms: [...(P.prenoms || []), nom] });
          if (!r) return;
          this.store.personnalisation = r;
          this.skinOuvert = nom;
          this.focusNom = true;
          this.rendre();
        },
      },
    }, h('span', { class: 'plus' }, '+'), h('span', {}, t('Nouveau personnage')));
  }

  carteSkin(id, lib, skins, changer, occupe = false) {
    const special = id.startsWith('@');
    const type = special ? id.slice(1) : 'agent';
    const skin = skins[id] || null;
    const L = apparence(special ? type : 'apercu-' + id, special ? null : 'sonnet', type, skin);
    const c = document.createElement('canvas');
    c.width = 68;
    c.height = 140;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(spriteAvatar(L, { dir: 'se', posture: 'debout', frame: 0 }), 0, 0, 68, 140);
    const ouvert = this.skinOuvert === id;
    const carte = h('div', { class: 'param-skin' + (ouvert ? ' ouvert' : '') + (skin ? ' perso' : '') },
      h('button', { class: 'param-skin-apercu', type: 'button', title: t('Modifier {nom}', { nom: lib }), on: { click: () => { this.skinOuvert = ouvert ? null : id; changer(false); } } },
        c, h('span', {}, lib), occupe ? h('span', { class: 'badge st-ok' }, t('au travail')) : null));
    if (!ouvert) return carte;
    const regler = (k, v) => {
      skins[id] = { ...(skins[id] || {}), [k]: v };
      changer();
    };
    const P = this.store.personnalisation || { prenoms: [] };
    const nom = h('input', { class: 'champ', value: lib, maxlength: '24', 'aria-label': t('Nom'), placeholder: special ? (id === '@dg' ? t('DG') : 'Joy') : '' });
    nom.addEventListener('change', () => this.renommer(id, nom.value));
    nom.addEventListener('keydown', (e) => e.key === 'Enter' && nom.blur());
    if (this.focusNom) {
      this.focusNom = false;
      setTimeout(() => {
        nom.focus();
        nom.select();
      }, 0);
    }
    carte.append(h('div', { class: 'param-skin-nom' },
      h('small', {}, t('Nom')), nom,
      !special && (P.prenoms || []).length > 1
        ? h('button', { class: 'petit danger', type: 'button', title: t('Les agents qui portent déjà ce nom le gardent jusqu’à leur retraite'), on: { click: async () => {
          if (!window.confirm(t('Retirer {nom} de l’équipe ?', { nom: lib }))) return;
          const r = await this.poster('/api/personnalisation', { prenoms: P.prenoms.filter((x) => x !== id) });
          if (r) {
            this.store.personnalisation = r;
            this.skinOuvert = null;
            this.rendre();
          }
        } } }, t('Retirer de l’équipe'))
        : null));
    const pastilles = (k, palette, actuel) => h('div', { class: 'pastilles' },
      palette.map((col) => h('button', { type: 'button', class: 'pastille-couleur' + (actuel === col ? ' choisie' : ''), style: { background: col }, title: col, on: { click: () => regler(k, col) } })),
      h('input', { type: 'color', value: actuel || palette[0], title: t('Autre couleur'), on: { change: (e) => regler(k, e.target.value) } }));
    carte.append(h('div', { class: 'param-skin-reglages' },
      h('div', {}, h('small', {}, t('Peau')), pastilles('peau', PALETTE_PEAUX, L.peau)),
      h('div', {}, h('small', {}, t('Cheveux')), pastilles('cheveux', PALETTE_CHEVEUX, L.cheveux)),
      h('div', {}, h('small', {}, t('Coiffure')), h('div', { class: 'pastilles' }, Array.from({ length: COIFFURES }, (_, i) => h('button', { type: 'button', class: 'pastille-num' + (L.coiffure === i ? ' choisie' : ''), on: { click: () => regler('coiffure', i) } }, String(i + 1))))),
      h('div', {}, h('small', {}, t('Pantalon')), pastilles('pantalon', PALETTE_PANTALONS, L.pantalon)),
      special ? h('div', {}, h('small', {}, t('Chemise')), pastilles('chemise', ['#2a2d3a', '#ffd23f', '#e3342f', '#2f6fde', '#3fd36b', '#b07cff', '#f06a2a', '#ffffff'], L.chemise)) : null,
      h('label', { class: 'param-case' }, h('input', { type: 'checkbox', checked: !!L.lunettes, on: { change: (e) => regler('lunettes', e.target.checked) } }), ' ', t('Lunettes')),
      skin ? h('button', { class: 'petit', type: 'button', on: { click: () => { delete skins[id]; changer(); } } }, t('Revenir au hasard')) : null));
    const bp = this.blocPersonnage(id, lib);
    if (bp) carte.append(bp);
    return carte;
  }

  // ---------------------------------------------------------------- skills
  skills() {
    return sectionSkills(this);
  }

  priorites() {
    return sectionPriorites(this);
  }

  // ---------------------------------------------------------------- happiness manager
  bonheur() {
    const S = this.store;
    const R = S.reglages;
    const B = S.bonheur || {};
    const tot = B.total || {};
    const maj = B.maj ? new Date(B.maj).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('pas encore');
    const fichier = h('input', { type: 'file', accept: '.json,.csv,.xlsx', hidden: true });
    const modeImport = h('select', { class: 'champ' }, h('option', { value: 'fusion' }, t('Ajouter aux existants')), h('option', { value: 'remplacer' }, t('Remplacer les catégories du fichier')));
    fichier.addEventListener('change', async () => {
      const f = fichier.files[0];
      fichier.value = '';
      if (!f) return;
      try {
        const r = await api('/api/bonheur/import?mode=' + modeImport.value + '&nom=' + encodeURIComponent(f.name), undefined, { brut: await f.arrayBuffer(), type: 'application/octet-stream' });
        const a = r.ajouts || {};
        this.ui.toast('info', t('Import : +{b} blagues, +{f} anecdotes, +{a} phrases.', { b: a.blagues || 0, f: a.faits || 0, a: a.ambiance || 0 }));
        this.stock = null;
        this.rendre();
      } catch (e) {
        this.ui.toast('erreur', e.message);
      }
    });
    const recolte = h('button', { class: 'petit', type: 'button', on: { click: async () => { recolte.disabled = true; recolte.textContent = t('Récolte en cours…'); await this.poster('/api/bonheur/recolter', {}, t('Récolte terminée.')); this.stock = null; this.rendre(); } } }, t('Nouvelle récolte'));
    const lienExport = (format, lib) => h('a', { class: 'petit bouton-lien', href: '/api/bonheur/export?format=' + format, download: '' }, lib);
    return [
      ...titreI('bonheur', t('Joy et son stock'), [
        t('Joy fait le tour des étages et raconte blagues et anecdotes aux agents qui attendent. Le stock dépend de la langue des IA.'),
        exempleAide(t('un agent attend qu’un collègue finisse : Joy passe le voir et lui raconte une blague, dans une bulle au-dessus de sa tête.')),
      ]),
      h('dl', {},
        h('dt', {}, t('Stock')), h('dd', {}, t('{b} blagues · {f} anecdotes · {a} phrases de pause', { b: tot.blagues || 0, f: tot.faits || 0, a: tot.ambiance || 0 })),
        h('dt', {}, t('Mise à jour')), h('dd', {}, maj + (B.source ? ' (' + B.source + ')' : ''))),
      ligneI('bonheur-recolte', t('Récolte automatique'), [t('Coché : le stock de Joy se renouvelle tout seul. Décoché : il ne change plus, sauf si tu lances une récolte avec le bouton ci-dessous.')], h('label', { class: 'param-case' }, h('input', { type: 'checkbox', checked: R.recolteAuto !== false, on: { change: (e) => this.reglage({ recolteAuto: e.target.checked }) } }), ' ', t('Toutes les 12 h : blagues gratuites en ligne, plus quelques appels à un modèle léger (Haiku chez Claude, très peu de tokens).'))),
      ligneI('bonheur-duree', t('Durée des bulles'), [t('Le temps que restent affichées les bulles des agents et de Joy, pour avoir le temps de tout lire.')],
        h('select', { class: 'champ', on: { change: (e) => this.reglage({ dureeBulles: Number(e.target.value) }, t('Enregistré.')) } },
          [[1, t('Normale')], [1.5, t('Un peu plus longue (×1,5)')], [2, t('Longue (×2)')], [3, t('Très longue (×3)')]].map(([v, lib]) =>
            h('option', { value: String(v), selected: Number(R.dureeBulles || 1) === v ? true : null }, lib)))),
      h('div', { class: 'boutons' }, recolte),
      ...titreI('bonheur-excel', t('Exporter, modifier dans Excel, réimporter'), [
        t('Excel : une feuille par catégorie (Blagues : Question, Chute ; Anecdotes : Texte ; Pause café : Phrase). CSV : colonnes type ; texte ; chute.'),
        exempleAide(t('exporte en Excel, ajoute tes blagues de famille dans la feuille Blagues, puis importe le fichier avec « Ajouter aux existants ».')),
      ]),
      h('div', { class: 'boutons' }, lienExport('xlsx', t('Exporter en Excel')), lienExport('csv', t('Exporter en CSV')), lienExport('json', t('Exporter en JSON'))),
      h('div', { class: 'param-ajout' }, modeImport, h('button', { class: 'petit ok', type: 'button', on: { click: () => fichier.click() } }, t('Importer un fichier…')), fichier),
      h('h4', {}, t('Modifier directement')),
      this.editeurBonheur(),
    ];
  }

  editeurBonheur() {
    const boite = h('div', { class: 'param-editeur' });
    if (!this.stock) {
      boite.append(h('div', { class: 'vide' }, t('Chargement du stock…')));
      api('/api/bonheur/stock').then((s) => {
        this.stock = s;
        this.modifsBonheur = false;
        if (this.section === 'bonheur') this.rendre();
      }).catch((e) => boite.replaceChildren(h('div', { class: 'vide erreur' }, e.message)));
      return boite;
    }
    const type = this.ongletBonheur;
    const liste = this.stock[type];
    const PAGE = 40;
    const q = this.filtreBonheur.toLowerCase();
    const indices = liste.map((_, i) => i).filter((i) => !q || JSON.stringify(liste[i]).toLowerCase().includes(q));
    const pages = Math.max(1, Math.ceil(indices.length / PAGE));
    this.pageBonheur = Math.min(this.pageBonheur, pages - 1);
    const vus = indices.slice(this.pageBonheur * PAGE, (this.pageBonheur + 1) * PAGE);
    const sale = () => {
      this.modifsBonheur = true;
      bEnr.disabled = false;
    };
    const filtre = champ({ type: 'search', value: this.filtreBonheur, placeholder: t('Rechercher…') });
    filtre.addEventListener('input', () => {
      this.filtreBonheur = filtre.value;
      this.pageBonheur = 0;
      const pos = filtre.selectionStart;
      this.rendre();
      const f = this.contenu.querySelector('.param-editeur input[type=search]');
      if (f) {
        f.focus();
        f.setSelectionRange(pos, pos);
      }
    });
    const bEnr = h('button', { class: 'petit ok', type: 'button', disabled: this.modifsBonheur ? null : true, on: { click: async () => {
      const r = await this.poster('/api/bonheur/stock', { [type]: this.stock[type] }, t('Modifications enregistrées.'));
      if (r) {
        this.modifsBonheur = false;
        this.stock = null;
        this.rendre();
      }
    } } }, t('Enregistrer les modifications'));
    const onglets = h('div', { class: 'sous-onglets' }, [['blagues', t('Blagues')], ['faits', t('Anecdotes')], ['ambiance', t('Pause café')]].map(([id, lib]) =>
      h('button', { type: 'button', class: id === type ? 'actif' : '', on: { click: () => { if (this.modifsBonheur && !window.confirm(t('Abandonner les modifications non enregistrées ?'))) return; if (this.modifsBonheur) this.stock = null; this.modifsBonheur = false; this.ongletBonheur = id; this.pageBonheur = 0; this.rendre(); } } }, lib + ' (' + this.stock[id].length + ')')));
    const lignes = vus.map((i) => {
      const e = liste[i];
      const suppr = h('button', { class: 'petit danger', type: 'button', title: t('Supprimer'), on: { click: () => { liste.splice(i, 1); sale(); this.rendre(); } } }, '🗑');
      if (type === 'blagues') {
        const a = champ({ value: e.setup, 'aria-label': t('Début de la blague') });
        const b = champ({ value: e.chute, 'aria-label': t('Chute') });
        a.addEventListener('input', () => { e.setup = a.value; sale(); });
        b.addEventListener('input', () => { e.chute = b.value; sale(); });
        return h('div', { class: 'param-entree deux' }, a, b, suppr);
      }
      const a = champ({ value: e, 'aria-label': t('Texte') });
      a.addEventListener('input', () => { liste[i] = a.value; sale(); });
      return h('div', { class: 'param-entree' }, a, suppr);
    });
    boite.append(...[
      onglets,
      h('div', { class: 'param-ajout' },
        filtre,
        h('button', { class: 'petit', type: 'button', on: { click: () => { liste.unshift(type === 'blagues' ? { setup: '', chute: '' } : ''); this.filtreBonheur = ''; this.pageBonheur = 0; sale(); this.rendre(); } } }, '+ ' + t('Ajouter')),
        bEnr),
      ...lignes,
      pages > 1 ? h('div', { class: 'param-pages' },
        h('button', { class: 'petit', type: 'button', disabled: this.pageBonheur === 0 ? true : null, on: { click: () => { this.pageBonheur--; this.rendre(); } } }, '←'),
        h('span', {}, t('page {p} / {n}', { p: this.pageBonheur + 1, n: pages })),
        h('button', { class: 'petit', type: 'button', disabled: this.pageBonheur >= pages - 1 ? true : null, on: { click: () => { this.pageBonheur++; this.rendre(); } } }, '→')) : null].filter(Boolean));
    return boite;
  }

  // ---------------------------------------------------------------- dictée et notifications
  dictee() {
    const dic = this.store.dictee || {};
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const libPerm = { granted: t('activées'), denied: t('bloquées par le navigateur (réglages du site)'), default: t('non activées'), unsupported: t('non gérées par ce navigateur') }[perm];
    return [
      ...titreI('dictee', t('Dictée'), [
        t('Parler au lieu d’écrire : tu cliques sur 🎤, tu parles, et ton texte s’écrit dans la zone de saisie.'),
        t('La dictée locale (Whisper) tourne sur ton ordinateur : rien ne part sur Internet, et c’est gratuit.'),
        exempleAide(t('tu cliques sur 🎤, tu dis « Ajoute un bouton pause au jeu », tu relis, puis tu envoies.')),
      ]),
      dic.disponible
        ? h('p', {}, t('Transcription locale disponible ({appareil}). Bouton 🎤 en bas de l’écran, ou {raccourci}.', { appareil: dic.appareil || t('chargement du modèle…'), raccourci: infosPlateforme(this.store).raccourciDictee }))
        : !infosPlateforme(this.store).dicteeLocale
          // Mac : pas encore d'installation de Whisper ; la dictée du système fait le travail
          ? h('div', {},
            h('p', { class: 'meta' }, t('La dictée locale (Whisper) n’est pas encore disponible sur Mac. Utilise {systeme} dans la zone de saisie : ça marche partout.', { systeme: dicteeSysteme() })),
            h('div', { class: 'boutons' }, h('button', { class: 'petit', type: 'button', disabled: true, title: t('Pas encore disponible sur Mac') }, t('Installer la dictée locale'))))
          : h('div', {},
            h('p', {}, t('La dictée locale (Whisper, sur ton PC, gratuite et privée) n’est pas installée.')),
            h('p', { class: 'meta' }, t('Installation : environ 4 Go avec une carte NVIDIA (rapide), 1,5 Go sans (plus lent). En attendant, la dictée de Windows marche partout : Win+H.')),
            h('div', { class: 'boutons' }, h('button', { class: 'petit ok', type: 'button', on: { click: () => this.poster('/api/dictee/installer', {}, t('L’installation s’ouvre dans une fenêtre à part. Relance le QG quand elle est finie.')) } }, t('Installer la dictée locale')))),
      ...titreI('notifications', t('Notifications'), [t('Pour être prévenu quand un agent lève la main ou pose une question, même si le QG est en arrière-plan.')]),
      h('p', { class: 'meta' }, t('Navigateur : {etat}. Quand le QG est au premier plan, la cloche suffit.', { etat: libPerm })),
      // Mac : la notification système passe par osascript (limite connue de macOS pour un script)
      infosPlateforme(this.store).nom === 'mac' ? h('p', { class: 'meta' }, t('Sur Mac, quand aucune page du QG n’est ouverte, la notification du système apparaît au nom de « Éditeur de scripts », et un clic dessus n’ouvre pas le QG. Autorise les notifications de l’Éditeur de scripts dans Réglages Système › Notifications.')) : null,
      perm === 'default' ? h('button', { class: 'petit', type: 'button', on: { click: () => this.ui.notifs.activer() } }, t('Activer les notifications')) : null,
      ...this.blocTelephone(),
    ];
  }

  // Alertes sur le téléphone (1.0.8) : ntfy, un sujet au nom tiré au hasard, rien du travail ne part.
  blocTelephone() {
    const tel = this.store.reglages.telephone || { actif: false, serveur: 'https://ntfy.sh', sujet: '', attente: true, fin: true, pause: true, relance: true };
    const changer = async (patch, ok = t('Enregistré.')) => {
      if (await this.reglage({ telephone: patch }, ok)) this.rendre();
    };
    const lien = tel.sujet ? `${tel.serveur}/${tel.sujet}` : '';
    const caseCat = (cle, texte) => h('label', { class: 'param-case' },
      h('input', { type: 'checkbox', checked: tel[cle] !== false, disabled: tel.actif ? null : true, on: { change: (e) => changer({ [cle]: e.target.checked }) } }), ' ', texte);
    const serveur = champ({ value: tel.serveur, placeholder: 'https://ntfy.sh', 'aria-label': t('Serveur ntfy') });
    return [
      ...titreI('telephone', t('Alertes sur ton téléphone'), [
        t('Pour laisser le QG travailler sans le surveiller : ton téléphone sonne quand un agent a besoin de toi, quand un dossier est fini, quand une limite d’usage met le travail en pause, ou quand le QG a redémarré après un plantage.'),
        t('Ça passe par ntfy, une application gratuite (Android et iPhone), sans compte. Le QG envoie un message sur un « sujet » : un nom long tiré au hasard. Ton téléphone, abonné à ce sujet, reçoit l’alerte.'),
        [t('Ce qui part :'), t('seulement un titre court, par exemple « T3 a besoin de ton avis » ou « Dossier D12 terminé ». Jamais le contenu de ton travail, ni tes fichiers, ni tes questions.')],
        t('Sur le serveur public ntfy.sh, quiconque connaît le nom du sujet peut lire ces titres : c’est pour ça que le nom est long et impossible à deviner. Garde-le pour toi. Si tu as ton propre serveur ntfy, mets son adresse.'),
        exempleAide(t('tu lances un gros dossier et tu pars faire les courses : ton téléphone vibre quand le DG a une question, tu réponds en rentrant.')),
      ]),
      h('label', { class: 'param-case' },
        h('input', { type: 'checkbox', checked: tel.actif, on: { change: (e) => changer({ actif: e.target.checked }, e.target.checked ? t('Alertes activées : abonne ton téléphone au sujet ci-dessous.') : t('Alertes coupées.')) } }),
        ' ', t('Prévenir mon téléphone')),
      tel.sujet ? h('div', { class: 'param-telephone' },
        h('p', {}, t('1. Installe l’application ntfy sur ton téléphone. 2. Touche « + » (s’abonner). 3. Recopie ce nom de sujet :')),
        h('p', {}, h('code', { class: 'sujet-ntfy' }, tel.sujet), ' ', h('a', { href: lien, target: '_blank', rel: 'noopener noreferrer', class: 'meta' }, t('ou ouvre ce lien sur le téléphone'))),
        h('div', { class: 'boutons' },
          h('button', { class: 'petit ok', type: 'button', on: { click: async (e) => {
            const b = e.currentTarget;
            b.disabled = true;
            if (await this.poster('/api/telephone/essai', {}, t('Essai envoyé : ton téléphone doit sonner dans quelques secondes.'))) this.rendre();
            b.disabled = false;
          } } }, t('Envoyer un essai')),
          h('button', { class: 'petit', type: 'button', on: { click: () => {
            if (window.confirm(t('Tirer un nouveau nom de sujet ? Il faudra réabonner ton téléphone au nouveau nom.'))) changer({ sujet: 'nouveau' }, t('Nouveau sujet : réabonne ton téléphone.'));
          } } }, t('Nouveau nom de sujet'))),
        h('div', { class: 'param-cases' },
          caseCat('attente', t('Un agent ou le DG a besoin de toi')),
          caseCat('fin', t('Un dossier est terminé (ou en échec)')),
          caseCat('pause', t('Une limite d’usage met en pause, puis le travail reprend')),
          caseCat('relance', t('Le QG a redémarré tout seul après un plantage'))),
        ligne(t('Serveur ntfy'), serveur, h('button', { class: 'petit', type: 'button', on: { click: () => changer({ serveur: serveur.value }) } }, t('Enregistrer'))))
        : h('div', { class: 'boutons' }, h('button', { class: 'petit', type: 'button', on: { click: () => changer({ sujet: 'nouveau' }, t('Sujet créé : abonne ton téléphone, puis coche « Prévenir mon téléphone ».')) } }, t('Préparer mon téléphone'))),
    ];
  }

  // ---------------------------------------------------------------- à propos
  apropos() {
    const R = this.store.reglages;
    return [
      h('p', {}, t('QG des agents : une société d’agents IA que tu regardes travailler, étage par étage.')),
      h('dl', {},
        h('dt', {}, t('Version')), h('dd', {}, R.version || '—'),
        h('dt', {}, t('Dossier du QG')), h('dd', {}, h('code', {}, R.qg || '—')),
        h('dt', {}, t('Code source')), h('dd', {}, h('a', { href: DEPOT_GITHUB, target: '_blank', rel: 'noopener noreferrer' }, DEPOT_GITHUB))),
      h('h4', {}, t('Démo')),
      R.demo
        ? h('div', {}, h('p', {}, t('Tu es dans la démo : un immeuble fictif, des agents simulés, aucun token consommé. Ton vrai QG tourne à côté, dans son autre fenêtre.')),
          h('div', { class: 'boutons' }, h('button', { class: 'petit', type: 'button', on: { click: () => this.quitterDemo() } }, t('Quitter la démo'))))
        : h('div', {}, h('p', {}, t('Découvre le QG sans rien consommer : un immeuble fictif où une douzaine d’agents simulés travaillent en parallèle, se réunissent et se passent le relais. La démo s’ouvre dans sa propre fenêtre, sur un autre port ; ton QG continue de tourner normalement.')),
          h('div', { class: 'boutons' }, h('button', { class: 'petit ok', type: 'button', on: { click: (e) => this.lancerDemo(e.currentTarget) } }, t('Lancer la démo')))),
      ...titreI('maj', t('Mises à jour'), [
        t('Coché : à chaque lancement, le QG regarde s’il existe une version plus récente et l’installe avant de démarrer. Décoché : rien ne change tant que tu ne le demandes pas, juste en dessous.'),
      ]),
      h('label', { class: 'param-case' },
        h('input', { type: 'checkbox', checked: R.miseAJourAuto !== false, on: { change: (e) => this.reglage({ miseAJourAuto: e.target.checked }, t('Enregistré.')) } }),
        ' ', t('Mettre à jour automatiquement au lancement du QG (si une nouvelle version est publiée, elle s’installe avant que le QG démarre).')),
      this.blocMaj(),
      ...titreI('rapport', t('Un problème ? Une idée ?'), [
        t('Décris ce qui ne marche pas, ou ce qui te manquerait. Le QG prépare un texte avec les informations utiles pour corriger (version, système, dernières lignes du serveur), après avoir retiré tout ce qui est personnel.'),
        t('Tu relis le texte complet avant tout envoi. Ensuite, deux choix : l’ouvrir sur GitHub (page déjà remplie, compte GitHub gratuit), ou le copier pour l’envoyer à la personne qui t’a donné le QG.'),
      ]),
      h('div', { class: 'boutons' }, h('button', { class: 'petit', type: 'button', on: { click: () => ouvrirRapport(this.ui) } }, t('Signaler un problème'))),
      h('p', { class: 'meta' }, t('Tout reste sur ce PC : tes réglages (dossier config), l’historique des dossiers (dossier dossiers) et les données de travail (dossier runtime). Le QG n’écoute que ton ordinateur (127.0.0.1) et ne partage rien.')),
      h('div', { class: 'boutons' }, h('button', { class: 'petit', type: 'button', on: { click: () => this.ui.lecteur.ouvrir(R.qg + '\\README.md') } }, t('Lire le mode d’emploi'))),
    ];
  }

  async lancerDemo(bouton) {
    bouton.disabled = true;
    try {
      const r = await api('/api/demo/lancer', {});
      this.ui.toast('info', r.deja ? t('La démo est déjà ouverte : elle repasse devant.') : t('La démo démarre dans une nouvelle fenêtre (quelques secondes).'));
    } catch (e) {
      this.ui.toast('erreur', e.message);
    }
    setTimeout(() => (bouton.disabled = false), 5000);
  }

  async quitterDemo() {
    if (!window.confirm(t('Quitter la démo ? Sa fenêtre se ferme ; ton QG n’est pas touché.'))) return;
    try {
      await api('/api/demo/quitter', {});
    } catch {
      /* déjà arrêtée */
    }
    document.body.replaceChildren(h('div', { class: 'demo-fin' }, h('p', {}, t('Démo fermée. Tu peux fermer cette fenêtre.'))));
    setTimeout(() => window.close(), 400);
  }

  // Vérifier la dernière version publiée et, s'il y en a une plus récente, la lancer : le QG se ferme
  // (dossiers enregistrés), se met à jour, se relance, et la page se recharge toute seule.
  blocMaj() {
    const boite = h('div', { class: 'param-maj' });
    const verifier = async (forcer = false) => {
      boite.replaceChildren(h('div', { class: 'vide' }, t('Vérification sur GitHub…')));
      try {
        this.majInfo = await api('/api/maj' + (forcer ? '?forcer=1' : ''));
        afficher(this.majInfo);
      } catch (e) {
        boite.replaceChildren(h('div', { class: 'vide erreur' }, e.message), h('button', { class: 'petit', type: 'button', on: { click: () => verifier(true) } }, t('Réessayer')));
      }
    };
    const afficher = (m) => {
      if (!m.disponible) {
        boite.replaceChildren(
          h('p', { class: 'ok-texte' }, '✓ ' + t('Tu as la dernière version ({version}).', { version: m.actuelle })),
          h('button', { class: 'petit', type: 'button', on: { click: () => verifier(true) } }, t('Vérifier à nouveau')));
        return;
      }
      const date = m.publieLe ? new Date(m.publieLe).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      const lancer = h('button', { class: 'petit ok', type: 'button', disabled: m.dev ? true : null, on: { click: async () => {
        if (!window.confirm(t('Mettre à jour en version {version} ? Le QG va se fermer, se mettre à jour et se relancer tout seul (environ une minute). Les dossiers en cours sont enregistrés et reprendront.', { version: m.derniere }))) return;
        lancer.disabled = true;
        try {
          await api('/api/maj/lancer', {});
          boite.replaceChildren(h('p', { class: 'ok-texte' }, t('Mise à jour vers la version {version} en cours : le QG se ferme, se met à jour et se relance. Cette page se rechargera toute seule.', { version: m.derniere })));
        } catch (e) {
          this.ui.toast('erreur', e.message);
          lancer.disabled = false;
        }
      } } }, t('Mettre à jour maintenant'));
      boite.replaceChildren(...[
        h('p', {}, h('b', {}, t('Version {version} disponible', { version: m.derniere })), date ? h('span', { class: 'meta' }, ' · ' + t('publiée le {date}', { date })) : null, h('span', { class: 'meta' }, ' · ' + t('tu as la {version}', { version: m.actuelle }))),
        m.notes ? h('details', { class: 'notes-maj', open: true }, h('summary', {}, t('Nouveautés')), md(m.notes, { titres: 'compact' })) : null,
        h('div', { class: 'boutons' }, lancer, h('a', { class: 'petit bouton-lien', href: m.url, target: '_blank', rel: 'noopener noreferrer' }, t('Voir sur GitHub'))),
        m.dev ? h('p', { class: 'meta' }, t('Installation de développement (dossiers tests ou SPEC.md présents) : la mise à jour automatique est désactivée ici pour ne pas écraser ton travail.')) : null,
      ].filter(Boolean));
    };
    if (this.majInfo) afficher(this.majInfo);
    else boite.append(h('button', { class: 'petit', type: 'button', on: { click: () => verifier(true) } }, t('Vérifier les mises à jour')));
    return boite;
  }
}
