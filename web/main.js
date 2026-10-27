// Point d'entrée : assemble l'état, la scène, le moteur, l'interface et le flux.
import { Etat } from './etat.js';
import { Directeur } from './scenes.js';
import { Moteur } from './moteur.js';
import { graphismes } from './graphismes.js';
import { Interface } from './ui.js';
import { demarrerFlux } from './flux.js';
import { t } from './i18n.js';
import { script as scriptPlateforme } from './plateforme.js';

const store = new Etat();
const directeur = new Directeur(store);
const moteur = new Moteur(document.getElementById('scene'), directeur, graphismes);
graphismes.brancher(moteur, store);
const ui = new Interface(store, directeur, moteur);
ui.init();

store.ecouter((ev) => {
  if (ev.type === 'etat') document.getElementById('attente').hidden = true;
  ui.surEvenement(ev);
});

demarrerFlux(
  (ev) => store.appliquer(ev),
  (statut) => {
    ui.setStatut(statut);
    if (statut === 'deconnecte' && !store.recu) {
      document.getElementById('attente-texte').textContent = t('Serveur injoignable. Lance {script}, ou ouvre la maquette avec ?mock dans l’adresse.', { script: scriptPlateforme(store, 'lancer') });
    }
  },
);

// Accès de débogage depuis la console.
window.QG = {
  store, directeur, moteur, ui, graphismes,
  // Fait avancer l'animation de `ms` millisecondes d'un coup (onglet masqué, captures).
  avancer(ms = 1000) {
    for (let i = 0; i < ms / 50; i++) moteur.image(moteur.dernier + 50);
  },
};
