"use client";
import { useState } from "react";
import { AISpinner } from "./AISpinner";
import { X, CheckCircle2, LayoutGrid, Table2 } from "lucide-react";
import { Dataset } from "@/lib/api";
import { withAuthHeaders } from "@/lib/auth";
import TableBrowserModal from "./TableBrowserModal";

type ConnectorType = "postgres" | "mysql" | "sheets";
type LoadMode = "all" | "specific";
type Step = "pick" | "form" | "browse";

interface Props { onClose: () => void; onSuccess: (dataset: Dataset) => void; }

const CONNECTORS = [
  {
    id: "mysql" as ConnectorType, name: "MySQL", defaultPort: "3306",
    borderActive: "border-orange-500", bgActive: "bg-orange-500/10",
    border: "border-orange-500/30", bg: "bg-orange-500/5",
    logo: <svg viewBox="0 0 48 48" className="w-8 h-8"><rect width="48" height="48" rx="10" fill="#b36a00"/><text x="24" y="32" fontFamily="Arial,sans-serif" fontSize="16" fontWeight="bold" fill="#ffe0a0" textAnchor="middle">My</text></svg>,
  },
  {
    id: "postgres" as ConnectorType, name: "PostgreSQL", defaultPort: "5432",
    borderActive: "border-blue-500", bgActive: "bg-blue-500/10",
    border: "border-blue-500/30", bg: "bg-blue-500/5",
    logo: <svg viewBox="0 0 48 48" className="w-8 h-8"><rect width="48" height="48" rx="10" fill="#1a3f5c"/><text x="24" y="32" fontFamily="Georgia,serif" fontSize="20" fontWeight="bold" fill="#a8d5f5" textAnchor="middle">Pg</text></svg>,
  },
  {
    id: "sheets" as ConnectorType, name: "Google Sheets", defaultPort: "",
    borderActive: "border-green-500", bgActive: "bg-green-500/10",
    border: "border-green-500/30", bg: "bg-green-500/5",
    logo: <svg viewBox="0 0 48 48" className="w-8 h-8"><rect width="48" height="48" rx="10" fill="#0F9D58"/><rect x="13" y="15" width="22" height="18" rx="2" fill="white" opacity="0.2"/><rect x="15" y="19" width="9" height="2" rx="1" fill="white"/><rect x="15" y="23" width="18" height="2" rx="1" fill="white"/><rect x="15" y="27" width="14" height="2" rx="1" fill="white"/></svg>,
  },
];

