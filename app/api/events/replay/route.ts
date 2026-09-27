import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createReplayEvent } from '@/services/replay'

const Body = z.object({ coinId: z.enum(['bitcoin', 'ethereum', 'solana']) })

export async function POST(req: Request) {
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'coinId must be bitcoin, ethereum or solana' }, { status: 400 })

    try {
        const result = await createReplayEvent(parsed.data.coinId, 'user')
        return NextResponse.json(result, { status: result.created ? 201 : 200 })
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Replay failed' }, { status: 502 })
    }
}
