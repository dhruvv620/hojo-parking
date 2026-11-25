"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CarForm } from "@/components/CarForm";
import { useParking } from "@/lib/useParking";
import { useToast } from "@/components/Toast";

export default function NewCarPage() {
  const router = useRouter();
  const toast = useToast();
  const { inside, loading } = useParking();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-sm font-semibold text-brand-600 hover:underline">&larr; Dashboard</Link>
      <h1 className="mb-5 mt-2 text-2xl font-bold">Add a car</h1>
      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <CarForm insideCount={inside.length}
          onSaved={(r, note) => {
            if (note) toast(note, "warn");
            else if (r.status === "reserved") toast(`Reservation saved for ${r.guest_name}.`);
            else toast(`${r.guest_name} checked in (${r.location === "inside" ? "inside the fence" : "outside the fence"}).`);
            router.push("/");
          }} />
      )}
    </div>
  );
}
