// Permissions : profils imposés par le serveur + « main levée » (canUseTool) vers le site.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { profils, etage as trouverEtage, etagesActifs, racines, sous, cheminRegle, RACINE, REGLAGES } from './config.js';
import { chargerComptes, dossierConfig } from './comptes.js';
import { expliquer } from './explication.js';
import { etat, emettre, changerEtatTache } from './bus.js';
import { notifier, notificationResolue } from './notifications.js';
import { t as tr } from './i18n.js';

let compteur = 0;
const attentes = new Map(); // id → { resolve, tache, etatAvant }

export function zones() {
  const liste = [...racines()];
  for (const e of etagesActifs()) for (const d of e.dossiers || [e.projet]) if (d && !sous(liste, d)) liste.push(d);
  return liste;
}

const meme = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// Écrire hors des zones : toujours une demande (règles « ask », qui priment sur le mode auto).
// Les règles ne savent pas dire « tout sauf », on énumère donc : les lecteurs sans zone en entier,
// et, en descendant vers chaque zone, les fichiers et dossiers voisins qui n'en contiennent pas.
function explorer(dossier, zonesIci, cibles) {
  cibles.push(`${cheminRegle(dossier)}/*`); // fichiers posés directement ici
  let noms = [];
  try {
    noms = fs.readdirSync(dossier, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return;
  }
  for (const nom of noms) {
    const p = path.join(dossier, nom);
    if (zonesIci.some((z) => meme(z, p))) continue;
    const dessous = zonesIci.filter((z) => sous([p], z));
    if (dessous.length) explorer(p, dessous, cibles);
    else cibles.push(`${cheminRegle(p)}/**`);
  }
}

let cacheHorsZones = { cle: '', regles: [] };
export function reglesHorsZones() {
  const zs = zones();
  const cle = zs.join('|');
  if (cacheHorsZones.cle === cle) return cacheHorsZones.regles;
  const cibles = [];
  for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const lecteur = `${l}:\\`;
    if (!fs.existsSync(lecteur)) continue;
    const ici = zs.filter((z) => path.resolve(z)[0].toUpperCase() === l);
    if (ici.length) explorer(lecteur, ici, cibles);
    else cibles.push(`//${l.toLowerCase()}/**`);
  }
  const regles = cibles.flatMap((c) => ['Edit', 'Write', 'NotebookEdit'].map((o) => `${o}(${c})`));
  cacheHorsZones = { cle, regles };
  return regles;
}

// Les profils citent {ZONES}, {QG}, {HOME} et {COMPTES} : on les remplace par les vrais chemins.
function developper(regles) {
  const zs = zones().map(cheminRegle);
  const comptes = chargerComptes().comptes.map((c) => cheminRegle(dossierConfig(c)));
  return regles.flatMap((r) => {
    if (r.includes('{ZONES}')) return zs.map((z) => r.replace('{ZONES}', `${z}/**`));
    if (r.includes('{COMPTES}')) return comptes.map((c) => r.replace('{COMPTES}', `${c}/**`));
    return [r.replace('{QG}', cheminRegle(RACINE)).replace('{HOME}', cheminRegle(os.homedir()))];
  });
}

export function optionsProfil(nom) {
  const { toujoursRefuse, profils: liste } = profils();
  const p = liste[nom] || liste.lecture;
  // Mode prudent (Réglages) : pas de mode auto, chaque action non couverte demande ton accord.
  const mode = p.mode === 'auto' && REGLAGES.modeTravail === 'prudent' ? 'default' : p.mode;
  return {
    permissionMode: mode,
    tools: p.outils,
    allowedTools: developper(p.autorises),
    disallowedTools: developper(toujoursRefuse),
    ...(p.mode === 'auto' ? { settings: { permissions: { ask: reglesHorsZones() } } } : {}),
  };
}

const tronquer = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

