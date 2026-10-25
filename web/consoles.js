// Console d'un service du sous-sol (rojo serve…), façon terminal : journal en direct, Démarrer / Arrêter.
// Et le terminal d'un agent : ses commandes Bash avec leur sortie.
import { envoyer, recuperer } from './flux.js';
import { t as tr, tn, locale } from './i18n.js';

const LIB_ETAT = { actif: 'actif', demarrage: 'démarrage…', erreur: 'erreur', arrete: 'arrêté', externe: 'hors QG' };
const heure = (t) => (t ? new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');

// libellé (traduit) d'un état de service ; un état inconnu reste tel quel
const libEtat = (etat) => (LIB_ETAT[etat] ? tr(LIB_ETAT[etat]) : etat);

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined && txt !== null) e.textContent = txt;
  return e;
}

export function libelleService(sv) {
  if (!sv) return '';
  return tr('{type} : {etat}', { type: sv.type, etat: libEtat(sv.etat) }) + (sv.port ? ' :' + sv.port : '');
}

export class ConsoleService {
  constructor(store, ui) {
    this.store = store;
    this.ui = ui;
    this.id = null;
    this.locales = []; // lignes affichées seulement ici (erreurs de démarrage)
    this.attente = false;
    this.construire();
  }

  construire() {
    const fond = el('div', 'console-fond');
    fond.hidden = true;
    const boite = el('div', 'console-boite');
    boite.setAttribute('role', 'dialog');
    boite.setAttribute('aria-modal', 'true');
    const tete = el('div', 'console-tete');
    this.titre = el('div', 'console-titre');
    this.badge = el('span', 'console-etat');
    this.infos = el('div', 'console-infos');
    const fermer = el('button', 'console-fermer', '×');
    fermer.type = 'button';
    fermer.addEventListener('click', () => this.fermer());
    this.bFermer = fermer;
    tete.append(this.titre, this.badge, this.infos, fermer);
    const barre = el('div', 'console-barre');
    this.bDemarrer = el('button', 'petit ok');
    this.bArreter = el('button', 'petit danger');
    this.bDemarrer.type = 'button';
    this.bArreter.type = 'button';
    this.bDemarrer.addEventListener('click', () => this.action('demarrer'));
    this.bArreter.addEventListener('click', () => this.action('arreter'));
    this.note = el('span', 'console-note');
    barre.append(this.bDemarrer, this.bArreter, this.note);
    this.zone = el('pre', 'console-lignes');
    this.zone.setAttribute('aria-live', 'polite');
    this.pied = el('div', 'console-pied');
    boite.append(tete, barre, this.zone, this.pied);
    fond.append(boite);
    fond.addEventListener('pointerdown', (e) => {
      if (e.target === fond) this.fermer();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.fond.hidden && e.key === 'Escape') {
        e.stopPropagation();
        this.fermer();
      }
    }, true);
    document.body.appendChild(fond);
    this.fond = fond;
    this.textesFixes();
  }

  // Textes fixes du cadre, remis à chaque ouverture (la langue peut changer).
  textesFixes() {
    this.bFermer.title = tr('Fermer (Échap)');
    this.bFermer.setAttribute('aria-label', tr('Fermer la console'));
    this.bDemarrer.textContent = tr('Démarrer');
    this.bArreter.textContent = tr('Arrêter');
  }

  get ouverte() {
    return !this.fond.hidden;
  }

  async ouvrir(id) {
    if (!this.store.services.has(id)) return;
    this.id = id;
    this.locales = [];
    this.textesFixes();
    this.fond.hidden = false;
    this.rendre(true);
    try {
      const r = await recuperer('/api/services/' + encodeURIComponent(id) + '/journaux');
      if (r && Array.isArray(r.lignes) && this.id === id) {
        this.store.journauxServices.set(id, r.lignes.slice());
        this.rendre(true);
      }
    } catch (e) {
      this.locales.push({ texte: tr('Journal complet indisponible : {erreur}', { erreur: e.message }), erreur: true });
      this.rendre(true);
    }
  }

  fermer() {
    this.fond.hidden = true;
    this.id = null;
  }

  surEvenement(ev) {
    if (!this.id || this.fond.hidden) return;
    if ((ev.type === 'service' && ev.service && ev.service.id === this.id) || (ev.type === 'service_log' && ev.id === this.id) || ev.type === 'etat') {
      this.rendre(false);
    }
  }

  async action(quoi) {
    const sv = this.store.services.get(this.id);
    if (!sv || this.attente) return;
    this.attente = true;
    this.rendre(false);
    try {
      await envoyer('/api/services/' + quoi, { etage: sv.etage, type: sv.type });
    } catch (e) {
      this.locales.push({ texte: tr('ERREUR : {erreur}', { erreur: e.message }), erreur: true });
    } finally {
      this.attente = false;
      this.rendre(false);
    }
  }

  rendre(enBas) {
    const S = this.store;
    const sv = S.services.get(this.id);
    if (!sv) return;
    const e = S.etage(sv.etage);
    this.titre.textContent = (e ? e.nom : sv.etage) + ' · ' + (sv.nom || sv.type);
    this.badge.textContent = libEtat(sv.etat);
    this.badge.className = 'console-etat e-' + sv.etat;
    const infos = [];
    if (sv.port) infos.push(tr('port {port}', { port: sv.port }));
    if (sv.pid) infos.push('PID ' + sv.pid);
    if (sv.externe) infos.push(tr('PID {pid} hors QG', { pid: sv.externe.pid }));
    if (sv.par) infos.push(tr('lancé par {qui}', { qui: sv.par }));
    if (sv.depuis) infos.push(tr('depuis {heure}', { heure: heure(sv.depuis) }));
    this.infos.textContent = infos.join(' · ');
    const tourne = sv.etat === 'actif' || sv.etat === 'demarrage';
    this.bDemarrer.disabled = this.attente || tourne || sv.etat === 'externe';
    this.bArreter.disabled = this.attente || !tourne;
    this.note.textContent = this.attente
      ? tr('⏳ en cours…')
      : sv.etat === 'externe'
        ? tr('Lancé hors du QG : on ne peut pas l’arrêter d’ici.')
        : sv.erreur
          ? tr('Dernière erreur : {erreur}', { erreur: sv.erreur })
          : '';
    this.pied.textContent = '$ ' + (sv.commande || sv.type) + '   —   ' + tr('Échap pour fermer');
    const z = this.zone;
    const enBasAvant = enBas || z.scrollHeight - z.scrollTop - z.clientHeight < 30;
    const lignes = S.journauxServices.get(sv.id) || sv.dernieresLignes || [];
    z.replaceChildren();
    if (!lignes.length && !this.locales.length) z.append(el('span', 'console-vide', tr('(journal vide)')));
    for (const l of lignes) {
      const s = el('span', /error|erreur|panic|failed|échec|refus/i.test(l) ? 'l-err' : /listening|visit http|ready|prêt/i.test(l) ? 'l-ok' : null, l);
      z.append(s, document.createTextNode('\n'));
    }
    for (const l of this.locales) z.append(el('span', l.erreur ? 'l-err l-locale' : 'l-locale', l.texte), document.createTextNode('\n'));
    if (enBasAvant) z.scrollTop = z.scrollHeight;
  }
}

