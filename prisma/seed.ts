import { PrismaClient } from '@prisma/client'
import { INVESTORS } from './demoData'

const prisma = new PrismaClient()

async function seedInvestors() {
    // Create-only: re-seeding never wipes an investor's edits or their generated insights
    for (const { positions, ...investor } of INVESTORS) {
        const exists = await prisma.investor.findUnique({ where: { id: investor.id } })
        if (exists) {
            if (investor.isDemo) await prisma.investor.update({ where: { id: investor.id }, data: investor })
            else if (investor.id === 'you') {
                const currentPositions = await prisma.position.findMany({ where: { investorId: investor.id } })
                const starterBitcoin = currentPositions.find((position) => position.coinId === 'bitcoin')
                const usesPreviousDemoCost = currentPositions.length === 3
                    && exists.cryptoReason === 'A meaningful long-term position in Bitcoin'
                    && starterBitcoin?.investedUsd === 12000
                    && currentPositions.some((position) => position.assetClass === 'cash' && position.marketValue === 10000)
                    && currentPositions.some((position) => position.assetClass === 'investments' && position.marketValue === 25000)
                if (usesPreviousDemoCost && starterBitcoin) {
                    await prisma.position.update({ where: { id: starterBitcoin.id }, data: { investedUsd: 15000 } })
                }
                const originalStarter = currentPositions.length === 3
                    && exists.cryptoReason === 'A small long-term bet on Bitcoin'
                    && currentPositions.some((position) => position.coinId === 'bitcoin' && position.marketValue >= 8000 && position.marketValue <= 12000)
                    && currentPositions.some((position) => position.assetClass === 'cash' && position.marketValue === 10000)
                    && currentPositions.some((position) => position.assetClass === 'investments' && position.marketValue === 30000)
                const firstSimplifiedStarter = currentPositions.length === 3
                    && exists.cryptoReason === 'A meaningful long-term position in Bitcoin'
                    && exists.dropComfortPct === 3
                    && currentPositions.some((position) => position.coinId === 'bitcoin' && position.marketValue >= 12000 && position.marketValue <= 18000)
                    && currentPositions.some((position) => position.assetClass === 'cash' && position.marketValue === 10000)
                    && currentPositions.some((position) => position.assetClass === 'investments' && position.marketValue === 25000)
                if ((originalStarter && [5, 30].includes(exists.dropComfortPct)) || firstSimplifiedStarter) {
                    await prisma.$transaction([
                        prisma.insight.deleteMany({ where: { investorId: investor.id } }),
                        prisma.position.deleteMany({ where: { investorId: investor.id } }),
                        prisma.investor.update({
                            where: { id: investor.id },
                            data: {
                                cryptoReason: investor.cryptoReason,
                                dropComfortPct: investor.dropComfortPct,
                                positions: { create: positions },
                            },
                        }),
                    ])
                }
            }
            continue
        }
        await prisma.investor.create({ data: { ...investor, positions: { create: positions } } })
    }
    console.log(`Investors: ${await prisma.investor.count()}`)
}

async function seedAlertPreferences() {
    const investors = await prisma.investor.findMany({ include: { positions: true } })
    for (const investor of investors) {
        const coinIds = [...new Set(investor.positions.flatMap((position) => position.coinId ? [position.coinId] : []))]
        for (const coinId of coinIds) {
            await prisma.currencyAlertPreference.upsert({
                where: { investorId_coinId: { investorId: investor.id, coinId } },
                update: {},
                create: {
                    investorId: investor.id,
                    coinId,
                    enabled: true,
                    thresholdPct: investor.alertThresholdPct,
                },
            })
        }
    }
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
    await seedAlertPreferences()

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
