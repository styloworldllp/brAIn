"use client";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Terminal, BarChart2, AlertTriangle } from "lucide-react";
import ChartPickerModal from "./ChartPickerModal";
import MessageActions from "./MessageActions";
import { Dataset } from "@/lib/api";

interface MessageProps {
  role: "user" | "assistant";
  content: string;
  executedCode?: string;
  codeOutput?: string;
  charts?: unknown[];
  isStreaming?: boolean;
  dataset?: Dataset | null;
  conversationId?: string;
  onChartSaved?: () => void;
  onRetry?: () => void;
}

function CodeBlock({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 12, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "var(--surface2)", color: "var(--text-muted)", fontSize: 12, border: "none", cursor: "pointer", textAlign: "left" }}>
        <Terminal size={12} />
        <span style={{ flex: 1, fontFamily: "monospace", fontWeight: 600 }}>Python executed</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <pre style={{ margin: 0, background: "var(--code-bg)", color: "var(--code-text)", fontSize: 12, lineHeight: 1.65, maxHeight: 280, overflowY: "auto", padding: "12px 16px" }}>
          {code}
        </pre>
      )}
    </div>
  );
}

function OutputBlock({ output }: { output: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginTop: 4, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "var(--surface2)", color: "var(--text-muted)", fontSize: 12, border: "none", cursor: "pointer" }}>
        <span style={{ flex: 1, fontWeight: 600 }}>Output</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <pre style={{ margin: 0, background: "var(--bg)", color: "var(--text)", fontSize: 12.5, lineHeight: 1.65, maxHeight: 260, overflowY: "auto", padding: "12px 16px", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
          {output}
        </pre>
      )}
    </div>
  );
}

/* ── Markdown parser ─────────────────────────────────────────── */
type Block =
  | { t: "h1" | "h2" | "h3"; text: string }
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "table"; headers: string[]; rows: string[][] }
  | { t: "code"; code: string }
  | { t: "blank" };

