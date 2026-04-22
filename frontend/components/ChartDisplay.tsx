"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// ── World-class color palettes ─────────────────────────────────
const PALETTE_VIBRANT = [
  "#2bc4a0",
  "#34d399",
  "#fb923c",
  "#f472b6",
  "#60a5fa",
  "#fbbf24",
  "#33d9ab",
  "#2dd4bf", // teal
  "#f87171", // red
  "#4ade80", // green
];

const PALETTE_GRADIENT_FROM = "#00c896";
const PALETTE_GRADIENT_TO   = "#06b6d4";

// ── Apply world-class theming to any chart ─────────────────────
function applyTheme(data: Plotly.Data[], layoutIn: Partial<Plotly.Layout>): {
  data: Plotly.Data[];
  layout: Partial<Plotly.Layout>;
} {
  const isDark  = !document.documentElement.classList.contains("light");
  const textCol = isDark ? "#eceef8" : "#0e1024";
  const mutedCol = isDark ? "#9ba3c8" : "#3d4268";
  const gridCol  = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
  const zeroCol  = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)";
  const bgCol    = isDark ? "rgba(23,25,41,0)" : "rgba(255,255,255,0)";
  const plotBg   = isDark ? "rgba(23,25,41,0.5)" : "rgba(255,255,255,0.6)";

  // Restyle each trace
  const themedData = data.map((trace: any, i: number) => {
    const color = PALETTE_VIBRANT[i % PALETTE_VIBRANT.length];
    const t = { ...trace };

    if (t.type === "bar") {
      // If single colour, apply gradient effect via array
      if (!t.marker?.color || typeof t.marker.color === "string") {
        t.marker = {
          ...t.marker,
          color: color,
          opacity: 0.92,
          line: { color: "rgba(0,0,0,0)", width: 0 },
        };
      }
    } else if (t.type === "scatter" || t.type === "scattergl") {
      t.line = { ...t.line, width: 2.5, color: color };
      t.marker = { ...t.marker, size: 6, color: color };
    } else if (t.type === "pie") {
      t.marker = {
        ...t.marker,
        colors: PALETTE_VIBRANT,
        line: { color: isDark ? "#171929" : "#ffffff", width: 2 },
      };
      t.textfont = { ...t.textfont, color: textCol };
      t.outsidetextfont = { color: textCol, size: 12 };
    } else if (t.type === "heatmap") {
      t.colorscale = [[0, "#1e1b4b"], [0.5, "#00c896"], [1, "#34d399"]];
    } else if (t.type === "histogram") {
      t.marker = { ...t.marker, color: color, opacity: 0.88, line: { color: "rgba(0,0,0,0)" } };
    }

    return t;
  });

  const layout: Partial<Plotly.Layout> = {
    ...layoutIn,
    paper_bgcolor: bgCol,
    plot_bgcolor:  plotBg,
    font: {
      family: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
      color:  textCol,
      size:   13,
    },
    title: layoutIn.title ? {
      ...(typeof layoutIn.title === "string" ? { text: layoutIn.title } : layoutIn.title as object),
      font: { size: 15, color: textCol, family: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" },
      x: 0.02,
      xanchor: "left",
    } : undefined,
    margin: { t: layoutIn.title ? 48 : 28, r: 20, b: 48, l: 56, pad: 4 },
    xaxis: {
      ...(layoutIn.xaxis || {}),
      gridcolor:     gridCol,
      zerolinecolor: zeroCol,
      zerolinewidth: 1,
      linecolor:     gridCol,
      tickfont:      { color: mutedCol, size: 11 },
      title: { font: { color: mutedCol, size: 12 } } as any,
    },
    yaxis: {
      ...(layoutIn.yaxis || {}),
      gridcolor:     gridCol,
      zerolinecolor: zeroCol,
      zerolinewidth: 1,
      linecolor:     gridCol,
      tickfont:      { color: mutedCol, size: 11 },
      title: { font: { color: mutedCol, size: 12 } } as any,
    },
    legend: {
      bgcolor:     "rgba(0,0,0,0)",
      borderwidth: 0,
      font:        { color: mutedCol, size: 11 },
    },
    hoverlabel: {
      bgcolor:     isDark ? "#1e2138" : "#ffffff",
      bordercolor: isDark ? "#272a3f" : "#d4d7ea",
      font:        { color: textCol, size: 12, family: "-apple-system, sans-serif" },
    },
    colorway: PALETTE_VIBRANT,
    showlegend: layoutIn.showlegend !== false && themedData.length > 1,
  };

  return { data: themedData, layout };
}

// ── Main component ─────────────────────────────────────────────
export default function ChartDisplay({ chartJson }: { chartJson: unknown }) {
  const [ready, setReady] = useState(false);
  const [hovering, setHovering] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setReady(true); }, []);

  const handleDownload = async () => {
    const el = ref.current?.querySelector(".js-plotly-plot") as HTMLElement | null;
    if (!el) return;
    try {
      // @ts-ignore
      const Plotly = window.Plotly || (await import("plotly.js/dist/plotly.min.js" as any));
      await Plotly.downloadImage(el, { format: "png", filename: "brAIn-chart" } as any);
    } catch {
      const btn = ref.current?.querySelector("[data-title='Download plot as a png']") as HTMLElement | null;
      btn?.click();
    }
  };

  if (!chartJson || !ready) return null;

  let rawData: Plotly.Data[] = [];
  let rawLayout: Partial<Plotly.Layout> = {};

  try {
    const parsed = typeof chartJson === "string" ? JSON.parse(chartJson as string) : chartJson as any;
    rawData   = parsed.data   || [];
    rawLayout = parsed.layout || {};
  } catch {
    return <p style={{ color: "var(--red)", fontSize: 13 }}>Failed to render chart.</p>;
  }

  const { data, layout } = applyTheme(rawData, rawLayout);

  return (
    <div ref={ref}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)", padding: "4px 0 0" }}>
      {/* Download button */}
      <button
        onClick={handleDownload}
        title="Download chart as PNG"
        style={{
          position: "absolute", top: 8, right: 8, zIndex: 10,
          display: "flex", alignItems: "center", gap: 5,
          padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
          background: "var(--surface2)", border: "1px solid var(--border)",
          color: "var(--text-muted)", cursor: "pointer",
          opacity: hovering ? 1 : 0,
          transition: "opacity 150ms ease, background 120ms ease",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.color = "var(--text)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.color = "var(--text-muted)"; }}
      >
        <Download size={11} /> PNG
      </button>
      <Plot
        data={data}
        layout={layout}
        config={{
          displayModeBar:  "hover",
          displaylogo:     false,
          modeBarButtonsToRemove: [
            "select2d", "lasso2d", "autoScale2d", "hoverCompareCartesian",
            "hoverClosestCartesian", "toggleSpikelines",
          ],
          responsive: true,
          toImageButtonOptions: {
            format: "png", filename: "brAIn-chart", scale: 2,
          },
        }}
        style={{ width: "100%", minHeight: 360 }}
        useResizeHandler
      />
    </div>
  );
}
