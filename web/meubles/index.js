// Dessin des décors au choix (1.0.10) : chaque famille (web/meubles/<famille>.js) apporte ses meubles, ses sols, ses
// murs et ses thèmes ; web/decor.js s'en sert pour tout ce qu'il ne dessine pas lui-même.
//
// Contrat d'un module de famille (tous les champs sont des objets, éventuellement vides) :
// - MEUBLES[type] = (it, typeTheme, etat, O) => sprite. `it` : le meuble du plan (x, y, w, h, dir, variante…) ;
//   `typeTheme` : le thème visuel de l'étage (carte.look) ; `O` : les outils de decor.js (spriteTuile, spriteBloc,
//   pieds, plante, theme…). Un sprite = { c: canvas, dx, dy } comme ceux de spriteTuile / spriteBloc.
// - ANIMES[type] = (g, it, tx, ty, t, O) => void : petite animation dessinée par-dessus le sprite (t en ms).
// - JEUX[type] = (g, it, tx, ty, t, actif, O) => void : animation d'un meuble de jeu (`jeu` dans le plan), `actif`
//   quand au moins deux joueurs sont installés (balle qui bouge…).
// - THEMES[cle] = { sols: { def: [motif, couleur], <zone>: [motif, couleur] }, mur, dalle, bureau, chaise, canape,
//   canapeEquipe, table } : même forme que les thèmes de decor.js ; `cle` est le `look` d'une carte.
// - SOLS[motif] = (g, col, { parite, variante, rnd, x, y }, O) => void : motif de sol, dessiné sur le losange de
//   base déjà peint de la couleur `col` (64 × 32 px).
// - MURS[motif] = (g, longueur, cote, rnd, O) => void : peinture d'un mur (canvas longueur × HW, cote 'droite' | 'gauche').
// - DECORS_MURS[look] = (g, cote, longueur, etage, O) => void : ce qu'on accroche aux murs de ce thème (fenêtres,
//   affiches…), à la place du décor mural par défaut ; appeler O.plaqueEtage(g, etage) sur le mur gauche.
import * as bureau from './bureau.js';
import * as direction from './direction.js';
import * as pause from './pause.js';
import * as repos from './repos.js';
import * as hall from './hall.js';
import * as serveur from './serveur.js';
import * as isoloir from './isoloir.js';

const FAMILLES = { bureau, direction, pause, repos, hall, serveur, isoloir };

function fusion(champ) {
  const r = {};
  for (const [nom, f] of Object.entries(FAMILLES)) {
    for (const [k, v] of Object.entries(f[champ] || {})) {
      if (k in r) console.warn(`[décors] ${champ}.${k} défini deux fois (famille ${nom})`);
      r[k] = v;
    }
  }
  return r;
}

export const MEUBLES = fusion('MEUBLES');
export const ANIMES = fusion('ANIMES');
export const JEUX = fusion('JEUX');
export const THEMES = fusion('THEMES');
export const SOLS = fusion('SOLS');
export const MURS = fusion('MURS');
export const DECORS_MURS = fusion('DECORS_MURS');
