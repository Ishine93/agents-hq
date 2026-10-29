// Réglage « Coût » (1.0.6, lot B ; Personnalisé en 1.0.7) : profil de travail d'un dossier et bloc PROFIL DE TRAVAIL donné au DG.
// Rien ici ne touche au modèle ni à l'effort des tâches de production ni du DG.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGLAGES } from './config.js';
import { chargerEquivalences, niveauDe, modeleParNiveau } from './ia/fournisseurs.js';

const FICHIER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'defauts', 'profils-travail.json');
export const NIVEAUX = ['econome', 'equilibre', 'max'];
export const PERSONNALISE = 'personnalise'; // 4e choix : les valeurs de l'utilisateur, à partir d'un des trois niveaux (base)
export const COUTS = [...NIVEAUX, PERSONNALISE];
export const NIVEAU_DEFAUT = 'equilibre';

let cache = null;
export function profilsTravail() {
  if (!cache) cache = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  return cache;
}

// Les boutons connus et leurs valeurs permises (pour filtrer « personnalise » et les valeurs inconnues).
export const ENUMS = {
  decoupage: ['chantier', 'parallele', 'actuel'],
  agentDirect: ['jamais', 'petite', 'projet-unique'],
  verifDefaut: ['self', 'risque', 'code'],
  verifNiveau: [null, 'standard'],
  verifEffort: [null, 'low', 'medium', 'high'],
  perimetre: ['strict', 'complements', 'bonus'],
  exploration: ['interdite', 'permise', 'encouragee'],
  ambiance: [null, false],
  gardien: ['non', 'registre', 'relecture'], // gardien du contexte (1.0.10)
};
export const NOMBRES = ['compactionAgents', 'compactionVerif', 'compactionDg', 'maxCompactions', 'maxTaches', 'verifMaxTurns', 'maxRework', 'seuilAccordFenetre', 'plafondTacheFacteur'];
export const PEUT_ETRE_NUL = new Set(['seuilAccordFenetre', 'plafondTacheFacteur', 'maxCompactions']);

function valeurValide(cle, v) {
  if (cle in ENUMS) return ENUMS[cle].includes(v);
  if (NOMBRES.includes(cle)) return (v === null && PEUT_ETRE_NUL.has(cle)) || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return false;
}

// Garde seulement les boutons connus aux valeurs permises.
export function nettoyerPersonnalise(p) {
  const r = {};
  for (const [k, v] of Object.entries(p && typeof p === 'object' ? p : {})) if (valeurValide(k, v)) r[k] = v;
  return r;
}

/**
 * Réglages utilisateur : { cout, base, personnalise }. cout : un des trois niveaux ou « personnalise » ;
 * base : le niveau dont part Personnalisé ; personnalise : ses valeurs, gardées même quand un autre niveau est choisi.
 * Absent ou abîmé → défaut. Réglages d'avant la 1.0.7 (un niveau + des valeurs changées, sans base) :
 * Personnalisé à partir de ce niveau, avec ces valeurs.
 */
export function travailReglages(reglages = REGLAGES) {
  const t = reglages?.travail || {};
  const personnalise = nettoyerPersonnalise(t.personnalise);
  let cout = COUTS.includes(t.cout) ? t.cout : NIVEAU_DEFAUT;
  let base = NIVEAUX.includes(t.base) ? t.base : null;
  if (!base) {
    base = NIVEAUX.includes(cout) ? cout : NIVEAU_DEFAUT;
    if (cout !== PERSONNALISE && Object.keys(personnalise).length) cout = PERSONNALISE;
  }
  return { cout, base, personnalise };
}

/** Ce qu'un dossier garde de son envoi : le niveau, ou Personnalisé avec sa base et ses valeurs du moment. */
export function travailDossier(cout, reglages = REGLAGES) {
  const glob = travailReglages(reglages);
  const c = COUTS.includes(cout) ? cout : glob.cout;
  return c === PERSONNALISE ? { cout: c, base: glob.base, personnalise: { ...glob.personnalise } } : { cout: c, base: c };
}

const profilDe = (cout, base, perso) => ({ cout, base, ...profilsTravail().cout[base], ...perso });

