"use client";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export default function ChartDisplay({ chartJson }: { chartJson: unknown }) {
  if (!chartJson) return null;

  let data: Plotly.Data[] = [];
  let layout: Partial<Plotly.Layout> = {};

  try {
    const parsed = typeof chartJson === "string" ? JSON.parse(chartJson) : chartJson;
    data = parsed.data || [];
    layout = {
      ...(parsed.layout || {}),
      paper_bgcolor: "transparent",
      plot_bgcolor: "rgba(255,255,255,0.03)",
      font: { color: "#e8eaf0", family: "-apple-system, BlinkMacSystemFont, sans-serif" },
      margin: { t: 40, r: 20, b: 40, l: 50 },
      xaxis: { ...(parsed.layout?.xaxis || {}), gridcolor: "#2e3347", zerolinecolor: "#2e3347" },
      yaxis: { ...(parsed.layout?.yaxis || {}), gridcolor: "#2e3347", zerolinecolor: "#2e3347" },
    };
  } catch {
    return <p className="text-red-400 text-sm">Failed to render chart.</p>;
  }

  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-[#2e3347] bg-[#1a1d27]">
      <Plot
        data={data}
        layout={layout}
        config={{ displayModeBar: true, responsive: true, displaylogo: false }}
        style={{ width: "100%", minHeight: 350 }}
      />
    </div>
  );
}
