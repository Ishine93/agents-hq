// Routes des réglages : comptes Claude, dossiers racines, étages, équipe (prénoms, skins), happiness
// manager (édition, import, export), consommation, visionneur de fichiers et premier lancement.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RACINE, modifierReglages, racines, sous, etage as trouverEtage, fiche } from './config.js';
import * as plateforme from './plateforme.js';
import { emettre, comptesPublics, reglagesPublics, etagesPublics, modelesPublics, mcpPublic } from './bus.js';
import { ajouterCompte, modifierCompte, supprimerCompte, ouvrirConnexion, deconnecter, trouverCompte, compteConnecte, verifierConnexion, fichierConnexion, fournisseur as fournisseurDuCompte, adaptateur as adaptateurDuCompte } from './comptes.js';
import { installerCodex, etatInstallation as etatInstallationCodex } from './ia/codex-installation.js';
import { listerProjets, ajouterEtage, modifierEtage, retirerEtage, ignorerProjet, marquerSignales, TYPES as TYPES_PROJET } from './detection.js';
import { personnalisation, modifierPersonnalisation, renommerPersonnage } from './equipe.js';
import { stockComplet, remplacerStock, importerStock, analyserImport, exporter, langueChangee } from './bonheur.js';
import { consoPublique, consoTaches, lireLimites } from './conso.js';
import { decouvrir } from './decouverte.js';
import { zones } from './permissions.js';
import { confierValidationsEnAttente } from './ordonnanceur.js';
import { renommerMemoire, miniJeuPublic } from './personnages.js';
import { t } from './i18n.js';
import { travailReglages } from './travail.js';
import { chargerPriorites, modifierPriorites, prereglages, apercu, pausesComptes, pauseDe, leverPauseCompte, NATURES, TYPES as TYPES_TACHE } from './routeur.js';

const publierComptes = () => emettre('comptes', comptesPublics());
const publierReglages = () => emettre('reglages', { reglages: reglagesPublics() });
const publierEtages = () => emettre('etages', { etages: etagesPublics() });

// ---------------------------------------------------------------- connexion des comptes

const surveillances = new Map();
// Date de modification du fichier de connexion du fournisseur (.credentials.json ou auth.json) : stat seulement.
const mtimeIdentifiants = (c) => {
  try {
    return fs.statSync(fichierConnexion(c)).mtimeMs;
  } catch {
    return 0;
  }
};

// Après l'ouverture de la fenêtre de connexion : dès que les identifiants changent, on prévient le site
// et on lit (sans tokens) les modèles, connecteurs et limites du compte.
// Windows, Codex et agents ACP : la date du fichier (ou du dossier) de connexion. Claude sur Mac : le jeton est dans le trousseau, on
// redemande l'état à Claude Code (verifierConnexion) à chaque tour.
function surveillerConnexion(id) {
  if (surveillances.has(id)) return;
  const debut = Date.now();
  const avant = mtimeIdentifiants(trouverCompte(id));
  let lecture = false;
  const minuterie = setInterval(async () => {
    const c = trouverCompte(id);
    if (!c || c.id !== id || Date.now() - debut > 15 * 60 * 1000) {
      clearInterval(minuterie);
      surveillances.delete(id);
      if (c?.id === id) adaptateurDuCompte(c).connexionTerminee?.(id);
      return;
    }
    if (plateforme.estWindows() || fournisseurDuCompte(c) !== 'claude') {
      if (mtimeIdentifiants(c) <= avant || !compteConnecte(c)) return;
      adaptateurDuCompte(c).connexionTerminee?.(id);
    } else {
      if (lecture) return;
      lecture = true;
      const ok = await verifierConnexion(c).catch(() => false);
      lecture = false;
      if (!ok || !surveillances.has(id)) return;
    }
    clearInterval(minuterie);
    surveillances.delete(id);
    // compte en pause « à reconnecter » (D4) : ses tâches reprennent dès la connexion
    if (pauseDe(id)?.type === 'connexion') leverPauseCompte(id);
    publierComptes();
    try {
      await decouvrir(id);
      emettre('mcp', { mcp: mcpPublic(), modeles: modelesPublics() });
      publierComptes();
    } catch (e) {
      console.error('découverte', id, e.message);
    }
    lireLimites(id).catch(() => null);
  }, 2000);
  minuterie.unref();
  surveillances.set(id, minuterie);
}

