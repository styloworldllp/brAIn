"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Plus, FileText, Database, BarChart2, Calendar, Search,
  MessageSquare, BookOpen, X, Check, Edit2, Trash2, Plug,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Dataset, Conversation, fetchDatasets, fetchArchivedDatasets, fetchConversations, createConversation, deleteConversation } from "@/lib/api";
import { AuthUser, fetchMe, withAuthHeaders } from "@/lib/auth";

interface Props {
  selectedDataset: Dataset | null;
  selectedConversation: string | null;
  chartRefresh: number;
  conversationTitles: Record<string, string>;
  onSelectDataset: (d: Dataset | null) => void;
  onSelectConversation: (id: string, dataset: Dataset) => void;
  onNewConversation: (id: string) => void;
  activeView: string;
  onViewChange: (v: string) => void;
  /** Mobile drawer mode — renders as a fixed overlay panel */
  asDrawer?: boolean;
  onDrawerClose?: () => void;
}

interface AllConv { conv: Conversation; dataset: Dataset; }

const W_OPEN   = 220;
const W_CLOSED = 56;
const STORAGE_KEY = "brain-sidebar-collapsed";

/* ── Shared wordmark ── */
function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5, userSelect: "none", minWidth: 0 }}>
      <span style={{ fontWeight: 900, fontSize: size, letterSpacing: "-1px", lineHeight: 1 }}>
        <span style={{ color: "var(--text)" }}>br</span>
        <span style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-light))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>AI</span>
        <span style={{ color: "var(--text)" }}>n</span>
      </span>
      <span style={{ fontSize: 9, fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.02em", opacity: 0.7, whiteSpace: "nowrap" }}>by stylo</span>
    </div>
  );
}

