# Build/verification recipe for vendored tesseract
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$version = (Get-Content "$scriptDir\VERSION").Trim()
$tessExe = "$scriptDir\bin\x64\tesseract.exe"

if (-not (Test-Path $tessExe)) {
    Write-Error "tesseract.exe is missing from $tessExe. Run setup or copy binaries."
    exit 1
}

$hashLines = Get-Content "$scriptDir\HASH"
foreach ($line in $hashLines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line.Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)
    $expected = $parts[0].Trim().ToLower()
    $relPath = $parts[1].Trim()
    $targetPath = Join-Path $scriptDir $relPath
    if (-not (Test-Path $targetPath)) {
        Write-Error "Target file $relPath missing from $targetPath"
        exit 1
    }
    $actual = (Get-FileHash $targetPath -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $expected) {
        Write-Error "Hash mismatch for $relPath. Expected: $expected, Actual: $actual"
        exit 1
    }
}

Write-Host "tesseract verification successful: $version"
