import { cn } from '@/lib/utils'

const PRIORITY: Record<string, { label: string; className: string }> = {
    call_today: { label: 'Call today', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
    send_message: { label: 'Send message', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    monitor: { label: 'Monitor', className: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
}

const URGENCY: Record<string, { label: string; className: string }> = {
    check_in_today: { label: 'Worth a look today', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    good_to_know: { label: 'Good to know', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
    within_your_plan: { label: 'Within your plan', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
}

export const URGENCY_LABEL = Object.fromEntries(Object.entries(URGENCY).map(([k, v]) => [k, v.label]))

const STATUS: Record<string, { label: string; className: string }> = {
    queued: { label: 'Queued', className: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
    generating: { label: 'Drafting…', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse' },
    draft: { label: 'Needs review', className: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
    approved: { label: 'Approved', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    rejected: { label: 'Rejected', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30 line-through' },
    failed: { label: 'Failed', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
}

function Pill({ label, className }: { label: string; className: string }) {
    return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', className)}>{label}</span>
}

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
    if (!priority) return <span className="text-muted-foreground text-xs">—</span>
    return <Pill {...(PRIORITY[priority] ?? { label: priority, className: '' })} />
}

export function UrgencyBadge({ urgency }: { urgency: string | null | undefined }) {
    if (!urgency) return null
    return <Pill {...(URGENCY[urgency] ?? { label: urgency, className: '' })} />
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
    if (!status) return <span className="text-muted-foreground text-xs">Not drafted</span>
    return <Pill {...(STATUS[status] ?? { label: status, className: '' })} />
}

export function SourceBadge({ source }: { source: string }) {
    return source === 'replay' ? (
        <Pill label="Historical replay" className="bg-sky-500/15 text-sky-300 border-sky-500/30" />
    ) : (
        <Pill label="Live" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30" />
    )
}

export function Panel({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn('rounded-xl border bg-card/50', className)}>
            {(title || action) && (
                <div className="flex items-center justify-between gap-4 border-b px-5 py-3">
                    <h3 className="text-sm font-semibold">{title}</h3>
                    {action}
                </div>
            )}
            <div className="p-5">{children}</div>
        </section>
    )
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
    return (
        <div className="rounded-xl border bg-card/50 px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
            {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
    )
}
