// Toute l'arithmétique vit ici — par campagne ET agrégats. Déterministe.
// Le LLM (côté serveur) ne fait QUE la narration : il reçoit ces chiffres et
// rédige la reco, sans en inventer aucun.
//
// Colonnes du tableau (mêmes que le dashboard Massive Dynamic) :
//   Name · Status · Spend · Results · Results Value · Cost / Result
// Le ROAS n'est pas une colonne affichée : il sert en interne à décider
// scale / watch / cut (couleur de ligne + icône de statut).

import type { Campaign, Network } from "./data";

export type Action = "scale" | "watch" | "cut";

export type Row = Campaign & {
  roas: number;
  costPerResult: number; // = CPA
  spendDelta: number;
  resultsDelta: number; // delta conversions
  valueDelta: number; // delta CA (results value)
  costDelta: number; // delta cost/result (baisse = bien)
  action: Action;
};

export const TARGET_ROAS = 2.5;
export const SCALE_ROAS = 3.0;
export const CUT_ROAS = 1.3;

export function classify(roas: number): Action {
  if (roas >= SCALE_ROAS) return "scale";
  if (roas < CUT_ROAS) return "cut";
  return "watch";
}

const pct = (now: number, prev: number) => (prev ? ((now - prev) / prev) * 100 : 0);

export function computeRows(cs: Campaign[]): Row[] {
  return cs
    .map((c) => {
      const roas = c.spend ? c.revenue / c.spend : 0;
      const costPerResult = c.conversions ? c.spend / c.conversions : 0;
      const prevCost = c.prevConversions ? c.prevSpend / c.prevConversions : 0;
      return {
        ...c,
        roas,
        costPerResult,
        spendDelta: pct(c.spend, c.prevSpend),
        resultsDelta: pct(c.conversions, c.prevConversions),
        valueDelta: pct(c.revenue, c.prevRevenue),
        costDelta: pct(costPerResult, prevCost),
        action: classify(roas),
      };
    })
    .sort((a, b) => b.roas - a.roas);
}

export type Aggregates = {
  totalSpend: number;
  totalRevenue: number;
  totalConversions: number;
  costPerResult: number;
  blended: number;
  freedBudget: number;
  projectedBlended: number;
  scale: Row[];
  cut: Row[];
  watch: Row[];
};

const sum = <T>(arr: T[], f: (x: T) => number) => arr.reduce((a, x) => a + f(x), 0);

export function computeAggregates(rows: Row[]): Aggregates {
  const totalSpend = sum(rows, (r) => r.spend);
  const totalRevenue = sum(rows, (r) => r.revenue);
  const totalConversions = sum(rows, (r) => r.conversions);
  const cut = rows.filter((r) => r.action === "cut");
  const scale = rows.filter((r) => r.action === "scale");
  const watch = rows.filter((r) => r.action === "watch");
  const freedBudget = sum(cut, (r) => r.spend);
  const keptSpend = totalSpend - freedBudget;
  const keptRevenue = totalRevenue - sum(cut, (r) => r.revenue);
  return {
    totalSpend,
    totalRevenue,
    totalConversions,
    costPerResult: totalConversions ? totalSpend / totalConversions : 0,
    blended: totalSpend ? totalRevenue / totalSpend : 0,
    freedBudget,
    projectedBlended: keptSpend ? keptRevenue / keptSpend : 0,
    scale,
    cut,
    watch,
  };
}

export type NetworkGroup = {
  network: Network;
  rows: Row[];
  spend: number;
  revenue: number;
  conversions: number;
  costPerResult: number;
};

export function groupByNetwork(rows: Row[]): NetworkGroup[] {
  const order: Network[] = ["Meta", "Google", "TikTok"];
  return order
    .map((network) => {
      const gr = rows.filter((r) => r.network === network);
      const spend = sum(gr, (r) => r.spend);
      const revenue = sum(gr, (r) => r.revenue);
      const conversions = sum(gr, (r) => r.conversions);
      return {
        network,
        rows: gr,
        spend,
        revenue,
        conversions,
        costPerResult: conversions ? spend / conversions : 0,
      };
    })
    .filter((g) => g.rows.length > 0);
}

// Redéploiement déterministe du budget libéré vers les campagnes "scale"
// éligibles (on exclut le search brand, qui ne se force pas), pondéré par ROAS.
// Les montants somment EXACTEMENT au budget libéré.
export type Reallocation = { name: string; amount: number };

export function redeploy(agg: Aggregates): Reallocation[] {
  const targets = agg.scale.filter((s) => !/brand/i.test(s.name));
  if (targets.length === 0 || agg.freedBudget <= 0) return [];
  const wSum = sum(targets, (t) => t.roas);
  const alloc = targets.map((t) => Math.round((agg.freedBudget * t.roas) / wSum));
  const diff = agg.freedBudget - alloc.reduce((a, b) => a + b, 0);
  alloc[alloc.length - 1] += diff; // corrige l'arrondi → somme exacte
  return targets.map((t, i) => ({ name: t.name, amount: alloc[i] }));
}

// Prompt envoyé à Claude : on lui DONNE tous les chiffres et on lui interdit
// d'en inventer. Il ne fait que rédiger.
export function buildNarrationPrompt(rows: Row[], agg: Aggregates): string {
  const table = rows
    .map(
      (r) =>
        `- ${r.name} (${r.network}) : ROAS ${r.roas.toFixed(2)}, cost/result ${Math.round(r.costPerResult)}€, ` +
        `dépense ${Math.round(r.spend)}€ → action déjà décidée : ${r.action}`,
    )
    .join("\n");
  const realloc = redeploy(agg)
    .map((r) => `  • +${r.amount}€/j sur ${r.name}`)
    .join("\n");
  return (
    `ROAS cible = ${TARGET_ROAS}.\n\n` +
    "CHIFFRES DÉJÀ CALCULÉS (utilise EXCLUSIVEMENT ceux-ci, n'invente aucun nombre) :\n" +
    `- Dépense totale : ${Math.round(agg.totalSpend)}€\n` +
    `- Results Value (CA) total : ${Math.round(agg.totalRevenue)}€\n` +
    `- ROAS blended : ${agg.blended.toFixed(2)}\n` +
    `- Budget libéré par les pauses : ${Math.round(agg.freedBudget)}€\n` +
    `- ROAS blended projeté après pauses : ${agg.projectedBlended.toFixed(2)}\n` +
    `- Réallocation déjà calculée du budget libéré :\n${realloc}\n\n` +
    `Campagnes :\n${table}\n\n` +
    "Rédige un message Slack court (français) pour l'équipe média :\n" +
    "1. Une ligne d'état du compte (vs ROAS cible).\n" +
    "2. Les gagnants à scaler et les sous-perfs à couper.\n" +
    "3. Reprends les réallocations chiffrées fournies ci-dessus.\n" +
    "4. L'impact projeté (utilise le ROAS projeté fourni).\n\n" +
    "Emojis sobres, **gras** pour les actions, pas de préambule. " +
    "Utilise UNIQUEMENT les chiffres ci-dessus. Réponds seulement avec le message Slack."
  );
}

export const SYSTEM =
  "Tu es un copilote ad-ops senior pour une équipe média qui orchestre des budgets " +
  "publicitaires à plusieurs millions sur Meta, Google et TikTok. Tu augmentes l'operator : " +
  "tu raisonnes en ROAS, cost/result, media mix et pacing, tu es concis, chiffré et orienté action.";
