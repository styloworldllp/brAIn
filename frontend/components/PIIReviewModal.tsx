"use client";
import { useState, useEffect } from "react";
import { X, Shield, ShieldAlert, Eye, EyeOff, Check } from "lucide-react";
import { AISpinner } from "./AISpinner";
import { Dataset } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";

const BASE = "http://localhost:8000/api";

interface PIIInfo {
  is_pii: boolean;
  category: string | null;
  severity: "high" | "medium" | "low" | null;
  confidence: string;
}

interface Props {
  dataset: Dataset;
  onClose: () => void;
  onSave: (excludedColumns: string[]) => void;
}

const SEV_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#60a5fa" };
const SEV_BG    = { high: "rgba(239,68,68,0.1)", medium: "rgba(245,158,11,0.1)", low: "rgba(96,165,250,0.1)" };

export default function PIIReviewModal({ dataset, onClose, onSave }: Props) {
  const [piiResults, setPiiResults] = useState<Record<string, PIIInfo>>({});
  const [excluded, setExcluded]     = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const columns = Object.keys(dataset.schema_info || {}).filter(k => !k.startsWith("__"));
    fetch(`${BASE}/db/detect-pii`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ columns }),
    }).then(r => r.json()).then(res => {
      setPiiResults(res.pii_results || {});
      // Auto-exclude high severity
      const autoExcl = new Set<string>();
      Object.entries(res.pii_results || {}).forEach(([col, info]: [string, any]) => {
        if (info.severity === "high") autoExcl.add(col);
      });
      setExcluded(autoExcl);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [dataset]);

  const toggle = (col: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  };

  const piiCols    = Object.entries(piiResults).filter(([, v]) => v.is_pii);
  const normalCols = Object.entries(piiResults).filter(([, v]) => !v.is_pii);
  const totalPii   = piiCols.length;

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>

        <div className="shrink-0 flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <Shield size={16} style={{ color: "#f59e0b" }} />
          <div className="flex-1">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>PII Review — {dataset.name}</h2>
            <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>
              {dataset.row_count?.toLocaleString()} rows · {Object.keys(piiResults).length} columns
            </p>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-dim)" }} className="hover:opacity-70"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <AISpinner size={24} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Scanning for PII columns…</p>
            </div>
          ) : (
            <>
              {totalPii > 0 ? (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <ShieldAlert size={15} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p className="text-xs font-semibold" style={{ color: "#f59e0b" }}>{totalPii} PII columns found</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      High-severity columns are excluded from AI analysis by default. Toggle to change.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <p className="text-xs" style={{ color: "#22c55e" }}>✓ No PII columns detected</p>
                </div>
              )}

              {/* PII columns */}
              {piiCols.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>PII Columns</p>
                  {piiCols.map(([col, info]) => {
                    const sev    = info.severity!;
                    const isExcl = excluded.has(col);
                    return (
                      <div key={col} onClick={() => toggle(col)}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-all"
                        style={{ background: isExcl ? "var(--bg)" : SEV_BG[sev], opacity: isExcl ? 0.5 : 1, border: "1px solid transparent" }}>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SEV_COLOR[sev] }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{col}</span>
                          <span className="ml-2 text-[10px]" style={{ color: SEV_COLOR[sev] }}>{info.category}</span>
                        </div>
                        <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: SEV_BG[sev], color: SEV_COLOR[sev] }}>{sev}</span>
                        <span className="text-xs font-medium" style={{ color: isExcl ? "var(--text-dim)" : "#22c55e" }}>
                          {isExcl ? "Excluded" : "Included"}
                        </span>
                        {isExcl ? <EyeOff size={13} style={{ color: "var(--text-dim)" }} /> : <Eye size={13} style={{ color: "#22c55e" }} />}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Normal columns */}
              {normalCols.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
                    Non-PII Columns ({normalCols.length} — all included)
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

        <div className="shrink-0 flex items-center justify-between px-6 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {excluded.size > 0 ? `${excluded.size} column${excluded.size > 1 ? "s" : ""} excluded from analysis` : "All columns included"}
          </p>
          <button onClick={() => onSave(Array.from(excluded))} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#00c896,#059669)" }}>
            <Check size={14} /> Save & continue
          </button>
        </div>
      </div>
    </div>
  );
}
