"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { saveAuth, getUser } from "@/lib/auth";
import { useSettings } from "@/lib/settings";

const ROLE_TO_ROUTE = {
  pos: "/pos",
  kitchen: "/kitchen",
  manager: "/manager/reports",
  admin: "/manager/reports",
};

export default function LoginPage() {
  const { settings } = useSettings();
  const logo = settings?.logoUrl || "/logo.png";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    return username.trim() && password.trim() && !loading;
  }, [username, password, loading]);

  // If already logged in, redirect by role
  useEffect(() => {
    const u = getUser();
    if (!u) return;
    const route = ROLE_TO_ROUTE[u.role] || "/pos";
    window.location.href = route;
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/login", {
        username: username.trim(),
        password,
      });

      saveAuth(res.data.token, res.data.user);

      const role = res.data?.user?.role;
      const route = ROLE_TO_ROUTE[role] || "/pos";
      window.location.href = route;
    } catch (err) {
      console.error(err);
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
            <img src={logo} alt="Kurda Restaurant" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="text-2xl font-extrabold leading-tight">
              K-Restaurant System
            </div>
            <div className="text-xs text-slate-400">
              
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white/[0.04] border border-white/10 shadow-xl overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-white/10">
            <div className="text-lg font-bold">Sign in</div>
            <div className="text-xs text-slate-400">
              You will be redirected based on your account role.
            </div>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-4 rounded-2xl bg-red-600/15 border border-red-500/30 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                <label className="block text-[11px] uppercase tracking-wide text-slate-400">
                  Username
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  className="mt-1 w-full bg-transparent outline-none text-sm"
                  placeholder="username"
                />
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                <label className="block text-[11px] uppercase tracking-wide text-slate-400">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full bg-transparent outline-none text-sm"
                  placeholder="••••••••"
                />
              </div>

              <button
                disabled={!canSubmit}
                type="submit"
                className={[
                  "w-full rounded-2xl py-3 text-sm font-bold transition",
                  canSubmit
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-red-900/40 text-white/50 cursor-not-allowed",
                ].join(" ")}
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>

              {/* <div className="text-[11px] text-slate-500 text-center">
                Roles: <span className="text-slate-300">pos</span>,{" "}
                <span className="text-slate-300">kitchen</span>,{" "}
                <span className="text-slate-300">manager</span>,{" "}
                <span className="text-slate-300">admin</span>
              </div> */}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
