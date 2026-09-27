'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Panel, UrgencyBadge } from '@/components/advisor/Badges'
import { Trace, TraceStep } from '@/components/Trace'
import { date, dateTime, pct, usd } from '@/lib/format'

type InsightData = {
    insight: {
        id: string
        eventId: string
        investorId: string
        status: string
        exposureUsd: number
        impactUsd: number
        impactPctOfTotal: number
        urgency: string | null
        headline: string | null
        whatHappened: string | null
        whatItMeans: string | null
        yourPlan: string | null
        questions: string[] | null
        citedFacts: { claim: string; source: string }[] | null
        complianceFlags: { rule: string; match: string }[] | null
        trace: TraceStep[] | null
        model: string | null
        inputTokens: number | null
        outputTokens: number | null
        costUsd: number | null
        latencyMs: number | null
        error: string | null
        createdAt: string
        event: { coin: { name: string }; changePct: number; source: string; occurredAt: string; startPrice: number | null; endPrice: number | null }
        investor: { id: string; name: string; isDemo: boolean; plan: string; dropComfortPct: number; positions: { marketValue: number }[] }
    }
    siblings: { id: string; investorId: string; urgency: string | null; investor: { name: string } }[]
}

const WORKING_STEPS = ['Looking up the move', 'Reading your plan', 'Checking your positions', 'Putting it in context', 'Writing it up']

