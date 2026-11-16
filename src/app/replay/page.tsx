import type { Metadata } from "next";
import { Suspense } from "react";
import ReplayContent, { ReplayLoading } from "@/components/replay/ReplayContent";
import "@/components/shift/shift.css";
import "@/components/conditions/conditions.css";
import "@/components/replay/replay.css";

export const metadata: Metadata = {
  title: "40-season replay | Field Rewind",
  description: "Compare modelled crop water needs with your selected supply over 1986 to 2025, using NASA POWER regional climate data. A water comparison, not a prediction of survival or yield.",
};

export const maxDuration = 60;

export default function ReplayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<ReplayLoading />}>
      <ReplayContent searchParams={searchParams} />
    </Suspense>
  );
}
