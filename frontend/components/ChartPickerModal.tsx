"use client";
import { useState } from "react";
import { X, BarChart2, TrendingUp, PieChart, Activity, ScatterChart, AreaChart, Check, Sparkles } from "lucide-react";
import { AISpinner } from "./AISpinner";
import ChartDisplay from "./ChartDisplay";
import { Dataset } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

interface Props {
  dataset: Dataset;
  conversationId: string;
  analysisContext: string;
  onClose: () => void;
  onSaved: () => void;
}

const CHART_TYPES = [
  { id: "recommend", label: "✦ Recommend for me", icon: <Sparkles size={16} />, color: "var(--accent-light)", border: "rgba(167,139,250,0.5)", bg: "var(--accent-dim)", desc: "AI picks the best chart for this data", special: true },
  { id: "bar",       label: "Bar chart",         icon: <BarChart2 size={16} />,    color: "var(--accent)", border: "rgba(129,140,248,0.4)", bg: "rgba(99,102,241,0.08)",  desc: "Compare values across categories" },
  { id: "line",      label: "Line chart",        icon: <TrendingUp size={16} />,   color: "#60a5fa", border: "rgba(96,165,250,0.4)",  bg: "rgba(59,130,246,0.08)",  desc: "Show trends over time" },
  { id: "pie",       label: "Pie chart",         icon: <PieChart size={16} />,     color: "var(--green)", border: "rgba(52,211,153,0.4)",  bg: "rgba(16,185,129,0.08)",  desc: "Show proportions and shares" },
  { id: "scatter",   label: "Scatter plot",      icon: <ScatterChart size={16} />, color: "#fb923c", border: "rgba(251,146,60,0.4)",  bg: "rgba(249,115,22,0.08)",  desc: "Find correlations" },
  { id: "histogram", label: "Histogram",         icon: <Activity size={16} />,     color: "#f472b6", border: "rgba(244,114,182,0.4)", bg: "rgba(236,72,153,0.08)",  desc: "Show value distribution" },
  { id: "area",      label: "Area chart",        icon: <AreaChart size={16} />,    color: "#2dd4bf", border: "rgba(45,212,191,0.4)",  bg: "rgba(20,184,166,0.08)",  desc: "Cumulative values over time" },
];

const STYLE = `
Style rules (apply to every chart):
- Clean white/transparent background: fig.update_layout(paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0.02)')
- Remove gridlines or make them very subtle: fig.update_layout(xaxis=dict(showgrid=True, gridcolor='rgba(0,0,0,0.06)'), yaxis=dict(showgrid=True, gridcolor='rgba(0,0,0,0.06)'))
- Font: fig.update_layout(font=dict(family='-apple-system, sans-serif', size=12))
- No legend if only one series
- Tight margins: fig.update_layout(margin=dict(t=50,r=20,b=50,l=60))
- Meaningful title (emoji optional, concise)
- Use color_discrete_sequence=px.colors.qualitative.Bold or ['var(--accent)','#34d399','#fb923c','#f472b6','#60a5fa']
- Call fig.show() at the end
`;

const CHART_PROMPTS: Record<string, (ctx: string) => string> = {
  recommend: (ctx) => `You are a data visualisation expert. Based on this analysis:
"${ctx.slice(0, 400)}"

1. Choose the SINGLE best chart type for this data (bar, line, pie, scatter, histogram, area)
2. State your choice in one sentence
3. Write Python using plotly express to create it
4. ${STYLE}
Call fig.show().`,
  bar:       (ctx) => `Based on this analysis: "${ctx.slice(0,300)}"
Create a polished horizontal or vertical bar chart with plotly express (px.bar).
Sort bars by value. Add data labels if fewer than 15 bars.
${STYLE}`,
  line:      (ctx) => `Based on this analysis: "${ctx.slice(0,300)}"
Create a smooth line chart with plotly express (px.line). Add markers=True.
${STYLE}`,
  pie:       (ctx) => `Based on this analysis: "${ctx.slice(0,300)}"
Create a clean pie/donut chart with plotly express (px.pie).
Use hole=0.35 for donut style. Show percentage labels outside.
${STYLE}`,
  scatter:   (ctx) => `Based on this analysis: "${ctx.slice(0,300)}"
Create a scatter plot with plotly express (px.scatter).
Add trendline='ols' if it makes sense.
${STYLE}`,
  histogram: (ctx) => `Based on this analysis: "${ctx.slice(0,300)}"
Create a histogram with plotly express (px.histogram). Use nbins=20.
${STYLE}`,
  area:      (ctx) => `Based on this analysis: "${ctx.slice(0,300)}"
Create a filled area chart with plotly express (px.area).
${STYLE}`,
};

type Phase = "pick" | "generating" | "done" | "error";

