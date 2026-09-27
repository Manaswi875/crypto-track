'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useSocket } from '@/context/SocketContext'
import { Panel, UrgencyBadge } from '@/components/Badges'
import { Moves, eventTitle } from '@/components/Moves'
import { COIN_SYMBOL, date, dateTime, pct, usd } from '@/lib/format'

type InvestorSummary = { id: string; name: string; tagline: string; isDemo: boolean; totalUsd: number; cryptoUsd: number }
type Position = { id: string; symbol: string; name: string; assetClass: string; coinId: string | null; marketValue: number }
type EventRow = {
    id: string
    coinId: string
    coin: { name: string }
    changePct: number
    moves?: unknown
    source: string
    occurredAt: string
    impact: { exposureUsd: number; impactUsd: number; impactPctOfTotal: number }
    insight: { id: string; status: string; urgency: string | null; headline: string | null } | null
}
type InvestorData = {
    investor: {
        id: string
        name: string
        tagline: string
        age: number | null
        timeHorizon: string
        goal: string
        cryptoReason: string
        dropComfortPct: number
        isDemo: boolean
        positions: Position[]
    }
    aiEnabled: boolean
    events: EventRow[]
}

const LIVE_COINS = ['bitcoin', 'ethereum', 'solana']

export default function MyPortfolio() {
    const router = useRouter()
    const { socket } = useSocket()
    const [investors, setInvestors] = useState<InvestorSummary[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [data, setData] = useState<InvestorData | null>(null)
    const [prices, setPrices] = useState<Record<string, { price: number; change24h: number }>>({})
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/investors').then(async (r) => r.ok && setInvestors(await r.json()))
        const fromUrl = new URLSearchParams(window.location.search).get('investor')
        setSelected(fromUrl ?? 'you')
    }, [])

    const load = useCallback(async () => {
        if (!selected) return
        const res = await fetch(`/api/investors/${selected}`)
        if (res.ok) setData(await res.json())
    }, [selected])

    useEffect(() => {
        if (!selected) return
        window.history.replaceState(null, '', `/?investor=${selected}`)
        setData(null)
        load()
    }, [selected, load])

    // Show prices straight away from cached market data; live ticks take over every 30s
    useEffect(() => {
        fetch('/api/markets/overview').then(async (r) => {
            if (!r.ok) return
            const coins: { id: string; price: number; change24h: number | null }[] = await r.json()
            setPrices((prev) => ({
                ...Object.fromEntries(coins.map((c) => [c.id, { price: c.price, change24h: c.change24h ?? 0 }])),
                ...prev,
            }))
        })
    }, [])

    useEffect(() => {
        if (!socket) return
        socket.emit('subscribe', 'all-prices')
        const onPrice = (p: { coinId: string; price: number; change24h: number }) => setPrices((prev) => ({ ...prev, [p.coinId]: p }))
        socket.on('price-update', onPrice)
        return () => {
            socket.off('price-update', onPrice)
        }
    }, [socket])

    async function explain(eventId: string) {
        if (!selected) return
        setBusy(`explain:${eventId}`)
        setError(null)
        const res = await fetch('/api/insights', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ eventId, investorId: selected }),
        })
        setBusy(null)
        if (!res.ok) return setError((await res.json()).error ?? 'Could not create insight')
        const insight = await res.json()
        router.push(`/insights/${insight.id}`)
    }

    const inv = data?.investor
    const total = inv?.positions.reduce((s, p) => s + p.marketValue, 0) ?? 0
    const crypto = inv?.positions.filter((p) => p.coinId).reduce((s, p) => s + p.marketValue, 0) ?? 0

    return (
        <div className="space-y-8">
            {/* Live prices */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> Live
                </span>
                {LIVE_COINS.map((c) => (
                    <span key={c} className="tabular-nums">
                        <span className="font-medium">{COIN_SYMBOL[c]}</span>{' '}
                        {prices[c] ? (
                            <>
                                {usd(prices[c].price)}{' '}
                                <span className={prices[c].change24h < 0 ? 'text-red-400' : 'text-emerald-400'}>{pct(prices[c].change24h)} 24h</span>
                            </>
                        ) : (
                            <span className="text-muted-foreground">…</span>
                        )}
                    </span>
                ))}
            </div>

            {/* Your portfolio first; example investors show the same move through other eyes */}
            <div className="flex flex-wrap items-center gap-2">
                {investors
                    .filter((i) => !i.isDemo)
                    .map((i) => (
                        <button
                            key={i.id}
                            onClick={() => setSelected(i.id)}
                            className={`rounded-lg border px-4 py-2 text-left transition-colors ${selected === i.id ? 'border-primary bg-secondary' : 'hover:bg-secondary/50'}`}
                        >
                            <div className="text-sm font-semibold">Your portfolio</div>
                            <div className="text-xs text-muted-foreground">{usd(i.totalUsd, { compact: true })} · {usd(i.cryptoUsd, { compact: true })} crypto</div>
                        </button>
                    ))}
                {investors.some((i) => i.isDemo) && (
                    <>
                        <span className="mx-2 hidden h-8 w-px bg-border sm:block" />
                        {investors
                            .filter((i) => i.isDemo)
                            .map((i) => (
                                <button
                                    key={i.id}
                                    onClick={() => setSelected(i.id)}
                                    className={`rounded-lg border border-dashed px-3 py-1.5 text-left transition-colors ${selected === i.id ? 'border-primary bg-secondary' : 'hover:bg-secondary/50'}`}
                                >
                                    <div className="text-sm font-medium">{i.name}</div>
                                    <div className="text-xs text-muted-foreground">{i.tagline}</div>
                                </button>
                            ))}
                    </>
                )}
            </div>

            {!inv ? (
                <div className="text-muted-foreground">Loading portfolio…</div>
            ) : (
                <>
                    {inv.isDemo && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-4 py-2 text-sm">
                            <span className="text-muted-foreground">
                                You&apos;re viewing an example investor: <span className="font-medium text-foreground">{inv.name}{inv.age ? `, ${inv.age}` : ''}</span> · {inv.tagline}
                            </span>
                            <button onClick={() => setSelected('you')} className="font-medium text-primary hover:underline">
                                ← Back to your portfolio
                            </button>
                        </div>
                    )}

                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">{inv.isDemo ? `${inv.name}'s portfolio` : 'Your portfolio'}</h2>
                        <p className="text-muted-foreground">
                            {usd(total)} total · {usd(crypto)} in crypto ({total ? ((crypto / total) * 100).toFixed(0) : 0}%)
                        </p>
                    </div>

                    {!data.aiEnabled && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                            ANTHROPIC_API_KEY is not set, so new insights are disabled.
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                        <div className="space-y-6 lg:col-span-2">
                            <Panel title="Crypto moves" action={<span className="text-xs text-muted-foreground">What each move means for {inv.isDemo ? inv.name : 'you'}</span>}>
                                {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

                                {data.events.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Loading crashes… If this persists, price history is temporarily unavailable.</p>
                                ) : (
                                    <>
                                        {[
                                            { title: 'Live moves', hint: 'Sharp moves of 3% or more, as they happen', events: data.events.filter((e) => e.source === 'live') },
                                            { title: 'Past crashes', hint: 'Real sell-offs from the past year, applied to today’s holdings', events: data.events.filter((e) => e.source === 'replay') },
                                        ]
                                            .filter((g) => g.events.length > 0)
                                            .map((g) => (
                                                <div key={g.title} className="mb-4 last:mb-0">
                                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</h4>
                                                        <span className="text-xs text-muted-foreground">{g.hint}</span>
                                                    </div>
                                                    <ul className="divide-y">
                                                        {g.events.map((e) => {
                                            const affected = e.impact.exposureUsd > 0
                                            return (
                                                <li key={e.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-medium">{eventTitle(e)}</span>
                                                            <span className="text-xs text-muted-foreground">{e.source === 'replay' ? date(e.occurredAt) : dateTime(e.occurredAt)}</span>
                                                        </div>
                                                        <Moves event={e} className="mt-1 text-sm" />
                                                        <div className="mt-1 text-sm">
                                                            {affected ? (
                                                                <>
                                                                    {inv.isDemo ? `${inv.name}'s` : 'Your'} impact: <span className="font-medium tabular-nums text-red-400">{usd(e.impact.impactUsd)}</span>{' '}
                                                                    <span className="text-muted-foreground">({pct(e.impact.impactPctOfTotal)} of everything)</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-muted-foreground">None of the coins that moved are in this portfolio.</span>
                                                            )}
                                                        </div>
                                                        {e.insight?.status === 'ready' && (
                                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                                                <UrgencyBadge urgency={e.insight.urgency} />
                                                                <span className="text-muted-foreground">{e.insight.headline}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex shrink-0 gap-2">
                                                        {affected &&
                                                            (e.insight && e.insight.status !== 'failed' ? (
                                                                <Link href={`/insights/${e.insight.id}`} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                                                                    {e.insight.status === 'generating' ? 'Writing…' : 'Read insight'}
                                                                </Link>
                                                            ) : (
                                                                <button
                                                                    onClick={() => explain(e.id)}
                                                                    disabled={busy !== null || !data.aiEnabled}
                                                                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                                                >
                                                                    {busy === `explain:${e.id}` ? 'Starting…' : 'What does this mean for me?'}
                                                                </button>
                                                            ))}
                                                    </div>
                                                </li>
                                            )
                                                        })}
                                                    </ul>
                                                </div>
                                            ))}
                                    </>
                                )}
                            </Panel>
                        </div>

                        <div className="space-y-6">
                            <Panel
                                title={inv.isDemo ? `${inv.name}'s goal` : 'Your goal'}
                                action={
                                    !inv.isDemo && (
                                        <Link href="/portfolio/edit" className="text-xs font-medium text-primary hover:underline">
                                            Edit
                                        </Link>
                                    )
                                }
                            >
                                <p className="text-lg font-semibold leading-snug">{inv.goal}</p>
                                <dl className="mt-3 space-y-2 text-sm">
                                    {inv.cryptoReason && <Row label="Why crypto" value={inv.cryptoReason} />}
                                    <Row label="Needs the money" value={inv.timeHorizon} />
                                    <Row label="Crypto loss tolerance" value={`${inv.dropComfortPct}%`} />
                                </dl>
                            </Panel>

                            <MoneyPanel title={inv.isDemo ? `${inv.name}'s money` : 'Your money'} positions={inv.positions} total={total} investorId={inv.id} />
                        </div>
                    </div>

                </>
            )}
        </div>
    )
}

const BUCKETS = [
    { key: 'crypto', label: 'Crypto', dot: 'bg-amber-400', match: (p: Position) => !!p.coinId },
    { key: 'cash', label: 'Cash & savings', dot: 'bg-sky-400', match: (p: Position) => p.assetClass === 'cash' },
    { key: 'investments', label: 'Stocks & bonds', dot: 'bg-violet-400', match: (p: Position) => !p.coinId && p.assetClass !== 'cash' },
]

/** "Bitcoin (IBIT fund)" -> ["Bitcoin", "IBIT fund"] */
const splitName = (name: string) => {
    const m = name.match(/^(.*?)\s*\((.*)\)$/)
    return m ? [m[1], m[2]] : [name, '']
}

function MoneyPanel({ title, positions, total, investorId }: { title: string; positions: Position[]; total: number; investorId: string }) {
    const share = (v: number) => (total ? `${((v / total) * 100).toFixed(0)}%` : '0%')
    const buckets = BUCKETS.map((b) => {
        const items = positions.filter(b.match)
        return { ...b, items, value: items.reduce((s, p) => s + p.marketValue, 0) }
    }).filter((b) => b.value > 0)
    const crypto = buckets.find((b) => b.key === 'crypto')
    const rest = buckets.filter((b) => b.key !== 'crypto')

    return (
        <Panel title={title} action={<span className="text-sm font-semibold tabular-nums">{usd(total)}</span>}>
            {/* Split of everything they have */}
            <div className="flex h-2.5 overflow-hidden rounded-full bg-secondary">
                {buckets.map((b) => (
                    <div key={b.key} className={b.dot} style={{ width: `${(b.value / total) * 100}%` }} />
                ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {buckets.map((b) => (
                    <span key={b.key} className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${b.dot}`} />
                        {b.label} {share(b.value)}
                    </span>
                ))}
            </div>

            {crypto && (
                <div className="mt-5">
                    <Link href={`/markets?investor=${investorId}#yours`} className="mb-4 block rounded-md border px-3 py-2 text-center text-sm font-medium hover:bg-secondary">
                        How the market looks for your crypto, and your profit or loss →
                    </Link>
                    <div className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <span>Crypto</span>
                        <span className="tabular-nums">{usd(crypto.value)}</span>
                    </div>
                    <ul className="space-y-2.5 text-sm">
                        {crypto.items.map((p) => {
                            const [coin, via] = splitName(p.name)
                            return (
                                <li key={p.id} className="flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                                        <span>
                                            <span className="font-medium">{coin}</span>
                                            {via && <span className="block text-xs text-muted-foreground">{via}</span>}
                                        </span>
                                    </span>
                                    <span className="text-right tabular-nums">
                                        {usd(p.marketValue)}
                                        <span className="block text-xs text-muted-foreground">{share(p.marketValue)} of total</span>
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            )}

            {rest.length > 0 && (
                <div className="mt-5">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Everything else</div>
                    <ul className="space-y-2.5 text-sm">
                        {rest.map((b) => (
                            <li key={b.key} className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-2">
                                    <span className={`h-2 w-2 rounded-full ${b.dot}`} />
                                    <span className="font-medium">{b.label}</span>
                                </span>
                                <span className="text-right tabular-nums">
                                    {usd(b.value)}
                                    <span className="block text-xs text-muted-foreground">{share(b.value)} of total</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Panel>
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
