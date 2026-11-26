"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CarForm } from "@/components/CarForm";
import { useParking } from "@/lib/useParking";
import { useToast } from "@/components/Toast";
import { ArrowLeft } from "lucide-react";
import { pinsOf } from "@/lib/types";

export default function NewCarPage() {
  const router = useRouter();
  const toast = useToast();
  const { inside, parked, loading } = useParking();

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-brand-700">
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Dashboard
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Add a car</h1>
      <p className="mb-6 text-sm text-slate-500">Check in a guest who is here now, or save a reservation for later.</p>
      {loading ? (
        <div className="space-y-5" aria-busy="true">
          <div className="skeleton h-56 rounded-2xl" />
          <div className="skeleton h-80 rounded-2xl" />
        </div>
      ) : (
        <CarForm insideCount={inside.length} otherPins={pinsOf(parked)}
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
