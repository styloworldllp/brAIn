"use client";
import { useState, useEffect } from "react";
import { AISpinner } from "./AISpinner";
import { X, Shield, ShieldAlert, Eye, EyeOff, Check } from "lucide-react";
import { Dataset } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

interface PIIInfo {
  is_pii: boolean;
  category: string | null;
  severity: "high" | "medium" | "low" | null;
}

interface Props {
  dataset: Dataset;
  onClose: () => void;
  onSaved: () => void;
}

const SEV_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#60a5fa" };
const SEV_BG    = { high: "rgba(239,68,68,0.1)", medium: "rgba(245,158,11,0.1)", low: "rgba(96,165,250,0.1)" };

export default function PIIManagerModal({ dataset, onClose, onSaved }: Props) {
  const [piiResults, setPiiResults] = useState<Record<string, PIIInfo>>({});
  const [excluded, setExcluded]     = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);

  // Get all column names from schema
  const allColumns = Object.keys(dataset.schema_info || {}).filter(k => !k.startsWith("__"));

  // For DB live connections, collect columns from all selected tables
  const isLive    = (dataset.schema_info as Record<string, unknown>)?.__live__;
  const tables    = (dataset.schema_info as Record<string, unknown>)?.__tables__ as string[] | undefined;
  const existingExcluded = (dataset.schema_info as Record<string, unknown>)?.__excluded__ as Record<string, string[]> | undefined;

  useEffect(() => {
    const colsToCheck = isLive
      ? tables?.flatMap(t => Object.keys((dataset.schema_info as Record<string, Record<string, unknown>>)[t] || {})) || []
      : allColumns;

    // Set existing exclusions
    if (existingExcluded) {
      const excl = new Set<string>();
      Object.values(existingExcluded).forEach(cols => cols.forEach(c => excl.add(c)));
      setExcluded(excl);
    }

    if (!colsToCheck.length) { setLoading(false); return; }

    fetch(`${BASE}/db/detect-pii`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ columns: Array.from(new Set(colsToCheck)) }),
    }).then(r => r.json()).then(res => {
      setPiiResults(res.pii_results || {});
      // Auto-exclude high severity if no existing config
      if (!existingExcluded) {
        const autoExcl = new Set<string>();
        (Object.entries(res.pii_results || {}) as [string, PIIInfo][]).forEach(([col, info]) => {
          if (info.severity === "high") autoExcl.add(col);
        });
        setExcluded(autoExcl);
      }
    }).catch(e => console.error("Failed to load PII results:", e)).finally(() => setLoading(false));
  }, [dataset.id]);

  const toggle = (col: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const excludedList = Array.from(excluded);
    await fetch(`${BASE}/datasets/${dataset.id}/pii-config`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ excluded_columns: excludedList }),
    }).catch(e => console.error("Failed to save PII config:", e));
    setSaving(false);
    onSaved();
    onClose();
  };

  const piiCols    = Object.entries(piiResults).filter(([, v]) => v.is_pii);
  const normalCols = Object.entries(piiResults).filter(([, v]) => !v.is_pii);

  return (
    <div className="modal-backdrop" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 16, width: "100%", maxWidth: 512, display: "flex", flexDirection: "column", maxHeight: "85vh", boxShadow: "0 25px 50px rgba(0,0,0,0.35)" }}>

        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <Shield size={16} style={{ color: "#f59e0b" }} />
          <div className="flex-1">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Manage PII columns</h2>
            <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>{dataset.name} · Toggle columns to include or exclude from AI analysis</p>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-dim)" }} className="hover:opacity-70"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <AISpinner size={24} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>brAIn is scanning for PII…</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              {piiCols.length > 0 ? (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
                  style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <ShieldAlert size={15} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p className="text-xs font-semibold" style={{ color: "#f59e0b" }}>{piiCols.length} PII columns detected</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Click any column to toggle it. Excluded columns are never sent to the AI.
                      {excluded.size > 0 && ` Currently excluding ${excluded.size} column${excluded.size > 1 ? "s" : ""}.`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
                  style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <p className="text-xs" style={{ color: "#22c55e" }}>✓ No PII columns detected</p>
                </div>
              )}

              {/* PII columns */}
              {piiCols.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                    PII Columns — click to toggle
                  </p>
                  {piiCols.map(([col, info]) => {
                    const sev    = info.severity!;
                    const isExcl = excluded.has(col);
                    return (
                      <div key={col} onClick={() => toggle(col)}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer select-none transition-all"
                        style={{
                          background: isExcl ? "var(--bg)" : SEV_BG[sev],
                          opacity: isExcl ? 0.55 : 1,
                          border: "1px solid transparent",
                        }}>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SEV_COLOR[sev] }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{col}</span>
                          <span className="ml-2 text-[10px]" style={{ color: SEV_COLOR[sev] }}>{info.category}</span>
                        </div>
                        <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: SEV_BG[sev], color: SEV_COLOR[sev] }}>{sev}</span>
                        {isExcl
                          ? <EyeOff size={13} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
                          : <Eye size={13} style={{ color: SEV_COLOR[sev], flexShrink: 0 }} />}
                        <span className="text-[10px] font-medium min-w-[60px] text-right"
                          style={{ color: isExcl ? "var(--text-dim)" : "#22c55e" }}>
                          {isExcl ? "Excluded" : "Included"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Normal columns */}
              {normalCols.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
                    Non-PII Columns ({normalCols.length} — all included in analysis)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {normalCols.map(([col]) => (
                      <span key={col} className="text-[10px] px-2 py-1 rounded-lg font-mono"
                        style={{ background: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {excluded.size > 0
              ? `${excluded.size} column${excluded.size > 1 ? "s" : ""} excluded from AI`
              : "All columns included in AI analysis"}
          </p>
          <button onClick={handleSave} disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
            style={{ background: "linear-gradient(135deg,var(--accent),var(--accent2))" }}>
            {saving ? <AISpinner size={13} /> : <Check size={13} />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
