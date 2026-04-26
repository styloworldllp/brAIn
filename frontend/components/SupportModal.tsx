"use client";
import { useState, useEffect, useRef } from "react";
import { X, Plus, Send, ChevronLeft, AlertCircle, CheckCircle, Clock, Loader } from "lucide-react";
import { withAuthHeaders } from "@/lib/auth";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

interface TicketSummary {
  id: string;
  subject: string;
  status: string;
  priority: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  username: string;
  is_staff: boolean;
  content: string;
  created_at: string;
}

interface TicketDetail extends TicketSummary {
  description: string;
  messages: Message[];
}

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  open:        { bg: "rgba(99,102,241,0.15)",  color: "#a5b4fc", label: "Open" },
  in_progress: { bg: "rgba(245,158,11,0.15)", color: "#fcd34d", label: "In Progress" },
  resolved:    { bg: "var(--accent-dim)",   color: "var(--accent-light)", label: "Resolved" },
  closed:      { bg: "rgba(107,114,128,0.15)", color: "#9ca3af", label: "Closed" },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#9ca3af", medium: "#60a5fa", high: "#fb923c", urgent: "#f87171",
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] ?? STATUS_COLORS.open;
  return (
    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

export default function SupportModal({ onClose }: { onClose: () => void }) {
  const [view, setView]           = useState<"list" | "detail" | "new">("list");
  const [tickets, setTickets]     = useState<TicketSummary[]>([]);
  const [detail,  setDetail]      = useState<TicketDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(false);
  const [reply,   setReply]       = useState("");
  const [newForm, setNewForm]     = useState({ subject: "", description: "", priority: "medium" });
  const [error,   setError]       = useState("");
  const msgEndRef = useRef<HTMLDivElement>(null);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/support/tickets`, { headers: withAuthHeaders({}) });
      if (r.ok) setTickets(await r.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchTickets(); }, []);
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [detail?.messages]);

  const openTicket = async (id: string) => {
    const r = await fetch(`${BASE}/support/tickets/${id}`, { headers: withAuthHeaders({}) });
    if (r.ok) { setDetail(await r.json()); setView("detail"); }
  };

  const sendReply = async () => {
    if (!reply.trim() || !detail) return;
    setSending(true);
    try {
      const r = await fetch(`${BASE}/support/tickets/${detail.id}/messages`, {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ content: reply.trim() }),
      });
      if (r.ok) {
        const msg = await r.json();
        setDetail(prev => prev ? { ...prev, messages: [...prev.messages, msg] } : prev);
        setReply("");
        fetchTickets();
      }
    } finally { setSending(false); }
  };

  const submitNew = async () => {
    if (!newForm.subject.trim() || !newForm.description.trim()) {
      setError("Subject and description are required.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const r = await fetch(`${BASE}/support/tickets`, {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(newForm),
      });
      if (r.ok) {
        setNewForm({ subject: "", description: "", priority: "medium" });
        await fetchTickets();
        setView("list");
      } else {
        const e = await r.json();
        setError(e.detail ?? "Failed to submit ticket.");
      }
    } finally { setSending(false); }
  };

  return (
    <div className="modal-backdrop" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel flex flex-col overflow-hidden"
        style={{ width: 540, maxHeight: "85vh", borderRadius: 16, background: "var(--surface2)", border: "1px solid var(--border)", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {view !== "list" && (
              <button onClick={() => { setView("list"); setDetail(null); setError(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, display: "flex" }}>
                <ChevronLeft size={18} />
              </button>
            )}
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
              {view === "list" ? "Support" : view === "new" ? "New Ticket" : detail?.subject ?? "Ticket"}
            </h2>
            {view === "detail" && detail && <StatusBadge status={detail.status} />}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {view === "list" && (
              <button onClick={() => setView("new")}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none" }}>
                <Plus size={13} /> New Ticket
              </button>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* Ticket list */}
          {view === "list" && (
            <div style={{ padding: "8px 0" }}>
              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40, color: "var(--text-dim)" }}>
                  <Loader size={20} style={{ animation: "spin 0.8s linear infinite" }} />
                </div>
              ) : tickets.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-dim)" }}>
                  <CheckCircle size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>No support tickets yet</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.6 }}>Click "New Ticket" to get help from our team</p>
                </div>
              ) : tickets.map(t => (
                <button key={t.id} onClick={() => openTicket(t.id)}
                  style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, padding: "12px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface3)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: PRIORITY_COLORS[t.priority] ?? "var(--text-dim)", fontWeight: 600, textTransform: "capitalize" }}>{t.priority}</span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{t.message_count} message{t.message_count !== 1 ? "s" : ""}</span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* New ticket form */}
          {view === "new" && (
            <div style={{ padding: "20px" }}>
              {error && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px", borderRadius: 8, background: "rgba(248,113,113,0.1)", color: "#f87171", fontSize: 13, marginBottom: 16 }}>
                  <AlertCircle size={14} /> {error}
                </div>
              )}
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6 }}>Subject</label>
              <input
                value={newForm.subject}
                onChange={e => setNewForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Brief summary of your issue"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface3)", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 14 }}
              />

              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6 }}>Priority</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {(["low", "medium", "high", "urgent"] as const).map(p => (
                  <button key={p} onClick={() => setNewForm(f => ({ ...f, priority: p }))}
                    style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: `1.5px solid ${newForm.priority === p ? PRIORITY_COLORS[p] : "var(--border)"}`, background: newForm.priority === p ? `${PRIORITY_COLORS[p]}20` : "none", color: newForm.priority === p ? PRIORITY_COLORS[p] : "var(--text-dim)", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>
                    {p}
                  </button>
                ))}
              </div>

              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6 }}>Description</label>
              <textarea
                value={newForm.description}
                onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe your issue in detail..."
                rows={5}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface3)", color: "var(--text)", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 20 }}
              />

              <button onClick={submitNew} disabled={sending}
                style={{ width: "100%", padding: "10px", borderRadius: 9, background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: sending ? "not-allowed" : "pointer", border: "none", opacity: sending ? 0.7 : 1 }}>
                {sending ? "Submitting…" : "Submit Ticket"}
              </button>
            </div>
          )}

          {/* Ticket detail */}
          {view === "detail" && detail && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                {detail.messages.map((m, i) => (
                  <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.is_staff ? "flex-start" : "flex-end", gap: 3 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 500 }}>{m.username}</span>
                      {m.is_staff && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 6, background: "var(--accent-dim)", color: "var(--accent-light)", fontWeight: 700 }}>Staff</span>}
                      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <div style={{ maxWidth: "82%", padding: "9px 13px", borderRadius: m.is_staff ? "4px 12px 12px 12px" : "12px 4px 12px 12px", background: m.is_staff ? "var(--surface3)" : "var(--accent-dim)", fontSize: 13, color: "var(--text)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                      {m.content}
                    </div>
                  </div>
                ))}
                <div ref={msgEndRef} />
              </div>

              {detail.status !== "closed" && (
                <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexShrink: 0 }}>
                  <textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(); }}
                    placeholder="Write a reply… (⌘+Enter to send)"
                    rows={2}
                    style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface3)", color: "var(--text)", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit" }}
                  />
                  <button onClick={sendReply} disabled={sending || !reply.trim()}
                    style={{ alignSelf: "flex-end", padding: "9px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", cursor: sending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, opacity: sending || !reply.trim() ? 0.5 : 1 }}>
                    <Send size={13} /> Send
                  </button>
                </div>
              )}
              {detail.status === "closed" && (
                <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", textAlign: "center", fontSize: 12, color: "var(--text-dim)", flexShrink: 0 }}>
                  This ticket is closed. Open a new ticket if you need further help.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
