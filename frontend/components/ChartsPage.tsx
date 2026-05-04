"use client";
import { useState, useEffect } from "react";
import { BarChart2, Trash2, Edit2, Check, X, ArrowLeft, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { withAuthHeaders } from "@/lib/auth";
import { useIsMobile } from "@/hooks/useIsMobile";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface SavedChart { id: string; title: string; dataset_id: string; chart_json: unknown; created_at: string; }
interface Props { refreshTrigger?: number; }

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

export default function ChartsPage({ refreshTrigger = 0 }: Props) {
  const isMobile = useIsMobile();
  const [charts, setCharts]       = useState<SavedChart[]>([]);
  const [selected, setSelected]   = useState<SavedChart | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const load = () =>
    fetch(`${BASE}/charts/`, { headers: withAuthHeaders() })
      .then(r => r.json()).then(setCharts).catch(e => console.error("Failed to load charts:", e));

  useEffect(() => { load(); }, [refreshTrigger]);

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this chart?")) return;
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

  /* ── Full chart detail view ── */
  if (selected) {
    let data: Plotly.Data[] = [];
    let layout: Partial<Plotly.Layout> = {};
    try {
      const p = typeof selected.chart_json === "string"
        ? JSON.parse(selected.chart_json as string)
        : selected.chart_json as any;
      data = p.data || [];
      layout = {
        ...(p.layout || {}),
        paper_bgcolor: "transparent",
        plot_bgcolor: "rgba(0,0,0,0.03)",
        font: { color: "var(--text)", family: "-apple-system,sans-serif" },
        margin: { t: 50, r: 30, b: 50, l: 60 },
        autosize: true,
      };
    } catch {}

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>
        {/* Detail header */}
        <div style={{ padding: isMobile ? "12px 14px" : "16px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface2)", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setSelected(null)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface3)", cursor: "pointer", color: "var(--text-dim)" }}>
            <ArrowLeft size={14} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart2 size={15} style={{ color: "#fff" }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{selected.title}</h2>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-dim)" }}>
                {new Date(selected.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
        </div>
        {/* Chart area */}
        <div style={{ flex: 1, padding: isMobile ? "12px 14px" : "24px 28px", overflowY: "auto" }}>
          <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 16px", height: "100%", minHeight: 400 }}>
            <Plot data={data} layout={layout} config={{ displayModeBar: true, responsive: true }}
              style={{ width: "100%", height: "100%", minHeight: 380 }} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Gallery / list view ── */
  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ padding: isMobile ? "14px 16px 12px" : "20px 28px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px var(--accent-glow)", flexShrink: 0 }}>
              <BarChart2 size={17} style={{ color: "#fff" }} />
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.3px" }}>Charts</h1>
              {!isMobile && <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Saved visualizations from your analyses</p>}
            </div>
          </div>
          {charts.length > 0 && (
            <button onClick={clearAll}
              style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              Clear all
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: isMobile ? "14px" : "28px" }}>
        {charts.length === 0 ? (
          /* Empty state */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 14, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart2 size={26} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: "0 0 6px" }}>No charts saved yet</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Ask a question in Analysis, then click "Create chart" below the response</p>
            </div>
          </div>
        ) : (
          /* Chart grid */
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
            {charts.map(c => (
              <ChartCard
                key={c.id}
                chart={c}
                editingId={editingId}
                editTitle={editTitle}
                onOpen={() => setSelected(c)}
                onEdit={e => startEdit(c, e)}
                onDelete={e => del(c.id, e)}
                onSaveEdit={() => saveEdit(c.id)}
                onCancelEdit={() => setEditingId(null)}
                onTitleChange={setEditTitle}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartCard({ chart, editingId, editTitle, onOpen, onEdit, onDelete, onSaveEdit, onCancelEdit, onTitleChange }: {
  chart: SavedChart;
  editingId: string | null;
  editTitle: string;
  onOpen: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onTitleChange: (v: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const isEditing = editingId === chart.id;

  return (
    <div
      onClick={isEditing ? undefined : onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 14, border: `1px solid ${hover && !isEditing ? "var(--border-accent)" : "var(--border)"}`,
        background: "var(--surface2)", cursor: isEditing ? "default" : "pointer",
        overflow: "hidden", transition: "all 160ms ease",
        transform: hover && !isEditing ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hover && !isEditing ? "0 8px 24px var(--accent-glow)" : "none",
      }}>
      {/* Card accent bar */}
      <div style={{ height: 4, background: "linear-gradient(135deg,var(--accent),var(--accent2))", width: "100%" }} />

      <div style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <BarChart2 size={14} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isEditing ? (
              <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  autoFocus
                  value={editTitle}
                  onChange={e => onTitleChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") onCancelEdit(); }}
                  style={{ flex: 1, fontSize: 12, background: "var(--bg)", border: "1px solid var(--border-accent)", borderRadius: 6, padding: "4px 8px", color: "var(--text)", outline: "none", minWidth: 0 }}
                />
                <button onClick={e => { e.stopPropagation(); onSaveEdit(); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#22c55e", padding: 2 }}><Check size={12} /></button>
                <button onClick={e => { e.stopPropagation(); onCancelEdit(); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2 }}><X size={12} /></button>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chart.title}</p>
            )}
            <p style={{ margin: "3px 0 0", fontSize: 10, color: "var(--text-dim)" }}>
              {new Date(chart.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        {!isEditing && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--accent-light)" }}>View chart →</span>
            <div style={{ display: "flex", gap: 4, opacity: hover ? 1 : 0, transition: "opacity 120ms ease" }}>
              <button onClick={onEdit}
                style={{ padding: "4px 6px", borderRadius: 6, border: "none", background: "var(--surface3)", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}>
                <Edit2 size={11} />
              </button>
              <button onClick={onDelete}
                style={{ padding: "4px 6px", borderRadius: 6, border: "none", background: "var(--surface3)", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
