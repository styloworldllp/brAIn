"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe, getToken, AuthUser, isAdmin } from "@/lib/auth";
import { AISpinner } from "./AISpinner";

interface Props {
  children: (user: AuthUser) => React.ReactNode;
  adminOnly?: boolean;
}

export default function AuthGuard({ children, adminOnly = false }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    fetchMe().then(u => {
      if (!u) { router.replace("/login"); return; }
      if (adminOnly && !isAdmin(u)) { router.replace("/"); return; }
      setUser(u);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)" }}>
        <AISpinner size={28} />
      </div>
    );
  }

  return <>{user && children(user)}</>;
}
