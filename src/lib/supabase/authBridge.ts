import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

export interface SupabaseAuthProfile {
  id: string;
  email: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  phone: string;
}

function profileFromMetadata(
  authUserId: string,
  email: string,
  meta: Record<string, unknown>,
): SupabaseAuthProfile {
  const tenantId =
    typeof meta.tenant_id === 'string' && meta.tenant_id.trim()
      ? meta.tenant_id.trim()
      : 'tenant-1';
  const firstName =
    typeof meta.first_name === 'string' ? meta.first_name.trim() : '';
  const lastName =
    typeof meta.last_name === 'string' ? meta.last_name.trim() : '';
  const phone = typeof meta.phone === 'string' ? meta.phone.trim() : '';

  return {
    id: authUserId,
    email,
    tenantId,
    firstName: firstName || 'User',
    lastName: lastName || 'Account',
    phone,
  };
}

async function loadSupabaseProfile(
  authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> },
): Promise<SupabaseAuthProfile | null> {
  if (!supabase) return null;

  const email = (authUser.email ?? '').trim().toLowerCase();
  const meta = authUser.user_metadata ?? {};
  let profile = profileFromMetadata(authUser.id, email, meta);

  const { data: row } = await supabase
    .from('profiles')
    .select('tenant_id, first_name, last_name, phone, email')
    .eq('id', authUser.id)
    .maybeSingle();

  if (row) {
    profile = {
      id: authUser.id,
      email: row.email || email,
      tenantId: row.tenant_id || profile.tenantId,
      firstName: row.first_name?.trim() || profile.firstName,
      lastName: row.last_name?.trim() || profile.lastName,
      phone: row.phone?.trim() || profile.phone,
    };
  }

  return profile;
}

/** Sign in to Supabase when online (same email/password as local auth). */
export async function signInSupabaseIfOnline(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const result = await signInSupabaseWithProfile(email, password);
  if (result.ok) return { ok: true };
  return { ok: false, error: result.error };
}

/** Sign in to Supabase and load profile data for provisioning a local session. */
export async function signInSupabaseWithProfile(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string; profile?: SupabaseAuthProfile }> {
  if (!isSupabaseConfigured || !supabase || !navigator.onLine) {
    return { ok: false, error: 'offline-or-unconfigured' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  if (error) return { ok: false, error: error.message };
  if (!data.user) return { ok: false, error: 'No user returned from cloud sign-in' };

  const profile = await loadSupabaseProfile(data.user);
  if (!profile) {
    return { ok: false, error: 'Could not load cloud profile' };
  }

  return { ok: true, profile };
}

export async function signUpSupabaseIfOnline(
  email: string,
  password: string,
  metadata: {
    tenant_id: string;
    first_name: string;
    last_name: string;
    phone: string;
  }
): Promise<{ ok: boolean; error?: string; needsEmailConfirmation?: boolean }> {
  if (!isSupabaseConfigured || !supabase || !navigator.onLine) {
    return { ok: false, error: 'offline-or-unconfigured' };
  }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        tenant_id: metadata.tenant_id,
        first_name: metadata.first_name,
        last_name: metadata.last_name,
        phone: metadata.phone,
      },
    },
  });
  if (error) return { ok: false, error: error.message };
  const needsEmailConfirmation = Boolean(data.user && !data.session);
  return { ok: true, needsEmailConfirmation };
}

export async function signOutSupabase(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }
}

export async function hasSupabaseSession(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

/** Try to restore Supabase Auth using the current local app login. */
export async function reconnectSupabaseFromLocalSession(
  email: string,
  password: string
): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      message: 'Cloud is not configured on this site (missing Supabase env vars)',
    };
  }
  if (!navigator.onLine) {
    return { ok: false, message: 'No internet connection' };
  }

  const result = await signInSupabaseIfOnline(email, password);
  if (result.ok) return { ok: true };

  if (result.error === 'offline-or-unconfigured') {
    return {
      ok: false,
      message: 'Cloud is not configured on this site, or you are offline',
    };
  }

  const detail = result.error ?? 'Unknown error';
  if (/confirm|verified|email/i.test(detail)) {
    return {
      ok: false,
      message:
        'Confirm your email in Supabase first, then sign out and sign in again.',
    };
  }

  return {
    ok: false,
    message: `Cloud sign-in failed: ${detail}. Use the same email/password in Supabase Auth, or sign out and sign in again.`,
  };
}
