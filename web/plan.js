// Grande vue « Plan du dossier » : le tableau blanc en grand. Une carte par tâche (prénom · ref, titre,
// modèle, effort, état, agent), rangées en colonnes selon la profondeur des dépendances, reliées par des flèches.
// Mise à jour en direct, défilement, zoom (Ctrl + molette ou boutons), Échap pour fermer.
// Tout texte venant du serveur passe par textContent.
import { libelleEtat, libelleDossier } from './etat.js';
import { modele } from './sprites.js';
import { COULEUR_ETAT } from './decor.js';
import { t as tr } from './i18n.js';
import { Fenetre } from './fenetres.js';
import { texteEstimation } from './estimation.js';

const SVG = 'http://www.w3.org/2000/svg';
const CW = 216; // carte
const CH = 100;
const GX = 84; // écart entre colonnes (place des flèches)
const GY = 18;
const MARGE = 22;
const IGNORES = new Set(['outil', 'activite', 'pensee', 'pensee_traduction', 'commande', 'service_log', 'message']);

function el(tag, cls, texte) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texte !== undefined && texte !== null) e.textContent = String(texte);
  return e;
}
function svg(tag, attrs) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
const parRef = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true });

export class PlanDossier {
  constructor(store, ui) {
    this.store = store;
    this.ui = ui;
    this.dossier = null;
    this.zoom = 1;
    this.sig = '';
    this.construire();
  }

