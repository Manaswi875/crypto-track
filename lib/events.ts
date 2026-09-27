import prisma from '@/lib/prisma'

/** Events worth showing: every historical replay, plus recent live moves. */
export async function listEvents() {
    const [replays, live] = await Promise.all([
        prisma.volatilityEvent.findMany({ where: { source: 'replay' }, orderBy: { occurredAt: 'desc' }, include: { coin: true } }),
        prisma.volatilityEvent.findMany({ where: { source: 'live' }, orderBy: { occurredAt: 'desc' }, take: 10, include: { coin: true } }),
    ])
    return [...live, ...replays]
}
