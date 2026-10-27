// Registre des fournisseurs d'IA (docs/multi-ia/conception.md §2.2). Le reste du serveur ne sait rien des
// fournisseurs : il demande l'adaptateur d'un compte et lui parle avec les mêmes rappels.
// Chaque adaptateur exporte : id, nom, acces, connexions, FORMAT_CLE, ERREUR_CLE, dossierParDefaut(id),
// dossierConfig(compte), envPour(compte), etatConnexion(compte), verifierConnexion(compte),
// fichierConnexion(compte), ouvrirConnexion(compte, { mode }), deconnecter(compte), capacites(compte),
// modeles(compte), lancer(args). Facultatif : convertirModele(compte, modele), convertirEffort(compte, modele,
// effort) quand l'adaptateur sait mieux que la table des équivalences (agents ACP : modèles appris de l'agent).
import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from '../plateforme.js';
import * as claude from './claude.js';
import * as codex from './codex.js';
import * as acp from './acp.js';

export const FOURNISSEURS = { claude, codex, acp };
export const fournisseurDe = (compte) => (compte?.fournisseur && FOURNISSEURS[compte.fournisseur] ? compte.fournisseur : 'claude');
export const adaptateurDe = (compte) => FOURNISSEURS[fournisseurDe(compte)];
export const adaptateur = (id) => FOURNISSEURS[id] || null;

// Pour le site : liste des fournisseurs proposés à l'ajout d'un compte.
export const listeFournisseurs = () =>
  Object.values(FOURNISSEURS).map((f) => ({ id: f.id, nom: f.nom, acces: f.acces, connexions: f.connexions, present: f.binairePresent() }));

// ---------------------------------------------------------------- niveaux et équivalences de modèles

let equivalences = null;
export function chargerEquivalences() {
  if (!equivalences) {
    try {
      equivalences = JSON.parse(fs.readFileSync(path.join(RACINE, 'config', 'defauts', 'equivalences.json'), 'utf8'));
    } catch {
      equivalences = { niveaux: ['eco', 'standard', 'fort', 'max'], claude: {}, codex: {}, modeles: {} };
    }
  }
  return equivalences;
}

// Niveau (eco, standard, fort, max) d'un modèle, quel que soit son fournisseur. Un alias Claude précis
// (claude-sonnet-5-5…) prend le niveau de sa famille ; un inconnu est « standard ».
export function niveauDe(modele, fournisseur = null) {
  const eq = chargerEquivalences();
  const m = String(modele || '').toLowerCase();
  for (const f of fournisseur ? [fournisseur] : Object.keys(FOURNISSEURS)) {
    const table = eq[f] || {};
    if (table[m]) return table[m];
    for (const [id, niveau] of Object.entries(table)) if (m.includes(id)) return niveau;
  }
  return 'standard';
}

export function modeleParNiveau(fournisseur, niveau) {
  const table = chargerEquivalences()[fournisseur] || {};
  const trouve = Object.entries(table).find(([, n]) => n === niveau);
  if (trouve) return trouve[0];
  // niveau absent chez ce fournisseur : le plus proche en descendant
  const ordre = chargerEquivalences().niveaux;
  for (let i = ordre.indexOf(niveau) - 1; i >= 0; i--) {
    const t = Object.entries(table).find(([, n]) => n === ordre[i]);
    if (t) return t[0];
  }
  return Object.keys(table)[0] || null;
}

// Le modèle demandé s'il appartient au fournisseur du compte, sinon le modèle du même niveau.
export function convertirModele(compte, modele) {
  const f = fournisseurDe(compte);
  if (f === 'claude') return modele;
  if (adaptateurDe(compte).convertirModele) return adaptateurDe(compte).convertirModele(compte, modele);
  const eq = chargerEquivalences();
  if (eq[f]?.[modele]) return modele;
  const liste = adaptateurDe(compte).modeles?.(compte) || [];
  if (liste.some((m) => m.id === modele)) return modele;
  return modeleParNiveau(f, niveauDe(modele, 'claude')) || modele;
}

// Effort demandé, ramené au plus proche effort disponible pour ce modèle.
export function convertirEffort(compte, modele, effort) {
  if (adaptateurDe(compte).convertirEffort) return adaptateurDe(compte).convertirEffort(compte, modele, effort);
  const liste = adaptateurDe(compte).modeles?.(compte) || [];
  const m = liste.find((x) => x.id === modele);
  if (!m || !m.efforts?.length || m.efforts.includes(effort)) return effort;
  const ordre = ['low', 'medium', 'high', 'xhigh', 'max'];
  for (let i = ordre.indexOf(effort); i >= 0; i--) if (m.efforts.includes(ordre[i])) return ordre[i];
  return m.efforts[0];
}
