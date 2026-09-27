import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import * as z from 'zod/v4'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { checkClientMessage } from '@/lib/compliance'
import { portfolioImpact } from '@/lib/impact'
import { AgentRun } from '@/services/agentCore'

const SubmitInsightInput = z.object({
    urgency: z
        .enum(['check_in_today', 'good_to_know', 'within_your_plan'])
        .describe('How much attention this deserves from the investor today'),
    headline: z.string().describe('One calm sentence, at most 14 words, summarising what this means for them'),
    what_happened: z.string().describe('1-2 sentences on the move itself, with its size in context'),
    what_it_means: z.string().describe('1-3 sentences on what it means for their money, quoting the exact $ and % figures'),
    your_plan: z.string().describe("1-3 sentences connecting the move to the plan they wrote, in their own words where possible"),
    questions: z
        .array(z.string())
        .describe('2-3 questions for them to reflect on. Questions, never instructions or recommendations.'),
    cited_facts: z
        .array(
            z.object({
                claim: z.string().describe('A factual claim made in the insight'),
                source: z
                    .enum(['get_market_event', 'get_price_context', 'get_my_profile', 'get_my_positions', 'get_my_impact'])
                    .describe('The tool whose result supports the claim'),
            }),
        )
        .describe('Every factual claim, with the tool that supports it'),
})
export type SubmittedInsight = z.infer<typeof SubmitInsightInput>

const SYSTEM_PROMPT = `You help an individual investor make sense of a sharp move in a crypto asset they hold, at the moment they are most likely to panic.

Write directly to them ("you"), in calm, plain English, like a knowledgeable friend who knows their finances. Help them see:
1. What happened, and how big it is in context.
2. What it means for their money, in dollars and as a share of their total portfolio.
3. How it relates to the plan they wrote, in their own words.
4. Whether anything deserves their attention today.

Gather what you need with the tools.

Rules:
- You are not a financial adviser. Never tell them to buy, sell, hold, rebalance, or "buy the dip". Never predict prices or promise outcomes. You give context; they decide. An automated compliance check runs on your output.
- Every number you state must come from a tool result. Quote dollar and percentage figures exactly as returned by get_my_impact. Never calculate your own figures.
- You only have data on this one asset's move. Do not claim how their other holdings or the wider market performed.
- If the move is larger than the drop they said they are comfortable with, or their plan mentions needing this money soon, say so plainly and kindly. Suggest questions to reflect on, including whether to talk to a licensed financial adviser, but do not tell them what to do.
- Urgency:
  - check_in_today: the move is bigger than the drop they said they are comfortable with, or the loss is 5% or more of their total portfolio, or their plan says they will need this money within about a year.
  - within_your_plan: the move is within their stated comfort, the loss is small relative to their total, and their plan is long-term.
  - good_to_know: anything in between.
- Keep it short. The whole insight should be readable in under a minute.

When you are done, call submit_insight exactly once.`

