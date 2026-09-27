import prisma from '@/lib/prisma'

type PositionLike = { symbol: string; name: string; coinId: string | null; marketValue: number }
type EventLike = { coinId: string; changePct: number; moves?: unknown }

/** % move per coin for an event. Replays carry every coin's real move that day; live events move one coin. */
export type CoinMoves = Record<string, number>

export function eventMoves(event: EventLike): CoinMoves {
    const moves = event.moves
    if (moves && typeof moves === 'object' && !Array.isArray(moves)) {
        return Object.fromEntries(Object.entries(moves as Record<string, unknown>).filter(([, v]) => typeof v === 'number')) as CoinMoves
    }
    return { [event.coinId]: event.changePct }
}

export type PortfolioImpact = {
    totalUsd: number
    exposureUsd: number
    exposurePctOfTotal: number
    impactUsd: number
    impactPctOfTotal: number
    exposedPositions: { symbol: string; name: string; coinId: string; marketValue: number; movePct: number; impactUsd: number }[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Deterministic impact of a market move on one portfolio: each crypto holding
 * moves by its own coin's real % that day. The math lives in code, not in the
 * model: the agent is handed these numbers and must quote them.
 */
export function portfolioImpact(positions: PositionLike[], moves: CoinMoves): PortfolioImpact {
    const totalUsd = positions.reduce((s, x) => s + x.marketValue, 0)
    const exposed = positions
        .filter((x): x is PositionLike & { coinId: string } => x.coinId != null && moves[x.coinId] != null)
        .map((x) => ({
            symbol: x.symbol,
            name: x.name,
            coinId: x.coinId,
            marketValue: x.marketValue,
            movePct: moves[x.coinId],
            impactUsd: Math.round(x.marketValue * (moves[x.coinId] / 100)),
        }))
    const exposureUsd = exposed.reduce((s, x) => s + x.marketValue, 0)
    const impactUsd = exposed.reduce((s, x) => s + x.impactUsd, 0)
    return {
        totalUsd,
        exposureUsd,
        exposurePctOfTotal: totalUsd ? round2((exposureUsd / totalUsd) * 100) : 0,
        impactUsd,
        impactPctOfTotal: totalUsd ? round2((impactUsd / totalUsd) * 100) : 0,
        exposedPositions: exposed,
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
    const moves = eventMoves(event)

    const households = await prisma.household.findMany({
        where: { holdings: { some: { coinId: { in: Object.keys(moves) } } } },
        include: { holdings: true },
    })

    return households
        .map((h) => {
            const p = portfolioImpact(h.holdings, moves)
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
