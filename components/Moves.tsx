import { COIN_SYMBOL, pct } from '@/lib/format'

type EventLike = { coinId: string; changePct: number; moves?: unknown; coin?: { name: string } }

export function movesOf(e: EventLike): Record<string, number> {
    if (e.moves && typeof e.moves === 'object' && !Array.isArray(e.moves)) return e.moves as Record<string, number>
    return { [e.coinId]: e.changePct }
}

const NAME: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana', cardano: 'Cardano', ripple: 'XRP' }

/** "Crypto-wide sell-off" when even Bitcoin fell hard, otherwise named after the coin that fell most. */
export function eventTitle(e: EventLike) {
    const moves = movesOf(e)
    if (Object.keys(moves).length === 1) return `${e.coin?.name ?? NAME[e.coinId] ?? e.coinId} move`
    if ((moves.bitcoin ?? 0) <= -8) return 'Crypto-wide sell-off'
    return `${NAME[e.coinId] ?? e.coinId}-led sell-off`
}

const ORDER = ['bitcoin', 'ethereum', 'solana', 'cardano', 'ripple']
const byMarketSize = ([a]: [string, number], [b]: [string, number]) => ORDER.indexOf(a) - ORDER.indexOf(b)

/** Each coin's real move that day, e.g. BTC −14.1% · ETH −14.9% · SOL −14.8% */
export function Moves({ event, className = '' }: { event: EventLike; className?: string }) {
    const moves = movesOf(event)
    return (
        <span className={`inline-flex flex-wrap gap-x-3 gap-y-1 tabular-nums ${className}`}>
            {Object.entries(moves).sort(byMarketSize).map(([coin, m]) => (
                <span key={coin}>
                    <span className="text-muted-foreground">{COIN_SYMBOL[coin] ?? coin}</span>{' '}
                    <span className={m < 0 ? 'text-red-400' : 'text-emerald-400'}>{pct(m, 1)}</span>
                </span>
            ))}
        </span>
    )
}
