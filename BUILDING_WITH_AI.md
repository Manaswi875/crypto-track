# How I Built Crypto Pulse with AI

Crypto Pulse uses AI for language and explanation, while deterministic code owns the financial calculations. The model receives computed portfolio impact, goal context, market data, and source records through tools. Its output then passes guardrails for financial advice, predictions, unsupported numbers, length, urgency, and citations.

## What I evaluated

- **Numerical grounding:** every dollar amount and percentage in an insight must exist in the recorded tool data.
- **Safety:** answers must not tell someone to buy, sell, or hold, predict a price, or make guarantees.
- **Relevance:** urgency must match the investor's stated loss tolerance and time horizon.
- **Traceability:** insights retain their source references and full tool trace.
- **Consistency:** saved insights can be re-graded for free with `npm run eval`; the evaluator never calls the model.

## Mistakes I found and fixed

- A portfolio screen could remain stuck loading after an interrupted generation. Interrupted runs are now marked retryable by the demo reset.
- Historical dates displayed a day early when local time conversion shifted a UTC date. Dates are handled consistently as market dates.
- One multi-coin portfolio loss was understated because impact was not aggregated across all affected holdings. Portfolio impact is now calculated in code per holding and summed before AI sees it.
- A background noise detector could quietly trigger paid work. AI calls now happen only through explicit user actions and reusable cached results.
- An answer could imply a cause without supporting data. Claims are constrained to the data returned by recorded tools and linked sources.

## Demo safety

- `npm run demo:reset` restores the three example investors and crash events without deleting paid insights or follow-ups.
- `npm run eval` grades saved outputs without spending AI credits.
- Docker startup syncs the schema and idempotently creates missing demo investors.
- The core pages and APIs can be smoke-tested without an Anthropic key; paid calls only occur after an explicit AI action.

## Useful commands

```bash
npm run build
npm run build:server
npm run lint
npm run demo:reset
npm run eval
docker compose up --build
```
