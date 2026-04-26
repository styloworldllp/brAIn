"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Download, RefreshCw, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle, Search, Filter, LogOut, UserX, FileText,
} from "lucide-react";
import { AuthUser, fetchMe, logout, withAuthHeaders } from "@/lib/auth";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

interface AuditEntry {
  id: string; timestamp: string; user_id: string; username: string;
  user_role: string; organization_id: string | null; ip_address: string | null;
  action: string; category: string; resource_type: string | null;
  resource_id: string | null; resource_name: string | null;
  details: Record<string, unknown> | null; status: string;
  anonymized: boolean; integrity_ok: boolean;
}

interface Summary {
  total_events: number; today_events: number; failure_events: number;
  category_breakdown: Record<string, number>;
  scope: "platform" | "organization";
  organization_id: string | null;
  organization_name: string | null;
}

const CATEGORY_STYLE: Record<string, { color: string; bg: string }> = {
  AUTH:      { color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  DATA:      { color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  AI:        { color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  USER_MGMT: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  ADMIN:     { color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
  SETTINGS:  { color: "#e879f9", bg: "rgba(232,121,249,0.12)" },
  SUPPORT:   { color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
  AUDIT:     { color: "#f472b6", bg: "rgba(244,114,182,0.12)" },
  OTHER:     { color: "#9ca3af", bg: "rgba(156,163,175,0.12)" },
};

function CatBadge({ cat }: { cat: string }) {
  const s = CATEGORY_STYLE[cat] ?? CATEGORY_STYLE.OTHER;
  return (
    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, fontWeight: 600,
                   color: s.color, background: s.bg, whiteSpace: "nowrap" }}>
      {cat}
    </span>
  );
}

function StatusDot({ status, integrity }: { status: string; integrity: boolean }) {
  const ok = status === "success" && integrity;
  const warn = status === "success" && !integrity;
  const color = ok ? "#34d399" : warn ? "#fbbf24" : "#f87171";
  const label = ok ? "OK" : warn ? "TAMPERED" : "FAIL";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
                   color, padding: "2px 7px", borderRadius: 8, background: `${color}18` }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

export default function AuditPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [logs,    setLogs]    = useState<AuditEntry[]>([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [category,  setCategory]  = useState("");
  const [status,    setStatus]    = useState("");
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");
  const [search,    setSearch]    = useState("");
  const [cats,      setCats]      = useState<string[]>([]);

  const isPlatform = user?.role === "super_admin" || user?.role === "staff";

  // GDPR panel
  const [gdprUserId, setGdprUserId] = useState("");
  const [gdprResult, setGdprResult] = useState("");
  const [gdprLoading, setGdprLoading] = useState(false);

  // Verify panel
  const [verifyResult, setVerifyResult] = useState<{ checked: number; ok: number; tampered: { id: string; timestamp: string; action: string }[]; passed: boolean } | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("brain_token");
    if (!token) { router.replace("/login"); return; }
    fetchMe().then(u => {
      if (!u || !["admin", "staff", "super_admin"].includes(u.role)) {
        router.replace("/");
        return;
      }
      setUser(u);
    });
  }, []);

  const fetchMeta = useCallback(async () => {
    const r = await fetch(`${BASE}/audit/meta`, { headers: withAuthHeaders({}) });
    if (r.ok) { const d = await r.json(); setCats(d.categories || []); }
  }, []);

  const fetchSummary = useCallback(async () => {
    const r = await fetch(`${BASE}/audit/summary`, { headers: withAuthHeaders({}) });
    if (r.ok) setSummary(await r.json());
  }, []);

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg) });
      if (category) params.set("category", category);
      if (status)   params.set("status", status);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo)   params.set("date_to", dateTo);
      if (search)   params.set("search", search);
      const r = await fetch(`${BASE}/audit/logs?${params}`, { headers: withAuthHeaders({}) });
      if (r.ok) {
        const d = await r.json();
        setLogs(d.logs); setTotal(d.total); setPages(d.pages);
      }
    } finally { setLoading(false); }
  }, [category, status, dateFrom, dateTo, search]);

  useEffect(() => {
    if (!user) return;
    fetchSummary();
    fetchMeta();
    fetchLogs(1);
    setPage(1);
  }, [user, category, status, dateFrom, dateTo, search]);

  const exportCsv = () => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (status)   params.set("status", status);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo)   params.set("date_to", dateTo);
    const token = localStorage.getItem("brain_token");
    const url = `${BASE}/audit/export.csv?${params}&token=${token ?? ""}`;
    const a = document.createElement("a");
    a.href = url; a.click();
  };

  const runVerify = async () => {
    setVerifyLoading(true);
    try {
      const r = await fetch(`${BASE}/audit/verify?limit=5000`, { headers: withAuthHeaders({}) });
      if (r.ok) setVerifyResult(await r.json());
    } finally { setVerifyLoading(false); }
  };

  const runGdprAnonymize = async () => {
    if (!gdprUserId.trim()) return;
    if (!confirm(`Anonymize all audit records for user ID "${gdprUserId}"? This cannot be undone.`)) return;
    setGdprLoading(true);
    try {
      const r = await fetch(`${BASE}/audit/gdpr/anonymize`, {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ user_id: gdprUserId.trim() }),
      });
      const d = await r.json();
      setGdprResult(r.ok
        ? `✓ Anonymized ${d.records_anonymized} records. Pseudonym: ${d.pseudonym}`
        : `Error: ${d.detail}`);
      if (r.ok) fetchLogs(page);
    } finally { setGdprLoading(false); }
  };

  const changePage = (p: number) => {
    setPage(p); fetchLogs(p);
  };

  if (!user) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid var(--accent)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)" }}>

      {/* Topbar */}
      <div style={{ height: 52, display: "flex", alignItems: "center", padding: "0 24px", background: "var(--surface2)", borderBottom: "1px solid var(--border)", gap: 12, flexShrink: 0 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}>
          <ChevronLeft size={18} />
        </button>
        <ShieldCheck size={18} style={{ color: "var(--accent-light)" }} />
        <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>Audit Log</span>
        {summary && (
          <span style={{
            fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 600,
            background: summary.scope === "platform" ? "rgba(251,146,60,0.12)" : "rgba(52,211,153,0.12)",
            color:      summary.scope === "platform" ? "#fb923c" : "#34d399",
          }}>
            {summary.scope === "platform" ? "All Organisations" : summary.organization_name ?? "Your Organisation"}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={exportCsv}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(0,200,150,0.1)", border: "1px solid rgba(0,200,150,0.25)", color: "var(--accent-light)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <Download size={12} /> Export CSV
        </button>
        <button onClick={() => { logout().then(() => router.replace("/login")); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: "none", border: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 12, cursor: "pointer" }}>
          <LogOut size={12} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>

        {/* Summary stats */}
        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Total Events",   value: summary.total_events.toLocaleString(),   color: "#60a5fa" },
              { label: "Today",          value: summary.today_events.toLocaleString(),   color: "#34d399" },
              { label: "Failures",       value: summary.failure_events.toLocaleString(), color: "#f87171" },
              ...Object.entries(summary.category_breakdown).slice(0, 4).map(([cat, n]) => ({
                label: cat, value: String(n), color: CATEGORY_STYLE[cat]?.color ?? "#9ca3af",
              })),
            ].map(s => (
              <div key={s.label} style={{ padding: "14px 18px", borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</p>
                <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-dim)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Compliance tools */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>

          {/* 21 CFR Integrity Check */}
          <div style={{ padding: "16px 18px", borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={15} style={{ color: "#60a5fa" }} />
                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>21 CFR Part 11 — Integrity</span>
              </div>
              {summary && (
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, fontWeight: 600,
                               background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}>
                  {summary.scope === "platform" ? "Platform-wide" : "This Organisation"}
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "0 0 12px" }}>
              Re-compute SHA-256 hashes to detect record tampering
              {summary?.scope === "organization" ? " within your organisation" : ""}.
            </p>
            {verifyResult && (
              <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: verifyResult.passed ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", border: `1px solid ${verifyResult.passed ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: verifyResult.passed ? "#34d399" : "#f87171" }}>
                  {verifyResult.passed ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                  {verifyResult.passed
                    ? `All ${verifyResult.checked} records intact`
                    : `${verifyResult.tampered.length} tampered record(s) detected`}
                </div>
              </div>
            )}
            <button onClick={runVerify} disabled={verifyLoading}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: verifyLoading ? 0.6 : 1 }}>
              <ShieldCheck size={12} /> {verifyLoading ? "Verifying…" : "Run Integrity Check"}
            </button>
          </div>

          {/* GDPR Anonymisation */}
          <div style={{ padding: "16px 18px", borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <UserX size={15} style={{ color: "#fb923c" }} />
                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>GDPR — Right to Erasure</span>
              </div>
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, fontWeight: 600,
                             background: isPlatform ? "rgba(251,146,60,0.12)" : "rgba(52,211,153,0.12)",
                             color: isPlatform ? "#fb923c" : "#34d399" }}>
                {isPlatform ? "Platform-wide" : "This Organisation"}
              </span>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "0 0 12px" }}>
              Article 17 — pseudonymise a user's PII in audit records
              {!isPlatform ? " within your organisation" : " across the platform"}.
              Records are retained for regulatory compliance.
            </p>
            {gdprResult && (
              <p style={{ fontSize: 11, color: gdprResult.startsWith("✓") ? "#34d399" : "#f87171", marginBottom: 8 }}>{gdprResult}</p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={gdprUserId} onChange={e => setGdprUserId(e.target.value)}
                placeholder="User ID to anonymize"
                style={{ flex: 1, padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface3)", color: "var(--text)", fontSize: 12, outline: "none" }}
              />
              <button onClick={runGdprAnonymize} disabled={gdprLoading || !gdprUserId.trim()}
                style={{ padding: "7px 12px", borderRadius: 7, background: "rgba(251,146,60,0.12)", color: "#fb923c", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: !gdprUserId.trim() ? 0.4 : 1 }}>
                {gdprLoading ? "…" : "Anonymize"}
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--border)", flex: "1 1 200px" }}>
            <Search size={12} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search user, action, resource…"
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "var(--text)", minWidth: 0 }} />
          </div>
          <select value={category} onChange={e => setCategory(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 12, cursor: "pointer", outline: "none" }}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 12, cursor: "pointer", outline: "none" }}>
            <option value="">All status</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="warning">Warning</option>
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 12, outline: "none" }} />
          <span style={{ color: "var(--text-dim)", fontSize: 12 }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 12, outline: "none" }} />
          <button onClick={() => { setCategory(""); setStatus(""); setDateFrom(""); setDateTo(""); setSearch(""); }}
            style={{ padding: "7px 12px", borderRadius: 8, background: "none", border: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 12, cursor: "pointer" }}>
            Clear
          </button>
          <button onClick={() => fetchLogs(page)}
            style={{ padding: "7px 10px", borderRadius: 8, background: "none", border: "1px solid var(--border)", color: "var(--text-dim)", cursor: "pointer" }}>
            <RefreshCw size={13} />
          </button>
          <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 4 }}>{total.toLocaleString()} events</span>
        </div>

        {/* Table */}
        <div style={{ borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", background: "var(--surface2)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface3)" }}>
                  {["Timestamp", "User", "Action", "Category", "Resource", "IP", "Status"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--text-dim)" }}>Loading…</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--text-dim)" }}>No events match filters</td></tr>
                ) : logs.map((log, i) => (
                  <tr key={log.id}
                    style={{ borderBottom: i < logs.length - 1 ? "1px solid var(--border)" : "none", transition: "background 80ms" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface3)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "9px 14px", whiteSpace: "nowrap", color: "var(--text-dim)" }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 500, color: log.anonymized ? "var(--text-dim)" : "var(--text)" }}>
                        {log.username}
                      </span>
                      {log.user_role && <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4 }}>({log.user_role})</span>}
                      {log.anonymized && <span style={{ fontSize: 9, marginLeft: 4, color: "#fb923c" }}>GDPR</span>}
                    </td>
                    <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 11, color: "var(--text)", whiteSpace: "nowrap" }}>
                      {log.action}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <CatBadge cat={log.category} />
                    </td>
                    <td style={{ padding: "9px 14px", color: "var(--text-dim)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.resource_name ?? log.resource_type ?? "—"}
                    </td>
                    <td style={{ padding: "9px 14px", color: "var(--text-dim)", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 11 }}>
                      {log.ip_address ?? "—"}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <StatusDot status={log.status} integrity={log.integrity_ok} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }}>
            <button onClick={() => changePage(Math.max(1, page - 1))} disabled={page === 1}
              style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "none", color: "var(--text-dim)", cursor: page === 1 ? "default" : "pointer", opacity: page === 1 ? 0.4 : 1 }}>
              <ChevronLeft size={13} />
            </button>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Page {page} of {pages}</span>
            <button onClick={() => changePage(Math.min(pages, page + 1))} disabled={page === pages}
              style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "none", color: "var(--text-dim)", cursor: page === pages ? "default" : "pointer", opacity: page === pages ? 0.4 : 1 }}>
              <ChevronRight size={13} />
            </button>
          </div>
        )}

        {/* Compliance notice */}
        <div style={{ marginTop: 24, padding: "12px 16px", borderRadius: 10, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", display: "flex", gap: 10 }}>
          <FileText size={14} style={{ color: "#60a5fa", flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text)" }}>21 CFR Part 11:</strong> Records are append-only and carry a SHA-256 integrity hash — no record can be modified or deleted. Use "Run Integrity Check" to verify.{" "}
            <strong style={{ color: "var(--text)" }}>GDPR:</strong> Use "Right to Erasure" to pseudonymise PII (username, IP) per Article 17. Records are retained for regulatory compliance.{" "}
            {summary?.scope === "organization"
              ? <><strong style={{ color: "var(--text)" }}>Scope:</strong> You are viewing your organisation's audit trail only. Your super admin can access the full platform trail.</>
              : <><strong style={{ color: "var(--text)" }}>Scope:</strong> You are viewing the full platform audit trail across all organisations.</>
            }
          </p>
        </div>
      </div>
    </div>
  );
}
