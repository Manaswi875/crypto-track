'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Panel, UrgencyBadge } from '@/components/Badges'
import { Moves, eventTitle } from '@/components/Moves'
import { COIN_SYMBOL, date, dateTime, pct, usd } from '@/lib/format'

type Position = {
    id: string
    name: string
    assetClass: string
    coinId: string | null
    marketValue: number
    investedUsd: number | null
    change24hUsd: number
    change24hPct: number
}
type After = { days: number; moves: Record<string, number> } | null
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
    after: { d7: After; d30: After } | null
}
type Today = {
    totalUsd: number
    cryptoUsd: number
    change24hUsd: number
    change24hPct: number
    investedUsd: number | null
    gainUsd: number | null
    marketChange24hPct: number | null
    coins: Record<string, { change24hPct: number; typicalDailyMovePct: number; todayVsTypical: number }>
}
type InvestorData = {
    investor: {
        id: string
        name: string
        tagline: string
        age: number | null
        goal: string
        cryptoReason: string
        timeHorizon: string
        dropComfortPct: number
        isDemo: boolean
        positions: Position[]
    }
    aiEnabled: boolean
    today: Today
    events: EventRow[]
}
type InvestorSummary = { id: string; name: string; tagline: string; isDemo: boolean }

const splitName = (name: string) => {
    const m = name.match(/^(.*?)\s*\((.*)\)$/)
    return m ? [m[1], m[2]] : [name, '']
}

const COIN_NAME: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana' }

