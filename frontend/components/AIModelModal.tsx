"use client";
import { useState, useEffect } from "react";
import { AISpinner } from "./AISpinner";
import { X, Eye, EyeOff, CheckCircle2, Cpu } from "lucide-react";
import { withAuthHeaders } from "@/lib/auth";

const BASE = "http://localhost:8000/api";
interface Props { onClose: () => void; }
const inputClass = "w-full bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] placeholder-[#3e4357] focus:outline-none focus:border-[#00c896]/60 transition-colors";

const PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic",
    tagline: "brAIn default · Best for analysis",
    color: "border-[#00c896] bg-[#00c896]/10",
    dim: "border-[#1e2235] hover:border-[#00c896]/40",
    badge: "bg-[#00c896]/20 text-[#33d9ab]",
    badgeText: "Default",
    models: [
      { value: "claude-sonnet-4-6",  label: "Claude Sonnet 4 — Fast & smart (recommended)" },
      { value: "claude-opus-4-6",    label: "Claude Opus 4 — Most capable" },
      { value: "claude-haiku-4-5-20251001",   label: "Claude Haiku — Fastest" },
    ],
    keyPlaceholder: "sk-ant-...",
    keyLink: "https://console.anthropic.com",
    keyLinkText: "console.anthropic.com",
    logo: (
      <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0">
        <rect width="32" height="32" rx="8" fill="#059669"/>
        <text x="16" y="22" fontFamily="serif" fontSize="16" fontWeight="bold" fill="white" textAnchor="middle">A</text>
      </svg>
    ),
  },
  {
    id: "openai",
    name: "OpenAI",
    tagline: "Alternative engine · Widely used",
    color: "border-green-500 bg-green-500/10",
    dim: "border-[#1e2235] hover:border-green-500/40",
    badge: "bg-green-500/20 text-green-400",
    badgeText: "GPT-4",
    models: [
      { value: "gpt-4o",       label: "GPT-4o — Most capable" },
      { value: "gpt-4o-mini",  label: "GPT-4o Mini — Faster & cheaper" },
      { value: "gpt-4-turbo",  label: "GPT-4 Turbo" },
    ],
    keyPlaceholder: "sk-...",
    keyLink: "https://platform.openai.com/api-keys",
    keyLinkText: "platform.openai.com",
    logo: (
      <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0">
        <rect width="32" height="32" rx="8" fill="#10a37f"/>
        <text x="16" y="22" fontFamily="Arial,sans-serif" fontSize="14" fontWeight="bold" fill="white" textAnchor="middle">AI</text>
      </svg>
    ),
  },
  {
    id: "local",
    name: "Local / Ollama",
    tagline: "Run models on your Mac",
    color: "border-amber-500 bg-amber-500/10",
    dim: "border-[#1e2235] hover:border-amber-500/40",
    badge: "bg-amber-500/20 text-amber-400",
    badgeText: "Local",
    models: [
      { value: "llama3.2",     label: "Llama 3.2 (3B / 8B)" },
      { value: "mistral",      label: "Mistral 7B" },
      { value: "codellama",    label: "Code Llama" },
      { value: "custom",       label: "Custom model name" },
    ],
    keyPlaceholder: "Not required for Ollama",
    keyLink: "https://ollama.com",
    keyLinkText: "Download Ollama",
    logo: (
      <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0">
        <rect width="32" height="32" rx="8" fill="#92400e"/>
        <Cpu size={16} color="white" x="8" y="8" />
      </svg>
    ),
  },
];

