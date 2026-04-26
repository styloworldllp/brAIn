"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  User, Lock, Mail, Check, AlertCircle,
  Database, Shield, LogOut, ChevronRight, Settings, Crown,
} from "lucide-react";
import { AuthUser, getToken, fetchMe, logout, storeUser, isAdmin, isSuperAdmin } from "@/lib/auth";
import { AISpinner } from "@/components/AISpinner";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  super_admin: { label: "Super Admin", color: "#9333ea", bg: "rgba(147,51,234,0.12)" },
  admin:  { label: "Admin",  color: "#059669", bg: "rgba(0,200,150,0.1)"  },
  user:   { label: "User",   color: "#2563eb", bg: "rgba(37,99,235,0.08)" },
  viewer: { label: "Viewer", color: "#6b7280", bg: "rgba(107,114,128,0.1)"},
};

function sourceColor(t: string) {
  if (t === "postgres") return "#3b82f6";
  if (t === "mysql")    return "#f97316";
  if (t === "sheets")   return "#10b981";
  if (t === "xlsx" || t === "xls") return "#00c896";
  return "#22c55e";
}

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe]               = useState<AuthUser | null>(null);
  const [datasets, setDatasets]   = useState<{ id: string; name: string; source_type: string }[]>([]);
  const [loading, setLoading]     = useState(true);
  const [section, setSection]     = useState<"info" | "password" | "data">("info");

  const [username, setUsername]   = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving]       = useState(false);
  const [success, setSuccess]     = useState("");
  const [error, setError]         = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    fetchMe().then(u => {
      if (!u) { router.replace("/login"); return; }
      setMe(u);
      setUsername(u.username);
      if (u.role !== "super_admin") {
        fetch(`${BASE}/datasets`, { headers: authHeaders() })
          .then(r => r.ok ? r.json() : [])
          .then(setDatasets)
          .catch(() => {});
      } else {
        setDatasets([]);
      }
      setLoading(false);
    });
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (section === "password") {
      if (!newPw) { setError("Enter a new password."); return; }
      if (newPw !== confirmPw) { setError("Passwords do not match."); return; }
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (section === "info")     body.username = username;
      if (section === "password") body.password = newPw;
      const res = await fetch(`${BASE}/auth/me/profile`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      const updated = await res.json();
      storeUser(updated); setMe(updated);
      setNewPw(""); setConfirmPw("");
      setSuccess(section === "password" ? "Password updated." : "Profile updated.");
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const signOut = () => { logout().then(() => router.replace("/login")); };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f5f5f7" }}>
      <AISpinner size={26} />
    </div>
  );

  const role  = me?.role ?? "user";
  const rm    = ROLE_META[role] ?? ROLE_META.user;
  const init  = (me?.username ?? "U")[0].toUpperCase();
  const joined = me?.created_at
    ? new Date(me.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',sans-serif" }}>

      {/* ── Top nav bar ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(245,245,247,0.85)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        padding: "0 24px",
        display: "flex", alignItems: "center", height: 52,
      }}>
        <button onClick={() => router.push("/")} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          color: "#00c896", fontSize: 14, fontWeight: 500, padding: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          brAIn
        </button>
        <span style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 600, color: "#1d1d1f" }}>Account</span>
        <button onClick={signOut} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          color: "#ff3b30", fontSize: 13, fontWeight: 500, padding: 0,
        }}>
          <LogOut size={14} />
          Sign out
        </button>
      </nav>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 20px 60px" }}>

        {/* ── Identity hero card ── */}
        <div style={{
          background: "#fff", borderRadius: 20,
          padding: "28px 28px 24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)",
          marginBottom: 16,
          display: "flex", alignItems: "center", gap: 20,
        }}>
          {/* Avatar */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "linear-gradient(135deg,#00c896,#059669)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 14px rgba(0,200,150,0.3)",
            }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>{init}</span>
            </div>
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", margin: 0, letterSpacing: "-0.3px" }}>{me?.username}</h1>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: rm.bg, color: rm.color }}>
                {rm.label}
              </span>
            </div>
            <p style={{ fontSize: 14, color: "#6e6e73", margin: "0 0 6px" }}>{me?.email}</p>
            {joined && <p style={{ fontSize: 12, color: "#aeaeb2", margin: 0 }}>Member since {joined}</p>}
          </div>

          {/* Admin console shortcut */}
          {isAdmin(me) && (
            <button onClick={() => router.push("/admin")} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 16px", borderRadius: 10,
              background: "rgba(0,200,150,0.08)", border: "1px solid rgba(0,200,150,0.2)",
              color: "#059669", fontSize: 13, fontWeight: 600, cursor: "pointer",
              flexShrink: 0, transition: "background 140ms ease",
            }}>
              <Settings size={13} />
              Admin
            </button>
          )}
          {isSuperAdmin(me) && (
            <button onClick={() => router.push("/superadmin")} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 16px", borderRadius: 10,
              background: "rgba(147,51,234,0.08)", border: "1px solid rgba(147,51,234,0.18)",
              color: "#9333ea", fontSize: 13, fontWeight: 600, cursor: "pointer",
              flexShrink: 0, transition: "background 140ms ease",
            }}>
              <Crown size={13} />
              Command Center
            </button>
          )}
        </div>

        {/* ── Settings sections ── */}
        <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 16 }}>

          {/* Section nav */}
          <div style={{ display: "flex", borderBottom: "1px solid #f2f2f7" }}>
            {([
              { id: "info",     icon: <User size={13} />,  label: "Profile" },
              { id: "password", icon: <Lock size={13} />,  label: "Password" },
              { id: "data",     icon: <Database size={13} />, label: "Datasets" },
            ] as const).map(s => (
              <button key={s.id} onClick={() => { setSection(s.id); setError(""); setSuccess(""); }} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "14px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
                background: "transparent",
                color: section === s.id ? "#00c896" : "#6e6e73",
                borderBottom: `2px solid ${section === s.id ? "#00c896" : "transparent"}`,
                transition: "color 150ms ease, border-color 150ms ease",
                marginBottom: -1,
              }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>

          {/* ── Profile section ── */}
          {section === "info" && (
            <form onSubmit={saveProfile} style={{ padding: "28px 28px 24px" }}>
              <FieldGroup label="Username" icon={<User size={14} />}>
                <input value={username} onChange={e => setUsername(e.target.value)}
                  style={inputCss} placeholder="username" />
              </FieldGroup>
              <FieldGroup label="Email address" icon={<Mail size={14} />}>
                <input value={me?.email ?? ""} disabled style={{ ...inputCss, color: "#aeaeb2", cursor: "not-allowed" }} />
                <p style={{ fontSize: 11, color: "#aeaeb2", marginTop: 4 }}>Email cannot be changed here.</p>
              </FieldGroup>
              <FeedbackBar error={error} success={success} />
              <SaveBtn saving={saving} />
            </form>
          )}

          {/* ── Password section ── */}
          {section === "password" && (
            <form onSubmit={saveProfile} style={{ padding: "28px 28px 24px" }}>
              <FieldGroup label="New password" icon={<Lock size={14} />}>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                  style={inputCss} placeholder="New password" />
              </FieldGroup>
              <FieldGroup label="Confirm password" icon={<Lock size={14} />}>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  style={inputCss} placeholder="Repeat new password" />
              </FieldGroup>
              <FeedbackBar error={error} success={success} />
              <SaveBtn saving={saving} />
            </form>
          )}

          {/* ── Datasets section ── */}
          {section === "data" && (
            <div style={{ padding: "24px 28px" }}>
              {role === "super_admin" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px", borderRadius: 12, background: "rgba(147,51,234,0.08)", border: "1px solid rgba(147,51,234,0.16)" }}>
                  <Crown size={16} style={{ color: "#9333ea" }} />
                  <p style={{ fontSize: 14, color: "#7e22ce", margin: 0, fontWeight: 500 }}>
                    Super admin accounts do not use the brAIn workspace. Manage customer details, licenses, and neurons from the Stylo Command Center.
                  </p>
                </div>
              ) : role === "admin" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px", borderRadius: 12, background: "rgba(0,200,150,0.06)", border: "1px solid rgba(0,200,150,0.15)" }}>
                  <Shield size={16} style={{ color: "#00c896" }} />
                  <p style={{ fontSize: 14, color: "#059669", margin: 0, fontWeight: 500 }}>Admin — full access to all datasets</p>
                </div>
              ) : datasets.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <Database size={28} style={{ color: "#aeaeb2", margin: "0 auto 10px" }} />
                  <p style={{ fontSize: 14, color: "#aeaeb2", margin: 0 }}>No datasets assigned yet.</p>
                  <p style={{ fontSize: 12, color: "#c7c7cc", marginTop: 4 }}>Contact an admin to get access.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {datasets.map(ds => (
                    <div key={ds.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, background: "#f5f5f7", border: "1px solid #e8e8ed" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: sourceColor(ds.source_type), flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 14, color: "#1d1d1f", fontWeight: 500 }}>{ds.name}</span>
                      <span style={{ fontSize: 11, color: "#8a8a8e", textTransform: "uppercase", letterSpacing: "0.04em" }}>{ds.source_type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sign out card ── */}
        <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <button onClick={signOut} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 14,
            padding: "18px 24px", background: "none", border: "none", cursor: "pointer",
            textAlign: "left", transition: "background 140ms ease",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,59,48,0.04)")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,59,48,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <LogOut size={16} style={{ color: "#ff3b30" }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#ff3b30", margin: 0 }}>Sign out</p>
              <p style={{ fontSize: 12, color: "#aeaeb2", margin: "2px 0 0" }}>You'll need to sign back in to access brAIn</p>
            </div>
            <ChevronRight size={16} style={{ color: "#c7c7cc" }} />
          </button>
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "#c7c7cc", marginTop: 28 }}>
          brAIn · Signed in as {me?.username}
        </p>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function FieldGroup({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#3a3a3c", marginBottom: 7 }}>
        {icon} {label}
      </label>
      {children}
    </div>
  );
}

function FeedbackBar({ error, success }: { error: string; success: string }) {
  if (!error && !success) return null;
  const isErr = !!error;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 14px", borderRadius: 10, marginBottom: 16,
      background: isErr ? "rgba(255,59,48,0.06)" : "rgba(0,200,150,0.07)",
      border: `1px solid ${isErr ? "rgba(255,59,48,0.2)" : "rgba(0,200,150,0.2)"}`,
    }}>
      {isErr
        ? <AlertCircle size={13} style={{ color: "#ff3b30", flexShrink: 0 }} />
        : <Check size={13} style={{ color: "#00c896", flexShrink: 0 }} />
      }
      <span style={{ fontSize: 12, color: isErr ? "#ff3b30" : "#059669" }}>{error || success}</span>
    </div>
  );
}

function SaveBtn({ saving }: { saving: boolean }) {
  return (
    <button type="submit" disabled={saving} style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "11px 24px", borderRadius: 12,
      background: "linear-gradient(135deg,#00c896,#059669)",
      border: "none", cursor: saving ? "default" : "pointer",
      color: "#fff", fontSize: 13, fontWeight: 600,
      boxShadow: "0 3px 12px rgba(0,200,150,0.28)",
      transition: "transform 130ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
      opacity: saving ? 0.7 : 1,
    }}
      onMouseEnter={e => { if (!saving) e.currentTarget.style.transform = "scale(1.01)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseDown={e  => { e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={e    => { e.currentTarget.style.transform = "scale(1.01)"; }}
    >
      {saving ? <><AISpinner size={13} /> Saving…</> : <><Check size={13} /> Save changes</>}
    </button>
  );
}

const inputCss: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 12, fontSize: 14,
  background: "#f5f5f7", border: "1.5px solid #e8e8ed",
  color: "#1d1d1f", outline: "none", boxSizing: "border-box",
  fontFamily: "inherit", transition: "border-color 150ms ease, background 150ms ease",
};
