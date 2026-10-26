// Skills : consignes réutilisables (SKILL.md) pour le DG et les agents.
// - Réglages › Skills : la bibliothèque (créer, importer, demander au DG, modifier, supprimer) et le réglage
//   de chacun : mode (off, disponible, toujours appliqué), pour qui (DG, agents), sur quels étages ;
// - bouton 🧩 de la barre d'envoi : les skills de CE dossier (pour le DG, DG + agents, ou sur demande).
// Tout texte venant du serveur passe par textContent (via h).
import { h, api } from './modale.js';
import { t } from './i18n.js';

const POUR = [['dg', 'Pour le DG'], ['tous', 'DG + agents'], ['demande', 'Sur demande']];
const MODES = [['off', 'Off (seulement si choisi pour un dossier)'], ['dispo', 'Disponible (chargé si besoin)'], ['toujours', 'Toujours appliqué']];

// Ce que coûte un skill, en clair.
function cout(s) {
  if (s.reglage.mode === 'toujours') return t('≈ {n} tokens à chaque appel (son contenu est toujours donné)', { n: s.tokensCorps });
  if (s.reglage.mode === 'dispo') return t('≈ {n} tokens (nom et description) ; son contenu (≈ {c}) seulement s’il sert', { n: s.tokensDescription, c: s.tokensCorps });
  return t('rien tant qu’il n’est pas choisi ({c} tokens une fois chargé)', { c: s.tokensCorps });
}

// ---------------------------------------------------------------- 🧩 dans la barre d'envoi
export class ChoixSkills {
  constructor(ui) {
    this.ui = ui;
    this.choisis = new Map(); // id → 'dg' | 'tous' | 'demande'
    this.exclus = new Set(); // skills de partout à ne pas utiliser pour ce dossier
    this.bouton = document.getElementById('btn-skills');
    this.panneau = h('div', { class: 'skills-choix', hidden: true, role: 'dialog', 'aria-label': t('Skills pour ce dossier') });
    document.body.append(this.panneau);
    this.bouton?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.panneau.hidden) this.ouvrir();
      else this.fermer();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.panneau.hidden && !this.panneau.contains(e.target) && e.target !== this.bouton && !this.bouton?.contains(e.target)) this.fermer();
    });
    this.majBouton();
  }

  // Ce qui part avec la demande (nouveau dossier).
  pourEnvoi() {
    return { skills: [...this.choisis].map(([id, pour]) => ({ id, pour })), skillsExclus: [...this.exclus] };
  }

  vider() {
    this.choisis.clear();
    this.exclus.clear();
    this.majBouton();
    if (!this.panneau.hidden) this.rendre();
  }

  majBouton() {
    if (!this.bouton) return;
    const n = this.choisis.size;
    this.bouton.classList.toggle('actif', n > 0 || this.exclus.size > 0);
    this.bouton.title = n ? t('{n} skill(s) pour ce dossier', { n }) : t('Skills pour ce dossier (le DG, les agents)');
    const nb = this.bouton.querySelector('.nb');
    if (nb) {
      nb.hidden = !n;
      nb.textContent = String(n);
    }
  }

  ouvrir() {
    this.rendre();
    this.panneau.hidden = false;
    const r = this.bouton.getBoundingClientRect();
    this.panneau.style.left = Math.max(8, Math.min(window.innerWidth - this.panneau.offsetWidth - 8, r.left - 40)) + 'px';
    this.panneau.style.bottom = window.innerHeight - r.top + 8 + 'px';
  }

  fermer() {
    this.panneau.hidden = true;
  }

  rendre() {
    const S = this.ui.store;
    const liste = S.skills || [];
    const partout = liste.filter((s) => s.reglage.mode !== 'off' && (s.reglage.dg || s.reglage.agents));
    const autres = liste.filter((s) => !partout.includes(s));
    const ligne = (s) => {
      const coche = h('input', { type: 'checkbox', checked: this.choisis.has(s.id), on: { change: (e) => {
        if (e.target.checked) this.choisis.set(s.id, 'tous');
        else this.choisis.delete(s.id);
        this.majBouton();
        this.rendre();
      } } });
      const pour = h('select', { class: 'champ', disabled: this.choisis.has(s.id) ? null : true, on: { change: (e) => {
        this.choisis.set(s.id, e.target.value);
        this.majBouton();
      } } }, POUR.map(([v, l]) => h('option', { value: v, selected: this.choisis.get(s.id) === v ? true : null }, t(l))));
      return h('div', { class: 'skills-ligne' }, h('label', { title: s.description }, coche, ' ', h('b', {}, s.id), h('small', {}, s.description)), pour);
    };
    const lignePartout = (s) => h('div', { class: 'skills-ligne partout' },
      h('label', { title: s.description },
        h('input', { type: 'checkbox', checked: !this.exclus.has(s.id), on: { change: (e) => {
          if (e.target.checked) this.exclus.delete(s.id);
          else this.exclus.add(s.id);
          this.majBouton();
        } } }), ' ', h('b', {}, s.id),
        h('small', {}, (s.reglage.mode === 'toujours' ? t('partout, toujours appliqué') : t('partout, disponible')) + ' — ' + [s.reglage.dg ? t('DG') : null, s.reglage.agents ? t('agents') : null].filter(Boolean).join(' + '))));
    this.panneau.replaceChildren(...[
      h('div', { class: 'skills-tete' }, h('b', {}, '🧩 ' + t('Skills pour ce dossier')), h('button', { class: 'fen-b', type: 'button', on: { click: () => this.fermer() } }, '×')),
      liste.length ? null : h('p', { class: 'meta' }, t('Aucun skill pour l’instant. Crée-en un, importe-le, ou demande au DG : « crée un skill qui… ».')),
      autres.length ? h('div', { class: 'skills-bloc' }, h('small', { class: 'meta' }, t('À ajouter pour ce dossier :')), autres.map(ligne)) : null,
      partout.length ? h('div', { class: 'skills-bloc' }, h('small', { class: 'meta' }, t('Déjà actifs partout (décoche pour ne pas les utiliser ici) :')), partout.map(lignePartout)) : null,
      h('small', { class: 'meta' }, t('« Sur demande » : seuls le nom et la description sont donnés, l’IA charge le skill si elle en a besoin. Le DG peut aussi donner un skill à un agent pour une tâche.')),
      h('div', { class: 'boutons' },
        this.choisis.size || this.exclus.size ? h('button', { class: 'petit', type: 'button', on: { click: () => this.vider() } }, t('Tout enlever')) : null,
        h('button', { class: 'petit', type: 'button', on: { click: () => { this.fermer(); this.ui.parametres.ouvrir('skills'); } } }, t('Gérer les skills…'))),
    ].filter(Boolean));
  }
}