export default function AIModelModal({ onClose }: Props) {
  const [provider, setProvider]   = useState("anthropic");
  const [aModel, setAModel]       = useState("claude-sonnet-4-6");
  const [oModel, setOModel]       = useState("gpt-4o");
  const [lModel, setLModel]       = useState("llama3.2");
  const [customModel, setCustomModel] = useState("");
  const [aKey, setAKey]           = useState("");
  const [oKey, setOKey]           = useState("");
  const [lUrl, setLUrl]           = useState("http://localhost:11434");
  const [showAKey, setShowAKey]   = useState(false);
  const [showOKey, setShowOKey]   = useState(false);
  const [hasAKey, setHasAKey]     = useState(false);
  const [hasOKey, setHasOKey]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const visibleProviders = PROVIDERS.filter(p => p.id !== "local");

  useEffect(() => {
    fetch(`${BASE}/settings/`, { headers: withAuthHeaders() }).then(r => r.json()).then(s => {
      const nextProvider = s.provider === "openai" ? "openai" : "anthropic";
      setProvider(nextProvider);
      setAModel(s.anthropic_model || "claude-sonnet-4-6");
      setOModel(s.openai_model || "gpt-4o");
      setHasAKey(!!s.has_anthropic_key);
      setHasOKey(!!s.has_openai_key);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const body: Record<string, string> = {
      provider,
      anthropic_model: aModel,
      openai_model: oModel,
    };
    if (aKey) body.anthropic_api_key = aKey;
    if (oKey) body.openai_api_key    = oKey;

    await fetch(`${BASE}/settings/`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 900);
  };

  const activeP = visibleProviders.find(p => p.id === provider) || visibleProviders[0];

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel bg-[#12141f] border border-[#1e2235] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2235]">
          <h2 className="text-sm font-semibold text-[#e8eaf0]">AI Model</h2>
          <button onClick={onClose} className="text-[#3e4357] hover:text-[#8b90a8]"><X size={16} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Provider cards */}
          <div>
            <label className="block text-xs font-medium text-[#8b90a8] mb-2">Provider</label>
            <div className="grid grid-cols-3 gap-2">
              {visibleProviders.map(p => (
                <button key={p.id} onClick={() => setProvider(p.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all
                    ${provider === p.id ? p.color : p.dim}`}>
                  {p.logo}
                  <span className="text-[11px] font-medium text-[#e8eaf0]">{p.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${p.badge}`}>{p.badgeText}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[#3e4357] mt-2 text-center">{activeP.tagline}</p>
          </div>

          {/* Anthropic config */}
          {provider === "anthropic" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#8b90a8] mb-1.5">
                  API Key {hasAKey && <span className="text-green-400 ml-1">✓ saved</span>}
                </label>
                <div className="relative">
                  <input type={showAKey ? "text" : "password"} className={inputClass + " pr-9"}
                    placeholder={hasAKey ? "Leave blank to keep existing key" : "sk-ant-..."}
                    value={aKey} onChange={e => setAKey(e.target.value)} />
                  <button onClick={() => setShowAKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3e4357] hover:text-[#8b90a8]">
                    {showAKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <p className="text-[10px] text-[#3e4357] mt-1">Get at <a href="https://console.anthropic.com" target="_blank" className="text-[#33d9ab] hover:underline">console.anthropic.com</a></p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8b90a8] mb-1.5">Model</label>
                <select className={inputClass} value={aModel} onChange={e => setAModel(e.target.value)}>
                  {PROVIDERS[0].models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* OpenAI config */}
          {provider === "openai" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#8b90a8] mb-1.5">
                  API Key {hasOKey && <span className="text-green-400 ml-1">✓ saved</span>}
                </label>
                <div className="relative">
                  <input type={showOKey ? "text" : "password"} className={inputClass + " pr-9"}
                    placeholder={hasOKey ? "Leave blank to keep existing key" : "sk-..."}
                    value={oKey} onChange={e => setOKey(e.target.value)} />
                  <button onClick={() => setShowOKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3e4357] hover:text-[#8b90a8]">
                    {showOKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <p className="text-[10px] text-[#3e4357] mt-1">Get at <a href="https://platform.openai.com/api-keys" target="_blank" className="text-green-400 hover:underline">platform.openai.com</a></p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8b90a8] mb-1.5">Model</label>
                <select className={inputClass} value={oModel} onChange={e => setOModel(e.target.value)}>
                  {PROVIDERS[1].models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Local / Ollama config */}
          {provider === "local" && (
            <div className="space-y-3">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 space-y-1">
                <p className="font-medium">Setup required:</p>
                <p>1. Install Ollama from <a href="https://ollama.com" target="_blank" className="underline">ollama.com</a></p>
                <p>2. Run: <code className="bg-black/30 px-1 rounded">ollama pull llama3.2</code></p>
                <p>3. Ollama runs at localhost:11434 by default</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8b90a8] mb-1.5">Ollama URL</label>
                <input className={inputClass} placeholder="http://localhost:11434" value={lUrl} onChange={e => setLUrl(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8b90a8] mb-1.5">Model</label>
                <select className={inputClass} value={lModel} onChange={e => setLModel(e.target.value)}>
                  {PROVIDERS[2].models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              {lModel === "custom" && (
                <input className={inputClass} placeholder="Enter model name (e.g. mixtral:8x7b)"
                  value={customModel} onChange={e => setCustomModel(e.target.value)} />
              )}
            </div>
          )}

          <button onClick={handleSave} disabled={saving || saved}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00a876] hover:bg-[#00c896] disabled:opacity-60 text-white text-sm font-medium transition-colors">
            {saving ? <AISpinner size={14} /> : saved ? <CheckCircle2 size={14} /> : null}
            {saving ? "Saving…" : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
