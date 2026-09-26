import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server } from 'socket.io'
import redis from './lib/redis'
import { PriceTracker } from './services/priceTracker'
import { WhaleWatcher } from './services/whaleWatcher'

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url!, true)
        handle(req, res, parsedUrl)
    })

    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    })

    // Start Services
    const priceTracker = new PriceTracker()
    const whaleWatcher = new WhaleWatcher()

    priceTracker.start()
    whaleWatcher.start()

    // Socket.io Connection
    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id)

        socket.on('subscribe', (room) => {
            socket.join(room)
            console.log(`Socket ${socket.id} subscribed to ${room}`)
        })

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id)
        })
    })

    // Proxy Redis events to WebSockets
    if (redis) {
        const subClient = redis.duplicate()
        subClient.subscribe('price-updates', 'whale-events', 'notifications', 'agent-progress')

        subClient.on('message', (channel, message) => {
            const data = JSON.parse(message)

            if (channel === 'price-updates') {
                io.to(`coin:${data.coinId}`).to('all-prices').emit('price-update', data)
            } else if (channel === 'whale-events') {
                io.emit('whale-event', data)
            } else if (channel === 'agent-progress') {
                io.emit('brief-update', data)
            } else if (channel === 'notifications') {
                if (data.userId === 'ALL') {
                    io.emit('notification', data)
                } else {
                    io.to(`user:${data.userId}`).emit('notification', data)
                }
            }
        })
    }

    httpServer.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`)
    })
})
