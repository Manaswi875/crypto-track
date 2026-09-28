import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { listEvents } from '@/lib/events'
import { eventMoves, portfolioImpact } from '@/lib/impact'
import { hasAnthropicKey } from '@/lib/anthropic'
import { livePrices, loadInvestor, unitsFor } from '@/lib/investors'
import { marketToday } from '@/lib/marketStats'
import { afterEffects } from '@/services/replay'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const investor = await loadInvestor(params.id)
    if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 })

    const [listedEvents, insights, personalAlerts] = await Promise.all([
        listEvents(),
        prisma.insight.findMany({
            where: { investorId: investor.id },
            select: { id: true, eventId: true, status: true, urgency: true, headline: true },
        }),
        prisma.investorAlert.findMany({
            where: { investorId: investor.id },
            orderBy: { occurredAt: 'desc' },
            take: 20,
            include: { event: { include: { coin: true } } },
        }),
    ])
    const insightByEvent = new Map(insights.map((i) => [i.eventId, i]))
    const personalAlertByEvent = new Map(personalAlerts.map((alert) => [alert.eventId, alert]))
    const events = [...new Map([...personalAlerts.map((alert) => alert.event), ...listedEvents].map((event) => [event.id, event])).values()]
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())

    const crypto = investor.positions.filter((p) => p.coinId)
    const heldCoins = [...new Set(crypto.map((p) => p.coinId as string))]
    const [market, after] = await Promise.all([
        marketToday(heldCoins).catch(() => null),
        afterEffects(events.filter((e) => e.source === 'replay').map((e) => e.occurredAt.toISOString().slice(0, 10))).catch(() => ({})),
    ])

    // Today, in numbers: what the crypto did in 24h, and profit/loss against what went in
    const cryptoValue = crypto.reduce((s, p) => s + p.marketValue, 0)
    const change24hUsd = crypto.reduce((s, p) => s + p.change24hUsd, 0)
    const withCost = crypto.filter((p) => p.investedUsd != null)
    const invested = withCost.reduce((s, p) => s + (p.investedUsd ?? 0), 0)
    const today = {
        totalUsd: investor.positions.reduce((s, p) => s + p.marketValue, 0),
        cryptoUsd: cryptoValue,
        change24hUsd,
        change24hPct: cryptoValue - change24hUsd ? (change24hUsd / (cryptoValue - change24hUsd)) * 100 : 0,
        investedUsd: withCost.length ? invested : null,
        gainUsd: withCost.length ? withCost.reduce((s, p) => s + p.marketValue, 0) - invested : null,
        marketChange24hPct: market?.change24hPct ?? null,
        coins: market
            ? Object.fromEntries(
                  Object.values(market.coins).map((c) => [c.coinId, { change24hPct: c.change24hPct, typicalDailyMovePct: c.typicalDailyMovePct, todayVsTypical: c.todayVsTypical }]),
              )
            : {},
    }

    return NextResponse.json({
        investor,
        aiEnabled: hasAnthropicKey(),
        today,
        events: events.map((e) => ({
            ...e,
            impact: portfolioImpact(investor.positions, eventMoves(e)),
            insight: insightByEvent.get(e.id) ?? null,
            personalAlert: personalAlertByEvent.get(e.id) ?? null,
            after: e.source === 'replay' ? ((after as Record<string, unknown>)[e.occurredAt.toISOString().slice(0, 10)] ?? null) : null,
        })),
    })
}

const CryptoHolding = z.object({
    coinId: z.enum(['bitcoin', 'ethereum', 'solana']),
    heldVia: z.enum(['fund', 'direct']),
    fund: z.string().trim().max(12).optional(), // e.g. IBIT, when held through a fund
    marketValue: z.number().positive().max(1e10),
    investedUsd: z.number().positive().max(1e10).nullable().optional(),
})

const AlertSettings = z.object({
    enabled: z.boolean(),
    cryptoPortfolio: z.object({
        enabled: z.boolean(),
        thresholdPct: z.number().min(1).max(25),
    }),
    currencies: z.array(z.object({
        coinId: z.enum(['bitcoin', 'ethereum', 'solana']),
        enabled: z.boolean(),
        thresholdPct: z.number().min(1).max(50),
    })).max(3),
})

