// Easter eggs des décors (1.0.11) : un clic sur un meuble « cliquable » lance une petite scène visuelle de quelques
// secondes (la fusée qui décolle, le requin qui saute dans la lave…), puis tout revient comme avant.
// Tout reste dans le navigateur : rien n'est envoyé au serveur ni enregistré. Logique pure (sans DOM), testée dans
// tests/clics-decor.test.js ; le dessin est dans web/decor.js (animerMeuble) et dans les familles (web/meubles/).
//
// Déclaration (web/meubles/<famille>.js ou CLICS_BASE de web/decor.js) :
//   CLICS[type] = {
//     duree: 6000,              // ms, obligatoire (au plus DUREE_MAX)
//     declenche: ['autre_type'], // facultatif : meubles du même étage animés en même temps (même départ)
//     phases: [7000],           // facultatif : instants (ms) qui découpent l'effet en phases 1, 2, 3…
//   }
// Pendant l'effet, chaque meuble concerné (le meuble cliqué et ceux de `declenche`) reçoit :
//   - à son dessin fixe : etat.effet = numéro de phase (1, 2…) ; absent hors effet (pour changer d'apparence) ;
//   - à son animation : un objet effet { depuis, duree, progres, phase, source, clique } (voir effetDe).

export const DUREE_MAX = 20000;

const cle = (it) => it.x + ',' + it.y;

/** Phase d'un effet à l'instant `depuis` : 1 avant le premier seuil, puis 2, 3… */
export function phaseDe(def, depuis) {
  let p = 1;
  for (const s of def.phases || []) if (depuis >= s) p++;
  return p;
}

/** Erreurs d'une table CLICS (types inconnus, durées absentes…) ; `existe(type)` dit si un meuble est dessinable. */
export function verifierClics(clics, existe = () => true) {
  const erreurs = [];
  for (const [type, d] of Object.entries(clics || {})) {
    if (!d || typeof d !== 'object') {
      erreurs.push(`${type} : déclaration manquante`);
      continue;
    }
    if (!(d.duree > 0) || d.duree > DUREE_MAX) erreurs.push(`${type} : duree doit être entre 1 et ${DUREE_MAX} ms`);
    if (!existe(type)) erreurs.push(`${type} : meuble inconnu`);
    for (const t of d.declenche || []) if (!existe(t)) erreurs.push(`${type} : declenche un meuble inconnu (${t})`);
    const ph = d.phases || [];
    if (!Array.isArray(ph) || ph.some((s, i) => !(s > 0) || s >= d.duree || (i && s <= ph[i - 1]))) {
      erreurs.push(`${type} : phases doivent croître entre 0 et duree`);
    }
  }
  return erreurs;
}

/** Les effets en cours sur un étage (une instance par scène, vidée au changement d'étage). */
export class EffetsDecor {
  constructor(clics) {
    this.clics = clics || {};
    this.actifs = new Map(); // case du meuble cliqué -> { it, def, t0 }
  }

  /** Déclaration de clic de ce meuble, ou null s'il n'est pas cliquable. */
  cliquable(it) {
    return (it && this.clics[it.type]) || null;
  }

  vider() {
    this.actifs.clear();
  }

  /** Lance l'effet d'un meuble cliquable ; sans effet s'il tourne déjà. Rend true si un effet démarre. */
  declencher(it, now) {
    const def = this.cliquable(it);
    if (!def) return false;
    const k = cle(it);
    const e = this.actifs.get(k);
    if (e && now - e.t0 < e.def.duree) return false;
    this.actifs.set(k, { it, def, t0: now });
    return true;
  }

  /** Un effet tourne-t-il encore (pour garder la cadence d'images pendant l'effet) ? Oublie ceux qui sont finis. */
  actif(now = performance.now()) {
    for (const [k, e] of this.actifs) if (now - e.t0 >= e.def.duree) this.actifs.delete(k);
    return this.actifs.size > 0;
  }

  /**
   * Effet en cours pour ce meuble (cliqué, ou déclenché par un autre), ou null :
   * { depuis (ms depuis le clic), duree, progres (0 → 1), phase (1, 2…), source ({ type, x, y } du meuble cliqué),
   *   clique (ce meuble est celui qu'on a cliqué) }. Le plus récent gagne si plusieurs effets le concernent.
   */
  effetDe(it, now) {
    let r = null;
    for (const e of this.actifs.values()) {
      const depuis = now - e.t0;
      if (depuis < 0 || depuis >= e.def.duree) continue;
      const clique = e.it.x === it.x && e.it.y === it.y && e.it.type === it.type;
      if (!clique && !(e.def.declenche || []).includes(it.type)) continue;
      if (r && r.depuis <= depuis) continue;
      r = {
        depuis,
        duree: e.def.duree,
        progres: depuis / e.def.duree,
        phase: phaseDe(e.def, depuis),
        source: { type: e.it.type, x: e.it.x, y: e.it.y },
        clique,
      };
    }
    return r;
  }
}
