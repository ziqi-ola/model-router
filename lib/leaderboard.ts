import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseModels, type ModelSpec } from "./router";

const HEADER = [
  "model_id", "model_name", "provider", "effort", "intelligence_index",
  "cost_per_task_usd", "median_tokens_per_second",
];

function fields(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("Unclosed quoted field");
  values.push(value);
  return values;
}

function numeric(value: string, label: string, line: number): number {
  if (!value.trim() || !Number.isFinite(Number(value))) {
    throw new Error(`Invalid ${label} on CSV line ${line}`);
  }
  return Number(value);
}

export async function readLeaderboard(): Promise<{ models: ModelSpec[]; revision: string }> {
  const source = await readFile(join(process.cwd(), "leaderboard.csv"), "utf8");
  const lines = source.trimEnd().split(/\r?\n/);
  if (fields(lines[0]).join(",") !== HEADER.join(",")) {
    throw new Error("Unexpected leaderboard.csv header");
  }
  const rows = lines.slice(1).filter((line) => line.trim()).map((line, index) => {
    const row = fields(line);
    const lineNumber = index + 2;
    if (row.length !== HEADER.length) throw new Error(`Invalid CSV line ${lineNumber}`);
    return {
      id: row[0].trim(),
      name: row[1].trim(),
      provider: row[2].trim(),
      effort: row[3].trim(),
      intelligenceIndex: numeric(row[4], "intelligence index", lineNumber),
      costPerTaskUsd: row[5].trim() ? numeric(row[5], "cost per task", lineNumber) : null,
      tokensPerSecond: numeric(row[6], "tokens per second", lineNumber),
    };
  });
  const models = parseModels(rows);
  if (!models) throw new Error("Invalid or duplicate model rows in leaderboard.csv");
  return { models, revision: createHash("sha256").update(source).digest("hex").slice(0, 12) };
}
