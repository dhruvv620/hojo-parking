"use client";

import { Navigation } from "lucide-react";
import { directionsLinks, lotById, type LotId } from "@/lib/lots";

/** "Get directions" to a lot: big Google Maps button plus an Apple Maps link. */
export function DirectionsButtons({ lot, size = "md" }: { lot: LotId; size?: "md" | "lg" }) {
  const l = lotById(lot);
  const links = directionsLinks(lot);
  if (!l) return null;
  return (
    <div>
      <a href={links.google} target="_blank" rel="noopener noreferrer"
        className={`btn-primary w-full ${size === "lg" ? "btn-lg" : ""}`}>
        <Navigation /> Directions to {l.name}
      </a>
      <a href={links.apple} target="_blank" rel="noopener noreferrer"
        className="mt-1.5 block text-center text-xs font-semibold text-brand-700 hover:underline">
        or open in Apple Maps
      </a>
    </div>
  );
}
