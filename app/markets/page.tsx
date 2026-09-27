'use client'

import Link from 'next/link'
import { Moves, eventTitle, movesOf } from '@/components/Moves'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSocket } from '@/context/SocketContext'
import { Panel, SourceBadge } from '@/components/advisor/Badges'
import { date, dateTime, pct, usd } from '@/lib/format'

type Coin = {
    id: string
    symbol: string
    name: string
    price: number
    marketCap: number
    high24h: number
    low24h: number
    change24h: number | null
    change7d: number | null
    change30d: number | null
    allTimeHigh: number
    belowAllTimeHighPct: number
    allTimeHighDate: string
}
type Point = { t: number; p: number }
type MarketEvent = { id: string; coinId: string; coin: { name: string }; changePct: number; moves?: unknown; source: string; occurredAt: string }

const RANGES = [
    { days: '1', label: '1D' },
    { days: '7', label: '7D' },
    { days: '30', label: '30D' },
    { days: '365', label: '1Y' },
] as const

const priceFmt = (n: number) => (n >= 100 ? usd(n) : `$${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}`)

function Change({ value }: { value: number | null }) {
    if (value == null) return <span className="text-muted-foreground">—</span>
    return <span className={`tabular-nums ${value < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{pct(value)}</span>
}

export default function Markets() {
    const { socket } = useSocket()
    const [coins, setCoins] = useState<Coin[] | null>(null)
    const [events, setEvents] = useState<MarketEvent[]>([])
    const [coinId, setCoinId] = useState('bitcoin')
    const [days, setDays] = useState<(typeof RANGES)[number]['days']>('30')
    const [history, setHistory] = useState<Point[] | null>(null)
    const [historyError, setHistoryError] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/markets/overview').then(async (r) => {
            if (r.ok) setCoins(await r.json())
            else setError((await r.json()).error ?? 'Market data unavailable')
        })
        fetch('/api/events').then(async (r) => r.ok && setEvents(await r.json()))
    }, [])

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
            setCoins((prev) => prev?.map((c) => (c.id === u.coinId ? { ...c, price: u.price } : c)) ?? prev)
        socket.on('price-update', onPrice)
        return () => {
            socket.off('price-update', onPrice)
        }
    }, [socket])

    const selected = coins?.find((c) => c.id === coinId)
    const range = useMemo(() => {
        if (!history || history.length < 2) return null
        const prices = history.map((h) => h.p)
        const first = prices[0]
        const last = prices[prices.length - 1]
        return { change: ((last - first) / first) * 100, high: Math.max(...prices), low: Math.min(...prices) }
    }, [history])

    // Mark saved big moves that fall inside the visible range
    const markers = useMemo(() => {
        if (!history || history.length === 0) return []
        const start = history[0].t
        return events
            .filter((e) => movesOf(e)[coinId] != null && new Date(e.occurredAt).getTime() >= start)
            .map((e) => {
                const ts = new Date(e.occurredAt).getTime()
                const nearest = history.reduce((best, h) => (Math.abs(h.t - ts) < Math.abs(best.t - ts) ? h : best), history[0])
                return { ...e, point: nearest }
            })
    }, [events, history, coinId])

    const color = range && range.change < 0 ? '#f87171' : '#34d399'
    const tickFormat = (t: number) =>
        days === '1' ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric' }) : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Markets</h2>
                <p className="text-muted-foreground">The big picture behind your personal insights. Context, not recommendations.</p>
            </div>

            {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

            {/* Overview */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {(coins ?? []).map((c) => (
                    <button
                        key={c.id}
                        onClick={() => setCoinId(c.id)}
                        className={`rounded-xl border bg-card/50 p-4 text-left transition-colors ${coinId === c.id ? 'border-primary' : 'hover:bg-secondary/30'}`}
                    >
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold">{c.symbol}</span>
                            <span className="text-xs text-muted-foreground">{c.name}</span>
                        </div>
                        <div className="mt-2 text-xl font-semibold tabular-nums">{priceFmt(c.price)}</div>
                        <div className="mt-1 text-xs">
                            <Change value={c.change24h} /> <span className="text-muted-foreground">24h</span>
                        </div>
                    </button>
                ))}
                {!coins && !error && <div className="text-sm text-muted-foreground">Loading market data…</div>}
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <Panel
                    className="lg:col-span-2"
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
                                Change <Change value={range.change} />
                            </span>
                            <span className="text-muted-foreground">
                                High <span className="text-foreground tabular-nums">{priceFmt(range.high)}</span>
                            </span>
                            <span className="text-muted-foreground">
                                Low <span className="text-foreground tabular-nums">{priceFmt(range.low)}</span>
                            </span>
                        </div>
                    )}
                    <div className="h-[320px]">
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
                                    <YAxis dataKey="p" domain={['auto', 'auto']} tickFormatter={(v) => priceFmt(v)} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} width={80} />
                                    <Tooltip
                                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                                        labelFormatter={(t) => (days === '1' ? dateTime(new Date(Number(t))) : date(new Date(Number(t))))}
                                        formatter={(v) => [priceFmt(Number(v)), 'Price']}
                                    />
                                    <Area type="monotone" dataKey="p" stroke={color} strokeWidth={2} fill="url(#priceFill)" isAnimationActive={false} />
                                    {markers.map((m) => (
                                        <ReferenceDot key={m.id} x={m.point.t} y={m.point.p} r={5} fill="#fbbf24" stroke="hsl(var(--background))" strokeWidth={2} />
                                    ))}
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                    {markers.length > 0 && <p className="mt-2 text-xs text-muted-foreground"><span className="text-amber-400">●</span> Big moves saved in the app. See them below.</p>}
                </Panel>

                <div className="space-y-6">
                    {selected && (
                        <Panel title={`${selected.name} at a glance`}>
                            <dl className="space-y-2 text-sm">
                                <Row label="24 hours" value={<Change value={selected.change24h} />} />
                                <Row label="7 days" value={<Change value={selected.change7d} />} />
                                <Row label="30 days" value={<Change value={selected.change30d} />} />
                                <Row label="24h range" value={`${priceFmt(selected.low24h)} – ${priceFmt(selected.high24h)}`} />
                                <Row label="Market size" value={usd(selected.marketCap, { compact: true })} />
                                <Row label="All-time high" value={`${priceFmt(selected.allTimeHigh)} (${date(selected.allTimeHighDate)})`} />
                                <Row label="Below all-time high" value={<Change value={selected.belowAllTimeHighPct} />} />
                            </dl>
                        </Panel>
                    )}

                    <Panel title="Recent big moves">
                        {events.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No big moves yet.</p>
                        ) : (
                            <ul className="divide-y">
                                {events.map((e) => (
                                    <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                                        <div>
                                            <div className="text-sm font-medium">
                                                {eventTitle(e)}
                                                <Moves event={e} className="mt-0.5 block text-xs" />
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                                {e.source === 'replay' ? date(e.occurredAt) : dateTime(e.occurredAt)} <SourceBadge source={e.source} />
                                            </div>
                                        </div>
                                        <Link href={`/events/${e.id}`} className="shrink-0 text-xs font-medium text-primary hover:underline">
                                            Who it affects →
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">Market data from CoinGecko.</p>
        </div>
    )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right">{value}</dd>
        </div>
    )
}