export default function LeftSidebar({
  selectedDataset, selectedConversation, chartRefresh, conversationTitles,
  onSelectDataset, onSelectConversation, onNewConversation, activeView, onViewChange,
  asDrawer = false, onDrawerClose,
}: Props) {
  const [allConvs,      setAllConvs]      = useState<AllConv[]>([]);
  const [archivedConvs, setArchivedConvs] = useState<AllConv[]>([]);
  const [archiveOpen,   setArchiveOpen]   = useState(false);
  const [search,        setSearch]        = useState("");
  const [me,            setMe]            = useState<AuthUser | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  const toggle = () => setCollapsed(c => {
    const next = !c;
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    return next;
  });

  const loadAll = useCallback(async () => {
    const [dsets, archived] = await Promise.all([fetchDatasets(), fetchArchivedDatasets().catch(() => [])]);
    const convs: AllConv[] = [];
    for (const ds of dsets) {
      try {
        const c = await fetchConversations(ds.id);
        c.forEach(conv => convs.push({ conv, dataset: ds }));
      } catch {}
    }
    convs.sort((a, b) => new Date(b.conv.created_at).getTime() - new Date(a.conv.created_at).getTime());
    setAllConvs(convs);

    const archConvs: AllConv[] = [];
    for (const ds of archived) {
      try {
        const c = await fetchConversations(ds.id);
        c.forEach(conv => archConvs.push({ conv, dataset: ds }));
      } catch {}
    }
    archConvs.sort((a, b) => new Date(b.conv.created_at).getTime() - new Date(a.conv.created_at).getTime());
    setArchivedConvs(archConvs);
  }, []);

  useEffect(() => {
    loadAll();
    fetchMe().then(u => { if (u) setMe(u); });
  }, [loadAll]);

  useEffect(() => {
    if (!Object.keys(conversationTitles).length) return;
    setAllConvs(prev => prev.map(item => {
      const t = conversationTitles[item.conv.id];
      return t ? { ...item, conv: { ...item.conv, title: t } } : item;
    }));
  }, [conversationTitles]);

  const handleNew = async () => {
    if (!selectedDataset) { onViewChange("files"); return; }
    const conv = await createConversation(selectedDataset.id);
    setAllConvs(prev => [{ conv: { id: conv.id, title: "New Analysis", created_at: new Date().toISOString() }, dataset: selectedDataset }, ...prev]);
    onNewConversation(conv.id);
    onViewChange("chat");
  };

  const handleDeleteConv = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    await deleteConversation(convId);
    setAllConvs(prev => prev.filter(c => c.conv.id !== convId));
  };

  const sq = search.toLowerCase();
  const filteredConvs = sq
    ? allConvs.filter(({ conv }) => (conversationTitles[conv.id] || conv.title || "").toLowerCase().includes(sq))
    : allConvs;

  /* ────────────────────────────────────────────
     MOBILE DRAWER MODE
  ──────────────────────────────────────────── */
  if (asDrawer) {
    return (
      <aside className="drawer-panel">
        {/* Header */}
        <div style={{
          height: 56, flexShrink: 0, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 14px 0 18px",
          borderBottom: "1px solid var(--border)",
        }}>
          <Wordmark size={20} />
          <button onClick={onDrawerClose}
            style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface3)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-dim)", flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 14px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: "var(--surface3)", border: "1px solid var(--border)" }}>
            <Search size={14} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
            <input placeholder="Search analyses…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", minWidth: 0 }} />
            {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0 }}><X size={12} /></button>}
          </div>
        </div>

        {/* New Analysis */}
        <div style={{ padding: "8px 14px 4px" }}>
          <button onClick={() => { handleNew(); onDrawerClose?.(); }} className="btn-cta"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, padding: "12px 16px", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none" }}>
            <Plus size={16} /> New Analysis
          </button>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0 32px" }}>
          <SectionLabel label="Workspace" />
          <DrawerNavItem icon={<MessageSquare size={18} />} label="Analysis"   active={activeView === "chat"}       onClick={() => { onViewChange("chat");       onDrawerClose?.(); }} />
          <DrawerNavItem icon={<BookOpen size={18} />}      label="Notebooks"  active={activeView === "neurix"}     onClick={() => { onViewChange("neurix");     onDrawerClose?.(); }} />
          <DrawerNavItem icon={<BarChart2 size={18} />}     label="Charts"     active={activeView === "charts"}     onClick={() => { onViewChange("charts");     onDrawerClose?.(); }} />
          <DrawerNavItem icon={<Calendar size={18} />}      label="Schedules"  active={activeView === "schedules"}  onClick={() => { onViewChange("schedules");  onDrawerClose?.(); }} />

          <SectionLabel label="Data" />
          <DrawerNavItem icon={<FileText size={18} />}  label="Files"     active={activeView === "files"}     onClick={() => { onViewChange("files");     onDrawerClose?.(); }} />
          <DrawerNavItem icon={<Database size={18} />}  label="Databases" active={activeView === "databases"} onClick={() => { onViewChange("databases"); onDrawerClose?.(); }} />

          {me?.role === "admin" && (
            <>
              <SectionLabel label="Admin" />
              <DrawerNavItem icon={<Plug size={18} />} label="Connectors" active={activeView === "connectors"} onClick={() => { onViewChange("connectors"); onDrawerClose?.(); }} />
            </>
          )}

          {(filteredConvs.length > 0 || search) && (
            <>
              <SectionLabel label="Recent Analyses" />
              {filteredConvs.length === 0
                ? <p style={{ fontSize: 13, color: "var(--text-dim)", padding: "4px 22px" }}>No results</p>
                : filteredConvs.slice(0, 20).map(({ conv, dataset }) => (
                  <ConvItem key={conv.id}
                    title={conversationTitles[conv.id] || conv.title}
                    isActive={selectedConversation === conv.id}
                    onSelect={() => { onSelectDataset(dataset); onSelectConversation(conv.id, dataset); onViewChange("chat"); onDrawerClose?.(); }}
                    onRename={t => setAllConvs(prev => prev.map(ci => ci.conv.id === conv.id ? { ...ci, conv: { ...ci.conv, title: t } } : ci))}
                    onDelete={e => handleDeleteConv(e, conv.id)}
                    convId={conv.id}
                  />
                ))}
            </>
          )}
        </div>
      </aside>
    );
  }

  /* ────────────────────────────────────────────
     DESKTOP SIDEBAR MODE
  ──────────────────────────────────────────── */
  const c = collapsed;

  return (
    <aside style={{
      width: c ? W_CLOSED : W_OPEN,
      flexShrink: 0, height: "100vh",
      display: "flex", flexDirection: "column",
      background: "var(--surface2)", borderRight: "1px solid var(--border)",
      transition: "width 200ms cubic-bezier(0.4,0,0.2,1)",
      overflow: "hidden",
    }}>

      {/* Logo row */}
      <div style={{
        height: 44, flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: c ? "center" : "space-between",
        padding: c ? "0" : "0 10px 0 16px",
        borderBottom: "1px solid var(--border)",
      }}>
        {c ? (
          <span style={{ fontWeight: 900, fontSize: 13, letterSpacing: "-0.5px", lineHeight: 1, userSelect: "none" }}>
            <span style={{ color: "var(--text)" }}>br</span>
            <span style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-light))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>AI</span>
            <span style={{ color: "var(--text)" }}>n</span>
          </span>
        ) : (
          <Wordmark size={20} />
        )}
        {!c && (
          <button onClick={toggle} title="Collapse sidebar"
            style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 120ms ease, color 120ms ease" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-dim)"; }}>
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {/* Hanger */}
      {c && (
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
          <button onClick={toggle} title="Expand sidebar"
            style={{ width: 32, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "var(--surface3)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-dim)", transition: "background 120ms ease, color 120ms ease, border-color 120ms ease" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-dim)"; e.currentTarget.style.color = "var(--accent-light)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "var(--border)"; }}>
            <PanelLeftOpen size={12} />
          </button>
        </div>
      )}

      {/* Search */}
      {!c && (
        <div style={{ padding: "10px 12px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 8, background: "var(--surface3)", border: "1px solid var(--border)" }}>
            <Search size={12} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
            <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "var(--text)", minWidth: 0 }} />
            {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0 }}><X size={11} /></button>}
          </div>
        </div>
      )}

      {/* New Analysis */}
      <div style={{ padding: c ? "8px 8px 4px" : "8px 12px 4px" }}>
        <button onClick={handleNew} className="btn-cta" title={c ? "New Analysis" : undefined}
          style={{
            width: "100%", display: "flex", alignItems: "center",
            justifyContent: c ? "center" : "flex-start",
            gap: 8, padding: c ? "8px 0" : "8px 12px",
            borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: "pointer", border: "none",
          }}>
          <Plus size={14} />
          {!c && "New Analysis"}
        </button>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 0 8px" }}>
        {!c && <SectionLabel label="Workspace" />}
        <NavItem icon={<MessageSquare size={14} />} label="Analysis"   active={activeView === "chat"}       onClick={() => onViewChange("chat")}       collapsed={c} />
        <NavItem icon={<BookOpen size={14} />}      label="Notebooks"  active={activeView === "neurix"}     onClick={() => onViewChange("neurix")}     collapsed={c} />
        <NavItem icon={<BarChart2 size={14} />}     label="Charts"     active={activeView === "charts"}     onClick={() => onViewChange("charts")}     collapsed={c} />
        <NavItem icon={<Calendar size={14} />}      label="Schedules"  active={activeView === "schedules"}  onClick={() => onViewChange("schedules")}  collapsed={c} />

        {!c && <SectionLabel label="Data" />}
        {c && <div style={{ height: 6 }} />}
        <NavItem icon={<FileText size={14} />} label="Files"     active={activeView === "files"}     onClick={() => onViewChange("files")}     collapsed={c} />
        <NavItem icon={<Database size={14} />} label="Databases" active={activeView === "databases"} onClick={() => onViewChange("databases")} collapsed={c} />

        {me?.role === "admin" && (
          <>
            {!c && <SectionLabel label="Admin" />}
            {c && <div style={{ height: 6 }} />}
            <NavItem icon={<Plug size={14} />} label="Connectors" active={activeView === "connectors"} onClick={() => onViewChange("connectors")} collapsed={c} />
          </>
        )}

        {!c && (filteredConvs.length > 0 || search) && (
          <>
            <SectionLabel label="Recent Analyses" />
            {filteredConvs.length === 0
              ? <p style={{ fontSize: 11, color: "var(--text-dim)", padding: "2px 20px" }}>No results</p>
              : (sq ? filteredConvs : filteredConvs.slice(0, 12)).map(({ conv, dataset }) => (
                <ConvItem key={conv.id}
                  title={conversationTitles[conv.id] || conv.title}
                  isActive={selectedConversation === conv.id}
                  onSelect={() => { onSelectDataset(dataset); onSelectConversation(conv.id, dataset); onViewChange("chat"); }}
                  onRename={t => setAllConvs(prev => prev.map(ci => ci.conv.id === conv.id ? { ...ci, conv: { ...ci.conv, title: t } } : ci))}
                  onDelete={e => handleDeleteConv(e, conv.id)}
                  convId={conv.id}
                />
              ))}
          </>
        )}

        {!c && archivedConvs.length > 0 && (
          <>
            <button onClick={() => setArchiveOpen(o => !o)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "10px 20px 3px", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <span style={{ flex: 1, textAlign: "left" }}>Archived Chats</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: "var(--text-dim)", opacity: 0.7, transform: archiveOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>▾</span>
            </button>
            {archiveOpen && archivedConvs.map(({ conv, dataset }) => (
              <ConvItem key={conv.id}
                title={conversationTitles[conv.id] || conv.title}
                isActive={selectedConversation === conv.id}
                onSelect={() => { onSelectDataset(dataset); onSelectConversation(conv.id, dataset); onViewChange("chat"); }}
                onRename={() => {}}
                onDelete={e => handleDeleteConv(e, conv.id)}
                convId={conv.id}
                archived
              />
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

/* ── Section label ── */
function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ padding: "10px 20px 3px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)" }}>
      {label}
    </div>
  );
}

/* ── Desktop nav item ── */
function NavItem({ icon, label, active, onClick, collapsed, badge }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; collapsed: boolean; badge?: string;
}) {
  return (
    <button onClick={onClick} title={collapsed ? label : undefined}
      style={{
        width: "100%", display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: collapsed ? 0 : 9, padding: collapsed ? "9px 0" : "7px 20px",
        fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer",
        background: active ? "var(--accent-dim)" : "none",
        border: "none", borderRadius: 0,
        color: active ? "var(--accent-light)" : "var(--text-muted)",
        transition: "background 120ms ease, color 120ms ease",
        textAlign: "left", position: "relative" as const,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--accent-dim)"; e.currentTarget.style.color = "var(--text)"; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; } }}>
      {active && collapsed && (
        <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 3, height: 20, borderRadius: "0 3px 3px 0", background: "var(--accent)" }} />
      )}
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!collapsed && badge && (
        <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: "var(--accent-dim)", color: "var(--accent-light)", fontWeight: 600 }}>{badge}</span>
      )}
    </button>
  );
}

