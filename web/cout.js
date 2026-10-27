// Réglage « Coût » côté site (1.0.6, B2 ; Personnalisé en 1.0.7) : niveaux, phrases, et boutons de « Personnalisé »
// avec leurs explications (bulles « i »). Les valeurs de chaque niveau viennent du serveur
// (reglages.niveauxTravail, config/defauts/profils-travail.json).
import { t } from './i18n.js';

export const NIVEAUX = ['econome', 'equilibre', 'max'];
export const PERSONNALISE = 'personnalise';
export const COUTS = [...NIVEAUX, PERSONNALISE];
export const NIVEAU_DEFAUT = 'equilibre';

export const nomNiveau = (n) => ({ econome: t('Économe'), equilibre: t('Équilibré'), max: t('Max'), personnalise: t('Personnalisé') })[n] || n;
export const phraseNiveau = (n) => ({
  econome: t('le minimum qui donne un bon résultat'),
  equilibre: t('le juste coût'),
  max: t('qualité d’abord, sans regarder la dépense'),
  personnalise: t('tes propres valeurs, à partir d’un des trois niveaux'),
})[n] || '';

// Nom du coût d'une demande ou des réglages ({cout, base}) : « Personnalisé (à partir de Économe) », sinon le niveau.
export const nomTravail = (tr) => (tr && tr.cout === PERSONNALISE && NIVEAUX.includes(tr.base)
  ? nomNiveau(PERSONNALISE) + ' (' + t('à partir de {niveau}', { niveau: nomNiveau(tr.base) }) + ')'
  : nomNiveau(tr && tr.cout));

// Niveau, base et valeurs de Personnalisé (absents ou abîmés : défaut, comme travailReglages côté serveur).
// Réglages d'avant la 1.0.7 (un niveau + des valeurs changées) : Personnalisé à partir de ce niveau.
export function travailDe(R) {
  const tr = (R && R.travail) || {};
  const personnalise = tr.personnalise && typeof tr.personnalise === 'object' ? tr.personnalise : {};
  let cout = COUTS.includes(tr.cout) ? tr.cout : NIVEAU_DEFAUT;
  let base = NIVEAUX.includes(tr.base) ? tr.base : null;
  if (!base) {
    base = NIVEAUX.includes(cout) ? cout : NIVEAU_DEFAUT;
    if (cout !== PERSONNALISE && Object.keys(personnalise).length) cout = PERSONNALISE;
  }
  return { cout, base, personnalise };
}

// Fournisseurs (noms) des comptes pour lesquels une capacité manque (ex. Codex : compaction, plafond, sous-agents).
export function sansCapacite(store, capacite, comptes = store.comptes || []) {
  const noms = new Set();
  for (const c of comptes) {
    if (!c || !c.capacites || c.capacites[capacite] !== false) continue;
    const f = (store.fournisseurs || []).find((x) => x.id === (c.fournisseur || 'claude'));
    noms.add((f && f.nom) || c.fournisseur || c.nom);
  }
  return [...noms];
}

// Capacités que le réglage Coût utilise (B6, B7) : sans elles, les boutons correspondants sont sans effet.
export const CAPACITES_COUT = ['compaction', 'plafondBudget', 'sousAgents'];

