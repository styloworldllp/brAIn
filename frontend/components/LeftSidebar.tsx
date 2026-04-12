"use client";
import { useState, useEffect } from "react";
import {
  Plus, Upload, Database, MessageSquare, FileText,
  Table2, Sheet, Trash2, ChevronDown, ChevronRight,
  HardDrive, Zap, Settings
} from "lucide-react";
import {
  Dataset, Conversation, fetchDatasets, fetchConversations,
  createConversation, deleteDataset
} from "@/lib/api";
import UploadModal from "./UploadModal";
import ConnectModal from "./ConnectModal";
import SettingsModal from "./SettingsModal";

interface Props {
  selectedDataset: Dataset | null;
  selectedConversation: string | null;
  onSelectDataset: (d: Dataset) => void;
  onSelectConversation: (id: string, dataset: Dataset) => void;
  onNewConversation: (id: string) => void;
}

const sourceIcon = (type: string) => {
  if (type === "csv") return <FileText size={13} />;
  if (type === "excel" || type === "xlsx" || type === "xls") return <Table2 size={13} />;
  if (type === "postgres" || type === "mysql") return <Database size={13} />;
  if (type === "sheets") return <Sheet size={13} />;
  return <HardDrive size={13} />;
};

const sourceColor = (type: string) => {
  if (type === "csv") return "text-emerald-400";
  if (type === "excel" || type === "xlsx" || type === "xls") return "text-green-400";
  if (type === "postgres") return "text-blue-400";
  if (type === "mysql") return "text-orange-400";
  if (type === "sheets") return "text-emerald-400";
  return "text-violet-400";
};

interface AllConv {
  conv: Conversation;
  dataset: Dataset;
}

