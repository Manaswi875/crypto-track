'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { SourceBadge, UrgencyBadge } from '@/components/advisor/Badges'
import { date, dateTime, pct, price, usd } from '@/lib/format'

type Row = {
    id: string
    name: string
    tagline: string
    isDemo: boolean
    dropComfortPct: number
    impact: { totalUsd: number; exposureUsd: number; exposurePctOfTotal: number; impactUsd: number; impactPctOfTotal: number }
    insight: { id: string; status: string; urgency: string | null; headline: string | null } | null
}
type CompareData = {
    event: { id: string; coin: { name: string }; changePct: number; source: string; occurredAt: string; startPrice: number | null; endPrice: number | null }
    investors: Row[]
}

export default function Compare({ params }: { params: { id: string } }) {
    const [data, setData] = useState<CompareData | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        const res = await fetch(`/api/events/${params.id}/compare`)
        if (res.ok) setData(await res.json())
    }, [params.id])

    useEffect(() => {
        load()
    }, [load])

    const anyGenerating = data?.investors.some((i) => i.insight?.status === 'generating')
    useEffect(() => {
        if (!anyGenerating) return
        const t = setInterval(load, 2500)
        return () => clearInterval(t)
    }, [anyGenerating, load])

    async function generate(investorId: string) {
        setBusy(investorId)
        setError(null)
        const res = await fetch('/api/insights', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ eventId: params.id, investorId }),
        })
        setBusy(null)
        if (!res.ok) setError((await res.json()).error ?? 'Could not start')
        load()
    }

    if (!data) return <div className="text-muted-foreground">Loading…</div>
    const { event, investors } = data

    return (
        <div className="space-y-6">
            <div>
                <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← My Portfolio</Link>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h2 className="text-3xl font-bold tracking-tight">
                        {event.coin.name} <span className={event.changePct < 0 ? 'text-red-400' : 'text-emerald-400'}>{pct(event.changePct)}</span>
                    </h2>
                    <SourceBadge source={event.source} />
                </div>
                <p className="mt-1 text-muted-foreground">
                    {event.startPrice && event.endPrice ? `${price(event.startPrice)} → ${price(event.endPrice)} · ` : ''}
                    {event.source === 'replay' ? date(event.occurredAt) : dateTime(event.occurredAt)} · Same move, different people, different meaning.
                </p>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {investors.map((i) => {
                    const affected = i.impact.exposureUsd > 0
                    const beyondComfort = Math.abs(event.changePct) > i.dropComfortPct
                    return (
                        <div key={i.id} className="flex flex-col rounded-xl border bg-card/50 p-5">
                            <div className="font-semibold">{i.name}</div>
                            <div className="text-xs text-muted-foreground">{i.tagline}</div>

                            {affected ? (
                                <>
                                    <div className="mt-4 text-2xl font-semibold tabular-nums text-red-400">{usd(i.impact.impactUsd)}</div>
                                    <div className="text-sm text-muted-foreground">
                                        {pct(i.impact.impactPctOfTotal)} of {usd(i.impact.totalUsd, { compact: true })} · crypto is {i.impact.exposurePctOfTotal.toFixed(0)}%
                                    </div>
                                    <div className={`mt-1 text-xs ${beyondComfort ? 'text-amber-400' : 'text-emerald-400'}`}>
                                        {beyondComfort ? `Exceeds their ${i.dropComfortPct}% loss tolerance` : `Within their ${i.dropComfortPct}% loss tolerance`}
                                    </div>

                                    <div className="mt-4 flex-1 border-t pt-4">
                                        {i.insight?.status === 'ready' ? (
                                            <Link href={`/insights/${i.insight.id}`} className="group block space-y-2">
                                                <UrgencyBadge urgency={i.insight.urgency} />
                                                <p className="text-sm leading-snug group-hover:underline">{i.insight.headline}</p>
                                            </Link>
                                        ) : i.insight?.status === 'generating' ? (
                                            <p className="animate-pulse text-sm text-muted-foreground">Writing insight…</p>
                                        ) : (
                                            <button
                                                onClick={() => generate(i.id)}
                                                disabled={busy !== null}
                                                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
                                            >
                                                {busy === i.id ? 'Starting…' : i.insight?.status === 'failed' ? 'Retry insight' : 'Generate insight'}
                                            </button>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <p className="mt-4 text-sm text-muted-foreground">Doesn&apos;t hold {event.coin.name}. Nothing changes, so no AI call is needed.</p>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
