import Redis from 'ioredis'

const redisClientSingleton = () => {
    if (!process.env.REDIS_URL) {
        console.warn('REDIS_URL is not defined. Redis will not be available.')
        return null
    }
    return new Redis(process.env.REDIS_URL)
}

declare global {
    var redis: undefined | ReturnType<typeof redisClientSingleton>
}

const redis = globalThis.redis ?? redisClientSingleton()

export default redis

if (process.env.NODE_ENV !== 'production') globalThis.redis = redis
