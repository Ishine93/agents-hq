// Estimation du coût d'un plan avant son lancement (lot C1 de la 1.0.6) et calibrage du rapport
// « $ ou jetons → points de la fenêtre de 5 h » de chaque compte (C2).
//
// Par tâche : moyenne des coûts réels des tâches passées de même nature, même niveau de modèle et même mode
// de vérification (ramenés à un effort medium), sinon la table config/defauts/estimations.json ; puis × le
// facteur d'effort et × 1,25 si la vérification est faite par un agent. Plan = Σ des tâches + DG.
// Unité : le $ (équivalent API) quand le compte le donne (Claude, agents ACP qui le donnent), sinon les jetons
// (Codex), sinon « non estimable pour ce compte ». Le % de la fenêtre n'est donné que là où les limites sont
// lisibles et le rapport connu. Une estimation absente ne bloque jamais un lancement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGLAGES } from './config.js';
import { etat as bus } from './bus.js';
import { donneesConso, enregistrerCalibrage, surLimitesLues } from './conso.js';
import { trouverCompte, fournisseur as fournisseurDuCompte } from './comptes.js';
import { niveauDe } from './ia/fournisseurs.js';
import { reglageDg } from './routeur.js';
import { t as tr } from './i18n.js';

const FICHIER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'defauts', 'estimations.json');
let cache = null;
export function tableEstimations() {
  if (!cache) {
    try {
      cache = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
    } catch {
      cache = {};
    }
  }
  return cache;
}

const facteurEffort = (effort, tb) => tb.facteursEffort?.[effort] ?? 1;
const facteurVerif = (mode, tb) => (mode === 'agent' ? (tb.facteurVerifAgent ?? 1.25) : 1);
export const jetonsDe = (c) => (c?.entree || 0) + (c?.sortie || 0) + (c?.cacheLu || 0) + (c?.cacheEcrit || 0);
const valeurDe = (c, unite) => (unite === 'usd' ? c?.cout || 0 : jetonsDe(c));

// Compte résolu (null = compte par défaut) et son fournisseur.
const idCompte = (id) => trouverCompte(id)?.id || id || null;
const fournisseurDe = (id) => fournisseurDuCompte(trouverCompte(id));

// ---------------------------------------------------------------- historique

/** Tâches terminées (done) dont la consommation est connue : la base des estimations. */
export function echantillons({ taches = bus.taches, conso = donneesConso() } = {}) {
  const out = [];
  const depuis = conso.coutsFiablesDepuis || 0; // 1.0.11 : les coûts en $ d'avant comptaient des reprises deux fois
  for (const t of taches.values()) {
    if (t.etat !== 'done') continue;
    const c = conso.taches?.[t.id];
    if (!c) continue;
    out.push({
      nature: t.nature,
      niveau: niveauDe(t.modeleReel || t.modele),
      verif: t.verif?.mode || 'self',
      effort: t.effortReel || t.effort,
      fournisseur: t.fournisseur || 'claude',
      usd: (t.fin || 0) >= depuis ? c.cout || 0 : 0,
      jetons: jetonsDe(c),
      fin: t.fin || 0,
    });
  }
  return out.sort((a, b) => a.fin - b.fin);
}

/** Unité d'estimation d'un fournisseur : 'usd', 'jetons' ou null (non estimable pour ce compte). */
export function uniteDe(fournisseur, ech = []) {
  if (fournisseur === 'claude') return 'usd';
  const siens = ech.filter((e) => e.fournisseur === fournisseur);
  if (siens.some((e) => e.usd > 0)) return 'usd'; // agent ACP qui donne son coût
  // Codex : capacites().cout dit « equivalent-api » sans clé, mais l'adaptateur n'enregistre que des jetons.
  if (fournisseur === 'codex') return 'jetons';
  if (siens.some((e) => e.jetons > 0)) return 'jetons';
  return null;
}

