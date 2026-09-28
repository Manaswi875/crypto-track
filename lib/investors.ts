import prisma from '@/lib/prisma'
import { OVERVIEW_PATH, OVERVIEW_TTL, coingecko } from '@/lib/coingecko'

export type LivePrice = { price: number; change24hPct: number }

/** Current price and 24h change per coin, from the cached market overview. Empty if unavailable. */
export async function livePrices(): Promise<Record<string, LivePrice>> {
    try {
        const coins = await coingecko<{ id: string; current_price: number; price_change_percentage_24h_in_currency: number | null }[]>(OVERVIEW_PATH, OVERVIEW_TTL)
        return Object.fromEntries(coins.map((c) => [c.id, { price: c.current_price, change24hPct: c.price_change_percentage_24h_in_currency ?? 0 }]))
    } catch {
        return {}
    }
}

/** Coin units for a dollar amount at today's price, so the holding can follow the market from here. */
export const unitsFor = (valueUsd: number, coinId: string | null, prices: Record<string, LivePrice>) =>
    coinId && prices[coinId] ? valueUsd / prices[coinId].price : null

/**
 * An investor with every crypto holding valued at the live price. Holdings
 * saved before units existed get their units fixed at today's price.
 */
export async function loadInvestor(id: string) {
    const investor = await prisma.investor.findUnique({
        where: { id },
        include: {
            positions: { orderBy: { marketValue: 'desc' } },
            currencyAlertPreferences: true,
        },
    })
    if (!investor) return null
    const prices = await livePrices()

    const positions = await Promise.all(
        investor.positions.map(async (p) => {
            let units = p.units
            if (units == null && p.coinId && prices[p.coinId]) {
                units = p.marketValue / prices[p.coinId].price
                await prisma.position.update({ where: { id: p.id }, data: { units } })
            }
            const live = p.coinId ? prices[p.coinId] : undefined
            if (units == null || !live) return { ...p, units, change24hUsd: 0, change24hPct: 0 }
            const value = Math.round(units * live.price * 100) / 100
            // Dollar change over 24h: today's value minus what it was worth a day ago
            const change24hUsd = Math.round((value - value / (1 + live.change24hPct / 100)) * 100) / 100
            return { ...p, units, marketValue: value, change24hUsd, change24hPct: live.change24hPct }
        }),
    )
    positions.sort((a, b) => b.marketValue - a.marketValue)
    const preferences = new Map(investor.currencyAlertPreferences.map((preference) => [preference.coinId, preference]))
    const heldCoinIds = [...new Set(positions.flatMap((position) => position.coinId ? [position.coinId] : []))]
    const alertSettings = {
        enabled: investor.alertEnabled,
        cryptoPortfolio: {
            enabled: investor.cryptoPortfolioAlertEnabled,
            thresholdPct: investor.cryptoPortfolioAlertPct,
        },
        currencies: heldCoinIds.map((coinId) => ({
            coinId,
            enabled: preferences.get(coinId)?.enabled ?? true,
            thresholdPct: preferences.get(coinId)?.thresholdPct ?? investor.alertThresholdPct,
        })),
    }
    const { currencyAlertPreferences: _preferences, ...base } = investor
    return { ...base, positions, alertSettings }
}

export type LoadedInvestor = NonNullable<Awaited<ReturnType<typeof loadInvestor>>>
