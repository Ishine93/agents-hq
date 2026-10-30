// Lance la récolte massive du happiness manager (blagues, anecdotes, phrases de pause) jusqu'aux cibles.
// Usage : node serveur/recolte-massive.js [maxAppels] [langue] [fichier de sortie]
// Sans fichier de sortie, le stock de la langue (runtime/) est complété.
const [, , max = '40', langue, fichier] = process.argv;
if (langue) process.env.QG_BONHEUR_LANGUE = langue;
if (fichier) process.env.QG_BONHEUR_FICHIER = fichier;
const { recolterMassif, CIBLES } = await import('./bonheur.js');
console.log(`Cibles : ${CIBLES.blagues} blagues, ${CIBLES.faits} anecdotes, ${CIBLES.ambiance} phrases — ${max} appels au modèle au plus (Sonnet pour les blagues, Haiku pour le reste chez Claude).`);
const t0 = Date.now();
await recolterMassif({ maxAppels: Number(max) || 40, journal: (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s  ${m}`) });
process.exit(0);