function baseTable(nature, niveau, unite, tb) {
  const t = unite === 'usd' ? tb.usd : tb.jetons;
  if (!t?.natures) return null;
  const vals = Object.values(t.natures);
  const n = t.natures[nature] ?? vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
  return unite === 'usd' ? n * (t.niveaux?.[niveau] ?? 1) : n;
}

/**
 * Coût estimé d'une tâche { nature, modele, effort, verif } dans l'unité donnée.
 * @returns {{ valeur, source: 'historique'|'historique-proche'|'table', echantillons }|null}
 */
export function estimerTache(desc, { unite = 'usd', fournisseur = null, echantillons: ech = [], table: tb = tableEstimations() } = {}) {
  if (!unite) return null;
  const niveau = niveauDe(desc.modele);
  const verif = desc.verif || 'self';
  const min = tb.historique?.minEchantillons ?? 2;
  const max = tb.historique?.maxEchantillons ?? 20;
  const val = (e) => (unite === 'usd' ? e.usd : e.jetons);
  const base = (e) => val(e) / facteurEffort(e.effort, tb) / facteurVerif(e.verif, tb);
  const comparables = ech.filter((e) => (!fournisseur || e.fournisseur === fournisseur) && val(e) > 0 && e.nature === desc.nature && e.niveau === niveau);
  let liste = comparables.filter((e) => e.verif === verif).slice(-max);
  let source = 'historique';
  if (liste.length < min) {
    liste = comparables.slice(-max);
    source = 'historique-proche';
  }
  let b;
  if (liste.length >= min) b = liste.reduce((s, e) => s + base(e), 0) / liste.length;
  else {
    source = 'table';
    liste = [];
    b = baseTable(desc.nature, niveau, unite, tb);
  }
  if (!(b > 0)) return null;
  return { valeur: b * facteurEffort(desc.effort, tb) * facteurVerif(verif, tb), source, echantillons: liste.length };
}

/** Part du DG : moyenne (coût du dossier − ses tâches) des dossiers terminés du même fournisseur, sinon la table. */
export function estimerDg(d, { unite, fournisseur, conso = donneesConso(), table: tb = tableEstimations(), dossiers = bus.dossiers, taches = bus.taches } = {}) {
  if (!unite) return null;
  const niveaux = tb.usd?.niveaux || {};
  const niv = (m) => niveaux[niveauDe(m || reglageDg().modele)] ?? 1;
  const min = tb.historique?.minEchantillons ?? 2;
  const valeurs = [];
  const parDossier = new Map();
  for (const t of taches.values()) {
    if (!parDossier.has(t.dossier)) parDossier.set(t.dossier, []);
    parDossier.get(t.dossier).push(t);
  }
  const depuis = unite === 'usd' ? conso.coutsFiablesDepuis || 0 : 0; // 1.0.11 : $ d'avant faussés par les reprises
  for (const od of dossiers.values()) {
    if (od.id === d.id || od.etat !== 'termine' || (od.creeLe || 0) < depuis) continue;
    const cd = conso.dossiers?.[od.id];
    if (!cd || fournisseurDe(od.compte) !== fournisseur) continue;
    const siennes = parDossier.get(od.id) || [];
    // tâche terminée sans conso (vieille entrée effacée) : la part du DG serait faussée
    if (siennes.some((t) => t.etat === 'done' && !conso.taches?.[t.id])) continue;
    let reste = valeurDe(cd, unite);
    for (const t of siennes) reste -= valeurDe(conso.taches?.[t.id], unite);
    if (reste > 0) valeurs.push({ v: unite === 'usd' ? reste / niv(od.dg?.modele) : reste, quand: od.creeLe || 0 });
  }
  valeurs.sort((a, b) => a.quand - b.quand);
  const recents = valeurs.slice(-(tb.historique?.maxEchantillons ?? 20));
  const facteur = unite === 'usd' ? niv(d.dg?.modele) : 1;
  if (recents.length >= min) return { valeur: (recents.reduce((s, x) => s + x.v, 0) / recents.length) * facteur, source: 'historique' };
  const base = unite === 'usd' ? tb.usd?.dg : tb.jetons?.dg;
  return base > 0 ? { valeur: base * facteur, source: 'table' } : null;
}

