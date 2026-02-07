import * as k8s from '@kubernetes/client-node';
import { config, getStoreNamespace } from '../../config';

/**
 * Generates Kubernetes manifests for a WooCommerce store (WordPress + MySQL).
 * Uses official WordPress and MySQL images; WooCommerce can be installed via wp-cli Job
 * or use a WooCommerce-inclusive image. Here we use WordPress + a post-install Job
 * to install and activate WooCommerce and enable COD.
 */
export function getWooCommerceManifests(storeId: string, storeName: string): k8s.KubernetesObject[] {
  const ns = getStoreNamespace(storeId);
  const host = config.ingressHostTemplate.replace('%s', storeId);
  const mysqlRootPassword = generatePassword();
  const mysqlPassword = generatePassword();

  const commonLabels: Record<string, string> = {
    'app.kubernetes.io/name': 'woocommerce-store',
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
        'requests.cpu': '2',
        'requests.memory': '2Gi',
        'limits.cpu': '2',
        'limits.memory': '2Gi',
        'persistentvolumeclaims': '5',
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
          _default: { cpu: '500m', memory: '512Mi' },
          defaultRequest: { cpu: '100m', memory: '128Mi' },
          max: { cpu: '1', memory: '1Gi' },
        },
      ],
    },
  };

  const wpAdminPassword = generatePassword();
  const secret: k8s.V1Secret = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: 'store-credentials', namespace: ns, labels: commonLabels },
    type: 'Opaque',
    stringData: {
      'mysql-root-password': mysqlRootPassword,
      'mysql-password': mysqlPassword,
      'wp-admin-password': wpAdminPassword,
    },
  };

  const pvcMysql: k8s.V1PersistentVolumeClaim = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'mysql-data', namespace: ns, labels: commonLabels },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '2Gi' } },
    },
  };

  const pvcWordPress: k8s.V1PersistentVolumeClaim = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'wordpress-data', namespace: ns, labels: commonLabels },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '1Gi' } },
    },
  };

  const mysqlDeployment: k8s.V1Deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'mysql', namespace: ns, labels: commonLabels },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'mysql' } },
      template: {
        metadata: { labels: { app: 'mysql', ...commonLabels } },
        spec: {
          securityContext: { runAsNonRoot: true, runAsUser: 999 },
          containers: [
            {
              name: 'mysql',
              image: 'mysql:8.0',
              env: [
                { name: 'MYSQL_ROOT_PASSWORD', valueFrom: { secretKeyRef: { name: 'store-credentials', key: 'mysql-root-password' } } },
                { name: 'MYSQL_PASSWORD', valueFrom: { secretKeyRef: { name: 'store-credentials', key: 'mysql-password' } } },
                { name: 'MYSQL_USER', value: 'wordpress' },
                { name: 'MYSQL_DATABASE', value: 'wordpress' },
              ],
              ports: [{ containerPort: 3306 }],
              volumeMounts: [{ name: 'data', mountPath: '/var/lib/mysql' }],
              livenessProbe: { tcpSocket: { port: 3306 }, initialDelaySeconds: 30, periodSeconds: 10 },
              readinessProbe: {
                exec: { command: ['mysqladmin', 'ping', '-h', 'localhost'] },
                initialDelaySeconds: 15,
                periodSeconds: 10,
              },
              resources: {
                requests: { memory: '256Mi', cpu: '100m' },
                limits: { memory: '512Mi', cpu: '500m' },
              },
            },
          ],
          volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'mysql-data' } }],
        },
      },
    },
  };

  const mysqlService: k8s.V1Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'mysql', namespace: ns, labels: commonLabels },
    spec: {
      selector: { app: 'mysql' },
      ports: [{ port: 3306, targetPort: 3306, name: 'mysql' }],
    },
  };

  const storeUrl = `http://${host}`;
  const wpDeployment: k8s.V1Deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'wordpress', namespace: ns, labels: commonLabels },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'wordpress' } },
      template: {
        metadata: { labels: { app: 'wordpress', ...commonLabels } },
        spec: {
          securityContext: { runAsNonRoot: true, runAsUser: 33 },
          containers: [
            {
              name: 'wordpress',
              image: config.wordpressWooCommerceImage,
              env: [
                { name: 'WORDPRESS_DB_HOST', value: 'mysql:3306' },
                { name: 'WORDPRESS_DB_USER', value: 'wordpress' },
                { name: 'WORDPRESS_DB_PASSWORD', valueFrom: { secretKeyRef: { name: 'store-credentials', key: 'mysql-password' } } },
                { name: 'WORDPRESS_DB_NAME', value: 'wordpress' },
                { name: 'WORDPRESS_TABLE_PREFIX', value: 'wp_' },
                { name: 'WORDPRESS_URL', value: storeUrl },
                { name: 'WORDPRESS_TITLE', value: storeName || `Store ${storeId}` },
                { name: 'WORDPRESS_ADMIN_USER', value: 'admin' },
                { name: 'WORDPRESS_ADMIN_PASSWORD', valueFrom: { secretKeyRef: { name: 'store-credentials', key: 'wp-admin-password' } } },
                { name: 'WORDPRESS_ADMIN_EMAIL', value: 'admin@example.com' },
              ],
              ports: [{ containerPort: 80 }],
              volumeMounts: [{ name: 'uploads', mountPath: '/var/www/html/wp-content/uploads' }],
              livenessProbe: { httpGet: { path: '/wp-login.php', port: 80 }, initialDelaySeconds: 60, periodSeconds: 10 },
              readinessProbe: { httpGet: { path: '/wp-login.php', port: 80 }, initialDelaySeconds: 30, periodSeconds: 10 },
              resources: {
                requests: { memory: '128Mi', cpu: '100m' },
                limits: { memory: '512Mi', cpu: '500m' },
              },
            },
          ],
          volumes: [{ name: 'uploads', persistentVolumeClaim: { claimName: 'wordpress-data' } }],
        },
      },
    },
  };

  const wpService: k8s.V1Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'wordpress', namespace: ns, labels: commonLabels },
    spec: {
      selector: { app: 'wordpress' },
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
      annotations: {
        'nginx.ingress.kubernetes.io/proxy-body-size': '64m',
      },
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
                  service: { name: 'wordpress', port: { number: 80 } },
                },
              },
            ],
          },
        },
      ],
    },
  };

  return [
    namespace,
    resourceQuota,
    limitRange,
    secret,
    pvcMysql,
    pvcWordPress,
    mysqlDeployment,
    mysqlService,
    wpDeployment,
    wpService,
    networkPolicy,
    ingress,
  ];
}

function generatePassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 24; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