/* ── Drawer nav item (larger touch target) ── */
function DrawerNavItem({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 14,
        padding: "13px 20px", fontSize: 15, fontWeight: active ? 600 : 400,
        cursor: "pointer", background: active ? "var(--accent-dim)" : "none",
        border: "none", borderRadius: 0,
        color: active ? "var(--accent-light)" : "var(--text-muted)",
        transition: "background 120ms ease, color 120ms ease",
        textAlign: "left",
        borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
      }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/* ── Conversation item ── */
function ConvItem({ title, isActive, onSelect, onRename, onDelete, convId, archived }: {
  title: string; isActive: boolean; onSelect: () => void;
  onRename: (t: string) => void; onDelete: (e: React.MouseEvent) => void; convId: string; archived?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState(title);
  const [hover,   setHover]   = useState(false);

  const save = async () => {
    if (val.trim()) {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/chat/conversations/${convId}/title`, {
        method: "PATCH", headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title: val.trim() }),
      }).catch(() => {});
      onRename(val.trim());
    }
    setEditing(false);
  };

  if (editing) return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 12px", margin: "1px 8px" }}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        style={{ flex: 1, fontSize: 12, background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 5, padding: "3px 6px", color: "var(--text)", outline: "none" }} />
      <button onClick={save} style={{ background: "none", border: "none", cursor: "pointer", color: "#22c55e" }}><Check size={11} /></button>
      <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)" }}><X size={11} /></button>
    </div>
  );

  return (
    <div onClick={onSelect} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 20px", cursor: "pointer", background: isActive || hover ? "var(--accent-dim)" : "transparent", transition: "background 100ms ease", opacity: archived ? 0.65 : 1 }}>
      <MessageSquare size={10} style={{ color: archived ? "var(--text-dim)" : "var(--text-dim)", flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? "var(--text)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      {hover && !isActive && (
        <>
          {!archived && (
            <button onClick={e => { e.stopPropagation(); setVal(title); setEditing(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 1, flexShrink: 0 }}>
              <Edit2 size={9} />
            </button>
          )}
          <button onClick={onDelete}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 1, flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
            <Trash2 size={9} />
          </button>
        </>
      )}
    </div>
  );
}
