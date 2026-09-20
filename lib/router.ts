export const JEV_MODEL = "jev-latest";
export const POLICY_VERSION = "v4";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max" | "non-reasoning" | "default";
export const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max", "non-reasoning", "default"];
export type ModelSpec = {
  id: string;
  name: string;
  provider: string;
  effort: Effort;
  intelligenceIndex: number;
  costPerTaskUsd: number | null;
  tokensPerSecond: number;
};
export type Weights = { intelligence: number; speed: number; price: number };

export const QUESTION_IDS = {
  taskType: "task_type",
  reasoning: "reasoning_requirement",
  coding: "coding_requirement",
} as const;
export const WEIGHT_QUESTION_IDS = {
  intelligence: "intelligence_priority",
  speed: "speed_priority",
  price: "price_priority",
} as const;
export const ROUTER_QUESTIONS = {
  [QUESTION_IDS.taskType]: {
    type: "choice",
    instructions: "What kind of work is the user primarily asking the model to do?",
    criteria: {
      general: "A broad request that does not fit another specific category.",
      coding: "Writing, modifying, debugging, reviewing, or explaining software code.",
      reasoning: "Multi-step analysis, planning, mathematics, or logical deduction.",
      research: "Comparing sources, synthesizing information, or investigating a topic.",
      creative: "Generating or transforming creative writing, ideas, or expressive content.",
      simple_qa: "A straightforward question or short transformation needing little analysis.",
    },
  },
  [QUESTION_IDS.reasoning]: {
    type: "choice",
    instructions: "How much reasoning does a good answer require? Judge the requested work, not the wording length.",
    criteria: {
      low: "A direct fact, short transformation, or familiar pattern.",
      medium: "Several connected steps, interpretation, or moderate tradeoffs.",
      high: "Deep multi-step reasoning, difficult debugging, formal analysis, or careful planning.",
    },
  },
  [QUESTION_IDS.coding]: {
    type: "choice",
    instructions: "How much software development work is required by the request?",
    criteria: {
      none: "No code is requested and software concepts are not central.",
      low: "A small snippet or minor implementation.",
      high: "Substantial writing, changing, debugging, or reviewing code.",
    },
  },
  [WEIGHT_QUESTION_IDS.intelligence]: {
    type: "score",
    instructions: "How much would greater model intelligence improve the result for this specific request?",
    criteria: [
      "A simple task where extra reasoning ability is unlikely to help.",
      "A mostly routine task with a small benefit from stronger reasoning.",
      "A moderate task where more capable reasoning may noticeably improve the result.",
      "A complex task where stronger reasoning is important to a good result.",
      "A difficult or high-stakes task where maximum available reasoning is especially valuable.",
    ],
  },
  [WEIGHT_QUESTION_IDS.speed]: {
    type: "score",
    instructions: "How strongly does this request favor fast output over waiting for a slower, more capable response?",
    criteria: [
      "The request explicitly favors careful work and can tolerate a slow response.",
      "The task is substantial and gives no sign of urgency.",
      "No strong speed preference is stated; ordinary responsiveness is useful.",
      "The request suggests quick iteration or time sensitivity.",
      "The request explicitly demands the fastest practical response.",
    ],
  },
  [WEIGHT_QUESTION_IDS.price]: {
    type: "score",
    instructions: "How strongly does this request favor minimizing model cost per task?",
    criteria: [
      "The task is high-stakes or unusually difficult, making cost a minor concern.",
      "Quality matters more than cost for this task.",
      "No budget is stated; a balanced cost preference is reasonable.",
      "The task is routine or repeated, so lower cost is especially useful.",
      "The request explicitly prioritizes low cost or high-volume operation.",
    ],
  },
} as const;
export type QuestionId = (typeof QUESTION_IDS)[keyof typeof QUESTION_IDS];
export type WeightQuestionId = (typeof WEIGHT_QUESTION_IDS)[keyof typeof WEIGHT_QUESTION_IDS];
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};
export type ScoreAnswer = {
  type: "score";
  score: number;
  probabilities: Record<string, number>;
  confidence: number;
};
export type TaskAnswers = Record<QuestionId, ChoiceAnswer>;
export type WeightAnswers = Record<WeightQuestionId, ScoreAnswer>;
export type JevAnswers = TaskAnswers & WeightAnswers;
export type Candidate = {
  model: ModelSpec;
  score: number;
  intelligenceScore: number;
  speedScore: number;
  priceScore: number;
};
export type RoutingResult = {
  selectedModel: string;
  selectedEffort: Effort;
  reason: string;
  alternatives: { model: string; effort: Effort; score: number }[];
  confidence: number;
  score: number;
  requiredIntelligenceIndex: number;
  candidates: Candidate[];
};

