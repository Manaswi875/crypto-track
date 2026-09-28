import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { crossedLossLimit, cryptoLossSnapshot, recoveredFromLossLimit } from '@/lib/personalAlerts'
import { sendPersonalAlert, type CurrencyAlertTrigger, type PersonalAlertMessage, type PortfolioAlertTrigger } from './crashNotifier'

export type MarketTick = { price: number; change24h: number }
type EvaluateOptions = { hypothetical?: boolean; force?: boolean }

const COIN_NAME: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana' }

export class PortfolioAlertMonitor {
    async analyze(ticks: Record<string, MarketTick>) {
        const investors = await prisma.investor.findMany({
            where: { alertEnabled: true, isDemo: false },
            select: { id: true },
        })
        for (const investor of investors) await this.evaluateInvestor(investor.id, ticks)
    }

    async evaluateInvestor(investorId: string, ticks: Record<string, MarketTick>, options: EvaluateOptions = {}) {
        const investor = await prisma.investor.findUnique({
            where: { id: investorId },
            include: { positions: true, currencyAlertPreferences: true },
        })
        if (!investor || !investor.alertEnabled) return null

        const positions = investor.positions
            .filter((position) => position.coinId && ticks[position.coinId])
            .map((position) => ({
                coinId: position.coinId,
                marketValue: position.units == null ? position.marketValue : position.units * ticks[position.coinId!].price,
                investedUsd: position.investedUsd,
            }))
        const moves = Object.fromEntries(Object.entries(ticks).map(([coinId, tick]) => [coinId, tick.change24h]))
        const snapshot = cryptoLossSnapshot(positions)
        if (!snapshot.currencies.length) return null

        const preferences = new Map(investor.currencyAlertPreferences.map((preference) => [preference.coinId, preference]))
        const currencyTriggers: CurrencyAlertTrigger[] = []
        const currencyRearms: string[] = []
        for (const currency of snapshot.currencies) {
            const preference = preferences.get(currency.coinId)
            const enabled = preference?.enabled ?? true
            const thresholdPct = preference?.thresholdPct ?? investor.alertThresholdPct
            const isCrossed = preference?.isCrossed ?? false
            if (enabled && crossedLossLimit(currency.lossPct, thresholdPct) && (!isCrossed || options.force)) {
                currencyTriggers.push({
                    coinId: currency.coinId,
                    thresholdPct,
                    lossPct: currency.lossPct,
                    lossUsd: currency.lossUsd,
                    currentValueUsd: currency.currentValueUsd,
                    investedValueUsd: currency.investedValueUsd,
                })
            } else if (isCrossed && recoveredFromLossLimit(currency.lossPct, thresholdPct)) {
                currencyRearms.push(currency.coinId)
            }
        }

        const portfolioCrossed = snapshot.complete
            && investor.cryptoPortfolioAlertEnabled
            && crossedLossLimit(snapshot.lossPct, investor.cryptoPortfolioAlertPct)
        const portfolioTrigger: PortfolioAlertTrigger | null = portfolioCrossed && (!investor.cryptoPortfolioAlertCrossed || options.force)
            ? {
                  thresholdPct: investor.cryptoPortfolioAlertPct,
                  lossPct: snapshot.lossPct,
                  lossUsd: snapshot.lossUsd,
                  currentValueUsd: snapshot.currentValueUsd,
                  investedValueUsd: snapshot.investedValueUsd,
              }
            : null
        const portfolioRearmed = snapshot.complete
            && investor.cryptoPortfolioAlertCrossed
            && recoveredFromLossLimit(snapshot.lossPct, investor.cryptoPortfolioAlertPct)

        if (!options.force) {
            await Promise.all([
                ...currencyRearms.map((coinId) => prisma.currencyAlertPreference.update({
                    where: { investorId_coinId: { investorId, coinId } },
                    data: { isCrossed: false },
                })),
                ...(portfolioRearmed ? [prisma.investor.update({ where: { id: investorId }, data: { cryptoPortfolioAlertCrossed: false } })] : []),
            ])
        }

        if (!currencyTriggers.length && !portfolioTrigger) return null

        const worstCurrency = [...snapshot.currencies].sort((a, b) => a.lossPct - b.lossPct)[0]
        const occurredAt = new Date()
        const triggerType = currencyTriggers.length && portfolioTrigger ? 'combined' : currencyTriggers.length ? 'currency' : 'crypto_portfolio'
        const triggerDetails = { currencyTriggers, portfolioTrigger } as unknown as Prisma.InputJsonValue
        const eventContext = {
            personalAlert: true,
            investorId,
            hypothetical: options.hypothetical === true,
            demo: options.hypothetical === true,
            triggerType,
            paper: investor.portfolioMode === 'paper',
        } as Prisma.InputJsonValue

        const result = await prisma.$transaction(async (transaction) => {
            const event = await transaction.volatilityEvent.create({
                data: {
                    id: options.hypothetical ? `demo-crash-${Date.now()}` : undefined,
                    coinId: worstCurrency.coinId,
                    changePct: worstCurrency.lossPct,
                    severity: Math.abs(worstCurrency.lossPct) >= 10 ? 'high' : 'medium',
                    source: 'live',
                    windowLabel: options.hypothetical ? 'demo vs amount invested' : 'since investment',
                    moves,
                    context: eventContext,
                    occurredAt,
                },
            })
            const alert = await transaction.investorAlert.create({
                data: {
                    investorId,
                    eventId: event.id,
                    triggerType,
                    triggerDetails,
                    cryptoImpactUsd: snapshot.lossUsd,
                    cryptoImpactPct: snapshot.lossPct,
                    hypothetical: options.hypothetical === true,
                    occurredAt,
                },
            })
            if (!options.force) {
                for (const trigger of currencyTriggers) {
                    await transaction.currencyAlertPreference.upsert({
                        where: { investorId_coinId: { investorId, coinId: trigger.coinId } },
                        update: { isCrossed: true, lastTriggeredAt: occurredAt },
                        create: { investorId, coinId: trigger.coinId, enabled: true, thresholdPct: trigger.thresholdPct, isCrossed: true, lastTriggeredAt: occurredAt },
                    })
                }
                if (portfolioTrigger) {
                    await transaction.investor.update({
                        where: { id: investorId },
                        data: { cryptoPortfolioAlertCrossed: true, cryptoPortfolioLastTriggeredAt: occurredAt },
                    })
                }
            }
            return { event, alert }
        })

        const message: PersonalAlertMessage = {
            investorId,
            currencyTriggers,
            portfolioTrigger,
            cryptoImpactUsd: snapshot.lossUsd,
            cryptoImpactPct: snapshot.lossPct,
            hypothetical: options.hypothetical,
            paper: investor.portfolioMode === 'paper',
        }
        const socketPayload = {
            id: result.event.id,
            alertId: result.alert.id,
            investorId,
            coinId: result.event.coinId,
            changePct: result.event.changePct,
            severity: result.event.severity,
            occurredAt: result.event.occurredAt,
            triggerType,
            currencyTriggers,
            portfolioTrigger,
            cryptoImpactUsd: snapshot.lossUsd,
            cryptoImpactPct: snapshot.lossPct,
            hypothetical: options.hypothetical === true,
            paper: investor.portfolioMode === 'paper',
            headline: currencyTriggers.length
                ? `${currencyTriggers.map((trigger) => COIN_NAME[trigger.coinId] ?? trigger.coinId).join(' and ')} crossed your loss limit`
                : 'Your crypto portfolio crossed its loss limit',
        }
        if (redis) await redis.publish('personal-alerts', JSON.stringify(socketPayload))
        await sendPersonalAlert(message)
        return socketPayload
    }
}
