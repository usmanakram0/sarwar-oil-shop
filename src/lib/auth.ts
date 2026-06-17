import {
  signInSupabaseIfOnline,
  signOutSupabase,
  signUpSupabaseIfOnline,
} from '@/lib/supabase/authBridge';
import { clearStorageCache } from '@/lib/storage';
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
const SESSION_KEY = 'oilshop_session';
const RESET_TOKENS_KEY = 'oilshop_reset_tokens';
const SESSION_DAYS = 7;
const RESET_HOURS = 24;

export const AUTH_CHANGED_EVENT = 'oilshop-auth-changed';

function notifyAuthChanged(): void {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

function loadUsers(): AuthUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw) as AuthUser[];
  } catch {
    /* ignore */
  }
  const seeded = SEED_USERS;
  localStorage.setItem(USERS_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveUsers(users: AuthUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function initializeAuth(): void {
  loadUsers();
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
    return session;
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
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
  if (!user) {
    return { success: false, message: 'Invalid email or password' };
  }
  if (user.password !== password) {
    return { success: false, message: 'Invalid email or password' };
  }
  const session: AuthSession = {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  notifyAuthChanged();
  clearStorageCache();
  markTenantDataDirty();

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
  localStorage.setItem(SESSION_KEY, JSON.stringify(updatedSession));
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
