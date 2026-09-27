import prisma from '@/lib/prisma'

type PositionLike = { symbol: string; name: string; coinId: string | null; marketValue: number }

export type PortfolioImpact = {
    totalUsd: number
    exposureUsd: number
    exposurePctOfTotal: number
    impactUsd: number
    impactPctOfTotal: number
    exposedPositions: { symbol: string; name: string; marketValue: number }[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Deterministic impact of a price move on one portfolio. The math lives in
 * code, not in the model: the agent is handed these numbers and must quote them.
 */
export function portfolioImpact(positions: PositionLike[], coinId: string, changePct: number): PortfolioImpact {
    const totalUsd = positions.reduce((s, x) => s + x.marketValue, 0)
    const exposed = positions.filter((x) => x.coinId === coinId)
    const exposureUsd = exposed.reduce((s, x) => s + x.marketValue, 0)
    const impactUsd = exposureUsd * (changePct / 100)
    return {
        totalUsd,
        exposureUsd,
        exposurePctOfTotal: totalUsd ? round2((exposureUsd / totalUsd) * 100) : 0,
        impactUsd: Math.round(impactUsd),
        impactPctOfTotal: totalUsd ? round2((impactUsd / totalUsd) * 100) : 0,
        exposedPositions: exposed.map((x) => ({ symbol: x.symbol, name: x.name, marketValue: x.marketValue })),
    }
}

export type HouseholdImpact = {
    householdId: string
    name: string
    primaryContact: string
    riskProfile: string
    lifeStage: string
    aumUsd: number
    exposureUsd: number
    exposurePctOfAum: number
    impactUsd: number
    impactPctOfAum: number
    exposedHoldings: { symbol: string; name: string; marketValue: number }[]
}

/** The same calculation across an advisor's whole book, ranked by dollar impact. */
export async function computeEventImpact(eventId: string): Promise<HouseholdImpact[]> {
    const event = await prisma.volatilityEvent.findUniqueOrThrow({ where: { id: eventId } })

    const households = await prisma.household.findMany({
        where: { holdings: { some: { coinId: event.coinId } } },
        include: { holdings: true },
    })

    return households
        .map((h) => {
            const p = portfolioImpact(h.holdings, event.coinId, event.changePct)
            return {
                householdId: h.id,
                name: h.name,
                primaryContact: h.primaryContact,
                riskProfile: h.riskProfile,
                lifeStage: h.lifeStage,
                aumUsd: p.totalUsd,
                exposureUsd: p.exposureUsd,
                exposurePctOfAum: p.exposurePctOfTotal,
                impactUsd: p.impactUsd,
                impactPctOfAum: p.impactPctOfTotal,
                exposedHoldings: p.exposedPositions,
            }
        })
        .sort((a, b) => Math.abs(b.impactUsd) - Math.abs(a.impactUsd))
}
