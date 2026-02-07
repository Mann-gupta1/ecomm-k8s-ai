import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import * as storeService from './store-service';
import * as activity from './activity';
import type { CreateStoreRequest } from './types';

const STORE_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

function isValidStoreId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 63 && STORE_ID_REGEX.test(id);
}

function auditLog(action: 'create' | 'delete', storeId: string, details?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    action,
    storeId,
    ...details,
  };
  console.log(JSON.stringify({ audit: entry }));
}

const app = express();
app.use(cors());
app.use(express.json());

const createStoreLimiter = config.rateLimitWindowMs > 0 && config.rateLimitMaxCreates > 0
  ? rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMaxCreates,
      message: { error: 'Too many store creation requests; try again later.' },
      standardHeaders: true,
      keyGenerator: (req) => (req.ip || req.socket?.remoteAddress || 'unknown'),
      skip: (req) => req.method !== 'POST',
    })
  : (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
app.use('/api/stores', createStoreLimiter);

const dashboardPath = path.join(__dirname, '..', 'dashboard-dist');
if (fs.existsSync(dashboardPath)) {
  app.use(express.static(dashboardPath));
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10) || 50, 100);
  res.json(activity.getActivity(limit));
});

app.get('/api/stores', async (_req, res) => {
  try {
    const stores = await storeService.listStores();
    res.json(stores);
  } catch (e) {
    const err = e as Error;
    console.error('List stores error:', err);
    const msg = err.message || 'Failed to list stores';
    const isK8s = /ECONNREFUSED|ENOENT|certificate|unauthorized|forbidden|timeout/i.test(msg);
    res.status(500).json({ error: isK8s ? 'Cannot connect to Kubernetes. Check cluster and KUBECONFIG.' : msg });
  }
});

app.get('/api/stores/:id', async (req, res) => {
  if (!isValidStoreId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid store id' });
  }
  try {
    const store = await storeService.getStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    res.json(store);
  } catch (e) {
    console.error('Get store error:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post('/api/stores', async (req, res) => {
  try {
    const body = req.body as CreateStoreRequest;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body must be an object' });
    }
    const engine = body.engine === 'medusa' ? 'medusa' : 'woocommerce';
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : `Store (${engine})`;
    const idempotencyKey = typeof req.headers['x-idempotency-key'] === 'string' ? req.headers['x-idempotency-key'].trim() || undefined : undefined;
    const store = await storeService.createStore({ name, engine }, idempotencyKey);
    auditLog('create', store.id, { name, engine });
    res.status(201).json(store);
  } catch (e) {
    const err = e as Error;
    console.error('Create store error:', err);
    const msg = err.message || 'Failed to create store';
    const isK8s = /ECONNREFUSED|ENOENT|certificate|unauthorized|forbidden|timeout/i.test(msg);
    res.status(500).json({ error: isK8s ? 'Cannot connect to Kubernetes. Check cluster and KUBECONFIG.' : msg });
  }
});

app.delete('/api/stores/:id', async (req, res) => {
  if (!isValidStoreId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid store id' });
  }
  try {
    const storeId = req.params.id;
    await storeService.deleteStore(storeId);
    auditLog('delete', storeId);
    res.status(204).send();
  } catch (e) {
    const err = e as Error & { message?: string };
    if (err.message === 'Store not found') return res.status(404).json({ error: err.message });
    console.error('Delete store error:', e);
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

// SPA fallback: serve index.html for non-API routes when dashboard is mounted
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  if (fs.existsSync(dashboardPath)) return res.sendFile(path.join(dashboardPath, 'index.html'));
  next();
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(config.port, () => {
  console.log(`Orchestrator API listening on port ${config.port}`);
});
