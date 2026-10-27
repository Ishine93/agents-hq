// Réglage « Coût » (1.0.6, lot B) : profil de travail d'un dossier et bloc PROFIL DE TRAVAIL donné au DG.
// Rien ici ne touche au modèle ni à l'effort des tâches de production ni du DG.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGLAGES } from './config.js';

const FICHIER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'defauts', 'profils-travail.json');
export const NIVEAUX = ['econome', 'equilibre', 'max'];
export const NIVEAU_DEFAUT = 'equilibre';

let cache = null;
export function profilsTravail() {
  if (!cache) cache = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  return cache;
}

// Les boutons connus et leurs valeurs permises (pour filtrer « personnalise » et les valeurs inconnues).
const ENUMS = {
  decoupage: ['chantier', 'parallele', 'actuel'],
  agentDirect: ['jamais', 'petite', 'projet-unique'],
  verifDefaut: ['self', 'risque', 'code'],
  verifNiveau: [null, 'standard'],
  verifEffort: [null, 'low', 'medium', 'high'],
  perimetre: ['strict', 'complements', 'bonus'],
  exploration: ['interdite', 'permise', 'encouragee'],
  ambiance: [null, false],
};
const NOMBRES = ['compactionAgents', 'compactionVerif', 'compactionDg', 'maxTaches', 'verifMaxTurns', 'maxRework', 'seuilAccordFenetre', 'plafondTacheFacteur'];
const PEUT_ETRE_NUL = new Set(['seuilAccordFenetre', 'plafondTacheFacteur']);

function valeurValide(cle, v) {
  if (cle in ENUMS) return ENUMS[cle].includes(v);
  if (NOMBRES.includes(cle)) return (v === null && PEUT_ETRE_NUL.has(cle)) || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return false;
}

export const niveauValide = (n) => (NIVEAUX.includes(n) ? n : NIVEAU_DEFAUT);

// Garde seulement les boutons connus aux valeurs permises.
export function nettoyerPersonnalise(p) {
  const r = {};
  for (const [k, v] of Object.entries(p && typeof p === 'object' ? p : {})) if (valeurValide(k, v)) r[k] = v;
  return r;
}

// Réglages utilisateur : travail absent ou abîmé → défaut (migration).
export function travailReglages(reglages = REGLAGES) {
  const t = reglages?.travail || {};
  return { cout: niveauValide(t.cout), personnalise: nettoyerPersonnalise(t.personnalise) };
}

/**
 * Profil à plat d'un dossier : niveau (celui du dossier, sinon des réglages) + personnalisation des réglages
 * + personnalisation propre au dossier. Le niveau choisi à l'envoi est figé dans dossier.travail.
 */
export function profilEffectif(dossier = null, reglages = REGLAGES) {
  const glob = travailReglages(reglages);
  const cout = NIVEAUX.includes(dossier?.travail?.cout) ? dossier.travail.cout : glob.cout;
  const base = profilsTravail().cout[cout];
  // la personnalisation des réglages ne vaut que pour le niveau des réglages
  const perso = cout === glob.cout ? glob.personnalise : {};
  return { cout, ...base, ...perso, ...nettoyerPersonnalise(dossier?.travail?.personnalise) };
}

const NOMS = {
  fr: { econome: 'Économe', equilibre: 'Équilibré', max: 'Max' },
  en: { econome: 'Thrifty', equilibre: 'Balanced', max: 'Max' },
};
export const nomNiveau = (cout, langue = 'fr') => (NOMS[langue] || NOMS.fr)[cout] || cout;

