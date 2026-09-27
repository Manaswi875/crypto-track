'use client'

import { useEffect, useRef, useState } from 'react'

type Turn = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = ['How am I doing overall?', 'Which of my holdings is riskiest?', 'What if Bitcoin fell 30%?', 'How did my coins do after past crashes?']

const storeKey = (investorId: string) => `ask-thread:${investorId}`

/** "Ask about my money": a chat about the current investor's portfolio, available on every page. */
export function AskDrawer() {
    const [open, setOpen] = useState(false)
    const [investorId, setInvestorId] = useState('you')
    const [thread, setThread] = useState<Turn[]>([])
    const [question, setQuestion] = useState('')
    const [pending, setPending] = useState<{ question: string; answer: string } | null>(null)
    const endRef = useRef<HTMLDivElement>(null)

    // Follow whichever investor the page is showing; the thread persists for the session
    useEffect(() => {
        if (!open) return
        const id = new URLSearchParams(window.location.search).get('investor') ?? 'you'
        setInvestorId(id)
        try {
            setThread(JSON.parse(sessionStorage.getItem(storeKey(id)) ?? '[]'))
        } catch {
            setThread([])
        }
    }, [open])

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' })
    }, [thread, pending])

    async function ask(q: string) {
        const text = q.trim()
        if (!text || pending) return
        setQuestion('')
        setPending({ question: text, answer: '' })
        const res = await fetch(`/api/investors/${investorId}/ask`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ question: text, history: thread }),
        })
        let answer = ''
        if (!res.ok || !res.body) {
            answer = res.headers.get('content-type')?.includes('json') ? ((await res.json()).error ?? 'Something went wrong.') : 'Something went wrong.'
        } else {
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            for (;;) {
                const { value, done } = await reader.read()
                if (done) break
                answer += decoder.decode(value, { stream: true })
                setPending({ question: text, answer })
            }
        }
        const next: Turn[] = [...thread, { role: 'user', content: text }, { role: 'assistant', content: answer.trim() }]
        setThread(next)
        setPending(null)
        try {
            sessionStorage.setItem(storeKey(investorId), JSON.stringify(next))
        } catch {}
    }

    function clear() {
        setThread([])
        try {
            sessionStorage.removeItem(storeKey(investorId))
        } catch {}
    }

    return (
        <>
            {!open && (
                <button
                    onClick={() => setOpen(true)}
                    className="fixed bottom-5 right-5 z-40 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
                >
                    Ask about my money
                </button>
            )}

            {open && (
                <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-2xl">
                    <div className="flex items-center justify-between border-b px-5 py-3">
                        <div>
                            <h3 className="text-sm font-semibold">Ask about {investorId === 'you' ? 'your' : 'this'} money</h3>
                            <p className="text-xs text-muted-foreground">Answers use your goal, holdings and today&apos;s market. No buy or sell advice.</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                            {thread.length > 0 && (
                                <button onClick={clear} className="text-muted-foreground hover:text-foreground">
                                    Clear
                                </button>
                            )}
                            <button onClick={() => setOpen(false)} className="text-lg leading-none text-muted-foreground hover:text-foreground" aria-label="Close">
                                ✕
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto p-5">
                        {thread.map((t, i) =>
                            t.role === 'user' ? (
                                <div key={i} className="ml-auto max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-sm">{t.content}</div>
                            ) : (
                                <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">{t.content}</p>
                            ),
                        )}
                        {pending && (
                            <>
                                <div className="ml-auto max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-sm">{pending.question}</div>
                                {pending.answer ? (
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{pending.answer}</p>
                                ) : (
                                    <p className="animate-pulse text-sm text-muted-foreground">Thinking…</p>
                                )}
                            </>
                        )}
                        {thread.length === 0 && !pending && (
                            <div className="flex flex-wrap gap-2">
                                {SUGGESTIONS.map((s) => (
                                    <button key={s} onClick={() => ask(s)} className="rounded-full border px-3 py-1 text-xs hover:bg-secondary">
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault()
                            ask(question)
                        }}
                        className="flex gap-2 border-t p-4"
                    >
                        <input
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            maxLength={500}
                            placeholder="Ask anything about your money or the market…"
                            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <button type="submit" disabled={!question.trim() || pending !== null} className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                            Ask
                        </button>
                    </form>
                </aside>
            )}
        </>
    )
}
