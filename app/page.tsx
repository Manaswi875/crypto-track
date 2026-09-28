'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { UrgencyBadge } from '@/components/Badges'
import { Moves, eventTitle } from '@/components/Moves'
import { useSocket } from '@/context/SocketContext'
import { DEMO_CRASH_MOVES, DEMO_MARKET_CHANGE_PCT } from '@/lib/demoCrash'
import { COIN_SYMBOL, date, dateTime, pct, usd } from '@/lib/format'
import { cryptoLossSnapshot } from '@/lib/personalAlerts'

type CurrencyAlertSetting = { coinId: string; enabled: boolean; thresholdPct: number }
type AlertSettings = { enabled: boolean; cryptoPortfolio: { enabled: boolean; thresholdPct: number }; currencies: CurrencyAlertSetting[] }
type CurrencyTrigger = { coinId: string; thresholdPct: number; lossPct: number; lossUsd: number; currentValueUsd: number; investedValueUsd: number }
type PortfolioTrigger = { thresholdPct: number; lossPct: number; lossUsd: number; currentValueUsd: number; investedValueUsd: number }
type PersonalAlert = {
    triggerType: string
    triggerDetails: { currencyTriggers: CurrencyTrigger[]; portfolioTrigger: PortfolioTrigger | null }
    cryptoImpactUsd: number
    cryptoImpactPct: number
    hypothetical: boolean
}

type Position = {
    id: string
    name: string
    assetClass: string
    coinId: string | null
    marketValue: number
    investedUsd: number | null
    change24hUsd: number
    change24hPct: number
}
type After = { days: number; moves: Record<string, number> } | null
type EventRow = {
    id: string
    coinId: string
    coin: { name: string }
    changePct: number
    moves?: unknown
    source: string
    context?: { hypothetical?: boolean; demo?: boolean; paper?: boolean } | null
    occurredAt: string
    impact: { exposureUsd: number; impactUsd: number; impactPctOfTotal: number }
    insight: { id: string; status: string; urgency: string | null; headline: string | null } | null
    personalAlert: PersonalAlert | null
    after: { d7: After; d30: After } | null
}
type Today = {
    totalUsd: number
    cryptoUsd: number
    change24hUsd: number
    change24hPct: number
    investedUsd: number | null
    gainUsd: number | null
    marketChange24hPct: number | null
    coins: Record<string, { change24hPct: number; typicalDailyMovePct: number; todayVsTypical: number }>
}
type InvestorData = {
    investor: {
        id: string
        name: string
        tagline: string
        age: number | null
        goal: string
        cryptoReason: string
        timeHorizon: string
        dropComfortPct: number
        alertEnabled: boolean
        alertThresholdPct: number
        alertSettings: AlertSettings
        isDemo: boolean
        portfolioMode: string
        positions: Position[]
    }
    aiEnabled: boolean
    today: Today
    events: EventRow[]
}
type InvestorSummary = { id: string; name: string; tagline: string; isDemo: boolean }
type LiveAlert = {
    id: string
    investorId: string
    coinId: string
    changePct: number
    severity: string
    occurredAt: string
    headline: string
    triggerType: string
    currencyTriggers: CurrencyTrigger[]
    portfolioTrigger: PortfolioTrigger | null
    cryptoImpactUsd: number
    cryptoImpactPct: number
    hypothetical: boolean
    paper?: boolean
}

