// « Signaler un problème » (1.0.8) : un rapport de bug ou une idée, prêt à publier sur GitHub. Le site montre le
// texte complet avant tout envoi ; rien ne part du QG lui-même (c'est la page qui ouvre GitHub, après un clic).
// Le rapport joint la version, le système et les dernières lignes affichées par le serveur, nettoyées de tout ce
// qui est personnel : jeton du QG, clés et jetons d'API, adresses mail, IP, dossiers de projets, dossier
// personnel, nom d'utilisateur, prénom, motifs personnels (runtime/motifs-personnels.txt s'il existe).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEPOT_RAPPORTS = 'Ishine93/agents-hq';
const LIGNES_MAX = 300;
const URL_MAX = 7800; // GitHub refuse les adresses trop longues (~8 000 caractères)

// ---------------------------------------------------------------- dernières lignes du serveur
const recentes = [];
let installe = false;

/** Garde en mémoire les dernières lignes écrites par console.log / warn / error (rien sur le disque). */
export function installerJournalRecent() {
  if (installe) return;
  installe = true;
  for (const niveau of ['log', 'info', 'warn', 'error']) {
    const origine = console[niveau].bind(console);
    console[niveau] = (...args) => {
      try {
        const texte = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : safeJson(a))).join(' ');
        for (const ligne of texte.split(/\r?\n/)) {
          if (!ligne.trim()) continue;
          recentes.push(`${new Date().toISOString().slice(11, 19)} ${niveau === 'log' || niveau === 'info' ? '' : niveau.toUpperCase() + ' '}${ligne.slice(0, 400)}`);
        }
        if (recentes.length > LIGNES_MAX) recentes.splice(0, recentes.length - LIGNES_MAX);
      } catch {
        /* le journal ne doit jamais casser l'affichage */
      }
      origine(...args);
    };
  }
}

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const lignesRecentes = (n = 60) => recentes.slice(-n);

/** Dernier plantage noté par serveur/gardien.js, s'il date de moins de 7 jours : ses lignes, sinon []. */
export function dernierPlantage(racine) {
  try {
    const f = path.join(racine, 'runtime', 'dernier-plantage.txt');
    if (Date.now() - fs.statSync(f).mtimeMs > 7 * 86400000) return [];
    return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).slice(0, 40);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- nettoyage
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Un chemin s'écrit avec \ ou /, et Windows ignore la casse : on cherche toutes ses formes.
function motifChemin(p) {
  const morceaux = String(p).split(/[\\/]+/).filter(Boolean).map(echapper);
  if (!morceaux.length) return null;
  const debut = /^[\\/]/.test(p) ? '[\\\\/]+' : '';
  return new RegExp(debut + morceaux.join('[\\\\/]+'), process.platform === 'win32' ? 'gi' : 'g');
}

/**
 * Retire d'un texte tout ce qui est personnel. `connu` : { jeton, chemins: [[chemin, remplacement]...], mots: [...] }.
 * Les chemins les plus longs passent d'abord (un projet est dans le dossier personnel).
 */
export function nettoyer(texte, connu = {}) {
  let s = String(texte || '');
  if (connu.jeton && connu.jeton.length >= 8) s = s.split(connu.jeton).join('<jeton>');
  s = s.replace(/([?&](?:jeton|token|key|cle|apikey|api_key)=)[^&\s"'<>]+/gi, '$1<jeton>');
  const chemins = (connu.chemins || []).filter(([p]) => p && String(p).length > 3).sort((a, b) => String(b[0]).length - String(a[0]).length);
  for (const [p, remplacement] of chemins) {
    const re = motifChemin(p);
    if (re) s = s.replace(re, remplacement);
  }
  s = s
    // clés et jetons connus (Anthropic, OpenAI, xAI, GitHub, Google, Slack, Hugging Face…), puis « Bearer … »
    .replace(/\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|xai-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|hf_[A-Za-z0-9]{20,})\b/g, '<cle>')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '$1 <cle>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/\b(?!127\.0\.0\.1\b)(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip>')
    // longues suites hexadécimales ou base64 (jetons, empreintes de session) ; les UUID restent lisibles
    .replace(/\b[a-f0-9]{40,}\b/gi, '<secret>')
    .replace(/\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[a-z])(?=[A-Za-z0-9+/_-]*[A-Z])[A-Za-z0-9+/_-]{40,}={0,2}/g, '<secret>');
  for (const mot of connu.mots || []) {
    const m = String(mot || '').trim();
    if (m.length < 3) continue;
    s = s.replace(new RegExp(`(?<![\\p{L}\\p{N}])${echapper(m)}(?![\\p{L}\\p{N}])`, 'giu'), '<perso>');
  }
  return s;
}

