import type { MarketData } from "./types";

/**
 * Market data is NOT connected. USDA NASS QuickStats requires a free API key (register at the URL below); USDA AMS Market News
 * also needs its own credentials for its API. No such key exists in this project, so there are no prices, margins or incomes
 * anywhere in the app, and the "supplemental income" priority is shown but excluded from ranking.
 */
export const marketData: MarketData = {
  status: "not-connected",
  reason:
    "Price and income data (USDA NASS QuickStats, USDA AMS Market News) need API keys that have not been set up for this app, so no price, margin or income figure is shown.",
  registerUrl: "https://quickstats.nass.usda.gov/api",
};
