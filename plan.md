# Model Router POC

## Goal

Recommend the least expensive model that is expected to satisfy a query's
requirements for quality, latency, context length, tools, and modality.

The first version produces a recommendation only. It does not execute the
selected model or route subagents.

```text
Query -> Router classifier -> Query requirements -> Routing policy -> Suggested model
```

## Scope

### Included

- Accept a user query and optional request constraints.
- Classify the query into structured, model-independent requirements.
- Evaluate a versioned registry of available models.
- Return a suggested model, confidence, and concise reason.
- Record routing decisions for evaluation and later policy tuning.

### Deferred

- Sending the query to the suggested model.
- Retry, fallback, and escalation after model execution.
- Provider load balancing and rate-limit handling.
- Routing subagents by both role and model.
- Automatic online policy learning.

## Design principles

- Separate understanding the query from choosing a vendor or model.
- Treat the model registry as configuration, so models can be added or removed
  without changing the classifier prompt or training data.
- Apply hard constraints before optimization.
- Choose the lowest-cost eligible model, subject to an expected quality target.
- Return uncertainty explicitly; low-confidence decisions can later be sent to a
  default strong model or shown for user review.

## Inputs and outputs

### Request

```json
{
  "query": "Review this pull request and identify concurrency bugs.",
  "constraints": {
    "max_latency_ms": 5000,
    "min_quality": "high",
    "allow_tools": true
  }
}
```

All constraints are optional. The policy supplies defaults when they are not
provided.

### Router classification

```json
{
  "task_type": "code_review",
  "complexity": "high",
  "reasoning_required": "high",
  "coding_required": "high",
  "context_requirement": "medium",
  "tool_use_required": true,
  "latency_sensitivity": "medium",
  "quality_sensitivity": "high",
  "confidence": 0.86
}
```

The classifier must produce schema-valid JSON only. It must not name a
provider or model.

### Recommendation

```json
{
  "model": "claude-sonnet",
  "confidence": 0.86,
  "reason": "High-complexity code review needs strong reasoning and tool support.",
  "alternatives": ["gpt-5", "claude-opus"],
  "policy_version": "v1"
}
```

## Model registry

Maintain a small, hand-authored registry for the POC. Each entry should record:

| Field | Purpose |
| --- | --- |
| `id` | Stable logical model name used by the router |
| `provider` | Inference provider or gateway |
| `capabilities` | Coding, reasoning, tool, vision, and modality support |
| `context_window` | Maximum supported input context |
| `quality_tier` | Coarse expected quality level by workload |
| `latency_tier` | Coarse expected response latency |
| `cost_tier` | Relative input/output cost |
| `availability` | Whether the model is eligible for selection |

Registry values are policy inputs, not benchmark claims. Revisit them using
measured workload data.

## Routing policy

1. Validate the request and normalize user constraints.
2. Classify the query into the router schema.
3. Exclude unavailable models and models that fail hard requirements: modality,
   tools, context capacity, and explicit latency limits.
4. Score remaining models against expected quality, latency, and cost.
5. Select the lowest-cost model whose quality score meets the request target.
6. If no candidate meets the target or classifier confidence is below a policy
   threshold, select the configured safe default and flag the decision.
7. Return the recommendation and emit an evaluation record.

The initial scoring policy can be deterministic and rule-based. Use weights or
learned routing only after collecting benchmark results.

## Implementation phases

### Phase 1: Recommendation service

- Define request, classifier, registry, and recommendation schemas.
- Add a small static model registry and a deterministic routing policy.
- Integrate one low-latency model for structured classification.
- Expose a single API or CLI command that returns a recommendation.
- Add input validation, schema validation, and decision logging.

Success criterion: representative queries always produce a valid recommendation
or a clear no-eligible-model result.

### Phase 2: Offline evaluation

- Assemble approximately 100–200 representative, non-sensitive prompts.
- For each prompt, collect acceptable-model labels or evaluate candidate model
  responses with a documented rubric.
- Compare router choices with the least-cost acceptable model.
- Tune registry tiers, rules, and confidence thresholds from the results.

Track:

- quality retention against always using the strongest model;
- cost and latency reduction;
- routing regret relative to the best eligible model;
- classifier overhead;
- percentage of low-confidence and fallback decisions.

Success criterion: the router meets an agreed quality floor while reducing cost
or latency on the evaluation set.

### Phase 3: Controlled execution

- Put the recommendation behind a feature flag.
- Execute the recommended model through a provider gateway.
- Add observability for selected model, latency, cost, failures, and user
  overrides.
- Keep a strong default model for no-match and low-confidence cases.

Success criterion: production-like traffic can use recommendations with a clear
fallback path and measurable outcomes.

### Phase 4: Cascading and agent routing

- Add post-execution quality checks and escalation when a response is unlikely
  to satisfy the request.
- Treat subagent role and inference model as separate routing decisions.
- Permit registry entries to represent agent workflows as well as direct models.

## Evaluation objective

For a query `q`, select model `m` that minimizes expected cost while meeting
quality and latency constraints:

```text
minimize Cost(m, q)
subject to ExpectedQuality(m, q) >= required_quality(q)
and Latency(m, q) <= allowed_latency(q)
```

## Open decisions before implementation

- Runtime and deployment form: TypeScript service, Python service, or CLI.
- Router classifier provider and structured-output interface.
- Initial candidate models and the gateway used to call them.
- Default quality and latency targets.
- Source and handling rules for representative evaluation prompts.
