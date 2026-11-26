"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, DatabaseBackup, History, LayoutDashboard, LogOut, Plus, QrCode, SquareParking } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { HOTEL_NAME } from "@/lib/config";
import { Menu } from "./ui/Dropdown";
import { useConfirm } from "./ui/Confirm";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: History },
  { href: "/qr", label: "Guest QR", icon: QrCode },
];

export function Header() {
  const path = usePathname();
  const router = useRouter();
  const confirm = useConfirm();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    if (!(await confirm({ title: "Sign out?", message: "You will need your email and password to sign back in.", confirmText: "Sign out", icon: "checkout" }))) return;
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initial = (email ?? "?").slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-40 print:hidden border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5 rounded-xl pr-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/30 transition-transform duration-200 group-hover:scale-105">
            <SquareParking className="h-5 w-5" />
          </span>
          <span className="hidden leading-tight md:block">
            <span className="block text-sm font-bold tracking-tight">{HOTEL_NAME}</span>
            <span className="block text-xs text-slate-500">Parking Manager</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            const Icon = l.icon;
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold transition-all duration-200 sm:px-3 ${
                  active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}>
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/cars/new" className="btn-primary">
            <Plus />
            <span>Add<span className="hidden sm:inline"> Car</span></span>
          </Link>
          <Menu
            label="Account"
            triggerClassName="btn-ghost h-10 gap-1.5 rounded-full !px-1 sm:!pr-2"
            header={
              <div className="mb-1 border-b border-slate-100 px-2.5 pb-2.5 pt-1.5">
                <div className="text-xs text-slate-500">Signed in as</div>
                <div className="truncate text-sm font-semibold text-slate-900">{email ?? "..."}</div>
              </div>
            }
            items={[
              { label: "Backup", icon: <DatabaseBackup />, onSelect: () => router.push("/backup") },
              { label: "Guest check-in QR", icon: <QrCode />, onSelect: () => router.push("/qr") },
              { label: "Sign out", icon: <LogOut />, onSelect: signOut, danger: true, divider: true },
            ]}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-sm font-bold text-white">
              {initial}
            </span>
            <ChevronDown className="hidden text-slate-400 sm:block" />
          </Menu>
        </div>
      </div>
    </header>
  );
}
