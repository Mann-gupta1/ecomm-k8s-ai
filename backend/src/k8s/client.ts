import * as fs from 'fs';
import * as path from 'path';
import * as k8s from '@kubernetes/client-node';

let kc: k8s.KubeConfig;

/** True only when running inside a K8s pod (in-cluster CA file exists). */
function isInCluster(): boolean {
  const base =
    process.platform === 'win32'
      ? path.join('C:', 'var', 'run', 'secrets', 'kubernetes.io', 'serviceaccount')
      : path.join('/', 'var', 'run', 'secrets', 'kubernetes.io', 'serviceaccount');
  try {
    return fs.existsSync(path.join(base, 'ca.crt'));
  } catch {
    return false;
  }
}

export function getKubeConfig(): k8s.KubeConfig {
  if (!kc) {
    kc = new k8s.KubeConfig();
    if (process.env.KUBECONFIG) {
      kc.loadFromFile(process.env.KUBECONFIG);
    } else if (isInCluster()) {
      try {
        kc.loadFromCluster();
      } catch {
        kc.loadFromDefault();
      }
    } else {
      // Local dev: use default kubeconfig (~/.kube/config or Kind context)
      kc.loadFromDefault();
    }
  }
  return kc;
}

export function makeCoreV1Api(): k8s.CoreV1Api {
  return getKubeConfig().makeApiClient(k8s.CoreV1Api);
}

export function makeAppsV1Api(): k8s.AppsV1Api {
  return getKubeConfig().makeApiClient(k8s.AppsV1Api);
}

export function makeNetworkingV1Api(): k8s.NetworkingV1Api {
  return getKubeConfig().makeApiClient(k8s.NetworkingV1Api);
}

export function makeRbacAuthorizationV1Api(): k8s.RbacAuthorizationV1Api {
  return getKubeConfig().makeApiClient(k8s.RbacAuthorizationV1Api);
}

export function makeObjectApi(): k8s.CustomObjectsApi {
  return getKubeConfig().makeApiClient(k8s.CustomObjectsApi);
}
