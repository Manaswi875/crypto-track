'use client'

import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'
import { Panel } from '@/components/Badges'
import { pct, price, usd } from '@/lib/format'

export type Coin = {
    coinId: string
    price: number
    change24hPct: number
    change30dPct: number | null
    typicalDailyMovePct: number
    todayVsTypical: number
    yearAvg: number
    yearHigh: number
    yearLow: number
    vsYearAvgPct: number
    positionInYearRange: number
    last30Days: number[]
}
export type Holding = {
    id: string
    name: string
    coinId: string
    sellValueUsd: number
    investedUsd: number | null
    gainUsd: number | null
    gainPct: number | null
    coin: Coin | null
}
const COIN_NAME: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana' }

/** "Bitcoin (IBIT fund)" -> ["Bitcoin", "IBIT fund"] */
const splitName = (name: string) => {
    const m = name.match(/^(.*?)\s*\((.*)\)$/)
    return m ? [m[1], m[2]] : [name, '']
}

function dayLabel(ratio: number) {
    if (ratio < 1.5) return 'A normal day'
    if (ratio < 3) return 'A bigger move than usual'
    return 'An unusually big move'
}

/** One crypto holding: what it's worth today, what went in, profit or loss, and its market. */
export function HoldingMarketCard({ h, marketChange24hPct }: { h: Holding; marketChange24hPct: number }) {
    const [coinName, via] = splitName(h.name)
    const c = h.coin
    return (
        <Panel
            title={
                <span>
                    {coinName} {via && <span className="font-normal text-muted-foreground">· {via}</span>}
                </span>
            }
        >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Mini label="Worth today" value={usd(h.sellValueUsd)} />
                <Mini label="You put in" value={h.investedUsd != null ? usd(h.investedUsd) : '—'} />
                <Mini
                    label={h.gainUsd == null ? 'Profit or loss' : h.gainUsd >= 0 ? 'Profit' : 'Loss'}
                    value={h.gainUsd != null ? `${usd(h.gainUsd, { sign: true })} (${pct(h.gainPct ?? 0, 1)})` : '—'}
                    tone={h.gainUsd == null ? undefined : h.gainUsd >= 0 ? 'green' : 'red'}
                />
            </div>

            {c && (
                <div className="mt-5 grid grid-cols-1 gap-5 border-t pt-5 md:grid-cols-2">
                    <dl className="space-y-3 text-sm">
                        <Fact label="Today">
                            {COIN_NAME[h.coinId]} <Change v={c.change24hPct} /> vs the market <Change v={marketChange24hPct} />
                        </Fact>
                        <Fact label="Is today unusual?">
                            {dayLabel(c.todayVsTypical)}
                            <span className="block text-xs text-muted-foreground">A typical day moves about ±{c.typicalDailyMovePct.toFixed(1)}%</span>
                        </Fact>
                        <Fact label="Price vs its past year">
                            {price(c.price)}, {Math.abs(c.vsYearAvgPct).toFixed(0)}% {c.vsYearAvgPct >= 0 ? 'above' : 'below'} its 1-year average of {price(c.yearAvg)}
                            <RangeBar low={c.yearLow} high={c.yearHigh} avg={c.yearAvg} now={c.price} />
                        </Fact>
                    </dl>
                    <div>
                        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                            <span>Last 30 days</span>
                            {c.change30dPct != null && <Change v={c.change30dPct} />}
                        </div>
                        <div className="mt-2 h-28">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={c.last30Days.map((p, i) => ({ i, p }))}>
                                    <YAxis hide domain={['auto', 'auto']} />
                                    <Line type="monotone" dataKey="p" dot={false} strokeWidth={2} stroke={(c.change30dPct ?? 0) < 0 ? '#f87171' : '#34d399'} isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </Panel>
    )
}

export function Change({ v }: { v: number }) {
    return <span className={`tabular-nums ${v < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{pct(v, 1)}</span>
}

export function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'green' | 'red' }) {
    const color = tone === 'green' ? 'text-emerald-400' : tone === 'red' ? 'text-red-400' : ''
    return (
        <div className="rounded-xl border bg-card/50 px-4 py-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
            {hint && <div className={`text-sm tabular-nums ${color}`}>{hint}</div>}
        </div>
    )
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
    const color = tone === 'green' ? 'text-emerald-400' : tone === 'red' ? 'text-red-400' : ''
    return (
        <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
        </div>
    )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5">{children}</dd>
        </div>
    )
}

/** Where today's price sits between the 1-year low and high, with the average marked. */
export function RangeBar({ low, high, avg, now }: { low: number; high: number; avg: number; now: number }) {
    const at = (v: number) => `${Math.min(100, Math.max(0, ((v - low) / (high - low)) * 100))}%`
    return (
        <div className="mt-3">
            <div className="relative h-2 rounded-full bg-secondary">
                <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-muted-foreground" style={{ left: at(avg) }} title="1-year average" />
                <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary" style={{ left: at(now) }} title="Today" />
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>1-yr low {price(low)}</span>
                <span>high {price(high)}</span>
            </div>
        </div>
    )
}
