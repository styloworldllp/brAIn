"use client";
import { useState, useEffect } from "react";
import { Calendar, Trash2, Edit2, Check, X, ToggleLeft, ToggleRight, Mail, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { withAuthHeaders } from "@/lib/auth";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

interface Schedule {
  id:              string;
  title:           string;
  dataset_id:      string;
  conversation_id: string;
  question:        string;
  cron:            string;
  email:           string;
  active:          boolean;
  last_run:        string | null;
  created_at:      string;
}

const CRON_LABELS: Record<string, string> = {
  daily: "Every day", weekly: "Every week", monthly: "Every month",
};

const inpStyle = { background: "var(--surface3)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 7, padding: "6px 10px", fontSize: 12, width: "100%", outline: "none", boxSizing: "border-box" as const };

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<Partial<Schedule>>({});
  const [expanded, setExpanded]   = useState<string | null>(null);

  const load = () =>
    fetch(`${BASE}/schedules/`, { headers: withAuthHeaders() })
      .then(r => r.json()).then(setSchedules).catch(e => console.error("Failed to load schedules:", e));

  useEffect(() => { load(); }, []);

  const toggle = async (id: string) => {
    await fetch(`${BASE}/schedules/${id}/toggle`, { method: "PATCH", headers: withAuthHeaders() });
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this schedule?")) return;
    await fetch(`${BASE}/schedules/${id}`, { method: "DELETE", headers: withAuthHeaders() });
    setSchedules(prev => prev.filter(s => s.id !== id));
  };

  const startEdit = (s: Schedule, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditForm({ title: s.title, email: s.email, cron: s.cron, question: s.question });
  };

  const saveEdit = async (id: string) => {
    await fetch(`${BASE}/schedules/${id}`, {
      method: "PATCH", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(editForm),
    });
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...editForm } as Schedule : s));
    setEditingId(null);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ padding: "20px 28px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg,#3b82f6,#2563eb)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(59,130,246,0.3)" }}>
            <Calendar size={17} style={{ color: "#fff" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.3px" }}>Schedules</h1>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Automated reports delivered to your inbox</p>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 28px" }}>
        {schedules.length === 0 ? (
          /* Empty state */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 14, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Calendar size={26} style={{ color: "#3b82f6" }} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: "0 0 6px" }}>No schedules yet</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Ask a question in Analysis, then click "Schedule" below the response</p>
            </div>
          </div>
        ) : (
          /* Schedules list */
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Stats row */}
            <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
              {[
                { label: "Total", value: schedules.length, color: "var(--text)" },
                { label: "Active", value: schedules.filter(s => s.active).length, color: "#22c55e" },
                { label: "Paused", value: schedules.filter(s => !s.active).length, color: "var(--text-dim)" },
              ].map(stat => (
                <div key={stat.label} style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.value}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-dim)" }}>{stat.label}</p>
                </div>
              ))}
            </div>

            {schedules.map(s => <ScheduleRow key={s.id} s={s} expanded={expanded} editingId={editingId} editForm={editForm} onToggleExpand={id => setExpanded(expanded === id ? null : id)} onToggle={toggle} onStartEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={() => setEditingId(null)} onDelete={del} onFormChange={patch => setEditForm(f => ({ ...f, ...patch }))} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleRow({ s, expanded, editingId, editForm, onToggleExpand, onToggle, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onFormChange }: {
  s: Schedule;
  expanded: string | null;
  editingId: string | null;
  editForm: Partial<Schedule>;
  onToggleExpand: (id: string) => void;
  onToggle: (id: string) => void;
  onStartEdit: (s: Schedule, e: React.MouseEvent) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onFormChange: (patch: Partial<Schedule>) => void;
}) {
  const isExpanded = expanded === s.id;
  const isEditing  = editingId === s.id;

  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface2)", overflow: "hidden" }}>
      {/* Row header */}
      <div onClick={() => onToggleExpand(s.id)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", background: isExpanded ? "var(--accent-dim)" : "transparent", transition: "background 120ms ease" }}
        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "var(--surface3)"; }}
        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}>

        <div style={{ width: 32, height: 32, borderRadius: 8, background: s.active ? "rgba(59,130,246,0.15)" : "var(--surface3)", border: `1px solid ${s.active ? "rgba(59,130,246,0.3)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Calendar size={13} style={{ color: s.active ? "#3b82f6" : "var(--text-dim)" }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <input
              autoFocus
              value={editForm.title || ""}
              onChange={e => onFormChange({ title: e.target.value })}
              onClick={e => e.stopPropagation()}
              style={{ ...inpStyle, fontSize: 13, fontWeight: 600 }}
            />
          ) : (
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: s.active ? "var(--text)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{CRON_LABELS[s.cron] || s.cron}</span>
            <span style={{ fontSize: 10, color: "var(--text-dim)" }}>·</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: s.active ? "#22c55e" : "var(--text-dim)" }}>{s.active ? "Active" : "Paused"}</span>
          </div>
        </div>

        {/* Action buttons — stop propagation so row expand doesn't fire */}
        <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {isEditing ? (
            <>
              <button onClick={() => onSaveEdit(s.id)} style={{ padding: "4px 6px", borderRadius: 6, border: "none", background: "var(--surface3)", cursor: "pointer", color: "#22c55e", display: "flex" }}><Check size={13} /></button>
              <button onClick={onCancelEdit} style={{ padding: "4px 6px", borderRadius: 6, border: "none", background: "var(--surface3)", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}><X size={13} /></button>
            </>
          ) : (
            <>
              <button onClick={() => onToggle(s.id)} style={{ padding: "4px 6px", borderRadius: 6, border: "none", background: "var(--surface3)", cursor: "pointer", color: s.active ? "#3b82f6" : "var(--text-dim)", display: "flex" }}>
                {s.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              </button>
              <button onClick={e => onStartEdit(s, e)} style={{ padding: "4px 6px", borderRadius: 6, border: "none", background: "var(--surface3)", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}><Edit2 size={12} /></button>
              <button onClick={e => onDelete(s.id, e)} style={{ padding: "4px 6px", borderRadius: 6, border: "none", background: "var(--surface3)", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}><Trash2 size={12} /></button>
            </>
          )}
        </div>

        {isExpanded ? <ChevronDown size={12} style={{ color: "var(--text-dim)", flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: "var(--text-dim)", flexShrink: 0 }} />}
      </div>

      {/* Expanded detail panel */}
      {isExpanded && (
        <div style={{ padding: "16px 18px 18px", borderTop: "1px solid var(--border)", background: "var(--bg)", display: "flex", flexDirection: "column", gap: 12 }}>
          {isEditing ? (
            <>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)" }}>Question</label>
                <textarea
                  rows={3}
                  value={editForm.question || ""}
                  onChange={e => onFormChange({ question: e.target.value })}
                  style={{ ...inpStyle, marginTop: 6, resize: "none" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)" }}>Frequency</label>
                  <select value={editForm.cron || "daily"} onChange={e => onFormChange({ cron: e.target.value })} style={{ ...inpStyle, marginTop: 6 }}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)" }}>Email</label>
                  <input value={editForm.email || ""} onChange={e => onFormChange({ email: e.target.value })} style={{ ...inpStyle, marginTop: 6 }} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Mail size={12} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.email}</span>
              </div>
              <div style={{ background: "var(--surface3)", borderRadius: 8, padding: "10px 14px" }}>
                <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)" }}>Question</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.6 }}>"{s.question}"</p>
              </div>
              {s.last_run && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Clock size={11} style={{ color: "var(--text-dim)" }} />
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Last run: {new Date(s.last_run).toLocaleDateString()}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
