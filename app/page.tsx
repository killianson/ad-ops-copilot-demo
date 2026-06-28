"use client";

import { useEffect, useRef, useState, Fragment } from "react";
import { campaigns, type Network } from "@/lib/data";
import {
  computeRows,
  computeAggregates,
  groupByNetwork,
  redeploy,
  type Row,
  type Action,
} from "@/lib/metrics";
import { MetaLogo, GoogleAdsLogo, TikTokLogo } from "./logos";

const fmtMoney = (n: number) => "€" + Math.round(n).toLocaleString("fr-FR");
const fmtInt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const fmtRoas = (n: number) => n.toFixed(2);
const fmtDelta = (n: number) => "(" + (n >= 0 ? "+" : "") + n.toFixed(0) + "%)";

const NET: Record<Network, { label: string; Logo: ({ size }: { size?: number }) => JSX.Element }> = {
  Meta: { label: "Meta Ads", Logo: MetaLogo },
  Google: { label: "Google Ads", Logo: GoogleAdsLogo },
  TikTok: { label: "TikTok Ads", Logo: TikTokLogo },
};

const STATUS: Record<Action, { icon: string; cls: string }> = {
  scale: { icon: "▶", cls: "st-scale" },
  watch: { icon: "◔", cls: "st-watch" },
  cut: { icon: "⏸", cls: "st-cut" },
};

