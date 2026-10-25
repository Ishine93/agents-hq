// Connexion d'un compte : lance la connexion officielle de Claude Code dans le dossier de config
// du compte. Tout se passe dans ton navigateur ; le QG ne voit jamais le jeton.
// Usage : node serveur/connexion.js                       (menu : choisir un compte ou en ajouter un)
//         node serveur/connexion.js --nouveau             (ajoute un compte puis le connecte)
//         node serveur/connexion.js <id> [login|status|logout] [--pause]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { chargerComptes, trouverCompte, envPour, compteConnecte, ajouterCompte, dossierConfig, CLAUDE_EXE } from './comptes.js';
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

function claude(compte, action) {
  return new Promise((resolve) => {
    const enfant = spawn(CLAUDE_EXE, ['auth', action], { stdio: 'inherit', env: envPour(compte) });
    enfant.on('exit', (code) => resolve(code ?? 0));
    enfant.on('error', (e) => {
      console.error(t('Impossible de lancer Claude Code : {message}', { message: e.message }));
      resolve(1);
    });
  });
}

async function connecter(compte) {
  fs.mkdirSync(dossierConfig(compte), { recursive: true });
  console.log('\n' + t('{nom} (dossier {dossier})', { nom: compte.nom, dossier: dossierConfig(compte) }));
  console.log(t("Une page de connexion va s'ouvrir dans ton navigateur : connecte-toi avec le compte Claude voulu."));
  console.log(t("(Abonnement Pro, Max, Team ou Enterprise. Si la page ne s'ouvre pas, copie le lien affiché ci-dessous.)") + '\n');
  await claude(compte, 'login');
  console.log('');
  await claude(compte, 'status');
  console.log('\n' + (compteConnecte(compte) ? t('{nom} est connecté. Tu peux revenir au QG.', { nom: compte.nom }) : t("{nom} n'est pas connecté.", { nom: compte.nom })));
  return compteConnecte(compte) ? 0 : 1;
}

if (!fs.existsSync(CLAUDE_EXE)) {
  console.error(t("Claude Code est introuvable dans node_modules : lance d'abord installer.bat."));
  await finir(1);
}

if (args.includes('--nouveau')) {
  const nom = (await es.question(t('Nom du nouveau compte (ex. « Claude perso ») : '))).trim();
  const compte = ajouterCompte({ nom });
  console.log(t('Compte « {nom} » ajouté.', { nom: compte.nom }));
  await finir(await connecter(compte));
} else if (!positionnels.length) {
  // Menu interactif.
  const { comptes } = chargerComptes();
  console.log(t('Comptes Claude du QG :'));
  comptes.forEach((c, i) => console.log(`  ${i + 1}. ${c.nom} — ${compteConnecte(c) ? t('connecté') : t('non connecté')}`));
  console.log('  N. ' + t('Ajouter un nouveau compte'));
  const choix = (await es.question('\n' + t('Ton choix : '))).trim();
  let compte = null;
  if (/^n$/i.test(choix)) {
    const nom = (await es.question(t('Nom du nouveau compte : '))).trim();
    compte = ajouterCompte({ nom });
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
  else await finir(await claude(compte, action));
}
