import prisma from '@/lib/prisma'

// Demo scope: a single advisor, no login. Actions are attributed to them in the audit log.
export async function getDemoAdvisor() {
    return prisma.advisor.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
}

export const advisorActor = (email: string) => `advisor:${email}`
