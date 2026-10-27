// Simule la compaction sur de vrais transcripts : on rejoue la suite des tailles de contexte, appel par
// appel, et dès qu'elle dépasse le seuil, le contexte retombe à « apres » (instructions + résumé), puis
// recommence à grossir du même pas que dans la vraie session. Donne les tokens relus avec et sans compaction.
// Usage : node simuler-compaction.cjs <transcript.jsonl> [seuils séparés par des virgules] [apres]
// ex.   : node simuler-compaction.cjs eb722ae1-….jsonl 150000,200000,300000 40000
const fs = require('fs');
const [fichier, seuilsTxt = '150000,200000,250000,300000', apresTxt = '40000'] = process.argv.slice(2);
const apres = Number(apresTxt);
const vus = new Set();
const contextes = [];
for (const ligne of fs.readFileSync(fichier, 'utf8').split('\n')) {
  if (!ligne) continue;
  let o;
  try {
    o = JSON.parse(ligne);
  } catch {
    continue;
  }
  if (o.type !== 'assistant' || !o.message?.usage || vus.has(o.message.id)) continue;
  vus.add(o.message.id);
  const u = o.message.usage;
  contextes.push((u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0));
}
const somme = (t) => t.reduce((s, x) => s + x, 0);
const reel = somme(contextes);
const M = (x) => (x / 1e6).toFixed(1) + ' M';
console.log(`${contextes.length} appels, contexte max ${Math.round(Math.max(...contextes) / 1000)} k, tokens relus ${M(reel)}`);
for (const seuil of seuilsTxt.split(',').map(Number)) {
  let decalage = 0; // ce que la compaction a retiré
  let compactions = 0;
  let total = 0;
  for (let i = 0; i < contextes.length; i++) {
    let c = contextes[i] - decalage;
    if (c > seuil) {
      compactions++;
      total += c; // l'appel de compaction relit tout une dernière fois
      decalage += c - apres;
      c = apres;
    }
    total += c;
  }
  console.log(`seuil ${seuil / 1000} k : ${compactions} compaction(s), relus ${M(total)} (${Math.round((100 * (total - reel)) / reel)} %)`);
}
