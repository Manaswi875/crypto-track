import { NextResponse } from 'next/server'
import { z } from 'zod'
import { hasAnthropicKey } from '@/lib/anthropic'
import { askFollowUp } from '@/services/followUp'

export const dynamic = 'force-dynamic'

const Body = z.object({
    question: z.string().trim().min(1).max(500),
    quote: z.string().trim().max(1000).optional(),
})

/** Streams the answer as plain text. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
    if (!hasAnthropicKey()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 503 })
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Ask a question (up to 500 characters)' }, { status: 400 })

    const encoder = new TextEncoder()
    const answer = askFollowUp(params.id, parsed.data.question, parsed.data.quote)
    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const { value, done } = await answer.next()
                if (done) controller.close()
                else controller.enqueue(encoder.encode(value))
            } catch (err) {
                console.error('[FOLLOW-UP] failed:', err instanceof Error ? err.message : err)
                controller.enqueue(encoder.encode('\n\nSorry, I couldn’t finish that answer. Please try again.'))
                controller.close()
            }
        },
    })
    return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}
