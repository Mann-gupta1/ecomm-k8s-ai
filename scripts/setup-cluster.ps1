# Create a local Kubernetes cluster (Kind) and install ingress so the backend can connect.
# Prerequisites: Docker Desktop must be RUNNING. kubectl installed.
# Run from repo root. After this, restart your backend (and ensure KUBECONFIG is not set so it uses default ~/.kube/config).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

# Check Docker is running (Kind needs it)
$dockerOk = $false
try {
    $out = docker info 2>&1
    if ($LASTEXITCODE -eq 0 -and ($out -match "Server Version")) { $dockerOk = $true }
} catch {}
if (-not $dockerOk) {
    Write-Host "Docker is not running or not reachable." -ForegroundColor Red
    Write-Host "Please start Docker Desktop, then run this script again." -ForegroundColor Yellow
    exit 1
}

# Resolve Kind
$kindExe = & (Join-Path $root "scripts\ensure-kind.ps1")
if (-not $kindExe -or -not (Test-Path $kindExe)) {
    Write-Host "Kind not found. Run: .\scripts\ensure-kind.ps1" -ForegroundColor Red
    exit 1
}

$clusterName = "urumi"

# If cluster already exists, just ensure ingress and exit
$exists = & $kindExe get clusters 2>$null | Where-Object { $_ -eq $clusterName }
if ($exists) {
    Write-Host "Cluster '$clusterName' already exists. Installing/updating ingress only." -ForegroundColor Cyan
} else {
    Write-Host "Creating Kind cluster: $clusterName" -ForegroundColor Cyan
    & $kindExe create cluster --name $clusterName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# Point kubectl at this cluster (Kind merges into default kubeconfig)
$env:KUBECONFIG = ""  # use default
kubectl config use-context "kind-$clusterName" 2>$null

Write-Host "Installing NGINX Ingress ..." -ForegroundColor Cyan
kubectl apply -f "https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml"
kubectl wait -n ingress-nginx --for=condition=ready pod -l app.kubernetes.io/component=controller --timeout=120s

Write-Host "`nDone. Your kubeconfig now points at the '$clusterName' cluster." -ForegroundColor Green
Write-Host "Restart your backend (and dashboard if needed) so they use the new cluster." -ForegroundColor Yellow
Write-Host "Then refresh the dashboard in the browser." -ForegroundColor Gray
