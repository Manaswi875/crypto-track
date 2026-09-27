'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSocket } from '@/context/SocketContext'
import { Panel } from '@/components/Badges'
import { Holding, HoldingMarketCard } from '@/components/HoldingMarketCard'
import { movesOf } from '@/components/Moves'
import { date, dateTime, pct, price, usd } from '@/lib/format'

type CoinToday = {
    coinId: string
    name: string
    symbol: string
    marketCap: number
    price: number
    change24hPct: number
    change7dPct: number | null
    change30dPct: number | null
    belowAllTimeHighPct: number
    typicalDailyMovePct: number
    vsYearAvgPct: number
}
type Market = { change24hPct: number; coins: Record<string, CoinToday> }
type Summary = { headline: string; happening: string[]; to_weigh: { coin: string; point: string }[]; generatedAt: string }
type Mine = {
    investor: { id: string; name: string; isDemo: boolean }
    marketChange24hPct: number
    totals: { sellValueUsd: number; investedUsd: number | null; gainUsd: number | null; gainPct: number | null; missingInvested: number }
    holdings: Holding[]
}
type Point = { t: number; p: number }
type MarketEvent = { id: string; coinId: string; changePct: number; moves?: unknown; occurredAt: string }

const RANGES = [
    { days: '1', label: '1D' },
    { days: '7', label: '7D' },
    { days: '30', label: '30D' },
    { days: '365', label: '1Y' },
] as const

// How much a coin typically moves in a day, as a plain risk label
function swingLabel(typical: number) {
    if (typical < 1.5) return { label: 'Lower', className: 'text-emerald-400' }
    if (typical < 2.2) return { label: 'Medium', className: 'text-amber-300' }
    return { label: 'Higher', className: 'text-red-400' }
}

