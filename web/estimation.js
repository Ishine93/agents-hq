// Lot C : textes de l'estimation d'un plan et des mesures d'une tâche (le calcul est fait par le serveur,
// serveur/estimation.js). Estimation en $ (équivalent API) ou en jetons selon le compte, % de la fenêtre de
// 5 h seulement là où les limites du compte sont lisibles.
import { t, locale } from './i18n.js';

const nombre = (v, dec = 0) => Number(v).toLocaleString(locale(), { maximumFractionDigits: dec });

/** « 12 $ » ou « 3,4 M jetons ». */
export function montant(v, unite) {
  if (v == null) return '—';
  if (unite === 'usd') return t('{n} $', { n: nombre(v, v < 10 ? 1 : 0) });
  return t('{n} M jetons', { n: nombre(v / 1e6, v < 1e7 ? 1 : 0) });
}

/** « ≈ 12 $ · ≈ 15 % de ta fenêtre de 5 h (il en reste 60 %) », ou « non estimable pour ce compte ». */
export function texteEstimation(e) {
  if (!e) return '';
  if (!e.estimable || e.total == null) return t('non estimable pour ce compte');
  const m = '≈ ' + montant(e.total, e.unite);
  if (e.pct == null) return m;
  return m + ' · ' + t('≈ {pct} % de ta fenêtre de {fenetre} (il en reste {reste} %)', { pct: nombre(e.pct), fenetre: e.fenetre, reste: nombre(e.reste) });
}

/** Écart du réel à l'estimé, en % (null sans estimation ou sans réel). */
export function ecart(estime, reel) {
  if (!(estime > 0) || reel == null || !(reel >= 0)) return null; // null >= 0 est vrai en JS
  return Math.round(((reel - estime) / estime) * 100);
}
export const texteEcart = (p) => (p == null ? '—' : (p > 0 ? '+' : '') + p + ' %');

/** Mesures d'une tâche : « contexte 84 k (max 96 k) · 1 compaction · 3,2 $ ». */
export function texteMesures(m) {
  if (!m) return '';
  const k = (n) => Math.round((n || 0) / 1000);
  const morceaux = [];
  if (m.contexte) morceaux.push(m.contexteMax > m.contexte ? t('contexte {n} k (max {max} k)', { n: k(m.contexte), max: k(m.contexteMax) }) : t('contexte {n} k', { n: k(m.contexte) }));
  morceaux.push(t('{n} compaction(s)', { n: m.compactions || 0 }));
  if (m.cout) morceaux.push(montant(m.cout, 'usd'));
  else if (m.jetons) morceaux.push(montant(m.jetons, 'jetons'));
  return morceaux.join(' · ');
}

/** Rapport appris (C2) d'un compte : points de fenêtre par $ (ou par million de jetons), null s'il manque des mesures. */
export function rapportAppris(cal, unite = 'usd') {
  const champ = unite === 'usd' ? 'dc' : 'dj';
  const l = (cal?.intervalles || []).filter((i) => i[champ] > 0);
  if (l.length < 3) return null;
  const du = l.reduce((s, i) => s + i.du, 0);
  const dx = l.reduce((s, i) => s + i[champ], 0);
  if (!(dx >= (unite === 'usd' ? 1 : 1e6))) return null; // mêmes minimums que le serveur (config/defauts/estimations.json)
  return { rapport: unite === 'usd' ? du / dx : (du / dx) * 1e6, intervalles: l.length };
}