function Signed({ v, children }: { v: number; children: React.ReactNode }) {
    return <span className={`tabular-nums ${v < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{children}</span>
}

/**
 * A plain-English read of today, computed from the numbers (no AI needed):
 * how the biggest-moving held coin compares with a normal day, and where the
 * move sits against the investor's loss tolerance.
 */
function todayStatus(t: Today, tolerance: number) {
    const coins = Object.entries(t.coins)
    if (coins.length === 0) return { tone: 'calm' as const, text: 'You don’t hold any crypto yet.' }
    const [coinId, c] = coins.reduce((a, b) => (Math.abs(b[1].change24hPct) > Math.abs(a[1].change24hPct) ? b : a))
    const name = COIN_NAME[coinId] ?? coinId
    const move = `${name} ${pct(c.change24hPct, 1)}`
    if (Math.abs(c.change24hPct) > tolerance)
        return { tone: 'alert' as const, text: `A big day: ${move}, beyond the ${tolerance}% loss tolerance you set. Worth a look at what it means for you.` }
    if (c.todayVsTypical >= 3) return { tone: 'watch' as const, text: `An unusually big move today: ${move}, against a typical day of about ±${c.typicalDailyMovePct.toFixed(1)}%.` }
    if (c.todayVsTypical >= 1.5) return { tone: 'watch' as const, text: `A bigger move than usual: ${move}, against a typical day of about ±${c.typicalDailyMovePct.toFixed(1)}%. Still within your plan.` }
    return { tone: 'calm' as const, text: `A normal day for your crypto: ${move}, well within a typical day of about ±${c.typicalDailyMovePct.toFixed(1)}%. Nothing needs your attention.` }
}

export default function TodayPage() {
    const router = useRouter()
    const [investors, setInvestors] = useState<InvestorSummary[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [data, setData] = useState<InvestorData | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/investors').then(async (r) => r.ok && setInvestors(await r.json()))
        setSelected(new URLSearchParams(window.location.search).get('investor') ?? 'you')
    }, [])

    const load = useCallback(async () => {
        if (!selected) return
        const res = await fetch(`/api/investors/${selected}`)
        if (res.ok) setData(await res.json())
    }, [selected])

    useEffect(() => {
        if (!selected) return
        window.history.replaceState(null, '', selected === 'you' ? '/' : `/?investor=${selected}`)
        setData(null)
        load()
    }, [selected, load])

    async function explain(eventId: string) {
        if (!selected) return
        setBusy(eventId)
        setError(null)
        const res = await fetch('/api/insights', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ eventId, investorId: selected }),
        })
        setBusy(null)
        if (!res.ok) return setError((await res.json()).error ?? 'Could not create insight')
        router.push(`/insights/${(await res.json()).id}`)
    }

    const examples = investors.filter((i) => i.isDemo)
    const inv = data?.investor
    const t = data?.today
    const who = inv?.isDemo ? inv.name : 'you'

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Today</h2>
                    <p className="text-muted-foreground">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                </div>
                {examples.length > 0 && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Try an example investor
                        <select value={selected ?? 'you'} onChange={(e) => setSelected(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm text-foreground">
                            <option value="you">— Your portfolio —</option>
                            {examples.map((i) => (
                                <option key={i.id} value={i.id}>
                                    {i.name}: {i.tagline}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            {inv?.isDemo && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-4 py-2 text-sm">
                    <span className="text-muted-foreground">
                        Example investor: <span className="font-medium text-foreground">{inv.name}{inv.age ? `, ${inv.age}` : ''}</span> · {inv.tagline}
                    </span>
                    <button onClick={() => setSelected('you')} className="font-medium text-primary hover:underline">← Back to your portfolio</button>
                </div>
            )}

            {!inv || !t ? (
                <div className="text-muted-foreground">Loading…</div>
            ) : (
                <>
                    {!data.aiEnabled && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">ANTHROPIC_API_KEY is not set, so AI features are off.</div>
                    )}

                    <TodayCard t={t} tolerance={inv.dropComfortPct} investorId={inv.id} />

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <div className="space-y-6 lg:col-span-2">
                            <Panel title="Big moves" action={<span className="text-xs text-muted-foreground">What each one means for {who}</span>}>
                                {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
                                {[
                                    { title: 'Live', hint: 'Sharp moves of 3% or more, as they happen', events: data.events.filter((e) => e.source === 'live') },
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
                                                {g.events.map((e) => (
                                                    <MoveRow key={e.id} e={e} who={who} busy={busy === e.id} disabled={busy !== null || !data.aiEnabled} onExplain={() => explain(e.id)} />
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                {data.events.length === 0 && <p className="text-sm text-muted-foreground">Loading crashes…</p>}
                            </Panel>
                        </div>

                        <div className="space-y-6">
                            <Panel
                                title={inv.isDemo ? `${inv.name}'s goal` : 'Your goal'}
                                action={
                                    !inv.isDemo && (
                                        <span className="flex gap-3 text-xs font-medium">
                                            <Link href="/setup" className="text-primary hover:underline">Describe it with AI</Link>
                                            <Link href="/portfolio/edit" className="text-primary hover:underline">Edit</Link>
                                        </span>
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

                            <MoneyPanel title={inv.isDemo ? `${inv.name}'s money` : 'Your money'} positions={inv.positions} total={t.totalUsd} />
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

function TodayCard({ t, tolerance, investorId }: { t: Today; tolerance: number; investorId: string }) {
    const status = todayStatus(t, tolerance)
    const tone = status.tone === 'alert' ? 'border-amber-500/40 bg-amber-500/5' : status.tone === 'watch' ? 'border-sky-500/30 bg-sky-500/5' : 'border-emerald-500/20 bg-emerald-500/5'
    return (
        <section className={`rounded-xl border p-5 ${tone}`}>
            <p className="text-lg font-medium leading-snug">{status.text}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Figure label="Everything you have" value={usd(t.totalUsd)} />
                <Figure label="Your crypto" value={usd(t.cryptoUsd)} hint={t.totalUsd ? `${((t.cryptoUsd / t.totalUsd) * 100).toFixed(0)}% of everything` : undefined} />
                <Figure
                    label="Crypto today"
                    value={<Signed v={t.change24hUsd}>{usd(t.change24hUsd, { sign: true })}</Signed>}
                    hint={
                        <>
                            <Signed v={t.change24hPct}>{pct(t.change24hPct, 2)}</Signed>
                            {t.marketChange24hPct != null && <> · market {pct(t.marketChange24hPct, 2)}</>}
                        </>
                    }
                />
                <Figure
                    label={t.gainUsd == null ? 'Profit or loss' : t.gainUsd >= 0 ? 'Crypto profit overall' : 'Crypto loss overall'}
                    value={t.gainUsd == null ? '—' : <Signed v={t.gainUsd}>{usd(t.gainUsd, { sign: true })}</Signed>}
                    hint={t.investedUsd != null && t.gainUsd != null ? `on ${usd(t.investedUsd)} put in` : 'Add what you put in'}
                />
            </div>
            <Link href={`/markets${investorId === 'you' ? '' : `?investor=${investorId}`}#yours`} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
                See the market for your coins →
            </Link>
        </section>
    )
}

function MoveRow({ e, who, busy, disabled, onExplain }: { e: EventRow; who: string; busy: boolean; disabled: boolean; onExplain: () => void }) {
    const affected = e.impact.exposureUsd > 0
    const d30 = e.after?.d30
    return (
        <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{eventTitle(e)}</span>
                    <span className="text-xs text-muted-foreground">{e.source === 'replay' ? date(e.occurredAt) : dateTime(e.occurredAt)}</span>
                </div>
                <Moves event={e} className="text-sm" />
                <div className="text-sm">
                    {affected ? (
                        <>
                            {who === 'you' ? 'Your' : `${who}'s`} impact: <span className="font-medium tabular-nums text-red-400">{usd(e.impact.impactUsd)}</span>{' '}
                            <span className="text-muted-foreground">({pct(e.impact.impactPctOfTotal)} of everything)</span>
                        </>
                    ) : (
                        <span className="text-muted-foreground">None of the coins that moved are in this portfolio.</span>
                    )}
                </div>
                {d30 && (
                    <div className="text-xs text-muted-foreground">
                        30 days later:{' '}
                        {Object.entries(d30.moves).map(([c, m], i) => (
                            <span key={c}>
                                {i > 0 && ' · '}
                                {COIN_SYMBOL[c]} <Signed v={m}>{pct(m, 1)}</Signed>
                            </span>
                        ))}
                    </div>
                )}
                {e.insight?.status === 'ready' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
                        <UrgencyBadge urgency={e.insight.urgency} />
                        <span className="text-muted-foreground">{e.insight.headline}</span>
                    </div>
                )}
            </div>
            {affected && (
                <div className="shrink-0">
                    {e.insight && e.insight.status !== 'failed' ? (
                        <Link href={`/insights/${e.insight.id}`} className="inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                            {e.insight.status === 'generating' ? 'Writing…' : 'Read insight'}
                        </Link>
                    ) : (
                        <button onClick={onExplain} disabled={disabled} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {busy ? 'Starting…' : 'What does this mean for me?'}
                        </button>
                    )}
                </div>
            )}
        </li>
    )
}

const BUCKETS = [
    { key: 'crypto', label: 'Crypto', dot: 'bg-amber-400', match: (p: Position) => !!p.coinId },
    { key: 'cash', label: 'Cash & savings', dot: 'bg-sky-400', match: (p: Position) => p.assetClass === 'cash' },
    { key: 'investments', label: 'Stocks & bonds', dot: 'bg-violet-400', match: (p: Position) => !p.coinId && p.assetClass !== 'cash' },
]

function MoneyPanel({ title, positions, total }: { title: string; positions: Position[]; total: number }) {
    const share = (v: number) => (total ? `${((v / total) * 100).toFixed(0)}%` : '0%')
    const buckets = BUCKETS.map((b) => {
        const items = positions.filter(b.match)
        return { ...b, items, value: items.reduce((s, p) => s + p.marketValue, 0) }
    }).filter((b) => b.value > 0)
    const crypto = buckets.find((b) => b.key === 'crypto')
    const rest = buckets.filter((b) => b.key !== 'crypto')

    return (
        <Panel title={title} action={<span className="text-sm font-semibold tabular-nums">{usd(total)}</span>}>
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
                    <div className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <span>Crypto</span>
                        <span className="tabular-nums">{usd(crypto.value)}</span>
                    </div>
                    <ul className="space-y-3 text-sm">
                        {crypto.items.map((p) => {
                            const [coin, via] = splitName(p.name)
                            const gain = p.investedUsd != null ? p.marketValue - p.investedUsd : null
                            return (
                                <li key={p.id} className="flex items-start justify-between gap-3">
                                    <span className="flex items-start gap-2">
                                        <span className="mt-1.5 h-2 w-2 rounded-full bg-amber-400" />
                                        <span>
                                            <span className="font-medium">{coin}</span>
                                            {via && <span className="block text-xs text-muted-foreground">{via}</span>}
                                        </span>
                                    </span>
                                    <span className="text-right tabular-nums">
                                        {usd(p.marketValue)}
                                        <span className="block text-xs">
                                            <Signed v={p.change24hPct}>{pct(p.change24hPct, 1)} today</Signed>
                                        </span>
                                        {gain != null && (
                                            <span className="block text-xs">
                                                <Signed v={gain}>{usd(gain, { sign: true })}</Signed> <span className="text-muted-foreground">overall</span>
                                            </span>
                                        )}
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

function Figure({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
    return (
        <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
            {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
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
