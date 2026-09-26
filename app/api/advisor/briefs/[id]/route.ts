import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { checkClientMessage } from '@/lib/compliance'
import { advisorActor, getDemoAdvisor } from '@/lib/advisor'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
    const brief = await prisma.brief.findUnique({
        where: { id: params.id },
        include: { event: { include: { coin: true } }, household: { include: { holdings: true } } },
    })
    if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })

    const auditLog = await prisma.auditLog.findMany({ where: { entityId: brief.id }, orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ brief, auditLog })
}

const Body = z.discriminatedUnion('action', [
    z.object({ action: z.literal('approve'), clientMessage: z.string().min(1).max(4000) }),
    z.object({ action: z.literal('reject'), reason: z.string().max(1000).optional() }),
])

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid review action' }, { status: 400 })

    const brief = await prisma.brief.findUnique({ where: { id: params.id } })
    if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
    if (brief.status !== 'draft') return NextResponse.json({ error: `Brief is ${brief.status}, not a draft` }, { status: 409 })

    const advisor = await getDemoAdvisor()
    const actor = advisorActor(advisor.email)
    const now = new Date()

    if (parsed.data.action === 'approve') {
        const finalMessage = parsed.data.clientMessage.trim()
        // The advisor's edited text gets the same compliance check as the draft
        const flags = checkClientMessage(finalMessage)
        if (flags.length > 0) return NextResponse.json({ error: 'Message fails compliance check', flags }, { status: 422 })

        const edited = finalMessage !== (brief.clientMessage ?? '').trim()
        const updated = await prisma.brief.update({
            where: { id: brief.id },
            data: { status: 'approved', finalClientMessage: finalMessage, edited, reviewedBy: actor, reviewedAt: now },
        })
        await audit('brief_approved', actor, 'brief', brief.id, { edited, finalClientMessage: finalMessage })
        return NextResponse.json(updated)
    }

    const updated = await prisma.brief.update({
        where: { id: brief.id },
        data: { status: 'rejected', reviewedBy: actor, reviewedAt: now },
    })
    await audit('brief_rejected', actor, 'brief', brief.id, { reason: parsed.data.reason ?? null })
    return NextResponse.json(updated)
}