/** Ce qui est connu de personnel sur ce poste : jeton, dossiers, noms (à passer à nettoyer). */
export function personnelConnu({ racine, jeton = '', etages = [], racines = [], prenom = '', comptes = [] } = {}) {
  const home = os.homedir();
  const chemins = [];
  etages.forEach((e, i) => {
    for (const p of [e.projet, ...(e.dossiers || [])]) if (p) chemins.push([p, `<projet ${i + 1}>`]);
  });
  racines.forEach((p, i) => chemins.push([p, `<racine ${i + 1}>`]));
  for (const c of comptes) if (c.configDir) chemins.push([c.configDir, `<compte ${c.id}>`]);
  if (racine) chemins.push([racine, '<QG>']);
  if (home) chemins.push([home, '~']);
  const mots = [prenom, ...comptes.map((c) => c.nom)];
  try {
    mots.push(os.userInfo().username);
  } catch {
    /* pas de nom d'utilisateur lisible */
  }
  try {
    const f = path.join(racine || '', 'runtime', 'motifs-personnels.txt');
    if (racine && fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) if (l.trim()) mots.push(l.trim());
  } catch {
    /* fichier illisible : pas de motifs en plus */
  }
  return { jeton, chemins, mots: [...new Set(mots.filter(Boolean))] };
}

// ---------------------------------------------------------------- le rapport
const TITRES = { bug: 'Bug', idee: 'Idée' };
const tronquer = (s, n) => (s.length > n ? s.slice(0, n - 12) + ' … (coupé)' : s);

/**
 * Rapport prêt à publier : { titre, corps, url, coupe }.
 * saisie : { type: 'bug'|'idee', titre, quoi, attendu, etapes, joindre } ; infos : diagnostic déjà connu du serveur.
 */
export function construireRapport(saisie, infos, connu) {
  const type = saisie.type === 'idee' ? 'idee' : 'bug';
  const propre = (x, n) => tronquer(nettoyer(String(x || '').trim(), connu), n);
  const titre = propre(saisie.titre, 120) || (type === 'bug' ? 'Un problème' : 'Une idée');
  const parties = [];
  if (type === 'bug') {
    parties.push('### Ce qui s’est passé', propre(saisie.quoi, 3000) || '—', '', '### Ce que j’attendais', propre(saisie.attendu, 2000) || '—', '');
    if (String(saisie.etapes || '').trim()) parties.push('### Pour le refaire', propre(saisie.etapes, 2000), '');
  } else {
    parties.push('### L’idée', propre(saisie.quoi, 4000) || '—', '');
    if (String(saisie.attendu || '').trim()) parties.push('### Pourquoi ce serait utile', propre(saisie.attendu, 2000), '');
  }
  const debut = parties.join('\n');
  let lignes = saisie.joindre === false ? [] : (infos.lignes || []).map((l) => nettoyer(l, connu));
  const plantage = saisie.joindre === false ? [] : (infos.plantage || []).map((l) => nettoyer(l, connu));
  const diag = saisie.joindre === false ? '' : [
    '### Informations techniques',
    `- Version : ${infos.version || '?'}${infos.demo ? ' (démo)' : ''}`,
    `- Système : ${infos.systeme || '?'}`,
    `- Node : ${infos.node || '?'}`,
    `- Langue : ${infos.langue || '?'}`,
    `- Comptes IA : ${infos.comptes || 'aucun'}`,
    `- Étages actifs : ${infos.etages ?? '?'} ; dossiers en cours : ${infos.enCours ?? '?'}`,
  ].join('\n');
  const bloc = (titre, l) => (l.length ? ['', `<details><summary>${titre}</summary>`, '', '```', ...l, '```', '</details>'].join('\n') : '');
  const assembler = () => [debut, diag, bloc('Dernier plantage du serveur', plantage), bloc('Dernières lignes du serveur', lignes)].filter(Boolean).join('\n') + '\n\n_Envoyé avec « Signaler un problème » du QG des agents._';
  const url = (corps) => `https://github.com/${DEPOT_RAPPORTS}/issues/new?${new URLSearchParams({ title: `[${TITRES[type]}] ${titre}`, body: corps, labels: type === 'bug' ? 'bug' : 'enhancement' })}`;
  let corps = assembler();
  let coupe = false;
  // l'adresse doit rester courte : on retire d'abord les plus vieilles lignes du journal
  while (url(corps).length > URL_MAX && lignes.length) {
    lignes = lignes.slice(Math.ceil(lignes.length / 4) || 1);
    coupe = true;
    corps = assembler();
  }
  while (url(corps).length > URL_MAX && corps.length > 500) {
    corps = corps.slice(0, Math.floor(corps.length * 0.85)) + '\n… (coupé)';
    coupe = true;
  }
  return { titre: `[${TITRES[type]}] ${titre}`, corps, url: url(corps), coupe };
}
