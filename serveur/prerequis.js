// Prérequis d'un compte IA (1.0.8) : avant d'ajouter un compte, ce qu'il faut sur ce PC pour que son IA
// travaille, et comment l'obtenir sans chercher. Une liste d'étapes par fournisseur (ou par agent ACP) :
//   { id, titre, ok, bloquant, detail, actions: [{ type, libelle, valeur? }] }
// Types d'action :
//   installer : le QG l'installe lui-même (npm dans runtime/, ou la fenêtre d'Apple pour git) ;
//   terminal  : l'installateur officiel s'ouvre dans une fenêtre de terminal visible, après ton clic ;
//   lien      : page officielle ; copier : commande à copier.
// Aucune action ne part sans clic ; rien n'est lu des comptes ni des jetons.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import * as plateforme from './plateforme.js';
import { etatInstallation as etatCodex } from './ia/codex-installation.js';
import { catalogue, commandeAgent, oublierCommandes, AGENT_PERSONNALISE } from './ia/acp.js';
import { etatInstallation as etatAgent, installerAgent } from './ia/installation-acp.js';
import { t } from './i18n.js';

// ---------------------------------------------------------------- git

const CACHE_MS = 30000;
let gitVu = null;

/** Git utilisable par les agents ? Windows : Git pour Windows (git et Git Bash) ; Mac : outils d'Apple ou Homebrew. */
export function gitPresent({ plat = plateforme.PLATEFORME, env = process.env, existe = fs.existsSync, lancer = spawnSync, maintenant = Date.now() } = {}) {
  if (gitVu && gitVu.plat === plat && maintenant - gitVu.t < CACHE_MS) return gitVu.ok;
  let ok = false;
  if (plateforme.estWindows(plat)) {
    const bases = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs')].filter(Boolean);
    ok = bases.some((b) => existe(path.join(b, 'Git', 'bin', 'bash.exe')));
  } else if (plateforme.estMac(plat)) {
    // /usr/bin/git sans les outils d'Apple ouvre une fenêtre d'installation : on demande à xcode-select
    ok = existe('/opt/homebrew/bin/git') || existe('/usr/local/bin/git');
    if (!ok) {
      try {
        ok = lancer('xcode-select', ['-p'], { stdio: 'ignore', timeout: 5000 }).status === 0;
      } catch {
        ok = false;
      }
    }
  } else {
    ok = existe('/usr/bin/git');
  }
  gitVu = { plat, ok, t: maintenant };
  return ok;
}

const wingetPresent = (env = process.env) => !!env.LOCALAPPDATA && fs.existsSync(path.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'winget.exe'));
const WINGET_GIT = 'winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements';

function etapeGit({ bloquant, plat = plateforme.PLATEFORME }) {
  const ok = gitPresent({ plat });
  const windows = plateforme.estWindows(plat);
  const actions = ok ? [] : windows
    ? [
      ...(wingetPresent() ? [{ type: 'terminal', libelle: t('Installer Git'), valeur: 'git' }] : []),
      { type: 'lien', libelle: t('Page officielle de Git'), valeur: 'https://git-scm.com/download/win' },
      { type: 'copier', libelle: t('Copier la commande'), valeur: WINGET_GIT },
    ]
    : [
      { type: 'installer', libelle: t('Installer les outils d’Apple'), valeur: 'xcode' },
      { type: 'copier', libelle: t('Copier la commande'), valeur: 'xcode-select --install' },
    ];
  return {
    id: 'git',
    titre: windows ? t('Git pour Windows') : t('Git (outils en ligne de commande d’Apple)'),
    ok,
    bloquant: !ok && bloquant,
    detail: ok ? t('Installé.')
      : windows
        ? t('Les agents s’en servent pour suivre les modifications du code et lancer des commandes Unix. « Installer Git » ouvre une fenêtre qui l’installe avec winget, l’outil officiel de Microsoft ; accepte, puis attends la fin. Si le QG ne le voit pas ensuite, ferme-le et relance-le.')
        : t('Les agents s’en servent pour suivre les modifications du code. « Installer les outils d’Apple » ouvre la fenêtre d’installation d’Apple : clique sur « Installer », puis attends la fin (quelques minutes).'),
    actions,
  };
}

