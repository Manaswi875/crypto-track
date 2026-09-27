import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/lib/prisma'
import { listEvents } from '@/lib/events'
import { eventMoves, portfolioImpact } from '@/lib/impact'
import { loadInvestor } from '@/lib/investors'
import { marketToday } from '@/lib/marketStats'
import { ANSWER_RULES, streamAnswer } from '@/services/streamAnswer'
import { afterEffects } from '@/services/replay'

const MAX_HISTORY = 10

const SYSTEM_PROMPT = `You answer an individual investor's questions about their money and the crypto market. The context below has their goal, holdings (valued at live prices), profit or loss, today's market for the coins they hold, and real past crashes with what each would mean for them today and what happened 30 days later.

For "what if" questions (e.g. "what if Bitcoin fell 30%?"), you may multiply their holding values by the stated percentage, and show that simple math.

${ANSWER_RULES}`

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

async function portfolioContext(investorId: string) {
    const investor = await loadInvestor(investorId)
    if (!investor) throw new Error('Investor not found')

    const crypto = investor.positions.filter((p) => p.coinId)
    const [market, events, insights] = await Promise.all([
        marketToday([...new Set(crypto.map((p) => p.coinId as string))]).catch(() => null),
        listEvents(),
        prisma.insight.findMany({ where: { investorId, status: 'ready' }, select: { eventId: true, headline: true, urgency: true } }),
    ])
    const replays = events.filter((e) => e.source === 'replay')
    const after = await afterEffects(replays.map((e) => e.occurredAt.toISOString().slice(0, 10))).catch(() => ({}) as Record<string, never>)

    return JSON.stringify(
        {
            investor: {
                goal: investor.goal,
                why_they_own_crypto: investor.cryptoReason,
                needs_the_money: investor.timeHorizon,
                crypto_loss_tolerance_pct: investor.dropComfortPct,
            },
            holdings: investor.positions.map((p) => ({
                name: p.name,
                value_usd: p.marketValue,
                put_in_usd: p.investedUsd,
                profit_or_loss_usd: p.investedUsd != null ? Math.round(p.marketValue - p.investedUsd) : null,
                change_24h_usd: p.coinId ? p.change24hUsd : undefined,
            })),
            total_usd: investor.positions.reduce((s, p) => s + p.marketValue, 0),
            market_today: market && {
                crypto_market_24h_pct: market.change24hPct,
                coins: Object.values(market.coins).map((c) => ({
                    coin: c.name,
                    price_usd: c.price,
                    change_24h_pct: c.change24hPct,
                    change_30d_pct: c.change30dPct,
                    typical_daily_move_pct: c.typicalDailyMovePct,
                    vs_1y_average_pct: c.vsYearAvgPct,
                    below_all_time_high_pct: c.belowAllTimeHighPct,
                })),
            },
            past_crashes: replays.map((e) => {
                const date = e.occurredAt.toISOString().slice(0, 10)
                const impact = portfolioImpact(investor.positions, eventMoves(e))
                return {
                    date,
                    moves_pct: eventMoves(e),
                    impact_on_them_today_usd: impact.impactUsd,
                    impact_pct_of_total: impact.impactPctOfTotal,
                    thirty_days_later_pct: (after as Record<string, { d30: { moves: Record<string, number> } | null }>)[date]?.d30?.moves ?? null,
                    their_insight: insights.find((i) => i.eventId === e.id) ?? null,
                }
            }),
        },
        null,
        2,
    )
}

/** Stream an answer about the investor's money. The thread lives in the browser. */
export async function* askPortfolio(investorId: string, question: string, history: ChatTurn[]) {
    const context = await portfolioContext(investorId)
    const messages: Anthropic.Beta.BetaMessageParam[] = [...history.slice(-MAX_HISTORY), { role: 'user', content: question }]
    yield* streamAnswer(`${SYSTEM_PROMPT}\n\n<context>\n${context}\n</context>`, messages, async () => {})
}
