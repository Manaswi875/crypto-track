import redis from '@/lib/redis'
import prisma from '@/lib/prisma'

const WINDOW_SIZE = 20 // Number of observations for rolling stats
const STDEV_MULTIPLIER = 2.5 // k factor for anomaly detection
// With 30s samples the rolling stdev is tiny, so 2.5σ alone flags ~0.1% noise.
// Require a meaningful move, and at most one event per coin per cooldown window.
const MIN_MOVE_PCT = 3
// Only raise events for coins people can hold in the app
const EVENT_COINS = new Set(['bitcoin', 'ethereum', 'solana'])
const COOLDOWN_SECONDS = 30 * 60

export class VolatilityDetector {
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

        const changePct = ((currentPrice - mean) / mean) * 100

        if (EVENT_COINS.has(coinId) && priceChange > threshold && stdDev > 0 && Math.abs(changePct) >= MIN_MOVE_PCT) {
            const fresh = await redis.set(`volatility-cooldown:${coinId}`, '1', 'EX', COOLDOWN_SECONDS, 'NX')
            if (!fresh) return

            console.warn(`[VOLATILITY] ${coinId} detected anomaly! Change: ${changePct.toFixed(2)}%`)

            // 5. Save Event
            await prisma.volatilityEvent.create({
                data: {
                    coinId,
                    changePct,
                    severity: Math.abs(changePct) > 5 ? 'high' : 'medium'
                }
            })
        }
    }
}
