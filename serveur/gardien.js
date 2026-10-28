// Gardien du serveur (1.0.8) : lancer.bat et lancer.command démarrent ce petit programme, qui lance le vrai
// serveur (serveur/index.js) et le relance tout seul s'il plante, pour que le travail continue quand personne
// ne regarde. Le serveur relancé reprend les dossiers en cours, comme après un arrêt normal.
// Pas de relance :
// - arrêt voulu (code 0, bouton Fermer = 41, mise à jour = 42, Ctrl+C, fenêtre fermée) ;
// - plantage dans la première minute (port déjà pris, réglage cassé…) : relancer ne servirait à rien ;
// - plus de 5 plantages en une heure : il y a un vrai problème, on s'arrête et on le dit.
// Les dernières lignes d'erreur du plantage sont gardées dans runtime/dernier-plantage.txt (« Signaler un problème »).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// QG_GARDIEN_CIBLE, QG_GARDIEN_DELAIS : pour les tests (faux serveur, délais courts)
const CIBLE = process.env.QG_GARDIEN_CIBLE || path.join(RACINE, 'serveur', 'index.js');
const [DUREE_MIN, ATTENTE, FENETRE] = (process.env.QG_GARDIEN_DELAIS || '60000,3000,3600000').split(',').map(Number);
const MAX_PLANTAGES = 5;
const ARRETS_VOULUS = new Set([0, 41, 42]);
const FICHIER_PLANTAGE = process.env.QG_GARDIEN_PLANTAGE || path.join(RACINE, 'runtime', 'dernier-plantage.txt');

const args = process.argv.slice(2);
const plantages = [];
let enfant = null;
let arretDemande = false;

function lancer(relance) {
  const extra = relance ? ['--sans-maj', '--no-open'].filter((a) => !args.includes(a)) : [];
  const env = relance ? { ...process.env, QG_RELANCE_APRES_PLANTAGE: String(relance) } : process.env;
  const debut = Date.now();
  const erreurs = [];
  // chemin absolu du serveur : les scripts de mise à jour reconnaissent ainsi un QG en marche
  enfant = spawn(process.execPath, [CIBLE, ...args, ...extra], { cwd: RACINE, env, stdio: ['inherit', 'inherit', 'pipe'] });
  enfant.stderr.on('data', (morceau) => {
    process.stderr.write(morceau);
    erreurs.push(...String(morceau).split(/\r?\n/).filter(Boolean));
    if (erreurs.length > 80) erreurs.splice(0, erreurs.length - 80);
  });
  enfant.on('exit', (code, signal) => {
    enfant = null;
    const c = code ?? (signal ? 1 : 0);
    if (arretDemande || ARRETS_VOULUS.has(c)) return process.exit(c);
    const duree = Date.now() - debut;
    noterPlantage(c, erreurs);
    if (duree < DUREE_MIN) {
      console.error(`\nLe QG s'est arrêté au démarrage (code ${c}) : pas de relance automatique.`);
      return process.exit(c);
    }
    const maintenant = Date.now();
    plantages.push(maintenant);
    while (plantages.length && maintenant - plantages[0] > FENETRE) plantages.shift();
    if (plantages.length > MAX_PLANTAGES) {
      console.error(`\nLe QG a planté ${plantages.length} fois en une heure : pas de nouvelle relance. Les dernières erreurs sont dans runtime/dernier-plantage.txt.`);
      return process.exit(c);
    }
    console.error(`\nLe QG a planté (code ${c}). Relance automatique dans ${Math.round(ATTENTE / 1000)} s : les dossiers en cours vont reprendre.`);
    setTimeout(() => {
      if (!arretDemande) lancer(plantages.length);
    }, ATTENTE);
  });
}

function noterPlantage(code, erreurs) {
  try {
    fs.mkdirSync(path.dirname(FICHIER_PLANTAGE), { recursive: true });
    fs.writeFileSync(FICHIER_PLANTAGE, [`${new Date().toISOString()} code ${code}`, ...erreurs.slice(-60)].join('\n') + '\n');
  } catch {
    /* rien : la relance compte plus que la trace */
  }
}

// Ctrl+C ou fenêtre fermée : la console (ou le Terminal) envoie le même signal au serveur, qui s'arrête proprement ;
// le gardien attend sa fin pour sortir avec le même code (lancer.bat et lancer.command le lisent). SIGTERM ne vient
// pas de la console : on le transmet.
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(s, () => {
    arretDemande = true;
    if (!enfant) process.exit(0);
    if (s === 'SIGTERM') enfant.kill('SIGTERM');
  });
}

lancer(0);
