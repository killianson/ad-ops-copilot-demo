"use client";

import { useEffect, useRef, useState, Fragment } from "react";
import { campaigns, type Network } from "@/lib/data";
import {
  computeRows,
  computeAggregates,
  groupByNetwork,
  redeploy,
  type Row,
} from "@/lib/metrics";
import { MetaLogo, GoogleAdsLogo, TikTokLogo, ArrowUpIcon } from "./logos";

const fmtMoney = (n: number) => "€" + Math.round(n).toLocaleString("fr-FR");
const fmtInt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const fmtRoas = (n: number) => n.toFixed(2);
const fmtDelta = (n: number) => "(" + (n >= 0 ? "+" : "") + n.toFixed(0) + "%)";

const NET: Record<Network, { label: string; Logo: ({ size }: { size?: number }) => JSX.Element }> = {
  Meta: { label: "Meta Ads", Logo: MetaLogo },
  Google: { label: "Google Ads", Logo: GoogleAdsLogo },
  TikTok: { label: "TikTok Ads", Logo: TikTokLogo },
};

const STEPS = [
  "Récupération des performances du jour…",
  "Calcul des KPI (results, cost/result, budget libéré)…",
  "Synthèse et recommandation de réallocation…",
];

const SUGGESTION =
  "Daily check : où réallouer le budget aujourd'hui pour remonter le blended ROAS ?";