// Terminal d'un agent : liste des commandes Bash, sortie repliable.
export function rendreTerminal(box, store, tacheId, ouverts) {
  const liste = store.terminaux.get(tacheId) || [];
  const enBas = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.replaceChildren();
  if (!liste.length) {
    box.append(el('div', 'vide', tr('Aucune commande pour l’instant.')));
    return;
  }
  for (const c of liste) {
    const erreur = !!c.erreur;
    const bloc = el('div', 'cmd' + (c.enCours ? ' encours' : '') + (erreur ? ' erreur' : ''));
    const ligne = el('div', 'cmd-ligne');
    ligne.append(el('span', 'cmd-prompt', '$'), el('code', 'cmd-texte', c.commande || ''));
    let etat;
    if (c.enCours) etat = '⏳';
    else if (c.debut && c.fin) etat = (erreur ? '✗ ' : '✓ ') + Math.max(0, Math.round((c.fin - c.debut) / 100) / 10) + ' s';
    else etat = erreur ? '✗' : '✓';
    ligne.append(el('span', 'cmd-etat', etat));
    bloc.append(ligne);
    if (c.description) bloc.append(el('div', 'cmd-desc', c.description));
    if (typeof c.erreur === 'string' && c.erreur.trim()) bloc.append(el('div', 'cmd-err', c.erreur));
    if (c.sortie) {
      const d = el('details', 'cmd-sortie');
      if (ouverts.has(c.id)) d.open = true;
      d.addEventListener('toggle', () => (d.open ? ouverts.add(c.id) : ouverts.delete(c.id)));
      const n = String(c.sortie).split('\n').length;
      d.append(el('summary', null, tn(n, 'sortie ({n} ligne)', 'sortie ({n} lignes)')), el('pre', null, c.sortie));
      bloc.append(d);
    }
    box.append(bloc);
  }
  if (enBas) box.scrollTop = box.scrollHeight;
}
