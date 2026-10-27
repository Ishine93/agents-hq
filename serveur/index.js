// Serveur du QG des agents : HTTP + SSE sur 127.0.0.1, site statique, API du protocole (docs/protocole.md).
// Usage : node serveur/index.js [--demo] [--port 4747] [--no-open] [--replay D3|chemin/events.jsonl] [--vitesse 4]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RACINE, REGLAGES, utiliserImmeubleDemo } from './config.js';
import * as plateforme from './plateforme.js';
import { etat, abonner, instantane, chargerHistorique, appliquerEvenement, DOSSIERS_DIR, sauver, utiliserDossiers, emettre, modelesPublics, mcpPublic, alerte, comptesPublics, modificationsDe } from './bus.js';
import { decouvrir, decouverteEnCache } from './decouverte.js';
import { changerMode } from './mcp.js';
import { resoudreDecision } from './decisions.js';
import { definirLienSite } from './notifications.js';
import { chargerEquipe, retirer as retirerAgent } from './equipe.js';
import { demarrerDetection, ajouterEtage, ignorerProjet } from './detection.js';
import { demarrerBonheur, recolter as recolterBonheur } from './bonheur.js';
import { simulerServices, initialiserServices, servicesPublics, demarrer as demarrerService, arreter as arreterService, journaux as journauxService, arreterTout } from './services.js';
import { cheminPiece, TYPES_IMAGES } from './pieces.js';
import { transcrire, etatDictee, prechargerDictee } from './dictee.js';
import { trouverCompte, compteConnecte, chargerComptes } from './comptes.js';
import { SPECTACLE, scenario as scenarioParCle } from './scenarios-demo.js';
import * as ordo from './ordonnanceur.js';
import { resoudre } from './permissions.js';
import * as dg from './dg.js';
import * as taches from './taches.js';
import { creerSimulation } from './simulation.js';
import { lancerControles } from './controles.js';
import { NIVEAUX } from './travail.js';
import { routesReglages, ajouterEtages } from './api-reglages.js';
import { routeMcp, definirAdresseMcp } from './mcp-http.js';
import { modeDemo, pausesComptes } from './routeur.js';
import { routesNavigateur, etatApp, ouvrirApp } from './navigateur.js';
import { majIconeRaccourci } from './raccourci.js';
import { discuter, definirPersonnalite, oublier, bavarder, demarrerBavardages, utiliserDemo } from './personnages.js';
import { listeSkills, skillsClaudeCode, lireSkill, existe as existeSkill, idsSkills, creerSkill, modifierSkill, reglerSkill, supprimerSkill, importerFichier, importerClaudeCode } from './skills.js';
import { surChangement as surConso, consoPublique, demarrerSuiviLimites, surLimitesLues } from './conso.js';
import { t as tr } from './i18n.js';
import { questionTache, questionDg } from './questions.js';
import { verifierMaj, lancerMaj, majAuLancement, CODE_MISE_A_JOUR } from './maj.js';

const decouverteEnCours = new Set();
const alerteQuestion = (dossierId, e) => alerte('erreur', tr('Question sans réponse : {raison}', { raison: e.message }), dossierId);

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const option = (nom, defaut = null) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 ? args[i + 1] ?? true : defaut;
};
const DEMO = args.includes('--demo');
const REPLAY = option('replay');
modeDemo(DEMO || !!REPLAY); // la simulation n'a pas de comptes : tout reste sur le compte de la demande
const VITESSE = Number(option('vitesse', 1)) || 1;
// la démo prend le port suivant : elle tourne à côté du QG sans le déranger
const PORT = Number(option('port', DEMO ? Number(REGLAGES.port) + 1 : REGLAGES.port));
const HOTE = REGLAGES.hote;
const OUVRIR = !args.includes('--no-open');

// Jeton local persistant : le lien http://127.0.0.1:PORT/?jeton=… reste valable entre deux redémarrages.
const FICHIER_JETON = path.join(RACINE, 'runtime', 'jeton.txt');
if (!fs.existsSync(FICHIER_JETON)) fs.writeFileSync(FICHIER_JETON, crypto.randomBytes(24).toString('hex'));
const JETON = fs.readFileSync(FICHIER_JETON, 'utf8').trim();

