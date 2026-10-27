// Connexion d'un compte IA : lance la connexion officielle du fournisseur (Claude Code, Codex ou agent ACP) dans le dossier
// de connexion du compte. Tout se passe dans ton navigateur ; le QG ne voit jamais le jeton.
// Usage : node serveur/connexion.js                       (menu : choisir un compte ou en ajouter un)
//         node serveur/connexion.js --nouveau             (ajoute un compte Claude puis le connecte)
//         node serveur/connexion.js <id> [login|login-code|status|logout] [--pause]
//         (login-code : Codex par code d'appareil, sans rappel dans le navigateur)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { chargerComptes, trouverCompte, envPour, compteConnecte, ajouterCompte, dossierConfig, fournisseur as fournisseurDuCompte, adaptateur as adaptateurDuCompte, CLAUDE_EXE } from './comptes.js';
import * as plateforme from './plateforme.js';
import { connexionTerminee } from './ia/codex.js';
import { t } from './i18n.js';

const args = process.argv.slice(2);
const pause = args.includes('--pause');
const positionnels = args.filter((a) => !a.startsWith('--'));
const es = readline.createInterface({ input: process.stdin, output: process.stdout });

async function finir(code) {
  if (pause) await es.question('\n' + t('Appuie sur Entrée pour fermer cette fenêtre.'));
  es.close();
  process.exit(code);
}

function lancer(exe, argv, compte) {
  return new Promise((resolve) => {
    const enfant = spawn(exe, argv, { stdio: 'inherit', env: envPour(compte) });
    enfant.on('exit', (code) => resolve(code ?? 0));
    enfant.on('error', (e) => {
      console.error(t('Impossible de lancer {exe} : {message}', { exe, message: e.message }));
      resolve(1);
    });
  });
}

const claude = (compte, action) => lancer(CLAUDE_EXE, ['auth', action], compte);
function codex(compte, argv) {
  const cmd = plateforme.codexCommande();
  return lancer(cmd.exe, [...cmd.args, ...argv], compte);
}

async function connecterClaude(compte) {
  if (!fs.existsSync(CLAUDE_EXE)) {
    console.error(t("Claude Code est introuvable dans node_modules : lance d'abord {script}.", { script: plateforme.script('installer') }));
    return 1;
  }
  fs.mkdirSync(dossierConfig(compte), { recursive: true });
  console.log('\n' + t('{nom} (dossier {dossier})', { nom: compte.nom, dossier: dossierConfig(compte) }));
  console.log(t("Une page de connexion va s'ouvrir dans ton navigateur : connecte-toi avec le compte Claude voulu."));
  console.log(t("(Abonnement Pro, Max, Team ou Enterprise. Si la page ne s'ouvre pas, copie le lien affiché ci-dessous.)") + '\n');
  await claude(compte, 'login');
  plateforme.oublierConnexion(dossierConfig(compte)); // Mac : l'état lu avant la connexion ne vaut plus
  console.log('');
  await claude(compte, 'status');
  console.log('\n' + (compteConnecte(compte) ? t('{nom} est connecté. Tu peux revenir au QG.', { nom: compte.nom }) : t("{nom} n'est pas connecté.", { nom: compte.nom })));
  return compteConnecte(compte) ? 0 : 1;
}

// Codex : jeton gardé dans CODEX_HOME/auth.json (stockage « file » imposé, jamais lu par le QG).
async function connecterCodex(compte, mode) {
  if (!plateforme.codexCommande().present) {
    console.error(t('Codex est introuvable : installe-le depuis Réglages › Comptes IA (bouton « Installer Codex ») ou installe le Codex CLI officiel.'));
    return 1;
  }
  fs.mkdirSync(dossierConfig(compte), { recursive: true });
  console.log('\n' + t('{nom} (dossier {dossier})', { nom: compte.nom, dossier: dossierConfig(compte) }));
  if (mode === 'code') console.log(t('Connexion par code d’appareil (à activer d’abord dans les paramètres de sécurité de ChatGPT) : suis les instructions ci-dessous.') + '\n');
  else console.log(t("Une page de connexion ChatGPT va s'ouvrir dans ton navigateur : connecte-toi avec le compte voulu (un compte = une personne, sur son propre PC).") + '\n');
  const argv = ['login', ...(mode === 'code' ? ['--device-auth'] : []), '-c', 'cli_auth_credentials_store="file"'];
  await codex(compte, argv);
  console.log('');
  await codex(compte, ['login', 'status']);
  connexionTerminee(compte.id);
  console.log('\n' + (compteConnecte(compte) ? t('{nom} est connecté. Tu peux revenir au QG.', { nom: compte.nom }) : t("{nom} n'est pas connecté.", { nom: compte.nom })));
  return compteConnecte(compte) ? 0 : 1;
}

