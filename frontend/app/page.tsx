"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun, Monitor, Leaf, Database, X } from "lucide-react";
import LeftSidebar from "@/components/LeftSidebar";
import BottomNav from "@/components/BottomNav";
import ChatInterface from "@/components/ChatInterface";
import RightPanel from "@/components/RightPanel";
import NeurixPage from "@/components/NeurixPage";
import FilesPage from "@/components/FilesPage";
import DatabasesPage from "@/components/DatabasesPage";
import ChartsPage from "@/components/ChartsPage";
import SchedulesPage from "@/components/SchedulesPage";
import ConnectorsPage from "@/components/ConnectorsPage";
import ProfileMenu from "@/components/ProfileMenu";
import NotificationsBell from "@/components/NotificationsBell";
import SettingsModal from "@/components/SettingsModal";
import SupportModal from "@/components/SupportModal";
import NeuronBalance from "@/components/NeuronBalance";
import { Dataset, createConversation, fetchDatasets } from "@/lib/api";
import { AuthUser, fetchMe, logout } from "@/lib/auth";

type Theme = "dark" | "stylogreen" | "light" | "system";
const THEME_CYCLE: Theme[] = ["dark", "stylogreen", "light", "system"];
const THEME_ICONS: Record<Theme, React.ReactNode> = {
  dark:       <Moon size={13} />,
  stylogreen: <Leaf size={13} />,
  light:      <Sun size={13} />,
  system:     <Monitor size={13} />,
};
const THEME_LABELS: Record<Theme, string> = {
  dark: "Dark", stylogreen: "Stylo", light: "Light", system: "Auto",
};
function applyTheme(t: Theme) {
  const h = document.documentElement;
  h.classList.remove("dark", "light", "stylogreen");
  if (t === "light") h.classList.add("light");
  else if (t === "stylogreen") h.classList.add("stylogreen");
  else if (t === "system") h.classList.add(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  else h.classList.add("dark");
  localStorage.setItem("brain-theme", t);
}

type View = "chat" | "neurix" | "files" | "databases" | "charts" | "schedules" | "connectors";

export default function Home() {
  const router = useRouter();
  const [authed, setAuthed]       = useState(false);
  const [user,   setUser]         = useState<AuthUser | null>(null);
  const [view,   setView]         = useState<View>("chat");
  const [selectedDataset,      setSelectedDataset]      = useState<Dataset | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [chartRefresh,         setChartRefresh]         = useState(0);
  const [conversationTitles,   setConversationTitles]   = useState<Record<string, string>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showSupport,  setShowSupport]  = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
  const [neuronRefresh, setNeuronRefresh] = useState(0);
  const [neuronToast, setNeuronToast] = useState<string | null>(null);

  // Responsive breakpoint detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close drawer when switching to desktop
  useEffect(() => { if (!isMobile) setMobileDrawer(false); }, [isMobile]);

  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    setTheme(next);
    applyTheme(next);
  };

  useEffect(() => {
    const saved = (localStorage.getItem("brain-theme") || "dark") as Theme;
    setTheme(saved);
    applyTheme(saved);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("brain_token");
    if (!token) { router.replace("/login"); return; }
    fetchMe().then(async u => {
      if (!u) { logout().then(() => router.replace("/login")); return; }
      if (u.role === "super_admin") { router.replace("/superadmin"); return; }
      if (u.role === "staff")       { router.replace("/staff"); return; }
      setUser(u);
      setAuthed(true);

      // Restore last view
      const savedView = localStorage.getItem("brain-view") as View | null;
      if (savedView) setView(savedView);

      // Restore last dataset + conversation
      const savedDatasetId = localStorage.getItem("brain-dataset-id");
      const savedConvId    = localStorage.getItem("brain-conv-id");
      if (savedDatasetId) {
        try {
          const all = await fetchDatasets();
          const ds = all.find(d => d.id === savedDatasetId);
          if (ds) {
            setSelectedDataset(ds);
            if (savedConvId) setSelectedConversation(savedConvId);
          }
        } catch {}
      }
    });
  }, [router]);

  // Persist active view
  useEffect(() => {
    localStorage.setItem("brain-view", view);
  }, [view]);

  // Persist selected dataset + conversation
  useEffect(() => {
    if (selectedDataset) localStorage.setItem("brain-dataset-id", selectedDataset.id);
  }, [selectedDataset]);
  useEffect(() => {
    if (selectedConversation) localStorage.setItem("brain-conv-id", selectedConversation);
  }, [selectedConversation]);

  // Handle Stripe redirect: ?neurix=success or ?neurix=cancel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const neurix = params.get("neurix");
    if (neurix === "success") {
      setNeuronToast("Payment successful — neurons added to your account!");
      setNeuronRefresh(n => n + 1);
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setNeuronToast(null), 6000);
    } else if (neurix === "cancel") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Warn before refresh/close when analysis is running
  useEffect(() => {
    if (!isAnalysisRunning) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Analysis is in progress. Refreshing will cancel it.";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isAnalysisRunning]);

  const handleOpenDataset = async (ds: Dataset) => {
    setSelectedDataset(ds);
    const conv = await createConversation(ds.id);
    setSelectedConversation(conv.id);
    setView("chat");
  };

  if (!authed) return (
    <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid var(--accent)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── Shared content views ── */
  const contentViews = (
    <>
      {view === "chat"       && <ChatInterface conversationId={selectedConversation} dataset={selectedDataset} onChartSaved={() => setChartRefresh(n => n + 1)} onTitleUpdate={(id, title) => setConversationTitles(prev => ({ ...prev, [id]: title }))} onOpenUpload={() => setView("files")} onOpenConnect={() => setView("databases")} onStreamingChange={setIsAnalysisRunning} />}
      {view === "neurix"     && <NeurixPage />}
      {view === "files"      && <FilesPage     onOpenFile={handleOpenDataset} />}
      {view === "databases"  && <DatabasesPage onOpenDB={handleOpenDataset} />}
      {view === "charts"     && <ChartsPage    refreshTrigger={chartRefresh} />}
      {view === "schedules"  && <SchedulesPage />}
      {view === "connectors" && <ConnectorsPage />}
    </>
  );

  /* ── Theme toggle button ── */
  const ThemeBtn = () => (
    <button onClick={cycleTheme} title={`Theme: ${THEME_LABELS[theme]}`}
      style={{
        width: 34, height: 34, borderRadius: "50%",
        background: "var(--surface3)", border: "1.5px solid var(--border2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "var(--text-muted)",
        transition: "border-color 140ms ease",
        flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-accent)"; e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
      {THEME_ICONS[theme]}
    </button>
  );

  /* ══════════════════════════════════════════
     MOBILE LAYOUT
  ══════════════════════════════════════════ */
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", background: "var(--bg)" }}>

        {/* Mobile header */}
        <div style={{
          flexShrink: 0,
          height: "calc(52px + env(safe-area-inset-top, 0px))",
          display: "flex", alignItems: "center",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: 16, paddingRight: 12, paddingBottom: 0,
          background: "var(--surface2)",
          borderBottom: "1px solid var(--border)",
        }}>
          {/* Logo — left */}
          <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 5, userSelect: "none" }}>
            <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-1px", lineHeight: 1 }}>
              <span style={{ color: "var(--text)" }}>br</span>
              <span style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-light))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>AI</span>
              <span style={{ color: "var(--text)" }}>n</span>
            </span>
            <span style={{ fontSize: 9, fontWeight: 600, color: "var(--text-dim)", opacity: 0.7 }}>by stylo</span>
          </div>

          {/* Right actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {view === "chat" && selectedDataset && (
              <button onClick={() => setShowSchema(true)} title="View schema"
                style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface3)", border: "1.5px solid var(--border2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0 }}>
                <Database size={14} />
              </button>
            )}
            <NeuronBalance refreshKey={neuronRefresh} />
            <ThemeBtn />
            <NotificationsBell isAdmin={user?.role === "admin"} />
            <ProfileMenu user={user} onOpenSettings={() => setShowSettings(true)} onOpenSupport={() => setShowSupport(true)} />
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          <div style={{ flex: 1, display: "flex", overflow: "hidden", minWidth: 0 }}>
            {contentViews}
          </div>
        </div>

        {/* Bottom nav */}
        <BottomNav
          activeView={view}
          onViewChange={v => setView(v as View)}
          onNewAnalysis={() => { setSelectedConversation(null); setSelectedDataset(null); setView("chat"); }}
          isAdmin={user?.role === "admin"}
        />

        {/* Mobile drawer — position:fixed children escape overflow:hidden naturally */}
        {mobileDrawer && (
          <>
            <div className="drawer-backdrop" onClick={() => setMobileDrawer(false)} />
            <LeftSidebar
              selectedDataset={selectedDataset}
              selectedConversation={selectedConversation}
              chartRefresh={chartRefresh}
              conversationTitles={conversationTitles}
              onSelectDataset={d => setSelectedDataset(d)}
              onSelectConversation={(id, dataset) => { setSelectedConversation(id); setSelectedDataset(dataset); setView("chat"); }}
              onNewConversation={id => { setSelectedConversation(id); setView("chat"); }}
              activeView={view}
              onViewChange={v => setView(v as View)}
              asDrawer
              onDrawerClose={() => setMobileDrawer(false)}
            />
          </>
        )}

        {/* Schema bottom sheet */}
        {showSchema && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
            onClick={() => setShowSchema(false)}>
            <style>{`@keyframes sheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
            <div style={{ animation: "sheetIn 280ms var(--ease-drawer) both", borderRadius: "20px 20px 0 0", overflow: "hidden", paddingBottom: "env(safe-area-inset-bottom, 0px)", background: "var(--surface2)" }}
              onClick={e => e.stopPropagation()}>
              <RightPanel dataset={selectedDataset} sheetMode onClose={() => setShowSchema(false)} />
            </div>
          </div>
        )}

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {showSupport  && <SupportModal  onClose={() => setShowSupport(false)} />}
        <NeuronToast message={neuronToast} />
      </div>
    );
  }

  /* ══════════════════════════════════════════
     DESKTOP LAYOUT
  ══════════════════════════════════════════ */
  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "var(--bg)" }}>
      <LeftSidebar
        selectedDataset={selectedDataset}
        selectedConversation={selectedConversation}
        chartRefresh={chartRefresh}
        conversationTitles={conversationTitles}
        onSelectDataset={d => setSelectedDataset(d)}
        onSelectConversation={(id, dataset) => { setSelectedConversation(id); setSelectedDataset(dataset); setView("chat"); }}
        onNewConversation={id => { setSelectedConversation(id); setView("chat"); }}
        activeView={view}
        onViewChange={v => setView(v as View)}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ height: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, padding: "0 14px", background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
          <NeuronBalance />
          <ThemeBtn />
          <NotificationsBell isAdmin={user?.role === "admin"} />
          <ProfileMenu user={user} onOpenSettings={() => setShowSettings(true)} onOpenSupport={() => setShowSupport(true)} />
        </div>

        {/* Content + right panel */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          <div style={{ flex: 1, display: "flex", overflow: "hidden", minWidth: 0 }}>
            {contentViews}
          </div>
          {view === "chat" && <RightPanel dataset={selectedDataset} />}
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showSupport  && <SupportModal  onClose={() => setShowSupport(false)} />}
      <NeuronToast message={neuronToast} />
    </div>
  );
}

function NeuronToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, display: "flex", alignItems: "center", gap: 10,
      padding: "12px 20px", borderRadius: 14,
      background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)",
      backdropFilter: "blur(12px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      animation: "slideUp 300ms ease",
    }}>
      <span style={{ fontSize: 18 }}>⚡</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b", whiteSpace: "nowrap" }}>{message}</span>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
    </div>
  );
}
