# Installation du QG des agents (lancée par installer.bat).
# 1. Node.js portable dans runtime\node (rien n'est installé ailleurs sur le PC) ;
# 2. dépendances npm (SDK Claude Agent, qui contient Claude Code) ;
# 3. vérifie Git (les agents s'en servent ; Claude Code l'utilise pour ses commandes) et propose de l'installer.
# Chaque téléchargement est vérifié (empreinte SHA-256 publiée par l'éditeur).
param([switch]$SansLancer, [switch]$Silencieux)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$QG = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $QG 'runtime'
$NodeVersion = '24.22.1'
$NodeDossier = Join-Path $Runtime 'node'

function Etape($texte) { Write-Host ''; Write-Host "== $texte" -ForegroundColor Cyan }
function Ok($texte) { Write-Host "   OK  $texte" -ForegroundColor Green }
function Info($texte) { Write-Host "   $texte" }
function Attention($texte) { Write-Host "   !   $texte" -ForegroundColor Yellow }
function Echec($texte) {
  Write-Host ''
  Write-Host "ÉCHEC : $texte" -ForegroundColor Red
  Write-Host 'Rien n''a été modifié en dehors du dossier du QG. Tu peux relancer installer.bat.'
  exit 1
}
function Question($texte, $siSilencieux = $true) {
  if ($Silencieux) { return $siSilencieux }
  $r = Read-Host "$texte [O/n]"
  return ($r -eq '' -or $r -match '^[oOyY]')
}

function Telecharger($url, $fichier) {
  Info "Téléchargement : $url"
  for ($essai = 1; $essai -le 3; $essai++) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $fichier -UseBasicParsing -TimeoutSec 600
      return
    } catch {
      if ($essai -eq 3) { throw }
      Attention "Téléchargement interrompu, nouvel essai ($essai/3)…"
      Start-Sleep -Seconds 3
    }
  }
}

Write-Host 'QG des agents — installation' -ForegroundColor White
Write-Host "Dossier : $QG"

# ------------------------------------------------------------------ système
Etape 'Système'
$os = [Environment]::OSVersion.Version
if ($os.Major -lt 10) { Echec 'Windows 10 ou 11 est nécessaire.' }
if (-not [Environment]::Is64BitOperatingSystem) { Echec 'Un Windows 64 bits est nécessaire.' }
Ok "Windows $($os.Major).$($os.Minor) (build $($os.Build)), 64 bits"
if ($QG -match '[^\x20-\x7E]') { Attention "Le chemin du dossier contient des caractères spéciaux : si l'installation échoue, déplace le QG dans un dossier simple (ex. C:\QG-des-agents)." }
New-Item -ItemType Directory -Force -Path $Runtime | Out-Null

