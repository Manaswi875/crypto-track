import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
    const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
    return NextResponse.json(entries)
}
