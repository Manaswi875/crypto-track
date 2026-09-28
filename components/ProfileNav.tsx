'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

export function ProfileNav() {
    const pathname = usePathname()
    const investorId = useSearchParams().get('investor') ?? 'you'
    const suffix = investorId === 'you' ? '' : `?investor=${encodeURIComponent(investorId)}`
    const links = [
        { href: `/${suffix}`, path: '/', label: 'Today' },
        { href: `/markets${suffix}`, path: '/markets', label: 'Market' },
        { href: `/practice${suffix}`, path: '/practice', label: 'Crash Lab' },
        { href: '/paper', path: '/paper', label: 'Paper Portfolio' },
        { href: `/portfolio/edit${suffix}`, path: '/portfolio/edit', label: 'Your Plan' },
    ]

    return (
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
            {links.map((link) => {
                const active = pathname === link.path || (link.path !== '/' && pathname.startsWith(`${link.path}/`))
                return <Link key={link.path} href={link.href} aria-current={active ? 'page' : undefined} className={`group relative rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 ${active ? 'bg-violet-100 text-violet-800 shadow-[0_8px_24px_-15px_rgba(109,40,217,0.8)]' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}><span className="relative z-10">{link.label}</span>{active && <span className="absolute inset-x-4 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-sky-400" />}</Link>
            })}
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
