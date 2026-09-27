import redis from '@/lib/redis'

const COINGECKO_API = 'https://api.coingecko.com/api/v3'

export const MARKET_COINS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'ripple']

export const OVERVIEW_PATH = `/coins/markets?vs_currency=usd&ids=${MARKET_COINS.join(',')}&price_change_percentage=24h,7d,30d`
export const OVERVIEW_TTL = 120

export const HISTORY_DAYS = ['1', '7', '30', '365'] as const
// Longer ranges change slowly, so they can be cached for longer
export const HISTORY_TTL: Record<(typeof HISTORY_DAYS)[number], number> = { '1': 300, '7': 1200, '30': 3600, '365': 6 * 3600 }
export const historyPath = (coin: string, days: string) => `/coins/${coin}/market_chart?vs_currency=usd&days=${days}`

const STALE_TTL = 7 * 24 * 60 * 60

/**
 * GET a CoinGecko endpoint, cached in Redis. The free API is rate limited, so
 * every page view must not become an upstream request. On an upstream failure,
 * serve the last good copy if there is one.
 */
export async function coingecko<T>(path: string, ttlSeconds: number): Promise<T> {
    const key = `coingecko:${path}`
    if (redis) {
        const cached = await redis.get(key)
        if (cached) return JSON.parse(cached) as T
    }

    const res = await fetch(`${COINGECKO_API}${path}`)
    if (!res.ok) {
        const stale = redis ? await redis.get(`${key}:stale`) : null
        if (stale) return JSON.parse(stale) as T
        throw new Error(`CoinGecko returned ${res.status}`)
    }

    const body = await res.text()
    if (redis) {
        await redis.set(key, body, 'EX', ttlSeconds)
        await redis.set(`${key}:stale`, body, 'EX', STALE_TTL)
    }
    return JSON.parse(body) as T
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Fill the cache slowly in the background (the free API allows only a few
 * calls a minute), so market pages load from cache instead of upstream.
 */
export async function warmMarketCache() {
    if (!redis) return
    const paths = [OVERVIEW_PATH, ...MARKET_COINS.flatMap((c) => HISTORY_DAYS.map((d) => historyPath(c, d)))]
    let warmed = 0
    for (const path of paths) {
        if (await redis.exists(`coingecko:${path}:stale`)) continue
        try {
            await coingecko(path, path === OVERVIEW_PATH ? OVERVIEW_TTL : HISTORY_TTL[(path.split('days=')[1] ?? '1') as (typeof HISTORY_DAYS)[number]])
            warmed++
        } catch {
            // Rate limited: back off and move on; the next start picks it up
            await sleep(30_000)
        }
        await sleep(10_000)
    }
    if (warmed) console.log(`[MARKETS] Warmed ${warmed} CoinGecko cache entries`)
}
