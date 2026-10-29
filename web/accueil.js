// Configuration guidée du premier lancement : langues, comptes IA, dossiers racines et étages,
// mode de travail, connecteurs et dictée. Tout reste modifiable ensuite dans Réglages.
import { h, ouvrirModale, api } from './modale.js';
import { t, LANGUES_INTERFACE, LANGUES_IA } from './i18n.js';
import { TYPES_PROJET } from './parametres.js';
import { infos as infosPlateforme, dicteeSysteme } from './plateforme.js';
import { ligneI, exempleAide } from './aide.js';

const ETAPES = ['Bienvenue', 'Comptes IA', 'Tes projets', 'Mode de travail', 'Connecteurs et dictée', 'C’est prêt'];

export class Accueil {
  constructor(store, ui) {
    this.store = store;
    this.ui = ui;
    this.m = null;
    this.etape = 0;
    this.projets = null;
    this.choix = new Map(); // dossier -> { coche, nom }
  }

  get ouvert() {
    return !!this.m;
  }

  ouvrir(depuisReglages = false) {
    if (this.m) return;
    this.etape = 0;
    this.depuisReglages = depuisReglages;
    this.m = ouvrirModale({ titre: t('Bienvenue au QG des agents'), classe: 'accueil', bloquante: !depuisReglages, surFermer: () => (this.m = null) });
    this.rendre();
  }

