// Plateforme côté site : ce que le serveur dit de lui (reglages.plateforme : Windows ou Mac, noms des
// scripts, dictée locale possible) et, à défaut (serveur injoignable), ce que le navigateur sait du poste.
import { t } from './i18n.js';

const clientMac = /mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');

// Infos envoyées par le serveur (voir serveur/plateforme.js, infos()), ou valeurs déduites du navigateur.
export function infos(store) {
  const p = store && store.reglages && store.reglages.plateforme;
  if (p && p.scripts) return p;
  const ext = clientMac ? '.command' : '.bat';
  return {
    nom: clientMac ? 'mac' : 'windows',
    scripts: { lancer: 'lancer' + ext, installer: 'installer' + ext, ajouterCompte: 'ajouter-un-compte' + ext, mettreAJour: 'mettre-a-jour' + ext, demo: 'lancer-demo' + ext },
    dicteeLocale: !clientMac,
    raccourciDictee: clientMac ? '⌥M' : 'Alt+M',
  };
}

export const estMac = (store) => infos(store).nom === 'mac';
export const script = (store, nom) => infos(store).scripts[nom] || nom;
// Raccourci de la dictée du QG : selon le clavier de CE poste (⌥ sur Mac), pas selon le serveur.
export const RACCOURCI_DICTEE = clientMac ? '⌥M' : 'Alt+M';
// Dictée du système, pour quand la dictée locale n'est pas là.
export const dicteeSysteme = () => (clientMac ? t('la dictée de macOS (touche micro, ou fn deux fois)') : t('Win+H (dictée de Windows)'));