// ---------------------------------------------------------------- PowerShell 7 (Windows)

let pwshVu = null;
const WINGET_PWSH = 'winget install --id Microsoft.PowerShell -e --source winget --accept-package-agreements --accept-source-agreements';

/** PowerShell 6 ou plus (pwsh) sous Windows : dossier d'installation habituel, alias du Store, ou PATH. */
export function pwshPresent({ env = process.env, existe = fs.existsSync, maintenant = Date.now() } = {}) {
  if (pwshVu && maintenant - pwshVu.t < CACHE_MS) return pwshVu.ok;
  const chemins = [
    env.ProgramFiles && path.join(env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'pwsh.exe'),
  ].filter(Boolean);
  const ok = chemins.some((c) => existe(c)) || plateforme.acpCommande(['pwsh'], 'win32', { env, existe }).present;
  pwshVu = { ok, t: maintenant };
  return ok;
}

function etapePwsh() {
  const ok = pwshPresent();
  return {
    id: 'pwsh',
    titre: t('PowerShell 7'),
    ok,
    bloquant: !ok,
    detail: ok ? t('Installé.') : t('Cet agent a besoin de PowerShell 6 ou plus ; Windows n’a que la version 5.1. « Installer PowerShell 7 » ouvre une fenêtre qui l’installe avec winget, l’outil officiel de Microsoft ; accepte, puis attends la fin.'),
    actions: ok ? [] : [
      ...(wingetPresent() ? [{ type: 'terminal', libelle: t('Installer PowerShell 7'), valeur: 'pwsh' }] : []),
      { type: 'lien', libelle: t('Page officielle'), valeur: 'https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows' },
      { type: 'copier', libelle: t('Copier la commande'), valeur: WINGET_PWSH },
    ],
  };
}

// ---------------------------------------------------------------- par fournisseur

function etapesClaude(plat) {
  const exe = plateforme.claudeExe(plat);
  const ok = fs.existsSync(exe);
  const lanceur = plateforme.script('installer', plat);
  return [
    {
      id: 'claude-code',
      titre: t('Claude Code (dans le dossier du QG)'),
      ok,
      bloquant: !ok,
      detail: ok ? t('Installé avec le QG.') : t('Il manque dans le dossier du QG : ferme le QG, puis relance {script}. Il le réinstalle sans toucher à tes réglages.', { script: lanceur }),
      actions: [],
    },
    // conseillé : sans Git, Claude Code lance ses commandes avec PowerShell (Windows) et les agents ne suivent pas
    // leurs modifications avec git
    etapeGit({ bloquant: false, plat }),
  ];
}

function etapesCodex() {
  const e = etatCodex();
  const ok = e.present && e.etat !== 'installation';
  return [{
    id: 'codex',
    titre: t('Codex (programme d’OpenAI)'),
    ok,
    bloquant: !ok,
    detail: ok ? t('Installé.')
      : e.etat === 'installation' ? t('Installation en cours (une à deux minutes).')
        : e.etat === 'erreur' ? t('L’installation de Codex a échoué : {erreur}', { erreur: e.erreur || '' })
          : t('« Installer Codex » l’installe dans le dossier du QG (version {version}), sans rien changer ailleurs sur ce PC.', { version: e.version }),
    enCours: e.etat === 'installation',
    lignes: e.lignes,
    actions: ok || e.etat === 'installation' ? [] : [{ type: 'installer', libelle: e.etat === 'erreur' ? t('Réessayer l’installation de Codex') : t('Installer Codex'), valeur: 'codex' }],
  }];
}

