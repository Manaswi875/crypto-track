import prisma from '@/lib/prisma'
import { HISTORY_TTL, coingecko, historyPath } from '@/lib/coingecko'

// Coins people commonly hold; a replayed day applies each one's real move
export const REPLAY_COINS = ['bitcoin', 'ethereum', 'solana'] as const
type ReplayCoin = (typeof REPLAY_COINS)[number]

const MIN_DROP_PCT = -5 // a "crash" day: at least one coin down 5%+
const MIN_DAYS_APART = 14 // one day per sell-off, not several days of the same one
const MAX_OPTIONS = 6

const pctChange = (from: number, to: number) => Number((((to - from) / from) * 100).toFixed(2))
const cents = (n: number) => Math.round(n * 100) / 100
const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10)

type Daily = { ts: number; open: number; close: number; change: number; idx: number }

/** Daily closes for each coin over the past year, keyed by date. Uses the cached series. */
async function loadYear() {
    const series = {} as Record<ReplayCoin, { prices: [number, number][]; byDay: Map<string, Daily> }>
    for (const coin of REPLAY_COINS) {
        const data = await coingecko<{ prices?: [number, number][] }>(historyPath(coin, '365'), HISTORY_TTL['365'])
        const prices = data.prices ?? []
        const byDay = new Map<string, Daily>()
        for (let i = 1; i < prices.length; i++) {
            byDay.set(dayKey(prices[i][0]), { ts: prices[i][0], open: prices[i - 1][1], close: prices[i][1], change: pctChange(prices[i - 1][1], prices[i][1]), idx: i })
        }
        series[coin] = { prices, byDay }
    }
    return series
}

export type CrashOption = {
    date: string
    leadCoinId: ReplayCoin
    moves: Record<ReplayCoin, number>
    kind: 'market-wide' | 'coin-led'
}

/**
 * Distinct real crash days from the past year: the worst days across the
 * tracked coins, at least two weeks apart, so each option is a different
 * sell-off rather than the same one seen through different coins.
 */
export async function listCrashOptions(): Promise<CrashOption[]> {
    const series = await loadYear()
    const days = new Set(REPLAY_COINS.flatMap((c) => [...series[c].byDay.keys()]))

    const candidates: CrashOption[] = []
    for (const date of days) {
        const moves = {} as Record<ReplayCoin, number>
        for (const c of REPLAY_COINS) {
            const d = series[c].byDay.get(date)
            if (!d) break
            moves[c] = d.change
        }
        if (Object.keys(moves).length !== REPLAY_COINS.length) continue
        const leadCoinId = REPLAY_COINS.reduce((a, b) => (moves[b] < moves[a] ? b : a))
        if (moves[leadCoinId] > MIN_DROP_PCT) continue
        // Market-wide when even Bitcoin, usually the steadiest, fell hard
        const kind = moves.bitcoin <= -8 ? 'market-wide' : 'coin-led'
        candidates.push({ date, leadCoinId, moves, kind })
    }

    candidates.sort((a, b) => a.moves[a.leadCoinId] - b.moves[b.leadCoinId])
    const picked: CrashOption[] = []
    for (const c of candidates) {
        const t = Date.parse(c.date)
        if (picked.some((p) => Math.abs(Date.parse(p.date) - t) < MIN_DAYS_APART * 86_400_000)) continue
        picked.push(c)
        if (picked.length === MAX_OPTIONS) break
    }
    return picked
}

/** Record a real past crash day as a replay event, applying every coin's actual move that day. */
export async function createReplayEvent(date: string) {
    const series = await loadYear()
    const moves = {} as Record<ReplayCoin, number>
    for (const c of REPLAY_COINS) {
        const d = series[c].byDay.get(date)
        if (!d) throw new Error(`No price data for ${date}`)
        moves[c] = d.change
    }
    const leadCoinId = REPLAY_COINS.reduce((a, b) => (moves[b] < moves[a] ? b : a))
    const lead = series[leadCoinId].byDay.get(date)!
    const occurredAt = new Date(lead.ts)

    // One replay per day
    const existing = await prisma.volatilityEvent.findFirst({ where: { source: 'replay', occurredAt } })
    if (existing) return { event: existing, created: false }

    const leadPrices = series[leadCoinId].prices
    const priceAt = (daysBefore: number) => leadPrices[Math.max(0, lead.idx - daysBefore)][1]
    const yearPrices = leadPrices.slice(0, lead.idx + 1).map((p) => p[1])
    const context = {
        note: `Daily closing prices from CoinGecko for ${leadCoinId}, the coin that fell most that day, as of the event date`,
        price_on_event_date_usd: cents(lead.close),
        change_prior_30d_pct: pctChange(priceAt(30), lead.close),
        change_prior_90d_pct: pctChange(priceAt(90), lead.close),
        high_before_event_usd: cents(Math.max(...yearPrices)),
        low_before_event_usd: cents(Math.min(...yearPrices)),
        window_start: dayKey(leadPrices[lead.idx - 1][0]),
    }

    const event = await prisma.volatilityEvent.create({
        data: {
            coinId: leadCoinId,
            changePct: moves[leadCoinId],
            severity: Math.abs(moves[leadCoinId]) > 5 ? 'high' : 'medium',
            source: 'replay',
            startPrice: cents(lead.open),
            endPrice: cents(lead.close),
            windowLabel: '24h',
            context,
            moves,
            occurredAt,
        },
    })
    return { event, created: true }
}

let ensured: Promise<void> | null = null

/**
 * Make sure every past-crash option exists as an event, so the app always
 * shows the same set of real crashes. Runs once per server process; if price
 * history is unavailable it tries again on the next call.
 */
export function ensureCrashEvents() {
    ensured ??= (async () => {
        const options = await listCrashOptions()
        for (const o of options) await createReplayEvent(o.date)
    })().catch((err) => {
        ensured = null
        console.warn('[REPLAY] Could not load past crashes:', err instanceof Error ? err.message : err)
    })
    return ensured
}

export type AfterEffect = { days: number; moves: Record<string, number> } | null

/**
 * What actually happened after each past crash: each coin's change from the
 * crash-day close to 7 and 30 days later. History, not a prediction; null
 * when that much time hasn't passed yet.
 */
export async function afterEffects(dates: string[]): Promise<Record<string, { d7: AfterEffect; d30: AfterEffect }>> {
    const series = await loadYear()
    const out: Record<string, { d7: AfterEffect; d30: AfterEffect }> = {}
    const later = (date: string, days: number): AfterEffect => {
        const moves: Record<string, number> = {}
        for (const c of REPLAY_COINS) {
            const day = series[c].byDay.get(date)
            const future = day && series[c].prices[day.idx + days]
            if (!day || !future) return null
            moves[c] = pctChange(day.close, future[1])
        }
        return { days, moves }
    }
    for (const date of dates) out[date] = { d7: later(date, 7), d30: later(date, 30) }
    return out
}
