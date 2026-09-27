export const usd = (n: number, opts: { compact?: boolean; sign?: boolean } = {}) => {
    const s = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: opts.compact ? 'compact' : 'standard',
        maximumFractionDigits: opts.compact ? 1 : 0,
    }).format(Math.abs(n))
    if (n < 0) return `−${s}`
    return opts.sign && n > 0 ? `+${s}` : s
}

export const pct = (n: number, digits = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`

export const date = (d: string | Date) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export const dateTime = (d: string | Date) =>
    new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const COIN_SYMBOL: Record<string, string> = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', cardano: 'ADA', ripple: 'XRP' }

/** Asset prices: whole dollars for big numbers, cents below $1,000. */
export const price = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 4 }).format(n)
