"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, Database, FileText, Trash2, BarChart2, Calendar, Shield, Cpu, Settings, Search, MessageSquare, BookOpen, ChevronDown, ChevronRight, X, Check, Edit2, User, LogOut, Crown } from "lucide-react";
import { Dataset, Conversation, fetchDatasets, fetchConversations, createConversation, deleteDataset, deleteConversation } from "@/lib/api";
import { AuthUser, fetchMe, clearToken, isAdmin, withAuthHeaders } from "@/lib/auth";
import UploadModal from "./UploadModal";
import ConnectModal from "./ConnectModal";
import SettingsModal from "./SettingsModal";
import AIModelModal from "./AIModelModal";
import ChartsPanel from "./ChartsPanel";
import SchedulesPanel from "./SchedulesPanel";
import PIIManagerModal from "./PIIManagerModal";

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
  showUpload?: boolean;
  setShowUpload?: (v: boolean) => void;
  showConnect?: boolean;
  setShowConnect?: (v: boolean) => void;
}

interface AllConv { conv: Conversation; dataset: Dataset; }

export default function LeftSidebar({ selectedDataset, selectedConversation, chartRefresh, conversationTitles, onSelectDataset, onSelectConversation, onNewConversation, activeView, onViewChange, showUpload: showUploadProp, setShowUpload: setShowUploadProp, showConnect: showConnectProp, setShowConnect: setShowConnectProp }: Props) {
  const router = useRouter();
  const [datasets, setDatasets]         = useState<Dataset[]>([]);
  const [allConvs, setAllConvs]         = useState<AllConv[]>([]);
  const [_showUpload, _setShowUpload]   = useState(false);
  const [_showConnect, _setShowConnect] = useState(false);
  const showUpload    = showUploadProp  ?? _showUpload;
  const setShowUpload = setShowUploadProp ?? _setShowUpload;
  const showConnect    = showConnectProp  ?? _showConnect;
  const setShowConnect = setShowConnectProp ?? _setShowConnect;
  const [showSettings, setShowSettings] = useState(false);
  const [showAIModel, setShowAIModel]   = useState(false);
  const [piiDataset, setPiiDataset]     = useState<Dataset | null>(null);
  const [search, setSearch]             = useState("");
  const [chartsOpen, setChartsOpen]     = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(true);
  const [filesOpen, setFilesOpen]       = useState(true);
  const [me, setMe]                     = useState<AuthUser | null>(null);

  const loadAll = useCallback(async () => {
    const dsets = await fetchDatasets();
    setDatasets(dsets);
    const convs: AllConv[] = [];
    for (const ds of dsets) {
      try { const c = await fetchConversations(ds.id); c.forEach(conv => convs.push({ conv, dataset: ds })); } catch {}
    }
    convs.sort((a, b) => new Date(b.conv.created_at).getTime() - new Date(a.conv.created_at).getTime());
    setAllConvs(convs);
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
    if (!selectedDataset) { alert("Select or upload a dataset first."); return; }
    const conv = await createConversation(selectedDataset.id);
    setAllConvs(prev => [{ conv: { id: conv.id, title: "New Analysis", created_at: new Date().toISOString() }, dataset: selectedDataset }, ...prev]);
    onNewConversation(conv.id);
    onViewChange("chat");
  };

  const handleDatasetAdded = async (ds: Dataset) => {
    setDatasets(prev => [ds, ...prev]);
    const conv = await createConversation(ds.id);
    setAllConvs(prev => [{ conv: { id: conv.id, title: "New Analysis", created_at: new Date().toISOString() }, dataset: ds }, ...prev]);
    onSelectDataset(ds);
    onNewConversation(conv.id);
    onViewChange("chat");
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    await deleteConversation(convId);
    setAllConvs(prev => prev.filter(c => c.conv.id !== convId));
  };

  const handleDeleteDataset = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this dataset and all its conversations?")) return;
    await deleteDataset(id);
    setDatasets(prev => prev.filter(d => d.id !== id));
    setAllConvs(prev => prev.filter(c => c.dataset.id !== id));
    if (selectedDataset?.id === id) onSelectDataset(null);
  };


  const fileDatasets      = datasets.filter(d => ["csv", "excel", "xlsx", "xls"].includes(d.source_type));
  const connectorDatasets = datasets.filter(d => ["postgres", "mysql", "sheets"].includes(d.source_type));

  // Search filtering
  const sq = search.toLowerCase();
  const filteredConvs = sq ? allConvs.filter(({ conv }) => (conversationTitles[conv.id] || conv.title || "").toLowerCase().includes(sq)) : allConvs;
  const filteredFiles = sq ? fileDatasets.filter(d => d.name.toLowerCase().includes(sq)) : fileDatasets;
  const filteredConns = sq ? connectorDatasets.filter(d => d.name.toLowerCase().includes(sq)) : connectorDatasets;

  return (
    <>
      <aside style={{
        width: 220, flexShrink: 0, height: "100vh", display: "flex", flexDirection: "column",
        background: "var(--surface2)", borderRight: "1px solid var(--border)",
      }}>
        {/* Logo */}
        <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "baseline", gap: 7, borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-1px", lineHeight: 1, userSelect: "none" }}>
            <span style={{ color: "var(--text)" }}>br</span><span style={{ background: "linear-gradient(135deg,#00c896,#33d9ab)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>AI</span><span style={{ color: "var(--text)" }}>n</span>
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.02em", opacity: 0.7, userSelect: "none" }}>by stylo</span>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 12px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 8, background: "var(--surface3)", border: "1px solid var(--border)" }}>
            <Search size={12} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
            <input
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "var(--text)", minWidth: 0 }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0 }}>
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* New chat button */}
        <div style={{ padding: "8px 12px 4px" }}>
          <button onClick={handleNew} className="btn-cta"
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none" }}>
            <Plus size={14} /> New Analysis
          </button>
        </div>

        {/* Scrollable nav */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0 8px" }}>

          {/* ── WORKSPACE ── */}
          <SectionLabel label="Workspace" />
          <NavItem icon={<MessageSquare size={14} />} label="Analysis" active={activeView === "chat"} onClick={() => onViewChange("chat")} />
          <NavItem icon={<BookOpen size={14} />} label="Notebooks" active={activeView === "neurix"} onClick={() => onViewChange("neurix")} />
          <NavItem icon={<BarChart2 size={14} />} label="Charts" active={chartsOpen} onClick={() => setChartsOpen(o => !o)} chevron={chartsOpen ? "down" : "right"} />
          {chartsOpen && (
            <div style={{ margin: "2px 8px 4px", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", maxHeight: 240, overflowY: "auto" }}>
              <ChartsPanel refreshTrigger={chartRefresh} />
            </div>
          )}
          <NavItem icon={<Calendar size={14} />} label="Schedules" active={schedulesOpen} onClick={() => setSchedulesOpen(o => !o)} chevron={schedulesOpen ? "down" : "right"} />
          {schedulesOpen && (
            <div style={{ margin: "2px 8px 4px", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", maxHeight: 260, overflowY: "auto" }}>
              <SchedulesPanel />
            </div>
          )}

          {/* ── Chats list ── */}
          {(filteredConvs.length > 0 || search) && (
            <>
              <SectionLabel label="Recent Analyses" />
              {filteredConvs.length === 0
                ? <p style={{ fontSize: 11, color: "var(--text-dim)", padding: "2px 20px" }}>No results</p>
                : filteredConvs.slice(0, 8).map(({ conv, dataset }) => (
                  <ConvItem key={conv.id}
                    title={conversationTitles[conv.id] || conv.title}
                    isActive={selectedConversation === conv.id}
                    onSelect={() => { onSelectDataset(dataset); onSelectConversation(conv.id, dataset); onViewChange("chat"); }}
                    onRename={t => setAllConvs(prev => prev.map(c => c.conv.id === conv.id ? { ...c, conv: { ...c.conv, title: t } } : c))}
                    onDelete={e => handleDeleteConversation(e, conv.id)}
                    convId={conv.id}
                  />
                ))}
            </>
          )}

          {/* ── DATA ── */}
          <SectionLabel label="Data" />
          <NavItem icon={<Database size={14} />} label="Data Sources" active={connectorsOpen} onClick={() => setConnectorsOpen(o => !o)} chevron={connectorsOpen ? "down" : "right"} />
          {connectorsOpen && (
            <div style={{ paddingLeft: 8, paddingRight: 8 }}>
              <button onClick={() => setShowConnect(true)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 6, fontSize: 11, color: "var(--text-dim)", cursor: "pointer", background: "none", border: "none" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
                <Plus size={10} /> Add Data Source
              </button>
              {filteredConns.map(ds => (
                <DatasetRow key={ds.id} ds={ds} selected={selectedDataset?.id === ds.id}
                  onClick={() => onSelectDataset(ds)}
                  onDelete={e => handleDeleteDataset(e, ds.id)}
                  onPII={e => { e.stopPropagation(); setPiiDataset(ds); }} />
              ))}
            </div>
          )}

          <NavItem icon={<FileText size={14} />} label="Files" active={filesOpen} onClick={() => setFilesOpen(o => !o)} chevron={filesOpen ? "down" : "right"} />
          {filesOpen && (
            <div style={{ paddingLeft: 8, paddingRight: 8 }}>
              <button onClick={() => setShowUpload(true)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 6, fontSize: 11, color: "var(--text-dim)", cursor: "pointer", background: "none", border: "none" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
                <Upload size={10} /> Import File
              </button>
              {filteredFiles.map(ds => (
                <DatasetRow key={ds.id} ds={ds} selected={selectedDataset?.id === ds.id}
                  onClick={() => onSelectDataset(ds)}
                  onDelete={e => handleDeleteDataset(e, ds.id)}
                  onPII={e => { e.stopPropagation(); setPiiDataset(ds); }} />
              ))}
            </div>
          )}
        </div>

        {/* Bottom */}
        <div style={{ borderTop: "1px solid var(--border)", padding: "8px 8px" }}>
          {/* User identity */}
          {me && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px 6px" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#00c896,#059669)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{(me.username?.[0] ?? "U").toUpperCase()}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.username}</p>
                <p style={{ fontSize: 10, color: "var(--text-dim)" }}>{me.role}</p>
              </div>
              <button onClick={() => { clearToken(); router.push("/login"); }} title="Sign out"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, flexShrink: 0 }}>
                <LogOut size={12} />
              </button>
            </div>
          )}
          <BtnRow icon={<User size={13} />} label="My Profile" onClick={() => router.push("/profile")} />
          {me && isAdmin(me) && (
            <BtnRow icon={<Shield size={13} />} label="Admin Console" onClick={() => router.push("/admin")} />
          )}
          {me?.role === "super_admin" && (
            <BtnRow icon={<Crown size={13} />} label="Stylo Command Center" onClick={() => router.push("/superadmin")}
              highlight />
          )}
          <BtnRow icon={<Settings size={13} />} label="Settings" onClick={() => setShowSettings(true)} />
          {me && isAdmin(me) && <BtnRow icon={<Cpu size={13} />} label="AI Model & API Keys" onClick={() => setShowAIModel(true)} />}
        </div>
      </aside>

      {showUpload   && <UploadModal   onClose={() => setShowUpload(false)}   onSuccess={handleDatasetAdded} />}
      {showConnect  && <ConnectModal  onClose={() => setShowConnect(false)}  onSuccess={handleDatasetAdded} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showAIModel  && <AIModelModal  onClose={() => setShowAIModel(false)}  />}
      {piiDataset   && <PIIManagerModal dataset={piiDataset} onClose={() => setPiiDataset(null)} onSaved={() => setPiiDataset(null)} />}
    </>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ padding: "10px 20px 3px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)" }}>
      {label}
    </div>
  );
}

