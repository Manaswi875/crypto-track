'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Panel } from '@/components/Badges'
import { alertSuggestionReason, comfortSuggestionReason, suggestedAlertThreshold, suggestedComfortBoundary } from '@/lib/alertPreferences'
import { DRAFT_KEY, ProfileDraft } from '@/lib/draft'

type CoinId = 'bitcoin' | 'ethereum' | 'solana'
type CryptoHolding = { coinId: CoinId; heldVia: 'fund' | 'direct'; fund: string; marketValue: number; investedUsd: number | null }
type StoredPosition = { symbol: string; assetClass: string; coinId: CoinId | null; marketValue: number; investedUsd: number | null }
type CurrencyAlertSetting = { coinId: CoinId; enabled: boolean; thresholdPct: number }

const COINS: { id: CoinId; label: string; funds: string[] }[] = [
    { id: 'bitcoin', label: 'Bitcoin', funds: ['IBIT', 'FBTC'] },
    { id: 'ethereum', label: 'Ethereum', funds: ['ETHA'] },
    { id: 'solana', label: 'Solana', funds: [] },
]

const usdText = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

export default function EditPortfolioPage() {
    return <Suspense fallback={<div className="text-muted-foreground">Loading plan…</div>}><EditPortfolio /></Suspense>
}

