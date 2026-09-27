import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createReplayEvent } from '@/services/replay'

const Body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

export async function POST(req: Request) {
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'date (YYYY-MM-DD) is required' }, { status: 400 })

    try {
        const result = await createReplayEvent(parsed.data.date, 'user')
        return NextResponse.json(result, { status: result.created ? 201 : 200 })
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Replay failed' }, { status: 502 })
    }
}
