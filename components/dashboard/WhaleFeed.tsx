'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Fish } from "lucide-react"

interface WhaleEvent {
    id: string
    coinId: string
    amountUsd: number
    type: string
    timestamp: string
}

export function WhaleFeed({ events }: { events: WhaleEvent[] }) {
    return (
        <Card className="h-full bg-card/30 backdrop-blur-sm border-muted/20">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <Fish className="h-5 w-5 text-blue-500" />
                    Whale Tracker
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {events.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground italic text-sm">
                        Monitoring large transactions...
                    </div>
                ) : (
                    events.map((event) => (
                        <div key={event.id} className="flex items-center justify-between p-3 rounded-lg border border-blue-500/10 bg-blue-500/5 group hover:bg-blue-500/10 transition-colors">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm uppercase">{event.coinId}</span>
                                    <Badge variant="outline" className={`text-[9px] uppercase ${event.type === 'inflow' ? 'text-green-500 border-green-500/20' : 'text-red-500 border-red-500/20'}`}>
                                        {event.type}
                                    </Badge>
                                </div>
                                <div className="text-sm font-mono font-bold text-blue-400">
                                    ${(event.amountUsd / 1e6).toFixed(2)}M
                                </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                {new Date(event.timestamp).toLocaleTimeString()}
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    )
}
