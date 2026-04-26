"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, Shield, Settings, LogOut, Headset, ShieldCheck } from "lucide-react";
import { AuthUser, logout, canViewAuditLog } from "@/lib/auth";
import { useIsMobile } from "@/hooks/useIsMobile";

interface Props {
  user: AuthUser | null;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
}

export default function ProfileMenu({ user, onOpenSettings, onOpenSupport }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const signOut = async () => { await logout(); router.replace("/login"); };

  const initial     = (user?.username?.[0] ?? "U").toUpperCase();
  const userIsAdmin = user?.role === "admin";
  const canAudit    = canViewAuditLog(user);
  const roleLabel   = user?.role === "admin" ? "Admin" : user?.role === "staff" ? "Stylo Staff" : "Member";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={user?.username ?? "Profile"}
        style={{
          width: 34, height: 34, borderRadius: "50%", padding: 0,
          background: open ? "var(--surface3)" : "transparent",
          border: "1.5px solid " + (open ? "var(--border2)" : "transparent"),
          cursor: "pointer", transition: "background 140ms ease, border-color 140ms ease",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.borderColor = "var(--border2)"; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; } }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, var(--accent), var(--accent2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 0 2px var(--accent-glow)",
        }}>
          {user?.avatar_url
            ? <img src={user.avatar_url} alt={initial} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
            : <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{initial}</span>
          }
        </div>
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: isMobile ? 199 : 99 }} onClick={() => setOpen(false)} />
          <div style={{
            ...(isMobile
              ? { position: "fixed" as const, top: "calc(52px + env(safe-area-inset-top,0px) + 6px)", right: 8, zIndex: 200 }
              : { position: "absolute" as const, right: 0, top: "calc(100% + 6px)", zIndex: 100 }),
            width: 232, borderRadius: 14, overflow: "hidden",
            background: "var(--surface2)", border: "1px solid var(--border)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.35), 0 4px 14px rgba(0,0,0,0.15)",
            animation: "profileMenuIn 140ms ease both",
          }}>
            {/* User header */}
            <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, var(--accent), var(--accent2))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 0 2px var(--accent-glow)",
                }}>
                  {user?.avatar_url
                    ? <img src={user.avatar_url} alt={initial} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                    : <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{initial}</span>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.username}</p>
                  <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</p>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 10, padding: "2px 9px", borderRadius: 10, fontWeight: 600, background: "var(--accent-dim)", color: "var(--accent-light)", textTransform: "capitalize" }}>
                  {roleLabel}
                </span>
              </div>
            </div>

            <div style={{ padding: "6px 5px 5px" }}>
              <MenuItem icon={<User size={14} />} label="My Profile" onClick={() => { router.push("/profile"); setOpen(false); }} />
              {userIsAdmin && <MenuItem icon={<Shield size={14} />} label="Admin Console" onClick={() => { router.push("/admin"); setOpen(false); }} accent />}
              {onOpenSupport && <MenuItem icon={<Headset size={14} />} label="Support" onClick={() => { onOpenSupport(); setOpen(false); }} />}
              {canAudit && <MenuItem icon={<ShieldCheck size={14} />} label="Audit Log" onClick={() => { router.push("/audit"); setOpen(false); }} />}
              <Divider />
              <MenuItem icon={<Settings size={14} />} label="Settings" onClick={() => { onOpenSettings(); setOpen(false); }} />
              <Divider />
              <MenuItem icon={<LogOut size={14} />} label="Sign Out" onClick={signOut} danger />
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes profileMenuIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}

function MenuItem({ icon, label, onClick, accent, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean; danger?: boolean;
}) {
  const base    = danger ? "#f87171" : accent ? "var(--accent-light)" : "var(--text-muted)";
  const hoverBg = danger ? "rgba(248,113,113,0.09)" : accent ? "var(--accent-dim)" : "var(--surface3)";
  const hoverCl = danger ? "#fca5a5" : accent ? "var(--accent-light)" : "var(--text)";
  return (
    <button onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", background: "none", border: "none", color: base, transition: "background 100ms ease, color 100ms ease", textAlign: "left" }}
      onMouseEnter={e => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = hoverCl; }}
      onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = base; }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--border)", margin: "4px 8px" }} />;
}
