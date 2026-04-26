"use client";
import { useState, useEffect } from "react";
import { AISpinner } from "./AISpinner";
import {
  Plus, Upload, Database, Table2, Trash2,
  MessageSquare, ChevronRight, FileText,
  Sheet
} from "lucide-react";
import {
  Dataset, Conversation, fetchDatasets, fetchConversations,
  createConversation, deleteDataset
} from "@/lib/api";
import UploadModal from "./UploadModal";
import ConnectModal from "./ConnectModal";

interface Props {
  selectedDataset: Dataset | null;
  selectedConversation: string | null;
  onSelectDataset: (d: Dataset) => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: (id: string) => void;
}

const sourceIcon = (type: string) => {
  if (type === "csv") return <FileText size={13} />;
  if (type === "excel" || type === "xlsx" || type === "xls") return <Table2 size={13} />;
  if (type === "postgres" || type === "mysql") return <Database size={13} />;
  if (type === "sheets") return <Sheet size={13} />;
  return <Table2 size={13} />;
};

const sourceColor = (type: string) => {
  if (type === "csv") return "text-green-400";
  if (type === "excel" || type === "xlsx" || type === "xls") return "text-emerald-400";
  if (type === "postgres") return "text-blue-400";
  if (type === "mysql") return "text-orange-400";
  if (type === "sheets") return "text-green-400";
  return "text-[#6c63ff]";
};

export default function DataSidebar({
  selectedDataset,
  selectedConversation,
  onSelectDataset,
  onSelectConversation,
  onNewConversation,
}: Props) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [expandedDataset, setExpandedDataset] = useState<string | null>(null);

  useEffect(() => {
    fetchDatasets().then(setDatasets).catch(e => console.error("Failed to load datasets:", e));
  }, []);

  useEffect(() => {
    if (!selectedDataset) return;
    fetchConversations(selectedDataset.id).then(setConversations).catch(e => console.error("Failed to load conversations:", e));
    setExpandedDataset(selectedDataset.id);
  }, [selectedDataset]);

  const handleNewConversation = async () => {
    if (!selectedDataset) return;
    setLoadingConv(true);
    const conv = await createConversation(selectedDataset.id);
    setConversations((prev) => [{ id: conv.id, title: conv.title, created_at: new Date().toISOString() }, ...prev]);
    onNewConversation(conv.id);
    setLoadingConv(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteDataset(id);
    setDatasets((prev) => prev.filter((d) => d.id !== id));
    if (selectedDataset?.id === id) {
      onSelectDataset(null as unknown as Dataset);
    }
  };

  const handleDatasetClick = async (ds: Dataset) => {
    onSelectDataset(ds);
    setExpandedDataset(ds.id);
    const convs = await fetchConversations(ds.id);
    setConversations(convs);
    if (convs.length === 0) {
      setLoadingConv(true);
      const conv = await createConversation(ds.id);
      setConversations([{ id: conv.id, title: conv.title, created_at: new Date().toISOString() }]);
      onNewConversation(conv.id);
      setLoadingConv(false);
    } else {
      onSelectConversation(convs[0].id);
    }
  };

  return (
    <aside className="w-64 shrink-0 flex flex-col border-r border-[#2e3347] bg-[#12141f] h-screen overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[#2e3347]">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-[#6c63ff] flex items-center justify-center">
            <BarChart size={14} className="text-white" />
          </div>
          <span className="font-semibold text-[#e8eaf0] text-sm">AI Analyst</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowUpload(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-[#2e3347] text-xs text-[#8b90a8] hover:text-[#e8eaf0] hover:border-[#6c63ff]/50 transition-colors"
          >
            <Upload size={12} />
            Upload
          </button>
          <button
            onClick={() => setShowConnect(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-[#2e3347] text-xs text-[#8b90a8] hover:text-[#e8eaf0] hover:border-[#6c63ff]/50 transition-colors"
          >
            <Database size={12} />
            Connect
          </button>
        </div>
      </div>

      {/* Datasets list */}
      <div className="flex-1 overflow-y-auto py-2">
        {datasets.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[#8b90a8]">
            <Table2 size={24} className="mx-auto mb-2 opacity-30" />
            <p>No datasets yet.</p>
            <p className="mt-1">Upload a file or connect a database.</p>
          </div>
        ) : (
          datasets.map((ds) => {
            const isExpanded = expandedDataset === ds.id;
            const isSelected = selectedDataset?.id === ds.id;
            return (
              <div key={ds.id}>
                {/* Dataset row */}
                <div
                  onClick={() => handleDatasetClick(ds)}
                  className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors
                    ${isSelected ? "bg-[#6c63ff]/10 text-[#e8eaf0]" : "text-[#8b90a8] hover:bg-[#1a1d27] hover:text-[#e8eaf0]"}`}
                >
                  <ChevronRight
                    size={13}
                    className={`shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                  <span className={`shrink-0 ${sourceColor(ds.source_type)}`}>
                    {sourceIcon(ds.source_type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{ds.name}</p>
                    <p className="text-[10px] text-[#3e4357]">{ds.row_count?.toLocaleString()} rows</p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, ds.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-[#3e4357] hover:text-red-400 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Conversations */}
                {isExpanded && isSelected && (
                  <div className="ml-7 border-l border-[#2e3347] pl-2 pb-1">
                    <button
                      onClick={handleNewConversation}
                      disabled={loadingConv}
                      className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 text-[10px] text-[#6c63ff] hover:text-[#8b85ff] transition-colors"
                    >
                      {loadingConv ? <AISpinner size={11} /> : <Plus size={11} />}
                      New conversation
                    </button>
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        onClick={() => onSelectConversation(conv.id)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-[10px] transition-colors truncate
                          ${selectedConversation === conv.id
                            ? "bg-[#6c63ff]/15 text-[#e8eaf0]"
                            : "text-[#8b90a8] hover:text-[#c8cad8]"}`}
                      >
                        <MessageSquare size={10} className="shrink-0" />
                        <span className="truncate">{conv.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={(ds) => {
            setDatasets((prev) => [ds, ...prev]);
            handleDatasetClick(ds);
          }}
        />
      )}
      {showConnect && (
        <ConnectModal
          onClose={() => setShowConnect(false)}
          onSuccess={(ds) => {
            setDatasets((prev) => [ds, ...prev]);
            handleDatasetClick(ds);
          }}
        />
      )}
    </aside>
  );
}

function BarChart({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="10" y="7" width="4" height="14" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor" />
    </svg>
  );
}
