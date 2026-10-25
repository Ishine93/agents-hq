// Recherche du plus court chemin sur une grille (0 = libre, 1 = mur), déplacements en 4 directions.
// Renvoie la liste des cases [x, y] du départ à l'arrivée, ou null si aucun chemin.
export function trouverChemin(grille, depart, arrivee) {
  const hauteur = grille.length;
  const largeur = grille[0]?.length ?? 0;
  const cle = ([x, y]) => `${x},${y}`;
  const libre = ([x, y]) => x >= 0 && y >= 0 && x < largeur && y < hauteur && grille[y][x] === 0;
  if (!libre(depart) || !libre(arrivee)) return null;

  const file = [depart];
  const precedent = new Map([[cle(depart), null]]);
  while (file.length) {
    const courant = file.shift();
    if (courant[0] === arrivee[0] && courant[1] === arrivee[1]) {
      const chemin = [];
      for (let c = courant; c; c = precedent.get(cle(c))) chemin.unshift(c);
      return chemin;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const voisin = [courant[0] + dx, courant[1] + dy];
      if (libre(voisin) && !precedent.has(cle(voisin))) {
        precedent.set(cle(voisin), courant);
        file.push(voisin);
      }
    }
  }
  return null;
}

// Génère une grille pseudo-aléatoire reproductible (graine), avec une densité de murs donnée.
export function grilleAleatoire(largeur, hauteur, densite = 0.25, graine = 1) {
  let s = graine;
  const alea = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: hauteur }, (_, y) =>
    Array.from({ length: largeur }, (_, x) => ((x === 0 && y === 0) || (x === largeur - 1 && y === hauteur - 1) ? 0 : alea() < densite ? 1 : 0)),
  );
}
