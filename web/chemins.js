// A* sur la grille d'un étage (4 voisins, cloisons sur les arêtes, mobilier bloquant).
import { praticable, cloisonEntre } from './carte.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Retourne la liste des cases à parcourir (départ exclu, arrivée incluse).
// Si l'arrivée est inaccessible, s'arrête au plus près.
export function chercherChemin(carte, depart, arrivee) {
  const W = carte.W;
  const H = carte.H;
  const sx = Math.max(0, Math.min(W - 1, depart.x | 0));
  const sy = Math.max(0, Math.min(H - 1, depart.y | 0));
  const tx = arrivee.x | 0;
  const ty = arrivee.y | 0;
  if (sx === tx && sy === ty) return [];
  const N = W * H;
  const g = new Float32Array(N).fill(Infinity);
  const f = new Float32Array(N).fill(Infinity);
  const parent = new Int32Array(N).fill(-1);
  const dirDe = new Int8Array(N).fill(-1);
  const ferme = new Uint8Array(N);
  const ouvert = [];
  const si = sy * W + sx;
  const ti = ty * W + tx;
  const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);
  g[si] = 0;
  f[si] = h(sx, sy);
  ouvert.push(si);
  let meilleur = si;
  let meilleurH = h(sx, sy);
  while (ouvert.length) {
    let k = 0;
    for (let i = 1; i < ouvert.length; i++) if (f[ouvert[i]] < f[ouvert[k]]) k = i;
    const cur = ouvert[k];
    ouvert[k] = ouvert[ouvert.length - 1];
    ouvert.pop();
    if (cur === ti) break;
    if (ferme[cur]) continue;
    ferme[cur] = 1;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    const hc = h(cx, cy);
    if (hc < meilleurH) {
      meilleurH = hc;
      meilleur = cur;
    }
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0];
      const ny = cy + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (ferme[ni]) continue;
      if (ni !== ti && !praticable(carte, nx, ny)) continue;
      if (cloisonEntre(carte, cx, cy, DIRS[d][0], DIRS[d][1])) continue;
      const virage = dirDe[cur] !== -1 && dirDe[cur] !== d ? 0.05 : 0;
      const ng = g[cur] + 1 + virage;
      if (ng < g[ni]) {
        g[ni] = ng;
        f[ni] = ng + h(nx, ny);
        parent[ni] = cur;
        dirDe[ni] = d;
        ouvert.push(ni);
      }
    }
  }
  let fin = parent[ti] !== -1 ? ti : meilleur;
  const chemin = [];
  while (fin !== -1 && fin !== si) {
    chemin.push({ x: fin % W, y: (fin / W) | 0 });
    fin = parent[fin];
  }
  chemin.reverse();
  return chemin;
}
