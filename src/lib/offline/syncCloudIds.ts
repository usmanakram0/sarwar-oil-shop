import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { withNetworkRetry } from '@/lib/offline/network';
import type { SyncTableName } from '@/lib/offline/syncTypes';

const CHUNK = 80;

export async function fetchCloudIds(
  table: SyncTableName,
  tenantId: string,
): Promise<Set<string>> {
  if (!isSupabaseConfigured || !supabase) return new Set();

  const result = await withNetworkRetry(async () => {
    const response = await supabase!
      .from(table)
      .select('id')
      .eq('tenant_id', tenantId);
    if (response.error) throw new Error(`${table}: ${response.error.message}`);
    return response;
  });

  const ids = new Set<string>();
  for (const row of result.data ?? []) {
    const id = (row as { id?: string }).id;
    if (id) ids.add(id);
  }
  return ids;
}

/** Check which of the given ids still exist in cloud for this tenant. */
export async function fetchCloudIdsByIds(
  table: SyncTableName,
  tenantId: string,
  ids: string[],
): Promise<Set<string>> {
  if (!isSupabaseConfigured || !supabase || ids.length === 0) return new Set();

  const found = new Set<string>();

  for (let index = 0; index < ids.length; index += CHUNK) {
    const part = ids.slice(index, index + CHUNK);
    const result = await withNetworkRetry(async () => {
      const response = await supabase!
        .from(table)
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', part);
      if (response.error) throw new Error(`${table}: ${response.error.message}`);
      return response;
    });

    for (const row of result.data ?? []) {
      const id = (row as { id?: string }).id;
      if (id) found.add(id);
    }
  }

  return found;
}
