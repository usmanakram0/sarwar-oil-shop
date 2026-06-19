import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

/** Sign in to Supabase when online (same email/password as local auth). */
export async function signInSupabaseIfOnline(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase || !navigator.onLine) {
    return { ok: false, error: 'offline-or-unconfigured' };
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
