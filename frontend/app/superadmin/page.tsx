"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, Users, BarChart2, Database, Activity, Plus, Edit2, Trash2,
  Check, X, Search, ChevronLeft, Shield, Globe, Zap, Crown, Eye,
  EyeOff, ChevronDown, ChevronRight, UserPlus, AlertCircle, ArrowUpRight,
  Clock, TrendingUp, Package,
} from "lucide-react";
import { getToken, fetchMe, clearToken } from "@/lib/auth";
import { AISpinner } from "@/components/AISpinner";

const BASE = "http://localhost:8000/api/superadmin";
function hdrs() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeOrg(value: unknown): Org {
  const org = (value && typeof value === "object" ? value : {}) as Partial<Org>;
  return {
    id: asText(org.id),
    name: asText(org.name, "Untitled organization"),
    slug: asText(org.slug),
    plan: asText(org.plan, "trial"),
    status: asText(org.status, "trial"),
    contact_email: typeof org.contact_email === "string" ? org.contact_email : null,
    query_limit: asNumber(org.query_limit),
    notes: typeof org.notes === "string" ? org.notes : null,
    user_count: asNumber(org.user_count),
    dataset_count: asNumber(org.dataset_count),
    created_at: asText(org.created_at),
  };
}

function normalizeActivity(value: unknown): Activity {
  const item = (value && typeof value === "object" ? value : {}) as Partial<Activity>;
  return {
    type: asText(item.type, "query"),
    preview: asText(item.preview, "No preview available"),
    dataset_id: asText(item.dataset_id),
    created_at: asText(item.created_at),
  };
}

function normalizeOrgUser(value: unknown): OrgUser {
  const user = (value && typeof value === "object" ? value : {}) as Partial<OrgUser>;
  return {
    id: asText(user.id),
    email: asText(user.email, "No email"),
    username: asText(user.username, "Unknown user"),
    role: asText(user.role, "user"),
    is_active: typeof user.is_active === "boolean" ? user.is_active : true,
    created_at: asText(user.created_at),
    last_login: typeof user.last_login === "string" ? user.last_login : null,
  };
}

