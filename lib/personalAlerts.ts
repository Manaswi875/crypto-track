export type AlertPosition = {
    coinId: string | null
    marketValue: number
    investedUsd: number | null
}

export type CurrencyLoss = {
    coinId: string
    currentValueUsd: number
    investedValueUsd: number
    lossUsd: number
    lossPct: number
}

export type CryptoLossSnapshot = {
    currencies: CurrencyLoss[]
    currentValueUsd: number
    investedValueUsd: number
    lossUsd: number
    lossPct: number
    complete: boolean
}

const round2 = (value: number) => Math.round(value * 100) / 100

/** Calculate each holding's current profit or loss against the amount invested. */
export function cryptoLossSnapshot(positions: AlertPosition[]): CryptoLossSnapshot {
    const grouped = new Map<string, { currentValueUsd: number; investedValueUsd: number; complete: boolean }>()
    for (const position of positions) {
        if (!position.coinId) continue
        const current = grouped.get(position.coinId) ?? { currentValueUsd: 0, investedValueUsd: 0, complete: true }
        grouped.set(position.coinId, {
            currentValueUsd: current.currentValueUsd + position.marketValue,
            investedValueUsd: current.investedValueUsd + (position.investedUsd ?? 0),
            complete: current.complete && position.investedUsd != null && position.investedUsd > 0,
        })
    }

    const complete = [...grouped.values()].every((values) => values.complete)
    const currencies = [...grouped.entries()].filter(([, values]) => values.complete).map(([coinId, values]) => {
        const lossUsd = values.currentValueUsd - values.investedValueUsd
        return {
            coinId,
            currentValueUsd: round2(values.currentValueUsd),
            investedValueUsd: round2(values.investedValueUsd),
            lossUsd: round2(lossUsd),
            lossPct: round2((lossUsd / values.investedValueUsd) * 100),
        }
    })

    const currentValueUsd = currencies.reduce((sum, currency) => sum + currency.currentValueUsd, 0)
    const investedValueUsd = currencies.reduce((sum, currency) => sum + currency.investedValueUsd, 0)
    const lossUsd = currentValueUsd - investedValueUsd
    return {
        currencies,
        currentValueUsd: round2(currentValueUsd),
        investedValueUsd: round2(investedValueUsd),
        lossUsd: round2(lossUsd),
        lossPct: round2(investedValueUsd ? (lossUsd / investedValueUsd) * 100 : 0),
        complete,
    }
}

export const crossedLossLimit = (lossPct: number, thresholdPct: number) => lossPct <= -thresholdPct

export const recoveredFromLossLimit = (lossPct: number, thresholdPct: number) =>
    lossPct > -Math.max(thresholdPct - 0.5, 0)
