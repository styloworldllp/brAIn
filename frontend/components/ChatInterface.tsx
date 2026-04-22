"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Send, BarChart2, TrendingUp, Plus, Database, X, Upload, Link2, RotateCcw } from "lucide-react";
import { AISpinner } from "./AISpinner";
import { fetchMessages, streamChat, fetchDatasets, Message, Dataset } from "@/lib/api";
import MessageBubble from "./MessageBubble";
import GeneratePlotModal from "./GeneratePlotModal";

interface Props {
  conversationId: string | null;
  dataset: Dataset | null;
  onChartSaved: () => void;
  onTitleUpdate: (conversationId: string, title: string) => void;
  onOpenUpload?: () => void;
  onOpenConnect?: () => void;
}

interface StreamingMsg {
  text: string; code: string; codeOutput: string; charts: unknown[]; isStreaming: boolean;
}

const SUGGESTIONS = [
  "Summarize this dataset",
  "Show the top 10 records by highest numeric value",
  "Identify missing values across all columns",
  "Display column types and summary statistics",
];

export default function ChatInterface({ conversationId, dataset, onChartSaved, onTitleUpdate, onOpenUpload, onOpenConnect }: Props) {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState("");
  const [streaming, setStreaming]       = useState<StreamingMsg | null>(null);
  const [isSending, setIsSending]       = useState(false);
  const [showPlotModal, setShowPlotModal] = useState(false);
  const [showDatasetPicker, setShowDatasetPicker] = useState(false);
  const [allDatasets, setAllDatasets]   = useState<Dataset[]>([]);
  const [extraDatasets, setExtraDatasets] = useState<Dataset[]>([]);
  const [homeMounted, setHomeMounted]   = useState(false);
  const [lastFailedMsg, setLastFailedMsg] = useState<string | null>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isFirstMsg  = useRef(true);

  useEffect(() => {
    setMessages([]); setExtraDatasets([]);
    isFirstMsg.current = true;
    if (!conversationId) return;
    fetchMessages(conversationId).then(msgs => {
      setMessages(msgs);
      isFirstMsg.current = msgs.length === 0;
      if (msgs.length > 0) {
        const first = msgs.find(m => m.role === "user");
        if (first && onTitleUpdate) {
          onTitleUpdate(conversationId, first.content.slice(0, 60) + (first.content.length > 60 ? "…" : ""));
        }
      }
    }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    if (showDatasetPicker) fetchDatasets().then(setAllDatasets).catch(() => {});
  }, [showDatasetPicker]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  useEffect(() => {
    if (!conversationId || !dataset) {
      setHomeMounted(false);
      const t = setTimeout(() => setHomeMounted(true), 40);
      return () => clearTimeout(t);
    }
  }, [conversationId, dataset]);

  const send = useCallback(async (text: string) => {
    if (!conversationId || !text.trim() || isSending) return;
    if (isFirstMsg.current && conversationId) {
      const title = text.trim().slice(0, 60) + (text.length > 60 ? "…" : "");
      onTitleUpdate(conversationId, title);
      isFirstMsg.current = false;
    }
    setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: text.trim(), created_at: new Date().toISOString() }]);
    setInput(""); setIsSending(true);
    const streamed: StreamingMsg = { text: "", code: "", codeOutput: "", charts: [], isStreaming: true };
    setStreaming({ ...streamed });

    setLastFailedMsg(null);
    try {
      await streamChat(conversationId, text.trim(), (ev) => {
        const type = ev.type as string;
        if (type === "text")             { streamed.text += (ev.content as string) || ""; setStreaming({ ...streamed }); }
        else if (type === "code")        { streamed.code = (ev.code as string) || ""; setStreaming({ ...streamed }); }
        else if (type === "code_output") { streamed.codeOutput = [(ev.output as string) || "", ev.error as string || ""].filter(Boolean).join("\n"); setStreaming({ ...streamed }); }
        else if (type === "chart")           { streamed.charts = [...streamed.charts, ev.chart_json]; setStreaming({ ...streamed }); }
        else if (type === "conversation_title") {
          // Backend auto-named the conversation — update sidebar immediately
          if (ev.title && ev.conversation_id) {
            onTitleUpdate(ev.conversation_id as string, ev.title as string);
            isFirstMsg.current = false;
          }
        }
        else if (type === "done") {
          setStreaming(null);
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(), role: "assistant", content: streamed.text,
            executed_code: streamed.code || undefined, code_output: streamed.codeOutput || undefined,
            charts: streamed.charts.length ? streamed.charts : undefined, created_at: new Date().toISOString(),
          }]);
        }
      }, extraDatasets.map(d => d.id));
    } catch (err) {
      setStreaming(null);
      setLastFailedMsg(text.trim());
      const errMsg = err instanceof Error ? err.message : "Connection failed";
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: `__error__:${errMsg}`, created_at: new Date().toISOString() }]);
    } finally { setIsSending(false); }
  }, [conversationId, isSending, onTitleUpdate]);

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } };
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  if (!conversationId || !dataset) {
    const cards = [
      { icon: Upload,  label: "Import a file",        sub: "CSV, Excel, JSON",             color: "#00c896", action: onOpenUpload },
      { icon: Database, label: "Connect a database", sub: "PostgreSQL · MySQL · SQLite",   color: "#34d399", action: onOpenConnect },
      { icon: Link2,   label: "Link a Google Sheet",  sub: "Live sync, always up to date", color: "#2bc4a0", action: onOpenConnect },
    ];
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ background: "var(--bg)", position: "relative", overflow: "hidden" }}>
        {/* Ambient glow */}
        <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 560, height: 320, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,200,150,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, maxWidth: 480, width: "100%", padding: "0 32px", textAlign: "center" }}>

          {/* brAIn wordmark */}
          <div style={{
            opacity: homeMounted ? 1 : 0,
            transform: homeMounted ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 600ms cubic-bezier(0.23,1,0.32,1), transform 600ms cubic-bezier(0.23,1,0.32,1)",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: "center" }}>
              <h1 style={{ fontSize: 64, fontWeight: 900, letterSpacing: "-3px", lineHeight: 1, margin: 0, color: "var(--text)" }}>
                br<span style={{ background: "linear-gradient(135deg,#00c896,#33d9ab)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>AI</span>n
              </h1>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", opacity: 0.55, letterSpacing: "0.01em", marginBottom: 4 }}>by stylo</span>
            </div>
            <p style={{ fontSize: 16, color: "var(--text-muted)", marginTop: 14, marginBottom: 48, lineHeight: 1.6, fontWeight: 400 }}>
              Ask any question about your data in plain English.<br />
              <span style={{ color: "var(--text-dim)", fontSize: 14 }}>Connect a data source to get started.</span>
            </p>
          </div>

          {/* Action cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
            {cards.map(({ icon: Icon, label, sub, color, action }, i) => (
              <button key={label} onClick={action}
                style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "16px 20px", borderRadius: 16,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  cursor: action ? "pointer" : "default",
                  textAlign: "left", width: "100%",
                  opacity: homeMounted ? 1 : 0,
                  transform: homeMounted ? "translateY(0) scale(1)" : "translateY(14px) scale(0.98)",
                  transition: `opacity 540ms cubic-bezier(0.23,1,0.32,1), transform 540ms cubic-bezier(0.23,1,0.32,1), border-color 160ms ease, box-shadow 160ms ease`,
                  transitionDelay: `${120 + i * 70}ms`,
                }}
                onMouseEnter={e => {
                  if (!action) return;
                  e.currentTarget.style.borderColor = `${color}55`;
                  e.currentTarget.style.boxShadow = `0 4px 20px ${color}18`;
                  e.currentTarget.style.transform = "translateY(-1px) scale(1)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0) scale(1)";
                }}
                onMouseDown={e => { if (action) e.currentTarget.style.transform = "scale(0.97)"; }}
                onMouseUp={e => { if (action) e.currentTarget.style.transform = "translateY(-1px) scale(1)"; }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}18`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={18} style={{ color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "2px 0 0" }}>{sub}</p>
                </div>
                {action && <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, opacity: 0.5, flexShrink: 0 }} />}
              </button>
            ))}
          </div>

          {/* Footer hint */}
          <p style={{
            fontSize: 12, color: "var(--text-dim)", marginTop: 32,
            opacity: homeMounted ? 0.6 : 0,
            transition: "opacity 600ms cubic-bezier(0.23,1,0.32,1)",
            transitionDelay: "400ms",
          }}>
            Or use the sidebar to browse existing data sources
          </p>
        </div>
      </div>
    );
  }

  const activeDatasets = [dataset, ...extraDatasets];

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
        <BarChart2 size={16} style={{ color: "#00c896" }} />

        {/* Dataset chips */}
        <div className="flex items-center gap-1.5 flex-1 flex-wrap">
          {activeDatasets.map((ds, i) => {
            const chipColors = ["#2bc4a0","#34d399","#fb923c","#f472b6","#60a5fa"];
            const col = chipColors[i % chipColors.length];
            return (
            <div key={ds.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: `${col}18`, border: `1px solid ${col}44`, color: i === 0 ? "var(--text)" : "var(--text-muted)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: col, flexShrink: 0 }} />
              <span style={{ fontSize: 12 }}>{ds.name}</span>
              {i > 0 && (
                <button onClick={() => setExtraDatasets(prev => prev.filter(d => d.id !== ds.id))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0, marginLeft: 2 }}>
                  <X size={9} />
                </button>
              )}
            </div>
            );
          })}

          {/* + Add dataset button */}
          <div className="relative">
            <button onClick={() => setShowDatasetPicker(v => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors hover:opacity-80"
              style={{ border: "1px dashed var(--border2)", color: "var(--text-muted)" }}
              title="Add another dataset to this conversation">
              <Plus size={11} /> Add dataset
            </button>

            {showDatasetPicker && (
              <div className="absolute top-full left-0 mt-1 w-64 rounded-xl shadow-2xl z-50"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                    Add dataset to this analysis
                  </p>
                </div>
                <div className="max-h-56 overflow-y-auto p-1.5 space-y-1">
                  {allDatasets.filter(d => d.id !== dataset.id && !extraDatasets.find(e => e.id === d.id)).map(ds => {
                    const color = ds.source_type === "mysql" ? "#fb923c" : ds.source_type === "postgres" ? "#60a5fa" : "#4ade80";
                    return (
                      <button key={ds.id}
                        onClick={() => { setExtraDatasets(prev => [...prev, ds]); setShowDatasetPicker(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
                        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(0,200,150,0.3)"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
                        <Database size={12} style={{ color, flexShrink: 0 }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>{ds.name}</p>
                          <p className="text-[9px]" style={{ color: "var(--text-dim)" }}>{ds.source_type} · {ds.row_count?.toLocaleString() || "live"} rows</p>
                        </div>
                        <Plus size={12} style={{ color: "#00c896" }} />
                      </button>
                    );
                  })}
                  {allDatasets.filter(d => d.id !== dataset.id && !extraDatasets.find(e => e.id === d.id)).length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: "var(--text-dim)" }}>No other datasets available</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>
              {dataset.row_count?.toLocaleString()} rows · {dataset.source_type}
            </p>
          </div>
          {conversationId && (
            <button onClick={() => setShowPlotModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
              style={{ border: "1px solid rgba(0,200,150,0.35)", background: "rgba(0,200,150,0.1)", color: "#33d9ab" }}>
              <TrendingUp size={13} /> Create Visualization
            </button>
          )}
        </div>
      </div>

      {/* Click outside to close dataset picker */}
      {showDatasetPicker && (
        <div className="fixed inset-0 z-40" onClick={() => setShowDatasetPicker(false)} />
      )}

      {showPlotModal && conversationId && (
        <GeneratePlotModal dataset={dataset} conversationId={conversationId}
          onClose={() => setShowPlotModal(false)}
          onSave={() => { setShowPlotModal(false); onChartSaved(); }} />
      )}

      {/* Extra datasets banner */}
      {extraDatasets.length > 0 && (
        <div className="shrink-0 px-6 py-2 text-xs" style={{ background: "rgba(0,200,150,0.06)", borderBottom: "1px solid rgba(0,200,150,0.15)", color: "var(--accent-light)" }}>
          <strong>{activeDatasets.length} datasets active.</strong> Reference <code className="bg-black/20 px-1 rounded font-mono">df</code> for {dataset.name}, or mention other dataset names to include them.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 && !streaming && (
          <div className="flex flex-col items-center gap-6 py-12">
            <div style={{ color: "var(--text)", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>What would you like to explore?</div>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>Choose a prompt below or enter your own question</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl">
              {SUGGESTIONS.map((s, i) => (
                <button key={s} onClick={() => send(s)}
                  className="stagger-item pill-hover"
                  style={{ "--i": i, padding: "7px 16px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "1px solid var(--border)", color: "var(--text-muted)", background: "transparent", fontWeight: 400 } as React.CSSProperties}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--accent-dim)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, idx) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content}
            executedCode={msg.executed_code} codeOutput={msg.code_output} charts={msg.charts}
            dataset={dataset} conversationId={conversationId} onChartSaved={onChartSaved}
            onRetry={msg.content.startsWith("__error__:") && lastFailedMsg ? () => {
              setMessages(prev => prev.filter((_, i) => i !== idx));
              send(lastFailedMsg);
            } : undefined} />
        ))}
        {streaming && (
          <MessageBubble role="assistant" content={streaming.text}
            executedCode={streaming.code || undefined} codeOutput={streaming.codeOutput || undefined}
            charts={streaming.charts} isStreaming={streaming.isStreaming}
            dataset={dataset} conversationId={conversationId} onChartSaved={onChartSaved} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input — global command bar */}
      <div style={{ padding: "0 20px 20px", background: "transparent" }}>
        <div style={{
          display: "flex", alignItems: "flex-end", gap: 0,
          background: "var(--surface)",
          border: "1.5px solid var(--border2)",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
          transition: "border-color 180ms var(--ease-out), box-shadow 180ms var(--ease-out)",
        }}
          onFocusCapture={e => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = "var(--accent)";
            el.style.boxShadow = "0 8px 32px rgba(0,200,150,0.18), 0 2px 8px rgba(0,200,150,0.08)";
          }}
          onBlurCapture={e => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = "var(--border2)";
            el.style.boxShadow = "0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)";
          }}>
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder="Ask a question about your data…" rows={1} disabled={isSending}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              resize: "none", fontSize: 15, lineHeight: 1.6, color: "var(--text)",
              fontFamily: "inherit", minHeight: 26, padding: "14px 16px",
            }} />
          <button onClick={() => send(input)} disabled={!input.trim() || isSending}
            style={{
              width: 52, alignSelf: "stretch", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: input.trim() && !isSending ? "linear-gradient(135deg,#00c896,#059669)" : "transparent",
              border: "none",
              borderLeft: "1px solid var(--border)",
              cursor: input.trim() && !isSending ? "pointer" : "default",
              color: input.trim() && !isSending ? "#fff" : "var(--text-dim)",
              transition: "background 160ms var(--ease-out), color 160ms var(--ease-out), opacity 120ms ease",
            }}
            onMouseEnter={e => { if (input.trim() && !isSending) e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}>
            {isSending ? <AISpinner size={16} /> : <Send size={16} />}
          </button>
        </div>
        <p style={{ fontSize: 11, textAlign: "center", marginTop: 8, color: "var(--text-dim)", opacity: 0.6 }}>
          Shift+Enter for a new line · brAIn analyses your data
        </p>
      </div>
    </div>
  );
}