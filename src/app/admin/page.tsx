"use client";

import Link from "next/link";
import { UserCheck, ClipboardCheck, Medal, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const CARDS = [
  { href: "/admin/participants", label: "Participants", icon: UserCheck, color: "#0891B2" },
  { href: "/admin/participation", label: "Attendance", icon: ClipboardCheck, color: "#BE185D" },
  { href: "/admin/results", label: "Results", icon: Medal, color: "#D97706" },
  { href: "/admin/standings", label: "Standings", icon: Trophy, color: "#7C3AED" },
];

export default function AdminDashboardPage() {
  const { profile } = useAuth();

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800">
        Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">Fest management at a glance.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
              style={{ background: c.color }}
            >
              <c.icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-neutral-800">{c.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
