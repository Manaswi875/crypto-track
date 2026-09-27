import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
    const investors = await prisma.investor.findMany({ include: { positions: true }, orderBy: { createdAt: 'asc' } })
    return NextResponse.json(
        investors.map(({ positions, ...i }) => {
            const totalUsd = positions.reduce((s, p) => s + p.marketValue, 0)
            const cryptoUsd = positions.filter((p) => p.coinId).reduce((s, p) => s + p.marketValue, 0)
            return { ...i, totalUsd, cryptoUsd }
        }),
    )
}
