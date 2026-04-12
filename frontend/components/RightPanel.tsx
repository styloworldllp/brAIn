"use client";
import { useState } from "react";
import { Database, FileText, ChevronRight, Table2 } from "lucide-react";
import { Dataset } from "@/lib/api";

interface Props {
  dataset: Dataset | null;
}

type Tab = "explorer" | "notes";

export default function RightPanel({ dataset }: Props) {
  const [tab, setTab] = useState<Tab>("explorer");
  const [notes, setNotes] = useState("");
  const [expandedCol, setExpandedCol] = useState<string | null>(null);

  return (
    <aside className="w-64 shrink-0 flex flex-col border-l border-[#1e2235] bg-[#0d0f1a] h-screen overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-[#1e2235]">
        {([["explorer", "Data Explorer"], ["notes", "Notes"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-3 text-xs font-medium transition-colors border-b-2
              ${tab === id
                ? "text-violet-400 border-violet-500"
                : "text-[#8b90a8] border-transparent hover:text-[#c8cad8]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "explorer" ? (
          <DataExplorer dataset={dataset} expandedCol={expandedCol} setExpandedCol={setExpandedCol} />
        ) : (
          <NotesPanel notes={notes} setNotes={setNotes} />
        )}
      </div>
    </aside>
  );
}

function DataExplorer({ dataset, expandedCol, setExpandedCol }: {
  dataset: Dataset | null;
  expandedCol: string | null;
  setExpandedCol: (c: string | null) => void;
}) {
  if (!dataset) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-4">
        <Database size={22} className="text-[#2e3347]" />
        <p className="text-xs text-[#3e4357]">Select a dataset to explore its schema</p>
      </div>
    );
  }

  const schema = dataset.schema_info || {};
  const cols = Object.keys(schema);

  return (
    <div className="p-3">
      {/* Dataset summary */}
      <div className="bg-[#1a1d27] border border-[#1e2235] rounded-xl p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Table2 size={13} className="text-violet-400" />
          <span className="text-xs font-medium text-[#e8eaf0] truncate">{dataset.name}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Rows" value={dataset.row_count?.toLocaleString() ?? "—"} />
          <Stat label="Columns" value={String(cols.length)} />
          <Stat label="Source" value={dataset.source_type} />
        </div>
      </div>

      {/* Columns */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3e4357] px-1 mb-2">
        Columns
      </p>
      <div className="space-y-1">
        {cols.map((col) => {
          const info = schema[col];
          const isOpen = expandedCol === col;
          return (
            <div key={col} className="rounded-lg border border-[#1e2235] overflow-hidden">
              <button
                onClick={() => setExpandedCol(isOpen ? null : col)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1a1d27] transition-colors"
              >
                <ChevronRight
                  size={11}
                  className={`shrink-0 text-[#3e4357] transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
                <span className="flex-1 text-xs text-[#c8cad8] truncate">{col}</span>
                <span className="text-[10px] text-[#3e4357] font-mono shrink-0">
                  {shortType(info?.dtype)}
                </span>
              </button>
              {isOpen && (
                <div className="px-3 pb-2 border-t border-[#1e2235] bg-[#0d0f1a]">
                  <div className="mt-2 space-y-1">
                    <InfoRow label="Type" value={info?.dtype} />
                    <InfoRow label="Nulls" value={String(info?.null_count ?? 0)} />
                    {info?.sample_values?.length > 0 && (
                      <div>
                        <p className="text-[9px] text-[#3e4357] uppercase tracking-wider mt-2 mb-1">Sample values</p>
                        <div className="flex flex-wrap gap-1">
                          {info.sample_values.slice(0, 3).map((v, i) => (
                            <span key={i} className="text-[10px] bg-[#1a1d27] text-[#8b90a8] px-1.5 py-0.5 rounded font-mono truncate max-w-full">
                              {String(v)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotesPanel({ notes, setNotes }: { notes: string; setNotes: (s: string) => void }) {
  return (
    <div className="p-3 h-full flex flex-col">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3e4357] mb-2">
        Your notes
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Write notes about this dataset or analysis…"
        className="flex-1 w-full bg-[#1a1d27] border border-[#1e2235] rounded-xl p-3 text-xs text-[#c8cad8] placeholder-[#3e4357] resize-none outline-none focus:border-violet-500/40 transition-colors leading-relaxed min-h-[300px]"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] text-[#3e4357] uppercase tracking-wider">{label}</p>
      <p className="text-xs text-[#c8cad8] font-medium truncate">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-[#3e4357]">{label}</span>
      <span className="text-[10px] text-[#8b90a8] font-mono">{value ?? "—"}</span>
    </div>
  );
}

function shortType(dtype?: string): string {
  if (!dtype) return "—";
  if (dtype.includes("int")) return "int";
  if (dtype.includes("float")) return "float";
  if (dtype.includes("datetime")) return "date";
  if (dtype.includes("bool")) return "bool";
  if (dtype === "object") return "str";
  return dtype.slice(0, 6);
}
