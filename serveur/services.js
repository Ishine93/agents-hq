// Serveurs longs (rojo serve…) : le QG les lance, les surveille et garde leurs journaux.
// Ils vivent au « sous-sol » : ils survivent à la fin de la tâche de l'agent qui les a démarrés.
// Le QG repère aussi ceux lancés en dehors de lui (port déjà en écoute) pour éviter les conflits.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RACINE, etages, etage as trouverEtage } from './config.js';
import * as plateforme from './plateforme.js';
import { emettre, etat } from './bus.js';
import { portEnregistre } from './ports.js';
import { t as tr } from './i18n.js';

// Catalogue livré (config/defauts/services.json), ou ta version personnelle s'il y en a une (config/services.json).
const CATALOGUE = () => {
  const perso = path.join(RACINE, 'config', 'services.json');
  return JSON.parse(fs.readFileSync(fs.existsSync(perso) ? perso : path.join(RACINE, 'config', 'defauts', 'services.json'), 'utf8')).services;
};
const MAX_LIGNES = 400;
const processus = new Map(); // id → ChildProcess
const tampons = new Map(); // id → lignes en attente d'envoi
let minuterieLog = null;
// Démo : rien n’est lancé pour de vrai, les serveurs « démarrent » avec un journal simulé.
let simules = false;
export const simulerServices = () => (simules = true);

const cle = (etageId, type) => `${etageId}:${type}`;

function portDe(e, def) {
  if (!def.port) return null;
  // Le registre des ports du QG prime : un port unique par jeu (config/ports.json).
  const enregistre = portEnregistre(e.projet);
  if (enregistre) return enregistre;
  try {
    const projet = JSON.parse(fs.readFileSync(path.join(e.projet, def.port.fichier), 'utf8'));
    return Number(projet[def.port.cle]) || def.port.defaut;
  } catch {
    return def.port.defaut;
  }
}

const publicService = ({ lignes, ...s }) => ({ ...s, dernieresLignes: lignes.slice(-20) });

function publier(s) {
  etat.services.set(s.id, s);
  emettre('service', { service: publicService(s) }, null);
}

export const servicesPublics = () => [...etat.services.values()].map(publicService);

// Tous les services possibles (un par étage compatible), même arrêtés.
export function initialiserServices() {
  for (const e of etages()) ajouterServicesEtage(e, false);
  surveiller();
  setInterval(surveiller, 15000).unref();
}

// Services d'un étage (au démarrage, ou quand un nouvel étage est ajouté).
export function ajouterServicesEtage(e, publierAussi = true) {
  if (!e.projet || !fs.existsSync(e.projet)) return;
  for (const [type, def] of Object.entries(CATALOGUE())) {
    if (!def.types.includes(e.type)) continue;
    if (def.port?.fichier && !fs.existsSync(path.join(e.projet, def.port.fichier))) continue;
    const id = cle(e.id, type);
    if (etat.services.has(id)) continue;
    const s = {
      id, etage: e.id, type, nom: def.nom, commande: [def.exe, ...def.args].join(' '), port: portDe(e, def),
      etat: 'arrete', pid: null, depuis: null, par: null, erreur: null, externe: null, lignes: [],
    };
    etat.services.set(id, s);
    if (publierAussi) publier(s);
  }
}

function ajouterLignes(s, texte) {
  // Les codes couleur ANSI de la console (ex. rojo) sont retirés pour l'affichage.
  const nouvelles = String(texte).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!nouvelles.length) return;
  s.lignes.push(...nouvelles);
  if (s.lignes.length > MAX_LIGNES) s.lignes.splice(0, s.lignes.length - MAX_LIGNES);
  const t = tampons.get(s.id) || [];
  t.push(...nouvelles);
  tampons.set(s.id, t);
  if (!minuterieLog) {
    minuterieLog = setTimeout(() => {
      minuterieLog = null;
      for (const [id, lignes] of tampons) emettre('service_log', { id, lignes }, null);
      tampons.clear();
    }, 500);
  }
}

// Ports en écoute sur la machine → PID (netstat sur Windows, lsof sur Mac), pour repérer les serveurs lancés hors du QG.
const portsEnEcoute = () => plateforme.portsEnEcoute();

async function surveiller() {
  if (simules) return;
  const ports = await portsEnEcoute();
  for (const s of etat.services.values()) {
    if (processus.has(s.id) || !s.port) continue;
    const pid = ports.get(s.port);
    // Quel projet du QG utilise ce port ? (plusieurs jeux peuvent partager 34872)
    const prochain = pid ? { pid, port: s.port } : null;
    if (JSON.stringify(prochain) !== JSON.stringify(s.externe)) {
      s.externe = prochain;
      s.etat = prochain ? 'externe' : s.etat === 'externe' ? 'arrete' : s.etat;
      publier(s);
    }
  }
}

export function serviceDe(etageId, type) {
  return etat.services.get(cle(etageId, type)) || null;
}

