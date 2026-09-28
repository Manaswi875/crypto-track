import { NextResponse } from 'next/server'
import { loadInvestor } from '@/lib/investors'
import { marketToday } from '@/lib/marketStats'

export const dynamic = 'force-dynamic'

/** For each crypto holding: today's market, what selling today would return, and the overall profit or loss. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const investor = await loadInvestor(params.id)
    if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 })

    const crypto = investor.positions.filter((p): p is typeof p & { coinId: string } => p.coinId != null)
    let market
    try {
        market = await marketToday([...new Set(crypto.map((p) => p.coinId))])
    } catch {
        return NextResponse.json({ error: 'Market data is unavailable right now. Try again in a minute.' }, { status: 502 })
    }

    const holdings = crypto.map((p) => {
        const gainUsd = p.investedUsd != null ? p.marketValue - p.investedUsd : null
        return {
            id: p.id,
            name: p.name,
            coinId: p.coinId,
            sellValueUsd: p.marketValue,
            investedUsd: p.investedUsd,
            gainUsd,
            gainPct: gainUsd != null && p.investedUsd ? Math.round((gainUsd / p.investedUsd) * 10000) / 100 : null,
            coin: market.coins[p.coinId] ?? null,
        }
    })

    const known = holdings.filter((h) => h.investedUsd != null)
    const invested = known.reduce((s, h) => s + (h.investedUsd ?? 0), 0)
    const knownValue = known.reduce((s, h) => s + h.sellValueUsd, 0)

    return NextResponse.json({
        investor: {
            id: investor.id,
            name: investor.name,
            isDemo: investor.isDemo,
            goal: investor.goal,
            timeHorizon: investor.timeHorizon,
            dropComfortPct: investor.dropComfortPct,
            alertEnabled: investor.alertEnabled,
            alertThresholdPct: investor.alertThresholdPct,
            alertSettings: investor.alertSettings,
            totalWealthUsd: investor.positions.reduce((sum, position) => sum + position.marketValue, 0),
        },
        marketChange24hPct: market.change24hPct,
        totals: {
            sellValueUsd: holdings.reduce((s, h) => s + h.sellValueUsd, 0),
            investedUsd: known.length ? invested : null,
            gainUsd: known.length ? knownValue - invested : null,
            gainPct: known.length && invested ? Math.round(((knownValue - invested) / invested) * 10000) / 100 : null,
            missingInvested: holdings.length - known.length,
        },
        holdings,
    })
}