/** Ce que le site affiche pour installer un agent ACP sur ce système. */
export function installationAgent(a, plat = plateforme.PLATEFORME) {
  const inst = a.installer || {};
  const sys = plateforme.nom(plat);
  const officiel = inst[sys] || null;
  return {
    npm: inst.npm || null,
    commande: officiel?.commande || null,
    lien: officiel?.lien || inst.lien || null,
    // auto: false : la commande se copie, le QG ne la lance pas (installation en plusieurs temps)
    auto: !!officiel?.commande && officiel.auto !== false,
    git: (inst.git || []).includes(sys),
    pwsh: sys === 'windows' && (inst.pwsh || []).includes(sys),
    systemes: inst.systemes || ['windows', 'mac'],
    disponible: !inst.systemes || inst.systemes.includes(sys),
    texte: typeof a.installation === 'string' ? a.installation : a.installation?.[sys] || '',
  };
}

function etapesAgent(id, plat) {
  const a = catalogue()[id];
  if (!a) return [];
  const agent = { id, ...a };
  const ins = installationAgent(agent, plat);
  if (!ins.disponible) {
    return [{ id: 'systeme', titre: t('{nom} sur ce système', { nom: a.nomCourt }), ok: false, bloquant: true, detail: t('{nom} n’existe pas encore pour ce système. Choisis un autre agent.', { nom: a.nomCourt }), actions: [] }];
  }
  const cmd = commandeAgent(agent);
  const e = ins.npm ? etatAgent(id, ins.npm) : { etat: cmd.present ? 'installe' : 'absent', lignes: [] };
  const enCours = e.etat === 'installation';
  const ok = cmd.present && !enCours;
  const actions = [];
  if (!ok && !enCours) {
    if (ins.npm) actions.push({ type: 'installer', libelle: e.etat === 'erreur' ? t('Réessayer l’installation') : t('Installer {nom}', { nom: a.nomCourt }), valeur: id });
    else if (ins.auto) actions.push({ type: 'terminal', libelle: t('Installer {nom}', { nom: a.nomCourt }), valeur: id });
    if (ins.commande) actions.push({ type: 'copier', libelle: t('Copier la commande'), valeur: ins.commande });
    if (ins.lien) actions.push({ type: 'lien', libelle: t('Page officielle'), valeur: ins.lien });
  }
  const detail = ok
    ? (cmd.parQg ? t('Installé dans le dossier du QG.') : t('Installé sur ce PC.'))
    : enCours ? t('Installation en cours (une à deux minutes).')
      : e.etat === 'erreur' ? t('L’installation a échoué : {erreur}', { erreur: e.erreur || '' })
        : ins.npm ? t('« Installer {nom} » l’installe dans le dossier du QG, avec le Node du QG (version {version}) : rien ne change ailleurs sur ce PC.', { nom: a.nomCourt, version: ins.npm.version })
          : ins.auto ? t('« Installer {nom} » ouvre une fenêtre qui lance l’installateur officiel de {nom}. Suis ses étapes, puis reviens ici : le QG vérifie tout seul.', { nom: a.nomCourt })
            : t('Installe {nom} à la main (voir la note ci-dessous ou sa page officielle), puis clique sur « Vérifier à nouveau ».', { nom: a.nomCourt });
  const etapes = [{ id: 'agent', titre: t('Programme {nom}', { nom: a.nomCourt }), ok, bloquant: !ok, detail, note: ok || !ins.texte ? null : t(ins.texte), enCours, lignes: e.lignes || [], actions }];
  if (ins.git) etapes.push(etapeGit({ bloquant: true, plat }));
  if (ins.pwsh) etapes.push(etapePwsh());
  return etapes;
}

/**
 * Liste de contrôle d'un fournisseur (claude, codex, acp + agent).
 * @returns {{ pret: boolean, etapes: object[] }}
 */