// ---------------------------------------------------------------- fenêtre et rapport

/** Fenêtre courte (5 h) d'une lecture des limites : five_hour (Claude), sinon la fenêtre Codex de 5 h ou primary. */
export function fenetreCourte(l, now = Date.now()) {
  const f = l?.fenetres || {};
  const cle = f.five_hour
    ? 'five_hour'
    : Object.keys(f).find((k) => k.startsWith('codex:') && f[k]?.nom === '5 h') || (f['codex:primary'] ? 'codex:primary' : null);
  const x = cle && f[cle];
  if (!x || x.utilisation == null) return null;
  const passee = x.reinit && x.reinit <= now; // remise à zéro passée depuis la lecture
  return { cle, nom: cle === 'five_hour' ? '5 h' : x.nom || '5 h', utilisation: passee ? 0 : x.utilisation, reinit: passee ? null : x.reinit || null };
}

/**
 * Poids d'un niveau de modèle dans la fenêtre de 5 h, pour un même $ (1.0.11). Mesuré : un $ de Fable remplit la
 * fenêtre environ deux fois plus vite qu'un $ d'Opus. Le rapport « $ → % de la fenêtre » appris (C2) vaut pour les autres.
 */
export const poidsFenetre = (niveau, tb = tableEstimations()) => tb.poidsFenetre?.[niveau] ?? 1;

/** Combien de fois plus vite une tâche Fable remplit la fenêtre que la même tâche sur Opus (prix × poids). */
export function rapportFableOpus(tb = tableEstimations()) {
  const n = tb.usd?.niveaux || {};
  return ((n.max ?? 3) / (n.fort ?? 1)) * (poidsFenetre('max', tb) / poidsFenetre('fort', tb));
}
const estFable = (modele) => /fable/i.test(String(modele || ''));

/** Points de fenêtre par unité ($ ou jeton) : appris (C2), sinon la valeur de départ du forfait ($ seulement). */
export function rapportDe(cal, unite, abonnement, tb = tableEstimations()) {
  const cfg = tb.calibrage || {};
  const champ = unite === 'usd' ? 'dc' : 'dj';
  const l = (cal?.intervalles || []).filter((i) => i[champ] > 0);
  if (l.length >= (cfg.minIntervalles ?? 3)) {
    const du = l.reduce((s, i) => s + i.du, 0);
    const dx = l.reduce((s, i) => s + i[champ], 0);
    if (dx >= (unite === 'usd' ? (cfg.minUsd ?? 1) : (cfg.minJetons ?? 1e6))) return { rapport: du / dx, calibre: true, intervalles: l.length };
  }
  const depart = unite === 'usd' ? tb.pointsParDollar?.[String(abonnement || '').toLowerCase()] : null;
  return depart > 0 ? { rapport: depart, calibre: false, intervalles: l.length } : null;
}

// ---------------------------------------------------------------- plan

const arrondi = (v, unite) => (v == null || !Number.isFinite(v) ? null : unite === 'usd' ? Math.round(v * 100) / 100 : Math.round(v / 1000) * 1000);
const pct1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);

/**
 * Estimation d'un plan : `taches` = [{ ref, nature, modele, effort, verif: { mode } }].
 * opts.limites : lecture des limites du compte des agents (sinon celle gardée par conso.js).
 * opts.routeDe(t) : { compte, modele, effort } de la tâche selon le routeur. Une tâche sur un compte d'une autre
 * unité va dans `autres` (hors total) ; sur un compte non estimable, dans `nonEstimables`. Le % de la fenêtre ne
 * compte que les tâches du compte des agents.
 */