// ---------------------------------------------------------------- choix d'un dossier (fenêtre Windows)

const DELAI_CHOIX_DOSSIER = 10 * 60 * 1000;

// Fonctions user32 appelées depuis PowerShell. Windows refuse le premier plan à un processus lancé en
// arrière-plan (verrou de premier plan) : Forcer() s'attache d'abord au thread de la fenêtre active
// (AttachThreadInput), puis, si ça ne suffit pas, simule une pression sur Alt, qui lève le verrou.
// La fenêtre est de toute façon TopMost : même sans focus, elle reste au-dessus du navigateur.
const CSHARP_PREMIER_PLAN = `
using System;
using System.Runtime.InteropServices;
public static class QgPremierPlan {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  public static bool Forcer(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9);
    SetWindowPos(h, (IntPtr)(-1), 0, 0, 0, 0, 0x0043);
    uint pid;
    uint cible = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    uint moi = GetCurrentThreadId();
    bool lie = cible != 0 && cible != moi && AttachThreadInput(moi, cible, true);
    BringWindowToTop(h);
    SetForegroundWindow(h);
    if (lie) AttachThreadInput(moi, cible, false);
    if (GetForegroundWindow() != h) {
      keybd_event(0x12, 0, 0, UIntPtr.Zero);
      keybd_event(0x12, 0, 2, UIntPtr.Zero);
      SetForegroundWindow(h);
    }
    return GetForegroundWindow() == h;
  }
  public static bool RamenerProcessus(uint pidCherche) {
    IntPtr trouve = IntPtr.Zero;
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      uint p;
      GetWindowThreadProcessId(h, out p);
      if (p != pidCherche || !IsWindowVisible(h)) return true;
      trouve = h;
      return false;
    }, IntPtr.Zero);
    return trouve != IntPtr.Zero && Forcer(trouve);
  }
}`;

const encoderPowerShell = (script) => Buffer.from(script, 'utf16le').toString('base64');
const lancerPowerShell = (script, delai, fin) =>
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoderPowerShell(script)], { timeout: delai, windowsHide: true, encoding: 'utf8' }, fin);

// Windows : un propriétaire invisible (opacité 0, hors barre des tâches) mais réellement affiché et TopMost,
// amené au premier plan ; le FolderBrowserDialog qui lui appartient s'ouvre donc au-dessus du navigateur, avec le focus.
function scriptChoixDossierWindows(titre) {
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    "$ProgressPreference = 'SilentlyContinue'",
    `$cs = @'\n${CSHARP_PREMIER_PLAN}\n'@`,
    'try { Add-Type -TypeDefinition $cs } catch {}',
    '$o = New-Object System.Windows.Forms.Form',
    "$o.FormBorderStyle = 'None'",
    '$o.ShowInTaskbar = $false',
    "$o.StartPosition = 'CenterScreen'",
    '$o.Size = New-Object System.Drawing.Size(1, 1)',
    '$o.Opacity = 0',
    '$o.TopMost = $true',
    '$o.Show()',
    'try { [void][QgPremierPlan]::Forcer($o.Handle) } catch {}',
    '$o.Activate()',
    '$f = New-Object System.Windows.Forms.FolderBrowserDialog',
    `$f.Description = '${String(titre).replace(/[\r\n]+/g, ' ').replace(/'/g, "''").slice(0, 120)}'`,
    '$f.ShowNewFolderButton = $true',
    '$r = $f.ShowDialog($o)',
    'if ($r -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath }',
    '$o.Close()',
  ].join('\n');
}

// Un sélecteur par plateforme : (titre) => { promesse, rappeler }. La promesse ne rejette jamais (chemin ou null) ;
// rappeler() ramène la fenêtre déjà ouverte au premier plan, sans erreur si ce n'est pas possible.
function selecteurWindows(titre) {
  let rappelEnCours = false;
  let enfant = null;
  const promesse = new Promise((resolve) => {
    enfant = lancerPowerShell(scriptChoixDossierWindows(titre), DELAI_CHOIX_DOSSIER, (err, sortie) => resolve(err ? null : String(sortie).trim() || null));
  });
  const rappeler = () => {
    if (rappelEnCours || !enfant?.pid) return;
    rappelEnCours = true;
    const script = [`$cs = @'\n${CSHARP_PREMIER_PLAN}\n'@`, 'Add-Type -TypeDefinition $cs', `[void][QgPremierPlan]::RamenerProcessus(${Number(enfant.pid)})`].join('\n');
    lancerPowerShell(script, 15000, () => {
      rappelEnCours = false;
    });
  };
  return { promesse, rappeler };
}

