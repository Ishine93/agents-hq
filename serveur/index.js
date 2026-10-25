// Serveur du QG des agents : HTTP + SSE sur 127.0.0.1, site statique, API du protocole (docs/protocole.md).
// Usage : node serveur/index.js [--demo] [--port 4747] [--no-open] [--replay D3|chemin/events.jsonl] [--vitesse 4]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { RACINE, REGLAGES } from './config.js';
import { etat, abonner, instantane, chargerHistorique, appliquerEvenement, DOSSIERS_DIR, sauver, utiliserDossiers, emettre, modelesPublics, mcpPublic } from './bus.js';
import { decouvrir, decouverteEnCache } from './decouverte.js';
import { changerMode } from './mcp.js';
import { resoudreDecision } from './decisions.js';
import { definirLienSite } from './notifications.js';
import { chargerEquipe, retirer as retirerAgent } from './equipe.js';
import { demarrerDetection, ajouterEtage, ignorerProjet } from './detection.js';
import { demarrerBonheur, recolter as recolterBonheur } from './bonheur.js';
import { initialiserServices, servicesPublics, demarrer as demarrerService, arreter as arreterService, journaux as journauxService, arreterTout } from './services.js';
import { cheminPiece, TYPES_IMAGES } from './pieces.js';
import { transcrire, etatDictee, prechargerDictee } from './dictee.js';
import { trouverCompte, compteConnecte, chargerComptes } from './comptes.js';
import * as ordo from './ordonnanceur.js';
import { resoudre } from './permissions.js';
import * as dg from './dg.js';
import * as taches from './taches.js';
import { creerSimulation } from './simulation.js';
import { routesReglages, ajouterEtages } from './api-reglages.js';
import { surChangement as surConso, consoPublique, demarrerSuiviLimites } from './conso.js';
import { t as tr } from './i18n.js';

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const option = (nom, defaut = null) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 ? args[i + 1] ?? true : defaut;
};
const DEMO = args.includes('--demo');
const REPLAY = option('replay');
const VITESSE = Number(option('vitesse', 1)) || 1;
const PORT = Number(option('port', REGLAGES.port));
const HOTE = REGLAGES.hote;
const OUVRIR = !args.includes('--no-open');

// Jeton local persistant : le lien http://127.0.0.1:PORT/?jeton=… reste valable entre deux redémarrages.
const FICHIER_JETON = path.join(RACINE, 'runtime', 'jeton.txt');
if (!fs.existsSync(FICHIER_JETON)) fs.writeFileSync(FICHIER_JETON, crypto.randomBytes(24).toString('hex'));
const JETON = fs.readFileSync(FICHIER_JETON, 'utf8').trim();

// ---------------------------------------------------------------- moteur
if (DEMO) utiliserDossiers('dossiers-demo');
if (!REPLAY) chargerEquipe(DEMO ? 'equipe-demo.json' : null);
if (!REPLAY) initialiserServices();
// Nouveaux jeux : port Rojo unique et proposition d'étage (pas en démo : la démo ne touche à aucun projet).
if (!REPLAY && !DEMO) demarrerDetection();
if (!REPLAY) demarrerBonheur({ demo: DEMO });
const moteur = DEMO
  ? creerSimulation()
  : { planifier: dg.planifier, reagir: dg.reagir, synthese: dg.synthese, produire: taches.produire, verifier: taches.verifier };
const dernierId = REPLAY ? 0 : chargerHistorique();
// Consommation en temps réel : le site reçoit les compteurs à chaque appel au modèle (au plus 1 fois/s).
surConso(() => emettre('conso', { conso: consoPublique() }));
ordo.initialiser(moteur, dernierId);

// ---------------------------------------------------------------- HTTP
// QG_WEB_DIR : servir une autre version du site (ex. web-next pendant sa mise au point).
const WEB = process.env.QG_WEB_DIR ? path.resolve(RACINE, process.env.QG_WEB_DIR) : path.join(RACINE, 'web');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};
const HOTES_OK = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2));
}
const autorise = (req) => cookies(req).qg_jeton === JETON || req.headers['x-qg-jeton'] === JETON;

function json(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corps));
}

function lireBrut(req, limite) {
  return new Promise((resolve, reject) => {
    let taille = 0;
    const morceaux = [];
    req.on('data', (c) => {
      taille += c.length;
      if (taille > limite) {
        reject(new Error(tr('corps trop gros')));
        req.destroy();
      } else morceaux.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(morceaux)));
    req.on('error', reject);
  });
}

