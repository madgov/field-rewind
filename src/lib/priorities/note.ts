/** Standing statement shown with every comparison. Plain English; not generated from numbers because it makes no numeric claim. */
export const LOCAL_EXPERTISE_NOTE = {
  title: "This comparison supports a conversation with an advisor; it does not replace one",
  text:
    "This tool compares rotations using historical weather and published crop values. It supports, and does not replace, an agronomist or local extension advisor. It cannot see your fields, your soil or your market, so the final choice needs local judgment.",
  judgmentAreas: [
    "Soil tests: texture, salinity, organic matter, drainage and nutrient levels in your own fields",
    "Local pests and diseases: which ones are present, and which crops host them",
    "Equipment: whether you have, or can hire, what each crop needs",
    "Labour: timing and peak workloads for each crop",
    "Markets: prices, contracts and buyers (this tool has no price data connected)",
    "Water rights and delivery: your actual allocation, its timing, and the cost and efficiency of delivering it",
  ],
} as const;
