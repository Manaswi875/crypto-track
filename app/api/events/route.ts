import { NextResponse } from 'next/server'
import { listEvents } from '@/lib/events'

export const dynamic = 'force-dynamic'

export async function GET() {
    return NextResponse.json(await listEvents())
}
