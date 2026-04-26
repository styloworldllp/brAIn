"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Building2, Ticket, Users, LogOut, Send, ChevronLeft, RefreshCw, Search, Filter } from "lucide-react";
import { AuthUser, fetchMe, logout, withAuthHeaders } from "@/lib/auth";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

interface Org {
  id: string; name: string; slug: string; plan: string;
  status: string; contact_email: string; query_limit: number;
  created_at: string;
}

interface TicketSummary {
  id: string; subject: string; status: string; priority: string;
  org_name: string | null; message_count: number;
  created_at: string; updated_at: string;
}

interface Message {
  id: string; username: string; is_staff: boolean; content: string; created_at: string;
}

interface TicketDetail extends TicketSummary {
  description: string; messages: Message[];
}

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  open:        { color: "#a5b4fc", bg: "rgba(99,102,241,0.15)" },
  in_progress: { color: "#fcd34d", bg: "rgba(245,158,11,0.15)" },
  resolved:    { color: "#34d399", bg: "rgba(0,200,150,0.15)" },
  closed:      { color: "#9ca3af", bg: "rgba(107,114,128,0.15)" },
};
const PRIORITY_COLOR: Record<string, string> = { low: "#9ca3af", medium: "#60a5fa", high: "#fb923c", urgent: "#f87171" };
const PLAN_COLOR:     Record<string, string> = { trial: "#9ca3af", starter: "#60a5fa", pro: "#a78bfa", enterprise: "#fbbf24" };

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600, color, background: bg, textTransform: "capitalize" }}>{label.replace("_", " ")}</span>;
}

