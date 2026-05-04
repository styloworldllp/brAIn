"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, User, AlertCircle, ArrowRight, Check } from "lucide-react";

const BASE     = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/auth`;
const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api`;

const PROVIDERS = [
  { id: "google",    label: "Google",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%234285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'/%3E%3Cpath fill='%2334A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'/%3E%3Cpath fill='%23FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z'/%3E%3Cpath fill='%23EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'/%3E%3C/svg%3E" },
  { id: "microsoft", label: "Microsoft",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='1' y='1' width='10' height='10' fill='%23f25022'/%3E%3Crect x='13' y='1' width='10' height='10' fill='%2300a4ef'/%3E%3Crect x='1' y='13' width='10' height='10' fill='%2300b04f'/%3E%3Crect x='13' y='13' width='10' height='10' fill='%23ffb900'/%3E%3C/svg%3E" },
  { id: "yahoo",     label: "Yahoo",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%236001d2' d='M0 0l6.927 12.333L0 24h3.333L8 14.667 12.667 24H16L9.333 12.333 16 0h-3.333L8 9.333 3.333 0z'/%3E%3Cpath fill='%236001d2' d='M18.667 0L13.333 10 16 14l8-14z'/%3E%3C/svg%3E" },
  { id: "apple",     label: "Apple",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%231d1d1f' d='M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z'/%3E%3C/svg%3E" },
];

/* ─── Neural-network canvas ─────────────────────────────────────────────── */
function NeuralCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0, h = 0;

    type Node   = { x: number; y: number; vx: number; vy: number; r: number; phase: number };
    type Signal = { a: number; b: number; t: number; speed: number };
    type Star   = { x: number; y: number; r: number; base: number; phase: number };

    let nodes:   Node[]   = [];
    let signals: Signal[] = [];
    let stars:   Star[]   = [];
    let lastSpawn = 0;

    const MAX_DIST = 160;

    const init = () => {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;

      stars = Array.from({ length: 140 }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.2 + 0.3,
        base: Math.random() * 0.18 + 0.04,
        phase: Math.random() * Math.PI * 2,
      }));

      nodes = Array.from({ length: 70 }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.55,
        r: Math.random() * 1.8 + 1.5,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const tick = (ts: number) => {
      ctx.clearRect(0, 0, w, h);

      /* stars — faint dark dots on light bg */
      stars.forEach(s => {
        s.phase += 0.006;
        const op = s.base + Math.sin(s.phase) * 0.04;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,140,100,${op})`;
        ctx.fill();
      });

      /* move nodes */
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy; n.phase += 0.025;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
        n.x = Math.max(0, Math.min(w, n.x));
        n.y = Math.max(0, Math.min(h, n.y));
      });

      /* connections */
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX_DIST) {
            const a = (1 - d / MAX_DIST) * 0.16;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(0,170,120,${a})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      /* spawn signals */
      if (ts - lastSpawn > 280 && Math.random() < 0.45) {
        lastSpawn = ts;
        const i = Math.floor(Math.random() * nodes.length);
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          if (Math.sqrt(dx * dx + dy * dy) < MAX_DIST) {
            signals.push({ a: i, b: j, t: 0, speed: 0.018 + Math.random() * 0.022 });
            break;
          }
        }
      }

      /* draw & advance signals */
      signals = signals.filter(sig => {
        sig.t += sig.speed;
        if (sig.t >= 1) return false;
        const na = nodes[sig.a], nb = nodes[sig.b];
        const x  = na.x + (nb.x - na.x) * sig.t;
        const y  = na.y + (nb.y - na.y) * sig.t;
        /* glow trail */
        const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
        g.addColorStop(0, "rgba(0,168,118,0.9)");
        g.addColorStop(0.4, "rgba(0,168,118,0.3)");
        g.addColorStop(1, "rgba(0,168,118,0)");
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        return true;
      });

      /* nodes */
      nodes.forEach(n => {
        const pulse = 1 + Math.sin(n.phase) * 0.2;
        const r = n.r * pulse;
        /* outer halo */
        const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 5);
        halo.addColorStop(0, "rgba(0,168,118,0.12)");
        halo.addColorStop(1, "rgba(0,168,118,0)");
        ctx.beginPath(); ctx.arc(n.x, n.y, r * 5, 0, Math.PI * 2);
        ctx.fillStyle = halo; ctx.fill();
        /* core dot */
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,168,118,0.75)"; ctx.fill();
      });

      raf = requestAnimationFrame(tick);
    };

    init();
    raf = requestAnimationFrame(tick);
    const onResize = () => init();
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);

  return (
    <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
  );
}

/* ─── Input field ─────────────────────────────────────────────────────────── */
function InputField({ label, type, value, onChange, placeholder, icon, suffix, onKeyDown }: {
  label: string; type: string; value: string; onChange: (v: string) => void;
  placeholder?: string; icon?: React.ReactNode; suffix?: React.ReactNode;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: focus ? "#00a876" : "#3a3a3c", marginBottom: 6, transition: "color 150ms ease", letterSpacing: "-0.1px" }}>
        {label}
      </label>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "11px 14px", borderRadius: 12,
        background: focus ? "#fff" : "#f5f5f7",
        border: `1.5px solid ${focus ? "#00a876" : "#e8e8ed"}`,
        boxShadow: focus ? "0 0 0 3px rgba(0,168,118,0.1)" : "none",
        transition: "border-color 150ms ease, background 150ms ease, box-shadow 150ms ease",
      }}>
        {icon && <span style={{ color: focus ? "#00a876" : "#8a8a8e", flexShrink: 0, display: "flex", transition: "color 150ms ease" }}>{icon}</span>}
        <input
          type={type} value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          onKeyDown={onKeyDown}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontSize: 14, color: "#1d1d1f", fontFamily: "inherit", caretColor: "#00a876",
          }}
        />
        {suffix}
      </div>
    </div>
  );
}

/* ─── Main login content ─────────────────────────────────────────────────── */
function LoginContent({ splashDone }: { splashDone: boolean }) {
  const router = useRouter();
  const params = useSearchParams();

  const [tab, setTab]             = useState<"login" | "register">("login");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [username, setUsername]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [oauthLoad, setOauthLoad]   = useState<string | null>(null);
  const [oauthDone, setOauthDone]   = useState(false);
  const [error, setError]           = useState("");
  const [mounted, setMounted]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [isMobile, setIsMobile]   = useState(false);

  const PHRASES = [
    "answered instantly.",
    "visualised beautifully.",
    "understood deeply.",
    "analysed in seconds.",
    "told as a story.",
    "turned into insight.",
    "explored with ease.",
  ];

  useEffect(() => {
    if (!splashDone) return;
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, [splashDone]);

  useEffect(() => {
    let idx = 0;
    let charPos = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const phrase = PHRASES[idx];
      if (!deleting) {
        charPos++;
        setTypedText(phrase.slice(0, charPos));
        if (charPos === phrase.length) {
          deleting = true;
          timer = setTimeout(tick, 1800);
        } else {
          timer = setTimeout(tick, 68);
        }
      } else {
        charPos--;
        setTypedText(phrase.slice(0, charPos));
        if (charPos === 0) {
          deleting = false;
          idx = (idx + 1) % PHRASES.length;
          timer = setTimeout(tick, 200);
        } else {
          timer = setTimeout(tick, 38);
        }
      }
    };

    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const blink = setInterval(() => setShowCursor(v => !v), 530);
    return () => clearInterval(blink);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const token = params.get("token");
    const err   = params.get("error");
    if (token) {
      setOauthDone(true);
      localStorage.setItem("brain_token", token);
      // Fetch user so role-based redirect works
      fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(user => {
          if (user) localStorage.setItem("brain_user", JSON.stringify(user));
          if (user?.role === "super_admin") router.replace("/superadmin");
          else if (user?.role === "staff")  router.replace("/staff");
          else                              router.replace("/");
        })
        .catch(() => router.replace("/"));
    }
    if (err) {
      const msgs: Record<string, string> = {
        oauth_denied:          "Sign-in was cancelled.",
        token_exchange_failed: "OAuth failed — please try again.",
        no_email:              "Could not get your email address from the provider.",
        invalid_state:         "OAuth session expired or was tampered with — please try again.",
      };
      setError(msgs[err] || "Authentication failed.");
    }
  }, [params, router]);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("brain_token")) {
      const rawUser = localStorage.getItem("brain_user");
      if (rawUser) {
        try {
          const user = JSON.parse(rawUser);
          router.replace(user?.role === "super_admin" ? "/superadmin" : "/");
          return;
        } catch {}
      }
      router.replace("/");
    }
  }, [router]);

  const submit = async () => {
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true); setError("");
    try {
      const body = tab === "login" ? { email, password } : { email, password, username };
      const res  = await fetch(`${BASE}/${tab === "login" ? "login" : "register"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Something went wrong."); return; }
      setSuccess(true);
      localStorage.setItem("brain_token", data.token);
      localStorage.setItem("brain_user", JSON.stringify(data.user));
      const dest = data.user?.role === "super_admin" ? "/superadmin"
                 : data.user?.role === "staff"       ? "/staff"
                 : "/";
      setTimeout(() => router.replace(dest), 700);
    } catch { setError("Network error — is the backend running?"); }
    finally   { setLoading(false); }
  };

  if (oauthDone) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f9f6", flexDirection: "column", gap: 20 }}>
        <NeuralCanvas />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <span className="spin-ring" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <p style={{ marginTop: 16, fontSize: 15, color: "#3a3a3c", fontWeight: 500 }}>Signing you in…</p>
        </div>
        <style>{`.spin-ring{display:inline-block;border-radius:50%;border:2px solid rgba(0,200,150,0.25);border-top-color:#00c896;animation:spinIt 560ms linear infinite}.@keyframes spinIt{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#f4f9f6", position: "relative", overflowX: "hidden" }}>

      {/* Neural network canvas — fills entire background */}
      <NeuralCanvas />

      {/* Soft vignette — lightens edges slightly */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(234,246,240,0.55) 100%)", pointerEvents: "none" }} />

      {/* ── Left panel — branding ── */}
      <div style={{
        width: "46%", minHeight: "100vh", display: isMobile ? "none" : "flex", flexDirection: "column",
        justifyContent: "center", padding: "64px 60px", position: "relative", zIndex: 1,
      }}>
        <div style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(22px)",
          transition: "opacity 640ms cubic-bezier(0.23,1,0.32,1), transform 640ms cubic-bezier(0.23,1,0.32,1)",
        }}>
          {/* brAIn wordmark */}
          <div style={{ marginBottom: 48 }}>
            <span style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-1.4px", color: "#1d1d1f" }}>
              br<span style={{ background: "linear-gradient(135deg,#00a876,#00c896)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>AI</span>n
            </span>
          </div>

          <h1 style={{ fontSize: 42, fontWeight: 700, color: "#1d1d1f", lineHeight: 1.12, letterSpacing: "-1px", marginBottom: 20 }}>
            Your data,<br />
            <span style={{
              background: "linear-gradient(135deg,#00a876,#00c896)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
              {typedText}
            </span>
            <span style={{
              display: "inline-block", width: 3, height: "0.85em",
              background: "#00a876", borderRadius: 2, marginLeft: 3,
              verticalAlign: "middle", marginBottom: 4,
              opacity: showCursor ? 1 : 0,
              transition: "opacity 80ms ease",
            }} />
          </h1>
          <p style={{ fontSize: 16, color: "#6e6e73", lineHeight: 1.75, marginBottom: 52, maxWidth: 340 }}>
            Ask questions in plain English. brAIn writes the Python, runs it, and gives you the answer.
          </p>

          {/* Feature list */}
          {[
            { label: "Connect any source",       sub: "CSV, Excel, PostgreSQL, MySQL, Sheets" },
            { label: "AI-generated analysis",    sub: "Python written and executed automatically" },
            { label: "Privacy first",            sub: "PII detection and masking built in" },
            { label: "One-click visualisations", sub: "Beautiful charts from a single prompt" },
          ].map((f, i) => (
            <div key={f.label} style={{
              display: "flex", alignItems: "center", gap: 14, marginBottom: 20,
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
              transition: `opacity 560ms cubic-bezier(0.23,1,0.32,1), transform 560ms cubic-bezier(0.23,1,0.32,1)`,
              transitionDelay: `${180 + i * 70}ms`,
            }}>
              {/* Pulse dot */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00a876", boxShadow: "0 0 6px rgba(0,168,118,0.5)" }} />
                <div style={{ position: "absolute", inset: -4, borderRadius: "50%", border: "1px solid rgba(0,168,118,0.3)", animation: "nodePing 2s ease-out infinite", animationDelay: `${i * 0.4}s` }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", margin: 0 }}>{f.label}</p>
                <p style={{ fontSize: 12, color: "#6e6e73", margin: "2px 0 0" }}>{f.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Thin separator */}
      {!isMobile && <div style={{ position: "absolute", left: "46%", top: "8%", bottom: "8%", width: 1, background: "linear-gradient(to bottom, transparent, rgba(0,168,118,0.2) 30%, rgba(0,168,118,0.2) 70%, transparent)", zIndex: 1 }} />}

      {/* ── Right panel — glass card ── */}
      <div style={{ flex: 1, display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? "20px 16px 40px" : "48px 40px", position: "relative", zIndex: 1 }}>

        <div style={{
          width: "100%", maxWidth: isMobile ? "100%" : 420,
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          borderRadius: isMobile ? 20 : 24,
          padding: isMobile ? "28px 20px 24px" : "40px 36px 32px",
          border: "1px solid rgba(0,168,118,0.14)",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.08), 0 32px 80px rgba(0,0,0,0.05), 0 0 60px rgba(0,200,150,0.04)",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0) scale(1)" : "translateY(24px) scale(0.97)",
          transition: "opacity 580ms cubic-bezier(0.23,1,0.32,1), transform 580ms cubic-bezier(0.23,1,0.32,1)",
          transitionDelay: "80ms",
        }}>

          {/* Mobile wordmark */}
          {isMobile && (
            <div style={{ marginBottom: 24, textAlign: "center" }}>
              <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-1.2px", color: "#1d1d1f" }}>
                br<span style={{ background: "linear-gradient(135deg,#00a876,#00c896)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>AI</span>n
              </span>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8a8a8e" }}>Intelligent data analysis</p>
            </div>
          )}

          {/* Card heading */}
          <div style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1d1d1f", margin: "0 0 6px", letterSpacing: "-0.5px" }}>
              {tab === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p style={{ fontSize: 13, color: "#6e6e73", margin: 0 }}>
              {tab === "login" ? "Sign in to continue to brAIn" : "Start analysing your data for free"}
            </p>
          </div>

          {/* OAuth buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
            {PROVIDERS.map(p => (
              <button key={p.id} className="oauth-btn"
                onClick={() => { setOauthLoad(p.id); window.location.href = `${BASE}/oauth/${p.id}`; }}
                disabled={!!oauthLoad}
                style={{ opacity: oauthLoad && oauthLoad !== p.id ? 0.4 : 1 }}>
                {oauthLoad === p.id
                  ? <span className="spin-ring" />
                  : <img src={p.icon} width={14} height={14} alt={p.id} />
                }
                <span>{p.label}</span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#e8e8ed" }} />
            <span style={{ fontSize: 11, color: "#8a8a8e", whiteSpace: "nowrap", letterSpacing: "0.3px" }}>or continue with email</span>
            <div style={{ flex: 1, height: 1, background: "#e8e8ed" }} />
          </div>

          {/* Tab switcher */}
          <div style={{ display: "flex", background: "#f0f0f5", borderRadius: 12, padding: 4, marginBottom: 22, position: "relative", border: "1px solid #e5e5ea" }}>
            <div style={{
              position: "absolute", top: 4, bottom: 4, left: 4,
              width: "calc(50% - 4px)",
              background: "#fff",
              border: "1px solid rgba(0,168,118,0.2)",
              borderRadius: 9,
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              transform: `translateX(${tab === "login" ? "0%" : "100%"})`,
              transition: "transform 240ms cubic-bezier(0.23,1,0.32,1)",
            }} />
            {(["login", "register"] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(""); }} style={{
                flex: 1, padding: "9px 0", borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
                background: "transparent", position: "relative", zIndex: 1,
                color: tab === t ? "#00a876" : "#8a8a8e",
                transition: "color 200ms ease",
              }}>
                {t === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 8 }}>
            {tab === "register" && (
              <InputField label="Username" type="text" value={username} onChange={setUsername}
                placeholder="yourname" icon={<User size={14} />} />
            )}
            <InputField label="Email address" type="email" value={email} onChange={setEmail}
              placeholder="you@company.com" icon={<Mail size={14} />} />
            <InputField label="Password" type={showPw ? "text" : "password"} value={password} onChange={setPassword}
              placeholder="••••••••" icon={<Lock size={14} />}
              onKeyDown={e => e.key === "Enter" && submit()}
              suffix={
                <button onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8a8a8e", padding: 0, display: "flex", transition: "color 150ms ease" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#3a3a3c")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#8a8a8e")}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              }
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderRadius: 10, margin: "12px 0 4px",
              background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)",
              animation: "shakeErr 320ms cubic-bezier(0.23,1,0.32,1)",
            }}>
              <AlertCircle size={13} style={{ color: "#ff6b6b", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#ff6b6b" }}>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button className={`submit-btn ${success ? "success" : ""}`}
            onClick={submit} disabled={loading || success}
            style={{ marginTop: 20 }}>
            {success ? (
              <><Check size={15} /> Done!</>
            ) : loading ? (
              <><span className="spin-ring light" /> Please wait…</>
            ) : (
              <>{tab === "login" ? "Sign in" : "Create account"} <ArrowRight size={15} /></>
            )}
          </button>

          <p style={{ textAlign: "center", fontSize: 11, color: "#8a8a8e", marginTop: 16, lineHeight: 1.6 }}>
            By continuing you agree to our{" "}
            <a href="#" style={{ color: "#00a876", textDecoration: "none" }}>Terms</a> &amp;{" "}
            <a href="#" style={{ color: "#00a876", textDecoration: "none" }}>Privacy</a>
          </p>
        </div>
      </div>

      <style>{`
        /* OAuth button */
        .oauth-btn {
          display: flex; align-items: center; justify-content: center; gap: 7px;
          padding: 10px 12px; border-radius: 10px;
          font-size: 12px; font-weight: 500; cursor: pointer;
          background: #f5f5f7;
          border: 1px solid #e8e8ed;
          color: #1d1d1f;
          transition: background 140ms ease, border-color 140ms ease, transform 120ms ease, box-shadow 140ms ease;
          white-space: nowrap;
        }
        @media (hover: hover) and (pointer: fine) {
          .oauth-btn:hover:not(:disabled) {
            background: #fff;
            border-color: #d2d2d7;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          }
        }
        .oauth-btn:active:not(:disabled) { transform: scale(0.97); }
        .oauth-btn:disabled { cursor: default; }

        /* Submit button */
        .submit-btn {
          width: 100%; padding: 14px 0; border-radius: 14px;
          font-size: 14px; font-weight: 600; cursor: pointer; border: none;
          background: linear-gradient(135deg, #00c896 0%, #059669 50%, #00c896 100%);
          background-size: 200% auto;
          color: #fff; display: flex; align-items: center; justify-content: center; gap: 8px;
          box-shadow: 0 4px 20px rgba(0,200,150,0.35), 0 0 0 1px rgba(0,200,150,0.2);
          transition: background-position 380ms cubic-bezier(0.23,1,0.32,1),
                      transform 130ms cubic-bezier(0.23,1,0.32,1),
                      box-shadow 180ms ease, opacity 150ms ease;
          letter-spacing: -0.1px;
        }
        @media (hover: hover) and (pointer: fine) {
          .submit-btn:hover:not(:disabled) {
            background-position: right center;
            box-shadow: 0 6px 28px rgba(0,200,150,0.5), 0 0 0 1px rgba(0,200,150,0.3);
          }
        }
        .submit-btn:active:not(:disabled) { transform: scale(0.97); }
        .submit-btn:disabled { opacity: 0.6; cursor: default; }
        .submit-btn.success { background: linear-gradient(135deg,#10b981,#059669) !important; background-size: 100% !important; }

        /* Spin ring */
        .spin-ring {
          display: inline-block; width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(0,200,150,0.25); border-top-color: #00c896;
          animation: spinIt 560ms linear infinite; flex-shrink: 0;
        }
        .spin-ring.light { border-color: rgba(255,255,255,0.3); border-top-color: #fff; }
        @keyframes spinIt { to { transform: rotate(360deg); } }

        /* Error shake */
        @keyframes shakeErr {
          0%,100% { transform: translateX(0); }
          20%     { transform: translateX(-5px); }
          40%     { transform: translateX(5px); }
          60%     { transform: translateX(-3px); }
          80%     { transform: translateX(3px); }
        }

        /* Node ping rings */
        @keyframes nodePing {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(3); opacity: 0; }
        }

        input::placeholder { color: #b8b8be; }

        @media (prefers-reduced-motion: reduce) {
          .submit-btn, .oauth-btn { transition: opacity 120ms ease !important; }
          .submit-btn:active, .oauth-btn:active { transform: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── Splash screen ──────────────────────────────────────────────────────── */
function SplashScreen({ onDone }: { onDone: () => void }) {
  const [bang,    setBang]    = useState(false); // flash burst fires
  const [netOn,   setNetOn]   = useState(false); // network reveals
  const [textIn,  setTextIn]  = useState(false); // logo appears
  const [fillOn,  setFillOn]  = useState(false); // fill sweep
  const [leaving, setLeaving] = useState(false); // exit fade

  useEffect(() => {
    const ts = [
      setTimeout(() => setBang(true),    60),   // instant flash
      setTimeout(() => setNetOn(true),   180),  // network blasts out from flash
      setTimeout(() => setTextIn(true),  650),  // logo emerges once network settles
      setTimeout(() => setFillOn(true),  900),  // fill starts
      setTimeout(() => setLeaving(true), 2700), // exit
      setTimeout(onDone,                 3300),
    ];
    return () => ts.forEach(clearTimeout);
  }, [onDone]);

  const R = 56, C = 2 * Math.PI * R;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "#ffffff",          // pure white — nothing until the bang
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      opacity:   leaving ? 0 : 1,
      transition: leaving ? "opacity 580ms cubic-bezier(0.4,0,0.2,1)" : "none",
      pointerEvents: leaving ? "none" : "all",
    }}>

      {/* ── Neural network — hidden inside circle(0%), explodes outward on bang ── */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1,
        clipPath: netOn ? "circle(150% at 50% 50%)" : "circle(0% at 50% 50%)",
        transition: netOn ? "clip-path 800ms cubic-bezier(0.12,0.8,0.25,1)" : "none",
      }}>
        <NeuralCanvas />
      </div>

      {/* ── Flash burst — pure light explosion, fades before network settles ── */}
      {bang && (
        <div key="flash" style={{
          position: "absolute", zIndex: 3, pointerEvents: "none",
          width: 200, height: 200, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,240,180,0.95) 0%, rgba(0,210,155,0.4) 45%, transparent 75%)",
          animation: "splashFlash 650ms cubic-bezier(0.12,0.8,0.25,1) forwards",
        }} />
      )}

      {/* ── brAIn wordmark + ring ── */}
      <div style={{
        position: "relative", zIndex: 4,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 28,
        opacity:   textIn ? 1 : 0,
        transform: textIn
          ? "scale(1) translateY(0)"
          : "scale(0.86) translateY(18px)",
        transition: "opacity 560ms cubic-bezier(0.23,1,0.32,1), transform 560ms cubic-bezier(0.23,1,0.32,1)",
      }}>

        <div style={{ position: "relative", width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* SVG fill ring */}
          <svg width="160" height="160" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
            <defs>
              <linearGradient id="splashRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#00a876" />
                <stop offset="100%" stopColor="#33d9ab" />
              </linearGradient>
            </defs>
            <circle cx="80" cy="80" r={R} fill="none" stroke="rgba(0,168,118,0.1)" strokeWidth="2.5" />
            <circle cx="80" cy="80" r={R} fill="none"
              stroke="url(#splashRingGrad)" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={fillOn ? 0 : C}
              style={{ transition: "stroke-dashoffset 1600ms cubic-bezier(0.35,0,0.15,1)" }} />
          </svg>

          {/* Wordmark */}
          <div style={{ position: "relative", userSelect: "none" }}>
            <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-2.8px", color: "rgba(0,0,0,0.08)", lineHeight: 1, display: "block" }}>
              brAIn
            </span>
            <div style={{
              position: "absolute", inset: 0,
              fontSize: 52, fontWeight: 900, letterSpacing: "-2.8px", lineHeight: 1, whiteSpace: "nowrap",
              clipPath: fillOn ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
              transition: "clip-path 1600ms cubic-bezier(0.35,0,0.15,1)",
            }}>
              <span style={{ background: "linear-gradient(135deg,#00a876,#00c896)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>br</span>
              <span style={{ color: "#1d1d1f" }}>AI</span>
              <span style={{ background: "linear-gradient(135deg,#00c896,#33d9ab)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>n</span>
            </div>
          </div>
        </div>

        <p style={{
          fontSize: 13, color: "#8a8a8e", margin: 0, letterSpacing: "0.3px",
          opacity: fillOn ? 1 : 0,
          transform: fillOn ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 500ms 500ms cubic-bezier(0.23,1,0.32,1), transform 500ms 500ms cubic-bezier(0.23,1,0.32,1)",
        }}>
          Intelligent data analysis
        </p>
      </div>

      <style>{`
        @keyframes splashFlash {
          0%   { transform: scale(0.05); opacity: 1;   }
          45%  { transform: scale(2.2);  opacity: 0.7; }
          100% { transform: scale(5);    opacity: 0;   }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <>
      <SplashScreen onDone={() => setSplashDone(true)} />
      <Suspense><LoginContent splashDone={splashDone} /></Suspense>
    </>
  );
}