export function estimerDossier(d, taches, opts = {}) {
  const tb = opts.table || tableEstimations();
  const conso = opts.conso || donneesConso();
  const now = opts.now ?? Date.now();
  const ech = opts.echantillons || echantillons({ conso });
  // opts.compte : compte des agents vu par l'ordonnanceur (routes des tâches), sinon celui de la demande
  const compte = idCompte(opts.compte || d.compteAgents || d.compte);
  const compteDg = idCompte(d.compte);
  const fournisseur = opts.fournisseur || fournisseurDe(compte);
  const fournisseurDg = opts.fournisseurDg || fournisseurDe(compteDg);
  const unite = uniteDe(fournisseur, ech);
  const est = { unite, compte, fournisseur, estimable: !!unite, total: null, taches: null, dg: null, parTache: {}, autres: {}, nonEstimables: [], sources: [], fenetre: null, utilisation: null, reste: null, pct: null, pctDuReste: null, calibre: false, le: now };
  if (!unite) return est;
  let somme = 0;
  let charge = 0; // tâches sur le compte des agents : elles seules comptent dans le % de sa fenêtre
  // part de Fable (1.0.11) : ses tâches, leur coût, et ce qu'elles coûteraient sur Opus
  const fable = { refs: [], valeur: 0, charge: 0, chargeOpus: 0 };
  const versOpus = (tb.usd?.niveaux?.fort ?? 1) / (tb.usd?.niveaux?.max ?? 3);
  const sources = new Set();
  for (const t of taches) {
    // opts.routeDe(t) : compte, modèle et effort que le routeur donne à la tâche (sinon ceux du plan)
    const r = opts.routeDe?.(t) || null;
    const cT = r?.compte ? idCompte(r.compte) : compte;
    const fT = cT === compte ? fournisseur : fournisseurDe(cT);
    const uT = cT === compte ? unite : uniteDe(fT, ech);
    if (!uT) {
      est.nonEstimables.push(t.ref); // agent qui ne donne ni coût ni jetons
      continue;
    }
    const e = estimerTache({ nature: t.nature, modele: r?.modele || t.modele, effort: r?.effort || t.effort, verif: t.verif?.mode }, { unite: uT, fournisseur: fT, echantillons: ech, table: tb });
    if (!e) continue;
    sources.add(e.source);
    if (uT !== unite) {
      est.autres[t.ref] = { unite: uT, valeur: e.valeur, compte: cT }; // autre unité : hors du total
      continue;
    }
    est.parTache[t.ref] = e.valeur;
    somme += e.valeur;
    const modele = r?.modele || t.modele;
    if (cT === compte) charge += e.valeur * poidsFenetre(niveauDe(modele), tb);
    if (estFable(modele) && uT === 'usd') {
      fable.refs.push(t.ref);
      fable.valeur += e.valeur;
      if (cT === compte) {
        fable.charge += e.valeur * poidsFenetre('max', tb);
        fable.chargeOpus += e.valeur * versOpus * poidsFenetre('fort', tb);
      }
    }
  }
  if (fable.refs.length) est.fable = { refs: fable.refs, valeur: fable.valeur, opus: fable.valeur * versOpus, pct: null, pctOpus: null };
  // Le DG compte dans le total s'il s'exprime dans la même unité, et dans le % s'il tourne sur le même compte.
  const dg = uniteDe(fournisseurDg, ech) === unite ? estimerDg(d, { unite, fournisseur: fournisseurDg, conso, table: tb, dossiers: opts.dossiers, taches: opts.taches }) : null;
  est.taches = somme;
  est.dg = dg?.valeur ?? null;
  est.total = somme + (est.dg || 0);
  if (dg) sources.add(dg.source === 'table' ? 'table-dg' : 'historique-dg');
  est.sources = [...sources];
  const l = opts.limites !== undefined ? opts.limites : conso.limites?.[compte];
  const f = fenetreCourte(l, now);
  const r = f ? rapportDe(conso.calibrage?.[compte], unite, l?.abonnement, tb) : null;
  if (f && r) {
    charge += compteDg === compte ? est.dg || 0 : 0;
    est.fenetre = f.nom;
    est.utilisation = f.utilisation;
    est.reste = Math.max(0, 100 - f.utilisation);
    est.pct = charge * r.rapport;
    est.pctDuReste = est.reste > 0 ? (est.pct / est.reste) * 100 : Infinity;
    est.calibre = r.calibre;
    est.rapport = r.rapport;
    // au-delà de ce qui reste : combien de remises à zéro attendre, et l'heure de la dernière (1.0.11)
    const att = attentesFenetre(est.pct, est.reste, f.reinit, now);
    est.attentes = att.attentes;
    est.reprise = att.reprise;
    if (est.fable) {
      est.fable.pct = fable.charge * r.rapport;
      est.fable.pctOpus = fable.chargeOpus * r.rapport;
    }
  }
  return est;
}