// Les messages avec images jointes (base64) peuvent peser lourd : 80 Mo pour ces routes, 256 Ko ailleurs.
async function lireCorps(req, limite = 256 * 1024) {
  const brut = await lireBrut(req, limite);
  if (!brut.length) return {};
  try {
    return JSON.parse(brut.toString('utf8'));
  } catch {
    throw new Error(tr('JSON invalide'));
  }
}

const AVEC_PIECES = /^\/api\/dossiers(\/D\d+\/(repondre|completer))?$/;
const AUDIO = { 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/mp4': '.m4a', 'audio/mpeg': '.mp3' };

function servirPiece(res, dossierId, fichier) {
  const chemin = cheminPiece(dossierId, decodeURIComponent(fichier));
  if (!chemin) return json(res, 404, { erreur: tr('image introuvable') });
  res.writeHead(200, { 'Content-Type': TYPES_IMAGES[path.extname(chemin).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400' });
  fs.createReadStream(chemin).pipe(res);
}

function servirStatique(req, res, chemin) {
  const rel = decodeURIComponent(chemin === '/' ? '/index.html' : chemin);
  const fichier = path.resolve(WEB, '.' + rel);
  if (!fichier.startsWith(WEB + path.sep) && fichier !== WEB) return json(res, 403, { erreur: tr('interdit') });
  fs.readFile(fichier, (err, data) => {
    if (err) return json(res, 404, { erreur: tr('introuvable') });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function flux(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`data: ${JSON.stringify(instantane())}\n\n`);
  const desabonner = abonner((ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`));
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    desabonner();
  });
}

async function api(req, res, chemin) {
  if (req.method === 'GET' && chemin === '/api/flux') return flux(req, res);
  if (req.method === 'GET' && chemin === '/api/etat') return json(res, 200, instantane());
  if (req.method === 'GET' && chemin === '/api/mcp') return json(res, 200, mcpPublic());
  if (req.method === 'GET' && chemin === '/api/dictee') return json(res, 200, etatDictee);
  if (req.method === 'GET' && chemin === '/api/services') return json(res, 200, servicesPublics());
  let m;
  if (req.method === 'GET' && (m = chemin.match(/^\/api\/services\/([^/]+)\/journaux$/))) {
    const [etageId, type] = decodeURIComponent(m[1]).split(':');
    return json(res, 200, { lignes: journauxService(etageId, type, 400) });
  }
  if (req.method === 'GET' && (m = chemin.match(/^\/api\/pieces\/(D\d+)\/([^/]+)$/))) return servirPiece(res, m[1], m[2]);
  if (req.method === 'GET' || !REPLAY) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (await routesReglages(req, res, chemin, { json, lireBrut, lireCorps, url, demo: DEMO })) return;
  }
  if (req.method !== 'POST') return json(res, 405, { erreur: tr('méthode non permise') });

  // Dictée : corps = audio brut enregistré par le site.
  if (chemin === '/api/dictee') {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    const audio = await lireBrut(req, 60 * 1024 * 1024);
    if (!audio.length) return json(res, 400, { erreur: tr('audio vide') });
    const r = await transcrire(audio, AUDIO[type] || '.webm');
    return json(res, 200, r);
  }
  if (REPLAY) return json(res, 403, { erreur: tr('mode replay : lecture seule') });

  const corps = await lireCorps(req, AVEC_PIECES.test(chemin) ? 80 * 1024 * 1024 : 256 * 1024);
  if (chemin === '/api/dossiers') {
    const texte = String(corps.texte || '').trim();
    if (!texte) return json(res, 400, { erreur: tr('demande vide') });
    if (texte.length > 20000) return json(res, 400, { erreur: tr('demande trop longue') });
    const compte = trouverCompte(corps.compte);
    if (!DEMO && !compteConnecte(compte)) {
      return json(res, 409, { erreur: tr("{compte} n'est pas connecté : connecte-le dans Réglages › Comptes", { compte: compte.nom }) });
    }
    let reglageDg = null;
    if (corps.dg?.modele || corps.dg?.effort) {
      const modeles = modelesPublics()[compte.id] || [];
      const m = modeles.find((x) => x.id === corps.dg.modele);
      if (corps.dg.modele && !m) return json(res, 400, { erreur: tr('modèle inconnu pour ce compte : {modele}', { modele: corps.dg.modele }) });
      if (corps.dg.effort && m && !m.efforts.includes(corps.dg.effort)) return json(res, 400, { erreur: tr('effort non supporté : {effort}', { effort: corps.dg.effort }) });
      reglageDg = { modele: corps.dg.modele || null, effort: corps.dg.effort || null };
    }
    const d = ordo.creerDossier({ texte, etageAffiche: String(corps.etageAffiche || 'hall'), compte: compte.id, dg: reglageDg, pieces: corps.pieces || [] });
    return json(res, 200, { id: d.id });
  }
  if (chemin === '/api/bonheur/recolter') {
    return json(res, 200, await recolterBonheur({ sansModele: DEMO }));
  }
  if (chemin === '/api/etages/ajouter-lot') return json(res, 200, ajouterEtages(corps.projets));
  if ((m = chemin.match(/^\/api\/etages\/(ajouter|ignorer)$/))) {
    const dossier = String(corps.dossier || '');
    if (!dossier) return json(res, 400, { erreur: tr('dossier requis') });
    try {
      if (m[1] === 'ignorer') {
        ignorerProjet(dossier);
        return json(res, 200, { ok: true });
      }
      return json(res, 200, ajouterEtage(dossier, { nom: corps.nom || null }));
    } catch (e) {
      return json(res, 409, { erreur: e.message });
    }
  }
  if ((m = chemin.match(/^\/api\/services\/(demarrer|arreter)$/))) {
    const etageId = String(corps.etage || '');
    const type = String(corps.type || '');
    if (m[1] === 'arreter') return arreterService(etageId, type) ? json(res, 200, { ok: true }) : json(res, 409, { erreur: tr("ce serveur n'a pas été lancé par le QG") });
    try {
      return json(res, 200, await demarrerService(etageId, type, 'toi'));
    } catch (e) {
      return json(res, 409, { erreur: e.message });
    }
  }
  if ((m = chemin.match(/^\/api\/equipe\/(A\d+)\/retirer$/))) {
    return retirerAgent(m[1]) ? json(res, 200, { ok: true }) : json(res, 409, { erreur: tr('agent inconnu, déjà retiré ou occupé') });
  }
  if ((m = chemin.match(/^\/api\/decisions\/(Q\d+)$/))) {
    const ok = resoudreDecision(m[1], corps.choix || null, String(corps.texte || '').trim() || null);
    return ok ? json(res, 200, { ok: true }) : json(res, 404, { erreur: tr('question inconnue ou déjà traitée') });
  }
  if (chemin === '/api/mcp/decouvrir') {
    const compte = trouverCompte(corps.compte);
    if (!compteConnecte(compte)) return json(res, 409, { erreur: tr("{compte} n'est pas connecté", { compte: compte.nom }) });
    await decouvrir(compte.id);
    emettre('mcp', { mcp: mcpPublic(), modeles: modelesPublics() });
    return json(res, 200, mcpPublic());
  }
  if (chemin === '/api/mcp') {
    const cible = corps.cible === 'etage' ? 'etage' : 'compte';
    if (!corps.id || !corps.nom) return json(res, 400, { erreur: tr('id et nom requis') });
    changerMode(cible, String(corps.id), String(corps.nom), String(corps.mode));
    emettre('mcp', { mcp: mcpPublic(), modeles: modelesPublics() });
    return json(res, 200, mcpPublic());
  }
  if ((m = chemin.match(/^\/api\/dossiers\/(D\d+)\/(repondre|completer|annuler)$/))) {
    const d = etat.dossiers.get(m[1]);
    if (!d) return json(res, 404, { erreur: tr('dossier inconnu') });
    if (m[2] === 'annuler') ordo.annulerDossier(d);
    else {
      const texte = String(corps.texte || '').trim();
      if (!texte) return json(res, 400, { erreur: tr('message vide') });
      if (m[2] === 'repondre') ordo.repondre(d, texte, corps.pieces || []);
      else ordo.completer(d, texte, corps.pieces || []);
    }
    return json(res, 200, { ok: true });
  }
  if ((m = chemin.match(/^\/api\/taches\/(D\d+-T\d+)\/(annuler|valider)$/))) {
    const t = etat.taches.get(m[1]);
    if (!t) return json(res, 404, { erreur: tr('tâche inconnue') });
    if (m[2] === 'annuler') ordo.annulerTache(t);
    else ordo.validerUtilisateur(t, corps.decision === 'pass' ? 'pass' : 'fail');
    return json(res, 200, { ok: true });
  }
  if ((m = chemin.match(/^\/api\/permissions\/(P\d+)$/))) {
    const ok = resoudre(m[1], ['allow', 'allow_session'].includes(corps.decision) ? corps.decision : 'deny');
    return ok ? json(res, 200, { ok: true }) : json(res, 404, { erreur: tr('demande inconnue ou déjà traitée') });
  }
  if (chemin === '/api/urgence') {
    ordo.urgence();
    return json(res, 200, { ok: true });
  }
  if (chemin === '/api/reprendre') {
    ordo.reprendre();
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { erreur: tr('route inconnue') });
}

const serveur = http.createServer(async (req, res) => {
  try {
    if (!HOTES_OK.has(req.headers.host || '')) return json(res, 403, { erreur: tr('hôte refusé') });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const chemin = url.pathname;
    if (chemin.startsWith('/api/')) {
      const origine = req.headers.origin;
      if (origine && !HOTES_OK.has(origine.replace(/^https?:\/\//, ''))) return json(res, 403, { erreur: tr('origine refusée') });
      if (!autorise(req)) return json(res, 401, { erreur: tr('ouvre le QG avec lancer.bat (lien avec jeton)') });
      return await api(req, res, chemin);
    }
    if (chemin === '/' && url.searchParams.get('jeton')) {
      if (url.searchParams.get('jeton') !== JETON) return json(res, 401, { erreur: tr('jeton invalide') });
      res.writeHead(302, { 'Set-Cookie': `qg_jeton=${JETON}; HttpOnly; SameSite=Strict; Path=/`, Location: '/' });
      return res.end();
    }
    if (req.method !== 'GET') return json(res, 405, { erreur: tr('méthode non permise') });
    return servirStatique(req, res, chemin);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { erreur: String(e?.message || e) });
  }
});

serveur.listen(PORT, HOTE, () => {
  const lien = `http://${HOTE}:${PORT}/?jeton=${JETON}`;
  definirLienSite(lien);
  const { comptes } = chargerComptes();
  console.log(`QG des agents — ${DEMO ? 'MODE DÉMO (aucune session Claude)' : REPLAY ? `REPLAY ${REPLAY} ×${VITESSE}` : 'mode réel'}`);
  console.log(`Ouvre : ${lien}`);
  for (const c of comptes) console.log(`  ${c.nom} : ${compteConnecte(c) ? 'connecté' : 'non connecté (Réglages › Comptes, ou ajouter-un-compte.bat)'}`);
  if (OUVRIR) spawn('cmd.exe', ['/c', 'start', '', lien], { detached: true, stdio: 'ignore' }).unref();
  if (REPLAY) lancerReplay();
  else ordo.reprendreDossiers(); // dossiers interrompus par un arrêt : ils repartent
  if (!REPLAY) prechargerDictee();
  if (!DEMO && !REPLAY) demarrerSuiviLimites();
  // Première découverte (sans tokens) des modèles et MCP de chaque compte connecté.
  if (!DEMO && !REPLAY) {
    for (const c of comptes) {
      if (compteConnecte(c) && !decouverteEnCache(c.id)) {
        decouvrir(c.id)
          .then(() => emettre('mcp', { mcp: mcpPublic(), modeles: modelesPublics() }))
          .catch((e) => console.error('découverte', c.id, e.message));
      }
    }
  }
});

// ---------------------------------------------------------------- replay
function lancerReplay() {
  const fichier = /^D\d+$/.test(REPLAY) ? path.join(DOSSIERS_DIR, REPLAY, 'events.jsonl') : path.resolve(REPLAY);
  const evenements = fs.readFileSync(fichier, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (!evenements.length) return;
  const t0 = evenements[0].t;
  setTimeout(() => {
    for (const ev of evenements) setTimeout(() => appliquerEvenement(ev), (ev.t - t0) / VITESSE);
  }, 2000);
}

let arretEnCours = false;
function arreter() {
  if (arretEnCours) return;
  arretEnCours = true;
  // 1) on enregistre l'état tel quel (les tâches en cours seront reprises au prochain démarrage),
  // 2) on coupe les sessions Claude et les serveurs du sous-sol, 3) on quitte.
  for (const id of etat.dossiers.keys()) {
    try {
      sauver(id);
    } catch {
      /* rien */
    }
  }
  ordo.arreterSessions();
  arreterTout(); // les serveurs du sous-sol lancés par le QG s'arrêtent avec lui
  console.log('Arrêt : état enregistré, les dossiers en cours reprendront au prochain lancement.');
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', arreter); // Ctrl+C dans la fenêtre
process.on('SIGTERM', arreter);
process.on('SIGHUP', arreter); // fenêtre de lancer.bat fermée (Windows)
