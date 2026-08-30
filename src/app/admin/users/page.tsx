"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Pencil, Plus, X, Eye, EyeOff, Users as UsersIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import type { Profile, Shakha, UserRole } from "@/types";

const ROLES: { value: UserRole; label: string; desc: string; classes: string }[] = [
  { value: "admin", label: "Admin", desc: "Branch administrator — full control on assigned branch", classes: "bg-blue-100 text-blue-700" },
  { value: "me_admin", label: "ME Admin", desc: "Can view all branches", classes: "bg-purple-100 text-purple-700" },
  { value: "sa_admin", label: "SA Admin", desc: "Full system access, no restrictions", classes: "bg-red-100 text-red-700" },
];

export default function UsersPage() {
  const { session, profile: currentUser } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [shakhas, setShakhas] = useState<Shakha[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>("admin");
  const [editShakha, setEditShakha] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>("admin");
  const [newShakha, setNewShakha] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profs }, { data: shks }] = await Promise.all([
      supabase.from("profiles").select("*, shakha:shakhas(*)").order("full_name"),
      supabase.from("shakhas").select("*").order("name"),
    ]);
    setProfiles(profs ?? []);
    setShakhas(shks ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [profiles, search]);

  const canManage = !!currentUser;

  function openEdit(p: Profile) {
    setEditProfile(p);
    setEditRole(p.role);
    setEditShakha(p.shakha_id ?? "");
  }

  async function handleSaveEdit() {
    if (!editProfile) return;
    setEditSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: editProfile.full_name, role: editRole, shakha_id: editShakha || null })
      .eq("id", editProfile.id);
    setEditSaving(false);
    if (!error) {
      setEditProfile(null);
      load();
    }
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        email: newEmail,
        password: newPassword,
        full_name: newName,
        role: newRole,
        shakha_id: newShakha || null,
      }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setCreateError(json.error || "Failed to create user");
      return;
    }
    setAddOpen(false);
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewRole("admin");
    setNewShakha("");
    load();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#6B46FF] to-[#A855F7] text-white">
            <UsersIcon className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-semibold text-neutral-800">Users</h1>
        </div>
        <button
          onClick={() => { setAddOpen(true); setCreateError(null); }}
          className="flex items-center gap-1.5 rounded-lg bg-[#6B46FF] px-3 py-2 text-sm font-semibold text-white hover:bg-[#5B3FE0]"
        >
          <Plus className="h-4 w-4" /> Add User
        </button>
      </div>

      <input
        className="mb-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
          {filtered.map((p) => {
            const role = ROLES.find((r) => r.value === p.role) ?? ROLES[0];
            return (
              <div key={p.id} className="flex items-center gap-3 p-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ background: "#6B46FF" }}
                >
                  {(p.full_name || p.email)[0]?.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800">{p.full_name || "—"}</p>
                  <p className="truncate text-xs text-neutral-500">{p.email}</p>
                  <div className="mt-1 flex gap-1.5 sm:hidden">
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${role.classes}`}>{role.label}</span>
                    {p.shakha && <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-600">{p.shakha.name}</span>}
                  </div>
                </div>
                <div className="hidden items-center gap-1.5 sm:flex">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${role.classes}`}>{role.label}</span>
                  {p.shakha && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">{p.shakha.name}</span>}
                </div>
                {canManage && (
                  <button onClick={() => openEdit(p)} className="text-neutral-400 hover:text-neutral-700">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editProfile && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setEditProfile(null)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Edit User</h2>
              <button onClick={() => setEditProfile(null)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <div className="space-y-3">
              <input
                className="input"
                value={editProfile.full_name}
                onChange={(e) => setEditProfile({ ...editProfile, full_name: e.target.value })}
                placeholder="Full name"
              />
              <input className="input opacity-60" value={editProfile.email} disabled />
              <select className="input" value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                ))}
              </select>
              <select className="input" value={editShakha} onChange={(e) => setEditShakha(e.target.value)}>
                <option value="">None</option>
                {shakhas.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button onClick={handleSaveEdit} disabled={editSaving} className="w-full rounded-lg bg-[#6B46FF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Add User</h2>
              <button onClick={() => setAddOpen(false)}><X className="h-5 w-5 text-neutral-400" /></button>
            </div>
            <div className="space-y-3">
              <input className="input" placeholder="Full name*" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input className="input" placeholder="Email*" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              <div className="relative">
                <input
                  className="input pr-9"
                  placeholder="Password* (min 6 chars)"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                ))}
              </select>
              <select className="input" value={newShakha} onChange={(e) => setNewShakha(e.target.value)}>
                <option value="">None</option>
                {shakhas.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <button
                onClick={handleCreate}
                disabled={creating || !newEmail || !newPassword || newPassword.length < 6}
                className="w-full rounded-lg bg-[#6B46FF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .input { width: 100%; border-radius: 0.5rem; border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
      `}</style>
    </div>
  );
}