/** Version arrondie, pour state.json, conso.json et le site (Infinity → plein). */
export function resumePublic(est) {
  if (!est) return null;
  const u = est.unite;
  return {
    unite: u,
    estimable: est.estimable,
    total: arrondi(est.total, u),
    taches: arrondi(est.taches, u),
    dg: arrondi(est.dg, u),
    parTache: Object.fromEntries(Object.entries(est.parTache || {}).map(([k, v]) => [k, arrondi(v, u)])),
    // tâches routées sur un compte d'une autre unité (estimées à part) ou qui ne s'estime pas
    autres: Object.fromEntries(Object.entries(est.autres || {}).map(([k, a]) => [k, { unite: a.unite, valeur: arrondi(a.valeur, a.unite), compte: a.compte }])),
    nonEstimables: est.nonEstimables || [],
    sources: est.sources || [],
    compte: est.compte,
    fournisseur: est.fournisseur,
    fenetre: est.fenetre,
    utilisation: pct1(est.utilisation),
    reste: pct1(est.reste),
    pct: pct1(est.pct),
    pctDuReste: est.pctDuReste === Infinity ? null : pct1(est.pctDuReste),
    plein: est.pctDuReste === Infinity,
    calibre: !!est.calibre,
    attentes: est.attentes || 0,
    reprise: est.reprise || null,
    // part de Fable (1.0.11) : ses tâches, leur coût, le même travail sur Opus, et leur part de la fenêtre
    fable: est.fable ? { refs: est.fable.refs, valeur: arrondi(est.fable.valeur, u), opus: arrondi(est.fable.opus, u), pct: pct1(est.fable.pct), pctOpus: pct1(est.fable.pctOpus) } : null,
    le: est.le,
  };
}

const nombre = (v, dec = 0) => {
  const fr = REGLAGES.langueInterface !== 'en';
  return Number(v).toLocaleString(fr ? 'fr-FR' : 'en-GB', { maximumFractionDigits: dec, minimumFractionDigits: 0 });
};
/** « 12 $ » ou « 3,4 M jetons » (texte du serveur, langue de l'interface). */
export function texteMontant(v, unite) {
  if (v == null) return '—';
  if (unite === 'usd') return `${nombre(v, v < 10 ? 1 : 0)} $`;
  return tr('{n} M jetons', { n: nombre(v / 1e6, v < 1e7 ? 1 : 0) });
}

const DUREE_FENETRE_MS = 5 * 3600 * 1000;

/**
 * Remises à zéro de la fenêtre qu'un travail de `pct` % devra attendre quand il en reste `reste` %, et l'heure de la
 * dernière (la suivante a lieu à `reinit`, puis toutes les 5 h). Le travail ne finit pas avant cette heure-là.
 */
export function attentesFenetre(pct, reste, reinit, now = Date.now()) {
  if (pct == null || reste == null || pct <= reste) return { attentes: 0, reprise: null };
  const attentes = Math.ceil((pct - reste) / 100);
  const premiere = reinit && reinit > now ? reinit : now + DUREE_FENETRE_MS;
  return { attentes, reprise: premiere + (attentes - 1) * DUREE_FENETRE_MS };
}

