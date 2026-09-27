'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Panel } from '@/components/advisor/Badges'

type AssetClass = 'equity' | 'fixed_income' | 'cash' | 'crypto_etf' | 'crypto'
type CoinId = 'bitcoin' | 'ethereum' | 'solana' | null
type Position = { symbol: string; name: string; assetClass: AssetClass; coinId: CoinId; marketValue: number }

// Common holdings, so filling in a portfolio is a couple of clicks
const PRESETS: Position[] = [
    { symbol: 'IBIT', name: 'iShares Bitcoin Trust ETF', assetClass: 'crypto_etf', coinId: 'bitcoin', marketValue: 5000 },
    { symbol: 'FBTC', name: 'Fidelity Wise Origin Bitcoin Fund', assetClass: 'crypto_etf', coinId: 'bitcoin', marketValue: 5000 },
    { symbol: 'ETHA', name: 'iShares Ethereum Trust ETF', assetClass: 'crypto_etf', coinId: 'ethereum', marketValue: 5000 },
    { symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', coinId: 'bitcoin', marketValue: 5000 },
    { symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', coinId: 'ethereum', marketValue: 5000 },
    { symbol: 'SOL', name: 'Solana', assetClass: 'crypto', coinId: 'solana', marketValue: 5000 },
    { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', assetClass: 'equity', marketValue: 10000, coinId: null },
    { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', assetClass: 'fixed_income', marketValue: 10000, coinId: null },
    { symbol: 'CASH', name: 'Cash / money market', assetClass: 'cash', marketValue: 10000, coinId: null },
]

const ASSET_LABEL: Record<AssetClass, string> = {
    equity: 'Stocks',
    fixed_income: 'Bonds',
    cash: 'Cash',
    crypto_etf: 'Crypto ETF',
    crypto: 'Crypto',
}

export default function EditPortfolio() {
    const router = useRouter()
    const [form, setForm] = useState<{ tagline: string; riskComfort: string; timeHorizon: string; dropComfortPct: number; plan: string } | null>(null)
    const [positions, setPositions] = useState<Position[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/investors/you').then(async (r) => {
            if (!r.ok) return
            const { investor } = await r.json()
            setForm({
                tagline: investor.tagline,
                riskComfort: investor.riskComfort,
                timeHorizon: investor.timeHorizon,
                dropComfortPct: investor.dropComfortPct,
                plan: investor.plan,
            })
            setPositions(
                investor.positions.map((p: Position) => ({
                    symbol: p.symbol,
                    name: p.name,
                    assetClass: p.assetClass,
                    coinId: p.coinId,
                    marketValue: p.marketValue,
                })),
            )
        })
    }, [])

    async function save() {
        if (!form) return
        setSaving(true)
        setError(null)
        const res = await fetch('/api/investors/you', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...form, positions }),
        })
        setSaving(false)
        if (!res.ok) return setError((await res.json()).error ?? 'Could not save')
        router.push('/?investor=you')
    }

    const update = (idx: number, patch: Partial<Position>) => setPositions((ps) => ps.map((p, i) => (i === idx ? { ...p, ...patch } : p)))

    if (!form) return <div className="text-muted-foreground">Loading…</div>

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div>
                <Link href="/?investor=you" className="text-sm text-muted-foreground hover:text-foreground">← Your portfolio</Link>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">Your plan and portfolio</h2>
                <p className="text-muted-foreground">Write your plan while you&apos;re calm. The AI will hold you to it when the market isn&apos;t.</p>
            </div>

            <Panel title="Your plan">
                <div className="space-y-4">
                    <Field label="Your plan, in your own words" hint="Why you own crypto, when you'll need the money, how you tend to react to drops.">
                        <textarea
                            value={form.plan}
                            onChange={(e) => setForm({ ...form, plan: e.target.value })}
                            rows={4}
                            className="w-full rounded-md border bg-background p-2 text-sm"
                        />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Field label="Time horizon">
                            <input value={form.timeHorizon} onChange={(e) => setForm({ ...form, timeHorizon: e.target.value })} className="w-full rounded-md border bg-background p-2 text-sm" />
                        </Field>
                        <Field label="Risk comfort">
                            <select value={form.riskComfort} onChange={(e) => setForm({ ...form, riskComfort: e.target.value })} className="w-full rounded-md border bg-background p-2 text-sm">
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </Field>
                        <Field label="I'm OK if crypto drops up to">
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={form.dropComfortPct}
                                    onChange={(e) => setForm({ ...form, dropComfortPct: Number(e.target.value) })}
                                    className="w-full rounded-md border bg-background p-2 text-sm"
                                />
                                <span className="text-sm">%</span>
                            </div>
                        </Field>
                    </div>
                </div>
            </Panel>

            <Panel title="Positions" action={<span className="text-xs text-muted-foreground">Current market value in USD</span>}>
                <div className="space-y-2">
                    {positions.map((p, idx) => (
                        <div key={idx} className="flex flex-wrap items-center gap-2">
                            <input value={p.symbol} onChange={(e) => update(idx, { symbol: e.target.value.toUpperCase() })} className="w-20 rounded-md border bg-background p-2 text-sm font-medium" />
                            <input value={p.name} onChange={(e) => update(idx, { name: e.target.value })} className="min-w-0 flex-1 rounded-md border bg-background p-2 text-sm" />
                            <span className="w-24 text-xs text-muted-foreground">{ASSET_LABEL[p.assetClass]}</span>
                            <input
                                type="number"
                                min={1}
                                value={p.marketValue}
                                onChange={(e) => update(idx, { marketValue: Number(e.target.value) })}
                                className="w-32 rounded-md border bg-background p-2 text-right text-sm tabular-nums"
                            />
                            <button onClick={() => setPositions((ps) => ps.filter((_, i) => i !== idx))} className="px-2 text-muted-foreground hover:text-red-400" aria-label="Remove">
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                    <span className="self-center text-xs text-muted-foreground">Add:</span>
                    {PRESETS.map((p) => (
                        <button key={p.symbol} onClick={() => setPositions((ps) => [...ps, { ...p }])} className="rounded-md border px-2 py-1 text-xs hover:bg-secondary">
                            + {p.symbol}
                        </button>
                    ))}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-sm font-medium">{label}</span>
            {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
            <div className="mt-1">{children}</div>
        </label>
    )
}