// ---------------------------------------------------------------- Réglages › Skills
export function sectionSkills(param) {
  const S = param.store;
  const ui = param.ui;
  const box = h('div', { class: 'param-skills' });
  const recharger = async () => {
    try {
      const r = await api('/api/skills');
      S.skills = r.skills;
      param.skillsClaude = r.claudeCode;
    } catch (e) {
      param.skillsClaude = param.skillsClaude || []; // pas de nouvel essai en boucle
      ui.toast('erreur', e.message);
    }
    param.rendre();
  };
  const poster = async (route, corps, ok) => {
    const r = await param.poster(route, corps, ok);
    if (r) await recharger();
    return r;
  };

  // --- créer, importer, demander au DG
  const fichier = h('input', { type: 'file', accept: '.md,.markdown,.txt,.skill,.zip', hidden: true, multiple: true });
  fichier.addEventListener('change', async () => {
    for (const f of [...fichier.files]) {
      try {
        const r = await api('/api/skills/importer?nom=' + encodeURIComponent(f.name), undefined, { brut: await f.arrayBuffer(), type: 'application/octet-stream' });
        ui.toast('info', t('Importé : {ids}', { ids: r.ids.join(', ') }));
      } catch (e) {
        ui.toast('erreur', f.name + ' : ' + e.message);
      }
    }
    fichier.value = '';
    await recharger();
  });
  const nom = h('input', { class: 'champ', placeholder: t('nom (ex. questions-choix-multiples)'), maxlength: '48' });
  const desc = h('input', { class: 'champ', placeholder: t('Description : ce qu’il fait et QUAND s’en servir'), maxlength: '300' });
  const instr = h('textarea', { class: 'champ', rows: '6', placeholder: t('Instructions (markdown)') });
  const formulaire = h('div', { class: 'skills-form', hidden: true },
    nom, desc, instr,
    h('div', { class: 'boutons' }, h('button', { class: 'petit ok', type: 'button', on: { click: async () => {
      const r = await poster('/api/skills/creer', { nom: nom.value, description: desc.value, instructions: instr.value }, t('Skill créé.'));
      if (r) formulaire.hidden = true;
    } } }, t('Créer'))));
  const claude = param.skillsClaude || [];
  const blocClaude = claude.length
    ? h('details', { class: 'skills-claude' }, h('summary', {}, t('Importer depuis tes skills Claude Code ({n})', { n: claude.length })),
      h('ul', {}, claude.map((c) => h('li', {}, h('b', {}, c.nom), ' — ', h('small', {}, c.description),
        h('button', { class: 'petit', type: 'button', on: { click: () => poster('/api/skills/importer-claude', { chemin: c.chemin }, t('Importé.')) } }, t('Importer'))))))
    : null;

  // --- un skill de la bibliothèque
  const etages = (S.etages || []).filter((e) => e.actif && e.projet);
  const carte = (s) => {
    const r = s.reglage;
    const regler = (patch) => poster('/api/skills/' + s.id + '/regler', patch);
    const mode = h('select', { class: 'champ', on: { change: (e) => regler({ mode: e.target.value }) } }, MODES.map(([v, l]) => h('option', { value: v, selected: r.mode === v ? true : null }, t(l))));
    const caseQui = (k, lib) => h('label', { class: 'param-case' }, h('input', { type: 'checkbox', checked: !!r[k], disabled: r.mode === 'off' ? true : null, on: { change: (e) => regler({ [k]: e.target.checked }) } }), ' ', lib);
    const editeur = h('textarea', { class: 'champ skills-editeur', rows: '12', hidden: true });
    const bModifier = h('button', { class: 'petit', type: 'button', on: { click: async () => {
      if (editeur.hidden) {
        try {
          editeur.value = (await api('/api/skills/' + s.id)).texte;
          editeur.hidden = false;
          bModifier.textContent = t('Enregistrer');
        } catch (e) {
          ui.toast('erreur', e.message);
        }
      } else {
        const ok = await poster('/api/skills/' + s.id + '/modifier', { texte: editeur.value }, t('Skill enregistré.'));
        if (ok) editeur.hidden = true;
      }
    } } }, t('Voir / modifier'));
    return h('div', { class: 'skills-carte m-' + r.mode },
      h('div', { class: 'skills-carte-tete' }, h('b', {}, s.id), s.source ? h('span', { class: 'badge' }, s.source === 'dg' ? t('créé par le DG') : s.source === 'claude-code' ? 'Claude Code' : s.source === 'import' ? t('importé') : t('créé à la main')) : null),
      h('div', { class: 'meta' }, s.description),
      h('div', { class: 'skills-reglage' }, mode, caseQui('dg', t('DG')), caseQui('agents', t('agents'))),
      r.mode !== 'off' && r.agents && etages.length
        ? h('div', { class: 'skills-etages' }, h('small', {}, t('Agents de ces étages seulement (aucun coché : tous) :')),
          etages.map((e) => h('label', { class: 'param-case' }, h('input', { type: 'checkbox', checked: r.etages.includes(e.id), on: { change: (ev) => regler({ etages: ev.target.checked ? [...r.etages, e.id] : r.etages.filter((x) => x !== e.id) }) } }), ' ', e.nom)))
        : null,
      h('small', { class: 'meta' }, cout(s)),
      editeur,
      h('div', { class: 'boutons' }, bModifier,
        h('button', { class: 'petit danger', type: 'button', on: { click: () => {
          if (window.confirm(t('Supprimer le skill « {id} » ?', { id: s.id }))) poster('/api/skills/' + s.id + '/supprimer', {}, t('Skill supprimé.'));
        } } }, t('Supprimer'))));
  };

  const liste = S.skills || [];
  // (append écrirait « null » pour un bloc absent : on le retire)
  box.append(...[
    h('p', { class: 'meta' }, t('Un skill est une consigne réutilisable (fichier SKILL.md, le format de Claude Code). « Toujours appliqué » : donné d’office (une règle de comportement). « Disponible » : seuls son nom et sa description sont donnés, l’IA le charge si elle en a besoin (presque gratuit). « Off » : rangé ici, à choisir pour un dossier avec 🧩. Le DG donne aussi à chaque agent les skills utiles à sa tâche.')),
    h('div', { class: 'boutons' },
      h('button', { class: 'petit', type: 'button', on: { click: () => { formulaire.hidden = !formulaire.hidden; } } }, '＋ ' + t('Créer un skill')),
      h('button', { class: 'petit', type: 'button', on: { click: () => fichier.click() } }, '⤓ ' + t('Importer un fichier (SKILL.md, .skill, .zip)')),
      h('button', { class: 'petit', type: 'button', title: t('Le DG l’écrit pour toi'), on: { click: () => {
        param.m.fermer();
        const s = document.getElementById('saisie');
        s.value = t('Crée un skill qui ');
        s.focus();
        s.setSelectionRange(s.value.length, s.value.length);
      } } }, '✨ ' + t('Demander au DG d’en créer un')),
      fichier),
    formulaire,
    blocClaude,
    h('small', { class: 'meta' }, t('N’importe que des skills de confiance : un skill donne des consignes aux agents, qui ont accès à tes fichiers.')),
    liste.length ? h('div', { class: 'skills-liste' }, liste.map(carte)) : h('div', { class: 'vide' }, t('Bibliothèque vide pour l’instant.')),
  ].filter(Boolean));
  if (!param.skillsClaude) recharger();
  return [box];
}
