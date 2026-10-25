# Installation de la dictée locale (faster-whisper) — facultative, lancée par installer-dictee.bat.
# Tout va dans runtime\dictee : Python (géré par uv), un environnement virtuel, les bibliothèques et le modèle.
# Avec une carte NVIDIA : modèle large-v3 sur le GPU (rapide, ≈ 4 Go). Sinon : large-v3-turbo sur le processeur (≈ 1,6 Go).
param([switch]$Silencieux)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$QG = Split-Path -Parent $PSScriptRoot
$Dictee = Join-Path $QG 'runtime\dictee'
$Outils = Join-Path $Dictee 'outils'
$Venv = Join-Path $Dictee 'venv'
$Modeles = Join-Path $Dictee 'modeles'

function Etape($texte) { Write-Host ''; Write-Host "== $texte" -ForegroundColor Cyan }
function Ok($texte) { Write-Host "   OK  $texte" -ForegroundColor Green }
function Info($texte) { Write-Host "   $texte" }
function Echec($texte) { Write-Host ''; Write-Host "ÉCHEC : $texte" -ForegroundColor Red; exit 1 }

Write-Host 'QG des agents — installation de la dictée locale' -ForegroundColor White
New-Item -ItemType Directory -Force -Path $Outils, $Modeles | Out-Null

# ------------------------------------------------------------------ carte graphique
Etape 'Carte graphique'
$gpu = $false
$smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($smi) {
  try {
    $nom = (& nvidia-smi --query-gpu=name --format=csv,noheader | Select-Object -First 1).Trim()
    if ($nom) { $gpu = $true; Ok "NVIDIA : $nom (transcription sur le GPU)" }
  } catch { $gpu = $false }
}
if (-not $gpu) { Info 'Pas de carte NVIDIA détectée : la transcription tournera sur le processeur (plus lente).' }

# ------------------------------------------------------------------ uv (gestionnaire Python d'Astral)
Etape 'uv (installe Python dans le dossier du QG)'
$uv = Join-Path $Outils 'uv.exe'
if (-not (Test-Path $uv)) {
  $base = 'https://github.com/astral-sh/uv/releases/latest/download'
  $zip = Join-Path $Outils 'uv.zip'
  $somme = Join-Path $Outils 'uv.zip.sha256'
  try {
    Invoke-WebRequest "$base/uv-x86_64-pc-windows-msvc.zip" -OutFile $zip -UseBasicParsing
    Invoke-WebRequest "$base/uv-x86_64-pc-windows-msvc.zip.sha256" -OutFile $somme -UseBasicParsing
  } catch { Echec "téléchargement de uv impossible ($($_.Exception.Message))." }
  $attendue = ((Get-Content $somme -Raw).Trim() -split '\s+')[0].ToLower()
  $obtenue = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
  if ($attendue -ne $obtenue) { Remove-Item $zip -Force; Echec 'empreinte de uv incorrecte : fichier supprimé.' }
  Ok 'empreinte SHA-256 vérifiée'
  Expand-Archive -Path $zip -DestinationPath $Outils -Force
  Remove-Item $zip, $somme -Force
}
Ok "$((& $uv --version).Trim())"
$env:UV_PYTHON_INSTALL_DIR = Join-Path $Dictee 'python'
$env:UV_CACHE_DIR = Join-Path $Dictee 'cache'

# ------------------------------------------------------------------ Python et bibliothèques
Etape 'Python 3.12 et faster-whisper'
if (-not (Test-Path (Join-Path $Venv 'Scripts\python.exe'))) {
  & $uv venv $Venv --python 3.12
  if ($LASTEXITCODE -ne 0) { Echec 'création de l''environnement Python impossible.' }
}
$python = Join-Path $Venv 'Scripts\python.exe'
$paquets = @('faster-whisper==1.2.1', 'av', 'numpy')
if ($gpu) { $paquets += @('nvidia-cublas-cu12', 'nvidia-cudnn-cu12==9.*') }
& $uv pip install --python $python @paquets
if ($LASTEXITCODE -ne 0) { Echec 'installation des bibliothèques impossible.' }
Ok 'bibliothèques installées'

# ------------------------------------------------------------------ modèle
$nomModele = if ($gpu) { 'large-v3' } else { 'large-v3-turbo' }
$depot = if ($gpu) { 'Systran/faster-whisper-large-v3' } else { 'mobiuslabsgmbh/faster-whisper-large-v3-turbo' }
Etape "Modèle Whisper $nomModele (Hugging Face : $depot)"
$cible = Join-Path $Modeles $nomModele
if (Test-Path (Join-Path $cible 'model.bin')) {
  Ok 'déjà téléchargé'
} else {
  $script = Join-Path $Outils 'telecharger_modele.py'
  @"
import sys
from huggingface_hub import snapshot_download
snapshot_download(repo_id=sys.argv[1], local_dir=sys.argv[2], allow_patterns=['*.json', '*.bin', '*.txt'])
"@ | Set-Content -Path $script -Encoding UTF8
  Info 'Téléchargement (plusieurs Go, patience)…'
  & $python -I $script $depot $cible
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $cible 'model.bin'))) { Echec 'téléchargement du modèle impossible.' }
  Ok 'modèle téléchargé'
}

Write-Host ''
Write-Host 'Dictée installée. Relance le QG (ferme sa fenêtre puis lancer.bat) : le bouton 🎤 sera actif (raccourci Alt+M).' -ForegroundColor Green
