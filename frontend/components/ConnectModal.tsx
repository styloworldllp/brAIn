"use client";
import { useState } from "react";
import { X, Database, Loader2, CheckCircle2, Sheet } from "lucide-react";
import { connectDB, connectSheets, testDB, Dataset } from "@/lib/api";

type Tab = "db" | "sheets";

interface Props {
  onClose: () => void;
  onSuccess: (dataset: Dataset) => void;
}

export default function ConnectModal({ onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<Tab>("db");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#12141f] border border-[#1e2235] rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2235]">
          <h2 className="text-sm font-semibold text-[#e8eaf0]">Connect data source</h2>
          <button onClick={onClose} className="text-[#3e4357] hover:text-[#8b90a8]"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mx-6 mt-4 mb-1 bg-[#0d0f1a] rounded-lg p-1">
          {([["db", Database, "Database"], ["sheets", Sheet, "Google Sheets"]] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors
                ${tab === id ? "bg-violet-600 text-white" : "text-[#8b90a8] hover:text-[#e8eaf0]"}`}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "db"
            ? <DBForm onClose={onClose} onSuccess={onSuccess} />
            : <SheetsForm onClose={onClose} onSuccess={onSuccess} />}
        </div>
      </div>
    </div>
  );
}

const inputClass = "w-full bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] placeholder-[#3e4357] focus:outline-none focus:border-violet-500/60 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#8b90a8] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function DBForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: (d: Dataset) => void }) {
  const [form, setForm] = useState({
    name: "", db_type: "mysql", host: "", port: "3306", database: "", username: "", password: "",
  });
  const [loading, setLoading]     = useState(false);
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; tables?: string[]; error?: string } | null>(null);
  const [error, setError]         = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const payload = () => ({ ...form, port: Number(form.port) });

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    const res = await testDB(payload());
    setTestResult(res);
    setTesting(false);
  };

  const handleConnect = async () => {
    setLoading(true); setError("");
    try {
      const ds = await connectDB(payload());
      onSuccess(ds); onClose();
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : "Connection failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Connection name">
          <input className={inputClass} placeholder="My database" value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={form.db_type} onChange={set("db_type")}
            onChange={(e) => { set("db_type")(e); setForm(f => ({ ...f, port: e.target.value === "postgres" ? "5432" : "3306" })); }}>
            <option value="mysql">MySQL</option>
            <option value="postgres">PostgreSQL</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Host / IP address">
            <input className={inputClass} placeholder="172.188.216.170" value={form.host} onChange={set("host")} />
          </Field>
        </div>
        <Field label="Port">
          <input className={inputClass} placeholder="3306" value={form.port} onChange={set("port")} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Database name">
          <input className={inputClass} placeholder="mydb" value={form.database} onChange={set("database")} />
        </Field>
        <Field label="Username">
          <input className={inputClass} placeholder="root" value={form.username} onChange={set("username")} />
        </Field>
        <Field label="Password">
          <input className={inputClass} type="password" placeholder="••••••" value={form.password} onChange={set("password")} />
        </Field>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
        <span className="text-violet-400 text-xs mt-0.5">✦</span>
        <p className="text-xs text-violet-300">
          All tables in this database will be loaded automatically. You can query and join any of them in chat.
        </p>
      </div>

      {testResult && (
        <div className={`px-3 py-2 rounded-lg text-xs border ${testResult.success ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
          {testResult.success
            ? <><span className="font-medium">Connected!</span> Found {testResult.tables?.length} tables: {testResult.tables?.join(", ")}</>
            : testResult.error}
        </div>
      )}
      {error && <div className="px-3 py-2 rounded-lg text-xs bg-red-500/10 border border-red-500/20 text-red-400">{error}</div>}

      <div className="flex gap-2 pt-1">
        <button onClick={handleTest} disabled={testing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1e2235] text-sm text-[#8b90a8] hover:text-[#e8eaf0] disabled:opacity-50 transition-colors">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Test connection
        </button>
        <button onClick={handleConnect} disabled={loading || !form.name || !form.host || !form.database}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors">
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? "Loading all tables…" : "Connect & load all tables"}
        </button>
      </div>
    </div>
  );
}

function SheetsForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: (d: Dataset) => void }) {
  const [name, setName]   = useState("");
  const [url, setUrl]     = useState("");
  const [creds, setCreds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    setLoading(true); setError("");
    try {
      const ds = await connectSheets({ name, sheet_url: url, service_account_json: creds || undefined });
      onSuccess(ds); onClose();
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : "Could not load sheet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Name">
        <input className={inputClass} placeholder="Q3 Sales Sheet" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Google Sheets URL">
        <input className={inputClass} placeholder="https://docs.google.com/spreadsheets/d/..." value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Service account JSON (optional — for private sheets)">
        <textarea className={`${inputClass} resize-none h-24 font-mono text-xs`}
          placeholder={'{\n  "type": "service_account",\n  ...\n}'}
          value={creds} onChange={(e) => setCreds(e.target.value)} />
      </Field>
      <div className="text-xs text-[#8b90a8] bg-[#0d0f1a] rounded-lg p-3 border border-[#1e2235]">
        <p className="font-medium text-[#e8eaf0] mb-1">Public sheets:</p>
        <p>Share → Anyone with the link → Viewer. Paste the URL above, leave JSON empty.</p>
      </div>
      {error && <div className="px-3 py-2 rounded-lg text-xs bg-red-500/10 border border-red-500/20 text-red-400">{error}</div>}
      <button onClick={handleConnect} disabled={loading || !name || !url}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors">
        {loading ? <Loader2 size={14} className="animate-spin" /> : null}
        {loading ? "Loading sheet…" : "Connect sheet"}
      </button>
    </div>
  );
}