const heureCourte = (ms) => {
  const d = new Date(ms);
  const loc = REGLAGES.langueInterface === 'en' ? 'en-GB' : 'fr-FR';
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString(loc, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
};

/** « 35 % de ta fenêtre » sous une fenêtre entière, « 1,4 fenêtre » au-delà (1.0.11). */
export function texteFenetres(pct) {
  if (pct == null) return '—';
  if (pct < 100) return tr('{n} % de ta fenêtre', { n: nombre(pct) });
  const n = Math.round(pct / 10) / 10;
  const un = REGLAGES.langueInterface === 'en' ? n === 1 : n < 2;
  return tr(un ? '{n} fenêtre' : '{n} fenêtres', { n: nombre(n, 1) });
}

/** « ≈ 12 $ · ≈ 15 % de ta fenêtre de 5 h (il en reste 60 %) · dont Fable ≈ 8 $ (T5) », ou « non estimable pour ce compte ». */
export function texteEstimation(est) {
  if (!est?.estimable || est.total == null) return tr('non estimable pour ce compte');
  const morceaux = [`≈ ${texteMontant(est.total, est.unite)}`];
  if (est.pct != null && !(est.attentes > 0)) morceaux.push(tr('≈ {pct} % de ta fenêtre de {fenetre} (il en reste {reste} %)', { pct: nombre(est.pct), fenetre: est.fenetre, reste: nombre(est.reste) }));
  // plus que ce qui reste (1.0.11) : en fenêtres, avec les attentes et l'heure de la dernière reprise
  if (est.pct != null && est.attentes > 0) {
    morceaux.push(tr('≈ {fenetres} de {fenetre} (il en reste {reste} %)', { fenetres: texteFenetres(est.pct), fenetre: est.fenetre, reste: nombre(est.reste) }));
    morceaux.push(tr(est.attentes > 1 ? '{n} attentes, dernière reprise vers {heure}' : '1 attente, reprise vers {heure}', { n: est.attentes, heure: heureCourte(est.reprise) }));
  }
  if (est.fable) morceaux.push(tr('dont Fable ≈ {montant} ({refs})', { montant: texteMontant(est.fable.valeur, est.unite), refs: est.fable.refs.join(', ') }));
  return morceaux.join(' · ');
}

/** Coût de la part Fable comparé à Opus : « Fable ≈ 1,4 fenêtre (128 $) ; sur Opus ≈ 23 % de ta fenêtre (43 $). » */
export function texteCoutFable(est) {
  const f = est?.fable;
  if (!f) return '';
  const u = est.unite;
  if (f.pct != null) return tr('Coût estimé : Fable ≈ {fable} ({montant}) ; sur Opus ≈ {opus} ({montantOpus}).', { fable: texteFenetres(f.pct), montant: texteMontant(f.valeur, u), opus: texteFenetres(f.pctOpus), montantOpus: texteMontant(f.opus, u) });
  return tr('Coût estimé : Fable ≈ {montant} ; sur Opus ≈ {montantOpus}.', { montant: texteMontant(f.valeur, u), montantOpus: texteMontant(f.opus, u) });
}

// ---------------------------------------------------------------- bilan d'un dossier (1.0.11)

/**
 * Ce qu'un dossier a vraiment coûté : son total, sa part de la fenêtre de 5 h (si le rapport du compte est connu), la
 * part de Fable et ce qu'elle aurait coûté sur Opus. taches : les tâches du dossier ({ id, ref, modele, modeleReel }).
 */
export function bilanDossier(d, taches, { conso = donneesConso(), table: tb = tableEstimations() } = {}) {
  const total = conso.dossiers?.[d.id]?.cout || 0;
  if (!(total > 0)) return null;
  const brut = d.compteAgents || d.compte;
  const compte = conso.calibrage?.[brut] ? brut : idCompte(brut); // (compte inconnu : celui par défaut)
  const r = rapportDe(conso.calibrage?.[compte], 'usd', conso.limites?.[compte]?.abonnement, tb);
  const versOpus = (tb.usd?.niveaux?.fort ?? 1) / (tb.usd?.niveaux?.max ?? 3);
  let fable = 0;
  const refs = [];
  for (const t of taches) {
    const c = conso.taches?.[t.id]?.cout || 0;
    if (c > 0 && estFable(t.modeleReel || t.modele)) {
      fable += c;
      refs.push(t.ref);
    }
  }
  const pf = poidsFenetre('max', tb);
  const pct = r ? ((total - fable) + fable * pf) * r.rapport : null;
  const pctOpus = r ? ((total - fable) + fable * versOpus) * r.rapport : null;
  return { total, fable, refs, pct, pctOpus, opus: total - fable + fable * versOpus };
}

/** « Bilan : ≈ 263 $ (≈ 3 fenêtres). Dont Fable : 179 $ (68 %), T5, T6. Le même travail sur Opus : ≈ 0,9 fenêtre (144 $). » */
export function texteBilan(b) {
  if (!b) return '';
  const montant = texteMontant(b.total, 'usd');
  const phrases = [b.pct != null ? tr('Bilan : ≈ {montant} (≈ {fenetres}).', { montant, fenetres: texteFenetres(b.pct) }) : tr('Bilan : ≈ {montant}.', { montant })];
  if (b.fable > 0) {
    phrases.push(tr('Dont Fable : {montant} ({pct} %), {refs}.', { montant: texteMontant(b.fable, 'usd'), pct: nombre((b.fable / b.total) * 100), refs: b.refs.join(', ') }));
    phrases.push(b.pctOpus != null
      ? tr('Le même travail sur Opus : ≈ {fenetres} ({montant}).', { fenetres: texteFenetres(b.pctOpus), montant: texteMontant(b.opus, 'usd') })
      : tr('Le même travail sur Opus : ≈ {montant}.', { montant: texteMontant(b.opus, 'usd') }));
  }
  return phrases.join(' ');
}

// ---------------------------------------------------------------- réserve et usage hors du QG (1.0.11)

/**
 * Réserve de fenêtre : l'utilisateur garde pour lui une part de sa fenêtre de 5 h aux heures choisies.
 * r = { actif, pct, debut, fin (heures 0-24), jours: 'semaine'|'tous' }. Atteinte : { pct, jusqua } (fin de la plage
 * ou remise à zéro de la fenêtre, la plus proche) ; sinon null. Fonction pure.
 */
export function reserveAtteinte(l, r, now = Date.now()) {
  if (!r?.actif || !(r.pct > 0)) return null;
  const f = fenetreCourte(l, now);
  if (!f || f.cle !== 'five_hour') return null; // forfaits Claude : la seule fenêtre de 5 h que l'utilisateur partage
  const d = new Date(now);
  const jour = d.getDay();
  if (r.jours !== 'tous' && (jour === 0 || jour === 6)) return null;
  const h = d.getHours() + d.getMinutes() / 60;
  const debut = Number.isFinite(r.debut) ? r.debut : 9;
  const fin = Number.isFinite(r.fin) ? r.fin : 18;
  if (h < debut || h >= fin) return null;
  if (f.utilisation < 100 - r.pct) return null;
  const finPlage = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(fin), Math.round((fin % 1) * 60)).getTime();
  return { pct: r.pct, jusqua: f.reinit ? Math.min(f.reinit, finPlage) : finPlage };
}

