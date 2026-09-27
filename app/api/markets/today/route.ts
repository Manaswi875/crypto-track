import { NextResponse } from 'next/server'
import { MARKET_COINS } from '@/lib/coingecko'
import { marketToday } from '@/lib/marketStats'

export const dynamic = 'force-dynamic'

/** Every tracked coin today, against the market and its own past year. */
export async function GET() {
    try {
        return NextResponse.json(await marketToday(MARKET_COINS))
    } catch {
        return NextResponse.json({ error: 'Market data is unavailable right now. Try again in a minute.' }, { status: 502 })
    }
}
