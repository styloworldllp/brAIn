"use client";
import { useState } from "react";
import LeftSidebar from "@/components/LeftSidebar";
import ChatInterface from "@/components/ChatInterface";
import RightPanel from "@/components/RightPanel";
import { Dataset } from "@/lib/api";

export default function Home() {
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d0f1a]">
      <LeftSidebar
        selectedDataset={selectedDataset}
        selectedConversation={selectedConversation}
        onSelectDataset={setSelectedDataset}
        onSelectConversation={(id, dataset) => {
          setSelectedConversation(id);
          setSelectedDataset(dataset);
        }}
        onNewConversation={(id) => setSelectedConversation(id)}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <ChatInterface
          conversationId={selectedConversation}
          dataset={selectedDataset}
        />
      </main>
      <RightPanel dataset={selectedDataset} />
    </div>
  );
}
