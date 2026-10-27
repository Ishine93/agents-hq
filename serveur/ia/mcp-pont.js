// Pont MCP stdio → HTTP pour les agents ACP qui ne savent parler MCP qu'en stdio (mcpCapabilities.http absent) :
// l'agent lance `node mcp-pont.js <url>` ; chaque message JSON-RPC lu sur stdin (une ligne) est envoyé en POST
// à la route MCP du QG (/mcp/agents) avec le jeton de la session (variable QG_MCP_JETON, jamais en argument),
// et la réponse est écrite sur stdout. Une notification (réponse 202) ne donne rien. Aucune dépendance.
const url = process.argv[2];
const jeton = process.env.QG_MCP_JETON || '';
let reste = '';
let enCours = 0;
let finEntree = false;

const ecrire = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const terminerSiFini = () => {
  if (finEntree && enCours === 0) process.exit(0);
};

async function transmettre(ligne) {
  let msg;
  try {
    msg = JSON.parse(ligne);
  } catch {
    return ecrire({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON illisible' } });
  }
  enCours += 1;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${jeton}` }, body: JSON.stringify(msg) });
    if (r.status === 202) return;
    const texte = await r.text();
    if (!r.ok) {
      if (msg?.id !== undefined && msg?.id !== null) ecrire({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `QG : HTTP ${r.status}` } });
      return;
    }
    const corps = JSON.parse(texte);
    for (const m of Array.isArray(corps) ? corps : [corps]) ecrire(m);
  } catch (e) {
    if (msg?.id !== undefined && msg?.id !== null) ecrire({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `QG injoignable : ${e.message}` } });
  } finally {
    enCours -= 1;
    terminerSiFini();
  }
}

if (!url) {
  process.stderr.write('usage : node mcp-pont.js <url du QG>\n');
  process.exit(2);
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (morceau) => {
  reste += morceau;
  let i;
  while ((i = reste.indexOf('\n')) >= 0) {
    const ligne = reste.slice(0, i).trim();
    reste = reste.slice(i + 1);
    if (ligne) transmettre(ligne);
  }
});
process.stdin.on('end', () => {
  if (reste.trim()) transmettre(reste.trim());
  finEntree = true;
  terminerSiFini();
});