// Action proposée par l'agent puis transcrite en bouton interactif.
type Proposed = { name: string; type: "pause" | "boost"; amount?: number };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Page() {
  const rows = computeRows(campaigns);
  const agg = computeAggregates(rows);
  const groups = groupByNetwork(rows);
  const reallocs = redeploy(agg);
  const reallocMap: Record<string, number> = Object.fromEntries(
    reallocs.map((r) => [r.name, r.amount]),
  );

  // Fallback déterministe si l'IA n'a pas répondu (pas de clé / erreur API).
  // Sinon, les actions affichées viennent du tool call de l'agent (state aiActions).
  const fallbackActions: Proposed[] = [
    ...agg.cut.map((c) => ({ name: c.name, type: "pause" as const })),
    ...reallocs.map((r) => ({ name: r.name, type: "boost" as const, amount: r.amount })),
  ];

  const [query, setQuery] = useState("");
  const [userMsg, setUserMsg] = useState("");
  const [running, setRunning] = useState(false);
  const [doneSteps, setDoneSteps] = useState(0);
  const [showFigures, setShowFigures] = useState(false);
  const [full, setFull] = useState("");
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<"none" | "no_key" | "api_error">("none");
  const [done, setDone] = useState(false);
  // Actions proposées par l'agent (tool call) — null tant que l'IA n'a pas répondu.
  const [aiActions, setAiActions] = useState<Proposed[] | null>(null);
  // Validation humaine : une action ne modifie le tableau que si elle est validée.
  const [validated, setValidated] = useState<Record<string, boolean>>({});
  const runId = useRef(0);

  // Largeur ajustable du chat (drag sur le séparateur).
  const [chatWidth, setChatWidth] = useState(360);
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const w = Math.min(640, Math.max(300, e.clientX - 14));
      setChatWidth(w);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = () => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  async function run(prompt: string) {
    const id = ++runId.current;
    setRunning(true);
    setUserMsg(prompt);
    setDoneSteps(0);
    setShowFigures(false);
    setAiActions(null);
    setValidated({});
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
      // Actions transcrites depuis le tool call de l'agent (montants déjà imposés
      // par le moteur côté serveur). Si absentes → on garde le fallback déterministe.
      setAiActions(Array.isArray(json.actions) && json.actions.length ? json.actions : null);
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

  // Actions affichées = celles de l'agent si dispo, sinon fallback déterministe.
  const shownActions = aiActions ?? fallbackActions;
  const toggle = (name: string) =>
    setValidated((v) => ({ ...v, [name]: !v[name] }));
  const validateAll = () =>
    setValidated(Object.fromEntries(shownActions.map((p) => [p.name, true])));
  const validatedCount = shownActions.filter((p) => validated[p.name]).length;

  return (
    <div
      className="app"
      style={{ gridTemplateColumns: `${chatWidth}px 16px 1fr` }}
    >
      {/* ---------------- Copilot ---------------- */}
      <aside className="copilot">
        <div className="cp-head">
          <div className="org">
            <span className="org-badge">A.</span> Ad-ops copilot demo
          </div>
        </div>
        <div className="cp-thread">
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
              <Fig k="blended ROAS" v={fmtRoas(agg.blended)} />
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
              restent exacts — ils sont calculés, pas générés. Ajoute la clé dans les variables
              d&apos;environnement Vercel pour activer la rédaction IA de la reco.
            </div>
          )}
          {err === "api_error" && (
            <div className="bubble assistant err">
              ⚠ La rédaction IA a échoué (clé invalide ou crédits épuisés ?). Les chiffres restent
              exacts.
            </div>
          )}

          {done && shownActions.length > 0 && (
            <div className="actions">
              <div className="actions-head">
                <span>
                  Actions proposées — {validatedCount}/{shownActions.length} validées
                </span>
                <button
                  className="validate-all"
                  onClick={validateAll}
                  disabled={validatedCount === shownActions.length}
                >
                  Tout valider
                </button>
              </div>
              {shownActions.map((p) => {
                const on = !!validated[p.name];
                return (
                  <div className={"action-row" + (on ? " on" : "")} key={p.name}>
                    <span className={"tag " + (p.type === "pause" ? "cut" : "up")}>
                      {p.type === "pause" ? "PAUSE" : "+" + fmtMoney(p.amount!) + "/j"}
                    </span>
                    <span className="nm">{p.name}</span>
                    <button className={"apply-btn" + (on ? " applied" : "")} onClick={() => toggle(p.name)}>
                      {on ? "✓ Appliqué" : "Appliquer"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!running && (
          <div
            className="suggestion"
            onClick={() => run(SUGGESTION)}
            title="Cliquer pour lancer"
          >
            <span className="sug-ic">💡</span>
            <span>{SUGGESTION}</span>
          </div>
        )}

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
            <ArrowUpIcon size={15} />
          </button>
        </div>
      </aside>

      {/* ---------------- Séparateur redimensionnable ---------------- */}
      <div
        className="resizer"
        onMouseDown={startDrag}
        title="Glisser pour ajuster la largeur du chat"
      >
        <span className="resizer-grip" />
      </div>

      {/* ---------------- Board ---------------- */}
      <main className="board">
        <div className="board-head">Campaigns</div>

        <div className="grid-wrap">
          <table className="grid">
            <colgroup>
              <col />
              <col className="c-status" />
              <col className="c-num" />
              <col className="c-num" />
              <col className="c-num" />
              <col className="c-num" />
            </colgroup>
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
                      <td className="num">
                        <span className="cell-main">{fmtMoney(g.spend)}</span>{" "}
                        <span className={"delta " + (g.spendDelta >= 0 ? "up" : "down")}>
                          {fmtDelta(g.spendDelta)}
                        </span>
                      </td>
                      <td className="num">
                        <span className="cell-main">{fmtInt(g.conversions)}</span>{" "}
                        <span className={"delta " + (g.resultsDelta >= 0 ? "up" : "down")}>
                          {fmtDelta(g.resultsDelta)}
                        </span>
                      </td>
                      <td className="num">
                        <span className="cell-main">{fmtMoney(g.revenue)}</span>{" "}
                        <span className={"delta " + (g.valueDelta >= 0 ? "up" : "down")}>
                          {fmtDelta(g.valueDelta)}
                        </span>
                      </td>
                      <td className="num">
                        <span className="cell-main">{fmtMoney(g.costPerResult)}</span>{" "}
                        <span className={"delta " + (g.costDelta <= 0 ? "up" : "down")}>
                          {fmtDelta(g.costDelta)}
                        </span>
                      </td>
                    </tr>
                    {g.rows.map((r) => (
                      <CampRow
                        row={r}
                        key={r.name}
                        Logo={NET[r.network].Logo}
                        paused={!!validated[r.name] && r.action === "cut"}
                        boost={validated[r.name] ? reallocMap[r.name] : undefined}
                      />
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

function CampRow({
  row,
  paused,
  boost,
  Logo,
}: {
  row: Row;
  paused: boolean;
  boost?: number;
  Logo: ({ size }: { size?: number }) => JSX.Element;
}) {
  return (
    <tr className={"camp" + (paused ? " is-paused" : "")}>
      <td>
        <span className="camp-name">
          <span className="camp-ic">
            <Logo size={14} />
          </span>
          <span className="nm">{row.name}</span>
          {paused && <span className="paused-chip">en pause</span>}
          {boost ? <span className="alloc-chip">+{fmtMoney(boost)}/j</span> : null}
        </span>
      </td>
      <td>
        {paused ? (
          <span className="status st-paused" title="En pause">⏸</span>
        ) : (
          <span className="status st-active" title="Active">▶</span>
        )}
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
