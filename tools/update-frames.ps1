# Membaca semua .png di assets\frame\ lalu membuat js\frames.js dan js\frames-data.js
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir  = Join-Path $root 'assets\frame'
$files = @(Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Extension -ieq '.png' })

$items = @(foreach ($f in $files) {
  $base = [IO.Path]::GetFileNameWithoutExtension($f.Name)
  $order = 1000000; $name = $base
  # "1 Frame Joomax.png" -> urutan 1, nama "Frame Joomax"
  if ($base -match '^\s*(\d+)[\s._-]+(.+)$') { $order = [int]$Matches[1]; $name = $Matches[2].Trim() }
  [pscustomobject]@{ File = $f.Name; Name = $name; Order = $order; Path = $f.FullName }
})
$items = @($items | Sort-Object Order, Name)

function J([string]$s) { '"' + ($s.Replace('\', '\\').Replace('"', '\"')) + '"' }
$utf8 = New-Object System.Text.UTF8Encoding($false)

$list = ($items | ForEach-Object { '{"name":' + (J $_.Name) + ',"file":' + (J $_.File) + '}' }) -join ",`n  "
$head = "// Dibuat otomatis oleh update-frames.bat. Jangan diedit manual.`n"
[IO.File]::WriteAllText((Join-Path $root 'js\frames.js'), $head + "window.JOOMAX_FRAMES = [`n  $list`n];`n", $utf8)

$data = ($items | ForEach-Object { (J $_.File) + ':"data:image/png;base64,' + [Convert]::ToBase64String([IO.File]::ReadAllBytes($_.Path)) + '"' }) -join ",`n"
[IO.File]::WriteAllText((Join-Path $root 'js\frames-data.js'), $head + "window.JOOMAX_FRAME_DATA = {`n$data`n};`n", $utf8)

Write-Host ""
Write-Host "Selesai. $($items.Count) frame terdaftar:" -ForegroundColor Green
$n = 0; foreach ($i in $items) { $n++; Write-Host ("  {0}. {1}   <- {2}" -f $n, $i.Name, $i.File) }
if ($items.Count -eq 0) { Write-Host "Tidak ada file .png di assets\frame\" -ForegroundColor Yellow }