/**
 * Profil à plat d'un dossier, avec les valeurs figées à l'envoi (dossier.travail) ; sans dossier, celui des réglages.
 * profil.cout : le choix (niveau ou « personnalise ») ; profil.base : le niveau dont viennent les valeurs.
 */
export function profilEffectif(dossier = null, reglages = REGLAGES) {
  const glob = travailReglages(reglages);
  const d = dossier?.travail;
  if (!d || !COUTS.includes(d.cout)) {
    const perso = glob.cout === PERSONNALISE;
    return profilDe(glob.cout, perso ? glob.base : glob.cout, perso ? glob.personnalise : {});
  }
  if (d.cout === PERSONNALISE) {
    const perso = d.personnalise === undefined ? glob.personnalise : nettoyerPersonnalise(d.personnalise);
    return profilDe(PERSONNALISE, NIVEAUX.includes(d.base) ? d.base : glob.base, perso);
  }
  // dossier d'avant la 1.0.7 (niveau seul, sans base) : les valeurs changées des réglages valaient pour ce niveau-là
  const ancien = !('base' in d) && glob.cout === PERSONNALISE && glob.base === d.cout ? glob.personnalise : {};
  return profilDe(d.cout, d.cout, { ...ancien, ...nettoyerPersonnalise(d.personnalise) });
}

const NOMS = {
  fr: { econome: 'Économe', equilibre: 'Équilibré', max: 'Max', personnalise: 'Personnalisé' },
  en: { econome: 'Thrifty', equilibre: 'Balanced', max: 'Max', personnalise: 'Custom' },
};
export const nomNiveau = (cout, langue = 'fr') => (NOMS[langue] || NOMS.fr)[cout] || cout;
// Nom d'un profil : « Personnalisé (à partir de Économe) » pour Personnalisé, sinon le nom du niveau.
export const nomProfil = (profil, langue = 'fr') => (profil?.cout === PERSONNALISE
  ? (langue === 'en' ? `Custom (based on ${nomNiveau(profil.base, langue)})` : `Personnalisé (à partir de ${nomNiveau(profil.base, langue)})`)
  : nomNiveau(profil?.cout, langue));

