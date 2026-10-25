# Mise à jour du QG des agents depuis la dernière version publiée sur GitHub (lancée par mettre-a-jour.bat).
# Tes réglages (config\*.json, fiches), ton historique (dossiers\) et runtime\ ne sont jamais touchés :
# le zip de la version ne contient que le code et les réglages par défaut.
param([switch]$Silencieux)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Depot = 'Ishine93/agents-hq'
$QG = Split-Path -Parent $PSScriptRoot
$Tmp = Join-Path $QG 'runtime\mise-a-jour'

function Echec($texte) { Write-Host ''; Write-Host "ÉCHEC : $texte" -ForegroundColor Red; exit 1 }

$actuelle = (Get-Content (Join-Path $QG 'package.json') -Raw | ConvertFrom-Json).version
Write-Host "QG des agents — version installée : $actuelle"

try {
  $rel = Invoke-RestMethod "https://api.github.com/repos/$Depot/releases/latest" -Headers @{ 'User-Agent' = 'QG-des-agents' }
} catch { Echec "impossible de joindre GitHub ($($_.Exception.Message))." }
$derniere = $rel.tag_name -replace '^v', ''
Write-Host "Dernière version publiée : $derniere"
if ($derniere -eq $actuelle) { Write-Host 'Tu as déjà la dernière version.' -ForegroundColor Green; exit 0 }

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
Write-Host "QG des agents mis à jour en version $derniere. Relance lancer.bat." -ForegroundColor Green
