import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { DEMO_CRASH_MOVES } from '@/lib/demoCrash'
import { PortfolioAlertMonitor } from '@/services/portfolioAlertMonitor'

export const dynamic = 'force-dynamic'

/** Trigger a repeatable hypothetical crash through the real live-alert path. */
export async function POST(req: Request) {
    const investorId = String((await req.json().catch(() => null))?.investorId ?? 'you')
    await prisma.volatilityEvent.deleteMany({
        where: { id: { startsWith: 'demo-crash-' }, Insight: { none: {} } },
    })
    const coins = await prisma.coin.findMany({ where: { id: { in: Object.keys(DEMO_CRASH_MOVES) } } })
    const ticks = Object.fromEntries(coins.map((coin) => {
        const change24h = DEMO_CRASH_MOVES[coin.id]
        return [coin.id, { price: (coin.lastPrice ?? 1) * (1 + change24h / 100), change24h }]
    }))
    const alert = await new PortfolioAlertMonitor().evaluateInvestor(investorId, ticks, { hypothetical: true, force: true })
    if (!alert) return NextResponse.json({ error: 'This scenario does not cross any enabled loss limit.' }, { status: 422 })
    return NextResponse.json(alert)
}