function NavItem({ icon, label, active, onClick, chevron, badge }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; chevron?: "up" | "down" | "right"; badge?: string;
}) {
  return (
    <button onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9,
        padding: "7px 20px", fontSize: 13, fontWeight: active ? 600 : 400,
        cursor: "pointer", background: active ? "var(--accent-dim)" : "none",
        border: "none", borderRadius: 0, color: active ? "var(--accent-light)" : "var(--text-muted)",
        transition: "background 120ms var(--ease-out), color 120ms var(--ease-out)", textAlign: "left",
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(0,200,150,0.06)"; e.currentTarget.style.color = "var(--text)"; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; } }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: "var(--accent-dim)", color: "var(--accent-light)", fontWeight: 600 }}>{badge}</span>}
      {chevron === "down" && <ChevronDown size={11} />}
      {chevron === "right" && <ChevronRight size={11} />}
    </button>
  );
}

function BtnRow({ icon, label, onClick, highlight }: { icon: React.ReactNode; label: string; onClick: () => void; highlight?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 7, fontSize: 12, fontWeight: highlight ? 600 : 500, cursor: "pointer", background: highlight ? "rgba(0,200,150,0.08)" : "none", border: "none", color: highlight ? "var(--accent-light)" : "var(--text-muted)", transition: "all 0.12s" }}
      onMouseEnter={e => { e.currentTarget.style.color = highlight ? "#33d9ab" : "var(--text)"; e.currentTarget.style.background = highlight ? "rgba(0,200,150,0.14)" : "var(--surface3)"; }}
      onMouseLeave={e => { e.currentTarget.style.color = highlight ? "var(--accent-light)" : "var(--text-muted)"; e.currentTarget.style.background = highlight ? "rgba(0,200,150,0.08)" : "none"; }}>
      {icon}{label}
    </button>
  );
}

