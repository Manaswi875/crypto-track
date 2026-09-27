import prisma from '@/lib/prisma'
import { ensureCrashEvents } from '@/services/replay'

/** Events worth showing: recent live moves, plus the real past crashes. */
export async function listEvents() {
    await ensureCrashEvents()
    const [replays, live] = await Promise.all([
        prisma.volatilityEvent.findMany({ where: { source: 'replay' }, orderBy: { occurredAt: 'desc' }, include: { coin: true } }),
        prisma.volatilityEvent.findMany({ where: { source: 'live' }, orderBy: { occurredAt: 'desc' }, take: 10, include: { coin: true } }),
    ])
    return [...live, ...replays]
}
