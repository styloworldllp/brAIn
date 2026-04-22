"use client";
import { useState, useCallback } from "react";
import { AISpinner } from "./AISpinner";
import { useDropzone } from "react-dropzone";
import { Upload, X, Shield, Eye, EyeOff, Check } from "lucide-react";
import { uploadFile, Dataset } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";

const BASE = "http://localhost:8000/api";
interface Props { onClose: () => void; onSuccess: (dataset: Dataset) => void; }

type Screen = "upload" | "pii";

interface PIIInfo { is_pii: boolean; category: string | null; severity: "high"|"medium"|"low"|null; }
const SEV_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#60a5fa" };
const SEV_BG    = { high: "rgba(239,68,68,0.1)", medium: "rgba(245,158,11,0.1)", low: "rgba(96,165,250,0.1)" };

export default function UploadModal({ onClose, onSuccess }: Props) {
  // ── ALL hooks unconditionally at the top ──
  const [screen, setScreen]               = useState<Screen>("upload");
  const [uploading, setUploading]         = useState(false);
  const [error, setError]                 = useState("");
  const [uploadedDataset, setUploadedDataset] = useState<Dataset | null>(null);
  const [piiResults, setPiiResults]       = useState<Record<string, PIIInfo>>({});
  const [excluded, setExcluded]           = useState<Set<string>>(new Set());
  const [piiLoading, setPiiLoading]       = useState(false);

  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploading(true); setError("");
    try {
      const dataset = await uploadFile(files[0]);
      setUploadedDataset(dataset);
      // Detect PII
      setPiiLoading(true);
      const columns = Object.keys(dataset.schema_info || {}).filter(k => !k.startsWith("__"));
      const res = await fetch(`${BASE}/db/detect-pii`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ columns }),
      }).then(r => r.json()).catch(() => ({ pii_results: {} }));
      const results: Record<string, PIIInfo> = res.pii_results || {};
      setPiiResults(results);
      // Auto-exclude high severity
      const autoExcl = new Set<string>();
      Object.entries(results).forEach(([col, info]) => {
        if (info.severity === "high") autoExcl.add(col);
      });
      setExcluded(autoExcl);
      setPiiLoading(false);
      setScreen("pii");
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : (e instanceof Error ? e.message : "Upload failed."));
    } finally { setUploading(false); }
  }, []);

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  const toggleCol = (col: string) => {
    setExcluded(prev => { const n = new Set(prev); n.has(col) ? n.delete(col) : n.add(col); return n; });
  };

  const handleSave = async () => {
    if (!uploadedDataset) return;
    await fetch(`${BASE}/datasets/${uploadedDataset.id}/pii-config`, {
      method: "POST",
      headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ excluded_columns: Array.from(excluded) }),
    }).catch(() => {});
    onSuccess(uploadedDataset);
    onClose();
  };

  const piiCols    = Object.entries(piiResults).filter(([, v]) => v.is_pii);
  const normalCols = Object.entries(piiResults).filter(([, v]) => !v.is_pii);

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel rounded-2xl w-full max-w-md shadow-2xl"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>

        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            {screen === "pii" && (
              <Shield size={15} style={{ color: "#f59e0b" }} />
            )}
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              {screen === "upload" ? "Upload CSV or Excel" : `PII Review — ${uploadedDataset?.name}`}
            </h2>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-dim)" }} className="hover:opacity-70"><X size={16} /></button>
        </div>

        {/* ── Upload screen ── */}
        {screen === "upload" && (
          <div className="p-6">
            <div {...getRootProps()}
              className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors"
              style={{
                borderColor: isDragActive ? "#00c896" : "var(--border2)",
                background: isDragActive ? "rgba(0,200,150,0.05)" : "transparent",
                opacity: uploading ? 0.5 : 1,
                pointerEvents: uploading ? "none" : "auto",
              }}>
              <input {...getInputProps()} />
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <AISpinner size={28} />
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>Processing {acceptedFiles[0]?.name}…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,200,150,0.1)" }}>
                    <Upload size={22} style={{ color: "#00c896" }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {isDragActive ? "Drop the file here" : "Drag & drop your file"}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>or click to browse — CSV, XLSX, XLS</p>
                  </div>
                </div>
              )}
            </div>
            {error && (
              <div className="mt-3 px-3 py-2 rounded-lg text-xs"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                {error}
              </div>
            )}
            <p className="mt-4 text-xs" style={{ color: "var(--text-dim)" }}>Stored locally · Max 100,000 rows</p>
          </div>
        )}

        {/* ── PII review screen ── */}
        {screen === "pii" && (
          <div>
            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {piiLoading ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <AISpinner size={18} />
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>Scanning for PII…</p>
                </div>
              ) : (
                <>
                  {piiCols.length > 0 ? (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
                      style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                      <Shield size={14} style={{ color: "#f59e0b", marginTop: 1 }} />
                      <p className="text-xs" style={{ color: "#f59e0b" }}>
                        <strong>{piiCols.length} PII columns detected.</strong> High-severity auto-excluded. Click to toggle.
                      </p>
                    </div>
                  ) : (
                    <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                      <p className="text-xs" style={{ color: "#22c55e" }}>✓ No PII columns detected</p>
                    </div>
                  )}

                  {piiCols.map(([col, info]) => {
                    const sev = info.severity!;
                    const isExcl = excluded.has(col);
                    return (
                      <div key={col} onClick={() => toggleCol(col)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                        style={{ background: isExcl ? "var(--bg)" : SEV_BG[sev], opacity: isExcl ? 0.5 : 1, border: "1px solid transparent" }}>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SEV_COLOR[sev] }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{col}</span>
                          <span className="ml-2 text-[10px]" style={{ color: SEV_COLOR[sev] }}>{info.category}</span>
                        </div>
                        <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: SEV_BG[sev], color: SEV_COLOR[sev] }}>{sev}</span>
                        {isExcl ? <EyeOff size={13} style={{ color: "var(--text-dim)" }} /> : <Eye size={13} style={{ color: "#22c55e" }} />}
                        <span className="text-[10px] font-medium min-w-[54px] text-right"
                          style={{ color: isExcl ? "var(--text-dim)" : "#22c55e" }}>
                          {isExcl ? "Excluded" : "Included"}
                        </span>
                      </div>
                    );
                  })}

                  {normalCols.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
                        Non-PII columns — all included ({normalCols.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {normalCols.slice(0, 20).map(([col]) => (
                          <span key={col} className="text-[10px] px-2 py-1 rounded-lg font-mono"
                            style={{ background: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                            {col}
                          </span>
                        ))}
                        {normalCols.length > 20 && (
                          <span className="text-[10px] px-2 py-1 rounded-lg" style={{ color: "var(--text-dim)" }}>
                            +{normalCols.length - 20} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {excluded.size > 0 ? `${excluded.size} column${excluded.size > 1 ? "s" : ""} excluded` : "All columns included"}
              </p>
              <button onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#00c896,#059669)" }}>
                <Check size={14} /> Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
