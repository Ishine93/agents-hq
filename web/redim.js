// Tailles réglables à la souris, mémorisées dans ce navigateur : largeur du panneau de droite (poignée
// sur son bord gauche, double-clic = taille d'origine), hauteur de la zone de saisie (poignée au-dessus),
// taille du texte du panneau (A− / A+).
import { t } from './i18n.js';

const lire = (cle) => {
  try {
    return Number(localStorage.getItem(cle)) || null;
  } catch {
    return null;
  }
};
const ecrire = (cle, v) => {
  try {
    if (v === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, String(v));
  } catch {
    /* stockage indisponible */
  }
};

function glisser(poignee, { debut, bouger, fin }) {
  poignee.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    poignee.setPointerCapture(e.pointerId);
    const etat = debut(e);
    document.body.classList.add('redimensionne');
    const mv = (ev) => bouger(ev, etat);
    const up = () => {
      poignee.removeEventListener('pointermove', mv);
      poignee.removeEventListener('pointerup', up);
      poignee.removeEventListener('pointercancel', up);
      document.body.classList.remove('redimensionne');
      fin?.(etat);
    };
    poignee.addEventListener('pointermove', mv);
    poignee.addEventListener('pointerup', up);
    poignee.addEventListener('pointercancel', up);
  });
}

export function brancherRedimensionnement(surChangement) {
  const racine = document.documentElement;
  const panneau = document.getElementById('panneau');
  const saisie = document.getElementById('saisie');

  // --- largeur du panneau
  const largeur = lire('qg-larg-panneau');
  if (largeur) racine.style.setProperty('--larg-panneau', largeur + 'px');
  const pp = document.createElement('div');
  pp.className = 'poignee-panneau';
  pp.title = t('Glisser pour élargir ou rétrécir le panneau (double-clic : taille d’origine)');
  panneau.appendChild(pp);
  glisser(pp, {
    debut: () => ({}),
    bouger: (ev) => {
      const w = Math.round(Math.max(280, Math.min(window.innerWidth * 0.7, window.innerWidth - ev.clientX - 10)));
      racine.style.setProperty('--larg-panneau', w + 'px');
      ecrire('qg-larg-panneau', w);
      surChangement();
    },
  });
  pp.addEventListener('dblclick', () => {
    racine.style.removeProperty('--larg-panneau');
    ecrire('qg-larg-panneau', null);
    surChangement();
  });

  // --- hauteur de la saisie
  const hauteur = lire('qg-haut-saisie');
  if (hauteur) racine.style.setProperty('--haut-saisie', hauteur + 'px');
  const ps = document.createElement('div');
  ps.className = 'poignee-saisie';
  ps.title = t('Glisser vers le haut pour agrandir la zone de saisie (double-clic : taille d’origine)');
  saisie.parentElement.insertBefore(ps, saisie);
  glisser(ps, {
    debut: (e) => ({ y: e.clientY, h: saisie.getBoundingClientRect().height }),
    bouger: (ev, etat) => {
      const hNouv = Math.round(Math.max(38, Math.min(window.innerHeight * 0.6, etat.h + (etat.y - ev.clientY))));
      racine.style.setProperty('--haut-saisie', hNouv + 'px');
      saisie.style.height = hNouv + 'px';
      ecrire('qg-haut-saisie', hNouv);
      surChangement();
    },
  });
  ps.addEventListener('dblclick', () => {
    racine.style.removeProperty('--haut-saisie');
    saisie.style.height = '';
    ecrire('qg-haut-saisie', null);
    surChangement();
  });

  // --- taille du texte du panneau
  const police = lire('qg-police-panneau');
  if (police) panneau.style.setProperty('--police-panneau', police + 'px');
  const onglets = document.getElementById('onglets');
  const changer = (d) => {
    const actuel = lire('qg-police-panneau') || 14;
    const n = Math.max(11, Math.min(20, actuel + d));
    panneau.style.setProperty('--police-panneau', n + 'px');
    ecrire('qg-police-panneau', n);
  };
  const bouton = (txt, titre, d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'taille-texte';
    b.textContent = txt;
    b.title = titre;
    b.addEventListener('click', () => changer(d));
    return b;
  };
  const boite = document.createElement('span');
  boite.className = 'tailles';
  boite.append(bouton('A−', t('Texte plus petit'), -1), bouton('A+', t('Texte plus grand'), 1));
  onglets.appendChild(boite);
}
