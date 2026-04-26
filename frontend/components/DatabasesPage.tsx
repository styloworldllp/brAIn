"use client";
import { useState, useEffect } from "react";
import { Database, Plus, X, CheckCircle2, LayoutGrid, Table2, Trash2, ArrowRight, Server, Activity, ExternalLink, Lock, Send } from "lucide-react";
import { AISpinner } from "./AISpinner";
import { Dataset, fetchDatasets, deleteDataset } from "@/lib/api";
import { withAuthHeaders, getStoredUser, isAdmin } from "@/lib/auth";
import TableBrowserModal from "./TableBrowserModal";
import { useIsMobile } from "@/hooks/useIsMobile";

const API_ROOT = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BASE = API_ROOT + "/api";
const inp = { background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" };
const inpCls = "w-full rounded-lg px-3 py-2 text-sm transition-colors";

type ConnType = "mysql" | "postgres" | "sheets";
type LoadMode = "all" | "specific";
type PanelStep = "closed" | "pick" | "form";

interface DatasetEx extends Dataset {
  is_restricted?: boolean;
  has_access?: boolean;
}

interface Props { onOpenDB: (dataset: Dataset) => void; }

const CONNECTORS = [
  { id: "mysql"    as ConnType, name: "MySQL",        port: "3306",  accent: "#fb923c", accentDim: "rgba(251,146,60,0.10)",  borderDim: "rgba(251,146,60,0.25)", logo: <MysqlLogo /> },
  { id: "postgres" as ConnType, name: "PostgreSQL",   port: "5432",  accent: "#60a5fa", accentDim: "rgba(96,165,250,0.10)",  borderDim: "rgba(96,165,250,0.25)", logo: <PgLogo /> },
  { id: "sheets"   as ConnType, name: "Google Sheets",port: "",       accent: "#4ade80", accentDim: "rgba(74,222,128,0.10)",  borderDim: "rgba(74,222,128,0.25)", logo: <SheetsLogo /> },
] as const;

const SOURCE_META: Record<string, { label: string; color: string }> = {
  mysql:    { label: "MySQL",    color: "#fb923c" },
  postgres: { label: "PostgreSQL", color: "#60a5fa" },
  sheets:   { label: "Google Sheets", color: "#4ade80" },
};

export default function DatabasesPage({ onOpenDB }: Props) {
  const isMobile = useIsMobile();
  const [dbs, setDbs]         = useState<DatasetEx[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel]     = useState<PanelStep>("closed");
  const [connType, setConnType] = useState<ConnType>("mysql");
  const [browse, setBrowse]   = useState<{ connStr: string; tables: string[]; name: string; dbType: string } | null>(null);
  const [requestTarget, setRequestTarget] = useState<DatasetEx | null>(null);
  const currentUser = getStoredUser();
  const userIsAdmin = isAdmin(currentUser);

  const load = async () => {
    setLoading(true);
    try {
      const all = await fetchDatasets() as DatasetEx[];
      setDbs(all.filter(d => ["postgres", "mysql", "sheets"].includes(d.source_type)));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Remove this connection?")) return;
    await deleteDataset(id);
    setDbs(prev => prev.filter(d => d.id !== id));
  };

  const handleToggleRestrict = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch(`${BASE}/datasets/${id}/restrict`, { method: "PATCH", headers: withAuthHeaders() });
    setDbs(prev => prev.map(d => d.id === id ? { ...d, is_restricted: !d.is_restricted } : d));
  };

  const closePanel = () => { setPanel("closed"); setBrowse(null); };

  const handleSuccess = (ds: Dataset) => {
    setDbs(prev => [ds, ...prev.filter(d => d.id !== ds.id)]);
    closePanel();
    onOpenDB(ds);
  };

  return (
    <div style={{ flex: 1, display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)" }}>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: isMobile ? "14px 16px 12px" : "20px 28px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface2)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px var(--accent-glow)" }}>
                <Database size={17} style={{ color: "#fff" }} />
              </div>
              <div>
                <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.3px" }}>Databases</h1>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{dbs.length} connection{dbs.length !== 1 ? "s" : ""} · MySQL, PostgreSQL, Sheets</p>
              </div>
            </div>
            <button onClick={() => setPanel("pick")}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10, background: "linear-gradient(135deg,var(--accent),var(--accent2))", color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", boxShadow: "0 2px 10px var(--accent-glow)", whiteSpace: "nowrap" }}>
              <Plus size={14} /> {isMobile ? "Add" : "Add Connection"}
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}><AISpinner size={24} /></div>
          ) : dbs.filter(d => d.has_access !== false).length === 0 && !userIsAdmin ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 16, textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Server size={30} style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: "0 0 6px" }}>No connections available</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Ask your admin to connect a data source</p>
              </div>
            </div>
          ) : dbs.length === 0 && userIsAdmin ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 16, textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Server size={30} style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: "0 0 6px" }}>No connections yet</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Connect a MySQL, PostgreSQL, or Google Sheets source</p>
              </div>
              <button onClick={() => setPanel("pick")}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: 10, background: "linear-gradient(135deg,var(--accent),var(--accent2))", color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", marginTop: 4, boxShadow: "0 2px 12px var(--accent-glow)" }}>
                <Plus size={14} /> Add your first connection
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {dbs.map(ds => (
                <DBCard key={ds.id} ds={ds}
                  isAdmin={userIsAdmin}
                  onOpen={() => ds.has_access !== false && onOpenDB(ds)}
                  onDelete={e => handleDelete(e, ds.id)}
                  onToggleRestrict={e => handleToggleRestrict(e, ds.id)}
                  onRequestAccess={() => setRequestTarget(ds)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Slide-in panel ── */}
      {panel !== "closed" && !browse && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={closePanel} />
          <div style={{ position: isMobile ? "fixed" : "relative", top: isMobile ? 0 : undefined, right: isMobile ? 0 : undefined, bottom: isMobile ? 0 : undefined, left: isMobile ? 0 : undefined, zIndex: isMobile ? 200 : 11, width: isMobile ? "100%" : 460, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--surface2)", display: "flex", flexDirection: "column", height: isMobile ? undefined : "100%", animation: "slideInRight 200ms var(--ease-out) both" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0 }}>
                {panel === "pick" ? "Choose a connector" : `Connect ${CONNECTORS.find(c => c.id === connType)?.name}`}
              </h2>
              <button onClick={closePanel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4, display: "flex", borderRadius: 6 }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
              {panel === "pick" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                  {CONNECTORS.map(c => (
                    <button key={c.id} onClick={() => { setConnType(c.id); setPanel("form"); }}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderRadius: 12, border: `1.5px solid ${c.borderDim}`, background: c.accentDim, cursor: "pointer", textAlign: "left", transition: "all 140ms ease" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = c.accent; e.currentTarget.style.transform = "translateY(-1px)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = c.borderDim; e.currentTarget.style.transform = "translateY(0)"; }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, border: `1px solid ${c.borderDim}`, overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface2)" }}>
                        {c.logo}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: "0 0 2px" }}>{c.name}</p>
                        <p style={{ fontSize: 11, color: "var(--text-dim)", margin: 0 }}>{c.id === "sheets" ? "Live Google Sheets sync" : `Default port: ${c.port}`}</p>
                      </div>
                      <ArrowRight size={15} style={{ color: "var(--text-dim)" }} />
                    </button>
                  ))}
                </div>
              )}

              {panel === "form" && connType !== "sheets" && (
                <DBForm type={connType} onBack={() => setPanel("pick")} onSuccess={handleSuccess}
                  onBrowse={data => { setBrowse(data); }} />
              )}
              {panel === "form" && connType === "sheets" && (
                <SheetsForm onBack={() => setPanel("pick")} onSuccess={handleSuccess} />
              )}
            </div>
          </div>
        </>
      )}

      {/* TableBrowserModal is a full-screen overlay */}
      {browse && (
        <TableBrowserModal
          connStr={browse.connStr} dbType={browse.dbType} connName={browse.name} tables={browse.tables}
          onClose={closePanel}
          onSave={async result => {
            const ds = await fetch(`${API_ROOT}/api/datasets/${result.dataset_id}`, { headers: withAuthHeaders() }).then(r => r.json()).catch(() => null);
            if (ds) handleSuccess(ds);
            else closePanel();
          }}
        />
      )}

      {/* Request Access Modal */}
      {requestTarget && (
        <RequestAccessModal
          dataset={requestTarget}
          onClose={() => setRequestTarget(null)}
          onSent={() => { setRequestTarget(null); load(); }}
        />
      )}

      <style>{`@keyframes slideInRight { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}

/* ── DB Card ── */
function DBCard({ ds, isAdmin, onOpen, onDelete, onToggleRestrict, onRequestAccess }: {
  ds: DatasetEx;
  isAdmin: boolean;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onToggleRestrict: (e: React.MouseEvent) => void;
  onRequestAccess: () => void;
}) {
  const [hover, setHover] = useState(false);
  const meta = SOURCE_META[ds.source_type] || { label: ds.source_type, color: "var(--accent)" };
  const locked = ds.has_access === false;

  return (
    <div
      onClick={locked ? undefined : onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "18px 20px", borderRadius: 14,
        border: `1.5px solid ${locked ? "var(--border)" : hover ? "var(--border-accent)" : "var(--border)"}`,
        background: locked ? "var(--surface3)" : hover ? "var(--surface)" : "var(--surface2)",
        cursor: locked ? "default" : "pointer",
        transition: "all 140ms ease", display: "flex", flexDirection: "column", gap: 12,
        opacity: locked ? 0.75 : 1,
        position: "relative" as const,
      }}>

      {/* Restricted badge for admin */}
      {isAdmin && ds.is_restricted && (
        <div style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 5, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <Lock size={9} style={{ color: "#f59e0b" }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b" }}>Restricted</span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: locked ? "var(--surface2)" : "var(--accent-dim)", border: `1px solid ${locked ? "var(--border)" : "var(--border-accent)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {locked
              ? <Lock size={14} style={{ color: "var(--text-dim)" }} />
              : <Database size={15} style={{ color: "var(--accent)" }} />}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: locked ? "var(--text-dim)" : "var(--text)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{ds.name}</p>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: `${meta.color}18`, color: locked ? "var(--text-dim)" : meta.color, border: `1px solid ${meta.color}30`, letterSpacing: "0.04em" }}>{meta.label}</span>
          </div>
        </div>
        {!locked && isAdmin && (
          <button onClick={onDelete}
            style={{ padding: 5, borderRadius: 5, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", opacity: hover ? 1 : 0, transition: "opacity 100ms ease", display: "flex" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {locked ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 11, color: "var(--text-dim)", margin: 0 }}>You don't have access to this database.</p>
          <button onClick={e => { e.stopPropagation(); onRequestAccess(); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 0", borderRadius: 8, border: "1px solid var(--border-accent)", background: "var(--accent-dim)", color: "var(--accent-light)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--accent-dim)")}>
            <Send size={11} /> Request Access
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Activity size={11} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{ds.row_count?.toLocaleString() ?? "live"} rows</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isAdmin && (
              <button onClick={onToggleRestrict}
                style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", cursor: "pointer", opacity: hover ? 1 : 0, transition: "opacity 100ms ease" }}>
                {ds.is_restricted ? "Unrestrict" : "Restrict"}
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--accent-light)", fontWeight: 500, opacity: hover ? 1 : 0.6, transition: "opacity 100ms ease" }}>
              Open <ExternalLink size={10} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Request Access Modal ── */
function RequestAccessModal({ dataset, onClose, onSent }: { dataset: DatasetEx; onClose: () => void; onSent: () => void }) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError]   = useState("");

  const send = async () => {
    if (!reason.trim()) { setError("Please provide a reason."); return; }
    setSending(true); setError("");
    const res = await fetch(`${API_ROOT}/api/access-requests/`, {
      method: "POST",
      headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ dataset_id: dataset.id, reason: reason.trim() }),
    });
    setSending(false);
    if (res.ok) { onSent(); }
    else { const e = await res.json().catch(() => ({})); setError(e.detail || "Failed to send request."); }
  };

  return (
    <div className="modal-backdrop" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 16, width: "100%", maxWidth: 420, boxShadow: "0 25px 50px rgba(0,0,0,0.35)" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Lock size={13} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Request Access</p>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-dim)" }}>{dataset.name}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", padding: 4 }}><X size={15} /></button>
        </div>
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            Your request will be sent to the admin. Explain why you need access to this database.
          </p>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Reason</label>
            <textarea
              autoFocus rows={4}
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. I need to analyse sales data for the Q2 report…"
              style={{ width: "100%", background: "var(--surface3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "var(--text)", outline: "none", resize: "none", boxSizing: "border-box" as const, lineHeight: 1.6 }}
            />
          </div>
          {error && <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={send} disabled={sending || !reason.trim()}
              style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 0", borderRadius: 9, border: "none", background: "linear-gradient(135deg,var(--accent),var(--accent2))", color: "#fff", fontSize: 13, fontWeight: 600, cursor: sending || !reason.trim() ? "not-allowed" : "pointer", opacity: sending || !reason.trim() ? 0.5 : 1 }}>
              {sending ? <AISpinner size={13} /> : <Send size={13} />}
              {sending ? "Sending…" : "Send Request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── DB Form ── */
function DBForm({ type, onBack, onSuccess, onBrowse }: {
  type: "mysql" | "postgres";
  onBack: () => void;
  onSuccess: (d: Dataset) => void;
  onBrowse: (d: { connStr: string; tables: string[]; name: string; dbType: string }) => void;
}) {
  const connector = CONNECTORS.find(c => c.id === type)!;
  const [name, setName]         = useState("");
  const [host, setHost]         = useState("");
  const [port, setPort]         = useState(connector.port);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loadMode, setLoadMode] = useState<LoadMode>("all");
  const [tableOrQuery, setTableOrQuery] = useState("");
  const [loading, setLoading]   = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; tables?: string[]; error?: string } | null>(null);
  const [error, setError]       = useState("");

  const payload = () => ({ name, host, port: Number(port), database, username, password, db_type: type });
  const buildConn = () => `${type === "postgres" ? "postgresql" : "mysql+pymysql"}://${username}:${password}@${host}:${port}/${database}`;

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setError("");
    const res = await fetch(`${BASE}/db/test`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(payload()),
    }).then(r => r.json()).catch(e => ({ success: false, error: String(e) }));
    setTestResult(res); setTesting(false);
  };

  const handleConnect = async () => {
    setLoading(true); setError("");
    try {
      if (loadMode === "all") {
        const res = await fetch(`${BASE}/db/test`, {
          method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(payload()),
        }).then(r => r.json());
        if (!res.success) { setError(res.error || "Connection failed"); return; }
        onBrowse({ connStr: buildConn(), tables: [...(res.tables || []), ...(res.views || [])], name: name || database, dbType: type });
        return;
      }
      if (!tableOrQuery.trim()) { setError("Enter a table name or SQL query."); return; }
      const ds = await fetch(`${BASE}/datasets/connect-db-table`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...payload(), table_or_query: tableOrQuery }),
      }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e.detail)); return r.json(); });
      onSuccess(ds);
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : "Connection failed.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 12, padding: 0, alignSelf: "flex-start" }}>
        ← Back to connectors
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 }}>
        <Fld label="Connection name"><input className={inpCls} style={inp} placeholder="My Database" value={name} onChange={e => setName(e.target.value)} /></Fld>
        <Fld label="Port"><input className={inpCls} style={inp} value={port} onChange={e => setPort(e.target.value)} /></Fld>
      </div>
      <Fld label="Host / IP"><input className={inpCls} style={inp} placeholder="localhost or 192.168.1.1" value={host} onChange={e => setHost(e.target.value)} /></Fld>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Fld label="Database"><input className={inpCls} style={inp} placeholder="mydb" value={database} onChange={e => setDatabase(e.target.value)} /></Fld>
        <Fld label="Username"><input className={inpCls} style={inp} placeholder="root" value={username} onChange={e => setUsername(e.target.value)} /></Fld>
        <Fld label="Password"><input className={inpCls} style={inp} type="password" placeholder="••••••" value={password} onChange={e => setPassword(e.target.value)} /></Fld>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {([["all", LayoutGrid, "All tables", "Browse & pick tables"], ["specific", Table2, "Specific table", "One table or SQL"]] as const).map(([id, Icon, title, sub]) => (
          <button key={id} onClick={() => setLoadMode(id as LoadMode)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${loadMode === id ? "var(--accent)" : "var(--border)"}`, background: loadMode === id ? "var(--accent-dim)" : "var(--bg)", cursor: "pointer", textAlign: "left" }}>
            <Icon size={15} style={{ color: loadMode === id ? "var(--accent-light)" : "var(--text-dim)" }} />
            <div><p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", margin: "0 0 1px" }}>{title}</p><p style={{ fontSize: 10, color: "var(--text-dim)", margin: 0 }}>{sub}</p></div>
          </button>
        ))}
      </div>

      {loadMode === "specific" && (
        <Fld label="Table name or SQL query">
          <textarea className={inpCls + " resize-none font-mono text-xs"} style={{ ...inp, height: 60 }}
            placeholder="orders   or   SELECT * FROM orders" value={tableOrQuery} onChange={e => setTableOrQuery(e.target.value)} />
        </Fld>
      )}

      {loadMode === "all" && (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", color: "var(--accent-light)", fontSize: 12 }}>
          ✦ You'll browse and select tables in the next step
        </div>
      )}

      {testResult && (
        <div style={{ padding: "10px 12px", borderRadius: 8, fontSize: 12,
          ...(testResult.success ? { background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" } : { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }) }}>
          {testResult.success ? `✓ Connected — ${testResult.tables?.length} tables found` : testResult.error}
        </div>
      )}
      {error && <div style={{ padding: "10px 12px", borderRadius: 8, fontSize: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
        <button onClick={handleTest} disabled={testing}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, fontSize: 13, border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--bg)", cursor: "pointer", opacity: testing ? 0.6 : 1 }}>
          {testing ? <AISpinner size={13} /> : <CheckCircle2 size={13} />} Test
        </button>
        <button onClick={handleConnect} disabled={loading || !host || !database}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,var(--accent),var(--accent2))", border: "none", cursor: "pointer", opacity: (loading || !host || !database) ? 0.5 : 1, transition: "opacity 120ms ease" }}>
          {loading && <AISpinner size={13} />}
          {loading ? "Connecting…" : loadMode === "all" ? "Browse tables →" : "Connect"}
        </button>
      </div>
    </div>
  );
}

/* ── Sheets Form ── */
function SheetsForm({ onBack, onSuccess }: { onBack: () => void; onSuccess: (d: Dataset) => void }) {
  const [name, setName]   = useState("");
  const [url, setUrl]     = useState("");
  const [creds, setCreds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    setLoading(true); setError("");
    try {
      const ds = await fetch(`${BASE}/datasets/connect-sheets`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name, sheet_url: url, service_account_json: creds || undefined }),
      }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e.detail)); return r.json(); });
      onSuccess(ds);
    } catch (e: unknown) { setError(typeof e === "string" ? e : "Failed to load sheet."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 12, padding: 0, alignSelf: "flex-start" }}>
        ← Back to connectors
      </button>
      <Fld label="Name"><input className={inpCls} style={inp} placeholder="My spreadsheet" value={name} onChange={e => setName(e.target.value)} /></Fld>
      <Fld label="Google Sheets URL"><input className={inpCls} style={inp} placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={e => setUrl(e.target.value)} /></Fld>
      <Fld label="Service account JSON (optional — private sheets)">
        <textarea className={inpCls + " resize-none font-mono text-xs"} style={{ ...inp, height: 80 }} placeholder={'{ "type": "service_account" }'} value={creds} onChange={e => setCreds(e.target.value)} />
      </Fld>
      {error && <div style={{ padding: "10px 12px", borderRadius: 8, fontSize: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>{error}</div>}
      <button onClick={handleConnect} disabled={loading || !name || !url}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,var(--accent),var(--accent2))", border: "none", cursor: "pointer", opacity: (loading || !name || !url) ? 0.5 : 1 }}>
        {loading && <AISpinner size={13} />}
        {loading ? "Loading…" : "Connect sheet"}
      </button>
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>{label}</label>{children}</div>;
}

function MysqlLogo() {
  return <svg viewBox="0 0 48 48" width={28} height={28}><rect width="48" height="48" rx="8" fill="#b36a00"/><text x="24" y="32" fontFamily="Arial,sans-serif" fontSize="15" fontWeight="bold" fill="#ffe0a0" textAnchor="middle">My</text></svg>;
}
function PgLogo() {
  return <svg viewBox="0 0 48 48" width={28} height={28}><rect width="48" height="48" rx="8" fill="#1a3f5c"/><text x="24" y="32" fontFamily="Georgia,serif" fontSize="18" fontWeight="bold" fill="#a8d5f5" textAnchor="middle">Pg</text></svg>;
}
function SheetsLogo() {
  return <svg viewBox="0 0 48 48" width={28} height={28}><rect width="48" height="48" rx="8" fill="#0F9D58"/><rect x="13" y="15" width="22" height="18" rx="2" fill="white" opacity="0.25"/><rect x="15" y="19" width="9" height="2" rx="1" fill="white"/><rect x="15" y="23" width="18" height="2" rx="1" fill="white"/><rect x="15" y="27" width="14" height="2" rx="1" fill="white"/></svg>;
}