// Les boutons du §2 de 04-reglage-cout.md, dans l'ordre du tableau.
// type : 'k' (milliers de tokens), 'nombre', 'pourcent' ou 'facteur' (null permis : `nul`), sinon `choix`.
// Explications (bulle « i ») : quoi ; pour un choix, [valeur, libellé, ce qu'il fait, + , −] ;
// pour un nombre, valeurs [[valeur, effet]] ; note (repère) ; exemple.
export function boutonsCout() {
  const parDg = t('choisi par le DG');
  const memoire = [
    [t('plus haut'), t('l’agent garde plus de détails en tête et se résume moins souvent. Chaque étape coûte plus, car toute la conversation est relue à chaque fois.')],
    [t('plus bas'), t('chaque étape coûte moins, mais l’agent se résume plus tôt et peut oublier un détail lu au début.')],
    ['50 k', t('le minimum : en dessous, l’agent passerait son temps à se résumer. Au-delà de la mémoire du modèle, rien ne change : il se résume de toute façon à sa limite.')],
  ];
  return [
    { cle: 'compactionAgents', lib: t('Compaction des agents'), type: 'k', min: 50, max: 1000, capacite: 'compaction',
      quoi: t('Un agent garde en mémoire toute sa conversation : les fichiers lus, les commandes, ses réponses. Quand elle atteint cette taille, il la résume pour continuer plus léger : c’est la compaction.'),
      valeurs: memoire,
      note: t('1 k = 1 000 tokens, environ 750 mots ; 200 k, c’est à peu près un gros roman.'),
      exemple: t('un agent qui lit 40 fichiers d’un gros projet atteint vite 150 k : réglé à 150 k, il se résume tôt et relit parfois un fichier ; à 400 k, il garde tout en tête, mais chaque étape relit plus.') },
    { cle: 'compactionVerif', lib: t('Compaction des vérificateurs'), type: 'k', min: 50, max: 1000, capacite: 'compaction',
      quoi: t('La même chose pour les vérificateurs, les agents qui relisent et testent le travail d’un autre. Un vérificateur lit surtout : il a rarement besoin d’une très grande mémoire.'),
      valeurs: memoire },
    { cle: 'compactionDg', lib: t('Compaction du DG'), type: 'k', min: 50, max: 1000, capacite: 'compaction',
      quoi: t('La même chose pour le DG, qui garde tout le dossier en tête : le plan, les résultats des tâches, tes réponses. Trop bas, il peut oublier une décision prise plus tôt dans le dossier.'),
      valeurs: memoire },
    { cle: 'maxCompactions', lib: t('Compactions max par tâche'), type: 'nombre', min: 1, max: 50, nul: t('aucune limite'), capacite: 'compaction',
      quoi: t('Un garde-fou contre les tâches qui tournent en rond. Quand la mémoire d’un agent est pleine, il la résume : c’est une compaction. S’il doit relire ce qu’il vient d’oublier, il peut lire, résumer et relire sans fin, et user ton forfait sans avancer. Au-delà de ce nombre de compactions dans une même tâche, le QG l’arrête et le DG la redécoupe tout seul en tâches plus petites, sans t’attendre.'),
      valeurs: [
        ['2 à 4', t('arrêt rapide : peu de tokens perdus, mais une grosse tâche qui avançait bien peut être coupée puis redécoupée.')],
        ['6 à 10', t('une marge confortable : seule une tâche qui tourne vraiment en rond est arrêtée.')],
        [t('plus haut'), t('presque jamais d’arrêt : une tâche bloquée peut consommer beaucoup avant d’être arrêtée.')],
        [t('vide'), t('aucune limite, déconseillé : une tâche qui tourne en rond continue jusqu’à la fin de ta fenêtre d’usage, surtout si personne ne regarde l’écran.')],
      ],
      note: t('Quand une compaction arrive dépend du réglage « Compaction des agents » : plus il est bas, plus les compactions arrivent tôt, et plus ce nombre doit être haut.'),
      exemple: t('avec 6 : un agent qui en est à sa 6e compaction sur la même tâche s’arrête ; le DG reprend ce qu’il a déjà fait et confie le reste à deux ou trois agents, chacun avec une mission plus petite.') },
    { cle: 'maxTaches', lib: t('Nombre de tâches max'), type: 'nombre', min: 1, max: 30,
      quoi: t('Le plus grand nombre de tâches que le DG peut mettre dans le plan d’une demande. Chaque tâche est confiée à un agent. C’est un plafond : pour une petite demande, le DG en fait moins.'),
      valeurs: [
        ['1', t('un seul agent fait tout, étape par étape. Le moins cher ; le plus lent sur une grosse demande.')],
        ['4 à 8', t('une grosse demande est répartie entre quelques agents qui avancent en même temps.')],
        ['12 à 30', t('le DG peut mobiliser beaucoup d’agents : plus rapide, mais chacun relit le projet de son côté, donc plus de tokens. Pas d’« infini » : 30 au plus.')],
      ],
      exemple: t('« Ajoute un mode sombre au site et traduis-le en anglais » : avec 1, un seul agent fait les deux à la suite ; avec 8, le DG peut confier le mode sombre et la traduction à deux agents en même temps.') },
    { cle: 'decoupage', lib: t('Découpage'),
      quoi: t('Comment le DG coupe une demande en tâches.'),
      choix: [
        ['chantier', t('une tâche par chantier'),
          t('Un seul agent par sujet : il étudie puis réalise, sans tâche de revue ni de synthèse à part.'),
          t('Le moins de tâches, donc le moins de relectures du projet.'),
          t('Moins de travail en parallèle.')],
        ['parallele', t('ne séparer que le travail parallèle et indépendant'),
          t('Le DG ne sépare que ce qui peut avancer en même temps sans se gêner (deux projets, deux sources différentes). Celui qui étudie un code le réalise aussi.'),
          t('Rapide sur une demande à plusieurs morceaux, sans tâche inutile.'),
          t('Un peu plus de tâches qu’avec « une tâche par chantier ».')],
        ['actuel', t('séparer production, vérification et travail dépendant'),
          t('Le DG sépare la production, la vérification ou la mesure, et chaque travail qui dépend d’un autre (par exemple : étude, puis code, puis mesure des performances).'),
          t('Chaque étape a son agent et son résultat bien à part : le plus facile à suivre et à reprendre.'),
          t('Le plus de tâches : chaque agent relit le projet, donc le plus de tokens.')],
      ],
      exemple: t('« Corrige le bug de connexion puis mesure le temps de chargement » : « une tâche par chantier » donne un seul agent qui fait tout ; « séparer » donne une tâche de correction, puis une tâche de mesure.') },
    { cle: 'agentDirect', lib: t('Mode « agent direct »'),
      quoi: t('Le DG peut sauter le plan et confier ta demande telle quelle à un seul agent, avec le contexte utile. Plus rapide et moins cher, mais sans vérificateur séparé.'),
      choix: [
        ['projet-unique', t('dès que la demande touche un seul projet'),
          t('Toute demande sur un seul projet part directement chez un agent.'),
          t('Le plus économique : la plupart des demandes partent tout de suite.'),
          t('Une grosse demande sur un seul projet part aussi sans plan ni vérificateur séparé.')],
        ['petite', t('pour une petite demande'),
          t('Seule une petite demande (un projet, un changement localisé) part directement ; les autres ont un plan.'),
          t('Les petites corrections partent tout de suite, les gros travaux ont un vrai plan.'),
          t('Le DG décide de ce qui est « petit ».')],
        ['jamais', t('jamais (toujours un plan)'),
          t('Chaque demande passe par un plan, des tâches et leurs vérifications.'),
          t('Le plus encadré.'),
          t('Même une correction d’une ligne passe par un plan : plus lent et plus cher.')],
      ],
      exemple: t('« Mets le bouton Envoyer en vert » : avec « pour une petite demande », un agent s’en charge tout de suite, sans plan.') },
    { cle: 'verifDefaut', lib: t('Vérification par défaut'),
      quoi: t('Quand le DG met un vérificateur (un autre agent qui relit et teste le travail) après une tâche. Une tâche à risque élevé, à faire approuver, ou dont tu as demandé la relecture garde toujours son vérificateur.'),
      choix: [
        ['self', t('l’agent se vérifie lui-même ; vérificateur si risque élevé ou relecture demandée'),
          t('L’agent contrôle son propre travail avec des commandes concrètes (tests, compilation).'),
          t('Le moins cher : pas d’agent en plus.'),
          t('Personne d’autre ne relit : une erreur que l’agent ne voit pas peut passer.')],
        ['risque', t('vérificateur si le code modifié est partagé ou critique'),
          t('Un vérificateur relit les tâches qui touchent du code partagé ou critique ; les autres se vérifient elles-mêmes.'),
          t('La relecture là où une erreur coûterait cher.'),
          t('Un petit changement jugé sans risque n’est pas relu par un autre agent.')],
        ['code', t('vérificateur pour toute tâche qui modifie du code'),
          t('Un vérificateur relit chaque tâche qui modifie du code.'),
          t('Le plus sûr.'),
          t('Le plus cher : presque chaque tâche coûte deux agents.')],
      ],
      exemple: t('pour un petit site perso, « l’agent se vérifie lui-même » suffit souvent ; pour le code d’un jeu déjà publié, « vérificateur pour toute tâche » évite les mauvaises surprises.') },
    { cle: 'verifNiveau', lib: t('Modèle du vérificateur'),
      quoi: t('Le modèle d’IA du vérificateur. Le modèle des tâches de production et celui du DG ne changent jamais.'),
      choix: [
        [null, parDg,
          t('Le DG choisit pour chaque vérification, souvent le même niveau que la tâche.'),
          t('La relecture la plus fine.'),
          t('Plus cher quand la tâche tourne sur un gros modèle.')],
        ['standard', t('niveau standard (Sonnet chez Claude, son équivalent ailleurs)'),
          t('Le vérificateur prend le modèle de niveau standard : Sonnet chez Claude, le modèle de même niveau chez une autre IA. Un modèle plus léger choisi par le DG est gardé.'),
          t('Nettement moins cher ; suffit pour relire et lancer des tests.'),
          t('Peut rater une erreur subtile qu’un plus gros modèle aurait vue.')],
      ] },
    { cle: 'verifEffort', lib: t('Effort du vérificateur'),
      quoi: t('Combien le vérificateur réfléchit avant de répondre. Plus d’effort, c’est plus de réflexion, donc plus de tokens.'),
      choix: [
        [null, parDg, t('Le DG choisit pour chaque vérification.'), t('Adapté à chaque tâche.'), null],
        ['low', t('faible (low)'), t('Réfléchit peu.'), t('Rapide et économique.'), t('Relecture plus superficielle.')],
        ['medium', t('moyen (medium)'), t('Un juste milieu.'), t('Assez soigné pour la plupart des tâches.'), null],
        ['high', t('élevé (high)'), t('Réfléchit beaucoup.'), t('La relecture la plus soignée.'), t('La plus chère.')],
      ] },
    { cle: 'verifMaxTurns', lib: t('Tours du vérificateur'), type: 'nombre', min: 1, max: 200,
      quoi: t('Le nombre d’étapes (lire un fichier, lancer un test, répondre…) que le vérificateur peut faire avant de rendre son avis.'),
      valeurs: [
        ['1 à 5', t('il a à peine le temps de lire : avis rapide, mais superficiel.')],
        ['12 à 20', t('assez pour lire les fichiers changés et lancer les tests.')],
        ['40 à 200', t('relecture approfondie ; plus chère sur une grosse tâche. Pas d’« infini » : 200 au plus.')],
      ] },
    { cle: 'maxRework', lib: t('Corrections max'), type: 'nombre', min: 0, max: 5,
      quoi: t('Combien de fois une tâche refusée par son vérificateur, ou par un contrôle du projet, retourne chez son agent pour être corrigée. C’est un plafond : le DG peut en prévoir moins.'),
      valeurs: [
        ['0', t('aucune correction : au premier refus, la tâche échoue et le DG décide de la suite (la refaire autrement, te poser une question…).')],
        ['1', t('une correction, puis le DG reprend la main.')],
        ['2 à 5', t('l’agent a plusieurs essais : plus de chances de finir seul, mais chaque essai coûte une session de plus.')],
      ],
      exemple: t('un vérificateur refuse un correctif parce qu’un test échoue : avec 1, l’agent corrige une fois ; si le test échoue encore, le DG décide de la suite.') },
    { cle: 'perimetre', lib: t('Périmètre'),
      quoi: t('Ce que les agents peuvent faire en plus de ce que tu as demandé.'),
      choix: [
        ['strict', t('strict : seulement ce qui est demandé'),
          t('Ni tests en plus, ni README, ni captures. Une question (« est-ce possible ? ») donne une étude, puis une question avant de toucher au code.'),
          t('Aucune dépense en à-côtés.'),
          t('Tu demandes toi-même les tests ou la doc.')],
        ['complements', t('compléments évidents permis (tests, doc courte)'),
          t('Les à-côtés évidents du changement sont permis (ses tests, une doc courte) ; rien de plus sans demande.'),
          t('Un travail propre et complet, sans dérive.'),
          t('Un peu plus de tokens qu’en strict.')],
        ['bonus', t('améliorations proposées en tâches « bonus »'),
          t('Les agents peuvent proposer des améliorations, en tâches « bonus » que tu acceptes ou refuses.'),
          t('Des idées en plus, sans rien lancer sans ton accord.'),
          t('Plus de propositions à trier ; celles que tu acceptes coûtent.')],
      ],
      exemple: t('« Ajoute un bouton Exporter » : en strict, juste le bouton ; avec les compléments, le bouton et son test ; avec les bonus, l’agent peut aussi proposer un export en PDF, que tu acceptes ou non.') },
    { cle: 'exploration', lib: t('Sous-agent d’exploration'), capacite: 'sousAgents',
      quoi: t('Un agent qui doit chercher dans beaucoup de fichiers peut envoyer un petit assistant d’exploration (un modèle léger, qui ne fait que lire) et ne garder que son résumé. Sa propre conversation reste légère.'),
      choix: [
        ['interdite', t('interdit'), t('L’agent cherche lui-même.'), t('Il voit tout de ses propres yeux.'), t('Sur un gros projet, sa conversation grossit vite : chaque étape coûte plus.')],
        ['permise', t('permis'), t('L’agent s’en sert pour une grosse recherche, s’il le juge utile.'), t('Au cas par cas.'), t('Un résumé peut laisser de côté un détail.')],
        ['encouragee', t('encouragé'), t('L’agent confie toute grosse recherche à l’assistant.'), t('Le plus économique sur un gros projet.'), t('L’agent travaille plus souvent sur des résumés que sur les fichiers eux-mêmes.')],
      ],
      exemple: t('« Trouve où le jeu enregistre les scores » dans un gros projet : l’assistant fouille et répond « sauvegarde.lua, ligne 120 » ; l’agent ne lit que ce fichier-là.') },
    { cle: 'seuilAccordFenetre', lib: t('Accord avant lancement'), type: 'pourcent', nul: t('jamais (estimation affichée seulement)'),
      quoi: t('Avant de lancer un plan, le QG estime ce qu’il va consommer. Si l’estimation dépasse ce pourcentage de ta fenêtre de 5 h (la limite d’usage de ton abonnement), il te demande ton accord avant de commencer.'),
      valeurs: [
        ['1 %', t('il te demande presque à chaque fois.')],
        ['25 %', t('seulement pour les gros plans.')],
        ['100 %', t('seulement si le plan risque de prendre toute ta fenêtre.')],
        [t('vide'), t('jamais : il ne demande pas ; l’estimation reste affichée.')],
      ],
      note: t('Baisse-le pour garder la main sur la dépense ; monte-le pour être moins dérangé.'),
      exemple: t('à 25 %, un plan estimé à 40 % de ta fenêtre attend ton accord ; un plan estimé à 10 % part tout de suite.') },
    { cle: 'plafondTacheFacteur', lib: t('Plafond par tâche'), type: 'facteur', nul: t('aucun'), capacite: 'plafondBudget',
      quoi: t('Chaque tâche reçoit une limite de dépense : ce nombre × son estimation, 0,50 $ au moins, calculée au prix des tokens même avec un abonnement. Si elle l’atteint, elle s’arrête et le DG choisit : la relancer avec une limite plus haute, garder ce qui est fait, ou découper le reste.'),
      valeurs: [
        ['1', t('arrêt dès que la tâche dépasse son estimation : beaucoup d’arrêts, car une estimation n’est jamais exacte.')],
        ['3 à 5', t('une marge confortable : seule une tâche qui part vraiment trop loin s’arrête.')],
        [t('vide'), t('aucune limite : une tâche peut coûter bien plus que prévu.')],
      ],
      exemple: t('une tâche estimée à 2 $, avec 3 : elle s’arrête si elle atteint 6 $.') },
    { cle: 'ambiance', lib: t('Ambiance (bavardages, Joy)'),
      quoi: t('Les personnages du QG bavardent entre eux (le mini-jeu), et Joy récolte de nouvelles blagues. Chacun de ces petits appels à l’IA est pris sur ton forfait. Vaut pour tout le QG, selon le choix fait ici dans les Réglages (pas celui d’une demande).'),
      choix: [
        [null, t('selon les réglages du mini-jeu'), t('Le mini-jeu suit ses réglages (Réglages › Équipe et skins), et Joy les siens (Réglages › Happiness manager).'), t('Le QG est vivant.'), t('Quelques tokens pour l’ambiance.')],
        [false, t('coupée'), t('Les personnages ne bavardent plus d’eux-mêmes et la récolte de Joy se fait sans IA ; tu peux toujours ouvrir une discussion avec un personnage.'), t('Aucun token pour l’ambiance.'), t('Un QG plus calme.')],
      ] },
  ];
}

// Valeur lisible d'un bouton.
export function texteValeur(b, v) {
  if (b.choix) {
    const c = b.choix.find(([x]) => x === v);
    return c ? c[1] : String(v);
  }
  if (v === null || v === undefined) return b.nul || '—';
  if (b.type === 'k') return t('{n} k tokens', { n: Math.round(v / 1000) });
  if (b.type === 'pourcent') return t('au-delà de {n} % de ta fenêtre de 5 h', { n: v });
  if (b.type === 'facteur') return t('≈ {n} × l’estimation de la tâche', { n: v });
  return String(v);
}
