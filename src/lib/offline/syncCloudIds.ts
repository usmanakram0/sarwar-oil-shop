import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { withNetworkRetry } from '@/lib/offline/network';
import type { SyncTableName } from '@/lib/offline/syncTypes';

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
