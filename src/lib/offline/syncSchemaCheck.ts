import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';

const SCHEMA_PROBES = [
  { table: 'products', columns: 'id,product_type,carton_size' },
  { table: 'invoices', columns: 'id,daily_slip_number,edited_at' },
] as const;

/** Ensure cloud DB has columns required by the current app before upload. */
export async function checkCloudSchemaReady(): Promise<{
  ok: boolean;
  message?: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, message: 'Supabase is not configured (.env.local)' };
  }

  for (const probe of SCHEMA_PROBES) {
    const { error } = await supabase
      .from(probe.table)
      .select(probe.columns)
      .limit(1);

    if (error) {
      return {
        ok: false,
        message: `Cloud database schema is outdated (${probe.table}): ${error.message}. Apply Supabase migrations before syncing.`,
      };
    }
  }

  return { ok: true };
}