function DatasetRow({ ds, selected, onClick, onDelete, onPII }: { ds: Dataset; selected: boolean; onClick: () => void; onDelete: (e: React.MouseEvent) => void; onPII: (e: React.MouseEvent) => void }) {
  const color = ds.source_type === "postgres" ? "#60a5fa" : ds.source_type === "mysql" ? "#fb923c" : ds.source_type === "sheets" ? "#34d399" : ds.source_type === "xlsx" || ds.source_type === "xls" ? "#33d9ab" : "#4ade80";
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 6, cursor: "pointer", background: selected ? "var(--accent-dim)" : hover ? "rgba(0,200,150,0.05)" : "transparent", transition: "all 0.1s" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 11, fontWeight: selected ? 600 : 400, color: selected ? "var(--text)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.name}</span>
      {hover && (
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <button onClick={onPII} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--text-dim)" }} title="Manage PII"><Shield size={10} /></button>
          <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--text-dim)" }} title="Delete"
            onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}><Trash2 size={10} /></button>
        </div>
      )}
    </div>
  );
}

function ConvItem({ title, isActive, onSelect, onRename, onDelete, convId }: { title: string; isActive: boolean; onSelect: () => void; onRename: (t: string) => void; onDelete: (e: React.MouseEvent) => void; convId: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(title);
  const [hover, setHover]     = useState(false);

  const save = async () => {
    if (val.trim()) {
      await fetch(`http://localhost:8000/api/chat/conversations/${convId}/title`, {
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
    <div onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 20px", cursor: "pointer", background: isActive ? "var(--accent-dim)" : hover ? "rgba(0,200,150,0.05)" : "transparent", transition: "all 0.1s" }}>
      <MessageSquare size={10} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? "var(--text)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      {hover && !isActive && (
        <>
          <button onClick={e => { e.stopPropagation(); setVal(title); setEditing(true); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 1, flexShrink: 0 }}>
            <Edit2 size={9} />
          </button>
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
