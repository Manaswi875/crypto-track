import { NextResponse } from 'next/server'
import { listEvents } from '@/lib/events'
import { afterEffects } from '@/services/replay'

export const dynamic = 'force-dynamic'

export async function GET() {
    const events = await listEvents()
    const replayDates = events.filter((event) => event.source === 'replay').map((event) => event.occurredAt.toISOString().slice(0, 10))
    const after = await afterEffects(replayDates).catch(() => ({}))
    return NextResponse.json(events.map((event) => ({
        ...event,
        after: event.source === 'replay' ? ((after as Record<string, unknown>)[event.occurredAt.toISOString().slice(0, 10)] ?? null) : null,
    })))
}
