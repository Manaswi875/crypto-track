import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool'
import * as z from 'zod/v4'
import prisma from '@/lib/prisma'
import { FALLBACK_BETA, MODEL, costUsd, getAnthropic } from '@/lib/anthropic'

/**
 * Shared agent engine. The personal insight agent and the advisor brief agent
 * are the same loop with different tools, prompt, and output schema.
 */

export type TraceStep =
    | { type: 'reasoning'; text: string; atMs: number }
    | { type: 'tool_call'; tool: string; output: unknown; ms: number; atMs: number }
    | { type: 'model_turn'; stopReason: string | null; inputTokens: number; outputTokens: number; atMs: number }

export type MarketEvent = {
    coinId: string
    changePct: number
    startPrice: number | null
    endPrice: number | null
    windowLabel: string | null
    occurredAt: Date
    source: string
    context: unknown
    coin: { name: string; symbol: string }
}

export class AgentRun {
    readonly trace: TraceStep[] = []
    readonly started = Date.now()

    /** A tool whose calls and outputs are recorded in the trace. */
    tool<T extends z.ZodType>(name: string, description: string, inputSchema: T, run: (input: z.infer<T>) => unknown): BetaRunnableTool<z.infer<T>> {
        return betaZodTool({
            name,
            description,
            inputSchema,
            run: async (input) => {
                const t0 = Date.now()
                const output = await run(input)
                this.trace.push({ type: 'tool_call', tool: name, output, ms: Date.now() - t0, atMs: t0 - this.started })
                return typeof output === 'string' ? output : JSON.stringify(output)
            },
        })
    }

    /** Tools every agent gets: the market event and longer-term price context. */
    marketTools(event: MarketEvent) {
        return [
            this.tool('get_market_event', 'Details of the market event: asset, % move, start/end price, time window, and whether it is live or a historical replay.', z.object({}), () => ({
                asset: event.coin.name,
                symbol: event.coin.symbol.toUpperCase(),
                change_pct: Number(event.changePct.toFixed(2)),
                start_price_usd: event.startPrice,
                end_price_usd: event.endPrice,
                window: event.windowLabel,
                occurred_at: event.occurredAt.toISOString().slice(0, 10),
                source: event.source === 'replay' ? 'historical replay (a real past move applied to the current portfolio)' : 'live',
            })),
            this.tool('get_price_context', 'Longer-term price context for the asset (change over 30/90 days, prior high and low), useful for putting the move in perspective.', z.object({}), async () => {
                if (event.context) return event.context
                const recent = await prisma.priceHistory.findMany({ where: { coinId: event.coinId }, orderBy: { timestamp: 'desc' }, take: 200 })
                if (recent.length === 0) return { note: 'No price history available.' }
                const prices = recent.map((p) => p.price)
                return {
                    note: 'Recent live samples only',
                    latest_price_usd: prices[0],
                    high_usd: Math.max(...prices),
                    low_usd: Math.min(...prices),
                    samples: prices.length,
                    since: recent[recent.length - 1].timestamp.toISOString(),
                }
            }),
        ]
    }

    /** Run the tool loop to completion and return usage, cost, and timing. */
    async run(params: { system: string; userMessage: string; tools: BetaRunnableTool<any>[] }) {
        const runner = getAnthropic().beta.messages.toolRunner({
            model: MODEL,
            max_tokens: 16000,
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
            thinking: { type: 'adaptive', display: 'summarized' },
            system: params.system,
            tools: params.tools,
            max_iterations: 10,
            messages: [{ role: 'user', content: params.userMessage }],
        })

        const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
        let model: string = MODEL

        for await (const message of runner) {
            usage.input_tokens += message.usage.input_tokens
            usage.output_tokens += message.usage.output_tokens
            usage.cache_creation_input_tokens += message.usage.cache_creation_input_tokens ?? 0
            usage.cache_read_input_tokens += message.usage.cache_read_input_tokens ?? 0
            model = message.model

            for (const block of message.content) {
                if (block.type === 'thinking' && block.thinking.trim()) {
                    this.trace.push({ type: 'reasoning', text: block.thinking.trim(), atMs: Date.now() - this.started })
                }
            }
            this.trace.push({
                type: 'model_turn',
                stopReason: message.stop_reason,
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens,
                atMs: Date.now() - this.started,
            })

            if (message.stop_reason === 'refusal') throw new Error('Model declined to respond')
            if (message.stop_reason === 'max_tokens') throw new Error('Model output was truncated (max_tokens)')
        }

        return {
            model,
            usage,
            costUsd: costUsd(usage),
            latencyMs: Date.now() - this.started,
            totalInputTokens: usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
        }
    }
}
