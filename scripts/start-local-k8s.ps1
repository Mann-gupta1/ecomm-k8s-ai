# Full local Kubernetes startup: Kind cluster + ingress + platform image + Helm.
# Prerequisites: Docker, kubectl, Helm. Kind is auto-downloaded to scripts\bin if missing. Docker must be running.
# Run from repo root.

param(
    [switch]$MultiNode  # Use kind-multinode.yaml (1 control-plane + 2 workers)
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

# Resolve Kind: run ensure-kind.ps1 (downloads to scripts\bin if needed)
$kindExe = & (Join-Path $root "scripts\ensure-kind.ps1")
if (-not $kindExe -or -not (Test-Path $kindExe)) {
    Write-Host "Kind not found. Run: .\scripts\ensure-kind.ps1" -ForegroundColor Red
    exit 1
}

$clusterName = "urumi"

Write-Host "`n=== 1. Create Kind cluster ===" -ForegroundColor Cyan
if ($MultiNode) {
    & $kindExe create cluster --name $clusterName --config (Join-Path $root "kind-multinode.yaml")
} else {
    & $kindExe create cluster --name $clusterName
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== 2. Install NGINX Ingress ===" -ForegroundColor Cyan
kubectl apply -f "https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml"
kubectl wait -n ingress-nginx --for=condition=ready pod -l app.kubernetes.io/component=controller --timeout=120s

Write-Host "`n=== 3. Build and load platform image ===" -ForegroundColor Cyan
docker build -t urumi/platform:latest .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $kindExe load docker-image urumi/platform:latest --name $clusterName
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== 4. Install platform with Helm ===" -ForegroundColor Cyan
kubectl create namespace urumi -o yaml --dry-run=client | kubectl apply -f -
helm upgrade --install platform ./helm/platform -f helm/platform/values-local.yaml -n urumi

Write-Host "`n=== 5. Wait for platform pod ===" -ForegroundColor Cyan
kubectl wait -n urumi --for=condition=ready pod -l app.kubernetes.io/name=platform --timeout=120s

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Access dashboard:" -ForegroundColor White
Write-Host "  Option A: kubectl port-forward -n urumi svc/platform 3000:80" -ForegroundColor Yellow
Write-Host "            Then open http://localhost:3000" -ForegroundColor Gray
Write-Host "  Option B: kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 80:80" -ForegroundColor Yellow
Write-Host "            Then open http://dashboard.127.0.0.1.nip.io" -ForegroundColor Gray
