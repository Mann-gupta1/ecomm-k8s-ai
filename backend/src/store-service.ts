import { v4 as uuidv4 } from 'uuid';
import { config, getStoreNamespace } from './config';
import * as k8s from './k8s/apply';
import * as metadata from './k8s/store-metadata';
import { getWooCommerceManifests } from './k8s/templates/woocommerce';
import { getMedusaManifests } from './k8s/templates/medusa';
import type { StoreMetadata, StoreEngine, CreateStoreRequest } from './types';
import { makeAppsV1Api } from './k8s/client';
import * as activity from './activity';

const PROVISIONING_TIMEOUT_MS = config.provisioningTimeoutMs;

let provisioningCount = 0;
const maxConcurrent = config.maxConcurrentProvisioning;

async function withProvisioningSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (maxConcurrent > 0 && provisioningCount >= maxConcurrent) {
    throw new Error('Too many stores provisioning at once; try again in a moment.');
  }
  provisioningCount += 1;
  try {
    return await fn();
  } finally {
    provisioningCount -= 1;
  }
}

export async function reconcileStoreStatus(storeId: string, engine: StoreEngine): Promise<boolean> {
  const meta = await metadata.getStoreMetadata(storeId);
  if (!meta || meta.status !== 'Provisioning') return false;
  const ns = getStoreNamespace(storeId);
  const apps = makeAppsV1Api();
  const deploymentName = engine === 'woocommerce' ? 'wordpress' : 'medusa-placeholder';
  try {
    const dep = await apps.readNamespacedDeployment(deploymentName, ns);
    const status = dep.body.status;
    const ready = status?.readyReplicas ?? 0;
    const desired = status?.replicas ?? 1;
    if (ready >= desired && desired > 0) {
      await metadata.setStoreMetadata(storeId, { status: 'Ready', message: '' });
      return true;
    }
  } catch {
    // not ready
  }
  return false;
}

export async function listStores(): Promise<StoreMetadata[]> {
  const stores = await metadata.listStores();
  for (const store of stores) {
    if (store.status === 'Provisioning') {
      setImmediate(() => reconcileStoreStatus(store.id, store.engine).catch(() => {}));
    }
  }
  return stores;
}

export async function getStore(storeId: string): Promise<StoreMetadata | null> {
  return metadata.getStoreMetadata(storeId);
}

export async function createStore(req: CreateStoreRequest, idempotencyKey?: string): Promise<StoreMetadata> {
  if (idempotencyKey) {
    const existing = await metadata.findStoreByIdempotencyKey(idempotencyKey);
    if (existing) return existing;
  }

  const stores = await metadata.listStores();
  if (config.maxStores > 0 && stores.length >= config.maxStores) {
    throw new Error(`Maximum number of stores (${config.maxStores}) reached.`);
  }

  const storeId = uuidv4().slice(0, 8);
  const ns = getStoreNamespace(storeId);
  activity.logActivity({ event: 'REQUESTED', storeId, name: req.name, engine: req.engine });

  const result = await withProvisioningSlot(async () => {
    const host = config.ingressHostTemplate.replace('%s', storeId);
    const scheme = host.includes('nip.io') || host.includes('sslip.io') ? 'http' : 'https';
    const urls = [`${scheme}://${host}`];

    const manifests =
      req.engine === 'woocommerce'
        ? getWooCommerceManifests(storeId, req.name)
        : getMedusaManifests(storeId, req.name);

    const namespaceManifest = manifests.find((m) => (m as { kind?: string }).kind === 'Namespace');
    const otherManifests = manifests.filter((m) => (m as { kind?: string }).kind !== 'Namespace');

    if (!namespaceManifest) throw new Error('No namespace in template');

    activity.logActivity({ event: 'PROVISIONING', storeId, status: 'Provisioning' });

    try {
      await k8s.applyObject(namespaceManifest as Parameters<typeof k8s.applyObject>[0]);
      await metadata.createStoreInfoConfigMap(storeId, req.name, req.engine, urls, idempotencyKey);
      for (const obj of otherManifests) {
        await k8s.applyObject(obj as Parameters<typeof k8s.applyObject>[0]);
      }
    } catch (err) {
      await k8s.deleteNamespace(ns).catch(() => {});
      activity.logActivity({ event: 'FAILED', storeId, status: 'Failed', message: (err as Error)?.message });
      throw err;
    }

    setImmediate(() => waitForStoreReady(storeId, req.engine).catch((err) => {
      metadata.setStoreMetadata(storeId, {
        status: 'Failed',
        message: err?.message || 'Provisioning failed',
      }).catch(() => {});
      activity.logActivity({ event: 'FAILED', storeId, status: 'Failed', message: err?.message });
    }));

    return {
      id: storeId,
      name: req.name,
      engine: req.engine,
      status: 'Provisioning' as const,
      createdAt: new Date().toISOString(),
      urls,
    };
  });

  return result;
}

async function waitForStoreReady(storeId: string, engine: StoreEngine): Promise<void> {
  const ns = getStoreNamespace(storeId);
  const apps = makeAppsV1Api();
  const deploymentName = engine === 'woocommerce' ? 'wordpress' : 'medusa-placeholder';
  const deadline = Date.now() + PROVISIONING_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const dep = await apps.readNamespacedDeployment(deploymentName, ns);
      const status = dep.body.status;
      const ready = status?.readyReplicas ?? 0;
      const desired = status?.replicas ?? 1;
      if (ready >= desired && desired > 0) {
        await metadata.setStoreMetadata(storeId, { status: 'Ready', message: '' });
        activity.logActivity({ event: 'READY', storeId, status: 'Ready' });
        return;
      }
    } catch {
      // deployment not ready yet
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  await metadata.setStoreMetadata(storeId, {
    status: 'Failed',
    message: 'Provisioning timeout: deployment did not become ready',
  });
  activity.logActivity({ event: 'FAILED', storeId, status: 'Failed', message: 'Provisioning timeout' });
}

export async function deleteStore(storeId: string): Promise<void> {
  const meta = await metadata.getStoreMetadata(storeId);
  if (!meta) {
    throw new Error('Store not found');
  }
  activity.logActivity({ event: 'DELETED', storeId, status: 'Deleted' });
  const ns = getStoreNamespace(storeId);
  await k8s.deleteNamespace(ns);
}
