// Fenêtre « Réglages » : tout se règle ici, sans toucher aux fichiers.
// Général (langues, prénom, mode de travail, DG), comptes Claude, dossiers et étages, connecteurs MCP,
// équipe (prénoms, skins), happiness manager (édition, import, export), dictée et notifications.
import { h, ouvrirModale, api } from './modale.js';
import { t, LANGUES_INTERFACE, LANGUES_IA, locale } from './i18n.js';
import { rendreMcp } from './reglages.js';
import { apparence, spriteAvatar, PALETTE_PEAUX, PALETTE_CHEVEUX, PALETTE_PANTALONS } from './sprites.js';
import { TERMINAUX } from './etat.js';
import { md } from './markdown.js';

const SECTIONS = [
  ['general', 'Général'],
  ['comptes', 'Comptes Claude'],
  ['dossiers', 'Dossiers et étages'],
  ['mcp', 'Connecteurs MCP'],
  ['equipe', 'Équipe et skins'],
  ['bonheur', 'Happiness manager'],
  ['dictee', 'Dictée et notifications'],
  ['apropos', 'À propos'],
];
export const TYPES_PROJET = {
  roblox: 'Jeu Roblox', unreal: 'Unreal', unity: 'Unity', godot: 'Godot', comfyui: 'ComfyUI', web: 'Web / Node', python: 'Python',
  projet: 'Projet', direction: 'Direction', bac: 'Bac à sable', hall: 'Hall', serveur: 'Serveurs', atelier3d: 'Atelier 3D', etudes: 'Études',
};
const COIFFURES = 6;
export const DEPOT_GITHUB = 'https://github.com/Ishine93/agents-hq';

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
  }

  get ouvert() {
    return !!this.m;
  }

  // focus : personnage à ouvrir dans la section Équipe ('@dg', '@joy' ou un prénom).
  ouvrir(section = null, focus = null) {
    if (section) this.section = section;
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
    if (this.section === 'bonheur' || this.section === 'equipe') return; // éditeurs locaux : pas de redessin automatique
    this.rendre();
  }

  rendre() {
    if (!this.m) return;
    this.enRetard = false;
    this.m.titre(t('Réglages'));
    this.nav.replaceChildren(...SECTIONS.map(([id, lib]) => h('button', { type: 'button', class: id === this.section ? 'actif' : '', on: { click: () => this.aller(id) } }, t(lib))));
    const haut = this.contenu.scrollTop;
    const fn = { general: this.general, comptes: this.comptes, dossiers: this.dossiers, mcp: this.mcp, equipe: this.equipe, bonheur: this.bonheur, dictee: this.dictee, apropos: this.apropos }[this.section];
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
    const modeles = S.modeles[S.compteDefaut] || Object.values(S.modeles)[0] || [];
    const dg = R.dg || {};
    const mod = modeles.find((x) => x.id === dg.modele) || modeles[0];
    const selMod = h('select', { class: 'champ', on: { change: () => this.reglage({ dg: { modele: selMod.value } }).then(() => this.rendre()) } }, modeles.map((x) => h('option', { value: x.id, selected: x.id === (mod && mod.id) ? true : null }, x.nom || x.id)));
    const selEff = h('select', { class: 'champ', on: { change: () => this.reglage({ dg: { effort: selEff.value } }) } }, ((mod && mod.efforts) || []).map((x) => h('option', { value: x, selected: x === dg.effort ? true : null }, x)));
    const plafond = (cle) => {
      const c = champ({ type: 'number', min: '0', max: '64', value: String(R[cle] ?? 0), style: { width: '80px' } });
      c.addEventListener('change', () => this.reglage({ [cle]: Math.max(0, Math.min(64, parseInt(c.value, 10) || 0)) }, t('Enregistré.')));
      return c;
    };
    const rojo = h('input', { type: 'checkbox', checked: !!R.rojoPortsAuto, on: { change: (e) => this.reglage({ rojoPortsAuto: e.target.checked }) } });
    return [
      ligne(t('Langue de l’interface'), selLangue),
      ligne(t('Langue des IA'), selIA, h('small', { class: 'meta' }, t('Le DG et les agents réfléchissent, écrivent et te répondent dans cette langue.'))),
      ligne(t('Ton prénom'), prenom, h('small', { class: 'meta' }, t('Facultatif : le DG s’adresse à toi par ton prénom.'))),
      h('h4', {}, t('Mode de travail des agents')),
      mode('auto', t('Autonome (recommandé)'), t('Les agents lisent partout et écrivent librement dans tes dossiers racines. Écrire ailleurs, publier ou envoyer quelque chose demande ton accord. Les commandes sont jugées par le mode auto de Claude Code.')),
      mode('prudent', t('Prudent'), t('Toute action qui n’est pas une simple lecture ou une écriture dans tes dossiers lève la main : tu valides chaque commande. Plus sûr, plus lent.')),
      h('h4', {}, t('DG par défaut')),
      modeles.length ? ligne(t('Modèle et effort'), selMod, selEff, h('small', { class: 'meta' }, t('Modifiable aussi demande par demande, en bas de l’écran.'))) : h('div', { class: 'vide' }, t('Connecte un compte pour choisir le modèle du DG.')),
      h('h4', {}, t('Parallélisme')),
      ligne(t('Tâches en même temps (total)'), plafond('plafondGlobal'), h('small', { class: 'meta' }, t('0 = sans limite : seules les dépendances entre tâches comptent.'))),
      ligne(t('Tâches en même temps (par étage)'), plafond('plafondEtage')),
      h('h4', {}, t('Divers')),
      ligne(t('Ports Rojo automatiques'), h('label', { class: 'param-case' }, rojo, ' ', t('Donner un port Rojo unique à chaque nouveau jeu Roblox détecté (écrit dans son default.project.json).'))),
      h('h4', {}, t('Git')),
      ligne(t('Git sans demander'),
        h('label', { class: 'param-case' },
          h('input', { type: 'checkbox', checked: !!R.gitAuto, on: { change: (e) => {
            if (e.target.checked && !window.confirm(t('Les agents pourront faire pull, commit, branche, merge et push sans te demander, quand leur mission le demande. Activer ?'))) {
              e.target.checked = false;
              return;
            }
            this.reglage({ gitAuto: e.target.checked }, e.target.checked ? t('Git autorisé sans demande.') : t('Git push redemande ton accord.'));
          } } }),
          ' ', t('Autoriser les agents à faire toutes les opérations git (pull, commit, branche, merge, push) sans te demander.')),
        h('small', { class: 'meta' }, t('Pratique si tu travailles avec Git et que tu relis l’historique ; sinon, laisse décoché : un git push te sera toujours demandé. S’applique aux prochaines tâches.'))),
      h('div', { class: 'boutons' }, h('button', { class: 'petit', type: 'button', on: { click: () => { this.m.fermer(); this.ui.accueil.ouvrir(true); } } }, t('Relancer la configuration guidée'))),
    ];
  }

  // ---------------------------------------------------------------- comptes
  comptes() {
    const S = this.store;
    const R = S.reglages;
    const lignes = S.comptes.map((c) => {
      const nom = champ({ value: c.nom, maxlength: '40', 'aria-label': t('Nom du compte') });
      nom.addEventListener('change', () => this.poster('/api/comptes/' + c.id + '/modifier', { nom: nom.value }, t('Compte renommé.')));
      const action = (lib, route, opts = {}) => h('button', {
        class: 'petit' + (opts.danger ? ' danger' : ''), type: 'button', title: opts.titre || null,
        on: {
          click: async () => {
            if (opts.confirmer && !window.confirm(opts.confirmer)) return;
            const r = await this.poster('/api/comptes/' + c.id + '/' + route, opts.corps || {}, opts.ok || null);
            if (r && r.comptes) {
              S.comptes = r.comptes;
              S.compteDefaut = r.compteDefaut;
              this.rendre();
              this.ui.majComptes();
            }
          },
        },
      }, lib);
      return h('div', { class: 'param-compte' + (c.connecte ? ' connecte' : '') },
        h('div', { class: 'param-compte-tete' },
          nom,
          h('span', { class: 'badge ' + (c.connecte ? 'st-ok' : 'st-ko') }, c.connecte ? t('connecté') : t('non connecté')),
          c.id === S.compteDefaut ? h('span', { class: 'badge perso' }, t('par défaut')) : null),
        h('div', { class: 'meta' }, [c.abonnement, c.email, c.partage ? t('partagé avec Claude Code sur ce PC') : null].filter(Boolean).join(' · ') || ' '),
        h('div', { class: 'meta' }, h('code', {}, c.dossier || '')),
        h('div', { class: 'boutons' },
          c.type === 'api' ? null : action(c.connecte ? t('Reconnecter') : t('Se connecter'), 'connecter', { ok: t('Une fenêtre de connexion s’est ouverte : suis les étapes dans ton navigateur.'), titre: t('Ouvre la connexion officielle de Claude Code (navigateur)') }),
          c.connecte && c.type !== 'api' ? action(t('Déconnecter'), 'deconnecter', { confirmer: t('Déconnecter {nom} ? Les dossiers en cours sur ce compte s’arrêteront.', { nom: c.nom }) }) : null,
          c.id !== S.compteDefaut ? action(t('Par défaut'), 'modifier', { corps: { defaut: true }, titre: t('Compte choisi par défaut pour les nouvelles demandes') }) : null,
          c.connecte ? action(t('Lire les limites'), 'limites', { titre: t('Relit les limites du forfait (sans tokens)') }) : null,
          S.comptes.length > 1 ? action(t('Retirer'), 'supprimer', { danger: true, confirmer: t('Retirer {nom} de la liste ? Son dossier de connexion reste sur le disque.', { nom: c.nom }) }) : null));
    });
    const nouveau = champ({ placeholder: t('Nom du nouveau compte (ex. Claude perso)'), maxlength: '40' });
    const ajouter = async (partage = false) => {
      const r = await this.poster('/api/comptes/ajouter', { nom: nouveau.value, partage }, partage ? t('Compte ajouté.') : t('Compte ajouté : une fenêtre de connexion s’est ouverte, suis les étapes dans ton navigateur.'));
      if (r) nouveau.value = '';
    };
    const dejaPartage = S.comptes.some((c) => c.partage);
    return [
      h('p', { class: 'meta' }, t('Chaque compte est une connexion Claude séparée (abonnement Pro, Max, Team ou Enterprise). La connexion se fait dans une petite fenêtre puis dans ton navigateur : le QG ne voit jamais ton mot de passe ni ton jeton.')),
      ...lignes,
      h('h4', {}, t('Ajouter un compte')),
      h('div', { class: 'param-ajout' }, nouveau, h('button', { class: 'petit ok', type: 'button', on: { click: () => ajouter(false) } }, t('Ajouter et se connecter'))),
      R.claudeCodeLocal && !dejaPartage
        ? h('div', { class: 'param-ajout' }, h('button', { class: 'petit', type: 'button', on: { click: () => ajouter(true) } }, t('Utiliser le compte Claude Code déjà connecté sur ce PC')), h('small', { class: 'meta' }, t('Partage la connexion de Claude Code (dossier .claude) : rien à refaire.')))
        : null,
      h('h4', {}, t('Ou avec une clé API')),
      this.ajoutCleApi(),
      h('p', { class: 'meta' }, t('Tu peux aussi double-cliquer sur ajouter-un-compte.bat dans le dossier du QG.')),
    ];
  }

  // Compte « clé API » (console.anthropic.com) : facturé au token, sans connexion par navigateur.
  ajoutCleApi() {
    const nom = champ({ placeholder: t('Nom (ex. Claude API)'), maxlength: '40', style: { maxWidth: '200px' } });
    const cle = champ({ type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', 'aria-label': t('Clé API') });
    return h('div', {},
      h('div', { class: 'param-ajout' }, nom, cle,
        h('button', { class: 'petit', type: 'button', on: { click: async () => {
          if (!cle.value.trim()) return;
          const r = await this.poster('/api/comptes/ajouter', { nom: nom.value || t('Claude API'), cleApi: cle.value.trim() }, t('Compte ajouté.'));
          if (r) {
            cle.value = '';
            nom.value = '';
          }
        } } }, t('Ajouter'))),
      h('small', { class: 'meta' }, t('Facturée au token par Anthropic (console.anthropic.com). La clé reste sur ce PC, dans config\\comptes.json ; les agents ne peuvent pas la lire.')));
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
    const etages = S.etages.filter((e) => e.id !== 'hall').sort((a, b) => b.ordre - a.ordre);
    const libres = (this.projets || []).filter((p) => !p.etage && !p.ignore);
    return [
      h('p', { class: 'meta' }, t('Tes dossiers racines contiennent tes projets : chaque projet peut devenir un étage. Les agents écrivent librement dans ces dossiers ; écrire ailleurs leur demande ton accord.')),
      h('h4', {}, t('Dossiers racines')),
      racines.length
        ? h('ul', { class: 'param-liste' }, racines.map((r) => h('li', {},
          h('code', {}, r),
          (R.racinesValides || []).includes(r) ? null : h('span', { class: 'badge st-ko' }, t('introuvable')),
          h('button', { class: 'petit danger', type: 'button', on: { click: () => window.confirm(t('Retirer {r} des dossiers racines ?', { r })) && majRacines(racines.filter((x) => x !== r)) } }, t('Retirer')))))
        : h('div', { class: 'vide' }, t('Aucun dossier racine : ajoute le dossier où sont tes projets.')),
      h('div', { class: 'param-ajout' },
        h('button', { class: 'petit ok', type: 'button', on: { click: async () => { const r = await this.poster('/api/choisir-dossier', { titre: t('Choisis un dossier qui contient tes projets') }); if (r && r.chemin) ajouterRacine(r.chemin); } } }, t('Choisir un dossier…')),
        manuel,
        h('button', { class: 'petit', type: 'button', on: { click: () => ajouterRacine(manuel.value.trim()) } }, t('Ajouter'))),
      h('h4', {}, t('Étages')),
      h('div', { class: 'param-etages' }, etages.map((e) => this.ligneEtage(e))),
      h('h4', {}, t('Projets détectés sans étage')),
      !this.projets ? h('div', { class: 'vide' }, t('Recherche…'))
        : libres.length
          ? h('ul', { class: 'param-liste' }, libres.map((p) => h('li', {},
            h('span', { class: 'badge' }, t(TYPES_PROJET[p.type] || p.type)), ' ', h('b', {}, p.nom), ' ', h('code', { class: 'meta' }, p.dossier),
            h('button', { class: 'petit ok', type: 'button', on: { click: async () => { if (await this.poster('/api/etages/ajouter', { dossier: p.dossier }, t('Étage ajouté.'))) { this.projets = null; this.rendre(); } } } }, t('Ajouter l’étage')),
            h('button', { class: 'petit', type: 'button', on: { click: async () => { if (await this.poster('/api/etages/ignorer', { dossier: p.dossier })) { this.projets = null; this.rendre(); } } } }, t('Ignorer')))))
          : h('div', { class: 'vide' }, t('Tous les projets détectés ont un étage.')),
      h('div', { class: 'boutons' },
        h('button', { class: 'petit', type: 'button', on: { click: async () => { const r = await this.poster('/api/choisir-dossier', { titre: t('Choisis le dossier d’un projet') }); if (r && r.chemin && (await this.poster('/api/etages/ajouter', { dossier: r.chemin }, t('Étage ajouté.')))) { this.projets = null; this.rendre(); } } } }, t('Ajouter un autre dossier comme étage…')),
        h('button', { class: 'petit', type: 'button', on: { click: () => { this.projets = null; this.rendre(); } } }, t('Relancer la détection'))),
    ];
  }

  ligneEtage(e) {
    const nom = champ({ value: e.nom, maxlength: '40', 'aria-label': t('Nom de l’étage') });
    nom.addEventListener('change', () => this.poster('/api/etages/' + encodeURIComponent(e.id) + '/modifier', { nom: nom.value }, t('Étage renommé.')));
    // Étages qui font partie de l'immeuble : ni désactivables ni retirables.
    const fixe = ['direction', 'salle-pause', 'salle-repos'].includes(e.id);
    const actif = h('input', { type: 'checkbox', checked: e.actif, disabled: fixe ? true : null, on: { change: (ev) => this.poster('/api/etages/' + encodeURIComponent(e.id) + '/modifier', { actif: ev.target.checked }) } });
    return h('div', { class: 'param-etage' + (e.actif ? '' : ' inactif') },
      h('div', { class: 'param-etage-tete' },
        nom,
        h('span', { class: 'badge' }, t(TYPES_PROJET[e.type] || e.type)),
        h('label', { class: 'param-case', title: t('Un étage inactif n’existe plus pour le DG') }, actif, ' ', t('en service'))),
      h('div', { class: 'meta' }, h('code', {}, (e.dossiers || [e.projet]).filter(Boolean).join(' + ') || '—')),
      h('div', { class: 'boutons' },
        e.projet ? h('button', { class: 'petit', type: 'button', on: { click: () => this.editerFiche(e) } }, t('Fiche du projet')) : null,
        e.projet ? h('button', { class: 'petit', type: 'button', on: { click: () => this.ui.lecteur.documents(e.id) } }, t('Documents .md')) : null,
        fixe ? null : h('button', { class: 'petit danger', type: 'button', on: { click: async () => { if (window.confirm(t('Retirer l’étage {nom} ? Le projet lui-même n’est pas touché.', { nom: e.nom })) && (await this.poster('/api/etages/' + encodeURIComponent(e.id) + '/retirer', {}))) { this.projets = null; this.rendre(); } } } }, t('Retirer'))));
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
      h('p', { class: 'meta' }, t('Clique sur un personnage pour changer son nom et son apparence. Un nouveau nom s’applique tout de suite, même à un agent au travail. Les nouvelles recrues prennent un prénom au hasard parmi ceux de cette liste.')),
      h('p', { class: 'meta' }, t('La couleur de chemise des agents indique leur modèle (Opus, Sonnet…) : elle ne change que pour le DG et Joy.')),
      grille,
    ];
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
    return carte;
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
      h('p', { class: 'meta' }, t('Joy fait le tour des étages et raconte blagues et anecdotes aux agents qui attendent. Le stock dépend de la langue des IA.')),
      h('dl', {},
        h('dt', {}, t('Stock')), h('dd', {}, t('{b} blagues · {f} anecdotes · {a} phrases de pause', { b: tot.blagues || 0, f: tot.faits || 0, a: tot.ambiance || 0 })),
        h('dt', {}, t('Mise à jour')), h('dd', {}, maj + (B.source ? ' (' + B.source + ')' : ''))),
      ligne(t('Récolte automatique'), h('label', { class: 'param-case' }, h('input', { type: 'checkbox', checked: R.recolteAuto !== false, on: { change: (e) => this.reglage({ recolteAuto: e.target.checked }) } }), ' ', t('Toutes les 12 h : blagues gratuites en ligne, plus quelques appels Haiku (très peu de tokens).'))),
      ligne(t('Durée des bulles'),
        h('select', { class: 'champ', on: { change: (e) => this.reglage({ dureeBulles: Number(e.target.value) }, t('Enregistré.')) } },
          [[1, t('Normale')], [1.5, t('Un peu plus longue (×1,5)')], [2, t('Longue (×2)')], [3, t('Très longue (×3)')]].map(([v, lib]) =>
            h('option', { value: String(v), selected: Number(R.dureeBulles || 1) === v ? true : null }, lib))),
        h('small', { class: 'meta' }, t('Le temps que restent affichées les bulles des agents et de Joy, pour avoir le temps de tout lire.'))),
      h('div', { class: 'boutons' }, recolte),
      h('h4', {}, t('Exporter, modifier dans Excel, réimporter')),
      h('div', { class: 'boutons' }, lienExport('xlsx', t('Exporter en Excel')), lienExport('csv', t('Exporter en CSV')), lienExport('json', t('Exporter en JSON'))),
      h('div', { class: 'param-ajout' }, modeImport, h('button', { class: 'petit ok', type: 'button', on: { click: () => fichier.click() } }, t('Importer un fichier…')), fichier),
      h('small', { class: 'meta' }, t('Excel : une feuille par catégorie (Blagues : Question, Chute ; Anecdotes : Texte ; Pause café : Phrase). CSV : colonnes type ; texte ; chute.')),
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
      h('h4', {}, t('Dictée')),
      dic.disponible
        ? h('p', {}, t('Transcription locale disponible ({appareil}). Bouton 🎤 en bas de l’écran, ou Alt+M.', { appareil: dic.appareil || t('chargement du modèle…') }))
        : h('div', {},
          h('p', {}, t('La dictée locale (Whisper, sur ton PC, gratuite et privée) n’est pas installée.')),
          h('p', { class: 'meta' }, t('Installation : environ 4 Go avec une carte NVIDIA (rapide), 1,5 Go sans (plus lent). En attendant, la dictée de Windows marche partout : Win+H.')),
          h('div', { class: 'boutons' }, h('button', { class: 'petit ok', type: 'button', on: { click: () => this.poster('/api/dictee/installer', {}, t('L’installation s’ouvre dans une fenêtre à part. Relance le QG quand elle est finie.')) } }, t('Installer la dictée locale')))),
      h('h4', {}, t('Notifications')),
      h('p', { class: 'meta' }, t('Navigateur : {etat}. Quand le QG est au premier plan, la cloche suffit.', { etat: libPerm })),
      perm === 'default' ? h('button', { class: 'petit', type: 'button', on: { click: () => this.ui.notifs.activer() } }, t('Activer les notifications')) : null,
    ];
  }

  // ---------------------------------------------------------------- à propos
  apropos() {
    const R = this.store.reglages;
    return [
      h('p', {}, t('QG des agents : une société d’agents Claude que tu regardes travailler, étage par étage.')),
      h('dl', {},
        h('dt', {}, t('Version')), h('dd', {}, R.version || '—'),
        h('dt', {}, t('Dossier du QG')), h('dd', {}, h('code', {}, R.qg || '—')),
        h('dt', {}, t('Code source')), h('dd', {}, h('a', { href: DEPOT_GITHUB, target: '_blank', rel: 'noopener noreferrer' }, DEPOT_GITHUB))),
      h('h4', {}, t('Mises à jour')),
      h('label', { class: 'param-case' },
        h('input', { type: 'checkbox', checked: R.miseAJourAuto !== false, on: { change: (e) => this.reglage({ miseAJourAuto: e.target.checked }, t('Enregistré.')) } }),
        ' ', t('Mettre à jour automatiquement au lancement du QG (si une nouvelle version est publiée, elle s’installe avant que le QG démarre).')),
      this.blocMaj(),
      h('p', { class: 'meta' }, t('Tout reste sur ce PC : tes réglages (dossier config), l’historique des dossiers (dossier dossiers) et les données de travail (dossier runtime). Le QG n’écoute que ton ordinateur (127.0.0.1) et ne partage rien.')),
      h('div', { class: 'boutons' }, h('button', { class: 'petit', type: 'button', on: { click: () => this.ui.lecteur.ouvrir(R.qg + '\\README.md') } }, t('Lire le mode d’emploi'))),
    ];
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
      boite.replaceChildren(
        h('p', {}, h('b', {}, t('Version {version} disponible', { version: m.derniere })), date ? h('span', { class: 'meta' }, ' · ' + t('publiée le {date}', { date })) : null, h('span', { class: 'meta' }, ' · ' + t('tu as la {version}', { version: m.actuelle }))),
        m.notes ? h('details', { class: 'notes-maj', open: true }, h('summary', {}, t('Nouveautés')), md(m.notes, { titres: 'compact' })) : null,
        h('div', { class: 'boutons' }, lancer, h('a', { class: 'petit bouton-lien', href: m.url, target: '_blank', rel: 'noopener noreferrer' }, t('Voir sur GitHub'))),
        m.dev ? h('p', { class: 'meta' }, t('Installation de développement (dossiers tests ou SPEC.md présents) : la mise à jour automatique est désactivée ici pour ne pas écraser ton travail.')) : null);
    };
    if (this.majInfo) afficher(this.majInfo);
    else boite.append(h('button', { class: 'petit', type: 'button', on: { click: () => verifier(true) } }, t('Vérifier les mises à jour')));
    return boite;
  }
}
