import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/lib/prisma'
import { loadInvestor } from '@/lib/investors'
import { checkClientMessage } from '@/lib/compliance'
import { eventMoves, portfolioImpact } from '@/lib/impact'
import { ANSWER_RULES, streamAnswer } from '@/services/streamAnswer'

const MAX_HISTORY = 10

const SYSTEM_PROMPT = `You answer an individual investor's follow-up questions about a crypto sell-off and what it means for them. The context below has everything known about the move, their goal, their holdings, and the insight they were shown. If they quote part of the insight, answer about that part specifically.

${ANSWER_RULES}`

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
                total_wealth_goal_boundary_pct: i.investor.dropComfortPct,
                currency_investment_loss_limits: i.investor.alertSettings.currencies,
                crypto_portfolio_investment_loss_limit: i.investor.alertSettings.cryptoPortfolio,
                holdings: i.investor.positions.map((p) => ({ name: p.name, value_usd: p.marketValue, invested_usd: p.investedUsd })),
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

    const userContent = quote ? `About this part: "${quote}"\n\n${question}` : question
    yield* streamAnswer(`${SYSTEM_PROMPT}\n\n<context>\n${contextBlock(insight)}\n</context>`, [...history, { role: 'user', content: userContent }], async (answer, cost) => {
        await prisma.$transaction([
            prisma.insightMessage.create({ data: { insightId, role: 'user', content: question, quote: quote || null } }),
            prisma.insightMessage.create({ data: { insightId, role: 'assistant', content: answer, complianceFlags: checkClientMessage(answer), costUsd: cost } }),
        ])
    })
}
