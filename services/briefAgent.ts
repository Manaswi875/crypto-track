import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import * as z from 'zod/v4'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { audit } from '@/lib/audit'
import { checkClientMessage } from '@/lib/compliance'
import { computeEventImpact, HouseholdImpact } from '@/lib/impact'
import { AgentRun } from '@/services/agentCore'

const ADVISOR_FIRST_NAME = 'Alex'
const CONCURRENCY = 4

const SubmitBriefInput = z.object({
    priority: z
        .enum(['call_today', 'send_message', 'monitor'])
        .describe('How urgently the advisor should reach out to this household'),
    advisor_summary: z
        .string()
        .describe('Internal brief for the advisor: 3-5 short sentences. Not client-facing.'),
    client_message: z
        .string()
        .describe(`Draft message to the client in the advisor's voice, signed "${ADVISOR_FIRST_NAME}". Max 120 words.`),
    rationale: z.string().describe('One or two sentences explaining the chosen priority.'),
    cited_facts: z
        .array(
            z.object({
                claim: z.string().describe('A factual claim made in the brief or message'),
                source: z
                    .enum(['get_market_event', 'get_household_profile', 'get_household_holdings', 'get_event_impact', 'get_price_context'])
                    .describe('The tool whose result supports the claim'),
            }),
        )
        .describe('Every factual claim, with the tool that supports it'),
})
export type SubmittedBrief = z.infer<typeof SubmitBriefInput>

const SYSTEM_PROMPT = `You help a financial advisor at a fiduciary wealth management firm respond to market events.

A crypto asset that some clients hold has just moved sharply. You are working on ONE client household. Your job is to prepare:
1. An internal brief for the advisor (never shown to the client).
2. A draft message the advisor can review, edit, and send to the client.

Gather what you need with the tools. Everything about the event, the household, and the dollar impact is available through them.

Rules:
- Every number you state must come from a tool result. Quote dollar and percentage impacts exactly as returned by get_event_impact. Never calculate your own figures.
- You only have data on this one asset's move. Do not claim how the client's other holdings or the wider market performed (e.g. "the rest of your portfolio was unaffected"); you do not know that.
- Never recommend buying, selling, rebalancing, or "buying the dip". Never predict prices or promise outcomes. The advisor makes decisions; you inform them. An automated compliance check runs on your output.
- Client message: plain English, calm and warm, first person in the advisor's voice, signed "${ADVISOR_FIRST_NAME}", at most 120 words. Make it specific to this household. Offer a conversation. Do not quote or reveal the internal meeting notes, and never mention other clients.
- Priority:
  - call_today: the impact is material for this household (1% of their total portfolio or more), or their notes suggest they will be anxious (nervous about headlines, asked whether the position is too big, going through a hard time).
  - send_message: noticeable but not urgent.
  - monitor: small relative to the portfolio and the client has said they do not want to hear about every dip.
- Advisor summary: what happened, what it means for this household in dollars and % of portfolio, the relevant context from their notes, and suggested talking points (never trade advice).
- cited_facts: list every factual claim with the tool that supports it.

When you are done, call submit_brief exactly once.`

function publishProgress(payload: Record<string, unknown>) {
    if (!redis) return
    redis.publish('agent-progress', JSON.stringify({ ...payload, timestamp: Date.now() })).catch(() => {})
}

function daysSince(d: Date) {
    return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
}

/**
 * Run the agent for one household and return its submitted brief plus trace and usage.
 * Does not touch the Brief table, so the eval harness can call it directly.
 */
export async function runBriefAgent(eventId: string, householdId: string, impacts?: HouseholdImpact[]) {
    const [event, household] = await Promise.all([
        prisma.volatilityEvent.findUniqueOrThrow({ where: { id: eventId }, include: { coin: true } }),
        prisma.household.findUniqueOrThrow({ where: { id: householdId }, include: { holdings: true } }),
    ])
    const bookImpacts = impacts ?? (await computeEventImpact(eventId))
    const impactIdx = bookImpacts.findIndex((i) => i.householdId === householdId)
    if (impactIdx === -1) throw new Error(`Household ${householdId} has no exposure to ${event.coinId}`)
    const impact = bookImpacts[impactIdx]

    const agent = new AgentRun()
    let submitted: SubmittedBrief | null = null

    // Every tool is bound to this event + household; the model decides which to call.
    const tools = [
        ...agent.marketTools(event),
        agent.tool('get_household_profile', 'Client household profile: contact name, risk profile, life stage, tenure, last contact, and the advisor\'s recent meeting notes (internal).', z.object({}), () => ({
            household: household.name,
            primary_contact: household.primaryContact,
            risk_profile: household.riskProfile,
            life_stage: household.lifeStage,
            client_since: household.clientSince.toISOString().slice(0, 10),
            days_since_last_contact: daysSince(household.lastContactAt),
            meeting_notes_internal: household.notes,
        })),
        agent.tool('get_household_holdings', 'All holdings in the household with market values and portfolio weights, flagging positions exposed to the event.', z.object({}), () => ({
            total_portfolio_usd: impact.aumUsd,
            holdings: household.holdings
                .sort((a, b) => b.marketValue - a.marketValue)
                .map((h) => ({
                    symbol: h.symbol,
                    name: h.name,
                    asset_class: h.assetClass,
                    market_value_usd: h.marketValue,
                    weight_pct: Number(((h.marketValue / impact.aumUsd) * 100).toFixed(2)),
                    exposed_to_event: h.coinId === event.coinId,
                })),
        })),
        agent.tool('get_event_impact', 'The pre-computed dollar impact of this event on the household. Quote these numbers exactly.', z.object({}), () => ({
            exposure_usd: impact.exposureUsd,
            exposure_pct_of_portfolio: impact.exposurePctOfAum,
            estimated_impact_usd: impact.impactUsd,
            impact_pct_of_portfolio: impact.impactPctOfAum,
            rank_in_book: `${impactIdx + 1} of ${bookImpacts.length} affected households by dollar impact`,
        })),
        betaZodTool({
            name: 'submit_brief',
            description: 'Submit the finished brief and draft client message. Call exactly once, at the end.',
            inputSchema: SubmitBriefInput,
            run: async (input) => {
                submitted = input
                agent.trace.push({ type: 'tool_call', tool: 'submit_brief', output: { priority: input.priority }, ms: 0, atMs: Date.now() - agent.started })
                return 'Brief recorded.'
            },
        }),
    ]

    const result = await agent.run({
        system: SYSTEM_PROMPT,
        tools,
        userMessage: `Prepare the brief and draft client message for the ${household.name} regarding the ${event.coin.name} move.`,
    })

    const brief = submitted as SubmittedBrief | null
    if (!brief) throw new Error('Agent finished without submitting a brief')

    return {
        brief,
        impact,
        trace: agent.trace,
        ...result,
        complianceFlags: checkClientMessage(brief.client_message),
    }
}

