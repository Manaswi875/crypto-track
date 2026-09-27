import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { loadInvestor } from '@/lib/investors'
import { hasAnthropicKey } from '@/lib/anthropic'
import { eventMoves, portfolioImpact } from '@/lib/impact'
import { requestInsight } from '@/services/insightAgent'

const Body = z.object({ eventId: z.string().min(1), investorId: z.string().min(1), regenerate: z.boolean().optional() })

export async function POST(req: Request) {
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'eventId and investorId are required' }, { status: 400 })
    const { eventId, investorId, regenerate } = parsed.data

    const [event, investor] = await Promise.all([
        prisma.volatilityEvent.findUnique({ where: { id: eventId } }),
        loadInvestor(investorId),
    ])
    if (!event || !investor) return NextResponse.json({ error: 'Event or investor not found' }, { status: 404 })
    if (portfolioImpact(investor.positions, eventMoves(event)).exposureUsd === 0) {
        return NextResponse.json({ error: 'This portfolio has no exposure to this move' }, { status: 400 })
    }

    const existing = await prisma.insight.findUnique({ where: { eventId_investorId: { eventId, investorId } } })
    const needsModel = !existing || existing.status === 'failed' || (existing.status === 'ready' && regenerate)
    if (needsModel && !hasAnthropicKey()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 503 })

    const insight = await requestInsight(eventId, investorId, { regenerate })
    return NextResponse.json(insight, { status: needsModel ? 202 : 200 })
}
