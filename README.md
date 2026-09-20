# Model Router

A small Next.js proof of concept for LLM model routing. Jev evaluates a query's
task type, reasoning demand, coding demand, and the relative importance of
intelligence, speed, and price. A local policy then recommends a measured model
and effort row from `leaderboard.csv`.

## Prerequisites

- Node.js 20 or newer
- A TypeSafe API key with Jev access

## Setup

Install dependencies:

```bash
npm install
```

Create the local environment file:

```bash
cp .env.example .env.local
```

Open `.env.local` and set your TypeSafe API key:

```dotenv
TYPESAFE_API_KEY=your_key_here
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Enter a
query and select **Route query** to see Jev's task judgments, suggested
priorities, and recommended model and effort. Each query gets a new set of
priorities. Drag the sliders afterward to compare recommendations without
calling Jev again, or select **Use Jev suggestions** to restore its values.

The registry starts with the rows in `leaderboard.csv`. You can add, edit,
or remove model and effort rows in the UI for the current page session.
Reloading restores the CSV rows. The app does not save slider or registry
preferences in the browser.

The bundled CSV currently includes these model and effort pairs:

- Claude: Opus, Sonnet, and Haiku (non-reasoning)
- GPT: Sol, Terra, and Luna
- Gemini 3.8 Flash (high effort)
- GLM 5.3 Flash
- DeepSeek 4.1 Flash

## Leaderboard data

`leaderboard.csv` holds the selected model and effort rows from the
[Artificial Analysis model leaderboard](https://artificialanalysis.ai/leaderboards/models).
It is read for every API request. Keep one row per model and effort when
updating it. The columns are model ID, model name, provider, effort,
intelligence index, cost per task in USD, and median output tokens per second.
Use a blank cost cell when it is unavailable; Haiku currently has one. Its
source index was marked with an asterisk, which the simplified CSV does not
carry.

Jev classifies task type, reasoning demand, coding demand, and the importance
of intelligence, speed, and price. The policy first requires a minimum
intelligence index for harder queries. It then normalizes the three
measurements across the active rows and applies the selected weights. Cost uses
a logarithmic scale because the benchmark values span orders of magnitude.
Unknown cost receives the lowest price score. Tokens per second measures output
throughput; this POC does not factor in time to first token or total response
time. Cost per task is a benchmark estimate, not a provider quote.

## API

The UI calls the local server route, so the API key remains server-side:

```http
POST /api/route
Content-Type: application/json

{"query":"Review this pull request for concurrency bugs."}
```

The endpoint sends task and priority questions together to TypeSafe's
`jev-latest` System One model. The response includes `suggestedWeights`
and the model recommendation. You can still send explicit `weights` in the
POST body to override Jev's suggestion for that request. `GET
/api/route` returns the current CSV registry. You can send a `models`
array with POST to use edited rows for one request; without it, the API uses
the CSV directly.

## Validation

```bash
npm run lint
npm run build
```
