import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { hasAnthropicKey } from '@/lib/anthropic'
import { draftProfile } from '@/services/profileDraft'

const Body = z.object({ text: z.string().trim().min(10).max(2000) })

export async function POST(req: Request) {
    if (!hasAnthropicKey()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 503 })
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Tell us a little more (at least a sentence).' }, { status: 400 })
    try {
        return NextResponse.json({ draft: await draftProfile(parsed.data.text) })
    } catch (err) {
        const message = err instanceof Anthropic.APIError ? `AI service error (${err.status})` : err instanceof Error ? err.message : 'Could not draft a profile'
        return NextResponse.json({ error: message }, { status: 502 })
    }
}
