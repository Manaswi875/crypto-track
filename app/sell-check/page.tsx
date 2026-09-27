'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'
import { Panel } from '@/components/advisor/Badges'
import { pct, price, usd } from '@/lib/format'

type Coin = {
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
type Holding = {
    id: string
    name: string
    coinId: string
    sellValueUsd: number
    investedUsd: number | null
    gainUsd: number | null
    gainPct: number | null
    coin: Coin | null
}
type SellCheck = {
    investor: { id: string; name: string; isDemo: boolean }
    marketChange24hPct: number
    totals: { sellValueUsd: number; investedUsd: number | null; gainUsd: number | null; gainPct: number | null; missingInvested: number }
    holdings: Holding[]
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

export default function SellCheckPage() {
    const [investorId, setInvestorId] = useState<string | null>(null)
    const [data, setData] = useState<SellCheck | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setInvestorId(new URLSearchParams(window.location.search).get('investor') ?? 'you')
    }, [])

    useEffect(() => {
        if (!investorId) return
        fetch(`/api/investors/${investorId}/sell-check`).then(async (r) => {
            if (r.ok) setData(await r.json())
            else setError((await r.json()).error ?? 'Could not load')
        })
    }, [investorId])

    if (error) return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
    if (!data) return <div className="text-muted-foreground">Loading today&apos;s market…</div>

    const { totals, investor } = data
    const who = investor.isDemo ? investor.name : 'you'

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div>
                <Link href={`/?investor=${investor.id}`} className="text-sm text-muted-foreground hover:text-foreground">
                    ← {investor.isDemo ? `${investor.name}'s portfolio` : 'Your portfolio'}
                </Link>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">Before you sell</h2>
                <p className="text-muted-foreground">Today&apos;s market, what selling would get {who}, and the profit or loss overall.</p>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Figure label="If you sold all your crypto today" value={usd(totals.sellValueUsd)} />
                <Figure label="You put in" value={totals.investedUsd != null ? usd(totals.investedUsd) : '—'} />
                <Figure
                    label={totals.gainUsd == null ? 'Profit or loss' : totals.gainUsd >= 0 ? 'Profit overall' : 'Loss overall'}
                    value={totals.gainUsd != null ? `${usd(totals.gainUsd, { sign: true })}` : '—'}
                    hint={totals.gainPct != null ? pct(totals.gainPct, 1) : undefined}
                    tone={totals.gainUsd == null ? undefined : totals.gainUsd >= 0 ? 'green' : 'red'}
                />
            </div>
            {totals.missingInvested > 0 && (
                <p className="text-sm text-muted-foreground">
                    {totals.missingInvested === data.holdings.length ? 'Add' : `${totals.missingInvested} holding(s) are missing`} what you put in to see your profit or loss.{' '}
                    {!investor.isDemo && (
                        <Link href="/portfolio/edit" className="text-primary hover:underline">
                            Edit your portfolio →
                        </Link>
                    )}
                </p>
            )}

            <div className="rounded-lg border px-4 py-3 text-sm">
                <span className="text-muted-foreground">The crypto market today: </span>
                <span className={`font-medium tabular-nums ${data.marketChange24hPct < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{pct(data.marketChange24hPct)}</span>
                <span className="text-muted-foreground"> in the last 24 hours (the largest coins, weighted by size)</span>
            </div>

            {data.holdings.length === 0 && <p className="text-sm text-muted-foreground">No crypto in this portfolio.</p>}

            {data.holdings.map((h) => {
                const [coinName, via] = splitName(h.name)
                const c = h.coin
                return (
                    <Panel
                        key={h.id}
                        title={
                            <span>
                                {coinName} {via && <span className="font-normal text-muted-foreground">· {via}</span>}
                            </span>
                        }
                    >
                        {/* What selling would mean */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <Mini label="If you sell today" value={usd(h.sellValueUsd)} />
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
                                        {COIN_NAME[h.coinId]} <Change v={c.change24hPct} /> vs the market <Change v={data.marketChange24hPct} />
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
                                                <Line
                                                    type="monotone"
                                                    dataKey="p"
                                                    dot={false}
                                                    strokeWidth={2}
                                                    stroke={(c.change30dPct ?? 0) < 0 ? '#f87171' : '#34d399'}
                                                    isAnimationActive={false}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Panel>
                )
            })}

            <p className="text-xs text-muted-foreground">
                Values are what you entered for each holding; market data from CoinGecko. This shows the numbers. The decision is yours.
            </p>
        </div>
    )
}

function Change({ v }: { v: number }) {
    return <span className={`tabular-nums ${v < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{pct(v, 1)}</span>
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'green' | 'red' }) {
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
function RangeBar({ low, high, avg, now }: { low: number; high: number; avg: number; now: number }) {
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
