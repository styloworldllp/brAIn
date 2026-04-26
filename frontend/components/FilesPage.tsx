"use client";
import { useState, useEffect, useCallback } from "react";
import { Upload, FileText, Table2, Trash2, ArrowRight, X, Shield, Eye, EyeOff, Check, Search, FolderOpen } from "lucide-react";
import { AISpinner } from "./AISpinner";
import { useDropzone } from "react-dropzone";
import { Dataset, fetchDatasets, deleteDataset, uploadFile } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";
import { useIsMobile } from "@/hooks/useIsMobile";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

interface PIIInfo { is_pii: boolean; category: string | null; severity: "high" | "medium" | "low" | null; }
const SEV_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#60a5fa" };
const SEV_BG    = { high: "rgba(239,68,68,0.10)", medium: "rgba(245,158,11,0.10)", low: "rgba(96,165,250,0.10)" };

interface Props { onOpenFile: (dataset: Dataset) => void; }
type Panel = "closed" | "upload" | "pii";

export default function FilesPage({ onOpenFile }: Props) {
  const isMobile = useIsMobile();
  const [files, setFiles]       = useState<Dataset[]>([]);
  const [loading, setLoading]   = useState(true);
  const [panel, setPanel]       = useState<Panel>("closed");
  const [search, setSearch]     = useState("");
  const [uploading, setUploading]   = useState(false);
  const [error, setError]           = useState("");
  const [uploadedDataset, setUploadedDataset] = useState<Dataset | null>(null);
  const [piiResults, setPiiResults] = useState<Record<string, PIIInfo>>({});
  const [excluded, setExcluded]     = useState<Set<string>>(new Set());
  const [piiLoading, setPiiLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchDatasets();
      setFiles(all.filter(d => ["csv", "excel", "xlsx", "xls"].includes(d.source_type)));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onDrop = useCallback(async (dropped: File[]) => {
    if (!dropped.length) return;
    setUploading(true); setError("");
    try {
      const ds = await uploadFile(dropped[0]);
      setUploadedDataset(ds);
      setPiiLoading(true);
      const columns = Object.keys(ds.schema_info || {}).filter(k => !k.startsWith("__"));
      const res = await fetch(`${BASE}/db/detect-pii`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ columns }),
      }).then(r => r.json()).catch(() => ({ pii_results: {} }));
      const results: Record<string, PIIInfo> = res.pii_results || {};
      setPiiResults(results);
      const auto = new Set<string>();
      Object.entries(results).forEach(([col, info]) => { if (info.severity === "high") auto.add(col); });
      setExcluded(auto);
      setPiiLoading(false);
      setPanel("pii");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally { setUploading(false); }
  }, []);

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"] },
    maxFiles: 1, disabled: uploading,
  });

  const toggleCol = (col: string) => setExcluded(prev => { const n = new Set(prev); n.has(col) ? n.delete(col) : n.add(col); return n; });

  const handleSavePII = async () => {
    if (!uploadedDataset) return;
    await fetch(`${BASE}/datasets/${uploadedDataset.id}/pii-config`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ excluded_columns: Array.from(excluded) }),
    }).catch(console.error);
    setFiles(prev => [uploadedDataset, ...prev.filter(f => f.id !== uploadedDataset.id)]);
    closePanel();
    onOpenFile(uploadedDataset);
  };

  const closePanel = () => { setPanel("closed"); setError(""); setUploadedDataset(null); setPiiResults({}); setExcluded(new Set()); };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this file and all its conversations?")) return;
    await deleteDataset(id);
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const filtered = search ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : files;
  const piiCols    = Object.entries(piiResults).filter(([, v]) => v.is_pii);
  const normalCols = Object.entries(piiResults).filter(([, v]) => !v.is_pii);

  return (
    <div style={{ flex: 1, display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)" }}>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: isMobile ? "14px 16px 12px" : "20px 28px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface2)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px var(--accent-glow)" }}>
                <FileText size={17} style={{ color: "#fff" }} />
              </div>
              <div>
                <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.3px" }}>Files</h1>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{files.length} file{files.length !== 1 ? "s" : ""} · CSV & Excel</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end" }}>
              {!isMobile && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", minWidth: 140, flex: 1, maxWidth: 220 }}>
                  <Search size={12} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files…"
                    style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: "var(--text)" }} />
                </div>
              )}
              <button onClick={() => setPanel("upload")}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10, background: "linear-gradient(135deg,var(--accent),var(--accent2))", color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", boxShadow: "0 2px 10px var(--accent-glow)", whiteSpace: "nowrap" }}>
                <Upload size={14} /> {isMobile ? "Upload" : "Upload File"}
              </button>
            </div>
          </div>
          {isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", marginTop: 10 }}>
              <Search size={12} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files…"
                style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: "var(--text)" }} />
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}><AISpinner size={24} /></div>
          ) : filtered.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 16, textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FolderOpen size={30} style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: "0 0 6px" }}>No files yet</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Upload a CSV or Excel file to start analysing your data</p>
              </div>
              <button onClick={() => setPanel("upload")}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: 10, background: "linear-gradient(135deg,var(--accent),var(--accent2))", color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", marginTop: 4, boxShadow: "0 2px 12px var(--accent-glow)" }}>
                <Upload size={14} /> Upload your first file
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)", minWidth: isMobile ? 480 : undefined }}>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 120px 100px", padding: "10px 20px", background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                  {["File Name", "Type", "Rows", "Uploaded", ""].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</span>
                  ))}
                </div>
                {filtered.map((ds, idx) => (
                  <FileRow key={ds.id} ds={ds} isLast={idx === filtered.length - 1}
                    onOpen={() => onOpenFile(ds)} onDelete={e => handleDelete(e, ds.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Slide-in panel ── */}
      {panel !== "closed" && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={closePanel} />
          <div style={{ position: isMobile ? "fixed" : "relative", top: isMobile ? 0 : undefined, right: isMobile ? 0 : undefined, bottom: isMobile ? 0 : undefined, left: isMobile ? 0 : undefined, zIndex: isMobile ? 200 : 11, width: isMobile ? "100%" : 420, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--surface2)", display: "flex", flexDirection: "column", height: isMobile ? undefined : "100%", animation: "slideInRight 200ms var(--ease-out) both" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {panel === "pii" && <Shield size={14} style={{ color: "#f59e0b" }} />}
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0 }}>
                  {panel === "upload" ? "Upload a File" : `PII Review — ${uploadedDataset?.name}`}
                </h2>
              </div>
              <button onClick={closePanel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4, display: "flex", borderRadius: 6 }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
              {panel === "upload" && (
                <>
                  <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? "var(--accent)" : "var(--border2)"}`, borderRadius: 14, padding: "52px 24px", textAlign: "center", cursor: "pointer", background: isDragActive ? "var(--accent-dim)" : "var(--bg)", transition: "all 180ms ease", opacity: uploading ? 0.6 : 1, pointerEvents: uploading ? "none" : "auto" }}>
                    <input {...getInputProps()} />
                    {uploading ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                        <AISpinner size={28} />
                        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Processing {acceptedFiles[0]?.name}…</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 60, height: 60, borderRadius: 16, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Upload size={24} style={{ color: "var(--accent)" }} />
                        </div>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: "0 0 6px" }}>
                            {isDragActive ? "Drop here" : "Drag & drop your file"}
                          </p>
                          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>or click to browse — CSV, XLSX, XLS</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {error && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)", color: "#f87171", fontSize: 12 }}>{error}</div>}
                  <p style={{ marginTop: 16, fontSize: 11, color: "var(--text-dim)" }}>Stored locally · Max 100,000 rows</p>
                </>
              )}

              {panel === "pii" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {piiLoading ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "32px 0" }}>
                      <AISpinner size={18} />
                      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Scanning for PII…</p>
                    </div>
                  ) : (
                    <>
                      {piiCols.length > 0 ? (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                          <Shield size={13} style={{ color: "#f59e0b", marginTop: 1, flexShrink: 0 }} />
                          <p style={{ fontSize: 12, color: "#f59e0b", margin: 0 }}>
                            <strong>{piiCols.length} PII columns detected.</strong> High-severity auto-excluded.
                          </p>
                        </div>
                      ) : (
                        <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.20)" }}>
                          <p style={{ fontSize: 12, color: "#22c55e", margin: 0 }}>✓ No PII detected — all columns are safe</p>
                        </div>
                      )}
                      {piiCols.map(([col, info]) => {
                        const sev = info.severity!;
                        const isExcl = excluded.has(col);
                        return (
                          <div key={col} onClick={() => toggleCol(col)}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", background: isExcl ? "var(--bg)" : SEV_BG[sev], opacity: isExcl ? 0.5 : 1, border: "1px solid transparent", transition: "all 120ms ease" }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_COLOR[sev], flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{col}</span>
                              <span style={{ marginLeft: 8, fontSize: 10, color: SEV_COLOR[sev] }}>{info.category}</span>
                            </div>
                            <span style={{ fontSize: 9, textTransform: "uppercase", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: SEV_BG[sev], color: SEV_COLOR[sev] }}>{sev}</span>
                            {isExcl ? <EyeOff size={12} style={{ color: "var(--text-dim)" }} /> : <Eye size={12} style={{ color: "#22c55e" }} />}
                          </div>
                        );
                      })}
                      {normalCols.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)", marginBottom: 8 }}>
                            Safe columns ({normalCols.length})
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {normalCols.slice(0, 24).map(([col]) => (
                              <span key={col} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontFamily: "monospace", background: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>{col}</span>
                            ))}
                            {normalCols.length > 24 && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>+{normalCols.length - 24} more</span>}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {panel === "pii" && (
              <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                  {excluded.size > 0 ? `${excluded.size} column${excluded.size > 1 ? "s" : ""} excluded` : "All columns included"}
                </p>
                <button onClick={handleSavePII}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 8, background: "linear-gradient(135deg,var(--accent),var(--accent2))", color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>
                  <Check size={14} /> Analyse →
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`@keyframes slideInRight { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}

function FileRow({ ds, isLast, onOpen, onDelete }: { ds: Dataset; isLast: boolean; onOpen: () => void; onDelete: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = useState(false);
  const ext = ds.source_type.toUpperCase();
  return (
    <div onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 120px 100px", padding: "13px 20px", alignItems: "center", cursor: "pointer", background: hover ? "var(--accent-dim)" : "transparent", borderBottom: isLast ? "none" : "1px solid var(--border)", transition: "background 100ms ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Table2 size={13} style={{ color: "var(--accent)" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.name}</span>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: "var(--surface2)", color: "var(--accent-light)", display: "inline-block", border: "1px solid var(--border)", letterSpacing: "0.04em" }}>{ext}</span>
      <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>{ds.row_count?.toLocaleString() ?? "—"}</span>
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{new Date(ds.created_at).toLocaleDateString()}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 5, opacity: hover ? 1 : 0, transition: "opacity 100ms ease" }}>
        <button onClick={e => { e.stopPropagation(); onOpen(); }}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", color: "var(--accent-light)", cursor: "pointer" }}>
          Open <ArrowRight size={10} />
        </button>
        <button onClick={onDelete}
          style={{ padding: 5, borderRadius: 5, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
