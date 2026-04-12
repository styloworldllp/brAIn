"use client";
import { useState, useEffect } from "react";
import { X, Eye, EyeOff, CheckCircle2, Loader2, Zap } from "lucide-react";

interface Settings {
  provider: string;
  anthropic_model: string;
  openai_model: string;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
}

interface Props {
  onClose: () => void;
}

const BASE = "http://localhost:8000/api";

const ANTHROPIC_MODELS = [
  { value: "claude-opus-4-6",    label: "Claude Opus 4 (most capable)" },
  { value: "claude-sonnet-4-6",  label: "Claude Sonnet 4 (fast + smart)" },
  { value: "claude-haiku-4-5-20251001",   label: "Claude Haiku (fastest)" },
];

const OPENAI_MODELS = [
  { value: "gpt-4o",      label: "GPT-4o (most capable)" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini (faster)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

const inputClass =
  "w-full bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] placeholder-[#3e4357] focus:outline-none focus:border-violet-500/60 transition-colors";

export default function SettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [provider, setProvider] = useState("anthropic");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicModel, setAnthropicModel] = useState("claude-opus-4-6");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/settings/`)
      .then((r) => r.json())
      .then((s: Settings) => {
        setSettings(s);
        setProvider(s.provider);
        setAnthropicModel(s.anthropic_model);
        setOpenaiModel(s.openai_model);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const body: Record<string, string> = {
      provider,
      anthropic_model: anthropicModel,
      openai_model: openaiModel,
    };
    if (anthropicKey) body.anthropic_api_key = anthropicKey;
    if (openaiKey)    body.openai_api_key    = openaiKey;

    await fetch(`${BASE}/settings/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#12141f] border border-[#1e2235] rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2235]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Zap size={12} className="text-white" />
            </div>
            <h2 className="text-sm font-semibold text-[#e8eaf0]">AI Provider Settings</h2>
          </div>
          <button onClick={onClose} className="text-[#3e4357] hover:text-[#8b90a8] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Provider selector */}
          <div>
            <label className="block text-xs font-medium text-[#8b90a8] mb-2">AI Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "anthropic", name: "Anthropic", tag: "Claude" },
                { id: "openai",    name: "OpenAI",    tag: "GPT-4" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-all text-left
                    ${provider === p.id
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-[#1e2235] bg-[#0d0f1a] hover:border-[#2e3347]"}`}
                >
                  <span className="text-sm font-medium text-[#e8eaf0]">{p.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium
                    ${p.id === "anthropic" ? "bg-violet-500/20 text-violet-400" : "bg-green-500/20 text-green-400"}`}>
                    {p.tag}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Anthropic section */}
          {provider === "anthropic" && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#8b90a8] mb-1.5">
                  Anthropic API Key
                  {settings?.has_anthropic_key && (
                    <span className="ml-2 text-green-400 text-[10px]">✓ key saved</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showAnthropicKey ? "text" : "password"}
                    className={inputClass + " pr-9"}
                    placeholder={settings?.has_anthropic_key ? "Leave blank to keep existing key" : "sk-ant-..."}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                  />
                  <button
                    onClick={() => setShowAnthropicKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3e4357] hover:text-[#8b90a8]"
                  >
                    {showAnthropicKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[10px] text-[#3e4357] mt-1">
                  Get your key at{" "}
                  <a href="https://console.anthropic.com" target="_blank" className="text-violet-400 hover:underline">
                    console.anthropic.com
                  </a>
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8b90a8] mb-1.5">Model</label>
                <select
                  className={inputClass}
                  value={anthropicModel}
                  onChange={(e) => setAnthropicModel(e.target.value)}
                >
                  {ANTHROPIC_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* OpenAI section */}
          {provider === "openai" && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#8b90a8] mb-1.5">
                  OpenAI API Key
                  {settings?.has_openai_key && (
                    <span className="ml-2 text-green-400 text-[10px]">✓ key saved</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showOpenaiKey ? "text" : "password"}
                    className={inputClass + " pr-9"}
                    placeholder={settings?.has_openai_key ? "Leave blank to keep existing key" : "sk-..."}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                  />
                  <button
                    onClick={() => setShowOpenaiKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3e4357] hover:text-[#8b90a8]"
                  >
                    {showOpenaiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[10px] text-[#3e4357] mt-1">
                  Get your key at{" "}
                  <a href="https://platform.openai.com/api-keys" target="_blank" className="text-green-400 hover:underline">
                    platform.openai.com
                  </a>
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8b90a8] mb-1.5">Model</label>
                <select
                  className={inputClass}
                  value={openaiModel}
                  onChange={(e) => setOpenaiModel(e.target.value)}
                >
                  {OPENAI_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : null}
            {saving ? "Saving…" : saved ? "Saved!" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
