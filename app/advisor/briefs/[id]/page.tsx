'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Panel, PriorityBadge, StatusBadge } from '@/components/advisor/Badges'
import { date, dateTime, pct, usd } from '@/lib/format'

type TraceStep =
    | { type: 'reasoning'; text: string; atMs: number }
    | { type: 'tool_call'; tool: string; output: unknown; ms: number; atMs: number }
    | { type: 'model_turn'; stopReason: string | null; inputTokens: number; outputTokens: number; atMs: number }

type BriefData = {
    brief: {
        id: string
        eventId: string
        status: string
        priority: string | null
        exposureUsd: number
        impactUsd: number
        impactPctOfAum: number
        advisorSummary: string | null
        clientMessage: string | null
        finalClientMessage: string | null
        rationale: string | null
        citedFacts: { claim: string; source: string }[] | null
        complianceFlags: { rule: string; match: string }[] | null
        trace: TraceStep[] | null
        edited: boolean
        reviewedBy: string | null
        reviewedAt: string | null
        model: string | null
        inputTokens: number | null
        outputTokens: number | null
        costUsd: number | null
        latencyMs: number | null
        error: string | null
        event: { coin: { name: string }; changePct: number; source: string; occurredAt: string }
        household: {
            name: string
            primaryContact: string
            riskProfile: string
            lifeStage: string
            clientSince: string
            lastContactAt: string
            notes: string
            holdings: { id: string; symbol: string; name: string; assetClass: string; coinId: string | null; marketValue: number }[]
        }
    }
    auditLog: { id: string; action: string; actor: string; createdAt: string; details: Record<string, unknown> | null }[]
}

const TOOL_LABEL: Record<string, string> = {
    get_market_event: 'Looked up the market event',
    get_household_profile: 'Read the household profile and notes',
    get_household_holdings: 'Pulled the household holdings',
    get_event_impact: 'Fetched the computed dollar impact',
    get_price_context: 'Checked longer-term price context',
    submit_brief: 'Submitted the brief',
}

