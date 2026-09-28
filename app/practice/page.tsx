'use client'

import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { eventTitle, Moves, movesOf } from '@/components/Moves'
import { date, pct, price, usd } from '@/lib/format'

type InvestorSummary = { id: string; name: string; tagline: string; isDemo: boolean }
type Holding = { id: string; name: string; coinId: string; sellValueUsd: number }
type Profile = {
    investor: { id: string; name: string; isDemo: boolean; goal: string; timeHorizon: string; dropComfortPct: number; totalWealthUsd: number }
    holdings: Holding[]
}
type CrashEvent = {
    id: string
    coinId: string
    changePct: number
    moves?: unknown
    source: string
    occurredAt: string
    context?: {
        change_prior_30d_pct?: number
        change_prior_90d_pct?: number
        high_before_event_usd?: number
        low_before_event_usd?: number
        price_on_event_date_usd?: number
    } | null
    after?: { d7: { moves: Record<string, number> } | null; d30: { moves: Record<string, number> } | null; path30: { day: number; moves: Record<string, number> }[]; crashPrices: Record<string, number> } | null
}

export default function CrashPracticePage() {
    const [investors, setInvestors] = useState<InvestorSummary[]>([])
    const [investorId, setInvestorId] = useState('you')
    const [profile, setProfile] = useState<Profile | null>(null)
    const [events, setEvents] = useState<CrashEvent[]>([])
    const [eventId, setEventId] = useState<string | null>(null)
    const [revealed, setRevealed] = useState(false)
    const [replayDay, setReplayDay] = useState(30)
    const [guideDay, setGuideDay] = useState<number | null>(null)
    const [reviewWindow, setReviewWindow] = useState<string | null>(null)
    const [goalCheck, setGoalCheck] = useState<'unchanged' | 'review' | null>(null)
    const [planComplete, setPlanComplete] = useState(false)
    const [entered, setEntered] = useState(false)

    useEffect(() => {
        const selected = new URLSearchParams(window.location.search).get('investor') ?? 'you'
        setInvestorId(selected)
        fetch('/api/investors').then(async (response) => response.ok && setInvestors(await response.json()))
        fetch('/api/events').then(async (response) => response.ok && setEvents((await response.json()).filter((event: CrashEvent) => event.source === 'replay')))
    }, [])

    useEffect(() => {
        window.history.replaceState(null, '', investorId === 'you' ? '/practice' : `/practice?investor=${encodeURIComponent(investorId)}`)
        setProfile(null)
        setRevealed(false)
        setReplayDay(30)
        setGuideDay(null)
        setReviewWindow(null)
        setGoalCheck(null)
        setPlanComplete(false)
        setEntered(false)
        fetch(`/api/investors/${investorId}/sell-check`).then(async (response) => response.ok && setProfile(await response.json()))
    }, [investorId])

    const event = events.find((item) => item.id === eventId) ?? events[0]
    const impact = useMemo(() => {
        if (!profile || !event) return null
        const moves = movesOf(event)
        const affected = profile.holdings.filter((holding) => moves[holding.coinId] != null)
        const impactUsd = affected.reduce((sum, holding) => sum + holding.sellValueUsd * (moves[holding.coinId] / 100), 0)
        const impactPct = profile.investor.totalWealthUsd ? (impactUsd / profile.investor.totalWealthUsd) * 100 : 0
        return {
            impactUsd,
            impactPct,
            affected: affected.length,
            comfortExceeded: Math.abs(impactPct) > profile.investor.dropComfortPct,
        }
    }, [profile, event])

    const trajectory = useMemo(() => {
        if (!profile || !event?.after?.path30?.length) return []
        const crashMoves = movesOf(event)
        const cryptoBefore = profile.holdings.reduce((sum, holding) => sum + holding.sellValueUsd, 0)
        const unaffected = profile.investor.totalWealthUsd - cryptoBefore
        return event.after.path30.map((point) => {
            const cryptoValue = profile.holdings.reduce((sum, holding) => {
                const crashFactor = 1 + (crashMoves[holding.coinId] ?? 0) / 100
                const laterFactor = 1 + (point.moves[holding.coinId] ?? 0) / 100
                return sum + holding.sellValueUsd * crashFactor * laterFactor
            }, 0)
            return { day: point.day, value: unaffected + cryptoValue, cryptoValue }
        })
    }, [profile, event])

    const selectEvent = (id: string) => {
        setEventId(id)
        setRevealed(false)
        setReplayDay(30)
        setGuideDay(null)
        setReviewWindow(null)
        setGoalCheck(null)
        setPlanComplete(false)
        setEntered(false)
    }

    if (!profile || !event || !impact) return <p className="text-muted-foreground">Preparing the Crash Lab…</p>

    const ownerLabel = profile.investor.isDemo ? `${profile.investor.name}’s` : 'Your'
    const eventMoves = movesOf(event)
    const affectedHoldings = profile.holdings.filter((holding) => eventMoves[holding.coinId] != null).map((holding) => holding.name).join(', ')
    const replayPoint = trajectory.find((point) => point.day === replayDay) ?? trajectory[trajectory.length - 1]
    const lowPoint = trajectory.length ? trajectory.reduce((lowest, point) => point.value < lowest.value ? point : lowest) : null
    const highPoint = trajectory.length ? trajectory.reduce((highest, point) => point.value > highest.value ? point : highest) : null
    const crashPoint = trajectory[0]

    const openAi = (question: string) => window.dispatchEvent(new CustomEvent('open-ask-pulse', { detail: { question } }))

    if (!entered) {
        return (
            <CrashEntry event={event} events={events} profile={profile} investors={investors} investorId={investorId} onInvestorChange={setInvestorId} onEventChange={selectEvent} onEnter={() => setEntered(true)} />
        )
    }

    return (
        <div className="space-y-7">
            <LabHeader investors={investors} investorId={investorId} onInvestorChange={setInvestorId} />

            <section className="relative py-9">
                <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">Crash day · Step 1 of 2 · {date(event.occurredAt)}</p><button onClick={() => setEntered(false)} className="text-xs font-medium text-muted-foreground hover:text-foreground">← Choose another crash</button></div>

                <div className="mt-8 grid gap-7 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
                    <div><p className="text-sm text-muted-foreground">Applied to today’s holdings</p><h3 className="mt-2 text-5xl font-semibold tracking-tight sm:text-7xl">{ownerLabel} portfolio falls<br /><span className="text-red-400">{usd(Math.abs(impact.impactUsd))}</span></h3></div>
                    <div className="pb-1 lg:text-right"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">The market move</p><div className="mt-3 lg:flex lg:justify-end"><Moves event={event} className="text-lg" /></div></div>
                </div>

                <div className="mt-10 grid border-y border-white/10 md:grid-cols-3">
                    <FlowStep number="01" label="Market" value={`${date(event.occurredAt)} sell-off`} detail="Actual one-day closing-price moves." />
                    <FlowStep number="02" label="Exposure" value={`${impact.affected} holding${impact.affected === 1 ? '' : 's'} affected`} detail={affectedHoldings || 'No tracked holdings affected'} divided />
                    <FlowStep number="03" label="Personal impact" value={`${pct(impact.impactPct, 2)} of total wealth`} detail={impact.comfortExceeded ? 'Outside your selected comfort range' : 'Inside your selected comfort range'} divided tone={impact.comfortExceeded ? 'red' : 'green'} />
                </div>

                <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="flex gap-4"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-300 shadow-[0_0_15px_rgba(196,181,253,0.75)]" /><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Pulse’s read</p><p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">The crash is dramatic, but the personal result is {pct(Math.abs(impact.impactPct), 2)} of total wealth and it is <span className="text-foreground">{impact.comfortExceeded ? 'outside' : 'inside'} your comfort range</span>. Your goal is “{profile.investor.goal}” with a {profile.investor.timeHorizon} timeline.</p></div></div>
                    <div className="flex flex-wrap items-center gap-6 lg:justify-end"><button onClick={() => openAi(`Why did the ${date(event.occurredAt)} crash affect my current portfolio by ${usd(impact.impactUsd)}? Explain using my holdings, goal, and timeline.`)} className="text-sm font-medium text-violet-300 hover:text-violet-200">✦ Ask AI to explain</button>{!revealed ? <button onClick={() => { setRevealed(true); setReplayDay(0); setGuideDay(null) }} className="group inline-flex items-center gap-4 text-base font-semibold text-foreground"><span className="border-b border-white/30 pb-1 transition-colors group-hover:border-red-300">Reveal days 1–30</span><span className="text-red-300 transition-transform group-hover:translate-x-2">→</span></button> : <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Outcome revealed ↓</span>}</div>
                </div>
            </section>

            {revealed && (
                <section className="mode-enter -mx-4 border-y border-amber-300/20 px-5 py-9 sm:-mx-8 sm:px-10 lg:-mx-12 lg:px-14">
                    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Historical portfolio replay · Step 2 of 2</p><h3 className="mt-1 text-2xl font-semibold">Click a day to see what it would mean for you</h3></div><span className="text-xs text-muted-foreground">Cash and non-crypto assets held flat</span></div>
                    {trajectory.length > 0 && lowPoint && highPoint ? (
                        <>
                            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                                <Metric label={`Portfolio on day ${replayDay}`} value={usd(replayPoint?.value ?? 0)} />
                                <Metric label="Lowest replay value" value={usd(lowPoint.value)} tone="red" />
                                <Metric label="Lowest point" value={`Day ${lowPoint.day}`} />
                                <Metric label="Highest replay value" value={usd(highPoint.value)} tone="green" />
                            </div>
                            <div className="relative mt-6 h-96 cursor-crosshair">
                                <ResponsiveContainer width="100%" height="100%"><AreaChart data={trajectory} margin={{ top: 12, right: 12, bottom: 0, left: 8 }} onClick={(chartState) => { if (chartState?.activeLabel == null) return; const selectedDay = Number(chartState.activeLabel); setReplayDay(selectedDay); setGuideDay((current) => current === selectedDay ? null : selectedDay) }}><defs><linearGradient id="portfolioReplay" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c084fc" stopOpacity={0.3} /><stop offset="100%" stopColor="#c084fc" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="day" tickFormatter={(day) => `Day ${day}`} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} /><YAxis domain={['auto', 'auto']} tickFormatter={(value) => usd(Number(value))} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} width={82} /><Tooltip labelFormatter={(day) => `Day ${day} · click to select`} formatter={(value) => [usd(Number(value)), 'Portfolio']} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }} /><Area type="monotone" dataKey="value" stroke="#c084fc" strokeWidth={2.5} fill="url(#portfolioReplay)" isAnimationActive animationDuration={900} activeDot={{ r: 6, fill: '#c084fc', stroke: 'hsl(var(--background))', strokeWidth: 2 }} /><ReferenceLine x={replayDay} stroke="#c084fc" strokeOpacity={0.45} strokeDasharray="4 5" /><ReferenceDot x={replayPoint?.day} y={replayPoint?.value} r={6} fill="#c084fc" stroke="hsl(var(--background))" strokeWidth={3} /><ReferenceDot x={lowPoint.day} y={lowPoint.value} r={5} fill="#f87171" stroke="hsl(var(--background))" strokeWidth={2} /><ReferenceDot x={highPoint.day} y={highPoint.value} r={5} fill="#34d399" stroke="hsl(var(--background))" strokeWidth={2} /></AreaChart></ResponsiveContainer>
                                {guideDay != null && replayPoint && crashPoint && <ReplayGuide day={replayDay} value={replayPoint.value} totalWealth={profile.investor.totalWealthUsd} crashValue={crashPoint.value} lowDay={lowPoint.day} highDay={highPoint.day} lowValue={lowPoint.value} highValue={highPoint.value} comfortPct={profile.investor.dropComfortPct} />}
                            </div>
                            <div className="mt-3"><input type="range" min={0} max={30} value={replayDay} onChange={(e) => { setReplayDay(Number(e.target.value)); setGuideDay(null) }} className="w-full accent-violet-400" aria-label="Replay day" /><div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground"><span>Crash day</span><span>Day 7 check-in</span><span>Day 30 review</span></div></div>
                            <div className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-[0.8fr_1.2fr]"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Market at day 30</p>{event.after?.d30?.moves && <div className="mt-2"><Moves event={{ ...event, moves: event.after.d30.moves }} className="text-sm" /></div>}</div><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Decision checkpoint</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{replayDay <= 1 ? 'Measure the impact and check whether the loss crossed the plan’s comfort boundary. Avoid treating the first price move as the full story.' : replayDay <= 7 ? 'Revisit the goal and timeline. Note what changed in the portfolio and what did not change in the plan.' : 'Review the full path—not only the best or worst point. Use hindsight to improve the questions you would ask next time, not to manufacture a perfect trade.'}</p></div></div>
                            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">The green and red markers identify the highest and lowest values only in hindsight. They are not buy or sell signals, and another crash may follow a completely different path.</p>
                            <button onClick={() => openAi(`Compare this 30-day historical crash replay with my goal and timeline. What questions should I think through? Do not recommend buying or selling.`)} className="mt-4 rounded-full border border-violet-300/25 bg-violet-400/10 px-4 py-2 text-sm font-medium text-violet-200 hover:bg-violet-400/15">✦ Ask AI about this replay</button>
                            <PracticePlan profile={profile} impact={impact} affectedHoldings={affectedHoldings} reviewWindow={reviewWindow} goalCheck={goalCheck} recommendedWindow={impact.comfortExceeded ? '24 hours' : '7 days'} complete={planComplete} onGoalCheck={(check) => { setGoalCheck(check); setPlanComplete(false) }} onReviewWindow={(window) => { setReviewWindow(window); setPlanComplete(false) }} onComplete={() => setPlanComplete(true)} />
                        </>
                    ) : <p className="mt-5 text-muted-foreground">A complete daily replay is not available for this event.</p>}
                </section>
            )}
        </div>
    )
}