const Body = z.object({
    goal: z.string().trim().min(1).max(120),
    cryptoReason: z.string().trim().max(120).default(''),
    timeHorizon: z.string().trim().min(1).max(60),
    dropComfortPct: z.number().min(0.5).max(25),
    alertSettings: AlertSettings,
    crypto: z.array(CryptoHolding).min(1).max(20),
    cashUsd: z.number().min(0).max(1e10),
    investmentsUsd: z.number().min(0).max(1e10),
})

const COIN = { bitcoin: ['BTC', 'Bitcoin'], ethereum: ['ETH', 'Ethereum'], solana: ['SOL', 'Solana'] } as const

/** Crypto in detail, everything else as two buckets, stored as positions. Crypto units are fixed at today's price. */
function toPositions(body: z.infer<typeof Body>, prices: Awaited<ReturnType<typeof livePrices>>) {
    const crypto = body.crypto.map((c) => {
        const [symbol, name] = COIN[c.coinId]
        const fund = c.fund?.toUpperCase()
        return c.heldVia === 'fund'
            ? { symbol: fund || symbol, name: `${name} (${fund ? `${fund} fund` : 'fund'})`, assetClass: 'crypto_etf', coinId: c.coinId, marketValue: c.marketValue, investedUsd: c.investedUsd ?? null, units: unitsFor(c.marketValue, c.coinId, prices) }
            : { symbol, name: `${name} (held directly)`, assetClass: 'crypto', coinId: c.coinId, marketValue: c.marketValue, investedUsd: c.investedUsd ?? null, units: unitsFor(c.marketValue, c.coinId, prices) }
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
    const { goal, cryptoReason, timeHorizon, dropComfortPct, alertSettings } = parsed.data
    const heldCoinIds = [...new Set(parsed.data.crypto.map((holding) => holding.coinId))]
    const configuredCoinIds = alertSettings.currencies.map((setting) => setting.coinId)
    if (new Set(configuredCoinIds).size !== configuredCoinIds.length || heldCoinIds.some((coinId) => !configuredCoinIds.includes(coinId)) || configuredCoinIds.some((coinId) => !heldCoinIds.includes(coinId))) {
        return NextResponse.json({ error: 'Alert settings must include each held currency exactly once.' }, { status: 400 })
    }
    const positions = toPositions(parsed.data, await livePrices())

    // Insights quote these numbers, so clear them only if something they depend on changed
    // Compare against what the user saw: live values, to the dollar
    const current = (await loadInvestor(investor.id))!
    const fingerprint = (x: { goal: string; cryptoReason: string; timeHorizon: string; dropComfortPct: number; positions: { name: string; coinId: string | null; marketValue: number }[] }) =>
        JSON.stringify([x.goal, x.cryptoReason, x.timeHorizon, x.dropComfortPct, x.positions.map((p) => [p.name, p.coinId, Math.round(p.marketValue)]).sort()])
    const changed = fingerprint(current) !== fingerprint({ goal, cryptoReason, timeHorizon, dropComfortPct, positions })

    await prisma.$transaction([
        prisma.position.deleteMany({ where: { investorId: investor.id } }),
        prisma.currencyAlertPreference.deleteMany({ where: { investorId: investor.id } }),
        ...(changed ? [prisma.insight.deleteMany({ where: { investorId: investor.id } })] : []),
        prisma.investor.update({
            where: { id: investor.id },
            data: {
                goal,
                cryptoReason,
                timeHorizon,
                dropComfortPct,
                alertEnabled: alertSettings.enabled,
                alertThresholdPct: alertSettings.currencies[0]?.thresholdPct ?? investor.alertThresholdPct,
                cryptoPortfolioAlertEnabled: alertSettings.cryptoPortfolio.enabled,
                cryptoPortfolioAlertPct: alertSettings.cryptoPortfolio.thresholdPct,
                cryptoPortfolioAlertCrossed: false,
                positions: { create: positions },
                currencyAlertPreferences: {
                    create: alertSettings.currencies.map((setting) => ({
                        coinId: setting.coinId,
                        enabled: setting.enabled,
                        thresholdPct: setting.thresholdPct,
                        isCrossed: false,
                    })),
                },
            },
        }),
    ])
    return NextResponse.json({ ok: true, insightsCleared: changed })
}