// ---------------------------------------------------------------- mise à jour au lancement
// Avant de reprendre le moindre dossier : si une version plus récente est publiée, le script de mise à jour
// prend le relais (il relance le QG avec --sans-maj) et on s'arrête ici.
if (!DEMO && !REPLAY && !args.includes('--sans-maj') && (await majAuLancement(REGLAGES))) await new Promise(() => {});

// ---------------------------------------------------------------- moteur
// Démo : ses dossiers, son équipe, ses souvenirs et son immeuble fictif à elle (jamais ceux du vrai QG, qui
// peut tourner à côté) ; lancée depuis le QG (--neuve), elle repart de zéro.
if (DEMO) {
  const dossierDemo = path.join(RACINE, 'dossiers-demo');
  if (args.includes('--neuve')) {
    fs.rmSync(dossierDemo, { recursive: true, force: true });
    fs.rmSync(path.join(RACINE, 'runtime', 'equipe-demo.json'), { force: true });
  }
  utiliserDossiers('dossiers-demo');
  utiliserImmeubleDemo(dossierDemo, { neuf: args.includes('--neuve') });
  utiliserDemo(true, path.join(dossierDemo, 'memoires.json'));
  simulerServices();
}
if (!REPLAY) chargerEquipe(DEMO ? 'equipe-demo.json' : null);
if (!REPLAY) initialiserServices();
// Nouveaux jeux : port Rojo unique et proposition d'étage (pas en démo : la démo ne touche à aucun projet).
if (!REPLAY && !DEMO) demarrerDetection();
if (!REPLAY) demarrerBonheur({ demo: DEMO });
const moteur = DEMO
  ? creerSimulation()
  : { planifier: dg.planifier, reagir: dg.reagir, synthese: dg.synthese, produire: taches.produire, verifier: taches.verifier, controler: (t, d, commandes, ctx) => lancerControles(commandes, ctx) };