function LabHeader({ investors, investorId, onInvestorChange }: { investors: InvestorSummary[]; investorId: string; onInvestorChange: (id: string) => void }) {
    return <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Crash Lab</p><h2 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Practice calm before it counts.</h2><p className="mt-2 max-w-2xl text-muted-foreground">Revisit real crashes with your current portfolio and build a repeatable first response.</p></div><label className="flex items-center gap-2 text-xs text-muted-foreground">Profile<select value={investorId} onChange={(e) => onInvestorChange(e.target.value)} className="rounded-full border border-white/10 bg-background px-3 py-2 text-foreground"><option value="you">Your portfolio</option>{investors.filter((item) => item.isDemo).map((item) => <option key={item.id} value={item.id}>{item.name}: {item.tagline}</option>)}</select></label></header>
}

function CrashEntry({ event, events, profile, investors, investorId, onInvestorChange, onEventChange, onEnter }: { event: CrashEvent; events: CrashEvent[]; profile: Profile; investors: InvestorSummary[]; investorId: string; onInvestorChange: (id: string) => void; onEventChange: (id: string) => void; onEnter: () => void }) {
    const names: Record<string, { name: string; symbol: string }> = { bitcoin: { name: 'Bitcoin', symbol: 'BTC' }, ethereum: { name: 'Ethereum', symbol: 'ETH' }, solana: { name: 'Solana', symbol: 'SOL' } }
    const moves = movesOf(event)
    const orderedMoves = Object.entries(moves).sort(([first], [second]) => ['bitcoin', 'ethereum', 'solana'].indexOf(first) - ['bitcoin', 'ethereum', 'solana'].indexOf(second))
    const [worstCoinId, worstMove] = orderedMoves.reduce((worst, current) => current[1] < worst[1] ? current : worst)
    const leadCoin = names[worstCoinId] ?? { name: worstCoinId, symbol: worstCoinId.toUpperCase() }
    const fallingCoins = orderedMoves.filter(([, move]) => move < 0).length
    const prior30 = event.context?.change_prior_30d_pct
    const prior90 = event.context?.change_prior_90d_pct
    const eventPrice = event.context?.price_on_event_date_usd
    const priorHigh = event.context?.high_before_event_usd
    const belowPriorHigh = eventPrice && priorHigh ? ((eventPrice - priorHigh) / priorHigh) * 100 : null
    const learner = profile.investor.isDemo ? `${profile.investor.name}’s` : 'your'
    const marketWide = fallingCoins === orderedMoves.length
    return (
        <section className="relative min-h-[calc(100vh-7rem)] py-6">
            <div className="pointer-events-none absolute -left-40 top-10 h-[34rem] w-[34rem] rounded-full bg-red-500/[0.07] blur-[140px]" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-violet-500/[0.04] blur-[140px]" />
            <svg className="pointer-events-none absolute inset-x-0 top-24 h-[52%] w-full opacity-45" viewBox="0 0 1400 500" preserveAspectRatio="none" aria-hidden="true">
                <defs><linearGradient id="crashStroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f87171" stopOpacity="0.05" /><stop offset="0.62" stopColor="#f87171" stopOpacity="0.35" /><stop offset="1" stopColor="#ef4444" stopOpacity="0.9" /></linearGradient></defs>
                <path className="crash-line" d="M0 92 C120 82 205 112 315 98 S515 58 625 110 S770 132 860 172 S960 150 1030 258 S1150 236 1215 338 S1320 378 1400 468" fill="none" stroke="url(#crashStroke)" strokeWidth="5" />
                <path d="M0 92 C120 82 205 112 315 98 S515 58 625 110 S770 132 860 172 S960 150 1030 258 S1150 236 1215 338 S1320 378 1400 468 L1400 500 L0 500Z" fill="url(#crashArea)" opacity="0.14" />
                <defs><linearGradient id="crashArea" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ef4444" /><stop offset="1" stopColor="#ef4444" stopOpacity="0" /></linearGradient></defs>
            </svg>

            <div className="relative z-10 mx-auto max-w-7xl">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3"><span className="h-2 w-2 animate-pulse rounded-full bg-red-400 shadow-[0_0_18px_rgba(248,113,113,0.9)]" /><span className="text-xs font-semibold uppercase tracking-[0.22em] text-red-300">Crash Lab · Historical replay</span></div>
                    <div className="flex flex-wrap items-center gap-3"><select aria-label="Portfolio profile" value={investorId} onChange={(e) => onInvestorChange(e.target.value)} className="bg-transparent text-xs text-muted-foreground outline-none"><option value="you">Your portfolio</option>{investors.filter((item) => item.isDemo).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="text-white/15">/</span><select aria-label="Historical crash" value={event.id} onChange={(e) => onEventChange(e.target.value)} className="bg-transparent text-xs text-foreground outline-none">{events.map((item) => <option key={item.id} value={item.id}>{date(item.occurredAt)}</option>)}</select></div>
                </div>

                <div className="relative flex min-h-[31rem] flex-col justify-center py-14 sm:py-20">
                    <p className="text-sm font-medium uppercase tracking-[0.28em] text-muted-foreground">{date(event.occurredAt)} · {eventTitle(event)}</p>
                    <div className="mt-2 flex items-end gap-4 sm:gap-7"><span className="text-[clamp(6rem,19vw,14rem)] font-semibold leading-[0.82] tracking-[-0.085em] text-red-400 drop-shadow-[0_0_55px_rgba(248,113,113,0.2)]">{pct(worstMove, 1)}</span><span className="mb-2 hidden text-xl font-semibold text-red-200/70 sm:block">{leadCoin.symbol}<br />in one day</span></div>
                    <div className="mt-8 max-w-xl border-l-2 border-red-400/60 pl-5"><p className="text-xl font-medium leading-snug text-foreground sm:text-2xl">{marketWide ? `Bitcoin, Ethereum and Solana fell together.` : `${leadCoin.name} led the sell-off.`}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{leadCoin.name} closed at {price(event.after?.crashPrices?.[worstCoinId] ?? 0)}. {marketWide ? 'The breadth made this a market event, not an isolated coin move.' : `${fallingCoins} of ${orderedMoves.length} tracked assets finished lower.`}</p></div>
                </div>

                <div className="flex flex-col border-y border-white/10 sm:flex-row sm:items-center">
                    {orderedMoves.map(([coinId, move], index) => {
                        const coin = names[coinId] ?? { name: coinId, symbol: coinId.toUpperCase() }
                        return <div key={coinId} className={`flex flex-1 items-baseline justify-between gap-4 py-4 sm:justify-start sm:py-5 ${index > 0 ? 'border-t border-white/10 sm:border-l sm:border-t-0 sm:pl-7' : ''} ${index < orderedMoves.length - 1 ? 'sm:pr-7' : ''}`}><span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{coin.symbol}</span><span className="text-lg font-semibold tabular-nums">{price(event.after?.crashPrices?.[coinId] ?? 0)}</span><span className="ml-auto text-sm font-semibold tabular-nums text-red-400">{pct(move, 1)}</span></div>
                    })}
                </div>

                <div className="grid gap-8 py-10 md:grid-cols-[1fr_1fr_1.15fr] md:gap-0">
                    <CrashBeat number="01" title="Before" text={`${leadCoin.symbol} was ${typeof prior30 === 'number' ? pct(prior30, 1) : 'moving'} over the prior 30 days${typeof prior90 === 'number' ? ` and ${pct(prior90, 1)} over 90 days` : ''}.`} />
                    <CrashBeat number="02" title="The break" text={`${leadCoin.name} fell ${pct(worstMove, 1)}${typeof belowPriorHigh === 'number' ? `, leaving it ${pct(belowPriorHigh, 1)} from its earlier high` : ''}.`} />
                    <div className="md:border-l md:border-white/10 md:pl-8"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">03 · Step inside</p><p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Apply this exact shock to {learner} holdings. Make a first assessment without seeing what happened next.</p><button onClick={onEnter} className="group mt-5 inline-flex items-center gap-5 text-lg font-semibold text-foreground"><span className="border-b border-white/30 pb-1 transition-colors group-hover:border-red-300">Enter the crash</span><span className="text-red-300 transition-transform group-hover:translate-x-2">→</span></button></div>
                </div>
            </div>
        </section>
    )
}

function CrashBeat({ number, title, text }: { number: string; title: string; text: string }) {
    return <div className="md:pr-8"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{number} · {title}</p><p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{text}</p></div>
}

function FlowStep({ number, label, value, detail, divided = false, tone }: { number: string; label: string; value: string; detail: string; divided?: boolean; tone?: 'red' | 'green' }) {
    const color = tone === 'red' ? 'text-red-300' : tone === 'green' ? 'text-emerald-300' : 'text-foreground'
    return <div className={`py-5 md:px-7 ${divided ? 'border-t border-white/10 md:border-l md:border-t-0' : ''}`}><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{number} · {label}</p><p className={`mt-2 text-lg font-semibold ${color}`}>{value}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p></div>
}

function ReplayGuide({ day, value, totalWealth, crashValue, lowDay, highDay, lowValue, highValue, comfortPct }: { day: number; value: number; totalWealth: number; crashValue: number; lowDay: number; highDay: number; lowValue: number; highValue: number; comfortPct: number }) {
    const overallChange = value - totalWealth
    const overallPct = totalWealth ? (overallChange / totalWealth) * 100 : 0
    const sinceCrash = value - crashValue
    const outsideComfort = overallPct < -comfortPct
    const face = overallChange < 0 ? '•︵•' : overallChange > 0 ? '•ᴗ•' : '•‿•'
    const position = day === lowDay ? 'This is the lowest point in this 30-day replay.' : day === highDay ? 'This is the highest point in this 30-day replay.' : day === 0 ? 'This is the crash-day starting point.' : ''
    const direction = overallChange < 0
        ? `${usd(Math.abs(overallChange))} below today’s starting value (${pct(overallPct, 2)}).`
        : overallChange > 0
          ? `${usd(overallChange)} above today’s starting value (${pct(overallPct, 2)}).`
          : 'Back at today’s starting value.'
    const path = day === 0
        ? ''
        : sinceCrash >= 0
          ? ` Since crash day, the portfolio has recovered ${usd(sinceCrash)}.`
          : ` Since crash day, it has fallen another ${usd(Math.abs(sinceCrash))}.`
    const range = highValue - lowValue
    const horizontalPosition = Math.min(91, Math.max(9, 6 + (day / 30) * 90))
    const verticalPosition = range ? Math.min(78, Math.max(12, 12 + (1 - (value - lowValue) / range) * 62)) : 45
    const opensLeft = day > 17

    return <div className="replay-guide pointer-events-none absolute z-20" style={{ left: `${horizontalPosition}%`, top: `${verticalPosition}%` }} role="status" aria-live="polite"><div className="replay-character relative flex h-14 w-14 items-center justify-center" aria-hidden="true"><span className="absolute inset-0 animate-pulse rounded-full bg-violet-400/20 blur-md" /><span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-violet-300/50 bg-white/95 text-base text-violet-700 shadow-[0_12px_34px_rgba(124,58,237,0.24)]">{face}</span></div><div key={day} className={`replay-guide-dialog mode-enter absolute top-1/2 w-[22rem] -translate-y-1/2 border border-violet-300/20 bg-white/95 px-4 py-3 shadow-[0_18px_55px_rgba(79,70,229,0.18)] backdrop-blur-xl ${opensLeft ? 'right-[4.25rem]' : 'left-[4.25rem]'}`}><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">Pulse · Day {day}</p><p className="mt-1.5 text-xs leading-relaxed text-foreground">Your portfolio is <span className="font-semibold">{usd(value)}</span>—{direction}{path} {position}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{outsideComfort ? `Beyond your ${pct(comfortPct, 0)} comfort setting.` : `Inside your ${pct(comfortPct, 0)} comfort setting.`} Historical replay, not a trade signal.</p></div></div>
}

function PracticePlan({ profile, impact, affectedHoldings, reviewWindow, goalCheck, recommendedWindow, complete, onGoalCheck, onReviewWindow, onComplete }: { profile: Profile; impact: { impactUsd: number; impactPct: number; affected: number; comfortExceeded: boolean }; affectedHoldings: string; reviewWindow: string | null; goalCheck: 'unchanged' | 'review' | null; recommendedWindow: string; complete: boolean; onGoalCheck: (check: 'unchanged' | 'review') => void; onReviewWindow: (window: string) => void; onComplete: () => void }) {
    const owner = profile.investor.isDemo ? profile.investor.name : 'You'
    const reviewOptions = ['24 hours', '7 days', '30 days']
    const goalDecision = goalCheck === 'unchanged' ? 'the goal and timeline stay unchanged' : 'the goal or timeline needs a deliberate review'
    return <section className="mt-12 border-t border-white/10 pt-9"><div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Make the replay practical</p><h3 className="mt-3 text-3xl font-semibold tracking-tight">Build a first-response plan.</h3><p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">No prediction and no perfect trade—just the facts to check before emotion turns into a decision.</p></div><div className="border-t border-white/10 lg:border-t-0"><PlanStep number="01" title="Verify the exposure" detail={`${impact.affected} holding${impact.affected === 1 ? '' : 's'} affected: ${affectedHoldings || 'none'}. Estimated crash-day impact: ${usd(impact.impactUsd)} (${pct(impact.impactPct, 2)} of total wealth).`} /><PlanStep number="02" title="Compare it with the boundary" detail={impact.comfortExceeded ? `The loss crosses ${owner === 'You' ? 'your' : `${owner}’s`} ${pct(profile.investor.dropComfortPct, 0)} comfort setting, so the plan deserves a deliberate review.` : `The loss stays inside ${owner === 'You' ? 'your' : `${owner}’s`} ${pct(profile.investor.dropComfortPct, 0)} comfort setting. The market headline is larger than the whole-wealth impact.`} /><div className="border-t border-white/10 py-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">03 · Check the goal</p><p className="mt-2 text-sm text-foreground">“{profile.investor.goal}” · {profile.investor.timeHorizon}</p><p className="mt-1 text-sm text-muted-foreground">Did the reason for this money or when it is needed actually change?</p><div className="mt-4 flex flex-wrap gap-5"><button onClick={() => onGoalCheck('unchanged')} className={`border-b pb-1 text-sm font-medium transition-colors ${goalCheck === 'unchanged' ? 'border-emerald-300 text-emerald-200' : 'border-white/15 text-muted-foreground hover:text-foreground'}`}>Goal and timeline unchanged</button><button onClick={() => onGoalCheck('review')} className={`border-b pb-1 text-sm font-medium transition-colors ${goalCheck === 'review' ? 'border-amber-300 text-amber-200' : 'border-white/15 text-muted-foreground hover:text-foreground'}`}>Something needs review</button></div></div><div className="border-t border-white/10 py-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">04 · Choose the next check-in</p><p className="mt-2 text-sm text-muted-foreground">Pick a time to review facts again instead of reacting to every price tick.</p><div className="mt-4 flex flex-wrap gap-5">{reviewOptions.map((option) => <button key={option} onClick={() => onReviewWindow(option)} className={`border-b pb-1 text-sm font-medium transition-colors ${reviewWindow === option ? 'border-violet-300 text-violet-200' : 'border-white/15 text-muted-foreground hover:border-white/40 hover:text-foreground'}`}>{option}{option === recommendedWindow ? ' · suggested' : ''}</button>)}</div></div></div></div><div className="mt-7 flex flex-wrap items-center justify-between gap-5 border-t border-white/10 pt-6"><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{complete && reviewWindow && goalCheck ? `${owner === 'You' ? 'Your' : `${owner}’s`} plan: verify the ${usd(impact.impactUsd)} impact, compare it with the ${pct(profile.investor.dropComfortPct, 0)} comfort setting, record that ${goalDecision}, and review again in ${reviewWindow}.` : 'Check the goal and choose a review time to complete this practice run.'}</p><button onClick={onComplete} disabled={!reviewWindow || !goalCheck} className="group inline-flex items-center gap-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-35"><span className="border-b border-white/25 pb-1 group-hover:border-emerald-300">{complete ? 'Practice complete' : 'Finish this drill'}</span><span className="text-emerald-300">{complete ? '✓' : '→'}</span></button></div></section>
}

function PlanStep({ number, title, detail }: { number: string; title: string; detail: string }) {
    return <div className="border-t border-white/10 py-5 first:border-t-0"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{number} · {title}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p></div>
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'green' }) {
    const color = tone === 'red' ? 'text-red-400' : tone === 'green' ? 'text-emerald-400' : ''
    return <div><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</p></div>
}
