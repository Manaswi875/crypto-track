export type CurrencyAlertTrigger = {
    coinId: string
    thresholdPct: number
    lossPct: number
    lossUsd: number
    currentValueUsd: number
    investedValueUsd: number
}

export type PortfolioAlertTrigger = {
    thresholdPct: number
    lossPct: number
    lossUsd: number
    currentValueUsd: number
    investedValueUsd: number
}

export type PersonalAlertMessage = {
    investorId: string
    currencyTriggers: CurrencyAlertTrigger[]
    portfolioTrigger: PortfolioAlertTrigger | null
    cryptoImpactUsd: number
    cryptoImpactPct: number
    hypothetical?: boolean
    paper?: boolean
}

const COIN_NAME: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana' }
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
const percent = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(1)}%`
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!)

export async function sendPersonalAlert(alert: PersonalAlertMessage) {
    const prefix = alert.hypothetical ? '[DEMO SIMULATION] ' : alert.paper ? '[PAPER PORTFOLIO] ' : ''
    const reasons = [
        ...alert.currencyTriggers.map((trigger) => `${COIN_NAME[trigger.coinId] ?? trigger.coinId} is worth ${money(trigger.currentValueUsd)} versus ${money(trigger.investedValueUsd)} invested—a ${money(Math.abs(trigger.lossUsd))} loss (${percent(trigger.lossPct)}), crossing your ${trigger.thresholdPct}% limit`),
        ...(alert.portfolioTrigger
            ? [`Your combined crypto is worth ${money(alert.portfolioTrigger.currentValueUsd)} versus ${money(alert.portfolioTrigger.investedValueUsd)} invested—a ${money(Math.abs(alert.portfolioTrigger.lossUsd))} loss (${percent(alert.portfolioTrigger.lossPct)}), crossing your ${alert.portfolioTrigger.thresholdPct}% limit`]
            : []),
    ]
    const headline = `${prefix}Crypto Pulse: your investment loss limit was crossed`
    const reasonSummary = `${reasons.join('. ')}.`
    const comparisonNote = "This alert compares live value with what you invested, not with yesterday's price."
    const emailSummary = `${reasonSummary} ${comparisonNote}`
    const query = new URLSearchParams()
    if (alert.investorId !== 'you') query.set('investor', alert.investorId)
    if (alert.hypothetical) query.set('mode', 'crash')
    const queryString = query.toString()
    const baseUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    const url = alert.paper ? `${baseUrl}/paper` : `${baseUrl}/${queryString ? `?${queryString}` : ''}`
    const callToAction = alert.hypothetical ? 'Open demo simulation' : alert.paper ? 'Open Paper Portfolio' : 'Open Crypto Pulse'

    const deliveries: Promise<void>[] = []
    if (process.env.SLACK_WEBHOOK_URL) deliveries.push(sendSlack(headline, reasonSummary, url, callToAction))
    if (process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO && process.env.ALERT_EMAIL_FROM) deliveries.push(sendEmail(headline, emailSummary, url, callToAction))
    await Promise.allSettled(deliveries)
}

async function sendSlack(headline: string, summary: string, url: string, callToAction: string) {
    const response = await fetch(process.env.SLACK_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            text: `${headline}\n${summary}\n${url}`,
            blocks: [
                { type: 'section', text: { type: 'mrkdwn', text: `*${headline}*\n${summary}` } },
                { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: callToAction }, url, action_id: 'open_crypto_pulse' }] },
            ],
        }),
    })
    if (!response.ok) console.error(`Slack crash alert failed (${response.status})`)
}

async function sendEmail(subject: string, summary: string, url: string, callToAction: string) {
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
            from: process.env.ALERT_EMAIL_FROM,
            to: [process.env.ALERT_EMAIL_TO],
            subject,
            html: `<h2>${escapeHtml(subject)}</h2><p>${escapeHtml(summary).replace(/\n/g, '<br>')}</p><p><a href="${escapeHtml(url)}">${escapeHtml(callToAction)}</a></p>`,
        }),
    })
    if (!response.ok) console.error(`Email crash alert failed (${response.status})`)
}
