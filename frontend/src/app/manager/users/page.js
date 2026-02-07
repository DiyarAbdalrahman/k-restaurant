"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { getUser, clearAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";

const ROLE_ALLOWED = new Set(["admin", "manager"]);

export default function ManagerUsersPage() {
  const { settings } = useSettings();
  const logo = settings?.logoUrl || "/logo.png";
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    username: "",
    password: "",
    fullName: "",
    role: "pos",
  });
  const [pwMap, setPwMap] = useState({});
  const [pinMap, setPinMap] = useState({});

  useEffect(() => {
    const u = getUser();
    if (!u) {
      window.location.href = "/login";
      return;
    }
    if (!ROLE_ALLOWED.has(u.role)) {
      window.location.href = "/pos";
      return;
    }
    setUser(u);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadUsers();
  }, [user]);

  async function loadUsers() {
    try {
      setLoading(true);
      setMessage("");
      const res = await api.get("/users");
      setUsers(res.data || []);
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to load users";
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  async function createUser() {
    if (!form.username || !form.password || !form.fullName) return;
    try {
      await api.post("/users", form);
      setForm({ username: "", password: "", fullName: "", role: "pos" });
      await loadUsers();
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to create user";
      setMessage(msg);
    }
  }

  async function updateUser(id, patch) {
    try {
      const res = await api.patch(`/users/${id}`, patch);
      setUsers((prev) => prev.map((u) => (u.id === id ? res.data : u)));
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to update user";
      setMessage(msg);
    }
  }

  async function updatePassword(id) {
    const password = pwMap[id] || "";
    if (!password) return;
    try {
      await api.patch(`/users/${id}`, { password });
      setPwMap((prev) => ({ ...prev, [id]: "" }));
      setMessage("Password updated");
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to update password";
      setMessage(msg);
    }
  }

  async function updatePin(id) {
    const pin = pinMap[id] || "";
    if (!pin) return;
    try {
      await api.patch(`/users/${id}`, { pin });
      setPinMap((prev) => ({ ...prev, [id]: "" }));
      setMessage("PIN updated");
    } catch (e) {
      const msg = e?.response?.data?.message || "Failed to update PIN";
      setMessage(msg);
    }
  }

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  if (!user) return null;
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading users...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src={logo} alt="Kurda Restaurant" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-lg font-bold">User Management</div>
              <div className="text-[11px] text-slate-400">
                {user.fullName} • {user.role}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href="/manager/reports"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Reports
            </a>
            <a
              href="/manager/orders"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Orders
            </a>
            <a
              href="/manager/menu"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Menu
            </a>
            <a
              href="/manager/tables"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Tables
            </a>
            <a
              href="/pos"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              POS
            </a>
            <a
              href="/manager/settings"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Settings
            </a>
            <a
              href="/manager/promotions"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Promotions
            </a>
            <button
              onClick={logout}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500"
            >
              Logout
            </button>
          </div>
        </div>
        {message && (
          <div className="px-4 md:px-6 pb-3 text-xs text-amber-300">
            {message}
          </div>
        )}
      </header>

      <div className="px-4 md:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4">
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
            <div className="text-sm font-semibold mb-3">Create User</div>
            <div className="space-y-2">
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Username (pos2)"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Password"
                type="password"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Full name"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              />
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none"
              >
                <option value="pos">POS</option>
                <option value="kitchen">Kitchen</option>
                <option value="manager">Manager</option>
                {user.role === "admin" && <option value="admin">Admin</option>}
              </select>
              <button
                onClick={createUser}
                className="w-full rounded-xl py-2 text-sm font-semibold bg-red-600 hover:bg-red-500"
              >
                Create User
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-3 border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-400">
              <div className="col-span-4">User</div>
              <div className="col-span-3">Role</div>
              <div className="col-span-3">Active</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {users.map((u) => (
                <div key={u.id}>
                  <div className="grid grid-cols-12 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03]">
                    <div className="col-span-4">
                      <div className="text-sm font-semibold">{u.fullName}</div>
                      <div className="text-[11px] text-slate-400">@{u.username}</div>
                    </div>
                    <div className="col-span-3">
                      <select
                        defaultValue={u.role}
                        onChange={(e) => updateUser(u.id, { role: e.target.value })}
                        className="rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-xs outline-none"
                        disabled={u.role === "admin" && user.role !== "admin"}
                      >
                        <option value="pos">POS</option>
                        <option value="kitchen">Kitchen</option>
                        <option value="manager">Manager</option>
                        {user.role === "admin" && <option value="admin">Admin</option>}
                      </select>
                    </div>
                    <div className="col-span-3 flex items-center">
                      <label className="text-xs text-white/70 flex items-center gap-1">
                        <input
                          type="checkbox"
                          defaultChecked={u.isActive}
                          onChange={(e) => updateUser(u.id, { isActive: e.target.checked })}
                        />
                        Active
                      </label>
                    </div>
                    <div className="col-span-2 text-right text-xs text-white/60">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="grid grid-cols-12 px-4 pb-3 border-b border-white/5">
                    <div className="col-span-8">
                      <input
                        type="password"
                        value={pwMap[u.id] || ""}
                        onChange={(e) => setPwMap((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        placeholder="New password"
                        className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-xs outline-none"
                      />
                    </div>
                  <div className="col-span-4 flex justify-end">
                    <button
                      onClick={() => updatePassword(u.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-white/10 border border-white/10 hover:bg-white/15"
                      disabled={!pwMap[u.id]}
                    >
                      Update Password
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-12 px-4 pb-3 border-b border-white/5">
                  <div className="col-span-8">
                    <input
                      value={pinMap[u.id] || ""}
                      onChange={(e) => setPinMap((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      placeholder="New 4-digit PIN"
                      className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-xs outline-none"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="col-span-4 flex justify-end">
                    <button
                      onClick={() => updatePin(u.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-white/10 border border-white/10 hover:bg-white/15"
                      disabled={!pinMap[u.id]}
                    >
                      Update PIN
                    </button>
                  </div>
                </div>
                </div>
              ))}
              {users.length === 0 && (
                <div className="px-4 py-6 text-sm text-slate-400">No users yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
