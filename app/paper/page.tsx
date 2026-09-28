'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSocket } from '@/context/SocketContext'
import { pct, usd } from '@/lib/format'

type CoinId = 'bitcoin' | 'ethereum' | 'solana'
type Price = { coinId: CoinId; symbol: string; name: string; price: number | null; change24hPct: number }
type Holding = { id: string; coinId: CoinId; symbol: string; name: string; units: number; valueUsd: number; investedUsd: number; gainUsd: number; gainPct: number; change24hPct: number }
type Trade = { id: string; coinId: CoinId; side: 'buy' | 'sell'; units: number; priceUsd: number; valueUsd: number; realizedPnlUsd: number | null; createdAt: string }
type Portfolio = {
    active: boolean
    startedAt: string | null
    startingCashUsd: number
    cashUsd: number
    cryptoUsd: number
    totalUsd: number
    returnUsd: number
    returnPct: number
    holdings: Holding[]
    prices: Price[]
    trades: Trade[]
}

const STARTING_BALANCES = [10_000, 25_000, 50_000, 100_000]

function signedClass(value: number) {
    return value < 0 ? 'text-red-400' : value > 0 ? 'text-emerald-400' : 'text-muted-foreground'
}

function coinName(coinId: CoinId) {
    return coinId === 'bitcoin' ? 'Bitcoin' : coinId === 'ethereum' ? 'Ethereum' : 'Solana'
}

