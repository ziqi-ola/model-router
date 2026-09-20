import { NextResponse } from "next/server";

import {
  buildJevRequest,
  parseModels,
  parseWeights,
  POLICY_VERSION,
  QUESTION_IDS,
  sanitizeAnswers,
  selectModel,
  suggestWeights,
  WEIGHT_QUESTION_IDS,
} from "../../../lib/router";
import { readLeaderboard } from "../../../lib/leaderboard";

const TYPESAFE_ENDPOINT = process.env.TYPESAFE_API_URL ?? "https://api.typesafe.ai/v1/systemone";
const MAX_QUERY_LENGTH = 16_000;
const REQUEST_TIMEOUT_MS = 15_000;
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    return NextResponse.json(await readLeaderboard());
  } catch {
    return errorResponse("Could not read leaderboard.csv. Check its columns and model rows.", 500);
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return errorResponse("TYPESAFE_API_KEY is not configured.", 500);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Request body must be a JSON object.", 400);
  }

  const input = body as Record<string, unknown>;
  const query = input.query;
  if (typeof query !== "string" || query.trim().length === 0) {
    return errorResponse("query must be a non-empty string.", 400);
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return errorResponse(`query must be ${MAX_QUERY_LENGTH} characters or fewer.`, 400);
  }
  let registry: Awaited<ReturnType<typeof readLeaderboard>>;
  try {
    registry = await readLeaderboard();
  } catch {
    return errorResponse("Could not read leaderboard.csv. Check its columns and model rows.", 500);
  }
  const models = input.models === undefined ? registry.models : parseModels(input.models);
  const requestedWeights = input.weights === undefined ? null : parseWeights(input.weights);
  if (!models) return errorResponse("models must contain 1–100 valid model and effort rows.", 400);
  if (input.weights !== undefined && !requestedWeights) {
    return errorResponse("weights must be numbers from 0 to 10 with at least one above zero.", 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(TYPESAFE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildJevRequest(query.trim())),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "TypeSafe request timed out."
      : "Could not reach TypeSafe.";
    return errorResponse(message, 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    return errorResponse(`TypeSafe returned HTTP ${upstream.status}.`, 502);
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return errorResponse("TypeSafe returned an invalid JSON response.", 502);
  }

  const answers = sanitizeAnswers(
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).answers
      : undefined,
  );
  if (!answers) return errorResponse("TypeSafe returned incomplete routing choices.", 502);

  const suggestedWeights = suggestWeights(answers);
  const weightsUsed = requestedWeights ?? suggestedWeights;
  const recommendation = selectModel(answers, models, weightsUsed);
  const choices = Object.fromEntries(Object.values(QUESTION_IDS).map((id) => [id, answers[id]]));
  const weightJudgments = Object.fromEntries(Object.values(WEIGHT_QUESTION_IDS).map((id) => [id, answers[id]]));
  const usage =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).usage
      : undefined;

  return NextResponse.json({
    query: query.trim(),
    choices,
    weightJudgments,
    suggestedWeights,
    weightsUsed,
    ...recommendation,
    policyVersion: POLICY_VERSION,
    leaderboardRevision: registry.revision,
    usage: usage && typeof usage === "object" && !Array.isArray(usage) ? usage : undefined,
  });
}
