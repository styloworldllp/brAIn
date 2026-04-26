"use client";
import { useState } from "react";
import { Calendar, Mail, X, CheckCircle2, ChevronDown } from "lucide-react";
import { AISpinner } from "./AISpinner";
import { Dataset } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";

export interface MessageActionsProps {
  dataset: Dataset;
  conversationId: string;
  messageContent: string;
  charts: unknown[];
  onChartSaved: () => void;
  // controlled — pass from parent so panels render outside the button row
  open: Panel;
  onToggle: (p: Panel) => void;
}

export type Panel = null | "schedule" | "email";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

/* ── Shared input style ──────────────────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--border2)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  color: "var(--text)",
  outline: "none",
  transition: "border-color 140ms ease",
  boxSizing: "border-box",
};

/* ── Shared panel wrapper ────────────────────────────────────────────────── */
export function ActionPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 8,
      background: "var(--surface2)",
      border: "1px solid var(--border2)",
      borderRadius: 14,
      padding: "14px 14px 12px",
      position: "relative",
      animation: "panel-drop 220ms cubic-bezier(0.23,1,0.32,1) both",
    }}>
      <style>{`@keyframes panel-drop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{title}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, lineHeight: 1 }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--text-muted)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--text-dim)"}>
          <X size={13} />
        </button>
      </div>
      {children}
    </div>
  );
}

/* ── Primary submit button ───────────────────────────────────────────────── */
function SubmitBtn({ onClick, disabled, loading, done, icon, label, doneLabel, color }: {
  onClick: () => void; disabled: boolean; loading: boolean; done: boolean;
  icon: React.ReactNode; label: string; doneLabel: string; color: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        gap: 6, padding: "8px 12px", borderRadius: 9, fontSize: 12, fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        background: done ? "var(--accent-dim)" : color,
        color: done ? "var(--accent-light)" : "#fff",
        border: done ? "1px solid var(--border-accent)" : "none",
        opacity: disabled && !loading ? 0.45 : 1,
        transition: "opacity 150ms ease, background 150ms ease",
        marginTop: 10,
      }}>
      {loading ? <AISpinner size={12} /> : done ? <CheckCircle2 size={12} /> : icon}
      {done ? doneLabel : loading ? "Saving…" : label}
    </button>
  );
}

/* ── Trigger buttons only (no panels) ───────────────────────────────────── */
export default function MessageActions({ open, onToggle }: Pick<MessageActionsProps, "open" | "onToggle">) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <TriggerBtn
        icon={<Calendar size={11} />}
        label="Schedule"
        active={open === "schedule"}
        onClick={() => onToggle(open === "schedule" ? null : "schedule")}
      />
      <TriggerBtn
        icon={<Mail size={11} />}
        label="Email results"
        active={open === "email"}
        onClick={() => onToggle(open === "email" ? null : "email")}
      />
    </div>
  );
}

function TriggerBtn({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 10px", borderRadius: 8,
        fontSize: 11, fontWeight: 500,
        cursor: "pointer",
        background: active ? "var(--accent-dim)" : "transparent",
        border: `1px solid ${active ? "var(--border-accent)" : "var(--border2)"}`,
        color: active ? "var(--accent-light)" : "var(--text-muted)",
        transition: "all 130ms ease",
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.borderColor = "var(--border-accent)";
          e.currentTarget.style.color = "var(--text)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.borderColor = "var(--border2)";
          e.currentTarget.style.color = "var(--text-muted)";
        }
      }}>
      {icon}
      {label}
      <ChevronDown size={9} style={{ transform: active ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 130ms ease" }} />
    </button>
  );
}

/* ── Schedule Panel ──────────────────────────────────────────────────────── */
export function SchedulePanel({ dataset, conversationId, question, onClose }: {
  dataset: Dataset; conversationId: string; question: string; onClose: () => void;
}) {
  const [title, setTitle]   = useState(`${dataset.name} report`);
  const [cron, setCron]     = useState("daily");
  const [email, setEmail]   = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const handleSave = async () => {
    if (!email) return;
    setSaving(true);
    await fetch(`${BASE}/schedules/`, {
      method: "POST",
      headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title, dataset_id: dataset.id, conversation_id: conversationId, question, cron, email }),
    });
    setSaving(false); setSaved(true);
    setTimeout(onClose, 1000);
  };

  return (
    <ActionPanel title="Schedule this analysis" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <input
          style={inputStyle} placeholder="Report title"
          value={title} onChange={e => setTitle(e.target.value)}
          onFocus={e => e.target.style.borderColor = "var(--accent)"}
          onBlur={e => e.target.style.borderColor = "var(--border2)"}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          <select
            style={{ ...inputStyle, cursor: "pointer", appearance: "none", WebkitAppearance: "none" }}
            value={cron} onChange={e => setCron(e.target.value)}
            onFocus={e => e.target.style.borderColor = "var(--accent)"}
            onBlur={e => e.target.style.borderColor = "var(--border2)"}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input
            style={inputStyle} type="email" placeholder="Email address"
            value={email} onChange={e => setEmail(e.target.value)}
            onFocus={e => e.target.style.borderColor = "var(--accent)"}
            onBlur={e => e.target.style.borderColor = "var(--border2)"}
          />
        </div>
        <div style={{
          fontSize: 11, color: "var(--text-dim)",
          background: "var(--bg)", borderRadius: 7,
          padding: "7px 10px", border: "1px solid var(--border)",
          lineHeight: 1.5,
        }}>
          Will re-run: <em style={{ color: "var(--text-muted)" }}>{question.slice(0, 70)}{question.length > 70 ? "…" : ""}</em>
        </div>
      </div>
      <SubmitBtn
        onClick={handleSave} disabled={!email || saving || saved}
        loading={saving} done={saved}
        icon={<Calendar size={12} />}
        label="Create schedule" doneLabel="Scheduled!"
        color="var(--accent2)"
      />
    </ActionPanel>
  );
}

/* ── Email Panel ─────────────────────────────────────────────────────────── */
export function EmailPanel({ content, dataset, onClose }: { content: string; dataset: Dataset; onClose: () => void }) {
  const [to, setTo]           = useState("");
  const [subject, setSubject] = useState(`brAIn Report — ${dataset.name}`);
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; message: string } | null>(null);

  const handleSend = async () => {
    setSending(true);
    const res = await fetch(`${BASE}/schedules/send-email`, {
      method: "POST",
      headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ to_email: to, subject, body: content, dataset_name: dataset.name }),
    }).then(r => r.json());
    setResult(res);
    setSending(false);
  };

  return (
    <ActionPanel title="Email these results" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <input
          style={inputStyle} type="email" placeholder="Recipient email"
          value={to} onChange={e => setTo(e.target.value)}
          onFocus={e => e.target.style.borderColor = "var(--accent)"}
          onBlur={e => e.target.style.borderColor = "var(--border2)"}
        />
        <input
          style={inputStyle} placeholder="Subject"
          value={subject} onChange={e => setSubject(e.target.value)}
          onFocus={e => e.target.style.borderColor = "var(--accent)"}
          onBlur={e => e.target.style.borderColor = "var(--border2)"}
        />
      </div>

      {result && (
        <div style={{
          marginTop: 8, padding: "8px 10px", borderRadius: 8, fontSize: 11,
          border: `1px solid ${result.ok ? "rgba(52,211,153,0.25)" : "rgba(251,191,36,0.25)"}`,
          background: result.ok ? "rgba(52,211,153,0.07)" : "rgba(251,191,36,0.07)",
          color: result.ok ? "#34d399" : "#fbbf24",
          lineHeight: 1.5,
        }}>
          {result.message}
        </div>
      )}

      <SubmitBtn
        onClick={handleSend} disabled={!to || sending}
        loading={sending} done={!!result?.ok}
        icon={<Mail size={12} />}
        label="Send email" doneLabel="Sent!"
        color="#0d9488"
      />
    </ActionPanel>
  );
}
