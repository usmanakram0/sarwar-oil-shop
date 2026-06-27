import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';

/** Tenant id from the active local app session (IndexedDB data scope). */
export function getLocalTenantIdForSync(): string | null {
  return getSession()?.tenantId ?? null;
}

/** Tenant id stored on the signed-in user's Supabase profile (RLS scope). */
export async function getCloudProfileTenantId(): Promise<string | null> {
  if (!supabase) return null;

  const { data: authData } = await supabase.auth.getSession();
  const userId = authData.session?.user?.id;
  if (!userId) return null;

  const { data: row } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', userId)
    .maybeSingle();

  return row?.tenant_id ?? null;
}

export type TenantIsolationResult =
  | { ok: true; tenantId: string }
  | { ok: false; message: string };

/**
 * Ensures cloud operations only use this device's tenant.
 * When the Supabase profile tenant differs from the local session, cloud sync is blocked.
 */
export async function assertTenantIsolation(): Promise<TenantIsolationResult> {
  const localTenantId = getLocalTenantIdForSync();
  if (!localTenantId) {
    return { ok: false, message: 'Not logged in' };
  }

  const cloudTenantId = await getCloudProfileTenantId();
  if (cloudTenantId && cloudTenantId !== localTenantId) {
    return {
      ok: false,
      message:
        'This cloud account is linked to a different shop than your device session. Sign out and sign in again with the correct account.',
    };
  }

  return { ok: true, tenantId: localTenantId };
}
