// Lecture et écriture de tableurs sans dépendance : Excel (.xlsx, un zip de XML) et CSV.
// Sert à exporter, modifier dans Excel puis réimporter le stock du happiness manager.
import zlib from 'node:zlib';

// ---------------------------------------------------------------- zip

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipper(fichiers) {
  const locaux = [];
  const centraux = [];
  let decalage = 0;
  for (const [nom, contenu] of fichiers) {
    const donnees = Buffer.from(contenu, 'utf8');
    const comprime = zlib.deflateRawSync(donnees);
    const n = Buffer.from(nom, 'utf8');
    const crc = crc32(donnees);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(0x0800, 6);
    l.writeUInt16LE(8, 8);
    l.writeUInt16LE(0, 10);
    l.writeUInt16LE(0x21, 12);
    l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(comprime.length, 18);
    l.writeUInt32LE(donnees.length, 22);
    l.writeUInt16LE(n.length, 26);
    l.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12);
    c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comprime.length, 20);
    c.writeUInt32LE(donnees.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(decalage, 42);
    locaux.push(l, n, comprime);
    centraux.push(c, n);
    decalage += 30 + n.length + comprime.length;
  }
  const central = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(central.length, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, central, fin]);
}

function dezipper(buf) {
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("ce fichier n'est pas un classeur Excel (.xlsx)");
  const nombre = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const fichiers = new Map();
  for (let i = 0; i < nombre; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const methode = buf.readUInt16LE(p + 10);
    const taille = buf.readUInt32LE(p + 20);
    const ln = buf.readUInt16LE(p + 28);
    const le = buf.readUInt16LE(p + 30);
    const lc = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nom = buf.toString('utf8', p + 46, p + 46 + ln);
    const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const brut = buf.subarray(debut, debut + taille);
    if (brut.length > 50 * 1024 * 1024) throw new Error('classeur trop gros');
    fichiers.set(nom, methode === 8 ? zlib.inflateRawSync(brut, { maxOutputLength: 200 * 1024 * 1024 }) : brut);
    p += 46 + ln + le + lc;
  }
  return fichiers;
}

// ---------------------------------------------------------------- xlsx

const xml = (s) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const dexml = (s) =>
  String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
const lettre = (i) => String.fromCharCode(65 + i);

/** feuilles : [{ nom, colonnes: [{ titre, largeur }], lignes: [[…]] }] → Buffer .xlsx */
export function ecrireXlsx(feuilles) {
  const fichiers = [];
  fichiers.push([
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
  ]);
  fichiers.push([
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  ]);
  fichiers.push([
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${feuilles.map((f, i) => `<sheet name="${xml(f.nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
  ]);
  fichiers.push([
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  ]);
  fichiers.push([
    'xl/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>',
  ]);
  feuilles.forEach((f, i) => {
    const cellule = (v, r, c, style) => `<c r="${lettre(c)}${r}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    const lignes = [`<row r="1">${f.colonnes.map((col, c) => cellule(col.titre, 1, c, 1)).join('')}</row>`];
    f.lignes.forEach((ligne, j) => lignes.push(`<row r="${j + 2}">${ligne.map((v, c) => cellule(v, j + 2, c, 2)).join('')}</row>`));
    fichiers.push([
      `xl/worksheets/sheet${i + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${f.colonnes.map((col, c) => `<col min="${c + 1}" max="${c + 1}" width="${col.largeur || 40}" customWidth="1"/>`).join('')}</cols><sheetData>${lignes.join('')}</sheetData></worksheet>`,
    ]);
  });
  return zipper(fichiers);
}

/** Buffer .xlsx → [{ nom, lignes: [[texte…]] }] (toutes les feuilles, première ligne comprise). */
export function lireXlsx(buf) {
  const fichiers = dezipper(buf);
  const texte = (nom) => fichiers.get(nom)?.toString('utf8') || '';
  const partages = [...texte('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => dexml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const rels = Object.fromEntries([...texte('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/Id="([^"]+)"/)?.[1], m[0].match(/Target="([^"]+)"/)?.[1]]));
  const feuilles = [];
  for (const m of texte('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const nom = dexml(m[0].match(/name="([^"]*)"/)?.[1] || '');
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1];
    let cible = rels[rid] || '';
    cible = cible.startsWith('/') ? cible.slice(1) : `xl/${cible}`;
    const lignes = [];
    for (const r of texte(cible).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const ligne = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1] || lettre(ligne.length);
        const col = [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const type = attrs.match(/t="([^"]+)"/)?.[1];
        const corps = c[2] || '';
        let v = '';
        if (type === 's') v = partages[Number(corps.match(/<v>([\s\S]*?)<\/v>/)?.[1])] ?? '';
        else if (type === 'inlineStr') v = dexml([...corps.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
        else v = dexml(corps.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
        ligne[col] = v;
      }
      lignes.push(Array.from(ligne, (x) => x ?? ''));
    }
    feuilles.push({ nom, lignes });
  }
  return feuilles;
}

// ---------------------------------------------------------------- csv

export function ecrireCsv(lignes, sep = ';') {
  const champ = (v) => {
    const s = String(v ?? '');
    return /["\n\r;,\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM : Excel reconnaît alors l'UTF-8 (accents).
  return '﻿' + lignes.map((l) => l.map(champ).join(sep)).join('\r\n') + '\r\n';
}

export function lireCsv(texte) {
  const t = texte.replace(/^﻿/, '');
  const premiere = t.split(/\r?\n/, 1)[0] || '';
  const sep = [';', '\t', ','].map((s) => [s, premiere.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const lignes = [];
  let ligne = [];
  let champ = '';
  let guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (guillemets) {
      if (ch === '"' && t[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (ch === '"') guillemets = false;
      else champ += ch;
    } else if (ch === '"') guillemets = true;
    else if (ch === sep) {
      ligne.push(champ);
      champ = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else champ += ch;
  }
  if (champ || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes.filter((l) => l.some((c) => c.trim()));
}
