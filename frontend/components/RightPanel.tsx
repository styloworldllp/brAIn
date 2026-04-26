"use client";
import { useState, useEffect } from "react";
import { Database, FileText, Shield, EyeOff, ChevronDown, ChevronRight, AlertTriangle, ShieldAlert, RotateCcw } from "lucide-react";
import { AISpinner } from "./AISpinner";
import { Dataset } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";
interface Props { dataset: Dataset | null; }
interface PIIInfo { is_pii: boolean; category: string | null; severity: "high" | "medium" | "low" | null; }
const SEV_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#60a5fa" };
const SEV_BG    = { high: "rgba(239,68,68,0.1)", medium: "rgba(245,158,11,0.1)", low: "rgba(96,165,250,0.1)" };
const PII_CATS  = ["Name","Email","Phone","National ID","Address","Postal Code","Date of Birth","Financial","IP Address","Geolocation","Salary","Username","Password","Gender","Race/Ethnicity","Religion","Medical"];

// Color-code by dtype
function typeColor(dtype: string): string {
  const d = dtype.toLowerCase();
  if (d.includes("date") || d.includes("time") || d.includes("timestamp")) return "#60a5fa"; // blue
  if (d.includes("int") || d.includes("float") || d.includes("double") || d.includes("decimal") || d.includes("numeric") || d.includes("real")) return "var(--accent-light)"; // purple
  if (d.includes("bool")) return "var(--accent-light)"; // green
  return "#2dd4bf"; // teal for text/categorical
}
function typeDot(dtype?: string): string {
  if (!dtype) return "#9ba3c8";
  return typeColor(dtype);
}

interface MarkState { col: string | null; category: string; severity: "high"|"medium"|"low"; }

