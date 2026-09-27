'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useSocket } from '@/context/SocketContext'
import { Panel, SourceBadge, UrgencyBadge } from '@/components/advisor/Badges'
import { COIN_SYMBOL, date, dateTime, pct, usd } from '@/lib/format'

type InvestorSummary = { id: string; name: string; tagline: string; isDemo: boolean; totalUsd: number; cryptoUsd: number }
type Position = { id: string; symbol: string; name: string; assetClass: string; coinId: string | null; marketValue: number }
type EventRow = {
    id: string
    coinId: string
    coin: { name: string }
    changePct: number
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
        riskComfort: string
        timeHorizon: string
        plan: string
        dropComfortPct: number
        isDemo: boolean
        positions: Position[]
    }
    aiEnabled: boolean
    events: EventRow[]
}

const REPLAY_COINS = ['bitcoin', 'ethereum', 'solana'] as const
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

    useEffect(() => {
        if (!socket) return
        socket.emit('subscribe', 'all-prices')
        const onPrice = (p: { coinId: string; price: number; change24h: number }) => setPrices((prev) => ({ ...prev, [p.coinId]: p }))
        socket.on('price-update', onPrice)
        return () => {
            socket.off('price-update', onPrice)
        }
    }, [socket])

    async function replay(coinId: string) {
        setBusy(`replay:${coinId}`)
        setError(null)
        const res = await fetch('/api/events/replay', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ coinId }),
        })
        setBusy(null)
        if (!res.ok) return setError((await res.json()).error ?? 'Replay failed')
        load()
    }

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
                                <div className="mb-5 rounded-lg border border-dashed p-4">
                                    <div className="text-sm font-medium">Replay a real crash</div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Finds the worst single day of the past year in real CoinGecko prices and applies it to this portfolio.
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {REPLAY_COINS.map((coin) => (
                                            <button
                                                key={coin}
                                                onClick={() => replay(coin)}
                                                disabled={busy !== null}
                                                className="rounded-md border bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-secondary/70 disabled:opacity-50"
                                            >
                                                {busy === `replay:${coin}` ? 'Fetching history…' : `Worst ${COIN_SYMBOL[coin]} day`}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

                                {data.events.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No big moves yet. Replay one above; live moves of 1% or more also show up here.</p>
                                ) : (
                                    <ul className="divide-y">
                                        {data.events.map((e) => {
                                            const affected = e.impact.exposureUsd > 0
                                            return (
                                                <li key={e.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-medium">{e.coin.name}</span>
                                                            <span className={`font-semibold tabular-nums ${e.changePct < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{pct(e.changePct)}</span>
                                                            <SourceBadge source={e.source} />
                                                            <span className="text-xs text-muted-foreground">{e.source === 'replay' ? date(e.occurredAt) : dateTime(e.occurredAt)}</span>
                                                        </div>
                                                        <div className="mt-1 text-sm">
                                                            {affected ? (
                                                                <>
                                                                    Your impact: <span className="font-medium tabular-nums text-red-400">{usd(e.impact.impactUsd)}</span>{' '}
                                                                    <span className="text-muted-foreground">({pct(e.impact.impactPctOfTotal)} of your portfolio)</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-muted-foreground">You don&apos;t hold {e.coin.name}, so this doesn&apos;t change your portfolio.</span>
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
                                                        <Link href={`/events/${e.id}`} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary">
                                                            Compare
                                                        </Link>
                                                    </div>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </Panel>
                        </div>

                        <div className="space-y-6">
                            <Panel
                                title={inv.isDemo ? `${inv.name}'s plan` : 'Your plan'}
                                action={
                                    !inv.isDemo && (
                                        <Link href="/portfolio/edit" className="text-xs font-medium text-primary hover:underline">
                                            Edit
                                        </Link>
                                    )
                                }
                            >
                                <blockquote className="border-l-2 border-primary/50 pl-3 text-sm italic leading-relaxed">&ldquo;{inv.plan}&rdquo;</blockquote>
                                <dl className="mt-4 space-y-2 text-sm">
                                    <Row label="Time horizon" value={inv.timeHorizon} />
                                    <Row label="Risk comfort" value={<span className="capitalize">{inv.riskComfort}</span>} />
                                    <Row label="OK if crypto drops up to" value={`${inv.dropComfortPct}%`} />
                                </dl>
                            </Panel>

                            <Panel title="Positions">
                                <ul className="space-y-2 text-sm">
                                    {inv.positions.map((p) => (
                                        <li key={p.id}>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className={p.coinId ? 'text-amber-300' : ''}>
                                                    <span className="font-medium">{p.symbol}</span>{' '}
                                                    <span className={p.coinId ? 'text-amber-300/70' : 'text-muted-foreground'}>{p.name}</span>
                                                </span>
                                                <span className="tabular-nums">{usd(p.marketValue)}</span>
                                            </div>
                                            <div className="mt-1 h-1 rounded bg-secondary">
                                                <div className={`h-1 rounded ${p.coinId ? 'bg-amber-400' : 'bg-primary/60'}`} style={{ width: `${(p.marketValue / total) * 100}%` }} />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </Panel>
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground">Educational context only, not financial advice. The AI never tells you to buy or sell.</p>
                </>
            )}
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
