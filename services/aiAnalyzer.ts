import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/lib/prisma'
import { FALLBACK_BETA, MODEL, getAnthropic, hasAnthropicKey } from '@/lib/anthropic'

export class AIAnalyzer {
    async explainMovement(eventId: string, coinId: string, price: number, changePct: number) {
        if (!hasAnthropicKey()) return

        try {
            const response = await getAnthropic().beta.messages.create({
                model: MODEL,
                max_tokens: 4000,
                betas: [FALLBACK_BETA],
                fallbacks: 'default',
                output_config: { effort: 'low' },
                messages: [
                    {
                        role: 'user',
                        content: `A statistical anomaly was detected in ${coinId}'s price.
Current price: $${price}
Move vs. rolling mean: ${changePct.toFixed(2)}%

In 2-3 factual sentences, describe the size of this move in context. You have no news or on-chain data, so do not speculate about causes.`,
                    },
                ],
            })

            if (response.stop_reason === 'refusal') return

            const explanation = response.content
                .filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('')
                .trim()

            await prisma.volatilityEvent.update({
                where: { id: eventId },
                data: { aiExplanation: explanation || 'Movement detected based on statistical deviation.' },
            })

            console.log(`[AI] Explanation for ${coinId}: ${explanation}`)
        } catch (error) {
            if (error instanceof Anthropic.APIError) {
                console.error(`AI analysis failed (${error.status}):`, error.message)
            } else {
                console.error('AI analysis failed:', error)
            }
        }
    }
}
