"use client";
import { useState, useEffect } from "react";
import { Plus, BookOpen, Trash2, BarChart2, TrendingUp, Users, Clock, ChevronRight, Sparkles } from "lucide-react";
import { AISpinner } from "./AISpinner";
import NotebookEditor from "./NotebookEditor";
import { withAuthHeaders } from "@/lib/auth";
import { useIsMobile } from "@/hooks/useIsMobile";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

interface Template { id: string; title: string; description: string; }
interface Notebook  { id: string; title: string; description: string; template: string; updated_at: string; }

const TEMPLATE_META: Record<string, { icon: React.ReactNode; gradient: string; desc: string }> = {
  eda:      { icon: <BarChart2 size={18} style={{ color: "#fff" }} />,   gradient: "linear-gradient(135deg,var(--accent),var(--accent2))",   desc: "Distribution, correlations, outliers" },
  sales:    { icon: <TrendingUp size={18} style={{ color: "#fff" }} />,  gradient: "linear-gradient(135deg,#f59e0b,#d97706)",                desc: "Revenue trends and forecasting" },
  customer: { icon: <Users size={18} style={{ color: "#fff" }} />,       gradient: "linear-gradient(135deg,#3b82f6,#2563eb)",                desc: "Segmentation and behaviour" },
};

export default function NeurixPage() {
  const isMobile = useIsMobile();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading]     = useState(false);
  const [openId, setOpenId]       = useState<string | null>(null);

  const load = () => {
    fetch(`${BASE}/notebooks/templates`, { headers: withAuthHeaders() })
      .then(r => r.json()).then(setTemplates).catch(console.error);
    fetch(`${BASE}/notebooks/`, { headers: withAuthHeaders() })
      .then(r => r.json()).then(setNotebooks).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  const createFrom = async (templateId: string, title: string) => {
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

  if (openId) return <NotebookEditor notebookId={openId} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)" }}>

      {/* Header */}
      <div style={{ padding: isMobile ? "14px 16px 12px" : "20px 28px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px var(--accent-glow)", flexShrink: 0 }}>
              <BookOpen size={17} style={{ color: "#fff" }} />
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.3px" }}>Notebooks</h1>
              {!isMobile && <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Structured analysis with code, charts, and notes</p>}
            </div>
          </div>
          <button onClick={createBlank} disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "8px 14px" : "8px 18px", borderRadius: 10, background: "linear-gradient(135deg,var(--accent),var(--accent2))", color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", boxShadow: "0 2px 10px var(--accent-glow)", opacity: loading ? 0.7 : 1, whiteSpace: "nowrap", flexShrink: 0 }}>
            {loading ? <AISpinner size={14} /> : <Plus size={14} />} {isMobile ? "New" : "New Notebook"}
          </button>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px 14px" : "28px 28px" }}>

        {/* Templates */}
        {templates.length > 0 && (
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Sparkles size={13} style={{ color: "var(--accent)" }} />
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", margin: 0 }}>Start from a template</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
              {templates.map(t => {
                const meta = TEMPLATE_META[t.id];
                return (
                  <button key={t.id} onClick={() => createFrom(t.id, t.title)} disabled={loading}
                    style={{ display: "flex", flexDirection: "column", gap: 0, padding: 0, borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", textAlign: "left", overflow: "hidden", transition: "all 160ms ease", opacity: loading ? 0.6 : 1 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-accent)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px var(--accent-glow)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                    {/* Color bar */}
                    <div style={{ height: 5, background: meta?.gradient || "var(--accent)", width: "100%" }} />
                    <div style={{ padding: "16px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 9, background: meta?.gradient || "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {meta?.icon || <BookOpen size={16} style={{ color: "#fff" }} />}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{t.title}</span>
                      </div>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.6 }}>{t.description}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, color: "var(--accent-light)" }}>
                        Use template <ChevronRight size={11} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Existing notebooks */}
        {notebooks.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <BookOpen size={13} style={{ color: "var(--text-dim)" }} />
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", margin: 0 }}>
                Your notebooks ({notebooks.length})
              </p>
            </div>
            {isMobile ? (
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)" }}>
                {notebooks.map((nb, idx) => <NotebookRow key={nb.id} nb={nb} isLast={idx === notebooks.length - 1} isMobile onOpen={() => setOpenId(nb.id)} onDelete={e => deleteNotebook(e, nb.id)} />)}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)", minWidth: 460 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 120px 48px", padding: "9px 18px", background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                  {["Title", "Template", "Last updated", ""].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</span>
                  ))}
                </div>
                {notebooks.map((nb, idx) => <NotebookRow key={nb.id} nb={nb} isLast={idx === notebooks.length - 1} isMobile={false} onOpen={() => setOpenId(nb.id)} onDelete={e => deleteNotebook(e, nb.id)} />)}
              </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {notebooks.length === 0 && templates.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 14, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BookOpen size={26} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: "0 0 6px" }}>No notebooks yet</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Create a blank notebook or choose a template above</p>
            </div>
          </div>
        )}

        {notebooks.length === 0 && templates.length > 0 && (
          <div style={{ textAlign: "center", paddingTop: 20 }}>
            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>No notebooks yet — select a template above to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NotebookRow({ nb, isLast, isMobile, onOpen, onDelete }: { nb: Notebook; isLast: boolean; isMobile: boolean; onOpen: () => void; onDelete: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = useState(false);

  if (isMobile) return (
    <div onClick={onOpen} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: isLast ? "none" : "1px solid var(--border)", cursor: "pointer", background: "transparent" }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <BookOpen size={14} style={{ color: "var(--accent)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nb.title}</p>
        <p style={{ fontSize: 10, color: "var(--text-dim)", margin: 0, textTransform: "capitalize" }}>
          {nb.template === "blank" ? "Blank" : nb.template} · {new Date(nb.updated_at).toLocaleDateString()}
        </p>
      </div>
      <button onClick={onDelete} style={{ padding: 8, borderRadius: 6, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", flexShrink: 0, display: "flex" }}>
        <Trash2 size={15} />
      </button>
    </div>
  );

  return (
    <div onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "grid", gridTemplateColumns: "1fr 130px 120px 48px", padding: "13px 18px", alignItems: "center", cursor: "pointer", background: hover ? "var(--accent-dim)" : "transparent", borderBottom: isLast ? "none" : "1px solid var(--border)", transition: "background 100ms ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-dim)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <BookOpen size={13} style={{ color: "var(--accent)" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nb.title}</span>
      </div>
      <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>{nb.template === "blank" ? "Blank" : nb.template}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Clock size={10} style={{ color: "var(--text-dim)" }} />
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{new Date(nb.updated_at).toLocaleDateString()}</span>
      </div>
      <button onClick={onDelete}
        style={{ padding: 5, borderRadius: 5, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", opacity: hover ? 1 : 0, transition: "opacity 100ms ease", display: "flex" }}
        onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
        onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}
