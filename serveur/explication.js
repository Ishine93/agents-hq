// Traduit une demande d'autorisation technique en phrase claire, avec un niveau de risque.
// risque : lecture | modification | execution | reseau | suppression
import fs from 'node:fs';
import path from 'node:path';
import { t as tr } from './i18n.js';

const court = (s, n = 90) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

function liste(elements, max = 3) {
  if (elements.length <= max) return elements.join(', ');
  const n = elements.length - max;
  return tr(n > 1 ? '{elements} et {n} autres' : '{elements} et {n} autre', { elements: elements.slice(0, max).join(', '), n });
}

// « {JeuA,JeuB,…}*/** » → « les dossiers JeuA, JeuB, JeuC et 9 autres (avec tout leur contenu) »
function motifLisible(motif = '') {
  const accolades = motif.match(/\{([^}]+)\}/);
  const noms = accolades ? accolades[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
  const recursif = motif.includes('**');
  const ext = motif.match(/\*\.([a-z0-9]+)$/i)?.[1];
  let s = noms.length ? tr('les éléments {liste}', { liste: liste(noms) }) : motif.replace(/\*\*\/?/g, '').replace(/^\*$/, '') || tr('tous les fichiers');
  if (ext) s = `${noms.length ? s + ', ' : ''}${tr('les fichiers .{ext}', { ext })}`.replace(/^les éléments .+?, les fichiers/, (m) => m);
  if (recursif) s += ' ' + tr('(dans tous les sous-dossiers)');
  return s;
}

function relatif(p, cwd) {
  if (!p) return { texte: '', hors: false };
  const abs = path.isAbsolute(p) ? p : path.resolve(cwd || '.', p);
  if (cwd && abs.toLowerCase().startsWith(path.resolve(cwd).toLowerCase())) return { texte: path.relative(cwd, abs).replace(/\\/g, '/') || '.', hors: false };
  return { texte: abs, hors: true };
}

function expliquerBash(cmd = '', description = '') {
  const c = cmd.trim();
  const premiere = c.split(/&&|;|\|\|/)[0].trim();
  const plusieurs = /&&|;|\|\|/.test(c) ? ' ' + tr('(plusieurs commandes à la suite)') : '';
  const r = (phrase, risque) => ({ phrase: phrase + plusieurs, risque });
  let m;
  if ((m = premiere.match(/^(npm|pnpm|yarn)\s+(install|add|i)\b\s*(.*)$/))) {
    const paquets = m[3].split(/\s+/).filter((x) => x && !x.startsWith('-'));
    return r(paquets.length ? tr('Installer des paquets npm : {paquets} (téléchargés depuis Internet)', { paquets: liste(paquets) }) : tr('Installer des paquets npm (téléchargés depuis Internet)'), 'reseau');
  }
  if ((m = premiere.match(/^(pip|pip3|python -m pip)\s+install\s+(.*)$/))) return r(tr('Installer des paquets Python : {paquets} (téléchargés depuis Internet)', { paquets: court(m[2], 60) }), 'reseau');
  if (/^(curl|wget|iwr|Invoke-WebRequest)\b/i.test(premiere)) return r(tr('Télécharger quelque chose depuis Internet'), 'reseau');
  if (/^(rm|del|erase|rmdir|rd|Remove-Item)\b/i.test(premiere)) {
    const cibles = premiere.split(/\s+/).slice(1).filter((x) => !/^[-/]/.test(x));
    return r(tr('Supprimer : {cibles}', { cibles: liste(cibles) || tr('des fichiers') }), 'suppression');
  }
  if ((m = premiere.match(/^git\s+(\w+)/))) {
    const sens = { status: 'Voir l’état des fichiers (git)', diff: 'Voir les modifications (git diff)', log: 'Voir l’historique (git log)', add: 'Préparer des fichiers pour un commit (git add)', commit: 'Créer un commit git', push: 'Envoyer les changements sur GitHub', pull: 'Récupérer les changements depuis GitHub', checkout: 'Changer de branche ou restaurer des fichiers (git)', reset: 'Annuler des changements (git reset)', stash: 'Mettre des changements de côté (git stash)' };
    return r(sens[m[1]] ? tr(sens[m[1]]) : tr('Commande git : {commande}', { commande: m[1] }), ['status', 'diff', 'log'].includes(m[1]) ? 'lecture' : ['push', 'pull'].includes(m[1]) ? 'reseau' : 'modification');
  }
  if ((m = premiere.match(/^mkdir\s+(?:-p\s+)?(.+)$/))) return r(tr('Créer le dossier {dossier}', { dossier: court(m[1], 60) }), 'modification');
  if ((m = premiere.match(/^(mv|move)\s+(.+)$/))) return r(tr('Déplacer ou renommer : {cible}', { cible: court(m[2], 60) }), 'modification');
  if ((m = premiere.match(/^(cp|copy)\s+(.+)$/))) return r(tr('Copier : {cible}', { cible: court(m[2], 60) }), 'modification');
  if (/^sed\s+-i/.test(premiere)) return r(tr('Modifier un fichier par remplacement de texte ({fichier})', { fichier: court(premiere.split(/\s+/).pop(), 50) }), 'modification');
  if (/(^|\s)(>|>>)\s*\S/.test(c) || /<<\s*'?EOF/.test(c)) {
    m = c.match(/>\s*(\S+)/);
    return r(m ? tr('Écrire dans un fichier par la ligne de commande ({fichier})', { fichier: court(m[1], 50) }) : tr('Écrire dans un fichier par la ligne de commande'), 'modification');
  }
  if ((m = premiere.match(/^node\s+(?:--test\s*)?(\S*)/))) return r(premiere.includes('--test') ? tr('Lancer les tests (node --test)') : tr('Exécuter le script Node {script}', { script: court(m[1], 50) }), 'execution');
  if ((m = premiere.match(/^(npm test|npm run\s+(\S+))/))) return r(m[2] ? tr('Lancer le script npm « {script} »', { script: m[2] }) : tr('Lancer les tests (npm test)'), 'execution');
  if ((m = premiere.match(/^(python3?|py)\s+(\S+)/))) return r(tr('Exécuter le script Python {script}', { script: court(m[2], 50) }), 'execution');
  if (/^rojo\s+build/.test(premiere)) return r(tr('Compiler la place Roblox (rojo build)'), 'execution');
  if (/^(selene|stylua)\b/.test(premiere)) return r(tr('Vérifier le style et les erreurs du code Luau'), 'lecture');
  if (/^(ls|dir|cat|type|head|tail|find|wc|grep|rg)\b/.test(premiere)) return r(tr('Lire ou lister des fichiers ({commande})', { commande: court(premiere, 50) }), 'lecture');
  return r(description ? tr('Lancer une commande : {description}', { description: court(description, 80) }) : tr('Lancer la commande {commande}', { commande: court(premiere, 70) }), 'execution');
}

