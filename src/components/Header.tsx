"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { HOTEL_NAME } from "@/lib/config";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/history", label: "History" },
];

export function Header() {
  const path = usePathname();
  const router = useRouter();

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-extrabold text-white">P</span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-sm font-bold">{HOTEL_NAME}</span>
            <span className="block text-xs text-slate-500">Parking Manager</span>
          </span>
        </Link>
        <nav className="ml-2 flex gap-1">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/cars/new" className="btn-primary"><span className="sm:hidden">+ Add</span><span className="hidden sm:inline">+ Add Car</span></Link>
          <button onClick={signOut} className="btn-secondary hidden sm:inline-flex">Sign out</button>
          <button onClick={signOut} className="btn-secondary sm:hidden" aria-label="Sign out">Exit</button>
        </div>
      </div>
    </header>
  );
}
