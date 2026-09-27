import { NextResponse } from 'next/server'
import { z } from 'zod'
import { hasAnthropicKey } from '@/lib/anthropic'
import { askPortfolio } from '@/services/askPortfolio'
import { streamResponse } from '@/services/streamAnswer'

export const dynamic = 'force-dynamic'

const Body = z.object({
    question: z.string().trim().min(1).max(500),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(20).default([]),
})

/** Ask anything about this investor's money; streams the answer as plain text. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
    if (!hasAnthropicKey()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 503 })
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Ask a question (up to 500 characters)' }, { status: 400 })
    return streamResponse(askPortfolio(params.id, parsed.data.question, parsed.data.history))
}