/**
 * Points de la fenêtre de 5 h pris depuis la lecture précédente au-delà de ce que le QG a consommé (Claude utilisé
 * ailleurs : un autre appareil, ou un collègue sur un compte d'équipe). null : pas comparable (lecture trop ancienne,
 * fenêtre remise à zéro, rapport inconnu). À appeler avant observerLimites, qui remplace la lecture précédente.
 */
export function pointsHorsQg(compteId, l, now = Date.now(), c = donneesConso(), tb = tableEstimations()) {
  const cal = c.calibrage?.[compteId];
  const p = cal?.dernier;
  const f = fenetreCourte(l, now);
  if (!p || !f || p.cle !== f.cle) return null;
  const dt = now - p.t;
  if (dt <= 0 || dt > ((tb.calibrage || {}).intervalleMaxMin ?? 30) * 60000) return null;
  if (p.reinit && f.reinit && Math.abs(p.reinit - f.reinit) > 10 * 60000) return null;
  const du = f.utilisation - p.utilisation;
  if (!(du > 0)) return 0;
  const { jetons } = cumulDepuis(c.jours, compteId, p);
  if (!(jetons > 0)) return du; // le QG n'a rien consommé : tout vient d'ailleurs
  const r = rapportDe(cal, 'jetons', l?.abonnement, tb);
  if (!r?.calibre) return null; // le QG travaillait, et on ne sait pas encore combien pèse un jeton
  return Math.max(0, du - jetons * r.rapport);
}

