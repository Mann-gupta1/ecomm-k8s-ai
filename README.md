# Store Provisioning Platform 

Kubernetes-native platform: create WooCommerce or Medusa stores on demand (one namespace per store), with a React dashboard and Helm deployment.

---

## How to start

**Prerequisites:** Docker Desktop running, Node.js, kubectl. Optional: Helm (for full K8s deploy), Kind (scripts can download it).

**1. Install dependencies (once)**

```powershell
cd backend; npm install; cd ..
cd dashboard; npm install; cd ..
```

**2. Create cluster (once; requires Docker)**

```powershell
.\scripts\setup-cluster.ps1
```

**3. Run the app**

```powershell
.\scripts\start-dev.ps1
```

Then open **http://localhost:3000**.

---

**Full K8s (Kind + Helm):** Docker running → `.\scripts\start-local-k8s.ps1` → then `kubectl port-forward -n urumi svc/platform 3000:80` → open http://localhost:3000.# ecomm-k8s-ai
