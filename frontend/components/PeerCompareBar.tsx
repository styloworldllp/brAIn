"use client";
import { useState } from "react";
import { Users, X, GitCompare } from "lucide-react";
import { Dataset } from "@/lib/api";

interface Props {
  peers: Dataset[];
  lastUserMessage: string;
  onCompare: (peer: Dataset, prompt: string) => void;
}

function buildComparisonPrompt(peer: Dataset, lastUserMessage: string): string {
  return `Now perform the same analysis ("${lastUserMessage}") using the "${peer.name}" dataset and compare the results side by side with the previous findings. Highlight key similarities, differences, and what the comparison reveals.`;
}

export default function PeerCompareBar({ peers, lastUserMessage, onCompare }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [activePeer, setActivePeer] = useState<string | null>(null);

  if (dismissed || peers.length === 0) return null;

  const handleCompare = (peer: Dataset) => {
    if (activePeer) return;
    setActivePeer(peer.id);
    onCompare(peer, buildComparisonPrompt(peer, lastUserMessage));
  };

  const sourceColor = (type: string) => {
    if (type === "mysql")    return "#fb923c";
    if (type === "postgres") return "#60a5fa";
    if (type === "sheets")   return "#4ade80";
    return "var(--accent-light)";
  };

  return (
    <div
      className="peer-compare-bar"
      style={{
        marginTop: 10,
        padding: "9px 12px",
        borderRadius: 12,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        animation: "peer-bar-in 360ms cubic-bezier(0.23,1,0.32,1) both",
      }}>

      <style>{`
        @keyframes peer-bar-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .peer-chip {
          display: flex; align-items: center; gap: 5px;
          padding: 3px 10px; border-radius: 7px;
          font-size: 11px; font-weight: 500;
          background: var(--accent-dim);
          border: 1px solid var(--border-accent);
          color: var(--accent-light);
          cursor: pointer;
          transition: background 130ms ease, color 130ms ease, border-color 130ms ease, transform 130ms ease, box-shadow 130ms ease;
        }
        .peer-chip:hover:not(:disabled) {
          background: var(--accent);
          color: #fff;
          border-color: var(--accent);
          transform: translateY(-1px);
          box-shadow: 0 3px 10px var(--accent-glow);
        }
        .peer-chip:active:not(:disabled) { transform: scale(0.96); }
        .peer-chip:disabled { opacity: 0.45; cursor: default; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
        <GitCompare size={13} style={{ color: "var(--accent-light)", opacity: 0.8 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.01em" }}>
          Compare with
        </span>
      </div>

      <div style={{ display: "flex", gap: 5, flex: 1, flexWrap: "wrap", alignItems: "center" }}>
        {peers.map(peer => (
          <button
            key={peer.id}
            className="peer-chip"
            disabled={activePeer !== null}
            onClick={() => handleCompare(peer)}
            title={`${peer.source_type} · ${peer.row_count?.toLocaleString() ?? "live"} rows`}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: sourceColor(peer.source_type),
              flexShrink: 0, display: "inline-block",
            }} />
            {peer.name}
          </button>
        ))}
      </div>

      {activePeer === null && (
        <button
          onClick={() => setDismissed(true)}
          title="Dismiss"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-dim)", padding: 2, flexShrink: 0,
            opacity: 0.5, transition: "opacity 120ms ease",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}>
          <X size={11} />
        </button>
      )}
    </div>
  );
}
