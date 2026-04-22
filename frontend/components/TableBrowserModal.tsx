"use client";
import { useState, useEffect, useMemo } from "react";
import { AISpinner } from "./AISpinner";
import { X, Search, Database, ChevronRight, ChevronDown, Shield, ShieldAlert, ShieldCheck, Eye, EyeOff, Check, AlertTriangle, Info } from "lucide-react";
import { withAuthHeaders } from "@/lib/auth";

const BASE = "http://localhost:8000/api";

interface ColumnInfo {
  dtype: string;
  nullable: boolean;
  pii: {
    is_pii: boolean;
    category: string | null;
    severity: "high" | "medium" | "low" | null;
    confidence: string;
  };
}

interface TableSchema {
  table: string;
  row_count: number;
  columns: Record<string, ColumnInfo>;
  pii_summary: { high: number; medium: number; low: number; total_pii: number; total_cols: number };
  sample: Record<string, unknown>[];
}

interface Props {
  connStr: string;
  dbType: string;
  connName: string;
  tables: string[];
  onClose: () => void;
  onSave: (result: { id: string; dataset_id: string }) => void;
}

const SEV_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#60a5fa" };
const SEV_BG    = { high: "rgba(239,68,68,0.1)", medium: "rgba(245,158,11,0.1)", low: "rgba(96,165,250,0.1)" };