export function resumerEntree(outil, input = {}) {
  if (input.__resume) return tronquer(input.__resume, 160);
  if (outil === 'Bash') return tronquer(input.command, 160);
  if (['Edit', 'Write', 'Read', 'NotebookEdit'].includes(outil)) return tronquer(input.file_path || input.notebook_path, 160);
  if (outil === 'WebFetch') return tronquer(input.url, 160);
  if (outil === 'WebSearch') return tronquer(input.query, 160);
  if (outil === 'Glob' || outil === 'Grep') return tronquer(input.pattern, 160);
  return tronquer(JSON.stringify(input), 160);
}

// Crée la carte « main levée » et attend ta décision dans le site (sans limite de temps).
// `resume` est la phrase claire (« Chercher des fichiers : … »), `technique` le détail brut.
export function demander(tache, outil, input, signal, { suggestions = null, blockedPath = null } = {}) {
  const id = `P${++compteur}`;
  const e = expliquer(outil, input, { cwd: trouverEtage(tache.etage)?.projet, blockedPath });
  const permission = {
    id,
    tache: tache.id,
    outil,
    resume: e.phrase,
    technique: e.technique || resumerEntree(outil, input),
    risque: e.risque,
    horsProjet: e.horsProjet,
    peutToujours: !!suggestions?.length,
    t: Date.now(),
  };
  etat.permissions.set(id, permission);
  const etatAvant = tache.etat;
  changerEtatTache(tache, 'permission');
  emettre('permission', { permission }, tache.dossier);
  notifier({
    id,
    type: 'permission',
    titre: outil === 'Lancement' ? tr('{nom} attend ton feu vert', { nom: tache.prenom || tache.ref }) : tr('{nom} ({ref}) demande une autorisation', { nom: tache.prenom || tache.ref, ref: tache.ref }),
    texte: permission.resume,
    dossier: tache.dossier,
    tache: tache.id,
    etage: tache.etage,
    actions: [
      { id: 'allow', libelle: tr('Autoriser') },
      ...(permission.peutToujours ? [{ id: 'allow_session', libelle: tr('Toujours pour cette tâche') }] : []),
      { id: 'deny', libelle: tr('Refuser') },
    ],
  });
  return new Promise((resolve) => {
    attentes.set(id, { resolve, tache, etatAvant });
    signal?.addEventListener('abort', () => resoudre(id, 'deny', 'Tâche interrompue.'), { once: true });
  });
}

export function resoudre(id, decision, raison = null) {
  const a = attentes.get(id);
  if (!a) return false;
  attentes.delete(id);
  etat.permissions.delete(id);
  emettre('permission_resolue', { id, decision }, a.tache.dossier);
  notificationResolue(id);
  if (a.tache.etat === 'permission') changerEtatTache(a.tache, a.etatAvant === 'permission' ? 'running' : a.etatAvant);
  if (decision === 'allow' || decision === 'allow_session') a.resolve(decision);
  else a.resolve(raison || "L'utilisateur a refusé cette action. Trouve une autre voie ou rends blocked.");
  return true;
}

// Refuse toutes les demandes en cours d'un ensemble de tâches (annulation, arrêt d'urgence).
export function refuserPour(tacheIds) {
  for (const [id, a] of attentes) if (tacheIds.has(a.tache.id)) resoudre(id, 'deny', 'Tâche annulée.');
}

export function canUseToolPour(tache) {
  return async (toolName, input, { signal, suggestions, blockedPath }) => {
    const decision = await demander(tache, toolName, input, signal, { suggestions, blockedPath });
    if (decision === 'allow') return { behavior: 'allow', updatedInput: input };
    // « Toujours pour cette tâche » : on applique les règles suggérées par Claude Code pour cette session.
    if (decision === 'allow_session') return { behavior: 'allow', updatedInput: input, updatedPermissions: suggestions || [] };
    return { behavior: 'deny', message: decision };
  };
}
