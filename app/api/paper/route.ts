import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { livePrices, loadInvestor } from '@/lib/investors'

export const dynamic = 'force-dynamic'

const COINS = {
    bitcoin: { symbol: 'BTC', name: 'Bitcoin' },
    ethereum: { symbol: 'ETH', name: 'Ethereum' },
    solana: { symbol: 'SOL', name: 'Solana' },
} as const

type CoinId = keyof typeof COINS

const Action = z.discriminatedUnion('action', [
    z.object({ action: z.literal('start'), startingCashUsd: z.number().min(1000).max(1_000_000) }),
    z.object({ action: z.literal('reset'), startingCashUsd: z.number().min(1000).max(1_000_000) }),
    z.object({ action: z.literal('buy'), coinId: z.enum(['bitcoin', 'ethereum', 'solana']), valueUsd: z.number().min(10).max(1_000_000) }),
    z.object({ action: z.literal('sell'), coinId: z.enum(['bitcoin', 'ethereum', 'solana']), valueUsd: z.number().min(10).max(1_000_000) }),
    z.object({ action: z.literal('liquidate'), coinId: z.enum(['bitcoin', 'ethereum', 'solana']) }),
])

async function snapshot() {
    const [investor, prices, trades] = await Promise.all([
        loadInvestor('you'),
        livePrices(),
        prisma.paperTrade.findMany({
            where: { investorId: 'you' },
            orderBy: { createdAt: 'desc' },
            take: 30,
        }),
    ])
    if (!investor) return null

    const cashUsd = investor.positions.filter((position) => position.assetClass === 'cash').reduce((sum, position) => sum + position.marketValue, 0)
    const holdings = investor.positions.filter((position) => position.coinId).map((position) => ({
        id: position.id,
        coinId: position.coinId as CoinId,
        symbol: position.symbol,
        name: position.name,
        units: position.units ?? 0,
        valueUsd: position.marketValue,
        investedUsd: position.investedUsd ?? 0,
        gainUsd: position.marketValue - (position.investedUsd ?? 0),
        gainPct: position.investedUsd ? ((position.marketValue - position.investedUsd) / position.investedUsd) * 100 : 0,
        change24hPct: position.change24hPct,
    }))
    const cryptoUsd = holdings.reduce((sum, holding) => sum + holding.valueUsd, 0)
    const totalUsd = cashUsd + cryptoUsd
    const startingCashUsd = investor.paperStartingCashUsd ?? 0

    return {
        active: investor.portfolioMode === 'paper',
        startedAt: investor.paperStartedAt,
        startingCashUsd,
        cashUsd,
        cryptoUsd,
        totalUsd,
        returnUsd: startingCashUsd ? totalUsd - startingCashUsd : 0,
        returnPct: startingCashUsd ? ((totalUsd - startingCashUsd) / startingCashUsd) * 100 : 0,
        holdings,
        prices: Object.entries(COINS).map(([coinId, coin]) => ({
            coinId,
            ...coin,
            price: prices[coinId]?.price ?? null,
            change24hPct: prices[coinId]?.change24hPct ?? 0,
        })),
        trades,
    }
}

export async function GET() {
    const data = await snapshot()
    return data ? NextResponse.json(data) : NextResponse.json({ error: 'Investor not found' }, { status: 404 })
}

async function resetPaperPortfolio(startingCashUsd: number) {
    await prisma.$transaction([
        prisma.insight.deleteMany({ where: { investorId: 'you' } }),
        prisma.paperTrade.deleteMany({ where: { investorId: 'you' } }),
        prisma.currencyAlertPreference.deleteMany({ where: { investorId: 'you' } }),
        prisma.position.deleteMany({ where: { investorId: 'you' } }),
        prisma.investor.update({
            where: { id: 'you' },
            data: {
                portfolioMode: 'paper',
                paperStartingCashUsd: startingCashUsd,
                paperStartedAt: new Date(),
                cryptoPortfolioAlertCrossed: false,
                positions: {
                    create: { symbol: 'CASH', name: 'Virtual cash', assetClass: 'cash', marketValue: startingCashUsd },
                },
            },
        }),
    ])
}