export function prerequis({ fournisseur = 'claude', agent = null, plat = plateforme.PLATEFORME } = {}) {
  let etapes = [];
  if (fournisseur === 'claude') etapes = etapesClaude(plat);
  else if (fournisseur === 'codex') etapes = etapesCodex();
  else if (fournisseur === 'acp' && agent && agent !== AGENT_PERSONNALISE) etapes = etapesAgent(agent, plat);
  return { fournisseur, agent, pret: etapes.every((e) => e.ok || !e.bloquant), etapes };
}

/** « Vérifier à nouveau » : oublie ce qui a été vu (PATH, git), puis refait la liste. */
export function reverifier(choix) {
  oublierCommandes();
  gitVu = null;
  pwshVu = null;
  return prerequis(choix);
}

// ---------------------------------------------------------------- actions (toujours après un clic)

/** Ligne de commande officielle lancée dans une fenêtre visible : PowerShell sous Windows, bash sous Mac. */
export function argvTerminal(commande, plat = plateforme.PLATEFORME) {
  if (plateforme.estWindows(plat)) return ['powershell.exe', '-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', commande];
  return ['/bin/bash', '-c', `${commande}\nprintf '\\n%s\\n' ${plateforme.citerShell(t('Terminé : tu peux fermer cette fenêtre et revenir au QG.'))}`];
}

/**
 * Lance l'action d'une étape. type 'installer' : codex, xcode ou un agent npm ; 'terminal' : git (winget)
 * ou l'installateur officiel d'un agent. surEtat : publié à chaque étape d'une installation npm.
 */
export function agir({ type, valeur }, { plat = plateforme.PLATEFORME, installerCodex = null, surEtat = () => {} } = {}) {
  if (type === 'installer' && valeur === 'codex') {
    if (!installerCodex) throw new Error('installation de Codex indisponible');
    installerCodex();
    return { ok: true };
  }
  if (type === 'installer' && valeur === 'xcode') {
    if (!plateforme.estMac(plat)) throw new Error(t('seulement sur Mac'));
    spawn('xcode-select', ['--install'], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true, message: t('La fenêtre d’installation d’Apple s’est ouverte : clique sur « Installer ».') };
  }
  if (type === 'terminal' && valeur === 'git') {
    if (!plateforme.estWindows(plat)) throw new Error(t('seulement sous Windows'));
    plateforme.ouvrirTerminal(t('Installation de Git'), ['cmd.exe', '/k', WINGET_GIT]);
    return { ok: true, message: t('Une fenêtre s’est ouverte : elle installe Git avec winget. Attends la fin.') };
  }
  if (type === 'terminal' && valeur === 'pwsh') {
    if (!plateforme.estWindows(plat)) throw new Error(t('seulement sous Windows'));
    plateforme.ouvrirTerminal(t('Installation de PowerShell 7'), ['cmd.exe', '/k', WINGET_PWSH]);
    return { ok: true, message: t('Une fenêtre s’est ouverte : elle installe PowerShell 7 avec winget. Attends la fin.') };
  }
  const a = catalogue()[valeur];
  if (!a) throw new Error(t('agent ACP inconnu : {agent}', { agent: valeur }));
  const ins = installationAgent({ id: valeur, ...a }, plat);
  if (!ins.disponible) throw new Error(t('{nom} n’existe pas encore pour ce système. Choisis un autre agent.', { nom: a.nomCourt }));
  if (type === 'installer' && ins.npm) {
    installerAgent(valeur, ins.npm, { surEtat }).then(() => oublierCommandes(), () => oublierCommandes());
    return { ok: true };
  }
  if (type === 'terminal' && ins.auto) {
    plateforme.ouvrirTerminal(t('Installation de {nom}', { nom: a.nomCourt }), argvTerminal(ins.commande, plat));
    return { ok: true, message: t('Une fenêtre s’est ouverte avec l’installateur officiel de {nom} : suis ses étapes.', { nom: a.nomCourt }) };
  }
  throw new Error(t('aucune installation automatique pour {nom}', { nom: a.nomCourt }));
}