function Change({ v }: { v: number | null }) {
    if (v == null) return <span className="text-muted-foreground">—</span>
    return <span className={`tabular-nums ${v < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{pct(v, 1)}</span>
}

export default function MarketInsights() {
    const { socket } = useSocket()
    const [market, setMarket] = useState<Market | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [summary, setSummary] = useState<Summary | null>(null)
    const [aiEnabled, setAiEnabled] = useState(true)
    const [summarising, setSummarising] = useState(false)
    const [summaryError, setSummaryError] = useState<string | null>(null)
    const [mine, setMine] = useState<Mine | null>(null)
    const [events, setEvents] = useState<MarketEvent[]>([])
    const [coinId, setCoinId] = useState('bitcoin')
    const [days, setDays] = useState<(typeof RANGES)[number]['days']>('30')
    const [history, setHistory] = useState<Point[] | null>(null)
    const [historyError, setHistoryError] = useState<string | null>(null)

    useEffect(() => {
        const investorId = new URLSearchParams(window.location.search).get('investor') ?? 'you'
        fetch('/api/markets/today').then(async (r) => (r.ok ? setMarket(await r.json()) : setError((await r.json()).error ?? 'Market data unavailable')))
        fetch('/api/markets/summary').then(async (r) => {
            if (!r.ok) return
            const body = await r.json()
            setSummary(body.summary)
            setAiEnabled(body.aiEnabled)
        })
        fetch(`/api/investors/${investorId}/sell-check`).then(async (r) => r.ok && setMine(await r.json()))
        fetch('/api/events').then(async (r) => r.ok && setEvents(await r.json()))
    }, [])

    async function summarise() {
        setSummarising(true)
        setSummaryError(null)
        const r = await fetch('/api/markets/summary', { method: 'POST' })
        setSummarising(false)
        if (r.ok) setSummary((await r.json()).summary)
        else setSummaryError((await r.json()).error ?? 'Could not summarise the market')
    }

    const loadHistory = useCallback(async () => {
        setHistory(null)
        setHistoryError(null)
        const r = await fetch(`/api/markets/history?coin=${coinId}&days=${days}`)
        if (r.ok) setHistory((await r.json()).prices)
        else setHistoryError('The market data provider is busy right now. Try again in a minute.')
    }, [coinId, days])

    useEffect(() => {
        loadHistory()
    }, [loadHistory])

    // Live price ticks from our own tracker
    useEffect(() => {
        if (!socket) return
        socket.emit('subscribe', 'all-prices')
        const onPrice = (u: { coinId: string; price: number }) =>
            setMarket((m) => (m && m.coins[u.coinId] ? { ...m, coins: { ...m.coins, [u.coinId]: { ...m.coins[u.coinId], price: u.price } } } : m))
        socket.on('price-update', onPrice)
        return () => {
            socket.off('price-update', onPrice)
        }
    }, [socket])

    const coins = market ? Object.values(market.coins).sort((a, b) => b.marketCap - a.marketCap) : []
    const owned = new Set(mine?.holdings.map((h) => h.coinId) ?? [])
    const selected = market?.coins[coinId]

    const range = useMemo(() => {
        if (!history || history.length < 2) return null
        const prices = history.map((h) => h.p)
        return { change: ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100, high: Math.max(...prices), low: Math.min(...prices) }
    }, [history])

    // Mark saved big moves that fall inside the visible range
    const markers = useMemo(() => {
        if (!history || history.length === 0) return []
        const start = history[0].t
        return events
            .filter((e) => movesOf(e)[coinId] != null && new Date(e.occurredAt).getTime() >= start)
            .map((e) => {
                const ts = new Date(e.occurredAt).getTime()
                return { id: e.id, point: history.reduce((best, h) => (Math.abs(h.t - ts) < Math.abs(best.t - ts) ? h : best), history[0]) }
            })
    }, [events, history, coinId])

    const color = range && range.change < 0 ? '#f87171' : '#34d399'
    const tickFormat = (t: number) =>
        days === '1' ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric' }) : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Market Insights</h2>
                <p className="text-muted-foreground">What&apos;s happening across crypto, and how the market looks for what you hold.</p>
            </div>

            {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

            {/* 1. AI read of the market */}
            <Panel
                title="What's happening in crypto"
                action={
                    summary && (
                        <button onClick={summarise} disabled={summarising || !aiEnabled} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
                            {summarising ? 'Updating…' : `Updated ${dateTime(summary.generatedAt)} · Refresh`}
                        </button>
                    )
                }
            >
                {summarising && !summary ? (
                    <p className="animate-pulse text-sm text-muted-foreground">Reading today&apos;s market across all coins…</p>
                ) : summary ? (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div>
                            <p className="text-lg font-semibold leading-snug">{summary.headline}</p>
                            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                                {summary.happening.map((h, i) => (
                                    <li key={i}>{h}</li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What to weigh before investing</h4>
                            <ul className="mt-2 space-y-2 text-sm leading-relaxed">
                                {summary.to_weigh.map((w, i) => (
                                    <li key={i}>
                                        <span className="font-medium">{w.coin}:</span> <span className="text-muted-foreground">{w.point}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={summarise}
                            disabled={summarising || !aiEnabled}
                            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {summarising ? 'Reading the market…' : "Summarise today's market"}
                        </button>
                        <span className="text-xs text-muted-foreground">AI reads today&apos;s numbers across all coins: what&apos;s moving, and what to weigh before investing.</span>
                    </div>
                )}
                {summaryError && <p className="mt-2 text-sm text-red-400">{summaryError}</p>}
            </Panel>

            {/* 2. All coins side by side */}
            <Panel
                title="All coins today"
                action={market && <span className="text-xs text-muted-foreground">Crypto market 24h: <Change v={market.change24hPct} /></span>}
            >
                {!market ? (
                    <p className="text-sm text-muted-foreground">Loading market data…</p>
                ) : (
                    <div className="-mx-5 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                                    <th className="px-5 py-2 font-medium">Coin</th>
                                    <th className="px-3 py-2 text-right font-medium">Price</th>
                                    <th className="px-3 py-2 text-right font-medium">24h</th>
                                    <th className="px-3 py-2 text-right font-medium">7 days</th>
                                    <th className="px-3 py-2 text-right font-medium">30 days</th>
                                    <th className="px-3 py-2 text-right font-medium" title="How much it typically moves in a day">Daily swings</th>
                                    <th className="px-3 py-2 text-right font-medium">vs 1-yr avg</th>
                                    <th className="px-5 py-2 text-right font-medium">Below peak</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {coins.map((c) => {
                                    const swing = swingLabel(c.typicalDailyMovePct)
                                    return (
                                        <tr
                                            key={c.coinId}
                                            onClick={() => setCoinId(c.coinId)}
                                            className={`cursor-pointer hover:bg-secondary/30 ${coinId === c.coinId ? 'bg-secondary/40' : ''}`}
                                        >
                                            <td className="px-5 py-2.5">
                                                <span className="font-medium">{c.name}</span> <span className="text-xs text-muted-foreground">{c.symbol}</span>
                                                {owned.has(c.coinId) && <span className="ml-2 rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">You own</span>}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">{price(c.price)}</td>
                                            <td className="px-3 py-2.5 text-right"><Change v={c.change24hPct} /></td>
                                            <td className="px-3 py-2.5 text-right"><Change v={c.change7dPct} /></td>
                                            <td className="px-3 py-2.5 text-right"><Change v={c.change30dPct} /></td>
                                            <td className="px-3 py-2.5 text-right">
                                                <span className={swing.className}>{swing.label}</span>{' '}
                                                <span className="text-xs text-muted-foreground tabular-nums">±{c.typicalDailyMovePct.toFixed(1)}%</span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right"><Change v={c.vsYearAvgPct} /></td>
                                            <td className="px-5 py-2.5 text-right"><Change v={c.belowAllTimeHighPct} /></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>

            {/* 3. Price chart for the selected coin */}
            <Panel
                title={selected ? `${selected.name} price` : 'Price'}
                action={
                    <div className="flex rounded-md border text-xs">
                        {RANGES.map((r) => (
                            <button key={r.days} onClick={() => setDays(r.days)} className={`px-2.5 py-1 font-medium ${days === r.days ? 'bg-secondary' : 'text-muted-foreground'}`}>
                                {r.label}
                            </button>
                        ))}
                    </div>
                }
            >
                {range && (
                    <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                        <span>
                            Change <Change v={range.change} />
                        </span>
                        <span className="text-muted-foreground">
                            High <span className="text-foreground tabular-nums">{price(range.high)}</span>
                        </span>
                        <span className="text-muted-foreground">
                            Low <span className="text-foreground tabular-nums">{price(range.low)}</span>
                        </span>
                    </div>
                )}
                <div className="h-[300px]">
                    {historyError ? (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                            {historyError}
                            <button onClick={loadHistory} className="rounded-md border px-3 py-1 text-xs hover:bg-secondary">Retry</button>
                        </div>
                    ) : !history ? (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={tickFormat} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} minTickGap={40} />
                                <YAxis dataKey="p" domain={['auto', 'auto']} tickFormatter={(v) => price(v)} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} width={80} />
                                <Tooltip
                                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                                    labelFormatter={(t) => (days === '1' ? dateTime(new Date(Number(t))) : date(new Date(Number(t))))}
                                    formatter={(v) => [price(Number(v)), 'Price']}
                                />
                                <Area type="monotone" dataKey="p" stroke={color} strokeWidth={2} fill="url(#priceFill)" isAnimationActive={false} />
                                {markers.map((m) => (
                                    <ReferenceDot key={m.id} x={m.point.t} y={m.point.p} r={5} fill="#fbbf24" stroke="hsl(var(--background))" strokeWidth={2} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
                {markers.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                        <span className="text-amber-400">●</span> Past crashes. See what they meant for you on{' '}
                        <Link href="/" className="text-primary hover:underline">My Portfolio</Link>.
                    </p>
                )}
            </Panel>

            {/* 4. The user's own holdings in this market */}
            {mine && (
                <section id="yours" className="space-y-4">
                    <div>
                        <h3 className="text-xl font-semibold tracking-tight">{mine.investor.isDemo ? `${mine.investor.name}'s investments` : 'Your investments'} in this market</h3>
                        <p className="text-sm text-muted-foreground">How the market looks for each coin you hold, next to what it&apos;s worth and what went in.</p>
                    </div>
                    {mine.totals.missingInvested > 0 && !mine.investor.isDemo && (
                        <p className="text-sm text-muted-foreground">
                            Add what you put in to see your profit or loss. <Link href="/portfolio/edit" className="text-primary hover:underline">Edit your portfolio →</Link>
                        </p>
                    )}
                    {mine.holdings.map((h) => (
                        <HoldingMarketCard key={h.id} h={h} marketChange24hPct={mine.marketChange24hPct} />
                    ))}
                </section>
            )}

            <p className="text-xs text-muted-foreground">Market data from CoinGecko.</p>
        </div>
    )
}