const TEXTES = {
  fr: {
    titre: (n) => `PROFIL DE TRAVAIL (choisi par l'utilisateur pour cette demande) : Coût = ${n}.`,
    but: '- But : le meilleur résultat au juste coût. Chaque tâche, vérificateur ou agent en plus doit apporter un gain réel.',
    decoupage: {
      chantier: (m) => `- ${m} tâches au plus. Une tâche par chantier : l'analyse et la réalisation d'un même code vont toujours dans la même tâche. Pas de tâche de revue ni de synthèse sans demande.`,
      parallele: (m) => `- ${m} tâches au plus. L'analyse et la réalisation d'un même code vont dans la même tâche : l'agent qui explore garde son contexte pour implémenter. Ne sépare que le travail vraiment parallèle et indépendant (projets différents, sources de bench différentes).`,
      actuel: (m) => `- ${m} tâches au plus. Découpage habituel (production, vérification et mesure, travail dépendant séparés).`,
    },
    direct: {
      'projet-unique': '- Demande qui touche un seul projet : rends une seule tâche en mode "direct" (la demande de l\'utilisateur, plus le contexte utile), sans vérificateur séparé.',
      petite: '- Petite demande (un projet, un changement localisé) : rends une seule tâche en mode "direct" (la demande de l\'utilisateur, plus le contexte utile), sans vérificateur séparé.',
      jamais: '- Mode "direct" non permis : rends toujours un plan (mode "plan").',
    },
    verif: {
      self: '- Vérification : "self" avec des commandes concrètes (tests, build) ; "agent" seulement si risque "high" ou si l\'utilisateur a demandé une relecture (relectureDemandee).',
      risque: '- Vérification : "agent" si la tâche modifie du code partagé ou critique (risque medium ou high) ou si l\'utilisateur a demandé une relecture (relectureDemandee) ; sinon "self" avec des commandes concrètes.',
      code: '- Vérification : "agent" pour toute tâche qui modifie du code (règle habituelle).',
    },
    perimetre: {
      strict: '- Périmètre : seulement ce qui est demandé, aucun à-côté (README, captures, revue). Une question (« est-ce possible ? ») appelle une étude, puis une question à l\'utilisateur avant toute implémentation.',
      complements: '- Périmètre : fais ce qui est demandé. Les compléments évidents du changement (ses tests, sa doc courte) sont permis ; pas de revue d\'ensemble, de README ou de captures en plus sans demande. Une question (« est-ce possible ? ») appelle une étude, puis une question à l\'utilisateur avant toute implémentation.',
      bonus: '- Périmètre : tu peux proposer des améliorations, en tâches « bonus » soumises à l\'approbation de l\'utilisateur.',
    },
    passation: '- Passation : une tâche dont le résultat sert à d\'autres l\'écrit en entier dans un fichier livrable ; ses notes de passation disent où le trouver et quoi y regarder.',
    modele: '- Modèle et effort : ta grille habituelle, inchangée.',
    rappel: (n, m) => `Rappel du PROFIL DE TRAVAIL : Coût = ${n} (${m} tâches au plus).`,
  },
  en: {
    titre: (n) => `WORK PROFILE (chosen by the user for this request): Cost = ${n}.`,
    but: '- Goal: the best result at a fair cost. Every extra task, verifier or agent must bring a real gain.',
    decoupage: {
      chantier: (m) => `- At most ${m} tasks. One task per workstream: analysis and implementation of the same code always go in the same task. No review or summary task unless asked.`,
      parallele: (m) => `- At most ${m} tasks. Analysis and implementation of the same code go in the same task: the agent that explores keeps its context to implement. Only split truly parallel, independent work (different projects, different bench sources).`,
      actuel: (m) => `- At most ${m} tasks. Usual splitting (production, verification and measurement, dependent work kept separate).`,
    },
    direct: {
      'projet-unique': '- A request that touches a single project: return a single task in "direct" mode (the user\'s request plus useful context), with no separate verifier.',
      petite: '- Small request (one project, a localized change): return a single task in "direct" mode (the user\'s request plus useful context), with no separate verifier.',
      jamais: '- "direct" mode not allowed: always return a plan ("plan" mode).',
    },
    verif: {
      self: '- Verification: "self" with concrete commands (tests, build); "agent" only for risk "high" or when the user asked for a review (relectureDemandee).',
      risque: '- Verification: "agent" if the task changes shared or critical code (risk medium or high) or when the user asked for a review (relectureDemandee); otherwise "self" with concrete commands.',
      code: '- Verification: "agent" for every task that changes code (usual rule).',
    },
    perimetre: {
      strict: '- Scope: only what is asked, no extras (README, screenshots, review). A question ("is it possible?") calls for a study, then a question to the user before any implementation.',
      complements: '- Scope: do what is asked. Obvious complements of the change (its tests, its short doc) are allowed; no overall review, README or screenshots unless asked. A question ("is it possible?") calls for a study, then a question to the user before any implementation.',
      bonus: '- Scope: you may propose improvements, as "bonus" tasks subject to the user\'s approval.',
    },
    passation: '- Handoff: a task whose result serves others writes it in full to a deliverable file; its handoff notes say where to find it and what to look at.',
    modele: '- Model and effort: your usual grid, unchanged.',
    rappel: (n, m) => `WORK PROFILE reminder: Cost = ${n} (at most ${m} tasks).`,
  },
};

export function blocDirective(profil, langue = REGLAGES.langueIA || 'fr') {
  const T = TEXTES[langue] || TEXTES.fr;
  return [
    T.titre(nomNiveau(profil.cout, langue)),
    T.but,
    (T.decoupage[profil.decoupage] || T.decoupage.actuel)(profil.maxTaches),
    T.direct[profil.agentDirect] || T.direct.jamais,
    T.verif[profil.verifDefaut] || T.verif.code,
    T.perimetre[profil.perimetre] || T.perimetre.bonus,
    T.passation,
    T.modele,
  ].join('\n');
}

export function rappelProfil(profil, langue = REGLAGES.langueIA || 'fr') {
  return (TEXTES[langue] || TEXTES.fr).rappel(nomNiveau(profil.cout, langue), profil.maxTaches);
}

const RISQUE_MOYEN = new Set(['medium', 'high']);
const MODELE_STANDARD = 'sonnet'; // niveau « standard » du fournisseur Claude (le multi-IA passera par l'adaptateur)

/**
 * B5 : vérification d'une tâche selon le profil. tache = { risque, approbation, verification }.
 * Renvoie la vérification effective ; `ajustement` dit ce que le profil a changé (affiché dans le plan).
 * Seul le vérificateur peut baisser (Économe : niveau standard, effort low) ; jamais la production.
 */
export function verificationProfil(tache, profil, { relecture = false, langue = REGLAGES.langueIA || 'fr' } = {}) {
  const v = { ...(tache.verification || {}) };
  if (!v.mode) return v;
  const nom = nomNiveau(profil.cout, langue);
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
    if (profil.verifNiveau === 'standard' && v.modele !== MODELE_STANDARD && v.modele !== 'haiku') {
      v.modele = MODELE_STANDARD;
      changes.push(MODELE_STANDARD);
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

// B8 : profil global (Réglages) en Économe → bavardages du mini-jeu et récolte de Joy sans appel au modèle.
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
  const model = profil.cout === 'econome' ? 'haiku' : 'sonnet'; // jamais le modèle de la tâche
  const def = { description: T.description, prompt: T.prompt, model, tools: OUTILS_LECTURE, disallowedTools: OUTILS_ECRITURE, maxTurns: 25 };
  return {
    agents: { explorateur: def, Explore: { ...def, description: T.description } },
    append: T[profil.exploration] || T.permise,
  };
}
