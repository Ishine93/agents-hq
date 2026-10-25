// Rendu Markdown des textes du DG, des agents et des fichiers .md : titres, gras, italique, barré,
// code, listes (imbriquées, cases à cocher), citations, tableaux, liens, séparateurs.
// Construit des nœuds DOM un par un : aucun HTML venant d'un texte n'est jamais interprété.
// opts.fichier(chemin) : rend cliquables les chemins de fichiers lisibles (.md, .txt, .json…).
// opts.titres : 'compact' (messages : titres réduits) ou 'plein' (visionneur).

import { t } from './i18n.js';

const EXT_LISIBLE =/\.(md|markdown|txt|json|csv|log|ya?ml|toml|lua|luau|js|mjs|ts|py|html|css)$/i;
const CHEMIN = /^(?:[A-Za-z]:[\\/]|\.{0,2}[\\/])?[\w\-. ()À-ÿ]+(?:[\\/][\w\-. ()À-ÿ]+)*\.[A-Za-z0-9]{1,8}$/;

function el(tag, cls, ...enfants) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const c of enfants.flat()) if (c !== null && c !== undefined) e.append(c);
  return e;
}

const estChemin = (s) => EXT_LISIBLE.test(s) && CHEMIN.test(s.trim()) && !/^https?:/i.test(s);

function lienFichier(texte, chemin, opts, code = false) {
  const b = el('button', 'md-fichier' + (code ? ' code' : ''), texte);
  b.type = 'button';
  b.title = t('Ouvrir {chemin}', { chemin });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.fichier(chemin.trim());
  });
  return b;
}

// ---------------------------------------------------------------- en ligne

const RE_LIGNE = new RegExp(
  [
    '(`+)([^`]|[^`][\\s\\S]*?[^`])\\1(?!`)', // 1,2 code
    '\\*\\*(?=\\S)([\\s\\S]*?\\S)\\*\\*', // 3 gras
    '__(?=\\S)([\\s\\S]*?\\S)__', // 4 gras
    '~~(?=\\S)([\\s\\S]*?\\S)~~', // 5 barré
    '\\*(?=[^\\s*])([^*]*?[^\\s*])\\*', // 6 italique
    '(?<![\\w])_(?=[^\\s_])([^_]*?[^\\s_])_(?![\\w])', // 7 italique
    '!?\\[([^\\]]+)\\]\\(<?([^)\\s>]+)>?(?:\\s+"[^"]*")?\\)', // 8,9 lien (ou image, rendue en lien)
    '(https?:\\/\\/[^\\s<>()]+[^\\s<>().,;:!?\'"])', // 10 adresse
  ].join('|'),
  'g',
);

export function enLigne(texte, opts = {}) {
  const sortie = [];
  let dernier = 0;
  const brut = (s) => {
    if (!s) return;
    // chemins de fichiers dans le texte simple (ex. « voir docs/plan.md »)
    if (opts.fichier && /\.(md|markdown|txt|json)\b/i.test(s)) {
      const morceaux = s.split(/((?:[A-Za-z]:[\\/])?(?:[\w\-.À-ÿ]+[\\/])*[\w\-.À-ÿ]+\.(?:md|markdown|txt|json))(?![\w.])/g);
      morceaux.forEach((m, i) => {
        if (!m) return;
        if (i % 2 && estChemin(m)) sortie.push(lienFichier(m, m, opts));
        else sortie.push(document.createTextNode(m));
      });
      return;
    }
    sortie.push(document.createTextNode(s));
  };
  // Une expression neuve par appel : enLigne s'appelle elle-même (gras dans un lien…), un lastIndex
  // partagé ferait boucler l'appel parent.
  const re = new RegExp(RE_LIGNE.source, 'g');
  let m;
  while ((m = re.exec(texte))) {
    brut(texte.slice(dernier, m.index));
    dernier = m.index + m[0].length;
    if (m[2] !== undefined) {
      const code = m[2].replace(/^ (.*) $/, '$1');
      sortie.push(opts.fichier && estChemin(code) ? lienFichier(code, code, opts, true) : el('code', null, code));
    } else if (m[3] !== undefined || m[4] !== undefined) sortie.push(el('strong', null, enLigne(m[3] ?? m[4], opts)));
    else if (m[5] !== undefined) sortie.push(el('del', null, enLigne(m[5], opts)));
    else if (m[6] !== undefined || m[7] !== undefined) sortie.push(el('em', null, enLigne(m[6] ?? m[7], opts)));
    else if (m[8] !== undefined) {
      const cible = m[9];
      if (/^https?:\/\//i.test(cible)) {
        const a = el('a', null, enLigne(m[8], opts));
        a.href = cible;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        sortie.push(a);
      } else if (opts.fichier && estChemin(decodeURI(cible))) sortie.push(lienFichier(m[8], decodeURI(cible), opts));
      else sortie.push(document.createTextNode(m[8]));
    } else if (m[10] !== undefined) {
      const a = el('a', null, m[10]);
      a.href = m[10];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      sortie.push(a);
    }
  }
  brut(texte.slice(dernier));
  return sortie;
}

// ---------------------------------------------------------------- blocs

