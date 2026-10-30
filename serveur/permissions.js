// Permissions : profils imposés par le serveur + « main levée » (canUseTool) vers le site.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { profils, etage as trouverEtage, etagesActifs, racines, sous, cheminRegle, RACINE, REGLAGES } from './config.js';
import { chargerComptes, dossierConfig } from './comptes.js';
import * as plateforme from './plateforme.js';
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

const listerDossier = (dossier) => fs.readdirSync(dossier, { withFileTypes: true });

// Écrire hors des zones : toujours une demande (règles « ask », qui priment sur le mode auto).
// Les règles ne savent pas dire « tout sauf », on énumère donc : les lecteurs sans zone en entier
// (Windows ; sur Mac, la racine « / » est la seule), et, en descendant vers chaque zone, les dossiers
// et fichiers voisins qui n'en contiennent pas.
// Jamais de règle « parent/* » : Claude Code l'applique aussi à tout ce qui est SOUS le dossier
// enfant (comme un .gitignore), donc à la zone elle-même : chaque écriture dans un projet demandait.
function explorer(dossier, zonesIci, cibles, { plat, lister }) {
  const ch = plateforme.estWindows(plat) ? path.win32 : path.posix;
  let entrees = [];
  try {
    entrees = lister(dossier);
  } catch {
    return;
  }
  for (const ent of entrees) {
    const p = ch.join(dossier, ent.name);
    if (zonesIci.some((z) => plateforme.memeChemin(z, p, plat))) continue;
    if (!ent.isDirectory()) {
      cibles.push(plateforme.cheminRegle(p, plat)); // fichier existant posé à côté d'une zone
      continue;
    }
    const dessous = zonesIci.filter((z) => plateforme.sousChemin([p], z, plat));
    if (dessous.length) explorer(p, dessous, cibles, { plat, lister });
    else cibles.push(`${plateforme.cheminRegle(p, plat)}/**`);
  }
}

/**
 * Règles « demander » pour toute écriture hors des zones données.
 * (plat, lister, existe : plateforme et système de fichiers injectables, pour les tests)
 */
export function reglesPourZones(zs, { plat = plateforme.PLATEFORME, lister = listerDossier, existe = fs.existsSync } = {}) {
  const cibles = [];
  for (const racine of plateforme.racinesRegles(plat, existe)) {
    const ici = zs.filter((z) => plateforme.surRacine(z, racine, plat));
    if (ici.length) explorer(racine, ici, cibles, { plat, lister });
    else cibles.push(`${plateforme.cheminRegle(racine, plat)}/**`);
  }
  return cibles.flatMap((c) => ['Edit', 'Write', 'NotebookEdit'].map((o) => `${o}(${c})`));
}

