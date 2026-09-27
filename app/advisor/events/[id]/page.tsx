'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSocket } from '@/context/SocketContext'
import { Panel, PriorityBadge, SourceBadge, Stat, StatusBadge } from '@/components/advisor/Badges'
import { date, dateTime, pct, price, usd } from '@/lib/format'

type Impact = {
    householdId: string
    name: string
    primaryContact: string
    riskProfile: string
    lifeStage: string
    aumUsd: number
    exposureUsd: number
    exposurePctOfAum: number
    impactUsd: number
    impactPctOfAum: number
    exposedHoldings: { symbol: string }[]
}
type BriefRow = { id: string; householdId: string; status: string; priority: string | null; complianceFlags: unknown[] | null; error: string | null }
type EventData = {
    event: {
        id: string
        coin: { name: string; symbol: string }
        changePct: number
        source: string
        startPrice: number | null
        endPrice: number | null
        windowLabel: string | null
        occurredAt: string
        aiExplanation: string | null
    }
    impacts: Impact[]
    briefs: BriefRow[]
}

const PRIORITY_ORDER: Record<string, number> = { call_today: 0, send_message: 1, monitor: 2 }

export default function EventTriage({ params }: { params: { id: string } }) {
    const { socket } = useSocket()
    const [data, setData] = useState<EventData | null>(null)
    const [limit, setLimit] = useState(8)
    const [sortBy, setSortBy] = useState<'impact' | 'priority'>('impact')
    const [starting, setStarting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        const res = await fetch(`/api/advisor/events/${params.id}`)
        if (res.ok) setData(await res.json())
    }, [params.id])

    useEffect(() => {
        load()
    }, [load])

    // Live updates as the agent works through households
    useEffect(() => {
        if (!socket) return
        const onUpdate = (msg: { eventId: string }) => {
            if (msg.eventId === params.id) load()
        }
        socket.on('brief-update', onUpdate)
        return () => {
            socket.off('brief-update', onUpdate)
        }
    }, [socket, params.id, load])

    const briefByHousehold = useMemo(() => new Map((data?.briefs ?? []).map((b) => [b.householdId, b])), [data])

    const rows = useMemo(() => {
        if (!data) return []
        const ranked = data.impacts.map((impact, idx) => ({ impact, rank: idx + 1, brief: briefByHousehold.get(impact.householdId) }))
        if (sortBy === 'priority') {
            ranked.sort((a, b) => (PRIORITY_ORDER[a.brief?.priority ?? ''] ?? 9) - (PRIORITY_ORDER[b.brief?.priority ?? ''] ?? 9) || a.rank - b.rank)
        }
        return ranked
    }, [data, briefByHousehold, sortBy])

    async function draftBriefs() {
        setStarting(true)
        setError(null)
        const res = await fetch(`/api/advisor/events/${params.id}/briefs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ limit }),
        })
        setStarting(false)
        if (!res.ok) setError((await res.json()).error ?? 'Could not start drafting')
        load()
    }

    if (!data) return <div className="text-muted-foreground">Loading event…</div>

    const { event, impacts, briefs } = data
    const totalExposure = impacts.reduce((s, i) => s + i.exposureUsd, 0)
    const totalImpact = impacts.reduce((s, i) => s + i.impactUsd, 0)
    const inProgress = briefs.filter((b) => b.status === 'queued' || b.status === 'generating').length
    const drafted = briefs.filter((b) => ['draft', 'approved', 'rejected'].includes(b.status)).length
    const callToday = briefs.filter((b) => b.priority === 'call_today').length

    return (
        <div className="space-y-8">
            <div>
                <Link href="/advisor" className="text-sm text-muted-foreground hover:text-foreground">← Book Monitor</Link>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h2 className="text-3xl font-bold tracking-tight">
                        {event.coin.name}{' '}
                        <span className={event.changePct < 0 ? 'text-red-400' : 'text-emerald-400'}>{pct(event.changePct)}</span>
                    </h2>
                    <SourceBadge source={event.source} />
                </div>
                <p className="mt-1 text-muted-foreground">
                    {event.startPrice && event.endPrice
                        ? `${price(event.startPrice)} → ${price(event.endPrice)} over ${event.windowLabel ?? 'the window'}, `
                        : ''}
                    {event.source === 'replay' ? `${date(event.occurredAt)} (applied to today's book)` : dateTime(event.occurredAt)}
                </p>
                {event.aiExplanation && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{event.aiExplanation}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Affected households" value={impacts.length} />
                <Stat label="Exposure in the book" value={usd(totalExposure, { compact: true })} />
                <Stat label="Estimated book impact" value={usd(totalImpact, { compact: true })} />
                <Stat label="Call today" value={drafted ? callToday : '—'} hint={drafted ? `of ${drafted} briefs drafted` : 'after briefs are drafted'} />
            </div>

            <Panel
                title="Households ranked by dollar impact"
                action={
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex rounded-md border text-xs">
                            {(['impact', 'priority'] as const).map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setSortBy(s)}
                                    className={`px-2.5 py-1 capitalize ${sortBy === s ? 'bg-secondary font-medium' : 'text-muted-foreground'}`}
                                >
                                    Sort by {s}
                                </button>
                            ))}
                        </div>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            Top
                            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded border bg-background px-1.5 py-1">
                                {[3, 5, 8, 12, 20].map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </label>
                        <button
                            onClick={draftBriefs}
                            disabled={starting || inProgress > 0 || impacts.length === 0}
                            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {inProgress > 0 ? `Drafting… ${inProgress} left` : starting ? 'Starting…' : 'Draft briefs with AI'}
                        </button>
                    </div>
                }
            >
                {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
                {impacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No households hold {event.coin.name}.</p>
                ) : (
                    <div className="-mx-5 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                                    <th className="px-5 py-2 font-medium">#</th>
                                    <th className="px-3 py-2 font-medium">Household</th>
                                    <th className="px-3 py-2 font-medium">Risk</th>
                                    <th className="px-3 py-2 text-right font-medium">Exposure</th>
                                    <th className="px-3 py-2 text-right font-medium">Impact</th>
                                    <th className="px-3 py-2 font-medium">Priority</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-5 py-2" />
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {rows.map(({ impact: i, rank, brief }) => (
                                    <tr key={i.householdId} className="hover:bg-secondary/20">
                                        <td className="px-5 py-3 tabular-nums text-muted-foreground">{rank}</td>
                                        <td className="px-3 py-3">
                                            <div className="font-medium">{i.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {i.primaryContact} · {usd(i.aumUsd, { compact: true })} · {i.exposedHoldings.map((h) => h.symbol).join(', ')}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 capitalize text-muted-foreground">{i.riskProfile}</td>
                                        <td className="px-3 py-3 text-right tabular-nums">
                                            {usd(i.exposureUsd)}
                                            <div className="text-xs text-muted-foreground">{i.exposurePctOfAum.toFixed(1)}% of portfolio</div>
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums text-red-400">
                                            {usd(i.impactUsd)}
                                            <div className="text-xs text-muted-foreground">{pct(i.impactPctOfAum)} of portfolio</div>
                                        </td>
                                        <td className="px-3 py-3"><PriorityBadge priority={brief?.priority} /></td>
                                        <td className="px-3 py-3">
                                            <StatusBadge status={brief?.status} />
                                            {brief?.complianceFlags && brief.complianceFlags.length > 0 && (
                                                <div className="mt-1 text-xs text-amber-400">⚠ compliance flag</div>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {brief && ['draft', 'approved', 'rejected', 'failed'].includes(brief.status) && (
                                                <Link href={`/advisor/briefs/${brief.id}`} className="text-sm font-medium text-primary hover:underline">
                                                    {brief.status === 'draft' ? 'Review →' : 'View →'}
                                                </Link>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>
        </div>
    )
}