// ---------------------------------------------------------------- calibrage (C2)

// Cumul ($ et jetons) du compte depuis un repère { jour, cout, jetons } : jours ≥ repère, moins le repère.
function cumulDepuis(jours, compteId, rep) {
  let cout = 0;
  let jetons = 0;
  for (const [k, j] of Object.entries(jours || {})) {
    if (rep.jour && k < rep.jour) continue;
    const c = j.comptes?.[compteId];
    if (!c) continue;
    cout += c.cout || 0;
    jetons += jetonsDe(c);
  }
  return { cout: cout - (rep.jour ? rep.cout : 0), jetons: jetons - (rep.jour ? rep.jetons : 0) };
}

/**
 * Une lecture des limites : intervalle (Δutilisation, Δ$, Δjetons) depuis la lecture précédente, gardé
 * seulement s'il est court, sans remise à zéro entre les deux et avec une consommation du QG. Fonction pure.
 */
export function observerLecture(cal0, f, jours, compteId, now = Date.now(), cfg = tableEstimations().calibrage || {}) {
  const cal = { intervalles: [...(cal0?.intervalles || [])], dernier: cal0?.dernier || null };
  if (!f || f.utilisation == null) return cal;
  const jour = Object.keys(jours || {}).sort().at(-1) || null;
  const c = (jour && jours[jour].comptes?.[compteId]) || {};
  const point = { t: now, cle: f.cle, utilisation: f.utilisation, reinit: f.reinit || null, jour, cout: c.cout || 0, jetons: jetonsDe(c) };
  const p = cal.dernier;
  cal.dernier = point;
  if (!p || p.cle !== point.cle) return cal;
  const dt = now - p.t;
  if (dt <= 0 || dt > (cfg.intervalleMaxMin ?? 30) * 60000) return cal;
  if (p.reinit && point.reinit && Math.abs(p.reinit - point.reinit) > 10 * 60000) return cal; // fenêtre remise à zéro
  const du = point.utilisation - p.utilisation;
  if (du < 0) return cal;
  const { cout: dc, jetons: dj } = cumulDepuis(jours, compteId, p);
  if (!(dc > 0) && !(dj > 0)) return cal; // rien consommé par le QG : l'écart vient d'ailleurs
  cal.intervalles.push({ du: Math.round(du * 10) / 10, dc: Math.round(dc * 1e4) / 1e4, dj, t: now });
  cal.intervalles = cal.intervalles.slice(-(cfg.intervalles ?? 20));
  return cal;
}

/** Une lecture réussie des limites d'un compte : met à jour son calibrage dans conso.json. */
export function observerLimites(compteId, l, now = Date.now()) {
  const f = fenetreCourte(l, now);
  if (!f) return null;
  const c = donneesConso();
  const cal = observerLecture(c.calibrage?.[compteId], f, c.jours, compteId, now);
  enregistrerCalibrage(compteId, cal);
  return cal;
}

let demarre = false;
export function demarrerCalibrage() {
  if (demarre) return;
  demarre = true;
  surLimitesLues((compteId, l) => observerLimites(compteId, l));
}
