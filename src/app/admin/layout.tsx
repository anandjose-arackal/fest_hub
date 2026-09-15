"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, UserCheck, ClipboardCheck, Medal, Trophy, Users, CalendarDays,
  Layers, Landmark, Settings, Menu, X, LogOut, Award, Church, Building2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getOrgSettings } from "@/lib/org-settings";
import type { HierarchyLevel } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  color: string;
}
interface NavSection {
  title: string | null;
  items: NavItem[];
}

// Revised Decision #5: sa_admin is a shakha (branch) admin — full control
// of their own branch's registrations via the public Feast Portal, zero
// back-office access. "admin" is the real back-office role (not tied to a
// branch, so it can't register participants — see feast-details.tsx's
// registration gate). Only sa_admin gets fully bounced from /admin;
// me_admin still gets its own restricted slice below.
// Diocese/Meghala nav entries are conditional on the org's configured
// hierarchy_level (see /admin/org-settings) — a 'shakha'-level org (the
// default) sees this list exactly as it always has.
function buildFullNavSections(hierarchyLevel: HierarchyLevel): NavSection[] {
  const utilItems: NavItem[] = [{ href: "/admin/users", label: "Users", icon: Users, color: "#0369A1" }];
  if (hierarchyLevel === "diocese") utilItems.push({ href: "/admin/dioceses", label: "Dioceses", icon: Church, color: "#6B46FF" });
  if (hierarchyLevel !== "shakha") utilItems.push({ href: "/admin/meghalas", label: "Meghalas", icon: Building2, color: "#0F766E" });
  utilItems.push(
    { href: "/admin/feasts", label: "Fests", icon: CalendarDays, color: "#9333EA" },
    { href: "/admin/competitions", label: "Competitions", icon: Layers, color: "#475569" },
    { href: "/admin/shakhas", label: "Shakhas", icon: Landmark, color: "#0F766E" },
    { href: "/admin/org-settings", label: "Organization", icon: Settings, color: "#6B7280" }
  );

  return [
    {
      title: null,
      items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, color: "#6B46FF" }],
    },
    {
      title: "Fest",
      items: [
        { href: "/admin/participants", label: "Participants", icon: UserCheck, color: "#0891B2" },
        { href: "/admin/participation", label: "Attendance", icon: ClipboardCheck, color: "#BE185D" },
        { href: "/admin/results", label: "Results", icon: Medal, color: "#D97706" },
        { href: "/admin/standings", label: "Standings", icon: Trophy, color: "#7C3AED" },
        { href: "/admin/certificates", label: "Certificates", icon: Award, color: "#A16207" },
      ],
    },
    { title: "Fest Util", items: utilItems },
  ];
}

const ME_ADMIN_ALLOWED_PATHS = ["/admin", "/admin/participants", "/admin/participation", "/admin/standings"];
const ME_ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, color: "#6B46FF" },
      { href: "/admin/participants", label: "Participants", icon: UserCheck, color: "#0891B2" },
      { href: "/admin/participation", label: "Attendance", icon: ClipboardCheck, color: "#BE185D" },
      { href: "/admin/standings", label: "Standings", icon: Trophy, color: "#7C3AED" },
    ],
  },
];