const round = (value: number) => Math.round(value * 100) / 100;
const inRange = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const normalized = (value: number, min: number, max: number) =>
  max === min ? 1 : (value - min) / (max - min);

export function parseModels(value: unknown): ModelSpec[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return null;
  const models: ModelSpec[] = [];
  const keys = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const model = entry as Record<string, unknown>;
    if (
      typeof model.id !== "string" || !/^[a-z0-9][a-z0-9.-]{0,63}$/.test(model.id) ||
      typeof model.name !== "string" || !model.name.trim() || model.name.length > 80 ||
      typeof model.provider !== "string" || !model.provider.trim() || model.provider.length > 40 ||
      !EFFORTS.includes(model.effort as Effort) ||
      !inRange(model.intelligenceIndex, 0, 100) ||
      !inRange(model.tokensPerSecond, 1, 10000) ||
      !(model.costPerTaskUsd === null || inRange(model.costPerTaskUsd, 0, 1000))
    ) return null;
    const key = `${model.id}/${model.effort}`;
    if (keys.has(key)) return null;
    keys.add(key);
    models.push({
      id: model.id,
      name: model.name.trim(),
      provider: model.provider.trim(),
      effort: model.effort as Effort,
      intelligenceIndex: model.intelligenceIndex as number,
      costPerTaskUsd: model.costPerTaskUsd as number | null,
      tokensPerSecond: model.tokensPerSecond as number,
    });
  }
  return models;
}

export function parseWeights(value: unknown): Weights | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const weights = value as Record<string, unknown>;
  if (!inRange(weights.intelligence, 0, 10) || !inRange(weights.speed, 0, 10) ||
      !inRange(weights.price, 0, 10)) return null;
  if ((weights.intelligence as number) + (weights.speed as number) + (weights.price as number) === 0) return null;
  return {
    intelligence: weights.intelligence as number,
    speed: weights.speed as number,
    price: weights.price as number,
  };
}

export function suggestWeights(answers: WeightAnswers): Weights {
  const weights: Weights = {
    intelligence: Math.round(answers[WEIGHT_QUESTION_IDS.intelligence].score * 2.5),
    speed: Math.round(answers[WEIGHT_QUESTION_IDS.speed].score * 2.5),
    price: Math.round(answers[WEIGHT_QUESTION_IDS.price].score * 2.5),
  };
  if (weights.intelligence + weights.speed + weights.price === 0) weights.intelligence = 1;
  return weights;
}

