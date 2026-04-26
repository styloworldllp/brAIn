"use client";
import { useState, useEffect } from "react";
import { BarChart2, Trash2, Edit2, Check, X, ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { withAuthHeaders } from "@/lib/auth";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface SavedChart { id: string; title: string; dataset_id: string; chart_json: unknown; created_at: string; }
interface Props { refreshTrigger: number; }

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

export default function ChartsPanel({ refreshTrigger }: Props) {
  const [charts, setCharts]       = useState<SavedChart[]>([]);
  const [selected, setSelected]   = useState<SavedChart | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const load = () => fetch(`${BASE}/charts/`, { headers: withAuthHeaders() }).then(r => r.json()).then(setCharts).catch(e => console.error("Failed to load charts:", e));
  useEffect(() => { load(); }, [refreshTrigger]);

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${BASE}/charts/${id}`, { method: "DELETE", headers: withAuthHeaders() });
    setCharts(prev => prev.filter(c => c.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const clearAll = async () => {
    if (!confirm(`Delete all ${charts.length} saved charts?`)) return;
    for (const c of charts) await fetch(`${BASE}/charts/${c.id}`, { method: "DELETE", headers: withAuthHeaders() });
    setCharts([]); setSelected(null);
  };

  const startEdit = (c: SavedChart, e: React.MouseEvent) => {
    e.stopPropagation(); setEditingId(c.id); setEditTitle(c.title);
  };

  const saveEdit = async (id: string) => {
    await fetch(`${BASE}/charts/${id}/title`, {
      method: "PATCH", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title: editTitle }),
    });
    setCharts(prev => prev.map(c => c.id === id ? { ...c, title: editTitle } : c));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, title: editTitle } : prev);
    setEditingId(null);
  };

  /* ── Full chart view ── */
  if (selected) {
    let data: Plotly.Data[] = [];
    let layout: Partial<Plotly.Layout> = {};
    try {
      const p = typeof selected.chart_json === "string" ? JSON.parse(selected.chart_json as string) : selected.chart_json as any;
      data = p.data || [];
      layout = {
        ...(p.layout || {}),
        paper_bgcolor: "transparent",
        plot_bgcolor: "rgba(0,0,0,0.03)",
        font: { color: "var(--text)", family: "-apple-system,sans-serif" },
        margin: { t: 40, r: 20, b: 40, l: 50 },
      };
    } catch {}

    return (
      <div className="flex flex-col" style={{ minHeight: 240 }}>
        <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => setSelected(null)} style={{ color: "var(--text-dim)" }} className="hover:opacity-70"><ArrowLeft size={13} /></button>
          <span className="text-xs font-medium flex-1 truncate" style={{ color: "var(--text)" }}>{selected.title}</span>
        </div>
        <div className="p-1">
          <Plot data={data} layout={layout} config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%", minHeight: 200 }} />
        </div>
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div>
      {charts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-3">
          <BarChart2 size={20} style={{ color: "var(--text-dim)", opacity: 0.4 }} />
          <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>No saved charts yet</p>
          <p className="text-[9px]" style={{ color: "var(--text-dim)", opacity: 0.6 }}>Ask a question then click "Create chart"</p>
        </div>
      ) : (
        <div>
          {/* Clear all */}
          <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
              {charts.length} chart{charts.length > 1 ? "s" : ""}
            </span>
            <button onClick={clearAll} className="text-[9px] hover:text-red-400 transition-colors" style={{ color: "var(--text-dim)" }}>
              Clear all
            </button>
          </div>
          <div className="p-2 space-y-1.5">
            {charts.map(c => (
              <div key={c.id} onClick={() => setSelected(c)}
                className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-accent)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                <BarChart2 size={12} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  {editingId === c.id ? (
                    <div onClick={e => e.stopPropagation()} className="flex items-center gap-1">
                      <input autoFocus
                        className="flex-1 rounded px-1.5 py-0.5 text-[11px] outline-none min-w-0"
                        style={{ background: "var(--bg)", border: "1px solid var(--border-accent)", color: "var(--text)" }}
                        value={editTitle} onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(c.id); if (e.key === "Escape") setEditingId(null); }}
                      />
                      <button onClick={() => saveEdit(c.id)} className="text-green-400 hover:opacity-70 p-0.5"><Check size={11} /></button>
                      <button onClick={() => setEditingId(null)} style={{ color: "var(--text-dim)" }} className="p-0.5"><X size={11} /></button>
                    </div>
                  ) : (
                    /* Full title — no truncation in list */
                    <p className="text-[11px] font-medium leading-tight" style={{ color: "var(--text)" }}>{c.title}</p>
                  )}
                  <p className="text-[9px] mt-0.5" style={{ color: "var(--text-dim)" }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
                {editingId !== c.id && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={e => startEdit(c, e)} className="p-0.5 hover:opacity-70" style={{ color: "var(--text-dim)" }}><Edit2 size={10} /></button>
                    <button onClick={e => del(c.id, e)} className="p-0.5 hover:text-red-400" style={{ color: "var(--text-dim)" }}><Trash2 size={10} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
