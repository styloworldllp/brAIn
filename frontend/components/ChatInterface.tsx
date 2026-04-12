"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Loader2, BarChart2, Sparkles } from "lucide-react";
import { fetchMessages, streamChat, Message, Dataset } from "@/lib/api";
import MessageBubble from "./MessageBubble";

interface Props {
  conversationId: string | null;
  dataset: Dataset | null;
}

interface StreamingMessage {
  text: string;
  code: string;
  codeOutput: string;
  charts: unknown[];
  isStreaming: boolean;
}

const SUGGESTIONS = [
  "Show me a summary of this dataset",
  "What are the top 10 rows by the largest numeric column?",
  "Plot the distribution of each numeric column",
  "Find any missing values and show me which columns are affected",
  "Show correlations between numeric columns as a heatmap",
];

export default function ChatInterface({ conversationId, dataset }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    fetchMessages(conversationId).then(setMessages).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const send = useCallback(
    async (text: string) => {
      if (!conversationId || !text.trim() || isSending) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsSending(true);

      const streamed: StreamingMessage = {
        text: "",
        code: "",
        codeOutput: "",
        charts: [],
        isStreaming: true,
      };
      setStreaming({ ...streamed });

      try {
        await streamChat(conversationId, text.trim(), (event) => {
          const type = event.type as string;

          if (type === "text") {
            streamed.text += (event.content as string) || "";
            setStreaming({ ...streamed });
          } else if (type === "code") {
            streamed.code = (event.code as string) || "";
            setStreaming({ ...streamed });
          } else if (type === "code_output") {
            streamed.codeOutput = (event.output as string) || "";
            if (event.error) streamed.codeOutput += "\n" + event.error;
            setStreaming({ ...streamed });
          } else if (type === "chart") {
            streamed.charts = [...streamed.charts, event.chart_json];
            setStreaming({ ...streamed });
          } else if (type === "done") {
            streamed.isStreaming = false;
            setStreaming(null);

            const assistantMsg: Message = {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: streamed.text,
              executed_code: streamed.code || undefined,
              code_output: streamed.codeOutput || undefined,
              charts: streamed.charts.length ? streamed.charts : undefined,
              created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
        });
      } catch (e) {
        setStreaming(null);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: "Sorry, something went wrong. Please try again.",
            created_at: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, isSending]
  );

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  if (!conversationId || !dataset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center p-8 bg-[#0d0f1a]">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-2xl">
          <BarChart2 size={28} className="text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-[#e8eaf0] tracking-tight">
            br<span className="text-violet-400">AI</span>n
          </h2>
          <p className="text-sm text-[#8b90a8] mt-2 max-w-xs">
            Upload a file or connect a database from the sidebar to start analysing your data with AI.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
          {["Upload a CSV or Excel file", "Connect a PostgreSQL database", "Link a Google Sheet"].map((s) => (
            <div key={s} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#1e2235] bg-[#1a1d27] text-sm text-[#8b90a8]">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
              {s}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isEmpty = messages.length === 0 && !streaming;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#1e2235] px-6 py-3 flex items-center gap-3 bg-[#0d0f1a]">
        <BarChart2 size={16} className="text-[#6c63ff]" />
        <div>
          <p className="text-sm font-medium text-[#e8eaf0]">{dataset.name}</p>
          <p className="text-xs text-[#8b90a8]">
            {dataset.row_count?.toLocaleString()} rows ·{" "}
            {Object.keys(dataset.schema_info || {}).length} columns · {dataset.source_type}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {isEmpty && (
          <div className="flex flex-col items-center gap-6 py-12">
            <div className="flex items-center gap-2 text-[#6c63ff]">
              <Sparkles size={18} />
              <span className="text-sm font-medium">Try asking</span>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-3 py-2 rounded-xl border border-[#2e3347] text-xs text-[#8b90a8] hover:text-[#e8eaf0] hover:border-[#6c63ff]/40 transition-colors bg-[#1a1d27]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            executedCode={msg.executed_code}
            codeOutput={msg.code_output}
            charts={msg.charts}
          />
        ))}

        {streaming && (
          <MessageBubble
            role="assistant"
            content={streaming.text}
            executedCode={streaming.code || undefined}
            codeOutput={streaming.codeOutput || undefined}
            charts={streaming.charts}
            isStreaming={streaming.isStreaming}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#1e2235] px-6 py-4 bg-[#0d0f1a]">
        <div className="relative flex items-end gap-3 bg-[#1a1d27] border border-[#1e2235] rounded-2xl px-4 py-3 focus-within:border-violet-500/50 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about your data…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-[#e8eaf0] placeholder-[#3e4357] resize-none outline-none leading-relaxed"
            disabled={isSending}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || isSending}
            className="shrink-0 w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
        <p className="text-[10px] text-[#3e4357] mt-2 text-center">
          Shift+Enter for new line · Claude will write and run Python code to answer your question
        </p>
      </div>
    </div>
  );
}