/** Démarre un service ; attend qu'il soit prêt (ou en erreur), au plus attenteMs. */
export async function demarrer(etageId, type, par = 'toi', attenteMs = 20000) {
  const s = serviceDe(etageId, type);
  if (!s) throw new Error(tr("aucun service « {type} » pour l'étage {etage}", { type, etage: etageId }));
  if (processus.has(s.id)) return publicService(s);
  if (simules) return demarrerSimule(s, par);
  // Conflit de port : un autre service du QG, ou un programme lancé hors du QG, l'occupe déjà.
  const rival = [...etat.services.values()].find((x) => x.id !== s.id && x.port === s.port && processus.has(x.id));
  if (rival) throw new Error(tr("le port {port} est déjà utilisé par {service} de {etage} : arrête-le d'abord", { port: s.port, service: rival.nom, etage: trouverEtage(rival.etage)?.nom }));
  const ports = await portsEnEcoute();
  if (s.port && ports.has(s.port)) throw new Error(tr('le port {port} est déjà en écoute (PID {pid}, lancé hors du QG) : arrête ce programme ou laisse-le tourner', { port: s.port, pid: ports.get(s.port) }));

  const def = CATALOGUE()[type];
  const e = trouverEtage(etageId);
  Object.assign(s, { etat: 'demarrage', depuis: Date.now(), par, erreur: null, externe: null, lignes: [] });
  ajouterLignes(s, `> ${s.commande}${def.portArg && s.port ? ` ${def.portArg} ${s.port}` : ''}   ${tr('(dans {dossier})', { dossier: e.projet })}`);
  // Le port est toujours passé explicitement : il vaut celui du registre, même si le projet dit autre chose.
  // (hoteArg : option d'adresse d'écoute, pour un service qui écoute partout par défaut ; rojo écoute déjà en local)
  const args = [...def.args, ...(def.portArg && s.port ? [def.portArg, String(s.port)] : []), ...(def.hoteArg ? [def.hoteArg, '127.0.0.1'] : [])];
  // (Windows : fenêtre cachée ; POSIX : groupe de processus à part, pour arrêter tout l'arbre d'un coup)
  const enfant = spawn(def.exe, args, { cwd: e.projet, ...plateforme.optionsSpawnService(), env: { ...process.env, HOST: '127.0.0.1' } }); // 1.0.11 : serveurs qui lisent HOST en local, sans fenêtre du pare-feu
  processus.set(s.id, enfant);
  s.pid = enfant.pid;
  publier(s);
  const pret = new RegExp(def.pret, 'i');
  const surSortie = (d) => {
    ajouterLignes(s, d);
    if (s.etat === 'demarrage' && pret.test(String(d))) {
      s.etat = 'actif';
      publier(s);
    }
  };
  enfant.stdout.on('data', surSortie);
  enfant.stderr.on('data', surSortie);
  enfant.on('error', (err) => {
    s.erreur = err.message;
    ajouterLignes(s, tr('ERREUR : {message}', { message: err.message }));
  });
  enfant.on('exit', (code) => {
    processus.delete(s.id);
    ajouterLignes(s, tr('(arrêt, code {code})', { code: code ?? tr('tué') }));
    Object.assign(s, { etat: s.arretDemande || code === 0 ? 'arrete' : 'erreur', pid: null, arretDemande: false, erreur: s.arretDemande || code === 0 ? null : s.erreur || `code ${code}` });
    publier(s);
  });
  const fin = Date.now() + attenteMs;
  while (s.etat === 'demarrage' && Date.now() < fin) await new Promise((r) => setTimeout(r, 300));
  if (s.etat === 'demarrage' && processus.has(s.id)) {
    s.etat = 'actif'; // vivant sans message reconnu : on le considère prêt
    publier(s);
  }
  return publicService(s);
}

export function arreter(etageId, type) {
  const s = serviceDe(etageId, type);
  if (simules && s && s.etat !== 'arrete') {
    ajouterLignes(s, tr('(arrêt, code {code})', { code: 0 }));
    Object.assign(s, { etat: 'arrete', pid: null, erreur: null });
    publier(s);
    return true;
  }
  const enfant = s && processus.get(s.id);
  if (!enfant) return false;
  s.arretDemande = true;
  // tout l'arbre : le raccourci rokit lance le vrai rojo (taskkill /T sur Windows, groupe de processus sur Mac).
  plateforme.tuerArbre(enfant.pid);
  return true;
}

async function demarrerSimule(s, par) {
  if (s.etat === 'actif') return publicService(s);
  Object.assign(s, { etat: 'demarrage', depuis: Date.now(), par, erreur: null, externe: null, lignes: [] });
  ajouterLignes(s, `> ${s.commande}${s.port ? ` --port ${s.port}` : ''}   ${tr('(démo : rien n’est lancé pour de vrai)')}`);
  publier(s);
  await new Promise((r) => setTimeout(r, 1500));
  ajouterLignes(s, ['Rojo server listening:', '  Address: localhost', `  Port:    ${s.port}`, '', `Visit http://localhost:${s.port}/ in your browser for more information.`].join('\n'));
  s.etat = 'actif';
  publier(s);
  return publicService(s);
}

export function journaux(etageId, type, n = 80) {
  const s = serviceDe(etageId, type);
  return s ? s.lignes.slice(-n) : [];
}

export function arreterTout() {
  for (const [id, enfant] of processus) {
    try {
      plateforme.tuerArbre(enfant.pid);
    } catch {
      /* rien */
    }
    processus.delete(id);
  }
}
