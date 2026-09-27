import { NextResponse } from 'next/server'
import { z } from 'zod'
import { HISTORY_TTL, MARKET_COINS, coingecko, historyPath } from '@/lib/coingecko'

export const dynamic = 'force-dynamic'

const Query = z.object({
    coin: z.string().refine((c) => MARKET_COINS.includes(c), 'Unknown coin'),
    days: z.enum(['1', '7', '30', '365']),
})

export async function GET(req: Request) {
    const url = new URL(req.url)
    const parsed = Query.safeParse({ coin: url.searchParams.get('coin'), days: url.searchParams.get('days') })
    if (!parsed.success) return NextResponse.json({ error: 'coin and days (1, 7, 30, 365) are required' }, { status: 400 })
    const { coin, days } = parsed.data

    try {
        const data = await coingecko<{ prices: [number, number][] }>(historyPath(coin, days), HISTORY_TTL[days])
        return NextResponse.json({ coin, days: Number(days), prices: data.prices.map(([t, p]) => ({ t, p })) })
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Price history unavailable' }, { status: 502 })
    }
}
