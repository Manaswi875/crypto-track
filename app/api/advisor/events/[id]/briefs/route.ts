import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { generateBriefsForEvent } from '@/services/briefAgent'
import { advisorActor, getDemoAdvisor } from '@/lib/advisor'
import { hasAnthropicKey } from '@/lib/anthropic'

const Body = z.object({ limit: z.number().int().min(1).max(30).default(8) })

export async function POST(req: Request, { params }: { params: { id: string } }) {
    if (!hasAnthropicKey()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 503 })

    const parsed = Body.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'limit must be 1-30' }, { status: 400 })

    const event = await prisma.volatilityEvent.findUnique({ where: { id: params.id } })
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const advisor = await getDemoAdvisor()
    const result = await generateBriefsForEvent(event.id, parsed.data.limit, advisorActor(advisor.email))
    return NextResponse.json(result, { status: 202 })
}
