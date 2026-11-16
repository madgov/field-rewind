import type { Metadata } from "next";
import { Suspense } from "react";
import "@/components/shift/shift.css";
import "@/components/site/site.css";
import "@/components/replay/replay.css";
import "@/components/ask/ask.css";
import AskClient from "@/components/ask/AskClient";
import SiteShell from "@/components/site/SiteShell";
import { usableCrops } from "@/lib/crops/catalog";

export const metadata: Metadata = {
  title: "Ask about your field",
  description: "Say or type where you farm, what you grow, your water and your budget, and get a plan built from 40 years of NASA weather.",
};

export default function AskPage() {
  const crops = usableCrops().map((c) => ({ id: c.id, name: c.name }));
  return (
    <SiteShell
      kicker="Field advisor"
      title="Ask about your field"
      sub="Tell us where you farm, what you grow and how much water you have. We check it against the last 40 seasons of NASA weather, your soil and your crops' needs."
      chips={["3 steps", "Speak or type", "Regional climate, about 50 km grid"]}
      currentHref="/ask"
    >
      <Suspense fallback={<p className="ask-hint" role="status">Loading the field advisor…</p>}>
        <AskClient crops={crops} />
      </Suspense>
    </SiteShell>
  );
}
