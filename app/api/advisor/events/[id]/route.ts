import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { computeEventImpact } from '@/lib/impact'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const event = await prisma.volatilityEvent.findUnique({ where: { id: params.id }, include: { coin: true } })
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const [impacts, briefs] = await Promise.all([
        computeEventImpact(event.id),
        prisma.brief.findMany({
            where: { eventId: event.id },
            select: { id: true, householdId: true, status: true, priority: true, complianceFlags: true, latencyMs: true, costUsd: true, error: true },
        }),
    ])

    return NextResponse.json({ event, impacts, briefs })
}
