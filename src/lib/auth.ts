import {
  signInSupabaseIfOnline,
  signInSupabaseWithProfile,
  signOutSupabase,
  signUpSupabaseIfOnline,
  reconnectSupabaseFromLocalSession,
} from '@/lib/supabase/authBridge';
import { clearStorageCache } from '@/lib/storage';
import { readJsonValue, safeSetItem } from '@/lib/persistence/safeLocalStore';
import { markTenantDataDirty } from '@/lib/offline/syncMeta';
import { runSyncIfNeeded } from '@/lib/offline/syncEngine';

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}

const SEED_USERS: AuthUser[] = [
  {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'admin@oilshop.com',
    password: 'admin123',
    firstName: 'Usman',
    lastName: 'Ahmed',
    phone: '+92 300 1234567',
  },
  {
    id: 'user-2',
    tenantId: 'tenant-2',
    email: 'demo@oilshop.com',
    password: 'demo123',
    firstName: 'Ali',
    lastName: 'Hassan',
    phone: '+92 301 7654321',
  },
];

export interface AuthSession {
  userId: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  expiresAt: string;
}

interface PasswordResetToken {
  email: string;
  token: string;
  expiresAt: string;
}

const USERS_KEY = 'oilshop_users';
const USERS_BACKUP_KEY = 'oilshop_users__bak';
const SESSION_KEY = 'oilshop_session';
const RESET_TOKENS_KEY = 'oilshop_reset_tokens';
const SESSION_DAYS = 30;
const SESSION_RENEW_IF_WITHIN_DAYS = 7;
const RESET_HOURS = 24;

export const AUTH_CHANGED_EVENT = 'oilshop-auth-changed';

function notifyAuthChanged(): void {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

function loadUsers(): AuthUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) {
    const seeded = [...SEED_USERS];
    safeSetItem(USERS_KEY, JSON.stringify(seeded));
    return seeded;
  }

  const parsed = readJsonValue<AuthUser[]>(USERS_KEY, []);
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed;
  }

  const backup = readJsonValue<AuthUser[]>(USERS_BACKUP_KEY, []);
  if (Array.isArray(backup) && backup.length > 0) {
    safeSetItem(USERS_KEY, JSON.stringify(backup));
    return backup;
  }

  return [];
}

function saveUsers(users: AuthUser[]): void {
  safeSetItem(USERS_KEY, JSON.stringify(users));
}

export function initializeAuth(): void {
  loadUsers();
}

function renewSessionIfNeeded(session: AuthSession): AuthSession {
  const expiresAtMs = new Date(session.expiresAt).getTime();
  const renewWithinMs = SESSION_RENEW_IF_WITHIN_DAYS * 24 * 60 * 60 * 1000;
  if (expiresAtMs - Date.now() > renewWithinMs) {
    return session;
  }

  const renewed: AuthSession = {
    ...session,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
  safeSetItem(SESSION_KEY, JSON.stringify(renewed));
  return renewed;
}

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return renewSessionIfNeeded(session);
  } catch {
    return null;
  }
}

export function getCurrentTenantId(): string {
  const session = getSession();
  if (!session) {
    throw new Error('No active session');
  }
  return session.tenantId;
}

export function getCurrentUserId(): string | null {
  return getSession()?.userId ?? null;
}

export function getAvatarInitials(firstName: string, lastName: string): string {
  const f = (firstName?.trim()[0] ?? '').toUpperCase();
  const l = (lastName?.trim()[0] ?? '').toUpperCase();
  return `${f}${l}` || '?';
}

