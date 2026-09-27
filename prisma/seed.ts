import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Deterministic PRNG so the demo book is identical on every seed
function mulberry32(seed: number) {
    return () => {
        seed |= 0
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
const rand = mulberry32(20260928)
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
const between = (min: number, max: number) => min + rand() * (max - min)
const round = (n: number, to = 100) => Math.round(n / to) * to

const FIRST_NAMES = [
    'Priya', 'Marcus', 'Elena', 'David', 'Aisha', 'Tom', 'Mei', 'Carlos', 'Rachel', 'James',
    'Fatima', 'Daniel', 'Grace', 'Omar', 'Linda', 'Kenji', 'Sofia', 'Robert', 'Nadia', 'Michael',
    'Hannah', 'Luis', 'Olivia', 'Samuel', 'Yuki', 'Ethan', 'Chloe', 'Andre', 'Maria', 'Ben',
]
const LAST_NAMES = [
    'Patel', 'Johnson', 'Rossi', 'Kim', 'Okafor', 'Nguyen', 'Chen', 'Alvarez', 'Goldberg', 'Walsh',
    'Haddad', 'Schneider', 'Park', 'Mensah', 'Murphy', 'Tanaka', 'Silva', 'Brennan', 'Kowalski', 'Reyes',
    'Fischer', 'Morales', 'Bennett', 'Adeyemi', 'Sato', 'Lindqvist', 'Dubois', 'Carter', 'Ortiz', 'Hughes',
    'Shah', 'Coleman', 'Romano', 'Cho', 'Nwosu', 'Tran', 'Wong', 'Castillo', 'Levy', 'Doyle',
    'Farah', 'Weber', 'Han', 'Boateng', 'Kelly', 'Mori', 'Costa', 'Sullivan', 'Novak', 'Vargas',
    'Becker', 'Moreno', 'Foster', 'Eze', 'Ito', 'Nilsson', 'Laurent', 'Mitchell', 'Ramos', 'Price',
    'Iyer', 'Grant',
]

type Risk = 'conservative' | 'moderate' | 'aggressive'

const LIFE_STAGES: Record<Risk, string[]> = {
    conservative: ['Retired', 'Recently retired', 'Pre-retirement (retiring 2027)', 'Retired, drawing income'],
    moderate: ['Pre-retirement (retiring 2031)', 'Mid-career, two kids', 'Empty nesters', 'Recently retired'],
    aggressive: ['Early career', 'Mid-career, tech industry', 'Business owner', 'High earner, no kids'],
}

const GENERAL_NOTES = [
    'Funding daughter\'s college tuition this fall (~$48k). Wants liquidity confirmed before August.',
    'Buying a home in the spring; down payment held in money market. Asked about timing.',
    'Prefers quarterly check-ins only; low-touch relationship. Email preferred.',
    'Recently widowed; prefers phone calls over email. Handle with care and patience.',
    'Business owner, liquidity event expected next year. Comfortable with volatility.',
    'Very engaged; checks portfolio daily. Called twice during the last market drawdown.',
    'Long-term mindset; explicitly said "don\'t call me for every dip."',
    'Discussed Roth conversion strategy; revisit before year end.',
    'Caring for aging parents; may need to free up cash over the next 12 months.',
    'New client, transferred from a wirehouse. Still building trust; values proactive updates.',
]

const CRYPTO_NOTES = [
    'Son works in tech and suggested the Bitcoin ETF position. Client describes themselves as nervous about headlines.',
    'Asked at the last review whether the crypto position is "too much" for this stage of life. Agreed to revisit.',
    'Interested in adding to the crypto allocation; discussed position-sizing limits (max 10%).',
    'Holds crypto mostly for "upside"; understands it can drop 50%+. Wants to hear from us on big moves.',
    'Bought the Bitcoin ETF near the highs; sensitive about being down on it.',
    'Treats crypto as a small speculative sleeve; wants a heads-up only for large moves.',
]

const ALLOCATION: Record<Risk, { equity: number; fixed: number; cash: number; cryptoChance: number; cryptoRange: [number, number] }> = {
    conservative: { equity: 0.3, fixed: 0.6, cash: 0.1, cryptoChance: 0.3, cryptoRange: [0.02, 0.09] },
    moderate: { equity: 0.6, fixed: 0.35, cash: 0.05, cryptoChance: 0.45, cryptoRange: [0.02, 0.08] },
    aggressive: { equity: 0.85, fixed: 0.1, cash: 0.05, cryptoChance: 0.65, cryptoRange: [0.04, 0.15] },
}

const EQUITIES = [
    { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF' },
    { symbol: 'VXUS', name: 'Vanguard Total International Stock ETF' },
    { symbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF' },
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corp.' },
    { symbol: 'NVDA', name: 'NVIDIA Corp.' },
]
const FIXED = [
    { symbol: 'BND', name: 'Vanguard Total Bond Market ETF' },
    { symbol: 'VTIP', name: 'Vanguard Short-Term Inflation-Protected Securities ETF' },
    { symbol: 'MUB', name: 'iShares National Muni Bond ETF' },
]
const CASH = { symbol: 'SWVXX', name: 'Schwab Value Advantage Money Fund' }
const CRYPTO = [
    { symbol: 'IBIT', name: 'iShares Bitcoin Trust ETF', assetClass: 'crypto_etf', coinId: 'bitcoin', weight: 5 },
    { symbol: 'FBTC', name: 'Fidelity Wise Origin Bitcoin Fund', assetClass: 'crypto_etf', coinId: 'bitcoin', weight: 2 },
    { symbol: 'ETHA', name: 'iShares Ethereum Trust ETF', assetClass: 'crypto_etf', coinId: 'ethereum', weight: 2 },
    { symbol: 'BTC', name: 'Bitcoin (held-away, Coinbase)', assetClass: 'crypto', coinId: 'bitcoin', weight: 1 },
    { symbol: 'ETH', name: 'Ethereum (held-away, Coinbase)', assetClass: 'crypto', coinId: 'ethereum', weight: 1 },
    { symbol: 'SOL', name: 'Solana (held-away, Coinbase)', assetClass: 'crypto', coinId: 'solana', weight: 1 },
]

function weightedCrypto() {
    const total = CRYPTO.reduce((s, c) => s + c.weight, 0)
    let r = rand() * total
    for (const c of CRYPTO) {
        r -= c.weight
        if (r <= 0) return c
    }
    return CRYPTO[0]
}

function daysAgo(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

async function seedAdvisorBook() {
    // Rebuild the demo book from scratch
    await prisma.brief.deleteMany()
    await prisma.holding.deleteMany()
    await prisma.household.deleteMany()
    await prisma.advisor.deleteMany()

    const advisor = await prisma.advisor.create({
        data: { name: 'Alex Rivera', email: 'alex.rivera@demo.local' },
    })

    const usedNames = new Set<string>()
    for (let i = 0; i < 60; i++) {
        const first = pick(FIRST_NAMES)
        let last = pick(LAST_NAMES)
        while (usedNames.has(last)) last = pick(LAST_NAMES)
        usedNames.add(last)

        const risk: Risk = rand() < 0.35 ? 'conservative' : rand() < 0.6 ? 'moderate' : 'aggressive'
        const alloc = ALLOCATION[risk]
        // Log-uniform AUM between $250k and $6M
        const aum = round(Math.exp(between(Math.log(250_000), Math.log(6_000_000))), 1000)

        const hasCrypto = rand() < alloc.cryptoChance
        const cryptoPct = hasCrypto ? between(...alloc.cryptoRange) : 0
        const rest = 1 - cryptoPct

        const holdings: { symbol: string; name: string; assetClass: string; coinId?: string; marketValue: number }[] = []

        // Equities: split across 2-3 positions
        const eqPositions = [...EQUITIES].sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 2))
        const eqTotal = aum * rest * alloc.equity
        eqPositions.forEach((e, idx) => {
            const share = idx === 0 ? 0.6 : 0.4 / (eqPositions.length - 1)
            holdings.push({ ...e, assetClass: 'equity', marketValue: round(eqTotal * share) })
        })

        // Fixed income: 1-2 positions
        const fiPositions = [...FIXED].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 2))
        const fiTotal = aum * rest * alloc.fixed
        fiPositions.forEach((f) => {
            holdings.push({ ...f, assetClass: 'fixed_income', marketValue: round(fiTotal / fiPositions.length) })
        })

        holdings.push({ ...CASH, assetClass: 'cash', marketValue: round(aum * rest * alloc.cash) })

        // Crypto: 1-2 positions
        if (hasCrypto) {
            const first = weightedCrypto()
            const second = rand() < 0.3 ? weightedCrypto() : null
            const positions = second && second.symbol !== first.symbol ? [first, second] : [first]
            const cryptoTotal = aum * cryptoPct
            positions.forEach((c, idx) => {
                const share = positions.length === 1 ? 1 : idx === 0 ? 0.7 : 0.3
                holdings.push({
                    symbol: c.symbol,
                    name: c.name,
                    assetClass: c.assetClass,
                    coinId: c.coinId,
                    marketValue: round(cryptoTotal * share),
                })
            })
        }

        const notes = [pick(GENERAL_NOTES)]
        if (hasCrypto && rand() < 0.7) notes.push(pick(CRYPTO_NOTES))

        await prisma.household.create({
            data: {
                advisorId: advisor.id,
                name: `${last} Household`,
                primaryContact: `${first} ${last}`,
                riskProfile: risk,
                lifeStage: pick(LIFE_STAGES[risk]),
                clientSince: daysAgo(Math.floor(between(120, 3000))),
                lastContactAt: daysAgo(Math.floor(between(3, 150))),
                notes: notes.join(' '),
                holdings: { create: holdings },
            },
        })
    }

    const households = await prisma.household.count()
    const withCrypto = await prisma.household.count({ where: { holdings: { some: { coinId: { not: null } } } } })
    console.log(`Seeded advisor book: ${households} households, ${withCrypto} with crypto exposure.`)
}

type PositionSeed = { symbol: string; name: string; assetClass: string; coinId?: string; marketValue: number }

const INVESTORS: {
    id: string
    name: string
    tagline: string
    age: number | null
    riskComfort: string
    timeHorizon: string
    dropComfortPct: number
    plan: string
    isDemo: boolean
    positions: PositionSeed[]
}[] = [
    {
        id: 'you',
        name: 'You',
        tagline: 'Your own portfolio',
        age: null,
        riskComfort: 'medium',
        timeHorizon: '5+ years',
        dropComfortPct: 30,
        plan: 'Long-term investor. Crypto is a small part of my savings, and I want to understand big moves without being told what to do.',
        isDemo: false,
        positions: [
            { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', assetClass: 'equity', marketValue: 30000 },
            { symbol: 'IBIT', name: 'iShares Bitcoin Trust ETF', assetClass: 'crypto_etf', coinId: 'bitcoin', marketValue: 10000 },
            { symbol: 'SWVXX', name: 'Schwab Value Advantage Money Fund', assetClass: 'cash', marketValue: 10000 },
        ],
    },
    {
        id: 'rohan',
        name: 'Rohan',
        tagline: 'Long-term crypto believer',
        age: 29,
        riskComfort: 'high',
        timeHorizon: '10+ years',
        dropComfortPct: 50,
        plan: "I'm in crypto for the long haul, at least 10 years. I've sat through crashes before and I don't want to hear about every dip. Only flag something if it's genuinely unusual. I keep 6 months of expenses in cash, separately.",
        isDemo: true,
        positions: [
            { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', assetClass: 'equity', marketValue: 38000 },
            { symbol: 'IBIT', name: 'iShares Bitcoin Trust ETF', assetClass: 'crypto_etf', coinId: 'bitcoin', marketValue: 22000 },
            { symbol: 'SWVXX', name: 'Schwab Value Advantage Money Fund', assetClass: 'cash', marketValue: 12000 },
            { symbol: 'ETH', name: 'Ethereum (on Coinbase)', assetClass: 'crypto', coinId: 'ethereum', marketValue: 9000 },
            { symbol: 'SOL', name: 'Solana (on Coinbase)', assetClass: 'crypto', coinId: 'solana', marketValue: 4000 },
        ],
    },
    {
        id: 'sofia',
        name: 'Sofia',
        tagline: 'Saving for a house',
        age: 36,
        riskComfort: 'medium',
        timeHorizon: 'Buying a home around spring 2027',
        dropComfortPct: 20,
        plan: "We're buying our first home around spring 2027. The down payment is in a money market fund and I don't want to touch it. The Bitcoin ETF is a small long-term bet I bought near the highs. Red numbers make me anxious, and I've panic-sold before and regretted it.",
        isDemo: true,
        positions: [
            { symbol: 'SWVXX', name: 'Schwab Value Advantage Money Fund', assetClass: 'cash', marketValue: 90000 },
            { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', assetClass: 'equity', marketValue: 45000 },
            { symbol: 'IBIT', name: 'iShares Bitcoin Trust ETF', assetClass: 'crypto_etf', coinId: 'bitcoin', marketValue: 18000 },
            { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', assetClass: 'fixed_income', marketValue: 15000 },
        ],
    },
    {
        id: 'robert',
        name: 'Robert',
        tagline: 'Retiring next year',
        age: 63,
        riskComfort: 'low',
        timeHorizon: 'Retiring summer 2027, then drawing income',
        dropComfortPct: 10,
        plan: "I retire next summer and will start living off this portfolio. My son convinced me to put a little into Bitcoin. I don't really understand it, and the headlines make me nervous. I want steady and boring.",
        isDemo: true,
        positions: [
            { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', assetClass: 'fixed_income', marketValue: 260000 },
            { symbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', assetClass: 'equity', marketValue: 150000 },
            { symbol: 'VTIP', name: 'Vanguard Short-Term Inflation-Protected Securities ETF', assetClass: 'fixed_income', marketValue: 90000 },
            { symbol: 'SWVXX', name: 'Schwab Value Advantage Money Fund', assetClass: 'cash', marketValue: 60000 },
            { symbol: 'FBTC', name: 'Fidelity Wise Origin Bitcoin Fund', assetClass: 'crypto_etf', coinId: 'bitcoin', marketValue: 25000 },
        ],
    },
]

async function seedInvestors() {
    // Create-only: re-seeding never wipes an investor's edits or their generated insights
    for (const { positions, ...investor } of INVESTORS) {
        const exists = await prisma.investor.findUnique({ where: { id: investor.id } })
        if (exists) continue
        await prisma.investor.create({ data: { ...investor, positions: { create: positions } } })
    }
    console.log(`Investors: ${await prisma.investor.count()}`)
}

async function main() {
    // 1. Create a demo user
    const hashedPassword = await bcrypt.hash('password123', 10)
    await prisma.user.upsert({
        where: { email: 'demo@cryptopulse.com' },
        update: {},
        create: {
            email: 'demo@cryptopulse.com',
            password: hashedPassword,
            name: 'Demo User',
        }
    })

    // 2. Initial Coins
    const coins = [
        { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
        { id: 'ethereum', symbol: 'eth', name: 'Ethereum' },
        { id: 'solana', symbol: 'sol', name: 'Solana' },
        { id: 'cardano', symbol: 'ada', name: 'Cardano' },
        { id: 'ripple', symbol: 'xrp', name: 'Ripple' },
    ]

    for (const coin of coins) {
        await prisma.coin.upsert({
            where: { id: coin.id },
            update: {},
            create: coin
        })
    }

    // 3. Personal investors (the core product)
    await seedInvestors()

    // 4. Demo advisor book (the same engine at advisor scale)
    await seedAdvisorBook()

    console.log('Seed completed successfully.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
