import { PrismaClient } from '@prisma/client'
import { INVESTORS } from './demoData'

const prisma = new PrismaClient()

async function seedInvestors() {
    // Create-only: re-seeding never wipes an investor's edits or their generated insights
    for (const { positions, ...investor } of INVESTORS) {
        const exists = await prisma.investor.findUnique({ where: { id: investor.id } })
        if (exists) continue
        await prisma.investor.create({ data: { ...investor, positions: { create: positions } } })
    }
    console.log(`Investors: ${await prisma.investor.count()}`)
}

async function main() {
    // 1. Coins
    const coins = [
        { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
        { id: 'ethereum', symbol: 'eth', name: 'Ethereum' },
        { id: 'solana', symbol: 'sol', name: 'Solana' },
        { id: 'cardano', symbol: 'ada', name: 'Cardano' },
        { id: 'ripple', symbol: 'xrp', name: 'Ripple' },
    ]

    for (const coin of coins) {
        await prisma.coin.upsert({
            where: { id: coin.id },
            update: {},
            create: coin
        })
    }

    // 2. Investors
    await seedInvestors()

    console.log('Seed completed successfully.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