export async function register(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}): Promise<{
  success: boolean;
  message?: string;
  session?: AuthSession;
  supabaseWarning?: string;
  needsEmailConfirmation?: boolean;
}> {
  const normalizedEmail = data.email.trim().toLowerCase();
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const phone = data.phone.trim();

  if (firstName.length < 2) return { success: false, message: 'First name is required' };
  if (lastName.length < 2) return { success: false, message: 'Last name is required' };
  if (data.password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters' };
  }

  const users = loadUsers();
  if (users.some(u => u.email.toLowerCase() === normalizedEmail)) {
    return { success: false, message: 'An account with this email already exists' };
  }

  const tenantId = `tenant-${generateId()}`;
  const user: AuthUser = {
    id: `user-${generateId()}`,
    tenantId,
    email: normalizedEmail,
    password: data.password,
    firstName,
    lastName,
    phone,
  };
  users.push(user);
  saveUsers(users);

  const session: AuthSession = {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
  safeSetItem(SESSION_KEY, JSON.stringify(session));
  notifyAuthChanged();
  clearStorageCache();
  markTenantDataDirty();

  const supabaseResult = await signUpSupabaseIfOnline(normalizedEmail, data.password, {
    tenant_id: tenantId,
    first_name: firstName,
    last_name: lastName,
    phone,
  });

  if (supabaseResult.ok) {
    if (supabaseResult.needsEmailConfirmation) {
      return {
        success: true,
        session,
        needsEmailConfirmation: true,
        supabaseWarning:
          'Account created locally. Check your email to confirm your address before cloud sync works.',
      };
    }
    void runSyncIfNeeded();
    return { success: true, session };
  }

  if (supabaseResult.error === 'offline-or-unconfigured') {
    return { success: true, session };
  }

  return {
    success: true,
    session,
    supabaseWarning:
      'Account created locally. Cloud signup failed — you can still use the app offline. Try signing in again when online.',
  };
}

function createSessionFromUser(user: AuthUser): AuthSession {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function persistLoginSession(user: AuthUser): AuthSession {
  const session = createSessionFromUser(user);
  safeSetItem(SESSION_KEY, JSON.stringify(session));
  notifyAuthChanged();
  clearStorageCache();
  markTenantDataDirty();
  return session;
}

function upsertLocalUserFromCloud(
  users: AuthUser[],
  profile: {
    id: string;
    email: string;
    tenantId: string;
    firstName: string;
    lastName: string;
    phone: string;
  },
  password: string,
): AuthUser {
  const normalizedEmail = profile.email.trim().toLowerCase();
  const existingIdx = users.findIndex(
    (entry) => entry.email.toLowerCase() === normalizedEmail,
  );

  const user: AuthUser = {
    id: profile.id,
    tenantId: profile.tenantId,
    email: normalizedEmail,
    password,
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
  };

  if (existingIdx === -1) {
    users.push(user);
  } else {
    users[existingIdx] = user;
  }

  saveUsers(users);
  return user;
}

export async function login(
  email: string,
  password: string
): Promise<{
  success: boolean;
  message?: string;
  session?: AuthSession;
  supabaseWarning?: string;
}> {
  const normalizedEmail = email.trim().toLowerCase();
  const users = loadUsers();
  const user = users.find(u => u.email.toLowerCase() === normalizedEmail);

  if (user && user.password === password) {
    const session = persistLoginSession(user);

    const supabaseResult = await signInSupabaseIfOnline(user.email, password);
    if (supabaseResult.ok) {
      void runSyncIfNeeded();
      return { success: true, session };
    }

    if (supabaseResult.error === 'offline-or-unconfigured') {
      return { success: true, session };
    }

    return {
      success: true,
      session,
      supabaseWarning:
        'Signed in locally. For cloud sync, use the same email/password in Supabase Auth, then sign out and sign in again.',
    };
  }

  const cloudResult = await signInSupabaseWithProfile(normalizedEmail, password);
  if (cloudResult.ok && cloudResult.profile) {
    const localUser = upsertLocalUserFromCloud(
      users,
      cloudResult.profile,
      password,
    );
    const session = persistLoginSession(localUser);
    void runSyncIfNeeded();
    return { success: true, session };
  }

  if (cloudResult.error === 'offline-or-unconfigured') {
    return { success: false, message: 'Invalid email or password' };
  }

  if (cloudResult.error && /confirm|verified|email/i.test(cloudResult.error)) {
    return {
      success: false,
      message:
        'Confirm your email address first, then try signing in again.',
    };
  }

  return { success: false, message: 'Invalid email or password' };
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
  void signOutSupabase();
  clearStorageCache();
  notifyAuthChanged();
}

export function updateProfile(updates: {
  firstName: string;
  lastName: string;
  phone: string;
}): { success: boolean; message?: string; session?: AuthSession } {
  const session = getSession();
  if (!session) return { success: false, message: 'Not logged in' };

  const firstName = updates.firstName.trim();
  const lastName = updates.lastName.trim();
  const phone = updates.phone.trim();

  if (firstName.length < 2) return { success: false, message: 'First name is required' };
  if (lastName.length < 2) return { success: false, message: 'Last name is required' };

  const users = loadUsers();
  const idx = users.findIndex(u => u.id === session.userId);
  if (idx === -1) return { success: false, message: 'User not found' };

  users[idx] = { ...users[idx], firstName, lastName, phone };
  saveUsers(users);

  const updatedSession: AuthSession = {
    ...session,
    firstName,
    lastName,
    phone,
  };
  safeSetItem(SESSION_KEY, JSON.stringify(updatedSession));
  notifyAuthChanged();
  return { success: true, session: updatedSession };
}

export function requestPasswordReset(
  email: string
): { success: boolean; message: string; resetToken?: string } {
  const normalizedEmail = email.trim().toLowerCase();
  const users = loadUsers();
  const user = users.find(u => u.email.toLowerCase() === normalizedEmail);

  if (!user) {
    return {
      success: true,
      message: 'If an account exists for this email, reset instructions have been generated.',
    };
  }

  const token = generateId() + generateId();
  const expiresAt = new Date(Date.now() + RESET_HOURS * 60 * 60 * 1000).toISOString();
  const tokens = loadResetTokens().filter(t => t.email !== normalizedEmail);
  tokens.push({ email: normalizedEmail, token, expiresAt });
  localStorage.setItem(RESET_TOKENS_KEY, JSON.stringify(tokens));

  return {
    success: true,
    message: 'Password reset link generated. Use the link below to set a new password.',
    resetToken: token,
  };
}

export function resetPassword(
  token: string,
  newPassword: string
): { success: boolean; message: string } {
  if (newPassword.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters' };
  }

  const tokens = loadResetTokens();
  const entry = tokens.find(t => t.token === token);
  if (!entry) {
    return { success: false, message: 'Invalid or expired reset link' };
  }
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    return { success: false, message: 'Reset link has expired. Request a new one.' };
  }

  const users = loadUsers();
  const idx = users.findIndex(u => u.email.toLowerCase() === entry.email);
  if (idx === -1) {
    return { success: false, message: 'User not found' };
  }

  users[idx].password = newPassword;
  saveUsers(users);
  localStorage.setItem(
    RESET_TOKENS_KEY,
    JSON.stringify(tokens.filter(t => t.token !== token))
  );

  return { success: true, message: 'Password updated. You can sign in now.' };
}

function loadResetTokens(): PasswordResetToken[] {
  try {
    const raw = localStorage.getItem(RESET_TOKENS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

/** Reconnect Supabase using stored local credentials (same email/password). */
export async function reconnectCloudSession(): Promise<{
  ok: boolean;
  message?: string;
}> {
  const session = getSession();
  if (!session) {
    return { ok: false, message: 'Sign in to the app first' };
  }

  const users = loadUsers();
  const user = users.find((u) => u.id === session.userId);
  if (!user) {
    return { ok: false, message: 'Local user not found — sign in again' };
  }

  return reconnectSupabaseFromLocalSession(user.email, user.password);
}