  construire() {
    const bMoins = el('button', 'fen-b', '−');
    const bNiveau = el('button', 'fen-b fen-niveau', tr('{n} %', { n: 100 }));
    const bPlus = el('button', 'fen-b', '+');
    for (const b of [bMoins, bNiveau, bPlus]) b.type = 'button';
    bMoins.addEventListener('click', () => this.zoomer(1 / 1.2));
    bPlus.addEventListener('click', () => this.zoomer(1.2));
    bNiveau.addEventListener('click', () => this.zoomer(0));
    this.bNiveau = bNiveau;
    // fenêtre flottante (déplaçable, redimensionnable) ; le zoom est celui du graphe, dans la barre de titre
    this.fen = new Fenetre({ cle: 'plan', titre: tr('Plan du dossier'), classe: 'fen-plan', largeur: 900, hauteur: 560, min: [420, 260], coin: 'haut-gauche', zoomable: false, outils: [bMoins, bNiveau, bPlus], surFermer: () => {
      this.dossier = null;
      this.etage = null;
    } });
    this.titre = el('div', 'plan-titre');
    this.sous = el('div', 'plan-sous');
    const blocTitre = el('div', 'plan-entete');
    // ouvert depuis le tableau blanc d'un étage : choix du dossier que ce tableau affiche
    this.choix = el('label', 'plan-choix');
    this.choixLib = el('span', '');
    this.choixListe = el('select', '');
    this.choixListe.addEventListener('change', () => this.choisir(this.choixListe.value || null));
    this.choix.append(this.choixLib, this.choixListe);
    this.choix.hidden = true;
    blocTitre.append(this.titre, this.sous, this.choix);
    this.scroll = el('div', 'plan-scroll');
    this.taille = el('div', 'plan-taille');
    this.contenu = el('div', 'plan-contenu');
    this.taille.append(this.contenu);
    this.scroll.append(this.taille);
    const pied = el('div', 'plan-pied');
    this.fen.corps.append(blocTitre, this.scroll, pied);
    // + et − zooment le graphe quand on est dans la fenêtre du plan
    this.fen.el.addEventListener('keydown', (e) => {
      if (e.target.closest('input, select, textarea')) return;
      if ((e.key === '+' || e.key === '=') && !e.ctrlKey) this.zoomer(1.2);
      else if (e.key === '-' && !e.ctrlKey) this.zoomer(1 / 1.2);
    });
    this.scroll.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this.zoomer(e.deltaY < 0 ? 1.1 : 1 / 1.1, e);
    }, { passive: false });
    this.fixes = { bMoins, bPlus, pied };
    this.textesFixes();
  }

  // Textes fixes du cadre, remis à chaque ouverture (la langue peut changer).
  textesFixes() {
    const { bMoins, bPlus, pied } = this.fixes;
    bMoins.title = tr('Dézoomer');
    bPlus.title = tr('Zoomer');
    this.bNiveau.title = tr('Taille normale');
    pied.textContent = tr('Clic sur une carte : fiche de la tâche · Ctrl + molette : zoom · Échap : fermer');
  }

  get ouvert() {
    return this.fen.ouvert;
  }

  // Sans dossier : le plan le plus récent. etage : ouvert depuis le tableau blanc de cet étage.
  ouvrir(dossier, { etage = null } = {}) {
    const S = this.store;
    this.etage = etage;
    let d = dossier;
    if (!d || !S.plans.has(d)) {
      let best = null;
      for (const p of S.plans.values()) if (!best || p.t > best.t) best = p;
      if (!d && best) d = best.dossier;
    }
    if (!d) {
      this.ui.toast('info', tr('Le tableau est vide : le DG n’a encore affiché aucun plan.'));
      return;
    }
    this.dossier = d;
    this.majChoix();
    this.sig = '';
    this.textesFixes();
    this.fen.ouvrir();
    this.maj();
  }

  fermer() {
    this.fen.fermer();
  }

  // Liste des dossiers que le tableau de l'étage peut afficher (ceux dont le plan le concerne ; tous pour
  // la direction), du plus récent au plus ancien, plus « Automatique ».
  majChoix() {
    const S = this.store;
    this.choix.hidden = !this.etage;
    if (!this.etage) return;
    const tous = this.etage === 'direction' || S.dg.etage === this.etage;
    const plans = [...S.plans.values()]
      .filter((p) => S.dossiers.has(p.dossier) && (tous || p.taches.some((t) => t.etage === this.etage)))
      .sort((a, b) => b.t - a.t);
    this.choixLib.textContent = tr('Afficher sur le tableau :') + ' ';
    const choisi = S.tableauChoisi(this.etage) || '';
    const options = [el('option', '', tr('Automatique (le plus récent, sans les annulés)'))];
    options[0].value = '';
    for (const p of plans) {
      const d = S.dossiers.get(p.dossier);
      const titre = String(d.titre || d.texte || '').replace(/\s+/g, ' ').trim();
      const o = el('option', '', `${d.id} — ${titre.length > 48 ? titre.slice(0, 47) + '…' : titre} (${libelleDossier(d.etat)})`);
      o.value = d.id;
      options.push(o);
    }
    this.choixListe.replaceChildren(...options);
    this.choixListe.value = choisi;
  }

  // Nouveau choix pour le tableau : il change tout de suite (la scène le relit à chaque image).
  choisir(dossier) {
    if (!this.etage) return;
    this.store.choisirTableau(this.etage, dossier);
    const p = dossier ? null : this.ui.dir.planAffiche();
    this.dossier = dossier || (p && p.dossier) || this.dossier;
    this.sig = '';
    this.maj();
  }

  surEvenement(ev) {
    if (!this.ouvert || IGNORES.has(ev.type)) return;
    if (ev.type === 'dossier_supprime' && ev.dossier === this.dossier) return void this.fermer();
    if (ev.type === 'plan' || ev.type === 'dossier' || ev.type === 'dossier_supprime') this.majChoix();
    this.maj();
  }

  zoomer(f, ev) {
    const avant = this.zoom;
    this.zoom = f === 0 ? 1 : Math.max(0.4, Math.min(2.2, Math.round(this.zoom * f * 100) / 100));
    if (this.zoom === avant) return;
    // garde le point sous la souris (ou le centre) au même endroit
    const r = this.scroll.getBoundingClientRect();
    const px = ev ? ev.clientX - r.left : r.width / 2;
    const py = ev ? ev.clientY - r.top : r.height / 2;
    const cx = (this.scroll.scrollLeft + px) / avant;
    const cy = (this.scroll.scrollTop + py) / avant;
    this.appliquerZoom();
    this.scroll.scrollLeft = cx * this.zoom - px;
    this.scroll.scrollTop = cy * this.zoom - py;
  }

  appliquerZoom() {
    const z = this.zoom;
    this.contenu.style.transform = 'scale(' + z + ')';
    this.taille.style.width = Math.ceil((this.W || 0) * z) + 'px';
    this.taille.style.height = Math.ceil((this.H || 0) * z) + 'px';
    this.bNiveau.textContent = tr('{n} %', { n: Math.round(z * 100) });
  }

  maj() {
    const S = this.store;
    const id = this.dossier;
    if (!id) return;
    const p = S.plans.get(id);
    const d = S.dossiers.get(id);
    this.titre.textContent = tr('Plan du dossier {id}', { id }) + (d && (d.titre || d.texte) ? ' — ' + (d.titre || d.texte) : '');
    this.fen.definirTitre(tr('Plan du dossier {id}', { id }));
    const lignes = p ? p.taches.map((pt) => ({ pt, t: S.tacheParRef(id, pt.ref) })) : [];
    const faites = lignes.filter(({ t }) => t && t.etat === 'done').length;
    this.sous.textContent = (d ? libelleDossier(d.etat) : '') + (lignes.length ? (d ? ' · ' : '') + tr('{faites}/{total} tâche(s) terminée(s)', { faites, total: lignes.length }) : '')
      + (d && d.estimation ? ' · ' + tr('estimé {estimation}', { estimation: texteEstimation(d.estimation) }) : '');
    const sig = JSON.stringify(lignes.map(({ pt, t }) => [
      pt.ref, pt.titre, pt.deps, pt.modele, pt.effort, pt.etage,
      t ? [t.id, t.etat, S.nom(t), t.agent, t.modele, t.effort, t.titre, t.inputsFrom, t.reembauche, t.motifFile, t.verif && t.verif.ajustement] : null,
    ]));
    if (sig === this.sig) return;
    this.sig = sig;
    if (!lignes.length) {
      this.contenu.replaceChildren(el('div', 'plan-vide', tr('Le DG n’a pas encore affiché de plan pour ce dossier.')));
      this.W = 420;
      this.H = 80;
      this.appliquerZoom();
      return;
    }
    // profondeur : 0 sans dépendance, sinon 1 + la plus profonde des dépendances
    const parR = new Map(lignes.map((l) => [l.pt.ref, l]));
    const niveau = new Map();
    const pile = new Set();
    const prof = (ref) => {
      if (niveau.has(ref)) return niveau.get(ref);
      if (pile.has(ref) || !parR.has(ref)) return 0;
      pile.add(ref);
      const deps = parR.get(ref).pt.deps || [];
      const n = deps.length ? 1 + Math.max(...deps.map(prof)) : 0;
      pile.delete(ref);
      niveau.set(ref, n);
      return n;
    };
    const colonnes = [];
    for (const l of lignes) {
      const n = prof(l.pt.ref);
      (colonnes[n] = colonnes[n] || []).push(l);
    }
    const pos = new Map();
    let lignesMax = 0;
    colonnes.forEach((col, c) => {
      if (!col) return;
      col.sort((a, b) => parRef(a.pt.ref, b.pt.ref));
      lignesMax = Math.max(lignesMax, col.length);
      col.forEach((l, i) => pos.set(l.pt.ref, { x: MARGE + c * (CW + GX), y: MARGE + i * (CH + GY) }));
    });
    const nc = colonnes.length;
    this.W = MARGE * 2 + nc * CW + Math.max(0, nc - 1) * GX;
    this.H = MARGE * 2 + lignesMax * CH + Math.max(0, lignesMax - 1) * GY;
    // flèches
    const dessin = svg('svg', { class: 'plan-fleches', width: this.W, height: this.H, viewBox: '0 0 ' + this.W + ' ' + this.H });
    const defs = svg('defs', {});
    for (const [nom, coul] of [['gris', '#7d88a8'], ['vert', '#3fd36b'], ['bleu', '#6fb6ff']]) {
      const m = svg('marker', { id: 'pointe-' + nom, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
      m.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: coul }));
      defs.append(m);
    }
    dessin.append(defs);
    const fleche = (de, a, style) => {
      const A = pos.get(de);
      const B = pos.get(a);
      if (!A || !B) return;
      const x1 = A.x + CW;
      const y1 = A.y + CH / 2;
      const x2 = B.x - 2;
      const y2 = B.y + CH / 2;
      const dx = Math.max(30, (x2 - x1) / 2);
      const coul = style === 'vert' ? '#3fd36b' : style === 'bleu' ? '#6fb6ff' : '#7d88a8';
      // une flèche qui saute une colonne passe dans le couloir entre deux rangées, pas sous les cartes
      const saute = x2 - x1 > GX + CW;
      const yg = Math.max(A.y, B.y) + CH + GY / 2;
      const d = saute
        ? `M ${x1} ${y1} C ${x1 + 34} ${y1}, ${x1 + 10} ${yg}, ${x1 + 44} ${yg} L ${x2 - 44} ${yg} C ${x2 - 10} ${yg}, ${x2 - 34} ${y2}, ${x2} ${y2}`
        : `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      dessin.append(svg('path', {
        d,
        fill: 'none', stroke: coul, 'stroke-width': 2, 'stroke-dasharray': style === 'bleu' ? '5 4' : 'none', 'marker-end': 'url(#pointe-' + style + ')',
      }));
    };
    for (const { pt, t } of lignes) {
      const deps = pt.deps || [];
      for (const dep of deps) {
        const td = parR.get(dep);
        fleche(dep, pt.ref, td && td.t && td.t.etat === 'done' ? 'vert' : 'gris');
      }
      // entrées (inputsFrom) qui ne sont pas déjà des dépendances : pointillés bleus
      for (const r of (t && t.inputsFrom) || []) if (!deps.includes(r) && parR.has(r)) fleche(r, pt.ref, 'bleu');
    }
    // cartes
    const cartes = lignes.map(({ pt, t }) => this.carte(pt, t, pos.get(pt.ref)));
    this.contenu.style.width = this.W + 'px';
    this.contenu.style.height = this.H + 'px';
    this.contenu.replaceChildren(dessin, ...cartes);
    this.appliquerZoom();
  }

  carte(pt, t, p) {
    const S = this.store;
    const etat = t ? t.etat : 'planned';
    const mod = (t && t.modele) || pt.modele;
    const M = modele(mod);
    const b = el('button', 'plan-carte e-' + etat);
    b.type = 'button';
    Object.assign(b.style, { left: p.x + 'px', top: p.y + 'px', width: CW + 'px', height: CH + 'px', borderColor: COULEUR_ETAT[etat] || '#9aa3b0' });
    const nom = t ? S.nom(t) : pt.ref;
    const haut = el('div', 'pc-haut');
    haut.append(el('span', 'pc-nom', nom !== pt.ref ? nom + ' · ' + pt.ref : pt.ref), el('span', 'badge t-' + etat, libelleEtat(etat)));
    const titre = el('div', 'pc-titre', (t && t.titre) || pt.titre || '');
    const badges = el('div', 'pc-badges');
    const bm = el('span', 'pc-modele', M.nom);
    bm.style.background = M.c;
    badges.append(bm);
    const eff = (t && t.effort) || pt.effort;
    if (eff) badges.append(el('span', 'pc-effort', eff));
    const et = S.etage((t && t.etage) || pt.etage);
    if (et) badges.append(el('span', 'pc-etage', et.nom));
    let agent = tr('pas encore d’agent');
    if (t && t.agent) {
      const a = S.equipe.get(t.agent);
      agent = tr('Agent {qui}', { qui: a && a.prenom ? a.prenom + ' (' + t.agent + ')' : t.agent }) + (t.reembauche ? ' · ' + (a && a.cloneDe ? tr('clone') : tr('réembauché')) : '');
    } else if (t && t.motifFile) agent = t.motifFile;
    const pa = el('div', 'pc-agent', agent);
    b.append(haut, titre, badges, pa);
    const raison = (t && t.raisonModele) || pt.raisonModele;
    b.title = (t ? tr('Ouvrir la fiche de {nom} ({ref})', { nom, ref: pt.ref }) : tr('{ref} : pas encore lancée', { ref: pt.ref }))
      + (raison ? '\n' + tr('Pourquoi {modele} : {raison}', { modele: M.nom, raison }) : '')
      + (t && t.verif && t.verif.ajustement ? '\n' + t.verif.ajustement : '');
    b.addEventListener('click', () => {
      if (!t) {
        this.ui.toast('info', tr('{ref} n’a pas encore de fiche.', { ref: pt.ref }));
        return;
      }
      this.fermer();
      this.ui.voirTache(t.id);
    });
    return b;
  }
}
