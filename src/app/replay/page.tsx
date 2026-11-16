import type { Metadata } from "next";
import { Suspense } from "react";
import ReplayContent, { ReplayLoading } from "@/components/replay/ReplayContent";
import "@/components/shift/shift.css";
import "@/components/conditions/conditions.css";
import "@/components/replay/replay.css";

export const metadata: Metadata = {
  title: "40-season replay | Field Rewind",
  description: "Would your crop rotation have survived the last 40 seasons with your water supply? Replay 1986 to 2025 season by season, from NASA POWER regional climate data.",
};

export const maxDuration = 60;

export default function ReplayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<ReplayLoading />}>
      <ReplayContent searchParams={searchParams} />
    </Suspense>
  );
}
