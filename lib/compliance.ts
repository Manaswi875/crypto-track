export type ComplianceFlag = { rule: string; match: string }

// Phrases a client-facing message must never contain: promises, predictions,
// or buy/sell recommendations. Deliberately simple and auditable.
const RULES: { rule: string; pattern: RegExp }[] = [
    { rule: 'performance_guarantee', pattern: /\b(guarantee[ds]?|risk[- ]free|can(?:'|no)t lose|no risk)\b/i },
    { rule: 'price_prediction', pattern: /\b(will|is going to|expect(?:ed)? to) (recover|rebound|bounce back|go (?:back )?up|rise|reach|hit|climb)\b/i },
    { rule: 'price_target', pattern: /\bprice target\b/i },
    { rule: 'trade_recommendation', pattern: /\b(you should|we recommend(?: that you)?|i recommend(?: that you)?|time to|good time to) (buy|sell|add|trim|exit|get out|double down)\b/i },
    { rule: 'buy_the_dip', pattern: /\bbuy(?:ing)? the dip\b/i },
]

export function checkClientMessage(text: string): ComplianceFlag[] {
    const flags: ComplianceFlag[] = []
    for (const { rule, pattern } of RULES) {
        const m = text.match(pattern)
        if (m) flags.push({ rule, match: m[0] })
    }
    return flags
}