const RE_LISTE = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const RE_SEP_TABLEAU = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const cellules = (ligne) => {
  let l = ligne.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|') && !l.endsWith('\\|')) l = l.slice(0, -1);
  return l.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
};

function titre(niveau, contenu, opts) {
  const n = opts.titres === 'plein' ? niveau : Math.min(6, niveau + 2);
  return el('h' + n, 'md-h' + niveau, contenu);
}

function liste(lignes, i, opts) {
  // lignes[i] est un élément de liste ; on consomme tant que l'on reste dans la liste.
  const indent0 = RE_LISTE.exec(lignes[i])[1].length;
  const ordonnee = /\d/.test(RE_LISTE.exec(lignes[i])[2]);
  const racine = el(ordonnee ? 'ol' : 'ul', 'md-liste');
  if (ordonnee) {
    const debut = parseInt(RE_LISTE.exec(lignes[i])[2], 10);
    if (debut > 1) racine.start = debut;
  }
  let li = null;
  while (i < lignes.length) {
    const ligne = lignes[i];
    const m = RE_LISTE.exec(ligne);
    if (m && m[1].length === indent0) {
      let texte = m[3];
      li = el('li');
      const tache = /^\[([ xX])\]\s+(.*)$/.exec(texte);
      if (tache) {
        li.className = 'md-tache' + (tache[1] !== ' ' ? ' faite' : '');
        li.append(el('span', 'md-case', tache[1] !== ' ' ? '☑' : '☐'), ' ');
        texte = tache[2];
      }
      li.append(...enLigne(texte, opts));
      racine.append(li);
      i++;
    } else if (m && m[1].length > indent0 && li) {
      const [sous, j] = liste(lignes, i, opts);
      li.append(sous);
      i = j;
    } else if (!m && li && ligne.trim() && /^\s{2,}/.test(ligne)) {
      li.append(el('br'), ...enLigne(ligne.trim(), opts));
      i++;
    } else break;
  }
  return [racine, i];
}

/** Texte Markdown → élément <div class="md"> prêt à insérer. */
export function md(texte, opts = {}) {
  const racine = el('div', 'md' + (opts.classe ? ' ' + opts.classe : ''));
  const lignes = String(texte ?? '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let para = [];
  const finirPara = () => {
    if (!para.length) return;
    const p = el('p');
    para.forEach((l, k) => {
      if (k) p.append(el('br'));
      p.append(...enLigne(l, opts));
    });
    racine.append(p);
    para = [];
  };
  while (i < lignes.length) {
    const ligne = lignes[i];
    const cloture = /^\s*(```+|~~~+)\s*([\w+-]*)\s*$/.exec(ligne);
    if (cloture) {
      finirPara();
      const fin = cloture[1];
      const code = [];
      i++;
      while (i < lignes.length && !lignes[i].trim().startsWith(fin)) code.push(lignes[i++]);
      i++;
      const pre = el('pre', 'md-code', el('code', cloture[2] ? 'lang-' + cloture[2] : null, code.join('\n')));
      racine.append(pre);
      continue;
    }
    if (!ligne.trim()) {
      finirPara();
      i++;
      continue;
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(ligne);
    if (h) {
      finirPara();
      racine.append(titre(h[1].length, enLigne(h[2], opts), opts));
      i++;
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(ligne)) {
      finirPara();
      racine.append(el('hr'));
      i++;
      continue;
    }
    if (/^\s{0,3}>/.test(ligne)) {
      finirPara();
      const cite = [];
      while (i < lignes.length && /^\s{0,3}>/.test(lignes[i])) cite.push(lignes[i++].replace(/^\s{0,3}>\s?/, ''));
      racine.append(el('blockquote', null, md(cite.join('\n'), opts)));
      continue;
    }
    if (ligne.includes('|') && i + 1 < lignes.length && RE_SEP_TABLEAU.test(lignes[i + 1]) && lignes[i + 1].includes('-')) {
      finirPara();
      const entetes = cellules(ligne);
      const aligns = cellules(lignes[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
      i += 2;
      const table = el('table', 'md-tableau');
      const tr = el('tr');
      entetes.forEach((c, k) => {
        const th = el('th', null, enLigne(c, opts));
        if (aligns[k]) th.style.textAlign = aligns[k];
        tr.append(th);
      });
      const corps = el('tbody');
      while (i < lignes.length && lignes[i].includes('|') && lignes[i].trim()) {
        const r = el('tr');
        const cs = cellules(lignes[i]);
        for (let k = 0; k < Math.max(entetes.length, cs.length); k++) {
          const td = el('td', null, enLigne(cs[k] ?? '', opts));
          if (aligns[k]) td.style.textAlign = aligns[k];
          r.append(td);
        }
        corps.append(r);
        i++;
      }
      table.append(el('thead', null, tr), corps);
      racine.append(el('div', 'md-tableau-boite', table));
      continue;
    }
    if (RE_LISTE.test(ligne) && (!para.length || /^\s*([-*+]|1[.)])\s/.test(ligne))) {
      finirPara();
      const [l, j] = liste(lignes, i, opts);
      racine.append(l);
      i = j;
      continue;
    }
    para.push(ligne);
    i++;
  }
  finirPara();
  return racine;
}
