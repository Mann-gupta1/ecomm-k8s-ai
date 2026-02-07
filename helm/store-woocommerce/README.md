# store-woocommerce Helm chart

Used for **production validation via dry-run**. Runtime store provisioning is done by the platform backend (manifest application), not by installing this chart per store.

## Validate prod values without deploying

```bash
# From repo root — prove ingress host, PVC sizes, and resource limits for prod
helm template store-prod ./helm/store-woocommerce -f helm/store-woocommerce/values-prod.yaml
```

You should see:

- `host: store-prod.yourdomain.com` in Ingress
- PVC sizes `10Gi` / `5Gi` (vs 2Gi/1Gi in local)
- ResourceQuota and LimitRange with higher limits
- `storageClassName: standard` when set in values-prod

This proves the same chart structure works for production with values-only changes.