  maj() {
    if (!this.m) return;
    const actif = document.activeElement;
    if (actif && this.m.boite.contains(actif) && /^(INPUT|TEXTAREA|SELECT)$/.test(actif.tagName)) return;
    if ([1, 4].includes(this.etape)) this.rendre(); // comptes connectés, dictée : mise à jour en direct
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

  rendre() {
    if (!this.m) return;
    this.m.titre(t(ETAPES[this.etape]));
    const fil = h('ol', { class: 'accueil-fil' }, ETAPES.map((e, i) => h('li', { class: i === this.etape ? 'courante' : i < this.etape ? 'faite' : '' }, t(e))));
    const fn = [this.bienvenue, this.comptes, this.projetsEtape, this.mode, this.connecteurs, this.pret][this.etape];
    const { contenu, suivant, libelleSuivant, peutSuivre = true } = fn.call(this);
    const pied = h('div', { class: 'accueil-pied' },
      this.etape > 0 ? h('button', { class: 'petit', type: 'button', on: { click: () => { this.etape--; this.rendre(); } } }, '← ' + t('Retour')) : h('span'),
      h('span', { class: 'meta' }, t('Étape {i} sur {n}', { i: this.etape + 1, n: ETAPES.length })),
      h('button', {
        class: 'envoyer', type: 'button', disabled: peutSuivre ? null : true,
        on: { click: async () => { if (suivant && (await suivant()) === false) return; if (this.etape < ETAPES.length - 1) { this.etape++; this.rendre(); } } },
      }, libelleSuivant || t('Continuer') + ' →'));
    this.m.corps.replaceChildren(fil, h('div', { class: 'accueil-contenu' }, ...[].concat(contenu).filter(Boolean)), pied);
  }

  // 1. Bienvenue : langues et prénom
  bienvenue() {
    const R = this.store.reglages;
    const selLangue = h('select', { class: 'champ', on: { change: async (e) => { await this.poster('/api/reglages', { langueInterface: e.target.value }); this.ui.changerLangue(e.target.value); this.rendre(); } } },
      LANGUES_INTERFACE.map((l) => h('option', { value: l.id, selected: l.id === R.langueInterface ? true : null }, l.nom)));
    const selIA = h('select', { class: 'champ', on: { change: (e) => this.poster('/api/reglages', { langueIA: e.target.value }) } },
      LANGUES_IA.map((l) => h('option', { value: l.id, selected: l.id === R.langueIA ? true : null }, l.nom)));
    const prenom = h('input', { class: 'champ', value: R.utilisateur || '', maxlength: '40', placeholder: t('ex. Camille') });
    return {
      contenu: [
        h('div', { class: 'accueil-intro' },
          h('p', { class: 'gros' }, t('Un immeuble d’agents IA qui travaillent pour toi.')),
          h('ul', {},
            h('li', {}, t('Tu écris une demande au DG (directeur) en bas de l’écran.')),
            h('li', {}, t('Il la découpe en tâches et choisit pour chacune le bon modèle de ton compte et le bon niveau de réflexion.')),
            h('li', {}, t('Les agents travaillent en parallèle, un étage par projet. Tu les regardes réfléchir, tu réponds à leurs questions, tu valides ce qui doit l’être.')))),
        ligneI('accueil-langue', t('Langue de l’interface'), [
          t('La langue des menus, des boutons et des messages du QG.'),
          exempleAide(t('tu choisis English : tout l’écran passe en anglais ; les agents, eux, écrivent dans la langue des IA, réglée juste en dessous.')),
        ], selLangue),
        ligneI('accueil-langue-ia', t('Langue des IA'), [
          t('Le DG et les agents réfléchissent, écrivent et te répondent dans cette langue.'),
          exempleAide(t('écran en français et IA en anglais : les menus restent en français, mais les réponses, les rapports et les commentaires du code arrivent en anglais.')),
        ], selIA),
        ligneI('accueil-prenom', t('Ton prénom (facultatif)'), [t('Facultatif : le DG s’adresse à toi par ton prénom.')], prenom),
      ],
      suivant: async () => {
        if ((prenom.value || '') !== (R.utilisateur || '')) await this.poster('/api/reglages', { utilisateur: prenom.value });
      },
      libelleSuivant: t('Commencer') + ' →',
    };
  }

  // 2. Comptes IA : le formulaire de Réglages › Comptes IA (Claude, ChatGPT · Codex, agents ACP)
  comptes() {
    const connectes = this.store.comptes.filter((c) => c.connecte);
    return {
      contenu: [
        h('p', {}, t('Connecte au moins un compte d’IA : un seul suffit, quel que soit le fournisseur. Tu pourras en ajouter d’autres quand tu veux et choisir lequel travaille pour chaque demande.')),
        ...this.ui.parametres.comptes({ accueil: true, apres: () => this.rendre() }),
        connectes.length ? h('p', { class: 'ok-texte' }, '✓ ' + t('{n} compte(s) connecté(s).', { n: connectes.length })) : h('p', { class: 'meta' }, t('En attente de connexion… cette page se met à jour toute seule.')),
      ],
      libelleSuivant: connectes.length ? t('Continuer') + ' →' : t('Plus tard') + ' →',
    };
  }

  // 3. Dossiers racines et étages
  projetsEtape() {
    const R = this.store.reglages;
    const racines = R.racines || [];
    if (!this.projets) {
      api('/api/projets').then((r) => {
        this.projets = r.projets;
        for (const p of r.projets) if (!this.choix.has(p.dossier)) this.choix.set(p.dossier, { coche: !p.ignore && !p.racine, nom: p.nom });
        if (this.etape === 2) this.rendre();
      }).catch(() => null);
    }
    const majRacines = async (liste) => {
      const r = await this.poster('/api/racines', { racines: liste });
      if (!r) return;
      this.store.reglages = { ...this.store.reglages, racines: r.racines, racinesValides: r.racines };
      this.projets = r.projets;
      for (const p of r.projets) if (!this.choix.has(p.dossier)) this.choix.set(p.dossier, { coche: !p.ignore && !p.racine, nom: p.nom });
      this.rendre();
    };
    const manuel = h('input', { class: 'champ', placeholder: t('ou colle un chemin, ex. D:\\Projets') });
    const nouveaux = (this.projets || []).filter((p) => !p.etage);
    const deja = (this.projets || []).filter((p) => p.etage);
    return {
      contenu: [
        h('p', {}, t('Où sont tes projets ? Choisis un ou plusieurs dossiers (par exemple D:\\Dev pour tes jeux, D:\\IA pour ComfyUI). Chaque projet trouvé dedans peut devenir un étage de l’immeuble.')),
        h('p', { class: 'meta' }, t('Les agents écriront librement dans ces dossiers. Partout ailleurs, ils te demanderont la permission.')),
        racines.length ? h('ul', { class: 'param-liste' }, racines.map((r) => h('li', {}, h('code', {}, r), h('button', { class: 'petit danger', type: 'button', on: { click: () => majRacines(racines.filter((x) => x !== r)) } }, t('Retirer'))))) : null,
        h('div', { class: 'param-ajout' },
          h('button', { class: 'petit ok', type: 'button', on: { click: async (ev) => { const b = ev.currentTarget; if (b.disabled) return; const txt = b.textContent; b.disabled = true; b.textContent = t('Fenêtre ouverte…'); let r = null; try { r = await this.poster('/api/choisir-dossier', { titre: t('Choisis un dossier qui contient tes projets') }); } finally { b.disabled = false; b.textContent = txt; } if (r && r.chemin) majRacines([...racines, r.chemin]); } } }, t('Choisir un dossier…')),
          manuel,
          h('button', { class: 'petit', type: 'button', on: { click: () => manuel.value.trim() && majRacines([...racines, manuel.value.trim()]) } }, t('Ajouter'))),
        racines.length && this.projets ? h('h4', {}, t('Projets trouvés')) : null,
        racines.length && this.projets && !nouveaux.some((p) => !p.racine) && !deja.length ? h('div', { class: 'vide' }, t('Aucun projet reconnu dans ces dossiers (un projet = un dossier avec .git, package.json, un projet Roblox, Unreal, Unity, Godot, Python…). Tu pourras ajouter des étages à la main dans Réglages.')) : null,
        ...nouveaux.map((p) => {
          const c = this.choix.get(p.dossier) || { coche: true, nom: p.nom };
          const nom = h('input', { class: 'champ', value: c.nom, maxlength: '40', on: { input: (e) => this.choix.set(p.dossier, { ...c, nom: e.target.value }) } });
          return h('label', { class: 'accueil-projet' },
            h('input', { type: 'checkbox', checked: c.coche, on: { change: (e) => this.choix.set(p.dossier, { ...c, coche: e.target.checked, nom: nom.value }) } }),
            nom,
            h('span', { class: 'badge' }, p.racine ? t('Dossier entier') : t(TYPES_PROJET[p.type] || p.type)),
            h('code', { class: 'meta' }, p.dossier),
            p.racine ? h('small', { class: 'meta' }, t('Utiliser ce dossier entier comme étage')) : null);
        }),
        deja.length ? h('p', { class: 'meta' }, t('Déjà dans l’immeuble : {liste}', { liste: deja.map((p) => p.nom).join(', ') })) : null,
        h('p', { class: 'meta' }, t('Un bac à sable (petit projet de test sans risque) est déjà là pour essayer.')),
      ],
      suivant: async () => {
        const liste = nouveaux.filter((p) => this.choix.get(p.dossier)?.coche).map((p) => ({ dossier: p.dossier, nom: this.choix.get(p.dossier).nom }));
        if (!liste.length) return true;
        const r = await this.poster('/api/etages/ajouter-lot', { projets: liste });
        if (r && r.erreurs && r.erreurs.length) this.ui.toast('warn', r.erreurs.join(' · '));
        if (r) this.ui.toast('info', t('{n} étage(s) ajouté(s).', { n: r.faits.length }));
        this.projets = null;
        return true;
      },
      libelleSuivant: nouveaux.some((p) => this.choix.get(p.dossier)?.coche) ? t('Créer les étages') + ' →' : t('Continuer') + ' →',
    };
  }

  // 4. Mode de travail
  mode() {
    const R = this.store.reglages;
    const choix = (id, titre, texte) => h('label', { class: 'param-choix' + (R.modeTravail === id ? ' choisi' : '') },
      h('input', { type: 'radio', name: 'mode-accueil', checked: R.modeTravail === id, on: { change: async () => { const r = await this.poster('/api/reglages', { modeTravail: id }); if (r) this.store.reglages = { ...this.store.reglages, ...r }; this.rendre(); } } }),
      h('span', {}, h('b', {}, titre), h('br'), h('small', {}, texte)));
    return {
      contenu: [
        h('p', {}, t('Comment les agents travaillent-ils ?')),
        choix('auto', t('Autonome (recommandé)'), t('Les agents lisent partout, écrivent librement dans tes dossiers et avancent sans te demander à chaque geste. Ce qui est risqué reste bloqué : par le mode auto de Claude Code pour Claude, par le bac à sable pour Codex, par le QG pour les autres agents.')),
        choix('prudent', t('Prudent'), t('Chaque commande ou écriture hors de tes dossiers lève la main et attend ton accord. Plus sûr, mais tu seras souvent sollicité. Seul Claude sait travailler ainsi : en Prudent, Codex et les autres agents ne prennent pas les tâches qui écrivent.')),
        h('div', { class: 'accueil-garde' },
          h('b', {}, t('Dans tous les cas :')),
          h('ul', {},
            h('li', {}, t('écrire hors de tes dossiers racines demande ton accord ;')),
            h('li', {}, t('jamais de git push, de publication ni d’envoi sans ton accord ;')),
            h('li', {}, t('les agents ne peuvent ni modifier le QG, ni lire les identifiants de tes comptes IA ;')),
            h('li', {}, t('un bouton « Arrêt d’urgence » coupe tout instantanément.')))),
      ],
    };
  }

  // 5. Connecteurs et dictée
  connecteurs() {
    const dic = this.store.dictee || {};
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    return {
      contenu: [
        h('h4', {}, t('Connecteurs MCP')),
        h('p', { class: 'meta' }, t('Les connecteurs de ton compte claude.ai (Notion, Drive, Gmail…) ne sont jamais donnés aux agents par défaut. Tu pourras les activer un par un dans Réglages › Connecteurs MCP. Les serveurs MCP déclarés par un projet (.mcp.json) demandent ton accord à chaque appel avec Claude ; Codex et les autres agents ne les reçoivent que si tu les règles sur « Auto ».')),
        h('h4', {}, t('Dictée')),
        dic.disponible
          ? h('p', {}, '✓ ' + t('Dictée locale prête : bouton 🎤 ou {raccourci}.', { raccourci: infosPlateforme(this.store).raccourciDictee }))
          : !infosPlateforme(this.store).dicteeLocale
            ? h('div', {},
              h('p', { class: 'meta' }, t('La dictée locale (Whisper) n’est pas encore disponible sur Mac. Utilise {systeme} dans la zone de saisie : ça marche partout.', { systeme: dicteeSysteme() })),
              h('button', { class: 'petit', type: 'button', disabled: true, title: t('Pas encore disponible sur Mac') }, t('Installer la dictée locale')))
            : h('div', {},
              h('p', { class: 'meta' }, t('Tu dictes souvent ? La dictée locale (Whisper, gratuite, sur ton PC) s’installe en un clic : environ 4 Go avec une carte NVIDIA, 1,5 Go sans. Sinon, Win+H (dictée de Windows) marche partout.')),
              h('button', { class: 'petit', type: 'button', on: { click: () => this.poster('/api/dictee/installer', {}, t('L’installation s’ouvre dans une fenêtre à part.')) } }, t('Installer la dictée locale'))),
        h('h4', {}, t('Notifications')),
        perm === 'granted' ? h('p', {}, '✓ ' + t('Notifications activées.'))
          : perm === 'default' ? h('div', {}, h('p', { class: 'meta' }, t('Pour être prévenu quand un agent lève la main ou pose une question, même si le QG est en arrière-plan.')), h('button', { class: 'petit', type: 'button', on: { click: async () => { await this.ui.notifs.activer(); this.rendre(); } } }, t('Activer les notifications')))
            : h('p', { class: 'meta' }, t('Notifications du navigateur indisponibles : la cloche du QG suffit.')),
      ],
    };
  }

  // 6. Prêt
  pret() {
    return {
      contenu: [
        h('p', { class: 'gros' }, t('Tout est prêt.')),
        h('ul', { class: 'accueil-astuces' },
          h('li', {}, t('Écris ta demande en bas de l’écran (Entrée pour envoyer). Tu peux joindre des captures et dicter.')),
          h('li', {}, t('◀ ▶ ou Page précédente / suivante pour changer d’étage ; la colonne de gauche montre tout l’immeuble.')),
          h('li', {}, t('Clique sur un agent pour voir sa fiche, sa réflexion en direct et son terminal.')),
          h('li', {}, t('⚡ en haut : ta consommation en temps réel et les limites de ton forfait.')),
          h('li', {}, t('📄 Documents : les fichiers .md produits par les agents, bien mis en forme.')),
          h('li', {}, t('⚙ Réglages : comptes, dossiers, connecteurs, prénoms et skins des agents, blagues de Joy…'))),
        h('p', { class: 'meta' }, t('Pour un premier essai sans risque, va à l’étage « Bac à sable » et demande par exemple : « Ajoute des tests au module de chemin et un petit bench ».')),
      ],
      suivant: async () => {
        const r = await this.poster('/api/onboarding/terminer', {});
        if (r) this.store.reglages = { ...this.store.reglages, ...r };
        this.m?.fermer();
        return false;
      },
      libelleSuivant: t('Ouvrir le QG'),
    };
  }
}