# ------------------------------------------------------------------ Node.js portable
Etape "Node.js $NodeVersion (portable, dans runtime\node)"
$nodeExe = Join-Path $NodeDossier 'node.exe'
$versionActuelle = $null
if (Test-Path $nodeExe) { try { $versionActuelle = (& $nodeExe -v).Trim() } catch { $versionActuelle = $null } }
if ($versionActuelle -eq "v$NodeVersion") {
  Ok "déjà installé ($versionActuelle)"
} else {
  $nom = "node-v$NodeVersion-win-x64"
  $base = "https://nodejs.org/dist/v$NodeVersion"
  $tmp = Join-Path $Runtime 'telechargements'
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $zip = Join-Path $tmp "$nom.zip"
  $sommes = Join-Path $tmp "SHASUMS256-node-$NodeVersion.txt"
  try {
    Telecharger "$base/SHASUMS256.txt" $sommes
    Telecharger "$base/$nom.zip" $zip
  } catch { Echec "téléchargement de Node.js impossible ($($_.Exception.Message)). Vérifie ta connexion Internet." }
  $attendue = (Select-String -Path $sommes -Pattern "  $nom\.zip$" | Select-Object -First 1).Line -split '\s+' | Select-Object -First 1
  $obtenue = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
  if (-not $attendue -or $obtenue -ne $attendue.ToLower()) { Remove-Item $zip -Force; Echec 'empreinte de Node.js incorrecte : le fichier téléchargé a été supprimé.' }
  Ok 'empreinte SHA-256 vérifiée'
  $extrait = Join-Path $tmp 'node-extrait'
  if (Test-Path $extrait) { Remove-Item $extrait -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $extrait -Force
  if (Test-Path $NodeDossier) { Remove-Item $NodeDossier -Recurse -Force }
  Move-Item (Join-Path $extrait $nom) $NodeDossier
  Remove-Item $extrait -Recurse -Force
  Remove-Item $zip, $sommes -Force
  Ok "installé ($((& $nodeExe -v).Trim()))"
}
$env:PATH = "$NodeDossier;$env:PATH"

# ------------------------------------------------------------------ dépendances npm
Etape 'Dépendances (SDK Claude Agent et Claude Code)'
$claudeExe = Join-Path $QG 'node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe'
$npm = Join-Path $NodeDossier 'npm.cmd'
Push-Location $QG
try {
  & $npm ci --omit=dev --no-audit --no-fund --loglevel=error
  if ($LASTEXITCODE -ne 0) { throw "npm ci a échoué (code $LASTEXITCODE)" }
} catch {
  Pop-Location
  Echec "installation des dépendances impossible : $($_.Exception.Message)"
}
Pop-Location
if (-not (Test-Path $claudeExe)) { Echec 'Claude Code est introuvable après l''installation (node_modules incomplet).' }
Ok "Claude Code $((& $claudeExe --version 2>$null | Select-Object -First 1))"

# ------------------------------------------------------------------ Git
Etape 'Git (utilisé par les agents et par Claude Code)'
$git = Get-Command git -ErrorAction SilentlyContinue
$bash = @("$env:ProgramFiles\Git\bin\bash.exe", "${env:ProgramFiles(x86)}\Git\bin\bash.exe", "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($git -and $bash) {
  Ok "$((git --version).Trim())"
} else {
  Attention 'Git pour Windows n''est pas installé. Sans lui, les agents ne peuvent pas lancer de commandes (tests, builds…).'
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget -and (Question 'Installer Git pour Windows maintenant avec winget (outil officiel de Microsoft) ?')) {
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -eq 0) { Ok 'Git installé (il sera pris en compte au prochain lancement du QG).' }
    else { Attention 'winget n''a pas pu installer Git : installe-le depuis https://git-scm.com/download/win puis relance le QG.' }
  } else {
    Attention 'Installe Git depuis https://git-scm.com/download/win (options par défaut), puis relance le QG.'
  }
}

# ------------------------------------------------------------------ raccourci
Etape 'Raccourci'
try {
  $bureau = [Environment]::GetFolderPath('Desktop')
  $lnk = Join-Path $bureau 'QG des agents.lnk'
  if (-not (Test-Path $lnk) -and (Question 'Créer un raccourci « QG des agents » sur le bureau ?' $false)) {
    $w = New-Object -ComObject WScript.Shell
    $s = $w.CreateShortcut($lnk)
    $s.TargetPath = Join-Path $QG 'lancer.bat'
    $s.WorkingDirectory = $QG
    $s.Description = 'QG des agents'
    $ico = Join-Path $QG 'app\icone.ico'
    if (Test-Path $ico) { $s.IconLocation = "$ico,0" }
    $s.Save()
    Ok 'raccourci créé sur le bureau'
  } else { Info 'pas de raccourci' }
} catch { Attention "raccourci impossible : $($_.Exception.Message)" }

Write-Host ''
Write-Host 'Installation terminée.' -ForegroundColor Green
Write-Host 'Facultatif : installer-dictee.bat installe la dictée locale (Whisper, sur ton PC).'
if (-not $SansLancer) {
  Write-Host 'Le QG va s''ouvrir dans ton navigateur : la configuration guidée t''accompagne (connexion à Claude, choix de tes dossiers).'
  Start-Process -FilePath (Join-Path $QG 'lancer.bat') -WorkingDirectory $QG
}
