import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import * as z from 'zod/v4'
import { FALLBACK_BETA, MODEL, getAnthropic } from '@/lib/anthropic'

const Draft = z.object({
    goal: z.string().nullable().describe('What the money is for, in a few words, e.g. "Buy our first home". Null if not said.'),
    cryptoReason: z.string().nullable().describe('Why they own crypto, in a few words. Null if not said.'),
    timeHorizon: z.string().nullable().describe('When they need the money, e.g. "Spring 2027" or "10+ years". Null if not said.'),
    dropComfortPct: z
        .number()
        .nullable()
        .describe('Whole-portfolio loss (%) that should trigger a serious personal check-in. Only if they state it or clearly imply a number; otherwise null.'),
    crypto: z
        .array(
            z.object({
                coinId: z.enum(['bitcoin', 'ethereum', 'solana']),
                heldVia: z.enum(['fund', 'direct']).describe('fund if held through an ETF like IBIT, FBTC or ETHA; direct otherwise'),
                fund: z.string().nullable().describe('Fund ticker if held through a fund, e.g. IBIT'),
                marketValue: z.number().nullable().describe('What it is worth now, in USD, if stated'),
                investedUsd: z.number().nullable().describe('What they put in, in USD, if stated'),
            }),
        )
        .describe('Only Bitcoin, Ethereum and Solana holdings they mention'),
    cashUsd: z.number().nullable().describe('Cash and savings in USD, if stated'),
    investmentsUsd: z.number().nullable().describe('Stocks, bonds, 401(k), IRA etc. in USD, if stated'),
    assumptions: z.array(z.string()).describe('Anything you inferred rather than read directly, in plain words, so they can check it'),
    missing: z.array(z.string()).describe('What they did not tell us that the app needs, as short questions to them'),
})
export type ProfileDraft = z.infer<typeof Draft>

const SYSTEM_PROMPT = `You turn someone's plain-English description of their money into a structured profile for a crypto app. They will review and edit it before it is saved.

Rules:
- Never invent numbers. If an amount, date or percentage is not stated, leave it null and add a short question to "missing".
- Interpret loose wording sensibly ("about 15k" = 15000, "a house in a couple of years" = the timing they imply) and list each such interpretation in "assumptions".
- Only Bitcoin, Ethereum and Solana are supported. If they mention other coins, say so in "missing".
- Keep text fields short: a few words each, in their voice.`

/** Draft a profile from free text. Nothing is saved; the user confirms it first. */
export async function draftProfile(text: string): Promise<ProfileDraft> {
    const response = await getAnthropic().beta.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        output_config: { effort: 'low', format: betaZodOutputFormat(Draft) },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
    })
    if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error('Could not read that description. Try rephrasing it.')
    return response.parsed_output
}
