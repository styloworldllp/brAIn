"use client";
import { useState, useEffect } from "react";
import { NeuronIcon } from "@/components/NeuronIcon";
import { fetchNeurixStatus } from "@/lib/api";

export default function NeuronBalance({ refreshKey = 0 }: { refreshKey?: number }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [hasInstance, setHasInstance] = useState(false);

  const load = () =>
    fetchNeurixStatus()
      .then(s => { setHasInstance(s.has_instance); setBalance(s.neuron_balance); })
      .catch(() => {});

  useEffect(() => {
    load();
    // Refresh every 60 s so balance stays roughly up to date after queries
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  if (!hasInstance || balance === null) return null;

  return (
    <div
      title={`${balance.toLocaleString()} neurons remaining`}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 10px", borderRadius: 20,
        background: "rgba(245,158,11,0.12)",
        border: "1px solid rgba(245,158,11,0.28)",
        cursor: "default", userSelect: "none",
      }}>
      <NeuronIcon size={15} />
      <span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", letterSpacing: "-0.3px" }}>
        {balance >= 1000 ? `${(balance / 1000).toFixed(balance % 1000 === 0 ? 0 : 1)}k` : balance.toLocaleString()}
      </span>
    </div>
  );
}
