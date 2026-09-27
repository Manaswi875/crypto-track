# Crypto Pulse

**When crypto crashes, Crypto Pulse tells you what it means for your money and your plan, calmly, before you panic-sell.**

Price apps tell you "BTC −14%". Crypto Pulse tells you: *"You're down $1,407, which is 2.8% of your portfolio. That's within the 30% drop you said you were comfortable with, and you wrote that you're in this for 5+ years."* It never tells you to buy or sell. It gives you context and reminds you of your own plan.

## How it works

1. **You write your plan while you're calm**: your positions, your time horizon, how far crypto could fall before you'd lose sleep, and your plan in your own words.
2. **A big move happens**: live (the price tracker flags moves of 1%+), or a replay of a real historical crash from CoinGecko data.
3. **Your impact is computed in code**, not by the AI: exact dollars and share of your portfolio.
4. **An AI agent writes your insight**: Claude uses tools to look up the move, your plan, your positions, your computed impact, and longer-term price context, then writes what happened, what it means for you, how it relates to your plan, and questions worth asking yourself, with an urgency level.
5. **Guardrails**: an automated check blocks buy/sell instructions, price predictions, and guarantees. Every fact is cited back to the tool it came from, and the full agent trace, time, and cost are shown.

**Compare** shows the same crash for different people. A long-term believer, someone saving for a house, and someone about to retire get very different, but equally honest, insights.

## Scaling to advisors

The engine runs per portfolio. `/advisor` runs the same agent across a financial advisor's book of 60 client households: it ranks households by dollar impact and drafts a brief plus a client message for each. Nothing is sent without advisor approval, and every draft and decision is recorded in an audit trail.

## Tech stack

- **App**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Recharts
- **Server**: custom Node server (`server.ts`) with Socket.io for live prices and progress
- **Data**: PostgreSQL + Prisma, Redis (rolling price stats, pub/sub, CoinGecko cache)
- **AI**: Claude (Anthropic SDK tool runner) with adaptive thinking and refusal fallbacks
- **Market data**: CoinGecko (cached, with a background warm-up and stale fallback for the free tier's rate limits)
- **Infra**: Docker, GitHub Actions CI

### Key files

| Path | What it does |
|---|---|
| `services/agentCore.ts` | Shared agent engine: tool loop, traced tools, usage and cost accounting |
| `services/insightAgent.ts` | Personal insight agent (prompt, tools, output schema) |
| `services/briefAgent.ts` | Advisor brief agent, the same engine at advisor scale |
| `lib/impact.ts` | Deterministic impact math the agents must quote |
| `lib/compliance.ts` | No-advice / no-prediction checks |
| `services/replay.ts` | Finds the worst real one-day drop of the past year |

## Setup

1. `npm install`
2. `cp .env.example .env`, then set `NEXTAUTH_SECRET` (e.g. `openssl rand -base64 32`) and `ANTHROPIC_API_KEY`
3. Start Postgres and Redis: `docker compose up -d db redis`
4. Set up the database: `npx prisma db push && npx prisma db seed`
5. Run the dev server: `npm run dev:server`, then open http://localhost:3000

AI calls only happen when you ask for an insight, and each insight is cached per move and portfolio, so viewing it again is free. Live auto-explanations of price anomalies are off by default (`ENABLE_LIVE_AI_EXPLANATIONS`).

### Production and Docker

```bash
npm run build && npm run build:server && npm run start:server
# or
docker compose up --build
```

## Disclaimer

Educational context only, not financial advice.

## License

MIT
