import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { loadInvestor } from '@/lib/investors'

export const dynamic = 'force-dynamic'

export async function GET() {
    const ids = await prisma.investor.findMany({ select: { id: true }, orderBy: [{ isDemo: 'asc' }, { createdAt: 'asc' }] })
    const investors = (await Promise.all(ids.map((i) => loadInvestor(i.id)))).filter((i) => i != null)
    return NextResponse.json(
        investors.map(({ positions, ...i }) => {
            const totalUsd = positions.reduce((s, p) => s + p.marketValue, 0)
            const cryptoUsd = positions.filter((p) => p.coinId).reduce((s, p) => s + p.marketValue, 0)
            return { ...i, totalUsd, cryptoUsd }
        }),
    )
}
