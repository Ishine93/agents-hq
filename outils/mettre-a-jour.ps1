# Mise à jour du QG des agents depuis la dernière version publiée sur GitHub (lancée par mettre-a-jour.bat).
# Tes réglages (config\*.json, fiches), ton historique (dossiers\) et runtime\ ne sont jamais touchés :
# le zip de la version ne contient que le code et les réglages par défaut.
# Depuis le site (Réglages › À propos) : -AttendrePid (le QG se ferme d'abord) et -Relancer (le QG redémarre
# à la fin, même si la mise à jour échoue : on ne te laisse jamais sans QG).
# -Ouvrir : à la relance, ouvrir le site dans le navigateur (mise à jour faite au lancement du QG).
param([switch]$Silencieux, [int]$AttendrePid = 0, [switch]$Relancer, [switch]$Ouvrir)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Depot = 'Ishine93/agents-hq'
$QG = Split-Path -Parent $PSScriptRoot
$Tmp = Join-Path $QG 'runtime\mise-a-jour'

function PortQG {
  foreach ($f in @('config\reglages.json', 'config\defauts\reglages.json')) {
    try {
      $p = (Get-Content (Join-Path $QG $f) -Raw -Encoding UTF8 | ConvertFrom-Json).port
      if ($p) { return [int]$p }
    } catch { }
  }
  return 4747
}
function QGRepond($port) {
  $c = New-Object Net.Sockets.TcpClient
  try { return $c.ConnectAsync('127.0.0.1', $port).Wait(800) -and $c.Connected } catch { return $false } finally { $c.Close() }
}
function QGDemarre {
  # une fenêtre lancer.bat ou un serveur de CE QG est déjà là (démarrage lent) : on ne relance pas en double
  $moi = [Regex]::Escape($QG)
  return [bool](Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -match "$moi.*serveur.*index\.js") -or ($_.Name -eq 'cmd.exe' -and $_.CommandLine -match "$moi.*lancer\.bat") })
}
function Relance {
  if (-not $Relancer) { return }
  Write-Host 'Relance du QG…'
  # --sans-maj : le QG relancé ne revérifie pas (pas de boucle si la mise à jour a échoué).
  $arguments = if ($Ouvrir) { '--sans-maj' } else { '--sans-maj --no-open' }
  $port = PortQG
  # Cette fenêtre attend que le QG réponde avant de se fermer : se fermer pendant que la nouvelle fenêtre
  # démarre la faisait parfois échouer (cmd.exe, erreur 0xc0000142). Pas de réponse : on relance (3 essais).
  for ($essai = 1; $essai -le 3; $essai++) {
    if (-not (QGDemarre)) {
      try { Start-Process -FilePath (Join-Path $QG 'lancer.bat') -ArgumentList $arguments -WorkingDirectory $QG } catch { Write-Host $_.Exception.Message }
    }
    for ($s = 0; $s -lt 40; $s++) {
      Start-Sleep -Seconds 1
      if (QGRepond $port) {
        Write-Host 'Le QG est reparti.' -ForegroundColor Green
        Start-Sleep -Seconds 1
        return
      }
      # plus de fenêtre ni de serveur au bout de quelques secondes : ce démarrage a échoué, on réessaie
      if ($s -ge 6 -and -not (QGDemarre)) { break }
    }
    Write-Host "Le QG ne répond pas encore, nouvel essai ($essai/3)…" -ForegroundColor Yellow
  }
  Write-Host 'Le QG n''a pas redémarré tout seul : lance lancer.bat (la mise à jour, elle, est faite).' -ForegroundColor Yellow
  Read-Host 'Appuie sur Entrée pour fermer cette fenêtre' | Out-Null
}
function Echec($texte) {
  Write-Host ''
  Write-Host "ÉCHEC : $texte" -ForegroundColor Red
  Relance
  if ($Relancer) { Read-Host 'Appuie sur Entrée pour fermer cette fenêtre' | Out-Null }
  exit 1
}

if ($AttendrePid) {
  Write-Host 'Fermeture du QG (les dossiers en cours sont enregistrés et reprendront)…'
  try { Wait-Process -Id $AttendrePid -Timeout 60 -ErrorAction Stop } catch { }
  if (Get-Process -Id $AttendrePid -ErrorAction SilentlyContinue) { Echec 'le QG ne s''est pas fermé.' }
}

$actuelle = (Get-Content (Join-Path $QG 'package.json') -Raw | ConvertFrom-Json).version
Write-Host "QG des agents — version installée : $actuelle"

try {
  $rel = Invoke-RestMethod "https://api.github.com/repos/$Depot/releases/latest" -Headers @{ 'User-Agent' = 'QG-des-agents' }
} catch { Echec "impossible de joindre GitHub ($($_.Exception.Message))." }
$derniere = $rel.tag_name -replace '^v', ''
Write-Host "Dernière version publiée : $derniere"
if ($derniere -eq $actuelle) { Write-Host 'Tu as déjà la dernière version.' -ForegroundColor Green; Relance; exit 0 }

$zipAsset = $rel.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1
$shaAsset = $rel.assets | Where-Object { $_.name -like '*.sha256' } | Select-Object -First 1
if (-not $zipAsset -or -not $shaAsset) { Echec 'la version publiée ne contient pas de zip vérifiable.' }

# Le QG ne doit pas tourner pendant la copie.
$enCours = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$QG*serveur*index.js*" }
if ($enCours) { Echec 'le QG est ouvert : ferme sa fenêtre (cela arrête le QG), puis relance mettre-a-jour.bat.' }

if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
$zip = Join-Path $Tmp $zipAsset.name
$sha = Join-Path $Tmp $shaAsset.name
Write-Host "Téléchargement de $($zipAsset.name)…"
Invoke-WebRequest $zipAsset.browser_download_url -OutFile $zip -UseBasicParsing
Invoke-WebRequest $shaAsset.browser_download_url -OutFile $sha -UseBasicParsing
$attendue = ((Get-Content $sha -Raw).Trim() -split '\s+')[0].ToLower()
if ((Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower() -ne $attendue) { Echec 'empreinte incorrecte : mise à jour annulée.' }
Write-Host 'Empreinte SHA-256 vérifiée.' -ForegroundColor Green

$extrait = Join-Path $Tmp 'extrait'
Expand-Archive $zip -DestinationPath $extrait -Force
$source = Get-ChildItem $extrait -Directory | Select-Object -First 1
if (-not $source -or -not (Test-Path (Join-Path $source.FullName 'serveur\index.js'))) { Echec 'contenu du zip inattendu.' }

# Copie par-dessus : les fichiers personnels n'existent pas dans le zip, ils restent tels quels.
robocopy $source.FullName $QG /E /NFL /NDL /NJH /NJS /NP /XD node_modules runtime dossiers | Out-Null
if ($LASTEXITCODE -ge 8) { Echec "copie des fichiers impossible (robocopy $LASTEXITCODE)." }
Remove-Item $Tmp -Recurse -Force

Write-Host 'Fichiers mis à jour. Vérification des dépendances…'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $QG 'outils\installer.ps1') -SansLancer -Silencieux
Write-Host ''
if ($Relancer) {
  Write-Host "QG des agents mis à jour en version $derniere." -ForegroundColor Green
  Relance
} else {
  Write-Host "QG des agents mis à jour en version $derniere. Relance lancer.bat." -ForegroundColor Green
}
