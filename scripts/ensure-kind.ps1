# Ensure Kind is available: use scripts\bin\kind.exe if present, else download it, else use PATH.
# Run from repo root. Requires network to download. Outputs the path to the Kind executable.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$binDir = Join-Path $root "scripts\bin"
$kindExe = Join-Path $binDir "kind.exe"

if (Test-Path $kindExe) {
    Write-Host "Using Kind: $kindExe" -ForegroundColor Green
    Write-Output $kindExe
    exit 0
}
$inPath = Get-Command kind -ErrorAction SilentlyContinue
if ($inPath) {
    Write-Host "Using Kind from PATH: $($inPath.Source)" -ForegroundColor Green
    Write-Output $inPath.Source
    exit 0
}

# Download Kind v0.31.0 Windows amd64
Write-Host "Downloading Kind to $kindExe ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
$url = "https://github.com/kubernetes-sigs/kind/releases/download/v0.31.0/kind-windows-amd64"
try {
    Invoke-WebRequest -Uri $url -OutFile $kindExe -UseBasicParsing
} catch {
    Write-Host "Download failed. Install Kind manually: choco install kind" -ForegroundColor Yellow
    Write-Host "Or download from: $url" -ForegroundColor Gray
    exit 1
}
Write-Host "Kind installed at $kindExe" -ForegroundColor Green
Write-Output $kindExe