const MCP_CONNUS = {
  Roblox_Studio: 'Roblox Studio',
  'unreal-mcp': 'Unreal Engine',
  claude_ai_Notion: 'Notion',
};

/**
 * @returns {{ phrase, risque, technique, horsProjet }}
 */
export function expliquer(outil, input = {}, { cwd = '', blockedPath = null } = {}) {
  const technique = outil === 'Bash' ? court(input.command, 400) : court(JSON.stringify(input), 400);
  let phrase;
  let risque = 'execution';
  let hors = false;
  if (input.__resume) return { phrase: input.__resume, risque: 'execution', technique: '', horsProjet: false };
  if (outil === 'Read') {
    const f = relatif(input.file_path, cwd);
    ({ hors } = f);
    phrase = tr('Lire le fichier {fichier}', { fichier: f.texte });
    risque = 'lecture';
  } else if (outil === 'Glob') {
    const dans = input.path ? relatif(input.path, cwd) : null;
    hors = !!dans?.hors;
    const motif = motifLisible(input.pattern);
    phrase = dans && dans.texte !== '.' ? tr('Chercher des fichiers : {motif} dans {dossier}', { motif, dossier: dans.texte }) : tr('Chercher des fichiers : {motif}', { motif });
    risque = 'lecture';
  } else if (outil === 'Grep') {
    const dans = input.path ? relatif(input.path, cwd) : null;
    hors = !!dans?.hors;
    const texte = court(input.pattern, 50);
    phrase = dans ? tr('Chercher le texte « {texte} » dans {dossier}', { texte, dossier: dans.texte }) : tr('Chercher le texte « {texte} » dans le projet', { texte });
    risque = 'lecture';
  } else if (['Edit', 'MultiEdit', 'NotebookEdit'].includes(outil)) {
    const f = relatif(input.file_path || input.notebook_path, cwd);
    ({ hors } = f);
    phrase = tr('Modifier le fichier {fichier}', { fichier: f.texte });
    risque = 'modification';
  } else if (outil === 'Write') {
    const f = relatif(input.file_path, cwd);
    ({ hors } = f);
    let existe = false;
    try {
      existe = fs.existsSync(path.resolve(cwd || '.', input.file_path));
    } catch {
      existe = false;
    }
    phrase = tr(existe ? 'Réécrire le fichier {fichier}' : 'Créer le fichier {fichier}', { fichier: f.texte });
    risque = 'modification';
  } else if (outil === 'Bash') {
    ({ phrase, risque } = expliquerBash(input.command, input.description));
  } else if (outil === 'WebFetch') {
    let hote = input.url;
    try {
      hote = new URL(input.url).host;
    } catch {
      /* garde l'adresse brute */
    }
    phrase = tr('Ouvrir la page web {hote} (lecture seule)', { hote });
    risque = 'reseau';
  } else if (outil === 'WebSearch') {
    phrase = tr('Rechercher sur le web : « {requete} »', { requete: court(input.query, 70) });
    risque = 'reseau';
  } else if (outil.startsWith('mcp__')) {
    const [, serveur, ...reste] = outil.split('__');
    const nom = MCP_CONNUS[serveur] || serveur.replace(/^claude_ai_/, '').replace(/_/g, ' ');
    const action = reste.join(' ').replace(/[_-]+/g, ' ');
    phrase = tr('Utiliser {nom} : {action}', { nom, action });
    risque = /^(get|list|read|search|find|describe|query)/i.test(action) ? 'lecture' : 'modification';
  } else {
    phrase = tr("Utiliser l'outil {outil}", { outil });
  }
  if (blockedPath) hors = true;
  if (hors) phrase += ' — ' + tr('hors du dossier du projet');
  return { phrase, risque, technique, horsProjet: hors };
}
