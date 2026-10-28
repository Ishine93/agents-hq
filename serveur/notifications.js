// Notifications : tout ce qui a besoin de toi (permission, question d'un agent ou du DG, validation)
// part au site (cloche + notification du navigateur, avec boutons quand c'est possible).
// Si aucun onglet du site n'est ouvert, le serveur affiche une notification du système (Windows : toast
// qui ouvre le site ; Mac : notification osascript, voir plateforme.js).
import { etat, emettre, nbClients } from './bus.js';
import * as plateforme from './plateforme.js';
import { t } from './i18n.js';
import { alerterNotification } from './telephone.js';

let compteur = 0;
let lienSite = 'http://127.0.0.1:4747/';
export const definirLienSite = (lien) => (lienSite = lien);

/**
 * type : permission | decision | question | validation | info
 * actions : boutons proposés ({id, libelle}) ; une notification avec actions reste « en attente »
 * jusqu'à notificationResolue(id).
 * telephone : catégorie d'alerte sur le téléphone (attente, fin, pause, relance) ; par défaut, déduite du type.
 */
export function notifier({ id = null, type, titre, texte, dossier = null, tache = null, etage = null, actions = [], projet = null, telephone = null }) {
  const n = { id: id || `N${++compteur}`, type, titre, texte, dossier, tache, etage, actions, projet, t: Date.now() };
  if (actions.length) etat.notifications.set(n.id, n);
  emettre('notification', { notification: n }, dossier);
  if (nbClients() === 0) notificationSysteme(n);
  alerterNotification(n, telephone).catch(() => {});
  return n;
}

export function notificationResolue(id) {
  if (etat.notifications.delete(id)) emettre('notification_resolue', { id });
}

// Notification native du système (Windows : toast PowerShell, un clic ouvre le site ; Mac : osascript).
export function notificationSysteme(n) {
  try {
    plateforme.notificationSysteme({ titre: n.titre, texte: n.texte, attribution: t('QG des agents') }, lienSite);
  } catch (e) {
    console.error('toast', e.message);
  }
}
export const toastWindows = notificationSysteme;
