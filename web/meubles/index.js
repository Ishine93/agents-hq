// Dessin des décors au choix (1.0.10) : chaque famille (web/meubles/<famille>.js) apporte ses meubles, ses sols, ses
// murs et ses thèmes ; web/decor.js s'en sert pour tout ce qu'il ne dessine pas lui-même.
//
// Contrat d'un module de famille (tous les champs sont des objets, éventuellement vides) :
// - MEUBLES[type] = (it, typeTheme, etat, O) => sprite. `it` : le meuble du plan (x, y, w, h, dir, variante…) ;
//   `typeTheme` : le thème visuel de l'étage (carte.look) ; `O` : les outils de decor.js (spriteTuile, spriteBloc,
//   pieds, plante, theme, prisme, prismeVerre…). Un sprite = { c: canvas, dx, dy } comme ceux de spriteTuile /
//   spriteBloc, avec des couches facultatives de même forme : `avant` (dossier d'une chaise, devant l'avatar assis),
//   `haut` et `devant` (lits superposés), `sol` (partie plate peinte avec le sol, sous les avatars : tapis,
//   marquage ; `c` peut alors être null). Un meuble `sol: true` dans le plan passe tout entier dans la couche du sol.
//   Couleurs 'rgba(…)' permises partout (O.prisme assombrit les faces en gardant la transparence).
// - ANIMES[type] = (g, it, tx, ty, t, O) => void : petite animation dessinée par-dessus le sprite (t en ms).
// - JEUX[type] = (g, it, tx, ty, t, actif, O) => void : animation d'un meuble de jeu (`jeu` dans le plan), `actif`
//   quand au moins deux joueurs sont installés (balle qui bouge…).
// - THEMES[cle] = { sols: { def: [motif, couleur], <zone>: [motif, couleur] }, mur, dalle, bureau, chaise, canape,
//   canapeEquipe, table, cloison? } : même forme que les thèmes de decor.js ; `cle` est le `look` d'une carte.
//   cloison = { cadre, verre, plein } : couleurs du cadre, du vitrage et des cloisons pleines de ce look. Une cloison
//   du plan peut aussi porter { plein: true, couleur, cadre, hauteur } (panneau opaque au lieu du verre).
// - SOLS[motif] = (g, col, { parite, variante, rnd, x, y }, O) => void : motif de sol, dessiné sur le losange de
//   base déjà peint de la couleur `col` (64 × 32 px). Une tuile sert à toutes les cases de même parité et variante ;
//   un motif qui dépend de la case (rosace, fresque sur plusieurs cases) le dit : SOLS[motif].parPosition = true.
// - MURS[motif] = (g, longueur, cote, rnd, O) => void : peinture d'un mur (canvas longueur × HW, cote 'droite' | 'gauche').
// - DECORS_MURS[look] = (g, cote, longueur, etage, O) => void : ce qu'on accroche aux murs de ce thème (fenêtres,
//   affiches…), à la place du décor mural par défaut ; appeler O.plaqueEtage(g, etage) sur le mur gauche.
// - CLICS[type] = { duree, declenche?, phases? } : easter egg, le meuble devient cliquable (voir web/clics.js). Pendant
//   l'effet, MEUBLES[type] reçoit etat.effet (numéro de phase) et ANIMES[type] reçoit un 7e paramètre « effet »
//   ({ depuis, duree, progres, phase, source, clique }) ; un meuble cliquable ou déclenché a donc une entrée ANIMES.
//
// Un même nom (meuble, sol, thème…) dans deux familles est une erreur au chargement : préfixer ses noms (box_, dir_…).
import * as bureau from './bureau.js';
import * as direction from './direction.js';
import * as pause from './pause.js';
import * as repos from './repos.js';
import * as hall from './hall.js';
import * as serveur from './serveur.js';
import * as isoloir from './isoloir.js';

export const FAMILLES = { bureau, direction, pause, repos, hall, serveur, isoloir };

// Réunit un champ de toutes les familles. Un nom défini deux fois arrête le chargement (testé dans
// tests/meubles-familles.test.js) : sinon la seconde famille remplacerait la première sans bruit.
export function fusionner(familles, champ) {
  const r = {};
  const origine = {};
  for (const [nom, f] of Object.entries(familles)) {
    for (const [k, v] of Object.entries(f[champ] || {})) {
      if (k in r) throw new Error(`[décors] ${champ}.${k} défini deux fois (familles ${origine[k]} et ${nom})`);
      r[k] = v;
      origine[k] = nom;
    }
  }
  return r;
}
const fusion = (champ) => fusionner(FAMILLES, champ);

export const MEUBLES = fusion('MEUBLES');
export const ANIMES = fusion('ANIMES');
export const JEUX = fusion('JEUX');
export const THEMES = fusion('THEMES');
export const SOLS = fusion('SOLS');
export const MURS = fusion('MURS');
export const DECORS_MURS = fusion('DECORS_MURS');
export const CLICS = fusion('CLICS');