let cacheHorsZones = { cle: '', regles: [] };
export function reglesHorsZones() {
  const zs = zones();
  const cle = zs.join('|');
  if (cacheHorsZones.cle !== cle) cacheHorsZones = { cle, regles: reglesPourZones(zs) };
  return cacheHorsZones.regles;
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

// Réglage « Git sans demander » : les profils qui écrivent peuvent faire toutes les commandes git
// (pull, commit, branche, merge, push) ; git push n'est plus interdit.
const GIT_LIBRE = ['Bash(git)', 'Bash(git *)'];

export function optionsProfil(nom) {
  const { toujoursRefuse, profils: liste } = profils();
  const p = liste[nom] || liste.lecture;
  // Mode prudent (Réglages) : pas de mode auto, chaque action non couverte demande ton accord.
  const mode = p.mode === 'auto' && REGLAGES.modeTravail === 'prudent' ? 'default' : p.mode;
  const gitLibre = REGLAGES.gitAuto === true && p.mode === 'auto';
  return {
    permissionMode: mode,
    tools: p.outils,
    allowedTools: [...developper(p.autorises), ...(gitLibre ? GIT_LIBRE : [])],
    disallowedTools: developper(toujoursRefuse).filter((r) => !(gitLibre && /^Bash\(git push/.test(r))),
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
    // « Toujours » est toujours proposé (sauf pour un feu vert de lancement) : il vaut pour cette tâche
    peutToujours: outil !== 'Lancement',
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
      ...(permission.peutToujours ? [{ id: 'allow_session', libelle: tr('Toujours pour {nom}', { nom: tache.prenom || tache.ref }) }] : []),
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

// Outils qui créent ou modifient des fichiers, et le fichier visé.
const OUTILS_ECRITURE = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const fichierVise = (outil, input = {}) => (OUTILS_ECRITURE.has(outil) ? input.file_path || input.notebook_path || null : null);
const sousDossier = (p, base) => {
  const r = path.relative(path.resolve(base), path.resolve(p));
  return !!r && !r.startsWith('..') && !path.isAbsolute(r);
};

// « Toujours pour {nom} » : la même sorte d'action ne redemande plus rien jusqu'à la fin de la tâche
// (écrire des fichiers, la même commande, le même site…).
function sorteAction(outil, input = {}) {
  if (OUTILS_ECRITURE.has(outil)) return 'fichiers';
  if (outil === 'Bash') return 'bash:' + String(input.command || '').trim().split(/\s+/)[0];
  if (outil === 'WebFetch') {
    try {
      return 'web:' + new URL(input.url).hostname;
    } catch {
      return 'web';
    }
  }
  return outil;
}

// 1.0.11 : une commande qui demande les droits administrateur ouvre une fenêtre Windows (contrôle de compte) qui
// bloque l'agent jusqu'au retour de l'utilisateur. Elle est refusée, quel que soit le profil.
const ADMIN = /-Verb\s+['"]?RunAs\b|\brunas(\.exe)?\s+\/|\b(g?sudo)(\.exe)?\s|\bStart-Process\b[^\n|;]*\bRunAs\b|\bnircmd(c)?(\.exe)?\s+elevate\b/i;
export const demandeAdmin = (commande) => ADMIN.test(String(commande || ''));

/** Crochet PreToolUse des agents : refus des commandes en administrateur (Bash et PowerShell). */
export function crochetsAdmin() {
  return {
    PreToolUse: [{
      matcher: 'Bash|PowerShell',
      hooks: [async (entree) => {
        if (!demandeAdmin(entree?.tool_input?.command)) return { continue: true };
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: "Refusé par le QG : cette commande demande les droits administrateur, et la fenêtre de Windows bloquerait le travail jusqu'au retour de l'utilisateur. Fais sans ; si c'est vraiment nécessaire, dis-le dans ton rapport.",
          },
        };
      }],
    }],
  };
}

/** Plusieurs jeux de crochets en un (les entrées d'un même événement s'ajoutent). */
export function fusionnerCrochets(...jeux) {
  const r = {};
  for (const j of jeux) for (const [ev, liste] of Object.entries(j || {})) r[ev] = [...(r[ev] || []), ...liste];
  return Object.keys(r).length ? r : undefined;
}

export function canUseToolPour(tache) {
  return async (toolName, input, { signal, suggestions, blockedPath }) => {
    const fichier = fichierVise(toolName, input);
    // brouillons dans le dossier temporaire de Windows : rien à demander
    if (fichier && sousDossier(fichier, os.tmpdir())) return { behavior: 'allow', updatedInput: input };
    // réglage « Écrire hors des projets sans demander » (coupé par défaut)
    if (fichier && REGLAGES.ecritureHorsProjet === true) return { behavior: 'allow', updatedInput: input };
    const sorte = sorteAction(toolName, input);
    tache.x.toujours = tache.x.toujours || [];
    if (tache.x.toujours.includes(sorte)) return { behavior: 'allow', updatedInput: input };
    const decision = await demander(tache, toolName, input, signal, { suggestions, blockedPath });
    if (decision === 'allow') return { behavior: 'allow', updatedInput: input };
    // « Toujours pour {nom} » : retenu pour cette tâche (et les règles suggérées par Claude Code, s'il y en a)
    if (decision === 'allow_session') {
      if (!tache.x.toujours.includes(sorte)) tache.x.toujours.push(sorte);
      return { behavior: 'allow', updatedInput: input, updatedPermissions: suggestions || [] };
    }
    return { behavior: 'deny', message: decision };
  };
}
