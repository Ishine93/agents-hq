// Cartes de permission lisibles (protocole v1.5) : la phrase claire en gros, qui demande (« Léa (T5) · étage »),
// un badge de risque, l'avertissement « hors projet », le détail technique replié, et les boutons
// Autoriser / Toujours pour cette tâche / Refuser. Plusieurs demandes d'une même tâche et d'un même risque
// s'empilent en une carte « ×3 » avec « Tout autoriser ». Tout texte du serveur passe par textContent.
import { t as tr } from './i18n.js';

export const RISQUES = {
  lecture: { lib: 'lecture', c: '#3fd36b' },
  modification: { lib: 'modification', c: '#ff9a1f' },
  execution: { lib: 'exécution', c: '#ff9a1f' },
  reseau: { lib: 'réseau', c: '#4aa3ff' },
  suppression: { lib: 'suppression', c: '#ff4d4d' },
};

function el(tag, cls, texte) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texte !== undefined && texte !== null) e.textContent = String(texte);
  return e;
}
const heure = (t) => {
  const d = new Date(t || Date.now());
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

// « Léa (T5) · Bureau d'études »
export function demandeur(S, t) {
  if (!t) return '';
  const nom = S.nom(t);
  const qui = nom && nom !== t.ref ? nom + ' (' + t.ref + ')' : t.ref;
  const e = S.etage(t.etage);
  return qui + ' · ' + (e ? e.nom : t.etage);
}

// Regroupe les demandes par tâche et par risque, dans l'ordre d'arrivée.
export function grouperPermissions(liste) {
  const groupes = new Map();
  for (const p of [...liste].sort((a, b) => (a.t || 0) - (b.t || 0))) {
    const k = p.tache + '|' + (p.risque || p.outil || '');
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(p);
  }
  return [...groupes.values()];
}

export const clePermissions = (g) => (g.length > 1 ? 'pg-' + g.map((p) => p.id).join(',') : 'p-' + g[0].id);

export function badgeRisque(risque) {
  const r = RISQUES[risque];
  if (!r) return null;
  const b = el('span', 'perm-risque r-' + risque, tr(r.lib));
  b.style.background = r.c;
  b.title = tr('Niveau de risque : {risque}', { risque: tr(r.lib) });
  return b;
}

// opts : { compacte, menu, decider(perms, decision) → Promise<bool>, voir(tache), ouverts: Set }
export function carteDemandes(S, perms, opts = {}) {
  const g = perms;
  const n = g.length;
  const p0 = g[n - 1];
  const t = S.taches.get(p0.tache);
  const risque = p0.risque || null;
  const racine = el('div', 'carte-perm' + (opts.compacte ? ' compacte' : '') + (opts.menu ? ' dans-menu' : '') + (n > 1 ? ' groupe' : '') + (risque ? ' r-' + risque : ''));
  const haut = el('div', 'perm-haut');
  const badge = badgeRisque(risque);
  if (badge) haut.append(badge);
  else haut.append(el('span', 'perm-outil', p0.outil || tr('outil')));
  if (t) {
    const lien = el('button', 'lien perm-qui', demandeur(S, t));
    lien.type = 'button';
    lien.title = tr('Voir la fiche de la tâche');
    lien.addEventListener('click', () => opts.voir && opts.voir(t.id));
    haut.append(lien);
  }
  if (n > 1) haut.append(el('span', 'perm-compte', '×' + n));
  haut.append(el('span', 'heure', heure(p0.t)));
  racine.append(haut);
  // la phrase claire, en gros
  racine.append(el('div', 'perm-resume', p0.resume || p0.outil || ''));
  if (n > 1) {
    const autres = el('ul', 'perm-autres');
    for (const p of g.slice(0, -1).reverse()) autres.append(el('li', null, p.resume || p.outil || ''));
    racine.append(autres);
  }
  if (g.some((p) => p.horsProjet)) racine.append(el('div', 'perm-hors', tr('⚠ En dehors du dossier du projet : vérifie bien avant d’autoriser.')));
  if (t && !opts.compacte && !opts.menu && t.titre) racine.append(el('div', 'perm-tache', t.titre));
  const techniques = g.filter((p) => p.technique || p.outil);
  if (techniques.length) {
    const det = el('details', 'perm-tech');
    const cle = g[0].id;
    if (opts.ouverts && opts.ouverts.has(cle)) det.open = true;
    det.addEventListener('toggle', () => {
      if (!opts.ouverts) return;
      if (det.open) opts.ouverts.add(cle);
      else opts.ouverts.delete(cle);
    });
    det.append(el('summary', null, tr('Détails techniques')));
    const pre = el('pre', 'perm-tech-texte', techniques.map((p) => (p.outil ? p.outil + ' ' : '') + (p.technique || '')).join('\n'));
    det.append(pre);
    racine.append(det);
  }
  // boutons
  const boutons = el('div', 'perm-boutons');
  const liste = [];
  const occupe = { v: false };
  const agir = async (decision) => {
    if (occupe.v || !opts.decider) return;
    occupe.v = true;
    liste.forEach((b) => (b.disabled = true));
    const ok = await opts.decider(g, decision);
    if (!ok) {
      occupe.v = false;
      liste.forEach((b) => (b.disabled = false));
    }
  };
  const bouton = (cls, texte, decision, titre) => {
    const b = el('button', cls, texte);
    b.type = 'button';
    if (titre) b.title = titre;
    b.addEventListener('click', () => agir(decision));
    liste.push(b);
    boutons.append(b);
  };
  bouton('ok', n > 1 ? tr('Tout autoriser') : tr('Autoriser'), 'allow', n > 1 ? tr('Autoriser les {n} demandes', { n }) : null);
  if (g.every((p) => p.peutToujours)) bouton('toujours', tr('Toujours pour cette tâche'), 'allow_session', tr('Autoriser ce genre d’action jusqu’à la fin de la tâche'));
  bouton('danger', n > 1 ? tr('Tout refuser') : tr('Refuser'), 'deny');
  racine.append(boutons);
  return racine;
}
