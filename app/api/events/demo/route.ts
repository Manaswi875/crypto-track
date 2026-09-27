import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { sendCrashAlerts } from '@/services/crashNotifier'

export const dynamic = 'force-dynamic'

const DEMO_MOVES = { bitcoin: -12.4, ethereum: -15.1, solana: -18.6 }

/** Trigger a repeatable hypothetical crash through the real live-alert path. */
export async function POST() {
    await prisma.coin.upsert({
        where: { id: 'bitcoin' },
        update: {},
        create: { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
    })

    await prisma.volatilityEvent.deleteMany({
        where: { id: { startsWith: 'demo-crash-' }, Insight: { none: {} } },
    })

    const event = await prisma.volatilityEvent.create({
        data: {
            id: `demo-crash-${Date.now()}`,
            coinId: 'bitcoin',
            changePct: DEMO_MOVES.bitcoin,
            severity: 'high',
            source: 'live',
            windowLabel: '10m demo',
            moves: DEMO_MOVES,
            context: { hypothetical: true, demo: true },
        },
        include: { coin: true },
    })

    const alert = {
        id: event.id,
        coinId: event.coinId,
        changePct: event.changePct,
        severity: event.severity,
        occurredAt: event.occurredAt,
    }
    if (redis) await redis.publish('volatility-alerts', JSON.stringify(alert))
    await sendCrashAlerts({ ...event, moves: DEMO_MOVES }, { demo: true })
    return NextResponse.json(alert)
}
