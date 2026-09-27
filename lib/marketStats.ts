import { HISTORY_TTL, OVERVIEW_PATH, OVERVIEW_TTL, coingecko, historyPath } from '@/lib/coingecko'

type Overview = {
    id: string
    current_price: number
    market_cap: number
    price_change_percentage_24h_in_currency: number | null
    price_change_percentage_30d_in_currency: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}

export type CoinToday = {
    coinId: string
    price: number
    change24hPct: number
    change30dPct: number | null
    typicalDailyMovePct: number // median absolute daily move over the past year
    todayVsTypical: number // |today's move| / typical move
    yearAvg: number
    yearHigh: number
    yearLow: number
    vsYearAvgPct: number
    positionInYearRange: number // 0 = at the 1-year low, 1 = at the 1-year high
    last30Days: number[]
}

export type MarketToday = { change24hPct: number; coins: Record<string, CoinToday> }

/**
 * Where each coin stands today against the whole crypto market and its own
 * past year. Built from the cached CoinGecko data, so it's free and instant.
 */
export async function marketToday(coinIds: string[]): Promise<MarketToday> {
    const overview = await coingecko<Overview[]>(OVERVIEW_PATH, OVERVIEW_TTL)

    // The market's move: the tracked coins weighted by size
    const capTotal = overview.reduce((s, c) => s + c.market_cap, 0)
    const market24h = overview.reduce((s, c) => s + (c.price_change_percentage_24h_in_currency ?? 0) * (c.market_cap / capTotal), 0)

    const coins: Record<string, CoinToday> = {}
    for (const coinId of coinIds) {
        const o = overview.find((c) => c.id === coinId)
        if (!o) continue
        const year = await coingecko<{ prices: [number, number][] }>(historyPath(coinId, '365'), HISTORY_TTL['365'])
        const closes = year.prices.map((p) => p[1])
        const dailyMoves = closes.slice(1).map((p, i) => Math.abs(((p - closes[i]) / closes[i]) * 100))
        const typical = median(dailyMoves)
        const high = Math.max(...closes)
        const low = Math.min(...closes)
        const avg = closes.reduce((s, p) => s + p, 0) / closes.length
        const change24h = o.price_change_percentage_24h_in_currency ?? 0
        coins[coinId] = {
            coinId,
            price: o.current_price,
            change24hPct: round2(change24h),
            change30dPct: o.price_change_percentage_30d_in_currency != null ? round2(o.price_change_percentage_30d_in_currency) : null,
            typicalDailyMovePct: round2(typical),
            todayVsTypical: typical ? round2(Math.abs(change24h) / typical) : 0,
            yearAvg: round2(avg),
            yearHigh: round2(high),
            yearLow: round2(low),
            vsYearAvgPct: round2(((o.current_price - avg) / avg) * 100),
            positionInYearRange: high > low ? round2(Math.min(1, Math.max(0, (o.current_price - low) / (high - low)))) : 0.5,
            last30Days: [...closes.slice(-30), o.current_price],
        }
    }
    return { change24hPct: round2(market24h), coins }
}
