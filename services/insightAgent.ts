import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import * as z from 'zod/v4'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { checkClientMessage } from '@/lib/compliance'
import { eventMoves, portfolioImpact } from '@/lib/impact'
import { AgentRun, TraceStep } from '@/services/agentCore'

const SubmitInsightInput = z.object({
    urgency: z
        .enum(['check_in_today', 'good_to_know', 'within_your_plan'])
        .describe('How much attention this deserves from the investor today'),
    headline: z.string().describe('One calm line, at most 12 words, on what this means for them'),
    what_happened: z.string().describe('ONE sentence, at most 25 words: the move and its size in context'),
    what_it_means: z.string().describe('At most 2 short sentences (40 words): what it means for their money. Their $ and % impact are already shown on screen, so mention the dollar figure at most once.'),
    your_goal: z.string().describe('ONE sentence, at most 30 words, connecting the move to their goal, timing, and loss tolerance'),
    questions: z
        .array(z.string())
        .max(2)
        .describe('1-2 short questions (at most 20 words each) to reflect on. Questions, never instructions or recommendations.'),
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

const SYSTEM_PROMPT = `You help an individual investor make sense of a sharp crypto sell-off that hit coins they hold, at the moment they are most likely to panic.

Write directly to them ("you"), in calm, plain English, like a knowledgeable friend who knows their finances. Help them see:
1. What happened, and how big it is in context.
2. What it means for their money, in dollars and as a share of everything they have.
3. How it relates to their goal, when they need the money, and why they own crypto in the first place.
4. Whether anything deserves their attention today.

Gather what you need with the tools.

Rules:
- You are not a financial adviser. Never tell them to buy, sell, hold, rebalance, or "buy the dip". Never predict prices or promise outcomes. You give context; they decide. An automated compliance check runs on your output.
- Every number you state must come from a tool result. Quote dollar and percentage figures exactly as returned by get_my_impact. Never calculate your own figures.
- A sell-off can move several coins by different amounts; get_my_impact breaks the loss down by holding. You only have data on these crypto moves. Do not claim how their cash, stocks, or bonds performed.
- Use plain words for their holdings ("your Bitcoin fund", "your cash and savings"), not ticker symbols alone.
- If the move exceeds their crypto loss tolerance, or they need the money soon, say so plainly and kindly. Suggest questions to reflect on, including whether to talk to a licensed financial adviser, but do not tell them what to do.
- Urgency:
  - check_in_today: the drop in a coin they hold exceeds their crypto loss tolerance, or they need the money within about a year and this loss meaningfully affects it.
  - within_your_plan: the drops are within their loss tolerance, the loss is under 5% of everything they have, and they do not need the money for several years.
  - good_to_know: anything in between, e.g. within their tolerance but a large share of everything they have.
- Be brief: about 80 words in total. Say each thing once. Don't list things you don't know, and don't restate figures the screen already shows.

When you are done, call submit_insight exactly once.`

/** Run the insight agent for one investor. Does not write to the database. */
export async function runInsightAgent(eventId: string, investorId: string, onStep?: (trace: TraceStep[]) => void) {
    const [event, investor] = await Promise.all([
        prisma.volatilityEvent.findUniqueOrThrow({ where: { id: eventId }, include: { coin: true } }),
        prisma.investor.findUniqueOrThrow({ where: { id: investorId }, include: { positions: true } }),
    ])
    const moves = eventMoves(event)
    const impact = portfolioImpact(investor.positions, moves)
    if (impact.exposureUsd === 0) throw new Error(`${investor.name} holds none of the coins that moved`)
    // Loss tolerance is about the coins they actually hold
    const worstHeldMove = Math.min(...impact.exposedPositions.map((p) => p.movePct))

    const agent = new AgentRun(onStep)
    let submitted: SubmittedInsight | null = null

    const tools = [
        ...agent.marketTools(event),
        agent.tool('get_my_profile', "The investor's goal, why they own crypto, when they need the money, and their crypto loss tolerance (the largest drop they said they could sit through).", z.object({}), () => ({
            name: investor.name,
            age: investor.age,
            goal: investor.goal,
            why_they_own_crypto: investor.cryptoReason || 'not given',
            needs_the_money: investor.timeHorizon,
            crypto_loss_tolerance_pct: investor.dropComfortPct,
        })),
        agent.tool('get_my_positions', "Everything the investor holds: each crypto holding, plus their cash & savings and stocks & bonds, with values and share of the total, flagging what this move affects.", z.object({}), () => ({
            total_usd: impact.totalUsd,
            holdings: [...investor.positions]
                .sort((a, b) => b.marketValue - a.marketValue)
                .map((p) => ({
                    name: p.name,
                    type: p.assetClass === 'crypto_etf' ? 'crypto fund' : p.assetClass === 'crypto' ? 'crypto held directly' : p.name.toLowerCase(),
                    value_usd: p.marketValue,
                    share_of_total_pct: Number(((p.marketValue / impact.totalUsd) * 100).toFixed(2)),
                    affected_by_this_move: p.coinId != null && moves[p.coinId] != null,
                })),
        })),
        agent.tool('get_my_impact', 'The pre-computed dollar impact of this sell-off on the investor, in total and per holding, and how the drops compare with their crypto loss tolerance. Quote these numbers exactly.', z.object({}), () => ({
            crypto_exposure_usd: impact.exposureUsd,
            crypto_exposure_pct_of_total: impact.exposurePctOfTotal,
            estimated_impact_usd: impact.impactUsd,
            impact_pct_of_total: impact.impactPctOfTotal,
            by_holding: impact.exposedPositions.map((p) => ({ holding: p.name, value_usd: p.marketValue, move_pct: p.movePct, impact_usd: p.impactUsd })),
            crypto_loss_tolerance_pct: investor.dropComfortPct,
            largest_drop_among_their_holdings_pct: worstHeldMove,
            exceeds_loss_tolerance: Math.abs(worstHeldMove) > investor.dropComfortPct,
        })),
        betaZodTool({
            name: 'submit_insight',
            description: 'Submit the finished insight for the investor. Call exactly once, at the end.',
            inputSchema: SubmitInsightInput,
            run: async (input) => {
                submitted = input
                agent.record({ type: 'tool_call', tool: 'submit_insight', output: { urgency: input.urgency }, ms: 0, atMs: Date.now() - agent.started })
                return 'Insight recorded.'
            },
        }),
    ]

    const result = await agent.run({
        system: SYSTEM_PROMPT,
        tools,
        userMessage: `Crypto just sold off (${Object.entries(moves).map(([c, m]) => `${c} ${m.toFixed(1)}%`).join(', ')}). Explain what it means for me.`,
    })

    const insight = submitted as SubmittedInsight | null
    if (!insight) throw new Error('Agent finished without submitting an insight')

    const investorFacing = [insight.headline, insight.what_happened, insight.what_it_means, insight.your_goal, ...insight.questions].join('\n')

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
    const impact = portfolioImpact(investor.positions, eventMoves(event))
    const numbers = { exposureUsd: impact.exposureUsd, impactUsd: impact.impactUsd, impactPctOfTotal: impact.impactPctOfTotal }

    const row = await prisma.insight.upsert({
        where: { eventId_investorId: { eventId, investorId } },
        update: { status: 'generating', error: null, trace: Prisma.DbNull, ...numbers },
        create: { eventId, investorId, status: 'generating', ...numbers },
    })

    void generate(row.id, eventId, investorId)
    return row
}

async function generate(insightId: string, eventId: string, investorId: string) {
    // Save each step as it happens so the page can show live progress.
    // Writes are chained so they land in order and finish before the final update.
    let progress: Promise<unknown> = Promise.resolve()
    const onStep = (trace: TraceStep[]) => {
        const snapshot = [...trace] as unknown as Prisma.InputJsonValue
        progress = progress.then(() => prisma.insight.update({ where: { id: insightId }, data: { trace: snapshot } })).catch(() => {})
    }

    try {
        const r = await runInsightAgent(eventId, investorId, onStep)
        await progress
        await prisma.insight.update({
            where: { id: insightId },
            data: {
                status: 'ready',
                urgency: r.insight.urgency,
                headline: r.insight.headline,
                whatHappened: r.insight.what_happened,
                whatItMeans: r.insight.what_it_means,
                yourGoal: r.insight.your_goal,
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
        await progress
        await prisma.insight.update({ where: { id: insightId }, data: { status: 'failed', error: message } })
    }
}
