"use client";
import { useState, useEffect } from "react";
import {
  Plug, Cpu, Database, Cloud,
  Eye, EyeOff, CheckCircle2, Check, X,
  ChevronRight, Zap, Globe,
  Server, FileSpreadsheet, RefreshCw,
  Building2, Link2, Layers,
} from "lucide-react";
import { AISpinner } from "./AISpinner";
import { NeuronIcon } from "./NeuronIcon";
import { withAuthHeaders } from "@/lib/auth";
import { Dataset, fetchDatasets, deleteDataset, fetchNeurixStatus, NeurixStatus } from "@/lib/api";
import TableBrowserModal from "./TableBrowserModal";
import { useIsMobile } from "@/hooks/useIsMobile";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

type Tab = "ai" | "databases" | "erp" | "integrations";

/* ─── shared input style ─── */
const inp = {
  background: "var(--surface3)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box" as const,
};

export default function ConnectorsPage() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>("ai");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ padding: isMobile ? "12px 14px 0" : "20px 28px 0", background: "var(--surface2)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: isMobile ? 12 : 18 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px var(--accent-glow)", flexShrink: 0 }}>
            <Plug size={17} style={{ color: "#fff" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.3px" }}>Connectors</h1>
            {!isMobile && <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Manage AI providers, databases, and third-party integrations</p>}
          </div>
        </div>

        {/* Tab bar — scrollable on mobile */}
        <div style={{ display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
          {([
            ["ai",           Cpu,       "AI Models",    "AI"],
            ["databases",    Database,  "Databases",    "DBs"],
            ["erp",          Building2, "ERP",          "ERP"],
            ["integrations", Cloud,     "Integrations", "Apps"],
          ] as const).map(([id, Icon, label, shortLabel]) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)}
                style={{
                  display: "flex", alignItems: "center", gap: isMobile ? 5 : 7,
                  padding: isMobile ? "8px 14px" : "10px 18px",
                  fontSize: isMobile ? 12 : 13, fontWeight: active ? 600 : 400,
                  cursor: "pointer", background: "transparent", border: "none",
                  color: active ? "var(--accent-light)" : "var(--text-muted)",
                  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                  transition: "all 120ms ease", whiteSpace: "nowrap", flexShrink: 0,
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = "var(--text-muted)"; }}>
                <Icon size={13} />
                {isMobile ? shortLabel : label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "ai"           && <AITab />}
        {tab === "databases"    && <DatabasesTab />}
        {tab === "erp"          && <ERPTab />}
        {tab === "integrations" && <IntegrationsTab />}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   AI MODELS TAB
══════════════════════════════════════════════ */
const AI_PROVIDERS = [
  {
    id: "neurix",
    name: "Neurix",
    recommended: true,
    desc: "Local LLM — private, no data leaves your org",
    borderActive: "#f59e0b",
    bgActive: "rgba(245,158,11,0.07)",
    accentColor: "#f59e0b",
    models: [] as { value: string; label: string }[],
    keyPlaceholder: "",
    keyHint: "",
    logo: (
      <svg viewBox="0 0 40 40" style={{ width: 40, height: 40, flexShrink: 0 }}>
        <rect width="40" height="40" rx="10" fill="#92400e" />
        <g transform="translate(20,20)" fill="#fbbf24">
          <rect x="-2" y="-11" width="4" height="9" rx="2"/>
          <rect x="-2" y="-11" width="4" height="9" rx="2" transform="rotate(45)"/>
          <rect x="-2" y="-11" width="4" height="9" rx="2" transform="rotate(90)"/>
          <rect x="-2" y="-11" width="4" height="9" rx="2" transform="rotate(135)"/>
          <rect x="-2" y="-11" width="4" height="9" rx="2" transform="rotate(180)"/>
          <rect x="-2" y="-11" width="4" height="9" rx="2" transform="rotate(225)"/>
          <rect x="-2" y="-11" width="4" height="9" rx="2" transform="rotate(270)"/>
          <rect x="-2" y="-11" width="4" height="9" rx="2" transform="rotate(315)"/>
        </g>
      </svg>
    ),
  },
  {
    id: "anthropic",
    name: "Claude",
    desc: "Anthropic Claude — best reasoning & analysis",
    borderActive: "#c96442",
    bgActive: "rgba(201,100,66,0.08)",
    accentColor: "#c96442",
    models: [
      { value: "claude-sonnet-4-6",         label: "Claude Sonnet 4 · Fast & smart" },
      { value: "claude-opus-4-6",           label: "Claude Opus 4 · Most capable" },
      { value: "claude-haiku-4-5-20251001", label: "Claude Haiku · Fastest" },
    ],
    keyPlaceholder: "sk-ant-...",
    keyHint: "Get from console.anthropic.com",
    logo: (
      <svg viewBox="0 0 40 40" style={{ width: 40, height: 40, flexShrink: 0 }}>
        <rect width="40" height="40" rx="10" fill="#f0e9e0" />
        <g transform="translate(20,20)" fill="#c96442">
          <rect x="-2" y="-11" width="4" height="8" rx="2"/>
          <rect x="-2" y="-11" width="4" height="8" rx="2" transform="rotate(30)"/>
          <rect x="-2" y="-11" width="4" height="8" rx="2" transform="rotate(60)"/>
          <rect x="-2" y="-11" width="4" height="8" rx="2" transform="rotate(90)"/>
          <rect x="-2" y="-11" width="4" height="8" rx="2" transform="rotate(120)"/>
          <rect x="-2" y="-11" width="4" height="8" rx="2" transform="rotate(150)"/>
          <rect x="-2" y="-11" width="4" height="8" rx="2" transform="rotate(180)"/>
          <rect x="-2" y="-11" width="4" height="8" rx="2" transform="rotate(210)"/>
          <rect x="-2" y="-11" width="4" height="8" rx="2" transform="rotate(240)"/>
          <rect x="-2" y="-11" width="4" height="8" rx="2" transform="rotate(270)"/>
          <rect x="-2" y="-11" width="4" height="8" rx="2" transform="rotate(300)"/>
          <rect x="-2" y="-11" width="4" height="8" rx="2" transform="rotate(330)"/>
        </g>
      </svg>
    ),
  },
  {
    id: "openai",
    name: "ChatGPT",
    desc: "OpenAI GPT-4o — versatile, widely used",
    borderActive: "#10a37f",
    bgActive: "rgba(16,163,127,0.08)",
    accentColor: "#10a37f",
    models: [
      { value: "gpt-4o",      label: "GPT-4o · Most capable" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini · Faster & cheaper" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    ],
    keyPlaceholder: "sk-...",
    keyHint: "Get from platform.openai.com/api-keys",
    logo: (
      <svg viewBox="0 0 40 40" style={{ width: 40, height: 40, flexShrink: 0 }}>
        <rect width="40" height="40" rx="10" fill="#0d0d0d" />
        {/* ChatGPT flower: 6 overlapping ellipses create the characteristic swirl */}
        <g transform="translate(20,20)" fill="rgba(255,255,255,0.72)">
          <ellipse cx="0" cy="-5.5" rx="4.5" ry="8.5"/>
          <ellipse cx="0" cy="-5.5" rx="4.5" ry="8.5" transform="rotate(60)"/>
          <ellipse cx="0" cy="-5.5" rx="4.5" ry="8.5" transform="rotate(120)"/>
          <ellipse cx="0" cy="-5.5" rx="4.5" ry="8.5" transform="rotate(180)"/>
          <ellipse cx="0" cy="-5.5" rx="4.5" ry="8.5" transform="rotate(240)"/>
          <ellipse cx="0" cy="-5.5" rx="4.5" ry="8.5" transform="rotate(300)"/>
        </g>
      </svg>
    ),
  },
  {
    id: "gemini",
    name: "Gemini",
    desc: "Google Gemini — multimodal, fast",
    borderActive: "#4285f4",
    bgActive: "rgba(66,133,244,0.08)",
    accentColor: "#4285f4",
    models: [
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash · Fastest" },
      { value: "gemini-1.5-pro",   label: "Gemini 1.5 Pro · Most capable" },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash · Balanced" },
    ],
    keyPlaceholder: "AIza...",
    keyHint: "Get from aistudio.google.com/apikey",
    logo: (
      <svg viewBox="0 0 40 40" style={{ width: 40, height: 40, flexShrink: 0 }}>
        <rect width="40" height="40" rx="10" fill="#fff" />
        {/* Gemini 4-pointed sparkle star */}
        <path d="M20 5 C20.6 14 26 19.4 35 20 C26 20.6 20.6 26 20 35 C19.4 26 14 20.6 5 20 C14 19.4 19.4 14 20 5Z" fill="#4285f4"/>
      </svg>
    ),
  },
  {
    id: "copilot",
    name: "Copilot",
    desc: "Microsoft Copilot — powered by GPT-4",
    borderActive: "#0078d4",
    bgActive: "rgba(0,120,212,0.07)",
    accentColor: "#0078d4",
    models: [
      { value: "gpt-4o",      label: "GPT-4o via Azure · Most capable" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo via Azure" },
      { value: "phi-4",       label: "Phi-4 · Microsoft small model" },
    ],
    keyPlaceholder: "Azure OpenAI key...",
    keyHint: "Get from portal.azure.com or github.com/settings/tokens",
    logo: (
      <svg viewBox="0 0 40 40" style={{ width: 40, height: 40, flexShrink: 0 }}>
        <rect width="40" height="40" rx="10" fill="#fafafa" />
        {/* Copilot 4-lobe colorful swirl */}
        <path d="M20 20 L11 11 C8 7 5 9 6 13 L6 20 C6 25 11 28 20 20Z" fill="#0078d4"/>
        <path d="M20 20 L29 11 C32 7 35 9 34 13 L34 20 C34 25 29 28 20 20Z" fill="#7719aa"/>
        <path d="M20 20 L11 29 C8 33 5 31 6 27 L6 20 C6 15 11 12 20 20Z" fill="#107c10"/>
        <path d="M20 20 L29 29 C32 33 35 31 34 27 L34 20 C34 15 29 12 20 20Z" fill="#f97316"/>
      </svg>
    ),
  },
  {
    id: "mistral",
    name: "Mistral",
    desc: "Mistral AI — efficient European LLM",
    borderActive: "#f97316",
    bgActive: "rgba(249,115,22,0.08)",
    accentColor: "#f97316",
    models: [
      { value: "mistral-large-latest", label: "Mistral Large · Most capable" },
      { value: "mistral-small-latest", label: "Mistral Small · Fast & cheap" },
      { value: "open-mistral-7b",      label: "Mistral 7B · Open source" },
    ],
    keyPlaceholder: "...",
    keyHint: "Get from console.mistral.ai/api-keys",
    logo: (
      <svg viewBox="0 0 40 40" style={{ width: 40, height: 40, flexShrink: 0 }}>
        <rect width="40" height="40" rx="10" fill="#fff" />
        {/* Mistral block pattern logo */}
        <rect x="7"  y="10" width="7" height="20" rx="1.5" fill="#1a1a1a"/>
        <rect x="26" y="10" width="7" height="20" rx="1.5" fill="#1a1a1a"/>
        <rect x="16.5" y="10"   width="7" height="7"  rx="1.5" fill="#1a1a1a"/>
        <rect x="16.5" y="18.5" width="7" height="5"  rx="1.5" fill="#f97316"/>
        <rect x="16.5" y="25"   width="7" height="5"  rx="1.5" fill="#ef4444"/>
      </svg>
    ),
  },
  {
    id: "xai",
    name: "xAI",
    desc: "Grok — real-time knowledge, reasoning",
    borderActive: "#9ca3af",
    bgActive: "rgba(156,163,175,0.06)",
    accentColor: "#9ca3af",
    models: [
      { value: "grok-3",      label: "Grok 3 · Most capable" },
      { value: "grok-3-mini", label: "Grok 3 Mini · Fast" },
      { value: "grok-2",      label: "Grok 2" },
    ],
    keyPlaceholder: "xai-...",
    keyHint: "Get from console.x.ai",
    logo: (
      <svg viewBox="0 0 40 40" style={{ width: 40, height: 40, flexShrink: 0 }}>
        <rect width="40" height="40" rx="10" fill="#0a0a0a" />
        <line x1="12" y1="12" x2="28" y2="28" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="28" y1="12" x2="12" y2="28" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    desc: "DeepSeek — powerful open-source AI",
    borderActive: "#4e6ef5",
    bgActive: "rgba(78,110,245,0.08)",
    accentColor: "#4e6ef5",
    models: [
      { value: "deepseek-chat",     label: "DeepSeek Chat · Smart & cheap" },
      { value: "deepseek-reasoner", label: "DeepSeek R1 · Advanced reasoning" },
    ],
    keyPlaceholder: "sk-...",
    keyHint: "Get from platform.deepseek.com",
    logo: (
      <svg viewBox="0 0 40 40" style={{ width: 40, height: 40, flexShrink: 0 }}>
        <rect width="40" height="40" rx="10" fill="#1c4ed8" />
        {/* DeepSeek whale */}
        <path d="M28 15 C28 10 23 7 18 9 C13 11 10 16 10 20 C10 25 13 28 18 28 C22 28 25 26 26 23 C28 20 28 18 28 15Z" fill="white"/>
        <circle cx="23" cy="14" r="2" fill="#1c4ed8"/>
        <circle cx="23.6" cy="13.4" r="0.7" fill="white"/>
        <path d="M14 21 C16 23 21 23 23 21" fill="none" stroke="#1c4ed8" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M10 20 C7 18 6 22 8 23 C9.5 23.5 10 22 10 20Z" fill="white"/>
        <path d="M10 20 C7 22 8 26 10 24 C10 22 10 20 10 20Z" fill="white"/>
      </svg>
    ),
  },
  {
    id: "perplexity",
    name: "Perplexity",
    desc: "Perplexity AI — real-time web search",
    borderActive: "#20b2aa",
    bgActive: "rgba(32,178,170,0.07)",
    accentColor: "#20b2aa",
    models: [
      { value: "llama-3.1-sonar-large-128k-online", label: "Sonar Large · Best with search" },
      { value: "llama-3.1-sonar-small-128k-online", label: "Sonar Small · Faster" },
      { value: "llama-3.1-sonar-huge-128k-online",  label: "Sonar Huge · Most capable" },
    ],
    keyPlaceholder: "pplx-...",
    keyHint: "Get from perplexity.ai/settings/api",
    logo: (
      <svg viewBox="0 0 40 40" style={{ width: 40, height: 40, flexShrink: 0 }}>
        <rect width="40" height="40" rx="10" fill="#131313" />
        {/* Perplexity geometric crystal asterisk */}
        <g transform="translate(20,20)" fill="none" stroke="#20b2aa" strokeWidth="1.8" strokeLinejoin="miter">
          <polygon points="0,-13 3.5,-3.5 13,0 3.5,3.5 0,13 -3.5,3.5 -13,0 -3.5,-3.5"/>
          <polygon points="0,-6 6,0 0,6 -6,0" fill="#20b2aa" fillOpacity="0.25"/>
        </g>
      </svg>
    ),
  },
];

function AITab() {
  const [activeProvider, setActiveProvider] = useState("anthropic");
  const [popup,   setPopup]   = useState<string | null>(null);
  const [keys,    setKeys]    = useState<Record<string, string>>({});
  const [hasKeys, setHasKeys] = useState<Record<string, boolean>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [models,  setModels]  = useState<Record<string, string>>({
    anthropic: "claude-sonnet-4-6",
    openai:    "gpt-4o",
    gemini:    "gemini-2.0-flash",
    mistral:   "mistral-large-latest",
    xai:       "grok-3",
    deepseek:  "deepseek-chat",
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const [neurix,        setNeurix]        = useState<NeurixStatus | null>(null);
  const [neurixLoading, setNeurixLoading] = useState(true);
  type NeurixStep = "create" | "buy" | "activating";
  const [neurixStep,   setNeurixStep]   = useState<NeurixStep | null>(null);
  const [selectedPack, setSelectedPack] = useState<"starter" | "pro" | "enterprise">("starter");
  const [purchasing,   setPurchasing]   = useState(false);

  useEffect(() => {
    fetch(`${BASE}/settings/`, { headers: withAuthHeaders() })
      .then(r => r.json())
      .then(s => {
        setActiveProvider(s.provider || "anthropic");
        setModels(prev => ({
          ...prev,
          anthropic: s.anthropic_model || prev.anthropic,
          openai:    s.openai_model    || prev.openai,
          gemini:    s.gemini_model    || prev.gemini,
          mistral:   s.mistral_model   || prev.mistral,
          xai:       s.xai_model       || prev.xai,
          deepseek:  s.deepseek_model  || prev.deepseek,
        }));
        setHasKeys({
          anthropic: !!s.has_anthropic_key,
          openai:    !!s.has_openai_key,
          gemini:    !!s.has_gemini_key,
          mistral:   !!s.has_mistral_key,
          xai:       !!s.has_xai_key,
          deepseek:  !!s.has_deepseek_key,
        });
      }).catch(() => {});
    fetchNeurixStatus()
      .then(setNeurix).catch(() => {}).finally(() => setNeurixLoading(false));
  }, []);

  const openPopup = (id: string) => {
    setSaved(false); setSaving(false);
    setPopup(id);
    if (id === "neurix") setNeurixStep(neurix?.has_instance ? null : "create");
  };

  const saveProvider = async (providerId: string) => {
    setSaving(true);
    const body: Record<string, string> = {
      provider: providerId,
      ...Object.fromEntries(Object.entries(models).map(([id, m]) => [`${id}_model`, m])),
    };
    const k = keys[providerId];
    if (k) body[`${providerId}_api_key`] = k;
    await fetch(`${BASE}/settings/`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    setSaving(false); setSaved(true);
    setActiveProvider(providerId);
    if (k) {
      setHasKeys(prev => ({ ...prev, [providerId]: true }));
      setKeys(prev => ({ ...prev, [providerId]: "" }));
    }
    setTimeout(() => { setSaved(false); setPopup(null); }, 1300);
  };

  const handleNeurixCreate = async () => {
    setNeurixStep("activating");
    try {
      const res = await fetch(`${BASE}/neurix/auto-provision`, {
        method: "POST", headers: withAuthHeaders(),
      }).then(r => r.json());
      if (res.ok) setNeurix({ has_instance: true, endpoint_url: res.endpoint_url, model_name: res.model_name, neuron_balance: res.neuron_balance, cost_per_query: res.cost_per_query });
    } catch {}
    await new Promise(r => setTimeout(r, 1400));
    await saveProvider("neurix");
    setNeurixStep(null);
  };

  const handleNeurixBuy = async () => {
    setPurchasing(true);
    try {
      const r = await fetch(`${BASE}/neurix/create-checkout-session`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pack: selectedPack }),
      });
      if (r.ok) {
        const res = await r.json();
        if (res.checkout_url) { window.location.href = res.checkout_url; return; }
      }
      const fallback = await fetch(`${BASE}/neurix/purchase-neurons`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pack: selectedPack }),
      }).then(r2 => r2.json());
      if (fallback.ok) setNeurix(prev => prev ? { ...prev, neuron_balance: fallback.new_balance, cost_per_query: fallback.cost_per_query } : prev);
    } catch {}
    setPurchasing(false);
    setNeurixStep("activating");
    await new Promise(r => setTimeout(r, 1600));
    await saveProvider("neurix");
    setNeurixStep(null);
  };

  const popupProvider = AI_PROVIDERS.find(p => p.id === popup) ?? null;

  return (
    <div style={{ padding: "clamp(14px,4vw,28px)", maxWidth: 900 }}>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 32 }}>
        Click an AI icon to configure and connect. The active engine is highlighted — others fade until you switch.
      </p>

      {/* Icon grid — uniform paddingTop so all icons align; badge floats above Neurix */}
      <div style={{ display: "flex", gap: "20px 28px", flexWrap: "wrap" }}>
        {AI_PROVIDERS.map(p => {
          const isActive      = activeProvider === p.id;
          const isNeurix      = p.id === "neurix";
          const neurixFaded   = isNeurix && !neurixLoading && !neurix?.has_instance;

          return (
            <div key={p.id} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
              position: "relative",
              paddingTop: 20, // same for ALL — creates room for the Recommended badge
              width: 80,
            }}>
              {/* Recommended badge — Neurix only */}
              {p.recommended && (
                <div style={{
                  position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)",
                  background: "linear-gradient(90deg,#d97706,#f59e0b)", color: "#000",
                  fontSize: 7, fontWeight: 800, padding: "1px 6px", borderRadius: 4,
                  letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap", zIndex: 2,
                }}>
                  Recommended
                </div>
              )}

              <button
                onClick={() => openPopup(p.id)}
                title={`Configure ${p.name}`}
                style={{
                  width: 80, height: 80, borderRadius: 22, padding: 0,
                  border: `2.5px solid ${isActive ? p.borderActive : "var(--border)"}`,
                  background: isActive ? p.bgActive : "var(--surface2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                  opacity: isActive ? 1 : neurixFaded ? 0.45 : 0.82,
                  transition: "all 220ms ease",
                  boxShadow: isActive ? `0 0 0 4px ${p.borderActive}28, 0 6px 24px ${p.borderActive}28` : "none",
                  position: "relative", flexShrink: 0,
                }}>
                {p.logo}
                {isActive && (
                  <div style={{
                    position: "absolute", bottom: -6, right: -6,
                    width: 20, height: 20, borderRadius: "50%",
                    background: p.accentColor, border: "2.5px solid var(--bg)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check size={10} color="#fff" />
                  </div>
                )}
              </button>

              <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? "var(--text)" : "var(--text-dim)", opacity: isActive ? 1 : neurixFaded ? 0.45 : 0.82, transition: "all 220ms ease", textAlign: "center", lineHeight: 1.2 }}>
                {p.name}
              </span>
              {isActive && (
                <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 4, background: `${p.accentColor}22`, color: p.accentColor, fontWeight: 700, letterSpacing: "0.04em" }}>
                  Active
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Popup overlay */}
      {popupProvider && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.68)", backdropFilter: "blur(5px)", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget && neurixStep !== "activating" && !saving) setPopup(null); }}>
          <div style={{
            background: "var(--surface2)",
            border: `1px solid ${popupProvider.borderActive}55`,
            borderRadius: 20, width: "100%", maxWidth: 420,
            boxShadow: `0 28px 56px rgba(0,0,0,0.45), 0 0 0 1px ${popupProvider.borderActive}22`,
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
              {popupProvider.logo}
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{popupProvider.name}</h3>
                <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{popupProvider.desc}</p>
              </div>
              {neurixStep !== "activating" && !saving && (
                <button onClick={() => setPopup(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", padding: 4 }}>
                  <X size={16} />
                </button>
              )}
            </div>

            <div style={{ padding: "20px 22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* ── Neurix wizard ── */}
              {popupProvider.id === "neurix" ? (<>

                {neurixStep && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 4 }}>
                    {(["create", "buy", "activating"] as const).map((s, i) => {
                      const stepIndex = ["create","buy","activating"].indexOf(neurixStep);
                      return <div key={s} style={{ width: s === neurixStep ? 18 : 6, height: 6, borderRadius: 3, background: i <= stepIndex ? "#f59e0b" : "var(--border)", transition: "all 300ms ease" }} />;
                    })}
                  </div>
                )}

                {neurixStep === "create" && (
                  <>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Create your Neurix instance</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        ["🔒", "Fully private — no data leaves your servers"],
                        ["🔑", "No external API keys needed"],
                        ["⚡", "Powered by neurons — pay only for what you use"],
                      ].map(([icon, text]) => (
                        <div key={text as string} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)" }}>
                          <span style={{ fontSize: 14 }}>{icon}</span>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{text as string}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleNeurixCreate}
                      style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#d97706,#f59e0b)", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Create Instance →
                    </button>
                  </>
                )}

                {neurixStep === "buy" && (
                  <>
                    <div>
                      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                        Add <NeuronIcon size={15} /> to get started
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
                        You have <strong style={{ color: "#f59e0b", display: "inline-flex", alignItems: "center", gap: 3 }}>{(neurix?.neuron_balance ?? 50).toLocaleString()} <NeuronIcon size={12} /></strong> complimentary to try.
                        Each query costs {neurix?.cost_per_query ?? 10} <NeuronIcon size={12} style={{ verticalAlign: "middle" }} /> — top up anytime.
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {([
                        { id: "starter",    neurons: 500,   label: "Starter",      price: "$4.99",  note: "~50 analyses" },
                        { id: "pro",        neurons: 2000,  label: "Professional", price: "$14.99", note: "~200 analyses", popular: true },
                        { id: "enterprise", neurons: 10000, label: "Enterprise",   price: "$49.99", note: "~1,000 analyses" },
                      ] as const).map(pack => (
                        <div key={pack.id} onClick={() => setSelectedPack(pack.id)}
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: `2px solid ${selectedPack === pack.id ? "#f59e0b" : "var(--border)"}`, background: selectedPack === pack.id ? "rgba(245,158,11,0.07)" : "var(--surface3)", cursor: "pointer", transition: "all 140ms ease", position: "relative" }}>
                          {(pack as { popular?: boolean }).popular && (
                            <span style={{ position: "absolute", top: -9, right: 12, fontSize: 9, fontWeight: 800, background: "#f59e0b", color: "#000", padding: "2px 7px", borderRadius: 4, textTransform: "uppercase" }}>Popular</span>
                          )}
                          <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${selectedPack === pack.id ? "#f59e0b" : "var(--border2)"}`, background: selectedPack === pack.id ? "#f59e0b" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {selectedPack === pack.id && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#000" }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <NeuronIcon size={15} />{pack.neurons.toLocaleString()}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 8 }}>{pack.note}</span>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: selectedPack === pack.id ? "#f59e0b" : "var(--text)" }}>{pack.price}</p>
                            <p style={{ margin: 0, fontSize: 9, color: "var(--text-dim)" }}>free in beta</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleNeurixBuy} disabled={purchasing}
                      style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#d97706,#f59e0b)", color: "#000", fontSize: 13, fontWeight: 700, cursor: purchasing ? "default" : "pointer", opacity: purchasing ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      {purchasing ? <><AISpinner size={14} /> Processing…</> : "Buy & Activate Neurix →"}
                    </button>
                    <p style={{ margin: 0, fontSize: 10, color: "var(--text-dim)", textAlign: "center" }}>Secure payment via Stripe · Free during beta</p>
                  </>
                )}

                {neurixStep === "activating" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "24px 0", textAlign: "center" }}>
                    <div style={{ position: "relative", width: 56, height: 56 }}>
                      <div style={{ width: 56, height: 56, borderRadius: "50%", border: "3px solid rgba(245,158,11,0.2)", borderTopColor: "#f59e0b", animation: "spin 0.9s linear infinite" }} />
                      <NeuronIcon size={22} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f59e0b" }}>Gathering neurons…</p>
                      <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>Activating your Neurix engine.<br/>This only takes a moment.</p>
                    </div>
                  </div>
                )}

                {!neurixStep && neurix?.has_instance && (
                  saved && activeProvider === "neurix" ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "16px 0", textAlign: "center" }}>
                      <CheckCircle2 size={32} style={{ color: "#f59e0b" }} />
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f59e0b" }}>Neurix Activated!</p>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Your local AI engine is now active.</p>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)" }}>
                        <NeuronIcon size={28} />
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#f59e0b", lineHeight: 1 }}>{(neurix.neuron_balance || 0).toLocaleString()}</p>
                          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                            <NeuronIcon size={12} /> {neurix.cost_per_query}/query · {neurix.model_name}
                          </p>
                        </div>
                        <button onClick={() => setNeurixStep("buy")}
                          style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(245,158,11,0.3)", background: "transparent", color: "#f59e0b", cursor: "pointer" }}>
                          + Buy more
                        </button>
                      </div>
                      <button onClick={async () => { setNeurixStep("activating"); await new Promise(r => setTimeout(r, 1200)); await saveProvider("neurix"); setNeurixStep(null); }}
                        style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#d97706,#f59e0b)", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        {activeProvider === "neurix" ? "✓ Already Active" : "Activate Neurix"}
                      </button>
                    </>
                  )
                )}

              </>) : (
                /* ── Generic API-key provider ── */
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      API Key{hasKeys[popupProvider.id] && <span style={{ color: "#4ade80", textTransform: "none", fontWeight: 500, marginLeft: 6 }}>· saved</span>}
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showKey[popupProvider.id] ? "text" : "password"}
                        style={{ ...inp, paddingRight: 38 }}
                        placeholder={hasKeys[popupProvider.id] ? "Leave blank to keep existing" : popupProvider.keyPlaceholder}
                        value={keys[popupProvider.id] || ""}
                        onChange={e => setKeys(prev => ({ ...prev, [popupProvider.id]: e.target.value }))}
                      />
                      <button
                        onClick={() => setShowKey(prev => ({ ...prev, [popupProvider.id]: !prev[popupProvider.id] }))}
                        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}>
                        {showKey[popupProvider.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    <p style={{ fontSize: 10, color: "var(--text-dim)", margin: "4px 0 0" }}>{popupProvider.keyHint}</p>
                  </div>
                  {popupProvider.models.length > 0 && (
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Model</label>
                      <select style={inp} value={models[popupProvider.id] || ""}
                        onChange={e => setModels(prev => ({ ...prev, [popupProvider.id]: e.target.value }))}>
                        {popupProvider.models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                  )}
                  <button onClick={() => saveProvider(popupProvider.id)} disabled={saving || saved}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: saving || saved ? "default" : "pointer", background: saved ? "var(--accent-dim)" : `linear-gradient(135deg,${popupProvider.accentColor},${popupProvider.borderActive})`, color: saved ? "var(--accent-light)" : "#fff", opacity: saving ? 0.6 : 1, transition: "all 160ms ease" }}>
                    {saving ? <AISpinner size={14} /> : saved ? <CheckCircle2 size={14} /> : null}
                    {saving ? "Connecting…" : saved ? "Connected!" : "Connect"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════
   ERP TAB
══════════════════════════════════════════════ */
const OTHER_ERPS = [
  { name: "SAP S/4HANA",             desc: "Enterprise resource planning at scale",       color: "#0070d2" },
  { name: "Oracle ERP Cloud",         desc: "Financials, procurement & project management", color: "#f80000" },
  { name: "Microsoft Dynamics 365",   desc: "CRM, ERP & business intelligence suite",      color: "#00a4ef" },
  { name: "Odoo",                     desc: "Open-source modular business apps",            color: "#714B67" },
  { name: "NetSuite",                 desc: "Cloud ERP, CRM & e-commerce platform",         color: "#f7941d" },
  { name: "Sage 300",                 desc: "Accounting, operations & HR management",       color: "#00dc82" },
  { name: "QuickBooks",               desc: "Accounting & small business management",       color: "#2ca01c" },
  { name: "Workday",                  desc: "HR, payroll & financial management",           color: "#0875e1" },
];

function ERPTab() {
  const [styloUrl, setStyloUrl]         = useState("");
  const [styloKey, setStyloKey]         = useState("");
  const [styloConnected, setStyloConnected] = useState(false);
  const [connecting, setConnecting]     = useState(false);
  const [showKey, setShowKey]           = useState(false);
  const [error, setError]               = useState("");

  useEffect(() => {
    fetch(`${BASE}/settings/`, { headers: withAuthHeaders() })
      .then(r => r.json())
      .then(s => {
        if (s.stylobms_url) { setStyloUrl(s.stylobms_url); setStyloConnected(true); }
      }).catch(() => {});
  }, []);

  const handleConnect = async () => {
    if (!styloUrl.trim()) { setError("Please enter your styloBMS URL."); return; }
    setConnecting(true); setError("");
    try {
      await fetch(`${BASE}/settings/`, {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ stylobms_url: styloUrl, stylobms_api_key: styloKey }),
      });
      setStyloConnected(true);
    } catch { setError("Connection failed. Check your URL and key."); }
    setConnecting(false);
  };

  return (
    <div style={{ padding: "clamp(14px,4vw,28px)", maxWidth: 860 }}>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 28 }}>
        Connect brAIn to your ERP for seamless data analysis. <strong style={{ color: "var(--text)" }}>styloBMS</strong> is the recommended home ERP — natively built for AI-native workflows.
      </p>

      {/* ── styloBMS featured card ── */}
      <div style={{
        marginBottom: 36, borderRadius: 18, overflow: "hidden",
        border: "1.5px solid rgba(var(--accent-rgb,99,102,241),0.4)",
        background: "linear-gradient(135deg, var(--surface2) 0%, var(--accent-dim) 100%)",
        boxShadow: "0 4px 32px var(--accent-glow)",
      }}>
        {/* Header */}
        <div style={{ padding: "22px 24px 16px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 15, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px var(--accent-glow)", flexShrink: 0 }}>
            <Layers size={24} style={{ color: "#fff" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.4px" }}>styloBMS</h2>
              <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 5, background: "linear-gradient(90deg,var(--accent),var(--accent2))", color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" }}>Native Partner</span>
              {styloConnected && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}>● Connected</span>}
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
              The AI-native business management suite — seamlessly integrated with brAIn for zero-friction analytics.
            </p>
          </div>
        </div>

        {/* Feature highlights */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, padding: "0 24px 20px" }}>
          {[
            ["⚡", "Real-time sync",     "Live data as it changes"],
            ["🔒", "End-to-end secure",  "Encrypted at every layer"],
            ["🧠", "AI-native schema",   "Optimised for brAIn queries"],
            ["🔗", "Zero setup",         "Auto-discovers tables & fields"],
          ].map(([icon, title, sub]) => (
            <div key={title} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{title}</p>
                <p style={{ margin: 0, fontSize: 10, color: "var(--text-dim)" }}>{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Connection form */}
        <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>styloBMS URL</label>
              <input style={inp} placeholder="https://your-company.stylobms.com" value={styloUrl}
                onChange={e => { setStyloUrl(e.target.value); setStyloConnected(false); }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>API Key</label>
              <div style={{ position: "relative" }}>
                <input style={{ ...inp, paddingRight: 38 }} type={showKey ? "text" : "password"}
                  placeholder="stylo-key-..." value={styloKey} onChange={e => setStyloKey(e.target.value)} />
                <button onClick={() => setShowKey(v => !v)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}>
                  {showKey ? <EyeOff size={13}/> : <Eye size={13}/>}
                </button>
              </div>
            </div>
          </div>
          {error && <p style={{ margin: 0, fontSize: 11, color: "#f87171" }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={handleConnect} disabled={connecting}
              style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: styloConnected ? "rgba(34,197,94,0.2)" : "linear-gradient(135deg,var(--accent),var(--accent2))", color: styloConnected ? "#4ade80" : "#fff", fontSize: 13, fontWeight: 700, cursor: connecting ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8, opacity: connecting ? 0.7 : 1 }}>
              {connecting ? <><AISpinner size={13}/> Connecting…</> : styloConnected ? <><CheckCircle2 size={14}/> Connected</> : <><Link2 size={14}/> Connect styloBMS</>}
            </button>
            <p style={{ margin: 0, fontSize: 10, color: "var(--text-dim)" }}>Get your API key from styloBMS → Settings → Integrations</p>
          </div>
        </div>
      </div>

      {/* ── Other ERPs (coming soon) ── */}
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 14 }}>
        Other ERPs — coming soon
      </p>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 18, lineHeight: 1.6 }}>
        Already using a different ERP? We are building native connectors for all major platforms.
        In the meantime, <strong style={{ color: "var(--text)" }}>consider styloBMS</strong> — the all-in-one ERP designed to work natively with brAIn AI.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
        {OTHER_ERPS.map(erp => (
          <div key={erp.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface2)", opacity: 0.7 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: `${erp.color}18`, border: `1px solid ${erp.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Building2 size={16} style={{ color: erp.color }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{erp.name}</p>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{erp.desc}</p>
            </div>
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "var(--surface3)", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>Soon</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   DATABASES TAB
══════════════════════════════════════════════ */
const DB_CONNECTORS = [
  { id: "mysql",    name: "MySQL",         port: "3306", accent: "#fb923c", logo: <MysqlLogo /> },
  { id: "postgres", name: "PostgreSQL",    port: "5432", accent: "#60a5fa", logo: <PgLogo /> },
  { id: "sheets",   name: "Google Sheets", port: "",     accent: "#4ade80", logo: <SheetsLogo /> },
  { id: "gmail",    name: "Gmail",         port: "",     accent: "#ea4335", logo: <GmailLogo /> },
] as const;

type DBConnType = "mysql" | "postgres" | "sheets" | "gmail";
type DBStep = "list" | "pick" | "form" | "browse";

function DatabasesTab() {
  const [dbs, setDbs]         = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep]       = useState<DBStep>("list");
  const [connType, setConnType] = useState<DBConnType>("mysql");
  const [browse, setBrowse]   = useState<{ connStr: string; tables: string[]; name: string; dbType: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const all = await fetchDatasets();
    setDbs(all.filter(d => ["postgres", "mysql", "sheets"].includes(d.source_type)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Remove this connection?")) return;
    await deleteDataset(id);
    setDbs(prev => prev.filter(d => d.id !== id));
  };

  const handleSuccess = (ds: Dataset) => {
    setDbs(prev => [ds, ...prev.filter(d => d.id !== ds.id)]);
    setStep("list"); setBrowse(null);
  };

  if (step === "browse" && browse) {
    return (
      <div style={{ padding: "clamp(14px,4vw,28px)" }}>
        <TableBrowserModal
          connStr={browse.connStr}
          dbType={browse.dbType}
          connName={browse.name}
          tables={browse.tables}
          onClose={() => { setStep("list"); setBrowse(null); }}
          onSave={async result => {
            const ds = await fetch(`${BASE}/datasets/${result.dataset_id}`, { headers: withAuthHeaders() })
              .then(r => r.json()).catch(() => null);
            if (ds) handleSuccess(ds);
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "clamp(14px,4vw,28px)", maxWidth: 860 }}>
      {step === "list" && (
        <>
          {/* Connector type cards */}
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 12 }}>Available connectors</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,200px),1fr))", gap: 12, marginBottom: 32 }}>
            {DB_CONNECTORS.map(c => (
              <button key={c.id}
                onClick={() => { setConnType(c.id); setStep("form"); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", textAlign: "left", transition: "all 140ms ease" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = c.accent; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 4px 16px ${c.accent}22`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: `${c.accent}18`, border: `1px solid ${c.accent}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {c.logo}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{c.name}</p>
                  {c.port && <p style={{ margin: 0, fontSize: 10, color: "var(--text-dim)" }}>Default port {c.port}</p>}
                </div>
                <ChevronRight size={14} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
              </button>
            ))}
          </div>

          {/* Connected databases */}
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 12 }}>
            Connected ({loading ? "…" : dbs.length})
          </p>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-dim)", fontSize: 13 }}>
              <AISpinner size={14} /> Loading…
            </div>
          ) : dbs.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "32px 0", textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--surface3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Server size={20} style={{ color: "var(--text-dim)" }} />
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>No databases connected yet — pick a connector above</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dbs.map(db => {
                const meta = DB_CONNECTORS.find(c => c.id === db.source_type);
                return (
                  <div key={db.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${meta?.accent ?? "var(--accent)"}18`, border: `1px solid ${meta?.accent ?? "var(--accent)"}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {meta?.logo ?? <Database size={14} style={{ color: "var(--accent)" }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{db.name}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                        <span style={{ fontSize: 10, color: "#4ade80" }}>Connected</span>
                        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>· {meta?.name ?? db.source_type}</span>
                        {db.row_count != null && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>· {db.row_count.toLocaleString()} rows</span>}
                      </div>
                    </div>
                    <button onClick={e => handleDelete(e, db.id)}
                      style={{ padding: "6px 8px", borderRadius: 7, border: "none", background: "var(--surface3)", cursor: "pointer", color: "var(--text-dim)", fontSize: 12 }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {step === "form" && connType !== "sheets" && (
        <DBForm
          type={connType}
          onBack={() => setStep("pick")}
          onSuccess={handleSuccess}
          onOpenBrowser={data => { setBrowse(data); setStep("browse"); }}
        />
      )}

      {step === "form" && connType === "sheets" && (
        <SheetsForm onBack={() => setStep("list")} onSuccess={handleSuccess} />
      )}
    </div>
  );
}

/* ── DB Form ── */
function DBForm({ type, onBack, onSuccess, onOpenBrowser }: {
  type: "mysql" | "postgres";
  onBack: () => void;
  onSuccess: (d: Dataset) => void;
  onOpenBrowser: (d: { connStr: string; tables: string[]; name: string; dbType: string }) => void;
}) {
  const connector = DB_CONNECTORS.find(c => c.id === type)!;
  const [name, setName]         = useState("");
  const [host, setHost]         = useState("");
  const [port, setPort]         = useState(connector.port);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loadMode, setLoadMode] = useState<"all" | "specific">("all");
  const [tableOrQuery, setTOQ]  = useState("");
  const [loading, setLoading]   = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; tables?: string[]; error?: string } | null>(null);
  const [error, setError]       = useState("");

  const payload = () => ({ name, host, port: Number(port), database, username, password, db_type: type });

  const buildConnStr = () => {
    const pfx = type === "postgres" ? "postgresql" : "mysql+pymysql";
    return `${pfx}://${username}:${password}@${host}:${port}/${database}`;
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setError("");
    const res = await fetch(`${BASE}/db/test`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload()),
    }).then(r => r.json()).catch(e => ({ success: false, error: String(e) }));
    setTestResult(res); setTesting(false);
  };

  const handleConnect = async () => {
    setLoading(true); setError("");
    try {
      if (loadMode === "all") {
        const res = await fetch(`${BASE}/db/test`, {
          method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload()),
        }).then(r => r.json());
        if (!res.success) { setError(res.error || "Connection failed"); return; }
        onOpenBrowser({ connStr: buildConnStr(), tables: [...(res.tables || []), ...(res.views || [])], name: name || database, dbType: type });
        return;
      }
      if (!tableOrQuery.trim()) { setError("Enter a table name or SQL query."); return; }
      const ds = await fetch(`${BASE}/datasets/connect-db-table`, {
        method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...payload(), table_or_query: tableOrQuery }),
      }).then(r => { if (!r.ok) return r.json().then((e: { detail: string }) => Promise.reject(e.detail)); return r.json(); });
      onSuccess(ds);
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : "Connection failed.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          ← Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${connector.accent}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {connector.logo}
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>New {connector.name} connection</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
          <FieldWrap label="Connection name"><input style={inp} placeholder="My Database" value={name} onChange={e => setName(e.target.value)} /></FieldWrap>
          <FieldWrap label="Port"><input style={inp} value={port} onChange={e => setPort(e.target.value)} /></FieldWrap>
        </div>
        <FieldWrap label="Host / IP"><input style={inp} placeholder="localhost or 192.168.1.1" value={host} onChange={e => setHost(e.target.value)} /></FieldWrap>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <FieldWrap label="Database"><input style={inp} placeholder="mydb" value={database} onChange={e => setDatabase(e.target.value)} /></FieldWrap>
          <FieldWrap label="Username"><input style={inp} placeholder="root" value={username} onChange={e => setUsername(e.target.value)} /></FieldWrap>
          <FieldWrap label="Password"><input style={{ ...inp }} type="password" placeholder="••••••" value={password} onChange={e => setPassword(e.target.value)} /></FieldWrap>
        </div>

        {/* Load mode */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {([["all", "Browse all tables", "Pick tables after connecting"] , ["specific", "Specific table / SQL", "Load a single table or query"]] as const).map(([id, title, sub]) => (
            <button key={id} onClick={() => setLoadMode(id)}
              style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10, border: `2px solid ${loadMode === id ? "var(--accent)" : "var(--border)"}`, background: loadMode === id ? "var(--accent-dim)" : "var(--surface3)", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${loadMode === id ? "var(--accent)" : "var(--border2)"}`, background: loadMode === id ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                {loadMode === id && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{title}</p>
                <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--text-dim)" }}>{sub}</p>
              </div>
            </button>
          ))}
        </div>

        {loadMode === "specific" && (
          <FieldWrap label="Table name or SQL query">
            <textarea rows={3} style={{ ...inp, resize: "none", fontFamily: "monospace", fontSize: 12 }}
              placeholder={"orders   or   SELECT id, name FROM orders WHERE active = 1"}
              value={tableOrQuery} onChange={e => setTOQ(e.target.value)} />
          </FieldWrap>
        )}

        {testResult && (
          <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12, ...(testResult.success ? { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80" } : { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }) }}>
            {testResult.success ? `✓ Connected! Found ${testResult.tables?.length ?? 0} tables / views` : testResult.error}
          </div>
        )}
        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleTest} disabled={testing}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface3)", color: "var(--text-muted)", fontSize: 13, cursor: testing ? "not-allowed" : "pointer", opacity: testing ? 0.6 : 1 }}>
            {testing ? <AISpinner size={13} /> : <RefreshCw size={13} />} Test connection
          </button>
          <button onClick={handleConnect} disabled={loading || !host || !database}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 0", borderRadius: 9, border: "none", background: "linear-gradient(135deg,var(--accent),var(--accent2))", color: "#fff", fontSize: 13, fontWeight: 600, cursor: loading || !host || !database ? "not-allowed" : "pointer", opacity: loading || !host || !database ? 0.5 : 1 }}>
            {loading && <AISpinner size={13} />}
            {loading ? "Connecting…" : loadMode === "all" ? "Browse tables →" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Google Sheets Form ── */
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
      }).then(r => { if (!r.ok) return r.json().then((e: { detail: string }) => Promise.reject(e.detail)); return r.json(); });
      onSuccess(ds);
    } catch (e: unknown) { setError(typeof e === "string" ? e : "Failed to load sheet."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button onClick={onBack} style={{ fontSize: 12, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Back</button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(74,222,128,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileSpreadsheet size={15} style={{ color: "#4ade80" }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>New Google Sheets connection</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FieldWrap label="Connection name"><input style={inp} placeholder="My Spreadsheet" value={name} onChange={e => setName(e.target.value)} /></FieldWrap>
        <FieldWrap label="Google Sheets URL"><input style={inp} placeholder="https://docs.google.com/spreadsheets/d/..." value={url} onChange={e => setUrl(e.target.value)} /></FieldWrap>
        <FieldWrap label="Service Account JSON (optional — for private sheets)">
          <textarea rows={4} style={{ ...inp, resize: "none", fontFamily: "monospace", fontSize: 11 }}
            placeholder={'{ "type": "service_account", "project_id": "..." }'}
            value={creds} onChange={e => setCreds(e.target.value)} />
        </FieldWrap>
        {error && <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>{error}</div>}
        <button onClick={handleConnect} disabled={loading || !name || !url}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 0", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: loading || !name || !url ? "not-allowed" : "pointer", opacity: loading || !name || !url ? 0.5 : 1 }}>
          {loading && <AISpinner size={13} />}
          {loading ? "Loading…" : "Connect sheet"}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   INTEGRATIONS TAB (placeholders)
══════════════════════════════════════════════ */
const INTEGRATIONS = [
  { name: "Slack",       desc: "Send scheduled reports to Slack channels",    color: "#4a154b", accent: "#e879f9",   status: "coming_soon", logo: <SlackLogo /> },
  { name: "Notion",      desc: "Export analyses and charts to Notion pages",  color: "#191919", accent: "#94a3b8",   status: "coming_soon", logo: <NotionLogo /> },
  { name: "Amazon S3",   desc: "Read CSV/Parquet files directly from S3",     color: "#f59e0b", accent: "#fbbf24",   status: "coming_soon", logo: <S3Logo /> },
  { name: "Salesforce",  desc: "Analyse CRM data and pipeline metrics",       color: "#0ea5e9", accent: "#38bdf8",   status: "coming_soon", logo: <SfdcLogo /> },
  { name: "BigQuery",    desc: "Connect to Google BigQuery datasets",         color: "#4285f4", accent: "#60a5fa",   status: "coming_soon", logo: <BQLogo /> },
  { name: "Snowflake",   desc: "Query Snowflake warehouses at scale",         color: "#29b5e8", accent: "#67e8f9",   status: "coming_soon", logo: <SnowflakeLogo /> },
  { name: "Webhooks",    desc: "Push analysis results to any HTTP endpoint",  color: "#7c3aed", accent: "#a78bfa",   status: "coming_soon", logo: <WebhookLogo /> },
  { name: "Email SMTP",  desc: "Custom SMTP for scheduled report delivery",   color: "#0284c7", accent: "#38bdf8",   status: "coming_soon", logo: <EmailLogo /> },
];

function IntegrationsTab() {
  return (
    <div style={{ padding: "clamp(14px,4vw,28px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, padding: "12px 16px", borderRadius: 10, background: "var(--accent-dim)", border: "1px solid var(--border-accent)" }}>
        <Zap size={14} style={{ color: "var(--accent-light)", flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
          These integrations are <strong style={{ color: "var(--text)" }}>coming soon</strong>. Vote for which ones you need most or request a custom integration via Support.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
        {INTEGRATIONS.map(itg => (
          <div key={itg.name}
            style={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface2)", padding: "16px 18px", opacity: 0.75 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${itg.accent}18`, border: `1px solid ${itg.accent}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {itg.logo}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{itg.name}</p>
                <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "var(--surface3)", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Coming soon</span>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{itg.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Field wrapper ── */
function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

/* ── SVG Logos ── */
function MysqlLogo() {
  return <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}><rect width="24" height="24" rx="5" fill="#b36a00" /><text x="12" y="17" fontFamily="Arial" fontSize="9" fontWeight="bold" fill="#ffe0a0" textAnchor="middle">My</text></svg>;
}
function PgLogo() {
  return <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}><rect width="24" height="24" rx="5" fill="#1a3f5c" /><text x="12" y="17" fontFamily="Georgia,serif" fontSize="11" fontWeight="bold" fill="#a8d5f5" textAnchor="middle">Pg</text></svg>;
}
function SheetsLogo() {
  return <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}><rect width="24" height="24" rx="5" fill="#0F9D58" /><rect x="6" y="8" width="12" height="9" rx="1" fill="white" opacity="0.2" /><rect x="7" y="10" width="5" height="1.5" rx="0.5" fill="white" /><rect x="7" y="12.5" width="10" height="1.5" rx="0.5" fill="white" /><rect x="7" y="15" width="7" height="1.5" rx="0.5" fill="white" /></svg>;
}
function GmailLogo() {
  return <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}><rect width="24" height="24" rx="5" fill="#fff" /><path d="M4 8l8 5.5L20 8v9a1 1 0 01-1 1H5a1 1 0 01-1-1V8z" fill="#ea4335" /><path d="M4 8l8 5.5L20 8" fill="none" stroke="#ea4335" strokeWidth="1.5" /><path d="M4 7.5h16L12 13z" fill="#fbbc04" opacity="0.6" /></svg>;
}
function SlackLogo() {
  return <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><rect width="24" height="24" rx="5" fill="#4a154b" /><text x="12" y="16" fontFamily="Arial" fontSize="9" fontWeight="bold" fill="#e879f9" textAnchor="middle">#</text></svg>;
}
function NotionLogo() {
  return <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><rect width="24" height="24" rx="5" fill="#191919" /><text x="12" y="16" fontFamily="Arial" fontSize="10" fontWeight="bold" fill="#94a3b8" textAnchor="middle">N</text></svg>;
}
function S3Logo() {
  return <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><rect width="24" height="24" rx="5" fill="#e25b00" /><text x="12" y="16" fontFamily="Arial" fontSize="9" fontWeight="bold" fill="#fbbf24" textAnchor="middle">S3</text></svg>;
}
function SfdcLogo() {
  return <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><rect width="24" height="24" rx="5" fill="#0ea5e9" /><text x="12" y="16" fontFamily="Arial" fontSize="8" fontWeight="bold" fill="white" textAnchor="middle">SF</text></svg>;
}
function BQLogo() {
  return <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><rect width="24" height="24" rx="5" fill="#4285f4" /><text x="12" y="16" fontFamily="Arial" fontSize="8" fontWeight="bold" fill="white" textAnchor="middle">BQ</text></svg>;
}
function SnowflakeLogo() {
  return <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><rect width="24" height="24" rx="5" fill="#29b5e8" /><text x="12" y="16" fontFamily="Arial" fontSize="14" fill="white" textAnchor="middle">❄</text></svg>;
}
function WebhookLogo() {
  return <Globe size={14} style={{ color: "#a78bfa" }} />;
}
function EmailLogo() {
  return <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><rect width="24" height="24" rx="5" fill="#0284c7" /><rect x="4" y="8" width="16" height="11" rx="2" fill="none" stroke="white" strokeWidth="1.5" /><polyline points="4,8 12,14 20,8" fill="none" stroke="white" strokeWidth="1.5" /></svg>;
}
