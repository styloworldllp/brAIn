"use client";
import { useState, useEffect } from "react";
import { X, Plus, Trash2, Moon, Sun, Monitor, Leaf } from "lucide-react";
import { getStoredUser, isAdmin, withAuthHeaders } from "@/lib/auth";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";
interface SecretKey { id: string; name: string; has_value?: boolean; }
interface Props { onClose: () => void; }

function applyTheme(t: string) {
  const h = document.documentElement;
  h.classList.remove("dark", "light", "stylogreen");
  if (t === "light") h.classList.add("light");
  else if (t === "stylogreen") h.classList.add("stylogreen");
  else if (t === "system") h.classList.add(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  else h.classList.add("dark");
  localStorage.setItem("brain-theme", t);
}

const THEMES = [
  { id: "dark",       Icon: Moon,    label: "Dark"  },
  { id: "stylogreen", Icon: Leaf,    label: "Stylo" },
  { id: "light",      Icon: Sun,     label: "Light" },
  { id: "system",     Icon: Monitor, label: "Auto"  },
] as const;

const S = {
  inpBase: { width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, background: "var(--surface3)", border: "1px solid var(--border2)", color: "var(--text)" },
};

export default function SettingsModal({ onClose }: Props) {
  const canManageSecrets = isAdmin(getStoredUser());
  const tabOptions: Array<"general" | "secrets"> = canManageSecrets ? ["general", "secrets"] : ["general"];
  const [tab,     setTab]     = useState<"general" | "secrets">("general");
  const [theme,   setTheme]   = useState("dark");
  const [secrets, setSecrets] = useState<SecretKey[]>([]);
  const [newName, setNewName] = useState("");
  const [newVal,  setNewVal]  = useState("");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    setTheme(localStorage.getItem("brain-theme") || "dark");
    if (canManageSecrets) {
      fetch(`${BASE}/settings/secrets`, { headers: withAuthHeaders() })
        .then(r => r.json()).then(setSecrets).catch(() => setSecrets([]));
    } else {
      setTab("general"); setSecrets([]);
    }
  }, [canManageSecrets]);

  const saveTheme = (t: string) => { setTheme(t); applyTheme(t); };

  const addSecret = async () => {
    if (!newName.trim() || !newVal.trim()) return;
    const res = await fetch(`${BASE}/settings/secrets`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name: newName.trim(), value: newVal.trim() }),
    }).then(r => r.json()).catch(() => null);
    if (res) { setSecrets(p => [res, ...p.filter(s => s.id !== res.id)]); setNewName(""); setNewVal(""); setShowNew(false); }
  };

  const deleteSecret = async (id: string) => {
    await fetch(`${BASE}/settings/secrets/${id}`, { method: "DELETE", headers: withAuthHeaders() });
    setSecrets(p => p.filter(s => s.id !== id));
  };

  return (
    <div className="modal-backdrop" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 16, width: "100%", maxWidth: 448, boxShadow: "0 25px 50px rgba(0,0,0,0.35)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Settings</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>

        {/* Tab switcher */}
        {tabOptions.length > 1 && (
          <div style={{ display: "flex", gap: 4, margin: "16px 24px 0", padding: 4, borderRadius: 10, background: "var(--surface3)" }}>
            {tabOptions.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ flex: 1, padding: "6px 0", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none", transition: "all 120ms ease",
                  background: tab === t ? "var(--surface2)" : "transparent",
                  color: tab === t ? "var(--text)" : "var(--text-muted)",
                  boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
                }}>
                {t === "secrets" ? "Secret keys" : "General"}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── General tab ── */}
          {tab === "general" && (
            <>
              {/* Theme */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>Theme</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {THEMES.map(({ id, Icon, label }) => {
                    const active = theme === id;
                    return (
                      <button key={id} onClick={() => saveTheme(id)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 8px", borderRadius: 12, cursor: "pointer", border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "var(--accent-dim)" : "var(--surface3)", transition: "all 120ms ease" }}>
                        <Icon size={16} style={{ color: active ? "var(--accent-light)" : "var(--text-dim)" }} />
                        <span style={{ fontSize: 11, fontWeight: 500, color: active ? "var(--text)" : "var(--text-muted)" }}>{label}</span>
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: 10, color: "var(--text-dim)", textAlign: "center", marginTop: 8 }}>Applies immediately ↑</p>
              </div>

              {/* System info */}
              <div style={{ borderRadius: 12, padding: 16, background: "var(--surface3)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
                {[["Version", "brAIn v3.0", false], ["Backend", "● Running", true], ["Database", "SQLite (local)", false]].map(([k, v, isGreen]) => (
                  <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{k}</span>
                    <span style={{ fontSize: 12, fontFamily: "monospace", color: isGreen ? "var(--green)" : "var(--text-muted)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Secrets tab ── */}
          {tab === "secrets" && (
            <>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                Store named secrets for your analysis. Values are write-only and not shown again after saving.
              </p>

              {/* Secrets list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                {secrets.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: "16px 0" }}>No secrets stored yet</p>
                )}
                {secrets.map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, background: "var(--surface3)", border: "1px solid var(--border)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, fontFamily: "monospace", color: "var(--text)" }}>{s.name}</p>
                      <p style={{ margin: 0, fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>Stored securely</p>
                    </div>
                    <button onClick={() => deleteSecret(s.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4, borderRadius: 5, display: "flex" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new secret */}
              {showNew ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 10, background: "var(--surface3)", border: "1px solid var(--border-accent)" }}>
                  <input style={S.inpBase} placeholder="Key name e.g. DB_PASSWORD" value={newName} onChange={e => setNewName(e.target.value)} />
                  <input style={S.inpBase} type="password" placeholder="Secret value" value={newVal}
                    onChange={e => setNewVal(e.target.value)} onKeyDown={e => e.key === "Enter" && addSecret()} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setShowNew(false); setNewName(""); setNewVal(""); }}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={addSecret} disabled={!newName || !newVal}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: !newName || !newVal ? 0.4 : 1 }}>
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowNew(true)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 0", borderRadius: 9, border: "1px dashed var(--border2)", background: "transparent", color: "var(--text-dim)", fontSize: 12, cursor: "pointer", width: "100%" }}>
                  <Plus size={13} /> Add secret key
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
