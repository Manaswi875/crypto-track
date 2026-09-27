import { NextResponse } from 'next/server'
import { OVERVIEW_PATH, OVERVIEW_TTL, coingecko } from '@/lib/coingecko'

export const dynamic = 'force-dynamic'

type CoinMarket = {
    id: string
    symbol: string
    name: string
    image: string
    current_price: number
    market_cap: number
    total_volume: number
    high_24h: number
    low_24h: number
    ath: number
    ath_change_percentage: number
    ath_date: string
    price_change_percentage_24h_in_currency: number | null
    price_change_percentage_7d_in_currency: number | null
    price_change_percentage_30d_in_currency: number | null
}

export async function GET() {
    try {
        const coins = await coingecko<CoinMarket[]>(OVERVIEW_PATH, OVERVIEW_TTL)
        return NextResponse.json(
            coins.map((c) => ({
                id: c.id,
                symbol: c.symbol.toUpperCase(),
                name: c.name,
                image: c.image,
                price: c.current_price,
                marketCap: c.market_cap,
                volume24h: c.total_volume,
                high24h: c.high_24h,
                low24h: c.low_24h,
                change24h: c.price_change_percentage_24h_in_currency,
                change7d: c.price_change_percentage_7d_in_currency,
                change30d: c.price_change_percentage_30d_in_currency,
                allTimeHigh: c.ath,
                belowAllTimeHighPct: c.ath_change_percentage,
                allTimeHighDate: c.ath_date,
            })),
        )
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Market data unavailable' }, { status: 502 })
    }
}