function parseBlocks(raw: string): Block[] {
  const lines  = raw.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      blocks.push({ t: "code", code: codeLines.join("\n") });
      i++; continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[-:| ]+\|?\s*$/.test(lines[i + 1])) {
      const headers = parseCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) { rows.push(parseCells(lines[i])); i++; }
      if (headers.length) blocks.push({ t: "table", headers, rows });
      continue;
    }
    const h3 = line.match(/^###\s+(.+)/); if (h3) { blocks.push({ t: "h3", text: h3[1] }); i++; continue; }
    const h2 = line.match(/^##\s+(.+)/);  if (h2) { blocks.push({ t: "h2", text: h2[1] }); i++; continue; }
    const h1 = line.match(/^#\s+(.+)/);   if (h1) { blocks.push({ t: "h1", text: h1[1] }); i++; continue; }
    if (line.match(/^[-*]\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) { items.push(lines[i].replace(/^[-*]\s+/, "")); i++; }
      blocks.push({ t: "ul", items }); continue;
    }
    if (line.match(/^\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) { items.push(lines[i].replace(/^\d+\.\s+/, "")); i++; }
      blocks.push({ t: "ol", items }); continue;
    }
    if (!line.trim()) { blocks.push({ t: "blank" }); i++; continue; }
    blocks.push({ t: "p", text: line }); i++;
  }
  return blocks;
}

function parseCells(line: string): string[] {
  return line.split("|").map(c => c.trim()).filter((c, i, arr) => !(i === 0 && !c) && !(i === arr.length - 1 && !c));
}

function isNum(s: string) { return /^-?[\d,. ]+(%|[A-Z]{2,3})?$/.test(s.trim()) && s.trim().length > 0; }

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return <strong key={i} style={{ fontWeight: 650, color: "var(--text)" }}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`"))
          return <code key={i} style={{ background: "rgba(0,200,150,0.12)", color: "var(--accent-light)", padding: "1px 6px", borderRadius: 4, fontSize: 12, fontFamily: "monospace" }}>{p.slice(1, -1)}</code>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function Block({ block }: { block: Block }) {
  switch (block.t) {
    case "h1": return <h2 className="ai-response" style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", borderBottom: "1px solid var(--border)", paddingBottom: 6, margin: "16px 0 8px" }}>{block.text}</h2>;
    case "h2": return <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-light)", margin: "14px 0 5px" }}>{block.text}</h3>;
    case "h3": return <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-light)", margin: "10px 0 4px" }}>{block.text}</h4>;

    case "table": return (
      <div className="ai-table-wrap">
        <table className="ai-table">
          <thead>
            <tr>{block.headers.map((h, i) => <th key={i}>{h.replace(/\*\*/g, "").trim()}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => {
                // Strip markdown bold markers from table cells
                const clean = cell.replace(/\*\*/g, "").trim();
                return <td key={ci} className={isNum(clean) ? "numeric" : ""}><Inline text={clean} /></td>;
              })}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    case "code": return (
      <pre style={{ background: "var(--code-bg)", color: "var(--code-text)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", overflowX: "auto", margin: "10px 0", fontSize: 12.5, lineHeight: 1.65 }}>
        {block.code}
      </pre>
    );

    case "ul": return (
      <ul style={{ margin: "6px 0 10px", padding: 0, listStyle: "none" }}>
        {block.items.map((item, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "5px 0", fontSize: 14, color: "var(--text)", lineHeight: 1.7 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: 9 }} />
            <span><Inline text={item} /></span>
          </li>
        ))}
      </ul>
    );

    case "ol": return (
      <ol style={{ margin: "6px 0 10px", padding: 0, listStyle: "none" }}>
        {block.items.map((item, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "5px 0", fontSize: 14, color: "var(--text)", lineHeight: 1.7 }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(0,200,150,0.15)", color: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
            <span><Inline text={item} /></span>
          </li>
        ))}
      </ol>
    );

    case "blank": return <div style={{ height: 6 }} />;

    case "p": {
      const text = block.text;
      // Highlight standalone numbers/amounts
      const highlighted = text.split(/(\b[\d,]+\.?\d*\s*(?:₹|USD|EUR|%|Cr|Lakh|K|M)?\b)/g).map((part, i) => {
        if (/^\d[\d,]*\.?\d*\s*(?:₹|USD|EUR|%|Cr|Lakh|K|M)?$/.test(part.trim()) && part.trim().length > 1)
          return <span key={i} style={{ color: "var(--number-color)", fontWeight: 600 }}>{part}</span>;
        return <span key={i}><Inline text={part} /></span>;
      });
      return <p style={{ margin: "3px 0 6px", fontSize: 14, color: "var(--text)", lineHeight: 1.8 }}>{highlighted}</p>;
    }
  }
}

function AIContent({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return <div className="ai-response">{blocks.map((b, i) => <Block key={i} block={b} />)}</div>;
}

/* ── Main ────────────────────────────────────────────────────── */
export default function MessageBubble({ role, content, executedCode, codeOutput, charts, isStreaming, dataset, conversationId, onChartSaved, onRetry }: MessageProps) {
  const isUser = role === "user";
  const isError = !isUser && content.startsWith("__error__:");
  const errorMsg = isError ? content.slice("__error__:".length) : null;
  const [showChartPicker, setShowChartPicker] = useState(false);
  const showActions = !isUser && !isStreaming && !isError && content.trim().length > 0;

  return (
    <>
      <div className="msg-enter" style={{ display: "flex", gap: 12, flexDirection: isUser ? "row-reverse" : "row" }}>
        {/* Avatar */}
        {isUser ? (
          <div style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0, marginTop: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700,
            background: "linear-gradient(135deg, var(--bubble-user-from), var(--bubble-user-to))", color: "#fff",
          }}>
            U
          </div>
        ) : (
          <img src="/avatar.jpg" alt="brAIn" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, marginTop: 4, objectFit: "cover", objectPosition: "top" }} />
        )}

        <div style={{ maxWidth: "87%", display: "flex", flexDirection: "column", gap: 6, alignItems: isUser ? "flex-end" : "flex-start", minWidth: 0 }}>
          {/* Bubble */}
          {isUser ? (
            <div style={{
              background: "linear-gradient(135deg, var(--bubble-user-from), var(--bubble-user-to))",
              color: "#fff", borderRadius: "18px 18px 4px 18px",
              padding: "12px 18px", fontSize: 14, lineHeight: 1.65,
            }}>
              {content}
            </div>
          ) : isError ? (
            <div style={{
              display: "flex", flexDirection: "column", gap: 10,
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)",
              borderLeft: "3px solid #ef4444", borderRadius: "4px 18px 18px 18px",
              padding: "14px 18px", width: "100%",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: "#ef4444", margin: 0 }}>Something went wrong</p>
              </div>
              {errorMsg && errorMsg !== "Stream failed" && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, fontFamily: "monospace" }}>{errorMsg}</p>
              )}
              {onRetry && (
                <button onClick={onRetry} style={{
                  alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)", color: "#f87171",
                  transition: "background 150ms ease",
                }}>
                  Try again
                </button>
              )}
            </div>
          ) : (
            <div style={{
              background: "var(--bubble-ai-bg)",
              border: "1px solid var(--bubble-ai-border)",
              borderLeft: "3px solid var(--accent)",
              borderRadius: "4px 18px 18px 18px",
              padding: "16px 20px",
              width: "100%",
            }}>
              {isStreaming && !content.trim() ? (
                <div className="think-dots" style={{ padding: "6px 0" }}>
                  <span className="think-dot" />
                  <span className="think-dot" />
                  <span className="think-dot" />
                </div>
              ) : (
                <>
                  <AIContent text={content} />
                  {isStreaming && <span className="stream-cursor" />}
                </>
              )}
            </div>
          )}

          {/* Code icon: only visible while streaming, click to peek at code */}
          {isStreaming && executedCode && (
            <RunningCodeIndicator code={executedCode} />
          )}

          {charts && charts.length > 0 && (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
              {charts.map((c, i) => <SavedChart key={i} chartJson={c} />)}
            </div>
          )}

          {showActions && dataset && conversationId && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <button onClick={() => setShowChartPicker(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "rgba(0,200,150,0.1)", border: "1px solid rgba(0,200,150,0.35)", color: "var(--accent-light)" }}>
                <BarChart2 size={12} /> Create chart
              </button>
              <MessageActions dataset={dataset} conversationId={conversationId} messageContent={content} charts={charts || []} onChartSaved={onChartSaved || (() => {})} />
            </div>
          )}
        </div>
      </div>

      {showChartPicker && dataset && conversationId && (
        <ChartPickerModal dataset={dataset} conversationId={conversationId} analysisContext={content}
          onClose={() => setShowChartPicker(false)} onSaved={() => { setShowChartPicker(false); onChartSaved?.(); }} />
      )}
    </>
  );
}

// Small pulsing code icon shown only while brAIn is working
function RunningCodeIndicator({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ width: "100%" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 20, fontSize: 11,
          cursor: "pointer", border: "1px solid var(--border)",
          background: "var(--surface)", color: "var(--text-dim)",
          transition: "border-color 150ms var(--ease-out), color 150ms var(--ease-out), background 150ms var(--ease-out)",
        }}
        title="Click to see running code"
      >
        <span style={{
          display: "inline-block", width: 6, height: 6, borderRadius: "50%",
          background: "var(--accent)", animation: "blink 1s step-end infinite",
          flexShrink: 0,
        }} />
        <Terminal size={10} />
        <span>brAIn is working…</span>
      </button>
      {open && (
        <pre style={{
          marginTop: 6, borderRadius: 10, padding: "10px 14px",
          fontSize: 11.5, lineHeight: 1.6, maxHeight: 200, overflowY: "auto",
          background: "var(--code-bg)", color: "var(--code-text)",
          border: "1px solid var(--border)", fontFamily: "monospace",
        }}>
          {code}
        </pre>
      )}
    </div>
  );
}

function SavedChart({ chartJson }: { chartJson: unknown }) {
  const [Comp, setComp] = useState<React.ComponentType<{ chartJson: unknown }> | null>(null);
  useEffect(() => { import("./ChartDisplay").then(m => setComp(() => m.default)); }, []);
  if (!Comp) return null;
  return <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}><Comp chartJson={chartJson} /></div>;
}