function getInitial(value: string | null | undefined, fallback = "?"): string {
  const first = value?.trim()?.[0];
  return first ? first.toUpperCase() : fallback;
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface Org {
  id: string; name: string; slug: string; plan: string; status: string;
  contact_email: string | null; query_limit: number; notes: string | null;
  user_count: number; dataset_count: number; created_at: string;
}
interface Stats {
  total_orgs: number; active_orgs: number; trial_orgs: number;
  total_users: number; active_users: number; total_datasets: number;
  total_convs: number; total_queries: number; total_charts: number;
}
interface OrgUser {
  id: string; email: string; username: string; role: string;
  is_active: boolean; created_at: string; last_login: string | null;
}
interface Activity {
  type: string; preview: string; dataset_id: string; created_at: string;
}

// ── Design constants ───────────────────────────────────────────────────────────
const PLAN_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  trial:      { label: "Trial",      color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  icon: <Clock size={10} /> },
  starter:    { label: "Starter",    color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: <Package size={10} /> },
  pro:        { label: "Pro",        color: "#a78bfa", bg: "rgba(167,139,250,0.12)", icon: <Zap size={10} /> },
  enterprise: { label: "Enterprise", color: "#f472b6", bg: "rgba(244,114,182,0.12)", icon: <Crown size={10} /> },
};
const STATUS_META: Record<string, { color: string; bg: string; dot: string }> = {
  trial:     { color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  dot: "#f59e0b" },
  active:    { color: "#22c55e", bg: "rgba(34,197,94,0.1)",   dot: "#22c55e" },
  suspended: { color: "#f87171", bg: "rgba(248,113,113,0.1)", dot: "#f87171" },
  cancelled: { color: "#6b7280", bg: "rgba(107,114,128,0.1)", dot: "#6b7280" },
};

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const router = useRouter();
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [stats, setStats]         = useState<Stats | null>(null);
  const [orgs, setOrgs]           = useState<Org[]>([]);
  const [activity, setActivity]   = useState<Activity[]>([]);
  const [search, setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPlan, setFilterPlan]     = useState<string>("all");
  const [selectedOrg, setSelectedOrg]   = useState<Org | null>(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [showOrgDetail, setShowOrgDetail] = useState(false);
  const [tab, setTab] = useState<"orgs" | "users" | "activity">("orgs");

  const load = useCallback(async () => {
    setError("");
    try {
      const [statsRes, orgsRes, actRes] = await Promise.all([
        fetch(`${BASE}/stats`,    { headers: hdrs() }),
        fetch(`${BASE}/orgs`,     { headers: hdrs() }),
        fetch(`${BASE}/activity`, { headers: hdrs() }),
      ]);

      if (statsRes.status === 401 || statsRes.status === 403 || orgsRes.status === 401 || orgsRes.status === 403) {
        clearToken();
        router.replace("/login");
        return;
      }

      const [statsData, orgsData, actData] = await Promise.all([
        statsRes.ok ? statsRes.json() : null,
        orgsRes.ok ? orgsRes.json() : null,
        actRes.ok ? actRes.json() : null,
      ]);

      if (statsData && typeof statsData === "object") {
        setStats({
          total_orgs: asNumber((statsData as Partial<Stats>).total_orgs),
          active_orgs: asNumber((statsData as Partial<Stats>).active_orgs),
          trial_orgs: asNumber((statsData as Partial<Stats>).trial_orgs),
          total_users: asNumber((statsData as Partial<Stats>).total_users),
          active_users: asNumber((statsData as Partial<Stats>).active_users),
          total_datasets: asNumber((statsData as Partial<Stats>).total_datasets),
          total_convs: asNumber((statsData as Partial<Stats>).total_convs),
          total_queries: asNumber((statsData as Partial<Stats>).total_queries),
          total_charts: asNumber((statsData as Partial<Stats>).total_charts),
        });
      } else {
        setStats(null);
      }

      setOrgs(Array.isArray(orgsData) ? orgsData.map(normalizeOrg) : []);
      setActivity(Array.isArray(actData) ? actData.map(normalizeActivity) : []);

      if (!statsRes.ok || !orgsRes.ok || !actRes.ok) {
        setError("Some super admin data could not be loaded. The page is still available, but a few sections may be incomplete.");
      }
    } catch {
      setStats(null);
      setOrgs([]);
      setActivity([]);
      setError("The super admin page could not reach the backend. Please make sure the API is running on port 8000 and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    fetchMe().then(u => {
      if (!u || u.role !== "super_admin") { router.replace("/"); return; }
      load();
    });
  }, []);

  const filteredOrgs = orgs.filter(o => {
    const orgName = asText(o.name);
    const orgEmail = asText(o.contact_email);
    const matchSearch = !search || orgName.toLowerCase().includes(search.toLowerCase()) ||
      orgEmail.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || o.status === filterStatus;
    const matchPlan   = filterPlan   === "all" || o.plan === filterPlan;
    return matchSearch && matchStatus && matchPlan;
  });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0b12" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-1.5px", marginBottom: 16, color: "#fff" }}>
          br<span style={{ background: "linear-gradient(135deg,#00c896,#33d9ab)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>AI</span>n
        </div>
        <AISpinner size={24} />
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b12", color: "#eceef8", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" }}>

      {/* Top bar */}
      <header style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "0 32px", height: 56,
        background: "rgba(15,16,26,0.95)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "sticky", top: 0, zIndex: 50,
        backdropFilter: "blur(12px)",
      }}>
        <button onClick={() => router.push("/profile")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: "#9ba3c8", cursor: "pointer" }}>
          <ChevronLeft size={12} /> Account
        </button>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#00c896,#059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={14} style={{ color: "#fff" }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#eceef8", lineHeight: 1 }}>Stylo Command Center</div>
            <div style={{ fontSize: 10, color: "#5a6285", lineHeight: 1, marginTop: 2 }}>brAIn Customer Management</div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>Live</span>
        </div>

        <button onClick={() => { clearToken(); router.replace("/login"); }}
          style={{ fontSize: 11, color: "#5a6285", background: "none", border: "none", cursor: "pointer" }}>
          Sign out
        </button>
      </header>

      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "28px 32px" }}>
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, padding: "12px 14px", borderRadius: 12, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
            <AlertCircle size={14} style={{ color: "#f59e0b", flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: "#fbbf24", lineHeight: 1.5 }}>{error}</p>
          </div>
        )}

        {/* Stats strip */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 28 }}>
            {[
              { label: "Organizations",  value: stats.total_orgs,    sub: `${stats.active_orgs} active · ${stats.trial_orgs} trial`, icon: <Building2 size={16} />, color: "#00c896", grad: "from-[#00c896] to-[#059669]" },
              { label: "Total Users",    value: stats.total_users,   sub: `${stats.active_users} active`, icon: <Users size={16} />, color: "#60a5fa", grad: "" },
              { label: "Datasets",       value: stats.total_datasets, sub: "across all orgs",  icon: <Database size={16} />, color: "#fbbf24", grad: "" },
              { label: "Total Queries",  value: stats.total_queries,  sub: "all time",          icon: <TrendingUp size={16} />, color: "#a78bfa", grad: "" },
              { label: "Saved Charts",   value: stats.total_charts,   sub: "visualizations",    icon: <BarChart2 size={16} />, color: "#f472b6", grad: "" },
            ].map(s => (
              <div key={s.label} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, padding: "16px 18px",
                display: "flex", alignItems: "flex-start", gap: 12,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}18`, border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, flexShrink: 0 }}>
                  {s.icon}
                </div>
                <div>
                  <p style={{ fontSize: 22, fontWeight: 800, color: "#eceef8", lineHeight: 1, margin: 0 }}>{s.value.toLocaleString()}</p>
                  <p style={{ fontSize: 11, color: "#5a6285", margin: "4px 0 0" }}>{s.label}</p>
                  <p style={{ fontSize: 10, color: "#3d4268", margin: "2px 0 0" }}>{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Content area */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

          {/* Left: main panel */}
          <div>
            {/* Tabs */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 3 }}>
                {([["orgs", <Building2 size={12} />, "Organizations"], ["users", <Users size={12} />, "All Users"], ["activity", <Activity size={12} />, "Activity"]] as const).map(([id, icon, label]) => (
                  <button key={id} onClick={() => setTab(id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                      border: "none", cursor: "pointer",
                      background: tab === id ? "rgba(0,200,150,0.15)" : "transparent",
                      color: tab === id ? "#00c896" : "#5a6285",
                      transition: "all 140ms ease",
                    }}>
                    {icon} {label}
                  </button>
                ))}
              </div>

              {tab === "orgs" && (
                <button onClick={() => setShowCreate(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 600, background: "linear-gradient(135deg,#00c896,#059669)", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,200,150,0.25)" }}>
                  <Plus size={13} /> New Customer
                </button>
              )}
            </div>

            {tab === "orgs" && (
              <>
                {/* Filters */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={12} style={{ color: "#5a6285" }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search organizations…"
                      style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "#eceef8" }} />
                  </div>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    style={{ padding: "7px 10px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#9ba3c8", fontSize: 12, outline: "none", cursor: "pointer" }}>
                    <option value="all">All Status</option>
                    <option value="trial">Trial</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
                    style={{ padding: "7px 10px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#9ba3c8", fontSize: 12, outline: "none", cursor: "pointer" }}>
                    <option value="all">All Plans</option>
                    <option value="trial">Trial</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>

                {/* Orgs table */}
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 100px 60px 60px 80px 100px", gap: 0, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#3d4268" }}>
                    <span>Customer</span><span>Plan</span><span>Status</span><span>Users</span><span>Datasets</span><span>Neurons</span><span style={{ textAlign: "right" }}>Actions</span>
                  </div>

                  {filteredOrgs.length === 0 ? (
                    <div style={{ padding: "40px", textAlign: "center" }}>
                      <Building2 size={28} style={{ color: "#3d4268", margin: "0 auto 10px" }} />
                      <p style={{ fontSize: 13, color: "#5a6285" }}>No organizations yet</p>
                    </div>
                  ) : filteredOrgs.map((org, i) => (
                    <OrgRow key={org.id} org={org} isLast={i === filteredOrgs.length - 1}
                      onSelect={() => { setSelectedOrg(org); setShowOrgDetail(true); }}
                      onRefresh={load} />
                  ))}
                </div>
              </>
            )}

            {tab === "users" && <AllUsersTab load={load} />}
            {tab === "activity" && <ActivityTab items={activity} />}
          </div>

          {/* Right: activity / detail sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Quick stats by plan */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#3d4268", marginBottom: 12 }}>By Plan</p>
              {Object.entries(PLAN_META).map(([plan, meta]) => {
                const count = orgs.filter(o => o.plan === plan).length;
                return (
                  <div key={plan} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: "#9ba3c8" }}>{meta.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#eceef8" }}>{count}</span>
                  </div>
                );
              })}
            </div>

            {/* Recent activity */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#3d4268" }}>Recent Queries</p>
              </div>
              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {activity.slice(0, 12).map((a, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderBottom: i < 11 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <p style={{ fontSize: 11, color: "#9ba3c8", lineHeight: 1.5, margin: 0 }}>{a.preview}</p>
                    <p style={{ fontSize: 10, color: "#3d4268", marginTop: 3 }}>
                      {a.created_at ? new Date(a.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                    </p>
                  </div>
                ))}
                {activity.length === 0 && (
                  <p style={{ fontSize: 12, color: "#3d4268", padding: "20px 14px", textAlign: "center" }}>No activity yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create org modal */}
      {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}

      {/* Org detail panel */}
      {showOrgDetail && selectedOrg && (
        <OrgDetailPanel org={selectedOrg} onClose={() => setShowOrgDetail(false)} onRefresh={() => { load(); }} />
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}

// ── Org row ────────────────────────────────────────────────────────────────────
function OrgRow({ org, isLast, onSelect, onRefresh }: { org: Org; isLast: boolean; onSelect: () => void; onRefresh: () => void }) {
  const [hover, setHover] = useState(false);
  const [saving, setSaving] = useState(false);
  const plan   = PLAN_META[org.plan]   || PLAN_META.trial;
  const status = STATUS_META[org.status] || STATUS_META.trial;

  const toggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaving(true);
    const newStatus = org.status === "active" ? "suspended" : "active";
    await fetch(`${BASE}/orgs/${org.id}`, {
      method: "PATCH", headers: hdrs(),
      body: JSON.stringify({ status: newStatus }),
    });
    setSaving(false); onRefresh();
  };

  const deleteOrg = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${org.name}" and all its users? This cannot be undone.`)) return;
    setSaving(true);
    await fetch(`${BASE}/orgs/${org.id}`, { method: "DELETE", headers: hdrs() });
    setSaving(false); onRefresh();
  };

  return (
    <div onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid", gridTemplateColumns: "2fr 100px 100px 60px 60px 80px 100px",
        padding: "13px 16px", cursor: "pointer",
        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
        background: hover ? "rgba(255,255,255,0.025)" : "transparent",
        transition: "background 120ms ease", alignItems: "center",
      }}>
      {/* Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${plan.color}18`, border: `1px solid ${plan.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: plan.color }}>{getInitial(org.name)}</span>
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#eceef8" }}>{org.name}</p>
          <p style={{ fontSize: 10, color: "#3d4268" }}>{org.contact_email || org.slug}</p>
        </div>
      </div>

      {/* Plan */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 20, background: plan.bg, border: `1px solid ${plan.color}30`, width: "fit-content" }}>
        <span style={{ color: plan.color }}>{plan.icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: plan.color }}>{plan.label}</span>
      </div>

      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 20, background: status.bg, width: "fit-content" }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: status.dot }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: status.color, textTransform: "capitalize" }}>{org.status}</span>
      </div>

      {/* Users */}
      <span style={{ fontSize: 13, fontWeight: 600, color: "#9ba3c8" }}>{org.user_count}</span>

      {/* Datasets */}
      <span style={{ fontSize: 13, fontWeight: 600, color: "#9ba3c8" }}>{org.dataset_count}</span>

      {/* Limit */}
      <span style={{ fontSize: 11, color: "#5a6285" }}>{org.query_limit.toLocaleString()}/mo</span>

      {/* Actions */}
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
        <button onClick={onSelect} title="View details"
          style={{ padding: "4px 6px", borderRadius: 6, background: "rgba(0,200,150,0.1)", border: "1px solid rgba(0,200,150,0.2)", cursor: "pointer", color: "#00c896", display: "flex" }}>
          <ArrowUpRight size={11} />
        </button>
        <button onClick={toggleStatus} disabled={saving} title={org.status === "active" ? "Suspend" : "Activate"}
          style={{ padding: "4px 6px", borderRadius: 6, background: org.status === "suspended" ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)", border: `1px solid ${org.status === "suspended" ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`, cursor: "pointer", color: org.status === "suspended" ? "#22c55e" : "#f59e0b", display: "flex" }}>
          {saving ? <AISpinner size={11} /> : org.status === "suspended" ? <Eye size={11} /> : <EyeOff size={11} />}
        </button>
        <button onClick={deleteOrg} disabled={saving} title="Delete"
          style={{ padding: "4px 6px", borderRadius: 6, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", cursor: "pointer", color: "#f87171", display: "flex" }}>
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Create org modal ───────────────────────────────────────────────────────────
function CreateOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", contact_email: "", plan: "trial", query_limit: 500, notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setSaving(true);
    try {
      const res = await fetch(`${BASE}/orgs`, {
        method: "POST", headers: hdrs(), body: JSON.stringify({ ...form, query_limit: Number(form.query_limit) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
      onCreated();
    } catch (err: unknown) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}>
      <div style={{ background: "#10121e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "28px 32px", width: 480, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "#eceef8" }}>New Customer</h2>
            <p style={{ fontSize: 12, color: "#5a6285", marginTop: 3 }}>Create a customer account on brAIn</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#5a6285" }}><X size={16} /></button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#5a6285" }}>Customer Name *</label>
            <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Acme Corp"
              style={{ padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 13, outline: "none" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#5a6285" }}>Contact Email</label>
            <input type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))}
              placeholder="admin@acme.com"
              style={{ padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 13, outline: "none" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#5a6285" }}>Plan</label>
              <select value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value }))}
                style={{ padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 13, outline: "none", cursor: "pointer" }}>
                <option value="trial">Trial</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#5a6285" }}>Neurons / month</label>
              <input type="number" value={form.query_limit} onChange={e => setForm(p => ({ ...p, query_limit: Number(e.target.value) }))}
                style={{ padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 13, outline: "none" }} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#5a6285" }}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Optional notes about this customer…" rows={2}
              style={{ padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit" }} />
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 8, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}>
              <AlertCircle size={12} style={{ color: "#f87171" }} />
              <span style={{ fontSize: 12, color: "#f87171" }}>{error}</span>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="submit" disabled={saving}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontWeight: 700, fontSize: 13, background: "linear-gradient(135deg,#00c896,#059669)", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: "0 4px 16px rgba(0,200,150,0.25)" }}>
              {saving ? <AISpinner size={13} /> : <Plus size={13} />}
              {saving ? "Creating…" : "Create Customer"}
            </button>
            <button type="button" onClick={onClose}
              style={{ padding: "10px 20px", borderRadius: 10, fontSize: 13, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#9ba3c8", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Org detail slide panel ─────────────────────────────────────────────────────
function OrgDetailPanel({ org: initialOrg, onClose, onRefresh }: { org: Org; onClose: () => void; onRefresh: () => void }) {
  const [org, setOrg]               = useState(initialOrg);
  const [users, setUsers]           = useState<OrgUser[]>([]);
  const [editMode, setEditMode]     = useState(false);
  const [editForm, setEditForm]     = useState({ name: org.name, contact_email: org.contact_email || "", plan: org.plan, status: org.status, query_limit: org.query_limit, notes: org.notes || "" });
  const [saving, setSaving]         = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser]       = useState({ email: "", username: "", password: "", role: "admin" });
  const [addingUser, setAddingUser] = useState(false);
  const [addError, setAddError]     = useState("");

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/orgs/${org.id}/users`, { headers: hdrs() });
      if (!res.ok) { setUsers([]); return; }
      const data = await res.json();
      setUsers(Array.isArray(data) ? data.map(normalizeOrgUser) : []);
    } catch {
      setUsers([]);
    }
  }, [org.id]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const saveEdit = async () => {
    setSaving(true);
    const res = await fetch(`${BASE}/orgs/${org.id}`, {
      method: "PATCH", headers: hdrs(),
      body: JSON.stringify({ ...editForm, query_limit: Number(editForm.query_limit) }),
    });
    if (res.ok) { const updated = await res.json(); setOrg(updated); }
    setSaving(false); setEditMode(false); onRefresh();
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault(); setAddError(""); setAddingUser(true);
    try {
      const res = await fetch(`${BASE}/orgs/${org.id}/users`, {
        method: "POST", headers: hdrs(), body: JSON.stringify(newUser),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
      setShowAddUser(false);
      setNewUser({ email: "", username: "", password: "", role: "admin" });
      loadUsers(); onRefresh();
    } catch (err: unknown) { setAddError((err as Error).message); }
    finally { setAddingUser(false); }
  };

  const plan   = PLAN_META[org.plan]   || PLAN_META.trial;
  const status = STATUS_META[org.status] || STATUS_META.trial;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex" }}>
      <div style={{ flex: 1, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div style={{
        width: 460, height: "100vh", background: "#0e0f1c", borderLeft: "1px solid rgba(255,255,255,0.09)",
        overflowY: "auto", boxShadow: "-20px 0 60px rgba(0,0,0,0.4)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Panel header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: `${plan.color}18`, border: `1px solid ${plan.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: plan.color }}>{getInitial(org.name)}</span>
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#eceef8" }}>{org.name}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 20, background: plan.bg }}>
                <span style={{ color: plan.color, display: "flex" }}>{plan.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: plan.color }}>{plan.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 20, background: status.bg }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: status.dot }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: status.color, textTransform: "capitalize" }}>{org.status}</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditMode(e => !e)}
              style={{ padding: "6px 8px", borderRadius: 8, background: editMode ? "rgba(0,200,150,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${editMode ? "rgba(0,200,150,0.3)" : "rgba(255,255,255,0.1)"}`, cursor: "pointer", color: editMode ? "#00c896" : "#9ba3c8", display: "flex" }}>
              <Edit2 size={13} />
            </button>
            <button onClick={onClose} style={{ padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", color: "#9ba3c8", display: "flex" }}>
              <X size={13} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {editMode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#3d4268" }}>Edit Customer</p>
              {[
                { label: "Name", key: "name", type: "text" },
                { label: "Contact Email", key: "contact_email", type: "email" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#5a6285", display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input type={f.type} value={(editForm as any)[f.key]} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: "100%", padding: "8px 11px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 13, outline: "none" }} />
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#5a6285", display: "block", marginBottom: 4 }}>Plan</label>
                  <select value={editForm.plan} onChange={e => setEditForm(p => ({ ...p, plan: e.target.value }))}
                    style={{ width: "100%", padding: "8px 11px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 13, outline: "none" }}>
                    <option value="trial">Trial</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#5a6285", display: "block", marginBottom: 4 }}>Status</label>
                  <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                    style={{ width: "100%", padding: "8px 11px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 13, outline: "none" }}>
                    <option value="trial">Trial</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#5a6285", display: "block", marginBottom: 4 }}>Neurons / Month</label>
                <input type="number" value={editForm.query_limit} onChange={e => setEditForm(p => ({ ...p, query_limit: Number(e.target.value) }))}
                  style={{ width: "100%", padding: "8px 11px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 13, outline: "none" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#5a6285", display: "block", marginBottom: 4 }}>Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={3}
                  style={{ width: "100%", padding: "8px 11px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit" }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveEdit} disabled={saving}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 9, fontWeight: 700, fontSize: 12, background: "linear-gradient(135deg,#00c896,#059669)", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {saving ? <AISpinner size={12} /> : <Check size={12} />} Save changes
                </button>
                <button onClick={() => setEditMode(false)}
                  style={{ padding: "9px 16px", borderRadius: 9, fontSize: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#9ba3c8", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Org meta */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[
                  { label: "Contact", value: org.contact_email || "—" },
                  { label: "Neurons", value: `${org.query_limit.toLocaleString()} / mo` },
                  { label: "Created", value: org.created_at ? new Date(org.created_at).toLocaleDateString() : "—" },
                  { label: "Users", value: String(org.user_count) },
                ].map(s => (
                  <div key={s.label} style={{ padding: "10px 12px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p style={{ fontSize: 10, color: "#3d4268", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{s.label}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#9ba3c8" }}>{s.value}</p>
                  </div>
                ))}
              </div>
              {org.notes && (
                <div style={{ padding: "10px 12px", borderRadius: 9, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 20 }}>
                  <p style={{ fontSize: 10, color: "#3d4268", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Notes</p>
                  <p style={{ fontSize: 12, color: "#9ba3c8", lineHeight: 1.6 }}>{org.notes}</p>
                </div>
              )}
            </>
          )}

          {/* Users section */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#3d4268" }}>
                Users ({users.length})
              </p>
              <button onClick={() => setShowAddUser(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: "rgba(0,200,150,0.1)", border: "1px solid rgba(0,200,150,0.2)", color: "#00c896", cursor: "pointer" }}>
                <UserPlus size={11} /> Add User
              </button>
            </div>

            {showAddUser && (
              <form onSubmit={addUser} style={{ padding: "14px", borderRadius: 10, background: "rgba(0,200,150,0.04)", border: "1px solid rgba(0,200,150,0.15)", marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#00c896", textTransform: "uppercase", letterSpacing: "0.06em" }}>Add User to {org.name}</p>
                {[
                  { ph: "Email address", key: "email", type: "email" },
                  { ph: "Username", key: "username", type: "text" },
                  { ph: "Temporary password", key: "password", type: "password" },
                ].map(f => (
                  <input key={f.key} type={f.type} placeholder={f.ph} required value={(newUser as any)[f.key]}
                    onChange={e => setNewUser(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ padding: "7px 10px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 12, outline: "none" }} />
                ))}
                <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                  style={{ padding: "7px 10px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#eceef8", fontSize: 12, outline: "none" }}>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                  <option value="viewer">Viewer</option>
                </select>
                {addError && <p style={{ fontSize: 11, color: "#f87171" }}>{addError}</p>}
                <div style={{ display: "flex", gap: 7 }}>
                  <button type="submit" disabled={addingUser}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#00c896", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                    {addingUser ? <AISpinner size={11} /> : <Check size={11} />} Add
                  </button>
                  <button type="button" onClick={() => setShowAddUser(false)}
                    style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#9ba3c8", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {users.length === 0 ? (
              <p style={{ fontSize: 12, color: "#3d4268", textAlign: "center", padding: "16px 0" }}>No users yet</p>
            ) : users.map(u => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#00c896,#059669)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{getInitial(u.username)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#eceef8" }}>{u.username}</p>
                  <p style={{ fontSize: 10, color: "#3d4268", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "rgba(96,165,250,0.1)", color: "#60a5fa" }}>{u.role}</span>
                  {!u.is_active && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(248,113,113,0.1)", color: "#f87171" }}>DISABLED</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── All Users tab ──────────────────────────────────────────────────────────────
function AllUsersTab({ load }: { load: () => void }) {
  const [users, setUsers]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${BASE}/users`, { headers: hdrs() })
      .then(async r => (r.ok ? r.json() : []))
      .then(d => { setUsers(Array.isArray(d) ? d.map(normalizeOrgUser) : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggle = async (u: any) => {
    await fetch(`${BASE}/users/${u.id}`, {
      method: "PATCH", headers: hdrs(), body: JSON.stringify({ is_active: !u.is_active }),
    });
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x));
  };

  const filtered = search
    ? users.filter(u => asText(u.username).toLowerCase().includes(search.toLowerCase()) || asText(u.email).toLowerCase().includes(search.toLowerCase()))
    : users;

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><AISpinner size={20} /></div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 14 }}>
        <Search size={12} style={{ color: "#5a6285" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "#eceef8" }} />
      </div>
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 80px", padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#3d4268" }}>
          <span>User</span><span>Customer</span><span>Role</span><span style={{ textAlign: "right" }}>Action</span>
        </div>
        {filtered.map((u, i) => (
          <div key={u.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 80px", padding: "11px 16px", borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center", opacity: u.is_active ? 1 : 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#00c896,#059669)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{getInitial(u.username)}</span>
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#eceef8" }}>{u.username}</p>
                <p style={{ fontSize: 10, color: "#3d4268" }}>{u.email}</p>
              </div>
            </div>
            <span style={{ fontSize: 11, color: u.org_name ? "#9ba3c8" : "#3d4268" }}>{u.org_name || "Unassigned"}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "rgba(96,165,250,0.1)", color: "#60a5fa", width: "fit-content" }}>{u.role}</span>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => toggle(u)}
                style={{ padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: u.is_active ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)", border: `1px solid ${u.is_active ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.2)"}`, color: u.is_active ? "#f59e0b" : "#22c55e", cursor: "pointer" }}>
                {u.is_active ? "Suspend" : "Activate"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p style={{ padding: "28px", textAlign: "center", fontSize: 13, color: "#3d4268" }}>No users found</p>}
      </div>
    </div>
  );
}

// ── Activity tab ───────────────────────────────────────────────────────────────
function ActivityTab({ items }: { items: Activity[] }) {
  if (!items.length) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0", gap: 10 }}>
      <Activity size={28} style={{ color: "#3d4268" }} />
      <p style={{ fontSize: 13, color: "#3d4268" }}>No activity recorded yet</p>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((a, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(0,200,150,0.1)", border: "1px solid rgba(0,200,150,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <TrendingUp size={12} style={{ color: "#00c896" }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, color: "#9ba3c8", lineHeight: 1.5 }}>{a.preview}</p>
            <p style={{ fontSize: 10, color: "#3d4268", marginTop: 4 }}>
              {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
