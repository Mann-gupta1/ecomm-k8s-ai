import { useEffect, useState } from 'react';

type StoreEngine = 'woocommerce' | 'medusa';
type StoreStatus = 'Provisioning' | 'Ready' | 'Failed';

interface Store {
  id: string;
  name: string;
  engine: StoreEngine;
  status: StoreStatus;
  createdAt: string;
  urls: string[];
  message?: string;
}

interface ActivityEntry {
  ts: string;
  event: string;
  storeId: string;
  status?: string;
  message?: string;
  name?: string;
  engine?: string;
}

function normalizeStore(raw: unknown): Store | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : '';
  if (!id) return null;
  const status = o.status as string | undefined;
  const validStatus: StoreStatus[] = ['Provisioning', 'Ready', 'Failed'];
  const safeStatus = status && validStatus.includes(status) ? status : 'Provisioning';
  const urls = Array.isArray(o.urls) ? o.urls.filter((u): u is string => typeof u === 'string') : [];
  return {
    id,
    name: typeof o.name === 'string' ? o.name : id,
    engine: o.engine === 'medusa' ? 'medusa' : 'woocommerce',
    status: safeStatus as StoreStatus,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
    urls,
    message: typeof o.message === 'string' ? o.message : undefined,
  };
}

const API_BASE = '/api';

/** True if the error is a network/connection failure (e.g. backend not running). */
function isConnectionError(e: unknown): boolean {
  const msg = (e as Error)?.message ?? String(e);
  return /failed to fetch|networkerror|connection refused|econnrefused|load failed/i.test(msg);
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    });
  } catch (e) {
    if (isConnectionError(e)) {
      throw new Error('Cannot connect to API. Is the backend running? Start it with: cd backend && npm run dev');
    }
    throw e;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err && (err.error ?? err.message)) || res.statusText;
    throw new Error(typeof message === 'string' ? message : 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response');
  }
}

function formatDate(iso: string): string {
  if (!iso || typeof iso !== 'string') return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

const STATUS_STYLES: Record<StoreStatus, { bg: string; color: string }> = {
  Provisioning: { bg: 'rgba(232, 201, 122, 0.2)', color: 'var(--warning)' },
  Ready: { bg: 'rgba(125, 211, 163, 0.2)', color: 'var(--success)' },
  Failed: { bg: 'rgba(224, 124, 124, 0.2)', color: 'var(--danger)' },
};

function StatusBadge({ status, message }: { status: StoreStatus; message?: string }) {
  const safeStatus: StoreStatus = STATUS_STYLES[status] ? status : 'Provisioning';
  const s = STATUS_STYLES[safeStatus];
  return (
    <span title={message ?? undefined} style={{ background: s.bg, color: s.color, padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 500 }}>
      {safeStatus}
    </span>
  );
}

const POLL_STORES_MS = 8000;
const POLL_EVENTS_MS = 5000;
/** When API is unreachable, poll less often to avoid console spam. */
const POLL_RETRY_MS = 20000;

export default function App() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiUnreachable, setApiUnreachable] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEngine, setCreateEngine] = useState<StoreEngine>('woocommerce');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEntry[]>([]);
  const [eventsOpen, setEventsOpen] = useState(false);

  const loadStores = async () => {
    try {
      setError(null);
      setApiUnreachable(false);
      const data = await api<unknown>('/stores');
      const list = Array.isArray(data) ? data : [];
      const normalized = list.map(normalizeStore).filter((s): s is Store => s !== null);
      setStores(normalized);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setStores([]);
      if (isConnectionError(e)) setApiUnreachable(true);
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      const data = await api<ActivityEntry[]>('/events?limit=30');
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setEvents([]);
    }
  };

  useEffect(() => {
    loadStores();
    loadEvents();
    const intervalMs = apiUnreachable ? POLL_RETRY_MS : POLL_STORES_MS;
    const t = setInterval(loadStores, intervalMs);
    return () => clearInterval(t);
  }, [apiUnreachable]);

  useEffect(() => {
    if (apiUnreachable) return;
    const te = setInterval(loadEvents, POLL_EVENTS_MS);
    return () => clearInterval(te);
  }, [apiUnreachable]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api<Store>('/stores', {
        method: 'POST',
        body: JSON.stringify({ name: createName.trim(), engine: createEngine }),
      });
      setCreateName('');
      await loadStores();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this store and all its resources?')) return;
    setDeletingId(id);
    setError(null);
    try {
      await api(`/stores/${id}`, { method: 'DELETE' });
      await loadStores();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
          Store Provisioning
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 15 }}>
          Create and manage WooCommerce or Medusa stores on Kubernetes.
        </p>
      </header>

      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 24,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px 0' }}>Create New Store</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Store name</span>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="My Store"
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                minWidth: 200,
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Engine</span>
            <select
              value={createEngine}
              onChange={(e) => setCreateEngine(e.target.value as StoreEngine)}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                minWidth: 160,
              }}
            >
              <option value="woocommerce">WooCommerce</option>
              <option value="medusa">Medusa (stub)</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={creating || !createName.trim()}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--bg)',
              fontWeight: 600,
              opacity: creating || !createName.trim() ? 0.6 : 1,
            }}
          >
            {creating ? 'Creating…' : 'Create Store'}
          </button>
        </form>
      </section>

      {error && (
        <div
          style={{
            background: 'rgba(224, 124, 124, 0.15)',
            color: 'var(--danger)',
            padding: 12,
            borderRadius: 8,
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px 0' }}>Stores</h2>
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : stores.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No stores yet. Create one above.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stores.map((store) => (
              <div
                key={store.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 20,
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: 16,
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <strong style={{ fontSize: 16 }}>{store.name}</strong>
                    <StatusBadge status={store.status} message={store.message} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {store.engine}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Created {formatDate(store.createdAt)}
                  </div>
                  {store.urls?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {store.urls.map((url, i) => (
                        <a key={`${store.id}-url-${i}`} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, display: 'block' }}>
                          {url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  {store.status === 'Ready' && store.urls?.[0] && (
                    <a
                      href={store.urls[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: '1px solid var(--accent)',
                        background: 'transparent',
                        color: 'var(--accent)',
                        fontWeight: 500,
                        textDecoration: 'none',
                        display: 'inline-block',
                      }}
                    >
                      Open store
                    </a>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(store.id)}
                  disabled={deletingId === store.id}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--danger)',
                    background: 'transparent',
                    color: 'var(--danger)',
                    fontWeight: 500,
                  }}
                >
                  {deletingId === store.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <button
          type="button"
          onClick={() => setEventsOpen(!eventsOpen)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 14,
            cursor: 'pointer',
            padding: 0,
            marginBottom: 8,
          }}
        >
          {eventsOpen ? '▼' : '▶'} Provisioning activity ({events.length})
        </button>
        {eventsOpen && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 16,
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              REQUESTED → PROVISIONING → READY | FAILED | DELETED
            </div>
            {events.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No activity yet.</p>
            ) : (
              events.map((e, i) => (
                <div
                  key={`${e.ts}-${i}`}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 20 }}>
                    {e.event}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{e.storeId}</span>
                  {e.message && <span style={{ color: 'var(--danger)' }}>{e.message}</span>}
                  <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {formatDate(e.ts)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