function isActive(href: string, pathname: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, profile, loading, signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hierarchyLevel, setHierarchyLevel] = useState<HierarchyLevel>("shakha");

  useEffect(() => {
    getOrgSettings().then((org) => setHierarchyLevel(org.hierarchy_level));
  }, []);

  const isLoginPage = pathname === "/admin/login";
  const isMeAdmin = profile?.role === "me_admin";
  // sa_admin is a branch (shakha) admin, not a back-office role — they
  // register participants for their assigned shakha through the public
  // Feast Portal (see feast-details.tsx's LoginSheet + feast-register.tsx's
  // adminShakha lookup), never through /admin. Unlike me_admin, they get no
  // allowed-paths slice at all — every /admin/* route bounces them out.
  const isSaAdmin = profile?.role === "sa_admin";
  const needsLoginRedirect = !loading && !session && !isLoginPage;
  const needsMeAdminRedirect = !loading && !isLoginPage && isMeAdmin && !ME_ADMIN_ALLOWED_PATHS.includes(pathname);
  const needsSaAdminRedirect = !loading && !isLoginPage && isSaAdmin;
  // Landing on /admin/login with a session already established (e.g. signed
  // in earlier via the Feast Portal's LoginSheet, then navigating straight
  // here) used to just show the form again with no redirect — you had to
  // resubmit valid credentials a second time before anything happened.
  const needsAwayFromLoginRedirect = !loading && isLoginPage && !!session;

  useEffect(() => {
    if (needsLoginRedirect) router.replace("/admin/login");
    else if (needsSaAdminRedirect) router.replace("/");
    else if (needsMeAdminRedirect) router.replace("/admin");
    else if (needsAwayFromLoginRedirect) router.replace(isSaAdmin ? "/" : "/admin");
  }, [needsLoginRedirect, needsSaAdminRedirect, needsMeAdminRedirect, needsAwayFromLoginRedirect, isSaAdmin, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#6B46FF] border-t-transparent" />
      </div>
    );
  }

  if (needsLoginRedirect || needsSaAdminRedirect || needsMeAdminRedirect || needsAwayFromLoginRedirect) return null;

  if (isLoginPage) return <>{children}</>;

  const navSections = isMeAdmin ? ME_ADMIN_NAV_SECTIONS : buildFullNavSections(hierarchyLevel);
  const flatItems = navSections.flatMap((s) => s.items);
  const currentTitle = flatItems.find((i) => isActive(i.href, pathname))?.label ?? "Admin";
  const bottomNavItems = isMeAdmin ? flatItems.slice(0, 3) : flatItems.slice(0, 3);

  return (
    <div className="min-h-screen bg-[#FAFAFC]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-neutral-200 bg-white md:flex lg:w-64">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#6B46FF] to-[#A855F7] text-sm font-bold text-white">
            FH
          </div>
          <span className="text-sm font-semibold text-neutral-800">Fest Hub Admin</span>
        </div>
        <div className="border-b border-neutral-200 px-5 py-3">
          <p className="truncate text-sm font-medium text-neutral-800">{profile?.full_name || profile?.email}</p>
          <span className="mt-1 inline-block rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-purple-700">
            {profile?.role?.replace("_", " ")}
          </span>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {navSections.map((section, i) => (
            <div key={i}>
              {section.title && (
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{section.title}</p>
              )}
              {section.items.map((item) => {
                const active = isActive(item.href, pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                      active ? "bg-[#6B46FF]/10 text-[#6B46FF]" : "text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    <Icon className="h-4 w-4" style={{ color: active ? "#6B46FF" : item.color }} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <button
          onClick={() => signOut().then(() => router.push("/admin/login"))}
          className="m-3 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4 md:hidden">
        <span className="text-sm font-semibold text-neutral-800">{currentTitle}</span>
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-purple-700">
          {profile?.role?.replace("_", " ")}
        </span>
      </header>

      <main className="pt-14 pb-[70px] md:ml-56 md:pt-0 md:pb-0 lg:ml-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[58px] items-center border-t border-neutral-200 bg-white md:hidden">
        {bottomNavItems.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium"
              style={active ? { color: "#6B46FF" } : { color: "#6b7280" }}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={active ? { background: "rgba(107,70,255,0.1)" } : undefined}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium text-neutral-500"
        >
          <Menu className="h-[18px] w-[18px]" />
          Menu
        </button>
      </nav>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Menu</span>
              <button onClick={() => setDrawerOpen(false)}>
                <X className="h-5 w-5 text-neutral-500" />
              </button>
            </div>
            {navSections.map((section, i) => (
              <div key={i} className="mb-3">
                {section.title && (
                  <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{section.title}</p>
                )}
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm font-medium text-neutral-700"
                    >
                      <Icon className="h-4 w-4" style={{ color: item.color }} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
            <button
              onClick={() => signOut().then(() => router.push("/admin/login"))}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm font-medium text-red-600"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
