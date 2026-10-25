// Routes des réglages : comptes Claude, dossiers racines, étages, équipe (prénoms, skins), happiness
// manager (édition, import, export), consommation, visionneur de fichiers et premier lancement.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RACINE, modifierReglages, racines, sous, etage as trouverEtage, fiche } from './config.js';
import { emettre, comptesPublics, reglagesPublics, etagesPublics, modelesPublics, mcpPublic } from './bus.js';
import { ajouterCompte, modifierCompte, supprimerCompte, ouvrirConnexion, deconnecter, trouverCompte, compteConnecte, dossierConfig } from './comptes.js';
import { listerProjets, ajouterEtage, modifierEtage, retirerEtage, ignorerProjet, marquerSignales, TYPES as TYPES_PROJET } from './detection.js';
import { personnalisation, modifierPersonnalisation } from './equipe.js';
import { stockComplet, remplacerStock, importerStock, analyserImport, exporter, langueChangee } from './bonheur.js';
import { consoPublique, consoTaches, lireLimites } from './conso.js';
import { decouvrir } from './decouverte.js';
import { zones } from './permissions.js';
import { t } from './i18n.js';

const publierComptes = () => emettre('comptes', comptesPublics());
const publierReglages = () => emettre('reglages', { reglages: reglagesPublics() });
const publierEtages = () => emettre('etages', { etages: etagesPublics() });

// ---------------------------------------------------------------- connexion des comptes

const surveillances = new Map();
const mtimeIdentifiants = (c) => {
  try {
    return fs.statSync(path.join(dossierConfig(c), '.credentials.json')).mtimeMs;
  } catch {
    return 0;
  }
};

// Après l'ouverture de la fenêtre de connexion : dès que les identifiants changent, on prévient le site
// et on lit (sans tokens) les modèles, connecteurs et limites du compte.
function surveillerConnexion(id) {
  if (surveillances.has(id)) return;
  const debut = Date.now();
  const avant = mtimeIdentifiants(trouverCompte(id));
  const minuterie = setInterval(async () => {
    const c = trouverCompte(id);
    if (!c || c.id !== id || Date.now() - debut > 15 * 60 * 1000) {
      clearInterval(minuterie);
      surveillances.delete(id);
      return;
    }
    if (mtimeIdentifiants(c) <= avant || !compteConnecte(c)) return;
    clearInterval(minuterie);
    surveillances.delete(id);
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

function choisirDossier(titre) {
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    '$f = New-Object System.Windows.Forms.FolderBrowserDialog',
    `$f.Description = '${String(titre).replace(/'/g, "''").slice(0, 120)}'`,
    '$f.ShowNewFolderButton = $true',
    '$o = New-Object System.Windows.Forms.Form',
    '$o.TopMost = $true',
    'if ($f.ShowDialog($o) -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath }',
  ].join('; ');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { timeout: 10 * 60 * 1000, windowsHide: true, encoding: 'utf8' }, (err, sortie) =>
      resolve(err ? null : String(sortie).trim() || null),
    );
  });
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
  if (GET && chemin === '/api/projets') return json(res, 200, { projets: listerProjets(), racines: racines() }), true;
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

  const routes = /^\/api\/(reglages|racines|choisir-dossier|comptes|personnalisation|bonheur\/stock|conso\/limites|dictee\/installer|onboarding\/terminer|etages\/[^/]+\/(modifier|retirer))/;
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
      for (const k of ['recolteAuto', 'rojoPortsAuto']) if (typeof corps[k] === 'boolean') patch[k] = corps[k];
      if (corps.dg && typeof corps.dg === 'object') {
        patch.dg = {};
        if (typeof corps.dg.modele === 'string' && corps.dg.modele) patch.dg.modele = corps.dg.modele.slice(0, 60);
        if (['low', 'medium', 'high', 'xhigh', 'max'].includes(corps.dg.effort)) patch.dg.effort = corps.dg.effort;
      }
      const langueAvant = reglagesPublics().langueIA;
      modifierReglages(patch);
      if (patch.langueIA && patch.langueIA !== langueAvant) langueChangee();
      publierReglages();
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
      return json(res, 200, { racines: liste, projets: listerProjets() }), true;
    }
    if (chemin === '/api/choisir-dossier') return json(res, 200, { chemin: await choisirDossier(corps.titre || t('Choisis un dossier')) }), true;

    // --- comptes
    if (chemin === '/api/comptes/ajouter') {
      const c = ajouterCompte({ nom: corps.nom, configDir: corps.partage ? path.join(process.env.USERPROFILE || '', '.claude') : null, cleApi: corps.cleApi || null });
      if (!compteConnecte(c)) {
        ouvrirConnexion(c.id);
        surveillerConnexion(c.id);
      } else {
        decouvrir(c.id).then(() => emettre('mcp', { mcp: mcpPublic(), modeles: modelesPublics() }), () => null).finally(publierComptes);
      }
      publierComptes();
      return json(res, 200, { compte: c }), true;
    }
    if ((m = chemin.match(/^\/api\/comptes\/([a-z0-9_-]+)\/(connecter|deconnecter|modifier|supprimer|limites)$/))) {
      const id = m[1];
      if (m[2] === 'connecter') {
        ouvrirConnexion(id);
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
      const e = m[2] === 'retirer' ? retirerEtage(id) : modifierEtage(id, { nom: corps.nom, actif: corps.actif, fiche: corps.fiche });
      return json(res, 200, { etage: e, etages: etagesPublics() }), true;
    }

    // --- équipe, happiness manager, consommation
    if (chemin === '/api/personnalisation') return json(res, 200, modifierPersonnalisation(corps)), true;
    if (chemin === '/api/bonheur/stock') return json(res, 200, remplacerStock(corps)), true;
    if (chemin === '/api/conso/limites') {
      await Promise.all(comptesPublics().comptes.filter((c) => c.connecte).map((c) => lireLimites(c.id).catch(() => null)));
      return json(res, 200, consoPublique()), true;
    }

    // --- dictée : installation dans une fenêtre à part (téléchargements visibles)
    if (chemin === '/api/dictee/installer') {
      const bat = path.join(RACINE, 'installer-dictee.bat');
      if (!fs.existsSync(bat)) throw new Error(t('installer-dictee.bat introuvable'));
      spawn('cmd.exe', ['/d', '/c', `start "Dictee" "${bat}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
      return json(res, 200, { ok: true }), true;
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

// Ajout d'étages en lot (configuration du premier lancement) : [{ dossier, nom }].
export function ajouterEtages(liste) {
  const faits = [];
  const erreurs = [];
  for (const p of liste || []) {
    try {
      faits.push(ajouterEtage(String(p.dossier), { nom: p.nom }));
    } catch (e) {
      erreurs.push(`${p.dossier} : ${e.message}`);
    }
  }
  return { faits, erreurs };
}

export { ignorerProjet };