const inp = { background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" };
const inpClass = "w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-1 focus:ring-[var(--accent)]";

/* ── Root: manages all steps at the top level ── */
export default function ConnectModal({ onClose, onSuccess }: Props) {
  const [step, setStep]             = useState<Step>("pick");
  const [connType, setConnType]     = useState<ConnectorType>("mysql");
  const [browseState, setBrowseState] = useState<{ connStr: string; tables: string[]; name: string; dbType: string } | null>(null);

  const handleDBReady = (data: { connStr: string; tables: string[]; name: string; dbType: string }) => {
    setBrowseState(data);
    setStep("browse");
  };

  return (
    <div className="modal-backdrop" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 16, width: "100%", maxWidth: 512, boxShadow: "0 25px 50px rgba(0,0,0,0.35)" }}>

        {step !== "browse" && (
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Connect data source</h2>
            <button onClick={onClose} style={{ color: "var(--text-dim)" }} className="hover:opacity-70"><X size={16} /></button>
          </div>
        )}

        <div className={step === "browse" ? "" : "p-6"}>
          {step === "pick" && (
            <div>
              <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Choose a connector</p>
              <div className="grid grid-cols-3 gap-3">
                {CONNECTORS.map(c => (
                  <button key={c.id}
                    onClick={() => { setConnType(c.id); setStep("form"); }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${c.border} ${c.bg} hover:opacity-90`}>
                    {c.logo}
                    <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "form" && connType !== "sheets" && (
            <DBForm
              type={connType as "mysql" | "postgres"}
              connector={CONNECTORS.find(c => c.id === connType)!}
              onBack={() => setStep("pick")}
              onClose={onClose}
              onSuccess={onSuccess}
              onOpenBrowser={handleDBReady}
            />
          )}

          {step === "form" && connType === "sheets" && (
            <SheetsForm onBack={() => setStep("pick")} onClose={onClose} onSuccess={onSuccess} />
          )}

          {step === "browse" && browseState && (
            <TableBrowserModal
              connStr={browseState.connStr}
              dbType={browseState.dbType}
              connName={browseState.name}
              tables={browseState.tables}
              onClose={onClose}
              onSave={async (result) => {
                const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
                const ds = await fetch(`${API}/api/datasets/${result.dataset_id}`, { headers: withAuthHeaders() })
                  .then(r => r.json()).catch(() => null);
                if (ds) onSuccess(ds);
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── DB Form ── */
function DBForm({ type, connector, onBack, onClose, onSuccess, onOpenBrowser }: {
  type: "mysql" | "postgres";
  connector: (typeof CONNECTORS)[0];
  onBack: () => void; onClose: () => void;
  onSuccess: (d: Dataset) => void;
  onOpenBrowser: (d: { connStr: string; tables: string[]; name: string; dbType: string }) => void;
}) {
  const [name, setName]         = useState("");
  const [host, setHost]         = useState("");
  const [port, setPort]         = useState(connector.defaultPort);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loadMode, setLoadMode] = useState<LoadMode>("all");
  const [tableOrQuery, setTableOrQuery] = useState("");
  const [loading, setLoading]   = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; tables?: string[]; error?: string } | null>(null);
  const [error, setError]       = useState("");

  const buildConnStr = () => {
    const prefix = type === "postgres" ? "postgresql" : "mysql+pymysql";
    return `${prefix}://${username}:${password}@${host}:${port}/${database}`;
  };

  const payload = () => ({ name, host, port: Number(port), database, username, password, db_type: type });

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setError("");
    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const res = await fetch(`${API}/api/db/test`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload()),
    }).then(r => r.json()).catch(e => ({ success: false, error: String(e) }));
    setTestResult(res); setTesting(false);
  };

  const handleConnect = async () => {
    setLoading(true); setError("");
    try {
      const API2 = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      if (loadMode === "all") {
        const res = await fetch(`${API2}/api/db/test`, {
          method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload()),
        }).then(r => r.json());
        if (!res.success) { setError(res.error || "Connection failed"); return; }
        onOpenBrowser({
          connStr: buildConnStr(),
          tables: [...(res.tables || []), ...(res.views || [])],
          name: name || database,
          dbType: type,
        });
        return;
      }
      if (!tableOrQuery.trim()) { setError("Enter a table name or SQL query."); return; }
      const ds = await fetch(`${API2}/api/datasets/connect-db-table`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...payload(), table_or_query: tableOrQuery }),
      }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e.detail)); return r.json(); });
      onSuccess(ds); onClose();
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : "Connection failed.");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onBack} className="text-xs hover:opacity-70" style={{ color: "var(--text-dim)" }}>← Back</button>
        <div className="flex items-center gap-2">{connector.logo}<span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{connector.name}</span></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Fld label="Connection name"><input className={inpClass} style={inp} placeholder="My DB" value={name} onChange={e => setName(e.target.value)} /></Fld>
        <Fld label="Port"><input className={inpClass} style={inp} value={port} onChange={e => setPort(e.target.value)} /></Fld>
      </div>
      <Fld label="Host / IP"><input className={inpClass} style={inp} placeholder="localhost" value={host} onChange={e => setHost(e.target.value)} /></Fld>
      <div className="grid grid-cols-3 gap-3">
        <Fld label="Database"><input className={inpClass} style={inp} placeholder="mydb" value={database} onChange={e => setDatabase(e.target.value)} /></Fld>
        <Fld label="Username"><input className={inpClass} style={inp} placeholder="root" value={username} onChange={e => setUsername(e.target.value)} /></Fld>
        <Fld label="Password"><input className={inpClass} style={inp} type="password" placeholder="••••••" value={password} onChange={e => setPassword(e.target.value)} /></Fld>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {([["all", LayoutGrid, "All tables (live)", "Browse & select tables"] , ["specific", Table2, "Specific table", "One table or query"]] as const).map(([id, Icon, title, sub]) => (
          <button key={id} onClick={() => setLoadMode(id)}
            className="flex items-center gap-2 p-3 rounded-xl text-left transition-all"
            style={{ border: `2px solid ${loadMode === id ? "var(--accent)" : "var(--border)"}`, background: loadMode === id ? "var(--accent-dim)" : "var(--bg)" }}>
            <Icon size={15} style={{ color: loadMode === id ? "var(--accent-light)" : "var(--text-dim)" }} />
            <div><p className="text-xs font-medium" style={{ color: "var(--text)" }}>{title}</p><p className="text-[10px]" style={{ color: "var(--text-dim)" }}>{sub}</p></div>
          </button>
        ))}
      </div>

      {loadMode === "specific" && (
        <Fld label="Table name or SQL">
          <textarea className={inpClass + " resize-none h-16 font-mono text-xs"} style={inp}
            placeholder="orders   or   SELECT * FROM orders" value={tableOrQuery} onChange={e => setTableOrQuery(e.target.value)} />
        </Fld>
      )}

      {loadMode === "all" && (
        <div className="px-3 py-2.5 rounded-lg text-xs" style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-glow)", color: "#6ee7b7" }}>
          ✦ Queries run live on your DB — you'll pick tables and configure PII next
        </div>
      )}

      {testResult && (
        <div className="px-3 py-2 rounded-lg text-xs"
          style={testResult.success
            ? { background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }
            : { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          {testResult.success ? `✓ Connected! Found ${testResult.tables?.length} tables` : testResult.error}
        </div>
      )}
      {error && <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>{error}</div>}

      <div className="flex gap-2 pt-1">
        <button onClick={handleTest} disabled={testing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
          style={{ border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--bg)" }}>
          {testing ? <AISpinner size={13} /> : <CheckCircle2 size={13} />} Test
        </button>
        <button onClick={handleConnect} disabled={loading || !host || !database}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:opacity-90 transition-all"
          style={{ background: "linear-gradient(135deg,var(--accent),var(--accent2))" }}>
          {loading && <AISpinner size={13} />}
          {loading ? "Connecting…" : loadMode === "all" ? "Browse tables →" : "Connect"}
        </button>
      </div>
    </div>
  );
}

/* ── Sheets Form ── */
function SheetsForm({ onBack, onClose, onSuccess }: { onBack: () => void; onClose: () => void; onSuccess: (d: Dataset) => void }) {
  const [name, setName]   = useState("");
  const [url, setUrl]     = useState("");
  const [creds, setCreds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    setLoading(true); setError("");
    try {
      const API3 = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const ds = await fetch(`${API3}/api/datasets/connect-sheets`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name, sheet_url: url, service_account_json: creds || undefined }),
      }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e.detail)); return r.json(); });
      onSuccess(ds); onClose();
    } catch (e: unknown) { setError(typeof e === "string" ? e : "Failed to load sheet."); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onBack} className="text-xs hover:opacity-70" style={{ color: "var(--text-dim)" }}>← Back</button>
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Google Sheets</span>
      </div>
      <Fld label="Name"><input className={inpClass} style={inp} placeholder="My spreadsheet" value={name} onChange={e => setName(e.target.value)} /></Fld>
      <Fld label="Google Sheets URL"><input className={inpClass} style={inp} placeholder="https://docs.google.com/spreadsheets/d/..." value={url} onChange={e => setUrl(e.target.value)} /></Fld>
      <Fld label="Service account JSON (optional — for private sheets)">
        <textarea className={inpClass + " resize-none h-20 font-mono text-xs"} style={inp} placeholder={'{ "type": "service_account" }'} value={creds} onChange={e => setCreds(e.target.value)} />
      </Fld>
      {error && <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>{error}</div>}
      <button onClick={handleConnect} disabled={loading || !name || !url}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
        style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}>
        {loading && <AISpinner size={13} />}
        {loading ? "Loading…" : "Connect sheet"}
      </button>
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>{label}</label>{children}</div>;
}
