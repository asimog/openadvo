# Build/verification recipe for vendored pdfium
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$version = (Get-Content "$scriptDir\VERSION").Trim()
$expectedHash = (Get-Content "$scriptDir\HASH").Split(" ")[0].Trim().ToLower()
$dllPath = "$scriptDir\bin\x64\pdfium.dll"

if (-not (Test-Path $dllPath)) {
    Write-Host "pdfium.dll missing, downloading $version..."
    $buildNumber = $version.Split("/")[1]
    $url = "https://github.com/bblanchon/pdfium-binaries/releases/download/$version/pdfium-win-x64.tgz"
    $tmpDir = "$scriptDir\tmp_build"
    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
    $tgz = "$tmpDir\pdfium-win-x64.tgz"
    curl.exe -L $url -o $tgz
    tar.exe -xzf $tgz -C $tmpDir
    New-Item -ItemType Directory -Force -Path "$scriptDir\bin\x64", "$scriptDir\lib\x64", "$scriptDir\include" | Out-Null
    Copy-Item "$tmpDir\bin\pdfium.dll" "$scriptDir\bin\x64\pdfium.dll" -Force
    Copy-Item "$tmpDir\lib\pdfium.dll.lib" "$scriptDir\lib\x64\pdfium.lib" -Force
    Copy-Item "$tmpDir\include\*" "$scriptDir\include\" -Recurse -Force
    Remove-Item $tmpDir -Recurse -Force
}

$actualHash = (Get-FileHash $dllPath -Algorithm SHA256).Hash.ToLower()
if ($actualHash -ne $expectedHash) {
    Write-Error "Hash mismatch for $dllPath. Expected: $expectedHash, Actual: $actualHash"
    exit 1
}

Write-Host "pdfium verification successful: $version ($actualHash)"
