import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { hasAnthropicKey } from '@/lib/anthropic'
import { generateMarketSummary, getCachedMarketSummary } from '@/services/marketSummary'

export const dynamic = 'force-dynamic'

/** The last generated summary, if any. Never calls the model. */
export async function GET() {
    return NextResponse.json({ summary: await getCachedMarketSummary(), aiEnabled: hasAnthropicKey() })
}

/** Generate a fresh summary (only when the user asks for one). */
export async function POST() {
    if (!hasAnthropicKey()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 503 })
    try {
        return NextResponse.json({ summary: await generateMarketSummary() })
    } catch (err) {
        const message = err instanceof Anthropic.APIError ? `AI service error (${err.status})` : err instanceof Error ? err.message : 'Could not summarise the market'
        return NextResponse.json({ error: message }, { status: 502 })
    }
}
