# Start Urumi in development mode (dashboard + backend).
# Prerequisites: run once from repo root:
#   cd backend; npm install; cd ..
#   cd dashboard; npm install; cd ..
#
# For store create/delete to work, you need a Kubernetes cluster and KUBECONFIG set.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not (Test-Path "$root\backend\node_modules")) {
    Write-Host "Run first: cd backend; npm install" -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Path "$root\dashboard\node_modules")) {
    Write-Host "Run first: cd dashboard; npm install" -ForegroundColor Yellow
    exit 1
}

Write-Host "Opening two windows: Backend (3001) and Dashboard (3000)" -ForegroundColor Cyan
Write-Host "Dashboard: http://localhost:3000" -ForegroundColor Green

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\dashboard'; npm run dev"
