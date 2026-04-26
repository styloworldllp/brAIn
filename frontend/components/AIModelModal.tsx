"use client";
import { useState, useEffect } from "react";
import { AISpinner } from "./AISpinner";
import { X, CheckCircle2, Eye, EyeOff, Zap } from "lucide-react";
import { withAuthHeaders } from "@/lib/auth";
import { fetchNeurixStatus, NeurixStatus } from "@/lib/api";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";
interface Props { onClose: () => void; }
const inpStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", transition: "border-color 140ms ease" };

export default function AIModelModal({ onClose }: Props) {
  const [provider,     setProvider]     = useState("anthropic");
  const [aModel,       setAModel]       = useState("claude-sonnet-4-6");
  const [oModel,       setOModel]       = useState("gpt-4o");
  const [aKey,         setAKey]         = useState("");
  const [oKey,         setOKey]         = useState("");
  const [showAKey,     setShowAKey]     = useState(false);
  const [showOKey,     setShowOKey]     = useState(false);
  const [hasAKey,      setHasAKey]      = useState(false);
  const [hasOKey,      setHasOKey]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [neurix,       setNeurix]       = useState<NeurixStatus | null>(null);

  useEffect(() => {
    fetch(`${BASE}/settings/`, { headers: withAuthHeaders() })
      .then(r => r.json()).then(s => {
        setProvider(s.provider || "anthropic");
        setAModel(s.anthropic_model || "claude-sonnet-4-6");
        setOModel(s.openai_model   || "gpt-4o");
        setHasAKey(!!s.has_anthropic_key);
        setHasOKey(!!s.has_openai_key);
      }).catch(() => {});
    fetchNeurixStatus().then(setNeurix).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const body: Record<string, string> = { provider, anthropic_model: aModel, openai_model: oModel };
    if (aKey) body.anthropic_api_key = aKey;
    if (oKey) body.openai_api_key    = oKey;
    await fetch(`${BASE}/settings/`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 900);
  };

  const providers: Array<{
    id: string; name: string; tagline: string; accent: string; badge: string;
    logo: React.ReactNode; disabled?: boolean; disabledMsg?: string;
  }> = [
    {
      id: "anthropic", name: "Anthropic", tagline: "Best for analysis — brAIn default",
      accent: "var(--accent)", badge: "Default",
      logo: (
        <svg viewBox="0 0 28 28" width={28} height={28}>
          <rect width="28" height="28" rx="7" fill="var(--accent2)" />
          <text x="14" y="20" fontFamily="serif" fontSize="14" fontWeight="bold" fill="white" textAnchor="middle">A</text>
        </svg>
      ),
    },
    {
      id: "openai", name: "OpenAI", tagline: "Widely used · GPT-4o",
      accent: "#10a37f", badge: "GPT-4",
      logo: (
        <svg viewBox="0 0 28 28" width={28} height={28}>
          <rect width="28" height="28" rx="7" fill="#10a37f" />
          <text x="14" y="20" fontFamily="Arial,sans-serif" fontSize="12" fontWeight="bold" fill="white" textAnchor="middle">AI</text>
        </svg>
      ),
    },
    {
      id: "neurix", name: "Neurix", tagline: neurix?.has_instance
        ? `Local LLM · ${neurix.neuron_balance.toLocaleString()} neurons`
        : "Local LLM · No instance provisioned",
      accent: "#f59e0b", badge: "Neurons",
      disabled: !neurix?.has_instance,
      disabledMsg: "No Neurix instance has been provisioned for your organisation. Contact your administrator.",
      logo: (
        <svg viewBox="0 0 28 28" width={28} height={28}>
          <rect width="28" height="28" rx="7" fill="#92400e" />
          <text x="14" y="20" fontFamily="monospace" fontSize="11" fontWeight="bold" fill="#fbbf24" textAnchor="middle">Nₓ</text>
        </svg>
      ),
    },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 16, width: "100%", maxWidth: 448, boxShadow: "0 25px 50px rgba(0,0,0,0.35)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>AI Engine</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)" }}><X size={16} /></button>
        </div>

        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Provider selector */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>Select Engine</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {providers.map(p => {
                const active = provider === p.id;
                return (
                  <button key={p.id}
                    onClick={() => !p.disabled && setProvider(p.id)}
                    title={p.disabled ? p.disabledMsg : undefined}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                      padding: "12px 8px", borderRadius: 12, cursor: p.disabled ? "not-allowed" : "pointer",
                      border: `2px solid ${active ? p.accent : "var(--border)"}`,
                      background: active ? `${p.accent}18` : "var(--surface3)",
                      opacity: p.disabled ? 0.45 : 1,
                      transition: "all 140ms ease",
                    }}
                    onMouseEnter={e => { if (!p.disabled && !active) e.currentTarget.style.borderColor = `${p.accent}60`; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = "var(--border)"; }}>
                    {p.logo}
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{p.name}</span>
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: active ? `${p.accent}30` : "var(--accent-dim)", color: active ? p.accent : "var(--text-dim)", fontWeight: 600 }}>
                      {p.badge}
                    </span>
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 10, color: "var(--text-dim)", textAlign: "center", marginTop: 6 }}>
              {providers.find(p => p.id === provider)?.tagline}
            </p>
          </div>

          {/* ── Anthropic config ── */}
          {provider === "anthropic" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
                  API Key {hasAKey && <span style={{ color: "#34d399", marginLeft: 4 }}>✓ saved</span>}
                </label>
                <div style={{ position: "relative" }}>
                  <input type={showAKey ? "text" : "password"} style={{ ...inpStyle, paddingRight: 38 }}
                    placeholder={hasAKey ? "Leave blank to keep existing" : "sk-ant-..."}
                    value={aKey} onChange={e => setAKey(e.target.value)}
                    onFocus={e => e.target.style.borderColor = "var(--accent)"}
                    onBlur={e => e.target.style.borderColor = "var(--border)"} />
                  <button onClick={() => setShowAKey(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)" }}>
                    {showAKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <p style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>Get at <a href="https://console.anthropic.com" target="_blank" style={{ color: "var(--accent-light)" }}>console.anthropic.com</a></p>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>Model</label>
                <select style={inpStyle} value={aModel} onChange={e => setAModel(e.target.value)}
                  onFocus={e => e.target.style.borderColor = "var(--accent)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4 — Fast & smart (recommended)</option>
                  <option value="claude-opus-4-6">Claude Opus 4 — Most capable</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku — Fastest</option>
                </select>
              </div>
            </div>
          )}

          {/* ── OpenAI config ── */}
          {provider === "openai" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
                  API Key {hasOKey && <span style={{ color: "#34d399", marginLeft: 4 }}>✓ saved</span>}
                </label>
                <div style={{ position: "relative" }}>
                  <input type={showOKey ? "text" : "password"} style={{ ...inpStyle, paddingRight: 38 }}
                    placeholder={hasOKey ? "Leave blank to keep existing" : "sk-..."}
                    value={oKey} onChange={e => setOKey(e.target.value)}
                    onFocus={e => e.target.style.borderColor = "#10a37f"}
                    onBlur={e => e.target.style.borderColor = "var(--border)"} />
                  <button onClick={() => setShowOKey(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)" }}>
                    {showOKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <p style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>Get at <a href="https://platform.openai.com/api-keys" target="_blank" style={{ color: "#34d399" }}>platform.openai.com</a></p>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>Model</label>
                <select style={inpStyle} value={oModel} onChange={e => setOModel(e.target.value)}
                  onFocus={e => e.target.style.borderColor = "#10a37f"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}>
                  <option value="gpt-4o">GPT-4o — Most capable</option>
                  <option value="gpt-4o-mini">GPT-4o Mini — Faster & cheaper</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                </select>
              </div>
            </div>
          )}

          {/* ── Neurix config ── */}
          {provider === "neurix" && neurix?.has_instance && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Neuron balance card */}
              <div style={{ borderRadius: 12, padding: "12px 16px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Zap size={18} style={{ color: "#f59e0b" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f59e0b", lineHeight: 1.1 }}>
                    {(neurix.neuron_balance || 0).toLocaleString()}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
                    Neurons available · {neurix.cost_per_query} per query
                  </p>
                </div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", textAlign: "right" }}>
                  <p style={{ margin: 0 }}>{neurix.model_name}</p>
                  <p style={{ margin: 0, fontFamily: "monospace", opacity: 0.6, fontSize: 9 }}>local LLM</p>
                </div>
              </div>

              <div style={{ borderRadius: 10, padding: "10px 14px", background: "var(--surface3)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                <strong style={{ color: "var(--text)" }}>Neurix</strong> runs on your organisation's dedicated local LLM instance.
                No data leaves your infrastructure. Neurons are deducted per analysis query.
              </div>
            </div>
          )}

          <button onClick={handleSave} disabled={saving || saved || (provider === "neurix" && !neurix?.has_instance)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600,
              cursor: saving || saved ? "default" : "pointer",
              background: saved ? "var(--accent-dim)" : "linear-gradient(135deg,var(--accent),var(--accent2))",
              color: saved ? "var(--accent-light)" : "#fff",
              border: saved ? "1px solid var(--border-accent)" : "none",
              opacity: (saving || (provider === "neurix" && !neurix?.has_instance)) ? 0.5 : 1,
              transition: "all 150ms ease",
            }}>
            {saving ? <AISpinner size={14} /> : saved ? <CheckCircle2 size={14} /> : null}
            {saving ? "Saving…" : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