export default function InsightPage({ params }: { params: { id: string } }) {
    const [data, setData] = useState<InsightData | null>(null)
    const [tick, setTick] = useState(0)
    const [regenerating, setRegenerating] = useState(false)

    const load = useCallback(async () => {
        const res = await fetch(`/api/insights/${params.id}`)
        if (res.ok) setData(await res.json())
    }, [params.id])

    useEffect(() => {
        load()
    }, [load])

    // Poll while the agent is working
    const generating = data?.insight.status === 'generating'
    useEffect(() => {
        if (!generating) return
        const t = setInterval(() => {
            setTick((n) => n + 1)
            load()
        }, 2000)
        return () => clearInterval(t)
    }, [generating, load])

    async function regenerate() {
        if (!data || !confirm('Run the AI again for this insight? This uses API credits (about $0.10).')) return
        setRegenerating(true)
        await fetch('/api/insights', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ eventId: data.insight.eventId, investorId: data.insight.investorId, regenerate: true }),
        })
        setRegenerating(false)
        load()
    }

    if (!data) return <div className="text-muted-foreground">Loading…</div>

    const { insight: i, siblings } = data
    const who = i.investor.isDemo ? i.investor.name : 'You'
    const total = i.investor.positions.reduce((s, p) => s + p.marketValue, 0)
    const flags = i.complianceFlags ?? []

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div>
                <Link href={`/?investor=${i.investor.id}`} className="text-sm text-muted-foreground hover:text-foreground">
                    ← {i.investor.isDemo ? `${i.investor.name}'s portfolio` : 'Your portfolio'}
                </Link>
                <p className="mt-3 text-sm text-muted-foreground">
                    {i.event.coin.name} <span className={i.event.changePct < 0 ? 'text-red-400' : 'text-emerald-400'}>{pct(i.event.changePct)}</span>
                    {i.event.startPrice && i.event.endPrice ? ` · ${usd(i.event.startPrice)} → ${usd(i.event.endPrice)}` : ''}
                    {' · '}
                    {i.event.source === 'replay' ? `${date(i.event.occurredAt)} (historical replay)` : dateTime(i.event.occurredAt)}
                </p>
            </div>

            {/* Deterministic numbers, shown before and independent of the AI */}
            <div className="grid grid-cols-3 gap-3">
                <Figure label={`${who === 'You' ? 'Your' : `${who}'s`} impact`} value={usd(i.impactUsd)} tone="red" />
                <Figure label="Of total portfolio" value={pct(i.impactPctOfTotal)} tone="red" />
                <Figure label="Crypto exposure" value={usd(i.exposureUsd)} hint={`of ${usd(total)}`} />
            </div>

            {i.status === 'generating' && (
                <Panel>
                    <div className="flex items-center gap-3">
                        <span className="h-3 w-3 animate-ping rounded-full bg-primary" />
                        <span className="text-sm">{WORKING_STEPS[Math.min(tick, WORKING_STEPS.length - 1)]}…</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">The AI is gathering your data with its tools. This usually takes 20–30 seconds.</p>
                </Panel>
            )}

            {i.status === 'failed' && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    The AI couldn&apos;t finish this insight: {i.error}
                </div>
            )}

            {i.status === 'ready' && (
                <>
                    <div className="space-y-3">
                        <UrgencyBadge urgency={i.urgency} />
                        <h2 className="text-2xl font-semibold leading-snug tracking-tight">{i.headline}</h2>
                    </div>

                    <Panel>
                        <div className="space-y-5 text-[15px] leading-relaxed">
                            <Section title="What happened">{i.whatHappened}</Section>
                            <Section title={`What it means for ${who === 'You' ? 'you' : who}`}>{i.whatItMeans}</Section>
                            <Section title={`${who === 'You' ? 'Your' : `${who}'s`} plan`}>{i.yourPlan}</Section>
                            {i.questions && i.questions.length > 0 && (
                                <Section title="Questions worth asking yourself">
                                    <ul className="list-disc space-y-1 pl-5">
                                        {i.questions.map((q, n) => (
                                            <li key={n}>{q}</li>
                                        ))}
                                    </ul>
                                </Section>
                            )}
                        </div>
                        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
                            <span>Educational context, not financial advice.</span>
                            {flags.length === 0 ? (
                                <span className="text-emerald-400">✓ Passed the no-advice check</span>
                            ) : (
                                <span className="text-amber-400">⚠ Flagged: {flags.map((f) => `"${f.match}"`).join(', ')}</span>
                            )}
                        </div>
                    </Panel>

                    {siblings.length > 1 && (
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Same move, other investors:</span>
                            {siblings
                                .filter((s) => s.id !== i.id)
                                .map((s) => (
                                    <Link key={s.id} href={`/insights/${s.id}`} className="rounded-md border px-2.5 py-1 hover:bg-secondary">
                                        {s.investor.name}
                                    </Link>
                                ))}
                            <Link href={`/events/${i.eventId}`} className="text-primary hover:underline">
                                Compare side by side →
                            </Link>
                        </div>
                    )}

                    {i.citedFacts && i.citedFacts.length > 0 && (
                        <Panel title="Where each fact came from">
                            <ul className="space-y-2 text-sm">
                                {i.citedFacts.map((f, n) => (
                                    <li key={n} className="flex gap-3">
                                        <code className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">{f.source}</code>
                                        <span>{f.claim}</span>
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}

                    <Panel
                        title="How the AI got here"
                        action={
                            <span className="text-xs tabular-nums text-muted-foreground">
                                {i.model} · {((i.latencyMs ?? 0) / 1000).toFixed(1)}s · ${i.costUsd?.toFixed(3)}
                            </span>
                        }
                    >
                        <Trace steps={i.trace ?? []} />
                        <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                            <span>
                                {i.inputTokens?.toLocaleString()} tokens in / {i.outputTokens?.toLocaleString()} out · written {dateTime(i.createdAt)}
                            </span>
                            <button onClick={regenerate} disabled={regenerating} className="hover:text-foreground disabled:opacity-50">
                                {regenerating ? 'Starting…' : 'Regenerate'}
                            </button>
                        </div>
                    </Panel>
                </>
            )}
        </div>
    )
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'red' }) {
    return (
        <div className="rounded-xl border bg-card/50 px-4 py-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${tone === 'red' ? 'text-red-400' : ''}`}>{value}</div>
            {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
            <div>{children}</div>
        </div>
    )
}