export default function TableBrowserModal({ connStr, dbType, connName, tables, onClose, onSave }: Props) {
  const [search, setSearch]               = useState("");
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [schemas, setSchemas]             = useState<Record<string, TableSchema>>({});
  const [loadingTable, setLoadingTable]   = useState<string | null>(null);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [excludedCols, setExcludedCols]   = useState<Record<string, Set<string>>>({});
  const [saving, setSaving]               = useState(false);
  const [step, setStep]                   = useState<"tables" | "pii">("tables");

  const filteredTables = useMemo(() =>
    tables.filter(t => t.toLowerCase().includes(search.toLowerCase())),
    [tables, search]
  );

  const loadSchema = async (table: string) => {
    if (schemas[table]) return;
    setLoadingTable(table);
    try {
      const res = await fetch(`${BASE}/db/schema?conn_str=${encodeURIComponent(connStr)}&table=${encodeURIComponent(table)}&db_type=${dbType}`, { headers: withAuthHeaders() })
        .then(r => r.json());
      setSchemas(prev => ({ ...prev, [table]: res }));
      // Auto-exclude high-severity PII
      const autoExcl = new Set<string>();
      Object.entries(res.columns as Record<string, ColumnInfo>).forEach(([col, info]) => {
        if (info.pii?.severity === "high") autoExcl.add(col);
      });
      if (autoExcl.size > 0) {
        setExcludedCols(prev => ({ ...prev, [table]: autoExcl }));
      }
    } catch {}
    setLoadingTable(null);
  };

  const toggleTable = async (table: string) => {
    const next = new Set(selectedTables);
    if (next.has(table)) {
      next.delete(table);
    } else {
      next.add(table);
      await loadSchema(table);
    }
    setSelectedTables(next);
  };

  const expandTable = async (table: string) => {
    const next = expandedTable === table ? null : table;
    setExpandedTable(next);
    if (next && !schemas[next]) await loadSchema(next);
  };

  const toggleCol = (table: string, col: string) => {
    setExcludedCols(prev => {
      const s = new Set(prev[table] || []);
      if (s.has(col)) s.delete(col); else s.add(col);
      return { ...prev, [table]: s };
    });
  };

  const selectAllTables = () => {
    const next = new Set(tables);
    setSelectedTables(next);
    tables.forEach(t => loadSchema(t));
  };

  const piiTablesCount = Object.values(schemas).filter(s => s.pii_summary.total_pii > 0).length;

  const handleSave = async () => {
    setSaving(true);
    const tableSchemas: Record<string, TableSchema> = {};
    selectedTables.forEach(t => { if (schemas[t]) tableSchemas[t] = schemas[t]; });

    const piiReport: Record<string, unknown> = {};
    selectedTables.forEach(t => { if (schemas[t]) piiReport[t] = schemas[t].pii_summary; });

    const excl: Record<string, string[]> = {};
    selectedTables.forEach(t => {
      const e = excludedCols[t];
      if (e && e.size > 0) excl[t] = Array.from(e);
    });

    const res = await fetch(`${BASE}/db/connections`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: connName, db_type: dbType, conn_str: connStr,
        selected_tables: Array.from(selectedTables),
        excluded_columns: excl,
        table_schemas: tableSchemas,
        pii_report: piiReport,
      }),
    }).then(r => r.json());

    setSaving(false);
    onSave(res);
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>

        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <Database size={16} style={{ color: "#00c896" }} />
          <div className="flex-1">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{connName}</h2>
            <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>{tables.length} tables available · {selectedTables.size} selected</p>
          </div>
          {/* Step tabs */}
          <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--bg)" }}>
            {(["tables", "pii"] as const).map(s => (
              <button key={s} onClick={() => setStep(s)}
                className="px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize"
                style={step === s ? { background: "var(--surface)", color: "var(--text)" } : { color: "var(--text-muted)" }}>
                {s === "pii" ? `PII Review ${piiTablesCount > 0 ? `(${piiTablesCount})` : ""}` : "Select Tables"}
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{ color: "var(--text-dim)" }} className="hover:opacity-70 ml-2"><X size={16} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === "tables" ? (
            <TableStep
              tables={filteredTables} allTables={tables} selected={selectedTables}
              search={search} onSearch={setSearch}
              schemas={schemas} loadingTable={loadingTable}
              expandedTable={expandedTable}
              onToggle={toggleTable} onExpand={expandTable}
              onSelectAll={selectAllTables}
              excludedCols={excludedCols}
            />
          ) : (
            <PIIStep
              selected={Array.from(selectedTables)}
              schemas={schemas} excludedCols={excludedCols}
              onToggleCol={toggleCol} loadingTable={loadingTable}
              onLoadSchema={loadSchema}
            />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {selectedTables.size === 0
              ? "Select at least one table to continue"
              : `${selectedTables.size} table${selectedTables.size > 1 ? "s" : ""} selected · queries run live on your database`}
          </p>
          <div className="flex gap-2">
            {step === "tables" && (
              <button onClick={() => setStep("pii")} disabled={selectedTables.size === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
                Review PII <ChevronRight size={14} />
              </button>
            )}
            <button onClick={handleSave} disabled={saving || selectedTables.size === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#00c896,#059669)" }}>
              {saving ? <AISpinner size={14} /> : <Check size={14} />}
              {saving ? "Connecting…" : "Connect & start chatting"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TableStep({ tables, allTables, selected, search, onSearch, schemas, loadingTable, expandedTable, onToggle, onExpand, onSelectAll, excludedCols }: {
  tables: string[]; allTables: string[]; selected: Set<string>;
  search: string; onSearch: (s: string) => void;
  schemas: Record<string, TableSchema>; loadingTable: string | null;
  expandedTable: string | null;
  onToggle: (t: string) => void; onExpand: (t: string) => void;
  onSelectAll: () => void;
  excludedCols: Record<string, Set<string>>;
}) {
  return (
    <div className="p-4 space-y-3">
      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
        <Search size={14} style={{ color: "var(--text-dim)" }} />
        <input className="flex-1 bg-transparent text-sm outline-none placeholder-[var(--text-dim)]"
          style={{ color: "var(--text)" }}
          placeholder="Search tables…"
          value={search} onChange={e => onSearch(e.target.value)} />
      </div>

      {/* Select all */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
          {tables.length} table{tables.length !== 1 ? "s" : ""}
        </p>
        <button onClick={onSelectAll} className="text-[10px] hover:opacity-70 transition-opacity" style={{ color: "#33d9ab" }}>
          Select all
        </button>
      </div>

      {/* Table list */}
      <div className="space-y-1.5">
        {tables.map(table => {
          const isSelected = selected.has(table);
          const schema     = schemas[table];
          const isLoading  = loadingTable === table;
          const isExpanded = expandedTable === table;
          const piiCount   = schema?.pii_summary?.total_pii || 0;
          const excl       = excludedCols[table];

          return (
            <div key={table} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${isSelected ? "rgba(0,200,150,0.4)" : "var(--border)"}` }}>
              {/* Row */}
              <div className="flex items-center gap-3 px-4 py-3" style={{ background: isSelected ? "rgba(0,200,150,0.06)" : "var(--bg)" }}>
                {/* Checkbox */}
                <button onClick={() => onToggle(table)}
                  className="shrink-0 w-4 h-4 rounded flex items-center justify-center transition-colors"
                  style={{ background: isSelected ? "#00c896" : "var(--surface)", border: `1.5px solid ${isSelected ? "#00c896" : "var(--border2)"}` }}>
                  {isSelected && <Check size={10} className="text-white" />}
                </button>

                <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--text)" }}>{table}</span>

                {/* PII badge */}
                {piiCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                    {piiCount} PII col{piiCount > 1 ? "s" : ""}
                  </span>
                )}

                {/* Row count */}
                {schema && (
                  <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                    {schema.row_count?.toLocaleString()} rows
                  </span>
                )}

                {/* Expand button */}
                <button onClick={() => onExpand(table)} className="p-1 hover:opacity-70 transition-opacity" style={{ color: "var(--text-dim)" }}>
                  {isLoading ? <AISpinner size={13} /> : isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              </div>

              {/* Expanded columns preview */}
              {isExpanded && schema && (
                <div className="px-4 pb-3 pt-1 space-y-1" style={{ borderTop: "1px solid var(--border)" }}>
                  <p className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
                    Columns ({Object.keys(schema.columns).length})
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(schema.columns).slice(0, 20).map(([col, info]) => {
                      const isPii = info.pii?.is_pii;
                      const sev   = info.pii?.severity;
                      const isExcl = excl?.has(col);
                      return (
                        <div key={col} className="flex items-center gap-1.5 rounded px-2 py-1"
                          style={{ background: "var(--surface)", opacity: isExcl ? 0.4 : 1 }}>
                          {isPii && sev && (
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: SEV_COLOR[sev] }} />
                          )}
                          <span className="text-[10px] truncate flex-1" style={{ color: "var(--text)" }}>{col}</span>
                          {isExcl && <EyeOff size={9} style={{ color: "var(--text-dim)" }} />}
                        </div>
                      );
                    })}
                    {Object.keys(schema.columns).length > 20 && (
                      <div className="text-[10px] px-2 py-1" style={{ color: "var(--text-dim)" }}>
                        +{Object.keys(schema.columns).length - 20} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PIIStep({ selected, schemas, excludedCols, onToggleCol, loadingTable, onLoadSchema }: {
  selected: string[];
  schemas: Record<string, TableSchema>;
  excludedCols: Record<string, Set<string>>;
  onToggleCol: (t: string, c: string) => void;
  loadingTable: string | null;
  onLoadSchema: (t: string) => void;
}) {
  useEffect(() => {
    selected.forEach(t => { if (!schemas[t]) onLoadSchema(t); });
  }, [selected]);

  const totalPii    = selected.reduce((sum, t) => sum + (schemas[t]?.pii_summary?.total_pii || 0), 0);
  const totalExcl   = Object.values(excludedCols).reduce((sum, s) => sum + s.size, 0);

  return (
    <div className="p-4 space-y-4">
      {/* Summary banner */}
      {totalPii > 0 ? (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <ShieldAlert size={16} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-xs font-semibold" style={{ color: "#f59e0b" }}>{totalPii} PII columns detected</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              High-severity columns are excluded by default. Toggle any column to include or exclude it from AI analysis.
              {totalExcl > 0 && ` Currently excluding ${totalExcl} column${totalExcl > 1 ? "s" : ""}.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
          <ShieldCheck size={16} style={{ color: "#22c55e" }} />
          <p className="text-xs" style={{ color: "#22c55e" }}>No PII columns detected in selected tables</p>
        </div>
      )}

      {/* Per-table PII columns */}
      {selected.map(table => {
        const schema = schemas[table];
        if (!schema) return (
          <div key={table} className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ border: "1px solid var(--border)" }}>
            <AISpinner size={14} />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading {table}…</span>
          </div>
        );

        const piiCols    = Object.entries(schema.columns).filter(([, info]) => info.pii?.is_pii);
        const normalCols = Object.entries(schema.columns).filter(([, info]) => !info.pii?.is_pii);
        const excl       = excludedCols[table] || new Set();

        return (
          <div key={table} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {/* Table header */}
            <div className="flex items-center gap-2 px-4 py-3" style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
              <Database size={13} style={{ color: "#00c896" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{table}</span>
              <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{schema.row_count?.toLocaleString()} rows</span>
              {piiCols.length > 0 && (
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                  {piiCols.length} PII
                </span>
              )}
            </div>

            <div className="p-3 space-y-1">
              {piiCols.length === 0 && (
                <p className="text-[11px] py-2 text-center" style={{ color: "var(--text-dim)" }}>No PII columns detected</p>
              )}

              {/* PII columns */}
              {piiCols.map(([col, info]) => {
                const sev    = info.pii.severity!;
                const isExcl = excl.has(col);
                return (
                  <div key={col} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all"
                    style={{ background: isExcl ? "var(--bg)" : SEV_BG[sev], opacity: isExcl ? 0.5 : 1 }}
                    onClick={() => onToggleCol(table, col)}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SEV_COLOR[sev] }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{col}</span>
                      <span className="ml-2 text-[10px]" style={{ color: SEV_COLOR[sev] }}>{info.pii.category}</span>
                    </div>
                    <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: SEV_BG[sev], color: SEV_COLOR[sev] }}>{sev}</span>
                    <button className="shrink-0 p-1 rounded transition-colors"
                      style={{ color: isExcl ? "var(--text-dim)" : SEV_COLOR[sev] }}>
                      {isExcl ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <span className="text-[10px] min-w-[60px] text-right font-medium"
                      style={{ color: isExcl ? "var(--text-dim)" : "#22c55e" }}>
                      {isExcl ? "Excluded" : "Included"}
                    </span>
                  </div>
                );
              })}

              {/* Non-PII columns (collapsed) */}
              {normalCols.length > 0 && (
                <p className="text-[9px] pt-2 pb-1" style={{ color: "var(--text-dim)" }}>
                  + {normalCols.length} non-PII column{normalCols.length > 1 ? "s" : ""} (included automatically)
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
