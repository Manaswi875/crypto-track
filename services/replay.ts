import prisma from '@/lib/prisma'
import { audit } from '@/lib/audit'

const COINGECKO_API = 'https://api.coingecko.com/api/v3'

const pctChange = (from: number, to: number) => Number((((to - from) / from) * 100).toFixed(2))

/**
 * Find the largest one-day drop for a coin over the past year (real CoinGecko
 * daily closes) and record it as a replay event, so the advisor workflow can be
 * demonstrated on a real move without waiting for the market.
 */
export async function createReplayEvent(coinId: string, actor: string) {
    const res = await fetch(`${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=365&interval=daily`)
    if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`)
    const data = (await res.json()) as { prices?: [number, number][] }
    const prices = data.prices ?? []
    if (prices.length < 31) throw new Error('Not enough price history returned')

    let worst = { idx: 1, change: 0 }
    for (let i = 1; i < prices.length; i++) {
        const change = pctChange(prices[i - 1][1], prices[i][1])
        if (change < worst.change) worst = { idx: i, change }
    }

    const [prevTs, startPrice] = prices[worst.idx - 1]
    const [ts, endPrice] = prices[worst.idx]
    const occurredAt = new Date(ts)

    // Re-use the same replay if it was already created
    const existing = await prisma.volatilityEvent.findFirst({ where: { coinId, source: 'replay', occurredAt } })
    if (existing) return existing

    const priceAt = (daysBefore: number) => prices[Math.max(0, worst.idx - daysBefore)][1]
    const yearPrices = prices.slice(0, worst.idx + 1).map((p) => p[1])
    const context = {
        note: 'Daily closing prices from CoinGecko, as of the event date',
        price_on_event_date_usd: Math.round(endPrice),
        change_prior_30d_pct: pctChange(priceAt(30), endPrice),
        change_prior_90d_pct: pctChange(priceAt(90), endPrice),
        high_before_event_usd: Math.round(Math.max(...yearPrices)),
        low_before_event_usd: Math.round(Math.min(...yearPrices)),
        window_start: new Date(prevTs).toISOString().slice(0, 10),
    }

    const event = await prisma.volatilityEvent.create({
        data: {
            coinId,
            changePct: worst.change,
            severity: Math.abs(worst.change) > 5 ? 'high' : 'medium',
            source: 'replay',
            startPrice: Math.round(startPrice),
            endPrice: Math.round(endPrice),
            windowLabel: '24h',
            context,
            occurredAt,
        },
    })
    await audit('event_created', actor, 'event', event.id, { coinId, source: 'replay', changePct: worst.change, occurredAt: occurredAt.toISOString() })
    return event
}