async function generateBrief(briefId: string, impacts: HouseholdImpact[]) {
    const row = await prisma.brief.update({ where: { id: briefId }, data: { status: 'generating', error: null } })
    publishProgress({ eventId: row.eventId, briefId, householdId: row.householdId, status: 'generating' })

    try {
        const result = await runBriefAgent(row.eventId, row.householdId, impacts)
        await prisma.brief.update({
            where: { id: briefId },
            data: {
                status: 'draft',
                priority: result.brief.priority,
                advisorSummary: result.brief.advisor_summary,
                clientMessage: result.brief.client_message,
                rationale: result.brief.rationale,
                citedFacts: result.brief.cited_facts,
                complianceFlags: result.complianceFlags,
                trace: result.trace as unknown as Prisma.InputJsonValue,
                model: result.model,
                inputTokens: result.totalInputTokens,
                outputTokens: result.usage.output_tokens,
                costUsd: result.costUsd,
                latencyMs: result.latencyMs,
            },
        })
        await audit('brief_generated', 'agent', 'brief', briefId, {
            householdId: row.householdId,
            eventId: row.eventId,
            priority: result.brief.priority,
            complianceFlags: result.complianceFlags,
            model: result.model,
            costUsd: Number(result.costUsd.toFixed(4)),
            latencyMs: result.latencyMs,
        })
        publishProgress({ eventId: row.eventId, briefId, householdId: row.householdId, status: 'draft', priority: result.brief.priority })
    } catch (err) {
        const message = err instanceof Anthropic.APIError ? `API error ${err.status}: ${err.message}` : err instanceof Error ? err.message : String(err)
        console.error(`[AGENT] Brief ${briefId} failed:`, message)
        await prisma.brief.update({ where: { id: briefId }, data: { status: 'failed', error: message } })
        await audit('brief_failed', 'agent', 'brief', briefId, { error: message })
        publishProgress({ eventId: row.eventId, briefId, householdId: row.householdId, status: 'failed' })
    }
}

/**
 * Queue briefs for the most-affected households of an event and generate them
 * in the background. Approved/rejected briefs are left untouched.
 */
export async function generateBriefsForEvent(eventId: string, limit: number, actor: string) {
    const impacts = await computeEventImpact(eventId)
    const targets = impacts.slice(0, limit)

    const existing = await prisma.brief.findMany({ where: { eventId } })
    const reviewed = new Set(existing.filter((b) => b.status === 'approved' || b.status === 'rejected').map((b) => b.householdId))
    const toRun = targets.filter((t) => !reviewed.has(t.householdId))

    const briefs = await Promise.all(
        toRun.map((t) =>
            prisma.brief.upsert({
                where: { eventId_householdId: { eventId, householdId: t.householdId } },
                update: { status: 'queued', exposureUsd: t.exposureUsd, impactUsd: t.impactUsd, impactPctOfAum: t.impactPctOfAum },
                create: {
                    eventId,
                    householdId: t.householdId,
                    status: 'queued',
                    exposureUsd: t.exposureUsd,
                    impactUsd: t.impactUsd,
                    impactPctOfAum: t.impactPctOfAum,
                },
            }),
        ),
    )

    await audit('briefs_requested', actor, 'event', eventId, {
        affectedHouseholds: impacts.length,
        requested: briefs.length,
        skippedAlreadyReviewed: targets.length - toRun.length,
    })

    // Small worker pool; runs in the background after the request returns
    const queue = [...briefs]
    const worker = async () => {
        for (let b = queue.shift(); b; b = queue.shift()) await generateBrief(b.id, impacts)
    }
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))

    return { affected: impacts.length, queued: briefs.length }
}
