"use client";
import { useState } from "react";
import { X, Database, Sheet, Loader2, CheckCircle2 } from "lucide-react";
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[#e8eaf0]">Connect data source</h2>
          <button onClick={onClose} className="text-[#8b90a8] hover:text-[#e8eaf0]"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-[#0f1117] rounded-lg p-1">
          {([["db", Database, "Database"], ["sheets", Sheet, "Google Sheets"]] as const).map(
            ([id, Icon, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors
                  ${tab === id ? "bg-[#6c63ff] text-white" : "text-[#8b90a8] hover:text-[#e8eaf0]"}`}
              >
                <Icon size={14} />
                {label}
              </button>
            )
          )}
        </div>

        {tab === "db" ? <DBForm onClose={onClose} onSuccess={onSuccess} /> : <SheetsForm onClose={onClose} onSuccess={onSuccess} />}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#8b90a8] mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full bg-[#0f1117] border border-[#2e3347] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] placeholder-[#3e4357] focus:outline-none focus:border-[#6c63ff] transition-colors";

function DBForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: (d: Dataset) => void }) {
  const [form, setForm] = useState({
    name: "",
    db_type: "postgres",
    host: "localhost",
    port: "5432",
    database: "",
    username: "",
    password: "",
    table_or_query: "",
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; tables?: string[]; error?: string } | null>(null);
  const [error, setError] = useState("");

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const payload = () => ({ ...form, port: Number(form.port) });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await testDB(payload());
    setTestResult(res);
    setTesting(false);
  };

  const handleConnect = async () => {
    setLoading(true);
    setError("");
    try {
      const ds = await connectDB(payload());
      onSuccess(ds);
      onClose();
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : "Connection failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input className={inputClass} placeholder="My database" value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={form.db_type} onChange={set("db_type")}>
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Host">
            <input className={inputClass} placeholder="localhost" value={form.host} onChange={set("host")} />
          </Field>
        </div>
        <Field label="Port">
          <input className={inputClass} placeholder="5432" value={form.port} onChange={set("port")} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Database">
          <input className={inputClass} placeholder="mydb" value={form.database} onChange={set("database")} />
        </Field>
        <Field label="Username">
          <input className={inputClass} placeholder="user" value={form.username} onChange={set("username")} />
        </Field>
        <Field label="Password">
          <input className={inputClass} type="password" placeholder="••••••" value={form.password} onChange={set("password")} />
        </Field>
      </div>
      <Field label="Table name or SQL query">
        <textarea
          className={`${inputClass} resize-none h-20 font-mono text-xs`}
          placeholder={"orders\n-- or --\nSELECT * FROM orders WHERE status = 'active'"}
          value={form.table_or_query}
          onChange={set("table_or_query")}
        />
      </Field>

      {testResult && (
        <div className={`px-3 py-2 rounded-lg text-xs border ${testResult.success ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
          {testResult.success
            ? `Connected! Tables: ${testResult.tables?.join(", ") || "none"}`
            : testResult.error}
        </div>
      )}
      {error && <div className="px-3 py-2 rounded-lg text-xs bg-red-500/10 border border-red-500/20 text-red-400">{error}</div>}

      <div className="flex gap-2 pt-1">
        <button onClick={handleTest} disabled={testing} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2e3347] text-sm text-[#8b90a8] hover:text-[#e8eaf0] transition-colors disabled:opacity-50">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Test
        </button>
        <button
          onClick={handleConnect}
          disabled={loading || !form.name || !form.database || !form.table_or_query}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[#6c63ff] text-white text-sm font-medium hover:bg-[#7c73ff] disabled:opacity-40 transition-colors"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? "Connecting…" : "Connect & load data"}
        </button>
      </div>
    </div>
  );
}

function SheetsForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: (d: Dataset) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [creds, setCreds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    setLoading(true);
    setError("");
    try {
      const ds = await connectSheets({ name, sheet_url: url, service_account_json: creds || undefined });
      onSuccess(ds);
      onClose();
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
        <input
          className={inputClass}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <Field label="Service account JSON (optional — required for private sheets)">
        <textarea
          className={`${inputClass} resize-none h-28 font-mono text-xs`}
          placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
          value={creds}
          onChange={(e) => setCreds(e.target.value)}
        />
      </Field>

      <div className="text-xs text-[#8b90a8] bg-[#0f1117] rounded-lg p-3 border border-[#2e3347]">
        <p className="font-medium text-[#e8eaf0] mb-1">Public sheets (no credentials needed):</p>
        <p>Share your sheet → Anyone with the link → Viewer. Paste the URL above.</p>
        <p className="mt-2 font-medium text-[#e8eaf0]">Private sheets:</p>
        <p>Create a Google Cloud service account, share the sheet with its email, and paste the JSON above.</p>
      </div>

      {error && <div className="px-3 py-2 rounded-lg text-xs bg-red-500/10 border border-red-500/20 text-red-400">{error}</div>}

      <button
        onClick={handleConnect}
        disabled={loading || !name || !url}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#6c63ff] text-white text-sm font-medium hover:bg-[#7c73ff] disabled:opacity-40 transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : null}
        {loading ? "Loading sheet…" : "Connect sheet"}
      </button>
    </div>
  );
}
