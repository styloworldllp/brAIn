"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, Terminal, BarChart2 } from "lucide-react";
import ChartDisplay from "./ChartDisplay";

interface MessageProps {
  role: "user" | "assistant";
  content: string;
  executedCode?: string;
  codeOutput?: string;
  charts?: unknown[];
  isStreaming?: boolean;
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-3 rounded-xl border border-[#2e3347] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-4 py-2 bg-[#0d1117] text-left text-xs text-[#8b90a8] hover:text-[#e8eaf0] transition-colors"
      >
        <Terminal size={13} />
        <span className="font-mono font-medium">{label}</span>
        <span className="ml-auto">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
      </button>
      {open && (
        <pre className="m-0 rounded-none border-0 text-[#a8dadc] text-xs leading-relaxed max-h-80 overflow-y-auto">
          {code}
        </pre>
      )}
    </div>
  );
}

function OutputBlock({ output }: { output: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-2 rounded-xl border border-[#2e3347] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-4 py-2 bg-[#0d1117] text-left text-xs text-[#8b90a8] hover:text-[#e8eaf0] transition-colors"
      >
        <span className="font-medium">Output</span>
        <span className="ml-auto">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
      </button>
      {open && (
        <pre className="m-0 rounded-none border-0 text-[#e8eaf0] text-xs leading-relaxed max-h-48 overflow-y-auto">
          {output}
        </pre>
      )}
    </div>
  );
}

// Simple markdown-like renderer: bold, inline code, newlines
function RenderText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        // Headings
        if (line.startsWith("### ")) return <h3 key={i} className="font-semibold text-[#e8eaf0] mt-2">{line.slice(4)}</h3>;
        if (line.startsWith("## ")) return <h2 key={i} className="font-semibold text-[#e8eaf0] mt-3 text-base">{line.slice(3)}</h2>;
        if (line.startsWith("# ")) return <h1 key={i} className="font-semibold text-[#e8eaf0] mt-3 text-lg">{line.slice(2)}</h1>;
        // Bullet
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-[#6c63ff] mt-0.5 shrink-0">•</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i} className="font-semibold text-[#e8eaf0]">{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`"))
          return <code key={i} className="px-1.5 py-0.5 rounded bg-[#0d1117] text-[#a8dadc] text-xs font-mono">{part.slice(1, -1)}</code>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function MessageBubble({
  role,
  content,
  executedCode,
  codeOutput,
  charts,
  isStreaming,
}: MessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mt-1
          ${isUser ? "bg-[#6c63ff] text-white" : "bg-[#22263a] text-[#6c63ff] border border-[#2e3347]"}`}
      >
        {isUser ? "U" : "AI"}
      </div>

      {/* Bubble */}
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-2`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed
            ${isUser
              ? "bg-[#6c63ff] text-white rounded-tr-sm"
              : "bg-[#1a1d27] border border-[#2e3347] text-[#c8cad8] rounded-tl-sm"
            }`}
        >
          {isUser ? (
            <p>{content}</p>
          ) : (
            <RenderText text={content} />
          )}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-[#6c63ff] ml-1 animate-pulse rounded-sm" />
          )}
        </div>

        {/* Code block */}
        {executedCode && (
          <div className="w-full">
            <CodeBlock code={executedCode} label="Python code executed" />
          </div>
        )}

        {/* Output */}
        {codeOutput && (
          <div className="w-full">
            <OutputBlock output={codeOutput} />
          </div>
        )}

        {/* Charts */}
        {charts && charts.length > 0 && (
          <div className="w-full space-y-2">
            {charts.map((chart, i) => (
              <ChartDisplay key={i} chartJson={chart} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