// Mac : « choose folder » (osascript), voir plateforme.selecteurDossierMac. Toute autre plateforme : null.
const SELECTEURS_DOSSIER = { win32: selecteurWindows, darwin: (titre) => plateforme.selecteurDossierMac(titre, { delai: DELAI_CHOIX_DOSSIER }) };

// Une seule fenêtre de choix à la fois : un appel pendant qu'elle est ouverte la ramène au premier plan
// et partage sa réponse (même promesse) au lieu d'en ouvrir une deuxième.
let fenetreDossier = null;

function choisirDossier(titre) {
  if (fenetreDossier) {
    fenetreDossier.rappeler();
    return fenetreDossier.promesse;
  }
  const selecteur = SELECTEURS_DOSSIER[process.platform];
  if (!selecteur) return Promise.resolve(null);
  const { promesse, rappeler } = selecteur(titre);
  const courante = { rappeler, promesse: promesse.finally(() => { if (fenetreDossier === courante) fenetreDossier = null; }) };
  fenetreDossier = courante;
  return courante.promesse;
}

// ---------------------------------------------------------------- visionneur de fichiers

const EXT_TEXTE = new Set(['.md', '.markdown', '.txt', '.json', '.csv', '.log', '.lua', '.luau', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.toml', '.yaml', '.yml', '.html', '.css', '.ini', '.cfg', '.xml', '.sh', '.bat', '.ps1', '.cs', '.cpp', '.h', '.gd', '.rs', '.go']);
const IGNORES = new Set(['node_modules', '.git', 'Binaries', 'Intermediate', 'Saved', 'DerivedDataCache', 'Library', 'Temp', '__pycache__', '.venv', 'venv', 'dist', 'build']);

// Lecture seule, et seulement dans tes dossiers (racines, étages, dossiers du QG) : jamais les réglages,
// les jetons ni le dossier runtime du QG.
function cheminLisible(brut, etageId) {
  const e = etageId ? trouverEtage(etageId) : null;
  const abs = path.resolve(e?.projet && !path.isAbsolute(brut) ? path.join(e.projet, brut) : brut);
  const permis = [...zones(), path.join(RACINE, 'dossiers'), path.join(RACINE, 'docs'), path.join(RACINE, 'README.md'), path.join(RACINE, 'LISEZ-MOI.md')];
  if (!sous(permis, abs)) throw new Error(t('ce fichier est hors de tes dossiers'));
  if (sous([path.join(RACINE, 'runtime'), path.join(RACINE, 'config'), path.join(RACINE, 'node_modules')], abs)) throw new Error(t('fichier interne du QG'));
  return abs;
}

function lireFichier(brut, etageId) {
  const abs = cheminLisible(brut, etageId);
  const ext = path.extname(abs).toLowerCase();
  if (!EXT_TEXTE.has(ext)) throw new Error(t("ce type de fichier ne s'affiche pas ici"));
  const st = fs.statSync(abs);
  if (!st.isFile()) throw new Error(t("ce n'est pas un fichier"));
  if (st.size > 3 * 1024 * 1024) throw new Error(t('fichier trop gros (3 Mo au plus)'));
  return { chemin: abs, nom: path.basename(abs), ext, taille: st.size, modifie: st.mtimeMs, contenu: fs.readFileSync(abs, 'utf8') };
}

// Les fichiers .md d'un étage, du plus récent au plus ancien (ce que les agents viennent d'écrire en tête).
function listerMarkdown(etageId) {
  const e = trouverEtage(etageId);
  if (!e?.projet) return [];
  const trouves = [];
  const parcourir = (dossier, profondeur) => {
    if (profondeur > 5 || trouves.length > 2000) return;
    let entrees = [];
    try {
      entrees = fs.readdirSync(dossier, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entrees) {
      if (ent.name.startsWith('.') && ent.name !== '.claude') continue;
      const p = path.join(dossier, ent.name);
      if (ent.isDirectory()) {
        if (!IGNORES.has(ent.name)) parcourir(p, profondeur + 1);
      } else if (/\.(md|markdown)$/i.test(ent.name)) {
        try {
          const st = fs.statSync(p);
          trouves.push({ chemin: p, relatif: path.relative(e.projet, p), taille: st.size, modifie: st.mtimeMs });
        } catch {
          /* disparu entre-temps */
        }
      }
    }
  };
  for (const d of e.dossiers || [e.projet]) parcourir(d, 0);
  return trouves.sort((a, b) => b.modifie - a.modifie).slice(0, 300);
}

// ---------------------------------------------------------------- routes

/** Renvoie true si la route a été traitée. ctx : { json, lireBrut, lireCorps, url, demo } */
export async function routesReglages(req, res, chemin, ctx) {
  const { json, url } = ctx;
  let m;
  const GET = req.method === 'GET';
  const POST = req.method === 'POST';

  // --- lectures
  if (GET && chemin === '/api/reglages') {
    return json(res, 200, { reglages: reglagesPublics(), ...comptesPublics(), etages: etagesPublics(), personnalisation: personnalisation(), typesProjet: Object.fromEntries(Object.entries(TYPES_PROJET).map(([k, v]) => [k, t(v)])) }), true;
  }
  if (GET && chemin === '/api/priorites') return json(res, 200, prioritesPubliques()), true;
  if (GET && chemin === '/api/projets') return json(res, 200, { projets: listerProjets({ racines: true }), racines: racines() }), true;
  if (GET && chemin === '/api/personnalisation') return json(res, 200, personnalisation()), true;
  if (GET && chemin === '/api/conso') return json(res, 200, consoPublique()), true;
  if (GET && (m = chemin.match(/^\/api\/conso\/(D\d+)$/))) return json(res, 200, { taches: consoTaches(m[1]) }), true;
  if (GET && chemin === '/api/bonheur/stock') return json(res, 200, stockComplet()), true;
  if (GET && chemin === '/api/bonheur/export') {
    const f = exporter(String(url.searchParams.get('format') || 'json'));
    res.writeHead(200, { 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${f.nom}"`, 'Cache-Control': 'no-store' });
    res.end(f.contenu);
    return true;
  }
  if (GET && (m = chemin.match(/^\/api\/etages\/([^/]+)\/fiche$/))) {
    const e = trouverEtage(decodeURIComponent(m[1]));
    return (e ? json(res, 200, { fiche: fiche(e) }) : json(res, 404, { erreur: t('étage inconnu') })), true;
  }
  if (GET && (m = chemin.match(/^\/api\/etages\/([^/]+)\/markdown$/))) return json(res, 200, { fichiers: listerMarkdown(decodeURIComponent(m[1])) }), true;
  if (GET && chemin === '/api/fichier') {
    try {
      return json(res, 200, lireFichier(String(url.searchParams.get('chemin') || ''), url.searchParams.get('etage'))), true;
    } catch (e) {
      return json(res, 404, { erreur: e.message }), true;
    }
  }
  if (!POST) return false;

  // --- import du happiness manager : corps brut (fichier), pas du JSON
  if (chemin === '/api/bonheur/import') {
    const brut = await ctx.lireBrut(req, 30 * 1024 * 1024);
    try {
      const donnees = analyserImport(brut, String(url.searchParams.get('nom') || ''));
      const r = importerStock(donnees, url.searchParams.get('mode') === 'remplacer' ? 'remplacer' : 'fusion');
      return json(res, 200, r), true;
    } catch (e) {
      return json(res, 400, { erreur: t('fichier illisible : {raison}', { raison: e.message }) }), true;
    }
  }

  const routes = /^\/api\/(reglages|racines|choisir-dossier|comptes|personnalisation|equipe\/renommer|bonheur\/stock|conso\/limites|dictee\/installer|codex\/installer|onboarding\/terminer|etages\/[^/]+\/(modifier|retirer))/;
  if (!routes.test(chemin)) return false;
  const corps = await ctx.lireCorps(req, chemin === '/api/bonheur/stock' ? 30 * 1024 * 1024 : 256 * 1024);
  try {
    if (chemin === '/api/reglages') {
      const patch = {};
      const LANGUES = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'pl'];
      if (LANGUES.includes(corps.langueInterface)) patch.langueInterface = corps.langueInterface;
      if (LANGUES.includes(corps.langueIA)) patch.langueIA = corps.langueIA;
      if (typeof corps.utilisateur === 'string') patch.utilisateur = corps.utilisateur.trim().slice(0, 40);
      if (['auto', 'prudent'].includes(corps.modeTravail)) patch.modeTravail = corps.modeTravail;
      for (const k of ['plafondGlobal', 'plafondEtage']) if (Number.isInteger(corps[k]) && corps[k] >= 0 && corps[k] <= 64) patch[k] = corps[k];
      for (const k of ['recolteAuto', 'rojoPortsAuto', 'gitAuto', 'miseAJourAuto', 'validationUtilisateur', 'ouvrirEnApp', 'entreeEnvoie', 'ecritureHorsProjet', 'traduireReflexion', 'filtreTests']) if (typeof corps[k] === 'boolean') patch[k] = corps[k];
      if (corps.travail && typeof corps.travail === 'object') patch.travail = travailReglages({ travail: corps.travail }); // réglage Coût (lot B)
      if (corps.gardeFable && typeof corps.gardeFable === 'object') {
        const g = {};
        if (typeof corps.gardeFable.actif === 'boolean') g.actif = corps.gardeFable.actif;
        if (Number.isFinite(corps.gardeFable.resteMin) && corps.gardeFable.resteMin >= 0 && corps.gardeFable.resteMin <= 100) g.resteMin = Math.round(corps.gardeFable.resteMin);
        patch.gardeFable = g;
      }
      if (corps.miniJeu && typeof corps.miniJeu === 'object') {
        const mj = corps.miniJeu;
        const p = {};
        for (const k of ['actif', 'ecoute', 'bavardages']) if (typeof mj[k] === 'boolean') p[k] = mj[k];
        // 0 : en direct ; 0,5 : toutes les 30 s ; sinon des minutes
        if (mj.bavardagesMinutes === 0 || mj.bavardagesMinutes === 0.5) p.bavardagesMinutes = mj.bavardagesMinutes;
        else if (Number.isFinite(mj.bavardagesMinutes) && mj.bavardagesMinutes >= 1 && mj.bavardagesMinutes <= 240) p.bavardagesMinutes = Math.round(mj.bavardagesMinutes);
        for (const k of ['modeleDiscussion', 'modeleBavardage']) if (['haiku', 'sonnet', 'opus'].includes(mj[k])) p[k] = mj[k];
        patch.miniJeu = p;
      }
      if (typeof corps.dureeBulles === 'number' && corps.dureeBulles >= 0.5 && corps.dureeBulles <= 5) patch.dureeBulles = corps.dureeBulles;
      // compte qui exécute les tâches des nouvelles demandes : un compte existant, ou null (celui du DG)
      if (corps.compteAgents === null || corps.compteAgents === '') patch.compteAgents = null;
      else if (typeof corps.compteAgents === 'string') {
        const c = trouverCompte(corps.compteAgents);
        if (!c || c.id !== corps.compteAgents) throw new Error(t('compte inconnu'));
        patch.compteAgents = c.id;
      }
      if (corps.codex && typeof corps.codex === 'object') {
        patch.codex = {};
        if (typeof corps.codex.lectureStricte === 'boolean') patch.codex.lectureStricte = corps.codex.lectureStricte;
        if (Number.isInteger(corps.codex.sessionsParCompte) && corps.codex.sessionsParCompte >= 1 && corps.codex.sessionsParCompte <= 8) patch.codex.sessionsParCompte = corps.codex.sessionsParCompte;
      }
      if (corps.dg && typeof corps.dg === 'object') {
        patch.dg = {};
        if (typeof corps.dg.modele === 'string' && corps.dg.modele) patch.dg.modele = corps.dg.modele.slice(0, 60);
        if (['low', 'medium', 'high', 'xhigh', 'max'].includes(corps.dg.effort)) patch.dg.effort = corps.dg.effort;
      }
      const langueAvant = reglagesPublics().langueIA;
      if (patch.travail) modifierReglages({ travail: { personnalise: null } }); // la personnalisation est remplacée, pas fusionnée
      modifierReglages(patch);
      if (patch.langueIA && patch.langueIA !== langueAvant) langueChangee();
      // plus de validation par toi : ce qui attendait ta validation passe à un vérificateur IA
      if (patch.validationUtilisateur === false) confierValidationsEnAttente();
      publierReglages();
      if (patch.miniJeu) emettre('mini_jeu', miniJeuPublic());
      return json(res, 200, reglagesPublics()), true;
    }
    if (chemin === '/api/racines') {
      const liste = [...new Set((corps.racines || []).map((r) => path.resolve(String(r).trim())).filter(Boolean))];
      for (const r of liste) {
        if (!fs.existsSync(r) || !fs.statSync(r).isDirectory()) throw new Error(t('dossier introuvable : {dossier}', { dossier: r }));
        if (path.parse(r).root === r) throw new Error(t('choisis un dossier, pas un lecteur entier ({dossier})', { dossier: r }));
        if (sous([r], RACINE) && path.resolve(r) === path.resolve(RACINE)) throw new Error(t('le dossier du QG lui-même ne peut pas être une racine'));
      }
      modifierReglages({ racines: liste });
      publierReglages();
      publierEtages();
      return json(res, 200, { racines: liste, projets: listerProjets({ racines: true }) }), true;
    }
    if (chemin === '/api/choisir-dossier') return json(res, 200, { chemin: await choisirDossier(corps.titre || t('Choisis un dossier')) }), true;

    // --- comptes
    // { fournisseur: 'claude' | 'codex' | 'acp', nom, cleApi?, partage? (Claude : dossier ~/.claude), mode?: 'navigateur' | 'code',
    //   agent? (ACP : grok, cursor… ou 'personnalise'), commande? et varCle? (agent ACP personnalisé) }
    if (chemin === '/api/comptes/ajouter') {
      const fournisseur = typeof corps.fournisseur === 'string' && corps.fournisseur ? corps.fournisseur : 'claude';
      const partage = fournisseur === 'claude' && corps.partage;
      const c = ajouterCompte({ nom: corps.nom, fournisseur, configDir: partage ? path.join(os.homedir(), '.claude') : null, cleApi: corps.cleApi || null, agent: typeof corps.agent === 'string' ? corps.agent : null, commande: corps.commande ?? null, varCle: typeof corps.varCle === 'string' ? corps.varCle : null });
      let connexion = false;
      if (!compteConnecte(c)) {
        try {
          ouvrirConnexion(c.id, { mode: corps.mode === 'code' ? 'code' : 'navigateur' });
          surveillerConnexion(c.id);
          connexion = true;
        } catch (e) {
          // compte ajouté mais connexion impossible tout de suite (binaire absent, autre connexion en cours)
          publierComptes();
          return json(res, 200, { compte: c, connexion: false, avertissement: e.message }), true;
        }
      } else {
        decouvrir(c.id).then(() => emettre('mcp', { mcp: mcpPublic(), modeles: modelesPublics() }), () => null).finally(publierComptes);
      }
      publierComptes();
      return json(res, 200, { compte: c, connexion }), true;
    }
    if ((m = chemin.match(/^\/api\/comptes\/([a-z0-9_-]+)\/(connecter|deconnecter|modifier|supprimer|limites)$/))) {
      const id = m[1];
      if (m[2] === 'connecter') {
        ouvrirConnexion(id, { mode: corps.mode === 'code' ? 'code' : 'navigateur' });
        surveillerConnexion(id);
      } else if (m[2] === 'deconnecter') await deconnecter(id);
      else if (m[2] === 'modifier') modifierCompte(id, { nom: corps.nom, defaut: !!corps.defaut });
      else if (m[2] === 'supprimer') supprimerCompte(id);
      else await lireLimites(id);
      publierComptes();
      emettre('conso', { conso: consoPublique() });
      return json(res, 200, comptesPublics()), true;
    }

    // --- étages
    if ((m = chemin.match(/^\/api\/etages\/([^/]+)\/(modifier|retirer)$/))) {
      const id = decodeURIComponent(m[1]);
      const e = m[2] === 'retirer' ? retirerEtage(id) : modifierEtage(id, { nom: corps.nom, actif: corps.actif, fiche: corps.fiche, dossiers: corps.dossiers });
      return json(res, 200, { etage: e, etages: etagesPublics() }), true;
    }

    // --- équipe, happiness manager, consommation
    if (chemin === '/api/personnalisation') return json(res, 200, modifierPersonnalisation(corps)), true;
    if (chemin === '/api/equipe/renommer') {
      const ancien = String(corps.ancien || '');
      const r = renommerPersonnage(ancien, corps.nouveau);
      // le personnage garde sa personnalité et sa mémoire du mini-jeu sous son nouveau nom
      if (!ancien.startsWith('@')) renommerMemoire(ancien, String(corps.nouveau || '').replace(/s+/g, ' ').trim().slice(0, 24));
      return json(res, 200, r), true;
    }
    if (chemin === '/api/bonheur/stock') return json(res, 200, remplacerStock(corps)), true;
    // Réglages › Priorités : un champ à la fois, ou un préréglage proposé selon les comptes présents
    if (chemin === '/api/priorites') {
      if (corps.prereglage) {
        const p = prereglages().find((x) => x.id === corps.prereglage);
        if (!p) return json(res, 400, { erreur: t('préréglage inconnu') }), true;
        modifierPriorites(p.patch);
      } else modifierPriorites(corps);
      const r = prioritesPubliques();
      emettre('priorites', r);
      return json(res, 200, r), true;
    }
    if (chemin === '/api/conso/limites') {
      await Promise.all(comptesPublics().comptes.filter((c) => c.connecte).map((c) => lireLimites(c.id).catch(() => null)));
      return json(res, 200, consoPublique()), true;
    }

    // --- dictée : installation dans une fenêtre à part (téléchargements visibles)
    if (chemin === '/api/dictee/installer') {
      // Windows seulement (Whisper avec CUDA ou CPU) ; sur Mac, la dictée du système prend le relais.
      if (!plateforme.infos().dicteeLocale) throw new Error(t('La dictée locale n’est pas encore disponible sur Mac : utilise la dictée de macOS (touche micro, ou fn deux fois) dans la zone de saisie.'));
      const bat = path.join(RACINE, 'installer-dictee.bat');
      if (!fs.existsSync(bat)) throw new Error(t('installer-dictee.bat introuvable'));
      plateforme.ouvrirTerminal('Dictee', [bat]);
      return json(res, 200, { ok: true }), true;
    }

    // --- Codex : installation à la demande (version épinglée, dans runtime/codex), suivie dans le site
    if (chemin === '/api/codex/installer') {
      const avant = etatInstallationCodex();
      if (avant.etat !== 'installation' && !(avant.present && !corps.reinstaller)) {
        installerCodex({ surEtat: (e) => emettre('codex-installation', e) }).then(publierComptes, publierComptes);
      }
      return json(res, 200, etatInstallationCodex()), true;
    }

    // --- fin de la configuration du premier lancement
    if (chemin === '/api/onboarding/terminer') {
      marquerSignales(listerProjets().map((p) => p.dossier));
      modifierReglages({ onboarding: true });
      publierReglages();
      return json(res, 200, reglagesPublics()), true;
    }
  } catch (e) {
    return json(res, 409, { erreur: e.message }), true;
  }
  return false;
}

// Ajout d'étages en lot (configuration du premier lancement) : [{ dossier, nom }] ou [{ dossiers: [...], nom, type }].
// Priorités enregistrées, préréglages selon les comptes présents, aperçu de qui ferait quoi maintenant.
export function prioritesPubliques() {
  return { priorites: chargerPriorites(), prereglages: prereglages().map(({ id, libelle }) => ({ id, libelle })), apercu: apercu(), pauses: pausesComptes(), natures: NATURES, types: TYPES_TACHE };
}

export function ajouterEtages(liste) {
  const faits = [];
  const erreurs = [];
  for (const p of liste || []) {
    const dossiers = Array.isArray(p.dossiers) && p.dossiers.length ? p.dossiers.map(String) : [String(p.dossier || '')];
    try {
      faits.push(ajouterEtage(dossiers.length > 1 ? dossiers : dossiers[0], { nom: p.nom, type: p.type || null }));
    } catch (e) {
      erreurs.push(`${dossiers.join(' + ')} : ${e.message}`);
    }
  }
  return { faits, erreurs };
}

export { ignorerProjet };
