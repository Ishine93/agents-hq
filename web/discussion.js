// Mini-jeu : discuter avec un personnage (agent, DG, Joy), dans une fenêtre flottante par personnage.
// Ses collègues présents dans la pièce entendent et peuvent réagir ; les réponses s'affichent aussi en
// bulle au-dessus du personnage dans la scène. Rien de tout ça ne touche au travail en cours.
import { h, api } from './modale.js';
import { t as tr, locale } from './i18n.js';
import { Fenetre } from './fenetres.js';

const heure = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

export class Discussions {
  constructor(ui) {
    this.ui = ui;
    this.fenetres = new Map(); // cle → { fen, liste, champ, attente }
  }

  nom(cle) {
    const S = this.ui.store;
    return cle === '@dg' ? S.nomDg() : cle === '@joy' ? S.nomJoy() : cle;
  }

  ouvrir(cle) {
    if (!cle) return;
    const S = this.ui.store;
    if (S.miniJeu && S.miniJeu.reglages && S.miniJeu.reglages.actif === false) {
      this.ui.toast('info', tr('Le mini-jeu est coupé : Réglages › Équipe › Mini-jeu.'));
      return;
    }
    let f = this.fenetres.get(cle);
    if (!f) {
      const liste = h('div', { class: 'disc-liste', 'aria-live': 'polite' });
      const champ = h('textarea', { class: 'disc-champ', rows: '2', maxlength: '1000', placeholder: tr('Écris à {nom}… (pour rire : ça ne change rien à son travail)', { nom: this.nom(cle) }) });
      const bEnvoyer = h('button', { class: 'ok', type: 'button' }, tr('Envoyer'));
      const attente = h('div', { class: 'disc-attente', hidden: true });
      const fen = new Fenetre({ cle: 'discussion', titre: '💬 ' + tr('Discussion avec {nom}', { nom: this.nom(cle) }), classe: 'fen-discussion', largeur: 380, hauteur: 460, min: [280, 240], coin: 'bas-droite',
        surFermer: () => {
          this.fenetres.delete(cle);
          fen.el.remove();
        } });
      fen.corps.append(liste, attente, h('div', { class: 'disc-saisie' }, champ, bEnvoyer));
      f = { fen, liste, champ, attente, bEnvoyer };
      const envoyer = () => this.envoyer(cle);
      bEnvoyer.addEventListener('click', envoyer);
      champ.addEventListener('keydown', (e) => {
        if (this.ui.toucheEnvoi(e)) {
          e.preventDefault();
          envoyer();
        }
      });
      // plusieurs discussions : chacune un peu décalée
      const n = this.fenetres.size;
      if (n) fen.el.style.top = Math.max(0, fen.el.offsetTop - n * 30) + 'px';
      this.fenetres.set(cle, f);
    }
    f.fen.ouvrir();
    this.rendre(cle);
    f.champ.focus({ preventScroll: true });
  }

  async envoyer(cle) {
    const f = this.fenetres.get(cle);
    if (!f) return;
    const texte = f.champ.value.trim();
    if (!texte || f.occupe) return;
    f.occupe = true;
    f.bEnvoyer.disabled = true;
    f.champ.value = '';
    f.attente.hidden = false;
    f.attente.textContent = tr('{nom} écrit…', { nom: this.nom(cle) });
    try {
      await api('/api/personnages/discuter', { cle, texte });
    } catch (e) {
      this.fin(cle);
      f.champ.value = texte;
      this.ui.toast('erreur', e.message);
    }
  }

  fin(cle) {
    const f = this.fenetres.get(cle);
    if (!f) return;
    f.occupe = false;
    f.bEnvoyer.disabled = false;
    f.attente.hidden = true;
  }

  rendre(cle) {
    const f = this.fenetres.get(cle);
    if (!f) return;
    const S = this.ui.store;
    const m = (S.miniJeu && S.miniJeu.memoires && S.miniJeu.memoires[cle]) || { dialogue: [] };
    const enBas = f.liste.scrollHeight - f.liste.scrollTop - f.liste.clientHeight < 60;
    f.liste.replaceChildren(...(m.dialogue.length ? m.dialogue.map((x) => {
      const moi = x.de === 'toi';
      const auteur = moi ? tr('Toi') : x.de === 'perso' ? this.nom(cle) : this.nom(x.de);
      return h('div', { class: 'disc-msg ' + (moi ? 'moi' : x.de === 'perso' ? 'lui' : 'autre') },
        h('div', { class: 'disc-auteur' }, auteur, x.t ? h('span', { class: 'disc-heure' }, ' · ' + heure(x.t)) : null),
        h('div', { class: 'disc-texte' }, x.texte));
    }) : [h('div', { class: 'disc-vide' }, tr('Dis bonjour à {nom} ! Ses collègues dans la même pièce peuvent entendre…', { nom: this.nom(cle) }))]));
    if (enBas || m.dialogue.length <= 1) f.liste.scrollTop = f.liste.scrollHeight;
  }

  surEvenement(ev) {
    if (ev.type === 'discussion') {
      if (ev.de === 'perso' || ev.de === 'erreur') this.fin(ev.cle);
      if (ev.de === 'erreur') this.ui.toast('erreur', ev.texte);
      this.rendre(ev.cle);
    } else if (ev.type === 'mini_jeu' || ev.type === 'etat') {
      for (const cle of this.fenetres.keys()) this.rendre(cle);
    }
  }
}