const STEPS = [
  "Récupération des performances du jour…",
  "Calcul des KPI (results, cost/result, budget libéré)…",
  "Synthèse et recommandation de réallocation…",
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Page() {
  const rows = computeRows(campaigns);
  const agg = computeAggregates(rows);
  const groups = groupByNetwork(rows);
  const reallocs = redeploy(agg);

  const [query, setQuery] = useState("");
  const [userMsg, setUserMsg] = useState("");
  const [running, setRunning] = useState(false);
  const [doneSteps, setDoneSteps] = useState(0);
  const [showFigures, setShowFigures] = useState(false);
  const [full, setFull] = useState("");
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<"none" | "no_key" | "api_error">("none");
  const [done, setDone] = useState(false);
  const runId = useRef(0);

  async function run(prompt: string) {
    const id = ++runId.current;
    setRunning(true);
    setUserMsg(prompt);
    setDoneSteps(0);
    setShowFigures(false);
    setFull("");
    setTyped("");
    setErr("none");
    setDone(false);

    await wait(450);
    if (id !== runId.current) return;
    setDoneSteps(1);
    await wait(650);
    if (id !== runId.current) return;
    setDoneSteps(2);
    await wait(550);
    if (id !== runId.current) return;
    setShowFigures(true);
    await wait(350);
    if (id !== runId.current) return;
    setDoneSteps(3);

    try {
      const res = await fetch("/api/analyze", { method: "POST" });
      const json = await res.json();
      if (id !== runId.current) return;
      if (json.error === "no_key") {
        setErr("no_key");
        setDone(true);
        setRunning(false);
        return;
      }
      if (json.error || !json.narration) {
        setErr(json.error ? "api_error" : "none");
        setDone(true);
        setRunning(false);
        return;
      }
      setFull(json.narration);
    } catch {
      if (id !== runId.current) return;
      setErr("api_error");
      setDone(true);
      setRunning(false);
    }
  }

  // effet machine à écrire
  useEffect(() => {
    if (!full) return;
    let i = 0;
    const id = setInterval(() => {
      i += 3;
      setTyped(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(id);
        setDone(true);
        setRunning(false);
      }
    }, 12);
    return () => clearInterval(id);
  }, [full]);

  function submit() {
    const q = query.trim();
    if (!q || running) return;
    run(q);
  }

  return (
    <div className="app">
      {/* ---------------- Copilot ---------------- */}
      <aside className="copilot">
        <div className="cp-head">
          <div className="org">
            <span className="org-badge">A.</span> Acme Corp
          </div>
        </div>
        <div className="cp-title">Daily check — réallocation budget</div>

        <div className="cp-thread">
          {!userMsg && (
            <div className="empty-hint">Pose une question pour lancer le daily check.</div>
          )}

          {userMsg && <div className="bubble user">{userMsg}</div>}

          {STEPS.map(
            (s, i) =>
              i < doneSteps && (
                <div className="step" key={i}>
                  <span className="step-ic">✓</span>
                  {s}
                </div>
              ),
          )}

          {showFigures && (
            <div className="figures">
              <div className="fg-head">🧮 Chiffres clés — calculés, pas générés</div>
              <Fig k="Dépense totale" v={fmtMoney(agg.totalSpend)} />
              <Fig k="Results value (CA)" v={fmtMoney(agg.totalRevenue)} />
              <Fig k="ROAS blended" v={fmtRoas(agg.blended)} />
              <Fig k="Budget libéré (pauses)" v={fmtMoney(agg.freedBudget)} />
              <Fig k="ROAS projeté" v={fmtRoas(agg.projectedBlended)} good />
            </div>
          )}

          {typed && (
            <div className="bubble assistant reco">
              {renderReco(typed)}
              {!done && <span className="cursor">▋</span>}
            </div>
          )}

          {err === "no_key" && (
            <div className="bubble assistant err">
              ⚠ Clé API manquante (<code>ANTHROPIC_API_KEY</code>). Le tableau et les chiffres
              ci-contre restent exacts — ils sont calculés, pas générés. Ajoute la clé dans les
              variables d&apos;environnement Vercel pour activer la rédaction IA de la reco.
            </div>
          )}
          {err === "api_error" && (
            <div className="bubble assistant err">
              ⚠ La rédaction IA a échoué (clé invalide ou crédits épuisés ?). Les chiffres restent
              exacts.
            </div>
          )}

          {done && err === "none" && full && (
            <div className="actions">
              {agg.cut.map((c) => (
                <div className="action-row" key={c.name}>
                  <span className="tag cut">PAUSE</span>
                  <span className="nm">{c.name}</span>
                  <span className="chk">✓</span>
                </div>
              ))}
              {reallocs.map((r) => (
                <div className="action-row" key={r.name}>
                  <span className="tag up">+{fmtMoney(r.amount)}/j</span>
                  <span className="nm">{r.name}</span>
                  <span className="chk">✓</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cp-input">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Analyze, plan, deliver anything"
            disabled={running}
          />
          <button className="send" onClick={submit} disabled={running} title="Envoyer">
            ↑
          </button>
        </div>
      </aside>

      {/* ---------------- Board ---------------- */}
      <main className="board">
        <div className="board-head">Campaigns</div>

        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th className="num">Spend</th>
                <th className="num">Results</th>
                <th className="num">Results Value</th>
                <th className="num">Cost / Result</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const Logo = NET[g.network].Logo;
                return (
                  <Fragment key={g.network}>
                    <tr className="net">
                      <td>
                        <span className="net-name">
                          <span className="net-ic">
                            <Logo size={16} />
                          </span>
                          {NET[g.network].label}
                        </span>
                      </td>
                      <td></td>
                      <td className="num">{fmtMoney(g.spend)}</td>
                      <td className="num">{fmtInt(g.conversions)}</td>
                      <td className="num">{fmtMoney(g.revenue)}</td>
                      <td className="num">{fmtMoney(g.costPerResult)}</td>
                    </tr>
                    {g.rows.map((r) => (
                      <CampRow row={r} key={r.name} />
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="total-label">Total — {rows.length} campagnes</td>
                <td></td>
                <td className="num">{fmtMoney(agg.totalSpend)}</td>
                <td className="num">{fmtInt(agg.totalConversions)}</td>
                <td className="num">{fmtMoney(agg.totalRevenue)}</td>
                <td className="num">{fmtMoney(agg.costPerResult)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </main>
    </div>
  );
}

function Fig({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div className="fg-row">
      <span className="k">{k}</span>
      <span className={"v" + (good ? " good" : "")}>{v}</span>
    </div>
  );
}

function CampRow({ row }: { row: Row }) {
  return (
    <tr className={"camp " + row.action}>
      <td>
        <span className="nm">{row.name}</span>
      </td>
      <td>
        <span className={"status " + STATUS[row.action].cls}>{STATUS[row.action].icon}</span>
      </td>
      <td className="num">
        <span className="cell-main">{fmtMoney(row.spend)}</span>{" "}
        <span className={"delta " + (row.spendDelta >= 0 ? "up" : "down")}>
          {fmtDelta(row.spendDelta)}
        </span>
      </td>
      <td className="num">
        <span className="cell-main">{fmtInt(row.conversions)}</span>{" "}
        <span className={"delta " + (row.resultsDelta >= 0 ? "up" : "down")}>
          {fmtDelta(row.resultsDelta)}
        </span>
        <div className="sub-cell">purchases</div>
      </td>
      <td className="num">
        <span className="cell-main">{fmtMoney(row.revenue)}</span>{" "}
        <span className={"delta " + (row.valueDelta >= 0 ? "up" : "down")}>
          {fmtDelta(row.valueDelta)}
        </span>
      </td>
      <td className="num">
        <span className="cell-main">{fmtMoney(row.costPerResult)}</span>{" "}
        <span className={"delta " + (row.costDelta <= 0 ? "up" : "down")}>
          {fmtDelta(row.costDelta)}
        </span>
        <div className="sub-cell">per purchase</div>
      </td>
    </tr>
  );
}

// Convertit le markdown léger (**gras**, retours ligne) de la reco en JSX.
function renderReco(text: string) {
  return text.split("\n").map((line, i) => (
    <div className="reco-line" key={i}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={j}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={j}>{part}</span>
        ),
      )}
    </div>
  ));
}
