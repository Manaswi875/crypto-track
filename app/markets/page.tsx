'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSocket } from '@/context/SocketContext'
import { Holding, HoldingMarketCard } from '@/components/HoldingMarketCard'
import { movesOf } from '@/components/Moves'
import { DEMO_CRASH_MOVES, DEMO_MARKET_CHANGE_PCT } from '@/lib/demoCrash'
import { date, dateTime, pct, price, usd } from '@/lib/format'
import { cryptoLossSnapshot } from '@/lib/personalAlerts'

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
    investor: { id: string; name: string; isDemo: boolean; goal: string; timeHorizon: string; dropComfortPct: number; alertEnabled: boolean; alertThresholdPct: number; alertSettings: { enabled: boolean; cryptoPortfolio: { enabled: boolean; thresholdPct: number }; currencies: { coinId: string; enabled: boolean; thresholdPct: number }[] }; totalWealthUsd: number }
    marketChange24hPct: number
    totals: { sellValueUsd: number; investedUsd: number | null; gainUsd: number | null; gainPct: number | null; missingInvested: number }
    holdings: Holding[]
}
type Point = { t: number; p: number }
type MarketEvent = { id: string; coinId: string; changePct: number; moves?: unknown; source: string; occurredAt: string }

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
    const [viewMode, setViewMode] = useState<'live' | 'crash'>('live')

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const investorId = params.get('investor') ?? 'you'
        if (params.get('mode') === 'crash') setViewMode('crash')
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

    const displayedMarket = useMemo(() => {
        if (!market || viewMode === 'live') return market
        return {
            change24hPct: DEMO_MARKET_CHANGE_PCT,
            coins: Object.fromEntries(
                Object.entries(market.coins).map(([id, coin]) => [id, {
                    ...coin,
                    price: coin.price * (1 + (DEMO_CRASH_MOVES[id] ?? -10) / 100),
                    change24hPct: DEMO_CRASH_MOVES[id] ?? -10,
                }]),
            ),
        }
    }, [market, viewMode])
    const coins = displayedMarket ? Object.values(displayedMarket.coins).sort((a, b) => b.marketCap - a.marketCap) : []
    const owned = new Set(mine?.holdings.map((h) => h.coinId) ?? [])
    const selected = displayedMarket?.coins[coinId]

    const crashProfile = useMemo(() => {
        if (!mine) return null
        const holdings = mine.holdings.map((holding) => {
            const move = DEMO_CRASH_MOVES[holding.coinId] ?? -10
            const sellValueUsd = holding.sellValueUsd * (1 + move / 100)
            const gainUsd = holding.investedUsd == null ? null : sellValueUsd - holding.investedUsd
            return {
                ...holding,
                sellValueUsd,
                gainUsd,
                gainPct: gainUsd != null && holding.investedUsd ? (gainUsd / holding.investedUsd) * 100 : null,
                coin: holding.coin ? { ...holding.coin, price: holding.coin.price * (1 + move / 100), change24hPct: move } : null,
            }
        })
        const alertSnapshot = cryptoLossSnapshot(holdings.map((holding) => ({ coinId: holding.coinId, marketValue: holding.sellValueUsd, investedUsd: holding.investedUsd })))
        const impactUsd = holdings.reduce((sum, holding, index) => sum + (holding.sellValueUsd - mine.holdings[index].sellValueUsd), 0)
        const impactPctOfWealth = mine.investor.totalWealthUsd ? (impactUsd / mine.investor.totalWealthUsd) * 100 : 0
        const currencyRulesCrossed = mine.investor.alertSettings.currencies.some((setting) => setting.enabled && (alertSnapshot.currencies.find((currency) => currency.coinId === setting.coinId)?.lossPct ?? 0) <= -setting.thresholdPct)
        const portfolioRuleCrossed = alertSnapshot.complete && mine.investor.alertSettings.cryptoPortfolio.enabled && alertSnapshot.lossPct <= -mine.investor.alertSettings.cryptoPortfolio.thresholdPct
        return {
            holdings,
            impactUsd,
            impactPctOfWealth,
            cryptoImpactPct: alertSnapshot.lossPct,
            alertTriggered: mine.investor.alertSettings.enabled && (currencyRulesCrossed || portfolioRuleCrossed),
            toleranceExceeded: Math.abs(impactPctOfWealth) > mine.investor.dropComfortPct,
        }
    }, [mine])

    const displayedHistory = useMemo(() => {
        if (!history || viewMode === 'live') return history
        const crashMove = DEMO_CRASH_MOVES[coinId] ?? -10
        const startIndex = Math.floor(history.length * 0.72)
        return history.map((point, index) => {
            if (index < startIndex) return point
            const progress = (index - startIndex) / Math.max(history.length - 1 - startIndex, 1)
            return { ...point, p: point.p * (1 + (crashMove / 100) * progress) }
        })
    }, [history, viewMode, coinId])

    const range = useMemo(() => {
        if (!displayedHistory || displayedHistory.length < 2) return null
        const prices = displayedHistory.map((h) => h.p)
        return { change: ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100, high: Math.max(...prices), low: Math.min(...prices) }
    }, [displayedHistory])

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
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Market Insights</h2>
                    <p className="text-muted-foreground">{viewMode === 'live' ? 'What’s happening across crypto, and how the market looks for what you hold.' : 'A market-wide replay of the hypothetical crash.'}</p>
                </div>
                <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1" role="group" aria-label="Market view">
                    <button onClick={() => setViewMode('live')} aria-pressed={viewMode === 'live'} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${viewMode === 'live' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>Live market</button>
                    <button onClick={() => setViewMode('crash')} aria-pressed={viewMode === 'crash'} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${viewMode === 'crash' ? 'bg-red-400 text-red-950 shadow-[0_0_20px_rgba(248,113,113,0.2)]' : 'text-muted-foreground hover:text-foreground'}`}>Crash scenario</button>
                </div>
            </div>

            {error && <div className="border-y border-red-500/30 py-3 text-sm text-red-300">{error}</div>}

            {viewMode === 'crash' && (
                <section className="relative py-10">
                    <div className="relative z-10 max-w-3xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">Hypothetical market event</p>
                        <h3 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A sharp sell-off spreads across crypto.</h3>
                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Bitcoin drops 12.4%, Ethereum 15.1%, and Solana 18.6%. The table and chart below show how a meaningful—but not record-setting—crypto crash would affect this portfolio.</p>
                        <div className="mt-6 flex flex-wrap gap-6">
                            {Object.entries(DEMO_CRASH_MOVES).map(([id, move]) => <div key={id}><span className="text-xs uppercase tracking-wider text-muted-foreground">{market?.coins[id]?.name ?? id}</span><strong className="block text-2xl font-semibold text-red-400">{pct(move, 1)}</strong></div>)}
                        </div>
                    </div>
                </section>
            )}

            {viewMode === 'crash' && mine && crashProfile && (
                <section className="border-y border-violet-400/20 py-8">
                    <div className="flex flex-wrap items-start justify-between gap-5">
                        <div className="max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Impact for {mine.investor.isDemo ? mine.investor.name : 'you'}</p>
                            <h3 className="mt-2 text-2xl font-semibold tracking-tight">This same crash changes meaning with the person.</h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                With a goal of <span className="text-foreground">{mine.investor.goal}</span> and a <span className="text-foreground">{mine.investor.timeHorizon}</span> horizon, this portfolio would lose an estimated <span className="font-semibold text-red-400">{usd(crashProfile.impactUsd)}</span>. {crashProfile.toleranceExceeded ? 'The loss across total wealth exceeds this profile’s personal boundary.' : 'The whole-portfolio loss remains inside this profile’s personal boundary.'}
                            </p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${crashProfile.alertTriggered ? 'border-red-400/40 bg-red-400/10 text-red-300' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'}`}>
                            {crashProfile.alertTriggered ? 'Configured loss limit crossed · alert sent' : 'Monitored without interruption'}
                        </span>
                    </div>
                    <div className="mt-6 grid grid-cols-2 border-y sm:grid-cols-4">
                        <ScenarioFigure label="Total wealth" value={usd(mine.investor.totalWealthUsd)} />
                        <ScenarioFigure label="Crypto before crash" value={usd(mine.totals.sellValueUsd)} />
                        <ScenarioFigure label="Estimated loss" value={usd(crashProfile.impactUsd)} tone="red" />
                        <ScenarioFigure label="Vs amount invested" value={pct(crashProfile.cryptoImpactPct, 2)} tone="red" />
                    </div>
                </section>
            )}

            {/* 1. AI read of the market */}
            {viewMode === 'live' ? <MarketSection
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
            </MarketSection> : (
                <MarketSection title="What is happening in this scenario" action={<span className="text-xs font-medium text-red-300">SIMULATED · NOT LIVE</span>}>
                    <div className="grid gap-6 lg:grid-cols-2">
                        <div><p className="text-lg font-semibold">A broad risk-off move is hitting major crypto assets at the same time.</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Bitcoin leads the market lower, while higher-volatility assets fall further. Correlation rises during the sell-off, so diversification within crypto offers limited protection.</p></div>
                        <div><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What the agent notices</h4><ul className="mt-2 space-y-2 text-sm"><li>• All monitored assets crossed their alert thresholds.</li><li>• Solana is moving most severely at −18.6%.</li><li>• Portfolio impact depends on each holding’s dollar exposure.</li></ul></div>
                    </div>
                </MarketSection>
            )}

            {/* 2. All coins side by side */}
            <MarketSection
                title="All coins today"
                action={displayedMarket && <span className="text-xs text-muted-foreground">{viewMode === 'crash' ? 'Simulated market' : 'Crypto market'} 24h: <Change v={displayedMarket.change24hPct} /></span>}
            >
                {!displayedMarket ? (
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
            </MarketSection>

            {/* 3. Price chart for the selected coin */}
            <MarketSection
                title={selected ? `${selected.name} price` : 'Price'}
                action={
                    <div className="flex border-b border-white/10 text-xs">
                        {RANGES.map((r) => (
                            <button key={r.days} onClick={() => setDays(r.days)} className={`border-b-2 px-2.5 py-1 font-medium transition-colors ${days === r.days ? 'border-violet-300 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
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
                    ) : !displayedHistory ? (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={displayedHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                                <Area type="monotone" dataKey="p" stroke={viewMode === 'crash' ? '#f87171' : color} strokeWidth={2} fill="url(#priceFill)" isAnimationActive={viewMode === 'crash'} animationDuration={700} />
                                {viewMode === 'live' && markers.map((m) => (
                                    <ReferenceDot key={m.id} x={m.point.t} y={m.point.p} r={5} fill="#fbbf24" stroke="hsl(var(--background))" strokeWidth={2} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
                {viewMode === 'crash' && <p className="mt-2 text-xs font-medium text-red-300">Hypothetical price path for demonstration—not live market data.</p>}
                {viewMode === 'live' && markers.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                        <span className="text-amber-400">●</span> Past crashes. See what they meant for you on{' '}
                        <Link href="/" className="text-primary hover:underline">My Portfolio</Link>.
                    </p>
                )}
            </MarketSection>

            {/* 4. The user's own holdings in this market */}
            {mine && (
                <section id="yours" className="space-y-4">
                    <div>
                        <h3 className="text-xl font-semibold tracking-tight">{mine.investor.isDemo ? `${mine.investor.name}'s investments` : 'Your investments'} in this market</h3>
                        <p className="text-sm text-muted-foreground">How the market looks for each coin you hold, next to what it&apos;s worth and what went in.</p>
                    </div>
                    {mine.totals.missingInvested > 0 && !mine.investor.isDemo && (
                        <p className="text-sm text-muted-foreground">
                            Add what you put in to see your profit or loss. <Link href={`/portfolio/edit${mine.investor.id === 'you' ? '' : `?investor=${encodeURIComponent(mine.investor.id)}`}`} className="text-primary hover:underline">View the plan →</Link>
                        </p>
                    )}
                    {(viewMode === 'crash' && crashProfile ? crashProfile.holdings : mine.holdings).map((h) => (
                        <HoldingMarketCard key={h.id} h={h} marketChange24hPct={viewMode === 'crash' ? -13.8 : mine.marketChange24hPct} scenario={viewMode === 'crash'} />
                    ))}
                </section>
            )}

        </div>
    )
}

function ScenarioFigure({ label, value, tone }: { label: string; value: string; tone?: 'red' }) {
    return <div className="border-b px-3 py-4 even:border-l sm:border-b-0 sm:border-l sm:first:border-l-0"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${tone === 'red' ? 'text-red-400' : ''}`}>{value}</p></div>
}

function MarketSection({ title, action, children }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
    return <section className="border-y border-white/10 py-7">{(title || action) && <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><h3 className="text-xl font-semibold tracking-tight">{title}</h3>{action}</div>}<div>{children}</div></section>
}
