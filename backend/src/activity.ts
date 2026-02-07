/**
 * In-memory activity log for provisioning events (replaces fancy monitoring).
 * Status transitions: REQUESTED → PROVISIONING → READY | FAILED | DELETED.
 */

export type ActivityEvent = 'REQUESTED' | 'PROVISIONING' | 'READY' | 'FAILED' | 'DELETED';

export interface ActivityEntry {
  ts: string;
  event: ActivityEvent;
  storeId: string;
  status?: string;
  message?: string;
  name?: string;
  engine?: string;
}

const MAX_ENTRIES = 200;
const entries: ActivityEntry[] = [];

export function logActivity(entry: Omit<ActivityEntry, 'ts'>): void {
  entries.push({
    ...entry,
    ts: new Date().toISOString(),
  });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function getActivity(limit = 50): ActivityEntry[] {
  return entries.slice(-limit).reverse();
}
