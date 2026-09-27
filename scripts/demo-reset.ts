/**
 * Put the example investors back to their demo state before a demo, without
 * deleting any generated insights or follow-ups (those cost money).
 * Your own portfolio is left alone unless you pass --include-you.
 *
 *   npm run demo:reset
 */
import prisma from '@/lib/prisma'
import { ensureCrashEvents } from '@/services/replay'
import { INVESTORS } from '../prisma/demoData'

async function main() {
    const includeYou = process.argv.includes('--include-you')
    for (const { positions, ...investor } of INVESTORS) {
        if (!investor.isDemo && !includeYou) continue
        await prisma.$transaction([
            prisma.position.deleteMany({ where: { investorId: investor.id } }),
            prisma.investor.upsert({
                where: { id: investor.id },
                update: { ...investor, positions: { create: positions } },
                create: { ...investor, positions: { create: positions } },
            }),
        ])
        console.log(`Reset ${investor.name}`)
    }
    // Stuck runs from an interrupted server can't finish; mark them retryable
    const stuck = await prisma.insight.updateMany({ where: { status: 'generating' }, data: { status: 'failed', error: 'Interrupted. Please retry.' } })
    if (stuck.count) console.log(`Marked ${stuck.count} interrupted insight(s) as retryable`)
    await ensureCrashEvents()
    console.log(`Past crashes: ${await prisma.volatilityEvent.count({ where: { source: 'replay' } })}`)
    console.log(`Insights kept: ${await prisma.insight.count({ where: { status: 'ready' } })}`)
    await prisma.$disconnect()
    process.exit(0)
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
