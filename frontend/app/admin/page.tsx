"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Shield, UserPlus, Trash2, Edit2, Check, X, ChevronLeft,
  Activity, Database, Key, Eye, EyeOff, AlertCircle, Search,
} from "lucide-react";
import { AuthUser, getToken, fetchMe, isAdmin, clearToken } from "@/lib/auth";
import { AISpinner } from "@/components/AISpinner";

const BASE = "http://localhost:8000/api";
type Role = "admin" | "user" | "viewer";
type Tab  = "users" | "permissions";

const ROLE_COLORS: Record<Role, { bg: string; text: string }> = {
  admin:  { bg: "rgba(0,200,150,0.15)",   text: "#33d9ab" },
  user:   { bg: "rgba(59,130,246,0.15)",  text: "#60a5fa" },
  viewer: { bg: "rgba(107,114,128,0.15)", text: "#9ca3af" },
};

interface UserRow extends AuthUser { dataset_permissions: string[]; }
interface Dataset { id: string; name: string; source_type: string; }

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}
function sourceColor(t: string) {
  if (t === "postgres") return "#60a5fa";
  if (t === "mysql") return "#fb923c";
  if (t === "sheets") return "#34d399";
  if (t === "xlsx" || t === "xls") return "#33d9ab";
  return "#4ade80";
}

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe]           = useState<AuthUser | null>(null);
  const [users, setUsers]     = useState<UserRow[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [stats, setStats]     = useState<{ total_users: number; active_users: number; admin_count: number; total_datasets: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<Tab>("users");
  const [search, setSearch]   = useState("");

  // User create state
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser]   = useState({ email: "", username: "", password: "", role: "user" as Role });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Edit state
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editRole, setEditRole]     = useState<Role>("user");
  const [savingId, setSavingId]     = useState<string | null>(null);

  // Permissions state
  const [permUser, setPermUser]       = useState<UserRow | null>(null);
  const [permSelected, setPermSelected] = useState<Set<string>>(new Set());
  const [savingPerms, setSavingPerms]   = useState(false);

  const load = useCallback(async () => {
    const [usersRes, statsRes, dsRes] = await Promise.all([
      fetch(`${BASE}/admin/users`,   { headers: authHeaders() }),
      fetch(`${BASE}/admin/stats`,   { headers: authHeaders() }),
      fetch(`${BASE}/admin/datasets`,{ headers: authHeaders() }),
    ]);
    if (usersRes.ok)  setUsers(await usersRes.json());
    if (statsRes.ok)  setStats(await statsRes.json());
    if (dsRes.ok)     setDatasets(await dsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    fetchMe().then(u => {
      if (!u) { router.replace("/login"); return; }
      if (!isAdmin(u)) { router.replace("/"); return; }
      setMe(u); load();
    });
  }, []);

  const saveRole = async (userId: string) => {
    setSavingId(userId);
    await fetch(`${BASE}/admin/users/${userId}`, {
      method: "PATCH", headers: authHeaders(),
      body: JSON.stringify({ role: editRole }),
    });
    setEditingId(null); setSavingId(null); load();
  };

  const toggleActive = async (user: UserRow) => {
    setSavingId(user.id);
    await fetch(`${BASE}/admin/users/${user.id}`, {
      method: "PATCH", headers: authHeaders(),
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    setSavingId(null); load();
  };

  const deleteUser = async (userId: string) => {
    if (!confirm("Delete this user permanently?")) return;
    setSavingId(userId);
    await fetch(`${BASE}/admin/users/${userId}`, { method: "DELETE", headers: authHeaders() });
    setSavingId(null); load();
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault(); setCreateError(""); setCreating(true);
    try {
      const res = await fetch(`${BASE}/admin/users`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(newUser),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      setShowCreate(false); setNewUser({ email: "", username: "", password: "", role: "user" }); load();
    } catch (err: unknown) { setCreateError((err as Error).message); }
    finally { setCreating(false); }
  };

  const openPermissions = (user: UserRow) => {
    setPermUser(user);
    setPermSelected(new Set(user.dataset_permissions));
    setTab("permissions");
  };

  const savePermissions = async () => {
    if (!permUser) return;
    setSavingPerms(true);
    await fetch(`${BASE}/admin/users/${permUser.id}/permissions`, {
      method: "PUT", headers: authHeaders(),
      body: JSON.stringify({ dataset_ids: Array.from(permSelected) }),
    });
    setSavingPerms(false); load();
    setUsers(prev => prev.map(u => u.id === permUser.id
      ? { ...u, dataset_permissions: Array.from(permSelected) } : u));
  };

  const filteredUsers = search
    ? users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    : users;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)" }}>
      <AISpinner size={28} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "32px 24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <button onClick={() => router.push("/")} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer",
          }}>
            <ChevronLeft size={13} /> Back to brAIn
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={17} style={{ color: "#33d9ab" }} />
              <h1 style={{ fontSize: 19, fontWeight: 700, color: "var(--text)" }}>Admin Console</h1>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Manage users, roles & dataset permissions</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {me?.avatar_url
              ? <img src={me.avatar_url} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
              : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#00c896,#059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{me?.username?.[0]?.toUpperCase()}</span>
                </div>
            }
            <button onClick={() => { clearToken(); router.replace("/login"); }}
              style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer" }}>
              Sign out
            </button>
          </div>
        </div>

        {/* Stat cards */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Total Users",    value: stats.total_users,    icon: <Users size={15} />,    color: "#60a5fa" },
              { label: "Active Users",   value: stats.active_users,   icon: <Activity size={15} />, color: "#34d399" },
              { label: "Admins",         value: stats.admin_count,    icon: <Shield size={15} />,   color: "#33d9ab" },
              { label: "Datasets",       value: stats.total_datasets, icon: <Database size={15} />, color: "#fbbf24" },
            ].map(s => (
              <div key={s.label} style={{
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "16px 18px",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{ color: s.color }}>{s.icon}</div>
                <div>
                  <p style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{s.value}</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 16, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 4, width: "fit-content" }}>
          {([["users", <Users size={13} />, "Users"], ["permissions", <Key size={13} />, "Permissions"]] as const).map(([id, icon, label]) => (
            <button key={id} onClick={() => setTab(id as Tab)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 16px", borderRadius: 7, fontSize: 12, fontWeight: 500,
              border: "none", cursor: "pointer",
              background: tab === id ? "var(--accent)" : "transparent",
              color: tab === id ? "#fff" : "var(--text-muted)",
              transition: "all 150ms ease",
            }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* ── USERS TAB ── */}
        {tab === "users" && (
          <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, padding: "7px 10px", borderRadius: 8, background: "var(--surface3)", border: "1px solid var(--border)" }}>
                <Search size={12} style={{ color: "var(--text-dim)" }} />
                <input placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "var(--text)" }} />
              </div>
              <button onClick={() => setShowCreate(v => !v)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: "linear-gradient(135deg,#00c896,#059669)", color: "#fff",
                border: "none", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,200,150,0.3)", flexShrink: 0,
              }}>
                <UserPlus size={13} /> New User
              </button>
            </div>

            {/* Create form */}
            {showCreate && (
              <form onSubmit={createUser} style={{
                padding: "16px 18px", borderBottom: "1px solid var(--border)",
                background: "rgba(0,200,150,0.04)",
              }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Create New User
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  {[
                    { ph: "Email address", val: newUser.email, key: "email", type: "email" },
                    { ph: "Username",      val: newUser.username, key: "username", type: "text" },
                    { ph: "Password",      val: newUser.password, key: "password", type: "password" },
                  ].map(f => (
                    <input key={f.key} type={f.type} placeholder={f.ph} value={f.val} required
                      onChange={e => setNewUser(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ flex: "1 1 160px", padding: "8px 12px", borderRadius: 8, fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}
                    />
                  ))}
                  <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value as Role }))}
                    style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}>
                    <option value="user">User</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="submit" disabled={creating}
                      style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#00c896", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                      {creating ? <AISpinner size={12} /> : <Check size={12} />} Create
                    </button>
                    <button type="button" onClick={() => setShowCreate(false)}
                      style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, background: "var(--surface3)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
                {createError && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, padding: "8px 12px", borderRadius: 7, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}>
                    <AlertCircle size={12} style={{ color: "#f87171" }} />
                    <span style={{ fontSize: 12, color: "#f87171" }}>{createError}</span>
                  </div>
                )}
              </form>
            )}

            {/* User rows */}
            {filteredUsers.map((user, i) => {
              const isMe     = user.id === me?.id;
              const rs       = ROLE_COLORS[user.role as Role] ?? ROLE_COLORS.viewer;
              const isEditing = editingId === user.id;
              const isSaving  = savingId  === user.id;
              return (
                <div key={user.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "13px 18px",
                  borderBottom: i < filteredUsers.length - 1 ? "1px solid var(--border)" : "none",
                  opacity: user.is_active ? 1 : 0.45,
                  transition: "opacity 200ms ease",
                }}>
                  {/* Avatar */}
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#00c896,#059669)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{user.username[0]?.toUpperCase()}</span>
                      </div>
                  }

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{user.username}</span>
                      {isMe && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(0,200,150,0.2)", color: "#33d9ab" }}>YOU</span>}
                      {!user.is_active && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,0.15)", color: "#f87171" }}>DISABLED</span>}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</p>
                  </div>

                  {/* Dataset count pill */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: "var(--surface3)", border: "1px solid var(--border)" }}>
                    <Database size={10} style={{ color: "var(--text-dim)" }} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {user.role === "admin" ? "all" : user.dataset_permissions.length}
                    </span>
                  </div>

                  {/* Role */}
                  {isEditing ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <select value={editRole} onChange={e => setEditRole(e.target.value as Role)}
                        style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}>
                        <option value="admin">Admin</option>
                        <option value="user">User</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button onClick={() => saveRole(user.id)} style={{ padding: "4px 8px", borderRadius: 6, background: "#00c896", border: "none", cursor: "pointer", color: "#fff" }}>
                        {isSaving ? <AISpinner size={11} /> : <Check size={11} />}
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ padding: "4px 8px", borderRadius: 6, background: "var(--surface3)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-muted)" }}>
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, fontWeight: 600, background: rs.bg, color: rs.text, whiteSpace: "nowrap" }}>
                      {user.role}
                    </span>
                  )}

                  {/* Actions */}
                  {!isEditing && (
                    <div style={{ display: "flex", gap: 5 }}>
                      <button onClick={() => openPermissions(user)} title="Manage dataset access"
                        style={{ padding: "5px 7px", borderRadius: 7, background: "rgba(0,200,150,0.1)", border: "1px solid rgba(0,200,150,0.2)", cursor: "pointer", color: "#00c896" }}>
                        <Key size={12} />
                      </button>
                      <button onClick={() => { setEditingId(user.id); setEditRole(user.role as Role); }} title="Edit role"
                        style={{ padding: "5px 7px", borderRadius: 7, background: "var(--surface3)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-muted)" }}>
                        <Edit2 size={12} />
                      </button>
                      {!isMe && (
                        <>
                          <button onClick={() => toggleActive(user)} title={user.is_active ? "Disable user" : "Enable user"}
                            style={{ padding: "5px 7px", borderRadius: 7, background: "var(--surface3)", border: "1px solid var(--border)", cursor: "pointer", color: user.is_active ? "#f59e0b" : "#34d399" }}>
                            {isSaving ? <AISpinner size={12} /> : user.is_active ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button onClick={() => deleteUser(user.id)} title="Delete user"
                            style={{ padding: "5px 7px", borderRadius: 7, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer", color: "#f87171" }}>
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredUsers.length === 0 && (
              <p style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "var(--text-dim)" }}>No users found</p>
            )}
          </div>
        )}

        {/* ── PERMISSIONS TAB ── */}
        {tab === "permissions" && (
          <div style={{ display: "flex", gap: 16 }}>
            {/* User list */}
            <div style={{ width: 220, flexShrink: 0, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Select User</p>
              </div>
              {users.map(u => (
                <button key={u.id} onClick={() => { setPermUser(u); setPermSelected(new Set(u.dataset_permissions)); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 9,
                    padding: "10px 14px", border: "none", cursor: "pointer", textAlign: "left",
                    background: permUser?.id === u.id ? "rgba(0,200,150,0.1)" : "transparent",
                    borderLeft: permUser?.id === u.id ? "2px solid #00c896" : "2px solid transparent",
                    transition: "all 120ms ease",
                  }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#00c896,#059669)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{u.username[0]?.toUpperCase()}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.username}</p>
                    <p style={{ fontSize: 10, color: "var(--text-dim)" }}>{u.role}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Dataset permission picker */}
            <div style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
              {!permUser ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 40, gap: 12 }}>
                  <Key size={28} style={{ color: "var(--text-dim)" }} />
                  <p style={{ fontSize: 14, color: "var(--text-dim)" }}>Select a user to manage dataset access</p>
                </div>
              ) : (
                <>
                  <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{permUser.username}</p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {permUser.role === "admin" ? "Admins always have full access" : `${permSelected.size} of ${datasets.length} datasets selected`}
                      </p>
                    </div>
                    {permUser.role !== "admin" && (
                      <button onClick={savePermissions} disabled={savingPerms} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "7px 16px",
                        borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: "linear-gradient(135deg,#00c896,#059669)", color: "#fff",
                        border: "none", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,200,150,0.25)",
                      }}>
                        {savingPerms ? <AISpinner size={12} /> : <Check size={12} />} Save Permissions
                      </button>
                    )}
                  </div>

                  {permUser.role === "admin" ? (
                    <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 10 }}>
                      <Shield size={16} style={{ color: "#33d9ab" }} />
                      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Admin role has unrestricted access to all datasets.</span>
                    </div>
                  ) : datasets.length === 0 ? (
                    <p style={{ padding: 20, fontSize: 13, color: "var(--text-dim)" }}>No datasets found. Upload data first.</p>
                  ) : (
                    <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {/* Select all / none */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <button onClick={() => setPermSelected(new Set(datasets.map(d => d.id)))}
                          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "var(--surface3)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer" }}>
                          Select all
                        </button>
                        <button onClick={() => setPermSelected(new Set())}
                          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "var(--surface3)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer" }}>
                          Clear
                        </button>
                      </div>
                      {datasets.map(ds => {
                        const checked = permSelected.has(ds.id);
                        return (
                          <label key={ds.id} style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                            borderRadius: 10, cursor: "pointer",
                            background: checked ? "rgba(0,200,150,0.07)" : "var(--surface3)",
                            border: `1px solid ${checked ? "rgba(0,200,150,0.3)" : "var(--border)"}`,
                            transition: "all 150ms ease",
                          }}>
                            <input type="checkbox" checked={checked}
                              onChange={e => {
                                const s = new Set(permSelected);
                                e.target.checked ? s.add(ds.id) : s.delete(ds.id);
                                setPermSelected(s);
                              }}
                              style={{ accentColor: "#00c896", width: 14, height: 14 }} />
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: sourceColor(ds.source_type), flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 13, color: "var(--text)", fontWeight: checked ? 600 : 400 }}>{ds.name}</span>
                            <span style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{ds.source_type}</span>
                            {checked && <Check size={12} style={{ color: "#00c896", flexShrink: 0 }} />}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-dim)", marginTop: 24 }}>
          brAIn Admin Console · {users.length} user{users.length !== 1 ? "s" : ""} · {datasets.length} dataset{datasets.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}
