'use client'

import { useEffect, useRef, useState } from 'react'

type Turn = { role: 'user' | 'assistant'; content: string }
type SelectionPrompt = { text: string; top: number; left: number }
type PanelAnchor = { top: number; left: number }
type Presentation = 'sidebar' | 'floating'

const SUGGESTIONS = ['How am I doing overall?', 'Which of my holdings is riskiest?', 'What if Bitcoin fell 30%?', 'How did my coins do after past crashes?']

const storeKey = (investorId: string) => `ask-thread:${investorId}`

/** "Ask Crypto Pulse": a chat about the current investor's portfolio, available on every page. */
export function AskDrawer() {
    const [open, setOpen] = useState(false)
    const [investorId, setInvestorId] = useState('you')
    const [thread, setThread] = useState<Turn[]>([])
    const [question, setQuestion] = useState('')
    const [pending, setPending] = useState<{ question: string; answer: string } | null>(null)
    const [selectionPrompt, setSelectionPrompt] = useState<SelectionPrompt | null>(null)
    const [panelAnchor, setPanelAnchor] = useState<PanelAnchor | null>(null)
    const [presentation, setPresentation] = useState<Presentation>('sidebar')
    const endRef = useRef<HTMLDivElement>(null)

    // Follow whichever investor the page is showing; the thread persists in this browser
    useEffect(() => {
        if (!open) return
        const id = new URLSearchParams(window.location.search).get('investor') ?? 'you'
        setInvestorId(id)
        try {
            const saved = localStorage.getItem(storeKey(id)) ?? sessionStorage.getItem(storeKey(id)) ?? '[]'
            setThread(JSON.parse(saved))
        } catch {
            setThread([])
        }
    }, [open])

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' })
    }, [thread, pending])

    useEffect(() => {
        const openWithQuestion = (event: Event) => {
            const question = (event as CustomEvent<{ question?: string }>).detail?.question
            const id = new URLSearchParams(window.location.search).get('investor') ?? 'you'
            setInvestorId(id)
            setPanelAnchor(null)
            setPresentation('sidebar')
            setOpen(true)
            if (question) setQuestion(question)
        }
        window.addEventListener('open-ask-pulse', openWithQuestion)
        return () => window.removeEventListener('open-ask-pulse', openWithQuestion)
    }, [])

    useEffect(() => {
        const readSelection = () => {
            window.setTimeout(() => {
                const selection = window.getSelection()
                const text = selection?.toString().replace(/\s+/g, ' ').trim() ?? ''
                if (!selection || selection.rangeCount === 0 || text.length < 2) return setSelectionPrompt(null)

                const anchor = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement
                if (!anchor || anchor.closest('input, textarea, select, button, [contenteditable="true"], [data-no-highlight-ask]')) return setSelectionPrompt(null)
                const insightBody = document.getElementById('insight-body')
                if (insightBody?.contains(selection.anchorNode)) return setSelectionPrompt(null)

                const rect = selection.getRangeAt(0).getBoundingClientRect()
                if (!rect.width && !rect.height) return setSelectionPrompt(null)
                setSelectionPrompt({
                    text: text.slice(0, 360),
                    top: Math.min(window.innerHeight - 56, rect.bottom + 10),
                    left: Math.min(window.innerWidth - 105, Math.max(105, rect.left + rect.width / 2)),
                })
            }, 0)
        }
        const dismiss = () => setSelectionPrompt(null)
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key === 'Escape') dismiss()
            else if (event.shiftKey || event.key.startsWith('Arrow')) readSelection()
        }
        document.addEventListener('pointerup', readSelection)
        document.addEventListener('keyup', onKeyUp)
        window.addEventListener('scroll', dismiss, true)
        window.addEventListener('resize', dismiss)
        return () => {
            document.removeEventListener('pointerup', readSelection)
            document.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('scroll', dismiss, true)
            window.removeEventListener('resize', dismiss)
        }
    }, [])

    function askAboutSelection() {
        if (!selectionPrompt) return
        const id = new URLSearchParams(window.location.search).get('investor') ?? 'you'
        const panelHeight = 520
        const roomBelow = window.innerHeight - selectionPrompt.top
        const top = roomBelow > panelHeight + 28 ? selectionPrompt.top + 42 : Math.max(80, selectionPrompt.top - panelHeight - 18)
        const left = Math.min(window.innerWidth - 232, Math.max(232, selectionPrompt.left))
        setInvestorId(id)
        setQuestion(`What does this mean for my money? “${selectionPrompt.text}”`)
        setPanelAnchor(window.innerWidth >= 640 ? { top, left } : null)
        setPresentation('floating')
        setOpen(true)
        setSelectionPrompt(null)
        window.getSelection()?.removeAllRanges()
    }

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
            localStorage.setItem(storeKey(investorId), JSON.stringify(next))
            sessionStorage.removeItem(storeKey(investorId))
        } catch {}
    }

    function clear() {
        setThread([])
        try {
            localStorage.removeItem(storeKey(investorId))
            sessionStorage.removeItem(storeKey(investorId))
        } catch {}
    }

    return (
        <>
            {selectionPrompt && !open && (
                <div style={{ position: 'fixed', top: selectionPrompt.top, left: selectionPrompt.left, transform: 'translateX(-50%)' }} className="z-[70]">
                    <button
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={askAboutSelection}
                        className="mode-enter flex items-center gap-2 rounded-full bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_14px_34px_rgba(30,41,59,0.28)] transition-transform hover:-translate-y-0.5"
                    >
                        <span className="text-violet-300">✦</span> Ask Pulse about this
                    </button>
                </div>
            )}
            {!open && (
                <button
                    onClick={() => { setPanelAnchor(null); setPresentation('sidebar'); setOpen(true) }}
                    className="group fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-full border border-violet-300/20 bg-white/90 py-2 pl-2 pr-4 text-sm font-semibold text-slate-900 shadow-[0_18px_50px_rgba(79,70,229,0.22)] backdrop-blur-xl transition-transform hover:-translate-y-1 hover:scale-[1.03]"
                >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 text-slate-950 shadow-[0_0_20px_rgba(192,132,252,0.35)]">✦</span>
                    <span>Ask Crypto Pulse</span>
                    <span className="text-violet-300 transition-transform group-hover:translate-x-0.5">→</span>
                </button>
            )}

            {open && (
                <>
                {presentation === 'sidebar' && <button onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-slate-900/15 backdrop-blur-[2px]" aria-label="Close Crypto Pulse assistant" />}
                <aside
                    data-no-highlight-ask
                    style={presentation === 'floating' && panelAnchor ? { top: panelAnchor.top, left: panelAnchor.left, translate: '-50% 0' } : undefined}
                    className={presentation === 'sidebar'
                        ? 'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-violet-200/70 bg-white/95 shadow-[-24px_0_80px_rgba(79,70,229,0.18)] backdrop-blur-2xl'
                        : `mode-enter fixed z-[60] flex max-h-[min(70vh,620px)] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-3xl border border-violet-200/70 bg-white/95 shadow-[0_24px_80px_rgba(79,70,229,0.22)] backdrop-blur-2xl ${panelAnchor ? '' : 'bottom-20 right-4 sm:right-5'}`}
                    role="dialog"
                    aria-modal={presentation === 'sidebar'}
                    aria-label="Ask Crypto Pulse"
                >
                    <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-violet-500/10 to-transparent px-5 py-4">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Personal agent</p>
                            <h3 className="mt-1 text-lg font-semibold">Ask Crypto Pulse</h3>
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
                                <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-violet-400 px-3.5 py-2.5 text-sm text-slate-950">{t.content}</div>
                            ) : (
                                <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">{t.content}</p>
                            ),
                        )}
                        {pending && (
                            <>
                                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-violet-400 px-3.5 py-2.5 text-sm text-slate-950">{pending.question}</div>
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
                                    <button key={s} onClick={() => ask(s)} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-violet-300/30 hover:text-foreground">
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
                        className="flex gap-2 border-t border-white/10 bg-violet-50/70 p-4"
                    >
                        <input
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            maxLength={500}
                            placeholder="Ask anything about your money or the market…"
                            className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm focus:border-violet-300/40 focus:outline-none"
                        />
                        <button type="submit" disabled={!question.trim() || pending !== null} className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-400 text-lg font-semibold text-slate-950 disabled:opacity-40" aria-label="Send question">
                            ↑
                        </button>
                    </form>
                </aside>
                </>
            )}
        </>
    )
}
