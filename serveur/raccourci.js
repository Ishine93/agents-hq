// Raccourci « QG des agents » du bureau : l'installation lui donne l'icône du QG ; ici, au lancement, on
// la (re)pose sur un raccourci déjà créé (installations d'avant l'icône, ou icône changée par une mise à jour).
// Une seule fois par icône : son empreinte est notée dans runtime/raccourci-icone.txt.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from './config.js';

const SCRIPT = [
  "$l = Join-Path ([Environment]::GetFolderPath('Desktop')) 'QG des agents.lnk'",
  "if (-not (Test-Path -LiteralPath $l)) { 'absent'; exit }",
  '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($l)',
  // un raccourci vers un autre QG (autre dossier) n'est pas le nôtre
  "if ($s.TargetPath -ne $env:QG_CIBLE) { 'autre'; exit }",
  "$s.IconLocation = $env:QG_ICONE + ',0'",
  '$s.Save()',
  "'ok'",
].join('\n');

export function majIconeRaccourci() {
  if (process.platform !== 'win32') return;
  const ico = path.join(RACINE, 'app', 'icone.ico');
  if (!fs.existsSync(ico)) return;
  const empreinte = crypto.createHash('sha1').update(fs.readFileSync(ico)).digest('hex');
  const marque = path.join(RACINE, 'runtime', 'raccourci-icone.txt');
  try {
    if (fs.readFileSync(marque, 'utf8').trim() === empreinte) return;
  } catch {
    /* jamais fait */
  }
  const env = { ...process.env, QG_CIBLE: path.join(RACINE, 'lancer.bat'), QG_ICONE: ico };
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], { windowsHide: true, timeout: 20000, env }, (err, sortie) => {
    if (err) return;
    const r = String(sortie).trim();
    if (!['ok', 'absent', 'autre'].includes(r)) return;
    // l'Explorateur garde les icônes en cache : on lui demande de les relire
    if (r === 'ok') execFile('ie4uinit.exe', ['-show'], { windowsHide: true }, () => {});
    try {
      fs.mkdirSync(path.dirname(marque), { recursive: true });
      fs.writeFileSync(marque, empreinte);
    } catch {
      /* rien */
    }
  });
}
