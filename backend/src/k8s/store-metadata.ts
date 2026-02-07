import * as k8s from '@kubernetes/client-node';
import { config, getStoreNamespace } from '../config';
import type { StoreMetadata, StoreStatus } from '../types';
import { makeCoreV1Api } from './client';

const STORE_INFO_NAME = config.storeInfoConfigMapName;
const LABEL = config.storeLabel;

export async function listStoreNamespaces(): Promise<string[]> {
  const core = makeCoreV1Api();
  // listNamespace(pretty, allowWatchBookmarks, _continue, fieldSelector, labelSelector, ...)
  const res = await core.listNamespace(undefined, undefined, undefined, undefined, `${LABEL}=true`);
  return (res.body.items || []).map((n) => n.metadata?.name).filter(Boolean) as string[];
}

function namespaceToStoreId(ns: string): string | null {
  const prefix = config.storeNamespacePrefix + '-';
  if (!ns.startsWith(prefix)) return null;
  return ns.slice(prefix.length);
}

export async function getStoreMetadata(storeId: string): Promise<StoreMetadata | null> {
  const core = makeCoreV1Api();
  const ns = getStoreNamespace(storeId);
  try {
    const cm = await core.readNamespacedConfigMap(STORE_INFO_NAME, ns);
    const d = cm.body.data || {};
    let urls: string[] = [];
    if (d.urls && typeof d.urls === 'string') {
      try {
        const parsed = JSON.parse(d.urls);
        urls = Array.isArray(parsed) ? parsed : [];
      } catch {
        urls = [];
      }
    }
    return {
      id: storeId,
      name: d.name || storeId,
      engine: (d.engine as 'woocommerce' | 'medusa') || 'woocommerce',
      status: (d.status as StoreStatus) || 'Provisioning',
      createdAt: d.createdAt || '',
      urls,
      message: d.message,
    };
  } catch (e: unknown) {
    if ((e as { response?: { statusCode?: number } })?.response?.statusCode === 404) return null;
    throw e;
  }
}

export async function listStores(): Promise<StoreMetadata[]> {
  const namespaces = await listStoreNamespaces();
  const stores: StoreMetadata[] = [];
  for (const ns of namespaces) {
    const id = namespaceToStoreId(ns);
    if (!id) continue;
    try {
      const meta = await getStoreMetadata(id);
      if (meta) stores.push(meta);
    } catch (e) {
      console.warn(`Failed to get store metadata for namespace ${ns}:`, e);
    }
  }
  stores.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
  return stores;
}

export async function setStoreMetadata(storeId: string, meta: Partial<Pick<StoreMetadata, 'status' | 'urls' | 'message'>>): Promise<void> {
  const core = makeCoreV1Api();
  const ns = getStoreNamespace(storeId);
  const existing = await core.readNamespacedConfigMap(STORE_INFO_NAME, ns).catch(() => null);
  const data: Record<string, string> = existing?.body?.data ? { ...existing.body.data } : {};
  if (meta.status !== undefined) data.status = meta.status;
  if (meta.urls !== undefined) data.urls = JSON.stringify(meta.urls);
  if (meta.message !== undefined) data.message = meta.message;
  const body: k8s.V1ConfigMap = {
    metadata: {
      name: STORE_INFO_NAME,
      namespace: ns,
      labels: existing?.body?.metadata?.labels ? { ...existing.body.metadata.labels } : { [LABEL]: 'true', 'store-id': storeId },
    },
    data,
  };
  if (existing) {
    await core.replaceNamespacedConfigMap(STORE_INFO_NAME, ns, body);
  } else {
    await core.createNamespacedConfigMap(ns, body);
  }
}

export async function createStoreInfoConfigMap(
  storeId: string,
  name: string,
  engine: 'woocommerce' | 'medusa',
  urls: string[],
  idempotencyKey?: string
): Promise<void> {
  const core = makeCoreV1Api();
  const ns = getStoreNamespace(storeId);
  const data: Record<string, string> = {
    name,
    engine,
    status: 'Provisioning',
    createdAt: new Date().toISOString(),
    urls: JSON.stringify(urls),
  };
  if (idempotencyKey) data.idempotencyKey = idempotencyKey;
  const body: k8s.V1ConfigMap = {
    metadata: {
      name: STORE_INFO_NAME,
      namespace: ns,
      labels: { [LABEL]: 'true', 'store-id': storeId },
    },
    data,
  };
  await core.createNamespacedConfigMap(ns, body);
}

export async function findStoreByIdempotencyKey(key: string): Promise<StoreMetadata | null> {
  const namespaces = await listStoreNamespaces();
  for (const ns of namespaces) {
    const id = namespaceToStoreId(ns);
    if (!id) continue;
    try {
      const core = makeCoreV1Api();
      const cm = await core.readNamespacedConfigMap(STORE_INFO_NAME, ns);
      const d = cm.body.data || {};
      if (d.idempotencyKey === key) {
        return getStoreMetadata(id);
      }
    } catch {
      // skip
    }
  }
  return null;
}