export default function RightPanel({ dataset }: Props) {
  const [tab, setTab]           = useState<"schema"|"pii"|"stats">("schema");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [piiData, setPiiData]   = useState<Record<string, PIIInfo>>({});
  const [loading, setLoading]   = useState(false);
  const [exclCols, setExclCols] = useState<string[]>([]);
  const [mark, setMark]         = useState<MarkState>({ col: null, category: "Email", severity: "medium" });
  const [stats, setStats]       = useState<Record<string, unknown>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!dataset) return;
    setPiiData({}); setExclCols([]); setMark({ col: null, category: "Email", severity: "medium" }); setStats({});
    const schema  = dataset.schema_info || {};
    const isLive  = !!(schema as Record<string,unknown>).__live__;
    const excl    = (schema as Record<string,unknown>).__excluded__ as Record<string,string[]> | undefined;
    const exclFlat = (schema as Record<string,unknown>).__excluded_flat__ as string[] | undefined || [];
    setExclCols(Array.from(new Set([...Object.values(excl || {}).flat(), ...exclFlat])));

    if (isLive) {
      const tables = (schema as Record<string,unknown>).__tables__ as string[] || [];
      const m: Record<string,PIIInfo> = {};
      tables.forEach(t => Object.entries((schema as Record<string,Record<string,unknown>>)[t] || {}).forEach(([col, info]) => {
        const pii = (info as Record<string,unknown>)?.pii as PIIInfo;
        if (pii) m[col] = pii;
      }));
      if (Object.keys(m).length) { setPiiData(m); return; }
    }

    const flat = Object.entries(schema).filter(([k]) => !k.startsWith("__"));
    const hasPii = flat.some(([, v]) => typeof v === "object" && v !== null && "pii" in (v as object));
    if (hasPii) {
      const m: Record<string,PIIInfo> = {};
      flat.forEach(([col, info]) => { const pii = (info as Record<string,unknown>)?.pii as PIIInfo; if (pii) m[col] = pii; });
      setPiiData(m);
    } else {
      const cols = flat.map(([k]) => k);
      if (!cols.length) return;
      setLoading(true);
      fetch(`${BASE}/db/detect-pii`, { method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ columns: cols }) })
        .then(r => r.json()).then(res => setPiiData(res.pii_results || {})).catch(e => console.error("Failed to detect PII:", e)).finally(() => setLoading(false));
      
    }

    // Build quick stats from schema
    const quickStats: Record<string, unknown> = {};
    flat.forEach(([col, info]) => {
      const i = info as Record<string,unknown>;
      quickStats[col] = {
        dtype:      i.dtype,
        null_count: i.null_count,
        samples:    (i.sample_values as unknown[])?.slice(0, 3) || [],
      };
    });
    setStats(quickStats);
  }, [dataset?.id, refreshKey]);

  const applyMark = async () => {
    if (!mark.col || !dataset) return;
    setPiiData(prev => ({ ...prev, [mark.col!]: { is_pii: true, category: mark.category, severity: mark.severity } }));
    await fetch(`${BASE}/datasets/${dataset.id}/pii-config`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ excluded_columns: exclCols, manual_pii: { [mark.col]: { category: mark.category, severity: mark.severity } } }),
    }).catch(e => console.error("Failed to save PII config:", e));
    setMark(prev => ({ ...prev, col: null }));
  };

  if (!dataset) return (
    <aside style={{ width: 260, flexShrink: 0, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--surface2)", borderLeft: "1px solid var(--border)" }}>
      <FileText size={24} style={{ color: "var(--text-dim)", opacity: 0.3 }} />
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10, textAlign: "center", padding: "0 20px" }}>Select a dataset to explore its schema</p>
    </aside>
  );

  const schema   = dataset.schema_info || {};
  const isLive   = !!(schema as Record<string,unknown>).__live__;
  const tables   = (schema as Record<string,unknown>).__tables__ as string[] | undefined;
  const excl     = (schema as Record<string,unknown>).__excluded__ as Record<string,string[]> || {};
  const exclSet  = new Set(exclCols);
  const piiCols  = Object.entries(piiData).filter(([, v]) => v.is_pii);
  const includedPii = piiCols.filter(([col]) => !exclSet.has(col));
  const excludedPii = piiCols.filter(([col]) => exclSet.has(col));
  const statsCols = Object.entries(stats);
  const totalCols = isLive && tables ? tables.reduce((s, t) => s + Object.keys((schema as Record<string,Record<string,unknown>>)[t] || {}).length, 0) : Object.keys(schema).filter(k => !k.startsWith("__")).length;

  return (
    <aside style={{ width: 260, flexShrink: 0, height: "100%", display: "flex", flexDirection: "column", background: "var(--surface2)", borderLeft: "1px solid var(--border)" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          {isLive ? <Database size={14} style={{ color: "var(--accent-light)" }} /> : <FileText size={14} style={{ color: "var(--accent-light)" }} />}
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dataset.name}</p>
          <button onClick={() => setRefreshKey(k => k + 1)} title="Refresh schema"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, flexShrink: 0, display: "flex", alignItems: "center" }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--accent-light)"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"}>
            <RotateCcw size={12} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {isLive ? `${tables?.length || 0} tables · live queries` : `${dataset.row_count?.toLocaleString()} rows · ${totalCols} cols`}
        </p>
        {piiCols.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
            <Shield size={10} style={{ color: "#f59e0b" }} />
            <span style={{ fontSize: 10, color: "#f59e0b" }}>{piiCols.length} PII{exclSet.size > 0 ? ` · ${exclSet.size} excl.` : ""}</span>
          </div>
        )}
      </div>

      {/* 3 Tabs */}
      <div style={{ display: "flex", padding: "6px 8px 0", gap: 2 }}>
        {(["schema","pii","stats"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: "5px 0", borderRadius: "6px 6px 0 0", fontSize: 11, fontWeight: tab === t ? 700 : 500, cursor: "pointer", border: "none", transition: "all 0.12s", textTransform: "capitalize",
              background: tab === t ? "var(--surface)" : "transparent",
              color: tab === t ? "var(--accent-light)" : "var(--text-dim)",
              borderBottom: tab === t ? `2px solid var(--accent)` : "2px solid transparent",
            }}>
            {t === "pii" ? `PII${piiCols.length ? ` (${piiCols.length})` : ""}` : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px 12px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 24 }}>
            <AISpinner size={14} />
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>brAIn scanning…</span>
          </div>
        ) : tab === "schema" ? (
          isLive && tables
            ? <LiveSchema tables={tables} schema={schema as Record<string,unknown>} excl={excl} piiData={piiData} exclSet={exclSet} expanded={expanded} onExpand={setExpanded} mark={mark} setMark={setMark} onApplyMark={applyMark} />
            : <FlatSchema schema={schema} piiData={piiData} exclSet={exclSet} mark={mark} setMark={setMark} onApplyMark={applyMark} />
        ) : tab === "pii" ? (
          <PIITab includedPii={includedPii} excludedPii={excludedPii} />
        ) : (
          <StatsTab stats={statsCols} piiData={piiData} />
        )}
      </div>
    </aside>
  );
}

