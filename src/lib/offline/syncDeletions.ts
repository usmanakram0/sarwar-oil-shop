import { getCurrentTenantId } from '@/lib/auth';
import { readShopJson, writeShopJson } from '@/lib/persistence/shopStorage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { withNetworkRetry } from '@/lib/offline/network';
import { markTenantDataDirty } from '@/lib/offline/syncMeta';
import type { SyncTableName } from '@/lib/offline/syncTypes';
import {
  fetchCloudIds,
  fetchCloudIdsByIds,
} from '@/lib/offline/syncCloudIds';

const CHUNK = 80;

type PendingDeletions = Partial<Record<SyncTableName, string[]>>;

function deletionsStorageKey(): string {
  return `tenant_${getCurrentTenantId()}_pending_cloud_deletions`;
}

function readPendingDeletions(): PendingDeletions {
  try {
    return readShopJson<PendingDeletions>(deletionsStorageKey(), {});
  } catch {
    return {};
  }
}

function writePendingDeletions(pending: PendingDeletions): void {
  writeShopJson(deletionsStorageKey(), pending);
}

/** Queue a record for removal from Supabase on the next sync. */
export function recordPendingCloudDeletion(
  table: SyncTableName,
  id: string,
): void {
  if (!id) return;

  const pending = readPendingDeletions();
  const ids = pending[table] ?? [];
  if (ids.includes(id)) return;

  pending[table] = [...ids, id];
  writePendingDeletions(pending);
  markTenantDataDirty();
}

export function getPendingCloudDeletions(): PendingDeletions {
  return readPendingDeletions();
}

export function getPendingCloudDeletionCount(): number {
  const pending = readPendingDeletions();
  return Object.values(pending).reduce(
    (sum, ids) => sum + (ids?.length ?? 0),
    0,
  );
}

export function clearAllPendingCloudDeletions(): void {
  writePendingDeletions({});
}

function removePendingIds(table: SyncTableName, deletedIds: string[]): void {
  if (deletedIds.length === 0) return;

  const pending = readPendingDeletions();
  const ids = pending[table] ?? [];
  const remaining = ids.filter((id) => !deletedIds.includes(id));

  if (remaining.length === 0) {
    delete pending[table];
  } else {
    pending[table] = remaining;
  }

  writePendingDeletions(pending);
}

async function assertCloudRowsDeleted(
  table: SyncTableName,
  tenantId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;

  const stillPresent = await fetchCloudIdsByIds(table, tenantId, ids);
  if (stillPresent.size === 0) return;

  throw new Error(
    `${table}: ${stillPresent.size} deleted record(s) still exist in cloud — upload could not remove them`,
  );
}

export async function deleteCloudRows(
  table: SyncTableName,
  tenantId: string,
  ids: string[],
): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase || ids.length === 0) return [];

  const uniqueIds = [...new Set(ids)];

  for (let index = 0; index < uniqueIds.length; index += CHUNK) {
    const part = uniqueIds.slice(index, index + CHUNK);
    await withNetworkRetry(async () => {
      const { error } = await supabase!
        .from(table)
        .delete()
        .eq('tenant_id', tenantId)
        .in('id', part)
        .select('id');
      if (error) throw new Error(`${table}: ${error.message}`);
    });
  }

  await assertCloudRowsDeleted(table, tenantId, uniqueIds);
  return uniqueIds;
}

/** Delete queued tombstones from cloud. */
export async function applyPendingCloudDeletions(
  tenantId: string,
  tables: SyncTableName[],
): Promise<number> {
  const pending = readPendingDeletions();
  let deletedCount = 0;

  for (const table of tables) {
    const ids = pending[table];
    if (!ids || ids.length === 0) continue;

    const deletedIds = await deleteCloudRows(table, tenantId, ids);
    removePendingIds(table, deletedIds);
    deletedCount += deletedIds.length;
  }

  return deletedCount;
}

/**
 * Remove cloud rows that no longer exist locally (full-table sync only).
 * Skipped when local table is empty to avoid wiping cloud on a fresh device.
 */
export async function reconcileCloudDeletionsWithLocal(
  tenantId: string,
  table: SyncTableName,
  localIds: Set<string>,
): Promise<number> {
  if (localIds.size === 0) return 0;

  const cloudIds = await fetchCloudIds(table, tenantId);
  const toDelete = [...cloudIds].filter((id) => !localIds.has(id));
  if (toDelete.length === 0) return 0;

  await deleteCloudRows(table, tenantId, toDelete);
  removePendingIds(table, toDelete);
  return toDelete.length;
}
