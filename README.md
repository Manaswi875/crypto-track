# Crypto Pulse

**When crypto crashes, Crypto Pulse tells you what it means for your money and your plan, calmly, before you panic-sell.**

Price apps tell you "BTC −14%". Crypto Pulse tells you: *"You're down $1,407, which is 2.8% of everything you have. That's within your 30% loss tolerance, and you don't need this money for 5+ years."* It never tells you to buy or sell. It gives you context and keeps your own goal in view.

## How it works

1. **You set your goal while you're calm**: what the money is for, when you need it, and your crypto loss tolerance (the largest drop you could sit through without selling). Then your crypto holdings in detail, plus rough amounts for your cash and your stocks & bonds.
2. **A big move happens**: live (the price tracker flags moves of 1%+), or a replay of a real historical crash from CoinGecko data.
3. **Your impact is computed in code**, not by the AI: exact dollars and share of your portfolio.
4. **An AI agent writes your insight**: Claude uses tools to look up the move, your goal, your holdings, your computed impact, and longer-term price context, then writes what happened, what it means for you, how it relates to your goal, and questions worth asking yourself, with an urgency level.
5. **Guardrails**: an automated check blocks buy/sell instructions, price predictions, and guarantees. Every fact is cited back to the tool it came from, and the full agent trace is shown.

**Compare** shows the same crash for different people. A long-term believer, someone saving for a house, and someone about to retire get very different, but equally honest, insights.

## Scaling up

The engine runs per portfolio: the same tools, prompt rules, and impact math work for one person or, run across many portfolios, for a financial advisor's whole client book, with an advisor approving each message before it goes out.

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
| `services/followUp.ts` | Follow-up questions, streamed, with the same guardrails |
| `lib/impact.ts` | Deterministic impact math the agents must quote |
| `lib/compliance.ts` | No-advice / no-prediction checks |
| `services/replay.ts` | Finds distinct real crash days from the past year, with every coin's move |

## Quality checks

`npm run eval` grades every saved insight without calling the model: every dollar and percentage in the text must appear in the data the agent actually looked up (its tool calls are recorded), no advice or predictions, under 120 words, urgency consistent with the investor's loss tolerance, and sources cited. Follow-up answers are checked for advice too.

## Setup

1. `npm install`
2. `cp .env.example .env`, then set `ANTHROPIC_API_KEY`
3. Start Postgres and Redis: `docker compose up -d db redis`
4. Set up the database: `npx prisma db push && npx prisma db seed`
5. Run the dev server: `npm run dev:server`, then open http://localhost:3000

AI calls only happen when you ask for an insight, and each insight is cached per move and portfolio, so viewing it again is free. 

### Crash alerts

The server continuously compares each crypto holding's live value with the amount the user invested. Users can set a separate loss limit for each currency they hold and another for their combined crypto portfolio; either can trigger Slack or email once per crossing. Currency rules accept 1–50%, the crypto-portfolio rule accepts 1–25%, and a 0.5-point recovery buffer prevents repeated alerts around the boundary. CoinGecko's rolling 24-hour changes remain the separate market-crash signal. Set `SLACK_WEBHOOK_URL` for Slack, or `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, and `ALERT_EMAIL_TO` for email. Alert summaries use deterministic portfolio math and do not call the AI. `APP_URL` controls the link in each message.

For the evaluation approach, mistakes found during development, and demo-safety workflow, see [How I Built Crypto Pulse with AI](BUILDING_WITH_AI.md).

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
