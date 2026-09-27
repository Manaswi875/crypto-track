'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Panel } from '@/components/Badges'
import { DRAFT_KEY } from '@/lib/draft'

const EXAMPLE =
    "I'm 34 and saving for a house in about two years. I have around $15k in Bitcoin through the IBIT fund. I put in $12k. I also have $40k in savings and about $60k in my 401(k). Honestly I get nervous when crypto drops; if it fell more than 20% I'd probably panic."

export default function Setup() {
    const router = useRouter()
    const [text, setText] = useState('')
    const [working, setWorking] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function build() {
        setWorking(true)
        setError(null)
        const res = await fetch('/api/profile/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
        setWorking(false)
        if (!res.ok) return setError((await res.json()).error ?? 'Something went wrong')
        try {
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify((await res.json()).draft))
        } catch {
            return setError('Your browser blocked temporary storage, so the draft could not be passed on.')
        }
        router.push('/portfolio/edit?draft=1')
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div>
                <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Today</Link>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">Tell us about your money</h2>
                <p className="text-muted-foreground">In your own words. The AI turns it into your profile, and you check every field before anything is saved.</p>
            </div>

            <Panel>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={7}
                    maxLength={2000}
                    placeholder="What's the money for and when will you need it? What crypto do you hold, and roughly what's it worth? What did you put in? What else do you have saved? How would you feel if crypto dropped?"
                    className="w-full rounded-lg border bg-background p-3 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <button onClick={() => setText(EXAMPLE)} className="text-xs text-muted-foreground hover:text-foreground">
                        Use an example
                    </button>
                    <button
                        onClick={build}
                        disabled={working || text.trim().length < 10}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {working ? 'Reading…' : 'Build my profile'}
                    </button>
                </div>
                {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            </Panel>

            <p className="text-xs text-muted-foreground">
                Rather fill in a form? <Link href="/portfolio/edit" className="text-primary hover:underline">Edit your portfolio directly →</Link>
            </p>
        </div>
    )
}
