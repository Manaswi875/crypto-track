'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export function ProfileNav() {
    const investorId = useSearchParams().get('investor') ?? 'you'
    const suffix = investorId === 'you' ? '' : `?investor=${encodeURIComponent(investorId)}`

    return (
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
            <Link href={`/${suffix}`} className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">Today</Link>
            <Link href={`/markets${suffix}`} className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">Market</Link>
            <Link href={`/practice${suffix}`} className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">Crash Lab</Link>
            <Link href={`/portfolio/edit${suffix}`} className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">Your Plan</Link>
        </nav>
    )
}

export function ProfileBrand() {
    const investorId = useSearchParams().get('investor') ?? 'you'
    const href = investorId === 'you' ? '/' : `/?investor=${encodeURIComponent(investorId)}`

    return (
        <Link href={href} className="flex items-center gap-2">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 via-fuchsia-400 to-red-400 font-black text-slate-950 shadow-[0_0_24px_rgba(192,132,252,0.25)]">
                <span className="absolute inset-0 animate-pulse rounded-full ring-1 ring-white/40" />
                <span className="relative">C</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">Crypto<span className="text-primary">Pulse</span></h1>
        </Link>
    )
}
