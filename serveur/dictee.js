// Dictée locale : pilote le processus Python faster-whisper (modèle gardé en mémoire GPU).
// Le site enregistre l'audio, l'envoie ici, et reçoit le texte à relire avant envoi.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { RACINE, REGLAGES, etages } from './config.js';
import * as plateforme from './plateforme.js';
import { t } from './i18n.js';

// venv\Scripts\python.exe sur Windows, venv/bin/python ailleurs (l'installation Mac n'existe pas encore)
const PYTHON = plateforme.pythonVenv(path.join(RACINE, 'runtime', 'dictee', 'venv'));
const WORKER = path.join(RACINE, 'serveur', 'dictee_worker.py');
let processus = null;
let pret = null;
let compteur = 0;
const attentes = new Map();
export const etatDictee = { disponible: fs.existsSync(PYTHON), appareil: null, erreur: null };

function vocabulaire() {
  let base = '';
  for (const f of [path.join(RACINE, 'config', 'vocabulaire.txt'), path.join(RACINE, 'config', 'defauts', 'vocabulaire.txt')]) {
    try {
      base = fs.readFileSync(f, 'utf8').replace(/\s+/g, ' ').trim();
      break;
    } catch {
      /* fichier suivant */
    }
  }
  const noms = etages().map((e) => e.nom).join(', ');
  return `${base} ${noms}.`;
}

function demarrer() {
  if (pret) return pret;
  pret = new Promise((resolve, reject) => {
    processus = spawn(PYTHON, ['-I', WORKER], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    const lignes = readline.createInterface({ input: processus.stdout });
    lignes.on('line', (l) => {
      let r;
      try {
        r = JSON.parse(l);
      } catch {
        return;
      }
      if (r.pret) {
        etatDictee.appareil = r.appareil;
        resolve();
        return;
      }
      const a = attentes.get(r.id);
      if (!a) return;
      attentes.delete(r.id);
      if (r.erreur) a.reject(new Error(r.erreur));
      else a.resolve(r);
    });
    let sortieErreur = '';
    processus.stderr.on('data', (d) => {
      sortieErreur = (sortieErreur + String(d)).slice(-2000);
      if (!/trampoline/i.test(sortieErreur)) process.stderr.write(String(d));
    });
    processus.on('exit', (code) => {
      etatDictee.erreur = `processus de dictée arrêté (code ${code})`;
      // QG déplacé ou copié depuis un autre PC : le Python de la dictée pointe vers l'ancien emplacement
      if (/trampoline/i.test(sortieErreur)) {
        etatDictee.erreur = t('La dictée locale ne trouve plus son Python (QG déplacé ou copié depuis un autre PC) : relance {script} pour la réparer.', { script: plateforme.script('installer-dictee') });
        console.warn(etatDictee.erreur);
      }
      for (const a of attentes.values()) a.reject(new Error(etatDictee.erreur));
      attentes.clear();
      processus = null;
      pret = null;
      reject(new Error(etatDictee.erreur));
    });
  });
  return pret;
}

// Préchargement au démarrage du serveur : le premier enregistrement n'attend pas le chargement du modèle.
export function prechargerDictee() {
  if (!etatDictee.disponible) return;
  demarrer().catch((e) => (etatDictee.erreur = e.message));
}

export async function transcrire(tampon, extension = '.webm') {
  if (!etatDictee.disponible) throw new Error("La dictée locale n'est pas installée.");
  await demarrer();
  const fichier = path.join(os.tmpdir(), `qg-dictee-${Date.now()}-${++compteur}${extension}`);
  fs.writeFileSync(fichier, tampon);
  try {
    const id = String(compteur);
    const r = await new Promise((resolve, reject) => {
      attentes.set(id, { resolve, reject });
      // On dicte dans la langue de l'interface.
      processus.stdin.write(JSON.stringify({ id, fichier, vocabulaire: vocabulaire(), langue: REGLAGES.langueInterface || 'fr' }) + '\n');
    });
    return { texte: r.texte, duree: r.duree, calcul: r.calcul, appareil: r.appareil };
  } finally {
    fs.rmSync(fichier, { force: true });
  }
}
