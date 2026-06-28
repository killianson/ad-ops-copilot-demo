import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { campaigns } from "@/lib/data";
import { computeRows, computeAggregates, buildNarrationPrompt, SYSTEM } from "@/lib/metrics";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "no_key" }, { status: 200 });
  }

  const rows = computeRows(campaigns);
  const agg = computeAggregates(rows);

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: "user", content: buildNarrationPrompt(rows, agg) }],
    });
    const narration = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return NextResponse.json({ narration });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ error: "api_error", message }, { status: 200 });
  }
}