/** Run the insight agent for one investor. Does not write to the database. */
export async function runInsightAgent(eventId: string, investorId: string) {
    const [event, investor] = await Promise.all([
        prisma.volatilityEvent.findUniqueOrThrow({ where: { id: eventId }, include: { coin: true } }),
        prisma.investor.findUniqueOrThrow({ where: { id: investorId }, include: { positions: true } }),
    ])
    const impact = portfolioImpact(investor.positions, event.coinId, event.changePct)
    if (impact.exposureUsd === 0) throw new Error(`${investor.name} holds no ${event.coin.name}`)

    const agent = new AgentRun()
    let submitted: SubmittedInsight | null = null

    const tools = [
        ...agent.marketTools(event),
        agent.tool('get_my_profile', "The investor's profile and the plan they wrote in their own words, including how far they said their crypto could fall before they'd lose sleep.", z.object({}), () => ({
            name: investor.name,
            age: investor.age,
            risk_comfort: investor.riskComfort,
            time_horizon: investor.timeHorizon,
            plan_in_their_words: investor.plan,
            comfortable_with_crypto_drop_up_to_pct: investor.dropComfortPct,
        })),
        agent.tool('get_my_positions', "All of the investor's positions with market values and portfolio weights, flagging those exposed to this move.", z.object({}), () => ({
            total_portfolio_usd: impact.totalUsd,
            positions: [...investor.positions]
                .sort((a, b) => b.marketValue - a.marketValue)
                .map((p) => ({
                    symbol: p.symbol,
                    name: p.name,
                    asset_class: p.assetClass,
                    market_value_usd: p.marketValue,
                    weight_pct: Number(((p.marketValue / impact.totalUsd) * 100).toFixed(2)),
                    exposed_to_move: p.coinId === event.coinId,
                })),
        })),
        agent.tool('get_my_impact', 'The pre-computed dollar impact of this move on the investor, and how the move compares with the drop they said they are comfortable with. Quote these numbers exactly.', z.object({}), () => ({
            exposure_usd: impact.exposureUsd,
            exposure_pct_of_portfolio: impact.exposurePctOfTotal,
            estimated_impact_usd: impact.impactUsd,
            impact_pct_of_portfolio: impact.impactPctOfTotal,
            move_pct: Number(event.changePct.toFixed(2)),
            comfortable_with_drop_up_to_pct: investor.dropComfortPct,
            move_exceeds_stated_comfort: Math.abs(event.changePct) > investor.dropComfortPct,
        })),
        betaZodTool({
            name: 'submit_insight',
            description: 'Submit the finished insight for the investor. Call exactly once, at the end.',
            inputSchema: SubmitInsightInput,
            run: async (input) => {
                submitted = input
                agent.trace.push({ type: 'tool_call', tool: 'submit_insight', output: { urgency: input.urgency }, ms: 0, atMs: Date.now() - agent.started })
                return 'Insight recorded.'
            },
        }),
    ]

    const result = await agent.run({
        system: SYSTEM_PROMPT,
        tools,
        userMessage: `${event.coin.name} just moved ${event.changePct.toFixed(2)}%. Explain what it means for me.`,
    })

    const insight = submitted as SubmittedInsight | null
    if (!insight) throw new Error('Agent finished without submitting an insight')

    const investorFacing = [insight.headline, insight.what_happened, insight.what_it_means, insight.your_plan, ...insight.questions].join('\n')

    return {
        insight,
        impact,
        trace: agent.trace,
        ...result,
        complianceFlags: checkClientMessage(investorFacing),
    }
}

/**
 * Create (or return the existing) insight for an investor and generate it in
 * the background. Existing ready insights are reused so repeat clicks cost nothing.
 */
export async function requestInsight(eventId: string, investorId: string, opts: { regenerate?: boolean } = {}) {
    const existing = await prisma.insight.findUnique({ where: { eventId_investorId: { eventId, investorId } } })
    if (existing && (existing.status === 'generating' || (existing.status === 'ready' && !opts.regenerate))) return existing

    const [event, investor] = await Promise.all([
        prisma.volatilityEvent.findUniqueOrThrow({ where: { id: eventId } }),
        prisma.investor.findUniqueOrThrow({ where: { id: investorId }, include: { positions: true } }),
    ])
    const impact = portfolioImpact(investor.positions, event.coinId, event.changePct)
    const numbers = { exposureUsd: impact.exposureUsd, impactUsd: impact.impactUsd, impactPctOfTotal: impact.impactPctOfTotal }

    const row = await prisma.insight.upsert({
        where: { eventId_investorId: { eventId, investorId } },
        update: { status: 'generating', error: null, ...numbers },
        create: { eventId, investorId, status: 'generating', ...numbers },
    })

    void generate(row.id, eventId, investorId)
    return row
}

async function generate(insightId: string, eventId: string, investorId: string) {
    try {
        const r = await runInsightAgent(eventId, investorId)
        await prisma.insight.update({
            where: { id: insightId },
            data: {
                status: 'ready',
                urgency: r.insight.urgency,
                headline: r.insight.headline,
                whatHappened: r.insight.what_happened,
                whatItMeans: r.insight.what_it_means,
                yourPlan: r.insight.your_plan,
                questions: r.insight.questions,
                citedFacts: r.insight.cited_facts,
                complianceFlags: r.complianceFlags,
                trace: r.trace as unknown as Prisma.InputJsonValue,
                model: r.model,
                inputTokens: r.totalInputTokens,
                outputTokens: r.usage.output_tokens,
                costUsd: r.costUsd,
                latencyMs: r.latencyMs,
            },
        })
    } catch (err) {
        const message = err instanceof Anthropic.APIError ? `API error ${err.status}: ${err.message}` : err instanceof Error ? err.message : String(err)
        console.error(`[AGENT] Insight ${insightId} failed:`, message)
        await prisma.insight.update({ where: { id: insightId }, data: { status: 'failed', error: message } })
    }
}
