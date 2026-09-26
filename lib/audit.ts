import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'

export async function audit(
    action: string,
    actor: string,
    entityType: string,
    entityId: string,
    details?: Prisma.InputJsonValue,
) {
    await prisma.auditLog.create({ data: { action, actor, entityType, entityId, details } })
}
