/**
 * Grades every saved insight and follow-up answer with deterministic checks.
 * Free to run: it never calls the model.
 *
 *   npm run eval
 */
import { writeFileSync } from 'fs'
import prisma from '@/lib/prisma'
import { checkClientMessage } from '@/lib/compliance'

type Check = { name: string; pass: boolean; detail?: string }
type TraceStep = { type: string; tool?: string; output?: unknown }

const MAX_WORDS = 120

/** Every number that appeared in a tool result the agent saw. */
function groundNumbers(trace: TraceStep[]): number[] {
    const out: number[] = []
    const walk = (v: unknown) => {
        if (typeof v === 'number') out.push(v)
        else if (Array.isArray(v)) v.forEach(walk)
        else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    trace.filter((s) => s.type === 'tool_call' && s.tool !== 'submit_insight').forEach((s) => walk(s.output))
    return out
}

const dollars = (text: string) => [...text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)(k)?/gi)].map((m) => parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1))
const percents = (text: string) => [...text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((m) => parseFloat(m[1]))

/** A figure is grounded if some tool number matches it after rounding the way people write numbers. */
function grounded(value: number, pool: number[], kind: 'usd' | 'pct') {
    return pool.some((n) => {
        const a = Math.abs(n)
        if (kind === 'usd') return Math.abs(a - value) <= 1 || Math.abs(Math.round(a / 1000) * 1000 - value) < 1 || Math.abs(Math.round(a / 100) * 100 - value) < 1
        return [0, 1, 2].some((d) => Math.abs(Number(a.toFixed(d)) - value) < 1e-9) || Math.abs(a - value) < 0.051
    })
}

async function main() {
    const insights = await prisma.insight.findMany({ where: { status: 'ready' }, include: { investor: true, event: true } })
    const answers = await prisma.insightMessage.findMany({ where: { role: 'assistant' } })

    const results = insights.map((i) => {
        const text = [i.headline, i.whatHappened, i.whatItMeans, i.yourGoal, ...((i.questions as string[] | null) ?? [])].filter(Boolean).join('\n')
        const trace = (i.trace as TraceStep[] | null) ?? []
        const pool = groundNumbers(trace)
        const impactOut = trace.find((s) => s.tool === 'get_my_impact')?.output as { exceeds_loss_tolerance?: boolean; impact_pct_of_total?: number } | undefined

        const badUsd = dollars(text).filter((v) => !grounded(v, pool, 'usd'))
        const badPct = percents(text).filter((v) => !grounded(v, pool, 'pct'))
        const flags = checkClientMessage(text)
        const words = text.split(/\s+/).filter(Boolean).length

        let urgencyOk = true
        let urgencyDetail = ''
        if (impactOut?.exceeds_loss_tolerance && i.urgency !== 'check_in_today') {
            urgencyOk = false
            urgencyDetail = `drop exceeds loss tolerance but urgency is ${i.urgency}`
        } else if (i.urgency === 'within_your_plan' && (impactOut?.exceeds_loss_tolerance || Math.abs(impactOut?.impact_pct_of_total ?? 0) >= 5)) {
            urgencyOk = false
            urgencyDetail = 'marked within plan despite exceeding tolerance or a 5%+ loss'
        }

        const checks: Check[] = [
            { name: 'dollars grounded', pass: badUsd.length === 0, detail: badUsd.length ? `not in tool data: ${badUsd.map((v) => `$${v}`).join(', ')}` : undefined },
            { name: 'percents grounded', pass: badPct.length === 0, detail: badPct.length ? `not in tool data: ${badPct.map((v) => `${v}%`).join(', ')}` : undefined },
            { name: 'no advice', pass: flags.length === 0, detail: flags.map((f) => f.match).join(', ') || undefined },
            { name: 'brief', pass: words <= MAX_WORDS, detail: `${words} words` },
            { name: 'urgency consistent', pass: urgencyOk, detail: urgencyDetail || undefined },
            { name: 'cites sources', pass: ((i.citedFacts as unknown[] | null) ?? []).length >= 2 },
        ]
        return { id: i.id, investor: i.investor.name, date: i.event.occurredAt.toISOString().slice(0, 10), urgency: i.urgency, latencyMs: i.latencyMs, checks }
    })

    const followUps = answers.map((a) => ({ id: a.id, pass: checkClientMessage(a.content).length === 0 }))

    if (results.length === 0) console.log('No insights to grade yet. Generate some from the Today page, then run again.')
    for (const r of results) {
        const failed = r.checks.filter((c) => !c.pass)
        console.log(`${failed.length ? '✗' : '✓'} ${r.investor.padEnd(8)} ${r.date}  ${String(r.urgency).padEnd(17)} ${failed.map((c) => `${c.name} (${c.detail})`).join('; ')}`)
    }

    const names = results[0]?.checks.map((c) => c.name) ?? []
    console.log('\nPass rates')
    for (const n of names) {
        const passed = results.filter((r) => r.checks.find((c) => c.name === n)?.pass).length
        console.log(`  ${n.padEnd(20)} ${passed}/${results.length}`)
    }
    const allPass = results.filter((r) => r.checks.every((c) => c.pass)).length
    console.log(`  ${'all checks'.padEnd(20)} ${allPass}/${results.length} insights`)
    console.log(`  ${'follow-ups: no advice'.padEnd(20)} ${followUps.filter((f) => f.pass).length}/${followUps.length}`)
    const latencies = results.map((r) => r.latencyMs ?? 0).filter(Boolean).sort((a, b) => a - b)
    if (latencies.length) console.log(`  median time per insight  ${(latencies[Math.floor(latencies.length / 2)] / 1000).toFixed(1)}s`)

    writeFileSync('evals/latest.json', JSON.stringify({ ranAt: new Date().toISOString(), results, followUps }, null, 2))
    await prisma.$disconnect()
}

main().catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
})
