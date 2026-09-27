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

const CryptoHolding = z.object({
    coinId: z.enum(['bitcoin', 'ethereum', 'solana']),
    heldVia: z.enum(['fund', 'direct']),
    fund: z.string().trim().max(12).optional(), // e.g. IBIT, when held through a fund
    marketValue: z.number().positive().max(1e10),
})

const Body = z.object({
    goal: z.string().trim().min(1).max(120),
    cryptoReason: z.string().trim().max(120).default(''),
    timeHorizon: z.string().trim().min(1).max(60),
    dropComfortPct: z.number().min(1).max(100),
    crypto: z.array(CryptoHolding).min(1).max(20),
    cashUsd: z.number().min(0).max(1e10),
    investmentsUsd: z.number().min(0).max(1e10),
})

const COIN = { bitcoin: ['BTC', 'Bitcoin'], ethereum: ['ETH', 'Ethereum'], solana: ['SOL', 'Solana'] } as const

/** Crypto in detail, everything else as two buckets, stored as positions. */
function toPositions(body: z.infer<typeof Body>) {
    const crypto = body.crypto.map((c) => {
        const [symbol, name] = COIN[c.coinId]
        const fund = c.fund?.toUpperCase()
        return c.heldVia === 'fund'
            ? { symbol: fund || symbol, name: `${name} (${fund ? `${fund} fund` : 'fund'})`, assetClass: 'crypto_etf', coinId: c.coinId, marketValue: c.marketValue }
            : { symbol, name: `${name} (held directly)`, assetClass: 'crypto', coinId: c.coinId, marketValue: c.marketValue }
    })
    const other = [
        { symbol: 'CASH', name: 'Cash & savings', assetClass: 'cash', coinId: null, marketValue: body.cashUsd },
        { symbol: 'INVEST', name: 'Stocks & bonds', assetClass: 'investments', coinId: null, marketValue: body.investmentsUsd },
    ].filter((p) => p.marketValue > 0)
    return [...crypto, ...other]
}

// Only the user's own portfolio is editable; the demo investors stay fixed so the demo is repeatable.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const investor = await prisma.investor.findUnique({ where: { id: params.id } })
    if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 })
    if (investor.isDemo) return NextResponse.json({ error: 'Demo investors cannot be edited' }, { status: 403 })

    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid portfolio' }, { status: 400 })
    const { goal, cryptoReason, timeHorizon, dropComfortPct } = parsed.data
    const positions = toPositions(parsed.data)

    // Numbers changed, so earlier insights no longer describe this portfolio
    await prisma.$transaction([
        prisma.position.deleteMany({ where: { investorId: investor.id } }),
        prisma.insight.deleteMany({ where: { investorId: investor.id } }),
        prisma.investor.update({ where: { id: investor.id }, data: { goal, cryptoReason, timeHorizon, dropComfortPct, positions: { create: positions } } }),
    ])
    return NextResponse.json({ ok: true })
}