function MarkForm({ col, mark, setMark, onApply }: { col: string; mark: MarkState; setMark: (m: MarkState) => void; onApply: () => void }) {
  return (
    <div style={{ padding: "8px", background: "rgba(245,158,11,0.07)", borderTop: "1px solid rgba(245,158,11,0.2)", borderRadius: "0 0 6px 6px" }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: "#f59e0b", marginBottom: 6 }}>Mark "{col}" as PII</p>
      <select style={{ width: "100%", fontSize: 10, borderRadius: 5, padding: "4px 6px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", marginBottom: 5, outline: "none" }}
        value={mark.category} onChange={e => setMark({ ...mark, category: e.target.value })}>
        {PII_CATS.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {(["high","medium","low"] as const).map(s => (
          <button key={s} onClick={() => setMark({ ...mark, severity: s })} style={{ flex: 1, fontSize: 9, padding: "3px 0", borderRadius: 4, cursor: "pointer", fontWeight: 600, textTransform: "capitalize", border: `1px solid ${mark.severity === s ? SEV_COLOR[s] : "var(--border)"}`, background: mark.severity === s ? SEV_BG[s] : "var(--bg)", color: mark.severity === s ? SEV_COLOR[s] : "var(--text-dim)" }}>{s}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={onApply} style={{ flex: 1, padding: "4px 0", fontSize: 10, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: "#f59e0b", border: "none", color: "#fff" }}>✓ Mark as PII</button>
        <button onClick={() => setMark({ ...mark, col: null })} style={{ padding: "4px 8px", fontSize: 10, borderRadius: 5, cursor: "pointer", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-dim)" }}>Cancel</button>
      </div>
    </div>
  );
}

function ColRow({ col, dtype, pii, isExcl, mark, setMark, onApplyMark }: { col: string; dtype?: string; pii?: PIIInfo; isExcl: boolean; mark: MarkState; setMark: (m: MarkState) => void; onApplyMark: () => void }) {
  const isPII = pii?.is_pii;
  const sev   = pii?.severity;
  const isMarking = mark.col === col;
  const [hover, setHover] = useState(false);
  const dotColor = isPII && sev ? SEV_COLOR[sev] : typeDot(dtype);

  return (
    <div style={{ borderRadius: 6, marginBottom: 1, overflow: "hidden" }}>
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 6px", opacity: isExcl ? 0.4 : 1, background: isPII && sev && !isExcl ? SEV_BG[sev] : hover ? "var(--surface3)" : "transparent", borderRadius: 6, transition: "all 0.1s" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: dotColor }} title={dtype || ""} />
        <span style={{ flex: 1, fontSize: 11, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isExcl ? "var(--text-dim)" : "var(--text)", fontWeight: isPII ? 500 : 400 }}>
          {isExcl ? "••••••••" : col}
        </span>
        {isExcl && <EyeOff size={9} style={{ color: "var(--text-dim)" }} />}
        {isPII && sev && !isExcl && <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", color: SEV_COLOR[sev] }}>{sev}</span>}
        {!isPII && !isExcl && hover && !isMarking && (
          <button onClick={() => setMark({ ...mark, col })} style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: "var(--text-dim)" }} title="Mark as PII"><ShieldAlert size={10} /></button>
        )}
      </div>
      {isMarking && <MarkForm col={col} mark={mark} setMark={setMark} onApply={onApplyMark} />}
    </div>
  );
}

function LiveSchema({ tables, schema, excl, piiData, exclSet, expanded, onExpand, mark, setMark, onApplyMark }: { tables: string[]; schema: Record<string,unknown>; excl: Record<string,string[]>; piiData: Record<string,PIIInfo>; exclSet: Set<string>; expanded: string | null; onExpand: (t: string | null) => void; mark: MarkState; setMark: (m: MarkState) => void; onApplyMark: () => void }) {
  return (
    <div style={{ marginTop: 4 }}>
      {tables.map(table => {
        const tSchema = (schema as Record<string,Record<string,unknown>>)[table] || {};
        const cols    = Object.entries(tSchema);
        const tExcl   = new Set(excl[table] || []);
        const isOpen  = expanded === table;
        const tPii    = cols.filter(([col, info]) => ((info as Record<string,unknown>)?.pii as PIIInfo)?.is_pii || piiData[col]?.is_pii).length;
        return (
          <div key={table} style={{ borderRadius: 8, overflow: "hidden", marginBottom: 4, border: "1px solid var(--border)" }}>
            <button onClick={() => onExpand(isOpen ? null : table)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", background: "var(--bg)", border: "none", cursor: "pointer" }}>
              <Database size={11} style={{ color: "var(--accent-light)", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "var(--text)", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{table}</span>
              {tPii > 0 && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(245,158,11,0.2)", color: "#f59e0b", fontWeight: 700 }}>{tPii} PII</span>}
              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{cols.length}</span>
              {isOpen ? <ChevronDown size={11} style={{ color: "var(--text-dim)" }} /> : <ChevronRight size={11} style={{ color: "var(--text-dim)" }} />}
            </button>
            {isOpen && (
              <div style={{ padding: "4px 6px 6px", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
                {cols.map(([col, info]) => {
                  const pii   = (info as Record<string,unknown>)?.pii as PIIInfo | undefined || piiData[col];
                  const dtype = (info as Record<string,unknown>)?.dtype as string | undefined;
                  return <ColRow key={col} col={col} dtype={dtype} pii={pii} isExcl={tExcl.has(col) || exclSet.has(col)} mark={mark} setMark={setMark} onApplyMark={onApplyMark} />;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FlatSchema({ schema, piiData, exclSet, mark, setMark, onApplyMark }: { schema: Record<string,unknown>; piiData: Record<string,PIIInfo>; exclSet: Set<string>; mark: MarkState; setMark: (m: MarkState) => void; onApplyMark: () => void }) {
  return (
    <div style={{ marginTop: 4 }}>
      {Object.entries(schema).filter(([k]) => !k.startsWith("__")).map(([col, info]) => {
        const pii   = (info as Record<string,unknown>)?.pii as PIIInfo | undefined || piiData[col];
        const dtype = (info as Record<string,unknown>)?.dtype as string | undefined;
        return <ColRow key={col} col={col} dtype={dtype} pii={pii} isExcl={exclSet.has(col)} mark={mark} setMark={setMark} onApplyMark={onApplyMark} />;
      })}
    </div>
  );
}

function PIITab({ includedPii, excludedPii }: { includedPii: [string,PIIInfo][]; excludedPii: [string,PIIInfo][]; }) {
  if (!includedPii.length && !excludedPii.length) return (
    <div style={{ textAlign: "center", padding: "40px 16px" }}>
      <Shield size={22} style={{ color: "#22c55e", opacity: 0.6, margin: "0 auto 8px" }} />
      <p style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>No PII detected</p>
      <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>Hover a column in Schema to manually mark it</p>
    </div>
  );
  return (
    <div style={{ marginTop: 4 }}>
      {includedPii.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 4px 6px" }}>
            <AlertTriangle size={10} style={{ color: "#f59e0b" }} />
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#f59e0b" }}>In analysis ({includedPii.length})</span>
          </div>
          {includedPii.map(([col, info]) => {
            const sev = info.severity!;
            return (
              <div key={col} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, marginBottom: 3, background: SEV_BG[sev], border: `1px solid ${SEV_COLOR[sev]}22` }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: SEV_COLOR[sev], flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col}</p>
                  <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{info.category}</p>
                </div>
                <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", color: SEV_COLOR[sev] }}>{sev}</span>
              </div>
            );
          })}
        </>
      )}
      {excludedPii.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 4px 6px" }}>
            <EyeOff size={10} style={{ color: "var(--text-dim)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)" }}>Excluded ({excludedPii.length})</span>
          </div>
          {excludedPii.map(([col]) => (
            <div key={col} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, marginBottom: 3, background: "var(--bg)", border: "1px solid var(--border)", opacity: 0.5 }}>
              <EyeOff size={10} style={{ color: "var(--text-dim)" }} />
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-dim)" }}>••••••••</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function StatsTab({ stats, piiData }: { stats: [string, unknown][]; piiData: Record<string, PIIInfo> }) {
  if (!stats.length) return (
    <div style={{ textAlign: "center", padding: "40px 16px" }}>
      <p style={{ fontSize: 12, color: "var(--text-dim)" }}>Stats available after uploading a file</p>
    </div>
  );
  return (
    <div style={{ marginTop: 4 }}>
      {stats.map(([col, info]) => {
        const i = info as Record<string, unknown>;
        const dtype = i.dtype as string || "";
        const nullCount = i.null_count as number || 0;
        const samples = (i.samples as unknown[]) || [];
        const dotColor = typeDot(dtype);
        const isPII = piiData[col]?.is_pii;
        return (
          <div key={col} style={{ marginBottom: 6, padding: "8px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col}</span>
              {isPII && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: "rgba(245,158,11,0.2)", color: "#f59e0b" }}>PII</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 10px" }}>
              <StatPill label="Type" value={dtype.split("(")[0].slice(0, 10)} />
              <StatPill label="Nulls" value={String(nullCount)} alert={nullCount > 0} />
              {samples.length > 0 && <div style={{ gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 9, color: "var(--text-dim)" }}>Sample: </span>
                <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>{samples.map(s => String(s).slice(0, 12)).join(", ")}</span>
              </div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatPill({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <span style={{ fontSize: 9, color: "var(--text-dim)", flexShrink: 0 }}>{label}:</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: alert ? "#f59e0b" : "var(--text-muted)", fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}
