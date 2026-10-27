// Sortie structurée des IA autres que Claude (Codex, agents ACP) : le SDK Claude valide lui-même la sortie ;
// ailleurs, le QG lit le JSON final, le vérifie contre le schéma demandé et, s'il est invalide, relance une fois
// la même conversation avec la liste des erreurs. Validateur maison (aucune dépendance) : il couvre ce que les
// schémas du QG utilisent (type, properties, required, additionalProperties, items, enum, const, bornes,
// anyOf/oneOf/allOf, $ref local). Un outil MCP « rendre_resultat » peut aussi recevoir la sortie (agents ACP).

export const RELANCES_STRUCTURE = 1;
const ERREURS_MAX = 12;

const typeDe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const accepte = (attendu, v) => {
  const t = typeDe(v);
  if (attendu === t) return true;
  if (attendu === 'number') return t === 'integer' || t === 'number';
  return false;
};
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function resoudre(ref, racine) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) return null;
  let o = racine;
  for (const p of ref.slice(1).split('/').filter(Boolean)) {
    o = o?.[decodeURIComponent(p).replace(/~1/g, '/').replace(/~0/g, '~')];
    if (o === undefined) return null;
  }
  return o;
}

/** Erreurs de `valeur` au regard de `schema` : [] si conforme, sinon des lignes « chemin : problème ». */
export function validerSchema(valeur, schema, chemin = '$', erreurs = [], racine = schema) {
  if (erreurs.length >= ERREURS_MAX || schema === true || schema == null) return erreurs;
  if (schema === false) {
    erreurs.push(`${chemin} : aucune valeur permise ici`);
    return erreurs;
  }
  if (schema.$ref) {
    const cible = resoudre(schema.$ref, racine);
    if (cible) validerSchema(valeur, cible, chemin, erreurs, racine);
    return erreurs;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => accepte(t, valeur))) {
      erreurs.push(`${chemin} : attendu ${types.join(' ou ')}, reçu ${typeDe(valeur)}`);
      return erreurs;
    }
  }
  if ('const' in schema && !egal(schema.const, valeur)) erreurs.push(`${chemin} : doit valoir ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => egal(e, valeur))) {
    erreurs.push(`${chemin} : ${JSON.stringify(valeur)} n'est pas permis (valeurs : ${schema.enum.map((e) => JSON.stringify(e)).join(', ')})`);
  }
  if (typeof valeur === 'string') {
    if (schema.minLength != null && valeur.length < schema.minLength) erreurs.push(`${chemin} : ${schema.minLength} caractères au moins`);
    if (schema.maxLength != null && valeur.length > schema.maxLength) erreurs.push(`${chemin} : ${schema.maxLength} caractères au plus`);
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern, 'u').test(valeur)) erreurs.push(`${chemin} : ne suit pas le motif ${schema.pattern}`);
      } catch {
        /* motif illisible : ignoré */
      }
    }
  }
  if (typeof valeur === 'number') {
    if (schema.minimum != null && valeur < schema.minimum) erreurs.push(`${chemin} : ${schema.minimum} au moins`);
    if (schema.maximum != null && valeur > schema.maximum) erreurs.push(`${chemin} : ${schema.maximum} au plus`);
    if (schema.exclusiveMinimum != null && valeur <= schema.exclusiveMinimum) erreurs.push(`${chemin} : plus de ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum != null && valeur >= schema.exclusiveMaximum) erreurs.push(`${chemin} : moins de ${schema.exclusiveMaximum}`);
  }
  if (Array.isArray(valeur)) {
    if (schema.minItems != null && valeur.length < schema.minItems) erreurs.push(`${chemin} : ${schema.minItems} éléments au moins`);
    if (schema.maxItems != null && valeur.length > schema.maxItems) erreurs.push(`${chemin} : ${schema.maxItems} éléments au plus`);
    if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
      valeur.forEach((v, i) => validerSchema(v, schema.items, `${chemin}[${i}]`, erreurs, racine));
    }
  }
  if (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) {
    const props = schema.properties || {};
    for (const r of schema.required || []) if (!(r in valeur)) erreurs.push(`${chemin}.${r} : champ obligatoire absent`);
    for (const [k, v] of Object.entries(valeur)) {
      if (k in props) validerSchema(v, props[k], `${chemin}.${k}`, erreurs, racine);
      else if (schema.additionalProperties === false) erreurs.push(`${chemin}.${k} : champ non prévu par le schéma`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validerSchema(v, schema.additionalProperties, `${chemin}.${k}`, erreurs, racine);
    }
  }
  if (Array.isArray(schema.allOf)) for (const s of schema.allOf) validerSchema(valeur, s, chemin, erreurs, racine);
  for (const cle of ['anyOf', 'oneOf']) {
    if (!Array.isArray(schema[cle])) continue;
    const ok = schema[cle].filter((s) => validerSchema(valeur, s, chemin, [], racine).length === 0).length;
    if (cle === 'anyOf' ? ok === 0 : ok !== 1) erreurs.push(`${chemin} : ne correspond à ${cle === 'anyOf' ? 'aucune' : ok ? 'plusieurs' : 'aucune'} des formes permises`);
  }
  return erreurs.slice(0, ERREURS_MAX);
}

/** JSON contenu dans un message final : le texte entier, sinon un bloc ```json, sinon du premier { au dernier }. */
export function extraireJson(texte) {
  const s = String(texte ?? '').trim();
  if (!s) return { ok: false, erreur: 'réponse vide' };
  const essais = [s];
  const bloc = /```(?:json)?\s*\n([\s\S]*?)\n?```/i.exec(s);
  if (bloc) essais.push(bloc[1].trim());
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) essais.push(s.slice(a, b + 1));
  let derniere = null;
  for (const e of essais) {
    try {
      return { ok: true, valeur: JSON.parse(e) };
    } catch (err) {
      derniere = err.message;
    }
  }
  return { ok: false, erreur: `JSON illisible (${derniere})` };
}

/** Lit et vérifie la sortie structurée d'un message final : { structure, erreurs } (structure null si invalide). */
export function lireStructure(texte, schema) {
  const j = extraireJson(texte);
  if (!j.ok) return { structure: null, erreurs: [j.erreur] };
  const erreurs = validerSchema(j.valeur, schema);
  return erreurs.length ? { structure: null, erreurs } : { structure: j.valeur, erreurs: [] };
}

/** Message de relance (même conversation) quand la sortie structurée est invalide. */
export const consigneRelance = (erreurs) =>
  [
    'Ta réponse finale ne respecte pas le schéma de sortie structurée demandé :',
    ...erreurs.slice(0, ERREURS_MAX).map((e) => `- ${e}`),
    'Ne refais pas le travail. Rends maintenant uniquement le JSON corrigé et complet, conforme au schéma, sans texte autour.',
  ].join('\n');

/**
 * Outil MCP du QG qui reçoit la sortie structurée (agents sans sortie structurée native) : il vérifie les
 * arguments contre le schéma et répond par les erreurs, que l'agent corrige dans le même tour.
 * @param surSoumission(valeur) appelé avec la sortie valide
 */
export function outilSoumission(schema, surSoumission) {
  return {
    nom: 'rendre_resultat',
    description: 'Rends ici ta réponse finale structurée (les champs du schéma). Appelle cet outil une fois, à la fin ; s’il signale des erreurs, corrige et rappelle-le.',
    schemaJson: schema,
    executer: async (args) => {
      const erreurs = validerSchema(args, schema);
      if (erreurs.length) return { isError: true, content: [{ type: 'text', text: consigneRelance(erreurs) }] };
      surSoumission(args);
      return { content: [{ type: 'text', text: 'Résultat reçu par le QG. Tu as terminé : ne réponds plus rien d’autre.' }] };
    },
  };
}
