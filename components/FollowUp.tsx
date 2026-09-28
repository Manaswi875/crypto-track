'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type ThreadMessage = { id: string; role: string; content: string; quote: string | null }

const SUGGESTIONS = ['Has crypto fallen like this before?', 'Why did some coins fall more than others?', 'What exactly is my Bitcoin fund?']

/**
 * Follow-up questions about an insight. Highlight any text inside the element
 * with id `selectableId` to ask about that part specifically.
 */
export function FollowUp({ insightId, selectableId, initial }: { insightId: string; selectableId: string; initial: ThreadMessage[] }) {
    const [thread, setThread] = useState<ThreadMessage[]>(initial)
    const [question, setQuestion] = useState('')
    const [quote, setQuote] = useState<string | null>(null)
    const [pending, setPending] = useState<{ question: string; quote: string | null; answer: string } | null>(null)
    const [popover, setPopover] = useState<{ text: string; top: number; left: number } | null>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => setThread(initial), [initial])

    // Show an "Ask about this" button next to a text selection inside the insight
    useEffect(() => {
        const onMouseUp = () => {
            const sel = window.getSelection()
            const text = sel?.toString().trim() ?? ''
            const container = document.getElementById(selectableId)
            if (!sel || !text || !container || sel.rangeCount === 0 || !container.contains(sel.anchorNode)) return setPopover(null)
            const rect = sel.getRangeAt(0).getBoundingClientRect()
            setPopover({ text: text.slice(0, 1000), top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX + rect.width / 2 })
        }
        const onScrollOrKey = () => setPopover(null)
        document.addEventListener('mouseup', onMouseUp)
        document.addEventListener('keydown', onScrollOrKey)
        return () => {
            document.removeEventListener('mouseup', onMouseUp)
            document.removeEventListener('keydown', onScrollOrKey)
        }
    }, [selectableId])

    const ask = useCallback(
        async (q: string) => {
            const text = q.trim()
            if (!text || pending) return
            const asked = { question: text, quote, answer: '' }
            setPending(asked)
            setQuestion('')
            setQuote(null)

            const res = await fetch(`/api/insights/${insightId}/ask`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ question: text, quote: asked.quote ?? undefined }),
            })
            if (!res.ok || !res.body) {
                const err = res.headers.get('content-type')?.includes('json') ? (await res.json()).error : null
                setPending({ ...asked, answer: err ?? 'Sorry, something went wrong. Please try again.' })
                return
            }
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let answer = ''
            for (;;) {
                const { value, done } = await reader.read()
                if (done) break
                answer += decoder.decode(value, { stream: true })
                setPending({ ...asked, answer })
            }
            // Saved server-side; show it in the thread
            setThread((t) => [
                ...t,
                { id: `u-${Date.now()}`, role: 'user', content: text, quote: asked.quote },
                { id: `a-${Date.now()}`, role: 'assistant', content: answer.trim(), quote: null },
            ])
            setPending(null)
        },
        [insightId, pending, quote],
    )

    return (
        <section className="interactive-surface rounded-xl border bg-card/50">
            <div className="border-b px-5 py-3">
                <h3 className="text-sm font-semibold">Ask a follow-up</h3>
                <p className="text-xs text-muted-foreground">Or highlight any part of the insight above to ask about it.</p>
            </div>

            <div className="space-y-4 p-5">
                {thread.map((m) => (m.role === 'user' ? <Question key={m.id} text={m.content} quote={m.quote} /> : <Answer key={m.id} text={m.content} />))}
                {pending && (
                    <>
                        <Question text={pending.question} quote={pending.quote} />
                        {pending.answer ? <Answer text={pending.answer} /> : <p className="animate-pulse text-sm text-muted-foreground">Thinking…</p>}
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

                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        ask(question)
                    }}
                    className="space-y-2"
                >
                    {quote && (
                        <div className="flex items-start gap-2 rounded-md border-l-2 border-primary bg-secondary/40 px-3 py-2 text-xs">
                            <span className="line-clamp-3 flex-1 italic text-muted-foreground">&ldquo;{quote}&rdquo;</span>
                            <button type="button" onClick={() => setQuote(null)} className="text-muted-foreground hover:text-foreground" aria-label="Remove quote">
                                ✕
                            </button>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <textarea
                            ref={inputRef}
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    ask(question)
                                }
                            }}
                            rows={1}
                            maxLength={500}
                            placeholder={quote ? 'What would you like to know about this?' : 'Ask anything about this move or your money…'}
                            className="min-h-[40px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <button
                            type="submit"
                            disabled={!question.trim() || pending !== null}
                            className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            Ask
                        </button>
                    </div>
                </form>
            </div>

            {popover && (
                <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                        setQuote(popover.text)
                        setPopover(null)
                        window.getSelection()?.removeAllRanges()
                        inputRef.current?.focus()
                    }}
                    style={{ position: 'absolute', top: popover.top, left: popover.left, transform: 'translateX(-50%)' }}
                    className="z-50 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
                >
                    Ask about this
                </button>
            )}
        </section>
    )
}

function Question({ text, quote }: { text: string; quote: string | null }) {
    return (
        <div className="ml-auto max-w-[85%] space-y-1 rounded-lg bg-secondary px-3 py-2 text-sm">
            {quote && <div className="line-clamp-2 border-l-2 border-primary/60 pl-2 text-xs italic text-muted-foreground">&ldquo;{quote}&rdquo;</div>}
            <div>{text}</div>
        </div>
    )
}

function Answer({ text }: { text: string }) {
    return <p className="max-w-[90%] whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
}
