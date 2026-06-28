import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { campaigns } from "@/lib/data";
import {
  computeRows,
  computeAggregates,
  redeploy,
  buildAgentPrompt,
  SYSTEM,
} from "@/lib/metrics";

export const runtime = "nodejs";
export const maxDuration = 30;

// L'agent renvoie sa reco via un tool call structuré : narration + actions.
// Les MONTANTS ne sont jamais demandés à l'IA — le moteur les impose côté serveur.
const tool: Anthropic.Tool = {
  name: "submit_recommendation",
  description:
    "Renvoie la reco finale : message Slack + actions à proposer à l'operator dans l'UI.",
  input_schema: {
    type: "object",
    properties: {
      narration: {
        type: "string",
        description: "Message Slack court (français, markdown léger **gras**).",
      },
      actions: {
        type: "array",
        description: "Actions recommandées, choisies parmi les candidats fournis.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nom EXACT de la campagne." },
            type: { type: "string", enum: ["pause", "boost"] },
          },
          required: ["name", "type"],
        },
      },
    },
    required: ["narration", "actions"],
  },
};

type AiAction = { name: string; type: "pause" | "boost" };

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "no_key" }, { status: 200 });
  }

  const rows = computeRows(campaigns);
  const agg = computeAggregates(rows);
  const boostMap = Object.fromEntries(redeploy(agg).map((r) => [r.name, r.amount]));
  const pauseSet = new Set(agg.cut.map((c) => c.name));

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1200,
      system: SYSTEM,
      tools: [tool],
      tool_choice: { type: "tool", name: "submit_recommendation" },
      messages: [{ role: "user", content: buildAgentPrompt(rows, agg) }],
    });

    const toolUse = msg.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const input = (toolUse?.input ?? {}) as {
      narration?: string;
      actions?: AiAction[];
    };
    const narration = input.narration ?? "";

    // Réconciliation : on ne garde que des actions valides (noms réels) et on
    // FORCE les montants depuis le moteur → l'IA choisit, le moteur chiffre.
    const actions = (input.actions ?? [])
      .filter(
        (a) =>
          a &&
          typeof a.name === "string" &&
          (a.type === "pause" ? pauseSet.has(a.name) : boostMap[a.name] != null),
      )
      .map((a) =>
        a.type === "pause"
          ? { name: a.name, type: "pause" as const }
          : { name: a.name, type: "boost" as const, amount: boostMap[a.name] },
      );

    return NextResponse.json({ narration, actions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ error: "api_error", message }, { status: 200 });
  }
}
