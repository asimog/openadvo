# Build/verification recipe for vendored paddleocr
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$version = (Get-Content "$scriptDir\VERSION").Trim()
$ortDll = "$scriptDir\bin\x64\onnxruntime.dll"

if (-not (Test-Path $ortDll)) {
    Write-Error "onnxruntime.dll is missing from $ortDll."
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

Write-Host "paddleocr verification successful: $version"
