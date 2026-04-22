"use client";
import { useState, useEffect } from "react";
import { Plus, BookOpen, Trash2, BarChart2, TrendingUp, Users } from "lucide-react";
import { AISpinner } from "./AISpinner";
import NotebookEditor from "./NotebookEditor";
import { withAuthHeaders } from "@/lib/auth";

const BASE = "http://localhost:8000/api";

interface Template { id: string; title: string; description: string; }
interface Notebook  { id: string; title: string; description: string; template: string; updated_at: string; }

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  eda:      <BarChart2 size={20} className="text-[#33d9ab]" />,
  sales:    <TrendingUp size={20} className="text-green-400" />,
  customer: <Users size={20} className="text-blue-400" />,
};

const TEMPLATE_COLORS: Record<string, string> = {
  eda:      "border-[#00c896]/30 bg-[#00c896]/5",
  sales:    "border-green-500/30 bg-green-500/5",
  customer: "border-blue-500/30 bg-blue-500/5",
};

export default function NeurixPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading]     = useState(false);
  const [openId, setOpenId]       = useState<string | null>(null);

  const load = () => {
    fetch(`${BASE}/notebooks/templates`, { headers: withAuthHeaders() }).then(r => r.json()).then(setTemplates).catch(() => {});
    fetch(`${BASE}/notebooks/`, { headers: withAuthHeaders() }).then(r => r.json()).then(setNotebooks).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const createFromTemplate = async (templateId: string, title: string) => {
    setLoading(true);
    const nb = await fetch(`${BASE}/notebooks/`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title, template: templateId }),
    }).then(r => r.json());
    setLoading(false);
    setNotebooks(prev => [nb, ...prev]);
    setOpenId(nb.id);
  };

  const createBlank = async () => {
    setLoading(true);
    const nb = await fetch(`${BASE}/notebooks/`, {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title: "Untitled notebook", template: "blank" }),
    }).then(r => r.json());
    setLoading(false);
    setNotebooks(prev => [nb, ...prev]);
    setOpenId(nb.id);
  };

  const deleteNotebook = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this notebook?")) return;
    await fetch(`${BASE}/notebooks/${id}`, { method: "DELETE", headers: withAuthHeaders() });
    setNotebooks(prev => prev.filter(n => n.id !== id));
  };

  if (openId) {
    return <NotebookEditor notebookId={openId} onBack={() => { setOpenId(null); load(); }} />;
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#00c896] to-[#059669] flex items-center justify-center">
                <BookOpen size={14} className="text-white" />
              </div>
              <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Notebooks</h1>
            </div>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Structured notebooks for in-depth data exploration and analysis</p>
          </div>
          <button onClick={createBlank} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00a876] hover:bg-[#00c896] text-white text-sm font-medium transition-colors disabled:opacity-50">
            {loading ? <AISpinner size={14} /> : <Plus size={14} />}
            New Notebook
          </button>
        </div>

        {/* Templates */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>Start from a Template</p>
          <div className="grid grid-cols-3 gap-3">
            {templates.map(t => (
              <button key={t.id} onClick={() => createFromTemplate(t.id, t.title)} disabled={loading}
                className={`stagger-item hover-lift flex flex-col gap-2 p-4 rounded-xl border-2 text-left disabled:opacity-50 ${TEMPLATE_COLORS[t.id] || "border-[#1e2235] bg-[#1a1d27]"}`}
                style={{ "--i": templates.indexOf(t) } as React.CSSProperties}>
                <div className="flex items-center gap-2">
                  {TEMPLATE_ICONS[t.id] || <BookOpen size={20} style={{ color: "var(--text-muted)" }} />}
                  <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t.title}</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{t.description}</p>
                <span className="text-[10px] text-[#33d9ab] font-medium mt-1">Use this template →</span>
              </button>
            ))}
          </div>
        </div>

        {/* Existing notebooks */}
        {notebooks.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>Your Notebooks</p>
            <div className="space-y-2">
              {notebooks.map(nb => (
                <div key={nb.id} onClick={() => setOpenId(nb.id)}
                  className="hover-lift group flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
                  style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                  <BookOpen size={15} className="text-[#33d9ab] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{nb.title}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                      {nb.template !== "blank" ? `Template: ${nb.template}` : "Blank"} · Updated {new Date(nb.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button onClick={e => deleteNotebook(e, nb.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all p-1" style={{ color: "var(--text-dim)" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {notebooks.length === 0 && templates.length > 0 && (
          <div className="text-center py-12" style={{ color: "var(--text-dim)" }}>
            <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No notebooks yet. Select a template above to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
