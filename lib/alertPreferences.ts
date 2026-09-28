export const ALERT_THRESHOLDS = [5, 7, 10] as const

export function suggestedComfortBoundary(goal: string, timeHorizon: string) {
    const combined = `${goal} ${timeHorizon}`.toLowerCase()
    const year = combined.match(/\b(20\d{2})\b/)?.[1]
    const yearsAway = year ? Number(year) - new Date().getFullYear() : null
    const nearTerm = /month|next year|1\s*year|2\s*year|home|house|retir|college|tuition/.test(combined) || (yearsAway != null && yearsAway <= 2)
    const decade = /10\+?|decade/.test(combined)
    if (nearTerm) return 1
    if (decade) return 10
    return 5
}

export function comfortSuggestionReason(boundary: number) {
    if (boundary === 1) return 'Near-term or essential goals call for an earlier whole-portfolio warning.'
    if (boundary === 10) return 'A 10+ year growth goal can use a wider whole-portfolio boundary.'
    return 'A 5% whole-portfolio loss is a practical starting checkpoint for a longer-term goal.'
}

export function suggestedAlertThreshold(timeHorizon: string, dropComfortPct: number) {
    const horizon = timeHorizon.toLowerCase()
    const year = horizon.match(/\b(20\d{2})\b/)?.[1]
    const yearsAway = year ? Number(year) - new Date().getFullYear() : null
    const shortTerm = /month|next year|1\s*year|2\s*year/.test(horizon) || (yearsAway != null && yearsAway <= 2)
    const longTerm = /10\+?|decade|long[- ]term/.test(horizon)

    if (shortTerm || dropComfortPct <= 2) return 5
    if (longTerm && dropComfortPct >= 8) return 10
    return 7
}

export function alertSuggestionReason(threshold: number) {
    if (threshold === 5) return 'Your shorter timeline or lower loss tolerance makes earlier notice useful.'
    if (threshold === 10) return 'Your longer timeline and higher loss tolerance can filter out ordinary volatility.'
    return 'This should catch unusually large moves without interrupting you for normal volatility.'
}