// Agent ACP (Grok, Cursor…) : sa propre commande de connexion, dans le dossier du compte (variable de dossier de
// l'agent quand il en a une). Le QG constate ensuite la connexion par la présence d'un fichier, sans le lire.
async function connecterAcp(compte) {
  const ad = adaptateurDuCompte(compte);
  const agent = ad.agentDe(compte);
  const cmd = ad.commandeConnexion(compte);
  if (!agent || !cmd?.present) {
    console.error(t('{nom} introuvable sur ce PC : {installation}', { nom: agent?.nomCourt || compte.nom, installation: agent?.installation ? t(agent.installation) : t('installe l’agent puis recommence') }));
    return 1;
  }
  if (agent.varDossier) fs.mkdirSync(dossierConfig(compte), { recursive: true });
  console.log('\n' + t('{nom} (dossier {dossier})', { nom: compte.nom, dossier: dossierConfig(compte) }));
  if (cmd.consigne) console.log(t(cmd.consigne) + '\n');
  await lancer(cmd.exe, cmd.args, compte);
  console.log('\n' + (compteConnecte(compte) ? t('{nom} est connecté. Tu peux revenir au QG.', { nom: compte.nom }) : t("{nom} n'est pas connecté.", { nom: compte.nom })));
  return compteConnecte(compte) ? 0 : 1;
}

const connecter = (compte, mode = 'navigateur') => {
  const f = fournisseurDuCompte(compte);
  if (f === 'acp') return connecterAcp(compte);
  return f === 'codex' ? connecterCodex(compte, mode) : connecterClaude(compte);
};

if (args.includes('--nouveau')) {
  const nom = (await es.question(t('Nom du nouveau compte (ex. « Claude perso ») : '))).trim();
  const compte = ajouterCompte({ nom });
  console.log(t('Compte « {nom} » ajouté.', { nom: compte.nom }));
  await finir(await connecter(compte));
} else if (!positionnels.length) {
  // Menu interactif.
  const { comptes } = chargerComptes();
  console.log(t('Comptes IA du QG :'));
  comptes.forEach((c, i) => console.log(`  ${i + 1}. ${c.nom} (${fournisseurDuCompte(c)}) — ${compteConnecte(c) ? t('connecté') : t('non connecté')}`));
  console.log('  N. ' + t('Ajouter un nouveau compte Claude'));
  console.log('  C. ' + t('Ajouter un nouveau compte ChatGPT · Codex'));
  const choix = (await es.question('\n' + t('Ton choix : '))).trim();
  let compte = null;
  if (/^[nc]$/i.test(choix)) {
    const nom = (await es.question(t('Nom du nouveau compte : '))).trim();
    compte = ajouterCompte({ nom, fournisseur: /^c$/i.test(choix) ? 'codex' : 'claude' });
  } else compte = comptes[Number(choix) - 1];
  if (!compte) {
    console.log(t('Choix inconnu.'));
    await finir(1);
  }
  await finir(await connecter(compte));
} else {
  const [id, action = 'login'] = positionnels;
  const compte = trouverCompte(id);
  if (!compte || compte.id !== id) {
    console.error(t('Compte inconnu : {id}', { id }));
    await finir(1);
  }
  if (action === 'login') await finir(await connecter(compte));
  else if (action === 'login-code') await finir(await connecter(compte, 'code'));
  else if (fournisseurDuCompte(compte) === 'codex') await finir(await codex(compte, action === 'status' ? ['login', 'status'] : [action]));
  else if (fournisseurDuCompte(compte) === 'acp') {
    // la déconnexion se fait dans l'agent lui-même ; ici, seulement l'état constaté
    console.log(compteConnecte(compte) ? t('{nom} est connecté. Tu peux revenir au QG.', { nom: compte.nom }) : t("{nom} n'est pas connecté.", { nom: compte.nom }));
    await finir(compteConnecte(compte) ? 0 : 1);
  }
  else await finir(await claude(compte, action));
}
