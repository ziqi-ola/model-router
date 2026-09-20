"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  EFFORTS, parseModels, parseWeights, selectModel, WEIGHT_QUESTION_IDS,
  type Effort, type ModelSpec, type TaskAnswers, type WeightAnswers, type Weights,
} from "../lib/router";

const DEFAULT_QUERY = "Review this pull request and identify concurrency bugs. Use available tools to inspect the code.";
type RouteResult = { choices: TaskAnswers; weightJudgments: WeightAnswers; suggestedWeights: Weights };
type RegistryResponse = { models: ModelSpec[]; error?: string };
type Metric = keyof Weights;
type MeasuredMetric = "intelligenceIndex" | "costPerTaskUsd" | "tokensPerSecond";
const METRICS: { key: Metric; label: string; note: string }[] = [
  { key: "intelligence", label: "Intelligence", note: "Favor higher index" },
  { key: "speed", label: "Speed", note: "Favor more tokens per second" },
  { key: "price", label: "Price", note: "Favor lower cost per task" },
];
const label = (value: string) => value.replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
const modelKey = (model: Pick<ModelSpec, "id" | "effort">) => `${model.id}/${model.effort}`;

export default function Home() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [catalog, setCatalog] = useState<ModelSpec[]>([]);
  const [models, setModels] = useState<ModelSpec[]>([]);
  const [weights, setWeights] = useState<Weights | null>(null);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProvider, setNewProvider] = useState("");
  const [newEffort, setNewEffort] = useState<Effort>("default");
  const [newIndex, setNewIndex] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newSpeed, setNewSpeed] = useState("");

  useEffect(() => {
    async function loadRegistry() {
      try {
        const response = await fetch("/api/route", { cache: "no-store" });
        const data = await response.json() as RegistryResponse;
        if (!response.ok) throw new Error(data.error ?? "Could not load leaderboard.csv.");
        const sourceModels = parseModels(data.models);
        if (!sourceModels) throw new Error("Leaderboard contains invalid model rows.");
        setCatalog(sourceModels);
        setModels(sourceModels);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Could not load the model registry.");
      }
    }
    void loadRegistry();
  }, []);

  const totalWeight = weights ? weights.intelligence + weights.speed + weights.price : 0;
  const registryValid = parseModels(models) !== null;
  const recommendation = result && weights && totalWeight > 0 && registryValid
    ? selectModel(result.choices, models, weights) : null;
  const selected = models.find((model) =>
    model.id === recommendation?.selectedModel && model.effort === recommendation?.selectedEffort);

  async function routeQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() || loading || !registryValid) return;
    setLoading(true);
    setError("");
    setResult(null);
    setWeights(null);
    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), models }),
      });
      const data = await response.json() as RouteResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The routing request failed.");
      const suggested = parseWeights(data.suggestedWeights);
      if (!suggested) throw new Error("Jev returned invalid weight suggestions.");
      setWeights(suggested);
      setResult(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The routing request failed.");
    } finally {
      setLoading(false);
    }
  }

  function addModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    const provider = newProvider.trim();
    const existing = models.find((model) => model.name.toLowerCase() === name.toLowerCase());
    const id = existing?.id ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63);
    const newModel: ModelSpec = {
      id, name, provider, effort: newEffort,
      intelligenceIndex: Number(newIndex),
      costPerTaskUsd: newCost.trim() === "" ? null : Number(newCost),
      tokensPerSecond: Number(newSpeed),
    };
    if (!id || models.length >= 100 || !parseModels([newModel]) ||
        models.some((model) => modelKey(model) === modelKey(newModel))) {
      setError("Enter valid model metrics and a unique model and effort pair.");
      return;
    }
    setModels((current) => [...current, newModel]);
    setError("");
    setNewName("");
    setNewProvider("");
    setNewEffort("default");
    setNewIndex("");
    setNewCost("");
    setNewSpeed("");
  }

  function updateModel(key: string, metric: MeasuredMetric, raw: string) {
    const value = metric === "costPerTaskUsd" && raw === "" ? null : Number(raw);
    setModels((current) => current.map((model) =>
      modelKey(model) === key ? { ...model, [metric]: value } : model));
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span> Model Router</div>
        <span className="top-pill">Jev routing lab</span>
      </header>

      <section className="hero">
        <span className="eyebrow">MODEL + EFFORT</span>
        <h1>Find the right fit<br /><em>for every query.</em></h1>
        <p>Jev reads the task, suggests priorities, and ranks measured model and effort pairs. You can adjust its weights afterward.</p>
      </section>

      <div className="main-grid">
        <div className="main-column">
          <form className="panel query-panel" onSubmit={routeQuery}>
            <div className="panel-title"><span>01</span><h2>Query</h2></div>
            <label htmlFor="query">What should the model do?</label>
            <textarea id="query" value={query} onChange={(event) => {
              setQuery(event.target.value);
              setResult(null);
              setWeights(null);
            }}
              placeholder="Enter a task to route..." maxLength={16000} rows={5} />
            <div className="query-footer">
              <small>Recommendations only · no model execution</small>
              <button className="primary-button" disabled={loading || !query.trim() || !registryValid}>
                {loading ? "Asking Jev…" : "Route query ↗"}
              </button>
            </div>
          </form>

          <section className="panel weights-panel">
            <div className="panel-title"><span>02</span><h2>What matters most?</h2></div>
            <p className="section-copy">
              {result ? "Jev set these weights for this query. Drag to compare other outcomes instantly." :
                "Route a query to let Jev suggest the weights."}
            </p>
            {METRICS.map(({ key, label: metricLabel, note }) => (
              <label className="weight-row" key={key}>
                <span><strong>{metricLabel}</strong><small>{note}</small></span>
                <span className="slider-wrap">
                  <input type="range" min="0" max="10" step="1" value={weights?.[key] ?? 0}
                    disabled={!weights}
                    onChange={(event) => setWeights((current) =>
                      current ? { ...current, [key]: Number(event.target.value) } : current)} />
                  {result && <i className="suggested-marker"
                    title={`Jev suggested ${result.suggestedWeights[key]}/10`}
                    style={{ left: `calc(8px + (100% - 16px) * ${result.suggestedWeights[key] / 10})` }} />}
                </span>
                <output>{weights?.[key] ?? "—"}</output>
                {result && <small className="weight-suggestion">
                  Jev suggested {result.suggestedWeights[key]} · {Math.round(result.weightJudgments[WEIGHT_QUESTION_IDS[key]].confidence * 100)}% clarity
                </small>}
              </label>
            ))}
            {result && weights && METRICS.some(({ key }) => weights[key] !== result.suggestedWeights[key]) &&
              <button type="button" className="text-button" onClick={() => setWeights(result.suggestedWeights)}>
                Use Jev suggestions
              </button>}
            {weights && totalWeight === 0 && <p className="inline-error">Raise at least one weight above zero.</p>}
          </section>
        </div>

        <section className="panel registry-panel">
          <div className="panel-title"><span>03</span><h2>Measured options</h2></div>
          <p className="section-copy">Loaded from leaderboard.csv. Edits here last for this page session; update the file to keep them. Blank cost means unknown.</p>
          <div className="registry-head"><span>Model</span><span>Effort</span><span title="Intelligence index">Index</span><span title="Cost per task USD">$/task</span><span title="Median tokens per second">tok/s</span><span /></div>
          <div className="registry-list">
            {models.map((model) => (
              <div className="registry-row" key={modelKey(model)}>
                <div className="model-name"><strong>{model.name}</strong><small>{model.provider}</small></div>
                <span className="effort-tag">{label(model.effort)}</span>
                {([
                  ["intelligenceIndex", model.intelligenceIndex],
                  ["costPerTaskUsd", model.costPerTaskUsd ?? ""],
                  ["tokensPerSecond", model.tokensPerSecond],
                ] as const).map(([metric, value]) => (
                  <input key={metric} type="number" aria-label={`${model.name} ${model.effort} ${metric}`}
                    min={metric === "tokensPerSecond" ? "1" : "0"}
                    max={metric === "intelligenceIndex" ? "100" : metric === "costPerTaskUsd" ? "1000" : "10000"}
                    step={metric === "costPerTaskUsd" ? "0.01" : "1"} value={value}
                    onChange={(event) => updateModel(modelKey(model), metric, event.target.value)} />
                ))}
                <button type="button" className="remove-button" title={`Remove ${model.name} ${model.effort}`}
                  aria-label={`Remove ${model.name} ${model.effort}`} disabled={models.length === 1}
                  onClick={() => setModels((current) => current.filter((entry) => modelKey(entry) !== modelKey(model)))}>×</button>
              </div>
            ))}
          </div>
          <form className="add-model" onSubmit={addModel}>
            <input aria-label="New model name" placeholder="Model name" maxLength={80} value={newName}
              onChange={(event) => setNewName(event.target.value)} required />
            <input aria-label="New model provider" placeholder="Provider" maxLength={40} value={newProvider}
              onChange={(event) => setNewProvider(event.target.value)} required />
            <select aria-label="New model effort" value={newEffort}
              onChange={(event) => setNewEffort(event.target.value as Effort)}>
              {EFFORTS.map((effort) => <option key={effort} value={effort}>{label(effort)}</option>)}
            </select>
            <input type="number" aria-label="New intelligence index" placeholder="Index" min="0" max="100"
              value={newIndex} onChange={(event) => setNewIndex(event.target.value)} required />
            <input type="number" aria-label="New cost per task USD" placeholder="$/task" min="0" max="1000" step="0.01"
              value={newCost} onChange={(event) => setNewCost(event.target.value)} />
            <input type="number" aria-label="New tokens per second" placeholder="tok/s" min="1" max="10000"
              value={newSpeed} onChange={(event) => setNewSpeed(event.target.value)} required />
            <button type="submit" disabled={models.length >= 100}>Add</button>
          </form>
          <button type="button" className="text-button" onClick={() => setModels(catalog)} disabled={!catalog.length}>Reset to CSV</button>
          {!registryValid && <p className="inline-error">Check the registry values before routing.</p>}
        </section>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {recommendation && selected && (
        <section className="results" aria-live="polite">
          <div className="results-title"><span className="eyebrow">RECOMMENDATION</span><h2>{selected.name} <span>· {label(selected.effort)} effort</span></h2></div>
          <div className="result-grid">
            <div className="panel winner-panel">
              <span className="mini-label">WHY THIS PAIR</span>
              <p>{recommendation.reason}</p>
              <div className="winner-stats">
                <div><strong>{selected.intelligenceIndex}</strong><small>Intelligence index</small></div>
                <div><strong>{selected.costPerTaskUsd === null ? "Unknown" : `$${selected.costPerTaskUsd.toFixed(2)}`}</strong><small>Cost per task</small></div>
                <div><strong>{selected.tokensPerSecond}</strong><small>Tokens per second</small></div>
              </div>
              <small className="fine-print">Policy score {recommendation.score}/100 · Jev judgment clarity {Math.round(recommendation.confidence * 100)}% · Estimated index target {recommendation.requiredIntelligenceIndex}. Unknown cost receives the lowest price score.</small>
            </div>
            <div className="panel shortlist-panel">
              <span className="mini-label">NEXT OPTIONS</span>
              {recommendation.alternatives.map((alternative) => (
                <div className="shortlist-row" key={`${alternative.model}/${alternative.effort}`}>
                  <span>{models.find((model) => model.id === alternative.model)?.name ?? alternative.model}<small>{label(alternative.effort)} effort</small></span>
                  <strong>{alternative.score}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="panel evidence-panel">
            <div className="panel-title"><span>04</span><h2>Jev judgments</h2></div>
            <div className="evidence-grid">
              {Object.entries(result?.choices ?? {}).map(([key, answer]) => (
                <div className="evidence-item" key={key}>
                  <span>{label(key)}</span><strong>{label(answer.choice)}</strong>
                  <small>{Math.round(answer.confidence * 100)}% clarity</small>
                  <div className="distribution">
                    {Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1]).map(([option, probability]) => (
                      <div key={option}><span>{label(option)}</span><div><i style={{ width: `${probability * 100}%` }} /></div><span>{Math.round(probability * 100)}%</span></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <footer>Model Router POC · Jev provides task judgments; the local policy scores measured candidates.</footer>
    </main>
  );
}
