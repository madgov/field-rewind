import traitsJson from "../../../data/rotation-traits/traits.json";
import { TRAIT_KEYS, type CropTraits, type TraitField, type TraitKey, type TraitsFile } from "./types";

const FILE = traitsJson as unknown as TraitsFile;

/** The whole traits file (sourced traits for the catalog crops plus the candidate and cover crops). Pure; no network. */
export function loadTraits(): TraitsFile {
  return FILE;
}

/** Traits for one crop id, or undefined when the crop has no traits record at all. */
export function traitFor(cropId: string): CropTraits | undefined {
  return FILE.crops.find((c) => c.id === cropId);
}

export function allTraitCropIds(): string[] {
  return FILE.crops.map((c) => c.id);
}

/** Check a traits file against the schema rules. Returns plain-English problems; empty means valid. */
export function validateTraits(file: TraitsFile = FILE): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const c of file.crops) {
    if (ids.has(c.id)) problems.push(`${c.id}: duplicate crop id`);
    ids.add(c.id);
    for (const key of TRAIT_KEYS) {
      const f = c.traits[key] as TraitField<unknown> | undefined;
      const where = `${c.id}.${key}`;
      if (!f) {
        problems.push(`${where}: missing field`);
        continue;
      }
      if (f.status === "sourced") {
        if (f.value === null || f.value === undefined) problems.push(`${where}: sourced but value is null`);
        if (!f.source) problems.push(`${where}: sourced but no source`);
        else {
          if (!/^https?:\/\//.test(f.source.url ?? "")) problems.push(`${where}: source has no url`);
          if (!f.source.title?.trim()) problems.push(`${where}: source has no title`);
          if (!f.source.page_or_table?.trim()) problems.push(`${where}: source has no page_or_table`);
        }
      } else if (f.status === "unknown") {
        if (f.value !== null) problems.push(`${where}: unknown but value is not null`);
        if (!f.note?.trim()) problems.push(`${where}: unknown without a note saying what was searched`);
      } else {
        problems.push(`${where}: status must be "sourced" or "unknown"`);
      }
    }
  }
  return problems;
}

/** Keys of a crop's traits that have no sourced value. */
export function unknownTraitKeys(c: CropTraits): TraitKey[] {
  return TRAIT_KEYS.filter((k) => c.traits[k].status !== "sourced");
}

/** Text shown in place of an unknown trait. */
export const NO_SOURCED_VALUE = "no sourced value";
