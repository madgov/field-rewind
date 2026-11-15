"use client";

import { createContext, useContext } from "react";

/** The rotations on the replay screen right now (names and crop ids). Provided by ReplayApp so server-rendered panel parts can follow edits. */
export type ReplayRotationsValue = { name: string; sequence: string[]; cropNames: string[] }[];

const Ctx = createContext<ReplayRotationsValue | null>(null);
export const ReplayRotationsProvider = Ctx.Provider;
export const useReplayRotations = () => useContext(Ctx);
