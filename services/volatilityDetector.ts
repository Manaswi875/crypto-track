import redis from '@/lib/redis'
import prisma from '@/lib/prisma'
import { AIAnalyzer } from './aiAnalyzer'

const WINDOW_SIZE = 20 // Number of observations for rolling stats
const STDEV_MULTIPLIER = 2.5 // k factor for anomaly detection

export class VolatilityDetector {
    private aiAnalyzer: AIAnalyzer

    constructor() {
        this.aiAnalyzer = new AIAnalyzer()
    }

    async analyze(coinId: string, currentPrice: number) {
        if (!redis) return

        const key = `history:${coinId}`

        // 1. Add new price to rolling window in Redis
        await redis.lpush(key, currentPrice)
        await redis.ltrim(key, 0, WINDOW_SIZE - 1)

        // 2. Get history from Redis
        const history = await redis.lrange(key, 0, -1)
        const prices = history.map(p => parseFloat(p))

        if (prices.length < WINDOW_SIZE) return

        // 3. Compute Stats
        const mean = prices.reduce((a, b) => a + b, 0) / prices.length
        const stdDev = Math.sqrt(
            prices.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / prices.length
        )

        // 4. Check for Anomaly
        const priceChange = Math.abs(currentPrice - mean)
        const threshold = STDEV_MULTIPLIER * stdDev

        if (priceChange > threshold && stdDev > 0) {
            const changePct = ((currentPrice - mean) / mean) * 100
            console.warn(`[VOLATILITY] ${coinId} detected anomaly! Change: ${changePct.toFixed(2)}%`)

            // 5. Save Event
            const event = await prisma.volatilityEvent.create({
                data: {
                    coinId,
                    changePct,
                    severity: Math.abs(changePct) > 5 ? 'high' : 'medium'
                }
            })

            // 6. Trigger AI Analysis (Async)
            this.aiAnalyzer.explainMovement(event.id, coinId, currentPrice, changePct)
        }
    }
}
