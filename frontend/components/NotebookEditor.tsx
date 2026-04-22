"use client";
import { useState, useEffect, useRef } from "react";
import { AISpinner } from "./AISpinner";
import { Play, Trash2, ChevronUp, ChevronDown, Save, ArrowLeft, Plus, Database, FileText, X, Check } from "lucide-react";
import { Dataset, fetchDatasets } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";

const BASE = "http://localhost:8000/api";

interface Cell {
  id: string; type: "code" | "markdown";
  content: string; output: string | null;
  charts?: unknown[]; running?: boolean; error?: string | null;
}

interface Notebook {
  id: string; title: string; description: string;
  dataset_ids: string[];   // ← now supports multiple
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

  useEffect(() => {
    fetch(`${BASE}/notebooks/${notebookId}`, { headers: withAuthHeaders() }).then(r => r.json()).then(data => {
      // Migrate old single dataset_id to array
      if (data.dataset_id && !data.dataset_ids) {
        data.dataset_ids = [data.dataset_id];
      }
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
      body: JSON.stringify({
        title: nb.title,
        cells: cells || nb.cells,
        dataset_ids: nb.dataset_ids,
        dataset_id: nb.dataset_ids[0] || null, // backward compat
      }),
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
    )} : prev);

    // Run against primary dataset (first selected)
    const res = await fetch(`${BASE}/chat/run-cell`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ code: cell.content, dataset_id: nb.dataset_ids[0] }),
    }).then(r => r.json()).catch(() => ({ success: false, output: "", error: "Request failed", charts: [] }));

    setNb(prev => {
      if (!prev) return prev;
      const updated = prev.cells.map(c => c.id === cellId
        ? { ...c, running: false, output: res.output || null, error: res.error || null, charts: res.charts || [] }
        : c);
      save(updated);
      return { ...prev, cells: updated };
    });
  };

  const runAll = async () => {
    if (!nb) return;
    for (const cell of nb.cells) { if (cell.type === "code") await runCell(cell.id); }
  };

  const addCell = (type: "code" | "markdown", afterId?: string) => {
    if (!nb) return;
    const newCell: Cell = {
      id: crypto.randomUUID(), type,
      content: type === "code" ? "# Your analysis\n" : "## Notes\n",
      output: null,
    };
    const cells = [...nb.cells];
    if (afterId) {
      const idx = cells.findIndex(c => c.id === afterId);
      cells.splice(idx + 1, 0, newCell);
    } else cells.push(newCell);
    setNb(prev => prev ? { ...prev, cells } : prev);
  };

  const toggleDataset = (id: string) => {
    if (!nb) return;
    const ids = nb.dataset_ids.includes(id)
      ? nb.dataset_ids.filter(d => d !== id)
      : [...nb.dataset_ids, id];
    setNb(prev => prev ? { ...prev, dataset_ids: ids } : prev);
  };

  if (!nb) return (
    <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <AISpinner size={24} />
    </div>
  );

  const selectedDatasets = datasets.filter(d => nb.dataset_ids.includes(d.id));

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
        <button onClick={onBack} className="hover:opacity-70 transition-opacity" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft size={16} />
        </button>

        {/* Title */}
        <input
          className="flex-1 bg-transparent text-sm font-semibold outline-none"
          style={{ color: "var(--text)" }}
          value={nb.title}
          onChange={e => setNb(prev => prev ? { ...prev, title: e.target.value } : prev)}
          onBlur={() => save()}
        />

        {/* Dataset selector */}
        <div className="relative">
          <button onClick={() => setShowDatasetPicker(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ border: "1px solid var(--border)", background: "var(--bg)", color: selectedDatasets.length > 0 ? "var(--text)" : "var(--text-dim)" }}>
            <Database size={12} />
            {selectedDatasets.length === 0 ? "Select datasets…"
              : selectedDatasets.length === 1 ? selectedDatasets[0].name
              : `${selectedDatasets.length} datasets`}
            <ChevronDown size={11} />
          </button>

          {showDatasetPicker && (
            <div className="absolute right-0 top-full mt-1 w-72 rounded-xl shadow-2xl z-50 overflow-hidden"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
              <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                  Select datasets to use in this notebook
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                {datasets.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: "var(--text-dim)" }}>No datasets available</p>
                )}
                {datasets.map(ds => {
                  const isSelected = nb.dataset_ids.includes(ds.id);
                  const isPrimary  = nb.dataset_ids[0] === ds.id;
                  const icon = ds.source_type === "postgres" || ds.source_type === "mysql"
                    ? <Database size={12} /> : <FileText size={12} />;
                  const color = ds.source_type === "mysql" ? "#fb923c"
                    : ds.source_type === "postgres" ? "#60a5fa" : "#4ade80";
                  return (
                    <div key={ds.id} onClick={() => toggleDataset(ds.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      style={{ background: isSelected ? "rgba(0,200,150,0.08)" : "var(--bg)", border: `1px solid ${isSelected ? "rgba(0,200,150,0.3)" : "var(--border)"}` }}>
                      {/* Checkbox */}
                      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors"
                        style={{ background: isSelected ? "#00c896" : "var(--surface2)", border: `1.5px solid ${isSelected ? "#00c896" : "var(--border2)"}` }}>
                        {isSelected && <Check size={9} className="text-white" />}
                      </div>
                      <span style={{ color, flexShrink: 0 }}>{icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate" style={{ color: "var(--text)" }}>{ds.name}</p>
                        <p className="text-[9px]" style={{ color: "var(--text-dim)" }}>
                          {ds.source_type} · {ds.row_count?.toLocaleString() || "live"} rows
                        </p>
                      </div>
                      {isPrimary && isSelected && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(0,200,150,0.2)", color: "#33d9ab" }}>PRIMARY</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="px-3 py-2" style={{ borderTop: "1px solid var(--border)" }}>
                <p className="text-[9px]" style={{ color: "var(--text-dim)" }}>
                  First selected is primary. All selected are available as df_datasetname in code.
                </p>
              </div>
              <button onClick={() => { setShowDatasetPicker(false); save(); }}
                className="w-full py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#00c896,#059669)" }}>
                Done
              </button>
            </div>
          )}
        </div>

        {/* Selected dataset chips */}
        {selectedDatasets.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap max-w-xs">
            {selectedDatasets.map((ds, i) => (
              <span key={ds.id} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: i === 0 ? "rgba(0,200,150,0.15)" : "var(--surface)", color: i === 0 ? "#33d9ab" : "var(--text-muted)", border: "1px solid var(--border)" }}>
                {i === 0 && "★ "}{ds.name.slice(0, 20)}{ds.name.length > 20 ? "…" : ""}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <button onClick={runAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(135deg,#00c896,#059669)" }}>
          <Play size={12} /> Run all
        </button>
        <button onClick={() => save()} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50"
          style={{ border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--bg)" }}>
          <Save size={12} />
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
        </button>
      </div>

      {/* Cells */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3 max-w-4xl mx-auto w-full">
        {nb.description && (
          <p className="text-xs italic mb-2" style={{ color: "var(--text-dim)" }}>{nb.description}</p>
        )}

        {selectedDatasets.length > 1 && (
          <div className="px-4 py-2 rounded-lg text-xs" style={{ background: "rgba(0,200,150,0.08)", border: "1px solid rgba(0,200,150,0.2)", color: "#6ee7b7" }}>
            <strong>Multi-dataset mode:</strong> Use <code className="font-mono bg-black/20 px-1 rounded">df</code> for primary ({selectedDatasets[0]?.name}), or <code className="font-mono bg-black/20 px-1 rounded">load_table("table")</code> / <code className="font-mono bg-black/20 px-1 rounded">run_sql("...")</code> for DB sources.
          </div>
        )}

        {nb.cells.map((cell, idx) => (
          <CellBlock key={cell.id} cell={cell} idx={idx} total={nb.cells.length}
            onChange={content => setNb(prev => prev ? { ...prev, cells: prev.cells.map(c => c.id === cell.id ? { ...c, content } : c) } : prev)}
            onRun={() => runCell(cell.id)}
            onDelete={() => setNb(prev => prev ? { ...prev, cells: prev.cells.filter(c => c.id !== cell.id) } : prev)}
            onMoveUp={() => {
              const cells = [...nb.cells];
              [cells[idx], cells[idx-1]] = [cells[idx-1], cells[idx]];
              setNb(prev => prev ? { ...prev, cells } : prev);
            }}
            onMoveDown={() => {
              const cells = [...nb.cells];
              [cells[idx], cells[idx+1]] = [cells[idx+1], cells[idx]];
              setNb(prev => prev ? { ...prev, cells } : prev);
            }}
          />
        ))}

        <div className="flex gap-2 pt-2">
          {(["code", "markdown"] as const).map(type => (
            <button key={type} onClick={() => addCell(type)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors"
              style={{ border: "1px dashed var(--border)", color: "var(--text-dim)" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#00c89666"; e.currentTarget.style.color = "#33d9ab"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-dim)"; }}>
              <Plus size={12} /> {type === "code" ? "Code cell" : "Text cell"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CellBlock({ cell, idx, total, onChange, onRun, onDelete, onMoveUp, onMoveDown }: {
  cell: Cell; idx: number; total: number;
  onChange: (c: string) => void; onRun: () => void;
  onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(el.scrollHeight, 80) + "px";
  }, [cell.content]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(0,200,150,0.3)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
        <span className="text-[9px] font-mono w-5 text-center" style={{ color: "var(--text-dim)" }}>{idx + 1}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
          style={cell.type === "code"
            ? { background: "rgba(0,200,150,0.2)", color: "#33d9ab" }
            : { background: "rgba(96,165,250,0.2)", color: "#60a5fa" }}>
          {cell.type}
        </span>
        <div className="flex-1" />
        <button onClick={onMoveUp} disabled={idx === 0} className="p-0.5 disabled:opacity-20 hover:opacity-70" style={{ color: "var(--text-dim)" }}><ChevronUp size={12} /></button>
        <button onClick={onMoveDown} disabled={idx === total - 1} className="p-0.5 disabled:opacity-20 hover:opacity-70" style={{ color: "var(--text-dim)" }}><ChevronDown size={12} /></button>
        {cell.type === "code" && (
          <button onClick={onRun} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors"
            style={{ background: "rgba(0,200,150,0.15)", color: "#33d9ab" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(0,200,150,0.25)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(0,200,150,0.15)"}>
            {cell.running ? <AISpinner size={10} /> : <Play size={10} />}
            {cell.running ? "Running…" : "Run"}
          </button>
        )}
        <button onClick={onDelete} className="p-0.5 hover:text-red-400 transition-colors" style={{ color: "var(--text-dim)" }}><Trash2 size={11} /></button>
      </div>

      {/* Editor */}
      <textarea ref={textareaRef} value={cell.content} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onRun(); } }}
        className="w-full text-sm leading-relaxed outline-none resize-none px-4 py-3 font-mono"
        style={{ background: "var(--bg)", color: cell.type === "code" ? "#a8dadc" : "var(--text)" }}
        placeholder={cell.type === "code" ? "# Write Python here… (Ctrl+Enter to run)" : "Write notes here…"}
        spellCheck={false}
      />

      {/* Output */}
      {cell.output && (
        <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
          <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>{cell.output}</pre>
        </div>
      )}
      {cell.error && (
        <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
          <pre className="text-xs text-red-400 whitespace-pre-wrap">{cell.error}</pre>
        </div>
      )}
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
