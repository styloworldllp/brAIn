"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check, CheckCheck, Lock, Calendar, ShieldCheck, X, Clock } from "lucide-react";
import { withAuthHeaders } from "@/lib/auth";
import { useIsMobile } from "@/hooks/useIsMobile";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

interface Notif {
  id: string;
  type: "access_request" | "access_approved" | "access_rejected" | "schedule_ran";
  title: string;
  body: string | null;
  ref_id: string | null;
  is_read: boolean;
  created_at: string;
}

interface AccessRequest {
  id: string;
  dataset_id: string;
  dataset_name: string;
  user_id: string;
  username: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface Props {
  isAdmin: boolean;
  /** Called when admin approves/rejects so DatabasesPage can refresh */
  onAccessChange?: () => void;
}

const TYPE_META = {
  access_request:  { Icon: Lock,        color: "#f59e0b", bg: "rgba(245,158,11,0.10)"  },
  access_approved: { Icon: ShieldCheck, color: "#22c55e", bg: "rgba(34,197,94,0.10)"   },
  access_rejected: { Icon: X,           color: "#f87171", bg: "rgba(248,113,113,0.10)" },
  schedule_ran:    { Icon: Calendar,    color: "#60a5fa", bg: "rgba(96,165,250,0.10)"  },
};

function ago(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationsBell({ isAdmin, onAccessChange }: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen]       = useState(false);
  const [notifs, setNotifs]   = useState<Notif[]>([]);
  const [requests, setReqs]   = useState<AccessRequest[]>([]);
  const [tab, setTab]         = useState<"notifs" | "requests">("notifs");
  const ref = useRef<HTMLDivElement>(null);

  const unread  = notifs.filter(n => !n.is_read).length;
  const pending = requests.filter(r => r.status === "pending").length;
  const badge   = unread + (isAdmin ? pending : 0);

  const load = useCallback(() => {
    fetch(`${BASE}/notifications/`, { headers: withAuthHeaders() })
      .then(r => r.json()).then(setNotifs).catch(() => {});
    fetch(`${BASE}/access-requests/`, { headers: withAuthHeaders() })
      .then(r => r.json()).then(setReqs).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll every 30s when panel is closed
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const markRead = async (id: string) => {
    await fetch(`${BASE}/notifications/${id}/read`, { method: "PATCH", headers: withAuthHeaders() });
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    await fetch(`${BASE}/notifications/read-all`, { method: "PATCH", headers: withAuthHeaders() });
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleApprove = async (reqId: string) => {
    await fetch(`${BASE}/access-requests/${reqId}/approve`, { method: "PATCH", headers: withAuthHeaders() });
    setReqs(prev => prev.map(r => r.id === reqId ? { ...r, status: "approved" } : r));
    onAccessChange?.();
  };

  const handleReject = async (reqId: string) => {
    await fetch(`${BASE}/access-requests/${reqId}/reject`, { method: "PATCH", headers: withAuthHeaders() });
    setReqs(prev => prev.map(r => r.id === reqId ? { ...r, status: "rejected" } : r));
  };

  const openPanel = () => {
    setOpen(o => !o);
    if (!open) load();
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <button onClick={openPanel}
        style={{
          position: "relative", width: 34, height: 34, borderRadius: "50%",
          background: open ? "var(--surface3)" : "transparent",
          border: `1.5px solid ${open ? "var(--border2)" : "transparent"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "background 140ms ease, border-color 140ms ease",
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.borderColor = "var(--border2)"; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; } }}>
        <Bell size={15} style={{ color: "var(--text-muted)" }} />
        {badge > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2, minWidth: 15, height: 15,
            borderRadius: "50%", background: "#f87171", color: "#fff",
            fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", lineHeight: 1, border: "1.5px solid var(--surface2)",
          }}>
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: isMobile ? 199 : 99 }} onClick={() => setOpen(false)} />
          <div style={isMobile ? {
            position: "fixed", top: "calc(52px + env(safe-area-inset-top,0px) + 6px)",
            left: 8, right: 8, zIndex: 200,
            borderRadius: 14, overflow: "hidden",
            background: "var(--surface2)", border: "1px solid var(--border)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.35), 0 4px 14px rgba(0,0,0,0.15)",
            animation: "notifIn 140ms ease both",
            display: "flex", flexDirection: "column", maxHeight: "70vh",
          } : {
            position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 100,
            width: 360, borderRadius: 14, overflow: "hidden",
            background: "var(--surface2)", border: "1px solid var(--border)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.35), 0 4px 14px rgba(0,0,0,0.15)",
            animation: "notifIn 140ms ease both",
            display: "flex", flexDirection: "column", maxHeight: "80vh",
          }}>

            {/* Header */}
            <div style={{ padding: "14px 16px 0", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Inbox</span>
                {unread > 0 && (
                  <button onClick={markAllRead}
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--accent-light)", background: "none", border: "none", cursor: "pointer" }}>
                    <CheckCheck size={12} /> Mark all read
                  </button>
                )}
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
                {([["notifs", "Notifications", unread] , isAdmin ? ["requests", "Access Requests", pending] : null] as const)
                  .filter(Boolean)
                  .map(item => {
                    const [id, label, count] = item as [string, string, number];
                    const active = tab === id;
                    return (
                      <button key={id} onClick={() => setTab(id as "notifs" | "requests")}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 12, fontWeight: active ? 600 : 400, background: "none", border: "none", cursor: "pointer", color: active ? "var(--accent-light)" : "var(--text-dim)", borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1, transition: "all 120ms ease" }}>
                        {label}
                        {count > 0 && (
                          <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: active ? "var(--accent)" : "var(--surface3)", color: active ? "#fff" : "var(--text-dim)", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {tab === "notifs" && (
                notifs.length === 0 ? (
                  <EmptyState icon={<Bell size={22} />} text="No notifications yet" />
                ) : (
                  <div style={{ padding: "6px 0" }}>
                    {notifs.map(n => {
                      const meta = TYPE_META[n.type] ?? TYPE_META.schedule_ran;
                      const Icon = meta.Icon;
                      return (
                        <div key={n.id}
                          onClick={() => !n.is_read && markRead(n.id)}
                          style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 16px", cursor: n.is_read ? "default" : "pointer", background: n.is_read ? "transparent" : "var(--accent-dim)", borderBottom: "1px solid var(--border)", transition: "background 100ms ease" }}
                          onMouseEnter={e => { if (!n.is_read) e.currentTarget.style.background = "var(--surface3)"; }}
                          onMouseLeave={e => { if (!n.is_read) e.currentTarget.style.background = "var(--accent-dim)"; }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Icon size={13} style={{ color: meta.color }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: n.is_read ? 400 : 600, color: "var(--text)", lineHeight: 1.4 }}>{n.title}</p>
                            {n.body && <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5, whiteSpace: "pre-line" }}>{n.body}</p>}
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                              <Clock size={9} style={{ color: "var(--text-dim)" }} />
                              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{ago(n.created_at)}</span>
                              {!n.is_read && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", display: "inline-block", marginLeft: 4 }} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {tab === "requests" && isAdmin && (
                requests.length === 0 ? (
                  <EmptyState icon={<Lock size={22} />} text="No access requests" />
                ) : (
                  <div style={{ padding: "6px 0" }}>
                    {requests.map(r => (
                      <div key={r.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: r.status === "pending" ? 10 : 0 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: "var(--surface3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-light)" }}>{(r.username?.[0] ?? "?").toUpperCase()}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{r.username}</span>
                              <StatusBadge status={r.status} />
                            </div>
                            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                              Requesting access to <strong style={{ color: "var(--text)" }}>{r.dataset_name}</strong>
                            </p>
                            {r.reason && (
                              <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-dim)", fontStyle: "italic", lineHeight: 1.4 }}>"{r.reason}"</p>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                              <Clock size={9} style={{ color: "var(--text-dim)" }} />
                              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{ago(r.created_at)}</span>
                            </div>
                          </div>
                        </div>
                        {r.status === "pending" && (
                          <div style={{ display: "flex", gap: 6, paddingLeft: 37 }}>
                            <button onClick={() => handleApprove(r.id)}
                              style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "none", background: "rgba(34,197,94,0.15)", color: "#22c55e", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "rgba(34,197,94,0.25)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "rgba(34,197,94,0.15)")}>
                              Approve
                            </button>
                            <button onClick={() => handleReject(r.id)}
                              style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "none", background: "rgba(248,113,113,0.12)", color: "#f87171", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "rgba(248,113,113,0.22)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "rgba(248,113,113,0.12)")}>
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes notifIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    pending:  ["#f59e0b", "rgba(245,158,11,0.12)"],
    approved: ["#22c55e", "rgba(34,197,94,0.12)"],
    rejected: ["#f87171", "rgba(248,113,113,0.12)"],
  };
  const [c, bg] = colors[status] ?? ["var(--text-dim)", "var(--surface3)"];
  return (
    <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 5, background: bg, color: c, fontWeight: 700, textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "36px 20px", textAlign: "center" }}>
      <div style={{ color: "var(--text-dim)", opacity: 0.4 }}>{icon}</div>
      <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>{text}</p>
    </div>
  );
}
