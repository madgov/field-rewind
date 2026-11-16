import type { Metadata } from "next";
import { Suspense } from "react";
import ConditionsContent, { ConditionsLoading } from "@/components/conditions/ConditionsContent";
import "@/components/shift/shift.css";
import "@/components/replay/replay.css";
import "@/components/howweknow/howweknow.css";
import "@/components/conditions/conditions.css";

export const metadata: Metadata = {
  title: "Field conditions | Field Rewind",
  description: "Frost, soil wetness, satellite vegetation, soil and terrain, and ground checks for your spot, each with its source and its limits.",
};

export const maxDuration = 60;

export default function ConditionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<ConditionsLoading />}>
      <ConditionsContent searchParams={searchParams} />
    </Suspense>
  );
}