const COIN_NAME: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana' }
function Signed({ v, children }: { v: number; children: React.ReactNode }) {
    return <span className={`tabular-nums ${v < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{children}</span>
}

/**
 * A plain-English read of the investor's money, computed from the numbers.
 * Personal dollar impact leads; market volatility is supporting context.
 */
function todayStatus(t: Today, alertSettings: AlertSettings, positions: Position[], scenario: boolean) {
    const coins = Object.entries(t.coins)
    if (coins.length === 0) return { tone: 'calm' as const, text: 'You don’t hold any crypto yet.' }
    const snapshot = cryptoLossSnapshot(positions)
    const crossedCurrency = alertSettings.enabled ? alertSettings.currencies
        .filter((setting) => setting.enabled)
        .map((setting) => [setting, snapshot.currencies.find((currency) => currency.coinId === setting.coinId)] as const)
        .find(([setting, holding]) => holding && holding.lossPct <= -setting.thresholdPct) : undefined
    if (crossedCurrency) {
        const [setting, holding] = crossedCurrency
        return { tone: 'alert' as const, text: `${COIN_NAME[setting.coinId] ?? setting.coinId} is now worth ${usd(holding!.currentValueUsd)} from ${usd(holding!.investedValueUsd)} invested—a ${usd(Math.abs(holding!.lossUsd))} loss (${pct(holding!.lossPct, 1)}). This crossed your ${setting.thresholdPct}% loss limit.` }
    }
    if (alertSettings.enabled && alertSettings.cryptoPortfolio.enabled && snapshot.complete && snapshot.investedValueUsd > 0 && snapshot.lossPct <= -alertSettings.cryptoPortfolio.thresholdPct) {
        return { tone: 'alert' as const, text: `Your crypto is now worth ${usd(snapshot.currentValueUsd)} from ${usd(snapshot.investedValueUsd)} invested—a ${usd(Math.abs(snapshot.lossUsd))} loss (${pct(snapshot.lossPct, 1)}). This crossed your ${alertSettings.cryptoPortfolio.thresholdPct}% combined-crypto limit.` }
    }
    const [coinId, c] = coins.reduce((a, b) => (Math.abs(b[1].change24hPct) > Math.abs(a[1].change24hPct) ? b : a))
    const name = COIN_NAME[coinId] ?? coinId
    const move = `${name} ${pct(c.change24hPct, 1)}`
    const period = scenario ? 'in this crash scenario' : 'today'
    const action = t.change24hUsd < 0 ? 'lost' : t.change24hUsd > 0 ? 'gained' : 'did not move'
    const personalMove = t.change24hUsd === 0
        ? `Your crypto did not change ${period} and remains worth ${usd(t.cryptoUsd)}.`
        : `Your crypto ${action} ${usd(Math.abs(t.change24hUsd))} ${period} (${pct(t.change24hPct, 1)}) and is now worth ${usd(t.cryptoUsd)}.`
    const cumulative = t.investedUsd != null && t.gainUsd != null
        ? ` Against ${usd(t.investedUsd)} invested, you are ${t.gainUsd < 0 ? `down ${usd(Math.abs(t.gainUsd))}` : t.gainUsd > 0 ? `up ${usd(t.gainUsd)}` : 'even'} overall.`
        : ''
    if (c.todayVsTypical >= 3) return { tone: 'watch' as const, text: `${personalMove}${cumulative} ${move} is an unusually large market move.` }
    if (c.todayVsTypical >= 1.5) return { tone: 'watch' as const, text: `${personalMove}${cumulative} ${move} is larger than its typical daily move of about ±${c.typicalDailyMovePct.toFixed(1)}%.` }
    return { tone: 'calm' as const, text: `${personalMove}${cumulative} ${move} is within its typical daily move of about ±${c.typicalDailyMovePct.toFixed(1)}%.` }
}

export default function TodayPage() {
    const router = useRouter()
    const { socket, isConnected } = useSocket()
    const [investors, setInvestors] = useState<InvestorSummary[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [data, setData] = useState<InvestorData | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [liveAlert, setLiveAlert] = useState<LiveAlert | null>(null)
    const [notificationsEnabled, setNotificationsEnabled] = useState(false)
    const [triggeringDemo, setTriggeringDemo] = useState(false)
    const [viewMode, setViewMode] = useState<'live' | 'crash'>('live')

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        fetch('/api/investors').then(async (r) => r.ok && setInvestors(await r.json()))
        setSelected(params.get('investor') ?? 'you')
        setViewMode(params.get('mode') === 'crash' ? 'crash' : 'live')
    }, [])

    const load = useCallback(async () => {
        if (!selected) return
        const res = await fetch(`/api/investors/${selected}`)
        if (res.ok) setData(await res.json())
    }, [selected])

    useEffect(() => {
        if (!selected) return
        setData(null)
        load()
    }, [selected, load])

    useEffect(() => {
        if (!selected) return
        const params = new URLSearchParams()
        if (selected !== 'you') params.set('investor', selected)
        if (viewMode === 'crash') params.set('mode', 'crash')
        const query = params.toString()
        window.history.replaceState(null, '', query ? `/?${query}` : '/')
    }, [selected, viewMode])

    useEffect(() => {
        setNotificationsEnabled(typeof Notification !== 'undefined' && Notification.permission === 'granted')
    }, [])

    useEffect(() => {
        if (!socket) return
        const onAlert = (alert: LiveAlert) => {
            if (selected && alert.investorId !== selected) return
            setLiveAlert(alert)
            void load()
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification(alert.hypothetical ? `[DEMO] ${alert.headline}` : alert.paper ? `[PAPER] ${alert.headline}` : alert.headline, {
                    body: `Your crypto is ${pct(alert.cryptoImpactPct, 1)} (${usd(alert.cryptoImpactUsd)}) versus what you invested.`,
                    tag: alert.id,
                })
            }
        }
        socket.on('personal-alert', onAlert)
        return () => {
            socket.off('personal-alert', onAlert)
        }
    }, [socket, load, selected])

    async function enableNotifications() {
        if (typeof Notification === 'undefined') return
        const permission = await Notification.requestPermission()
        setNotificationsEnabled(permission === 'granted')
    }

    async function triggerDemoCrash() {
        setViewMode('crash')
        setTriggeringDemo(true)
        setError(null)
        const res = await fetch('/api/events/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ investorId: selected }) })
        const body = await res.json()
        setTriggeringDemo(false)
        if (!res.ok) return setError(body.error ?? 'Could not trigger the demo crash')
        setLiveAlert(body)
        await load()
    }

    async function explain(eventId: string) {
        if (!selected) return
        setBusy(eventId)
        setError(null)
        const res = await fetch('/api/insights', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ eventId, investorId: selected }),
        })
        setBusy(null)
        if (!res.ok) return setError((await res.json()).error ?? 'Could not create insight')
        router.push(`/insights/${(await res.json()).id}${selected === 'you' ? '' : `?investor=${selected}`}`)
    }

    const examples = investors.filter((i) => i.isDemo)
    const inv = data?.investor
    const t = data?.today
    const who = inv?.isDemo ? inv.name : 'you'
    const activeEvent = liveAlert ? data?.events.find((event) => event.id === liveAlert.id) : null
    const todayKey = new Date().toDateString()
    const todayAlerts = data?.events.filter((event) => event.personalAlert && !event.personalAlert.hypothetical && new Date(event.occurredAt).toDateString() === todayKey) ?? []
    const demoAlerts = data?.events.filter((event) => event.personalAlert?.hypothetical && new Date(event.occurredAt).toDateString() === todayKey).slice(0, 1) ?? []
    const visibleAlerts = viewMode === 'live' ? todayAlerts : demoAlerts
    const scenarioPositions = inv ? inv.positions.map((position) => ({
        ...position,
        marketValue: position.coinId ? position.marketValue * (1 + (DEMO_CRASH_MOVES[position.coinId] ?? 0) / 100) : position.marketValue,
        change24hUsd: position.coinId ? position.marketValue * ((DEMO_CRASH_MOVES[position.coinId] ?? 0) / 100) : position.change24hUsd,
        change24hPct: position.coinId ? DEMO_CRASH_MOVES[position.coinId] ?? position.change24hPct : position.change24hPct,
    })) : null
    const demoSnapshot = scenarioPositions ? cryptoLossSnapshot(scenarioPositions) : null
    const scenarioCryptoUsd = scenarioPositions?.filter((position) => position.coinId).reduce((sum, position) => sum + position.marketValue, 0) ?? 0
    const scenarioMarketLossUsd = t ? scenarioCryptoUsd - t.cryptoUsd : 0
    const scenarioCoinIds = [...new Set(inv?.positions.flatMap((position) => position.coinId ? [position.coinId] : []) ?? [])]
    const scenarioToday: Today | null = t && demoSnapshot ? {
        ...t,
        totalUsd: t.totalUsd + scenarioMarketLossUsd,
        cryptoUsd: scenarioCryptoUsd,
        change24hUsd: scenarioMarketLossUsd,
        change24hPct: t.cryptoUsd ? (scenarioMarketLossUsd / t.cryptoUsd) * 100 : 0,
        investedUsd: demoSnapshot.complete ? demoSnapshot.investedValueUsd : null,
        gainUsd: demoSnapshot.complete ? demoSnapshot.lossUsd : null,
        marketChange24hPct: DEMO_MARKET_CHANGE_PCT,
        coins: Object.fromEntries(scenarioCoinIds.map((coinId) => {
            const coin = t.coins[coinId] ?? { change24hPct: 0, typicalDailyMovePct: 2, todayVsTypical: 0 }
            const move = DEMO_CRASH_MOVES[coinId] ?? coin.change24hPct
            return [coinId, { ...coin, change24hPct: move, todayVsTypical: coin.typicalDailyMovePct ? Math.abs(move) / coin.typicalDailyMovePct : coin.todayVsTypical }]
        })),
    } : null
    const demoCurrencyTriggers = inv?.alertSettings.currencies.filter((setting) => setting.enabled && (demoSnapshot?.currencies.find((currency) => currency.coinId === setting.coinId)?.lossPct ?? 0) <= -setting.thresholdPct) ?? []
    const demoPortfolioTriggers = Boolean(inv?.alertSettings.cryptoPortfolio.enabled && demoSnapshot && demoSnapshot.lossPct <= -inv.alertSettings.cryptoPortfolio.thresholdPct)
    const demoWouldAlert = Boolean(inv?.alertSettings.enabled && (demoCurrencyTriggers.length > 0 || demoPortfolioTriggers))

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{viewMode === 'live' ? 'Today' : 'Crash scenario'}</h2>
                    <p className="text-muted-foreground">{viewMode === 'live' ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'A guided replay of how the agent responds'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1" role="group" aria-label="Today view">
                        <button onClick={() => setViewMode('live')} aria-pressed={viewMode === 'live'} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${viewMode === 'live' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>Live today</button>
                        <button onClick={() => setViewMode('crash')} aria-pressed={viewMode === 'crash'} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${viewMode === 'crash' ? 'bg-red-400 text-red-950 shadow-[0_0_20px_rgba(248,113,113,0.2)]' : 'text-muted-foreground hover:text-foreground'}`}>Crash scenario</button>
                    </div>
                    {examples.length > 0 && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            Investor
                            <select value={selected ?? 'you'} onChange={(e) => setSelected(e.target.value)} className="rounded-full border border-white/10 bg-background px-3 py-1.5 text-xs text-foreground">
                                <option value="you">Your portfolio</option>
                                {examples.map((i) => <option key={i.id} value={i.id}>{i.name}: {i.tagline}</option>)}
                            </select>
                        </label>
                    )}
                </div>
            </div>

            {inv?.isDemo && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-4 py-2 text-sm">
                    <span className="text-muted-foreground">
                        Example investor: <span className="font-medium text-foreground">{inv.name}{inv.age ? `, ${inv.age}` : ''}</span> · {inv.tagline}
                    </span>
                    <button onClick={() => setSelected('you')} className="font-medium text-primary hover:underline">← Back to your portfolio</button>
                </div>
            )}

            {inv && !inv.isDemo && inv.portfolioMode === 'paper' && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-y border-violet-400/15 py-3 text-sm">
                    <span className="text-muted-foreground"><strong className="text-violet-300">Paper portfolio</strong> · Every value is simulated with virtual money and live market prices.</span>
                    <Link href="/paper" className="font-medium text-violet-300 hover:text-violet-200">Trade virtual crypto →</Link>
                </div>
            )}

            {!inv || !t ? (
                <div className="text-muted-foreground">Loading…</div>
            ) : (
                <div key={viewMode} className="mode-enter space-y-6">
                    {!data.aiEnabled && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">ANTHROPIC_API_KEY is not set, so AI features are off.</div>
                    )}

                    {viewMode === 'crash' && (
                        <DemoStory
                            name={inv.isDemo ? inv.name : 'You'}
                            goal={inv.goal}
                            cryptoUsd={t.cryptoUsd}
                            alertSettings={inv.alertSettings}
                            scenarioLossUsd={demoSnapshot?.lossUsd ?? 0}
                            scenarioLossPct={demoSnapshot?.lossPct ?? 0}
                            wouldAlert={demoWouldAlert}
                            triggering={triggeringDemo}
                            notificationsEnabled={notificationsEnabled}
                            triggered={activeEvent?.context?.hypothetical === true}
                            onEnableNotifications={enableNotifications}
                            onTrigger={triggerDemoCrash}
                        />
                    )}

                    {error && <p className="text-sm text-red-400">{error}</p>}

                    {liveAlert && (viewMode === 'crash' || !activeEvent?.context?.hypothetical) && (
                        <div className="interactive-surface alert-sweep -mx-4 border-y border-red-500/40 bg-gradient-to-r from-red-500/15 via-red-500/5 to-transparent px-4 py-6 sm:px-8" role="alert">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-red-300">Active alert</p>
                                    <p className="mt-1 text-lg font-semibold">
                                        {liveAlert.headline}
                                    </p>
                                    {activeEvent && (
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Loss versus amount invested: <span className="font-medium text-red-300">{usd(liveAlert.cryptoImpactUsd)}</span> · {pct(liveAlert.cryptoImpactPct)}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    {activeEvent && activeEvent.impact.exposureUsd > 0 && (
                                        <button onClick={() => explain(activeEvent.id)} disabled={busy !== null || !data.aiEnabled} className="rounded-md bg-red-400 px-3 py-1.5 text-sm font-semibold text-red-950 hover:bg-red-300 disabled:opacity-50">
                                            Understand this crash
                                        </button>
                                    )}
                                    <button onClick={() => setLiveAlert(null)} className="text-sm font-medium text-muted-foreground hover:text-foreground">Dismiss</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <AgentStatus
                        t={viewMode === 'crash' && scenarioToday ? scenarioToday : t}
                        alertSettings={inv.alertSettings}
                        positions={viewMode === 'crash' && scenarioPositions ? scenarioPositions : inv.positions}
                        heldCoins={inv.positions.filter((position) => position.coinId).length}
                        isConnected={isConnected}
                        scenario={viewMode === 'crash'}
                    />

                    <MoneySnapshot t={viewMode === 'crash' && scenarioToday ? scenarioToday : t} positions={viewMode === 'crash' && scenarioPositions ? scenarioPositions : inv.positions} investorId={inv.id} scenario={viewMode === 'crash'} />

                    {viewMode === 'crash' && activeEvent && <CrashImpact event={activeEvent} totalUsd={t.totalUsd} />}

                    {visibleAlerts.length > 0 && (
                            <section className="interactive-surface px-4 py-4 sm:px-5">
                                <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">{viewMode === 'live' ? 'Today’s alerts' : 'Demo alert'}</p>
                                        <h3 className="mt-1 text-xl font-semibold">What the agent noticed</h3>
                                    </div>
                                    <span className="text-xs text-muted-foreground">Personal impact for {who}</span>
                                </div>
                                <ul className="divide-y divide-border/70">
                                    {visibleAlerts.map((event) => (
                                        <MoveRow key={event.id} e={event} who={who} investorId={inv.id} busy={busy === event.id} disabled={busy !== null || !data.aiEnabled} onExplain={() => explain(event.id)} />
                                    ))}
                                </ul>
                            </section>
                    )}
                </div>
            )}
        </div>
    )
}

function DemoStory({ name, goal, cryptoUsd, alertSettings, scenarioLossUsd, scenarioLossPct, wouldAlert, triggering, notificationsEnabled, triggered, onEnableNotifications, onTrigger }: { name: string; goal: string; cryptoUsd: number; alertSettings: AlertSettings; scenarioLossUsd: number; scenarioLossPct: number; wouldAlert: boolean; triggering: boolean; notificationsEnabled: boolean; triggered: boolean; onEnableNotifications: () => void; onTrigger: () => void }) {
    const steps = ['Crash detected', wouldAlert ? 'Slack alert sent' : 'No interruption needed', 'Impact calculated']
    return (
        <section className="interactive-surface crash-grid crash-scene relative -mx-4 overflow-hidden border-y border-red-500/20 px-4 py-10 sm:px-8 sm:py-14">
            <div className="pointer-events-none absolute -left-24 top-8 h-64 w-64 rounded-full bg-red-500/10 blur-3xl" />
            <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
                <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-red-300">
                        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" /></span>
                        Today&apos;s incident
                    </div>
                    <h3 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">Crypto crashed.<br /><span className="text-muted-foreground">Your agent was already watching.</span></h3>
                    <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
                        {name} {name.toLowerCase() === 'you' ? 'are' : 'is'} working toward <span className="font-medium text-foreground">{goal}</span>, with <span className="font-medium text-foreground">{usd(cryptoUsd)}</span> exposed to crypto. After this crash, the crypto would be <span className="font-medium text-red-300">{usd(scenarioLossUsd)} ({pct(scenarioLossPct)})</span> versus the amount invested, against a {alertSettings.cryptoPortfolio.thresholdPct}% combined-crypto limit. {wouldAlert ? 'At least one configured loss limit is crossed, so the agent sends an alert.' : 'The investment remains inside the configured currency and crypto-portfolio limits.'}
                    </p>

                    <ol className="mt-8 flex flex-col gap-0 sm:flex-row sm:items-center">
                        {steps.map((step, index) => (
                            <li key={step} className="flex flex-1 items-center">
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${triggered ? 'bg-emerald-400 text-emerald-950 shadow-[0_0_24px_rgba(52,211,153,0.35)]' : index === 0 ? 'bg-red-400 text-red-950' : 'border border-white/20 bg-background/60 text-muted-foreground'}`}>{triggered ? '✓' : index + 1}</span>
                                <span className="ml-2 text-sm font-medium">{step}</span>
                                {index < steps.length - 1 && <span className={`mx-3 hidden h-px flex-1 sm:block ${triggered ? 'bg-emerald-400/60' : 'bg-border'}`} />}
                            </li>
                        ))}
                    </ol>

                    <div className="mt-8 flex flex-wrap items-center gap-4">
                        <button onClick={onTrigger} disabled={triggering} className="demo-trigger group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-transform hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50">
                            <span>{triggering ? 'Replaying the crash…' : triggered ? 'Replay the alert' : 'Replay today’s crash'}</span>
                            <span className="transition-transform group-hover:translate-x-1">→</span>
                        </button>
                        {!notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission !== 'denied' && (
                            <button onClick={onEnableNotifications} className="text-sm font-medium text-muted-foreground hover:text-foreground">Enable browser alerts</button>
                        )}
                        <span className="text-xs text-muted-foreground">{wouldAlert ? 'Sends a labeled demo alert to Slack.' : 'Recorded in the app without sending Slack.'}</span>
                    </div>
                </div>

                <div className="relative mx-auto flex h-72 w-72 items-center justify-center sm:h-80 sm:w-80">
                    <div className="signal-ring absolute inset-0 rounded-full border border-red-400/15" />
                    <div className="signal-ring signal-ring-delay absolute inset-10 rounded-full border border-red-400/20" />
                    <div className="absolute inset-20 rounded-full border border-red-400/30 bg-red-500/5 shadow-[inset_0_0_50px_rgba(248,113,113,0.08)]" />
                    <div className="relative text-center">
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Bitcoin</div>
                        <div className="mt-1 text-6xl font-semibold tracking-tighter text-red-400">{pct(DEMO_CRASH_MOVES.bitcoin, 1)}</div>
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-400/10 px-3 py-1 text-xs font-medium text-red-300">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> {wouldAlert ? 'Comfort level exceeded' : 'Monitoring only'}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

function AgentStatus({ t, alertSettings, positions, heldCoins, isConnected, scenario }: { t: Today; alertSettings: AlertSettings; positions: Position[]; heldCoins: number; isConnected: boolean; scenario: boolean }) {
    const status = todayStatus(t, alertSettings, positions, scenario)
    const enabledCurrencyRules = alertSettings.currencies.filter((setting) => setting.enabled).length
    return (
        <section className="interactive-surface agent-strip flex flex-col gap-4 border-y px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-start gap-3">
                <span className={`live-orb mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${scenario ? 'bg-red-400 shadow-[0_0_16px_rgba(248,113,113,0.8)]' : isConnected ? 'bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.8)]' : 'bg-amber-300'}`} />
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Agent status · {scenario ? 'Running crash simulation' : isConnected ? 'Monitoring live' : 'Reconnecting'}</p>
                    <p className="mt-1 text-lg font-medium leading-snug">{status.text}</p>
                </div>
            </div>
            <div className="flex shrink-0 gap-5 text-xs text-muted-foreground sm:text-right">
                <span><strong className="block text-lg font-semibold text-foreground">{heldCoins}</strong> holdings watched</span>
                <span><strong className="block text-lg font-semibold text-foreground">{alertSettings.enabled ? enabledCurrencyRules : 'Off'}</strong> currency rules</span>
                <span><strong className="block text-lg font-semibold text-foreground">{alertSettings.enabled && alertSettings.cryptoPortfolio.enabled ? `${alertSettings.cryptoPortfolio.thresholdPct}%` : 'Off'}</strong> crypto limit</span>
            </div>
        </section>
    )
}

function MoneySnapshot({ t, positions, investorId, scenario }: { t: Today; positions: Position[]; investorId: string; scenario: boolean }) {
    const marketsHref = scenario
        ? `/markets?mode=crash${investorId === 'you' ? '' : `&investor=${investorId}`}`
        : `/markets${investorId === 'you' ? '' : `?investor=${investorId}`}#yours`
    return (
        <section className="py-8">
            <div className="mb-5 flex items-end justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{scenario ? 'Simulation · your money after the crash' : 'Your money today'}</p><h3 className="mt-1 text-xl font-semibold">{scenario ? 'What this scenario would do' : 'Your money in perspective'}</h3></div>
                <Link href={marketsHref} className="text-xs font-medium text-primary hover:underline">Explore the market →</Link>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-y py-6 sm:grid-cols-4">
                <Figure label={scenario ? 'Everything after crash' : 'Everything you have'} value={usd(t.totalUsd)} />
                <Figure label={scenario ? 'Crypto after crash' : 'Your crypto'} value={usd(t.cryptoUsd)} hint={t.totalUsd ? `${((t.cryptoUsd / t.totalUsd) * 100).toFixed(0)}% of everything` : undefined} />
                <Figure
                    label={scenario ? 'Crash impact' : 'Crypto today'}
                    value={<Signed v={t.change24hUsd}>{usd(t.change24hUsd, { sign: true })}</Signed>}
                    hint={
                        <>
                            <Signed v={t.change24hPct}>{pct(t.change24hPct, 2)}</Signed>
                            {t.marketChange24hPct != null && <> · market {pct(t.marketChange24hPct, 2)}</>}
                        </>
                    }
                />
                <Figure
                    label={t.gainUsd == null ? 'Profit or loss' : t.gainUsd >= 0 ? 'Crypto profit overall' : scenario ? 'Loss vs amount invested' : 'Crypto loss overall'}
                    value={t.gainUsd == null ? '—' : <Signed v={t.gainUsd}>{usd(t.gainUsd, { sign: true })}</Signed>}
                    hint={t.investedUsd != null && t.gainUsd != null ? `on ${usd(t.investedUsd)} put in` : 'Add what you put in'}
                />
            </div>
            <CryptoBreakdown positions={positions} scenario={scenario} />
        </section>
    )
}

function CryptoBreakdown({ positions, scenario }: { positions: Position[]; scenario: boolean }) {
    const holdings = Object.values(positions.filter((position) => position.coinId).reduce<Record<string, {
        coinId: string
        valueUsd: number
        investedUsd: number
        hasCompleteCost: boolean
        changeUsd: number
    }>>((grouped, position) => {
        const coinId = position.coinId as string
        const current = grouped[coinId] ?? { coinId, valueUsd: 0, investedUsd: 0, hasCompleteCost: true, changeUsd: 0 }
        current.valueUsd += position.marketValue
        current.changeUsd += position.change24hUsd
        if (position.investedUsd == null) current.hasCompleteCost = false
        else current.investedUsd += position.investedUsd
        grouped[coinId] = current
        return grouped
    }, {}))

    if (holdings.length === 0) return null

    return (
        <div className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">By currency</p><h4 className="mt-1 text-lg font-semibold">Every investment, explained</h4></div>
                <p className="text-xs text-muted-foreground">{scenario ? 'Crash impact compared with today' : 'Today means the latest 24-hour move'}</p>
            </div>
            <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
                {holdings.map((holding) => {
                    const cumulativeUsd = holding.hasCompleteCost ? holding.valueUsd - holding.investedUsd : null
                    const cumulativePct = cumulativeUsd != null && holding.investedUsd ? (cumulativeUsd / holding.investedUsd) * 100 : null
                    return (
                        <div key={holding.coinId} className="group grid gap-x-5 gap-y-4 py-5 transition-transform duration-300 hover:translate-x-2 sm:grid-cols-[1.1fr_repeat(4,minmax(0,1fr))] sm:items-center">
                            <div><strong className="block text-lg">{COIN_NAME[holding.coinId] ?? holding.coinId}</strong><span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{COIN_SYMBOL[holding.coinId] ?? holding.coinId}</span></div>
                            <div><small className="block text-muted-foreground">Current value</small><strong className="tabular-nums">{usd(holding.valueUsd)}</strong></div>
                            <div><small className="block text-muted-foreground">Amount invested</small><strong className="tabular-nums">{holding.hasCompleteCost ? usd(holding.investedUsd) : 'Not added'}</strong></div>
                            <div><small className="block text-muted-foreground">{scenario ? 'Crash impact' : 'Today'}</small><strong className={signedClassName(holding.changeUsd)}>{usd(holding.changeUsd, { sign: true })}</strong></div>
                            <div><small className="block text-muted-foreground">Cumulative profit / loss</small>{cumulativeUsd == null ? <strong>—</strong> : <strong className={signedClassName(cumulativeUsd)}>{usd(cumulativeUsd, { sign: true })} <span className="text-xs">{pct(cumulativePct ?? 0, 2)}</span></strong>}</div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function signedClassName(value: number) {
    return `tabular-nums ${value < 0 ? 'text-red-400' : value > 0 ? 'text-emerald-400' : 'text-foreground'}`
}

function CrashImpact({ event, totalUsd }: { event: EventRow; totalUsd: number }) {
    return (
        <section className="interactive-surface px-4 py-4 sm:px-5">
            <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Personal impact</p>
                <h3 className="mt-1 text-xl font-semibold">The crash, translated into your money</h3>
            </div>
            <div className="grid grid-cols-2 border-y sm:grid-cols-4">
                <Figure label="Everything you have" value={usd(totalUsd)} />
                <Figure label="Crypto exposed" value={usd(event.impact.exposureUsd)} />
                <Figure label="Estimated crash impact" value={<span className="text-red-400">{usd(event.impact.impactUsd)}</span>} />
                <Figure label="Of everything" value={<span className="text-red-400">{pct(event.impact.impactPctOfTotal)}</span>} hint="Calculated in code" />
            </div>
        </section>
    )
}

function MoveRow({ e, who, investorId, busy, disabled, onExplain }: { e: EventRow; who: string; investorId: string; busy: boolean; disabled: boolean; onExplain: () => void }) {
    const affected = e.impact.exposureUsd > 0
    const d30 = e.after?.d30
    const alertDetails = e.personalAlert?.triggerDetails
    const alertReasons = [
        ...(alertDetails?.currencyTriggers.map((trigger) => `${COIN_NAME[trigger.coinId] ?? trigger.coinId} ${pct(trigger.lossPct)} vs ${trigger.thresholdPct}% limit`) ?? []),
        ...(alertDetails?.portfolioTrigger ? [`Crypto portfolio ${pct(alertDetails.portfolioTrigger.lossPct)} vs ${alertDetails.portfolioTrigger.thresholdPct}% limit`] : []),
    ]
    return (
        <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{eventTitle(e)}</span>
                    {e.context?.hypothetical && <span className="rounded-full border border-violet-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">Hypothetical demo</span>}
                    {e.context?.paper && <span className="rounded-full border border-sky-400/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">Paper portfolio</span>}
                    <span className="text-xs text-muted-foreground">{e.source === 'replay' ? date(e.occurredAt) : dateTime(e.occurredAt)}</span>
                </div>
                <Moves event={e} className="text-sm" />
                {e.personalAlert && <div className="text-sm font-medium text-red-300">{alertReasons.join(' · ')}</div>}
                <div className="text-sm">
                    {e.personalAlert ? (
                        <>{who === 'you' ? 'Your' : `${who}'s`} loss versus amount invested: <span className="font-medium tabular-nums text-red-400">{usd(e.personalAlert.cryptoImpactUsd)}</span> <span className="text-muted-foreground">({pct(e.personalAlert.cryptoImpactPct)})</span></>
                    ) : affected ? (
                        <>
                            {who === 'you' ? 'Your' : `${who}'s`} impact: <span className="font-medium tabular-nums text-red-400">{usd(e.impact.impactUsd)}</span>{' '}
                            <span className="text-muted-foreground">({pct(e.impact.impactPctOfTotal)} of everything)</span>
                        </>
                    ) : (
                        <span className="text-muted-foreground">None of the coins that moved are in this portfolio.</span>
                    )}
                </div>
                {d30 && (
                    <div className="text-xs text-muted-foreground">
                        30 days later:{' '}
                        {Object.entries(d30.moves).map(([c, m], i) => (
                            <span key={c}>
                                {i > 0 && ' · '}
                                {COIN_SYMBOL[c]} <Signed v={m}>{pct(m, 1)}</Signed>
                            </span>
                        ))}
                    </div>
                )}
                {e.insight?.status === 'ready' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
                        <UrgencyBadge urgency={e.insight.urgency} />
                        <span className="text-muted-foreground">{e.insight.headline}</span>
                    </div>
                )}
            </div>
            {affected && (
                <div className="shrink-0">
                    {e.insight && e.insight.status !== 'failed' ? (
                        <Link href={`/insights/${e.insight.id}${investorId === 'you' ? '' : `?investor=${investorId}`}`} className="inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                            {e.insight.status === 'generating' ? 'Writing…' : 'Read insight'}
                        </Link>
                    ) : (
                        <button onClick={onExplain} disabled={disabled} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {busy ? 'Starting…' : 'What does this mean for me?'}
                        </button>
                    )}
                </div>
            )}
        </li>
    )
}

function Figure({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
    return (
        <div className="metric-figure group relative overflow-hidden transition-all duration-300 hover:-translate-y-1">
            <span className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-transparent transition-transform duration-500 group-hover:scale-x-100" />
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums transition-transform duration-300 group-hover:-translate-y-0.5">{value}</div>
            {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
    )
}