const TEXTES = {
  fr: {
    titre: (n) => `PROFIL DE TRAVAIL (choisi par l'utilisateur pour cette demande) : Coût = ${n}.`,
    but: '- But : le meilleur résultat au juste coût. Chaque tâche, vérificateur ou agent en plus doit apporter un gain réel.',
    decoupage: {
      chantier: (m) => `- ${m} tâches au plus. Une tâche par chantier : l'analyse et la réalisation d'un même code vont toujours dans la même tâche. Pas de tâche de revue ni de synthèse sans demande.`,
      parallele: (m) => `- ${m} tâches au plus. L'analyse et la réalisation d'un même code vont dans la même tâche : l'agent qui explore garde son contexte pour implémenter. Ne sépare que le travail vraiment parallèle et indépendant (projets différents, sources de bench différentes).`,
      actuel: (m) => `- ${m} tâches au plus. Sépare la production, la vérification ou la mesure, et chaque travail qui dépend d'un autre (par exemple : étude, puis code, puis mesure).`,
    },
    direct: {
      'projet-unique': '- Demande qui touche un seul projet : rends une seule tâche en mode "direct" (la demande de l\'utilisateur, plus le contexte utile), sans vérificateur séparé.',
      petite: '- Petite demande (un projet, un changement localisé) : rends une seule tâche en mode "direct" (la demande de l\'utilisateur, plus le contexte utile), sans vérificateur séparé.',
      jamais: '- Mode "direct" non permis : rends toujours un plan (mode "plan").',
    },
    verif: {
      self: '- Vérification : "self" avec des commandes concrètes (tests, build) ; "agent" seulement si risque "high" ou si l\'utilisateur a demandé une relecture (relectureDemandee).',
      risque: '- Vérification : "agent" si la tâche modifie du code partagé ou critique (risque medium ou high) ou si l\'utilisateur a demandé une relecture (relectureDemandee) ; sinon "self" avec des commandes concrètes.',
      code: '- Vérification : "agent" pour toute tâche qui modifie du code ; "self" avec des commandes concrètes pour les autres.',
    },
    perimetre: {
      strict: '- Périmètre : seulement ce qui est demandé, aucun à-côté (README, captures, revue). Une question (« est-ce possible ? ») appelle une étude, puis une question à l\'utilisateur avant toute implémentation.',
      complements: '- Périmètre : fais ce qui est demandé. Les compléments évidents du changement (ses tests, sa doc courte) sont permis ; pas de revue d\'ensemble, de README ou de captures en plus sans demande. Une question (« est-ce possible ? ») appelle une étude, puis une question à l\'utilisateur avant toute implémentation.',
      bonus: '- Périmètre : tu peux proposer des améliorations, en tâches « bonus » soumises à l\'approbation de l\'utilisateur.',
    },
    passation: '- Passation : une tâche dont le résultat sert à d\'autres l\'écrit en entier dans un fichier livrable ; ses notes de passation disent où le trouver et quoi y regarder.',
    modele: '- Modèle et effort : ce profil n\'y touche pas ; choisis-les pour chaque tâche selon sa difficulté.',
    gardien: {
      registre: "- Gardien du contexte : le QG tient le registre du dossier (la demande, ses compléments, le plan, ce que chaque tâche rend) et chaque agent sait où le lire. Pour un gros document du projet (cahier des charges, spécification de milliers de lignes), donne à chaque tâche les sections à lire (titres ou numéros de lignes) plutôt que le document entier.",
      relecture: "- Gardien du contexte : le QG tient le registre du dossier (la demande, ses compléments, le plan, ce que chaque tâche rend) et chaque agent sait où le lire. Pour un gros document du projet (cahier des charges, spécification de milliers de lignes), donne à chaque tâche les sections à lire (titres ou numéros de lignes) plutôt que le document entier. Après chaque tâche terminée, tu recevras son rapport complet : vérifie qu'il colle à la demande et aux décisions déjà prises, et corrige la suite s'il dérive.",
    },
    rappel: (n, m) => `Rappel du PROFIL DE TRAVAIL : Coût = ${n} (${m} tâches au plus).`,
  },
  en: {
    titre: (n) => `WORK PROFILE (chosen by the user for this request): Cost = ${n}.`,
    but: '- Goal: the best result at a fair cost. Every extra task, verifier or agent must bring a real gain.',
    decoupage: {
      chantier: (m) => `- At most ${m} tasks. One task per workstream: analysis and implementation of the same code always go in the same task. No review or summary task unless asked.`,
      parallele: (m) => `- At most ${m} tasks. Analysis and implementation of the same code go in the same task: the agent that explores keeps its context to implement. Only split truly parallel, independent work (different projects, different bench sources).`,
      actuel: (m) => `- At most ${m} tasks. Keep production, verification or measurement, and each piece of work that depends on another separate (for example: study, then code, then measurement).`,
    },
    direct: {
      'projet-unique': '- A request that touches a single project: return a single task in "direct" mode (the user\'s request plus useful context), with no separate verifier.',
      petite: '- Small request (one project, a localized change): return a single task in "direct" mode (the user\'s request plus useful context), with no separate verifier.',
      jamais: '- "direct" mode not allowed: always return a plan ("plan" mode).',
    },
    verif: {
      self: '- Verification: "self" with concrete commands (tests, build); "agent" only for risk "high" or when the user asked for a review (relectureDemandee).',
      risque: '- Verification: "agent" if the task changes shared or critical code (risk medium or high) or when the user asked for a review (relectureDemandee); otherwise "self" with concrete commands.',
      code: '- Verification: "agent" for every task that changes code; "self" with concrete commands for the others.',
    },
    perimetre: {
      strict: '- Scope: only what is asked, no extras (README, screenshots, review). A question ("is it possible?") calls for a study, then a question to the user before any implementation.',
      complements: '- Scope: do what is asked. Obvious complements of the change (its tests, its short doc) are allowed; no overall review, README or screenshots unless asked. A question ("is it possible?") calls for a study, then a question to the user before any implementation.',
      bonus: '- Scope: you may propose improvements, as "bonus" tasks subject to the user\'s approval.',
    },
    passation: '- Handoff: a task whose result serves others writes it in full to a deliverable file; its handoff notes say where to find it and what to look at.',
    modele: '- Model and effort: this profile does not touch them; choose them for each task according to its difficulty.',
    gardien: {
      registre: '- Context keeper: the HQ keeps the request log (the request, its additions, the plan, what each task returns) and every agent knows where to read it. For a large project document (requirements, a specification of thousands of lines), give each task the sections to read (headings or line numbers) rather than the whole document.',
      relecture: '- Context keeper: the HQ keeps the request log (the request, its additions, the plan, what each task returns) and every agent knows where to read it. For a large project document (requirements, a specification of thousands of lines), give each task the sections to read (headings or line numbers) rather than the whole document. After each finished task you will receive its full report: check that it fits the request and the decisions already made, and correct the rest if it drifts.',
    },
    rappel: (n, m) => `WORK PROFILE reminder: Cost = ${n} (at most ${m} tasks).`,
  },
};

