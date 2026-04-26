const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: "super_admin" | "staff" | "admin" | "user" | "viewer";
  avatar_url: string | null;
  is_active: boolean;
  oauth_provider: string | null;
  organization_id: string | null;
  created_at: string;
  last_login: string | null;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("brain_token");
}

export function setToken(token: string) {
  localStorage.setItem("brain_token", token);
}

export function clearToken() {
  localStorage.removeItem("brain_token");
  localStorage.removeItem("brain_user");
}

export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearToken();
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem("brain_user");
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export function storeUser(user: AuthUser) {
  localStorage.setItem("brain_user", JSON.stringify(user));
}

export function withAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

export async function fetchMe(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { clearToken(); return null; }
    const user = await res.json();
    storeUser(user);
    return user;
  } catch { return null; }
}

export async function loginWithPassword(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Invalid credentials");
  }
  const data = await res.json();
  setToken(data.token || data.access_token);
  storeUser(data.user);
  return data.user;
}

export async function registerUser(email: string, username: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Registration failed");
  }
  const data = await res.json();
  setToken(data.token || data.access_token);
  storeUser(data.user);
  return data.user;
}

export function oauthRedirect(provider: "google" | "microsoft") {
  window.location.href = `${BASE}/auth/${provider}`;
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "admin";
}

export function isSuperAdmin(user: AuthUser | null): boolean {
  return user?.role === "super_admin";
}

export function hasBrainAccess(user: AuthUser | null): boolean {
  return !!user && user.role !== "super_admin" && user.role !== "staff";
}

export function canViewAuditLog(user: AuthUser | null): boolean {
  return !!user && ["admin", "staff", "super_admin"].includes(user.role);
}
