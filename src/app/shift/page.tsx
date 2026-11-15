import type { Metadata } from "next";
import { Suspense } from "react";
import ShiftContent, { LoadingState } from "@/components/shift/ShiftContent";
import "@/components/shift/shift.css";

export const metadata: Metadata = {
  title: "Field shift | Field Rewind",
  description: "Compare 1985 to 2004 with 2006 to 2025 for hot days, crop water demand and rainfall, from NASA POWER regional climate data.",
};

export const maxDuration = 60;

export default function ShiftPage({ searchParams }: { searchParams: Promise<{ lat?: string | string[]; lon?: string | string[] }> }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <ShiftContent searchParams={searchParams} />
    </Suspense>
  );
}
