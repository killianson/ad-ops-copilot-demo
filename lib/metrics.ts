// Toute l'arithmétique vit ici — par campagne ET agrégats. Déterministe.
// Le LLM (côté serveur) ne fait QUE la narration : il reçoit ces chiffres et
// rédige la reco, sans en inventer aucun.

import type { Campaign, Network } from "./data";

export type Action = "scale" | "watch" | "cut";

export type Row = Campaign & {
  roas: number;
  cpa: number;
  ctr: number;
  spendDelta: number;
  revenueDelta: number;
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

export function computeRows(cs: Campaign[]): Row[] {
  return cs
    .map((c) => {
      const roas = c.spend ? c.revenue / c.spend : 0;
      return {
        ...c,
        roas,
        cpa: c.conversions ? c.spend / c.conversions : 0,
        ctr: c.impressions ? c.clicks / c.impressions : 0,
        spendDelta: c.prevSpend ? ((c.spend - c.prevSpend) / c.prevSpend) * 100 : 0,
        revenueDelta: c.prevRevenue ? ((c.revenue - c.prevRevenue) / c.prevRevenue) * 100 : 0,
        action: classify(roas),
      };
    })
    .sort((a, b) => b.roas - a.roas);
}

export type Aggregates = {
  totalSpend: number;
  totalRevenue: number;
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
  const cut = rows.filter((r) => r.action === "cut");
  const scale = rows.filter((r) => r.action === "scale");
  const watch = rows.filter((r) => r.action === "watch");
  const freedBudget = sum(cut, (r) => r.spend);
  const keptSpend = totalSpend - freedBudget;
  const keptRevenue = totalRevenue - sum(cut, (r) => r.revenue);
  return {
    totalSpend,
    totalRevenue,
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
  roas: number;
};

export function groupByNetwork(rows: Row[]): NetworkGroup[] {
  const order: Network[] = ["Meta", "Google", "TikTok"];
  return order
    .map((network) => {
      const gr = rows.filter((r) => r.network === network);
      const spend = sum(gr, (r) => r.spend);
      const revenue = sum(gr, (r) => r.revenue);
      return { network, rows: gr, spend, revenue, roas: spend ? revenue / spend : 0 };
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
        `- ${r.name} (${r.network}) : ROAS ${r.roas.toFixed(2)}, CPA ${Math.round(r.cpa)}€, ` +
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
    `- CA total : ${Math.round(agg.totalRevenue)}€\n` +
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
  "tu raisonnes en ROAS, CPA, media mix et pacing, tu es concis, chiffré et orienté action.";
