// Dictée 🎤 : MediaRecorder (audio/webm;codecs=opus) puis POST /api/dictee (corps binaire).
// Le texte reçu s'ajoute à la saisie pour relecture : rien n'est envoyé tout seul.
import { envoyerBinaire, MAQUETTE } from './flux.js';
import { t } from './i18n.js';
import { RACCOURCI_DICTEE, dicteeSysteme } from './plateforme.js';

export const RACCOURCI = RACCOURCI_DICTEE; // Alt+M, ou ⌥M sur Mac

export class Dictee {
  constructor(store, { bouton, saisie, surTexte, surErreur }) {
    this.store = store;
    this.bouton = bouton;
    this.saisie = saisie;
    this.surTexte = surTexte;
    this.surErreur = surErreur;
    this.etat = 'libre'; // libre | demande | enregistre | transcription
    this.debut = 0;
    this.chrono = null;
    this.morceaux = [];
    this.flux = null;
    this.rec = null;
    this.faux = false;
    bouton.addEventListener('click', () => this.basculer());
    window.addEventListener('keydown', (e) => {
      // (sur Mac, ⌥M produit e.key = 'µ' : on regarde aussi la touche physique)
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'm' || e.key === 'M' || e.code === 'KeyM')) {
        e.preventDefault();
        this.basculer();
      }
    });
    this.maj();
  }

  disponible() {
    return MAQUETTE || !!(this.store.dictee && this.store.dictee.disponible);
  }

  maj() {
    const b = this.bouton;
    const dispo = this.disponible();
    b.classList.toggle('indispo', !dispo);
    b.classList.toggle('enregistre', this.etat === 'enregistre');
    b.classList.toggle('transcription', this.etat === 'transcription');
    b.setAttribute('aria-disabled', dispo ? 'false' : 'true');
    b.setAttribute('aria-pressed', this.etat === 'enregistre' ? 'true' : 'false');
    const etiquette = b.querySelector('.etiquette');
    if (this.etat === 'enregistre') {
      const s = Math.floor((Date.now() - this.debut) / 1000);
      etiquette.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      b.title = t('Enregistrement… clic ou {raccourci} pour arrêter', { raccourci: RACCOURCI });
    } else if (this.etat === 'transcription') {
      etiquette.textContent = '';
      b.title = t('Transcription en cours…');
    } else {
      etiquette.textContent = '';
      b.title = dispo
        ? t('Dicter ({raccourci}) : clic pour démarrer, clic pour arrêter. Le texte s’ajoute à la saisie pour relecture.', { raccourci: RACCOURCI })
        : t('Dictée locale indisponible sur ce poste : utilise {systeme} dans la zone de saisie.', { systeme: dicteeSysteme() });
    }
  }

  basculer() {
    if (!this.disponible()) {
      this.surErreur(t('Dictée locale indisponible : utilise {systeme} dans la zone de saisie.', { systeme: dicteeSysteme() }));
      return;
    }
    if (this.etat === 'enregistre') this.arreter();
    else if (this.etat === 'libre') this.demarrer();
  }

  async demarrer() {
    this.etat = 'demande';
    this.maj();
    this.morceaux = [];
    this.faux = false;
    if (MAQUETTE) {
      // Maquette : pas de micro, enregistrement simulé.
      this.faux = true;
    } else {
      try {
        if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error(t('enregistrement audio non pris en charge par ce navigateur'));
        this.flux = await navigator.mediaDevices.getUserMedia({ audio: true });
        const type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        this.rec = new MediaRecorder(this.flux, { mimeType: type });
        this.rec.addEventListener('dataavailable', (e) => {
          if (e.data && e.data.size) this.morceaux.push(e.data);
        });
        this.rec.addEventListener('stop', () => this.transcrire());
        this.rec.start(250);
      } catch (e) {
        this.liberer();
        this.etat = 'libre';
        this.maj();
        this.surErreur(t('Micro indisponible : {erreur}. Tu peux utiliser {systeme}.', { erreur: e.message || e.name, systeme: dicteeSysteme() }));
        return;
      }
    }
    this.etat = 'enregistre';
    this.debut = Date.now();
    clearInterval(this.chrono);
    this.chrono = setInterval(() => this.maj(), 500);
    this.maj();
  }

  arreter() {
    clearInterval(this.chrono);
    this.etat = 'transcription';
    this.maj();
    if (this.faux) this.transcrire();
    else if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    else this.transcrire();
  }

  liberer() {
    if (this.flux) for (const p of this.flux.getTracks()) p.stop();
    this.flux = null;
    this.rec = null;
  }

  async transcrire() {
    const duree = Date.now() - this.debut;
    this.liberer();
    try {
      const blob = new Blob(this.morceaux, { type: 'audio/webm' });
      if (!this.faux && blob.size < 200) throw new Error(t('enregistrement vide'));
      const r = await envoyerBinaire('/api/dictee', this.faux ? new Blob([new Uint8Array(duree % 997)], { type: 'audio/webm' }) : blob, 'audio/webm');
      const texte = String((r && r.texte) || '').trim();
      if (texte) this.surTexte(texte);
      else this.surErreur(t('Rien d’intelligible dans l’enregistrement.'));
    } catch (e) {
      this.surErreur(t('Dictée : {erreur}', { erreur: e.message }));
    } finally {
      this.morceaux = [];
      this.etat = 'libre';
      this.maj();
    }
  }
}
