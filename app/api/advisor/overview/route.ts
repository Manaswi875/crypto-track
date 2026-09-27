import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getDemoAdvisor } from '@/lib/advisor'
import { hasAnthropicKey } from '@/lib/anthropic'
import { ensureCrashEvents } from '@/services/replay'

export const dynamic = 'force-dynamic'

// Assumption shown in the UI: minutes an advisor spends reviewing one household
// and writing a personal note by hand after a market move.
const MANUAL_MINUTES_PER_HOUSEHOLD = 15

export async function GET() {
    await ensureCrashEvents()
    const advisor = await getDemoAdvisor()
    const households = await prisma.household.findMany({ include: { holdings: true } })

    const aumUsd = households.reduce((s, h) => s + h.holdings.reduce((t, x) => t + x.marketValue, 0), 0)
    const cryptoByCoin: Record<string, { households: number; exposureUsd: number }> = {}
    for (const h of households) {
        const seen = new Set<string>()
        for (const x of h.holdings) {
            if (!x.coinId) continue
            cryptoByCoin[x.coinId] ??= { households: 0, exposureUsd: 0 }
            cryptoByCoin[x.coinId].exposureUsd += x.marketValue
            if (!seen.has(x.coinId)) cryptoByCoin[x.coinId].households++
            seen.add(x.coinId)
        }
    }
    const cryptoHouseholds = households.filter((h) => h.holdings.some((x) => x.coinId)).length

    const [replays, live] = await Promise.all([
        prisma.volatilityEvent.findMany({ where: { source: 'replay' }, orderBy: { occurredAt: 'desc' }, include: { coin: true, _count: { select: { briefs: true } } } }),
        prisma.volatilityEvent.findMany({ where: { source: 'live' }, orderBy: { createdAt: 'desc' }, take: 10, include: { coin: true, _count: { select: { briefs: true } } } }),
    ])

    const briefs = await prisma.brief.findMany({ where: { status: { in: ['draft', 'approved', 'rejected'] } } })
    const done = briefs.filter((b) => b.latencyMs != null)
    const reviewed = briefs.filter((b) => b.status === 'approved' || b.status === 'rejected')
    const metrics = {
        briefsGenerated: briefs.length,
        approved: briefs.filter((b) => b.status === 'approved').length,
        rejected: briefs.filter((b) => b.status === 'rejected').length,
        editedBeforeApproval: reviewed.filter((b) => b.edited).length,
        complianceFlagged: briefs.filter((b) => Array.isArray(b.complianceFlags) && b.complianceFlags.length > 0).length,
        avgLatencySec: done.length ? done.reduce((s, b) => s + (b.latencyMs ?? 0), 0) / done.length / 1000 : null,
        manualMinutesPerHousehold: MANUAL_MINUTES_PER_HOUSEHOLD,
    }

    return NextResponse.json({
        advisor,
        aiEnabled: hasAnthropicKey(),
        book: { households: households.length, aumUsd, cryptoHouseholds, cryptoByCoin },
        events: [...replays, ...live],
        metrics,
    })
}
