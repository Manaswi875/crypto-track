import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const subscription = await req.json()

    // In a real app, you'd store this subscription in the DB associated with the user
    // await prisma.user.update({
    //   where: { id: (session.user as any).id },
    //   data: { pushSubscription: JSON.stringify(subscription) }
    // })

    console.log('New Subscription:', subscription)

    return NextResponse.json({ success: true })
}
