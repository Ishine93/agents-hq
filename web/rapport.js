// « Signaler un problème » (1.0.8) : un bug ou une idée, écrit simplement, avec les informations techniques
// nettoyées par le serveur. Le texte complet est montré avant tout envoi ; c'est un clic de l'utilisateur qui
// ouvre la page GitHub déjà remplie (il la publie lui-même), ou qui copie le texte pour l'envoyer autrement.
import { h, ouvrirModale, api } from './modale.js';
import { t } from './i18n.js';
import { bulle } from './aide.js';

export function ouvrirRapport(ui) {
  const m = ouvrirModale({ titre: t('Signaler un problème ou proposer une idée'), classe: 'rapport' });
  let type = 'bug';
  const titre = h('input', { class: 'champ', maxlength: '120', placeholder: t('En quelques mots') });
  const quoi = h('textarea', { class: 'champ zone', rows: '4', maxlength: '3000' });
  const attendu = h('textarea', { class: 'champ zone', rows: '3', maxlength: '2000' });
  const etapes = h('textarea', { class: 'champ zone', rows: '3', maxlength: '2000', placeholder: t('1. J’ouvre…  2. Je clique sur…  3. …') });
  const joindre = h('input', { type: 'checkbox', checked: true });
  const libQuoi = h('label', {});
  const libAttendu = h('label', {});
  const blocEtapes = h('div', { class: 'rapport-champ' }, h('label', {}, t('Comment le refaire (facultatif)')), etapes);
  const majType = () => {
    libQuoi.textContent = type === 'bug' ? t('Ce qui s’est passé') : t('Ton idée');
    libAttendu.textContent = type === 'bug' ? t('Ce que tu attendais') : t('Pourquoi ce serait utile (facultatif)');
    blocEtapes.hidden = type !== 'bug';
  };
  const choix = (valeur, texte) => h('label', { class: 'param-case' },
    h('input', { type: 'radio', name: 'rapport-type', value: valeur, checked: valeur === type, on: { change: () => { type = valeur; majType(); } } }), ' ', texte);
  const aide = bulle('rapport-infos', [
    t('Avec ces informations, on comprend bien plus vite ce qui s’est passé : la version du QG, ton système (Windows ou Mac), le nombre de comptes IA et d’étages, et les dernières lignes affichées par le serveur.'),
    t('Tout ce qui est personnel est remplacé avant que tu voies le texte : le jeton du QG, les clés et jetons d’API, les adresses mail, les adresses IP, les dossiers de tes projets et ton dossier personnel, ton nom d’utilisateur, ton prénom et les noms de tes comptes.'),
    t('Rien ne part tout seul : tu relis le texte complet, puis c’est toi qui l’envoies.'),
  ], { titre: t('Informations techniques') });
  const formulaire = h('div', { class: 'rapport-formulaire' },
    h('div', { class: 'rapport-types' }, choix('bug', t('Quelque chose ne marche pas')), choix('idee', t('J’ai une idée'))),
    h('div', { class: 'rapport-champ' }, h('label', {}, t('Titre')), titre),
    h('div', { class: 'rapport-champ' }, libQuoi, quoi),
    h('div', { class: 'rapport-champ' }, libAttendu, attendu),
    blocEtapes,
    h('div', { class: 'titre-i' }, h('label', { class: 'param-case' }, joindre, ' ', t('Joindre les informations techniques (version, système, dernières lignes du serveur)')), aide.bouton),
    aide.panneau);
  const preparer = h('button', { class: 'petit ok', type: 'button', on: { click: async () => {
    if (!quoi.value.trim()) {
      quoi.focus();
      return ui.toast('erreur', type === 'bug' ? t('Écris d’abord ce qui s’est passé.') : t('Écris d’abord ton idée.'));
    }
    preparer.disabled = true;
    try {
      const r = await api('/api/rapport', { type, titre: titre.value, quoi: quoi.value, attendu: attendu.value, etapes: type === 'bug' ? etapes.value : '', joindre: joindre.checked });
      montrer(r);
    } catch (e) {
      ui.toast('erreur', e.message);
    } finally {
      preparer.disabled = false;
    }
  } } }, t('Voir le texte avant de l’envoyer'));
  const pied = h('div', { class: 'boutons' }, preparer, h('button', { class: 'petit', type: 'button', on: { click: () => m.fermer() } }, t('Annuler')));
  const etape1 = h('div', {}, formulaire, pied);

  // Étape 2 : le texte exact, puis GitHub (compte GitHub gratuit) ou copie.
  const montrer = (r) => {
    const copier = h('button', { class: 'petit', type: 'button', on: { click: async () => {
      try {
        await navigator.clipboard.writeText(`${r.titre}\n\n${r.corps}`);
        ui.toast('info', t('Texte copié : tu peux le coller dans un message à la personne qui t’a donné le QG.'));
      } catch {
        ui.toast('erreur', t('Copie impossible : sélectionne le texte et copie-le à la main.'));
      }
    } } }, t('Copier le texte'));
    const ouvrir = h('a', { class: 'petit bouton-lien ok', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, t('Ouvrir sur GitHub pour l’envoyer'));
    // (replaceChildren écrirait « null » : seulement les éléments présents)
    m.corps.replaceChildren(...[
      h('p', {}, t('Voici exactement ce qui sera envoyé. Rien n’est encore parti. Ce qui est personnel a été remplacé par des mots entre < et >.')),
      r.coupe ? h('p', { class: 'meta' }, t('Le texte était trop long pour GitHub : les plus anciennes lignes du serveur ont été retirées.')) : null,
      h('div', { class: 'rapport-apercu' }, h('b', {}, r.titre), h('pre', {}, r.corps)),
      h('p', { class: 'meta' }, t('« Ouvrir sur GitHub » ouvre une page déjà remplie : il faut un compte GitHub (gratuit), puis cliquer sur « Create ». Sans compte, copie le texte et envoie-le à la personne qui t’a donné le QG.')),
      h('div', { class: 'boutons' }, ouvrir, copier, h('button', { class: 'petit', type: 'button', on: { click: () => m.corps.replaceChildren(etape1) } }, t('Modifier'))),
    ].filter(Boolean));
  };
  majType();
  m.corps.append(etape1);
  titre.focus();
  return m;
}
