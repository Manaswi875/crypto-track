import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
    // 1. Create a demo user
    const hashedPassword = await bcrypt.hash('password123', 10)
    const user = await prisma.user.upsert({
        where: { email: 'demo@cryptopulse.com' },
        update: {},
        create: {
            email: 'demo@cryptopulse.com',
            password: hashedPassword,
            name: 'Demo User',
        }
    })

    // 2. Initial Coins
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
