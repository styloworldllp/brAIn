"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import LeftSidebar from "@/components/LeftSidebar";
import ChatInterface from "@/components/ChatInterface";
import RightPanel from "@/components/RightPanel";
import NeurixPage from "@/components/NeurixPage";
import { Dataset } from "@/lib/api";
import { fetchMe, clearToken } from "@/lib/auth";

type View = "chat" | "neurix";

export default function Home() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [user, setUser]     = useState<{name:string;email:string;avatar?:string}|null>(null);
  const [view, setView]                                 = useState<View>("chat");
  const [selectedDataset, setSelectedDataset]           = useState<Dataset | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [chartRefresh, setChartRefresh]                 = useState(0);
  const [conversationTitles, setConversationTitles]     = useState<Record<string, string>>({});
  const [showUpload, setShowUpload]                     = useState(false);
  const [showConnect, setShowConnect]                   = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("brain_token");
    if (!token) { router.replace("/login"); return; }
    fetchMe().then(u => {
      if (!u) {
        clearToken();
        router.replace("/login");
        return;
      }
      if (u.role === "super_admin") {
        router.replace("/superadmin");
        return;
      }
      setUser({ name: u.username, email: u.email, avatar: u.avatar_url || undefined });
      setAuthed(true);
    });
  }, [router]);

  const logout = () => {
    localStorage.removeItem("brain_token");
    localStorage.removeItem("brain_user");
    router.replace("/login");
  };

  if (!authed) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid var(--accent)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
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
        showUpload={showUpload}
        setShowUpload={setShowUpload}
        showConnect={showConnect}
        setShowConnect={setShowConnect}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {view === "chat" ? (
          <ChatInterface
            conversationId={selectedConversation}
            dataset={selectedDataset}
            onChartSaved={() => setChartRefresh(n => n + 1)}
            onTitleUpdate={(id, title) => setConversationTitles(prev => ({ ...prev, [id]: title }))}
            onOpenUpload={() => setShowUpload(true)}
            onOpenConnect={() => setShowConnect(true)}
          />
        ) : (
          <NeurixPage />
        )}
      </div>
      {view === "chat" && <RightPanel dataset={selectedDataset} />}
    </div>
  );
}
