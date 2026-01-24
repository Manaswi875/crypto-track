import redis from '@/lib/redis'
import prisma from '@/lib/prisma'
import { VolatilityDetector } from './volatilityDetector'

const COINGECKO_API = 'https://api.coingecko.com/api/v3'
const SUPPORTED_COINS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'ripple']

export class PriceTracker {
    private detector: VolatilityDetector

    constructor() {
        this.detector = new VolatilityDetector()
    }

    async start() {
        console.log('Starting Price Tracker...')
        // Initial fetch and then poll every 30 seconds (adjust for production)
        this.fetchPrices()
        setInterval(() => this.fetchPrices(), 30000)
    }

    private async fetchPrices() {
        try {
            const ids = SUPPORTED_COINS.join(',')
            const response = await fetch(
                `${COINGECKO_API}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`
            )
            const data = await response.json()

            for (const coinId of SUPPORTED_COINS) {
                const priceData = data[coinId]
                if (!priceData) continue

                const currentPrice = priceData.usd
                const volume24h = priceData.usd_24h_vol
                const change24h = priceData.usd_24h_change

                // 1. Update Redis Cache
                if (redis) {
                    await redis.set(`price:${coinId}`, currentPrice.toString())
                    await redis.publish('price-updates', JSON.stringify({
                        coinId,
                        price: currentPrice,
                        change24h,
                        volume24h,
                        timestamp: Date.now()
                    }))
                }

                // 2. Persist to DB (for history)
                await prisma.priceHistory.create({
                    data: {
                        coinId,
                        price: currentPrice,
                        volume: volume24h,
                    }
                })

                // 3. Update Coin last price
                await prisma.coin.upsert({
                    where: { id: coinId },
                    update: { lastPrice: currentPrice },
                    create: {
                        id: coinId,
                        symbol: this.getSymbol(coinId),
                        name: this.capitalize(coinId),
                        lastPrice: currentPrice
                    }
                })

                // 4. Run Volatility Detection
                await this.detector.analyze(coinId, currentPrice)
            }
        } catch (error) {
            console.error('Error fetching prices:', error)
        }
    }

    private getSymbol(id: string) {
        const symbols: Record<string, string> = {
            bitcoin: 'btc',
            ethereum: 'eth',
            solana: 'sol',
            cardano: 'ada',
            ripple: 'xrp'
        }
        return symbols[id] || id
    }

    private capitalize(s: string) {
        return s.charAt(0).toUpperCase() + s.slice(1)
    }
}
