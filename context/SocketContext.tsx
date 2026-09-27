'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface SocketContextType {
    socket: Socket | null
    isConnected: boolean
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false
})

export const useSocket = () => useContext(SocketContext)

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
    const [socket, setSocket] = useState<Socket | null>(null)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        // Same origin as the page unless a separate socket host is configured
        const socketInstance = process.env.NEXT_PUBLIC_SITE_URL ? io(process.env.NEXT_PUBLIC_SITE_URL) : io()

        socketInstance.on('connect', () => {
            setIsConnected(true)
            console.log('Connected to WebSocket')
        })

        socketInstance.on('disconnect', () => {
            setIsConnected(false)
            console.log('Disconnected from WebSocket')
        })

        setSocket(socketInstance)

        return () => {
            socketInstance.disconnect()
        }
    }, [])

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    )
}
