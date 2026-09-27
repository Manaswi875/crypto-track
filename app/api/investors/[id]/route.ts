import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { listEvents } from '@/lib/events'
import { portfolioImpact } from '@/lib/impact'
import { hasAnthropicKey } from '@/lib/anthropic'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const investor = await prisma.investor.findUnique({ where: { id: params.id }, include: { positions: { orderBy: { marketValue: 'desc' } } } })
    if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 })

    const [events, insights] = await Promise.all([
        listEvents(),
        prisma.insight.findMany({
            where: { investorId: investor.id },
            select: { id: true, eventId: true, status: true, urgency: true, headline: true },
        }),
    ])
    const insightByEvent = new Map(insights.map((i) => [i.eventId, i]))

    return NextResponse.json({
        investor,
        aiEnabled: hasAnthropicKey(),
        events: events.map((e) => ({
            ...e,
            impact: portfolioImpact(investor.positions, e.coinId, e.changePct),
            insight: insightByEvent.get(e.id) ?? null,
        })),
    })
}

const Position = z.object({
    symbol: z.string().trim().min(1).max(12),
    name: z.string().trim().min(1).max(120),
    assetClass: z.enum(['equity', 'fixed_income', 'cash', 'crypto_etf', 'crypto']),
    coinId: z.enum(['bitcoin', 'ethereum', 'solana']).nullable(),
    marketValue: z.number().positive().max(1e10),
})

const Body = z.object({
    tagline: z.string().trim().min(1).max(80),
    riskComfort: z.enum(['low', 'medium', 'high']),
    timeHorizon: z.string().trim().min(1).max(120),
    dropComfortPct: z.number().min(1).max(100),
    plan: z.string().trim().min(1).max(2000),
    positions: z.array(Position).min(1).max(30),
})

// Only the user's own portfolio is editable; the demo investors stay fixed so the demo is repeatable.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const investor = await prisma.investor.findUnique({ where: { id: params.id } })
    if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 })
    if (investor.isDemo) return NextResponse.json({ error: 'Demo investors cannot be edited' }, { status: 403 })

    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid portfolio' }, { status: 400 })
    const { positions, ...profile } = parsed.data

    // Numbers changed, so earlier insights no longer describe this portfolio
    await prisma.$transaction([
        prisma.position.deleteMany({ where: { investorId: investor.id } }),
        prisma.insight.deleteMany({ where: { investorId: investor.id } }),
        prisma.investor.update({ where: { id: investor.id }, data: { ...profile, positions: { create: positions } } }),
    ])
    return NextResponse.json({ ok: true })
}
