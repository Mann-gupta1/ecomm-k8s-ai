import * as k8s from '@kubernetes/client-node';
import { config, getStoreNamespace } from '../../config';

/**
 * Medusa store: stubbed for Round 1. Creates a namespace with a placeholder
 * (simple nginx or "Coming soon" page) and Ingress so the dashboard shows
 * a URL. Architecture allows adding full Medusa (Node + Postgres + Redis) later.
 */
export function getMedusaManifests(storeId: string, storeName: string): k8s.KubernetesObject[] {
  const ns = getStoreNamespace(storeId);
  const host = config.ingressHostTemplate.replace('%s', storeId);

  const commonLabels: Record<string, string> = {
    'app.kubernetes.io/name': 'medusa-store',
    'app.kubernetes.io/instance': storeId,
    'urumi.ai/store-id': storeId,
  };

  const namespace: k8s.V1Namespace = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: ns,
      labels: {
        'urumi.ai/store': 'true',
        'store-id': storeId,
      },
    },
  };

  const resourceQuota: k8s.V1ResourceQuota = {
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: { name: 'store-quota', namespace: ns, labels: commonLabels },
    spec: {
      hard: {
        'requests.cpu': '1',
        'requests.memory': '512Mi',
        'limits.cpu': '1',
        'limits.memory': '512Mi',
        'persistentvolumeclaims': '2',
      },
    },
  };

  const limitRange: k8s.V1LimitRange = {
    apiVersion: 'v1',
    kind: 'LimitRange',
    metadata: { name: 'store-limits', namespace: ns, labels: commonLabels },
    spec: {
      limits: [
        {
          type: 'Container',
          _default: { cpu: '100m', memory: '128Mi' },
          defaultRequest: { cpu: '50m', memory: '64Mi' },
          max: { cpu: '500m', memory: '256Mi' },
        },
      ],
    },
  };

  const deployment: k8s.V1Deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'medusa-placeholder', namespace: ns, labels: commonLabels },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'medusa-placeholder' } },
      template: {
        metadata: { labels: { app: 'medusa-placeholder', ...commonLabels } },
        spec: {
          securityContext: { runAsNonRoot: true, runAsUser: 101 },
          containers: [
            {
              name: 'placeholder',
              image: 'nginx:alpine',
              ports: [{ containerPort: 80 }],
              resources: {
                requests: { memory: '32Mi', cpu: '50m' },
                limits: { memory: '64Mi', cpu: '100m' },
              },
              livenessProbe: { httpGet: { path: '/', port: 80 }, initialDelaySeconds: 5, periodSeconds: 10 },
              readinessProbe: { httpGet: { path: '/', port: 80 }, initialDelaySeconds: 5, periodSeconds: 5 },
            },
          ],
        },
      },
    },
  };

  const service: k8s.V1Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'medusa-placeholder', namespace: ns, labels: commonLabels },
    spec: {
      selector: { app: 'medusa-placeholder' },
      ports: [{ port: 80, targetPort: 80, name: 'http' }],
    },
  };

  const networkPolicy: k8s.V1NetworkPolicy = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'store-default', namespace: ns, labels: commonLabels },
    spec: {
      podSelector: {},
      policyTypes: ['Ingress', 'Egress'],
      ingress: [
        { ports: [{ protocol: 'TCP', port: 80 }, { protocol: 'TCP', port: 443 }] },
      ],
      egress: [
        { to: [{ namespaceSelector: {} }] },
        { to: [{ ipBlock: { cidr: '0.0.0.0/0' } }] },
      ],
    },
  };

  const ingress: k8s.V1Ingress = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'store',
      namespace: ns,
      labels: commonLabels,
    },
    spec: {
      ingressClassName: 'nginx',
      rules: [
        {
          host,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: { name: 'medusa-placeholder', port: { number: 80 } },
                },
              },
            ],
          },
        },
      ],
    },
  };

  return [namespace, resourceQuota, limitRange, deployment, service, networkPolicy, ingress];
}
