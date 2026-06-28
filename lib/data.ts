// Données d'entrée — un export de campagnes multi-canal (les mêmes que le CSV
// de la démo console). Les valeurs prev* (période précédente) servent à calculer
// les deltas affichés entre parenthèses — de façon EXACTE, pas inventée.

export type Network = "Meta" | "Google" | "TikTok";

export type Campaign = {
  name: string;
  network: Network;
  dailyBudget: number;
  spend: number;
  prevSpend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  prevConversions: number;
  revenue: number;
  prevRevenue: number;
};

export const campaigns: Campaign[] = [
  { name: "Meta_Retargeting_DPA",        network: "Meta",   dailyBudget: 2000, spend: 1950, prevSpend: 1700, impressions: 180000,  clicks: 5400,  conversions: 150, prevConversions: 132, revenue: 11800, prevRevenue: 10200 },
  { name: "Meta_Prospecting_Advantage+", network: "Meta",   dailyBudget: 5000, spend: 4800, prevSpend: 4100, impressions: 520000,  clicks: 9100,  conversions: 182, prevConversions: 150, revenue: 15400, prevRevenue: 12800 },
  { name: "Meta_Prospecting_Broad",      network: "Meta",   dailyBudget: 2500, spend: 2460, prevSpend: 2500, impressions: 410000,  clicks: 6200,  conversions: 58,  prevConversions: 74,  revenue: 2050,  prevRevenue: 2700 },
  { name: "Google_Search_Brand",         network: "Google", dailyBudget: 1500, spend: 1480, prevSpend: 1450, impressions: 95000,   clicks: 7600,  conversions: 210, prevConversions: 196, revenue: 18900, prevRevenue: 17500 },
  { name: "Google_PMax",                 network: "Google", dailyBudget: 4000, spend: 3950, prevSpend: 3600, impressions: 610000,  clicks: 8200,  conversions: 142, prevConversions: 140, revenue: 9100,  prevRevenue: 9000 },
  { name: "Google_Search_Generic",       network: "Google", dailyBudget: 3000, spend: 2980, prevSpend: 2700, impressions: 140000,  clicks: 5100,  conversions: 88,  prevConversions: 95,  revenue: 5200,  prevRevenue: 5400 },
  { name: "TikTok_Spark_Ads",            network: "TikTok", dailyBudget: 2000, spend: 1980, prevSpend: 1500, impressions: 720000,  clicks: 8800,  conversions: 71,  prevConversions: 60,  revenue: 2600,  prevRevenue: 2300 },
  { name: "TikTok_Prospecting",          network: "TikTok", dailyBudget: 3500, spend: 3400, prevSpend: 2900, impressions: 1450000, clicks: 12300, conversions: 96,  prevConversions: 120, revenue: 3100,  prevRevenue: 3800 },
];
