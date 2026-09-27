// Demo investors: the user's own starting portfolio plus three examples.

export type PositionSeed = { symbol: string; name: string; assetClass: string; coinId?: string; marketValue: number; investedUsd?: number }

// Crypto in detail; everything else as two simple buckets
const cash = (marketValue: number): PositionSeed => ({ symbol: 'CASH', name: 'Cash & savings', assetClass: 'cash', marketValue })
const investments = (marketValue: number): PositionSeed => ({ symbol: 'INVEST', name: 'Stocks & bonds', assetClass: 'investments', marketValue })
const bitcoinFund = (symbol: 'IBIT' | 'FBTC', marketValue: number, investedUsd: number): PositionSeed => ({ symbol, name: `Bitcoin (${symbol} fund)`, assetClass: 'crypto_etf', coinId: 'bitcoin', marketValue, investedUsd })
const direct = (coinId: 'bitcoin' | 'ethereum' | 'solana', marketValue: number, investedUsd: number): PositionSeed => {
    const coin = { bitcoin: ['BTC', 'Bitcoin'], ethereum: ['ETH', 'Ethereum'], solana: ['SOL', 'Solana'] }[coinId]
    return { symbol: coin[0], name: `${coin[1]} (held directly)`, assetClass: 'crypto', coinId, marketValue, investedUsd }
}

export const INVESTORS: {
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
    isDemo: boolean
    positions: PositionSeed[]
}[] = [
    {
        id: 'you',
        name: 'You',
        tagline: 'Your own portfolio',
        age: null,
        goal: 'Grow my savings long-term',
        cryptoReason: 'A small long-term bet on Bitcoin',
        timeHorizon: '5+ years',
        dropComfortPct: 30,
        alertEnabled: true,
        alertThresholdPct: 7,
        isDemo: false,
        positions: [bitcoinFund('IBIT', 10000, 12000), cash(10000), investments(30000)],
    },
    {
        id: 'rohan',
        name: 'Rohan',
        tagline: 'Long-term crypto believer',
        age: 29,
        goal: 'Grow my wealth over the next decade',
        cryptoReason: 'I believe crypto will grow a lot over the next decade',
        timeHorizon: '10+ years',
        dropComfortPct: 50,
        alertEnabled: true,
        alertThresholdPct: 10,
        isDemo: true,
        positions: [bitcoinFund('IBIT', 22000, 15000), direct('ethereum', 9000, 11000), direct('solana', 4000, 5500), cash(12000), investments(38000)],
    },
    {
        id: 'sofia',
        name: 'Sofia',
        tagline: 'Saving for a house',
        age: 36,
        goal: 'Buy our first home',
        cryptoReason: 'A small bet on Bitcoin growing over time',
        timeHorizon: 'Spring 2027',
        dropComfortPct: 20,
        alertEnabled: true,
        alertThresholdPct: 5,
        isDemo: true,
        positions: [bitcoinFund('IBIT', 18000, 24000), cash(90000), investments(60000)],
    },
    {
        id: 'robert',
        name: 'Robert',
        tagline: 'Retiring next year',
        age: 63,
        goal: 'Retire and live off my savings',
        cryptoReason: 'My son suggested adding a little Bitcoin',
        timeHorizon: 'Summer 2027',
        dropComfortPct: 10,
        alertEnabled: true,
        alertThresholdPct: 5,
        isDemo: true,
        positions: [bitcoinFund('FBTC', 25000, 20000), cash(60000), investments(500000)],
    },
]
