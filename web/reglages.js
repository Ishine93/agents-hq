// Connecteurs MCP par compte et MCP des projets par étage (section « Connecteurs » des Réglages).
import { t, locale } from './i18n.js';

const MODES = [
  { id: 'off', libelle: 'Coupé', titre: 'Jamais proposé aux agents' },
  { id: 'demander', libelle: 'Sur demande', titre: 'Chaque appel lève la main' },
  { id: 'auto', libelle: 'Auto', titre: 'Utilisable sans demander' },
];
const STATUTS = {
  connected: ['connecté', 'ok'],
  'needs-auth': ['à autoriser', 'warn'],
  needs_auth: ['à autoriser', 'warn'],
  failed: ['en échec', 'ko'],
  error: ['en erreur', 'ko'],
  pending: ['en attente', 'warn'],
  disabled: ['désactivé', 'gris'],
};

function h(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'on') for (const [n, f] of Object.entries(v)) e.addEventListener(n, f);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of enfants.flat()) if (c !== null && c !== undefined && c !== false) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

const nomCourt = (nom) => String(nom || '').replace(/^claude\.ai[\s_-]+/i, '');
const date = (x) => (x ? new Date(x).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : t('jamais'));

/** Remplit `box` avec les connecteurs de chaque compte et les MCP des projets. */
export function rendreMcp(box, ui) {
  const S = ui.store;
  const sections = [];
  const mcp = S.mcp || { comptes: {}, etages: {} };
  const comptes = S.comptes.length ? S.comptes : Object.keys(mcp.comptes || {}).map((id) => ({ id, nom: id, connecte: true }));
  sections.push(h('p', { class: 'meta' }, t('Les connecteurs de ton compte claude.ai (Notion, Drive, Gmail…) et les serveurs MCP de tes projets. Par défaut, un connecteur n’est jamais donné aux agents : choisis « Sur demande » (chaque appel lève la main) ou « Auto ».')));
  const blocComptes = h('section', { class: 'reglage' }, h('h4', {}, t('Connecteurs MCP par compte')));
  for (const c of comptes) {
    const info = (mcp.comptes || {})[c.id] || { serveurs: [], decouverte: null };
    const enCours = ui.decouvertes.has(c.id);
    const relire = h('button', {
      class: 'petit' + (enCours ? ' attente' : ''),
      type: 'button',
      disabled: enCours || !c.connecte ? true : null,
      title: c.connecte ? t('Relit la liste des connecteurs du compte (sans consommer de tokens, ≈ 15 s)') : t('Compte non connecté'),
      on: { click: () => ui.decouvrirMcp(c.id) },
    }, enCours ? '⏳ ' + t('Lecture… (≈ 15 s)') : t('Relire les connecteurs'));
    const serveurs = (info.serveurs || []).slice().sort((a, b) => nomCourt(a.nom).localeCompare(nomCourt(b.nom), locale()));
    blocComptes.append(
      h('div', { class: 'compte-mcp' },
        h('div', { class: 'compte-entete' },
          h('b', {}, c.nom),
          h('span', { class: 'meta' }, (c.connecte ? '' : t('non connecté') + ' · ') + t('lu : {date}', { date: date(info.decouverte) })),
          relire),
        serveurs.length
          ? h('ul', { class: 'liste-mcp' }, serveurs.map((s) => ligneMcp(ui, 'compte', c.id, s)))
          : h('div', { class: 'vide' }, info.decouverte ? t('Aucun connecteur.') : t('Pas encore lu : clique sur « Relire les connecteurs ».'))),
    );
  }
  sections.push(blocComptes);

  const parEtage = Object.entries(mcp.etages || {});
  const blocEtages = h('section', { class: 'reglage' }, h('h4', {}, t('MCP des projets (par étage)')));
  if (!parEtage.length) blocEtages.append(h('div', { class: 'vide' }, t('Aucun projet ne déclare de serveur MCP (fichier .mcp.json).')));
  for (const [id, liste] of parEtage.sort((a, b) => ((S.etage(b[0]) || {}).ordre || 0) - ((S.etage(a[0]) || {}).ordre || 0))) {
    const e = S.etage(id);
    blocEtages.append(
      h('div', { class: 'compte-mcp' },
        h('div', { class: 'compte-entete' }, h('b', {}, e ? e.nom : id)),
        h('ul', { class: 'liste-mcp' }, (liste || []).map((s) => ligneMcp(ui, 'etage', id, s)))),
    );
  }
  sections.push(blocEtages);
  box.replaceChildren(...sections);
}

function ligneMcp(ui, cible, id, s) {
  const cle = cible + '|' + id + '|' + s.nom;
  const attente = ui.mcpEnCours.get(cle);
  const mode = attente || s.mode || 'off';
  const st = STATUTS[s.statut] || (s.statut ? [s.statut, 'gris'] : null);
  const choix = h('div', { class: 'tri-etat', role: 'radiogroup', 'aria-label': t('Mode de {nom}', { nom: nomCourt(s.nom) }) },
    MODES.map((m) =>
      h('button', {
        type: 'button',
        class: 'mode-' + m.id + (mode === m.id ? ' choisi' : ''),
        role: 'radio',
        'aria-checked': mode === m.id ? 'true' : 'false',
        title: t(m.titre),
        disabled: attente ? true : null,
        on: { click: () => mode !== m.id && ui.changerModeMcp(cible, id, s.nom, m.id) },
      }, t(m.libelle))));
  return h('li', { class: 'mcp' + (mode === 'off' ? ' coupe' : '') },
    h('div', { class: 'mcp-nom' },
      h('span', { class: 'nom', title: s.nom }, nomCourt(s.nom)),
      s.perso ? h('span', { class: 'badge perso', title: t('Connecteur personnel') }, t('perso')) : null,
      st ? h('span', { class: 'badge st-' + st[1] }, t(st[0])) : null,
      typeof s.outils === 'number' ? h('span', { class: 'meta' }, s.outils > 1 ? t('{n} outils', { n: s.outils }) : t('{n} outil', { n: s.outils })) : null),
    choix);
}
