import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const insight = await prisma.insight.findUnique({
        where: { id: params.id },
        include: {
            event: { include: { coin: true } },
            investor: { include: { positions: { orderBy: { marketValue: 'desc' } } } },
            messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, quote: true, createdAt: true } },
        },
    })
    if (!insight) return NextResponse.json({ error: 'Insight not found' }, { status: 404 })
    const { costUsd: _cost, ...publicInsight } = insight

    return NextResponse.json({ insight: publicInsight })
}
