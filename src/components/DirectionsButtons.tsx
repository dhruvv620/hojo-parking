"use client";

import { Navigation } from "lucide-react";
import { directionsLinks, lotById, type LotId } from "@/lib/lots";

/** "Get directions" to a lot: big Google Maps button plus an Apple Maps link. */
export function DirectionsButtons({ lot, size = "md", words }: {
  lot: LotId;
  size?: "md" | "lg";
  /** Other language (the guest form); English when left out. */
  words?: { directionsTo: (lot: string) => string; appleMaps: string; opensGoogle: readonly [string, string, string]; lotName: Record<LotId, string> };
}) {
  const l = lotById(lot);
  const links = directionsLinks(lot);
  if (!l || !links) return null;
  return (
    <div>
      <a href={links.google} target="_blank" rel="noopener noreferrer"
        className={`btn-primary w-full ${size === "lg" ? "btn-lg" : ""}`}>
        <Navigation /> {words ? words.directionsTo(words.lotName[l.id]) : `Directions to ${l.name}`}
      </a>
      {links.apple ? (
        <a href={links.apple} target="_blank" rel="noopener noreferrer"
          className="mt-1.5 block text-center text-xs font-semibold text-brand-700 hover:underline">
          {words?.appleMaps ?? "or open in Apple Maps"}
        </a>
      ) : (
        (() => { const g = words?.opensGoogle ?? ["Opens the lot in Google Maps. Tap ", "Directions", " there."]; return <p className="mt-1.5 text-center text-xs text-slate-500">{g[0]}<b>{g[1]}</b>{g[2]}</p>; })()
      )}
    </div>
  );
}
