'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSocket } from '@/context/SocketContext'
import { PriceChart } from '@/components/dashboard/PriceChart'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, TrendingUp, TrendingDown, Clock, Activity } from "lucide-react"
import Link from 'next/link'

export default function CoinDetailPage() {
    const { id } = useParams()
    const { socket } = useSocket()
    const [history, setHistory] = useState<any[]>([])
    const [livePrice, setLivePrice] = useState<number | null>(null)

    useEffect(() => {
        // 1. Fetch historical data
        fetch(`/api/coins/${id}`)
            .then(res => res.json())
            .then(data => setHistory(data))

        // 2. Subscribe to live updates
        if (socket) {
            socket.emit('subscribe', `coin:${id}`)
            socket.on('price-update', (data) => {
                if (data.coinId === id) {
                    setLivePrice(data.price)
                    setHistory(prev => [...prev.slice(-99), {
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        price: data.price
                    }])
                }
            })
        }

        return () => {
            socket?.off('price-update')
        }
    }, [id, socket])

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
            </Link>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <h2 className="text-4xl font-extrabold uppercase tracking-tight">{id}</h2>
                        <Badge className="bg-primary/20 text-primary border-primary/20 hover:bg-primary/30">Live</Badge>
                    </div>
                    <p className="text-muted-foreground">Asset performance and anomaly history.</p>
                </div>
                <div className="text-right">
                    <div className="text-4xl font-mono font-bold">
                        ${livePrice?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '---'}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center justify-end gap-2">
                        <Clock className="h-3 w-3" />
                        Last updated: Just now
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 bg-card/50 border-none shadow-2xl">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Activity className="h-5 w-5 text-primary" />
                            Price Analytics (24H)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <PriceChart data={history} coinId={id as string} />
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Statistics</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-muted/20">
                                <span className="text-sm">24h High</span>
                                <span className="font-mono font-bold">$---</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-muted/20">
                                <span className="text-sm">24h Low</span>
                                <span className="font-mono font-bold">$---</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-muted/20">
                                <span className="text-sm">Market Cap</span>
                                <span className="font-mono font-bold">$--- B</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-primary/5 border-primary/10">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3 text-primary mb-2">
                                <div className="p-2 bg-primary/20 rounded-full">
                                    <TrendingUp className="h-5 w-5" />
                                </div>
                                <div className="font-bold">Bullish Signal</div>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Statistical volatility remains low, indicating a steady accumulation phase according to our anomaly engine.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
