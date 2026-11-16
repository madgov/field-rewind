import type { Metadata } from "next";
import "@/components/shift/shift.css";
import "@/components/site/site.css";
import GlossaryList from "@/components/site/GlossaryList";
import SiteShell from "@/components/site/SiteShell";
import { loadGlossary } from "@/lib/site/glossary";

export const metadata: Metadata = {
  title: "Glossary | Field Rewind",
  description: "Plain-English meanings of the words used in Field Rewind, with the source each one was written from.",
};

export default function GlossaryPage() {
  const glossary = loadGlossary();
  return (
    <SiteShell
      kicker="Glossary"
      title="What the words on these pages mean"
      sub="Each entry says what the word means, where this app uses it, what it does not tell you, and the document it was written from."
      chips={[`${glossary.terms.length} terms`, "Every entry is sourced", `Sources read ${glossary.compiledOn}`]}
      currentHref="/glossary"
    >
      <p className="st-note">{glossary.note}</p>
      <GlossaryList glossary={glossary} />
    </SiteShell>
  );
}
