"use client";
import { useState, useEffect } from "react";
import { Calendar, Trash2, Edit2, Check, X, ToggleLeft, ToggleRight, Mail, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { withAuthHeaders } from "@/lib/auth";

const BASE = "http://localhost:8000/api";

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

interface Props { refreshTrigger?: number; }

const CRON_LABELS: Record<string, string> = {
  daily: "Every day", weekly: "Every week", monthly: "Every month",
};

export default function SchedulesPanel({ refreshTrigger }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<Partial<Schedule>>({});
  const [expanded, setExpanded]   = useState<string | null>(null);

  const load = () => fetch(`${BASE}/schedules/`, { headers: withAuthHeaders() }).then(r => r.json()).then(setSchedules).catch(() => {});

  useEffect(() => { load(); }, [refreshTrigger]);

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

  if (schedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-36 gap-2 text-center px-3">
        <Calendar size={20} className="text-[#2e3347]" />
        <p className="text-[10px] text-[#3e4357]">No schedules yet</p>
        <p className="text-[9px] text-[#2e3347]">Ask a question then click Schedule below the response</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1.5">
      {schedules.map(s => (
        <div key={s.id} className="rounded-lg border border-[#1e2235] overflow-hidden">
          {/* Header row */}
          <div
            onClick={() => setExpanded(expanded === s.id ? null : s.id)}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#1a1d27] transition-colors"
          >
            <Calendar size={11} className={s.active ? "text-blue-400" : "text-[#3e4357]"} />
            <div className="flex-1 min-w-0">
              {editingId === s.id ? (
                <input
                  autoFocus
                  className="w-full bg-[#0d0f1a] border border-[#00c896]/40 rounded px-1.5 py-0.5 text-[11px] text-[#e8eaf0] outline-none"
                  value={editForm.title || ""}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <p className="text-[11px] font-medium truncate" style={{ color: s.active ? "var(--text)" : "var(--text-dim)" }}>
                  {s.title}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] text-[#3e4357]">{CRON_LABELS[s.cron] || s.cron}</span>
                <span className="text-[9px] text-[#2e3347]">·</span>
                <span className={`text-[9px] ${s.active ? "text-green-400" : "text-[#3e4357]"}`}>
                  {s.active ? "Active" : "Paused"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
              {editingId === s.id ? (
                <>
                  <button onClick={() => saveEdit(s.id)} className="text-green-400 hover:text-green-300 p-0.5"><Check size={11} /></button>
                  <button onClick={() => setEditingId(null)} className="text-[#3e4357] hover:text-[#8b90a8] p-0.5"><X size={11} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => toggle(s.id)} className="p-0.5 text-[#3e4357] hover:text-blue-400 transition-colors">
                    {s.active ? <ToggleRight size={14} className="text-blue-400" /> : <ToggleLeft size={14} />}
                  </button>
                  <button onClick={e => startEdit(s, e)} className="p-0.5 text-[#3e4357] hover:text-[#8b90a8]"><Edit2 size={10} /></button>
                  <button onClick={e => del(s.id, e)} className="p-0.5 text-[#3e4357] hover:text-red-400"><Trash2 size={10} /></button>
                </>
              )}
            </div>
            {expanded === s.id ? <ChevronDown size={10} className="text-[#3e4357] shrink-0" /> : <ChevronRight size={10} className="text-[#3e4357] shrink-0" />}
          </div>

          {/* Expanded detail */}
          {expanded === s.id && (
            <div className="px-3 pb-3 border-t border-[#1e2235] bg-[#0d0f1a] space-y-2 pt-2">
              {editingId === s.id ? (
                <>
                  <div>
                    <label className="text-[9px] text-[#3e4357] uppercase tracking-wider">Question</label>
                    <textarea
                      className="w-full mt-0.5 bg-[#12141f] border border-[#1e2235] rounded px-2 py-1 text-[10px] text-[#c8cad8] outline-none focus:border-[#00c896]/40 resize-none"
                      rows={2}
                      value={editForm.question || ""}
                      onChange={e => setEditForm(f => ({ ...f, question: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-[#3e4357] uppercase tracking-wider">Frequency</label>
                      <select
                        className="w-full mt-0.5 bg-[#12141f] border border-[#1e2235] rounded px-2 py-1 text-[10px] text-[#c8cad8] outline-none"
                        value={editForm.cron || "daily"}
                        onChange={e => setEditForm(f => ({ ...f, cron: e.target.value }))}
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-[#3e4357] uppercase tracking-wider">Email</label>
                      <input
                        className="w-full mt-0.5 bg-[#12141f] border border-[#1e2235] rounded px-2 py-1 text-[10px] text-[#c8cad8] outline-none focus:border-[#00c896]/40"
                        value={editForm.email || ""}
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-1.5">
                    <Mail size={9} className="text-[#3e4357] mt-0.5 shrink-0" />
                    <p className="text-[10px] text-[#8b90a8]">{s.email}</p>
                  </div>
                  <div className="bg-[#12141f] rounded p-2">
                    <p className="text-[9px] text-[#3e4357] mb-1">Question:</p>
                    <p className="text-[10px] text-[#8b90a8] italic leading-relaxed">"{s.question}"</p>
                  </div>
                  {s.last_run && (
                    <div className="flex items-center gap-1.5">
                      <Clock size={9} className="text-[#3e4357]" />
                      <p className="text-[9px] text-[#3e4357]">Last run: {new Date(s.last_run).toLocaleDateString()}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
