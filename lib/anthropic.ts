import Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-opus-5'

// Server-side refusal fallback: if the model declines, the API reroutes the
// same request to a fallback model inside the same call.
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

// Claude Opus 5 list prices, USD per million tokens
const PRICE = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 }

export type Usage = {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
}

export function costUsd(u: Usage) {
    return (
        (u.input_tokens * PRICE.input +
            u.output_tokens * PRICE.output +
            (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
            (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
        1_000_000
    )
}

let client: Anthropic | null = null

export function hasAnthropicKey() {
    return Boolean(process.env.ANTHROPIC_API_KEY)
}

export function getAnthropic() {
    if (!client) client = new Anthropic()
    return client
}
