"use client";
import { BarChart2, Calendar, Plus, FileText, Plug, Database } from "lucide-react";

interface Props {
  activeView: string;
  onViewChange: (v: string) => void;
  onNewAnalysis: () => void;
  isAdmin?: boolean;
}

const LEFT_TABS = [
  { id: "charts",    Icon: BarChart2, label: "Charts"    },
  { id: "schedules", Icon: Calendar,  label: "Schedules" },
];

export default function BottomNav({ activeView, onViewChange, onNewAnalysis, isAdmin }: Props) {
  const RIGHT_TABS = [
    { id: "files",                            Icon: FileText, label: "Files"       },
    isAdmin
      ? { id: "connectors", Icon: Plug,      label: "Connectors" }
      : { id: "databases",  Icon: Database,  label: "Databases"  },
  ];
  const Tab = ({ id, Icon, label }: { id: string; Icon: React.ElementType; label: string }) => {
    const active = activeView === id;
    return (
      <button key={id} onClick={() => onViewChange(id)}
        style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 3, padding: "10px 4px 8px",
          background: "none", border: "none", outline: "none",
          cursor: "pointer", position: "relative",
          color: active ? "var(--accent-light)" : "var(--text-dim)",
          transition: "color 150ms ease",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}>
        {active && (
          <span style={{
            position: "absolute", top: 0, left: "22%", right: "22%",
            height: 2, borderRadius: "0 0 3px 3px",
            background: "var(--accent)",
          }} />
        )}
        <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
        <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, letterSpacing: "0.01em", lineHeight: 1 }}>
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav style={{
      display: "flex",
      alignItems: "stretch",
      flexShrink: 0,
      background: "var(--surface2)",
      borderTop: "1px solid var(--border)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {LEFT_TABS.map(t => <Tab key={t.id} {...t} />)}

      {/* Centre "+" button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 6px" }}>
        <button
          onClick={onNewAnalysis}
          title="New Analysis"
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--accent), var(--accent2))",
            border: "none", outline: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px var(--accent-glow)",
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
            transition: "transform 120ms ease, box-shadow 120ms ease",
            flexShrink: 0,
          }}
          onTouchStart={e => { e.currentTarget.style.transform = "scale(0.92)"; e.currentTarget.style.boxShadow = "0 2px 8px var(--accent-glow)"; }}
          onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 14px var(--accent-glow)"; }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.07)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
          <Plus size={22} strokeWidth={2.5} style={{ color: "#fff" }} />
        </button>
      </div>

      {RIGHT_TABS.map(t => <Tab key={t.id} {...t} />)}
    </nav>
  );
}
