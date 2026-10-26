# Fabrique l'icone du QG (app\icone.ico, 16 a 256 px, et web\icone.png pour le site) a partir d'une image
# carree (ex. docs\images-sources\icone.png generee par GPT). Sans image : l'immeuble en pixel art de 16 px.
# Usage : powershell -File outils\fabriquer-icone.ps1 [-Source docs\images-sources\icone.png] [-PixelArt]
param([string]$Source = '', [switch]$PixelArt)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$QG = Split-Path -Parent $PSScriptRoot

function Immeuble16 {
  $lignes = @(
    '........Y.......',
    '........K.......',
    '...KKKKKKKKKK...',
    '...KBBBBBBBSK...',
    '...KBYYBBYYSK...',
    '...KBYYBBYYSK...',
    '...KBBBBBBBSK...',
    '...KBYYBBDDSK...',
    '...KBYYBBDDSK...',
    '...KBBBBBBBSK...',
    '...KBYYBBYYSK...',
    '...KBYYBBYYSK...',
    '...KBBBKKBBSK...',
    '...KBBBKKBBSK...',
    '...KKKKKKKKKK...',
    '................'
  )
  $couleurs = @{
    'K' = [System.Drawing.Color]::FromArgb(255, 0x15, 0x15, 0x1f)
    'B' = [System.Drawing.Color]::FromArgb(255, 0x2f, 0x6f, 0xde)
    'S' = [System.Drawing.Color]::FromArgb(255, 0x22, 0x52, 0xb0)
    'Y' = [System.Drawing.Color]::FromArgb(255, 0xff, 0xe1, 0x4d)
    'D' = [System.Drawing.Color]::FromArgb(255, 0x1b, 0x2c, 0x58)
  }
  $bmp = New-Object System.Drawing.Bitmap 16, 16, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt 16; $y++) {
    for ($x = 0; $x -lt 16; $x++) {
      $c = [string]$lignes[$y][$x]
      if ($couleurs.ContainsKey($c)) { $bmp.SetPixel($x, $y, $couleurs[$c]) } else { $bmp.SetPixel($x, $y, [System.Drawing.Color]::Transparent) }
    }
  }
  return $bmp
}

# Marges transparentes retirees : le dessin occupe toute l'icone (lisible en 16 px).
function Rogner($img) {
  $r = New-Object System.Drawing.Rectangle 0, 0, $img.Width, $img.Height
  $d = $img.LockBits($r, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $octets = New-Object byte[] ($d.Stride * $img.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($d.Scan0, $octets, 0, $octets.Length)
  $img.UnlockBits($d)
  $x0 = $img.Width; $y0 = $img.Height; $x1 = -1; $y1 = -1
  for ($y = 0; $y -lt $img.Height; $y += 2) {
    $ligne = $y * $d.Stride
    for ($x = 0; $x -lt $img.Width; $x += 2) {
      if ($octets[$ligne + 4 * $x + 3] -gt 24) {
        if ($x -lt $x0) { $x0 = $x }; if ($x -gt $x1) { $x1 = $x }
        if ($y -lt $y0) { $y0 = $y }; if ($y -gt $y1) { $y1 = $y }
      }
    }
  }
  if ($x1 -lt 0) { return $img }
  $x0 = [Math]::Max(0, $x0 - 2); $y0 = [Math]::Max(0, $y0 - 2)
  $l = [Math]::Min($img.Width - $x0, $x1 - $x0 + 4); $h = [Math]::Min($img.Height - $y0, $y1 - $y0 + 4)
  return $img.Clone((New-Object System.Drawing.Rectangle $x0, $y0, $l, $h), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

if ($Source) { $base = Rogner ([System.Drawing.Bitmap]::FromFile((Resolve-Path $Source).Path)) } else { $base = Immeuble16; $PixelArt = $true }

function Redimensionner($img, [int]$t) {
  $bmp = New-Object System.Drawing.Bitmap $t, $t, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  if ($PixelArt) {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  } else {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  }
  # image non carree : centree, sans deformation
  $cote = [Math]::Max($img.Width, $img.Height)
  $l = [int]($t * $img.Width / $cote); $h = [int]($t * $img.Height / $cote)
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle ([int](($t - $l) / 2)), ([int](($t - $h) / 2)), $l, $h))
  $g.Dispose()
  return $bmp
}
function EnPng($bmp) {
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  return , $ms.ToArray()
}

# pixel art : des multiples entiers seulement (pas de pixels baveux)
$tailles = if ($PixelArt) { @(16, 32, 48, 64, 128, 256) } else { @(16, 20, 24, 32, 40, 48, 64, 128, 256) }
$images = @()
foreach ($t in $tailles) { $images += , @($t, (EnPng (Redimensionner $base $t))) }

# .ico : en-tete, une entree de 16 octets par taille, puis les PNG (format accepte par Windows depuis Vista)
$sortie = Join-Path $QG 'app\icone.ico'
$fs = [System.IO.File]::Create($sortie)
$w = New-Object System.IO.BinaryWriter $fs
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$images.Count)
$offset = 6 + 16 * $images.Count
foreach ($im in $images) {
  $t = $im[0]; $data = $im[1]
  $cote = if ($t -ge 256) { 0 } else { $t }
  $w.Write([byte]$cote); $w.Write([byte]$cote); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$data.Length); $w.Write([uint32]$offset)
  $offset += $data.Length
}
foreach ($im in $images) { $w.Write([byte[]]$im[1]) }
$w.Close()

# favicon du site
$png = Redimensionner $base 64
$png.Save((Join-Path $QG 'web\icone.png'), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Icone ecrite : $sortie ($($images.Count) tailles) et web\icone.png"
