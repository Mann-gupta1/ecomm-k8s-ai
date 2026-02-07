import * as k8s from '@kubernetes/client-node';
import { makeCoreV1Api } from './client';
import { makeAppsV1Api } from './client';
import { makeNetworkingV1Api } from './client';

type KubernetesObject = k8s.V1Namespace | k8s.V1ResourceQuota | k8s.V1LimitRange | k8s.V1Secret
  | k8s.V1PersistentVolumeClaim | k8s.V1ConfigMap | k8s.V1Service | k8s.V1Deployment | k8s.V1Ingress
  | k8s.V1NetworkPolicy;

export async function applyObject(obj: KubernetesObject): Promise<void> {
  const core = makeCoreV1Api();
  const apps = makeAppsV1Api();
  const net = makeNetworkingV1Api();
  const kind = (obj as { kind?: string }).kind;
  const name = (obj as { metadata?: { name?: string } }).metadata?.name;
  const namespace = (obj as { metadata?: { namespace?: string } }).metadata?.namespace;

  if (kind !== 'Namespace' && (!namespace || typeof namespace !== 'string')) {
    throw new Error(`Namespaced resource ${kind} must have metadata.namespace`);
  }

  switch (kind) {
    case 'Namespace': {
      const ns = obj as k8s.V1Namespace;
      await core.createNamespace(ns);
      break;
    }
    case 'ResourceQuota':
      await core.createNamespacedResourceQuota(namespace!, obj as k8s.V1ResourceQuota);
      break;
    case 'LimitRange':
      await core.createNamespacedLimitRange(namespace!, obj as k8s.V1LimitRange);
      break;
    case 'Secret':
      await core.createNamespacedSecret(namespace!, obj as k8s.V1Secret);
      break;
    case 'PersistentVolumeClaim':
      await core.createNamespacedPersistentVolumeClaim(namespace!, obj as k8s.V1PersistentVolumeClaim);
      break;
    case 'ConfigMap':
      await core.createNamespacedConfigMap(namespace!, obj as k8s.V1ConfigMap);
      break;
    case 'Service':
      await core.createNamespacedService(namespace!, obj as k8s.V1Service);
      break;
    case 'Deployment':
      await apps.createNamespacedDeployment(namespace!, obj as k8s.V1Deployment);
      break;
    case 'Ingress':
      await net.createNamespacedIngress(namespace!, obj as k8s.V1Ingress);
      break;
    case 'NetworkPolicy':
      await net.createNamespacedNetworkPolicy(namespace!, obj as k8s.V1NetworkPolicy);
      break;
    default:
      throw new Error(`Unsupported kind for apply: ${kind}`);
  }
}

export async function deleteNamespace(ns: string): Promise<void> {
  const core = makeCoreV1Api();
  await core.deleteNamespace(ns, undefined, undefined, undefined, undefined, 'Background');
}