function EditPortfolio() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const investorId = searchParams.get('investor') ?? 'you'
    const draftRequested = investorId === 'you' && searchParams.get('draft') === '1'
    const [profileName, setProfileName] = useState('You')
    const [isDemo, setIsDemo] = useState(false)
    const [goal, setGoal] = useState('')
    const [cryptoReason, setCryptoReason] = useState('')
    const [timeHorizon, setTimeHorizon] = useState('')
    const [dropComfortPct, setDropComfortPct] = useState(5)
    const [alertEnabled, setAlertEnabled] = useState(true)
    const [cryptoPortfolioAlertEnabled, setCryptoPortfolioAlertEnabled] = useState(true)
    const [cryptoPortfolioAlertPct, setCryptoPortfolioAlertPct] = useState(5)
    const [currencyAlerts, setCurrencyAlerts] = useState<CurrencyAlertSetting[]>([])
    const [crypto, setCrypto] = useState<CryptoHolding[]>([])
    const [cashUsd, setCashUsd] = useState(0)
    const [investmentsUsd, setInvestmentsUsd] = useState(0)
    const [loaded, setLoaded] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [draft, setDraft] = useState<ProfileDraft | null>(null)

    useEffect(() => {
        setLoaded(false)
        setDraft(null)
        fetch(`/api/investors/${encodeURIComponent(investorId)}`).then(async (r) => {
            if (!r.ok) return
            const { investor } = await r.json()
            const positions: StoredPosition[] = investor.positions
            setProfileName(investor.name)
            setIsDemo(investor.isDemo)
            setGoal(investor.goal)
            setCryptoReason(investor.cryptoReason ?? '')
            setTimeHorizon(investor.timeHorizon)
            setDropComfortPct(investor.dropComfortPct)
            setAlertEnabled(investor.alertSettings?.enabled ?? investor.alertEnabled ?? true)
            setCryptoPortfolioAlertEnabled(investor.alertSettings?.cryptoPortfolio?.enabled ?? true)
            setCryptoPortfolioAlertPct(investor.alertSettings?.cryptoPortfolio?.thresholdPct ?? 5)
            setCurrencyAlerts(investor.alertSettings?.currencies ?? [])
            setCrypto(
                positions
                    .filter((p) => p.coinId)
                    .map((p) => ({
                        coinId: p.coinId as CoinId,
                        heldVia: p.assetClass === 'crypto_etf' ? 'fund' : 'direct',
                        fund: p.assetClass === 'crypto_etf' ? p.symbol : '',
                        marketValue: p.marketValue,
                        investedUsd: p.investedUsd,
                    })),
            )
            setCashUsd(positions.filter((p) => p.assetClass === 'cash').reduce((s, p) => s + p.marketValue, 0))
            setInvestmentsUsd(positions.filter((p) => !p.coinId && p.assetClass !== 'cash').reduce((s, p) => s + p.marketValue, 0))

            // An AI draft from the setup page overrides whatever it filled in; the user reviews before saving
            let d: ProfileDraft | null = null
            try {
                if (draftRequested) d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null')
            } catch {}
            if (d) {
                setDraft(d)
                if (d.goal) setGoal(d.goal)
                if (d.cryptoReason) setCryptoReason(d.cryptoReason)
                if (d.timeHorizon) setTimeHorizon(d.timeHorizon)
                if (d.dropComfortPct != null) setDropComfortPct(d.dropComfortPct)
                const suggestion = suggestedAlertThreshold(d.timeHorizon ?? investor.timeHorizon, d.dropComfortPct ?? investor.dropComfortPct)
                setCurrencyAlerts((settings) => settings.map((setting) => ({ ...setting, thresholdPct: suggestion })))
                if (d.crypto.length)
                    setCrypto(
                        d.crypto.map((c) => ({
                            coinId: c.coinId,
                            heldVia: c.heldVia,
                            fund: c.heldVia === 'fund' ? (c.fund ?? '') : '',
                            marketValue: c.marketValue ?? 0,
                            investedUsd: c.investedUsd,
                        })),
                    )
                if (d.cashUsd != null) setCashUsd(d.cashUsd)
                if (d.investmentsUsd != null) setInvestmentsUsd(d.investmentsUsd)
            }
            setLoaded(true)
        })
    }, [draftRequested, investorId])

    async function save() {
        setSaving(true)
        setError(null)
        const heldCoinIds = [...new Set(crypto.map((holding) => holding.coinId))]
        if (isDemo) return
        const res = await fetch(`/api/investors/${encodeURIComponent(investorId)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                goal,
                cryptoReason,
                timeHorizon,
                dropComfortPct,
                alertSettings: {
                    enabled: alertEnabled,
                    cryptoPortfolio: { enabled: cryptoPortfolioAlertEnabled, thresholdPct: cryptoPortfolioAlertPct },
                    currencies: heldCoinIds.map((coinId) => currencyAlerts.find((setting) => setting.coinId === coinId) ?? {
                        coinId,
                        enabled: true,
                        thresholdPct: suggestedAlertThreshold(timeHorizon, dropComfortPct),
                    }),
                },
                crypto,
                cashUsd,
                investmentsUsd,
            }),
        })
        setSaving(false)
        if (!res.ok) return setError((await res.json()).error ?? 'Could not save')
        try {
            sessionStorage.removeItem(DRAFT_KEY)
        } catch {}
        router.push(investorId === 'you' ? '/' : `/?investor=${encodeURIComponent(investorId)}`)
    }

    const update = (idx: number, patch: Partial<CryptoHolding>) => setCrypto((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
    const suggestedThreshold = suggestedAlertThreshold(timeHorizon, dropComfortPct)
    const suggestedComfort = suggestedComfortBoundary(goal, timeHorizon)
    const heldCurrencyValues = [...new Set(crypto.map((holding) => holding.coinId))].map((coinId) => {
        const holdings = crypto.filter((holding) => holding.coinId === coinId)
        const hasCompleteCost = holdings.every((holding) => holding.investedUsd != null && holding.investedUsd > 0)
        return {
            coinId,
            valueUsd: holdings.reduce((sum, holding) => sum + holding.marketValue, 0),
            investedUsd: hasCompleteCost ? holdings.reduce((sum, holding) => sum + (holding.investedUsd ?? 0), 0) : null,
        }
    })
    const cryptoValueUsd = heldCurrencyValues.reduce((sum, currency) => sum + currency.valueUsd, 0)
    const cryptoInvestedUsd = heldCurrencyValues.every((currency) => currency.investedUsd != null)
        ? heldCurrencyValues.reduce((sum, currency) => sum + (currency.investedUsd ?? 0), 0)
        : null
    const currencySetting = (coinId: CoinId) => currencyAlerts.find((setting) => setting.coinId === coinId) ?? { coinId, enabled: true, thresholdPct: suggestedThreshold }
    const updateCurrencySetting = (coinId: CoinId, patch: Partial<CurrencyAlertSetting>) => setCurrencyAlerts((settings) => {
        const current = settings.find((setting) => setting.coinId === coinId) ?? { coinId, enabled: true, thresholdPct: suggestedThreshold }
        return [...settings.filter((setting) => setting.coinId !== coinId), { ...current, ...patch }]
    })

    if (!loaded) return <div className="text-muted-foreground">Loading…</div>

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div>
                <Link href={investorId === 'you' ? '/' : `/?investor=${encodeURIComponent(investorId)}`} className="text-sm text-muted-foreground hover:text-foreground">← {isDemo ? `${profileName}'s Today` : 'Today'}</Link>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">{isDemo ? `${profileName}'s plan` : 'Your goal and your money'}</h2>
                <p className="text-muted-foreground">
                    {isDemo ? `See how ${profileName}'s goal, holdings, and loss limits shape the agent's response.` : 'Set this while you’re calm. When crypto crashes, the app measures the drop against it.'}{' '}
                    {!isDemo && !draft && (
                        <Link href="/setup" className="text-primary hover:underline">
                            Or describe it in your own words →
                        </Link>
                    )}
                </p>
            </div>

            {draft && (
                <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm">
                    <div className="font-medium text-violet-200">Filled in by AI from your description. Check each field, then save.</div>
                    {draft.assumptions.length > 0 && (
                        <div className="mt-2">
                            <div className="text-xs uppercase tracking-wider text-muted-foreground">What it assumed</div>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5">
                                {draft.assumptions.map((a, i) => (
                                    <li key={i}>{a}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {draft.missing.length > 0 && (
                        <div className="mt-2">
                            <div className="text-xs uppercase tracking-wider text-amber-300">Still needed</div>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-200">
                                {draft.missing.map((m, i) => (
                                    <li key={i}>{m}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {isDemo && (
                <div className="border-y border-violet-400/20 py-3 text-sm text-violet-200">
                    Demo profile · Read-only so this scenario stays repeatable.
                </div>
            )}

            <fieldset disabled={isDemo} className="space-y-6 disabled:cursor-default [&_input:disabled]:cursor-default [&_input:disabled]:opacity-70 [&_select:disabled]:cursor-default [&_select:disabled]:opacity-70 [&_button:disabled]:cursor-default [&_button:disabled]:opacity-50">
            <Panel title={isDemo ? `${profileName}'s goal` : 'Your goal'}>
                <div className="space-y-4">
                    <Field label="What's the money for?" hint="e.g. Buy a home, Retire, Grow my savings long-term">
                        <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={120} className="w-full rounded-md border bg-background p-2 text-sm" />
                    </Field>
                    <Field label="Why do you own crypto?" hint="e.g. A small long-term bet, I believe in it, Someone suggested it">
                        <input value={cryptoReason} onChange={(e) => setCryptoReason(e.target.value)} maxLength={120} className="w-full rounded-md border bg-background p-2 text-sm" />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="When do you need it?" hint="e.g. Spring 2027, 10+ years">
                            <input value={timeHorizon} onChange={(e) => setTimeHorizon(e.target.value)} maxLength={60} className="w-full rounded-md border bg-background p-2 text-sm" />
                        </Field>
                        <Field label="Personal loss boundary" hint="How much of your total wealth could this goal lose before you want a serious check-in?">
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2"><input type="number" min={0.5} max={25} step={0.5} value={dropComfortPct} onChange={(e) => setDropComfortPct(Number(e.target.value))} className="w-24 rounded-md border bg-background p-2 text-sm" /><span className="text-sm">%</span></div>
                                <button type="button" onClick={() => setDropComfortPct(suggestedComfort)} className="text-xs font-medium text-violet-300 hover:text-violet-200">Use suggested {suggestedComfort}%</button>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{comfortSuggestionReason(suggestedComfort)} This is based on total wealth—not one coin’s drop.</p>
                        </Field>
                    </div>
                </div>
            </Panel>

            <section className="border-y border-white/10 py-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Investment loss alerts</p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-tight">{isDemo ? `${profileName}'s configured investment limits.` : 'Choose how much of your investment you can lose.'}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">The agent compares live value with the amount you put in—not with yesterday&apos;s price. A currency or your combined crypto portfolio can trigger Slack or email independently. Your goal boundary above remains a separate total-wealth planning check.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" checked={alertEnabled} onChange={(e) => setAlertEnabled(e.target.checked)} className="h-4 w-4 accent-violet-400" />
                        External alerts {alertEnabled ? 'on' : 'off'}
                    </label>
                </div>

                {alertEnabled && (
                    <div className="mt-7 divide-y divide-white/10 border-y border-white/10">
                        {heldCurrencyValues.map(({ coinId, valueUsd, investedUsd }) => {
                            const setting = currencySetting(coinId)
                            const coin = COINS.find((candidate) => candidate.id === coinId)!
                            return (
                                <div key={coinId} className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <input aria-label={`Enable ${coin.label} alerts`} type="checkbox" checked={setting.enabled} onChange={(event) => updateCurrencySetting(coinId, { enabled: event.target.checked })} className="h-4 w-4 accent-violet-400" />
                                            <div><p className="font-medium">{coin.label}</p><p className="text-xs text-muted-foreground">{investedUsd == null ? `${usdText(valueUsd)} held · add “You put in” below to activate this rule` : `${usdText(investedUsd)} invested · ${usdText(valueUsd)} worth now`}</p></div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 pl-7 sm:pl-0">
                                        <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Loss limit</span><input aria-label={`${coin.label} loss limit`} type="number" min={1} max={50} step={0.5} disabled={!setting.enabled} value={setting.thresholdPct} onChange={(event) => updateCurrencySetting(coinId, { thresholdPct: Number(event.target.value) })} className="w-20 rounded-md border bg-background p-2 text-right tabular-nums disabled:opacity-40" /><span>%</span></label>
                                        <span className="min-w-40 text-xs text-muted-foreground">{investedUsd == null ? 'Waiting for invested amount' : `${usdText(investedUsd * setting.thresholdPct / 100)} loss · alerts below ${usdText(investedUsd * (1 - setting.thresholdPct / 100))}`}</span>
                                        {setting.thresholdPct !== suggestedThreshold && <button type="button" onClick={() => updateCurrencySetting(coinId, { thresholdPct: suggestedThreshold })} className="text-xs font-medium text-violet-300 hover:text-violet-200">Use {suggestedThreshold}%</button>}
                                    </div>
                                </div>
                            )
                        })}

                        <div className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                            <div className="flex items-center gap-3">
                                <input aria-label="Enable combined crypto portfolio alerts" type="checkbox" checked={cryptoPortfolioAlertEnabled} onChange={(event) => setCryptoPortfolioAlertEnabled(event.target.checked)} className="h-4 w-4 accent-emerald-400" />
                                <div><p className="font-medium">Combined crypto portfolio</p><p className="text-xs text-muted-foreground">{cryptoInvestedUsd == null ? `${usdText(cryptoValueUsd)} held · add every holding’s invested amount to activate this rule` : `${usdText(cryptoInvestedUsd)} invested · ${usdText(cryptoValueUsd)} worth now · cash and other investments excluded`}</p></div>
                            </div>
                            <div className="flex items-center gap-3 pl-7 sm:pl-0">
                                <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Loss limit</span><input aria-label="Combined crypto portfolio loss limit" type="number" min={1} max={25} step={0.5} disabled={!cryptoPortfolioAlertEnabled} value={cryptoPortfolioAlertPct} onChange={(event) => setCryptoPortfolioAlertPct(Number(event.target.value))} className="w-20 rounded-md border bg-background p-2 text-right tabular-nums disabled:opacity-40" /><span>%</span></label>
                                <span className="min-w-40 text-xs text-muted-foreground">{cryptoInvestedUsd == null ? 'Waiting for all invested amounts' : `${usdText(cryptoInvestedUsd * cryptoPortfolioAlertPct / 100)} loss · alerts below ${usdText(cryptoInvestedUsd * (1 - cryptoPortfolioAlertPct / 100))}`}</span>
                            </div>
                        </div>
                    </div>
                )}
                {alertEnabled && <p className="mt-4 text-xs text-muted-foreground">Suggested currency limit: {suggestedThreshold}%. {alertSuggestionReason(suggestedThreshold)} Each alert fires once when live value crosses below its investment boundary, then re-arms after recovery.</p>}
            </section>

            <Panel title={isDemo ? `${profileName}'s crypto` : 'Your crypto'} action={<span className="text-xs text-muted-foreground">Amount invested determines profit or loss</span>}>
                <div className="space-y-3">
                    {crypto.map((c, idx) => {
                        const coin = COINS.find((x) => x.id === c.coinId)!
                        return (
                            <div key={idx} className="flex flex-wrap items-center gap-2">
                                <select
                                    value={c.coinId}
                                    onChange={(e) => {
                                        const next = COINS.find((x) => x.id === e.target.value)!
                                        update(idx, { coinId: next.id, heldVia: next.funds.length ? c.heldVia : 'direct', fund: next.funds[0] ?? '' })
                                    }}
                                    className="rounded-md border bg-background p-2 text-sm font-medium"
                                >
                                    {COINS.map((x) => (
                                        <option key={x.id} value={x.id}>{x.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={c.heldVia === 'fund' ? c.fund : 'direct'}
                                    onChange={(e) => update(idx, e.target.value === 'direct' ? { heldVia: 'direct', fund: '' } : { heldVia: 'fund', fund: e.target.value })}
                                    className="rounded-md border bg-background p-2 text-sm"
                                >
                                    <option value="direct">Held directly</option>
                                    {coin.funds.map((f) => (
                                        <option key={f} value={f}>Through the {f} fund</option>
                                    ))}
                                </select>
                                <label className="text-xs text-muted-foreground">
                                    Worth now
                                    <Money value={c.marketValue} onChange={(v) => update(idx, { marketValue: v })} />
                                </label>
                                <label className="text-xs text-muted-foreground">
                                    Amount invested
                                    <Money value={c.investedUsd ?? 0} onChange={(v) => update(idx, { investedUsd: v > 0 ? v : null })} />
                                </label>
                                <button onClick={() => setCrypto((cs) => cs.filter((_, i) => i !== idx))} className="px-2 text-muted-foreground hover:text-red-400" aria-label="Remove">
                                    ✕
                                </button>
                            </div>
                        )
                    })}
                    <button
                        onClick={() => setCrypto((cs) => [...cs, { coinId: 'bitcoin', heldVia: 'fund', fund: 'IBIT', marketValue: 5000, investedUsd: null }])}
                        className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
                    >
                        + Add crypto
                    </button>
                </div>
            </Panel>

            <Panel title="Everything else" action={<span className="text-xs text-muted-foreground">Rough amounts are fine</span>}>
                <p className="mb-4 text-sm text-muted-foreground">
                    This is what lets the app tell you how big a crypto drop really is compared to everything you have.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Cash & savings" hint="Bank accounts, money market">
                        <Money value={cashUsd} onChange={setCashUsd} />
                    </Field>
                    <Field label="Stocks & bonds" hint="Brokerage, 401(k), IRA">
                        <Money value={investmentsUsd} onChange={setInvestmentsUsd} />
                    </Field>
                </div>
            </Panel>
            </fieldset>

            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
                <Link href={investorId === 'you' ? '/' : `/?investor=${encodeURIComponent(investorId)}`} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary">{isDemo ? `Back to ${profileName}` : 'Cancel'}</Link>
                {!isDemo && <button onClick={save} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                </button>}
            </div>
            {!isDemo && <p className="text-xs text-muted-foreground">If you change your amounts or goal, earlier insights are cleared, since the numbers they quoted would no longer be right.</p>}
        </div>
    )
}

function Money({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
        <div className="flex items-center rounded-md border bg-background">
            <span className="pl-2 text-sm text-muted-foreground">$</span>
            <input type="number" min={0} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-32 bg-transparent p-2 text-right text-sm tabular-nums outline-none" />
        </div>
    )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-sm font-medium">{label}</span>
            {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
            <div className="mt-1">{children}</div>
        </label>
    )
}
