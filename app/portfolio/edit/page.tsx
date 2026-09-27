'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Panel } from '@/components/advisor/Badges'

type CoinId = 'bitcoin' | 'ethereum' | 'solana'
type CryptoHolding = { coinId: CoinId; heldVia: 'fund' | 'direct'; fund: string; marketValue: number }
type StoredPosition = { symbol: string; assetClass: string; coinId: CoinId | null; marketValue: number }

const COINS: { id: CoinId; label: string; funds: string[] }[] = [
    { id: 'bitcoin', label: 'Bitcoin', funds: ['IBIT', 'FBTC'] },
    { id: 'ethereum', label: 'Ethereum', funds: ['ETHA'] },
    { id: 'solana', label: 'Solana', funds: [] },
]

export default function EditPortfolio() {
    const router = useRouter()
    const [goal, setGoal] = useState('')
    const [cryptoReason, setCryptoReason] = useState('')
    const [timeHorizon, setTimeHorizon] = useState('')
    const [dropComfortPct, setDropComfortPct] = useState(30)
    const [crypto, setCrypto] = useState<CryptoHolding[]>([])
    const [cashUsd, setCashUsd] = useState(0)
    const [investmentsUsd, setInvestmentsUsd] = useState(0)
    const [loaded, setLoaded] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/investors/you').then(async (r) => {
            if (!r.ok) return
            const { investor } = await r.json()
            const positions: StoredPosition[] = investor.positions
            setGoal(investor.goal)
            setCryptoReason(investor.cryptoReason ?? '')
            setTimeHorizon(investor.timeHorizon)
            setDropComfortPct(investor.dropComfortPct)
            setCrypto(
                positions
                    .filter((p) => p.coinId)
                    .map((p) => ({
                        coinId: p.coinId as CoinId,
                        heldVia: p.assetClass === 'crypto_etf' ? 'fund' : 'direct',
                        fund: p.assetClass === 'crypto_etf' ? p.symbol : '',
                        marketValue: p.marketValue,
                    })),
            )
            setCashUsd(positions.filter((p) => p.assetClass === 'cash').reduce((s, p) => s + p.marketValue, 0))
            setInvestmentsUsd(positions.filter((p) => !p.coinId && p.assetClass !== 'cash').reduce((s, p) => s + p.marketValue, 0))
            setLoaded(true)
        })
    }, [])

    async function save() {
        setSaving(true)
        setError(null)
        const res = await fetch('/api/investors/you', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ goal, cryptoReason, timeHorizon, dropComfortPct, crypto, cashUsd, investmentsUsd }),
        })
        setSaving(false)
        if (!res.ok) return setError((await res.json()).error ?? 'Could not save')
        router.push('/?investor=you')
    }

    const update = (idx: number, patch: Partial<CryptoHolding>) => setCrypto((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)))

    if (!loaded) return <div className="text-muted-foreground">Loading…</div>

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div>
                <Link href="/?investor=you" className="text-sm text-muted-foreground hover:text-foreground">← Your portfolio</Link>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">Your goal and your money</h2>
                <p className="text-muted-foreground">Set this while you&apos;re calm. When crypto crashes, the app measures the drop against it.</p>
            </div>

            <Panel title="Your goal">
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
                        <Field label="I'm OK if crypto drops up to" hint="Before you'd start losing sleep">
                            <div className="flex items-center gap-2">
                                <input type="number" min={1} max={100} value={dropComfortPct} onChange={(e) => setDropComfortPct(Number(e.target.value))} className="w-24 rounded-md border bg-background p-2 text-sm" />
                                <span className="text-sm">%</span>
                            </div>
                        </Field>
                    </div>
                </div>
            </Panel>

            <Panel title="Your crypto">
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
                                <Money value={c.marketValue} onChange={(v) => update(idx, { marketValue: v })} />
                                <button onClick={() => setCrypto((cs) => cs.filter((_, i) => i !== idx))} className="px-2 text-muted-foreground hover:text-red-400" aria-label="Remove">
                                    ✕
                                </button>
                            </div>
                        )
                    })}
                    <button
                        onClick={() => setCrypto((cs) => [...cs, { coinId: 'bitcoin', heldVia: 'fund', fund: 'IBIT', marketValue: 5000 }])}
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

            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
                <Link href="/?investor=you" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary">Cancel</Link>
                <button onClick={save} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
            <p className="text-xs text-muted-foreground">Saving clears earlier insights for your portfolio, since the numbers they quoted may no longer be right.</p>
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