export function blocDirective(profil, langue = REGLAGES.langueIA || 'fr') {
  const T = TEXTES[langue] || TEXTES.fr;
  return [
    T.titre(nomProfil(profil, langue)),
    T.but,
    (T.decoupage[profil.decoupage] || T.decoupage.actuel)(profil.maxTaches),
    T.direct[profil.agentDirect] || T.direct.jamais,
    T.verif[profil.verifDefaut] || T.verif.code,
    T.perimetre[profil.perimetre] || T.perimetre.bonus,
    T.passation,
    T.modele,
    T.gardien[profil.gardien] || null,
  ].filter(Boolean).join('\n');
}

export function rappelProfil(profil, langue = REGLAGES.langueIA || 'fr') {
  return (TEXTES[langue] || TEXTES.fr).rappel(nomProfil(profil, langue), profil.maxTaches);
}

const RISQUE_MOYEN = new Set(['medium', 'high']);
const MODELE_STANDARD = 'sonnet'; // niveau « standard » de Claude, quand le modèle n'est pas connu

// IA d'un modèle d'après config/defauts/equivalences.json (claude, codex…), null pour un modèle inconnu (agent ACP).
function iaDuModele(modele) {
  const eq = chargerEquivalences();
  const m = String(modele || '').toLowerCase();
  if (!m) return null;
  for (const [f, table] of Object.entries(eq)) {
    if (f === 'modeles' || !table || typeof table !== 'object' || Array.isArray(table)) continue;
    if (table[m] || Object.keys(table).some((id) => m.includes(id))) return f;
  }
  return null;
}

// Vérificateur au niveau standard : un modèle plus fort prend le modèle standard de SA propre IA (Sonnet chez Claude,
// GPT-6.1 Terra chez Codex), ce qui garde une relecture croisée voulue par le DG ; un modèle eco ou standard est
// gardé, comme un modèle inconnu.
export function verificateurStandard(modele) {
  const ia = iaDuModele(modele);
  if (!ia) return modele;
  const niveaux = chargerEquivalences().niveaux || ['eco', 'standard', 'fort', 'max'];
  if (niveaux.indexOf(niveauDe(modele, ia)) <= niveaux.indexOf('standard')) return modele;
  return modeleParNiveau(ia, 'standard') || modele;
}

/**
 * B5 : vérification d'une tâche selon le profil. tache = { risque, approbation, verification }.
 * Renvoie la vérification effective ; `ajustement` dit ce que le profil a changé (affiché dans le plan).
 * Seul le vérificateur peut baisser (Économe : niveau standard, effort low) ; jamais la production.
 */
