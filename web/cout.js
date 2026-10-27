// Réglage « Coût » côté site (1.0.6, B2) : niveaux, phrases, et boutons de « Personnaliser ».
// Les valeurs de chaque niveau viennent du serveur (reglages.niveauxTravail, config/defauts/profils-travail.json).
import { t } from './i18n.js';

export const NIVEAUX = ['econome', 'equilibre', 'max'];
export const NIVEAU_DEFAUT = 'equilibre';

export const nomNiveau = (n) => ({ econome: t('Économe'), equilibre: t('Équilibré'), max: t('Max') })[n] || n;
export const phraseNiveau = (n) =>
  ({ econome: t('le minimum qui donne un bon résultat'), equilibre: t('le juste coût'), max: t('qualité d’abord, sans regarder la dépense') })[n] || '';

// Niveau et personnalisation des réglages (absents ou abîmés : défaut, comme travailReglages côté serveur).
export function travailDe(R) {
  const tr = (R && R.travail) || {};
  return { cout: NIVEAUX.includes(tr.cout) ? tr.cout : NIVEAU_DEFAUT, personnalise: tr.personnalise && typeof tr.personnalise === 'object' ? tr.personnalise : {} };
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
// type : 'k' (milliers de tokens), 'nombre', 'pourcent' ou 'facteur' (null permis : `nul`), sinon `choix` [valeur, libellé].
export function boutonsCout() {
  const parDg = t('choisi par le DG');
  return [
    { cle: 'compactionAgents', lib: t('Compaction des agents'), type: 'k', capacite: 'compaction', aide: t('Taille du contexte à laquelle la session d’un agent se résume.') },
    { cle: 'compactionVerif', lib: t('Compaction des vérificateurs'), type: 'k', capacite: 'compaction' },
    { cle: 'compactionDg', lib: t('Compaction du DG'), type: 'k', capacite: 'compaction' },
    { cle: 'maxTaches', lib: t('Nombre de tâches max'), type: 'nombre', min: 1, max: 30 },
    { cle: 'decoupage', lib: t('Découpage'), choix: [
      ['chantier', t('une tâche par chantier')],
      ['parallele', t('ne séparer que le travail parallèle et indépendant')],
      ['actuel', t('découpage habituel (production, vérification, dépendant)')],
    ] },
    { cle: 'agentDirect', lib: t('Mode « agent direct »'), aide: t('Le DG confie la demande telle quelle à un seul agent.'), choix: [
      ['projet-unique', t('dès que la demande touche un seul projet')],
      ['petite', t('pour une petite demande')],
      ['jamais', t('jamais (toujours un plan)')],
    ] },
    { cle: 'verifDefaut', lib: t('Vérification par défaut'), choix: [
      ['self', t('l’agent se vérifie lui-même ; vérificateur si risque élevé ou relecture demandée')],
      ['risque', t('vérificateur si le code modifié est partagé ou critique')],
      ['code', t('vérificateur pour toute tâche qui modifie du code')],
    ] },
    { cle: 'verifNiveau', lib: t('Modèle du vérificateur'), choix: [[null, parDg], ['standard', t('niveau standard (Sonnet)')]] },
    { cle: 'verifEffort', lib: t('Effort du vérificateur'), choix: [[null, parDg], ['low', 'low'], ['medium', 'medium'], ['high', 'high']] },
    { cle: 'verifMaxTurns', lib: t('Tours du vérificateur'), type: 'nombre', min: 1, max: 200 },
    { cle: 'maxRework', lib: t('Corrections max'), type: 'nombre', min: 0, max: 5 },
    { cle: 'perimetre', lib: t('Périmètre'), choix: [
      ['strict', t('strict : seulement ce qui est demandé')],
      ['complements', t('compléments évidents permis (tests, doc courte)')],
      ['bonus', t('améliorations proposées en tâches « bonus »')],
    ] },
    { cle: 'exploration', lib: t('Sous-agent d’exploration'), capacite: 'sousAgents', choix: [
      ['interdite', t('interdit')],
      ['permise', t('permis')],
      ['encouragee', t('encouragé')],
    ] },
    { cle: 'seuilAccordFenetre', lib: t('Accord avant lancement'), type: 'pourcent', nul: t('jamais (estimation affichée seulement)'), aide: t('Utilisé avec l’estimation du plan.') },
    { cle: 'plafondTacheFacteur', lib: t('Plafond par tâche'), type: 'facteur', nul: t('aucun'), capacite: 'plafondBudget', aide: t('Utilisé avec l’estimation du plan.') },
    { cle: 'ambiance', lib: t('Ambiance (bavardages, Joy)'), choix: [[null, t('selon les réglages du mini-jeu')], [false, t('coupée')]] },
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
