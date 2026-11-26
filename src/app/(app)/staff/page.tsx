"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ShieldCheck, UserMinus, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtDateTime } from "@/lib/time";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { Avatar, EmptyState, SectionTitle } from "@/components/ui/bits";

type Row = { user_id: string; email: string; approved: boolean; created_at: string; last_sign_in_at: string | null; added_by: string | null };

/** Approve or remove staff accounts. Only approved staff can open this. */
export default function StaffPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().rpc("staff_list");
    if (error) setError(/function|does not exist|schema cache/i.test(error.message)
      ? "Staff approval isn't set up yet. Run supabase/update-8-security.sql in Supabase."
      : error.message);
    else setRows(data as Row[]);
  }, []);
  useEffect(() => {
    load();
    supabaseBrowser().auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => setMe(data.user?.id ?? null));
  }, [load]);

  async function set(r: Row, on: boolean) {
    if (!on && !(await confirm({ title: `Remove ${r.email}?`, message: "They will no longer be able to see or change anything. You can approve them again later.", confirmText: "Remove access", tone: "danger" }))) return;
    const { error } = await supabaseBrowser().rpc("staff_set", { p_user: r.user_id, p_on: on });
    if (error) toast(error.message, "error");
    else { toast(on ? `${r.email} approved.` : `${r.email} removed.`); load(); }
  }

  const pending = (rows ?? []).filter((r) => !r.approved);
  const staff = (rows ?? []).filter((r) => r.approved);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Staff</h1>
        <p className="mt-1 text-sm text-slate-500">
          Only approved staff can see or change anything. To add someone: create their login in Supabase (Authentication → Users → Add user), then approve them here.
        </p>
      </div>

      {error && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}
      {!rows && !error && <div className="skeleton h-48 rounded-2xl" />}

      {rows && (
        <>
          <section className={`card p-5 sm:p-6 ${pending.length ? "ring-1 ring-amber-200" : ""}`}>
            <SectionTitle icon={<Users />} title={`Waiting for approval (${pending.length})`}
              sub="New accounts appear here. Approve only people you know." />
            {pending.length === 0 ? (
              <EmptyState compact icon={<Check />} title="Nobody is waiting" />
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {pending.map((r) => (
                  <li key={r.user_id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar name={r.email} tone="amber" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{r.email}</div>
                      <div className="text-xs text-slate-500">Account made {fmtDateTime(r.created_at)}</div>
                    </div>
                    <button className="btn-primary btn-sm" onClick={() => set(r, true)}><ShieldCheck /> Approve</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5 sm:p-6">
            <SectionTitle icon={<ShieldCheck />} title={`Approved staff (${staff.length})`} />
            <ul className="mt-4 divide-y divide-slate-100">
              {staff.map((r) => (
                <li key={r.user_id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar name={r.email} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.email}{r.user_id === me && <span className="ml-2 chip bg-slate-100 text-slate-600">You</span>}</div>
                    <div className="text-xs text-slate-500">
                      {r.last_sign_in_at ? `Last signed in ${fmtDateTime(r.last_sign_in_at)}` : "Never signed in"}
                      {r.added_by && ` · approved by ${r.added_by}`}
                    </div>
                  </div>
                  {r.user_id !== me && (
                    <button className="btn-danger btn-sm" onClick={() => set(r, false)}><UserMinus /> Remove</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
