"use client";
import { useState } from "react";
import { Calendar, Mail, BarChart2, X, CheckCircle2, ChevronDown } from "lucide-react";
import { AISpinner } from "./AISpinner";
import { Dataset } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";

interface Props {
  dataset: Dataset;
  conversationId: string;
  messageContent: string;
  charts: unknown[];
  onChartSaved: () => void;
}

type Panel = null | "schedule" | "email" | "chart";

const BASE = "http://localhost:8000/api";

export default function MessageActions({ dataset, conversationId, messageContent, charts, onChartSaved }: Props) {
  const [open, setOpen] = useState<Panel>(null);

  const toggle = (p: Panel) => setOpen(open === p ? null : p);

  return (
    <div className="mt-2 ml-11">
      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {charts.length > 0 && (
          <ActionBtn icon={<BarChart2 size={11} />} label={`Save chart${charts.length > 1 ? "s" : ""} (${charts.length})`}
            active={open === "chart"} onClick={() => toggle("chart")} color="green" />
        )}
        <ActionBtn icon={<Calendar size={11} />} label="Schedule" active={open === "schedule"} onClick={() => toggle("schedule")} color="blue" />
        <ActionBtn icon={<Mail size={11} />} label="Email results" active={open === "email"} onClick={() => toggle("email")} color="teal" />
      </div>

      {/* Panels */}
      {open === "chart" && (
        <SaveChartPanel charts={charts} dataset={dataset} conversationId={conversationId}
          onClose={() => setOpen(null)} onSaved={() => { setOpen(null); onChartSaved(); }} />
      )}
      {open === "schedule" && (
        <SchedulePanel dataset={dataset} conversationId={conversationId} question={messageContent}
          onClose={() => setOpen(null)} />
      )}
      {open === "email" && (
        <EmailPanel content={messageContent} dataset={dataset} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function ActionBtn({ icon, label, active, onClick, color }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; color: string;
}) {
  const colors: Record<string, string> = {
    green:  "border-[#00c896]/40 bg-[#00c896]/10 text-[#33d9ab] hover:bg-[#00c896]/20",
    blue:   "border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20",
    teal:   "border-teal-500/40 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20",
  };
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors
        ${active ? colors[color] : "border-[#1e2235] text-[#8b90a8] hover:border-[#2e3347] hover:text-[#c8cad8]"}`}>
      {icon}{label}
      <ChevronDown size={10} className={`transition-transform ${active ? "rotate-180" : ""}`} />
    </button>
  );
}

// ── Save Chart Panel ──────────────────────────────────────────────────────────

function SaveChartPanel({ charts, dataset, conversationId, onClose, onSaved }: {
  charts: unknown[]; dataset: Dataset; conversationId: string; onClose: () => void; onSaved: () => void;
}) {
  const [titles, setTitles] = useState<string[]>(charts.map((_, i) => `Chart ${i + 1} — ${dataset.name}`));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    for (let i = 0; i < charts.length; i++) {
      await fetch(`${BASE}/charts/`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: titles[i],
          dataset_id: dataset.id,
          conversation_id: conversationId,
          chart_json: charts[i],
        }),
      });
    }
    setSaving(false); setSaved(true);
    setTimeout(onSaved, 800);
  };

  return (
    <Panel onClose={onClose}>
      <p className="text-xs font-medium text-[#e8eaf0] mb-3">Save {charts.length} chart{charts.length > 1 ? "s" : ""} to sidebar</p>
      <div className="space-y-2 mb-3">
        {charts.map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-[#3e4357] shrink-0">Chart {i + 1}</span>
            <input
              className="flex-1 bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-2.5 py-1.5 text-xs text-[#e8eaf0] placeholder-[#3e4357] focus:outline-none focus:border-[#00c896]/60"
              value={titles[i]}
              onChange={(e) => setTitles(t => t.map((v, j) => j === i ? e.target.value : v))}
            />
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={saving || saved}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#00a876] hover:bg-[#00c896] text-white text-xs font-medium disabled:opacity-50 transition-colors">
        {saving ? <AISpinner size={12} /> : saved ? <CheckCircle2 size={12} /> : <BarChart2 size={12} />}
        {saved ? "Saved!" : saving ? "Saving…" : "Save to Charts"}
      </button>
    </Panel>
  );
}

// ── Schedule Panel ────────────────────────────────────────────────────────────

function SchedulePanel({ dataset, conversationId, question, onClose }: {
  dataset: Dataset; conversationId: string; question: string; onClose: () => void;
}) {
  const [title, setTitle]   = useState(`${dataset.name} report`);
  const [cron, setCron]     = useState("daily");
  const [email, setEmail]   = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`${BASE}/schedules/`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title, dataset_id: dataset.id, conversation_id: conversationId, question, cron, email }),
    });
    setSaving(false); setSaved(true);
    setTimeout(onClose, 1000);
  };

  return (
    <Panel onClose={onClose}>
      <p className="text-xs font-medium text-[#e8eaf0] mb-3">Schedule this analysis</p>
      <div className="space-y-2">
        <input className={inClass} placeholder="Report title" value={title} onChange={e => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <select className={inClass} value={cron} onChange={e => setCron(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input className={inClass} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="text-[10px] text-[#3e4357] bg-[#0d0f1a] rounded-lg p-2 border border-[#1e2235]">
          Will re-run: <em>{question.slice(0, 60)}{question.length > 60 ? "…" : ""}</em>
        </div>
      </div>
      <button onClick={handleSave} disabled={saving || saved || !email}
        className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-50 transition-colors">
        {saving ? <AISpinner size={12} /> : saved ? <CheckCircle2 size={12} /> : <Calendar size={12} />}
        {saved ? "Scheduled!" : saving ? "Saving…" : "Create schedule"}
      </button>
    </Panel>
  );
}

// ── Email Panel ───────────────────────────────────────────────────────────────

function EmailPanel({ content, dataset, onClose }: { content: string; dataset: Dataset; onClose: () => void }) {
  const [to, setTo]         = useState("");
  const [subject, setSubject] = useState(`brAIn Report — ${dataset.name}`);
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; message: string } | null>(null);

  const handleSend = async () => {
    setSending(true);
    const res = await fetch(`${BASE}/schedules/send-email`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ to_email: to, subject, body: content, dataset_name: dataset.name }),
    }).then(r => r.json());
    setResult(res);
    setSending(false);
  };

  return (
    <Panel onClose={onClose}>
      <p className="text-xs font-medium text-[#e8eaf0] mb-3">Email these results</p>
      <div className="space-y-2">
        <input className={inClass} type="email" placeholder="To: recipient@email.com" value={to} onChange={e => setTo(e.target.value)} />
        <input className={inClass} placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
      </div>
      {result && (
        <div className={`mt-2 px-2.5 py-2 rounded-lg text-[10px] border ${result.ok ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
          {result.message}
          {!result.ok && (result as any).env_needed && (
            <div className="mt-1 space-y-0.5">
              {Object.entries((result as any).env_needed).map(([k, v]) => (
                <p key={k} className="font-mono">{k}={String(v)}</p>
              ))}
              <p className="mt-1 not-italic">Add these to backend/.env then restart.</p>
            </div>
          )}
        </div>
      )}
      <button onClick={handleSend} disabled={sending || !to}
        className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium disabled:opacity-50 transition-colors">
        {sending ? <AISpinner size={12} /> : <Mail size={12} />}
        {sending ? "Sending…" : "Send email"}
      </button>
    </Panel>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

const inClass = "w-full bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-2.5 py-1.5 text-xs text-[#e8eaf0] placeholder-[#3e4357] focus:outline-none focus:border-[#00c896]/60 transition-colors";

function Panel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="mt-2 bg-[#12141f] border border-[#1e2235] rounded-xl p-3 relative">
      <button onClick={onClose} className="absolute top-2 right-2 text-[#3e4357] hover:text-[#8b90a8]"><X size={12} /></button>
      {children}
    </div>
  );
}
