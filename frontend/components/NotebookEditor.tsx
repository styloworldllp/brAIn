"use client";
import { useState, useEffect, useRef } from "react";
import { AISpinner } from "./AISpinner";
import { Play, Trash2, ChevronUp, ChevronDown, Save, ArrowLeft, Plus, Database, FileText, Check, PlaySquare, BookOpen } from "lucide-react";
import { Dataset, fetchDatasets } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

interface Cell {
  id: string; type: "code" | "markdown";
  content: string; output: string | null;
  charts?: unknown[]; running?: boolean; error?: string | null;
}

interface Notebook {
  id: string; title: string; description: string;
  dataset_ids: string[];
  cells: Cell[];
  template: string; updated_at: string;
}

interface Props { notebookId: string; onBack: () => void; }

export default function NotebookEditor({ notebookId, onBack }: Props) {
  const [nb, setNb]             = useState<Notebook | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [showDatasetPicker, setShowDatasetPicker] = useState(false);
  const [runningAll, setRunningAll] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/notebooks/${notebookId}`, { headers: withAuthHeaders() }).then(r => r.json()).then(data => {
      if (data.dataset_id && !data.dataset_ids) data.dataset_ids = [data.dataset_id];
      data.dataset_ids = data.dataset_ids || [];
      setNb(data);
    });
    fetchDatasets().then(setDatasets);
  }, [notebookId]);

  const save = async (cells?: Cell[]) => {
    if (!nb) return;
    setSaving(true);
    await fetch(`${BASE}/notebooks/${notebookId}`, {
      method: "PATCH", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title: nb.title, cells: cells || nb.cells, dataset_ids: nb.dataset_ids, dataset_id: nb.dataset_ids[0] || null }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const runCell = async (cellId: string) => {
    if (!nb || nb.dataset_ids.length === 0) { alert("Select at least one dataset first."); return; }
    const cell = nb.cells.find(c => c.id === cellId);
    if (!cell || cell.type !== "code") return;
    setNb(prev => prev ? { ...prev, cells: prev.cells.map(c =>
      c.id === cellId ? { ...c, running: true, output: null, error: null, charts: [] } : c
    ) } : prev);
    const res = await fetch(`${BASE}/chat/run-cell`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ code: cell.content, dataset_id: nb.dataset_ids[0] }),
    }).then(r => r.json()).catch(() => ({ success: false, output: "", error: "Request failed", charts: [] }));
    setNb(prev => {
      if (!prev) return prev;
      const updated = prev.cells.map(c => c.id === cellId
        ? { ...c, running: false, output: res.output || null, error: res.error || null, charts: res.charts || [] } : c);
      save(updated);
      return { ...prev, cells: updated };
    });
  };

  const runAll = async () => {
    if (!nb) return;
    setRunningAll(true);
    for (const cell of nb.cells) { if (cell.type === "code") await runCell(cell.id); }
    setRunningAll(false);
  };

  const addCell = (type: "code" | "markdown", afterId?: string) => {
    if (!nb) return;
    const newCell: Cell = { id: crypto.randomUUID(), type, content: type === "code" ? "# Your analysis\n" : "## Notes\n", output: null };
    const cells = [...nb.cells];
    if (afterId) { const idx = cells.findIndex(c => c.id === afterId); cells.splice(idx + 1, 0, newCell); }
    else cells.push(newCell);
    setNb(prev => prev ? { ...prev, cells } : prev);
  };

  const toggleDataset = (id: string) => {
    if (!nb) return;
    const ids = nb.dataset_ids.includes(id) ? nb.dataset_ids.filter(d => d !== id) : [...nb.dataset_ids, id];
    setNb(prev => prev ? { ...prev, dataset_ids: ids } : prev);
  };

  if (!nb) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <AISpinner size={24} />
    </div>
  );

  const selectedDatasets = datasets.filter(d => nb.dataset_ids.includes(d.id));

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg)" }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 20px", height: 52, borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>

        {/* Back */}
        <button onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 12, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--surface3)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>
          <ArrowLeft size={14} /> Notebooks
        </button>

        <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

        {/* Title */}
        <input value={nb.title}
          onChange={e => setNb(prev => prev ? { ...prev, title: e.target.value } : prev)}
          onBlur={() => save()}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 600, color: "var(--text)", minWidth: 0, boxShadow: "none" }}
        />

        {/* Dataset selector */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setShowDatasetPicker(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, fontSize: 12, border: "1px solid var(--border)", background: "var(--surface)", color: selectedDatasets.length > 0 ? "var(--text)" : "var(--text-dim)", cursor: "pointer", whiteSpace: "nowrap" }}>
            <Database size={12} />
            {selectedDatasets.length === 0 ? "Select datasets…" : selectedDatasets.length === 1 ? selectedDatasets[0].name : `${selectedDatasets.length} datasets`}
            <ChevronDown size={10} style={{ color: "var(--text-dim)" }} />
          </button>

          {showDatasetPicker && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setShowDatasetPicker(false)} />
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 280, borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.3)", background: "var(--surface2)", border: "1px solid var(--border)", zIndex: 50, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", margin: 0 }}>Datasets for this notebook</p>
                </div>
                <div style={{ maxHeight: 240, overflowY: "auto", padding: "6px" }}>
                  {datasets.length === 0 && <p style={{ fontSize: 12, textAlign: "center", padding: "16px 0", color: "var(--text-dim)" }}>No datasets available</p>}
                  {datasets.map(ds => {
                    const isSelected = nb.dataset_ids.includes(ds.id);
                    const isPrimary  = nb.dataset_ids[0] === ds.id;
                    const color = ds.source_type === "mysql" ? "#fb923c" : ds.source_type === "postgres" ? "#60a5fa" : "var(--accent)";
                    return (
                      <div key={ds.id} onClick={() => toggleDataset(ds.id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: isSelected ? "var(--accent-dim)" : "transparent", border: `1px solid ${isSelected ? "var(--border-accent)" : "transparent"}`, marginBottom: 2 }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: isSelected ? "var(--accent)" : "var(--surface3)", border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border2)"}` }}>
                          {isSelected && <Check size={9} style={{ color: "#fff" }} />}
                        </div>
                        <span style={{ color, flexShrink: 0 }}>{ds.source_type === "postgres" || ds.source_type === "mysql" ? <Database size={12} /> : <FileText size={12} />}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.name}</p>
                          <p style={{ fontSize: 10, color: "var(--text-dim)", margin: 0 }}>{ds.source_type} · {ds.row_count?.toLocaleString() || "live"} rows</p>
                        </div>
                        {isPrimary && isSelected && <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 3, background: "var(--accent-dim)", color: "var(--accent-light)", letterSpacing: "0.05em" }}>PRIMARY</span>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: "8px", borderTop: "1px solid var(--border)" }}>
                  <button onClick={() => { setShowDatasetPicker(false); save(); }}
                    style={{ width: "100%", padding: "7px", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,var(--accent),var(--accent2))", border: "none", cursor: "pointer" }}>
                    Done
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Dataset chips */}
        {selectedDatasets.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap", maxWidth: 200, overflow: "hidden" }}>
            {selectedDatasets.slice(0, 2).map((ds, i) => (
              <span key={ds.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "2px 8px", borderRadius: 10, background: i === 0 ? "var(--accent-dim)" : "var(--surface)", color: i === 0 ? "var(--accent-light)" : "var(--text-muted)", border: "1px solid var(--border)", whiteSpace: "nowrap", fontWeight: 500 }}>
                {i === 0 && "★ "}{ds.name.slice(0, 16)}{ds.name.length > 16 ? "…" : ""}
              </span>
            ))}
            {selectedDatasets.length > 2 && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>+{selectedDatasets.length - 2}</span>}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={runAll} disabled={runningAll}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: "linear-gradient(135deg,var(--accent),var(--accent2))", color: "#fff", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", opacity: runningAll ? 0.7 : 1, boxShadow: "0 2px 8px var(--accent-glow)" }}>
            {runningAll ? <AISpinner size={12} /> : <PlaySquare size={13} />}
            Run all
          </button>
          <button onClick={() => save()} disabled={saving}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, border: "1px solid var(--border)", color: saved ? "var(--accent-light)" : "var(--text-muted)", background: "var(--surface)", cursor: "pointer" }}>
            {saving ? <AISpinner size={12} /> : <Save size={12} />}
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px" }}>

          {/* Description */}
          {nb.description && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", borderRadius: 10, marginBottom: 20, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <BookOpen size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>{nb.description}</p>
            </div>
          )}

          {/* Multi-dataset hint */}
          {selectedDatasets.length > 1 && (
            <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", color: "var(--accent-light)", fontSize: 12 }}>
              <strong>Multi-dataset:</strong> Use <code style={{ fontFamily: "monospace", background: "rgba(0,0,0,0.2)", padding: "1px 5px", borderRadius: 3 }}>df</code> for <em>{selectedDatasets[0]?.name}</em>, or <code style={{ fontFamily: "monospace", background: "rgba(0,0,0,0.2)", padding: "1px 5px", borderRadius: 3 }}>load_table("table")</code> for DB sources.
            </div>
          )}

          {/* Cells */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {nb.cells.map((cell, idx) => (
              <CellBlock key={cell.id} cell={cell} idx={idx} total={nb.cells.length}
                onChange={content => setNb(prev => prev ? { ...prev, cells: prev.cells.map(c => c.id === cell.id ? { ...c, content } : c) } : prev)}
                onRun={() => runCell(cell.id)}
                onDelete={() => setNb(prev => prev ? { ...prev, cells: prev.cells.filter(c => c.id !== cell.id) } : prev)}
                onAddAfter={type => addCell(type, cell.id)}
                onMoveUp={() => {
                  const cells = [...nb.cells];
                  [cells[idx], cells[idx - 1]] = [cells[idx - 1], cells[idx]];
                  setNb(prev => prev ? { ...prev, cells } : prev);
                }}
                onMoveDown={() => {
                  const cells = [...nb.cells];
                  [cells[idx], cells[idx + 1]] = [cells[idx + 1], cells[idx]];
                  setNb(prev => prev ? { ...prev, cells } : prev);
                }}
              />
            ))}
          </div>

          {/* Add cell buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, paddingTop: 16, borderTop: "1px dashed var(--border)" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)", marginRight: 4 }}>Add cell</span>
            {(["code", "markdown"] as const).map(type => (
              <button key={type} onClick={() => addCell(type)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 500, border: "1px dashed var(--border2)", color: "var(--text-dim)", background: "transparent", cursor: "pointer", transition: "all 140ms ease" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent-light)"; e.currentTarget.style.background = "var(--accent-dim)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "transparent"; }}>
                <Plus size={12} /> {type === "code" ? "Code" : "Text"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Cell component ── */
function CellBlock({ cell, idx, total, onChange, onRun, onDelete, onMoveUp, onMoveDown, onAddAfter }: {
  cell: Cell; idx: number; total: number;
  onChange: (c: string) => void; onRun: () => void; onDelete: () => void;
  onAddAfter: (type: "code" | "markdown") => void;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(el.scrollHeight, 80) + "px";
  }, [cell.content]);

  const isCode = cell.type === "code";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${hovered ? (isCode ? "var(--border-accent)" : "rgba(96,165,250,0.3)") : "var(--border)"}`, transition: "border-color 150ms ease", background: "var(--surface)", boxShadow: hovered ? "0 4px 20px rgba(0,0,0,0.08)" : "none" }}>

      {/* ── Cell toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 12px", height: 36, background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>

        {/* Left: index + type */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "monospace", color: "var(--text-dim)", minWidth: 18, textAlign: "center" }}>{idx + 1}</span>
          <div style={{ width: 1, height: 14, background: "var(--border)" }} />
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5, letterSpacing: "0.03em",
            ...(isCode
              ? { background: "var(--accent-dim)", color: "var(--accent-light)" }
              : { background: "rgba(96,165,250,0.12)", color: "#60a5fa" }) }}>
            {isCode ? "Python" : "Markdown"}
          </span>
          {isCode && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>Ctrl+Enter to run</span>}
        </div>

        {/* Right: actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button onClick={onMoveUp} disabled={idx === 0}
            style={{ padding: "4px 5px", borderRadius: 5, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", opacity: idx === 0 ? 0.2 : 0.7 }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface3)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>
            <ChevronUp size={13} />
          </button>
          <button onClick={onMoveDown} disabled={idx === total - 1}
            style={{ padding: "4px 5px", borderRadius: 5, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", opacity: idx === total - 1 ? 0.2 : 0.7 }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface3)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>
            <ChevronDown size={13} />
          </button>

          {isCode && (
            <button onClick={onRun}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", marginLeft: 4, borderRadius: 6, fontSize: 12, fontWeight: 600, background: cell.running ? "var(--surface3)" : "var(--accent-dim)", border: `1px solid ${cell.running ? "var(--border)" : "var(--border-accent)"}`, color: cell.running ? "var(--text-dim)" : "var(--accent-light)", cursor: cell.running ? "default" : "pointer", transition: "all 120ms ease" }}
              onMouseEnter={e => { if (!cell.running) e.currentTarget.style.background = "linear-gradient(135deg,var(--accent),var(--accent2))"; if (!cell.running) e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = cell.running ? "var(--surface3)" : "var(--accent-dim)"; e.currentTarget.style.color = cell.running ? "var(--text-dim)" : "var(--accent-light)"; }}>
              {cell.running ? <AISpinner size={11} /> : <Play size={11} />}
              {cell.running ? "Running…" : "Run"}
            </button>
          )}

          <button onClick={onDelete}
            style={{ padding: "4px 5px", borderRadius: 5, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", marginLeft: 2 }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-dim)"; }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Editor area ── */}
      <div style={{
        background: isCode ? "var(--code-bg)" : "var(--surface)",
        borderLeft: `3px solid ${isCode ? "var(--accent)" : "#60a5fa"}`,
      }}>
        <textarea ref={textareaRef} value={cell.content} onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onRun(); } }}
          spellCheck={false}
          placeholder={isCode ? "# Write Python here…" : "Write notes in markdown…"}
          style={{
            display: "block", width: "100%", resize: "none", border: "none", outline: "none",
            padding: "16px 18px", lineHeight: 1.7, fontSize: 13,
            fontFamily: isCode ? '"JetBrains Mono","Fira Code",Menlo,monospace' : "inherit",
            color: isCode ? "var(--code-text)" : "var(--text)",
            background: "transparent",
            minHeight: 80,
          }}
        />
      </div>

      {/* ── Output ── */}
      {cell.output && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--output-bg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)" }}>Output</span>
          </div>
          <pre style={{ margin: 0, padding: "12px 18px", fontSize: 12.5, lineHeight: 1.65, color: "var(--output-text)", fontFamily: '"JetBrains Mono",Menlo,monospace', whiteSpace: "pre-wrap", maxHeight: 320, overflowY: "auto" }}>{cell.output}</pre>
        </div>
      )}

      {/* ── Error ── */}
      {cell.error && (
        <div style={{ borderTop: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
          <div style={{ padding: "6px 14px", borderBottom: "1px solid rgba(239,68,68,0.2)" }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#f87171" }}>Error</span>
          </div>
          <pre style={{ margin: 0, padding: "12px 18px", fontSize: 12, lineHeight: 1.6, color: "#fca5a5", fontFamily: '"JetBrains Mono",Menlo,monospace', whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto" }}>{cell.error}</pre>
        </div>
      )}

      {/* ── Charts ── */}
      {cell.charts && cell.charts.length > 0 && cell.charts.map((chart, i) => (
        <ChartWrapper key={i} chartJson={chart} />
      ))}
    </div>
  );
}

function ChartWrapper({ chartJson }: { chartJson: unknown }) {
  const [Comp, setComp] = useState<React.ComponentType<{ chartJson: unknown }> | null>(null);
  useEffect(() => { import("./ChartDisplay").then(m => setComp(() => m.default)); }, []);
  if (!Comp) return null;
  return <div style={{ borderTop: "1px solid var(--border)" }}><Comp chartJson={chartJson} /></div>;
}