export async function POST(req: Request) {
    const parsed = Action.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid paper trade' }, { status: 400 })

    const investor = await prisma.investor.findUnique({ where: { id: 'you' } })
    if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 })

    if (parsed.data.action === 'start' || parsed.data.action === 'reset') {
        await resetPaperPortfolio(parsed.data.startingCashUsd)
        return NextResponse.json(await snapshot())
    }

    const trade = parsed.data
    if (investor.portfolioMode !== 'paper') return NextResponse.json({ error: 'Start the paper portfolio first.' }, { status: 409 })
    const prices = await livePrices()
    const price = prices[trade.coinId]?.price
    if (!price) return NextResponse.json({ error: 'The live market price is unavailable. Try again shortly.' }, { status: 503 })

    try {
        await prisma.$transaction(async (tx) => {
            const cash = await tx.position.findFirst({ where: { investorId: 'you', assetClass: 'cash' } })
            if (!cash) throw new Error('Virtual cash balance is missing.')
            const holding = await tx.position.findFirst({ where: { investorId: 'you', coinId: trade.coinId } })
            const requestedValueUsd = trade.action === 'liquidate' ? 0 : Math.round(trade.valueUsd * 100) / 100
            const requestedUnits = requestedValueUsd / price

            if (trade.action === 'buy') {
                if (requestedValueUsd > cash.marketValue + 0.001) throw new Error('That trade is larger than your available virtual cash.')
                await tx.position.update({ where: { id: cash.id }, data: { marketValue: cash.marketValue - requestedValueUsd } })
                if (holding) {
                    const nextUnits = (holding.units ?? 0) + requestedUnits
                    await tx.position.update({
                        where: { id: holding.id },
                        data: { units: nextUnits, marketValue: nextUnits * price, investedUsd: (holding.investedUsd ?? 0) + requestedValueUsd },
                    })
                } else {
                    const coin = COINS[trade.coinId]
                    await tx.position.create({
                        data: {
                            investorId: 'you',
                            symbol: coin.symbol,
                            name: `${coin.name} (paper investment)`,
                            assetClass: 'crypto',
                            coinId: trade.coinId,
                            units: requestedUnits,
                            marketValue: requestedValueUsd,
                            investedUsd: requestedValueUsd,
                        },
                    })
                    await tx.currencyAlertPreference.upsert({
                        where: { investorId_coinId: { investorId: 'you', coinId: trade.coinId } },
                        update: {},
                        create: { investorId: 'you', coinId: trade.coinId, enabled: true, thresholdPct: investor.alertThresholdPct },
                    })
                }
                await tx.paperTrade.create({ data: { investorId: 'you', coinId: trade.coinId, side: 'buy', units: requestedUnits, priceUsd: price, valueUsd: requestedValueUsd } })
            } else {
                if (!holding?.units || holding.units <= 0) throw new Error(`You do not have a simulated ${COINS[trade.coinId].name} position.`)
                const currentValue = holding.units * price
                if (trade.action === 'sell' && requestedValueUsd > currentValue + 0.01) throw new Error('That trade is larger than your current simulated holding.')
                const soldUnits = trade.action === 'liquidate' ? holding.units : Math.min(requestedUnits, holding.units)
                const soldFraction = soldUnits / holding.units
                const removedCost = (holding.investedUsd ?? 0) * soldFraction
                const proceeds = soldUnits * price
                const remainingUnits = holding.units - soldUnits
                await tx.position.update({ where: { id: cash.id }, data: { marketValue: cash.marketValue + proceeds } })
                if (remainingUnits * price <= 0.01) {
                    await tx.position.delete({ where: { id: holding.id } })
                    await tx.currencyAlertPreference.deleteMany({ where: { investorId: 'you', coinId: trade.coinId } })
                } else {
                    await tx.position.update({
                        where: { id: holding.id },
                        data: { units: remainingUnits, marketValue: remainingUnits * price, investedUsd: Math.max(0, (holding.investedUsd ?? 0) - removedCost) },
                    })
                }
                await tx.paperTrade.create({
                    data: { investorId: 'you', coinId: trade.coinId, side: 'sell', units: soldUnits, priceUsd: price, valueUsd: proceeds, realizedPnlUsd: proceeds - removedCost },
                })
            }

            await tx.insight.deleteMany({ where: { investorId: 'you' } })
        })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not place the paper trade.' }, { status: 400 })
    }

    return NextResponse.json(await snapshot())
}
