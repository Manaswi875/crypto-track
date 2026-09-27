export const ALERT_THRESHOLDS = [5, 7, 10] as const

export function suggestedAlertThreshold(timeHorizon: string, dropComfortPct: number) {
    const horizon = timeHorizon.toLowerCase()
    const year = horizon.match(/\b(20\d{2})\b/)?.[1]
    const yearsAway = year ? Number(year) - new Date().getFullYear() : null
    const shortTerm = /month|next year|1\s*year|2\s*year/.test(horizon) || (yearsAway != null && yearsAway <= 2)
    const longTerm = /10\+?|decade|long[- ]term/.test(horizon)

    if (shortTerm || dropComfortPct <= 20) return 5
    if (longTerm && dropComfortPct > 35) return 10
    return 7
}

export function alertSuggestionReason(threshold: number) {
    if (threshold === 5) return 'Your shorter timeline or lower loss tolerance makes earlier notice useful.'
    if (threshold === 10) return 'Your longer timeline and higher loss tolerance can filter out ordinary volatility.'
    return 'This should catch unusually large moves without interrupting you for normal volatility.'
}
