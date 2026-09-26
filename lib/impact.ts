import prisma from '@/lib/prisma'

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

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Deterministic impact of a price move on each household in the book.
 * The math lives in code, not in the model: the agent is handed these numbers
 * and must quote them, never compute its own.
 */
export async function computeEventImpact(eventId: string): Promise<HouseholdImpact[]> {
    const event = await prisma.volatilityEvent.findUniqueOrThrow({ where: { id: eventId } })

    const households = await prisma.household.findMany({
        where: { holdings: { some: { coinId: event.coinId } } },
        include: { holdings: true },
    })

    return households
        .map((h) => {
            const aumUsd = h.holdings.reduce((s, x) => s + x.marketValue, 0)
            const exposed = h.holdings.filter((x) => x.coinId === event.coinId)
            const exposureUsd = exposed.reduce((s, x) => s + x.marketValue, 0)
            const impactUsd = exposureUsd * (event.changePct / 100)
            return {
                householdId: h.id,
                name: h.name,
                primaryContact: h.primaryContact,
                riskProfile: h.riskProfile,
                lifeStage: h.lifeStage,
                aumUsd,
                exposureUsd,
                exposurePctOfAum: round2((exposureUsd / aumUsd) * 100),
                impactUsd: Math.round(impactUsd),
                impactPctOfAum: round2((impactUsd / aumUsd) * 100),
                exposedHoldings: exposed.map((x) => ({ symbol: x.symbol, name: x.name, marketValue: x.marketValue })),
            }
        })
        .sort((a, b) => Math.abs(b.impactUsd) - Math.abs(a.impactUsd))
}
