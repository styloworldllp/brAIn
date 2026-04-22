"use client";
import { useState } from "react";
import { X, BarChart2, Sparkles, TrendingUp, PieChart, ScatterChart, Activity } from "lucide-react";
import { AISpinner } from "./AISpinner";
import ChartDisplay from "./ChartDisplay";
import { Dataset } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";

const BASE = "http://localhost:8000/api";

interface Props {
  dataset: Dataset;
  conversationId: string;
  onClose: () => void;
  onSave: (chartJson: unknown, title: string) => void;
}

const QUICK_PROMPTS = [
  { icon: <BarChart2 size={13} />,    label: "Bar chart of top values",   prompt: "Create a bar chart showing the top 10 values for the most important numeric column" },
  { icon: <TrendingUp size={13} />,   label: "Line trend over time",      prompt: "Create a line chart showing trends over time using any date column" },
  { icon: <PieChart size={13} />,     label: "Pie chart by category",     prompt: "Create a pie chart showing distribution by the main categorical column" },
  { icon: <ScatterChart size={13} />, label: "Scatter correlation",       prompt: "Create a scatter plot showing correlation between the two most important numeric columns" },
  { icon: <Activity size={13} />,     label: "Distribution histogram",    prompt: "Create a histogram showing the distribution of the main numeric column" },
];

export default function GeneratePlotModal({ dataset, conversationId, onClose, onSave }: Props) {
  const [prompt, setPrompt]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [charts, setCharts]     = useState<unknown[]>([]);
  const [error, setError]       = useState("");
  const [title, setTitle]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const generate = async (p?: string) => {
    const q = p || prompt;
    if (!q.trim()) return;
    setLoading(true); setCharts([]); setError("");

    try {
      const collected: unknown[] = [];
      const response = await fetch(`${BASE}/chat/stream`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ conversation_id: conversationId, message: q }),
      });

      const reader  = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === "chart") collected.push(ev.chart_json);
              if (ev.type === "done")  setCharts([...collected]);
            } catch {}
          }
        }
      }

      if (collected.length === 0) {
        setError("No chart was generated. Try a more specific prompt like 'bar chart of top 5 customers by revenue'.");
      } else {
        setTitle(`Chart — ${dataset.name}`);
      }
    } catch {
      setError("Failed to generate chart. Make sure the backend is running.");
    } finally {
      setLoading(false); }
  };

  const handleSave = async () => {
    if (charts.length === 0) return;
    setSaving(true);
    for (const chart of charts) {
      await fetch(`${BASE}/charts/`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title, dataset_id: dataset.id, conversation_id: conversationId, chart_json: chart }),
      });
      onSave(chart, title);
    }
    setSaving(false); setSaved(true);
    setTimeout(onClose, 800);
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel bg-[#12141f] border border-[#1e2235] rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#1e2235]">
          <div className="flex items-center gap-2">
            <BarChart2 size={16} className="text-[#33d9ab]" />
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Generate a plot</h2>
          </div>
          <button onClick={onClose} className="text-[#3e4357] hover:text-[#8b90a8]"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Dataset info */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#00c896]/10 border border-[#00c896]/20">
            <BarChart2 size={12} className="text-[#33d9ab]" />
            <p className="text-xs text-[#00c896]">
              Dataset: <strong>{dataset.name}</strong> — {dataset.row_count?.toLocaleString()} rows
            </p>
          </div>

          {/* Quick prompts */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3e4357] mb-2">Quick charts</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((qp, i) => (
                <button key={i} onClick={() => { setPrompt(qp.prompt); generate(qp.prompt); }}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e2235] text-xs text-[#8b90a8] hover:border-[#00c896]/40 hover:text-[#00c896] transition-colors disabled:opacity-40">
                  {qp.icon}{qp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom prompt */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3e4357] mb-2">Or describe your chart</p>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] placeholder-[#3e4357] focus:outline-none focus:border-[#00c896]/60 transition-colors"
                placeholder="e.g. bar chart of revenue by region, sorted descending"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === "Enter" && generate()}
                disabled={loading}
              />
              <button onClick={() => generate()} disabled={loading || !prompt.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00a876] hover:bg-[#00c896] text-white text-sm font-medium disabled:opacity-40 transition-colors shrink-0">
                {loading ? <AISpinner size={14} /> : <Sparkles size={14} />}
                {loading ? "brAIn is working…" : "Generate"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
          )}

          {/* Loading state — AI orb with radiance */}
          {loading && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="ai-orb relative flex items-center justify-center"
                style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#00c896,#059669)" }}>
                <div className="think-dots">
                  <span className="think-dot" style={{ background: "rgba(255,255,255,0.9)" }} />
                  <span className="think-dot" style={{ background: "rgba(255,255,255,0.9)" }} />
                  <span className="think-dot" style={{ background: "rgba(255,255,255,0.9)" }} />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>brAIn is building your chart</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Analysing data and generating the visualisation…</p>
              </div>
            </div>
          )}

          {/* Generated charts */}
          {!loading && charts.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3e4357]">
                {charts.length} chart{charts.length > 1 ? "s" : ""} generated
              </p>
              {charts.map((chart, i) => <ChartDisplay key={i} chartJson={chart} />)}

              {/* Save */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  className="flex-1 bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] placeholder-[#3e4357] focus:outline-none focus:border-[#00c896]/60 transition-colors"
                  placeholder="Chart title…"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
                <button onClick={handleSave} disabled={saving || saved || !title}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00a876] hover:bg-[#00c896] text-white text-sm font-medium disabled:opacity-40 transition-colors shrink-0">
                  {saving ? <AISpinner size={13} /> : null}
                  {saved ? "Saved ✓" : saving ? "Saving…" : "Save to Charts"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
