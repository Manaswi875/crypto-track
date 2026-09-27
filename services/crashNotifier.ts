import { portfolioImpact, type CoinMoves } from '@/lib/impact'
import { loadInvestor } from '@/lib/investors'

type CrashEvent = {
    id: string
    coinId: string
    changePct: number
    moves?: CoinMoves
    occurredAt: Date
}

const COIN_NAME: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana' }
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
const percent = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(1)}%`

export async function sendCrashAlerts(event: CrashEvent, options: { demo?: boolean } = {}) {
    const investor = await loadInvestor('you')
    if (!investor || !investor.alertEnabled || event.changePct > -investor.alertThresholdPct) return

    const moves = event.moves ?? { [event.coinId]: event.changePct }
    const impact = portfolioImpact(investor.positions, moves)
    const coin = COIN_NAME[event.coinId] ?? event.coinId
    const prefix = options.demo ? '[DEMO] ' : ''
    const headline = `${prefix}Crypto Pulse: ${coin} crash alert`
    const summary = `${coin} moved ${percent(event.changePct)}, crossing your ${investor.alertThresholdPct}% alert setting. Based on your current holdings, the estimated impact is ${money(impact.impactUsd)} (${percent(impact.impactPctOfTotal)} of everything you own). No action is being recommended—open Crypto Pulse for context.`
    const url = `${process.env.APP_URL ?? 'http://localhost:3000'}/`

    const deliveries: Promise<void>[] = []
    if (process.env.SLACK_WEBHOOK_URL) deliveries.push(sendSlack(headline, summary, url))
    if (process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO && process.env.ALERT_EMAIL_FROM) deliveries.push(sendEmail(headline, summary, url))
    await Promise.allSettled(deliveries)
}

async function sendSlack(headline: string, summary: string, url: string) {
    const response = await fetch(process.env.SLACK_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `*${headline}*\n${summary}\n<${url}|Open Crypto Pulse>` }),
    })
    if (!response.ok) console.error(`Slack crash alert failed (${response.status})`)
}

async function sendEmail(subject: string, summary: string, url: string) {
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
            from: process.env.ALERT_EMAIL_FROM,
            to: [process.env.ALERT_EMAIL_TO],
            subject,
            html: `<h2>${subject}</h2><p>${summary}</p><p><a href="${url}">Open Crypto Pulse</a></p>`,
        }),
    })
    if (!response.ok) console.error(`Email crash alert failed (${response.status})`)
}
