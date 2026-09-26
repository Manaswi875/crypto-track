'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Panel } from '@/components/advisor/Badges'
import { dateTime } from '@/lib/format'

type Entry = { id: string; action: string; actor: string; entityType: string; entityId: string; details: Record<string, unknown> | null; createdAt: string }

export default function AuditLog() {
    const [entries, setEntries] = useState<Entry[] | null>(null)

    useEffect(() => {
        fetch('/api/advisor/audit').then(async (r) => r.ok && setEntries(await r.json()))
    }, [])

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Audit Trail</h2>
                <p className="text-muted-foreground">Every event, AI draft, and advisor decision, in order. Nothing reaches a client without an advisor approval on record.</p>
            </div>
            <Panel>
                {!entries ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                    <div className="-mx-5 -my-5 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                                    <th className="px-5 py-2 font-medium">Time</th>
                                    <th className="px-3 py-2 font-medium">Action</th>
                                    <th className="px-3 py-2 font-medium">Actor</th>
                                    <th className="px-3 py-2 font-medium">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {entries.map((e) => (
                                    <tr key={e.id} className="align-top">
                                        <td className="whitespace-nowrap px-5 py-2.5 text-muted-foreground">{dateTime(e.createdAt)}</td>
                                        <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                                            {e.entityType === 'brief' ? (
                                                <Link href={`/advisor/briefs/${e.entityId}`} className="hover:underline">{e.action.replace(/_/g, ' ')}</Link>
                                            ) : e.entityType === 'event' ? (
                                                <Link href={`/advisor/events/${e.entityId}`} className="hover:underline">{e.action.replace(/_/g, ' ')}</Link>
                                            ) : (
                                                e.action.replace(/_/g, ' ')
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{e.actor.replace('advisor:', '')}</td>
                                        <td className="px-3 py-2.5">
                                            <code className="line-clamp-2 break-all text-xs text-muted-foreground">{e.details ? JSON.stringify(e.details) : ''}</code>
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