export default function LeftSidebar({
  selectedDataset, selectedConversation,
  onSelectDataset, onSelectConversation, onNewConversation,
}: Props) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [allConvs, setAllConvs] = useState<AllConv[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(true);
  const [connectorsOpen, setConnectorsOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(true);

  useEffect(() => {
    fetchDatasets().then(async (dsets) => {
      setDatasets(dsets);
      // Load all conversations across all datasets
      const convs: AllConv[] = [];
      for (const ds of dsets) {
        try {
          const c = await fetchConversations(ds.id);
          c.forEach((conv) => convs.push({ conv, dataset: ds }));
        } catch {}
      }
      convs.sort((a, b) =>
        new Date(b.conv.created_at).getTime() - new Date(a.conv.created_at).getTime()
      );
      setAllConvs(convs);
    }).catch(() => {});
  }, []);

  const handleNew = async () => {
    if (!selectedDataset) {
      alert("Select or upload a dataset first.");
      return;
    }
    const conv = await createConversation(selectedDataset.id);
    const newConv: AllConv = {
      conv: { id: conv.id, title: "New conversation", created_at: new Date().toISOString() },
      dataset: selectedDataset,
    };
    setAllConvs((prev) => [newConv, ...prev]);
    onNewConversation(conv.id);
  };

  const handleDatasetAdded = async (ds: Dataset) => {
    setDatasets((prev) => [ds, ...prev]);
    const conv = await createConversation(ds.id);
    const newConv: AllConv = {
      conv: { id: conv.id, title: "New conversation", created_at: new Date().toISOString() },
      dataset: ds,
    };
    setAllConvs((prev) => [newConv, ...prev]);
    onSelectDataset(ds);
    onNewConversation(conv.id);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteDataset(id);
    setDatasets((prev) => prev.filter((d) => d.id !== id));
    setAllConvs((prev) => prev.filter((c) => c.dataset.id !== id));
  };

  const fileDatasets = datasets.filter((d) =>
    ["csv", "excel", "xlsx", "xls"].includes(d.source_type)
  );
  const connectorDatasets = datasets.filter((d) =>
    ["postgres", "mysql", "sheets"].includes(d.source_type)
  );

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-[#1e2235] bg-[#0d0f1a] h-screen overflow-hidden">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[#1e2235]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-bold text-[#e8eaf0] tracking-tight">
            br<span className="text-violet-400">AI</span>n
          </span>
        </div>
      </div>

      {/* New button */}
      <div className="px-3 py-3">
        <button
          onClick={handleNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {/* Chats */}
        <SectionHeader
          label="Chats"
          icon={<MessageSquare size={13} />}
          open={chatsOpen}
          onToggle={() => setChatsOpen((o) => !o)}
        />
        {chatsOpen && (
          <div className="space-y-0.5">
            {allConvs.length === 0 ? (
              <p className="text-[10px] text-[#3e4357] px-3 py-1">No chats yet</p>
            ) : (
              allConvs.map(({ conv, dataset }) => (
                <div
                  key={conv.id}
                  onClick={() => { onSelectDataset(dataset); onSelectConversation(conv.id, dataset); }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-colors group
                    ${selectedConversation === conv.id
                      ? "bg-violet-600/20 text-violet-300"
                      : "text-[#8b90a8] hover:bg-[#1a1d27] hover:text-[#c8cad8]"}`}
                >
                  <MessageSquare size={11} className="shrink-0 opacity-60" />
                  <span className="truncate flex-1">{conv.title}</span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="h-2" />

        {/* Data Connectors */}
        <SectionHeader
          label="Data connectors"
          icon={<Database size={13} />}
          open={connectorsOpen}
          onToggle={() => setConnectorsOpen((o) => !o)}
          action={
            <button
              onClick={(e) => { e.stopPropagation(); setShowConnect(true); }}
              className="opacity-0 group-hover:opacity-100 text-[#8b90a8] hover:text-violet-400 transition-all"
            >
              <Plus size={13} />
            </button>
          }
        />
        {connectorsOpen && (
          <div className="space-y-0.5">
            <button
              onClick={() => setShowConnect(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-[#3e4357] hover:text-[#8b90a8] hover:bg-[#1a1d27] transition-colors"
            >
              <Plus size={11} />
              Add connector
            </button>
            {connectorDatasets.map((ds) => (
              <DatasetRow
                key={ds.id}
                ds={ds}
                selected={selectedDataset?.id === ds.id}
                onClick={() => onSelectDataset(ds)}
                onDelete={(e) => handleDelete(e, ds.id)}
              />
            ))}
          </div>
        )}

        <div className="h-2" />

        {/* Files */}
        <SectionHeader
          label="Files"
          icon={<FileText size={13} />}
          open={filesOpen}
          onToggle={() => setFilesOpen((o) => !o)}
          action={
            <button
              onClick={(e) => { e.stopPropagation(); setShowUpload(true); }}
              className="opacity-0 group-hover:opacity-100 text-[#8b90a8] hover:text-violet-400 transition-all"
            >
              <Plus size={13} />
            </button>
          }
        />
        {filesOpen && (
          <div className="space-y-0.5">
            <button
              onClick={() => setShowUpload(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-[#3e4357] hover:text-[#8b90a8] hover:bg-[#1a1d27] transition-colors"
            >
              <Upload size={11} />
              Upload CSV / Excel
            </button>
            {fileDatasets.map((ds) => (
              <DatasetRow
                key={ds.id}
                ds={ds}
                selected={selectedDataset?.id === ds.id}
                onClick={() => onSelectDataset(ds)}
                onDelete={(e) => handleDelete(e, ds.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onSuccess={handleDatasetAdded} />
      )}
      {showConnect && (
        <ConnectModal onClose={() => setShowConnect(false)} onSuccess={handleDatasetAdded} />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* Settings footer */}
      <div className="border-t border-[#1e2235] px-3 py-3">
        <button
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#3e4357] hover:text-[#8b90a8] hover:bg-[#1a1d27] transition-colors"
        >
          <Settings size={13} />
          Settings &amp; API keys
        </button>
      </div>
    </aside>
  );
}

function SectionHeader({
  label, icon, open, onToggle, action,
}: {
  label: string; icon: React.ReactNode; open: boolean;
  onToggle: () => void; action?: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="group w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-[#3e4357] hover:text-[#8b90a8] transition-colors"
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {action}
      {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
    </button>
  );
}

function DatasetRow({ ds, selected, onClick, onDelete }: {
  ds: Dataset; selected: boolean;
  onClick: () => void; onDelete: (e: React.MouseEvent) => void;
}) {
  const color = ds.source_type === "postgres" ? "text-blue-400"
    : ds.source_type === "mysql" ? "text-orange-400"
    : ds.source_type === "sheets" ? "text-emerald-400"
    : ds.source_type === "csv" ? "text-emerald-400"
    : "text-green-400";

  const icon = ds.source_type === "postgres" || ds.source_type === "mysql"
    ? <Database size={11} />
    : ds.source_type === "sheets" ? <Sheet size={11} />
    : <FileText size={11} />;

  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-colors
        ${selected ? "bg-violet-600/15 text-violet-300" : "text-[#8b90a8] hover:bg-[#1a1d27] hover:text-[#c8cad8]"}`}
    >
      <span className={`shrink-0 ${color}`}>{icon}</span>
      <span className="truncate flex-1 text-[11px]">{ds.name}</span>
      <button
        onClick={onDelete}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-[#3e4357] hover:text-red-400 transition-all"
      >
        <Trash2 size={10} />
      </button>
    </div>
  );
}
