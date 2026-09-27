import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { portfolioImpact } from '@/lib/impact'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const event = await prisma.volatilityEvent.findUnique({ where: { id: params.id }, include: { coin: true } })
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const investors = await prisma.investor.findMany({
        include: { positions: true, insights: { where: { eventId: event.id } } },
        orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
        event,
        investors: investors.map(({ positions, insights, ...i }) => ({
            ...i,
            impact: portfolioImpact(positions, event.coinId, event.changePct),
            insight: insights[0] ?? null,
        })),
    })
}
