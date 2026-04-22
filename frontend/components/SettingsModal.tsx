"use client";
import { useState, useEffect } from "react";
import { X, Plus, Trash2, Moon, Sun, Monitor } from "lucide-react";
import { getStoredUser, isAdmin, withAuthHeaders } from "@/lib/auth";

const BASE = "http://localhost:8000/api";
interface SecretKey { id: string; name: string; created_at?: string; has_value?: boolean; }
interface Props { onClose: () => void; }
const inp = "w-full rounded-lg px-3 py-2 text-sm placeholder-[#9999b0] focus:outline-none focus:ring-1 focus:ring-[#00c896]/60 transition-colors";

function applyTheme(t: string) {
  const h = document.documentElement;
  h.classList.remove("dark", "light");
  if (t === "light") h.classList.add("light");
  else if (t === "system") {
    h.classList.add(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } else {
    h.classList.add("dark");
  }
  localStorage.setItem("brain-theme", t);
}

export default function SettingsModal({ onClose }: Props) {
  const canManageSecrets = isAdmin(getStoredUser());
  const tabOptions: Array<"general" | "secrets"> = canManageSecrets ? ["general", "secrets"] : ["general"];
  const [tab, setTab]       = useState<"general" | "secrets">("general");
  const [theme, setTheme]   = useState("dark");
  const [secrets, setSecrets] = useState<SecretKey[]>([]);
  const [newName, setNewName] = useState("");
  const [newVal, setNewVal]   = useState("");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    setTheme(localStorage.getItem("brain-theme") || "dark");
    if (canManageSecrets) {
      fetch(`${BASE}/settings/secrets`, { headers: withAuthHeaders() }).then(r => r.json()).then(setSecrets).catch(() => setSecrets([]));
    } else {
      setTab("general");
      setSecrets([]);
    }
  }, [canManageSecrets]);

  const saveTheme = (t: string) => { setTheme(t); applyTheme(t); };

  const addSecret = async () => {
    if (!newName.trim() || !newVal.trim()) return;
    const res = await fetch(`${BASE}/settings/secrets`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name: newName.trim(), value: newVal.trim() }),
    }).then(r => r.json()).catch(() => null);
    if (res) {
      setSecrets(prev => [res, ...prev.filter(s => s.id !== res.id)]);
      setNewName("");
      setNewVal("");
      setShowNew(false);
    }
  };

  const deleteSecret = async (id: string) => {
    await fetch(`${BASE}/settings/secrets/${id}`, { method: "DELETE", headers: withAuthHeaders() });
    setSecrets(prev => prev.filter(s => s.id !== id));
  };

  const inpStyle = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel rounded-2xl w-full max-w-md shadow-2xl"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>

        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Settings</h2>
          <button onClick={onClose} style={{ color: "var(--text-dim)" }} className="hover:opacity-70"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mx-6 mt-4 rounded-lg p-1" style={{ background: "var(--bg)" }}>
          {tabOptions.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-1.5 rounded-md text-xs font-medium transition-colors capitalize"
              style={tab === t
                ? { background: "var(--surface)", color: "var(--text)" }
                : { color: "var(--text-muted)" }}>
              {t === "secrets" ? "Secret keys" : "General"}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {tab === "general" && (
            <>
              <div>
                <label className="block text-xs font-medium mb-3" style={{ color: "var(--text-muted)" }}>Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {([["dark", Moon, "Dark"], ["light", Sun, "Light"], ["system", Monitor, "System"]] as const).map(([id, Icon, label]) => (
                    <button key={id} onClick={() => saveTheme(id)}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all"
                      style={{
                        border: theme === id ? "2px solid #00c896" : "2px solid var(--border)",
                        background: theme === id ? "rgba(0,200,150,0.1)" : "var(--bg)",
                      }}>
                      <Icon size={18} style={{ color: theme === id ? "#33d9ab" : "var(--text-dim)" }} />
                      <span className="text-xs" style={{ color: "var(--text)" }}>{label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] mt-2 text-center" style={{ color: "var(--text-dim)" }}>
                  Theme applies immediately ↑
                </p>
              </div>
              <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                {[["Version", "brAIn v3.0"], ["Backend", "● Running"], ["Database", "SQLite (local)"]].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span style={{ color: "var(--text-dim)" }}>{k}</span>
                    <span className="font-mono" style={{ color: v.includes("●") ? "#22c55e" : "var(--text-muted)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "secrets" && (
            <>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Store named secrets to reference in your analysis. Secret values are write-only and are not shown again after saving.
              </p>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {secrets.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: "var(--text-dim)" }}>No secrets stored yet</p>
                )}
                {secrets.map(s => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium font-mono" style={{ color: "var(--text)" }}>{s.name}</p>
                      <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-dim)" }}>
                        Stored securely
                      </p>
                    </div>
                    <button onClick={() => deleteSecret(s.id)} className="p-1 hover:text-red-400" style={{ color: "var(--text-dim)" }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
              {showNew ? (
                <div className="space-y-2 rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid #00c89666" }}>
                  <input className={inp} style={inpStyle} placeholder="Key name e.g. DB_PASSWORD" value={newName} onChange={e => setNewName(e.target.value)} />
                  <input className={inp} style={inpStyle} type="password" placeholder="Secret value" value={newVal}
                    onChange={e => setNewVal(e.target.value)} onKeyDown={e => e.key === "Enter" && addSecret()} />
                  <div className="flex gap-2">
                    <button onClick={() => { setShowNew(false); setNewName(""); setNewVal(""); }}
                      className="flex-1 py-1.5 rounded-lg text-xs" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>Cancel</button>
                    <button onClick={addSecret} disabled={!newName || !newVal}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                      style={{ background: "#00c896" }}>Save secret</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowNew(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs transition-colors"
                  style={{ border: "1px dashed var(--border)", color: "var(--text-dim)" }}>
                  <Plus size={12} /> Add secret key
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
