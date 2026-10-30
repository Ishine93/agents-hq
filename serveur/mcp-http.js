// Outils du QG exposés en MCP « streamable HTTP » (POST /mcp/agents) pour les fournisseurs qui ne peuvent pas
// appeler le serveur MCP en processus du SDK Claude (Codex, agents ACP). Mêmes définitions que pour Claude
// (outils-qg.js). Authentification : un jeton aléatoire par session, lié à ses outils, révoqué à la fin de la
// session. Ce n'est pas le jeton du site. Méthodes : initialize, ping, tools/list, tools/call.
import crypto from 'node:crypto';
import { z } from 'zod';
import { validerSchema } from './ia/schema.js';

const sessions = new Map(); // jeton → { definitions, cree }
let adresse = null;

export const definirAdresseMcp = (url) => (adresse = url);
export const adresseMcp = () => adresse;
export const nbJetons = () => sessions.size;

/**
 * @param definitions [{ nom, description, schema (forme zod), executer(args) }] (outils-qg.js › definitionsQg) ;
 *   ou schemaJson (schéma JSON brut, vérifié par ia/schema.js) à la place de schema : outil rendre_resultat.
 */
export function creerJetonMcp(definitions) {
  const jeton = crypto.randomBytes(24).toString('hex');
  sessions.set(jeton, { definitions, cree: Date.now() });
  return jeton;
}
export const revoquerJetonMcp = (jeton) => (jeton ? sessions.delete(jeton) : false);

function schemaJson(forme) {
  try {
    const s = z.toJSONSchema(z.object(forme), { io: 'input' });
    delete s.$schema;
    return s;
  } catch {
    return { type: 'object', properties: {} };
  }
}

const erreurRpc = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** Traite un message JSON-RPC pour une session ; rend la réponse, ou null pour une notification. */
export async function traiterMcp(jeton, msg) {
  const s = sessions.get(jeton);
  if (!s) return erreurRpc(msg?.id, -32001, 'jeton inconnu ou révoqué');
  if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') return erreurRpc(msg?.id, -32600, 'requête invalide');
  const { id, method, params = {} } = msg;
  if (id === undefined || id === null) return null; // notification (notifications/initialized…)
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'qg', version: '1.0.0' } } };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: s.definitions.map((o) => ({ name: o.nom, description: o.description, inputSchema: o.schemaJson || schemaJson(o.schema) })) } };
  }
  if (method === 'tools/call') {
    const o = s.definitions.find((x) => x.nom === params.name);
    if (!o) return erreurRpc(id, -32602, `outil inconnu : ${params.name}`);
    let args;
    try {
      if (o.schemaJson) {
        args = params.arguments || {};
        const erreurs = validerSchema(args, o.schemaJson);
        if (erreurs.length) throw new Error(erreurs.join(' ; '));
      } else args = z.object(o.schema).parse(params.arguments || {});
    } catch (e) {
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `arguments invalides : ${e.message}` }], isError: true } };
    }
    try {
      const r = await o.executer(args);
      return { jsonrpc: '2.0', id, result: { content: r?.content || [{ type: 'text', text: String(r ?? '') }], ...(r?.isError ? { isError: true } : {}) } };
    } catch (e) {
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `erreur de l'outil : ${e.message}` }], isError: true } };
    }
  }
  return erreurRpc(id, -32601, `méthode inconnue : ${method}`);
}

/** Route HTTP : POST /mcp/agents avec « Authorization: Bearer <jeton> ». Rend true si la requête a été traitée. */
export async function routeMcp(req, res, chemin, { lireCorps, json }) {
  if (chemin !== '/mcp/agents') return false;
  if (req.method === 'GET') return json(res, 405, { erreur: 'flux SSE non proposé : utilise POST' }), true;
  if (req.method !== 'POST') return json(res, 405, { erreur: 'méthode non permise' }), true;
  const jeton = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!sessions.has(jeton)) return json(res, 401, { erreur: 'jeton MCP inconnu ou révoqué' }), true;
  let corps;
  try {
    corps = await lireCorps(req, 4 * 1024 * 1024);
  } catch (e) {
    return json(res, 400, erreurRpc(null, -32700, e.message)), true;
  }
  if (Array.isArray(corps)) {
    const reponses = (await Promise.all(corps.map((m) => traiterMcp(jeton, m)))).filter(Boolean);
    if (!reponses.length) return res.writeHead(202).end(), true;
    return json(res, 200, reponses), true;
  }
  const r = await traiterMcp(jeton, corps);
  if (!r) return res.writeHead(202).end(), true;
  return json(res, 200, r), true;
}