const dernierId = REPLAY ? 0 : chargerHistorique();
// pauses des comptes (D4) : en mémoire seulement ; celles rejouées depuis le journal ne valent plus
if (etat.ordonnanceur?.pauses) etat.ordonnanceur = { ...etat.ordonnanceur, pauses: {} };
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
  if (req.method === 'GET' && chemin === '/api/maj') {
    try {
      return json(res, 200, await verifierMaj({ forcer: new URL(req.url, 'http://127.0.0.1').searchParams.has('forcer') }));
    } catch (e) {
      return json(res, 502, { erreur: e.message });
    }
  }
  let m;
  if (req.method === 'GET' && (m = chemin.match(/^\/api\/services\/([^/]+)\/journaux$/))) {
    const [etageId, type] = decodeURIComponent(m[1]).split(':');
    return json(res, 200, { lignes: journauxService(etageId, type, 400) });
  }
  if (req.method === 'GET' && (m = chemin.match(/^\/api\/pieces\/(D\d+)\/([^/]+)$/))) return servirPiece(res, m[1], m[2]);
  // skills : la bibliothèque (et ceux de Claude Code à importer), ou le texte d'un skill
  if (req.method === 'GET' && chemin === '/api/skills') return json(res, 200, { skills: listeSkills(), claudeCode: skillsClaudeCode() });
  if (req.method === 'GET' && (m = chemin.match(/^\/api\/skills\/([a-z0-9-]+)$/))) {
    if (!existeSkill(m[1])) return json(res, 404, { erreur: tr('skill inconnu') });
    return json(res, 200, { id: m[1], texte: lireSkill(m[1]) });
  }
  // code écrit par un agent (diffs), y compris après un redémarrage (relu dans le journal du dossier)
  if (req.method === 'GET' && (m = chemin.match(/^\/api\/taches\/(D\d+-T\d+)\/modifications$/))) return json(res, 200, { modifications: modificationsDe(m[1]) });
  if (req.method === 'GET' || !REPLAY) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (await routesReglages(req, res, chemin, { json, lireBrut, lireCorps, url, demo: DEMO })) return;
    // navigateur du QG : vérifier qu'un site s'affiche dans la page, ou l'ouvrir dans une fenêtre avec ta session
    if (chemin.startsWith('/api/navigateur/')) {
      const corps = req.method === 'POST' ? await lireCorps(req, 16 * 1024) : {};
      const lien = `http://${HOTE}:${PORT}/?jeton=${JETON}`;
      if (await routesNavigateur(req, res, chemin, { json, url, corps, lien, publier: () => emettre('navigateur_app', etatApp()) })) return;
    }
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

  // Skills : import d'un fichier (corps brut : SKILL.md, .skill ou .zip)
  if (chemin === '/api/skills/importer') {
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      const ids = await importerFichier(url.searchParams.get('nom') || 'skill.md', await lireBrut(req, 9 * 1024 * 1024));
      emettre('skills', { skills: listeSkills() });
      return json(res, 200, { ids });
    } catch (e) {
      return json(res, 400, { erreur: e.message });
    }
  }
  const corps = await lireCorps(req, AVEC_PIECES.test(chemin) ? 80 * 1024 * 1024 : 256 * 1024);
  // Skills : créer, modifier, régler (mode, pour qui, étages), supprimer, importer depuis Claude Code
  if ((m = chemin.match(/^\/api\/skills\/(creer|importer-claude)$/)) || (m = chemin.match(/^\/api\/skills\/([a-z0-9-]+)\/(modifier|regler|supprimer)$/))) {
    try {
      let r = { ok: true };
      if (m[1] === 'creer') r = { id: creerSkill({ nom: corps.nom, description: corps.description, instructions: corps.instructions }) };
      else if (m[1] === 'importer-claude') r = { id: importerClaudeCode(String(corps.chemin || '')) };
      else if (m[2] === 'modifier') modifierSkill(m[1], String(corps.texte || ''));
      else if (m[2] === 'regler') r = { reglage: reglerSkill(m[1], corps) };
      else supprimerSkill(m[1]);
      emettre('skills', { skills: listeSkills() });
      return json(res, 200, r);
    } catch (e) {
      return json(res, 400, { erreur: e.message });
    }
  }
  if (chemin === '/api/dossiers') {
    const texte = String(corps.texte || '').trim();
    if (!texte) return json(res, 400, { erreur: tr('demande vide') });
    if (texte.length > 20000) return json(res, 400, { erreur: tr('demande trop longue') });
    const compte = trouverCompte(corps.compte);
    if (!DEMO && !compte) return json(res, 409, { erreur: tr('Aucun compte IA : ajoute-en un dans Réglages › Comptes IA') });
    if (!DEMO && !compteConnecte(compte)) {
      return json(res, 409, { erreur: tr("{compte} n'est pas connecté : connecte-le dans Réglages › Comptes IA", { compte: compte.nom }) });
    }
    // compte qui exécute les tâches (Réglages › Comptes IA › Agents de la demande) : doit exister et être connecté
    const agents = REGLAGES.compteAgents ? trouverCompte(REGLAGES.compteAgents) : null;
    const compteAgents = agents && agents.id === REGLAGES.compteAgents && agents.id !== compte?.id && (DEMO || compteConnecte(agents)) ? agents.id : null;
    if (REGLAGES.compteAgents && !compteAgents && agents && agents.id !== compte?.id && !DEMO) {
      return json(res, 409, { erreur: tr("{compte} (compte des agents) n'est pas connecté : connecte-le ou change le réglage dans Réglages › Comptes IA", { compte: agents.nom }) });
    }
    let reglageDg = null;
    if (corps.dg?.modele || corps.dg?.effort) {
      const modeles = modelesPublics()[compte?.id] || [];
      const m = modeles.find((x) => x.id === corps.dg.modele);
      if (corps.dg.modele && !m) return json(res, 400, { erreur: tr('modèle inconnu pour ce compte : {modele}', { modele: corps.dg.modele }) });
      if (corps.dg.effort && m && !m.efforts.includes(corps.dg.effort)) return json(res, 400, { erreur: tr('effort non supporté : {effort}', { effort: corps.dg.effort }) });
      reglageDg = { modele: corps.dg.modele || null, effort: corps.dg.effort || null };
    }
    // skills choisis à l'envoi (🧩) : seulement des skills de la bibliothèque
    const connus = new Set(idsSkills());
    const skills = (Array.isArray(corps.skills) ? corps.skills : []).filter((s) => s && connus.has(s.id) && ['dg', 'tous', 'demande'].includes(s.pour)).map((s) => ({ id: s.id, pour: s.pour }));
    const skillsExclus = (Array.isArray(corps.skillsExclus) ? corps.skillsExclus : []).filter((id) => connus.has(id));
    // niveau de coût choisi à l'envoi (pastille de la barre d'envoi) ; absent : celui des réglages
    if (corps.travail != null && !NIVEAUX.includes(corps.travail?.cout)) return json(res, 400, { erreur: tr('niveau de coût inconnu : {cout}', { cout: String(corps.travail?.cout ?? corps.travail) }) });
    const travail = corps.travail != null ? { cout: corps.travail.cout } : null;
    const d = ordo.creerDossier({ texte, etageAffiche: String(corps.etageAffiche || 'hall'), compte: compte?.id || null, compteAgents, dg: reglageDg, pieces: corps.pieces || [], skills, skillsExclus, travail });
    return json(res, 200, { id: d.id });
  }
  if (chemin === '/api/bonheur/recolter') {
    return json(res, 200, await recolterBonheur({ sansModele: DEMO }));
  }
  if (chemin === '/api/etages/ajouter-lot') return json(res, 200, ajouterEtages(corps.projets));
  if ((m = chemin.match(/^\/api\/etages\/(ajouter|ignorer)$/))) {
    // { dossier, nom } (un projet) ou { dossiers: [...], nom, type } (étage libre, le premier dossier est le principal)
    const liste = m[1] === 'ajouter' && Array.isArray(corps.dossiers) ? corps.dossiers.map((d) => String(d || '').trim()).filter(Boolean) : null;
    const dossier = liste ? liste[0] : String(corps.dossier || '');
    if (!dossier) return json(res, 400, { erreur: tr('dossier requis') });
    try {
      if (m[1] === 'ignorer') {
        ignorerProjet(dossier);
        return json(res, 200, { ok: true });
      }
      return json(res, 200, ajouterEtage(liste || dossier, { nom: corps.nom || null, type: corps.type || null }));
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
  // mini-jeu des personnages : discussion, personnalité, mémoire (aucun effet sur le travail)
  if (chemin === '/api/personnages/discuter') {
    discuter(String(corps.cle || ''), corps.texte).catch(() => null); // la réponse arrive par le flux (« discussion »)
    return json(res, 200, { ok: true });
  }
  if (chemin === '/api/personnages/personnalite') {
    definirPersonnalite(String(corps.cle || '').slice(0, 30), corps.texte);
    return json(res, 200, { ok: true });
  }
  if (chemin === '/api/personnages/oublier') {
    oublier({ cle: corps.cle || null, souvenir: corps.souvenir || null, relation: corps.relation || null, tout: corps.tout === true, relations: corps.relations === true });
    return json(res, 200, { ok: true });
  }
  if (chemin === '/api/personnages/bavarder') {
    const r = await bavarder({ force: true });
    return r ? json(res, 200, r) : json(res, 409, { erreur: tr('Personne à faire bavarder : il faut au moins deux collègues au même étage.') });
  }
  if ((m = chemin.match(/^\/api\/dossiers\/(D\d+)\/(repondre|completer|annuler|supprimer)$/))) {
    const d = etat.dossiers.get(m[1]);
    if (!d) return json(res, 404, { erreur: tr('dossier inconnu') });
    if (m[2] === 'annuler') ordo.annulerDossier(d);
    else if (m[2] === 'supprimer') ordo.supprimerDossier(d);
    else {
      const texte = String(corps.texte || '').trim();
      if (!texte) return json(res, 400, { erreur: tr('message vide') });
      if (m[2] === 'repondre') ordo.repondre(d, texte, corps.pieces || []);
      else ordo.completer(d, texte, corps.pieces || []);
    }
    return json(res, 200, { ok: true });
  }
  if ((m = chemin.match(/^\/api\/taches\/(D\d+-T\d+)\/(annuler|valider|question|consigne)$/))) {
    const t = etat.taches.get(m[1]);
    if (!t) return json(res, 404, { erreur: tr('tâche inconnue') });
    if (m[2] === 'annuler') ordo.annulerTache(t);
    else if (m[2] === 'valider') ordo.validerUtilisateur(t, corps.decision === 'pass' ? 'pass' : 'fail');
    else {
      const texte = String(corps.texte || '').trim().slice(0, 4000);
      if (!texte) return json(res, 400, { erreur: tr('message vide') });
      if (m[2] === 'consigne') await ordo.consigneDirecte(t, texte);
      else {
        // La réponse arrive plus tard dans le fil : on ne fait pas attendre le site.
        if (DEMO) return json(res, 409, { erreur: tr('Pas de question en mode démo : les agents sont simulés.') });
        if (!t.x?.session) return json(res, 409, { erreur: tr("{nom} n'a pas encore commencé : il n'y a pas encore de conversation à interroger.", { nom: t.prenom || t.ref }) });
        questionTache(t, texte).catch((e) => alerteQuestion(t.dossier, e));
      }
    }
    return json(res, 200, { ok: true });
  }
  if ((m = chemin.match(/^\/api\/dossiers\/(D\d+)\/question-dg$/))) {
    const d = etat.dossiers.get(m[1]);
    if (!d) return json(res, 404, { erreur: tr('dossier inconnu') });
    const texte = String(corps.texte || '').trim().slice(0, 4000);
    if (!texte) return json(res, 400, { erreur: tr('message vide') });
    if (DEMO) return json(res, 409, { erreur: tr('Pas de question en mode démo : les agents sont simulés.') });
    if (!d.x?.dgSession) return json(res, 409, { erreur: tr("Le DG n'a pas encore commencé ce dossier.") });
    questionDg(d, texte).catch((e) => alerteQuestion(d.id, e));
    return json(res, 200, { ok: true });
  }
  if ((m = chemin.match(/^\/api\/permissions\/(P\d+)$/))) {
    const ok = resoudre(m[1], ['allow', 'allow_session'].includes(corps.decision) ? corps.decision : 'deny');
    return ok ? json(res, 200, { ok: true }) : json(res, 404, { erreur: tr('demande inconnue ou déjà traitée') });
  }
  if (chemin === '/api/maj/lancer') {
    try {
      const m = await verifierMaj({ forcer: true });
      if (!m.disponible) return json(res, 409, { erreur: tr('Tu as déjà la dernière version ({version}).', { version: m.actuelle }) });
      // code 42 : lancer.bat ferme sa fenêtre tout de suite (la mise à jour relance le QG dans une autre)
      lancerMaj(() => arreter(CODE_MISE_A_JOUR));
      return json(res, 200, { ok: true, version: m.derniere });
    } catch (e) {
      return json(res, 409, { erreur: e.message });
    }
  }
  // Démo (Réglages › À propos) : une autre instance, simulée, dans sa propre fenêtre et sur son propre port.
  if (chemin === '/api/demo/lancer') {
    if (DEMO) return json(res, 409, { erreur: tr('Tu es déjà dans la démo.') });
    const port = PORT + 1;
    const lienDemo = `http://${HOTE}:${port}/?jeton=${JETON}`;
    if (await portRepond(port)) {
      if (!(REGLAGES.ouvrirEnApp !== false && ouvrirApp(lienDemo))) plateforme.ouvrirUrl(lienDemo);
      return json(res, 200, { ok: true, deja: true });
    }
    // lancer-demo.bat (lancer-demo.command sur Mac) dans sa propre fenêtre de terminal
    plateforme.ouvrirTerminal('QG des agents - demo', [path.join(RACINE, plateforme.script('lancer-demo')), '--port', String(port), '--neuve', '--spectacle'], { cwd: RACINE });
    return json(res, 200, { ok: true });
  }
  if (chemin === '/api/demo/quitter') {
    if (!DEMO) return json(res, 409, { erreur: tr('Ce n’est pas la démo.') });
    json(res, 200, { ok: true });
    setTimeout(() => arreter(0), 300);
    return;
  }
  if (chemin === '/api/urgence') {
    ordo.urgence();
    return json(res, 200, { ok: true });
  }
  if (chemin === '/api/reprendre') {
    if (typeof corps.compte === 'string' && corps.compte) ordo.reprendreCompte(corps.compte);
    else ordo.reprendre();
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { erreur: tr('route inconnue') });
}

const serveur = http.createServer(async (req, res) => {
  try {
    if (!HOTES_OK.has(req.headers.host || '')) return json(res, 403, { erreur: tr('hôte refusé') });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const chemin = url.pathname;
    // outils du QG en MCP HTTP pour les agents Codex : jeton par session (pas le jeton du site)
    if (chemin === '/mcp/agents') return await routeMcp(req, res, chemin, { lireCorps, json });
    if (chemin.startsWith('/api/')) {
      const origine = req.headers.origin;
      if (origine && !HOTES_OK.has(origine.replace(/^https?:\/\//, ''))) return json(res, 403, { erreur: tr('origine refusée') });
      if (!autorise(req)) return json(res, 401, { erreur: tr('ouvre le QG avec {script} (lien avec jeton)', { script: plateforme.script('lancer') }) });
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
  definirAdresseMcp(`http://${HOTE}:${PORT}/mcp/agents`);
  const { comptes } = chargerComptes();
  console.log(`QG des agents — ${DEMO ? 'MODE DÉMO (aucune session Claude)' : REPLAY ? `REPLAY ${REPLAY} ×${VITESSE}` : 'mode réel'}`);
  console.log(`Ouvre : ${lien}`);
  for (const c of comptes) console.log(`  ${c.nom} : ${compteConnecte(c) ? 'connecté' : `non connecté (Réglages › Comptes, ou ${plateforme.script('ajouter-un-compte')})`}`);
  // fenêtre application du QG (navigateur complet) si elle est installée, sinon le navigateur habituel
  if (OUVRIR && !(REGLAGES.ouvrirEnApp !== false && ouvrirApp(lien))) plateforme.ouvrirUrl(lien);
  if (REPLAY) lancerReplay();
  else ordo.reprendreDossiers(); // dossiers interrompus par un arrêt : ils repartent
  if (!REPLAY) prechargerDictee();
  // mini-jeu : en démo, des répliques toutes prêtes (aucun token)
  // démo lancée depuis le QG : le grand scénario démarre tout seul
  if (DEMO && args.includes('--spectacle')) lancerSpectacle();
  if (!REPLAY) demarrerBavardages();
  if (!DEMO && !REPLAY) majIconeRaccourci();
  if (!DEMO && !REPLAY) {
    // En pause sur une limite d'usage : relecture toutes les 5 min, pour reprendre dès qu'il y a de la marge.
    demarrerSuiviLimites({ urgent: () => !!etat.ordonnanceur?.pause?.limite || Object.values(pausesComptes()).some((p) => p.type === 'quota') });
    // Forfait changé (Pro → Max…) : la découverte en cache garde l'ancien forfait et ses modèles, on la refait.
    // (la découverte dit « Claude Max », la lecture des limites « max » : on compare le mot du forfait)
    const forfait = (s) => String(s || '').toLowerCase().replace(/^claude\s+/, '').split(/\s+/)[0];
    surLimitesLues((id, l) => {
      const avant = decouverteEnCache(id)?.abonnement;
      if (!l.abonnement || !avant || forfait(avant) === forfait(l.abonnement) || decouverteEnCours.has(id)) return;
      console.log(`Forfait de ${id} changé (${avant} → ${l.abonnement}) : relecture des modèles et connecteurs.`);
      decouverteEnCours.add(id);
      decouvrir(id)
        .then(() => {
          emettre('mcp', { mcp: mcpPublic(), modeles: modelesPublics() });
          emettre('comptes', comptesPublics());
        })
        .catch((e) => console.error('découverte', id, e.message))
        .finally(() => decouverteEnCours.delete(id));
    });
  }
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

// ---------------------------------------------------------------- démo : le grand scénario
// Démo lancée depuis le QG : les demandes partent toutes seules, l'une après l'autre (scenarios-demo.js).
function lancerSpectacle() {
  for (const { scenario: cle, apres, etage } of SPECTACLE) {
    setTimeout(() => {
      const sc = scenarioParCle(cle);
      ordo.creerDossier({ texte: sc.texte(), etageAffiche: etage, compte: trouverCompte().id, scenario: cle });
    }, apres);
  }
}

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

// Un QG répond-il déjà sur ce port ? (la démo, déjà ouverte)
function portRepond(port) {
  return new Promise((ok) => {
    const r = http.get({ host: HOTE, port, path: '/', timeout: 1500 }, (x) => {
      x.resume();
      ok(true);
    });
    r.on('error', () => ok(false));
    r.on('timeout', () => {
      r.destroy();
      ok(false);
    });
  });
}

let arretEnCours = false;
// (en gestionnaire de signal, le premier argument est le nom du signal : on quitte alors avec 0)
function arreter(code) {
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
  setTimeout(() => process.exit(typeof code === 'number' ? code : 0), 1500);
}
process.on('SIGINT', arreter); // Ctrl+C dans la fenêtre
process.on('SIGTERM', arreter);
process.on('SIGHUP', arreter); // fenêtre de lancer.bat (Windows) ou du Terminal de lancer.command (Mac) fermée
