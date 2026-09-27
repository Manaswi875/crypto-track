import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import * as z from 'zod/v4'
import redis from '@/lib/redis'
import { MARKET_COINS } from '@/lib/coingecko'
import { checkClientMessage } from '@/lib/compliance'
import { marketToday } from '@/lib/marketStats'
import { FALLBACK_BETA, MODEL, getAnthropic } from '@/lib/anthropic'

const CACHE_KEY = 'market-summary'
const CACHE_SECONDS = 4 * 60 * 60

const Summary = z.object({
    headline: z.string().describe('One line, at most 14 words, on the state of the crypto market'),
    happening: z.array(z.string()).max(3).describe('2-3 short points (at most 25 words each) on what is happening across the coins: leaders, laggards, how unusual the moves are'),
    to_weigh: z
        .array(z.object({ coin: z.string().describe('Coin name'), point: z.string().describe('At most 25 words') }))
        .describe('For each coin, the main thing to weigh before investing: trend, how much it swings, distance from its peak. Facts, never a recommendation.'),
})
export type MarketSummary = z.infer<typeof Summary> & { generatedAt: string; complianceFlags: { rule: string; match: string }[] }

const SYSTEM_PROMPT = `You write a short, plain-English read of today's crypto market for everyday investors, from the data provided.

- Use only numbers from the data, rounded sensibly. Do not invent news or causes; you have prices only.
- Explain what is happening across the coins and what someone should weigh before investing in each: recent trend, how much it typically swings (risk), and how far it is from its peak or its 1-year average.
- Never say whether to buy or sell, never call something a good or bad investment, and never predict prices. Give the facts people weigh; they decide.
- Be brief. Every point short.`

export async function getCachedMarketSummary(): Promise<MarketSummary | null> {
    const cached = redis ? await redis.get(CACHE_KEY) : null
    return cached ? (JSON.parse(cached) as MarketSummary) : null
}

export async function generateMarketSummary(): Promise<MarketSummary> {
    const market = await marketToday(MARKET_COINS)
    const data = {
        crypto_market_24h_pct: market.change24hPct,
        coins: Object.values(market.coins).map((c) => ({
            coin: c.name,
            price_usd: c.price,
            change_24h_pct: c.change24hPct,
            change_7d_pct: c.change7dPct,
            change_30d_pct: c.change30dPct,
            typical_daily_move_pct: c.typicalDailyMovePct,
            today_vs_typical_move: c.todayVsTypical,
            vs_1y_average_pct: c.vsYearAvgPct,
            below_all_time_high_pct: c.belowAllTimeHighPct,
            market_cap_usd: c.marketCap,
        })),
    }

    const response = await getAnthropic().beta.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(Summary) },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Today's market data:\n${JSON.stringify(data, null, 2)}` }],
    })
    if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error('Could not summarise the market right now')

    const out = response.parsed_output
    const text = [out.headline, ...out.happening, ...out.to_weigh.map((w) => w.point)].join('\n')
    const summary: MarketSummary = { ...out, generatedAt: new Date().toISOString(), complianceFlags: checkClientMessage(text) }
    if (redis) await redis.set(CACHE_KEY, JSON.stringify(summary), 'EX', CACHE_SECONDS)
    return summary
}
