import Anthropic from '@anthropic-ai/sdk'
import { FALLBACK_BETA, MODEL, costUsd, getAnthropic } from '@/lib/anthropic'

export const ANSWER_RULES = `How to answer:
- Plain English, calm, short: 2-4 sentences unless they ask for more. No headings.
- You can explain general concepts (what a crypto fund is, what a sell-off is, why coins move together).
- Use numbers only from the context, exactly as given. If something isn't in the context, say you don't have that information.

Never:
- Tell them to buy, sell, hold, rebalance, or "buy the dip", even if they ask directly. You can lay out what to weigh and suggest a licensed financial adviser for the decision.
- Predict prices or promise outcomes.`

const REFUSAL_NOTE = "I can't help with that one. I can explain what the market means for your money, or general crypto concepts."

/**
 * Stream a short answer with the context in a cached system prompt. Yields
 * text as it arrives; onDone gets the full answer and its cost.
 */
export async function* streamAnswer(
    system: string,
    messages: Anthropic.Beta.BetaMessageParam[],
    onDone: (answer: string, costUsd: number) => Promise<void>,
) {
    const stream = getAnthropic().beta.messages.stream({
        model: MODEL,
        max_tokens: 4000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
    })

    let answer = ''
    for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            answer += event.delta.text
            yield event.delta.text
        }
    }
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') {
        answer = REFUSAL_NOTE
        yield REFUSAL_NOTE
    }
    await onDone(answer.trim(), costUsd(final.usage))
}

/** Plain-text streaming Response for an answer generator. */
export function streamResponse(answer: AsyncGenerator<string>) {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const { value, done } = await answer.next()
                if (done) controller.close()
                else controller.enqueue(encoder.encode(value))
            } catch (err) {
                console.error('[ASK] failed:', err instanceof Error ? err.message : err)
                controller.enqueue(encoder.encode('\n\nSorry, I couldn’t finish that answer. Please try again.'))
                controller.close()
            }
        },
    })
    return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}
