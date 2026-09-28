import { cn } from '@/lib/utils'

const URGENCY: Record<string, { label: string; className: string }> = {
    check_in_today: { label: 'Worth a look today', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    good_to_know: { label: 'Good to know', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
    within_your_plan: { label: 'Within your plan', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
}

export function UrgencyBadge({ urgency }: { urgency: string | null | undefined }) {
    if (!urgency) return null
    const u = URGENCY[urgency] ?? { label: urgency, className: '' }
    return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', u.className)}>{u.label}</span>
}

export function Panel({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn('interactive-surface rounded-xl border bg-card/50', className)}>
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
