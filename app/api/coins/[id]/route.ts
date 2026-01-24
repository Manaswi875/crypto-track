import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    const { id } = params

    // Fetch last 24 hours of price history
    const history = await prisma.priceHistory.findMany({
        where: {
            coinId: id,
            timestamp: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
        },
        orderBy: {
            timestamp: 'asc'
        },
        take: 100 // Limit for chart performance
    })

    return NextResponse.json(history.map(h => ({
        time: h.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        price: h.price
    })))
}