export default function BriefReview({ params }: { params: { id: string } }) {
    const [data, setData] = useState<BriefData | null>(null)
    const [message, setMessage] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        const res = await fetch(`/api/advisor/briefs/${params.id}`)
        if (!res.ok) return
        const json: BriefData = await res.json()
        setData(json)
        setMessage(json.brief.finalClientMessage ?? json.brief.clientMessage ?? '')
    }, [params.id])

    useEffect(() => {
        load()
    }, [load])

    async function review(action: 'approve' | 'reject') {
        setSaving(true)
        setError(null)
        const res = await fetch(`/api/advisor/briefs/${params.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(action === 'approve' ? { action, clientMessage: message } : { action }),
        })
        setSaving(false)
        if (!res.ok) {
            const body = await res.json()
            setError(
                body.flags
                    ? `Blocked by compliance check: ${body.flags.map((f: { match: string }) => `"${f.match}"`).join(', ')}`
                    : (body.error ?? 'Review failed'),
            )
            return
        }
        load()
    }

    if (!data) return <div className="text-muted-foreground">Loading brief…</div>

    const { brief, auditLog } = data
    const h = brief.household
    const aum = h.holdings.reduce((s, x) => s + x.marketValue, 0)
    const isDraft = brief.status === 'draft'
    const words = message.trim() ? message.trim().split(/\s+/).length : 0
    const flags = brief.complianceFlags ?? []

    return (
        <div className="space-y-6">
            <div>
                <Link href={`/advisor/events/${brief.eventId}`} className="text-sm text-muted-foreground hover:text-foreground">
                    ← {brief.event.coin.name} {pct(brief.event.changePct)} ({brief.event.source === 'replay' ? date(brief.event.occurredAt) : 'live'})
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h2 className="text-3xl font-bold tracking-tight">{h.name}</h2>
                    <PriorityBadge priority={brief.priority} />
                    <StatusBadge status={brief.status} />
                </div>
                <p className="mt-1 text-muted-foreground">
                    Estimated impact <span className="font-medium text-red-400">{usd(brief.impactUsd)}</span> ({pct(brief.impactPctOfAum)} of portfolio) on{' '}
                    {usd(brief.exposureUsd)} of {brief.event.coin.name} exposure
                </p>
            </div>

            {brief.status === 'failed' && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">Agent failed: {brief.error}</div>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="space-y-6 xl:col-span-2">
                    <Panel title="Brief for the advisor" action={<span className="text-xs text-muted-foreground">Internal · not sent to client</span>}>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{brief.advisorSummary}</p>
                        {brief.rationale && (
                            <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">Why this priority: </span>
                                {brief.rationale}
                            </p>
                        )}
                    </Panel>

                    <Panel
                        title="Draft message to client"
                        action={
                            flags.length === 0 ? (
                                <span className="text-xs text-emerald-400">✓ Passed compliance check</span>
                            ) : (
                                <span className="text-xs text-amber-400">⚠ {flags.map((f) => f.rule.replace(/_/g, ' ')).join(', ')}</span>
                            )
                        }
                    >
                        {isDraft ? (
                            <>
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    rows={9}
                                    className="w-full rounded-lg border bg-background p-3 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                    <span className="text-xs text-muted-foreground">
                                        {words} words · {message.trim() !== (brief.clientMessage ?? '').trim() ? 'edited' : 'unedited AI draft'}
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => review('reject')}
                                            disabled={saving}
                                            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
                                        >
                                            Reject
                                        </button>
                                        <button
                                            onClick={() => review('approve')}
                                            disabled={saving || !message.trim()}
                                            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                                        >
                                            Approve message
                                        </button>
                                    </div>
                                </div>
                                {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
                            </>
                        ) : (
                            <>
                                <p className="whitespace-pre-wrap rounded-lg border bg-background p-3 text-sm leading-relaxed">
                                    {brief.finalClientMessage ?? brief.clientMessage}
                                </p>
                                {brief.reviewedAt && (
                                    <p className="mt-3 text-xs text-muted-foreground">
                                        {brief.status === 'approved' ? 'Approved' : 'Rejected'} by {brief.reviewedBy?.replace('advisor:', '')} on {dateTime(brief.reviewedAt)}
                                        {brief.status === 'approved' && (brief.edited ? ' · edited by advisor' : ' · sent as drafted')}
                                        {brief.status === 'approved' && ' · Demo: no message is actually sent'}
                                    </p>
                                )}
                            </>
                        )}
                    </Panel>

                    {brief.citedFacts && brief.citedFacts.length > 0 && (
                        <Panel title="Sources the agent cited">
                            <ul className="space-y-2 text-sm">
                                {brief.citedFacts.map((f, i) => (
                                    <li key={i} className="flex gap-3">
                                        <code className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">{f.source}</code>
                                        <span>{f.claim}</span>
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}

                    <Panel
                        title="Agent trace"
                        action={
                            brief.latencyMs != null && (
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {brief.model} · {(brief.latencyMs / 1000).toFixed(1)}s · {brief.inputTokens?.toLocaleString()} in / {brief.outputTokens?.toLocaleString()} out · ${brief.costUsd?.toFixed(4)}
                                </span>
                            )
                        }
                    >
                        <Trace steps={brief.trace ?? []} />
                    </Panel>
                </div>

                <div className="space-y-6">
                    <Panel title="Household">
                        <dl className="space-y-2 text-sm">
                            <Info label="Primary contact" value={h.primaryContact} />
                            <Info label="Risk profile" value={<span className="capitalize">{h.riskProfile}</span>} />
                            <Info label="Life stage" value={h.lifeStage} />
                            <Info label="Client since" value={date(h.clientSince)} />
                            <Info label="Last contact" value={date(h.lastContactAt)} />
                            <Info label="Portfolio" value={usd(aum)} />
                        </dl>
                        <div className="mt-4 rounded-lg bg-secondary/40 p-3 text-sm">
                            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Meeting notes (internal)</div>
                            {h.notes}
                        </div>
                    </Panel>

                    <Panel title="Holdings">
                        <ul className="space-y-2 text-sm">
                            {[...h.holdings]
                                .sort((a, b) => b.marketValue - a.marketValue)
                                .map((x) => (
                                    <li key={x.id} className={`flex items-center justify-between gap-3 ${x.coinId ? 'text-amber-300' : ''}`}>
                                        <span>
                                            <span className="font-medium">{x.symbol}</span>{' '}
                                            <span className={x.coinId ? 'text-amber-300/70' : 'text-muted-foreground'}>{x.name}</span>
                                        </span>
                                        <span className="tabular-nums">{((x.marketValue / aum) * 100).toFixed(1)}%</span>
                                    </li>
                                ))}
                        </ul>
                    </Panel>

                    <Panel title="Audit trail">
                        <ol className="space-y-3 text-sm">
                            {auditLog.map((a) => (
                                <li key={a.id}>
                                    <div className="font-medium">{a.action.replace(/_/g, ' ')}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {a.actor.replace('advisor:', '')} · {dateTime(a.createdAt)}
                                    </div>
                                </li>
                            ))}
                        </ol>
                        <Link href="/advisor/audit" className="mt-4 block text-xs text-primary hover:underline">Full audit log →</Link>
                    </Panel>
                </div>
            </div>
        </div>
    )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right">{value}</dd>
        </div>
    )
}

function Trace({ steps }: { steps: TraceStep[] }) {
    if (steps.length === 0) return <p className="text-sm text-muted-foreground">No trace recorded.</p>
    return (
        <ol className="relative space-y-3 border-l pl-5">
            {steps
                .filter((s) => s.type !== 'model_turn')
                .map((s, i) => (
                    <li key={i} className="relative">
                        <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ${s.type === 'reasoning' ? 'bg-violet-400' : 'bg-sky-400'}`} />
                        {s.type === 'reasoning' ? (
                            <details>
                                <summary className="cursor-pointer text-sm text-violet-300">
                                    Reasoning <span className="text-xs text-muted-foreground">· {(s.atMs / 1000).toFixed(1)}s</span>
                                </summary>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{s.text}</p>
                            </details>
                        ) : (
                            <details>
                                <summary className="cursor-pointer text-sm">
                                    {TOOL_LABEL[s.tool] ?? s.tool}{' '}
                                    <code className="text-xs text-muted-foreground">{s.tool}</code>{' '}
                                    <span className="text-xs text-muted-foreground">· {(s.atMs / 1000).toFixed(1)}s</span>
                                </summary>
                                <pre className="mt-1 max-h-64 overflow-auto rounded bg-secondary/40 p-2 text-xs text-muted-foreground">
                                    {JSON.stringify(s.output, null, 2)}
                                </pre>
                            </details>
                        )}
                    </li>
                ))}
        </ol>
    )
}
