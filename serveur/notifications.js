// Notifications : tout ce qui a besoin de toi (permission, question d'un agent ou du DG, validation)
// part au site (cloche + notification du navigateur, avec boutons quand c'est possible).
// Si aucun onglet du site n'est ouvert, le serveur affiche une notification Windows qui ouvre le site.
import { spawn } from 'node:child_process';
import { etat, emettre, nbClients } from './bus.js';
import { t } from './i18n.js';

let compteur = 0;
let lienSite = 'http://127.0.0.1:4747/';
export const definirLienSite = (lien) => (lienSite = lien);

/**
 * type : permission | decision | question | validation | info
 * actions : boutons proposés ({id, libelle}) ; une notification avec actions reste « en attente »
 * jusqu'à notificationResolue(id).
 */
export function notifier({ id = null, type, titre, texte, dossier = null, tache = null, etage = null, actions = [], projet = null }) {
  const n = { id: id || `N${++compteur}`, type, titre, texte, dossier, tache, etage, actions, projet, t: Date.now() };
  if (actions.length) etat.notifications.set(n.id, n);
  emettre('notification', { notification: n }, dossier);
  if (nbClients() === 0) toastWindows(n);
  return n;
}

export function notificationResolue(id) {
  if (etat.notifications.delete(id)) emettre('notification_resolue', { id });
}

const echapperXml = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

// Notification Windows native (toast) via PowerShell ; un clic ouvre le site.
export function toastWindows(n) {
  const xml = `<toast activationType="protocol" launch="${echapperXml(lienSite)}"><visual><binding template="ToastGeneric"><text>${echapperXml(n.titre)}</text><text>${echapperXml(n.texte).slice(0, 240)}</text><text placement="attribution">${echapperXml(t('QG des agents'))}</text></binding></visual></toast>`;
  const script = [
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
    '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
    '$x = New-Object Windows.Data.Xml.Dom.XmlDocument',
    `$x.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(xml, 'utf8').toString('base64')}')))`,
    "$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
    '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show([Windows.UI.Notifications.ToastNotification]::new($x))',
  ].join('; ');
  try {
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', windowsHide: true }).unref();
  } catch (e) {
    console.error('toast', e.message);
  }
}
