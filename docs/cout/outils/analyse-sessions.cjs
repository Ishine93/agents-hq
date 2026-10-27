// Analyse des transcripts de sessions du QG : contexte de départ, tours, contexte max, tokens relus,
// sortie, outils, et fichiers lus par plusieurs sessions (exploration en double).
// Usage : node analyse-sessions.cjs --depuis 2026-10-26T18:00 <dossier projects/…> [<autre dossier>…]
// Les dossiers sont ceux de Claude Code pour un compte du QG, ex. <dossier du compte Claude du QG>/projects/<projet>
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const i = args.indexOf('--depuis');
const depuis = i >= 0 ? Date.parse(args.splice(i, 2)[1]) : 0;
const dirs = args;
const lectures = new Map(); // fichier -> [sessions]
const lignes = [];
for (const dir of dirs) {
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    const p = path.join(dir, f);
    if (fs.statSync(p).mtimeMs < depuis) continue;
    const L = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    let titre = '';
    let premier = null, max = 0, tours = 0, cacheLu = 0, sortie = 0, modele = '';
    const outils = {};
    const vus = new Set();
    let premierUser = '';
    let tailleResultats = 0;
    const msgIds = new Set();
    for (const o of L) {
      if (o.type === 'custom-title' || o.type === 'ai-title') titre = o.customTitle || o.aiTitle || titre;
      if (o.type === 'summary' && !titre) titre = o.summary;
      if (o.type === 'user' && !premierUser) {
        const c = o.message?.content;
        premierUser = typeof c === 'string' ? c : (Array.isArray(c) ? c.map((b) => b.text || '').join(' ') : '');
      }
      if (o.type === 'user' && Array.isArray(o.message?.content)) {
        for (const b of o.message.content) if (b.type === 'tool_result') {
          const t = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '');
          tailleResultats += t.length;
        }
      }
      if (o.type === 'assistant' && o.message?.usage) {
        const id = o.message.id;
        const u = o.message.usage;
        const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        if (!msgIds.has(id)) {
          msgIds.add(id);
          tours++;
          cacheLu += u.cache_read_input_tokens || 0;
          sortie += u.output_tokens || 0;
          if (premier == null) premier = ctx;
          if (ctx > max) max = ctx;
        }
        modele = o.message.model || modele;
        for (const b of o.message.content || []) if (b.type === 'tool_use') {
          outils[b.name] = (outils[b.name] || 0) + 1;
          if (b.name === 'Read' && b.input?.file_path) {
            const fp = b.input.file_path.toLowerCase().replace(/\\/g, '/');
            if (!vus.has(fp)) { vus.add(fp); (lectures.get(fp) || lectures.set(fp, []).get(fp)).push(f.slice(0, 8)); }
          }
        }
      }
    }
    lignes.push({ s: f.slice(0, 8), dir: path.basename(dir), modele: modele.replace('claude-', ''), titre: titre.slice(0, 50), tache: premierUser.slice(0, 70).replace(/\s+/g, ' '), tours, premier, max, cacheLuM: +(cacheLu / 1e6).toFixed(2), sortieK: Math.round(sortie / 1000), resultatsK: Math.round(tailleResultats / 4000), outils: Object.entries(outils).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k.replace('mcp__qg__', 'qg:')}:${v}`).join(' ') });
  }
}
lignes.sort((a, b) => b.cacheLuM - a.cacheLuM);
for (const l of lignes) console.log(JSON.stringify(l));
console.log('\n--- fichiers lus par plusieurs sessions ---');
const multi = [...lectures.entries()].filter(([, s]) => s.length > 1).sort((a, b) => b[1].length - a[1].length);
for (const [fp, s] of multi.slice(0, 40)) {
  let taille = 0;
  try { taille = fs.statSync(fp).size; } catch {}
  console.log(`${s.length}x  ${Math.round(taille / 4000)}k tok  ${fp}`);
}
