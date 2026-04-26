"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";

interface Props {
  questions: string[];
  onSelect: (question: string) => void;
}

export default function FollowUpSuggestions({ questions, onSelect }: Props) {
  const [used, setUsed] = useState<string | null>(null);

  if (!questions.length) return null;

  const handleClick = (q: string) => {
    if (used) return;
    setUsed(q);
    onSelect(q);
  };

  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        animation: "followup-in 400ms cubic-bezier(0.23,1,0.32,1) both",
        animationDelay: "80ms",
      }}>
      <style>{`
        @keyframes followup-in {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .followup-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 11.5px;
          font-weight: 450;
          color: var(--text-muted);
          background: transparent;
          border: 1px solid var(--border);
          cursor: pointer;
          transition: color 130ms ease, border-color 130ms ease, background 130ms ease, transform 130ms ease;
          white-space: nowrap;
        }
        .followup-chip:hover:not(:disabled) {
          color: var(--text);
          border-color: var(--accent);
          background: var(--accent-dim);
          transform: translateY(-1px);
        }
        .followup-chip:active:not(:disabled) { transform: scale(0.97); }
        .followup-chip:disabled {
          opacity: 0.35;
          cursor: default;
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <Sparkles size={11} style={{ color: "var(--accent-light)", opacity: 0.7 }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Explore further
        </span>
      </div>

      {questions.map((q) => (
        <button
          key={q}
          className="followup-chip"
          disabled={used !== null}
          onClick={() => handleClick(q)}>
          {q}
        </button>
      ))}
    </div>
  );
}