export default function StaffPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [tab,     setTab]     = useState<"tickets" | "customers">("tickets");
  const [orgs,    setOrgs]    = useState<Org[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [detail,  setDetail]  = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply,   setReply]   = useState("");
  const [sending, setSending] = useState(false);
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search,  setSearch]  = useState("");
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("brain_token");
    if (!token) { router.replace("/login"); return; }
    fetchMe().then(u => {
      if (!u || !["staff", "super_admin"].includes(u.role)) { router.replace("/login"); return; }
      setUser(u);
      loadData();
    });
  }, []);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [detail?.messages]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [orgsRes, ticketsRes] = await Promise.all([
        fetch(`${BASE}/superadmin/organizations`, { headers: withAuthHeaders({}) }),
        fetch(`${BASE}/support/tickets`, { headers: withAuthHeaders({}) }),
      ]);
      if (orgsRes.ok) setOrgs(await orgsRes.json());
      if (ticketsRes.ok) setTickets(await ticketsRes.json());
    } finally { setLoading(false); }
  };

  const openTicket = async (id: string) => {
    const r = await fetch(`${BASE}/support/tickets/${id}`, { headers: withAuthHeaders({}) });
    if (r.ok) setDetail(await r.json());
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
        const tr = await fetch(`${BASE}/support/tickets`, { headers: withAuthHeaders({}) });
        if (tr.ok) setTickets(await tr.json());
      }
    } finally { setSending(false); }
  };

  const updateStatus = async (ticketId: string, status: string) => {
    await fetch(`${BASE}/support/tickets/${ticketId}`, {
      method: "PATCH",
      headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status }),
    });
    setDetail(prev => prev ? { ...prev, status } : prev);
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t));
  };

  const filteredTickets = tickets.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (search && !t.subject.toLowerCase().includes(search.toLowerCase()) &&
        !t.org_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openCount = tickets.filter(t => t.status === "open").length;
  const inProgressCount = tickets.filter(t => t.status === "in_progress").length;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)" }}>

      {/* Topbar */}
      <div style={{ height: 52, display: "flex", alignItems: "center", padding: "0 24px", background: "var(--surface2)", borderBottom: "1px solid var(--border)", gap: 16, flexShrink: 0 }}>
        <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", userSelect: "none" }}>
          <span style={{ color: "var(--text)" }}>br</span>
          <span style={{ background: "linear-gradient(135deg,#00c896,#33d9ab)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>AI</span>
          <span style={{ color: "var(--text)" }}>n</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)", marginLeft: 6 }}>Staff</span>
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{user?.username}</span>
        <button onClick={() => { logout().then(() => router.replace("/login")); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "none", border: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 12, cursor: "pointer" }}>
          <LogOut size={12} /> Sign Out
        </button>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Left panel — ticket list or customer list */}
        <div style={{ width: detail ? 320 : "100%", maxWidth: detail ? 320 : "none", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: detail ? "1px solid var(--border)" : "none", overflow: "hidden", transition: "width 0.2s" }}>

          {/* Tab + stats */}
          <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
            {!detail && (
              <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                {[
                  { label: "Open",        value: openCount,       color: "#a5b4fc" },
                  { label: "In Progress", value: inProgressCount, color: "#fcd34d" },
                  { label: "Customers",   value: orgs.length,     color: "#34d399" },
                ].map(s => (
                  <div key={s.label} style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-dim)" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {(["tickets", "customers"] as const).map(t => (
                <button key={t} onClick={() => { setTab(t); setDetail(null); }}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: tab === t ? "rgba(0,200,150,0.12)" : "none", color: tab === t ? "var(--accent-light)" : "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {t === "tickets" ? <Ticket size={13} /> : <Building2 size={13} />}
                  {t === "tickets" ? "Tickets" : "Customers"}
                </button>
              ))}
            </div>

            {/* Filters for tickets */}
            {tab === "tickets" && !detail && (
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 7, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                  <Search size={11} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                    style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: "var(--text)", minWidth: 0 }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  style={{ padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 11, cursor: "pointer", outline: "none" }}>
                  <option value="all">All status</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
                  style={{ padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 11, cursor: "pointer", outline: "none" }}>
                  <option value="all">All priority</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <button onClick={loadData} style={{ padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text-dim)", cursor: "pointer" }}>
                  <RefreshCw size={12} />
                </button>
              </div>
            )}
          </div>

          {/* List body */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40, color: "var(--text-dim)" }}>Loading…</div>
            ) : tab === "tickets" ? (
              filteredTickets.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13, padding: 40 }}>No tickets match filters</p>
              ) : filteredTickets.map(t => {
                const s = STATUS_CFG[t.status] ?? STATUS_CFG.open;
                return (
                  <button key={t.id} onClick={() => openTicket(t.id)}
                    style={{ width: "100%", display: "flex", flexDirection: "column", gap: 5, padding: "12px 20px", background: detail?.id === t.id ? "var(--surface3)" : "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={e => { if (detail?.id !== t.id) e.currentTarget.style.background = "var(--surface2)"; }}
                    onMouseLeave={e => { if (detail?.id !== t.id) e.currentTarget.style.background = "none"; }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</span>
                      <Badge label={t.status} color={s.color} bg={s.bg} />
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: PRIORITY_COLOR[t.priority] ?? "var(--text-dim)", fontWeight: 600, textTransform: "capitalize" }}>{t.priority}</span>
                      {t.org_name && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{t.org_name}</span>}
                      <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>{new Date(t.updated_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              orgs.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13, padding: 40 }}>No customers yet</p>
              ) : orgs.map(org => (
                <div key={org.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{org.name}</span>
                    <Badge label={org.plan} color={PLAN_COLOR[org.plan] ?? "#9ca3af"} bg={`${PLAN_COLOR[org.plan] ?? "#9ca3af"}20`} />
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{org.slug}</span>
                    {org.contact_email && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>· {org.contact_email}</span>}
                  </div>
                  <Badge label={org.status} color={org.status === "active" ? "#34d399" : "#9ca3af"} bg={org.status === "active" ? "rgba(0,200,150,0.12)" : "rgba(107,114,128,0.12)"} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel — ticket detail */}
        {detail && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Detail header */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => setDetail(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}>
                <ChevronLeft size={18} />
              </button>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{detail.subject}</h2>
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  {detail.org_name && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{detail.org_name}</span>}
                  <Badge label={detail.priority} color={PRIORITY_COLOR[detail.priority]} bg={`${PRIORITY_COLOR[detail.priority]}20`} />
                </div>
              </div>

              {/* Status selector */}
              <select value={detail.status} onChange={e => updateStatus(detail.id, e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${STATUS_CFG[detail.status]?.color ?? "var(--border)"}`, background: STATUS_CFG[detail.status]?.bg ?? "var(--surface2)", color: STATUS_CFG[detail.status]?.color ?? "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none" }}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              {detail.messages.map(m => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.is_staff ? "flex-start" : "flex-end", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 500 }}>{m.username}</span>
                    {m.is_staff && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 6, background: "rgba(0,200,150,0.15)", color: "var(--accent-light)", fontWeight: 700 }}>Staff</span>}
                    <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ maxWidth: "78%", padding: "10px 14px", borderRadius: m.is_staff ? "4px 14px 14px 14px" : "14px 4px 14px 14px", background: m.is_staff ? "rgba(0,200,150,0.1)" : "var(--surface3)", fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={msgEndRef} />
            </div>

            {/* Reply box */}
            {detail.status !== "closed" ? (
              <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 10, flexShrink: 0 }}>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(); }}
                  placeholder="Reply as staff… (⌘+Enter to send)"
                  rows={3}
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface3)", color: "var(--text)", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit" }}
                />
                <button onClick={sendReply} disabled={sending || !reply.trim()}
                  style={{ alignSelf: "flex-end", padding: "10px 16px", borderRadius: 9, background: "var(--accent)", color: "#fff", border: "none", cursor: sending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, opacity: !reply.trim() || sending ? 0.5 : 1 }}>
                  <Send size={13} /> Send
                </button>
              </div>
            ) : (
              <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border)", textAlign: "center", fontSize: 12, color: "var(--text-dim)", flexShrink: 0 }}>
                Ticket is closed — reopen it by changing the status above.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
