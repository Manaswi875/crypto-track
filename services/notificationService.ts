import prisma from '@/lib/prisma'
import redis from '@/lib/redis'

export class NotificationService {
    async notify(userId: string, title: string, body: string, data?: any) {
        // In a real app, you'd use Web Push API here.
        // This service would fetch the user's push subscription from the DB.
        console.log(`[NOTIFICATION] To User ${userId}: ${title} - ${body}`)

        // For real-time browser notifications (Socket.io), we publish to Redis
        if (redis) {
            await redis.publish('notifications', JSON.stringify({
                userId,
                title,
                body,
                data,
                timestamp: Date.now()
            }))
        }
    }

    async broadcast(title: string, body: string, data?: any) {
        console.log(`[BROADCAST] ${title}: ${body}`)
        if (redis) {
            await redis.publish('notifications', JSON.stringify({
                userId: 'ALL',
                title,
                body,
                data,
                timestamp: Date.now()
            }))
        }
    }
}

export const notificationService = new NotificationService()