export default function PaperPortfolioPage() {
    const { socket, isConnected } = useSocket()
    const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
    const [startingCash, setStartingCash] = useState(50_000)
    const [selectedCoin, setSelectedCoin] = useState<CoinId>('bitcoin')
    const [side, setSide] = useState<'buy' | 'sell'>('buy')
    const [valueUsd, setValueUsd] = useState('1000')
    const [working, setWorking] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        const response = await fetch('/api/paper')
        const body = await response.json()
        if (response.ok) setPortfolio(body)
        else setError(body.error ?? 'Could not load the paper portfolio.')
    }, [])

    useEffect(() => { void load() }, [load])

    useEffect(() => {
        if (!socket) return
        socket.emit('subscribe', 'all-prices')
        const onPrice = (tick: { coinId: CoinId; price: number; change24h?: number }) => {
            setPortfolio((current) => {
                if (!current) return current
                const prices = current.prices.map((price) => price.coinId === tick.coinId ? { ...price, price: tick.price, change24hPct: tick.change24h ?? price.change24hPct } : price)
                const holdings = current.holdings.map((holding) => {
                    if (holding.coinId !== tick.coinId) return holding
                    const nextValue = holding.units * tick.price
                    const gainUsd = nextValue - holding.investedUsd
                    return { ...holding, valueUsd: nextValue, gainUsd, gainPct: holding.investedUsd ? (gainUsd / holding.investedUsd) * 100 : 0, change24hPct: tick.change24h ?? holding.change24hPct }
                })
                const cryptoUsd = holdings.reduce((sum, holding) => sum + holding.valueUsd, 0)
                const totalUsd = current.cashUsd + cryptoUsd
                return { ...current, prices, holdings, cryptoUsd, totalUsd, returnUsd: totalUsd - current.startingCashUsd, returnPct: current.startingCashUsd ? ((totalUsd - current.startingCashUsd) / current.startingCashUsd) * 100 : 0 }
            })
        }
        socket.on('price-update', onPrice)
        return () => { socket.off('price-update', onPrice) }
    }, [socket])

    async function act(payload: object) {
        setWorking(true)
        setError(null)
        const response = await fetch('/api/paper', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        const body = await response.json()
        setWorking(false)
        if (!response.ok) return setError(body.error ?? 'Could not update the simulation.')
        setPortfolio(body)
        return true
    }

    async function placeTrade() {
        const amount = Number(valueUsd)
        if (!Number.isFinite(amount) || amount < 10) return setError('Enter at least $10.')
        const action = side === 'buy' ? 'Buy' : 'Sell'
        if (!window.confirm(`${action} approximately ${unitsPreview.toFixed(7)} ${price?.symbol ?? ''} for ${usd(amount)} in virtual money?\n\nNo real order will be placed.`)) return
        if (await act({ action: side, coinId: selectedCoin, valueUsd: amount })) setValueUsd('1000')
    }

    async function clearPosition(item: Holding) {
        if (!window.confirm(`Clear your entire simulated ${item.name} position?\n\nIts current value of about ${usd(item.valueUsd)} will return to virtual cash. This cannot affect real money.`)) return
        await act({ action: 'liquidate', coinId: item.coinId })
    }

    const price = portfolio?.prices.find((item) => item.coinId === selectedCoin) ?? null
    const holding = portfolio?.holdings.find((item) => item.coinId === selectedCoin) ?? null
    const available = side === 'buy' ? portfolio?.cashUsd ?? 0 : holding?.valueUsd ?? 0
    const unitsPreview = price?.price && Number(valueUsd) > 0 ? Number(valueUsd) / price.price : 0
    const allocation = useMemo(() => {
        if (!portfolio?.totalUsd) return []
        return [
            ...portfolio.holdings.map((item) => ({ label: item.symbol, value: item.valueUsd, color: item.coinId === 'bitcoin' ? '#f59e0b' : item.coinId === 'ethereum' ? '#a78bfa' : '#34d399' })),
            { label: 'Cash', value: portfolio.cashUsd, color: '#475569' },
        ].filter((item) => item.value > 0).map((item) => ({ ...item, width: (item.value / portfolio.totalUsd) * 100 }))
    }, [portfolio])

    if (!portfolio) return <div className="text-muted-foreground">Loading the paper market…</div>

    if (!portfolio.active) {
        return (
            <div className="mx-auto max-w-5xl py-6 sm:py-14">
                <div className="relative overflow-hidden border-y border-violet-400/15 py-14 sm:py-20">
                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-3xl" />
                    <div className="relative grid items-end gap-12 lg:grid-cols-[1.25fr_0.75fr]">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-violet-300"><span className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_16px_rgba(167,139,250,0.9)]" />Paper Portfolio</div>
                            <h2 className="mt-5 max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-7xl">Invest without risking a dollar.</h2>
                            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">Use virtual cash to buy crypto at live CoinGecko prices. Crypto Pulse tracks the position, calculates your real-time gain or loss, and tests the same alerts you would use with real money.</p>
                            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground"><span>✓ No exchange account</span><span>✓ No real money</span><span>✓ Live-price monitoring</span></div>
                        </div>
                        <div className="border-l border-white/10 pl-0 lg:pl-8">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Choose virtual cash</p>
                            <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10">
                                {STARTING_BALANCES.map((amount) => <button key={amount} onClick={() => setStartingCash(amount)} className={`bg-background px-5 py-4 text-left text-xl font-semibold transition-colors hover:bg-white/[0.06] ${startingCash === amount ? 'text-violet-300' : ''}`}>{usd(amount)}</button>)}
                            </div>
                            <button onClick={() => { if (window.confirm('Start a paper portfolio? This replaces the holdings currently entered under “Your portfolio” with virtual cash and simulated positions.')) void act({ action: 'start', startingCashUsd: startingCash }) }} disabled={working} className="group mt-6 flex w-full items-center justify-between rounded-full bg-foreground px-6 py-3 font-semibold text-background transition-transform hover:scale-[1.02] disabled:opacity-50"><span>{working ? 'Opening portfolio…' : `Start with ${usd(startingCash)}`}</span><span className="transition-transform group-hover:translate-x-1">→</span></button>
                            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Starting replaces the holdings currently entered under “Your portfolio.” Demo investor profiles remain unchanged.</p>
                            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-12 pb-16">
            <header className="relative border-b border-white/10 pb-9">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-300"><span className={`h-2 w-2 rounded-full ${isConnected ? 'animate-pulse bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]' : 'bg-amber-300'}`} />Paper Portfolio · {isConnected ? 'Live prices' : 'Reconnecting'}</div>
                    <div className="flex items-center gap-5 text-xs text-muted-foreground"><Link href="/" className="hover:text-foreground">See it on Today →</Link><button onClick={() => { if (window.confirm('Reset every simulated trade and begin again?')) void act({ action: 'reset', startingCashUsd: portfolio.startingCashUsd }) }} disabled={working} className="hover:text-red-300">Reset simulation</button></div>
                </div>
                <div className="mt-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div><p className="text-sm text-muted-foreground">Total simulated value</p><h2 className="mt-1 text-6xl font-semibold tracking-[-0.05em] sm:text-8xl">{usd(portfolio.totalUsd)}</h2></div>
                    <div className="sm:text-right"><p className="text-sm text-muted-foreground">Return since you started</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${signedClass(portfolio.returnUsd)}`}>{usd(portfolio.returnUsd, { sign: true })} <span className="text-base">{pct(portfolio.returnPct, 2)}</span></p><p className="mt-1 text-xs text-muted-foreground">Started with {usd(portfolio.startingCashUsd)} virtual cash</p></div>
                </div>
                <div className="mt-8 flex h-2 overflow-hidden rounded-full bg-white/5">{allocation.map((item) => <div key={item.label} style={{ width: `${item.width}%`, backgroundColor: item.color }} title={`${item.label}: ${usd(item.value)}`} className="transition-[width] duration-700" />)}</div>
                <div className="mt-3 flex flex-wrap gap-5 text-xs text-muted-foreground">{allocation.map((item) => <span key={item.label} className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label} {item.width.toFixed(0)}%</span>)}</div>
            </header>

            <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr]">
                <section>
                    <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Market</p><h3 className="mt-2 text-3xl font-semibold tracking-tight">Choose what to simulate.</h3></div><p className="text-sm text-muted-foreground">Cash available <strong className="text-foreground">{usd(portfolio.cashUsd)}</strong></p></div>
                    <div className="mt-7 divide-y divide-white/10 border-y border-white/10">
                        {portfolio.prices.map((item) => {
                            const owned = portfolio.holdings.find((candidate) => candidate.coinId === item.coinId)
                            return <button key={item.coinId} onClick={() => { setSelectedCoin(item.coinId); setSide('buy') }} className={`group grid w-full grid-cols-[1fr_auto] items-center gap-4 py-5 text-left transition-all hover:pl-2 ${selectedCoin === item.coinId ? 'pl-2' : ''}`}>
                                <span className="flex items-center gap-4"><span className={`flex h-11 w-11 items-center justify-center rounded-full text-xs font-bold ${item.coinId === 'bitcoin' ? 'bg-amber-400/10 text-amber-300' : item.coinId === 'ethereum' ? 'bg-violet-400/10 text-violet-300' : 'bg-emerald-400/10 text-emerald-300'}`}>{item.symbol}</span><span><strong className="block font-medium">{item.name}</strong><small className="text-muted-foreground">{owned ? `${owned.units.toFixed(6)} owned · ${usd(owned.valueUsd)}` : 'No simulated position yet'}</small></span></span>
                                <span className="text-right"><strong className="block tabular-nums">{item.price == null ? 'Unavailable' : usd(item.price)}</strong><small className={signedClass(item.change24hPct)}>{pct(item.change24hPct, 2)} today</small></span>
                            </button>
                        })}
                    </div>
                </section>

                <section className="relative lg:border-l lg:border-white/10 lg:pl-10">
                    <div className="sticky top-24">
                        <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Simulated order</p><div className="flex rounded-full bg-white/5 p-1"><button onClick={() => setSide('buy')} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${side === 'buy' ? 'bg-emerald-400 text-emerald-950' : 'text-muted-foreground'}`}>Buy</button><button onClick={() => setSide('sell')} disabled={!holding} className={`rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-30 ${side === 'sell' ? 'bg-red-400 text-red-950' : 'text-muted-foreground'}`}>Sell</button></div></div>
                        <div className="mt-6 flex gap-2" aria-label="Choose a cryptocurrency">
                            {portfolio.prices.map((item) => <button key={item.coinId} onClick={() => { setSelectedCoin(item.coinId); setSide('buy') }} aria-pressed={selectedCoin === item.coinId} className={`flex-1 rounded-full border px-3 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5 ${selectedCoin === item.coinId ? 'border-violet-300/60 bg-violet-400/15 text-violet-200 shadow-[0_8px_30px_rgba(139,92,246,0.12)]' : 'border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground'}`}>{item.symbol}</button>)}
                        </div>
                        <h3 className="mt-5 text-3xl font-semibold">{price?.name}</h3>
                        <div className="mt-8 border-b border-white/15 pb-3"><label className="text-xs uppercase tracking-[0.18em] text-muted-foreground" htmlFor="paper-value">Virtual dollars to {side}</label><div className="mt-2 flex items-end"><span className="pb-1 text-3xl text-muted-foreground">$</span><input id="paper-value" inputMode="decimal" value={valueUsd} onChange={(event) => setValueUsd(event.target.value)} className="min-w-0 flex-1 bg-transparent text-right text-5xl font-semibold tracking-tight outline-none" /></div></div>
                        <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>≈ {unitsPreview.toFixed(7)} {price?.symbol}</span><button onClick={() => setValueUsd(Math.max(0, Math.floor(available)).toString())}>Use max {usd(available)}</button></div>
                        <button onClick={placeTrade} disabled={working || !price?.price} className={`mt-7 w-full rounded-full px-6 py-3 font-semibold transition-transform hover:scale-[1.02] disabled:opacity-40 ${side === 'buy' ? 'bg-emerald-400 text-emerald-950' : 'bg-red-400 text-red-950'}`}>{working ? 'Placing simulated trade…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${price?.symbol} with virtual money`}</button>
                        <p className="mt-3 text-center text-xs text-muted-foreground">Uses the latest available CoinGecko price. No real order is placed.</p>
                        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
                    </div>
                </section>
            </div>

            <section>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Your positions</p><h3 className="mt-2 text-3xl font-semibold tracking-tight">What the agent is monitoring.</h3></div>
                {portfolio.holdings.length === 0 ? <div className="mt-7 border-y border-dashed border-white/15 py-10 text-center text-muted-foreground">Your virtual cash is ready. Make the first simulated investment above.</div> : <div className="mt-7 divide-y divide-white/10 border-y border-white/10">{portfolio.holdings.map((item) => <div key={item.id} className="grid gap-3 py-5 sm:grid-cols-[1fr_repeat(3,minmax(0,0.6fr))_auto] sm:items-center"><button onClick={() => { setSelectedCoin(item.coinId); setSide('sell'); setValueUsd(Math.min(1000, Math.floor(item.valueUsd)).toString()); window.scrollTo({ top: 430, behavior: 'smooth' }) }} className="text-left transition-transform hover:translate-x-1"><strong className="block">{item.name}</strong><small className="text-muted-foreground">{item.units.toFixed(7)} {item.symbol}</small></button><span><small className="block text-muted-foreground">Current value</small><strong>{usd(item.valueUsd)}</strong></span><span><small className="block text-muted-foreground">Amount invested</small><strong>{usd(item.investedUsd)}</strong></span><span className={signedClass(item.gainUsd)}><small className="block text-muted-foreground">Gain / loss</small><strong>{usd(item.gainUsd, { sign: true })} · {pct(item.gainPct, 2)}</strong></span><button onClick={() => void clearPosition(item)} disabled={working} className="text-left text-xs font-medium text-muted-foreground underline decoration-white/20 underline-offset-4 transition-colors hover:text-red-300 disabled:opacity-40 sm:text-right">Clear position</button></div>)}</div>}
            </section>

            {portfolio.trades.length > 0 && <section><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ledger</p><h3 className="mt-2 text-3xl font-semibold tracking-tight">Every simulated decision.</h3></div><div className="mt-7 divide-y divide-white/10 border-y border-white/10">{portfolio.trades.map((trade) => <div key={trade.id} className="grid gap-2 py-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-8"><span><strong className={trade.side === 'buy' ? 'text-emerald-300' : 'text-red-300'}>{trade.side === 'buy' ? 'Bought' : 'Sold'} {coinName(trade.coinId)}</strong><small className="ml-2 text-muted-foreground">{new Date(trade.createdAt).toLocaleString()}</small></span><span className="text-muted-foreground">{trade.units.toFixed(7)} at {usd(trade.priceUsd)}</span><span className="font-medium tabular-nums">{usd(trade.valueUsd)}{trade.realizedPnlUsd != null && <small className={`ml-2 ${signedClass(trade.realizedPnlUsd)}`}>{usd(trade.realizedPnlUsd, { sign: true })} realized</small>}</span></div>)}</div></section>}
        </div>
    )
}