export function selectModel(answers: TaskAnswers, models: ModelSpec[], weights: Weights): RoutingResult {
  const reasoning = answers[QUESTION_IDS.reasoning].choice;
  const coding = answers[QUESTION_IDS.coding].choice;
  const requiredIntelligenceIndex = Math.max(
    reasoning === "high" ? 35 : reasoning === "medium" ? 25 : 0,
    coding === "high" ? 30 : 0,
  );
  const intelligenceValues = models.map((model) => model.intelligenceIndex);
  const speedValues = models.map((model) => model.tokensPerSecond);
  const knownCosts = models.flatMap((model) =>
    model.costPerTaskUsd === null ? [] : [model.costPerTaskUsd]);
  const minIntelligence = Math.min(...intelligenceValues);
  const maxIntelligence = Math.max(...intelligenceValues);
  const minSpeed = Math.min(...speedValues);
  const maxSpeed = Math.max(...speedValues);
  const minCost = knownCosts.length ? Math.min(...knownCosts) : 0;
  const maxCost = knownCosts.length ? Math.max(...knownCosts) : 0;
  const meetsTarget = models.some((model) => model.intelligenceIndex >= requiredIntelligenceIndex);
  const eligible = meetsTarget
    ? models.filter((model) => model.intelligenceIndex >= requiredIntelligenceIndex)
    : models;
  const totalWeight = weights.intelligence + weights.speed + weights.price;
  const candidates = eligible.map((model): Candidate => {
    const intelligenceScore = normalized(model.intelligenceIndex, minIntelligence, maxIntelligence);
    const speedScore = normalized(model.tokensPerSecond, minSpeed, maxSpeed);
    // Costs span orders of magnitude; log scaling keeps the cheap end meaningful.
    // Unknown cost gets the least favorable price score rather than a free advantage.
    const priceScore = model.costPerTaskUsd === null
      ? 0
      : maxCost === minCost ? 1 : 1 - normalized(
        Math.log(model.costPerTaskUsd + 0.01),
        Math.log(minCost + 0.01),
        Math.log(maxCost + 0.01),
      );
    const score = round(100 * (
      weights.intelligence * intelligenceScore +
      weights.speed * speedScore +
      weights.price * priceScore
    ) / totalWeight);
    return { model, score, intelligenceScore: round(intelligenceScore), speedScore: round(speedScore), priceScore: round(priceScore) };
  }).sort((a, b) => b.score - a.score || b.model.intelligenceIndex - a.model.intelligenceIndex ||
    a.model.name.localeCompare(b.model.name));
  const winner = candidates[0];
  const confidences = Object.values(QUESTION_IDS).map((id) => answers[id].confidence);
  const confidence = round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length);
  const seenModels = new Set([winner.model.id]);
  const alternatives = candidates.filter((candidate) => {
    if (seenModels.has(candidate.model.id)) return false;
    seenModels.add(candidate.model.id);
    return true;
  }).slice(0, 3).map((candidate) => ({
    model: candidate.model.id, effort: candidate.model.effort, score: candidate.score,
  }));
  return {
    selectedModel: winner.model.id,
    selectedEffort: winner.model.effort,
    reason: meetsTarget
      ? `Meets the estimated intelligence target (${requiredIntelligenceIndex}) and ranks highest under your weights.`
      : `No row reaches the estimated intelligence target (${requiredIntelligenceIndex}); this is the highest weighted score available.`,
    alternatives,
    confidence,
    score: winner.score,
    requiredIntelligenceIndex,
    candidates: candidates.slice(0, 8),
  };
}

export function buildJevRequest(query: string) {
  return { model: JEV_MODEL, state: query, questions: ROUTER_QUESTIONS };
}
export function sanitizeAnswers(value: unknown): JevAnswers | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const answers = {} as JevAnswers;
  for (const id of Object.values(QUESTION_IDS)) {
    const answer = record[id];
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
    const parsed = answer as Record<string, unknown>;
    if (parsed.type !== "choice" || typeof parsed.choice !== "string" ||
        !(parsed.choice in ROUTER_QUESTIONS[id].criteria) ||
        !inRange(parsed.confidence, 0, 1) ||
        !parsed.probabilities || typeof parsed.probabilities !== "object" || Array.isArray(parsed.probabilities)) return null;
    const probabilities: Record<string, number> = {};
    for (const option of Object.keys(ROUTER_QUESTIONS[id].criteria)) {
      const probability = (parsed.probabilities as Record<string, unknown>)[option];
      if (!inRange(probability, 0, 1)) return null;
      probabilities[option] = probability as number;
    }
    answers[id] = { type: "choice", choice: parsed.choice, probabilities, confidence: parsed.confidence as number };
  }
  for (const id of Object.values(WEIGHT_QUESTION_IDS)) {
    const answer = record[id];
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
    const parsed = answer as Record<string, unknown>;
    if (parsed.type !== "score" || !inRange(parsed.score, 0, 4) ||
        !inRange(parsed.confidence, 0, 1) ||
        !parsed.probabilities || typeof parsed.probabilities !== "object" || Array.isArray(parsed.probabilities)) return null;
    const probabilities: Record<string, number> = {};
    for (let level = 0; level <= 4; level++) {
      const probability = (parsed.probabilities as Record<string, unknown>)[String(level)];
      if (!inRange(probability, 0, 1)) return null;
      probabilities[String(level)] = probability as number;
    }
    answers[id] = {
      type: "score",
      score: parsed.score as number,
      probabilities,
      confidence: parsed.confidence as number,
    };
  }
  return answers;
}
