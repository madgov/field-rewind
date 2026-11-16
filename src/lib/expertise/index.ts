import notesJson from "../../../data/expertise/notes.json";

export type ExpertiseNote = {
  id: string;
  pins: string[];
  /** Crops the note is about; empty means it applies to any crop. */
  cropIds: string[];
  topic: string;
  /** Word-for-word text from the source. */
  quote: string;
  by: string;
  source: string;
  url: string;
  readOn: string;
  limits: string;
};
export type ExpertiseGap = { pin: string; text: string };
export type ExpertiseFile = { compiledOn: string; note: string; notes: ExpertiseNote[]; gaps: ExpertiseGap[] };

export const EXPERTISE: ExpertiseFile = notesJson as ExpertiseFile;

export const EXPERTISE_LABEL =
  "Quotations from published extension and university sources, read on the date shown. They are not advice written by this app.";

/**
 * Notes for a pin. When `cropIds` is given, notes tied to specific crops are kept only if one of those crops is in play;
 * notes with no crop list always apply. `gaps` says what could not be read for the pin, and is never empty-filled.
 */
export function expertiseFor(pinId: string | null, cropIds?: string[]): { notes: ExpertiseNote[]; gaps: ExpertiseGap[] } {
  if (!pinId) return { notes: [], gaps: [{ pin: "", text: "Local notes exist only for the three demo pins. None is shown for this location." }] };
  const notes = EXPERTISE.notes.filter(
    (n) => n.pins.includes(pinId) && (n.cropIds.length === 0 || !cropIds || n.cropIds.some((c) => cropIds.includes(c))),
  );
  return { notes, gaps: EXPERTISE.gaps.filter((g) => g.pin === pinId) };
}