export function verificationProfil(tache, profil, { relecture = false, langue = REGLAGES.langueIA || 'fr' } = {}) {
  const v = { ...(tache.verification || {}) };
  if (!v.mode) return v;
  const nom = nomProfil(profil, langue);
  const changes = [];
  if (v.mode === 'agent') {
    // relecture demandée, approbation ou risque élevé : vérificateur gardé à tous les niveaux
    const garder =
      profil.verifDefaut === 'code' ||
      tache.risque === 'high' || tache.approbation === true || relecture ||
      (profil.verifDefaut === 'risque' && RISQUE_MOYEN.has(tache.risque));
    if (!garder) {
      v.mode = 'self';
      changes.push('self');
    }
  }
  if (v.mode === 'agent') {
    if (profil.verifMaxTurns) v.maxTurns = profil.verifMaxTurns;
    if (profil.verifNiveau === 'standard') {
      // sans modèle de vérification choisi, le vérificateur partirait sur celui de la tâche
      const cible = verificateurStandard(v.modele || tache.modele || MODELE_STANDARD);
      if (cible !== v.modele) {
        v.modele = cible;
        changes.push(cible);
      }
    }
    if (profil.verifEffort && v.effort !== profil.verifEffort) {
      v.effort = profil.verifEffort;
      changes.push(`effort ${profil.verifEffort}`);
    }
  }
  if (typeof profil.maxRework === 'number' && (v.maxRework ?? 0) > profil.maxRework) v.maxRework = profil.maxRework;
  if (changes.length) v.ajustement = langue === 'en' ? `verification: ${changes.join(', ')} (${nom} profile)` : `vérification : ${changes.join(', ')} (profil ${nom})`;
  return v;
}

// B4 : mission d'une tâche « direct » = la demande telle que tapée + le contexte du DG.
export function missionDirecte(demande, contexteDg, langue = REGLAGES.langueIA || 'fr') {
  const titre = langue === 'en' ? 'DG context' : 'Contexte du DG';
  return contexteDg?.trim() ? `${demande}\n\n${titre} :\n${contexteDg.trim()}` : demande;
}

// B8 : ambiance coupée dans le profil des Réglages (Économe, ou Personnalisé ainsi réglé) → bavardages du mini-jeu
// et récolte de Joy sans appel au modèle.
// Les discussions ouvertes par l'utilisateur restent permises.
export const ambianceCoupee = (reglages = REGLAGES) => profilEffectif(null, reglages).ambiance === false;

// B7 : sous-agent d'exploration (lecture seule, modèle léger) pour les producteurs qui éditent.
const OUTILS_LECTURE = ['Read', 'Grep', 'Glob'];
const OUTILS_ECRITURE = ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent'];
const TEXTES_EXPLO = {
  fr: {
    description: 'Cherche dans le code et rend un résumé court (fichiers, fonctions, lignes utiles). À utiliser pour toute recherche qui demanderait de lire plus de 3 fichiers.',
    prompt: "Tu explores le code pour un autre agent. Tu ne modifies rien. Rends un résumé de 300 mots au plus : chemins, fonctions, numéros de ligne, conventions repérées. Pas de contenu de fichier entier.",
    permise: '\n\nPour une recherche large, confie-la à `explorateur` : il te rend un résumé, et ta conversation reste légère.',
    encouragee: '\n\nPour une recherche large, confie-la systématiquement à `explorateur` : il te rend un résumé, et ta conversation reste légère.',
  },
  en: {
    description: 'Searches the code and returns a short summary (files, functions, useful lines). Use it for any search that would need reading more than 3 files.',
    prompt: 'You explore the code for another agent. You change nothing. Return a summary of 300 words at most: paths, functions, line numbers, conventions spotted. No whole file contents.',
    permise: '\n\nFor a broad search, hand it to `explorateur`: it returns a summary and your conversation stays light.',
    encouragee: '\n\nFor a broad search, always hand it to `explorateur`: it returns a summary and your conversation stays light.',
  },
};

/** Options SDK du sous-agent (null si le profil l'interdit ou si la tâche n'édite pas). */
export function optionsExploration(profil, profilOutils, langue = REGLAGES.langueIA || 'fr') {
  if (!profil || profil.exploration === 'interdite' || !['edition', 'edition+tests'].includes(profilOutils)) return null;
  const T = TEXTES_EXPLO[langue] || TEXTES_EXPLO.fr;
  const model = (profil.base || profil.cout) === 'econome' ? 'haiku' : 'sonnet'; // jamais le modèle de la tâche
  const def = { description: T.description, prompt: T.prompt, model, tools: OUTILS_LECTURE, disallowedTools: OUTILS_ECRITURE, maxTurns: 25 };
  return {
    agents: { explorateur: def, Explore: { ...def, description: T.description } },
    append: T[profil.exploration] || T.permise,
  };
}
