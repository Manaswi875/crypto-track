import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/lib/prisma'
import { loadInvestor } from '@/lib/investors'
import { checkClientMessage } from '@/lib/compliance'
import { eventMoves, portfolioImpact } from '@/lib/impact'
import { FALLBACK_BETA, MODEL, costUsd, getAnthropic } from '@/lib/anthropic'

const MAX_HISTORY = 10

const SYSTEM_PROMPT = `You answer an individual investor's follow-up questions about a crypto sell-off and what it means for them. The context below has everything known about the move, their goal, their holdings, and the insight they were shown.

How to answer:
- Plain English, calm, short: 2-4 sentences unless they ask for more. No headings.
- If they quote part of the insight, answer about that part specifically.
- You can explain general concepts (what a crypto fund is, what a sell-off is, why coins move together).
- Use numbers only from the context, exactly as given. If something isn't in the context, say you don't have that information.

Never:
- Tell them to buy, sell, hold, rebalance, or "buy the dip", even if they ask directly. You can lay out what to weigh and suggest a licensed financial adviser for the decision.
- Predict prices or promise outcomes.`

type InsightWithContext = NonNullable<Awaited<ReturnType<typeof loadInsight>>>

async function loadInsight(insightId: string) {
    const insight = await prisma.insight.findUnique({
        where: { id: insightId },
        include: { event: { include: { coin: true } }, messages: { orderBy: { createdAt: 'asc' } } },
    })
    const investor = insight && (await loadInvestor(insight.investorId))
    return insight && investor ? { ...insight, investor } : null
}

function contextBlock(i: InsightWithContext) {
    const moves = eventMoves(i.event)
    const impact = portfolioImpact(i.investor.positions, moves)
    return JSON.stringify(
        {
            market_move: {
                date: i.event.occurredAt.toISOString().slice(0, 10),
                source: i.event.source === 'replay' ? 'historical replay applied to current holdings' : 'live',
                moves_pct: moves,
                price_context: i.event.context,
            },
            investor: {
                goal: i.investor.goal,
                why_they_own_crypto: i.investor.cryptoReason,
                needs_the_money: i.investor.timeHorizon,
                crypto_loss_tolerance_pct: i.investor.dropComfortPct,
                holdings: i.investor.positions.map((p) => ({ name: p.name, value_usd: p.marketValue })),
            },
            impact: {
                total_usd: impact.totalUsd,
                estimated_impact_usd: impact.impactUsd,
                impact_pct_of_total: impact.impactPctOfTotal,
                by_holding: impact.exposedPositions.map((p) => ({ holding: p.name, move_pct: p.movePct, impact_usd: p.impactUsd })),
            },
            insight_shown: {
                headline: i.headline,
                what_happened: i.whatHappened,
                what_it_means: i.whatItMeans,
                your_goal: i.yourGoal,
                questions: i.questions,
            },
        },
        null,
        2,
    )
}

/**
 * Stream an answer to a follow-up question, then save the question and answer.
 * Yields text as it arrives.
 */
export async function* askFollowUp(insightId: string, question: string, quote?: string) {
    const insight = await loadInsight(insightId)
    if (!insight || insight.status !== 'ready') throw new Error('Insight not found')

    const history: Anthropic.Beta.BetaMessageParam[] = insight.messages.slice(-MAX_HISTORY).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.role === 'user' && m.quote ? `About this part: "${m.quote}"\n\n${m.content}` : m.content,
    }))

    // Stable context first so repeat questions reuse the cached prefix
    const stream = getAnthropic().beta.messages.stream({
        model: MODEL,
        max_tokens: 4000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: `${SYSTEM_PROMPT}\n\n<context>\n${contextBlock(insight)}\n</context>`, cache_control: { type: 'ephemeral' } }],
        messages: [...history, { role: 'user', content: quote ? `About this part: "${quote}"\n\n${question}` : question }],
    })

    let answer = ''
    for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            answer += event.delta.text
            yield event.delta.text
        }
    }
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') {
        const note = "I can't help with that one. I can explain what this move means for your money, or general crypto concepts."
        answer = note
        yield note
    }

    const flags = checkClientMessage(answer)
    await prisma.$transaction([
        prisma.insightMessage.create({ data: { insightId, role: 'user', content: question, quote: quote || null } }),
        prisma.insightMessage.create({
            data: { insightId, role: 'assistant', content: answer.trim(), complianceFlags: flags, costUsd: costUsd(final.usage) },
        }),
    ])
}
