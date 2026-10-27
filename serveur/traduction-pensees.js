// Traduction des réflexions (Réglages › Général, coupée par défaut). La réflexion résumée par l'API sort souvent
// en anglais, même quand les IA travaillent dans une autre langue (mesure : docs/mesure-langue-reflexion.md).
// Quand un bloc de réflexion se termine dans une autre langue que celle des IA, Haiku le traduit ; le site montre
// la traduction et garde le texte d'origine consultable.
import { REGLAGES, RACINE, langueIA } from './config.js';
import { etat, pensee, traductionPensee } from './bus.js';
import { executerSession } from './session.js';

// Mots-outils fréquents par langue : assez pour reconnaître quelques phrases.
const MOTS = {
  fr: ['le', 'la', 'les', 'des', 'est', 'une', 'et', 'pour', 'dans', 'que', 'qui', 'je', 'pas', 'du', 'avec', 'sur', 'ce', 'il', 'ne', 'au'],
  en: ['the', 'is', 'and', 'to', 'of', 'that', 'this', 'it', 'in', 'for', 'with', 'should', 'be', 'i', 'need', 'are', 'not', 'which', 'what', 'let'],
  es: ['el', 'los', 'las', 'es', 'y', 'para', 'que', 'en', 'con', 'una', 'por', 'del', 'se', 'no', 'lo', 'pero', 'como', 'esto', 'necesito', 'tengo'],
  de: ['der', 'die', 'das', 'ist', 'und', 'zu', 'nicht', 'mit', 'ich', 'ein', 'eine', 'auf', 'für', 'den', 'dem', 'auch', 'es', 'muss', 'wir', 'sich'],
  it: ['il', 'lo', 'gli', 'è', 'e', 'per', 'che', 'con', 'una', 'non', 'del', 'della', 'sono', 'questo', 'devo', 'come', 'ma', 'nel', 'alla', 'io'],
  pt: ['o', 'os', 'as', 'é', 'e', 'para', 'que', 'com', 'uma', 'não', 'do', 'da', 'em', 'isso', 'preciso', 'como', 'mas', 'no', 'na', 'eu'],
  nl: ['de', 'het', 'een', 'is', 'en', 'van', 'dat', 'niet', 'met', 'ik', 'voor', 'op', 'te', 'dit', 'moet', 'zijn', 'ook', 'maar', 'wat', 'naar'],
  pl: ['i', 'w', 'nie', 'na', 'się', 'to', 'jest', 'z', 'że', 'do', 'co', 'jak', 'ale', 'tak', 'muszę', 'po', 'czy', 'dla', 'od', 'ten'],
};

/** Langue la plus probable d'un texte (code fr, en…), ou null si on ne peut pas trancher. */
export function detecterLangue(texte) {
  const mots = String(texte || '').toLowerCase().match(/\p{L}+/gu) || [];
  if (mots.length < 6) return null;
  const scores = Object.entries(MOTS).map(([code, liste]) => {
    const s = new Set(liste);
    return [code, mots.filter((m) => s.has(m)).length];
  }).sort((a, b) => b[1] - a[1]);
  const [premier, second] = scores;
  return premier[1] >= 3 && premier[1] >= second[1] * 1.5 ? premier[0] : null;
}

const MAX_ATTENTE = 30;
const file = [];
let enCours = false;

/** Rappel de pensée pour une vraie session : publie la pensée, puis traduit le bloc terminé si besoin. */
export function penseeTraduite(cible, dossierId, extra = null) {
  return (p) => {
    pensee(cible, dossierId, extra ? { ...p, ...extra } : p);
    if (p.phase === 'reflexion' && p.fin && REGLAGES.traduireReflexion === true) planifier(cible, dossierId, p.bloc);
  };
}

function planifier(cible, dossierId, bloc) {
  file.push({ cible, dossierId, bloc });
  if (file.length > MAX_ATTENTE) file.splice(0, file.length - MAX_ATTENTE); // au pire, les plus anciens restent en VO
  if (!enCours) suivant();
}

async function suivant() {
  const job = file.shift();
  if (!job) {
    enCours = false;
    return;
  }
  enCours = true;
  try {
    await traduire(job);
  } catch (e) {
    console.error('traduction réflexion', e.message);
  }
  suivant();
}

async function traduire({ cible, dossierId, bloc }) {
  const b = (etat.reflexions.get(cible) || []).find((x) => x.bloc === bloc);
  if (!b || !b.texte.trim() || b.coupe) return;
  const cibleLangue = REGLAGES.langueIA || 'fr';
  const source = detecterLangue(b.texte);
  if (!source || source === cibleLangue) return;
  const d = etat.dossiers.get(dossierId);
  const t = etat.taches.get(cible);
  const s = await executerSession({
    prompt: `<texte>\n${b.texte}\n</texte>`,
    compte: d?.compte,
    conso: { role: 'traduction', dossier: dossierId, tache: t ? t.id : undefined, etage: t ? t.etage : 'direction' },
    options: {
      model: 'haiku', maxTurns: 1, tools: [], permissionMode: 'dontAsk', settingSources: [], mcpServers: {}, strictMcpConfig: true,
      persistSession: false, cwd: RACINE, thinking: { type: 'disabled' },
      systemPrompt: `Tu es traducteur. Traduis en ${langueIA()} le texte placé entre les balises <texte> : ce sont les notes de travail d'un agent, affichées à l'utilisateur. Garde le sens, le ton et les retours à la ligne. Laisse tels quels les noms de fichiers, identifiants, commandes, blocs de code et citations. Réponds uniquement par la traduction, sans balises ni commentaire.`,
    },
  });
  const texte = typeof s.result?.result === 'string' ? s.result.result.trim() : '';
  if (texte) traductionPensee(cible, dossierId, bloc, { texte, langue: cibleLangue, source });
}
