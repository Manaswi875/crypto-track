import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const alerts = await prisma.alert.findMany({
        where: { userId: (session.user as any).id },
        include: { coin: true }
    })
    return NextResponse.json(alerts)
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { coinId, type, threshold } = await req.json()

    const alert = await prisma.alert.create({
        data: {
            userId: (session.user as any).id,
            coinId,
            type,
            threshold,
        }
    })
    return NextResponse.json(alert)
}
