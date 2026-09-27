import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { listCrashOptions } from '@/services/replay'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const [options, replays] = await Promise.all([
            listCrashOptions(),
            prisma.volatilityEvent.findMany({ where: { source: 'replay' }, select: { id: true, occurredAt: true } }),
        ])
        const byDate = new Map(replays.map((r) => [r.occurredAt.toISOString().slice(0, 10), r.id]))
        return NextResponse.json(options.map((o) => ({ ...o, eventId: byDate.get(o.date) ?? null })))
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Price history unavailable' }, { status: 502 })
    }
}