export default function ChartPickerModal({ dataset, conversationId, analysisContext, onClose, onSaved }: Props) {
  const [phase, setPhase]       = useState<Phase>("pick");
  const [selected, setSelected] = useState<string | null>(null);
  const [charts, setCharts]     = useState<unknown[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [title, setTitle]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [recommendedType, setRecommendedType] = useState<string | null>(null);

  const generate = async (typeId: string) => {
    setSelected(typeId);
    setPhase("generating");
    setCharts([]);
    setErrorMsg("");
    const ct = CHART_TYPES.find(c => c.id === typeId);
    setTitle(`${ct?.label === "✦ Recommend for me" ? "AI recommended" : ct?.label} — ${dataset.name}`);

    try {
      const collected: unknown[] = [];
      const res = await fetch(`${BASE}/chat/stream`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ conversation_id: conversationId, message: CHART_PROMPTS[typeId](analysisContext) }),
      });
      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "chart") collected.push(ev.chart_json);
            if (ev.type === "text" && typeId === "recommend" && ev.content) {
              // Try to detect what chart type was chosen
              const lower = (ev.content as string).toLowerCase();
              if (lower.includes("bar")) setRecommendedType("bar chart");
              else if (lower.includes("line")) setRecommendedType("line chart");
              else if (lower.includes("pie")) setRecommendedType("pie chart");
              else if (lower.includes("scatter")) setRecommendedType("scatter plot");
              else if (lower.includes("histogram")) setRecommendedType("histogram");
              else if (lower.includes("area")) setRecommendedType("area chart");
            }
          } catch {}
        }
      }

      if (collected.length === 0) {
        setErrorMsg("No chart was generated. Try a different type.");
        setPhase("error");
      } else {
        setCharts(collected);
        setPhase("done");
      }
    } catch {
      setErrorMsg("Failed to generate chart. Please try again.");
      setPhase("error");
    }
  };

  const handleSave = async () => {
    if (!charts.length) return;
    setSaving(true);
    for (const chart of charts) {
      await fetch(`${BASE}/charts/`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title, dataset_id: dataset.id, conversation_id: conversationId, chart_json: chart }),
      });
    }
    setSaving(false); setSaved(true);
    setTimeout(() => { onSaved(); onClose(); }, 700);
  };

  const selectedType = CHART_TYPES.find(c => c.id === selected);

  return (
    <div className="modal-backdrop" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 16, width: "100%", maxWidth: 672, display: "flex", flexDirection: "column", maxHeight: "88vh", boxShadow: "0 25px 50px rgba(0,0,0,0.35)" }}>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <BarChart2 size={16} style={{ color: "var(--accent-light)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Create a chart</h2>
            {phase === "done" && recommendedType && selected === "recommend" && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: "rgba(167,139,250,0.15)", color: "var(--accent-light)" }}>
                AI chose: {recommendedType}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ color: "var(--text-dim)" }} className="hover:opacity-70"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Chart type grid — always visible */}
          {(phase === "pick" || phase === "error") && (
            <>
              {/* Recommend card — prominent */}
              <button onClick={() => generate("recommend")}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 16,
                  padding: "14px 16px", borderRadius: 14, textAlign: "left",
                  background: "var(--surface)", border: "1.5px solid var(--border-accent)",
                  cursor: "pointer", transition: "border-color 140ms ease, box-shadow 140ms ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 20px var(--accent-glow)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--border-accent)"; }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--accent-dim)", border: "1px solid var(--border-accent)",
                }}>
                  <Sparkles size={18} style={{ color: "var(--accent)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Recommend for me</span>
                    <span style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 600,
                      background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--border-accent)",
                    }}>AI</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                    brAIn picks the most insightful chart type for your data automatically
                  </p>
                </div>
                <span style={{ color: "var(--accent)", fontSize: 18, flexShrink: 0 }}>→</span>
              </button>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-dim)", textTransform: "uppercase" }}>or choose manually</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>

              {/* Manual chart types */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {CHART_TYPES.filter(c => !c.special).map(ct => (
                  <button key={ct.id} onClick={() => generate(ct.id)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      gap: 7, padding: "14px 10px", borderRadius: 12, textAlign: "center",
                      background: "var(--surface)", border: `1.5px solid var(--border)`,
                      cursor: "pointer", transition: "border-color 130ms ease, background 130ms ease, transform 130ms ease",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = ct.border;
                      e.currentTarget.style.background = ct.bg;
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.background = "var(--surface)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}>
                    <span style={{ color: ct.color }}>{ct.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{ct.label}</span>
                    <span style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.4 }}>{ct.desc}</span>
                  </button>
                ))}
              </div>

              {phase === "error" && (
                <div style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                  {errorMsg}
                </div>
              )}
            </>
          )}

          {/* Generating */}
          {phase === "generating" && (
            <div className="flex flex-col items-center gap-5 py-12">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: selected === "recommend" ? "var(--accent-dim)" : `${selectedType?.bg}`, border: `2px solid ${selected === "recommend" ? "var(--border-accent)" : selectedType?.border}` }}>
                {selected === "recommend"
                  ? <Sparkles size={24} className="animate-pulse" style={{ color: "var(--accent-light)" }} />
                  : <span style={{ color: selectedType?.color }}>{selectedType?.icon}</span>}
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {selected === "recommend" ? "brAIn is analysing your data…" : `Building ${selectedType?.label}…`}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {selected === "recommend" ? "Choosing the best chart type for maximum insight" : "brAIn is building your visualisation…"}
                </p>
              </div>
              <AISpinner size={20} />
            </div>
          )}

          {/* Done — show chart */}
          {phase === "done" && charts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium flex items-center gap-1.5"
                  style={{ color: "#22c55e" }}>
                  <Check size={13} /> Chart generated
                </span>
                <button onClick={() => { setPhase("pick"); setCharts([]); setSelected(null); setRecommendedType(null); }}
                  className="text-[11px] hover:opacity-70 transition-opacity underline"
                  style={{ color: "var(--text-dim)" }}>
                  Try different type
                </button>
              </div>

              {charts.map((chart, i) => <ChartDisplay key={i} chartJson={chart} />)}

              {/* Save */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  className="flex-1 text-sm outline-none rounded-xl px-3 py-2"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
                  placeholder="Chart title…"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
                <button onClick={handleSave} disabled={saving || saved || !title}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90 transition-all shrink-0"
                  style={{ background: "linear-gradient(135deg,var(--accent),var(--accent2))" }}>
                  {saving ? <AISpinner size={13} /> : saved ? <Check size={13} /> : <BarChart2 size={13} />}
                  {saved ? "Saved!" : saving ? "Saving…" : "Save to Charts"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
