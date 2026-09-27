'use client'

import Link from 'next/link'
import { Moves, eventTitle } from '@/components/Moves'
import { useCallback, useEffect, useState } from 'react'
import { Panel, SourceBadge, Stat } from '@/components/advisor/Badges'
import { COIN_SYMBOL, date, dateTime, usd } from '@/lib/format'

type Overview = {
    advisor: { name: string; email: string }
    aiEnabled: boolean
    book: { households: number; aumUsd: number; cryptoHouseholds: number; cryptoByCoin: Record<string, { households: number; exposureUsd: number }> }
    events: {
        id: string
        coinId: string
        coin: { name: string }
        changePct: number
        moves?: unknown
        source: string
        occurredAt: string
        createdAt: string
        _count: { briefs: number }
    }[]
    metrics: {
        briefsGenerated: number
        approved: number
        rejected: number
        editedBeforeApproval: number
        complianceFlagged: number
        avgLatencySec: number | null
        manualMinutesPerHousehold: number
    }
}

export default function BookMonitor() {
    const [data, setData] = useState<Overview | null>(null)

    const load = useCallback(async () => {
        const res = await fetch('/api/advisor/overview')
        if (res.ok) setData(await res.json())
    }, [])

    useEffect(() => {
        load()
    }, [load])

    if (!data) return <div className="text-muted-foreground">Loading book…</div>

    const { book, metrics } = data
    const reviewed = metrics.approved + metrics.rejected
    const hoursSaved = (metrics.briefsGenerated * metrics.manualMinutesPerHousehold) / 60

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-1">
                <h2 className="text-3xl font-bold tracking-tight">Book Monitor</h2>
                <p className="text-muted-foreground">
                    {data.advisor.name} · {book.households} households · {usd(book.aumUsd, { compact: true })} under management
                </p>
            </div>

            {!data.aiEnabled && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                    ANTHROPIC_API_KEY is not set, so drafting briefs is disabled. Add it to <code>.env</code> and restart the server.
                </div>
            )}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Households" value={book.households} />
                <Stat label="Assets under management" value={usd(book.aumUsd, { compact: true })} />
                <Stat
                    label="Households holding crypto"
                    value={book.cryptoHouseholds}
                    hint={`${Math.round((book.cryptoHouseholds / book.households) * 100)}% of the book`}
                />
                <Stat
                    label="Crypto exposure"
                    value={usd(Object.values(book.cryptoByCoin).reduce((s, c) => s + c.exposureUsd, 0), { compact: true })}
                    hint={Object.entries(book.cryptoByCoin)
                        .map(([coin, c]) => `${COIN_SYMBOL[coin] ?? coin} ${usd(c.exposureUsd, { compact: true })}`)
                        .join(' · ')}
                />
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <Panel
                    className="lg:col-span-2"
                    title="Market events"
                    action={<span className="text-xs text-muted-foreground">Live moves, plus real crashes from the past year</span>}
                >
                    {data.events.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No events yet.</p>
                    ) : (
                        <ul className="divide-y">
                            {data.events.map((e) => (
                                <li key={e.id}>
                                    <Link href={`/advisor/events/${e.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-secondary/30 -mx-2 px-2 rounded-md">
                                        <div className="flex items-center gap-3">
                                            <div>
                                                <div className="font-medium">{eventTitle(e)}</div>
                                                <Moves event={e} className="text-sm" />
                                                <div className="text-xs text-muted-foreground">
                                                    {e.source === 'replay' ? date(e.occurredAt) : dateTime(e.occurredAt)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {e._count.briefs > 0 && <span className="text-xs text-muted-foreground">{e._count.briefs} briefs</span>}
                                            <SourceBadge source={e.source} />
                                            <span className="text-muted-foreground">→</span>
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                <Panel title="Agent performance">
                    <dl className="space-y-3 text-sm">
                        <Row label="Briefs drafted" value={metrics.briefsGenerated} />
                        <Row
                            label="Approved by advisor"
                            value={`${metrics.approved}${reviewed ? ` of ${reviewed} reviewed` : ''}`}
                        />
                        <Row
                            label="Edited before approval"
                            value={metrics.approved ? `${metrics.editedBeforeApproval} of ${metrics.approved}` : '—'}
                        />
                        <Row label="Compliance flags raised" value={metrics.complianceFlagged} />
                        <Row label="Avg time per brief" value={metrics.avgLatencySec != null ? `${metrics.avgLatencySec.toFixed(1)}s` : '—'} />
                        <div className="border-t pt-3">
                            <Row label="Est. advisor time saved" value={`${hoursSaved.toFixed(1)} h`} />
                            <p className="mt-1 text-xs text-muted-foreground">
                                Assumes {metrics.manualMinutesPerHousehold} min to review a household and write a note by hand.
                            </p>
                        </div>
                    </dl>
                </Panel>
            </div>
        </div>
    )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
        </div>
    )
}
